// ============================================================
// 青鸾 DAW - 自修改合成器引擎 (Self-Modifying Synthesis)
// 核心思想: 合成器在发声过程中不断自我分析并修改自身参数。
// 每生成 N 个采样点，进行一次 FFT/频谱分析，根据频谱特征
// 动态调整振荡器参数（波形、频率、振幅、相位），形成声音
// 的"活"的演化效果。
// 技术栈: 纯数学 PCM Float32Array + 自实现 FFT + 规则引擎
// 采样率: 44100 Hz
// ============================================================

import { clamp, fft } from '../utils/audioUtils.js';

// ═════════════════════════════════════════════════════════════
// Part 1: 核心类型与常量
// ═════════════════════════════════════════════════════════════

export interface SynthState {
  waveform: 'sine' | 'sawtooth' | 'square' | 'triangle' | 'noise' | 'fm';
  frequency: number;
  amplitude: number;
  phase: number;
  modulationIndex: number; // FM 调制指数
  harmonicDecay: number;   // 泛音衰减率
  entropy: number;         // 当前混乱度 0-1
}

export interface ModificationRule {
  condition: (spectrum: Float32Array, state: SynthState) => boolean;
  action: (spectrum: Float32Array, state: SynthState) => Partial<SynthState>;
  name: string;
}

const TWO_PI = Math.PI * 2;

// 工具：求数组最大值的索引
function argMax(arr: Float32Array): number {
  let maxIdx = 0;
  let maxVal = -Infinity;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] > maxVal) {
      maxVal = arr[i];
      maxIdx = i;
    }
  }
  return maxIdx;
}

// ═════════════════════════════════════════════════════════════
// Part 3: 频谱分析工具
// ═════════════════════════════════════════════════════════════

interface SpectrumAnalysis {
  entropy: number;
  peakFreqBin: number;
  lowEnergyRatio: number;   // 0 ~ n/4
  midEnergyRatio: number;   // n/4 ~ n/2
  highEnergyRatio: number;  // n/2 ~ n
  totalEnergy: number;
}

function analyzeSpectrum(
  block: Float32Array,
  sampleRate: number
): SpectrumAnalysis {
  const n = block.length;
  const real = new Float32Array(block);
  const imag = new Float32Array(n);

  // 汉宁窗
  for (let i = 0; i < n; i++) {
    const w = 0.5 - 0.5 * Math.cos((TWO_PI * i) / (n - 1));
    real[i] *= w;
  }

  fft(real, imag, false);

  // 计算幅值谱
  const mag = new Float32Array(n / 2);
  let totalEnergy = 0;
  for (let i = 0; i < n / 2; i++) {
    mag[i] = real[i] * real[i] + imag[i] * imag[i];
    totalEnergy += mag[i];
  }

  // 频谱熵
  let entropy = 0;
  if (totalEnergy > 1e-12) {
    for (let i = 0; i < n / 2; i++) {
      const p = mag[i] / totalEnergy;
      if (p > 1e-12) {
        entropy -= p * Math.log2(p);
      }
    }
  }
  const maxEntropy = Math.log2(n / 2);
  const normalizedEntropy = maxEntropy > 0 ? entropy / maxEntropy : 0;

  // 频段能量比
  const lowEnd = Math.floor(n / 8);
  const midEnd = Math.floor(n / 4);
  let lowEnergy = 0, midEnergy = 0, highEnergy = 0;
  for (let i = 0; i < lowEnd; i++) lowEnergy += mag[i];
  for (let i = lowEnd; i < midEnd; i++) midEnergy += mag[i];
  for (let i = midEnd; i < n / 2; i++) highEnergy += mag[i];

  const safeTotal = totalEnergy || 1;
  return {
    entropy: normalizedEntropy,
    peakFreqBin: argMax(mag),
    lowEnergyRatio: lowEnergy / safeTotal,
    midEnergyRatio: midEnergy / safeTotal,
    highEnergyRatio: highEnergy / safeTotal,
    totalEnergy: safeTotal,
  };
}

// ═════════════════════════════════════════════════════════════
// Part 4: 波形生成器（带简单抗锯齿）
// ═════════════════════════════════════════════════════════════

// 简单 PolyBLEP 近似 —— 用于 saw/square 的抗锯齿
function polyBlep(t: number, dt: number): number {
  if (t < dt) {
    t = t / dt;
    return t + t - t * t - 1.0;
  } else if (t > 1.0 - dt) {
    t = (t - 1.0) / dt;
    return t * t + t + t + 1.0;
  }
  return 0.0;
}

function generateWaveform(
  waveform: SynthState['waveform'],
  phase: number,
  dt: number,
  tNorm: number,
  modulationIndex: number,
  modPhase: number
): number {
  switch (waveform) {
    case 'sine': {
      return Math.sin(phase);
    }
    case 'sawtooth': {
      let v = 2.0 * (tNorm) - 1.0;
      v -= polyBlep(tNorm, dt);
      return v;
    }
    case 'square': {
      let v = tNorm < 0.5 ? 1.0 : -1.0;
      v -= polyBlep(tNorm, dt);
      v += polyBlep((tNorm + 0.5) % 1.0, dt);
      return v;
    }
    case 'triangle': {
      const raw = tNorm < 0.5 ? (4.0 * tNorm - 1.0) : (3.0 - 4.0 * tNorm);
      // 简单一阶低通近似：对三角波做微小平滑
      return raw;
    }
    case 'noise': {
      return Math.random() * 2.0 - 1.0;
    }
    case 'fm': {
      return Math.sin(phase + modulationIndex * Math.sin(modPhase));
    }
    default: {
      return Math.sin(phase);
    }
  }
}

// ═════════════════════════════════════════════════════════════
// Part 5: 内置自我修改规则
// ═════════════════════════════════════════════════════════════

const BUILTIN_RULES: ModificationRule[] = [
  // 规则 1: SpectralBalanceRule
  // 如果低频能量 > 70%，切换到更明亮的波形（sine→sawtooth）
  {
    name: 'SpectralBalanceRule',
    condition: (_spectrum: Float32Array, state: SynthState) => {
      return state.entropy < 0.6 && state.waveform === 'sine';
    },
    action: (spectrum: Float32Array, state: SynthState) => {
      const analysis = analyzeSpectrum(spectrum, 44100);
      if (analysis.lowEnergyRatio > 0.7) {
        return { waveform: 'sawtooth' as const, amplitude: clamp(state.amplitude * 0.9, 0.05, 1.0) };
      }
      return {};
    },
  },

  // 规则 2: EntropyRule
  // 如果频谱熵过低，增加 noise 成分或 FM 调制指数
  {
    name: 'EntropyRule',
    condition: (_spectrum: Float32Array, state: SynthState) => state.entropy < 0.3,
    action: (spectrum: Float32Array, state: SynthState) => {
      const analysis = analyzeSpectrum(spectrum, 44100);
      if (analysis.entropy < 0.25) {
        if (state.waveform !== 'noise' && state.waveform !== 'fm') {
          return { waveform: 'fm' as const, modulationIndex: clamp(state.modulationIndex + 0.5, 0, 5) };
        }
        if (state.waveform === 'fm') {
          return { modulationIndex: clamp(state.modulationIndex + 0.3, 0, 5) };
        }
      }
      return {};
    },
  },

  // 规则 3: ResonanceRule
  // 如果检测到明显共振峰（某个频段能量异常集中），调整频率避开它
  {
    name: 'ResonanceRule',
    condition: () => true,
    action: (spectrum: Float32Array, state: SynthState) => {
      const analysis = analyzeSpectrum(spectrum, 44100);
      // 如果某一段能量极度集中（peak 过于尖锐），做微小频率偏移
      if (analysis.entropy < 0.15 && analysis.totalEnergy > 100) {
        const detune = 1 + (Math.random() * 0.04 - 0.02); // ±2%
        return { frequency: clamp(state.frequency * detune, 20, 8000) };
      }
      return {};
    },
  },

  // 规则 4: DecayRule
  // 随时间推移逐渐降低 amplitude 并增加 harmonicDecay
  {
    name: 'DecayRule',
    condition: (_spectrum: Float32Array, state: SynthState) => state.amplitude > 0.05,
    action: (_spectrum: Float32Array, state: SynthState) => {
      return {
        amplitude: clamp(state.amplitude * 0.98, 0.01, 1.0),
        harmonicDecay: clamp(state.harmonicDecay + 0.02, 0, 1.0),
      };
    },
  },

  // 规则 5: MutationRule
  // 随机游走修改 frequency（微小偏移，不超过 ±5%）
  {
    name: 'MutationRule',
    condition: () => Math.random() < 0.3,
    action: (_spectrum: Float32Array, state: SynthState) => {
      const delta = (Math.random() * 0.1 - 0.05); // ±5%
      return { frequency: clamp(state.frequency * (1 + delta), 20, 8000) };
    },
  },

  // 规则 6: HarmonicShiftRule
  // 根据谐波结构切换基频到泛音列上的某个点
  {
    name: 'HarmonicShiftRule',
    condition: (_spectrum: Float32Array, state: SynthState) => {
      return state.harmonicDecay > 0.3 && Math.random() < 0.2;
    },
    action: (spectrum: Float32Array, state: SynthState) => {
      const analysis = analyzeSpectrum(spectrum, 44100);
      // 简单启发：若中频能量高，说明存在显著 2/3 次谐波，尝试跳到 2 倍频
      if (analysis.midEnergyRatio > 0.3) {
        const harmonicMultiplier = [2, 3, 1.5][Math.floor(Math.random() * 3)];
        return { frequency: clamp(state.frequency * harmonicMultiplier, 20, 8000) };
      }
      return {};
    },
  },
];

// ═════════════════════════════════════════════════════════════
// Part 6: 自修改合成器主类
// ═════════════════════════════════════════════════════════════

export class SelfModifyingSynth {
  private sampleRate: number;
  private rules: ModificationRule[];
  private evolutionHistory: Array<{ time: number; state: SynthState }>;

  constructor(sampleRate = 44100) {
    this.sampleRate = sampleRate;
    this.rules = [...BUILTIN_RULES];
    this.evolutionHistory = [];
  }

  addRule(rule: ModificationRule): void {
    this.rules.push(rule);
  }

  getEvolutionHistory(): Array<{ time: number; state: SynthState }> {
    return this.evolutionHistory.map(h => ({ ...h }));
  }

  private getDefaultState(): SynthState {
    return {
      waveform: 'sine',
      frequency: 440,
      amplitude: 0.5,
      phase: 0,
      modulationIndex: 1.0,
      harmonicDecay: 0.1,
      entropy: 0.5,
    };
  }

  generate(params: {
    baseFreq: number;
    duration: number;
    evolutionRate?: number;
    mutationIntensity?: number;
    initialState?: Partial<SynthState>;
  }): Float32Array {
    const {
      baseFreq,
      duration,
      evolutionRate = 4,
      mutationIntensity = 0.3,
      initialState = {},
    } = params;

    const totalSamples = Math.floor(duration * this.sampleRate);
    const output = new Float32Array(totalSamples);

    const blockSize = 512;
    const samplesPerModification = Math.floor(this.sampleRate / evolutionRate);

    let state: SynthState = {
      ...this.getDefaultState(),
      ...initialState,
      frequency: baseFreq,
    };

    this.evolutionHistory = [];
    this.evolutionHistory.push({ time: 0, state: { ...state } });

    let currentPhase = state.phase;
    let modPhase = 0;
    let sampleIndex = 0;

    // 局部 block 缓冲，用于 FFT
    let blockBuffer = new Float32Array(blockSize);
    let blockIndex = 0;

    const dt = state.frequency / this.sampleRate;
    let tNorm = 0;

    while (sampleIndex < totalSamples) {
      // 生成一个 block 或到修改点
      const nextModification = Math.min(
        sampleIndex + samplesPerModification,
        totalSamples
      );

      // 在这个区间内使用当前状态生成采样
      while (sampleIndex < nextModification) {
        const freq = state.frequency;
        const phaseInc = (TWO_PI * freq) / this.sampleRate;
        const modPhaseInc = (TWO_PI * freq * 1.414) / this.sampleRate; // FM 载波偏置
        const localDt = freq / this.sampleRate;

        currentPhase += phaseInc;
        modPhase += modPhaseInc;
        if (currentPhase >= TWO_PI) currentPhase -= TWO_PI;
        if (modPhase >= TWO_PI) modPhase -= TWO_PI;
        tNorm += localDt;
        if (tNorm >= 1) tNorm -= 1;

        const rawSample = generateWaveform(
          state.waveform,
          currentPhase,
          localDt,
          tNorm,
          state.modulationIndex,
          modPhase
        );

        // 应用 amplitude 与 harmonicDecay 的简单包络
        const env = state.amplitude * (1 - state.harmonicDecay * (sampleIndex / totalSamples));
        output[sampleIndex] = rawSample * clamp(env, 0, 1);

        // 填充 block 缓冲
        blockBuffer[blockIndex++] = output[sampleIndex];
        if (blockIndex >= blockSize) {
          blockIndex = 0;
        }

        sampleIndex++;
      }

      // 到达修改点：对最近一个 block 做频谱分析并应用规则
      if (sampleIndex >= totalSamples) break;

      // 用 blockBuffer（环形缓冲的最近 blockSize 个采样）做 FFT
      // 为了简单，我们取当前 output 中最近的 blockSize 个采样
      const analysisBlock = new Float32Array(blockSize);
      const start = Math.max(0, sampleIndex - blockSize);
      for (let i = 0; i < blockSize && start + i < totalSamples; i++) {
        analysisBlock[i] = output[start + i];
      }

      const analysis = analyzeSpectrum(analysisBlock, this.sampleRate);
      state.entropy = analysis.entropy;

      // 应用所有满足条件的规则
      for (const rule of this.rules) {
        if (rule.condition(analysisBlock, state)) {
          const changes = rule.action(analysisBlock, state);
          state = { ...state, ...changes };
        }
      }

      // 应用 mutationIntensity 随机扰动（作为全局缩放）
      if (Math.random() < mutationIntensity * 0.2) {
        state.amplitude = clamp(state.amplitude + (Math.random() * 0.1 - 0.05), 0.01, 1.0);
      }

      this.evolutionHistory.push({
        time: sampleIndex / this.sampleRate,
        state: { ...state },
      });
    }

    // 最终归一化，防止削波
    let peak = 0;
    for (let i = 0; i < totalSamples; i++) {
      const a = Math.abs(output[i]);
      if (a > peak) peak = a;
    }
    if (peak > 1.0) {
      const scale = 0.95 / peak;
      for (let i = 0; i < totalSamples; i++) {
        output[i] *= scale;
      }
    }

    return output;
  }
}

// ═════════════════════════════════════════════════════════════
// Part 7: 辅助函数 —— 多音符轨道生成
// ═════════════════════════════════════════════════════════════

export function createSelfModifyingTrack(
  notes: Array<{ freq: number; duration: number; startTime: number }>,
  sampleRate = 44100
): Float32Array {
  if (notes.length === 0) {
    return new Float32Array(0);
  }

  // 计算总时长
  let maxEndTime = 0;
  for (const note of notes) {
    const end = note.startTime + note.duration;
    if (end > maxEndTime) maxEndTime = end;
  }

  const totalSamples = Math.ceil(maxEndTime * sampleRate);
  const mixBuffer = new Float32Array(totalSamples);

  const synth = new SelfModifyingSynth(sampleRate);

  for (const note of notes) {
    const noteSamples = synth.generate({
      baseFreq: note.freq,
      duration: note.duration,
    });

    const startSample = Math.floor(note.startTime * sampleRate);
    for (let i = 0; i < noteSamples.length && startSample + i < totalSamples; i++) {
      mixBuffer[startSample + i] += noteSamples[i];
    }
  }

  // 混音后再次归一化
  let peak = 0;
  for (let i = 0; i < totalSamples; i++) {
    const a = Math.abs(mixBuffer[i]);
    if (a > peak) peak = a;
  }
  if (peak > 1.0) {
    const scale = 0.95 / peak;
    for (let i = 0; i < totalSamples; i++) {
      mixBuffer[i] *= scale;
    }
  }

  return mixBuffer;
}
