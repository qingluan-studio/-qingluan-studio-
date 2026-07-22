/**
 * @fileoverview 青鸾数字音频工作站 - 音频分析核心模块
 * 提供频谱分析、响度测量、立体声分析、节奏检测、基频检测等
 * 全功能音频分析能力，支持实时与离线两种模式。
 *
 * @module analysis/audioAnalyzer
 * @version 2.0.0
 * @author 青鸾工作室
 */

import { clamp, lerp, fft, hannWindow, dbToGain, gainToDb } from '../utils/audioUtils.js';

// ============================================================================
// 全局常量与类型定义
// ============================================================================

/** 标准采样率：44.1kHz (CD音质标准) */
export const SAMPLE_RATE = 44100;

/** 标准满刻度dB值 */
export const FULL_SCALE_DB = 0;

/** 最小可听dB值 (人类听觉阈值近似) */
export const MIN_AUDIBLE_DB = -90;

/** LUFS 响度计量中的相对门限值 (单位: LUFS) */
export const LOUDNESS_RELATIVE_GATE = -70;

/** LUFS 响度计量中的绝对门限值 (单位: LUFS) */
export const LOUDNESS_ABSOLUTE_GATE = -69;

/** 真峰值检测过采样倍数 (4x 过采样) */
export const TRUE_PEAK_OVERSAMPLE = 4;

/** ITU-R BS.1770-4 预滤波器高通截止频率近似参数 */
export const PRE_FILTER_HIGHPASS_FREQ = 4.0;

/** 用于自相关基频检测的最低频率阈值 (Hz) */
export const MIN_PITCH_FREQ = 20;

/** 用于自相关基频检测的最高频率阈值 (Hz) */
export const MAX_PITCH_FREQ = 8000;

/** 过零率检测的典型阈值 */
export const ZERO_CROSSING_THRESHOLD = 0.0;

/** 示波器默认每帧采样数 */
export const OSCILLOSCOPE_DEFAULT_POINTS = 2048;

/** 示波器触发阈值 */
export const OSCILLOSCOPE_TRIGGER_LEVEL = 0.01;

/**
 * 频谱分析结果接口
 */
export interface SpectrumData {
  /** 各频点幅值 (线性或dB) */
  magnitude: Float32Array;
  /** 各频点相位 (弧度) */
  phase: Float32Array;
  /** 频点对应的频率值 (Hz) */
  frequencies: Float32Array;
  /** FFT 尺寸 */
  fftSize: number;
  /** 采样率 */
  sampleRate: number;
}

/**
 * 语谱图结果接口
 */
export interface SpectrogramData {
  /** 时频矩阵，行为时间帧，列为频率bin */
  magnitude: Float32Array[];
  /** 时间轴 (秒) */
  times: Float32Array;
  /** 频率轴 (Hz) */
  frequencies: Float32Array;
  /** 窗长 */
  windowSize: number;
  /**  hop size */
  hopSize: number;
}

/**
 * 响度分析结果接口 (LUFS)
 */
export interface LoudnessData {
  /** 整体响度 (LUFS) */
  integrated: number;
  /** 短期响度 (3秒窗口) */
  shortTerm: number;
  /** 瞬时响度 (400ms窗口) */
  momentary: number;
  /** 响度范围 (LRA) */
  range: number;
  /** 真峰值 (dBTP) */
  truePeak: number;
}

/**
 * 相位相关分析结果接口
 */
export interface PhaseCorrelationData {
  /** 整体相位相关系数 [-1, 1] */
  correlation: number;
  /** 随时间变化的相位相关序列 */
  correlationOverTime: Float32Array;
  /** 建议的立体声平衡调整 */
  balanceSuggestion: string;
}

/**
 * 立体声宽度分析结果接口
 */
export interface StereoWidthData {
  /** 立体声宽度指数 [0, 1] */
  width: number;
  /** 中声道能量 */
  midEnergy: number;
  /** 侧声道能量 */
  sideEnergy: number;
  /** 中侧比 (dB) */
  midSideRatioDb: number;
}

/**
 * 动态范围分析结果接口
 */
export interface DynamicRangeData {
  /** 动态范围 (dB) */
  rangeDb: number;
  /** 峰值电平 (dBFS) */
  peakDb: number;
  /** RMS 电平 (dBFS) */
  rmsDb: number;
}

/**
 * 波峰因数分析结果接口
 */
export interface CrestFactorData {
  /** 波峰因数 (峰值/RMS) */
  crestFactor: number;
  /** 峰值电平 (dBFS) */
  peakDb: number;
  /** RMS 电平 (dBFS) */
  rmsDb: number;
}

/**
 * 频谱特征结果接口
 */
export interface SpectralFeatures {
  /** 频谱质心 (Spectral Centroid) */
  centroid: number;
  /** 频谱扩散 (Spectral Spread) */
  spread: number;
  /** 频谱平坦度 (Spectral Flatness) */
  flatness: number;
  /** 频谱滚降点 (Hz) */
  rolloff: number;
}

/**
 * 过零率分析结果接口
 */
export interface ZeroCrossingData {
  /** 平均过零率 (每秒) */
  rate: number;
  /** 逐帧过零率序列 */
  frames: Float32Array;
}

/**
 * BPM 检测结果接口
 */
export interface TempoData {
  /** 检测到的 BPM */
  bpm: number;
  /** 置信度 [0, 1] */
  confidence: number;
  /** 节拍位置序列 (秒) */
  beats: number[];
  /** 多候选 BPM 列表 */
  candidates: { bpm: number; strength: number }[];
}

/**
 * 基频检测结果接口
 */
export interface PitchData {
  /** 检测到的基频 (Hz) */
  frequency: number;
  /** 对应的 MIDI 音符编号 */
  midiNote: number;
  /** 音名 */
  noteName: string;
  /** 检测置信度 [0, 1] */
  confidence: number;
  /** 谐波序列 (Hz) */
  harmonics: number[];
}

/**
 * 谐波分析结果接口
 */
export interface HarmonicData {
  /** 基频 (Hz) */
  fundamental: number;
  /** 各次谐波幅值 */
  harmonicAmplitudes: Float32Array;
  /** 谐波失真率 THD (%) */
  thd: number;
  /** 噪声电平 */
  noiseLevel: number;
  /** 谐波丰富度指数 */
  richness: number;
}

/**
 * 波形显示数据接口
 */
export interface WaveformData {
  /** 最小值序列 (用于绘制下包络) */
  min: Float32Array;
  /** 最大值序列 (用于绘制上包络) */
  max: Float32Array;
  /** RMS 序列 */
  rms: Float32Array;
}

/**
 * 峰值显示数据接口 (用于 Canvas 绘制)
 */
export interface PeaksDisplayData {
  /** 每像素列的峰值上包络 */
  peaksPositive: Float32Array;
  /** 每像素列的峰值下包络 */
  peaksNegative: Float32Array;
  /** 每像素列的 RMS */
  peaksRms: Float32Array;
  /** 像素宽度 */
  width: number;
  /** 像素高度 */
  height: number;
}

// ============================================================================
// AudioAnalyzer - 音频分析主类
// ============================================================================

/**
 * 音频分析主类，提供全面的音频信号分析功能。
 *
 * 此类为青鸾数字音频工作站的核心分析引擎，支持频谱、响度、立体声、
 * 动态范围、节奏、音高及谐波分析。所有方法均为纯函数（除内部缓存外
 * 无副作用），可安全用于 Web Worker 或主线程。
 *
 * @example
 * ```ts
 * const analyzer = new AudioAnalyzer();
 * const spectrum = analyzer.analyzeSpectrum(buffer, 2048);
 * const loudness = analyzer.analyzeLoudness(buffer);
 * ```
 */
export class AudioAnalyzer {
  /** 内部 FFT 复数实部缓存 */
  private _fftReal: Float32Array;
  /** 内部 FFT 复数虚部缓存 */
  private _fftImag: Float32Array;
  /** 内部窗函数缓存 */
  private _window: Float32Array;
  /** 缓存当前 FFT 尺寸 */
  private _cachedFftSize: number;
  /** 用于真峰值分析的过采样缓存 */
  private _oversampleBuffer: Float32Array;

  /**
   * 构造 AudioAnalyzer 实例，初始化内部缓存。
   */
  constructor() {
    this._cachedFftSize = 2048;
    this._fftReal = new Float32Array(this._cachedFftSize);
    this._fftImag = new Float32Array(this._cachedFftSize);
    this._window = hannWindow(this._cachedFftSize);
    this._oversampleBuffer = new Float32Array(this._cachedFftSize * TRUE_PEAK_OVERSAMPLE);
  }

  /**
   * 确保内部缓存足够容纳指定 FFT 尺寸。
   *
   * @param size - 需要的 FFT 尺寸（必须为2的幂）
   */
  private _ensureFftSize(size: number): void {
    if (size !== this._cachedFftSize) {
      this._cachedFftSize = size;
      this._fftReal = new Float32Array(size);
      this._fftImag = new Float32Array(size);
      this._window = hannWindow(size);
      this._oversampleBuffer = new Float32Array(size * TRUE_PEAK_OVERSAMPLE);
    }
  }

  /**
   * 将 FFT 复数结果转换为幅值与相位。
   *
   * @param real - 实部数组
   * @param imag - 虚部数组
   * @param magnitude - 输出幅值数组 (长度 size/2)
   * @param phase - 输出相位数组 (长度 size/2)
   */
  private _computeMagnitudeAndPhase(
    real: Float32Array,
    imag: Float32Array,
    magnitude: Float32Array,
    phase: Float32Array
  ): void {
    const n = real.length;
    const half = n >> 1;
    for (let i = 0; i < half; i++) {
      const re = real[i];
      const im = imag[i];
      magnitude[i] = Math.sqrt(re * re + im * im);
      phase[i] = Math.atan2(im, re);
    }
  }

  /**
   * 对输入缓冲区进行快速傅里叶变换 (FFT) 频谱分析。
   *
   * 使用 Cooley-Tukey FFT 算法，配合汉宁窗以减少频谱泄漏。
   * 返回包含幅值、相位及对应频率的完整频谱数据。
   *
   * @param buffer - 输入音频采样数据，范围 [-1, 1]
   * @param fftSize - FFT 分析窗口大小，必须为 2 的幂（推荐 256~8192）
   * @returns {SpectrumData} 频谱分析结果对象
   *
   * @example
   * ```ts
   * const buffer = new Float32Array([...]);
   * const spec = analyzer.analyzeSpectrum(buffer, 2048);
   * console.log(spec.magnitude);
   * ```
   */
  analyzeSpectrum(buffer: Float32Array, fftSize: number): SpectrumData {
    // 验证并调整 FFT 尺寸为 2 的幂
    let size = 1;
    while (size < fftSize) size <<= 1;
    this._ensureFftSize(size);

    // 将输入数据复制到实部缓存，并施加汉宁窗
    const real = this._fftReal;
    const imag = this._fftImag;
    const win = this._window;
    const len = Math.min(buffer.length, size);

    for (let i = 0; i < size; i++) {
      if (i < len) {
        real[i] = buffer[i] * win[i];
      } else {
        real[i] = 0;
      }
      imag[i] = 0;
    }

    // 执行 FFT（正向变换）
    fft(real, imag, false);

    // 计算幅值与相位（仅取前半部分，后半为共轭对称）
    const half = size >> 1;
    const magnitude = new Float32Array(half);
    const phase = new Float32Array(half);
    this._computeMagnitudeAndPhase(real, imag, magnitude, phase);

    // 构建频率轴
    const frequencies = new Float32Array(half);
    const freqStep = SAMPLE_RATE / size;
    for (let i = 0; i < half; i++) {
      frequencies[i] = i * freqStep;
    }

    return {
      magnitude,
      phase,
      frequencies,
      fftSize: size,
      sampleRate: SAMPLE_RATE,
    };
  }

  /**
   * 计算语谱图 (Spectrogram)，展示信号随时间变化的频谱分布。
   *
   * 通过对输入信号进行分帧、加窗、FFT，得到二维时频表示。
   * 常用于可视化音频的频谱演变，例如识别乐器起音或共振峰变化。
   *
   * @param buffer - 输入音频采样数据
   * @param windowSize - 每帧 FFT 尺寸（必须为 2 的幂）
   * @param hopSize - 帧移（hop size），通常取 windowSize/4
   * @returns {SpectrogramData} 语谱图数据对象
   *
   * @example
   * ```ts
   * const spec = analyzer.analyzeSpectrogram(buffer, 2048, 512);
   * // spec.magnitude[frameIndex][freqBin]
   * ```
   */
  analyzeSpectrogram(buffer: Float32Array, windowSize: number, hopSize: number): SpectrogramData {
    // 确保窗口尺寸为 2 的幂
    let size = 1;
    while (size < windowSize) size <<= 1;

    const win = hannWindow(size);
    const half = size >> 1;
    const numFrames = Math.floor((buffer.length - size) / hopSize) + 1;
    const magnitudeFrames: Float32Array[] = [];
    const times = new Float32Array(numFrames);

    // 临时 FFT 缓冲区
    const real = new Float32Array(size);
    const imag = new Float32Array(size);

    for (let frame = 0; frame < numFrames; frame++) {
      const start = frame * hopSize;
      for (let i = 0; i < size; i++) {
        if (start + i < buffer.length) {
          real[i] = buffer[start + i] * win[i];
        } else {
          real[i] = 0;
        }
        imag[i] = 0;
      }

      fft(real, imag, false);

      const frameMag = new Float32Array(half);
      for (let i = 0; i < half; i++) {
        const re = real[i];
        const im = imag[i];
        frameMag[i] = Math.sqrt(re * re + im * im);
      }
      magnitudeFrames.push(frameMag);
      times[frame] = start / SAMPLE_RATE;
    }

    // 构建频率轴
    const frequencies = new Float32Array(half);
    const freqStep = SAMPLE_RATE / size;
    for (let i = 0; i < half; i++) {
      frequencies[i] = i * freqStep;
    }

    return {
      magnitude: magnitudeFrames,
      times,
      frequencies,
      windowSize: size,
      hopSize,
    };
  }

  /**
   * 计算音频的 LUFS 响度（ITU-R BS.1770-4 简化实现）。
   *
   * 该实现包含以下步骤：
   * 1. 应用预滤波（高通 + 高频提升近似）
   * 2. 按 400ms/3s 窗口计算均方响度
   * 3. 应用相对门限 (-70 LUFS) 与绝对门限 (-69 LUFS)
   * 4. 计算综合响度、短期响度、瞬时响度及响度范围 (LRA)
   *
   * 注意：此为简化版，省略了完整的多级 IIR 预滤波器组，
   * 使用单级高通近似代替，适合 DAW 实时显示。
   *
   * @param buffer - 输入音频采样数据（单声道）
   * @returns {LoudnessData} 响度分析结果
   */
  analyzeLoudness(buffer: Float32Array): LoudnessData {
    // 简化预滤波：单极点高通滤波器（近似 K 加权预滤波的低频部分）
    // 以及一阶高频 shelf 提升近似
    const filtered = this._applyPreFilter(buffer);

    // 计算均方值序列（块大小对应 400ms = 0.4 * 44100 = 17640 采样）
    const blockSize = Math.floor(0.4 * SAMPLE_RATE);
    const numBlocks = Math.floor(filtered.length / blockSize);
    const loudnessBlocks: number[] = [];

    for (let i = 0; i < numBlocks; i++) {
      let sum = 0;
      for (let j = 0; j < blockSize; j++) {
        const sample = filtered[i * blockSize + j];
        sum += sample * sample;
      }
      const meanSquare = sum / blockSize;
      // LUFS 块响度 = -0.691 + 10 * log10(meanSquare)
      // 这里的 -0.691 dB 是 ITU 标准中的校准常数
      const blockLoudness = -0.691 + 10 * Math.log10(Math.max(meanSquare, 1e-12));
      loudnessBlocks.push(blockLoudness);
    }

    if (loudnessBlocks.length === 0) {
      return {
        integrated: MIN_AUDIBLE_DB,
        shortTerm: MIN_AUDIBLE_DB,
        momentary: MIN_AUDIBLE_DB,
        range: 0,
        truePeak: MIN_AUDIBLE_DB,
      };
    }

    // 绝对门限：-69 LUFS
    const absoluteGated = loudnessBlocks.filter((l) => l > LOUDNESS_ABSOLUTE_GATE);
    if (absoluteGated.length === 0) {
      return {
        integrated: MIN_AUDIBLE_DB,
        shortTerm: MIN_AUDIBLE_DB,
        momentary: MIN_AUDIBLE_DB,
        range: 0,
        truePeak: MIN_AUDIBLE_DB,
      };
    }

    // 计算相对门限： gated blocks 的平均值 - 10 dB
    const avgPreliminary = absoluteGated.reduce((a, b) => a + b, 0) / absoluteGated.length;
    const relativeGate = avgPreliminary - 10;

    // 综合响度：通过相对门限后的 blocks 取平均
    const relativeGated = absoluteGated.filter((l) => l > relativeGate);
    const integrated =
      relativeGated.length > 0
        ? relativeGated.reduce((a, b) => a + b, 0) / relativeGated.length
        : avgPreliminary;

    // 瞬时响度 (400ms 窗口)：取最后一个 block
    const momentary = loudnessBlocks[loudnessBlocks.length - 1];

    // 短期响度 (3s 窗口 = 7.5 个 400ms block)
    const shortBlocks = 7; // 近似 2.8s
    let shortTerm = momentary;
    if (loudnessBlocks.length >= shortBlocks) {
      let sum = 0;
      for (let i = loudnessBlocks.length - shortBlocks; i < loudnessBlocks.length; i++) {
        sum += Math.pow(10, loudnessBlocks[i] / 10);
      }
      shortTerm = 10 * Math.log10(sum / shortBlocks);
    }

    // 响度范围 (LRA)：取相对门限后 block 响度的 10th 与 95th 百分位差
    const sorted = [...relativeGated].sort((a, b) => a - b);
    const p10Index = Math.floor(sorted.length * 0.1);
    const p95Index = Math.floor(sorted.length * 0.95);
    const lra = sorted[p95Index] - sorted[p10Index];

    // 真峰值
    const tp = this.analyzeTruePeak(buffer);

    return {
      integrated: integrated,
      shortTerm: shortTerm,
      momentary: momentary,
      range: lra,
      truePeak: tp,
    };
  }

  /**
   * 应用 ITU-R BS.1770-4 简化预滤波器。
   *
   * 使用一阶高通 + 一阶高频 shelf 近似 K 加权曲线。
   *
   * @param buffer - 输入音频采样
   * @returns {Float32Array} 滤波后的音频采样
   */
  private _applyPreFilter(buffer: Float32Array): Float32Array {
    const out = new Float32Array(buffer.length);
    // 一阶高通近似：y[n] = x[n] - x[n-1] + (1 - fc) * y[n-1]
    // 其中 fc = 2 * pi * 4 / 44100 ≈ 0.00057
    const fc = (2 * Math.PI * PRE_FILTER_HIGHPASS_FREQ) / SAMPLE_RATE;
    const a1 = 1 - fc;
    let yPrev = 0;
    let xPrev = 0;

    for (let i = 0; i < buffer.length; i++) {
      const x = buffer[i];
      const y = x - xPrev + a1 * yPrev;
      out[i] = y;
      yPrev = y;
      xPrev = x;
    }

    // 高频 shelf 近似 (+4dB @ ~1500Hz)
    // 简化为一阶差分混合：增强高频
    const shelfAlpha = 0.12; // 经验值，近似 4dB 提升
    for (let i = buffer.length - 1; i > 0; i--) {
      const diff = out[i] - out[i - 1];
      out[i] = out[i] + shelfAlpha * diff;
    }

    return out;
  }

  /**
   * 真峰值 (True Peak) 检测，使用 4x 过采样。
   *
   * 真峰值考虑了模拟信号在采样点之间的实际峰值，
   * 比数字采样峰值更能反映实际过载风险，是母带处理的关键指标。
   *
   * 过采样方法：在每两个采样点之间插入 3 个新采样点，
   * 使用简单的线性插值 + 低通平滑（三角形滤波器）近似重建。
   *
   * @param buffer - 输入音频采样数据
   * @returns {number} 真峰值电平 (dBTP)
   */
  analyzeTruePeak(buffer: Float32Array): number {
    const oversample = TRUE_PEAK_OVERSAMPLE;
    const outLen = buffer.length * oversample;

    if (this._oversampleBuffer.length < outLen) {
      this._oversampleBuffer = new Float32Array(outLen);
    }
    const out = this._oversampleBuffer.subarray(0, outLen);

    // 线性插值上采样
    for (let i = 0; i < buffer.length - 1; i++) {
      const a = buffer[i];
      const b = buffer[i + 1];
      for (let j = 0; j < oversample; j++) {
        const t = j / oversample;
        out[i * oversample + j] = a + (b - a) * t;
      }
    }
    // 复制最后一个采样点
    const last = buffer[buffer.length - 1] ?? 0;
    for (let j = 0; j < oversample; j++) {
      out[(buffer.length - 1) * oversample + j] = last;
    }

    // 简单三角形平滑（近似抗镜像滤波器）
    const smoothed = new Float32Array(outLen);
    smoothed[0] = out[0];
    for (let i = 1; i < outLen - 1; i++) {
      smoothed[i] = (out[i - 1] + 2 * out[i] + out[i + 1]) * 0.25;
    }
    smoothed[outLen - 1] = out[outLen - 1];

    // 查找绝对峰值
    let maxAbs = 0;
    for (let i = 0; i < outLen; i++) {
      const abs = Math.abs(smoothed[i]);
      if (abs > maxAbs) maxAbs = abs;
    }

    return 20 * Math.log10(Math.max(maxAbs, 1e-12));
  }

  /**
   * 分析左右声道的相位相关性。
   *
   * 相位相关用于判断立体声信号的单声道兼容性。
   * 系数为 +1 表示完全同相，0 表示无相关，-1 表示完全反相。
   * 反相信号在合并为单声道时会产生抵消，导致音色劣化。
   *
   * @param left - 左声道采样数据
   * @param right - 右声道采样数据
   * @returns {PhaseCorrelationData} 相位相关分析结果
   */
  analyzePhaseCorrelation(left: Float32Array, right: Float32Array): PhaseCorrelationData {
    const length = Math.min(left.length, right.length);
    if (length === 0) {
      return {
        correlation: 0,
        correlationOverTime: new Float32Array(0),
        balanceSuggestion: '无数据',
      };
    }

    // 逐采样点相关系数
    let sumL = 0;
    let sumR = 0;
    let sumLR = 0;
    let sumL2 = 0;
    let sumR2 = 0;

    for (let i = 0; i < length; i++) {
      const l = left[i];
      const r = right[i];
      sumL += l;
      sumR += r;
      sumLR += l * r;
      sumL2 += l * l;
      sumR2 += r * r;
    }

    const meanL = sumL / length;
    const meanR = sumR / length;
    const cov = sumLR / length - meanL * meanR;
    const varL = sumL2 / length - meanL * meanL;
    const varR = sumR2 / length - meanR * meanR;
    const denom = Math.sqrt(varL * varR);
    const correlation = denom > 1e-12 ? cov / denom : 0;

    // 分帧计算随时间变化的相关性（每帧约 100ms）
    const frameSize = Math.floor(0.1 * SAMPLE_RATE);
    const numFrames = Math.floor(length / frameSize);
    const correlationOverTime = new Float32Array(numFrames);

    for (let f = 0; f < numFrames; f++) {
      let sL = 0,
        sR = 0,
        sLR = 0,
        sL2 = 0,
        sR2 = 0;
      for (let i = 0; i < frameSize; i++) {
        const idx = f * frameSize + i;
        const l = left[idx];
        const r = right[idx];
        sL += l;
        sR += r;
        sLR += l * r;
        sL2 += l * l;
        sR2 += r * r;
      }
      const mL = sL / frameSize;
      const mR = sR / frameSize;
      const c = sLR / frameSize - mL * mR;
      const vL = sL2 / frameSize - mL * mL;
      const vR = sR2 / frameSize - mR * mR;
      const d = Math.sqrt(vL * vR);
      correlationOverTime[f] = d > 1e-12 ? c / d : 0;
    }

    let suggestion = '相位良好';
    if (correlation < -0.5) suggestion = '严重反相：合并单声道将大幅抵消';
    else if (correlation < 0) suggestion = '存在反相成分，建议检查';
    else if (correlation < 0.3) suggestion = '相关性弱，立体声场宽阔但单声道兼容性一般';

    return {
      correlation,
      correlationOverTime,
      balanceSuggestion: suggestion,
    };
  }

  /**
   * 分析立体声宽度。
   *
   * 将 L/R 转换为 M/S (Mid/Side) 表示：
   *   Mid = (L + R) / 2
   *   Side = (L - R) / 2
   * 立体声宽度由 Side 与 Mid 的能量比决定。
   *
   * @param left - 左声道采样数据
   * @param right - 右声道采样数据
   * @returns {StereoWidthData} 立体声宽度分析结果
   */
  analyzeStereoWidth(left: Float32Array, right: Float32Array): StereoWidthData {
    const length = Math.min(left.length, right.length);
    let sumMid = 0;
    let sumSide = 0;

    for (let i = 0; i < length; i++) {
      const mid = (left[i] + right[i]) * 0.5;
      const side = (left[i] - right[i]) * 0.5;
      sumMid += mid * mid;
      sumSide += side * side;
    }

    const midEnergy = sumMid / length;
    const sideEnergy = sumSide / length;
    const total = midEnergy + sideEnergy;

    // 宽度指数：side 能量占总能量的比例
    const width = total > 1e-12 ? sideEnergy / total : 0;

    // 中侧比 (dB)
    const midSideRatioDb =
      midEnergy > 1e-12 && sideEnergy > 1e-12
        ? 10 * Math.log10(sideEnergy / midEnergy)
        : 0;

    return {
      width: clamp(width, 0, 1),
      midEnergy,
      sideEnergy,
      midSideRatioDb,
    };
  }

  /**
   * 分析动态范围 (Dynamic Range)。
   *
   * 动态范围定义为峰值电平与 RMS 电平之差（单位 dB）。
   * 动态范围越大，信号起伏越丰富，通常听感越有生命力；
   * 过度压缩会导致动态范围极小。
   *
   * @param buffer - 输入音频采样数据
   * @returns {DynamicRangeData} 动态范围分析结果
   */
  analyzeDynamicRange(buffer: Float32Array): DynamicRangeData {
    let peak = 0;
    let sumSquares = 0;

    for (let i = 0; i < buffer.length; i++) {
      const abs = Math.abs(buffer[i]);
      if (abs > peak) peak = abs;
      sumSquares += buffer[i] * buffer[i];
    }

    const rms = Math.sqrt(sumSquares / buffer.length);
    const peakDb = 20 * Math.log10(Math.max(peak, 1e-12));
    const rmsDb = 20 * Math.log10(Math.max(rms, 1e-12));
    const rangeDb = peakDb - rmsDb;

    return {
      rangeDb,
      peakDb,
      rmsDb,
    };
  }

  /**
   * 分析波峰因数 (Crest Factor)。
   *
   * 波峰因数为峰值与 RMS 的比值，反映信号的峰值密集程度。
   * 正弦波的波峰因数为 sqrt(2) ≈ 1.414；
   * 打击乐器的波峰因数通常较高。
   *
   * @param buffer - 输入音频采样数据
   * @returns {CrestFactorData} 波峰因数分析结果
   */
  analyzeCrestFactor(buffer: Float32Array): CrestFactorData {
    let peak = 0;
    let sumSquares = 0;

    for (let i = 0; i < buffer.length; i++) {
      const abs = Math.abs(buffer[i]);
      if (abs > peak) peak = abs;
      sumSquares += buffer[i] * buffer[i];
    }

    const rms = Math.sqrt(sumSquares / buffer.length);
    const crestFactor = rms > 1e-12 ? peak / rms : 0;
    const peakDb = 20 * Math.log10(Math.max(peak, 1e-12));
    const rmsDb = 20 * Math.log10(Math.max(rms, 1e-12));

    return {
      crestFactor,
      peakDb,
      rmsDb,
    };
  }

  /**
   * 计算频谱质心 (Spectral Centroid)。
   *
   * 频谱质心是频谱能量分布的"重心"频率，反映音色的明亮度。
   * 质心越高，音色越明亮、尖锐；质心越低，音色越暗淡、温暖。
   *
   * @param spectrum - 频谱幅值数组（通常来自 analyzeSpectrum 的 magnitude）
   * @returns {number} 频谱质心频率 (Hz)
   */
  analyzeFrequencyCentroid(spectrum: Float32Array): number {
    let weightedSum = 0;
    let sum = 0;
    const freqStep = SAMPLE_RATE / (spectrum.length * 2); // 假设 spectrum 为前半 FFT

    for (let i = 0; i < spectrum.length; i++) {
      const freq = i * freqStep;
      const mag = spectrum[i];
      weightedSum += freq * mag;
      sum += mag;
    }

    return sum > 1e-12 ? weightedSum / sum : 0;
  }

  /**
   * 计算频谱扩散 (Spectral Spread)。
   *
   * 频谱扩散是频谱能量围绕质心的标准差，反映频谱的集中程度。
   * 扩散越大，频谱分布越宽（如白噪声）；扩散越小，频谱越集中（如正弦波）。
   *
   * @param spectrum - 频谱幅值数组
   * @returns {number} 频谱扩散值 (Hz)
   */
  analyzeFrequencySpread(spectrum: Float32Array): number {
    const centroid = this.analyzeFrequencyCentroid(spectrum);
    let varianceSum = 0;
    let sum = 0;
    const freqStep = SAMPLE_RATE / (spectrum.length * 2);

    for (let i = 0; i < spectrum.length; i++) {
      const freq = i * freqStep;
      const mag = spectrum[i];
      const diff = freq - centroid;
      varianceSum += diff * diff * mag;
      sum += mag;
    }

    return sum > 1e-12 ? Math.sqrt(varianceSum / sum) : 0;
  }

  /**
   * 计算频谱平坦度 (Spectral Flatness)。
   *
   * 频谱平坦度为几何平均与算术平均之比，范围 [0, 1]。
   * 纯白噪声的平坦度接近 1；纯音（单一正弦波）的平坦度接近 0。
   * 常用于区分乐音与噪声成分。
   *
   * @param spectrum - 频谱幅值数组
   * @returns {number} 频谱平坦度 [0, 1]
   */
  analyzeFrequencyFlatness(spectrum: Float32Array): number {
    let logSum = 0;
    let linearSum = 0;
    let count = 0;

    for (let i = 0; i < spectrum.length; i++) {
      const mag = spectrum[i];
      if (mag > 1e-12) {
        logSum += Math.log(mag);
        linearSum += mag;
        count++;
      }
    }

    if (count === 0 || linearSum === 0) return 0;

    const geometricMean = Math.exp(logSum / count);
    const arithmeticMean = linearSum / count;

    return arithmeticMean > 1e-12 ? geometricMean / arithmeticMean : 0;
  }

  /**
   * 计算频谱滚降 (Spectral Rolloff)。
   *
   * 频谱滚降点是指低于该频率的能量占总能量的给定百分比的频率点。
   * 常用于区分清音与浊音，或分析低频能量占比。
   *
   * @param spectrum - 频谱幅值数组
   * @param percentile - 百分比阈值 (默认 0.85，即 85% 能量位于滚降点以下)
   * @returns {number} 滚降频率 (Hz)
   */
  analyzeFrequencyRolloff(spectrum: Float32Array, percentile: number = 0.85): number {
    let total = 0;
    for (let i = 0; i < spectrum.length; i++) {
      total += spectrum[i];
    }

    if (total < 1e-12) return 0;

    const threshold = total * percentile;
    let cumulative = 0;
    const freqStep = SAMPLE_RATE / (spectrum.length * 2);

    for (let i = 0; i < spectrum.length; i++) {
      cumulative += spectrum[i];
      if (cumulative >= threshold) {
        return i * freqStep;
      }
    }

    return (spectrum.length - 1) * freqStep;
  }

  /**
   * 计算过零率 (Zero Crossing Rate, ZCR)。
   *
   * 过零率表示信号每秒穿越零轴的次数。
   * 高过零率通常对应高频噪声或清辅音；
   * 低过零率通常对应低频乐音或浊音。
   *
   * @param buffer - 输入音频采样数据
   * @returns {ZeroCrossingData} 过零率分析结果
   */
  analyzeZeroCrossingRate(buffer: Float32Array): ZeroCrossingData {
    const frameSize = Math.floor(0.02 * SAMPLE_RATE); // 20ms 帧
    const numFrames = Math.floor(buffer.length / frameSize);
    const frames = new Float32Array(numFrames);

    for (let f = 0; f < numFrames; f++) {
      let crossings = 0;
      for (let i = 1; i < frameSize; i++) {
        const idx = f * frameSize + i;
        if ((buffer[idx] >= 0 && buffer[idx - 1] < 0) || (buffer[idx] < 0 && buffer[idx - 1] >= 0)) {
          crossings++;
        }
      }
      frames[f] = crossings * (SAMPLE_RATE / frameSize); // 每秒过零次数
    }

    const totalCrossings = frames.reduce((sum, v) => sum + v, 0);
    const rate = numFrames > 0 ? totalCrossings / numFrames : 0;

    return {
      rate,
      frames,
    };
  }

  /**
   * BPM (每分钟节拍数) 检测，使用自相关法 (Autocorrelation)。
   *
   * 算法流程：
   * 1. 将信号分为 512ms 的帧，计算每帧的能量包络
   * 2. 对包络进行差分，提取 onset 强度函数
   * 3. 计算 onset 函数的自相关，寻找周期性峰值
   * 4. 将滞后转换为 BPM，取最强候选
   *
   * @param buffer - 输入音频采样数据
   * @param sampleRate - 采样率 (默认 44100)
   * @returns {TempoData} BPM 检测结果
   */
  analyzeTempo(buffer: Float32Array, sampleRate: number = SAMPLE_RATE): TempoData {
    // 降采样到约 200Hz 用于包络分析，减少计算量
    const downsampleFactor = Math.floor(sampleRate / 200);
    const downLength = Math.floor(buffer.length / downsampleFactor);
    const envelope = new Float32Array(downLength);

    for (let i = 0; i < downLength; i++) {
      let sum = 0;
      for (let j = 0; j < downsampleFactor; j++) {
        sum += Math.abs(buffer[i * downsampleFactor + j]);
      }
      envelope[i] = sum / downsampleFactor;
    }

    // 差分包络：提取 onset 强度变化
    const onset = new Float32Array(downLength);
    onset[0] = 0;
    for (let i = 1; i < downLength; i++) {
      const diff = envelope[i] - envelope[i - 1];
      onset[i] = diff > 0 ? diff : 0;
    }

    // 自相关计算（限制滞后范围对应 60~300 BPM）
    // 200Hz 下，滞后范围：200*60/300 = 40 到 200*60/60 = 200
    const minLag = Math.floor((200 * 60) / 300);
    const maxLag = Math.floor((200 * 60) / 60);
    const autocorr = new Float32Array(maxLag - minLag + 1);

    let bestLag = minLag;
    let bestValue = -Infinity;

    for (let lag = minLag; lag <= maxLag; lag++) {
      let sum = 0;
      for (let i = 0; i < onset.length - lag; i++) {
        sum += onset[i] * onset[i + lag];
      }
      const idx = lag - minLag;
      autocorr[idx] = sum;
      if (sum > bestValue) {
        bestValue = sum;
        bestLag = lag;
      }
    }

    const detectedBpm = (200 * 60) / bestLag;
    const confidence = Math.min(bestValue / (autocorr.reduce((s, v) => s + v, 0) / autocorr.length + 1e-12), 1);

    // 构建候选列表
    const candidates: { bpm: number; strength: number }[] = [];
    for (let lag = minLag; lag <= maxLag; lag++) {
      const bpm = (200 * 60) / lag;
      const strength = autocorr[lag - minLag];
      candidates.push({ bpm, strength });
    }
    candidates.sort((a, b) => b.strength - a.strength);
    const topCandidates = candidates.slice(0, 5);

    // 粗略估算 beat 位置
    const beats: number[] = [];
    const beatInterval = sampleRate / (detectedBpm / 60);
    for (let t = 0; t < buffer.length; t += beatInterval) {
      beats.push(t / sampleRate);
    }

    return {
      bpm: clamp(detectedBpm, 30, 300),
      confidence: clamp(confidence, 0, 1),
      beats,
      candidates: topCandidates,
    };
  }

  /**
   * 基频 (Pitch) 检测，使用自相关法 (Autocorrelation)。
   *
   * 适用于单音（monophonic）信号的基频检测。
   * 使用中心削波 (Center Clipping) 预处理以减少谐波干扰，
   * 然后在时域自相关中寻找第一个显著峰值。
   *
   * @param buffer - 输入音频采样数据
   * @param sampleRate - 采样率 (默认 44100)
   * @returns {PitchData} 基频检测结果
   */
  analyzePitch(buffer: Float32Array, sampleRate: number = SAMPLE_RATE): PitchData {
    // 中心削波阈值：取最大幅值的 30%
    let maxAbs = 0;
    for (let i = 0; i < buffer.length; i++) {
      const abs = Math.abs(buffer[i]);
      if (abs > maxAbs) maxAbs = abs;
    }
    const clipThreshold = maxAbs * 0.3;

    const clipped = new Float32Array(buffer.length);
    for (let i = 0; i < buffer.length; i++) {
      const v = buffer[i];
      if (v > clipThreshold) clipped[i] = v - clipThreshold;
      else if (v < -clipThreshold) clipped[i] = v + clipThreshold;
      else clipped[i] = 0;
    }

    // 自相关
    const minLag = Math.floor(sampleRate / MAX_PITCH_FREQ);
    const maxLag = Math.floor(sampleRate / MIN_PITCH_FREQ);

    let bestLag = minLag;
    let bestCorr = -Infinity;

    for (let lag = minLag; lag <= maxLag; lag++) {
      let sum = 0;
      for (let i = 0; i < clipped.length - lag; i++) {
        sum += clipped[i] * clipped[i + lag];
      }
      if (sum > bestCorr) {
        bestCorr = sum;
        bestLag = lag;
      }
    }

    const frequency = sampleRate / bestLag;
    const midiNote = 69 + 12 * Math.log2(frequency / 440);
    const noteName = this._frequencyToNoteName(frequency);

    // 计算谐波序列
    const harmonics: number[] = [];
    for (let h = 2; h <= 8; h++) {
      const hf = frequency * h;
      if (hf < sampleRate / 2) harmonics.push(hf);
    }

    // 置信度：用零滞后自相关归一化
    let zeroLag = 0;
    for (let i = 0; i < clipped.length; i++) {
      zeroLag += clipped[i] * clipped[i];
    }
    const confidence = zeroLag > 1e-12 ? bestCorr / zeroLag : 0;

    return {
      frequency,
      midiNote,
      noteName,
      confidence: clamp(confidence, 0, 1),
      harmonics,
    };
  }

  /**
   * 将频率转换为音名（带升降记号的科学音高记谱法）。
   *
   * @param freq - 输入频率 (Hz)
   * @returns {string} 音名，例如 "A4", "C#5", "Bb3"
   */
  private _frequencyToNoteName(freq: number): string {
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    if (freq <= 0) return 'N/A';
    const midi = 69 + 12 * Math.log2(freq / 440);
    const midiRounded = Math.round(midi);
    const noteIndex = ((midiRounded % 12) + 12) % 12;
    const octave = Math.floor(midiRounded / 12) - 1;
    return `${noteNames[noteIndex]}${octave}`;
  }

  /**
   * 分析信号的谐波内容。
   *
   * 基于 FFT 频谱检测基波及各次谐波的幅值，
   * 计算总谐波失真率 (THD) 和谐波丰富度。
   *
   * @param buffer - 输入音频采样数据
   * @returns {HarmonicData} 谐波分析结果
   */
  analyzeHarmonicContent(buffer: Float32Array): HarmonicData {
    // 使用较大的 FFT 尺寸以提高频率分辨率
    const fftSize = 8192;
    const spectrum = this.analyzeSpectrum(buffer, fftSize);
    const mag = spectrum.magnitude;
    const freqStep = spectrum.frequencies[1] - spectrum.frequencies[0];

    // 寻找基频：最大幅值对应的频率（排除直流）
    let maxMag = 0;
    let fundamentalIdx = 1;
    for (let i = 1; i < mag.length; i++) {
      if (mag[i] > maxMag) {
        maxMag = mag[i];
        fundamentalIdx = i;
      }
    }
    const fundamental = fundamentalIdx * freqStep;

    // 提取前 10 次谐波
    const numHarmonics = 10;
    const harmonicAmplitudes = new Float32Array(numHarmonics);
    let harmonicSum = 0;

    for (let h = 1; h <= numHarmonics; h++) {
      const targetFreq = fundamental * h;
      const targetIdx = Math.round(targetFreq / freqStep);
      const searchRange = 2; // ±2 bin 搜索范围
      let peakMag = 0;

      for (let k = -searchRange; k <= searchRange; k++) {
        const idx = targetIdx + k;
        if (idx >= 0 && idx < mag.length && mag[idx] > peakMag) {
          peakMag = mag[idx];
        }
      }

      harmonicAmplitudes[h - 1] = peakMag;
      if (h > 1) harmonicSum += peakMag * peakMag;
    }

    const fundamentalMag = harmonicAmplitudes[0];
    // THD (%) = sqrt(sum(H2^2 + H3^2 + ...)) / H1 * 100
    const thd =
      fundamentalMag > 1e-12 ? (Math.sqrt(harmonicSum) / fundamentalMag) * 100 : 0;

    // 噪声电平：非谐波 bin 的平均能量
    let noiseSum = 0;
    let noiseCount = 0;
    for (let i = 1; i < mag.length; i++) {
      let isHarmonic = false;
      for (let h = 1; h <= numHarmonics; h++) {
        const targetIdx = Math.round((fundamental * h) / freqStep);
        if (Math.abs(i - targetIdx) <= 2) {
          isHarmonic = true;
          break;
        }
      }
      if (!isHarmonic) {
        noiseSum += mag[i] * mag[i];
        noiseCount++;
      }
    }
    const noiseLevel = noiseCount > 0 ? Math.sqrt(noiseSum / noiseCount) : 0;

    // 丰富度：谐波能量与总能量比
    let totalMag = 0;
    for (let i = 0; i < mag.length; i++) totalMag += mag[i];
    let harmonicTotal = 0;
    for (let i = 0; i < harmonicAmplitudes.length; i++) harmonicTotal += harmonicAmplitudes[i];
    const richness = totalMag > 1e-12 ? harmonicTotal / totalMag : 0;

    return {
      fundamental,
      harmonicAmplitudes,
      thd,
      noiseLevel,
      richness,
    };
  }

  /**
   * 获取用于波形显示的降采样数据。
   *
   * 将原始音频缓冲区降采样为指定数量的数据点，
   * 每点包含最小值、最大值和 RMS，适合绘制波形图。
   *
   * @param buffer - 输入音频采样数据
   * @param points - 目标数据点数（例如 Canvas 宽度像素数）
   * @returns {WaveformData} 波形显示数据
   */
  getWaveformData(buffer: Float32Array, points: number): WaveformData {
    const minArr = new Float32Array(points);
    const maxArr = new Float32Array(points);
    const rmsArr = new Float32Array(points);

    const samplesPerPoint = Math.floor(buffer.length / points);

    for (let p = 0; p < points; p++) {
      const start = p * samplesPerPoint;
      const end = Math.min(start + samplesPerPoint, buffer.length);

      let minVal = Infinity;
      let maxVal = -Infinity;
      let sumSquares = 0;

      for (let i = start; i < end; i++) {
        const v = buffer[i];
        if (v < minVal) minVal = v;
        if (v > maxVal) maxVal = v;
        sumSquares += v * v;
      }

      minArr[p] = minVal === Infinity ? 0 : minVal;
      maxArr[p] = maxVal === -Infinity ? 0 : maxVal;
      rmsArr[p] = Math.sqrt(sumSquares / (end - start));
    }

    return {
      min: minArr,
      max: maxArr,
      rms: rmsArr,
    };
  }

  /**
   * 获取用于 Canvas 绘制的峰值数据。
   *
   * 将缓冲区映射到指定像素尺寸，计算每列的正峰值、负峰值和 RMS，
   * 适合高性能波形渲染。
   *
   * @param buffer - 输入音频采样数据
   * @param width - Canvas 像素宽度
   * @param height - Canvas 像素高度（用于可选的归一化参考）
   * @returns {PeaksDisplayData} 峰值绘制数据
   */
  getPeaksForDisplay(buffer: Float32Array, width: number, height: number): PeaksDisplayData {
    const peaksPositive = new Float32Array(width);
    const peaksNegative = new Float32Array(width);
    const peaksRms = new Float32Array(width);

    const samplesPerPixel = Math.floor(buffer.length / width);

    for (let x = 0; x < width; x++) {
      const start = x * samplesPerPixel;
      const end = Math.min(start + samplesPerPixel, buffer.length);

      let positive = 0;
      let negative = 0;
      let sumSquares = 0;

      for (let i = start; i < end; i++) {
        const v = buffer[i];
        if (v > positive) positive = v;
        if (v < negative) negative = v;
        sumSquares += v * v;
      }

      peaksPositive[x] = positive;
      peaksNegative[x] = negative;
      peaksRms[x] = Math.sqrt(sumSquares / (end - start));
    }

    return {
      peaksPositive,
      peaksNegative,
      peaksRms,
      width,
      height,
    };
  }
}

// ============================================================================
// AnalyzerNode - Web Audio API AnalyserNode 模拟类
// ============================================================================

/**
 * 模拟 Web Audio API 中 AnalyserNode 的行为。
 *
 * 此类用于在无法使用原生 Web Audio API 的环境（如 Web Worker、
 * Node.js 后端或离线渲染）中提供兼容的分析能力。
 *
 * 支持：
 * - 时域数据获取 (getFloatTimeDomainData / getByteTimeDomainData)
 * - 频域数据获取 (getFloatFrequencyData / getByteFrequencyData)
 * - FFT 尺寸、平滑系数、最小/最大分贝值配置
 *
 * @example
 * ```ts
 * const analyser = new AnalyzerNode();
 * analyser.fftSize = 2048;
 * analyser.writeInputs(buffer);
 * const freqs = new Float32Array(analyser.frequencyBinCount);
 * analyser.getFloatFrequencyData(freqs);
 * ```
 */
export class AnalyzerNode {
  /** 内部 FFT 尺寸 */
  private _fftSize: number;
  /** 频域数据平滑系数 [0, 1] */
  private _smoothing: number;
  /** 最小显示分贝值 */
  private _minDecibels: number;
  /** 最大显示分贝值 */
  private _maxDecibels: number;
  /** 内部时域环形缓冲区 */
  private _timeDomainBuffer: Float32Array;
  /** 写入指针 */
  private _writeIndex: number;
  /** 内部频域平滑数据 */
  private _smoothedFrequencyData: Float32Array;
  /** 内部 AudioAnalyzer 实例 */
  private _analyzer: AudioAnalyzer;

  /**
   * 构造 AnalyzerNode 实例。
   *
   * @param fftSize - 初始 FFT 尺寸（必须为 2 的幂，默认 2048）
   */
  constructor(fftSize: number = 2048) {
    this._fftSize = fftSize;
    this._smoothing = 0.8;
    this._minDecibels = -100;
    this._maxDecibels = -30;
    this._timeDomainBuffer = new Float32Array(this._fftSize);
    this._writeIndex = 0;
    this._smoothedFrequencyData = new Float32Array(this._fftSize / 2);
    this._analyzer = new AudioAnalyzer();
  }

  /** 获取当前 FFT 尺寸 */
  get fftSize(): number {
    return this._fftSize;
  }

  /** 设置 FFT 尺寸（自动调整为 2 的幂，范围 32~32768） */
  set fftSize(value: number) {
    let size = 32;
    while (size < value && size < 32768) size <<= 1;
    this._fftSize = size;
    this._timeDomainBuffer = new Float32Array(size);
    this._smoothedFrequencyData = new Float32Array(size / 2);
    this._writeIndex = 0;
  }

  /** 获取频域 bin 数量（= fftSize / 2） */
  get frequencyBinCount(): number {
    return this._fftSize >> 1;
  }

  /** 获取平滑时间常数 */
  get smoothingTimeConstant(): number {
    return this._smoothing;
  }

  /** 设置平滑时间常数 [0, 1] */
  set smoothingTimeConstant(value: number) {
    this._smoothing = clamp(value, 0, 1);
  }

  /** 获取最小显示分贝值 */
  get minDecibels(): number {
    return this._minDecibels;
  }

  /** 设置最小显示分贝值 */
  set minDecibels(value: number) {
    this._minDecibels = value;
  }

  /** 获取最大显示分贝值 */
  get maxDecibels(): number {
    return this._maxDecibels;
  }

  /** 设置最大显示分贝值 */
  set maxDecibels(value: number) {
    this._maxDecibels = value;
  }

  /**
   * 向内部缓冲区写入新的采样数据。
   *
   * 数据写入环形缓冲区，用于后续的频域/时域读取。
   *
   * @param input - 输入采样数据
   */
  writeInputs(input: Float32Array): void {
    for (let i = 0; i < input.length; i++) {
      this._timeDomainBuffer[this._writeIndex] = input[i];
      this._writeIndex = (this._writeIndex + 1) % this._fftSize;
    }
  }

  /**
   * 获取当前时域数据的 Float32 副本。
   *
   * 数据按时间顺序排列（最新的采样在数组末尾）。
   *
   * @param array - 目标数组，长度应为 fftSize
   */
  getFloatTimeDomainData(array: Float32Array): void {
    const size = this._fftSize;
    if (array.length !== size) {
      throw new Error(`Expected array length ${size}, got ${array.length}`);
    }
    for (let i = 0; i < size; i++) {
      const idx = (this._writeIndex + i) % size;
      array[i] = this._timeDomainBuffer[idx];
    }
  }

  /**
   * 获取当前时域数据的 Uint8 副本。
   *
   * 数值范围映射为 [0, 255]，其中 128 对应 0。
   *
   * @param array - 目标数组，长度应为 fftSize
   */
  getByteTimeDomainData(array: Uint8Array): void {
    const size = this._fftSize;
    if (array.length !== size) {
      throw new Error(`Expected array length ${size}, got ${array.length}`);
    }
    for (let i = 0; i < size; i++) {
      const idx = (this._writeIndex + i) % size;
      const v = this._timeDomainBuffer[idx];
      // 将 [-1, 1] 映射到 [0, 255]
      array[i] = Math.round(clamp((v + 1) * 0.5, 0, 1) * 255);
    }
  }

  /**
   * 获取当前频域数据的 Float32 副本（单位 dB）。
   *
   * 结果已经过平滑处理和 dB 转换。
   *
   * @param array - 目标数组，长度应为 frequencyBinCount
   */
  getFloatFrequencyData(array: Float32Array): void {
    const size = this._fftSize;
    const half = size >> 1;
    if (array.length !== half) {
      throw new Error(`Expected array length ${half}, got ${array.length}`);
    }

    // 拷贝当前时域数据
    const tempBuffer = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      const idx = (this._writeIndex + i) % size;
      tempBuffer[i] = this._timeDomainBuffer[idx];
    }

    // 计算频谱
    const spec = this._analyzer.analyzeSpectrum(tempBuffer, size);
    const mag = spec.magnitude;

    // 应用平滑和 dB 转换
    const smoothing = this._smoothing;
    for (let i = 0; i < half; i++) {
      const db = gainToDb(mag[i]);
      this._smoothedFrequencyData[i] =
        smoothing * this._smoothedFrequencyData[i] + (1 - smoothing) * db;
      array[i] = this._smoothedFrequencyData[i];
    }
  }

  /**
   * 获取当前频域数据的 Uint8 副本。
   *
   * 数值范围按 minDecibels / maxDecibels 映射为 [0, 255]。
   *
   * @param array - 目标数组，长度应为 frequencyBinCount
   */
  getByteFrequencyData(array: Uint8Array): void {
    const half = this.frequencyBinCount;
    if (array.length !== half) {
      throw new Error(`Expected array length ${half}, got ${array.length}`);
    }

    const floatData = new Float32Array(half);
    this.getFloatFrequencyData(floatData);

    const minDb = this._minDecibels;
    const maxDb = this._maxDecibels;
    const range = maxDb - minDb;

    for (let i = 0; i < half; i++) {
      const normalized = (floatData[i] - minDb) / range;
      array[i] = Math.round(clamp(normalized, 0, 1) * 255);
    }
  }
}

// ============================================================================
// Oscilloscope - 示波器模拟类
// ============================================================================

/**
 * 模拟硬件示波器的显示行为，用于音频波形可视化。
 *
 * 支持：
 * - 自由运行 (Free Run) 模式
 * - 边沿触发 (Edge Trigger) 模式，可配置触发电平与斜率
 * - 多通道叠加显示（支持立体声 L/R 或 XY 模式）
 * - 可配置的时间基准（每格采样数）
 *
 * @example
 * ```ts
 * const scope = new Oscilloscope();
 * scope.setTimeBase(0.01); // 10ms 每格
 * scope.pushSamples(buffer);
 * const display = scope.getDisplayData();
 * // 绘制 display.channels[0] 到 Canvas
 * ```
 */
export class Oscilloscope {
  /** 内部环形缓冲区，存储最近的采样 */
  private _buffer: Float32Array;
  /** 缓冲区写入指针 */
  private _writeIndex: number;
  /** 缓冲区容量 */
  private _capacity: number;
  /** 每格时间 (秒) */
  private _timeBase: number;
  /** 触发模式：'free' | 'rising' | 'falling' */
  private _triggerMode: 'free' | 'rising' | 'falling';
  /** 触发电平 [-1, 1] */
  private _triggerLevel: number;
  /** 采样率 */
  private readonly _sampleRate: number;
  /** 显示通道数 */
  private _numChannels: number;
  /** 第二通道数据（用于立体声或 XY 模式） */
  private _secondaryBuffer: Float32Array | null;

  /**
   * 构造 Oscilloscope 实例。
   *
   * @param sampleRate - 采样率 (默认 44100)
   * @param capacity - 内部缓冲区容量 (默认 16384)
   */
  constructor(sampleRate: number = SAMPLE_RATE, capacity: number = 16384) {
    this._sampleRate = sampleRate;
    this._capacity = capacity;
    this._buffer = new Float32Array(capacity);
    this._writeIndex = 0;
    this._timeBase = 0.001; // 默认 1ms/格
    this._triggerMode = 'free';
    this._triggerLevel = OSCILLOSCOPE_TRIGGER_LEVEL;
    this._numChannels = 1;
    this._secondaryBuffer = null;
  }

  /** 获取当前时间基准 (秒/格) */
  get timeBase(): number {
    return this._timeBase;
  }

  /** 设置时间基准 (秒/格) */
  setTimeBase(secondsPerDivision: number): void {
    this._timeBase = Math.max(1e-6, secondsPerDivision);
  }

  /** 获取触发模式 */
  get triggerMode(): 'free' | 'rising' | 'falling' {
    return this._triggerMode;
  }

  /** 设置触发模式 */
  setTriggerMode(mode: 'free' | 'rising' | 'falling'): void {
    this._triggerMode = mode;
  }

  /** 获取触发电平 */
  get triggerLevel(): number {
    return this._triggerLevel;
  }

  /** 设置触发电平 [-1, 1] */
  setTriggerLevel(level: number): void {
    this._triggerLevel = clamp(level, -1, 1);
  }

  /**
   * 推送单声道采样到示波器缓冲区。
   *
   * @param samples - 输入采样数据
   */
  pushSamples(samples: Float32Array): void {
    for (let i = 0; i < samples.length; i++) {
      this._buffer[this._writeIndex] = samples[i];
      this._writeIndex = (this._writeIndex + 1) % this._capacity;
    }
    this._numChannels = 1;
    this._secondaryBuffer = null;
  }

  /**
   * 推送立体声采样到示波器缓冲区。
   *
   * @param left - 左声道采样
   * @param right - 右声道采样
   */
  pushStereoSamples(left: Float32Array, right: Float32Array): void {
    const length = Math.min(left.length, right.length);
    // 仅存储最新的 _capacity 个采样
    for (let i = 0; i < length; i++) {
      this._buffer[this._writeIndex] = left[i];
      this._writeIndex = (this._writeIndex + 1) % this._capacity;
    }
    // 复制右声道到第二缓冲区（取最近 _capacity 个）
    const sec = new Float32Array(this._capacity);
    for (let i = 0; i < length; i++) {
      sec[i] = right[i];
    }
    this._secondaryBuffer = sec;
    this._numChannels = 2;
  }

  /**
   * 获取用于显示的采样数据。
   *
   * 根据当前时间基准计算每屏所需采样数，
   * 并在触发模式下寻找触发点，保证波形稳定显示。
   *
   * @param divisions - 水平格数（默认 10 格，类似标准示波器）
   * @returns {Float32Array[]} 每个通道的显示采样数组
   */
  getDisplayData(divisions: number = 10): Float32Array[] {
    const samplesPerDivision = Math.floor(this._timeBase * this._sampleRate);
    const displaySamples = samplesPerDivision * divisions;

    // 从环形缓冲区提取最新的 displaySamples 个数据
    const temp = new Float32Array(displaySamples);
    for (let i = 0; i < displaySamples; i++) {
      const idx = (this._writeIndex - displaySamples + i + this._capacity) % this._capacity;
      temp[i] = this._buffer[idx];
    }

    let startOffset = 0;

    // 边沿触发处理
    if (this._triggerMode !== 'free' && displaySamples > 1) {
      const isRising = this._triggerMode === 'rising';
      for (let i = 1; i < temp.length; i++) {
        if (isRising && temp[i - 1] < this._triggerLevel && temp[i] >= this._triggerLevel) {
          startOffset = i;
          break;
        }
        if (!isRising && temp[i - 1] > this._triggerLevel && temp[i] <= this._triggerLevel) {
          startOffset = i;
          break;
        }
      }
    }

    // 提取触发后的波形
    const channel1 = new Float32Array(displaySamples);
    for (let i = 0; i < displaySamples; i++) {
      const srcIdx = startOffset + i;
      channel1[i] = srcIdx < temp.length ? temp[srcIdx] : 0;
    }

    const result: Float32Array[] = [channel1];

    // 处理第二通道
    if (this._numChannels === 2 && this._secondaryBuffer) {
      const channel2 = new Float32Array(displaySamples);
      for (let i = 0; i < displaySamples; i++) {
        const idx =
          (this._writeIndex - displaySamples + startOffset + i + this._capacity) % this._capacity;
        channel2[i] = this._secondaryBuffer[idx];
      }
      result.push(channel2);
    }

    return result;
  }

  /**
   * 获取 XY 模式显示数据（李萨如图形）。
   *
   * 将通道 1 作为 X 轴，通道 2 作为 Y 轴。
   * 适合观察两个信号的相位关系。
   *
   * @param points - 采样点数（默认 1024）
   * @returns {{x: Float32Array, y: Float32Array}} XY 坐标数组
   */
  getXYData(points: number = 1024): { x: Float32Array; y: Float32Array } {
    const x = new Float32Array(points);
    const y = new Float32Array(points);

    for (let i = 0; i < points; i++) {
      const idx = (this._writeIndex - points + i + this._capacity) % this._capacity;
      x[i] = this._buffer[idx];
      y[i] = this._secondaryBuffer ? this._secondaryBuffer[idx] : 0;
    }

    return { x, y };
  }

  /** 清空示波器缓冲区 */
  clear(): void {
    this._buffer.fill(0);
    if (this._secondaryBuffer) this._secondaryBuffer.fill(0);
    this._writeIndex = 0;
  }
}

// ============================================================================
// 辅助工具函数与额外分析能力
// ============================================================================

/**
 * 将频谱幅值转换为 dB 刻度数组。
 *
 * 公式：dB = 20 * log10(magnitude)
 *
 * @param magnitude - 线性幅值数组
 * @returns {Float32Array} dB 幅值数组
 */
export function magnitudeToDb(magnitude: Float32Array): Float32Array {
  const db = new Float32Array(magnitude.length);
  for (let i = 0; i < magnitude.length; i++) {
    db[i] = 20 * Math.log10(Math.max(magnitude[i], 1e-12));
  }
  return db;
}

/**
 * 将 dB 刻度数组转换回线性幅值。
 *
 * 公式：magnitude = 10^(dB / 20)
 *
 * @param db - dB 幅值数组
 * @returns {Float32Array} 线性幅值数组
 */
export function dbToMagnitude(db: Float32Array): Float32Array {
  const mag = new Float32Array(db.length);
  for (let i = 0; i < db.length; i++) {
    mag[i] = Math.pow(10, db[i] / 20);
  }
  return mag;
}

/**
 * 查找频谱中的主要峰值频率列表。
 *
 * 使用简单的局部极大值检测，适合快速识别共振峰或基频谐波。
 *
 * @param spectrum - 频谱数据对象
 * @param thresholdDb - 峰值检测阈值 (dB，相对于最大峰值)
 * @param maxPeaks - 返回的最大峰值数量
 * @returns {{frequency: number, magnitude: number}[]} 峰值列表
 */
export function findSpectralPeaks(
  spectrum: SpectrumData,
  thresholdDb: number = -20,
  maxPeaks: number = 10
): { frequency: number; magnitude: number }[] {
  const magDb = magnitudeToDb(spectrum.magnitude);
  let maxDb = -Infinity;
  for (let i = 0; i < magDb.length; i++) {
    if (magDb[i] > maxDb) maxDb = magDb[i];
  }

  const threshold = maxDb + thresholdDb;
  const peaks: { frequency: number; magnitude: number }[] = [];

  // 局部极大值检测
  for (let i = 2; i < magDb.length - 2; i++) {
    const v = magDb[i];
    if (v < threshold) continue;
    if (v > magDb[i - 1] && v > magDb[i - 2] && v > magDb[i + 1] && v > magDb[i + 2]) {
      peaks.push({
        frequency: spectrum.frequencies[i],
        magnitude: spectrum.magnitude[i],
      });
    }
  }

  // 按幅值降序排列并截取
  peaks.sort((a, b) => b.magnitude - a.magnitude);
  return peaks.slice(0, maxPeaks);
}

/**
 * 计算两个信号的互相关 (Cross-Correlation)。
 *
 * 互相关用于衡量两个信号在不同时延下的相似性，
 * 常用于定位声源、检测延迟或识别回声。
 *
 * @param a - 第一个信号
 * @param b - 第二个信号
 * @param maxLag - 最大滞后采样数
 * @returns {Float32Array} 互相关序列，长度为 maxLag * 2 + 1
 */
export function crossCorrelation(a: Float32Array, b: Float32Array, maxLag: number): Float32Array {
  const result = new Float32Array(maxLag * 2 + 1);
  const len = Math.min(a.length, b.length);

  for (let lag = -maxLag; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i < len; i++) {
      const j = i + lag;
      if (j >= 0 && j < len) {
        sum += a[i] * b[j];
      }
    }
    result[lag + maxLag] = sum;
  }

  return result;
}

/**
 * 计算信号的短时能量 (Short-Time Energy)。
 *
 * 将信号分为等长帧，计算每帧的能量总和，
 * 常用于语音活动检测 (VAD) 或 onset 检测。
 *
 * @param buffer - 输入音频采样
 * @param frameSize - 帧大小（采样数）
 * @param hopSize - 帧移（采样数）
 * @returns {Float32Array} 每帧能量序列
 */
export function shortTimeEnergy(buffer: Float32Array, frameSize: number, hopSize: number): Float32Array {
  const numFrames = Math.floor((buffer.length - frameSize) / hopSize) + 1;
  const energy = new Float32Array(numFrames);
  for (let f = 0; f < numFrames; f++) {
    let sum = 0;
    for (let i = 0; i < frameSize; i++) {
      const v = buffer[f * hopSize + i];
      sum += v * v;
    }
    energy[f] = sum;
  }
  return energy;
}

/**
 * 计算信号的瞬时频率 (Instantaneous Frequency)。
 *
   * 基于相位的差分估算瞬时频率，输入为 FFT 相位序列。
   * 需要保证相邻帧的相位已解包裹 (unwrapped)。
   *
   * @param phase - 相位序列（弧度）
   * @param sampleRate - 采样率
   * @param hopSize - 帧移
   * @returns {Float32Array} 瞬时频率序列 (Hz)
   */
export function instantaneousFrequency(
  phase: Float32Array,
  sampleRate: number = SAMPLE_RATE,
  hopSize: number = 512
): Float32Array {
  const freq = new Float32Array(phase.length);
  freq[0] = 0;
  for (let i = 1; i < phase.length; i++) {
    let delta = phase[i] - phase[i - 1];
    // 解包裹：将相位差限制在 [-pi, pi]
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;
    freq[i] = (delta * sampleRate) / (2 * Math.PI * hopSize);
  }
  return freq;
}

/**
 * 一阶 IIR 高通滤波器，用于预处理（如去除直流偏移）。
 *
 * @param buffer - 输入信号
 * @param cutoffHz - 截止频率 (Hz)
 * @param sampleRate - 采样率
 * @returns {Float32Array} 滤波后信号
 */
export function highpassFilter(
  buffer: Float32Array,
  cutoffHz: number = 20,
  sampleRate: number = SAMPLE_RATE
): Float32Array {
  const rc = 1.0 / (2.0 * Math.PI * cutoffHz);
  const dt = 1.0 / sampleRate;
  const alpha = rc / (rc + dt);
  const out = new Float32Array(buffer.length);
  out[0] = buffer[0];
  for (let i = 1; i < buffer.length; i++) {
    out[i] = alpha * (out[i - 1] + buffer[i] - buffer[i - 1]);
  }
  return out;
}

/**
 * 一阶 IIR 低通滤波器，用于平滑包络。
 *
 * @param buffer - 输入信号
 * @param cutoffHz - 截止频率 (Hz)
 * @param sampleRate - 采样率
 * @returns {Float32Array} 滤波后信号
 */
export function lowpassFilter(
  buffer: Float32Array,
  cutoffHz: number = 200,
  sampleRate: number = SAMPLE_RATE
): Float32Array {
  const rc = 1.0 / (2.0 * Math.PI * cutoffHz);
  const dt = 1.0 / sampleRate;
  const alpha = dt / (rc + dt);
  const out = new Float32Array(buffer.length);
  out[0] = buffer[0];
  for (let i = 1; i < buffer.length; i++) {
    out[i] = out[i - 1] + alpha * (buffer[i] - out[i - 1]);
  }
  return out;
}

/**
 * 信号极性检测。
 *
 * 统计信号中正采样与负采样的比例，判断整体极性。
 * 常用于检测接线反相问题。
 *
 * @param buffer - 输入音频采样
 * @returns {'positive' | 'negative' | 'balanced'} 极性判断结果
 */
export function detectPolarity(buffer: Float32Array): 'positive' | 'negative' | 'balanced' {
  let positiveSum = 0;
  let negativeSum = 0;
  for (let i = 0; i < buffer.length; i++) {
    if (buffer[i] > 0) positiveSum += buffer[i];
    else negativeSum += Math.abs(buffer[i]);
  }
  const diff = positiveSum - negativeSum;
  const threshold = (positiveSum + negativeSum) * 0.05;
  if (diff > threshold) return 'positive';
  if (diff < -threshold) return 'negative';
  return 'balanced';
}

/**
 * 检测信号是否包含削波失真 (Clipping)。
 *
 * 统计接近满刻度 (±1.0) 的连续采样数，
 * 超过阈值则认为存在削波。
 *
 * @param buffer - 输入音频采样
 * @param threshold - 削波阈值（相对于满刻度，默认 0.99）
 * @param minConsecutive - 判定削波所需的最小连续采样数（默认 3）
 * @returns {boolean} 是否检测到削波
 */
export function detectClipping(buffer: Float32Array, threshold: number = 0.99, minConsecutive: number = 3): boolean {
  let consecutive = 0;
  for (let i = 0; i < buffer.length; i++) {
    if (Math.abs(buffer[i]) >= threshold) {
      consecutive++;
      if (consecutive >= minConsecutive) return true;
    } else {
      consecutive = 0;
    }
  }
  return false;
}

/**
 * 计算音频信号的直流偏移 (DC Offset)。
 *
 * @param buffer - 输入音频采样
 * @returns {number} 直流偏移量（信号平均值）
 */
export function calculateDCOffset(buffer: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) {
    sum += buffer[i];
  }
  return sum / buffer.length;
}

/**
 * 移除音频信号的直流偏移。
 *
 * @param buffer - 输入音频采样（原地修改）
 * @returns {number} 移除前的直流偏移量
 */
export function removeDCOffset(buffer: Float32Array): number {
  const offset = calculateDCOffset(buffer);
  for (let i = 0; i < buffer.length; i++) {
    buffer[i] -= offset;
  }
  return offset;
}

/**
 * 计算信号的熵 (Spectral Entropy)。
 *
 * 频谱熵反映频谱能量的分布均匀性，
   * 熵越高，频谱越平坦（噪声特性）；熵越低，频谱越集中（乐音特性）。
   *
   * @param spectrum - 频谱幅值数组
   * @returns {number} 频谱熵（单位：bits，最大值 log2(N)）
   */
export function spectralEntropy(spectrum: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < spectrum.length; i++) {
    sum += spectrum[i];
  }
  if (sum < 1e-12) return 0;

  let entropy = 0;
  for (let i = 0; i < spectrum.length; i++) {
    const p = spectrum[i] / sum;
    if (p > 1e-12) {
      entropy -= p * Math.log2(p);
    }
  }
  return entropy;
}

/**
 * 计算音频信号的淡入/淡出包络检测。
 *
 * 返回信号能量随时间的趋势，用于判断是否存在 fades。
 *
 * @param buffer - 输入音频采样
   * @param numSegments - 分段数量（默认 10）
   * @returns {Float32Array} 每段 RMS 电平 (dBFS)
   */
export function detectEnvelopeTrend(buffer: Float32Array, numSegments: number = 10): Float32Array {
  const segmentSize = Math.floor(buffer.length / numSegments);
  const levels = new Float32Array(numSegments);
  for (let s = 0; s < numSegments; s++) {
    let sum = 0;
    const start = s * segmentSize;
    const end = Math.min(start + segmentSize, buffer.length);
    for (let i = start; i < end; i++) {
      sum += buffer[i] * buffer[i];
    }
    const rms = Math.sqrt(sum / (end - start));
    levels[s] = 20 * Math.log10(Math.max(rms, 1e-12));
  }
  return levels;
}

/**
 * 分析两声道的时间差（用于立体声定位或延迟估计）。
 *
 * 基于互相关寻找最优对齐偏移。
 *
 * @param left - 左声道采样
 * @param right - 右声道采样
 * @param maxLagMs - 最大搜索延迟 (毫秒)
 * @returns {number} 延迟时间 (毫秒)，正值表示 right 滞后于 left
 */
export function estimateInterChannelDelay(
  left: Float32Array,
  right: Float32Array,
  maxLagMs: number = 50
): number {
  const maxLagSamples = Math.floor((maxLagMs / 1000) * SAMPLE_RATE);
  const corr = crossCorrelation(left, right, maxLagSamples);

  let bestLag = 0;
  let bestVal = -Infinity;
  for (let i = 0; i < corr.length; i++) {
    if (corr[i] > bestVal) {
      bestVal = corr[i];
      bestLag = i - maxLagSamples;
    }
  }

  return (bestLag / SAMPLE_RATE) * 1000;
}

/**
 * 批量分析接口：一次性获取所有常用分析指标。
 *
 * @param buffer - 输入音频采样（单声道）
 * @returns {object} 包含多种分析结果的汇总对象
 */
export function analyzeAll(buffer: Float32Array): {
  loudness: LoudnessData;
  dynamicRange: DynamicRangeData;
  crestFactor: CrestFactorData;
  zeroCrossing: ZeroCrossingData;
  spectralFeatures: SpectralFeatures;
  pitch: PitchData;
  tempo: TempoData;
} {
  const analyzer = new AudioAnalyzer();
  const spectrumData = analyzer.analyzeSpectrum(buffer, 4096);
  const loudness = analyzer.analyzeLoudness(buffer);
  const dynamicRange = analyzer.analyzeDynamicRange(buffer);
  const crestFactor = analyzer.analyzeCrestFactor(buffer);
  const zeroCrossing = analyzer.analyzeZeroCrossingRate(buffer);
  const spectralFeatures: SpectralFeatures = {
    centroid: analyzer.analyzeFrequencyCentroid(spectrumData.magnitude),
    spread: analyzer.analyzeFrequencySpread(spectrumData.magnitude),
    flatness: analyzer.analyzeFrequencyFlatness(spectrumData.magnitude),
    rolloff: analyzer.analyzeFrequencyRolloff(spectrumData.magnitude, 0.85),
  };
  const pitch = analyzer.analyzePitch(buffer, SAMPLE_RATE);
  const tempo = analyzer.analyzeTempo(buffer, SAMPLE_RATE);

  return {
    loudness,
    dynamicRange,
    crestFactor,
    zeroCrossing,
    spectralFeatures,
    pitch,
    tempo,
  };
}
