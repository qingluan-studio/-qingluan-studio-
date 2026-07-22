/**
 * @fileoverview 青鸾数字音频工作站 - 节拍器与调音器引擎
 * 提供高精度节拍器、调音器、YIN基频检测等音乐工具。
 *
 * @module engines/metronomeTuner
 * @version 2.0.0
 * @author 青鸾工作室
 */

import { clamp, lerp, midiToFrequency, dbToGain } from '../utils/audioUtils.js';

// ============================================================================
// 全局常量
// ============================================================================

/** 标准采样率 */
export const SAMPLE_RATE = 44100;

/** 标准参考音 A4 频率 (Hz) */
export const REFERENCE_A4 = 440;

/** 最大允许 BPM */
export const MAX_BPM = 300;

/** 最小允许 BPM */
export const MIN_BPM = 10;

/** 默认 BPM */
export const DEFAULT_BPM = 120;

/** 默认拍号：4/4 */
export const DEFAULT_TIME_SIGNATURE: [number, number] = [4, 4];

/** 打点测速历史最大记录数 */
export const TAP_TEMPO_MAX_HISTORY = 8;

/** 打点测速最大间隔 (毫秒)，超过则清空历史 */
export const TAP_TEMPO_TIMEOUT_MS = 2000;

/** YIN 算法默认阈值 */
export const YIN_THRESHOLD = 0.1;

/** YIN 算法默认缓冲区大小 */
export const YIN_BUFFER_SIZE = 2048;

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 节拍器音色类型
 */
export type MetronomeSoundType = 'click' | 'wood' | 'beep' | 'drum' | 'voice';

/**
 * 律制类型
 */
export type TuningSystem =
  | 'equalTemperament'      // 十二平均律
  | 'justIntonation'        // 纯律
  | 'pythagorean'           // 五度相生律
  | 'quarterTone'           // 四分之一音
  | 'werckmeisterIII'       // 威尔克迈斯特 III
  | 'kirnbergerIII'         // 基恩贝格尔 III
  | 'meantone'              // 中全音律
  | 'schug';                // 舒格律

/**
 * 律制信息接口
 */
export interface TuningSystemInfo {
  /** 律制标识符 */
  id: TuningSystem;
  /** 显示名称 */
  name: string;
  /** 中文名称 */
  nameZh: string;
  /** 描述 */
  description: string;
  /** 音程频率比表 (相对于根音的半音偏移) */
  ratios: number[];
}

/**
 * 音符信息接口
 */
export interface NoteInfo {
  /** 音名 */
  name: string;
  /** 频率 (Hz) */
  frequency: number;
  /** MIDI 音符编号 */
  midi: number;
  /** 八度 */
  octave: number;
  /** 音分偏差 (cents) */
  centsOffset?: number;
}

/**
 * 调音结果接口
 */
export interface TuningResult {
  /** 检测到的频率 */
  frequency: number;
  /** 最近音符信息 */
  note: NoteInfo;
  /** 与目标频率的音分偏差 */
  cents: number;
  /** 偏差方向 */
  direction: 'flat' | 'sharp' | 'inTune';
  /** 检测置信度 [0,1] */
  confidence: number;
}

/**
 * YIN 检测结果接口
 */
export interface YinResult {
  /** 检测到的基频 (Hz)，若为 0 表示未检测到 */
  pitch: number;
  /** 检测置信度/清晰度 [0,1] */
  clarity: number;
  /** 周期长度 (采样数) */
  period: number;
}

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 生成白噪声缓冲区。
 *
 * @param length - 采样数
 * @param amplitude - 幅值 (0~1)
 * @returns {Float32Array} 白噪声采样
 */
function generateWhiteNoise(length: number, amplitude: number = 1): Float32Array {
  const buf = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    buf[i] = (Math.random() * 2 - 1) * amplitude;
  }
  return buf;
}

/**
 * 应用指数衰减包络。
 *
 * @param buffer - 输入采样（原地修改）
 * @param decayRate - 衰减系数（每采样）
 */
function applyExponentialDecay(buffer: Float32Array, decayRate: number): void {
  for (let i = 0; i < buffer.length; i++) {
    buffer[i] *= Math.exp(-decayRate * i);
  }
}

/**
 * 生成正弦波。
 *
 * @param frequency - 频率 (Hz)
 * @param duration - 时长 (秒)
 * @param amplitude - 幅值 (0~1)
 * @param sampleRate - 采样率
 * @returns {Float32Array} 正弦波采样
 */
function generateSine(
  frequency: number,
  duration: number,
  amplitude: number = 1,
  sampleRate: number = SAMPLE_RATE
): Float32Array {
  const samples = Math.floor(duration * sampleRate);
  const buf = new Float32Array(samples);
  const phaseStep = (2 * Math.PI * frequency) / sampleRate;
  for (let i = 0; i < samples; i++) {
    buf[i] = Math.sin(i * phaseStep) * amplitude;
  }
  return buf;
}

/**
 * 生成带谐波的正弦波（合成 richer 音色）。
 *
 * @param frequency - 基频 (Hz)
 * @param duration - 时长 (秒)
 * @param harmonics - 谐波幅值数组，索引 0 为基波，1 为二次谐波...
 * @param sampleRate - 采样率
 * @returns {Float32Array} 合成波形
 */
function generateHarmonicTone(
  frequency: number,
  duration: number,
  harmonics: number[] = [1, 0.3, 0.15, 0.1],
  sampleRate: number = SAMPLE_RATE
): Float32Array {
  const samples = Math.floor(duration * sampleRate);
  const buf = new Float32Array(samples);
  for (let h = 0; h < harmonics.length; h++) {
    const amp = harmonics[h];
    if (amp <= 0) continue;
    const freq = frequency * (h + 1);
    const phaseStep = (2 * Math.PI * freq) / sampleRate;
    for (let i = 0; i < samples; i++) {
      buf[i] += Math.sin(i * phaseStep) * amp;
    }
  }
  // 软削波归一化
  let maxAbs = 0;
  for (let i = 0; i < samples; i++) {
    const abs = Math.abs(buf[i]);
    if (abs > maxAbs) maxAbs = abs;
  }
  if (maxAbs > 1) {
    for (let i = 0; i < samples; i++) buf[i] /= maxAbs;
  }
  return buf;
}

// ============================================================================
// Metronome - 节拍器类
// ============================================================================

/**
 * 高精度节拍器引擎，支持多种拍号、重音模式和音色。
 *
 * 可生成节拍器音频轨道，也可用于实时播放控制。
 * 内部维护精确的拍位置计算，支持 swing、细分拍等高级功能。
 *
 * @example
 * ```ts
 * const metro = new Metronome();
 * metro.setBpm(120);
 * metro.setTimeSignature(3, 4);
 * metro.setAccentPattern([1, 0, 0]); // 第一拍重音
 * const clickTrack = metro.generateClickTrack(10, 44100);
 * ```
 */
export class Metronome {
  /** 当前 BPM */
  private _bpm: number;
  /** 拍号分子（每小节拍数） */
  private _numerator: number;
  /** 拍号分母（以几分音符为一拍） */
  private _denominator: number;
  /** 重音模式，1 表示重音，0 表示轻音 */
  private _accentPattern: number[];
  /** 细分拍数（每拍的等分数量，如 1=四分音符, 2=八分音符, 4=十六分音符） */
  private _subdivision: number;
  /** 当前音色类型 */
  private _soundType: MetronomeSoundType;
  /** 打点测速历史时间戳 (毫秒) */
  private _tapHistory: number[];
  /** 节拍器启动时间 (秒，用于 getBeatPosition) */
  private _startTime: number;
  /** Swing 比例 [0, 1]，0 为平直，1 为典型 triplet swing */
  private _swing: number;

  constructor() {
    this._bpm = DEFAULT_BPM;
    this._numerator = DEFAULT_TIME_SIGNATURE[0];
    this._denominator = DEFAULT_TIME_SIGNATURE[1];
    this._accentPattern = [1, 0, 0, 0]; // 默认 4/4 第一拍重音
    this._subdivision = 1;
    this._soundType = 'click';
    this._tapHistory = [];
    this._startTime = 0;
    this._swing = 0;
  }

  /** 获取当前 BPM */
  get bpm(): number {
    return this._bpm;
  }

  /** 获取当前拍号 */
  get timeSignature(): [number, number] {
    return [this._numerator, this._denominator];
  }

  /** 获取当前细分拍 */
  get subdivision(): number {
    return this._subdivision;
  }

  /** 获取当前音色 */
  get soundType(): MetronomeSoundType {
    return this._soundType;
  }

  /** 获取 swing 比例 */
  get swing(): number {
    return this._swing;
  }

  /**
   * 设置 Swing 感觉。
   *
   * Swing 会延迟偶数细分拍，产生类似爵士乐的三连音摇摆感。
   *
   * @param amount - Swing 比例 [0, 1]，0 为平直，1 为最大 swing
   */
  setSwing(amount: number): void {
    this._swing = clamp(amount, 0, 1);
  }

  /**
   * 设置 BPM (每分钟节拍数)。
   *
   * @param bpm - 目标 BPM，范围 10~300
   */
  setBpm(bpm: number): void {
    this._bpm = clamp(bpm, MIN_BPM, MAX_BPM);
  }

  /**
   * 设置拍号。
   *
   * @param numerator - 分子（每小节几拍）
   * @param denominator - 分母（以几分音符为一拍，通常为 2 的幂）
   */
  setTimeSignature(numerator: number, denominator: number): void {
    this._numerator = Math.max(1, Math.floor(numerator));
    this._denominator = Math.max(1, Math.floor(denominator));
    // 自动调整重音模式长度
    this._resizeAccentPattern();
  }

  /**
   * 设置重音模式。
   *
   * 数组中 1 表示重音，0 表示普通音，2 表示次重音。
   * 长度不足时自动循环，长度超过时截断。
   *
   * @param pattern - 重音模式数组，例如 [1,0,0,0] 表示四四拍第一拍重音
   */
  setAccentPattern(pattern: number[]): void {
    if (pattern.length === 0) return;
    this._accentPattern = pattern.slice();
    // 确保至少覆盖 numerator
    while (this._accentPattern.length < this._numerator) {
      this._accentPattern.push(0);
    }
  }

  /**
   * 设置细分拍数量。
   *
   * 例如 subdivision=2 表示每拍细分为两个八分音符。
   *
   * @param subdivision - 细分数量（>=1）
   */
  setSubdivision(subdivision: number): void {
    this._subdivision = Math.max(1, Math.floor(subdivision));
  }

  /**
   * 设置节拍器音色。
   *
   * 支持 'click'(清脆点击)、'wood'(木鱼声)、'beep'(电子蜂鸣)、
   * 'drum'(鼓声)、'voice'(人声数拍)。
   *
   * @param type - 音色类型
   */
  setSoundType(type: MetronomeSoundType): void {
    this._soundType = type;
  }

  /** 调整重音模式长度以匹配当前拍号 */
  private _resizeAccentPattern(): void {
    while (this._accentPattern.length < this._numerator) {
      this._accentPattern.push(0);
    }
  }

  /**
   * 根据拍位置生成单个节拍声。
   *
   * @param beatIndex - 拍索引（0-based）
   * @param sampleRate - 采样率
   * @returns {Float32Array} 单个节拍声音的采样
   */
  private _generateBeatSound(beatIndex: number, sampleRate: number): Float32Array {
    const accent = this._accentPattern[beatIndex % this._accentPattern.length];
    const isAccent = accent === 1;
    const isSubAccent = accent === 2;

    // 基础参数
    let duration = 0.05;
    let freq = 1000;
    let amplitude = 0.5;

    if (isAccent) {
      amplitude = 0.9;
      freq = 1200;
      duration = 0.08;
    } else if (isSubAccent) {
      amplitude = 0.7;
      freq = 1000;
      duration = 0.06;
    } else {
      amplitude = 0.4;
      freq = 800;
      duration = 0.04;
    }

    switch (this._soundType) {
      case 'click': {
        // 白噪声 + 带通近似（高频脉冲）
        const samples = Math.floor(duration * sampleRate);
        const buf = generateWhiteNoise(samples, amplitude);
        // 使用简单低通模拟 "click" 的短暂高频
        const decay = 200; // 快速衰减
        applyExponentialDecay(buf, decay);
        return buf;
      }
      case 'wood': {
        // 木鱼声：正弦 + 少量谐波，快速衰减
        const harmonics = isAccent ? [1, 0.5, 0.2] : [1, 0.3, 0.1];
        const buf = generateHarmonicTone(freq, duration, harmonics, sampleRate);
        applyExponentialDecay(buf, isAccent ? 40 : 60);
        return buf;
      }
      case 'beep': {
        // 电子蜂鸣：纯方波近似（使用大量奇次谐波正弦叠加）
        const samples = Math.floor(duration * sampleRate);
        const buf = new Float32Array(samples);
        const baseFreq = isAccent ? 880 : 660;
        for (let h = 1; h <= 7; h += 2) {
          const amp = (1 / h) * amplitude * (isAccent ? 1 : 0.6);
          const phaseStep = (2 * Math.PI * baseFreq * h) / sampleRate;
          for (let i = 0; i < samples; i++) {
            buf[i] += Math.sin(i * phaseStep) * amp;
          }
        }
        applyExponentialDecay(buf, isAccent ? 30 : 50);
        return buf;
      }
      case 'drum': {
        // 鼓声：低频正弦 + 噪声起音
        const samples = Math.floor(duration * sampleRate);
        const buf = new Float32Array(samples);
        const toneFreq = isAccent ? 200 : 150;
        const toneSamples = Math.floor(0.02 * sampleRate);
        for (let i = 0; i < toneSamples; i++) {
          buf[i] = Math.sin((2 * Math.PI * toneFreq * i) / sampleRate) * amplitude;
        }
        // 添加噪声起音
        const noiseLen = Math.floor(0.005 * sampleRate);
        for (let i = 0; i < noiseLen; i++) {
          buf[i] += (Math.random() * 2 - 1) * amplitude * 0.5;
        }
        applyExponentialDecay(buf, isAccent ? 50 : 80);
        return buf;
      }
      case 'voice': {
        // 人声数拍：使用不同频率区分拍号
        const voiceFreq = isAccent ? 440 : 330;
        const buf = generateHarmonicTone(voiceFreq, duration, [1, 0.2, 0.1], sampleRate);
        applyExponentialDecay(buf, 25);
        return buf;
      }
      default:
        return generateSine(freq, duration, amplitude, sampleRate);
    }
  }

  /**
   * 生成指定时长的节拍器音频轨道。
   *
   * 按照当前 BPM、拍号、重音模式和细分设置生成完整的节拍器音频。
   *
   * @param duration - 时长 (秒)
   * @param sampleRate - 采样率 (默认 44100)
   * @returns {Float32Array} 节拍器音频采样
   */
  generateClickTrack(duration: number, sampleRate: number = SAMPLE_RATE): Float32Array {
    const totalSamples = Math.floor(duration * sampleRate);
    const output = new Float32Array(totalSamples);

    // 计算每拍时长（秒）
    const beatDuration = 60 / this._bpm;
    const beatSamples = Math.floor(beatDuration * sampleRate);

    // 小节长度
    const measureSamples = beatSamples * this._numerator;

    // 生成每拍声音并写入输出
    for (let beat = 0; ; beat++) {
      // 计算当前拍的时间偏移（考虑 swing）
      let beatTimeOffset = beat * beatDuration;

      // Swing 处理：对奇数细分拍进行延迟
      if (this._swing > 0 && this._subdivision > 1) {
        const subBeat = beat % this._subdivision;
        if (subBeat % 2 === 1) {
          // 延迟量：swing 比例 * (2/3 三连音感觉)
          const swingDelay = this._swing * (beatDuration / this._subdivision) * (2 / 3);
          beatTimeOffset += swingDelay;
        }
      }

      const startSample = Math.floor(beatTimeOffset * sampleRate);
      if (startSample >= totalSamples) break;

      // 确定是第几拍（在小节内）
      const beatInMeasure = (beat % this._numerator);
      const sound = this._generateBeatSound(beatInMeasure, sampleRate);

      for (let i = 0; i < sound.length && startSample + i < totalSamples; i++) {
        output[startSample + i] += sound[i];
      }
    }

    // 软限幅防止叠加过载
    let maxAbs = 0;
    for (let i = 0; i < totalSamples; i++) {
      const abs = Math.abs(output[i]);
      if (abs > maxAbs) maxAbs = abs;
    }
    if (maxAbs > 1) {
      for (let i = 0; i < totalSamples; i++) {
        output[i] /= maxAbs;
      }
    }

    return output;
  }

  /**
   * 打点测速 (Tap Tempo)。
   *
   * 每次调用记录当前时间戳，基于最近几次打点的间隔计算 BPM。
   * 若两次打点间隔超过 2 秒，则清空历史重新计算。
   *
   * @returns {number} 当前估算的 BPM
   */
  tapTempo(): number {
    const now = performance.now();

    // 超时清空历史
    if (this._tapHistory.length > 0 && now - this._tapHistory[this._tapHistory.length - 1] > TAP_TEMPO_TIMEOUT_MS) {
      this._tapHistory = [];
    }

    this._tapHistory.push(now);
    if (this._tapHistory.length > TAP_TEMPO_MAX_HISTORY) {
      this._tapHistory.shift();
    }

    if (this._tapHistory.length < 2) {
      return this._bpm;
    }

    // 计算平均间隔
    let totalInterval = 0;
    for (let i = 1; i < this._tapHistory.length; i++) {
      totalInterval += this._tapHistory[i] - this._tapHistory[i - 1];
    }
    const avgInterval = totalInterval / (this._tapHistory.length - 1);
    const bpm = 60000 / avgInterval;
    this._bpm = clamp(Math.round(bpm), MIN_BPM, MAX_BPM);
    return this._bpm;
  }

  /**
   * 获取当前拍位置信息。
   *
   * 给定时间（秒），返回当前处于第几小节、第几拍、以及拍内的进度。
   *
   * @param time - 时间（秒，从节拍器启动开始计时）
   * @returns {object} 拍位置信息
   */
  getBeatPosition(time: number): {
    measure: number;
    beatInMeasure: number;
    beatProgress: number;
    totalBeats: number;
    bpm: number;
  } {
    const beatDuration = 60 / this._bpm;
    const totalBeatsFloat = time / beatDuration;
    const totalBeats = Math.floor(totalBeatsFloat);
    const beatProgress = totalBeatsFloat - totalBeats;

    const measure = Math.floor(totalBeats / this._numerator);
    const beatInMeasure = totalBeats % this._numerator;

    return {
      measure,
      beatInMeasure,
      beatProgress,
      totalBeats,
      bpm: this._bpm,
    };
  }

  /**
   * 启动节拍器计时（重置内部起始时间）。
   */
  start(): void {
    this._startTime = performance.now() / 1000;
  }

  /**
   * 获取自启动以来经过的时间（秒）。
   */
  getElapsedTime(): number {
    return performance.now() / 1000 - this._startTime;
  }
}

// ============================================================================
// Tuner - 调音器类
// ============================================================================

/**
 * 高精度调音器，支持多种律制和参考频率。
 *
 * 可检测输入音频的音高，并与目标律制比较，给出音分偏差。
 * 支持生成标准参考音，辅助乐器调音。
 *
 * @example
 * ```ts
 * const tuner = new Tuner();
 * const result = tuner.detectPitch(buffer, 44100);
 * console.log(result.note.name, result.cents);
 * ```
 */
export class Tuner {
  /** 参考频率 A4 (Hz) */
  private _referenceFreq: number;
  /** 当前使用的律制 */
  private _tuningSystem: TuningSystem;
  /** 内部 YIN 检测器实例 */
  private _pitchDetector: PitchDetector;
  /** 音名表 */
  private static readonly NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  constructor(referenceFreq: number = REFERENCE_A4, tuningSystem: TuningSystem = 'equalTemperament') {
    this._referenceFreq = referenceFreq;
    this._tuningSystem = tuningSystem;
    this._pitchDetector = new PitchDetector();
  }

  /** 获取当前参考频率 */
  get referenceFreq(): number {
    return this._referenceFreq;
  }

  /** 设置参考频率 */
  set referenceFreq(freq: number) {
    this._referenceFreq = freq;
  }

  /** 获取当前律制 */
  get tuningSystem(): TuningSystem {
    return this._tuningSystem;
  }

  /** 设置律制 */
  set tuningSystem(system: TuningSystem) {
    this._tuningSystem = system;
  }

  /**
   * 检测输入音频的音高。
   *
   * 使用内部 YIN 算法检测基频，然后映射到当前律制的最近音符。
   *
   * @param buffer - 输入音频采样
   * @param sampleRate - 采样率 (默认 44100)
   * @returns {TuningResult} 调音结果
   */
  detectPitch(buffer: Float32Array, sampleRate: number = SAMPLE_RATE): TuningResult {
    const yinResult = this._pitchDetector.detect(buffer, sampleRate);
    const frequency = yinResult.pitch;

    if (frequency <= 0) {
      return {
        frequency: 0,
        note: { name: 'N/A', frequency: 0, midi: 0, octave: 0 },
        cents: 0,
        direction: 'flat',
        confidence: 0,
      };
    }

    const note = this.getClosestNote(frequency);
    const cents = this.getCents(frequency, note.frequency);
    let direction: 'flat' | 'sharp' | 'inTune' = 'inTune';
    if (cents < -5) direction = 'flat';
    else if (cents > 5) direction = 'sharp';

    return {
      frequency,
      note,
      cents,
      direction,
      confidence: yinResult.clarity,
    };
  }

  /**
   * 将频率转换为音名。
   *
   * 基于十二平均律映射，不考虑当前律制的音分偏差。
   *
   * @param frequency - 输入频率 (Hz)
   * @returns {string} 音名，例如 "A4", "C#5"
   */
  getNoteName(frequency: number): string {
    if (frequency <= 0) return 'N/A';
    const midi = 69 + 12 * Math.log2(frequency / this._referenceFreq);
    const midiRounded = Math.round(midi);
    const noteIndex = ((midiRounded % 12) + 12) % 12;
    const octave = Math.floor(midiRounded / 12) - 1;
    return `${Tuner.NOTE_NAMES[noteIndex]}${octave}`;
  }

  /**
   * 计算频率与参考频率之间的音分偏差。
   *
   * 公式：cents = 1200 * log2(frequency / referenceFreq)
   *
   * @param frequency - 输入频率 (Hz)
   * @param referenceFreq - 参考频率 (Hz)，默认使用当前设置的 A4
   * @returns {number} 音分偏差（正值偏高，负值偏低）
   */
  getCents(frequency: number, referenceFreq?: number): number {
    const ref = referenceFreq ?? this._referenceFreq;
    if (frequency <= 0 || ref <= 0) return 0;
    return 1200 * Math.log2(frequency / ref);
  }

  /**
   * 获取与输入频率最接近的音符信息。
   *
   * 根据当前律制计算精确频率。
   *
   * @param frequency - 输入频率 (Hz)
   * @returns {NoteInfo} 最近音符的详细信息
   */
  getClosestNote(frequency: number): NoteInfo {
    if (frequency <= 0) {
      return { name: 'N/A', frequency: 0, midi: 0, octave: 0 };
    }

    // 先基于十二平均律找到最近 MIDI 音符
    const midiFloat = 69 + 12 * Math.log2(frequency / this._referenceFreq);
    const midiRounded = Math.round(midiFloat);
    const noteIndex = ((midiRounded % 12) + 12) % 12;
    const octave = Math.floor(midiRounded / 12) - 1;
    const name = `${Tuner.NOTE_NAMES[noteIndex]}${octave}`;

    // 根据当前律制计算该音符的精确频率
    const noteFreq = this._getFrequencyInTuning(midiRounded, this._tuningSystem);
    const centsOffset = 1200 * Math.log2(noteFreq / (this._referenceFreq * Math.pow(2, (midiRounded - 69) / 12)));

    return {
      name,
      frequency: noteFreq,
      midi: midiRounded,
      octave,
      centsOffset,
    };
  }

  /**
   * 在指定律制下计算 MIDI 音符的频率。
   *
   * @param midi - MIDI 音符编号
   * @param system - 律制类型
   * @returns {number} 频率 (Hz)
   */
  private _getFrequencyInTuning(midi: number, system: TuningSystem): number {
    const systems = getTuningSystems();
    const info = systems.find((s) => s.id === system);
    if (!info || info.ratios.length === 0) {
      // 回退到十二平均律
      return this._referenceFreq * Math.pow(2, (midi - 69) / 12);
    }

    const semitone = ((midi % 12) + 12) % 12;
    const octave = Math.floor(midi / 12) - 1;
    const ratio = info.ratios[semitone];
    // 基于 A4 (midi 69) 计算：A4 在 ratios 中为第 9 个半音 (A = 9)
    const a4Semitone = 9;
    const baseMidi = 69; // A4
    const baseOctave = Math.floor(baseMidi / 12) - 1; // 4
    const baseFreq = this._referenceFreq;

    // 计算目标音符相对于 A4 的八度差和半音差
    const octaveDiff = octave - baseOctave;
    const semitoneDiff = semitone - a4Semitone;

    // 组合频率比
    const octaveRatio = Math.pow(2, octaveDiff);
    const semitoneRatio = ratio / info.ratios[a4Semitone];
    return baseFreq * octaveRatio * semitoneRatio;
  }

  /**
   * 生成指定音符的参考音音频。
   *
   * @param note - 音名，例如 "A", "C#", "Bb"
   * @param octave - 八度，例如 4
   * @param duration - 时长 (秒)
   * @param sampleRate - 采样率 (默认 44100)
   * @returns {Float32Array} 参考音音频采样
   */
  generateReferenceTone(
    note: string,
    octave: number,
    duration: number,
    sampleRate: number = SAMPLE_RATE
  ): Float32Array {
    const freq = this._noteNameToFrequency(note, octave);
    if (freq <= 0) return new Float32Array(0);

    // 使用纯音 + 少量谐波，模拟调音叉/音叉参考音
    const buf = generateHarmonicTone(freq, duration, [1, 0.05, 0.02], sampleRate);
    // 添加起始淡入和结束淡出，避免咔嗒声
    const fadeSamples = Math.floor(0.01 * sampleRate);
    for (let i = 0; i < fadeSamples && i < buf.length; i++) {
      const factor = i / fadeSamples;
      buf[i] *= factor;
    }
    for (let i = 0; i < fadeSamples && i < buf.length; i++) {
      const idx = buf.length - 1 - i;
      const factor = i / fadeSamples;
      buf[idx] *= factor;
    }
    return buf;
  }

  /**
   * 将音名和八度转换为频率。
   *
   * @param note - 音名
   * @param octave - 八度
   * @returns {number} 频率 (Hz)
   */
  private _noteNameToFrequency(note: string, octave: number): number {
    const noteMap: Record<string, number> = {
      C: 0, 'C#': 1, Db: 1,
      D: 2, 'D#': 3, Eb: 3,
      E: 4,
      F: 5, 'F#': 6, Gb: 6,
      G: 7, 'G#': 8, Ab: 8,
      A: 9, 'A#': 10, Bb: 10,
      B: 11,
    };
    const semitone = noteMap[note];
    if (semitone === undefined) return 0;
    const midi = (octave + 1) * 12 + semitone;
    return this._getFrequencyInTuning(midi, this._tuningSystem);
  }

  /**
   * 获取所有支持的律制信息。
   *
   * @returns {TuningSystemInfo[]} 律制信息数组
   */
  getTuningSystems(): TuningSystemInfo[] {
    return getTuningSystems();
  }
}

// ============================================================================
// PitchDetector - YIN 算法简化实现
// ============================================================================

/**
 * YIN 基频检测算法（简化实现）。
 *
 * YIN (de Cheveigné & Kawahara, 2002) 是一种时域基频检测算法，
 * 相比原始自相关法，YIN 通过差分函数和累积均值归一化 (CMN)
 * 显著减少了谐波误检（octave errors）的概率。
 *
 * 算法步骤：
 * 1. 计算差分函数 (Difference Function)
 * 2. 计算累积均值归一化差分函数 (CMND)
 * 3. 搜索绝对阈值以下的第一个局部极小值作为基音周期
 * 4. 可选抛物线插值提高频率精度
 *
 * @example
 * ```ts
 * const detector = new PitchDetector();
 * const result = detector.detect(buffer, 44100);
 * console.log(result.pitch, result.clarity);
 * ```
 */
export class PitchDetector {
  /** 检测阈值 */
  private _threshold: number;
  /** 内部缓冲区 */
  private _yinBuffer: Float32Array;
  /** 最低检测频率对应的周期 */
  private _maxPeriod: number;
  /** 最高检测频率对应的周期 */
  private _minPeriod: number;

  constructor(threshold: number = YIN_THRESHOLD) {
    this._threshold = threshold;
    this._yinBuffer = new Float32Array(YIN_BUFFER_SIZE);
    this._maxPeriod = Math.floor(SAMPLE_RATE / 50);  // 最低 50Hz
    this._minPeriod = Math.floor(SAMPLE_RATE / 2000); // 最高 2000Hz
  }

  /** 获取检测阈值 */
  get threshold(): number {
    return this._threshold;
  }

  /** 设置检测阈值 */
  set threshold(value: number) {
    this._threshold = clamp(value, 0.01, 1);
  }

  /**
   * 执行 YIN 基频检测。
   *
   * @param buffer - 输入音频采样
   * @param sampleRate - 采样率 (默认 44100)
   * @returns {YinResult} YIN 检测结果
   */
  detect(buffer: Float32Array, sampleRate: number = SAMPLE_RATE): YinResult {
    const maxPeriod = Math.floor(sampleRate / 50);
    const minPeriod = Math.floor(sampleRate / 2000);

    if (buffer.length < maxPeriod * 2) {
      return { pitch: 0, clarity: 0, period: 0 };
    }

    // 确保内部缓冲区足够大
    if (this._yinBuffer.length < maxPeriod) {
      this._yinBuffer = new Float32Array(maxPeriod);
    }
    const yin = this._yinBuffer.subarray(0, maxPeriod);

    // 步骤 1：差分函数
    for (let tau = 0; tau < maxPeriod; tau++) {
      let sum = 0;
      for (let i = 0; i < maxPeriod; i++) {
        const diff = buffer[i] - buffer[i + tau];
        sum += diff * diff;
      }
      yin[tau] = sum;
    }

    // 步骤 2：累积均值归一化 (CMN)
    yin[0] = 1; // tau=0 时恒为 0，设为 1 避免除以零
    let runningSum = 0;
    for (let tau = 1; tau < maxPeriod; tau++) {
      runningSum += yin[tau];
      yin[tau] = (yin[tau] * tau) / runningSum;
    }

    // 步骤 3：搜索阈值以下的第一个局部极小值
    let period = 0;
    for (let tau = minPeriod; tau < maxPeriod; tau++) {
      if (yin[tau] < this._threshold) {
        // 确保是局部极小值（向后搜索几步确认）
        let isMin = true;
        for (let i = 1; i <= 3 && tau + i < maxPeriod; i++) {
          if (yin[tau + i] < yin[tau]) {
            isMin = false;
            break;
          }
        }
        if (isMin) {
          period = tau;
          break;
        }
      }
    }

    // 若未找到，取全局最小值
    if (period === 0) {
      let minVal = Infinity;
      for (let tau = minPeriod; tau < maxPeriod; tau++) {
        if (yin[tau] < minVal) {
          minVal = yin[tau];
          period = tau;
        }
      }
    }

    // 步骤 4：抛物线插值提高精度
    const betterPeriod = this._parabolicInterpolation(yin, period);

    const pitch = betterPeriod > 0 ? sampleRate / betterPeriod : 0;
    const clarity = 1 - yin[period];

    return {
      pitch,
      clarity: clamp(clarity, 0, 1),
      period: betterPeriod,
    };
  }

  /**
   * 抛物线插值，用于精细化周期估计。
   *
   * @param yin - CMND 数组
   * @param tau - 初始周期估计
   * @returns {number} 插值后的精确周期
   */
  private _parabolicInterpolation(yin: Float32Array, tau: number): number {
    if (tau <= 0 || tau >= yin.length - 1) return tau;
    const alpha = yin[tau - 1];
    const beta = yin[tau];
    const gamma = yin[tau + 1];
    const denom = 2 * (2 * beta - gamma - alpha);
    if (Math.abs(denom) < 1e-10) return tau;
    const p = (gamma - alpha) / denom;
    return tau + p;
  }
}

// ============================================================================
// 律制数据库
// ============================================================================

/**
 * 获取所有支持的律制信息列表。
 *
 * @returns {TuningSystemInfo[]} 律制信息数组
 */
export function getTuningSystems(): TuningSystemInfo[] {
  return [
    {
      id: 'equalTemperament',
      name: 'Equal Temperament',
      nameZh: '十二平均律',
      description: '现代西方音乐的标准律制，将一个八度均分为12个半音，每个半音频率比为 2^(1/12)。优点是可以在任意调性间自由转调而不会产生狼音。',
      ratios: [
        1.0,
        Math.pow(2, 1 / 12),
        Math.pow(2, 2 / 12),
        Math.pow(2, 3 / 12),
        Math.pow(2, 4 / 12),
        Math.pow(2, 5 / 12),
        Math.pow(2, 6 / 12),
        Math.pow(2, 7 / 12),
        Math.pow(2, 8 / 12),
        Math.pow(2, 9 / 12),
        Math.pow(2, 10 / 12),
        Math.pow(2, 11 / 12),
      ],
    },
    {
      id: 'justIntonation',
      name: 'Just Intonation',
      nameZh: '纯律',
      description: '基于自然泛音列的简单整数频率比构建的律制。大三度为 5:4，小三度为 6:5，纯五度为 3:2。音色纯净，但转调困难，某些调性会出现狼音。',
      ratios: [
        1.0,        // C
        16 / 15,    // C# (略有偏差)
        9 / 8,      // D
        6 / 5,      // D# / Eb
        5 / 4,      // E
        4 / 3,      // F
        45 / 32,    // F# (或 25/18 替代)
        3 / 2,      // G
        8 / 5,      // G# / Ab
        5 / 3,      // A
        9 / 5,      // A# / Bb
        15 / 8,     // B
      ],
    },
    {
      id: 'pythagorean',
      name: 'Pythagorean Tuning',
      nameZh: '五度相生律',
      description: '由毕达哥拉斯学派发展，通过连续纯五度（3:2）生成各音。五度和小二度非常纯净，但大三度（81:64）比纯律（5:4）稍宽，听起来较紧张。',
      ratios: [
        1.0,                    // C
        256 / 243,              // C# (Pythagorean limma 反向)
        9 / 8,                  // D
        32 / 27,                // Eb
        81 / 64,                // E
        4 / 3,                  // F
        729 / 512,              // F#
        3 / 2,                  // G
        128 / 81,               // Ab
        27 / 16,                // A
        16 / 9,                 // Bb
        243 / 128,              // B
      ],
    },
    {
      id: 'quarterTone',
      name: 'Quarter Tone',
      nameZh: '四分之一音',
      description: '将一个八度分为24个四分之一音，每个四分之一音频率比为 2^(1/24)。广泛应用于阿拉伯音乐、土耳其音乐和某些当代古典音乐中，可获得极细腻的微分音色彩。',
      ratios: [
        1.0,
        Math.pow(2, 1 / 24),
        Math.pow(2, 2 / 24),
        Math.pow(2, 3 / 24),
        Math.pow(2, 4 / 24),
        Math.pow(2, 5 / 24),
        Math.pow(2, 6 / 24),
        Math.pow(2, 7 / 24),
        Math.pow(2, 8 / 24),
        Math.pow(2, 9 / 24),
        Math.pow(2, 10 / 24),
        Math.pow(2, 11 / 24),
      ],
    },
    {
      id: 'werckmeisterIII',
      name: 'Werckmeister III',
      nameZh: '威尔克迈斯特 III',
      description: '安德烈亚斯·威尔克迈斯特 (Andreas Werckmeister) 于1691年提出的良律 (Well Temperament) 之一。允许在所有调性上演奏，同时保留各调性独特的音色性格。C大调非常纯净，远关系调则逐渐紧张。',
      ratios: [
        1.0,
        256.0 / 243.0,   // C#
        64.0 / 54.0,     // D (约 9/8 缩小)
        32.0 / 27.0,     // Eb
        256.0 / 203.0,   // E (近似纯律大三度)
        4.0 / 3.0,       // F
        128.0 / 81.0,    // F# (减五度位置)
        8.0 / 5.0,       // G (实际为 wolf 位置调整)
        128.0 / 81.0,    // Ab
        27.0 / 16.0,     // A
        16.0 / 9.0,      // Bb
        128.0 / 81.0,    // B
      ],
    },
    {
      id: 'kirnbergerIII',
      name: 'Kirnberger III',
      nameZh: '基恩贝格尔 III',
      description: '约翰·菲利普·基恩贝格尔 (Johann Kirnberger) 提出的良律。与 Werckmeister 类似，但大三度分布更加均匀，是许多古乐演奏家偏好的巴赫时代律制。',
      ratios: [
        1.0,
        256.0 / 243.0,
        9.0 / 8.0,
        32.0 / 27.0,
        5.0 / 4.0,
        4.0 / 3.0,
        45.0 / 32.0,
        3.0 / 2.0,
        128.0 / 81.0,
        27.0 / 16.0,
        16.0 / 9.0,
        15.0 / 8.0,
      ],
    },
    {
      id: 'meantone',
      name: 'Meantone Temperament',
      nameZh: '中全音律',
      description: '文艺复兴与早期巴洛克时期的主流律制。通过调整五度使其生成纯净的大三度（5:4），代价是某些五度变得极为刺耳（wolf fifth）。典型形式为 1/4 音差中全音律。',
      ratios: [
        1.0,
        1.0449,  // 近似 81/80^(1/4) 调整
        1.0700,  // 略小于 9/8
        1.1963,  // Eb
        1.2500,  // E = 5/4
        1.3375,  // F
        1.3975,  // F#
        1.4953,  // G (略小于 3/2)
        1.6000,  // Ab
        1.6719,  // A
        1.7889,  // Bb
        1.8692,  // B
      ],
    },
    {
      id: 'schug',
      name: 'Schug',
      nameZh: '舒格律',
      description: '一种实验性微分音律制，基于非八度重复音程。用于先锋派和实验电子音乐创作，探索传统十二音体系之外的音高空间。',
      ratios: [
        1.0,
        1.05,
        1.10,
        1.15,
        1.20,
        1.25,
        1.30,
        1.35,
        1.40,
        1.45,
        1.50,
        1.55,
      ],
    },
  ];
}

// ============================================================================
// 辅助工具与扩展功能
// ============================================================================

/**
 * 计算两个频率之间的拍频 (Beat Frequency)。
 *
 * 当两个频率相近的声音同时发声时，会产生振幅周期性起伏的拍现象。
 *
 * @param f1 - 第一个频率 (Hz)
 * @param f2 - 第二个频率 (Hz)
 * @returns {number} 拍频 (Hz)
 */
export function calculateBeatFrequency(f1: number, f2: number): number {
  return Math.abs(f1 - f2);
}

/**
 * 计算指定弦长和张力的基频（一维弦振动公式）。
 *
 * 公式：f = (1 / 2L) * sqrt(T / μ)
 *
 * @param length - 弦长 (米)
 * @param tension - 张力 (牛顿)
 * @param linearDensity - 线密度 (kg/m)
 * @returns {number} 基频 (Hz)
 */
export function stringVibrationFrequency(length: number, tension: number, linearDensity: number): number {
  if (length <= 0 || linearDensity <= 0) return 0;
  return (1 / (2 * length)) * Math.sqrt(tension / linearDensity);
}

/**
 * 计算管乐器的空气柱共振频率（开管/闭管）。
 *
 * @param length - 管长 (米)
 * @param speedOfSound - 声速 (m/s，常温约 343)
 * @param openEnd - 是否为开管（两端开口），闭管为一端开口
 * @param harmonic - 谐波序号（基频为 1）
 * @returns {number} 共振频率 (Hz)
 */
export function pipeResonanceFrequency(
  length: number,
  speedOfSound: number = 343,
  openEnd: boolean = true,
  harmonic: number = 1
): number {
  if (length <= 0) return 0;
  if (openEnd) {
    // 开管：支持所有整数倍谐波
    return (harmonic * speedOfSound) / (2 * length);
  } else {
    // 闭管：仅支持奇数倍谐波
    return ((2 * harmonic - 1) * speedOfSound) / (4 * length);
  }
}

/**
 * 计算等响曲线近似值（Fletcher-Munson 简化）。
 *
 * 用于估算不同频率在人耳中感知的相对响度。
 *
 * @param frequency - 频率 (Hz)
 * @param spl - 声压级 (dB SPL)
 * @returns {number} 近似响度级 (phon)
 */
export function equalLoudnessContour(frequency: number, spl: number): number {
  // 基于 ISO 226:2003 的简化近似（经验多项式）
  const f = frequency;
  const correction =
    3.64 * Math.pow(f / 1000, -0.8) -
    6.5 * Math.exp(-0.6 * Math.pow(f / 1000 - 3.3, 2)) +
    1e-3 * Math.pow(f / 1000, 4);
  return spl + correction;
}

/**
 * 计算钢琴调音的偏差（Railsback 曲线近似）。
 *
 * 钢琴调音并非严格十二平均律，高音域会进一步升高，低音域会降低。
 *
 * @param midiNote - MIDI 音符编号
 * @returns {number} 音分偏差（相对于严格十二平均律）
 */
export function pianoStretchTuning(midiNote: number): number {
  // 以 A4 (midi 69) 为中心对称拉伸
  const deviation = midiNote - 69;
  // 经验公式：每偏离一个八度拉伸约 2~5 音分
  return 0.02 * deviation + 0.0005 * deviation * deviation * Math.sign(deviation);
}

/**
 * 根据 MIDI 音符编号生成所有律制的频率对照表。
 *
 * @param midiNote - MIDI 音符编号
 * @param referenceA4 - A4 参考频率
 * @returns {Record<TuningSystem, number>} 各律制下的频率
 */
export function compareTuningSystems(midiNote: number, referenceA4: number = REFERENCE_A4): Record<TuningSystem, number> {
  const tuner = new Tuner(referenceA4);
  const systems = getTuningSystems();
  const result = {} as Record<TuningSystem, number>;
  for (const sys of systems) {
    tuner.tuningSystem = sys.id;
    result[sys.id] = (tuner as any)._getFrequencyInTuning(midiNote, sys.id);
  }
  return result;
}

/**
 * 将音分偏差转换为频率比。
 *
 * 公式：ratio = 2^(cents / 1200)
 *
 * @param cents - 音分
 * @returns {number} 频率比
 */
export function centsToRatio(cents: number): number {
  return Math.pow(2, cents / 1200);
}

/**
 * 将频率比转换为音分。
 *
 * 公式：cents = 1200 * log2(ratio)
 *
 * @param ratio - 频率比
 * @returns {number} 音分
 */
export function ratioToCents(ratio: number): number {
  return 1200 * Math.log2(ratio);
}

/**
 * 检测输入音频的音名与和弦内音的匹配度。
 *
 * 可用于辅助判断乐器演奏是否对准和弦。
 *
 * @param buffer - 输入音频
 * @param chordNotes - 和弦内音频率数组 (Hz)
 * @param toleranceCents - 容差音分（默认 50）
 * @returns {boolean} 是否在容差范围内匹配任一和弦音
 */
export function isPitchInChord(buffer: Float32Array, chordNotes: number[], toleranceCents: number = 50): boolean {
  const detector = new PitchDetector();
  const result = detector.detect(buffer, SAMPLE_RATE);
  if (result.pitch <= 0) return false;

  for (const noteFreq of chordNotes) {
    const cents = 1200 * Math.log2(result.pitch / noteFreq);
    if (Math.abs(cents) <= toleranceCents) return true;
  }
  return false;
}
