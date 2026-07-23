/**
 * @fileoverview 青鸾数字音频工作站 - 加法合成器引擎
 * @description 基于泛音列叠加的加法合成系统，支持独立泛音包络、频谱变形与音频重合成
 * @version 2.0.0
 * @author 青鸾音频引擎团队
 */

import {
  clamp,
  lerp,
  smoothstep,
  dbToGain,
  hannWindow,
  fft,
  normalizeBuffer,
} from '../utils/audioUtils.js';

// ═══════════════════════════════════════════════════════════════
// 全局常量
// ═══════════════════════════════════════════════════════════════

/** 系统统一采样率 (Hz) */
export const SAMPLE_RATE = 44100;

/** 最大泛音数量 (128 个独立泛音) */
export const MAX_PARTIALS = 128;

/** 默认基频 (A4 = 440Hz) */
export const DEFAULT_FREQUENCY = 440;

/** 包络精度：每毫秒采样点数 */
export const ENVELOPE_PRECISION = Math.floor(SAMPLE_RATE / 1000);

/** 频谱变形默认步数 */
export const DEFAULT_MORPH_STEPS = 256;

/** 元音共振峰频率表 (Hz) */
export const VOWEL_FORMANTS: Record<string, number[]> = {
  a: [730, 1090, 2440],
  e: [660, 1720, 2410],
  i: [270, 2290, 3010],
  o: [300, 940, 2440],
  u: [300, 610, 2440],
};

// ═══════════════════════════════════════════════════════════════
// 核心类型定义
// ═══════════════════════════════════════════════════════════════

/**
 * ADSR 包络参数
 */
export interface ADSREnvelope {
  /** 起音时间 (秒) */
  attack: number;
  /** 衰减时间 (秒) */
  decay: number;
  /** 持续电平 (0-1) */
  sustain: number;
  /** 释音时间 (秒) */
  release: number;
  /** 起音曲线类型 */
  attackCurve?: 'linear' | 'exponential' | 'cosine';
  /** 衰减曲线类型 */
  decayCurve?: 'linear' | 'exponential';
  /** 释音曲线类型 */
  releaseCurve?: 'linear' | 'exponential';
}

/**
 * 泛音参数
 */
export interface PartialConfig {
  /** 泛音索引 (1 = 基频) */
  index: number;
  /** 振幅 (0-1) */
  amplitude: number;
  /** 频率比 (相对于基频) */
  frequencyRatio: number;
  /** 初始相位 (0-2π) */
  phase: number;
  /** 失谐量 (音分) */
  detune: number;
  /** 独立包络 */
  envelope?: ADSREnvelope;
  /** 是否启用 */
  enabled: boolean;
  /** 声像位置 (-1 ~ 1) */
  pan?: number;
  /** 调频指数 (用于非谐扩展) */
  fmIndex?: number;
}

/**
 * 音色轮廓配置
 */
export interface TimbreProfile {
  /** 音色名称 */
  name: string;
  /** 泛音振幅序列 (相对基频的振幅) */
  partialAmplitudes: number[];
  /** 泛音频率比序列 */
  partialRatios?: number[];
  /** 默认包络 */
  envelope: ADSREnvelope;
  /** 亮度系数 (0-1) */
  brightness?: number;
  /** 失谐扩散 */
  detuneSpread?: number;
  /** 非谐性系数 */
  inharmonicity?: number;
  /** 立体声宽度 */
  stereoWidth?: number;
}

/**
 * 频谱变形配置
 */
export interface SpectralMorphConfig {
  /** 起始频谱 (泛音振幅数组) */
  fromSpectrum: Float32Array;
  /** 目标频谱 (泛音振幅数组) */
  toSpectrum: Float32Array;
  /** 变形时长 (秒) */
  duration: number;
  /** 变形曲线 */
  curve: 'linear' | 'exponential' | 'sine' | 'logarithmic';
  /** 变形张力 */
  tension?: number;
}

/**
 * 频谱帧数据
 */
export interface SpectralFrame {
  /** 时间位置 (秒) */
  time: number;
  /** 频率分量数组 (Hz) */
  frequencies: Float32Array;
  /** 振幅分量数组 (线性) */
  amplitudes: Float32Array;
  /** 相位分量数组 */
  phases: Float32Array;
}

/**
 * 重合成配置
 */
export interface ResynthesisConfig {
  /** 帧大小 */
  frameSize: number;
  /** 跳步大小 */
  hopSize: number;
  /** 保留的峰值数量 */
  peakCount: number;
  /** 最小频率 (Hz) */
  minFreq: number;
  /** 最大频率 (Hz) */
  maxFreq: number;
  /** 幅度阈值 */
  magnitudeThreshold: number;
}

// ═══════════════════════════════════════════════════════════════
// 内置音色预设
// ═══════════════════════════════════════════════════════════════

/**
 * 铜管音色预设
 * 特点：偶次泛音较强，起音较快，有轻微失谐
 */
export const BRASS_PRESET: TimbreProfile = {
  name: 'brass',
  partialAmplitudes: [
    1.0, 0.85, 0.75, 0.65, 0.55, 0.45, 0.35, 0.25, 0.15, 0.1, 0.05, 0.03,
  ],
  envelope: {
    attack: 0.05,
    decay: 0.15,
    sustain: 0.85,
    release: 0.3,
    attackCurve: 'cosine',
    decayCurve: 'exponential',
    releaseCurve: 'exponential',
  },
  brightness: 0.6,
  detuneSpread: 3.0,
  inharmonicity: 0.001,
  stereoWidth: 0.2,
};

/**
 * 弦乐音色预设
 * 特点：泛音丰富且衰减慢，略有失谐营造合唱感
 */
export const STRINGS_PRESET: TimbreProfile = {
  name: 'strings',
  partialAmplitudes: [
    1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.35, 0.3, 0.25, 0.2, 0.15,
    0.12, 0.1, 0.08, 0.06, 0.05, 0.04, 0.03, 0.02,
  ],
  envelope: {
    attack: 0.2,
    decay: 0.3,
    sustain: 0.75,
    release: 0.8,
    attackCurve: 'linear',
    decayCurve: 'linear',
    releaseCurve: 'linear',
  },
  brightness: 0.4,
  detuneSpread: 8.0,
  inharmonicity: 0.0001,
  stereoWidth: 0.8,
};

/**
 * 单簧管音色预设
 * 特点：奇次泛音为主，偶次泛音弱
 */
export const CLARINET_PRESET: TimbreProfile = {
  name: 'clarinet',
  partialAmplitudes: [
    1.0, 0.05, 0.65, 0.03, 0.45, 0.02, 0.35, 0.02, 0.25, 0.01, 0.15, 0.01,
  ],
  envelope: {
    attack: 0.08,
    decay: 0.1,
    sustain: 0.9,
    release: 0.25,
    attackCurve: 'cosine',
    decayCurve: 'exponential',
    releaseCurve: 'exponential',
  },
  brightness: 0.3,
  detuneSpread: 1.5,
  inharmonicity: 0.0005,
  stereoWidth: 0.1,
};

/**
 * 管风琴音色预设
 * 特点：泛音丰富且稳定，各泛音振幅接近
 */
export const ORGAN_PRESET: TimbreProfile = {
  name: 'organ',
  partialAmplitudes: [
    1.0, 0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6, 0.55, 0.5, 0.45,
    0.4, 0.35, 0.3, 0.25, 0.2, 0.15, 0.1, 0.05,
  ],
  envelope: {
    attack: 0.01,
    decay: 0.01,
    sustain: 1.0,
    release: 0.15,
    attackCurve: 'linear',
    decayCurve: 'linear',
    releaseCurve: 'exponential',
  },
  brightness: 0.5,
  detuneSpread: 0.5,
  inharmonicity: 0.0,
  stereoWidth: 0.6,
};

/**
 * 钟声音色预设
 * 特点：非谐泛音，高频泛音衰减极快
 */
export const BELL_PRESET: TimbreProfile = {
  name: 'bell',
  partialAmplitudes: [
    1.0, 0.6, 0.4, 0.3, 0.25, 0.2, 0.15, 0.12, 0.1, 0.08, 0.06, 0.05,
  ],
  partialRatios: [
    1.0, 2.76, 5.4, 8.9, 13.5, 18.5, 24.0, 30.0, 36.5, 43.5, 51.0, 59.0,
  ],
  envelope: {
    attack: 0.005,
    decay: 2.0,
    sustain: 0.0,
    release: 3.0,
    attackCurve: 'exponential',
    decayCurve: 'exponential',
    releaseCurve: 'exponential',
  },
  brightness: 0.9,
  detuneSpread: 15.0,
  inharmonicity: 0.1,
  stereoWidth: 1.0,
};

/**
 * 元音音色预设 (元音 "a")
 * 特点：基于共振峰合成
 */
export const VOWEL_A_PRESET: TimbreProfile = {
  name: 'vowel_a',
  partialAmplitudes: [1.0, 0.5, 0.3, 0.2, 0.15, 0.1, 0.08, 0.05],
  envelope: {
    attack: 0.05,
    decay: 0.1,
    sustain: 0.9,
    release: 0.2,
    attackCurve: 'linear',
    decayCurve: 'exponential',
    releaseCurve: 'exponential',
  },
  brightness: 0.4,
  detuneSpread: 5.0,
  inharmonicity: 0.002,
  stereoWidth: 0.3,
};

/** 所有内置音色预设映射 */
export const BUILT_IN_PRESETS: Map<string, TimbreProfile> = new Map([
  ['brass', BRASS_PRESET],
  ['strings', STRINGS_PRESET],
  ['clarinet', CLARINET_PRESET],
  ['organ', ORGAN_PRESET],
  ['bell', BELL_PRESET],
  ['vowel_a', VOWEL_A_PRESET],
]);

// ═══════════════════════════════════════════════════════════════
// 辅助工具函数
// ═══════════════════════════════════════════════════════════════

/**
 * 生成 ADSR 包络缓冲区
 * @param envelope ADSR 参数
 * @param duration 总时长 (秒)
 * @param sampleRate 采样率
 * @returns 包络 Float32Array
 */
export function generateADSREnvelope(
  envelope: ADSREnvelope,
  duration: number,
  sampleRate: number = SAMPLE_RATE
): Float32Array {
  const samples = Math.floor(duration * sampleRate);
  const env = new Float32Array(samples);

  const attackSamples = Math.max(1, Math.floor(envelope.attack * sampleRate));
  const decaySamples = Math.max(1, Math.floor(envelope.decay * sampleRate));
  const releaseSamples = Math.max(1, Math.floor(envelope.release * sampleRate));
  const sustainLevel = clamp(envelope.sustain, 0, 1);

  // 起音段
  for (let i = 0; i < Math.min(attackSamples, samples); i++) {
    const t = i / attackSamples;
    switch (envelope.attackCurve || 'linear') {
      case 'exponential':
        env[i] = 1 - Math.exp(-t * 5);
        break;
      case 'cosine':
        env[i] = (1 - Math.cos(t * Math.PI)) / 2;
        break;
      case 'linear':
      default:
        env[i] = t;
        break;
    }
  }

  // 衰减段
  const decayStart = attackSamples;
  for (let i = 0; i < Math.min(decaySamples, samples - decayStart); i++) {
    const t = i / decaySamples;
    const decayFactor = envelope.decayCurve === 'exponential' ? Math.exp(-t * 3) : 1 - t;
    env[decayStart + i] = 1 - (1 - sustainLevel) * (1 - decayFactor);
  }

  // 持续段
  const sustainStart = attackSamples + decaySamples;
  const releaseStart = Math.max(sustainStart, samples - releaseSamples);
  for (let i = sustainStart; i < Math.min(releaseStart, samples); i++) {
    env[i] = sustainLevel;
  }

  // 释音段
  for (let i = 0; i < Math.min(releaseSamples, samples - releaseStart); i++) {
    const t = i / releaseSamples;
    const releaseFactor = envelope.releaseCurve === 'linear' ? 1 - t : Math.exp(-t * 5);
    env[releaseStart + i] = sustainLevel * releaseFactor;
  }

  // 释音结束后归零
  for (let i = releaseStart + releaseSamples; i < samples; i++) {
    env[i] = 0;
  }

  return env;
}

/**
 * 计算非谐频率
 * @param fundamental 基频
 * @param partialIndex 泛音索引
 * @param inharmonicity 非谐性系数
 * @returns 非谐频率
 */
export function inharmonicFrequency(
  fundamental: number,
  partialIndex: number,
  inharmonicity: number
): number {
  if (inharmonicity <= 0) return fundamental * partialIndex;
  // 钢琴弦非谐模型: f_n = n * f_0 * sqrt(1 + B * n^2)
  return fundamental * partialIndex * Math.sqrt(1 + inharmonicity * partialIndex * partialIndex);
}

/**
 * 频率转音分偏移
 * @param freq 频率
 * @param reference 参考频率
 * @returns 音分差值
 */
export function freqToCents(freq: number, reference: number): number {
  return 1200 * Math.log2(freq / reference);
}

/**
 * 生成共振峰滤波器增益
 * @param frequency 目标频率
 * @param formants 共振峰频率数组
 * @param bandwidths 带宽数组
 * @returns 增益因子
 */
export function formantGain(frequency: number, formants: number[], bandwidths?: number[]): number {
  let gain = 1.0;
  for (let i = 0; i < formants.length; i++) {
    const bw = bandwidths ? bandwidths[i] : 100 + i * 50;
    const diff = frequency - formants[i];
    gain *= 1 + 10 * Math.exp(-(diff * diff) / (2 * bw * bw));
  }
  return gain;
}

// ═══════════════════════════════════════════════════════════════
// AdditiveSynthesizer 类 - 加法合成器
// ═══════════════════════════════════════════════════════════════

/**
 * 加法合成器类
 * 通过叠加 128 个独立控制的正弦波泛音来合成复杂音色
 */
export class AdditiveSynthesizer {
  /** 泛音配置数组 */
  private partials: PartialConfig[];

  /** 采样率 */
  readonly sampleRate: number;

  /** 当前基频 */
  private currentFrequency: number;

  /** 当前音色轮廓 */
  private currentProfile: TimbreProfile | null;

  /** 立体声模式 */
  stereoWidth: number;

  /**
   * 创建加法合成器
   * @param sampleRate 采样率 (默认 44100)
   */
  constructor(sampleRate: number = SAMPLE_RATE) {
    this.sampleRate = sampleRate;
    this.currentFrequency = DEFAULT_FREQUENCY;
    this.currentProfile = null;
    this.stereoWidth = 0.5;

    // 初始化 128 个泛音
    this.partials = [];
    for (let i = 0; i < MAX_PARTIALS; i++) {
      this.partials.push({
        index: i + 1,
        amplitude: i === 0 ? 1.0 : 0.0,
        frequencyRatio: i + 1,
        phase: 0,
        detune: 0,
        enabled: i < 16,
        pan: 0,
        fmIndex: 0,
      });
    }
  }

  /**
   * 设置指定泛音的参数
   * @param index 泛音索引 (0-127，0 代表基频)
   * @param amplitude 振幅 (0-1)
   * @param frequencyRatio 频率比
   * @param phase 初始相位 (0-2π)
   * @param detune 失谐量 (音分)
   */
  setPartial(
    index: number,
    amplitude: number,
    frequencyRatio: number,
    phase: number = 0,
    detune: number = 0
  ): void {
    if (index < 0 || index >= MAX_PARTIALS) {
      throw new Error(`泛音索引必须在 0-${MAX_PARTIALS - 1} 范围内`);
    }
    const partial = this.partials[index];
    partial.amplitude = clamp(amplitude, 0, 1);
    partial.frequencyRatio = frequencyRatio > 0 ? frequencyRatio : index + 1;
    partial.phase = phase % (2 * Math.PI);
    partial.detune = detune;
    partial.enabled = amplitude > 0;
  }

  /**
   * 获取泛音配置
   * @param index 泛音索引
   * @returns 泛音配置
   */
  getPartial(index: number): PartialConfig {
    if (index < 0 || index >= MAX_PARTIALS) {
      throw new Error(`泛音索引越界: ${index}`);
    }
    return { ...this.partials[index] };
  }

  /**
   * 设置泛音包络
   * @param index 泛音索引
   * @param envelope ADSR 包络
   */
  setPartialEnvelope(index: number, envelope: ADSREnvelope): void {
    if (index < 0 || index >= MAX_PARTIALS) {
      throw new Error(`泛音索引越界: ${index}`);
    }
    this.partials[index].envelope = { ...envelope };
  }

  /**
   * 启用/禁用泛音
   * @param index 泛音索引
   * @param enabled 是否启用
   */
  setPartialEnabled(index: number, enabled: boolean): void {
    if (index < 0 || index >= MAX_PARTIALS) return;
    this.partials[index].enabled = enabled;
  }

  /**
   * 设置所有泛音振幅
   * @param amplitudes 振幅数组
   */
  setAllPartialAmplitudes(amplitudes: number[]): void {
    for (let i = 0; i < Math.min(amplitudes.length, MAX_PARTIALS); i++) {
      this.partials[i].amplitude = clamp(amplitudes[i], 0, 1);
      this.partials[i].enabled = amplitudes[i] > 0;
    }
  }

  /**
   * 从音色轮廓加载泛音配置
   * @param profile 音色轮廓
   */
  loadTimbreProfile(profile: TimbreProfile): void {
    this.currentProfile = profile;
    this.stereoWidth = profile.stereoWidth ?? 0.5;

    const amps = profile.partialAmplitudes;
    const ratios = profile.partialRatios;

    for (let i = 0; i < MAX_PARTIALS; i++) {
      const partial = this.partials[i];
      if (i < amps.length) {
        partial.amplitude = amps[i];
        partial.enabled = true;
      } else {
        // 超出预设范围的泛音按亮度衰减
        const brightness = profile.brightness ?? 0.5;
        partial.amplitude = Math.pow(brightness, i) * (amps[amps.length - 1] || 0.1);
        partial.enabled = partial.amplitude > 0.001;
      }

      if (ratios && i < ratios.length) {
        partial.frequencyRatio = ratios[i];
      } else {
        partial.frequencyRatio = i + 1;
      }

      // 应用失谐扩散
      const spread = profile.detuneSpread ?? 0;
      if (spread > 0) {
        partial.detune = (Math.random() - 0.5) * spread * (i + 1) * 0.1;
      }

      // 为每个泛音分配独立包络变体
      if (profile.envelope) {
        const env = { ...profile.envelope };
        // 高频泛音衰减更快
        if (i > 0) {
          const decayFactor = 1 + i * 0.1;
          env.decay = env.decay / decayFactor;
          env.sustain = env.sustain * Math.pow(0.9, i);
          env.release = env.release / (1 + i * 0.05);
        }
        partial.envelope = env;
      }

      // 立体声分布
      if (MAX_PARTIALS > 1) {
        partial.pan = ((i / (MAX_PARTIALS - 1)) * 2 - 1) * this.stereoWidth;
      }
    }
  }

  /**
   * 加载内置音色
   * @param presetName 预设名称
   */
  loadPreset(presetName: string): void {
    const preset = BUILT_IN_PRESETS.get(presetName);
    if (!preset) {
      throw new Error(`未知音色预设: ${presetName}。可用预设: ${Array.from(BUILT_IN_PRESETS.keys()).join(', ')}`);
    }
    this.loadTimbreProfile(preset);
  }

  /**
   * 生成单个泛音
   * @param frequency 基频 (Hz)
   * @param amplitude 振幅
   * @param duration 时长 (秒)
   * @param partialIndex 泛音索引 (用于获取详细参数)
   * @returns 单声道泛音缓冲区
   */
  generatePartial(
    frequency: number,
    amplitude: number,
    duration: number,
    partialIndex?: number
  ): Float32Array {
    const samples = Math.floor(duration * this.sampleRate);
    const buffer = new Float32Array(samples);

    const idx = partialIndex ?? 0;
    const config = this.partials[idx];
    const ratio = config ? config.frequencyRatio : idx + 1;
    const detuneCents = config ? config.detune : 0;
    const detuneRatio = Math.pow(2, detuneCents / 1200);
    const freq = inharmonicFrequency(frequency, ratio, this.currentProfile?.inharmonicity || 0) * detuneRatio;
    const phase = config ? config.phase : 0;

    // 生成包络
    const env = config?.envelope
      ? generateADSREnvelope(config.envelope, duration, this.sampleRate)
      : new Float32Array(samples).fill(1);

    // 生成正弦波
    const omega = (2 * Math.PI * freq) / this.sampleRate;
    for (let i = 0; i < samples; i++) {
      const sample = Math.sin(omega * i + phase) * amplitude * (env[i] || 0);
      buffer[i] = sample;
    }

    return buffer;
  }

  /**
   * 合成完整音色
   * @param frequency 基频 (Hz)
   * @param duration 时长 (秒)
   * @param timbreProfile 音色轮廓 (可选，使用当前加载的轮廓)
   * @returns 立体声缓冲区 [左, 右]
   */
  synthesize(
    frequency: number,
    duration: number,
    timbreProfile?: TimbreProfile
  ): [Float32Array, Float32Array] {
    if (duration <= 0) {
      throw new Error('时长必须大于 0');
    }
    if (frequency <= 0) {
      throw new Error('频率必须大于 0');
    }

    this.currentFrequency = frequency;

    if (timbreProfile) {
      this.loadTimbreProfile(timbreProfile);
    }

    const samples = Math.floor(duration * this.sampleRate);
    const outL = new Float32Array(samples);
    const outR = new Float32Array(samples);

    // 叠加所有启用的泛音
    for (let i = 0; i < MAX_PARTIALS; i++) {
      const partial = this.partials[i];
      if (!partial.enabled || partial.amplitude <= 0) continue;

      // 避免频率超过奈奎斯特频率
      const ratio = partial.frequencyRatio;
      const detuneRatio = Math.pow(2, partial.detune / 1200);
      const partialFreq = inharmonicFrequency(frequency, ratio, this.currentProfile?.inharmonicity || 0) * detuneRatio;
      if (partialFreq >= this.sampleRate / 2) continue;

      const partialBuffer = this.generatePartial(frequency, partial.amplitude, duration, i);

      // 应用声像
      const pan = partial.pan ?? 0;
      const leftGain = pan <= 0 ? 1.0 : Math.max(0, 1 - pan);
      const rightGain = pan >= 0 ? 1.0 : Math.max(0, 1 + pan);

      for (let s = 0; s < samples; s++) {
        outL[s] += partialBuffer[s] * leftGain;
        outR[s] += partialBuffer[s] * rightGain;
      }
    }

    // 元音共振峰增强 (如果当前音色是元音)
    if (this.currentProfile?.name.startsWith('vowel')) {
      const vowelKey = this.currentProfile.name.split('_')[1] as string;
      const formants = VOWEL_FORMANTS[vowelKey];
      if (formants) {
        this.applyFormantFilter(outL, outR, frequency, formants);
      }
    }

    // 归一化防止削波
    normalizeBuffer(outL);
    normalizeBuffer(outR);

    return [outL, outR];
  }

  /**
   * 应用共振峰滤波器 (简化实现)
   * @param bufferL 左声道
   * @param bufferR 右声道
   * @param fundamental 基频
   * @param formants 共振峰频率
   */
  private applyFormantFilter(
    bufferL: Float32Array,
    bufferR: Float32Array,
    fundamental: number,
    formants: number[]
  ): void {
    // 简化的共振峰增强：根据各泛音接近共振峰的程度提升振幅
    for (let i = 0; i < this.partials.length; i++) {
      const partial = this.partials[i];
      if (!partial.enabled) continue;
      const pFreq = fundamental * partial.frequencyRatio;
      const gain = formantGain(pFreq, formants);
      partial.amplitude *= (1 + gain * 0.1);
    }
  }

  /**
   * 执行频谱变形
   * @param config 变形配置
   * @param frequency 基频
   * @returns 变形后的立体声缓冲区 [左, 右]
   */
  spectralMorph(config: SpectralMorphConfig, frequency: number): [Float32Array, Float32Array] {
    const { fromSpectrum, toSpectrum, duration, curve, tension = 0.5 } = config;
    const samples = Math.floor(duration * this.sampleRate);
    const outL = new Float32Array(samples);
    const outR = new Float32Array(samples);

    // 预计算变形曲线
    const morphSteps = DEFAULT_MORPH_STEPS;
    const stepDuration = duration / morphSteps;
    const stepSamples = Math.floor(stepDuration * this.sampleRate);

    for (let step = 0; step < morphSteps; step++) {
      const tRaw = step / (morphSteps - 1);
      let t = tRaw;

      switch (curve) {
        case 'exponential':
          t = t * t;
          break;
        case 'sine':
          t = (1 - Math.cos(t * Math.PI)) / 2;
          break;
        case 'logarithmic':
          t = Math.log10(1 + t * 9) / Math.log10(10);
          break;
        case 'linear':
        default:
          break;
      }

      t = lerp(tRaw, t, tension);

      // 插值频谱
      const currentSpectrum = new Float32Array(MAX_PARTIALS);
      for (let i = 0; i < MAX_PARTIALS; i++) {
        const fromAmp = i < fromSpectrum.length ? fromSpectrum[i] : 0;
        const toAmp = i < toSpectrum.length ? toSpectrum[i] : 0;
        currentSpectrum[i] = lerp(fromAmp, toAmp, t);
      }

      // 使用该频谱合成一个步进
      this.setAllPartialAmplitudes(Array.from(currentSpectrum));
      const [stepL, stepR] = this.synthesize(frequency, stepDuration);

      // 写入主缓冲区
      const startSample = step * stepSamples;
      for (let i = 0; i < stepSamples && startSample + i < samples; i++) {
        outL[startSample + i] = stepL[i];
        outR[startSample + i] = stepR[i];
      }
    }

    // 交叉淡化平滑步进边界
    const crossfadeSamples = Math.min(stepSamples / 4, 256);
    for (let step = 1; step < morphSteps; step++) {
      const boundary = step * stepSamples;
      for (let i = 0; i < crossfadeSamples && boundary + i < samples; i++) {
        const fade = i / crossfadeSamples;
        const prevIdx = boundary + i - stepSamples;
        if (prevIdx >= 0) {
          outL[boundary + i] = lerp(outL[prevIdx], outL[boundary + i], fade);
          outR[boundary + i] = lerp(outR[prevIdx], outR[boundary + i], fade);
        }
      }
    }

    normalizeBuffer(outL);
    normalizeBuffer(outR);

    return [outL, outR];
  }

  /**
   * 获取当前频谱状态
   * @returns 当前各泛音振幅数组
   */
  getCurrentSpectrum(): Float32Array {
    const spectrum = new Float32Array(MAX_PARTIALS);
    for (let i = 0; i < MAX_PARTIALS; i++) {
      spectrum[i] = this.partials[i].enabled ? this.partials[i].amplitude : 0;
    }
    return spectrum;
  }

  /**
   * 重置所有泛音到默认状态
   */
  reset(): void {
    for (let i = 0; i < MAX_PARTIALS; i++) {
      this.partials[i] = {
        index: i + 1,
        amplitude: i === 0 ? 1.0 : 0.0,
        frequencyRatio: i + 1,
        phase: 0,
        detune: 0,
        enabled: i < 16,
        pan: 0,
        fmIndex: 0,
      };
    }
    this.currentProfile = null;
    this.currentFrequency = DEFAULT_FREQUENCY;
  }
}

// ═══════════════════════════════════════════════════════════════
// SpectralEnvelope 类 - 频谱包络提取与应用
// ═══════════════════════════════════════════════════════════════

/**
 * 频谱包络类
 * 负责从音频信号中提取频谱包络，并将其应用到其他频谱上
 */
export class SpectralEnvelope {
  /** 采样率 */
  readonly sampleRate: number;

  /** FFT 大小 */
  fftSize: number;

  /** 提取的包络数据 */
  private envelopeData: Float32Array;

  /** 包络频率分度 */
  private envelopeFreqs: Float32Array;

  /**
   * 创建频谱包络提取器
   * @param sampleRate 采样率
   * @param fftSize FFT 大小 (默认 2048)
   */
  constructor(sampleRate: number = SAMPLE_RATE, fftSize: number = 2048) {
    this.sampleRate = sampleRate;
    this.fftSize = fftSize;
    this.envelopeData = new Float32Array(0);
    this.envelopeFreqs = new Float32Array(0);
  }

  /**
   * 从音频缓冲区提取频谱包络 (使用倒谱法近似)
   * @param buffer 单声道音频缓冲区
   * @returns 提取的包络振幅数组
   */
  extract(buffer: Float32Array): Float32Array {
    const hopSize = this.fftSize / 2;
    const numFrames = Math.floor((buffer.length - this.fftSize) / hopSize) + 1;
    const envelopeSum = new Float32Array(this.fftSize / 2);

    for (let f = 0; f < numFrames; f++) {
      const start = f * hopSize;
      const real = new Float32Array(this.fftSize);
      const imag = new Float32Array(this.fftSize);

      // 应用汉宁窗
      const window = hannWindow(this.fftSize);
      for (let i = 0; i < this.fftSize; i++) {
        real[i] = buffer[start + i] * window[i];
      }

      // FFT
      fft(real, imag, false);

      // 计算幅度谱
      for (let i = 0; i < this.fftSize / 2; i++) {
        const mag = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
        envelopeSum[i] += mag;
      }
    }

    // 平均并平滑
    const envelope = new Float32Array(this.fftSize / 2);
    for (let i = 0; i < this.fftSize / 2; i++) {
      envelope[i] = envelopeSum[i] / numFrames;
    }

    // 简单的移动平均平滑
    const smoothed = this.smoothEnvelope(envelope, 5);

    this.envelopeData = smoothed;
    this.envelopeFreqs = new Float32Array(smoothed.length);
    const freqResolution = this.sampleRate / this.fftSize;
    for (let i = 0; i < smoothed.length; i++) {
      this.envelopeFreqs[i] = i * freqResolution;
    }

    return smoothed;
  }

  /**
   * 平滑包络曲线
   * @param envelope 原始包络
   * @param windowSize 平滑窗口大小
   * @returns 平滑后的包络
   */
  private smoothEnvelope(envelope: Float32Array, windowSize: number): Float32Array {
    const result = new Float32Array(envelope.length);
    const halfWindow = Math.floor(windowSize / 2);

    for (let i = 0; i < envelope.length; i++) {
      let sum = 0;
      let count = 0;
      for (let j = -halfWindow; j <= halfWindow; j++) {
        const idx = clamp(i + j, 0, envelope.length - 1);
        sum += envelope[idx];
        count++;
      }
      result[i] = sum / count;
    }

    return result;
  }

  /**
   * 将提取的包络应用到目标频谱
   * @param targetSpectrum 目标幅度谱
   * @param strength 应用强度 (0-1)
   * @returns 处理后的频谱
   */
  apply(targetSpectrum: Float32Array, strength: number = 1.0): Float32Array {
    if (this.envelopeData.length === 0) {
      throw new Error('尚未提取包络，请先调用 extract()');
    }

    const result = new Float32Array(targetSpectrum.length);
    const envLen = this.envelopeData.length;

    for (let i = 0; i < targetSpectrum.length; i++) {
      const envIdx = Math.floor((i / targetSpectrum.length) * envLen);
      const envelopeValue = this.envelopeData[clamp(envIdx, 0, envLen - 1)];
      const targetValue = targetSpectrum[i];

      // 将目标频谱塑形为包络形状
      result[i] = lerp(targetValue, targetValue * envelopeValue, strength);
    }

    return result;
  }

  /**
   * 线性预测编码 (LPC) 近似提取包络
   * @param buffer 音频缓冲区
   * @param lpcOrder LPC 阶数
   * @returns 包络振幅数组
   */
  extractLPC(buffer: Float32Array, lpcOrder: number = 20): Float32Array {
    // 简化的自相关计算
    const autocorr = new Float32Array(lpcOrder + 1);
    for (let lag = 0; lag <= lpcOrder; lag++) {
      let sum = 0;
      for (let i = 0; i < buffer.length - lag; i++) {
        sum += buffer[i] * buffer[i + lag];
      }
      autocorr[lag] = sum;
    }

    // Levinson-Durbin 递归 (简化版)
    const lpcCoeffs = new Float32Array(lpcOrder);
    const error = new Float32Array(lpcOrder + 1);
    error[0] = autocorr[0];

    for (let i = 1; i <= lpcOrder; i++) {
      let lambda = 0;
      for (let j = 1; j < i; j++) {
        lambda += lpcCoeffs[j - 1] * autocorr[i - j];
      }
      lambda = (autocorr[i] - lambda) / error[i - 1];
      lpcCoeffs[i - 1] = lambda;

      for (let j = 1; j < i / 2; j++) {
        const temp = lpcCoeffs[j - 1];
        lpcCoeffs[j - 1] -= lambda * lpcCoeffs[i - j - 1];
        lpcCoeffs[i - j - 1] -= lambda * temp;
      }
      if (i > 1) {
        lpcCoeffs[Math.floor(i / 2) - 1] -= lambda * lpcCoeffs[Math.floor(i / 2) - 1];
      }

      error[i] = error[i - 1] * (1 - lambda * lambda);
    }

    // 从 LPC 系数计算频谱包络
    const numPoints = this.fftSize / 2;
    const envelope = new Float32Array(numPoints);
    for (let i = 0; i < numPoints; i++) {
      const freq = (i * Math.PI) / numPoints;
      let real = 1.0;
      let imag = 0.0;
      for (let j = 0; j < lpcOrder; j++) {
        real += lpcCoeffs[j] * Math.cos((j + 1) * freq);
        imag -= lpcCoeffs[j] * Math.sin((j + 1) * freq);
      }
      const mag = Math.sqrt(real * real + imag * imag);
      envelope[i] = 1.0 / Math.max(mag, 1e-10);
    }

    this.envelopeData = envelope;
    return envelope;
  }

  /**
   * 获取包络频率轴数据
   * @returns 频率数组 (Hz)
   */
  getFrequencies(): Float32Array {
    return new Float32Array(this.envelopeFreqs);
  }

  /**
   * 获取包络振幅数据
   * @returns 振幅数组
   */
  getAmplitudes(): Float32Array {
    return new Float32Array(this.envelopeData);
  }
}

// ═══════════════════════════════════════════════════════════════
// ResynthesisEngine 类 - 音频重合成引擎
// ═══════════════════════════════════════════════════════════════

/**
 * 重合成引擎类
 * 分析现有音频的时变频谱，并使用加法合成重新构建音频
 */
export class ResynthesisEngine {
  /** 采样率 */
  readonly sampleRate: number;

  /** FFT 大小 */
  fftSize: number;

  /** 跳步大小 */
  hopSize: number;

  /** 分析得到的频谱帧序列 */
  private frames: SpectralFrame[];

  /** 重合成使用的加法合成器 */
  private synth: AdditiveSynthesizer;

  /**
   * 创建重合成引擎
   * @param config 重合成配置
   * @param sampleRate 采样率
   */
  constructor(config?: Partial<ResynthesisConfig>, sampleRate: number = SAMPLE_RATE) {
    this.sampleRate = sampleRate;
    this.fftSize = config?.frameSize || 2048;
    this.hopSize = config?.hopSize || 512;
    this.frames = [];
    this.synth = new AdditiveSynthesizer(sampleRate);
  }

  /**
   * 分析音频缓冲区并提取频谱帧
   * @param buffer 单声道音频缓冲区
   * @param config 分析配置 (可选)
   */
  analyze(buffer: Float32Array, config?: Partial<ResynthesisConfig>): void {
    const frameSize = config?.frameSize || this.fftSize;
    const hop = config?.hopSize || this.hopSize;
    const peakCount = config?.peakCount || 64;
    const minFreq = config?.minFreq || 20;
    const maxFreq = config?.maxFreq || this.sampleRate / 2;
    const magThreshold = config?.magnitudeThreshold || 0.001;

    const numFrames = Math.floor((buffer.length - frameSize) / hop) + 1;
    this.frames = [];

    for (let f = 0; f < numFrames; f++) {
      const start = f * hop;
      const real = new Float32Array(frameSize);
      const imag = new Float32Array(frameSize);

      // 应用汉宁窗
      const window = hannWindow(frameSize);
      for (let i = 0; i < frameSize; i++) {
        real[i] = buffer[start + i] * window[i];
      }

      // FFT
      fft(real, imag, false);

      // 提取峰值
      const magnitudes = new Float32Array(frameSize / 2);
      const phases = new Float32Array(frameSize / 2);
      const freqs = new Float32Array(frameSize / 2);

      for (let i = 0; i < frameSize / 2; i++) {
        magnitudes[i] = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
        phases[i] = Math.atan2(imag[i], real[i]);
        freqs[i] = (i * this.sampleRate) / frameSize;
      }

      // 寻找峰值
      const peaks = this.findPeaks(magnitudes, freqs, peakCount, minFreq, maxFreq, magThreshold);

      this.frames.push({
        time: start / this.sampleRate,
        frequencies: new Float32Array(peaks.map((p) => p.freq)),
        amplitudes: new Float32Array(peaks.map((p) => p.amp)),
        phases: new Float32Array(peaks.map((p) => p.phase)),
      });
    }
  }

  /**
   * 在频谱中寻找峰值
   * @param magnitudes 幅度谱
   * @param freqs 频率轴
   * @param maxPeaks 最大峰值数
   * @param minFreq 最小频率
   * @param maxFreq 最大频率
   * @param threshold 幅度阈值
   * @returns 峰值数组
   */
  private findPeaks(
    magnitudes: Float32Array,
    freqs: Float32Array,
    maxPeaks: number,
    minFreq: number,
    maxFreq: number,
    threshold: number
  ): Array<{ freq: number; amp: number; phase: number }> {
    const peaks: Array<{ freq: number; amp: number; phase: number; bin: number }> = [];

    for (let i = 1; i < magnitudes.length - 1; i++) {
      const freq = freqs[i];
      if (freq < minFreq || freq > maxFreq) continue;
      if (magnitudes[i] < threshold) continue;

      // 局部峰值检测
      if (magnitudes[i] > magnitudes[i - 1] && magnitudes[i] > magnitudes[i + 1]) {
        // 抛物线插值精确定位峰值频率
        const alpha = magnitudes[i - 1];
        const beta = magnitudes[i];
        const gamma = magnitudes[i + 1];
        const p = 0.5 * (alpha - gamma) / (alpha - 2 * beta + gamma + 1e-10);
        const peakFreq = freq + p * (freqs[1] - freqs[0]);
        const peakAmp = beta - 0.25 * (alpha - gamma) * p;

        peaks.push({ freq: peakFreq, amp: peakAmp, phase: 0, bin: i });
      }
    }

    // 按幅度排序并取前 N 个
    peaks.sort((a, b) => b.amp - a.amp);
    const selected = peaks.slice(0, maxPeaks);
    selected.sort((a, b) => a.freq - b.freq);

    return selected.map((p) => ({ freq: p.freq, amp: p.amp, phase: p.phase }));
  }

  /**
   * 使用加法合成重新合成音频
   * @param duration 目标时长 (秒)，如果未指定则使用分析音频的时长
   * @returns 立体声缓冲区 [左, 右]
   */
  resynthesize(duration?: number): [Float32Array, Float32Array] {
    if (this.frames.length === 0) {
      throw new Error('尚未分析音频，请先调用 analyze()');
    }

    const totalDuration = duration || this.frames[this.frames.length - 1].time;
    const totalSamples = Math.floor(totalDuration * this.sampleRate);
    const outL = new Float32Array(totalSamples);
    const outR = new Float32Array(totalSamples);

    // 逐帧重合成
    for (let f = 0; f < this.frames.length - 1; f++) {
      const frame = this.frames[f];
      const nextFrame = this.frames[f + 1];
      const frameStartSample = Math.floor(frame.time * this.sampleRate);
      const nextFrameStartSample = Math.floor(nextFrame.time * this.sampleRate);
      const frameSamples = nextFrameStartSample - frameStartSample;

      if (frameSamples <= 0) continue;

      // 在该帧内使用正弦波叠加
      for (let p = 0; p < frame.frequencies.length; p++) {
        const freq = frame.frequencies[p];
        const amp = frame.amplitudes[p];
        const phase = frame.phases[p];

        // 插值到下一帧的频率和振幅
        const nextFreq = nextFrame.frequencies[p] || freq;
        const nextAmp = nextFrame.amplitudes[p] || amp;

        for (let i = 0; i < frameSamples; i++) {
          const t = i / frameSamples;
          const currentFreq = lerp(freq, nextFreq, t);
          const currentAmp = lerp(amp, nextAmp, t);
          const sampleIdx = frameStartSample + i;
          if (sampleIdx >= totalSamples) break;

          const omega = (2 * Math.PI * currentFreq) / this.sampleRate;
          const sample = Math.sin(omega * i + phase) * currentAmp;
          outL[sampleIdx] += sample;
          outR[sampleIdx] += sample;
        }
      }
    }

    normalizeBuffer(outL);
    normalizeBuffer(outR);

    return [outL, outR];
  }

  /**
   * 获取分析得到的频谱帧
   * @returns 频谱帧数组
   */
  getFrames(): SpectralFrame[] {
    return this.frames.map((f) => ({
      time: f.time,
      frequencies: new Float32Array(f.frequencies),
      amplitudes: new Float32Array(f.amplitudes),
      phases: new Float32Array(f.phases),
    }));
  }

  /**
   * 获取某一时刻的频谱帧
   * @param time 时间 (秒)
   * @returns 最近的频谱帧
   */
  getFrameAtTime(time: number): SpectralFrame | null {
    if (this.frames.length === 0) return null;

    let closest = this.frames[0];
    let minDiff = Math.abs(time - closest.time);

    for (const frame of this.frames) {
      const diff = Math.abs(time - frame.time);
      if (diff < minDiff) {
        minDiff = diff;
        closest = frame;
      }
    }

    return {
      time: closest.time,
      frequencies: new Float32Array(closest.frequencies),
      amplitudes: new Float32Array(closest.amplitudes),
      phases: new Float32Array(closest.phases),
    };
  }

  /**
   * 修改特定帧的振幅
   * @param frameIndex 帧索引
   * @param partialIndex 泛音索引
   * @param amplitude 新振幅
   */
  setFrameAmplitude(frameIndex: number, partialIndex: number, amplitude: number): void {
    if (frameIndex < 0 || frameIndex >= this.frames.length) return;
    const frame = this.frames[frameIndex];
    if (partialIndex < 0 || partialIndex >= frame.amplitudes.length) return;
    frame.amplitudes[partialIndex] = clamp(amplitude, 0, 1);
  }

  /**
   * 重置引擎状态
   */
  reset(): void {
    this.frames = [];
    this.synth.reset();
  }
}

// ═══════════════════════════════════════════════════════════════
// 扩展内置音色与工具
// ═══════════════════════════════════════════════════════════════

/**
 * 元音 "e" 音色预设
 * 第二共振峰显著高于 "a"
 */
export const VOWEL_E_PRESET: TimbreProfile = {
  name: 'vowel_e',
  partialAmplitudes: [1.0, 0.6, 0.35, 0.2, 0.12, 0.08, 0.05, 0.03],
  envelope: {
    attack: 0.04,
    decay: 0.12,
    sustain: 0.88,
    release: 0.18,
    attackCurve: 'linear',
    decayCurve: 'exponential',
    releaseCurve: 'exponential',
  },
  brightness: 0.5,
  detuneSpread: 4.0,
  inharmonicity: 0.002,
  stereoWidth: 0.25,
};

/**
 * 元音 "i" 音色预设
 * 低频能量弱，高频共振峰强
 */
export const VOWEL_I_PRESET: TimbreProfile = {
  name: 'vowel_i',
  partialAmplitudes: [0.8, 0.5, 0.9, 0.6, 0.3, 0.15, 0.08, 0.04],
  envelope: {
    attack: 0.03,
    decay: 0.1,
    sustain: 0.9,
    release: 0.15,
    attackCurve: 'linear',
    decayCurve: 'exponential',
    releaseCurve: 'exponential',
  },
  brightness: 0.7,
  detuneSpread: 3.5,
  inharmonicity: 0.002,
  stereoWidth: 0.2,
};

/**
 * 元音 "o" 音色预设
 */
export const VOWEL_O_PRESET: TimbreProfile = {
  name: 'vowel_o',
  partialAmplitudes: [1.0, 0.45, 0.2, 0.15, 0.12, 0.1, 0.06, 0.03],
  envelope: {
    attack: 0.06,
    decay: 0.14,
    sustain: 0.85,
    release: 0.22,
    attackCurve: 'cosine',
    decayCurve: 'exponential',
    releaseCurve: 'exponential',
  },
  brightness: 0.3,
  detuneSpread: 5.5,
  inharmonicity: 0.002,
  stereoWidth: 0.35,
};

/**
 * 元音 "u" 音色预设
 * 低频集中，高频迅速衰减
 */
export const VOWEL_U_PRESET: TimbreProfile = {
  name: 'vowel_u',
  partialAmplitudes: [1.0, 0.35, 0.15, 0.08, 0.04, 0.02, 0.01, 0.005],
  envelope: {
    attack: 0.07,
    decay: 0.16,
    sustain: 0.82,
    release: 0.25,
    attackCurve: 'cosine',
    decayCurve: 'exponential',
    releaseCurve: 'exponential',
  },
  brightness: 0.2,
  detuneSpread: 6.0,
  inharmonicity: 0.002,
  stereoWidth: 0.15,
};

// 注册额外元音预设到内置映射
BUILT_IN_PRESETS.set('vowel_e', VOWEL_E_PRESET);
BUILT_IN_PRESETS.set('vowel_i', VOWEL_I_PRESET);
BUILT_IN_PRESETS.set('vowel_o', VOWEL_O_PRESET);
BUILT_IN_PRESETS.set('vowel_u', VOWEL_U_PRESET);

/**
 * 生成渐变音色序列
 * 在两种音色轮廓之间生成中间状态，用于动态音色变换
 * @param profileA 起始音色
 * @param profileB 目标音色
 * @param steps 中间步数
 * @returns 音色轮廓数组
 */
export function generateTimbreSequence(
  profileA: TimbreProfile,
  profileB: TimbreProfile,
  steps: number
): TimbreProfile[] {
  const sequence: TimbreProfile[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const maxPartials = Math.max(profileA.partialAmplitudes.length, profileB.partialAmplitudes.length);
    const amplitudes: number[] = [];

    for (let p = 0; p < maxPartials; p++) {
      const ampA = p < profileA.partialAmplitudes.length ? profileA.partialAmplitudes[p] : 0;
      const ampB = p < profileB.partialAmplitudes.length ? profileB.partialAmplitudes[p] : 0;
      amplitudes.push(lerp(ampA, ampB, t));
    }

    sequence.push({
      name: `${profileA.name}_to_${profileB.name}_${i}`,
      partialAmplitudes: amplitudes,
      envelope: {
        attack: lerp(profileA.envelope.attack, profileB.envelope.attack, t),
        decay: lerp(profileA.envelope.decay, profileB.envelope.decay, t),
        sustain: lerp(profileA.envelope.sustain, profileB.envelope.sustain, t),
        release: lerp(profileA.envelope.release, profileB.envelope.release, t),
      },
      brightness: lerp(profileA.brightness ?? 0.5, profileB.brightness ?? 0.5, t),
      detuneSpread: lerp(profileA.detuneSpread ?? 0, profileB.detuneSpread ?? 0, t),
      inharmonicity: lerp(profileA.inharmonicity ?? 0, profileB.inharmonicity ?? 0, t),
      stereoWidth: lerp(profileA.stereoWidth ?? 0.5, profileB.stereoWidth ?? 0.5, t),
    });
  }
  return sequence;
}

/**
 * 计算两个频谱之间的频谱距离 (欧氏距离)
 * @param spectrumA 频谱 A
 * @param spectrumB 频谱 B
 * @returns 距离值
 */
export function spectralDistance(spectrumA: Float32Array, spectrumB: Float32Array): number {
  const len = Math.min(spectrumA.length, spectrumB.length);
  let sum = 0;
  for (let i = 0; i < len; i++) {
    const diff = spectrumA[i] - spectrumB[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

/**
 * 平滑频谱过渡
 * 对频谱序列应用时间平滑，减少突变
 * @param spectra 频谱数组
 * @param windowSize 平滑窗口大小
 * @returns 平滑后的频谱数组
 */
export function smoothSpectra(spectra: Float32Array[], windowSize: number = 3): Float32Array[] {
  if (spectra.length === 0) return [];
  const result: Float32Array[] = [];
  const half = Math.floor(windowSize / 2);

  for (let i = 0; i < spectra.length; i++) {
    const smoothed = new Float32Array(spectra[i].length);
    for (let bin = 0; bin < spectra[i].length; bin++) {
      let sum = 0;
      let count = 0;
      for (let w = -half; w <= half; w++) {
        const idx = clamp(i + w, 0, spectra.length - 1);
        sum += spectra[idx][bin];
        count++;
      }
      smoothed[bin] = sum / count;
    }
    result.push(smoothed);
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════
// 默认导出
// ═══════════════════════════════════════════════════════════════

export default AdditiveSynthesizer;
