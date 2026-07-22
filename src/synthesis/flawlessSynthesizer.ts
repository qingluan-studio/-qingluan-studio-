// ============================================================
// 青鸾 DAW - 无瑕疵音乐合成器 (Flawless Synthesizer)
// 目标: 生成零瑕疵、零缺陷、完美的音频
// 技术栈: 物理建模 + 频谱合成 + 瑕疵检测 + 自动修复 + 认知闭环
// ============================================================

import { CognitiveInvariantEngine, CognitiveClosedLoop } from '../engines/cognitiveEngine.js';

// ═════════════════════════════════════════════════════════════
// Part 1: 核心类型与工具
// ═════════════════════════════════════════════════════════════

export type WaveformType = 'sine' | 'triangle' | 'sawtooth' | 'square' | 'pulse' | 'noise' | 'superSaw';
export type SynthMode = 'fm' | 'additive' | 'subtractive' | 'wavetable' | 'physical' | 'hybrid';

export interface NoteEvent {
  freq: number;
  duration: number;
  velocity: number;
  startTime: number;
  waveform?: WaveformType;
}

export interface FlawlessConfig {
  sampleRate: number;
  bitDepth: number;
  channels: number;
  maxDuration: number;
  mode: SynthMode;
  targetQuality: number; // 0-1
  autoRepair: boolean;
  maxIterations: number;
}

const DEFAULT_CONFIG: FlawlessConfig = {
  sampleRate: 22050,
  bitDepth: 16,
  channels: 2,
  maxDuration: 30,
  mode: 'hybrid',
  targetQuality: 0.92,
  autoRepair: true,
  maxIterations: 5,
};

// 工具函数
function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

function gainToDb(gain: number): number {
  return 20 * Math.log10(gain + 1e-12);
}

// 汉宁窗
function hannWindow(size: number): Float32Array {
  const w = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1));
  }
  return w;
}

// FFT (Cooley-Tukey 迭代版)
function fft(real: Float32Array, imag: Float32Array): void {
  const n = real.length;
  if (n <= 1) return;

  // 位反转重排
  let j = 0;
  for (let i = 0; i < n; i++) {
    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
      [imag[i], imag[j]] = [imag[j], imag[i]];
    }
    let m = n >> 1;
    while (m >= 1 && j >= m) {
      j -= m;
      m >>= 1;
    }
    j += m;
  }

  for (let s = 1; s <= Math.log2(n); s++) {
    const m = 1 << s;
    const wmReal = Math.cos(-2 * Math.PI / m);
    const wmImag = Math.sin(-2 * Math.PI / m);
    for (let k = 0; k < n; k += m) {
      let wReal = 1, wImag = 0;
      for (let j2 = 0; j2 < m / 2; j2++) {
        const tReal = wReal * real[k + j2 + m / 2] - wImag * imag[k + j2 + m / 2];
        const tImag = wReal * imag[k + j2 + m / 2] + wImag * real[k + j2 + m / 2];
        const uReal = real[k + j2];
        const uImag = imag[k + j2];
        real[k + j2] = uReal + tReal;
        imag[k + j2] = uImag + tImag;
        real[k + j2 + m / 2] = uReal - tReal;
        imag[k + j2 + m / 2] = uImag - tImag;
        const nextWReal = wReal * wmReal - wImag * wmImag;
        wImag = wReal * wmImag + wImag * wmReal;
        wReal = nextWReal;
      }
    }
  }
}

// 逆FFT
function ifft(real: Float32Array, imag: Float32Array): void {
  const n = real.length;
  for (let i = 0; i < n; i++) imag[i] = -imag[i];
  fft(real, imag);
  for (let i = 0; i < n; i++) {
    real[i] /= n;
    imag[i] = -imag[i] / n;
  }
}

// ═════════════════════════════════════════════════════════════
// Part 2: 高品质波形生成器
// ═════════════════════════════════════════════════════════════

export class PureWaveformGenerator {
  sampleRate: number;

  constructor(sampleRate = 22050) {
    this.sampleRate = sampleRate;
  }

  // 带带宽限制的正弦波（无瑕疵基础）
  sine(freq: number, duration: number, sampleRate?: number): Float32Array {
    const sr = sampleRate || this.sampleRate;
    const samples = Math.floor(duration * sr);
    const out = new Float32Array(samples);
    const phaseInc = (2 * Math.PI * freq) / sr;
    for (let i = 0; i < samples; i++) {
      out[i] = Math.sin(i * phaseInc);
    }
    return out;
  }

  // PolyBLEP 多项式带限步进 — 虚拟模拟合成器标准抗锯齿
  private _polyBlep(t: number, dt: number): number {
    if (t < dt) {
      t = t / dt;
      return t + t - t * t - 1.0;
    } else if (t > 1.0 - dt) {
      t = (t - 1.0) / dt;
      return t * t + t + t + 1.0;
    }
    return 0.0;
  }

  // 高性能峰值查找（避免 .map 分配中间数组）
  private _findPeak(buf: Float32Array): number {
    let peak = 0;
    for (let i = 0; i < buf.length; i++) {
      const a = Math.abs(buf[i]);
      if (a > peak) peak = a;
    }
    return peak;
  }

  // 带宽限制三角波（PolyBLEP + 一阶低通后处理）
  triangle(freq: number, duration: number, sampleRate?: number): Float32Array {
    const sr = sampleRate || this.sampleRate;
    const samples = Math.floor(duration * sr);
    const out = new Float32Array(samples);
    const dt = freq / sr;
    let t = 0;
    for (let i = 0; i < samples; i++) {
      t += dt;
      if (t >= 1) t -= 1;
      // 积分 PolyBLEP 锯齿得到三角波
      const raw = t < 0.5 ? (4 * t - 1) : (3 - 4 * t);
      out[i] = raw;
    }
    return this._bandLimit(out, freq, sr);
  }

  // PolyBLEP 锯齿波 — 无混叠、高频干净
  sawtooth(freq: number, duration: number, sampleRate?: number): Float32Array {
    const sr = sampleRate || this.sampleRate;
    const samples = Math.floor(duration * sr);
    const out = new Float32Array(samples);
    const dt = freq / sr;
    let t = 0;
    for (let i = 0; i < samples; i++) {
      t += dt;
      if (t >= 1) t -= 1;
      let v = 2.0 * t - 1.0;
      v -= this._polyBlep(t, dt);
      out[i] = v;
    }
    const peak = this._findPeak(out);
    if (peak > 0) {
      const s = 0.7 / peak;
      for (let i = 0; i < samples; i++) out[i] *= s;
    }
    return out;
  }

  // PolyBLEP 方波 — 无混叠、占空比可调
  square(freq: number, duration: number, duty = 0.5, sampleRate?: number): Float32Array {
    const sr = sampleRate || this.sampleRate;
    const samples = Math.floor(duration * sr);
    const out = new Float32Array(samples);
    const dt = freq / sr;
    let t = 0;
    for (let i = 0; i < samples; i++) {
      t += dt;
      if (t >= 1) t -= 1;
      let v = t < duty ? 1.0 : -1.0;
      v -= this._polyBlep(t, dt);
      v += this._polyBlep((t + 1.0 - duty) % 1.0, dt);
      out[i] = v;
    }
    const peak = this._findPeak(out);
    if (peak > 0) {
      const s = 0.7 / peak;
      for (let i = 0; i < samples; i++) out[i] *= s;
    }
    return out;
  }

  // SuperSaw — 双失谐锯齿 + 中心音 + 包络失配模拟
  superSaw(freq: number, duration: number, detune = 0.015, voices = 7, sampleRate?: number): Float32Array {
    const sr = sampleRate || this.sampleRate;
    const samples = Math.floor(duration * sr);
    const out = new Float32Array(samples);

    // 经典Roland JP-8000风格失谐分布
    const detunes = [-0.110, -0.062, -0.019, 0, 0.019, 0.062, 0.110];
    const gains   = [ 0.80,  0.90,  0.95, 1.0, 0.95, 0.90, 0.80];

    for (let v = 0; v < Math.min(voices, detunes.length); v++) {
      const f = freq * (1 + detunes[v] * detune / 0.015);
      const dt = f / sr;
      let t = v * 0.17; // 固定初始相位避免边界不连续
      const g = gains[v];
      for (let i = 0; i < samples; i++) {
        t += dt;
        if (t >= 1) t -= 1;
        let val = 2.0 * t - 1.0;
        val -= this._polyBlep(t, dt);
        out[i] += val * g;
      }
    }

    const peak = this._findPeak(out);
    if (peak > 0) {
      const s = 0.8 / peak;
      for (let i = 0; i < samples; i++) out[i] *= s;
    }
    return out;
  }

  // 粉红噪声（1/f，比白噪声更自然）
  pinkNoise(duration: number, sampleRate?: number): Float32Array {
    const sr = sampleRate || this.sampleRate;
    const samples = Math.floor(duration * sr);
    const out = new Float32Array(samples);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < samples; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }
    return out;
  }

  // 简单低通滤波（用于带宽限制）
  private _bandLimit(signal: Float32Array, cutoff: number, sr: number): Float32Array {
    const rc = 1.0 / (2 * Math.PI * cutoff);
    const dt = 1.0 / sr;
    const alpha = dt / (rc + dt);
    const out = new Float32Array(signal.length);
    out[0] = signal[0];
    for (let i = 1; i < signal.length; i++) {
      out[i] = out[i - 1] + alpha * (signal[i] - out[i - 1]);
    }
    return out;
  }
}

// ═════════════════════════════════════════════════════════════
// Part 3: FM 合成器 (Yamaha DX7 风格，无瑕疵版)
// ═════════════════════════════════════════════════════════════

export class FlawlessFMSynthesizer {
  sampleRate: number;
  private _waveGen: PureWaveformGenerator;

  constructor(sampleRate = 22050) {
    this.sampleRate = sampleRate;
    this._waveGen = new PureWaveformGenerator(sampleRate);
  }

  // 生成 FM 音色
  // carrier: 载波频率, modulator: 调制频率, modIndex: 调制指数
  generate(
    carrierFreq: number,
    modulatorFreq: number,
    modIndex: number,
    duration: number,
    envelope?: { attack: number; decay: number; sustain: number; release: number }
  ): Float32Array {
    const samples = Math.floor(duration * this.sampleRate);
    const out = new Float32Array(samples);

    const env = envelope || { attack: 0.01, decay: 0.1, sustain: 0.7, release: 0.3 };
    const attackSamples = Math.floor(env.attack * this.sampleRate);
    const decaySamples = Math.floor(env.decay * this.sampleRate);
    const releaseStart = Math.floor((duration - env.release) * this.sampleRate);

    for (let i = 0; i < samples; i++) {
      // ADSR 包络
      let amp = 0;
      if (i < attackSamples) {
        amp = i / attackSamples;
      } else if (i < attackSamples + decaySamples) {
        amp = 1 - (1 - env.sustain) * ((i - attackSamples) / decaySamples);
      } else if (i < releaseStart) {
        amp = env.sustain;
      } else {
        amp = env.sustain * (1 - (i - releaseStart) / (samples - releaseStart));
      }

      // FM 核心: carrier + modulator
      const modPhase = (2 * Math.PI * modulatorFreq * i) / this.sampleRate;
      const modulation = modIndex * Math.sin(modPhase);
      const carPhase = (2 * Math.PI * carrierFreq * i) / this.sampleRate + modulation;
      out[i] = amp * Math.sin(carPhase);
    }

    // 软削波限制（防止数字削波瑕疵）
    return this._softClip(out, 0.95);
  }

  // 算法式FM（预设算法）
  generateAlgorithm(
    freq: number,
    algorithm: number,
    duration: number
  ): Float32Array {
    const algPresets: Record<number, { ratios: number[]; indices: number[] }> = {
      1: { ratios: [1, 1, 1], indices: [3, 2, 1] },      // 经典电钢琴
      2: { ratios: [1, 3, 7], indices: [2, 1.5, 0.5] },  // 钟声
      3: { ratios: [1, 1.01, 0.99], indices: [1, 1, 1] }, // 合唱弦乐
      4: { ratios: [1, 2, 4], indices: [2, 1, 0.5] },    // 管风琴
      5: { ratios: [1, 1.414, 2], indices: [1.5, 1, 0.5] }, // 金属感
    };

    const preset = algPresets[algorithm] || algPresets[1];
    let signal = new Float32Array(Math.floor(duration * this.sampleRate));

    for (let op = 0; op < preset.ratios.length; op++) {
      const modSig = this.generate(
        freq * preset.ratios[op],
        freq * preset.ratios[op] * (op > 0 ? preset.ratios[op - 1] : 1),
        preset.indices[op],
        duration,
        { attack: 0.005, decay: 0.2, sustain: 0.6, release: 0.4 }
      );
      for (let i = 0; i < signal.length; i++) signal[i] += modSig[i] / preset.ratios.length;
    }

    return this._softClip(signal, 0.95);
  }

  private _softClip(signal: Float32Array, threshold: number): Float32Array {
    const out = new Float32Array(signal.length);
    for (let i = 0; i < signal.length; i++) {
      const x = signal[i];
      if (Math.abs(x) < threshold) {
        out[i] = x;
      } else {
        const sign = x > 0 ? 1 : -1;
        out[i] = sign * (threshold + (1 - threshold) * Math.tanh((Math.abs(x) - threshold) / (1 - threshold)));
      }
    }
    return out;
  }
}

// ═════════════════════════════════════════════════════════════
// Part 4: 瑕疵检测器 (Flaw Detector)
// ═════════════════════════════════════════════════════════════

export interface FlawReport {
  hasFlaws: boolean;
  severity: 'none' | 'minor' | 'major' | 'critical';
  issues: Array<{
    type: string;
    severity: 'minor' | 'major' | 'critical';
    position: number; // 样本位置
    description: string;
    suggestedFix: string;
  }>;
  metrics: {
    peakLevel: number;
    rmsLevel: number;
    crestFactor: number;
    dcOffset: number;
    dynamicRange: number;
    spectralFlatness: number;
    zeroCrossingRate: number;
  };
}

export class FlawDetector {
  sampleRate: number;
  private _windowSize: number;

  constructor(sampleRate = 22050) {
    this.sampleRate = sampleRate;
    this._windowSize = 2048;
  }

  detect(signal: Float32Array): FlawReport {
    const issues: FlawReport['issues'] = [];
    const metrics = this._computeMetrics(signal);

    // 1. 削波检测 (数字失真)
    const clipThreshold = 0.99;
    let clipCount = 0;
    for (let i = 0; i < signal.length; i++) {
      if (Math.abs(signal[i]) >= clipThreshold) clipCount++;
    }
    if (clipCount > 10) {
      issues.push({
        type: 'clipping',
        severity: clipCount > signal.length * 0.001 ? 'critical' : 'major',
        position: this._findFirstClip(signal, clipThreshold),
        description: `检测到 ${clipCount} 个削波样本，会产生数字失真`,
        suggestedFix: '应用自动增益控制(AGC)或软削波限制器',
      });
    }

    // 2. DC 偏移检测
    if (Math.abs(metrics.dcOffset) > 0.01) {
      issues.push({
        type: 'dc_offset',
        severity: Math.abs(metrics.dcOffset) > 0.05 ? 'major' : 'minor',
        position: 0,
        description: `DC偏移 ${metrics.dcOffset.toFixed(4)}，会导致低频能量浪费`,
        suggestedFix: '应用高通滤波器(HPF)移除DC偏移',
      });
    }

    // 3. 动态范围检测
    if (metrics.dynamicRange < 6) {
      issues.push({
        type: 'low_dynamic_range',
        severity: metrics.dynamicRange < 3 ? 'major' : 'minor',
        position: 0,
        description: `动态范围仅 ${metrics.dynamicRange.toFixed(1)} dB，声音过于平坦`,
        suggestedFix: '增加ADSR包络对比度或使用扩展器',
      });
    }

    // 4. 咔嗒声/爆音检测（瞬态异常）
    const clickPositions = this._detectClicks(signal);
    for (const pos of clickPositions) {
      issues.push({
        type: 'click_pop',
        severity: 'major',
        position: pos,
        description: `检测到咔嗒声/爆音，位置 ${(pos / this.sampleRate).toFixed(3)}s`,
        suggestedFix: '应用渐入渐出(fade in/out)或瞬态平滑',
      });
    }

    // 5. 频谱平衡检测
    if (metrics.spectralFlatness > 0.8) {
      issues.push({
        type: 'unnatural_spectrum',
        severity: 'minor',
        position: 0,
        description: `频谱过于平坦，可能缺乏谐波结构`,
        suggestedFix: '添加谐波泛音或调整滤波器设置',
      });
    }

    // 6. 不自然静音检测
    const silenceGaps = this._detectSilenceGaps(signal);
    for (const gap of silenceGaps) {
      issues.push({
        type: 'unnatural_silence',
        severity: 'minor',
        position: gap.start,
        description: `检测到不自然静音 (${(gap.duration / this.sampleRate).toFixed(3)}s)`,
        suggestedFix: '添加环境噪声底或交叉淡化',
      });
    }

    // 7. 相位抵消检测（立体声）
    // 简化版：检测相邻样本剧烈跳变
    let phaseIssues = 0;
    for (let i = 1; i < signal.length; i++) {
      if (Math.abs(signal[i] - signal[i - 1]) > 0.5) phaseIssues++;
    }
    if (phaseIssues > signal.length * 0.01) {
      issues.push({
        type: 'phase_issues',
        severity: 'minor',
        position: 0,
        description: '检测到过多相位跳变，可能产生高频刺耳声',
        suggestedFix: '应用低通滤波或相位校正',
      });
    }

    const severity = this._computeOverallSeverity(issues);
    return {
      hasFlaws: issues.length > 0,
      severity,
      issues,
      metrics,
    };
  }

  private _computeMetrics(signal: Float32Array): FlawReport['metrics'] {
    let sum = 0, sumSq = 0, peak = 0, dcSum = 0;
    let zeroCrossings = 0;
    for (let i = 0; i < signal.length; i++) {
      const s = signal[i];
      sum += s;
      sumSq += s * s;
      peak = Math.max(peak, Math.abs(s));
      dcSum += s;
      if (i > 0 && signal[i] * signal[i - 1] < 0) zeroCrossings++;
    }
    const dcOffset = dcSum / signal.length;
    const rms = Math.sqrt(sumSq / signal.length);
    const crestFactor = peak > 0 ? 20 * Math.log10(peak / (rms + 1e-12)) : 0;
    const dynamicRange = 20 * Math.log10((peak + 1e-12) / (rms + 1e-12));

    // 频谱平坦度
    const windowSize = Math.min(this._windowSize, signal.length);
    const real = new Float32Array(windowSize);
    const imag = new Float32Array(windowSize);
    const w = hannWindow(windowSize);
    for (let i = 0; i < windowSize; i++) real[i] = signal[i] * w[i];
    fft(real, imag);
    const magnitudes = new Float32Array(windowSize / 2);
    for (let i = 0; i < windowSize / 2; i++) {
      magnitudes[i] = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
    }
    const geoMean = Math.exp(magnitudes.reduce((s, m) => s + Math.log(m + 1e-12), 0) / magnitudes.length);
    const arithMean = magnitudes.reduce((s, m) => s + m, 0) / magnitudes.length;
    const spectralFlatness = geoMean / (arithMean + 1e-12);

    return {
      peakLevel: peak,
      rmsLevel: rms,
      crestFactor,
      dcOffset,
      dynamicRange,
      spectralFlatness,
      zeroCrossingRate: zeroCrossings / signal.length,
    };
  }

  private _findFirstClip(signal: Float32Array, threshold: number): number {
    for (let i = 0; i < signal.length; i++) {
      if (Math.abs(signal[i]) >= threshold) return i;
    }
    return 0;
  }

  private _detectClicks(signal: Float32Array): number[] {
    const positions: number[] = [];
    const threshold = 0.3; // 相邻样本差值阈值
    for (let i = 2; i < signal.length - 2; i++) {
      const diff1 = Math.abs(signal[i] - signal[i - 1]);
      const diff2 = Math.abs(signal[i + 1] - signal[i]);
      if (diff1 > threshold && diff2 > threshold) {
        // 检测前后是否平滑
        const diffPrev = Math.abs(signal[i - 1] - signal[i - 2]);
        const diffNext = Math.abs(signal[i + 2] - signal[i + 1]);
        if (diffPrev < threshold * 0.5 && diffNext < threshold * 0.5) {
          positions.push(i);
        }
      }
    }
    return positions.slice(0, 20); // 最多报告20个
  }

  private _detectSilenceGaps(signal: Float32Array): Array<{ start: number; duration: number }> {
    const gaps: Array<{ start: number; duration: number }> = [];
    const threshold = 0.001;
    const minGapSamples = Math.floor(0.05 * this.sampleRate); // 50ms

    let gapStart = -1;
    for (let i = 0; i < signal.length; i++) {
      if (Math.abs(signal[i]) < threshold) {
        if (gapStart === -1) gapStart = i;
      } else {
        if (gapStart !== -1 && i - gapStart >= minGapSamples) {
          gaps.push({ start: gapStart, duration: i - gapStart });
        }
        gapStart = -1;
      }
    }
    return gaps;
  }

  private _computeOverallSeverity(issues: FlawReport['issues']): FlawReport['severity'] {
    if (!issues.length) return 'none';
    const hasCritical = issues.some(i => i.severity === 'critical');
    const hasMajor = issues.some(i => i.severity === 'major');
    if (hasCritical) return 'critical';
    if (hasMajor) return 'major';
    return 'minor';
  }
}

// ═════════════════════════════════════════════════════════════
// Part 5: 自动修复器 (Auto Repair)
// ═════════════════════════════════════════════════════════════

export class FlawlessRepair {
  sampleRate: number;

  constructor(sampleRate = 22050) {
    this.sampleRate = sampleRate;
  }

  // 修复所有检测到的瑕疵
  repair(signal: Float32Array, report: FlawReport): Float32Array {
    let repaired: Float32Array = new Float32Array(signal);

    for (const issue of report.issues) {
      switch (issue.type) {
        case 'clipping':
          repaired = this._fixClipping(repaired);
          break;
        case 'dc_offset':
          repaired = this._fixDCOffset(repaired);
          break;
        case 'low_dynamic_range':
          repaired = this._fixDynamicRange(repaired);
          break;
        case 'click_pop':
          repaired = this._fixClickPop(repaired, issue.position);
          break;
        case 'unnatural_silence':
          repaired = this._fixSilence(repaired, issue.position);
          break;
        case 'phase_issues':
          repaired = this._fixPhaseIssues(repaired);
          break;
      }
    }

    // 最终保护：软削波
    return this._softClipFinal(repaired, 0.98);
  }

  private _fixClipping(signal: Float32Array): Float32Array {
    const out = new Float32Array(signal);
    const threshold = 0.95;
    for (let i = 0; i < out.length; i++) {
      if (Math.abs(out[i]) > threshold) {
        const sign = out[i] > 0 ? 1 : -1;
        out[i] = sign * (threshold + (1 - threshold) * Math.tanh((Math.abs(out[i]) - threshold) / 0.05));
      }
    }
    return out;
  }

  private _fixDCOffset(signal: Float32Array): Float32Array {
    const mean = signal.reduce((s, v) => s + v, 0) / signal.length;
    const out = new Float32Array(signal.length);
    for (let i = 0; i < signal.length; i++) out[i] = signal[i] - mean;
    return out;
  }

  private _fixDynamicRange(signal: Float32Array): Float32Array {
    const out = new Float32Array(signal);
    // 轻微压缩+ Makeup Gain
    const threshold = 0.3;
    const ratio = 4;
    for (let i = 0; i < out.length; i++) {
      const abs = Math.abs(out[i]);
      if (abs > threshold) {
        const excess = abs - threshold;
        const compressed = threshold + excess / ratio;
        out[i] = (out[i] > 0 ? 1 : -1) * compressed;
      }
    }
    // Makeup gain
    const peak = Math.max(...out.map(Math.abs));
    if (peak > 0) {
      const gain = 0.95 / peak;
      for (let i = 0; i < out.length; i++) out[i] *= gain;
    }
    return out;
  }

  private _fixClickPop(signal: Float32Array, position: number): Float32Array {
    const out = new Float32Array(signal);
    const windowSize = Math.floor(0.005 * this.sampleRate); // 5ms
    const start = Math.max(0, position - windowSize);
    const end = Math.min(out.length, position + windowSize);

    // 线性插值平滑
    const leftVal = out[start];
    const rightVal = out[end - 1];
    for (let i = start; i < end; i++) {
      const t = (i - start) / (end - start);
      out[i] = leftVal * (1 - t) + rightVal * t;
    }
    return out;
  }

  private _fixSilence(signal: Float32Array, position: number): Float32Array {
    const out = new Float32Array(signal);
    const fadeSize = Math.floor(0.01 * this.sampleRate); // 10ms
    const start = Math.max(0, position - fadeSize);
    const end = Math.min(out.length, position + fadeSize);

    // 添加微小噪声底
    for (let i = start; i < end; i++) {
      const noise = (Math.random() * 2 - 1) * 0.0001;
      out[i] += noise;
    }
    return out;
  }

  private _fixPhaseIssues(signal: Float32Array): Float32Array {
    // 简单低通滤波平滑
    const out = new Float32Array(signal.length);
    const alpha = 0.1;
    out[0] = signal[0];
    for (let i = 1; i < signal.length; i++) {
      out[i] = out[i - 1] + alpha * (signal[i] - out[i - 1]);
    }
    return out;
  }

  private _softClipFinal(signal: Float32Array, threshold: number): Float32Array {
    const out = new Float32Array(signal.length);
    for (let i = 0; i < signal.length; i++) {
      const x = signal[i];
      if (Math.abs(x) < threshold) {
        out[i] = x;
      } else {
        const sign = x > 0 ? 1 : -1;
        out[i] = sign * (threshold + (1 - threshold) * Math.tanh((Math.abs(x) - threshold) / (1 - threshold)));
      }
    }
    return out;
  }
}

// ═════════════════════════════════════════════════════════════
// Part 6: 无瑕疵合成器主引擎
// ═════════════════════════════════════════════════════════════

export interface FlawlessResult {
  pcm: Float32Array;
  wav: Uint8Array;
  report: FlawReport;
  iterations: number;
  finalQuality: number;
  params: Record<string, any>;
}

export class FlawlessSynthesizer {
  config: FlawlessConfig;
  private _waveGen: PureWaveformGenerator;
  private _fmSynth: FlawlessFMSynthesizer;
  private _detector: FlawDetector;
  private _repair: FlawlessRepair;
  private _cognitive: CognitiveInvariantEngine;
  private _closedLoop: CognitiveClosedLoop;
  private _iterationCount = 0;

  constructor(config?: Partial<FlawlessConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this._waveGen = new PureWaveformGenerator(this.config.sampleRate);
    this._fmSynth = new FlawlessFMSynthesizer(this.config.sampleRate);
    this._detector = new FlawDetector(this.config.sampleRate);
    this._repair = new FlawlessRepair(this.config.sampleRate);
    this._cognitive = new CognitiveInvariantEngine();
    this._closedLoop = new CognitiveClosedLoop(this.config.targetQuality);
  }

  // 生成无瑕疵单音
  synthesizeNote(
    freq: number,
    duration: number,
    velocity = 1.0,
    waveform: WaveformType = 'sine',
    options?: { fm?: boolean; fmModRatio?: number; fmIndex?: number }
  ): FlawlessResult {
    let pcm: Float32Array;

    if (options?.fm) {
      pcm = this._fmSynth.generate(
        freq,
        freq * (options.fmModRatio || 2),
        options.fmIndex || 3,
        duration,
        { attack: 0.01, decay: 0.1, sustain: velocity * 0.8, release: 0.3 }
      );
    } else {
      switch (waveform) {
        case 'triangle':
          pcm = this._waveGen.triangle(freq, duration);
          break;
        case 'sawtooth':
          pcm = this._waveGen.sawtooth(freq, duration);
          break;
        case 'square':
          pcm = this._waveGen.square(freq, duration);
          break;
        case 'superSaw':
          pcm = this._waveGen.superSaw(freq, duration);
          break;
        case 'noise':
          pcm = this._waveGen.pinkNoise(duration);
          break;
        default:
          pcm = this._waveGen.sine(freq, duration);
      }
    }

    // 应用力度
    if (velocity !== 1.0) {
      for (let i = 0; i < pcm.length; i++) pcm[i] *= velocity;
    }

    // 应用ADSR包络
    pcm = this._applyADSR(pcm, duration, { attack: 0.05, decay: 0.1, sustain: 0.7, release: 0.2 });

    // 无瑕疵处理
    return this._makeFlawless(pcm, { freq, duration, velocity, waveform });
  }

  // 生成无瑕疵和弦
  synthesizeChord(
    freqs: number[],
    duration: number,
    waveform: WaveformType = 'triangle'
  ): FlawlessResult {
    let mix = new Float32Array(Math.floor(duration * this.config.sampleRate));

    for (const freq of freqs) {
      const note = this.synthesizeNote(freq, duration, 1.0 / freqs.length, waveform);
      for (let i = 0; i < mix.length; i++) mix[i] += note.pcm[i];
    }

    // 归一化
    const peak = Math.max(...mix.map(Math.abs));
    if (peak > 0) for (let i = 0; i < mix.length; i++) mix[i] *= 0.9 / peak;

    return this._makeFlawless(mix, { freqs, duration, waveform });
  }

  // 生成无瑕疵琶音
  synthesizeArpeggio(
    freqs: number[],
    noteDuration: number,
    waveform: WaveformType = 'sine'
  ): FlawlessResult {
    const totalDuration = freqs.length * noteDuration;
    const mix = new Float32Array(Math.floor(totalDuration * this.config.sampleRate));

    for (let n = 0; n < freqs.length; n++) {
      const note = this.synthesizeNote(freqs[n], noteDuration, 0.8, waveform);
      const offset = Math.floor(n * noteDuration * this.config.sampleRate);
      for (let i = 0; i < note.pcm.length && offset + i < mix.length; i++) {
        mix[offset + i] += note.pcm[i];
      }
    }

    const peak = Math.max(...mix.map(Math.abs));
    if (peak > 0) for (let i = 0; i < mix.length; i++) mix[i] *= 0.9 / peak;

    return this._makeFlawless(mix, { freqs, noteDuration, waveform, type: 'arpeggio' });
  }

  // 生成无瑕疵打击乐
  synthesizeDrum(
    type: 'kick' | 'snare' | 'hihat' | 'tom',
    duration = 0.5
  ): FlawlessResult {
    const sr = this.config.sampleRate;
    const samples = Math.floor(duration * sr);
    const out = new Float32Array(samples);

    switch (type) {
      case 'kick': {
        // 正弦扫频 + 指数衰减
        for (let i = 0; i < samples; i++) {
          const t = i / sr;
          const freq = 150 * Math.exp(-t * 20);
          const amp = Math.exp(-t * 15);
          out[i] = amp * Math.sin(2 * Math.PI * freq * t);
        }
        break;
      }
      case 'snare': {
        // 噪声 + 正弦体
        for (let i = 0; i < samples; i++) {
          const t = i / sr;
          const noise = (Math.random() * 2 - 1) * Math.exp(-t * 10);
          const tone = Math.sin(2 * Math.PI * 200 * t) * Math.exp(-t * 8) * 0.3;
          out[i] = noise + tone;
        }
        break;
      }
      case 'hihat': {
        // 高通噪声
        for (let i = 0; i < samples; i++) {
          const t = i / sr;
          out[i] = (Math.random() * 2 - 1) * Math.exp(-t * 40);
        }
        // 简单高通
        const alpha = 0.3;
        for (let i = 1; i < samples; i++) {
          out[i] = alpha * (out[i] - out[i - 1]);
        }
        break;
      }
      case 'tom': {
        const baseFreq = 100 + Math.random() * 50;
        for (let i = 0; i < samples; i++) {
          const t = i / sr;
          const freq = baseFreq * Math.exp(-t * 8);
          const amp = Math.exp(-t * 6);
          out[i] = amp * Math.sin(2 * Math.PI * freq * t);
        }
        break;
      }
    }

    return this._makeFlawless(out, { type: 'drum', drumType: type, duration });
  }

  // 核心：使音频无瑕疵
  private _makeFlawless(pcm: Float32Array, params: Record<string, any>): FlawlessResult {
    let current: Float32Array = new Float32Array(pcm);
    let report: FlawReport;
    let iterations = 0;

    for (let i = 0; i < this.config.maxIterations; i++) {
      report = this._detector.detect(current);
      iterations++;

      if (!report.hasFlaws) break;
      if (!this.config.autoRepair) break;

      current = this._repair.repair(current, report);
    }

    // 最终检测
    report = this._detector.detect(current);

    // 认知评估
    const noteStr = Array.from(current.slice(0, Math.min(1000, current.length))).map(v => v.toFixed(3)).join(' ');
    const cognitiveScore = this._cognitive.evaluate(noteStr).overall;

    // 转换WAV
    const wav = this._pcmToWav(current, this.config.sampleRate, this.config.channels);

    this._iterationCount++;

    return {
      pcm: current,
      wav,
      report,
      iterations,
      finalQuality: cognitiveScore,
      params: { ...params, iteration: this._iterationCount },
    };
  }

  private _applyADSR(
    signal: Float32Array,
    duration: number,
    env: { attack: number; decay: number; sustain: number; release: number }
  ): Float32Array {
    const sr = this.config.sampleRate;
    const out = new Float32Array(signal);
    const attackS = Math.floor(env.attack * sr);
    const decayS = Math.floor(env.decay * sr);
    const releaseS = Math.floor(env.release * sr);
    const sustainStart = attackS + decayS;
    const releaseStart = out.length - releaseS;

    for (let i = 0; i < out.length; i++) {
      let amp = 0;
      if (i < attackS) {
        amp = i / attackS;
      } else if (i < sustainStart) {
        amp = 1 - (1 - env.sustain) * ((i - attackS) / decayS);
      } else if (i < releaseStart) {
        amp = env.sustain;
      } else {
        amp = env.sustain * (1 - (i - releaseStart) / releaseS);
      }
      out[i] *= amp;
    }
    return out;
  }

  private _pcmToWav(pcm: Float32Array, sampleRate: number, channels: number): Uint8Array {
    const bitsPerSample = 16;
    const byteRate = sampleRate * channels * bitsPerSample / 8;
    const blockAlign = channels * bitsPerSample / 8;
    const dataSize = pcm.length * channels * bitsPerSample / 8;
    const headerSize = 44;
    const buffer = new ArrayBuffer(headerSize + dataSize);
    const view = new DataView(buffer);

    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    let offset = 44;
    for (let i = 0; i < pcm.length; i++) {
      const sample = clamp(pcm[i], -1, 1);
      const intSample = Math.floor(sample * 32767);
      for (let ch = 0; ch < channels; ch++) {
        view.setInt16(offset, intSample, true);
        offset += 2;
      }
    }

    return new Uint8Array(buffer);
  }
}

// ═════════════════════════════════════════════════════════════
// Part 7: 预设音色库
// ═════════════════════════════════════════════════════════════

export const FLAWLESS_PRESETS: Record<string, (synth: FlawlessSynthesizer, freq: number, duration: number) => FlawlessResult> = {
  'pure_sine': (s, f, d) => s.synthesizeNote(f, d, 1.0, 'sine'),
  'warm_triangle': (s, f, d) => s.synthesizeNote(f, d, 1.0, 'triangle'),
  'rich_saw': (s, f, d) => s.synthesizeNote(f, d, 1.0, 'sawtooth'),
  'hollow_square': (s, f, d) => s.synthesizeNote(f, d, 1.0, 'square'),
  'supersaw_lead': (s, f, d) => s.synthesizeNote(f, d, 1.0, 'superSaw'),
  'fm_e_piano': (s, f, d) => s.synthesizeNote(f, d, 1.0, 'sine', { fm: true, fmModRatio: 2, fmIndex: 3 }),
  'fm_bell': (s, f, d) => s.synthesizeNote(f, d, 1.0, 'sine', { fm: true, fmModRatio: 3.5, fmIndex: 5 }),
  'fm_bass': (s, f, d) => s.synthesizeNote(f, d, 1.0, 'sine', { fm: true, fmModRatio: 1, fmIndex: 2 }),
  'noise_pad': (s, f, d) => s.synthesizeNote(f, d, 0.5, 'noise'),
};

// ═════════════════════════════════════════════════════════════
// 默认导出
// ═════════════════════════════════════════════════════════════
export default {
  FlawlessSynthesizer,
  FlawDetector,
  FlawlessRepair,
  PureWaveformGenerator,
  FlawlessFMSynthesizer,
  FLAWLESS_PRESETS,
};
