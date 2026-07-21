/**
 * AI歌声合成引擎 (AI Vocal Synthesis Engine)
 * 纯TypeScript实现，零外部付费API依赖
 * 支持格式合成、基频追踪、相位声码器、多音色及歌词驱动合成
 */

// ==================== 基础类型与常量 ====================

/** 采样率枚举 */
export type SampleRate = 44100 | 48000;

/** 音频缓冲区类型 */
export type AudioBuffer = Float32Array;

/** 共振峰参数 */
export interface Formant {
  /** 频率 (Hz) */
  frequency: number;
  /** 带宽 (Hz) */
  bandwidth: number;
  /** 振幅 (线性增益) */
  amplitude: number;
}

/** 元音定义 */
export interface VowelDefinition {
  /** 元音标识 */
  symbol: string;
  /** 5个共振峰参数 */
  formants: [Formant, Formant, Formant, Formant, Formant];
  /** 基频偏移系数 */
  f0Shift: number;
  /** 气流噪音比例 */
  breathiness: number;
}

/** 音色类型 */
export type VoiceType =
  | 'soprano'
  | 'mezzo'
  | 'alto'
  | 'tenor'
  | 'baritone'
  | 'bass'
  | 'child'
  | 'robotic'
  | 'electronic';

/** 音色参数 */
export interface TimbreParams {
  /** 共振峰缩放系数 */
  formantScale: number;
  /** 基频范围最小值 */
  f0Min: number;
  /** 基频范围最大值 */
  f0Max: number;
  /** 颤音深度 (Hz) */
  vibratoDepth: number;
  /** 颤音速率 (Hz) */
  vibratoRate: number;
  /** 明亮度 (0-1) */
  brightness: number;
  /** 呼吸音强度 (0-1) */
  breathIntensity: number;
  /** 增益补偿 */
  gainCompensation: number;
}

/** 音素信息 */
export interface PhonemeInfo {
  /** 音素符号 */
  phoneme: string;
  /** 对应元音/辅音标识 */
  symbol: string;
  /** 是否元音 */
  isVowel: boolean;
  /** 建议时长 (秒) */
  duration: number;
}

/** 音符事件 */
export interface NoteEvent {
  /** 音符MIDI编号 (0-127) */
  midiNote: number;
  /** 开始时间 (秒) */
  startTime: number;
  /** 持续时间 (秒) */
  duration: number;
  /** 歌词/拼音 */
  lyric: string;
  /** 力度 (0-1) */
  velocity: number;
  /** 弯音目标 (半音, 可选) */
  pitchBend?: number;
  /** 滑音目标音符 (可选) */
  glissandoTarget?: number;
}

/** 合成配置 */
export interface SynthesisConfig {
  /** 采样率 */
  sampleRate: SampleRate;
  /** 音色类型 */
  voiceType: VoiceType;
  /** 全局力度 */
  globalVelocity: number;
  /** 全局颤音深度 */
  globalVibratoDepth: number;
  /** 全局颤音速率 */
  globalVibratoRate: number;
  /** 滑音速率 (半音/秒) */
  glissandoRate: number;
  /** 呼吸音强度 */
  breathIntensity: number;
  /** 尾音衰减时长 (秒) */
  tailDecay: number;
}

/** 拼音到音素映射条目 */
interface PinyinMapEntry {
  /** 音素列表 */
  phonemes: string[];
  /** 是否为整体认读音节 */
  whole: boolean;
}

/** WAV文件格式选项 */
export interface WavExportOptions {
  /** 采样率 */
  sampleRate: SampleRate;
  /** 声道数 */
  channels: number;
  /** 位深度 */
  bitDepth: 16 | 24 | 32;
}

/** STFT参数 */
export interface StftParams {
  /** 窗大小 */
  windowSize: number;
  /** 跳跃大小 */
  hopSize: number;
  /** FFT大小 */
  fftSize: number;
}

/** 频谱帧 */
export interface SpectralFrame {
  /** 幅度谱 */
  magnitude: Float32Array;
  /** 相位谱 */
  phase: Float32Array;
}

// ==================== 全局常量 ====================

/** 默认采样率 */
export const DEFAULT_SAMPLE_RATE: SampleRate = 44100;

/** 标准音A4频率 */
export const A4_FREQUENCY = 440.0;

/** A4对应的MIDI音符编号 */
export const A4_MIDI_NOTE = 69;

/** 半音频率比 */
export const SEMITONE_RATIO = Math.pow(2, 1 / 12);

/** 中文元音表 (含全部单/复韵母) */
export const CHINESE_VOWELS: readonly string[] = [
  'a', 'e', 'i', 'o', 'u', 'ü', 'er',
  'ai', 'ei', 'ao', 'ou', 'an', 'en', 'in', 'un', 'ün',
  'ang', 'eng', 'ing', 'ong',
  'ia', 'ie', 'iao', 'iu', 'ian', 'iang', 'iong',
  'ua', 'uo', 'uai', 'ui', 'uan', 'uang',
  'üe', 'üan',
  'ong', 'er',
];

/** 拼音到音素基础映射 */
export const PINYIN_TO_PHONEMES: Readonly<Record<string, PinyinMapEntry>> = {
  // 单韵母
  a: { phonemes: ['a'], whole: false },
  o: { phonemes: ['o'], whole: false },
  e: { phonemes: ['e'], whole: false },
  i: { phonemes: ['i'], whole: false },
  u: { phonemes: ['u'], whole: false },
  ü: { phonemes: ['ü'], whole: false },
  er: { phonemes: ['er'], whole: false },
  // 复韵母
  ai: { phonemes: ['a', 'i'], whole: false },
  ei: { phonemes: ['e', 'i'], whole: false },
  ao: { phonemes: ['a', 'o'], whole: false },
  ou: { phonemes: ['o', 'u'], whole: false },
  an: { phonemes: ['a', 'n'], whole: false },
  en: { phonemes: ['e', 'n'], whole: false },
  in: { phonemes: ['i', 'n'], whole: false },
  un: { phonemes: ['u', 'n'], whole: false },
  ün: { phonemes: ['ü', 'n'], whole: false },
  ang: { phonemes: ['a', 'ng'], whole: false },
  eng: { phonemes: ['e', 'ng'], whole: false },
  ing: { phonemes: ['i', 'ng'], whole: false },
  ong: { phonemes: ['o', 'ng'], whole: false },
  // 鼻韵母
  ia: { phonemes: ['i', 'a'], whole: false },
  ie: { phonemes: ['i', 'e'], whole: false },
  iao: { phonemes: ['i', 'a', 'o'], whole: false },
  iu: { phonemes: ['i', 'u'], whole: false },
  ian: { phonemes: ['i', 'a', 'n'], whole: false },
  iang: { phonemes: ['i', 'a', 'ng'], whole: false },
  iong: { phonemes: ['i', 'o', 'ng'], whole: false },
  ua: { phonemes: ['u', 'a'], whole: false },
  uo: { phonemes: ['u', 'o'], whole: false },
  uai: { phonemes: ['u', 'a', 'i'], whole: false },
  ui: { phonemes: ['u', 'i'], whole: false },
  uan: { phonemes: ['u', 'a', 'n'], whole: false },
  uang: { phonemes: ['u', 'a', 'ng'], whole: false },
  üe: { phonemes: ['ü', 'e'], whole: false },
  üan: { phonemes: ['ü', 'a', 'n'], whole: false },
  // 整体认读音节 (简化处理)
  zhi: { phonemes: ['zh', 'i'], whole: true },
  chi: { phonemes: ['ch', 'i'], whole: true },
  shi: { phonemes: ['sh', 'i'], whole: true },
  ri: { phonemes: ['r', 'i'], whole: true },
  zi: { phonemes: ['z', 'i'], whole: true },
  ci: { phonemes: ['c', 'i'], whole: true },
  si: { phonemes: ['s', 'i'], whole: true },
  yi: { phonemes: ['y', 'i'], whole: true },
  wu: { phonemes: ['w', 'u'], whole: true },
  yu: { phonemes: ['y', 'ü'], whole: true },
  ye: { phonemes: ['y', 'e'], whole: true },
  yue: { phonemes: ['y', 'ü', 'e'], whole: true },
  yuan: { phonemes: ['y', 'ü', 'a', 'n'], whole: true },
  yin: { phonemes: ['y', 'i', 'n'], whole: true },
  yun: { phonemes: ['y', 'ü', 'n'], whole: true },
  ying: { phonemes: ['y', 'i', 'ng'], whole: true },
};

// ==================== 工具函数 ====================

/**
 * 将MIDI音符编号转换为频率 (Hz)
 * @param midiNote MIDI音符编号 (0-127)
 * @returns 频率 (Hz)
 */
export function midiToFrequency(midiNote: number): number {
  if (midiNote < 0 || midiNote > 127) {
    throw new RangeError('MIDI note must be between 0 and 127');
  }
  return A4_FREQUENCY * Math.pow(SEMITONE_RATIO, midiNote - A4_MIDI_NOTE);
}

/**
 * 将频率 (Hz) 转换为MIDI音符编号
 * @param frequency 频率 (Hz)
 * @returns MIDI音符编号
 */
export function frequencyToMidi(frequency: number): number {
  if (frequency <= 0) {
    throw new RangeError('Frequency must be positive');
  }
  return A4_MIDI_NOTE + 12 * Math.log2(frequency / A4_FREQUENCY);
}

/**
 * 半音偏移转换为频率比
 * @param semitones 半音数
 * @returns 频率倍率
 */
export function semitoneToRatio(semitones: number): number {
  return Math.pow(SEMITONE_RATIO, semitones);
}

/**
 * 线性插值
 * @param a 起始值
 * @param b 结束值
 * @param t 插值系数 (0-1)
 * @returns 插值结果
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * 平滑步插值 (Smoothstep)
 * @param a 起始值
 * @param b 结束值
 * @param t 插值系数
 * @returns 平滑插值结果
 */
export function smoothstep(a: number, b: number, t: number): number {
  const x = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
}

/**
 * 三次 Hermite 插值
 * @param y0 前一个点
 * @param y1 当前点
 * @param y2 后一个点
 * @param y3 后两个点
 * @param t 插值系数
 * @returns 插值结果
 */
export function cubicInterpolation(y0: number, y1: number, y2: number, y3: number, t: number): number {
  const c0 = y1;
  const c1 = 0.5 * (y2 - y0);
  const c2 = y0 - 2.5 * y1 + 2 * y2 - 0.5 * y3;
  const c3 = 0.5 * (y3 - y0) + 1.5 * (y1 - y2);
  return ((c3 * t + c2) * t + c1) * t + c0;
}

/**
 * 创建汉宁窗 (Hann Window)
 * @param size 窗大小
 * @returns 窗函数值数组
 */
export function createHannWindow(size: number): Float32Array {
  const window = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
  }
  return window;
}

/**
 * 创建汉明窗 (Hamming Window)
 * @param size 窗大小
 * @returns 窗函数值数组
 */
export function createHammingWindow(size: number): Float32Array {
  const window = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    window[i] = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (size - 1));
  }
  return window;
}

/**
 * 创建高斯窗 (Gaussian Window)
 * @param size 窗大小
 * @param alpha 高斯系数 (默认2.5)
 * @returns 窗函数值数组
 */
export function createGaussianWindow(size: number, alpha = 2.5): Float32Array {
  const window = new Float32Array(size);
  const half = (size - 1) / 2;
  for (let i = 0; i < size; i++) {
    const x = (i - half) / half;
    window[i] = Math.exp(-0.5 * Math.pow(alpha * x, 2));
  }
  return window;
}

/**
 * 创建布莱克曼窗 (Blackman Window)
 * @param size 窗大小
 * @returns 窗函数值数组
 */
export function createBlackmanWindow(size: number): Float32Array {
  const window = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    const ratio = (2 * Math.PI * i) / (size - 1);
    window[i] = 0.42 - 0.5 * Math.cos(ratio) + 0.08 * Math.cos(2 * ratio);
  }
  return window;
}

/**
 * 快速傅里叶变换 (Cooley-Tukey FFT)
 * 仅支持2的幂次大小
 * @param real 实部输入
 * @param imag 虚部输入 (会被修改)
 * @param invert 是否逆变换
 */
export function fft(real: Float32Array, imag: Float32Array, invert: boolean): void {
  const n = real.length;
  if (n !== imag.length) {
    throw new Error('Real and imag arrays must have same length');
  }
  if ((n & (n - 1)) !== 0) {
    throw new Error('FFT size must be power of 2');
  }

  // 位反转置换
  let j = 0;
  for (let i = 1; i < n; i++) {
    let bit = n >> 1;
    while (j >= bit) {
      j -= bit;
      bit >>= 1;
    }
    j += bit;
    if (i < j) {
      let temp = real[i];
      real[i] = real[j];
      real[j] = temp;
      temp = imag[i];
      imag[i] = imag[j];
      imag[j] = temp;
    }
  }

  // Cooley-Tukey 蝶形运算
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (2 * Math.PI) / len * (invert ? -1 : 1);
    const wlenReal = Math.cos(ang);
    const wlenImag = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wReal = 1;
      let wImag = 0;
      for (let k = 0; k < len / 2; k++) {
        const uReal = real[i + k];
        const uImag = imag[i + k];
        const vReal = real[i + k + len / 2] * wReal - imag[i + k + len / 2] * wImag;
        const vImag = real[i + k + len / 2] * wImag + imag[i + k + len / 2] * wReal;
        real[i + k] = uReal + vReal;
        imag[i + k] = uImag + vImag;
        real[i + k + len / 2] = uReal - vReal;
        imag[i + k + len / 2] = uImag - vImag;
        const nextWReal = wReal * wlenReal - wImag * wlenImag;
        wImag = wReal * wlenImag + wImag * wlenReal;
        wReal = nextWReal;
      }
    }
  }

  if (invert) {
    for (let i = 0; i < n; i++) {
      real[i] /= n;
      imag[i] /= n;
    }
  }
}

/**
 * 计算实信号的FFT幅度谱
 * @param signal 输入信号
 * @param fftSize FFT大小 (2的幂)
 * @returns 幅度谱 (仅前半部分)
 */
export function computeMagnitudeSpectrum(signal: Float32Array, fftSize: number): Float32Array {
  const real = new Float32Array(fftSize);
  const imag = new Float32Array(fftSize);
  const copyLen = Math.min(signal.length, fftSize);
  real.set(signal.subarray(0, copyLen));
  fft(real, imag, false);
  const half = fftSize / 2 + 1;
  const mag = new Float32Array(half);
  for (let i = 0; i < half; i++) {
    mag[i] = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
  }
  return mag;
}

/**
 * 将 Float32Array 标准化到 [-1, 1] 范围
 * @param buffer 音频缓冲区
 * @returns 标准化后的峰值振幅
 */
export function normalizeBuffer(buffer: Float32Array): number {
  let maxAmp = 0;
  for (let i = 0; i < buffer.length; i++) {
    const abs = Math.abs(buffer[i]);
    if (abs > maxAmp) maxAmp = abs;
  }
  if (maxAmp > 1.0) {
    const scale = 1.0 / maxAmp;
    for (let i = 0; i < buffer.length; i++) {
      buffer[i] *= scale;
    }
  }
  return maxAmp;
}

/**
 * 将音频缓冲区按目标电平标准化 (dBFS)
 * @param buffer 音频缓冲区
 * @param targetDb 目标电平 (如 -3 dBFS)
 */
export function normalizeToDb(buffer: Float32Array, targetDb: number): void {
  let rms = 0;
  for (let i = 0; i < buffer.length; i++) {
    rms += buffer[i] * buffer[i];
  }
  rms = Math.sqrt(rms / buffer.length);
  if (rms < 1e-10) return;
  const targetLinear = Math.pow(10, targetDb / 20);
  const scale = targetLinear / rms;
  for (let i = 0; i < buffer.length; i++) {
    buffer[i] *= scale;
  }
  normalizeBuffer(buffer);
}

/**
 * Float32Array (范围 [-1,1]) 转换为 Int16Array (范围 [-32768, 32767])
 * @param floatBuffer 浮点缓冲区
 * @returns 16位PCM缓冲区
 */
export function floatToInt16(floatBuffer: Float32Array): Int16Array {
  const intBuffer = new Int16Array(floatBuffer.length);
  for (let i = 0; i < floatBuffer.length; i++) {
    const val = Math.max(-1, Math.min(1, floatBuffer[i]));
    intBuffer[i] = val < 0 ? val * 0x8000 : val * 0x7FFF;
  }
  return intBuffer;
}

/**
 * Float32Array 转换为 Int24Array (以Int32Array存储)
 * @param floatBuffer 浮点缓冲区
 * @returns 24位PCM缓冲区
 */
export function floatToInt24(floatBuffer: Float32Array): Int32Array {
  const intBuffer = new Int32Array(floatBuffer.length);
  for (let i = 0; i < floatBuffer.length; i++) {
    const val = Math.max(-1, Math.min(1, floatBuffer[i]));
    intBuffer[i] = val < 0 ? val * 0x800000 : val * 0x7FFFFF;
  }
  return intBuffer;
}

/**
 * 生成指定长度的零填充缓冲区
 * @param length 长度
 * @returns 零缓冲区
 */
export function createZeroBuffer(length: number): Float32Array {
  return new Float32Array(length);
}

/**
 * 将两个音频缓冲区相加 (长度以短的为准)
 * @param a 缓冲区A
 * @param b 缓冲区B
 * @returns 混合后的缓冲区
 */
export function mixBuffers(a: Float32Array, b: Float32Array): Float32Array {
  const len = Math.min(a.length, b.length);
  const result = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    result[i] = a[i] + b[i];
  }
  return result;
}

/**
 * 将音频缓冲区叠加到目标位置 (in-place)
 * @param target 目标缓冲区
 * @param source 源缓冲区
 * @param offset 目标起始偏移 (采样点)
 */
export function addToBuffer(target: Float32Array, source: Float32Array, offset: number): void {
  const start = Math.max(0, offset);
  const end = Math.min(target.length, offset + source.length);
  for (let i = start; i < end; i++) {
    target[i] += source[i - offset];
  }
}

/**
 * 应用增益
 * @param buffer 音频缓冲区
 * @param gain 增益系数
 */
export function applyGain(buffer: Float32Array, gain: number): void {
  for (let i = 0; i < buffer.length; i++) {
    buffer[i] *= gain;
  }
}

/**
 * 淡入处理
 * @param buffer 音频缓冲区
 * @param samples 淡入采样点数
 */
export function applyFadeIn(buffer: Float32Array, samples: number): void {
  const len = Math.min(samples, buffer.length);
  for (let i = 0; i < len; i++) {
    buffer[i] *= i / len;
  }
}

/**
 * 淡出处理
 * @param buffer 音频缓冲区
 * @param samples 淡出采样点数
 */
export function applyFadeOut(buffer: Float32Array, samples: number): void {
  const len = Math.min(samples, buffer.length);
  const start = buffer.length - len;
  for (let i = 0; i < len; i++) {
    buffer[start + i] *= (1 - i / len);
  }
}

/**
 * 生成白噪声
 * @param length 长度
 * @param amplitude 振幅
 * @returns 白噪声缓冲区
 */
export function generateWhiteNoise(length: number, amplitude: number): Float32Array {
  const buffer = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    buffer[i] = (Math.random() * 2 - 1) * amplitude;
  }
  return buffer;
}

/**
 * 生成粉红噪声 (简单近似)
 * @param length 长度
 * @param amplitude 振幅
 * @returns 粉红噪声缓冲区
 */
export function generatePinkNoise(length: number, amplitude: number): Float32Array {
  const buffer = new Float32Array(length);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.96900 * b2 + white * 0.1538520;
    b3 = 0.86650 * b3 + white * 0.3104856;
    b4 = 0.55000 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.0168980;
    const pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
    b6 = white * 0.115926;
    buffer[i] = pink * amplitude;
  }
  return buffer;
}

/**
 * 一阶低通滤波器 (IIR)
 * @param buffer 输入缓冲区
 * @param cutoff 截止频率
 * @param sampleRate 采样率
 * @returns 滤波后的缓冲区
 */
export function lowPassFilter(buffer: Float32Array, cutoff: number, sampleRate: number): Float32Array {
  const rc = 1.0 / (2 * Math.PI * cutoff);
  const dt = 1.0 / sampleRate;
  const alpha = dt / (rc + dt);
  const result = new Float32Array(buffer.length);
  let y = buffer[0];
  for (let i = 0; i < buffer.length; i++) {
    y += alpha * (buffer[i] - y);
    result[i] = y;
  }
  return result;
}

/**
 * 一阶高通滤波器 (IIR)
 * @param buffer 输入缓冲区
 * @param cutoff 截止频率
 * @param sampleRate 采样率
 * @returns 滤波后的缓冲区
 */
export function highPassFilter(buffer: Float32Array, cutoff: number, sampleRate: number): Float32Array {
  const rc = 1.0 / (2 * Math.PI * cutoff);
  const dt = 1.0 / sampleRate;
  const alpha = rc / (rc + dt);
  const result = new Float32Array(buffer.length);
  let y = buffer[0];
  for (let i = 0; i < buffer.length; i++) {
    y = alpha * (y + buffer[i] - (i > 0 ? buffer[i - 1] : buffer[i]));
    result[i] = y;
  }
  return result;
}

// ==================== 元音/共振峰数据 ====================

/**
 * 构建默认共振峰参数
 * @param f1 F1频率
 * @param f2 F2频率
 * @param f3 F3频率
 * @param f4 F4频率
 * @param f5 F5频率
 * @returns 5个共振峰
 */
function makeFormants(
  f1: number, f2: number, f3: number, f4: number, f5: number
): [Formant, Formant, Formant, Formant, Formant] {
  return [
    { frequency: f1, bandwidth: 60, amplitude: 1.0 },
    { frequency: f2, bandwidth: 90, amplitude: 0.8 },
    { frequency: f3, bandwidth: 120, amplitude: 0.6 },
    { frequency: f4, bandwidth: 200, amplitude: 0.4 },
    { frequency: f5, bandwidth: 300, amplitude: 0.2 },
  ];
}

/** 标准中文元音共振峰数据 (基于语音学参考值) */
export const STANDARD_VOWELS: Readonly<Record<string, VowelDefinition>> = {
  a: { symbol: 'a', formants: makeFormants(650, 1100, 2800, 3500, 4500), f0Shift: 0, breathiness: 0.05 },
  o: { symbol: 'o', formants: makeFormants(500, 900, 2600, 3400, 4400), f0Shift: -1, breathiness: 0.04 },
  e: { symbol: 'e', formants: makeFormants(450, 1800, 2700, 3400, 4400), f0Shift: -1, breathiness: 0.05 },
  i: { symbol: 'i', formants: makeFormants(280, 2300, 3000, 3600, 4600), f0Shift: 2, breathiness: 0.03 },
  u: { symbol: 'u', formants: makeFormants(300, 900, 2400, 3300, 4300), f0Shift: -2, breathiness: 0.04 },
  ü: { symbol: 'ü', formants: makeFormants(290, 2100, 2900, 3600, 4600), f0Shift: 1, breathiness: 0.03 },
  er: { symbol: 'er', formants: makeFormants(450, 1400, 2500, 3400, 4400), f0Shift: 0, breathiness: 0.06 },
  // 复韵母采用插值近似
  ai: { symbol: 'ai', formants: makeFormants(700, 1400, 2800, 3500, 4500), f0Shift: 0, breathiness: 0.05 },
  ei: { symbol: 'ei', formants: makeFormants(550, 1900, 2800, 3500, 4500), f0Shift: 0, breathiness: 0.05 },
  ao: { symbol: 'ao', formants: makeFormants(600, 1000, 2700, 3400, 4400), f0Shift: -1, breathiness: 0.05 },
  ou: { symbol: 'ou', formants: makeFormants(450, 850, 2600, 3400, 4400), f0Shift: -1, breathiness: 0.05 },
  an: { symbol: 'an', formants: makeFormants(700, 1300, 2800, 3500, 4500), f0Shift: 0, breathiness: 0.06 },
  en: { symbol: 'en', formants: makeFormants(550, 1800, 2700, 3400, 4400), f0Shift: 0, breathiness: 0.06 },
  in: { symbol: 'in', formants: makeFormants(300, 2300, 3000, 3600, 4600), f0Shift: 1, breathiness: 0.05 },
  un: { symbol: 'un', formants: makeFormants(350, 1400, 2600, 3400, 4400), f0Shift: -1, breathiness: 0.05 },
  ün: { symbol: 'ün', formants: makeFormants(300, 2100, 2900, 3600, 4600), f0Shift: 0, breathiness: 0.05 },
  ang: { symbol: 'ang', formants: makeFormants(750, 1100, 2800, 3500, 4500), f0Shift: -1, breathiness: 0.07 },
  eng: { symbol: 'eng', formants: makeFormants(550, 1700, 2700, 3400, 4400), f0Shift: -1, breathiness: 0.07 },
  ing: { symbol: 'ing', formants: makeFormants(300, 2400, 3000, 3600, 4600), f0Shift: 1, breathiness: 0.06 },
  ong: { symbol: 'ong', formants: makeFormants(400, 900, 2600, 3400, 4400), f0Shift: -2, breathiness: 0.06 },
  // 其他元音近似
  n: { symbol: 'n', formants: makeFormants(250, 1800, 2800, 3500, 4500), f0Shift: 0, breathiness: 0.08 },
  ng: { symbol: 'ng', formants: makeFormants(280, 1200, 2700, 3400, 4400), f0Shift: -1, breathiness: 0.08 },
  zh: { symbol: 'zh', formants: makeFormants(200, 1600, 2800, 3500, 4500), f0Shift: 0, breathiness: 0.1 },
  ch: { symbol: 'ch', formants: makeFormants(220, 1700, 2800, 3500, 4500), f0Shift: 0, breathiness: 0.1 },
  sh: { symbol: 'sh', formants: makeFormants(240, 2000, 3000, 3600, 4600), f0Shift: 0, breathiness: 0.1 },
  r: { symbol: 'r', formants: makeFormants(350, 1400, 2500, 3400, 4400), f0Shift: 0, breathiness: 0.08 },
  z: { symbol: 'z', formants: makeFormants(180, 1500, 2800, 3500, 4500), f0Shift: 0, breathiness: 0.1 },
  c: { symbol: 'c', formants: makeFormants(190, 1600, 2800, 3500, 4500), f0Shift: 0, breathiness: 0.1 },
  s: { symbol: 's', formants: makeFormants(200, 2200, 3200, 3800, 4800), f0Shift: 0, breathiness: 0.12 },
  y: { symbol: 'y', formants: makeFormants(280, 2200, 3000, 3600, 4600), f0Shift: 1, breathiness: 0.05 },
  w: { symbol: 'w', formants: makeFormants(300, 900, 2400, 3300, 4300), f0Shift: -1, breathiness: 0.05 },
  // 默认回退
  default: { symbol: 'a', formants: makeFormants(650, 1100, 2800, 3500, 4500), f0Shift: 0, breathiness: 0.05 },
};

// ==================== 音色参数表 ====================

/** 各音色类型的默认参数 */
export const TIMBRE_PRESETS: Readonly<Record<VoiceType, TimbreParams>> = {
  soprano: {
    formantScale: 1.15,
    f0Min: 250,
    f0Max: 1100,
    vibratoDepth: 6.0,
    vibratoRate: 6.5,
    brightness: 0.85,
    breathIntensity: 0.08,
    gainCompensation: 1.0,
  },
  mezzo: {
    formantScale: 1.05,
    f0Min: 200,
    f0Max: 900,
    vibratoDepth: 5.5,
    vibratoRate: 6.0,
    brightness: 0.75,
    breathIntensity: 0.07,
    gainCompensation: 1.05,
  },
  alto: {
    formantScale: 0.95,
    f0Min: 160,
    f0Max: 750,
    vibratoDepth: 5.0,
    vibratoRate: 5.5,
    brightness: 0.65,
    breathIntensity: 0.06,
    gainCompensation: 1.1,
  },
  tenor: {
    formantScale: 0.9,
    f0Min: 130,
    f0Max: 550,
    vibratoDepth: 4.5,
    vibratoRate: 5.5,
    brightness: 0.7,
    breathIntensity: 0.07,
    gainCompensation: 1.15,
  },
  baritone: {
    formantScale: 0.82,
    f0Min: 100,
    f0Max: 450,
    vibratoDepth: 4.0,
    vibratoRate: 5.0,
    brightness: 0.55,
    breathIntensity: 0.06,
    gainCompensation: 1.2,
  },
  bass: {
    formantScale: 0.75,
    f0Min: 70,
    f0Max: 350,
    vibratoDepth: 3.5,
    vibratoRate: 4.5,
    brightness: 0.45,
    breathIntensity: 0.05,
    gainCompensation: 1.3,
  },
  child: {
    formantScale: 1.25,
    f0Min: 260,
    f0Max: 800,
    vibratoDepth: 3.0,
    vibratoRate: 7.0,
    brightness: 0.9,
    breathIntensity: 0.1,
    gainCompensation: 0.9,
  },
  robotic: {
    formantScale: 1.0,
    f0Min: 80,
    f0Max: 800,
    vibratoDepth: 0.5,
    vibratoRate: 0.0,
    brightness: 0.95,
    breathIntensity: 0.02,
    gainCompensation: 1.0,
  },
  electronic: {
    formantScale: 1.1,
    f0Min: 60,
    f0Max: 1200,
    vibratoDepth: 8.0,
    vibratoRate: 8.0,
    brightness: 1.0,
    breathIntensity: 0.0,
    gainCompensation: 0.95,
  },
};

// ==================== 格式合成器 (Formant Synthesis) ====================

/**
 * 二阶带通滤波器 (模拟单个共振峰)
 * 使用双二阶 (Biquad) 形式
 */
export class Resonator {
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;
  private a0 = 1;
  private a1 = 0;
  private a2 = 0;
  private b0 = 1;
  private b1 = 0;
  private b2 = 0;

  /**
   * 设置共振峰参数
   * @param frequency 中心频率 (Hz)
   * @param bandwidth 带宽 (Hz)
   * @param sampleRate 采样率
   */
  setParams(frequency: number, bandwidth: number, sampleRate: number): void {
    const omega = (2 * Math.PI * frequency) / sampleRate;
    const sinOmega = Math.sin(omega);
    const cosOmega = Math.cos(omega);
    const alpha = sinOmega / (2 * (frequency / bandwidth));

    this.b0 = alpha;
    this.b1 = 0;
    this.b2 = -alpha;
    this.a0 = 1 + alpha;
    this.a1 = -2 * cosOmega;
    this.a2 = 1 - alpha;
  }

  /**
   * 处理单个采样点
   * @param input 输入采样点
   * @returns 输出采样点
   */
  process(input: number): number {
    const output = (this.b0 * input + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2) / this.a0;
    this.x2 = this.x1;
    this.x1 = input;
    this.y2 = this.y1;
    this.y1 = output;
    return output;
  }

  /** 重置状态 */
  reset(): void {
    this.x1 = 0;
    this.x2 = 0;
    this.y1 = 0;
    this.y2 = 0;
  }
}

/**
 * 5共振峰声道滤波器
 */
export class VocalTractFilter {
  private resonators: Resonator[] = [];
  private gains: number[] = [];

  constructor() {
    for (let i = 0; i < 5; i++) {
      this.resonators.push(new Resonator());
      this.gains.push(1.0);
    }
  }

  /**
   * 设置声道参数
   * @param formants 5个共振峰参数
   * @param sampleRate 采样率
   */
  setFormants(formants: [Formant, Formant, Formant, Formant, Formant], sampleRate: number): void {
    for (let i = 0; i < 5; i++) {
      const f = formants[i];
      this.resonators[i].setParams(f.frequency, f.bandwidth, sampleRate);
      this.gains[i] = f.amplitude;
    }
  }

  /**
   * 处理音频块
   * @param input 输入缓冲区
   * @returns 输出缓冲区
   */
  process(input: Float32Array): Float32Array {
    const output = new Float32Array(input.length);
    // 级联通每个共振峰
    for (let i = 0; i < input.length; i++) {
      let sample = input[i];
      for (let r = 0; r < 5; r++) {
        sample = this.resonators[r].process(sample) * this.gains[r];
      }
      output[i] = sample;
    }
    return output;
  }

  /** 重置所有共振器状态 */
  reset(): void {
    for (const r of this.resonators) {
      r.reset();
    }
  }
}

/**
 * 格式合成器核心
 */
export class FormantSynthesizer {
  private filter = new VocalTractFilter();
  private currentVowel: string | null = null;
  private sampleRate: number;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
  }

  /**
   * 设置当前元音
   * @param vowelSymbol 元音符号
   */
  setVowel(vowelSymbol: string): void {
    const vowel = STANDARD_VOWELS[vowelSymbol] || STANDARD_VOWELS.default;
    this.filter.setFormants(vowel.formants, this.sampleRate);
    this.currentVowel = vowelSymbol;
  }

  /**
   * 在元音之间平滑插值过渡
   * @param fromVowel 起始元音
   * @param toVowel 目标元音
   * @param t 过渡系数 (0-1)
   */
  interpolateVowels(fromVowel: string, toVowel: string, t: number): void {
    const v1 = STANDARD_VOWELS[fromVowel] || STANDARD_VOWELS.default;
    const v2 = STANDARD_VOWELS[toVowel] || STANDARD_VOWELS.default;
    const smoothT = t * t * (3 - 2 * t); // smoothstep

    const interpolated: Formant[] = [];
    for (let i = 0; i < 5; i++) {
      interpolated.push({
        frequency: lerp(v1.formants[i].frequency, v2.formants[i].frequency, smoothT),
        bandwidth: lerp(v1.formants[i].bandwidth, v2.formants[i].bandwidth, smoothT),
        amplitude: lerp(v1.formants[i].amplitude, v2.formants[i].amplitude, smoothT),
      });
    }
    this.filter.setFormants(interpolated as [Formant, Formant, Formant, Formant, Formant], this.sampleRate);
  }

  /**
   * 合成声源信号 (气流噪音 + 脉冲串)
   * @param length 采样点数
   * @param f0 基频
   * @param breathiness 气流噪音比例
   * @returns 声源信号
   */
  generateSource(length: number, f0: number, breathiness: number): Float32Array {
    const source = new Float32Array(length);
    const period = this.sampleRate / f0;
    for (let i = 0; i < length; i++) {
      const phase = (i % period) / period;
      // 脉冲串 ( sawtooth-like pulse )
      let pulse = 0;
      if (phase < 0.05) {
        pulse = 1.0 - phase / 0.05;
      } else {
        pulse = -0.1;
      }
      // 气流噪音
      const noise = (Math.random() * 2 - 1) * breathiness;
      source[i] = pulse * (1 - breathiness) + noise;
    }
    return source;
  }

  /**
   * 合成元音片段
   * @param length 采样点数
   * @param f0 基频
   * @param vowelSymbol 元音符号
   * @param amplitude 振幅
   * @returns 合成音频
   */
  synthesize(length: number, f0: number, vowelSymbol: string, amplitude: number): Float32Array {
    const vowel = STANDARD_VOWELS[vowelSymbol] || STANDARD_VOWELS.default;
    this.setVowel(vowelSymbol);
    const source = this.generateSource(length, f0, vowel.breathiness);
    const output = this.filter.process(source);
    for (let i = 0; i < output.length; i++) {
      output[i] *= amplitude;
    }
    return output;
  }

  /** 重置合成器状态 */
  reset(): void {
    this.filter.reset();
    this.currentVowel = null;
  }
}

// ==================== YIN 基频检测算法 ====================

/**
 * YIN算法参数
 */
export interface YinParams {
  /** 最低检测频率 */
  minFrequency: number;
  /** 最高检测频率 */
  maxFrequency: number;
  /** 阈值 */
  threshold: number;
  /** 采样率 */
  sampleRate: number;
}

/**
 * YIN 基频检测实现
 */
export class YinPitchDetector {
  private sampleRate: number;
  private threshold: number;
  private minPeriod: number;
  private maxPeriod: number;

  constructor(params: YinParams) {
    this.sampleRate = params.sampleRate;
    this.threshold = params.threshold;
    this.minPeriod = Math.floor(this.sampleRate / params.maxFrequency);
    this.maxPeriod = Math.floor(this.sampleRate / params.minFrequency);
  }

  /**
   * 计算差分函数 (Difference Function)
   * @param buffer 输入音频
   * @returns 差分值数组
   */
  private differenceFunction(buffer: Float32Array): Float32Array {
    const halfLength = Math.floor(buffer.length / 2);
    const diff = new Float32Array(halfLength);
    for (let tau = 0; tau < halfLength; tau++) {
      let sum = 0;
      for (let j = 0; j < halfLength; j++) {
        const delta = buffer[j] - buffer[j + tau];
        sum += delta * delta;
      }
      diff[tau] = sum;
    }
    return diff;
  }

  /**
   * 累积均值归一化差分函数 (CMNDF)
   * @param diff 差分函数结果
   * @returns CMNDF数组
   */
  private cumulativeMeanNormalizedDifference(diff: Float32Array): Float32Array {
    const cmndf = new Float32Array(diff.length);
    cmndf[0] = 1;
    let runningSum = 0;
    for (let tau = 1; tau < diff.length; tau++) {
      runningSum += diff[tau];
      cmndf[tau] = diff[tau] / (runningSum / tau);
    }
    return cmndf;
  }

  /**
   * 搜索绝对阈值下的最小周期
   * @param cmndf CMNDF数组
   * @returns 周期 (采样点) 或 -1 (未找到)
   */
  private absoluteThreshold(cmndf: Float32Array): number {
    for (let tau = this.minPeriod; tau < Math.min(cmndf.length, this.maxPeriod); tau++) {
      if (cmndf[tau] < this.threshold) {
        // 寻找局部最小值
        while (tau + 1 < cmndf.length && cmndf[tau + 1] < cmndf[tau]) {
          tau++;
        }
        return tau;
      }
    }
    return -1;
  }

  /**
   * 抛物线插值优化周期估计
   * @param cmndf CMNDF数组
   * @param tau 整数周期估计
   * @returns 优化后的浮点周期
   */
  private parabolicInterpolation(cmndf: Float32Array, tau: number): number {
    if (tau <= 0 || tau >= cmndf.length - 1) return tau;
    const alpha = cmndf[tau - 1];
    const beta = cmndf[tau];
    const gamma = cmndf[tau + 1];
    const p = 0.5 * (alpha - gamma) / (alpha - 2 * beta + gamma);
    return tau + p;
  }

  /**
   * 检测单个音频块的基频
   * @param buffer 输入音频块
   * @returns 检测到的基频 (Hz)，未找到返回0
   */
  detectPitch(buffer: Float32Array): number {
    const diff = this.differenceFunction(buffer);
    const cmndf = this.cumulativeMeanNormalizedDifference(diff);
    const tau = this.absoluteThreshold(cmndf);
    if (tau === -1) return 0;
    const betterTau = this.parabolicInterpolation(cmndf, tau);
    return this.sampleRate / betterTau;
  }

  /**
   * 批量检测基频序列
   * @param buffer 完整音频
   * @param windowSize 分析窗大小
   * @param hopSize 帧移
   * @returns 基频序列 (Hz)
   */
  detectPitchSequence(buffer: Float32Array, windowSize: number, hopSize: number): Float32Array {
    const numFrames = Math.floor((buffer.length - windowSize) / hopSize) + 1;
    const f0Sequence = new Float32Array(numFrames);
    for (let i = 0; i < numFrames; i++) {
      const frame = buffer.subarray(i * hopSize, i * hopSize + windowSize);
      f0Sequence[i] = this.detectPitch(frame);
    }
    return f0Sequence;
  }
}

// ==================== 基频合成与处理 ====================

/**
 * 基频平滑处理器
 */
export class F0Smoother {
  private prevF0 = 0;
  private alpha: number;

  /**
   * @param smoothingFactor 平滑系数 (0-1, 越大越平滑)
   */
  constructor(smoothingFactor = 0.3) {
    this.alpha = smoothingFactor;
  }

  /**
   * 处理单个基频值
   * @param f0 当前基频
   * @returns 平滑后的基频
   */
  process(f0: number): number {
    if (this.prevF0 === 0 || f0 === 0) {
      this.prevF0 = f0;
      return f0;
    }
    const smoothed = this.alpha * this.prevF0 + (1 - this.alpha) * f0;
    this.prevF0 = smoothed;
    return smoothed;
  }

  /** 重置状态 */
  reset(): void {
    this.prevF0 = 0;
  }

  /**
   * 对整个序列进行平滑
   * @param sequence 基频序列
   * @returns 平滑后的序列
   */
  processSequence(sequence: Float32Array): Float32Array {
    const result = new Float32Array(sequence.length);
    this.reset();
    for (let i = 0; i < sequence.length; i++) {
      result[i] = this.process(sequence[i]);
    }
    return result;
  }
}

/**
 * 颤音生成器
 */
export class VibratoGenerator {
  private sampleRate: number;
  private depth: number; // Hz
  private rate: number;  // Hz
  private phase = 0;

  constructor(sampleRate: number, depthHz: number, rateHz: number) {
    this.sampleRate = sampleRate;
    this.depth = depthHz;
    this.rate = rateHz;
  }

  /**
   * 设置颤音参数
   * @param depthHz 深度 (Hz)
   * @param rateHz 速率 (Hz)
   */
  setParams(depthHz: number, rateHz: number): void {
    this.depth = depthHz;
    this.rate = rateHz;
  }

  /**
   * 生成颤音调制信号 (以Hz为单位的频率偏移)
   * @param length 采样点数
   * @returns 频率偏移数组
   */
  generate(length: number): Float32Array {
    const mod = new Float32Array(length);
    const phaseInc = (2 * Math.PI * this.rate) / this.sampleRate;
    for (let i = 0; i < length; i++) {
      mod[i] = this.depth * Math.sin(this.phase);
      this.phase += phaseInc;
      if (this.phase >= 2 * Math.PI) this.phase -= 2 * Math.PI;
    }
    return mod;
  }

  /**
   * 生成带颤音的基频曲线
   * @param length 采样点数
   * @param baseF0 基础基频
   * @returns 调制后的基频曲线
   */
  generateF0Curve(length: number, baseF0: number): Float32Array {
    const f0Curve = new Float32Array(length);
    const phaseInc = (2 * Math.PI * this.rate) / this.sampleRate;
    for (let i = 0; i < length; i++) {
      f0Curve[i] = baseF0 + this.depth * Math.sin(this.phase);
      this.phase += phaseInc;
      if (this.phase >= 2 * Math.PI) this.phase -= 2 * Math.PI;
    }
    return f0Curve;
  }

  /** 重置相位 */
  reset(): void {
    this.phase = 0;
  }
}

/**
 * 基频到周期转换器
 */
export class F0ToPeriodConverter {
  private sampleRate: number;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
  }

  /**
   * 将基频转换为周期长度 (采样点)
   * @param f0 基频 (Hz)
   * @returns 周期长度
   */
  convert(f0: number): number {
    if (f0 <= 0) return 0;
    return this.sampleRate / f0;
  }

  /**
   * 批量转换
   * @param f0Sequence 基频序列
   * @returns 周期序列
   */
  convertSequence(f0Sequence: Float32Array): Float32Array {
    const periods = new Float32Array(f0Sequence.length);
    for (let i = 0; i < f0Sequence.length; i++) {
      periods[i] = f0Sequence[i] > 0 ? this.sampleRate / f0Sequence[i] : 0;
    }
    return periods;
  }
}

// ==================== STFT / 相位声码器 / OLA ====================

/**
 * 短时傅里叶变换处理器
 */
export class StftProcessor {
  private sampleRate: number;
  private windowSize: number;
  private hopSize: number;
  private fftSize: number;
  private window: Float32Array;

  constructor(params: StftParams, sampleRate: number, windowType: 'hann' | 'hamming' | 'gaussian' = 'hann') {
    this.sampleRate = sampleRate;
    this.windowSize = params.windowSize;
    this.hopSize = params.hopSize;
    this.fftSize = params.fftSize;
    if (windowType === 'hann') {
      this.window = createHannWindow(this.windowSize);
    } else if (windowType === 'hamming') {
      this.window = createHammingWindow(this.windowSize);
    } else {
      this.window = createGaussianWindow(this.windowSize);
    }
  }

  /**
   * 分析：信号 → 频谱帧序列
   * @param signal 输入信号
   * @returns 频谱帧数组
   */
  analyze(signal: Float32Array): SpectralFrame[] {
    const numFrames = Math.floor((signal.length - this.windowSize) / this.hopSize) + 1;
    const frames: SpectralFrame[] = [];
    const halfFft = this.fftSize / 2 + 1;
    for (let i = 0; i < numFrames; i++) {
      const start = i * this.hopSize;
      const real = new Float32Array(this.fftSize);
      const imag = new Float32Array(this.fftSize);
      for (let j = 0; j < this.windowSize; j++) {
        real[j] = signal[start + j] * this.window[j];
      }
      fft(real, imag, false);
      const mag = new Float32Array(halfFft);
      const phase = new Float32Array(halfFft);
      for (let k = 0; k < halfFft; k++) {
        mag[k] = Math.sqrt(real[k] * real[k] + imag[k] * imag[k]);
        phase[k] = Math.atan2(imag[k], real[k]);
      }
      frames.push({ magnitude: mag, phase });
    }
    return frames;
  }

  /**
   * 合成：频谱帧序列 → 信号 (简化版 Griffin-Lim / OLA)
   * @param frames 频谱帧数组
   * @param outputLength 输出长度
   * @returns 时域信号
   */
  synthesize(frames: SpectralFrame[], outputLength: number): Float32Array {
    const output = new Float32Array(outputLength);
    const windowSum = new Float32Array(outputLength);
    for (let i = 0; i < frames.length; i++) {
      const start = i * this.hopSize;
      const frame = frames[i];
      // 重建完整FFT bin
      const real = new Float32Array(this.fftSize);
      const imag = new Float32Array(this.fftSize);
      for (let k = 0; k < this.fftSize / 2 + 1; k++) {
        real[k] = frame.magnitude[k] * Math.cos(frame.phase[k]);
        imag[k] = frame.magnitude[k] * Math.sin(frame.phase[k]);
        if (k > 0 && k < this.fftSize / 2) {
          real[this.fftSize - k] = real[k];
          imag[this.fftSize - k] = -imag[k];
        }
      }
      fft(real, imag, true);
      // OLA 叠加
      for (let j = 0; j < this.windowSize && start + j < outputLength; j++) {
        const val = real[j] * this.window[j];
        output[start + j] += val;
        windowSum[start + j] += this.window[j] * this.window[j];
      }
    }
    // 窗补偿
    for (let i = 0; i < outputLength; i++) {
      if (windowSum[i] > 0.001) {
        output[i] /= windowSum[i];
      }
    }
    return output;
  }

  /**
   * 频谱包络提取 (基于倒谱法的简化版)
   * @param magnitude 幅度谱
   * @param envelopeSize 包络平滑度
   * @returns 包络谱
   */
  extractEnvelope(magnitude: Float32Array, envelopeSize = 32): Float32Array {
    const logMag = new Float32Array(magnitude.length);
    for (let i = 0; i < magnitude.length; i++) {
      logMag[i] = Math.log(Math.max(1e-10, magnitude[i]));
    }
    // 移动平均作为简化包络
    const envelope = new Float32Array(magnitude.length);
    const half = Math.floor(envelopeSize / 2);
    for (let i = 0; i < magnitude.length; i++) {
      let sum = 0;
      let count = 0;
      for (let j = -half; j <= half; j++) {
        const idx = i + j;
        if (idx >= 0 && idx < logMag.length) {
          sum += logMag[idx];
          count++;
        }
      }
      envelope[i] = Math.exp(sum / count);
    }
    return envelope;
  }

  /**
   * 频谱包络重塑
   * @param magnitude 原始幅度谱
   * @param targetEnvelope 目标包络
   * @returns 重塑后的幅度谱
   */
  reshapeEnvelope(magnitude: Float32Array, targetEnvelope: Float32Array): Float32Array {
    const currentEnvelope = this.extractEnvelope(magnitude);
    const result = new Float32Array(magnitude.length);
    for (let i = 0; i < magnitude.length; i++) {
      const scale = targetEnvelope[i] / Math.max(1e-10, currentEnvelope[i]);
      result[i] = magnitude[i] * scale;
    }
    return result;
  }
}

/**
 * 相位声码器 (Phase Vocoder)
 * 实现基于时间的音高/时长调整
 */
export class PhaseVocoder {
  private sampleRate: number;
  private windowSize: number;
  private hopSize: number;
  private fftSize: number;
  private window: Float32Array;

  constructor(sampleRate: number, windowSize = 2048, hopSize = 512) {
    this.sampleRate = sampleRate;
    this.windowSize = windowSize;
    this.hopSize = hopSize;
    this.fftSize = Math.pow(2, Math.ceil(Math.log2(windowSize)));
    this.window = createHannWindow(windowSize);
  }

  /**
   * 时间拉伸 (不改变音高)
   * @param input 输入信号
   * @param timeScale 时间倍率 (>1变慢, <1变快)
   * @returns 拉伸后的信号
   */
  timeStretch(input: Float32Array, timeScale: number): Float32Array {
    if (timeScale <= 0) return new Float32Array(0);
    const outputLength = Math.floor(input.length * timeScale);
    const output = new Float32Array(outputLength);
    const synthesisHop = Math.floor(this.hopSize * timeScale);
    const numFrames = Math.floor((input.length - this.windowSize) / this.hopSize) + 1;

    // 分析阶段
    const analysisFrames: SpectralFrame[] = [];
    const stft = new StftProcessor(
      { windowSize: this.windowSize, hopSize: this.hopSize, fftSize: this.fftSize },
      this.sampleRate
    );
    analysisFrames.push(...stft.analyze(input));

    // 相位累积合成
    const halfFft = this.fftSize / 2 + 1;
    let prevPhase = new Float32Array(halfFft);
    const expectedPhaseAdvance = new Float32Array(halfFft);
    for (let k = 0; k < halfFft; k++) {
      expectedPhaseAdvance[k] = (2 * Math.PI * this.hopSize * k) / this.fftSize;
    }

    let outputPos = 0;
    for (let i = 0; i < numFrames; i++) {
      const frame = analysisFrames[i];
      const newPhase = new Float32Array(halfFft);
      for (let k = 0; k < halfFft; k++) {
        const deltaPhase = frame.phase[k] - prevPhase[k] - expectedPhaseAdvance[k];
        // 解卷绕到主值区间
        const unwrappedDelta = deltaPhase - Math.round(deltaPhase / (2 * Math.PI)) * 2 * Math.PI;
        const trueFreq = (2 * Math.PI * k) / this.fftSize + unwrappedDelta / this.hopSize;
        newPhase[k] = prevPhase[k] + trueFreq * synthesisHop;
        prevPhase[k] = newPhase[k];
      }

      // IFFT 叠加
      const real = new Float32Array(this.fftSize);
      const imag = new Float32Array(this.fftSize);
      for (let k = 0; k < halfFft; k++) {
        real[k] = frame.magnitude[k] * Math.cos(newPhase[k]);
        imag[k] = frame.magnitude[k] * Math.sin(newPhase[k]);
        if (k > 0 && k < this.fftSize / 2) {
          real[this.fftSize - k] = real[k];
          imag[this.fftSize - k] = -imag[k];
        }
      }
      fft(real, imag, true);

      for (let j = 0; j < this.windowSize && outputPos + j < outputLength; j++) {
        output[outputPos + j] += real[j] * this.window[j];
      }
      outputPos += synthesisHop;
    }

    return output;
  }

  /**
   * 音高偏移 (不改变时长)
   * 使用重采样+时间拉伸组合
   * @param input 输入信号
   * @param pitchShift 半音偏移
   * @returns 音高偏移后的信号
   */
  pitchShift(input: Float32Array, pitchShift: number): Float32Array {
    const ratio = semitoneToRatio(pitchShift);
    // 先改变采样率 (时间变长/短)
    const resampled = this.resample(input, ratio);
    // 再时间拉伸补偿
    return this.timeStretch(resampled, 1.0 / ratio);
  }

  /**
   * 简单重采样 (线性插值)
   * @param input 输入
   * @param ratio 采样率比 (output/input)
   * @returns 重采样信号
   */
  private resample(input: Float32Array, ratio: number): Float32Array {
    const outputLength = Math.floor(input.length / ratio);
    const output = new Float32Array(outputLength);
    for (let i = 0; i < outputLength; i++) {
      const pos = i * ratio;
      const idx = Math.floor(pos);
      const frac = pos - idx;
      const s0 = input[idx] || 0;
      const s1 = input[idx + 1] || 0;
      output[i] = s0 + frac * (s1 - s0);
    }
    return output;
  }
}

// ==================== 歌声处理效果 ====================

/**
 * 音高弯曲 (Pitch Bend) 处理器
 */
export class PitchBendProcessor {
  /**
   * 生成音高弯曲曲线
   * @param length 采样点数
   * @param sampleRate 采样率
   * @param fromSemitone 起始偏移 (半音)
   * @param toSemitone 目标偏移 (半音)
   * @param curveType 曲线类型
   * @returns 频率倍率曲线
   */
  generateBendCurve(
    length: number,
    sampleRate: number,
    fromSemitone: number,
    toSemitone: number,
    curveType: 'linear' | 'exp' | 'sigmoid' = 'sigmoid'
  ): Float32Array {
    const curve = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      const t = i / length;
      let eased: number;
      if (curveType === 'linear') {
        eased = t;
      } else if (curveType === 'exp') {
        eased = t * t;
      } else {
        eased = smoothstep(0, 1, t);
      }
      const semitones = lerp(fromSemitone, toSemitone, eased);
      curve[i] = semitoneToRatio(semitones);
    }
    return curve;
  }
}

/**
 * 滑音 (Glissando) 处理器
 */
export class GlissandoProcessor {
  /**
   * 生成滑音基频曲线
   * @param length 采样点数
   * @param sampleRate 采样率
   * @param fromFreq 起始频率
   * @param toFreq 目标频率
   * @param rate 滑音速率 (半音/秒)
   * @returns 基频曲线
   */
  generateGlissandoCurve(
    length: number,
    sampleRate: number,
    fromFreq: number,
    toFreq: number,
    rate: number
  ): Float32Array {
    const curve = new Float32Array(length);
    const fromMidi = frequencyToMidi(fromFreq);
    const toMidi = frequencyToMidi(toFreq);
    const semitoneDistance = toMidi - fromMidi;
    const duration = length / sampleRate;
    const requiredRate = semitoneDistance / duration;
    const actualRate = Math.abs(requiredRate) > Math.abs(rate) ? (requiredRate > 0 ? rate : -rate) : requiredRate;

    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      const currentSemitone = fromMidi + actualRate * t;
      curve[i] = midiToFrequency(Math.min(toMidi, Math.max(fromMidi, currentSemitone)));
    }
    return curve;
  }
}

/**
 * 波音 (Mordent/Trill 类装饰音) 处理器
 */
export class MordentProcessor {
  /**
   * 生成波音调制曲线 (频率偏移)
   * @param length 采样点数
   * @param sampleRate 采样率
   * @param depthSemitone 深度 (半音)
   * @param rateHz 速率 (Hz)
   * @param type 'upper' 上波音, 'lower' 下波音
   * @returns 频率倍率曲线
   */
  generateMordentCurve(
    length: number,
    sampleRate: number,
    depthSemitone: number,
    rateHz: number,
    type: 'upper' | 'lower' = 'upper'
  ): Float32Array {
    const curve = new Float32Array(length);
    const sign = type === 'upper' ? 1 : -1;
    const phaseInc = (2 * Math.PI * rateHz) / sampleRate;
    let phase = 0;
    for (let i = 0; i < length; i++) {
      const mod = Math.sin(phase) > 0 ? sign * depthSemitone : 0;
      curve[i] = semitoneToRatio(mod);
      phase += phaseInc;
    }
    return curve;
  }
}

/**
 * 力度 (Dynamics) 包络生成器
 */
export class DynamicsEnvelope {
  /**
   * 生成ADSR+长尾包络
   * @param length 采样点数
   * @param sampleRate 采样率
   * @param attack 起音时间 (秒)
   * @param decay 衰减时间 (秒)
   * @param sustain  sustain电平 (0-1)
   * @param release 释音时间 (秒)
   * @param tail 尾音衰减时间 (秒)
   * @param peakVelocity 峰值力度 (0-1)
   * @returns 包络数组
   */
  generateEnvelope(
    length: number,
    sampleRate: number,
    attack: number,
    decay: number,
    sustain: number,
    release: number,
    tail: number,
    peakVelocity: number
  ): Float32Array {
    const envelope = new Float32Array(length);
    const attackSamples = Math.floor(attack * sampleRate);
    const decaySamples = Math.floor(decay * sampleRate);
    const releaseStart = Math.floor(Math.max(0, length - (release + tail) * sampleRate));
    const releaseSamples = Math.floor(release * sampleRate);

    for (let i = 0; i < length; i++) {
      let value: number;
      if (i < attackSamples) {
        value = (i / attackSamples) * peakVelocity;
      } else if (i < attackSamples + decaySamples) {
        const t = (i - attackSamples) / decaySamples;
        value = peakVelocity * (1 - t * (1 - sustain));
      } else if (i < releaseStart) {
        value = peakVelocity * sustain;
      } else if (i < releaseStart + releaseSamples) {
        const t = (i - releaseStart) / releaseSamples;
        value = peakVelocity * sustain * (1 - t);
      } else {
        const t = (i - releaseStart - releaseSamples) / (tail * sampleRate);
        value = peakVelocity * sustain * Math.exp(-5 * t);
      }
      envelope[i] = Math.max(0, value);
    }
    return envelope;
  }

  /**
   * 生成歌词驱动的自然力度曲线
   * 模拟真实歌唱中音节首重读、尾渐弱
   * @param length 采样点数
   * @param sampleRate 采样率
   * @param syllables 音节数量
   * @param baseVelocity 基础力度
   * @returns 力度曲线
   */
  generateSingingDynamics(length: number, sampleRate: number, syllables: number, baseVelocity: number): Float32Array {
    const envelope = new Float32Array(length);
    const samplesPerSyllable = Math.floor(length / Math.max(1, syllables));
    for (let s = 0; s < syllables; s++) {
      const start = s * samplesPerSyllable;
      const end = Math.min(length, (s + 1) * samplesPerSyllable);
      const segLen = end - start;
      // 每个音节：微起音 → 保持 → 微衰减
      for (let i = 0; i < segLen; i++) {
        const t = i / segLen;
        const shape = Math.sin(Math.PI * Math.pow(1 - t, 0.5));
        envelope[start + i] = baseVelocity * (0.7 + 0.3 * shape);
      }
    }
    // 句尾整体渐弱
    for (let i = 0; i < length; i++) {
      const t = i / length;
      envelope[i] *= (1 - 0.3 * t * t);
    }
    return envelope;
  }
}

/**
 * 呼吸音生成器
 */
export class BreathGenerator {
  private sampleRate: number;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
  }

  /**
   * 生成呼吸音
   * @param length 采样点数
   * @param intensity 强度 (0-1)
   * @returns 呼吸音频冲
   */
  generate(length: number, intensity: number): Float32Array {
    // 粉红噪声作为基础
    const noise = generatePinkNoise(length, intensity * 0.15);
    // 高通模拟气流 (主要能量在2kHz-8kHz)
    const filtered = highPassFilter(noise, 800, this.sampleRate);
    const filtered2 = lowPassFilter(filtered, 8000, this.sampleRate);
    // 随机包络模拟气流脉冲
    for (let i = 0; i < length; i++) {
      const t = i / length;
      // 呼吸通常在乐句间隙
      const breathShape = Math.exp(-Math.pow((t - 0.5) * 6, 2));
      filtered2[i] *= breathShape;
    }
    return filtered2;
  }

  /**
   * 在音频中注入呼吸音
   * @param target 目标音频
   * @param positions 呼吸位置 (采样点偏移数组)
   * @param intensity 呼吸强度
   */
  injectBreath(target: Float32Array, positions: number[], intensity: number): void {
    const breathLen = Math.floor(0.15 * this.sampleRate); // 150ms 呼吸
    for (const pos of positions) {
      const breath = this.generate(breathLen, intensity);
      addToBuffer(target, breath, pos);
    }
  }
}

/**
 * 尾音衰减处理器
 */
export class TailDecayProcessor {
  /**
   * 应用尾音衰减
   * @param buffer 输入音频
   * @param sampleRate 采样率
   * @param decayTime 衰减时间常数 (秒)
   */
  applyDecay(buffer: Float32Array, sampleRate: number, decayTime: number): void {
    const releaseStart = this.findReleasePoint(buffer);
    if (releaseStart < 0 || releaseStart >= buffer.length) return;
    const tau = decayTime * sampleRate;
    for (let i = releaseStart; i < buffer.length; i++) {
      const t = (i - releaseStart) / tau;
      buffer[i] *= Math.exp(-t);
    }
  }

  /**
   * 检测释放点 (能量骤降处)
   * @param buffer 音频
   * @returns 释放点索引
   */
  private findReleasePoint(buffer: Float32Array): number {
    // 从后往前找能量开始下降的位置
    const windowSize = 256;
    let lastEnergy = 0;
    for (let i = buffer.length - windowSize; i >= 0; i -= windowSize) {
      let energy = 0;
      for (let j = 0; j < windowSize; j++) {
        energy += buffer[i + j] * buffer[i + j];
      }
      if (lastEnergy > 0 && energy < lastEnergy * 0.3) {
        return i + windowSize;
      }
      lastEnergy = energy;
    }
    return Math.floor(buffer.length * 0.85);
  }
}

// ==================== 多音色合成 ====================

/**
 * 音色插值器
 */
export class TimbreInterpolator {
  /**
   * 在两个音色参数之间插值
   * @param a 音色A
   * @param b 音色B
   * @param t 插值系数 (0-1)
   * @returns 插值后的音色参数
   */
  interpolate(a: TimbreParams, b: TimbreParams, t: number): TimbreParams {
    return {
      formantScale: lerp(a.formantScale, b.formantScale, t),
      f0Min: lerp(a.f0Min, b.f0Min, t),
      f0Max: lerp(a.f0Max, b.f0Max, t),
      vibratoDepth: lerp(a.vibratoDepth, b.vibratoDepth, t),
      vibratoRate: lerp(a.vibratoRate, b.vibratoRate, t),
      brightness: lerp(a.brightness, b.brightness, t),
      breathIntensity: lerp(a.breathIntensity, b.breathIntensity, t),
      gainCompensation: lerp(a.gainCompensation, b.gainCompensation, t),
    };
  }

  /**
   * 将音色参数应用到元音共振峰
   * @param vowel 原始元音定义
   * @param timbre 音色参数
   * @returns 调制后的元音定义
   */
  applyTimbreToVowel(vowel: VowelDefinition, timbre: TimbreParams): VowelDefinition {
    const scaledFormants: Formant[] = vowel.formants.map((f, idx) => {
      const brightnessBoost = timbre.brightness * (idx < 2 ? 1.2 : 0.8);
      return {
        frequency: f.frequency * timbre.formantScale * (1 + brightnessBoost * 0.1),
        bandwidth: f.bandwidth * (1.1 - timbre.brightness * 0.2),
        amplitude: f.amplitude * (0.5 + timbre.brightness * 0.5),
      };
    });
    return {
      symbol: vowel.symbol,
      formants: scaledFormants as [Formant, Formant, Formant, Formant, Formant],
      f0Shift: vowel.f0Shift,
      breathiness: vowel.breathiness * (1 + timbre.breathIntensity),
    };
  }
}

// ==================== 歌词到歌声引擎 ====================

/**
 * 拼音解析器
 */
export class PinyinParser {
  private toneMarks: Readonly<Record<string, number>> = {
    ā: 1, á: 2, ǎ: 3, à: 4,
    ē: 1, é: 2, ě: 3, è: 4,
    ī: 1, í: 2, ǐ: 3, ì: 4,
    ō: 1, ó: 2, ǒ: 3, ò: 4,
    ū: 1, ú: 2, ǔ: 3, ù: 4,
    ǖ: 1, ǘ: 2, ǚ: 3, ǜ: 4,
    'ü': 0, 'ǖ': 1, 'ǘ': 2, 'ǚ': 3, 'ǜ': 4,
  };

  private toneToNumberMap: Readonly<Record<string, string>> = {
    ā: 'a1', á: 'a2', ǎ: 'a3', à: 'a4',
    ē: 'e1', é: 'e2', ě: 'e3', è: 'e4',
    ī: 'i1', í: 'i2', ǐ: 'i3', ì: 'i4',
    ō: 'o1', ó: 'o2', ǒ: 'o3', ò: 'o4',
    ū: 'u1', ú: 'u2', ǔ: 'u3', ù: 'u4',
    ǖ: 'v1', ǘ: 'v2', ǚ: 'v3', ǜ: 'v4',
  };

  /**
   * 解析带声调字符的拼音，提取声调
   * @param syllable 拼音音节
   * @returns [无声调拼音, 声调(0-4)]
   */
  extractTone(syllable: string): [string, number] {
    let tone = 0;
    let clean = '';
    for (const char of syllable) {
      if (this.toneMarks[char] !== undefined) {
        tone = this.toneMarks[char];
        const plain = this.toneToNumberMap[char]?.charAt(0) || char.normalize('NFD').charAt(0);
        clean += plain;
      } else {
        clean += char;
      }
    }
    // 如果包含数字声调标记
    const match = clean.match(/^(.*?)([1-5])$/);
    if (match) {
      clean = match[1];
      tone = parseInt(match[2], 10);
      if (tone === 5) tone = 0;
    }
    return [clean, tone];
  }

  /**
   * 将拼音字符串解析为音素序列
   * @param pinyinStr 拼音字符串 (如 "ni3 hao3")
   * @returns 音素信息数组
   */
  parsePinyin(pinyinStr: string): PhonemeInfo[] {
    const phonemes: PhonemeInfo[] = [];
    const syllables = pinyinStr.toLowerCase().trim().split(/\s+/);
    for (const syllable of syllables) {
      if (!syllable) continue;
      const [clean, tone] = this.extractTone(syllable);
      const entry = PINYIN_TO_PHONEMES[clean] || PINYIN_TO_PHONEMES.default;
      if (!entry) {
        // 回退：逐字符解析
        for (const char of clean) {
          phonemes.push({ phoneme: char, symbol: char, isVowel: 'aeiouü'.includes(char), duration: 0.1 });
        }
        continue;
      }
      // 根据声调调整元音时长
      const toneDurationFactors = [1.0, 1.1, 1.3, 0.9, 0.6]; // 轻声/1/2/3/4
      const factor = toneDurationFactors[tone] ?? 1.0;
      for (const ph of entry.phonemes) {
        const isVowel = 'aeiouü'.includes(ph) || ph === 'er';
        const baseDur = isVowel ? 0.15 : 0.05;
        phonemes.push({
          phoneme: ph,
          symbol: ph,
          isVowel,
          duration: baseDur * factor * (isVowel ? 1.0 : 0.6),
        });
      }
    }
    return phonemes;
  }

  /**
   * 简单汉字到拼音映射表 (常用字)
   */
  private pinyinMap: Readonly<Record<string, string>> = {
    '你': 'ni3', '好': 'hao3', '我': 'wo3', '是': 'shi4', '的': 'de5',
    '一': 'yi1', '二': 'er4', '三': 'san1', '四': 'si4', '五': 'wu3',
    '六': 'liu4', '七': 'qi1', '八': 'ba1', '九': 'jiu3', '十': 'shi2',
    '天': 'tian1', '地': 'di4', '人': 'ren2', '大': 'da4', '小': 'xiao3',
    '中': 'zhong1', '国': 'guo2', '爱': 'ai4', '歌': 'ge1', '唱': 'chang4',
    '声': 'sheng1', '音': 'yin1', '乐': 'yue4', '曲': 'qu3', '美': 'mei3',
    '梦': 'meng4', '想': 'xiang3', '心': 'xin1', '情': 'qing2', '风': 'feng1',
    '云': 'yun2', '雨': 'yu3', '雪': 'xue3', '花': 'hua1', '月': 'yue4',
    '日': 'ri4', '星': 'xing1', '海': 'hai3', '山': 'shan1', '水': 'shui3',
    '春': 'chun1', '夏': 'xia4', '秋': 'qiu1', '冬': 'dong1', '来': 'lai2',
    '去': 'qu4', '上': 'shang4', '下': 'xia4', '左': 'zuo3', '右': 'you4',
    '东': 'dong1', '南': 'nan2', '西': 'xi1', '北': 'bei3', '前': 'qian2',
    '后': 'hou4', '高': 'gao1', '低': 'di1', '长': 'chang2', '短': 'duan3',
    '明': 'ming2', '暗': 'an4', '红': 'hong2', '绿': 'lv4', '蓝': 'lan2',
    '白': 'bai2', '黑': 'hei1', '金': 'jin1', '银': 'yin2', '光': 'guang1',
    '夜': 'ye4', '晓': 'xiao3', '朝': 'zhao1', '夕': 'xi1', '年': 'nian2',
    '岁': 'sui4', '时': 'shi2', '分': 'fen1', '秒': 'miao3', '刻': 'ke4',
    '路': 'lu4', '道': 'dao4', '街': 'jie1', '巷': 'xiang4', '门': 'men2',
    '窗': 'chuang1', '房': 'fang2', '屋': 'wu1', '楼': 'lou2', '台': 'tai2',
    '家': 'jia1', '乡': 'xiang1', '城': 'cheng2', '市': 'shi4', '村': 'cun1',
    '河': 'he2', '湖': 'hu2', '江': 'jiang1', '溪': 'xi1', '泉': 'quan2',
    '林': 'lin2', '森': 'sen1', '树': 'shu4', '草': 'cao3', '木': 'mu4',
    '鸟': 'niao3', '鱼': 'yu2', '虫': 'chong2', '兽': 'shou4', '龙': 'long2',
    '凤': 'feng4', '虎': 'hu3', '狼': 'lang2', '马': 'ma3', '牛': 'niu2',
    '羊': 'yang2', '鸡': 'ji1', '鸭': 'ya1', '鹅': 'e2', '狗': 'gou3',
    '猫': 'mao1', '猪': 'zhu1', '兔': 'tu4', '鼠': 'shu3', '蛇': 'she2',
  };

  /**
   * 简单汉字转拼音 (有限支持)
   * @param text 中文字符串
   * @returns 拼音字符串
   */
  hanziToPinyin(text: string): string {
    const chars = Array.from(text);
    const pinyinArr: string[] = [];
    for (const ch of chars) {
      if (this.pinyinMap[ch]) {
        pinyinArr.push(this.pinyinMap[ch]);
      } else if (/[a-zA-Z0-9\s]/.test(ch)) {
        pinyinArr.push(ch.toLowerCase());
      }
    }
    return pinyinArr.join(' ');
  }
}

/**
 * 音符到频率映射器
 */
export class NoteFrequencyMapper {
  /**
   * 将音符名称转为频率
   * @param noteName 音符名 (如 "C4", "A#5", "Gb3")
   * @returns 频率 (Hz)
   */
  noteNameToFrequency(noteName: string): number {
    const match = noteName.match(/^([A-Ga-g])([#b]?)(-?\d+)$/);
    if (!match) throw new Error(`Invalid note name: ${noteName}`);
    const noteLetter = match[1].toUpperCase();
    const accidental = match[2];
    const octave = parseInt(match[3], 10);
    const semitoneMap: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    let semitone = semitoneMap[noteLetter];
    if (accidental === '#') semitone += 1;
    if (accidental === 'b') semitone -= 1;
    const midiNote = (octave + 1) * 12 + semitone;
    return midiToFrequency(midiNote);
  }

  /**
   * 批量映射
   * @param noteNames 音符名数组
   * @returns 频率数组
   */
  mapNotes(noteNames: string[]): number[] {
    return noteNames.map((n) => this.noteNameToFrequency(n));
  }
}

/**
 * 音素时长分配器
 */
export class PhonemeDurationAllocator {
  /**
   * 根据音符时长分配音素时长
   * @param phonemes 音素列表
   * @param noteDuration 音符总时长 (秒)
   * @returns 每个音素的时长数组 (秒)
   */
  allocate(phonemes: PhonemeInfo[], noteDuration: number): number[] {
    if (phonemes.length === 0) return [];
    const totalWeight = phonemes.reduce((sum, p) => sum + (p.isVowel ? 2.0 : 0.8), 0);
    const unit = noteDuration / totalWeight;
    return phonemes.map((p) => unit * (p.isVowel ? 2.0 : 0.8));
  }

  /**
   * 考虑拼音调型的时长分配
   * @param phonemes 音素列表
   * @param noteDuration 音符总时长
   * @param tone 声调 (0-4)
   * @returns 时长数组
   */
  allocateWithTone(phonemes: PhonemeInfo[], noteDuration: number, tone: number): number[] {
    const base = this.allocate(phonemes, noteDuration);
    // 三声拉长，四声缩短
    const toneFactors = [1.0, 1.0, 1.1, 1.25, 0.85];
    const factor = toneFactors[tone] ?? 1.0;
    // 重新归一化
    const scaled = base.map((d) => d * factor);
    const sum = scaled.reduce((a, b) => a + b, 0);
    if (sum > 0) {
      const norm = noteDuration / sum;
      return scaled.map((d) => d * norm);
    }
    return base;
  }
}

// ==================== 整句歌声渲染引擎 ====================

/**
 * 歌声片段渲染器
 */
export class SingingVoiceRenderer {
  private sampleRate: number;
  private config: SynthesisConfig;
  private parser = new PinyinParser();
  private formantSynth: FormantSynthesizer;
  private vibratoGen: VibratoGenerator;
  private dynamics = new DynamicsEnvelope();
  private breathGen: BreathGenerator;
  private tailDecay = new TailDecayProcessor();
  private timbreInterp = new TimbreInterpolator();
  private noteMapper = new NoteFrequencyMapper();

  constructor(config: SynthesisConfig) {
    this.sampleRate = config.sampleRate;
    this.config = config;
    this.formantSynth = new FormantSynthesizer(this.sampleRate);
    const timbre = TIMBRE_PRESETS[config.voiceType];
    this.vibratoGen = new VibratoGenerator(this.sampleRate, config.globalVibratoDepth || timbre.vibratoDepth, config.globalVibratoRate || timbre.vibratoRate);
    this.breathGen = new BreathGenerator(this.sampleRate);
  }

  /**
   * 渲染单个音符事件
   * @param note 音符事件
   * @returns 渲染后的音频缓冲区
   */
  renderNote(note: NoteEvent): Float32Array {
    const timbre = TIMBRE_PRESETS[this.config.voiceType];
    const baseFreq = midiToFrequency(note.midiNote);
    const length = Math.floor((note.duration + this.config.tailDecay) * this.sampleRate);
    const output = createZeroBuffer(length);

    // 解析歌词拼音
    const pinyin = this.parser.hanziToPinyin(note.lyric) || note.lyric;
    const phonemes = this.parser.parsePinyin(pinyin);
    const allocator = new PhonemeDurationAllocator();
    const durations = allocator.allocate(phonemes, note.duration);

    // 计算每个音素的起始采样点
    let currentPos = 0;
    const phonemeStarts: number[] = [];
    for (const dur of durations) {
      phonemeStarts.push(currentPos);
      currentPos += Math.floor(dur * this.sampleRate);
    }

    // 生成基频曲线 (含颤音、弯音、滑音)
    const f0Curve = this.generateF0Curve(note, length);

    // 生成力度包络
    const envelope = this.dynamics.generateEnvelope(
      length,
      this.sampleRate,
      0.02,
      0.05,
      0.85,
      0.08,
      this.config.tailDecay,
      note.velocity * this.config.globalVelocity
    );

    // 逐音素合成
    for (let pIdx = 0; pIdx < phonemes.length; pIdx++) {
      const ph = phonemes[pIdx];
      const startSample = phonemeStarts[pIdx] || 0;
      const endSample = (phonemeStarts[pIdx + 1] || currentPos);
      const phLength = Math.min(endSample - startSample, length - startSample);
      if (phLength <= 0) continue;

      // 获取调制后的元音定义
      const vowelDef = STANDARD_VOWELS[ph.symbol] || STANDARD_VOWELS.default;
      const modulatedVowel = this.timbreInterp.applyTimbreToVowel(vowelDef, timbre);

      // 生成声源
      const breathiness = modulatedVowel.breathiness * this.config.breathIntensity;
      const source = this.formantSynth.generateSource(phLength, f0Curve[startSample] || baseFreq, breathiness);

      // 设置共振峰
      this.formantSynth.getFilter().setFormants(modulatedVowel.formants, this.sampleRate);
      const filtered = this.formantSynth.getFilter().process(source);

      // 叠加到输出
      for (let i = 0; i < phLength && startSample + i < length; i++) {
        output[startSample + i] += filtered[i] * envelope[startSample + i] * timbre.gainCompensation;
      }
    }

    // 添加呼吸音 (在音符起始处)
    if (this.config.breathIntensity > 0) {
      const breath = this.breathGen.generate(Math.floor(0.08 * this.sampleRate), this.config.breathIntensity);
      addToBuffer(output, breath, 0);
    }

    // 尾音衰减
    this.tailDecay.applyDecay(output, this.sampleRate, this.config.tailDecay * 0.5);

    return output;
  }

  /**
   * 生成基频曲线
   * @param note 音符事件
   * @param length 采样点数
   * @returns 基频曲线
   */
  private generateF0Curve(note: NoteEvent, length: number): Float32Array {
    const baseFreq = midiToFrequency(note.midiNote);
    const curve = new Float32Array(length);
    const timbre = TIMBRE_PRESETS[this.config.voiceType];

    // 基础颤音
    this.vibratoGen.reset();
    const vibrato = this.vibratoGen.generate(length);

    for (let i = 0; i < length; i++) {
      let f0 = baseFreq + vibrato[i];

      // 弯音
      if (note.pitchBend !== undefined) {
        const bendRatio = semitoneToRatio(note.pitchBend * (i / length));
        f0 *= bendRatio;
      }

      // 滑音
      if (note.glissandoTarget !== undefined) {
        const targetFreq = midiToFrequency(note.glissandoTarget);
        const gliss = new GlissandoProcessor();
        const glissCurve = gliss.generateGlissandoCurve(length, this.sampleRate, baseFreq, targetFreq, this.config.glissandoRate);
        f0 = glissCurve[i];
      }

      // 音色基频偏移
      f0 *= Math.pow(SEMITONE_RATIO, timbre.f0Min > 0 ? 0 : 0); // 占位，实际由timbre.formantScale间接影响
      curve[i] = Math.max(50, f0);
    }
    return curve;
  }

  /**
   * 渲染整句歌词
   * @param notes 音符事件数组
   * @returns 完整音频缓冲区
   */
  renderPhrase(notes: NoteEvent[]): Float32Array {
    if (notes.length === 0) return createZeroBuffer(0);

    // 计算总时长
    const lastNote = notes[notes.length - 1];
    const totalDuration = lastNote.startTime + lastNote.duration + this.config.tailDecay + 0.5;
    const totalSamples = Math.floor(totalDuration * this.sampleRate);
    const output = createZeroBuffer(totalSamples);

    // 计算呼吸位置 (音符间隙)
    const breathPositions: number[] = [];
    for (let i = 1; i < notes.length; i++) {
      const gap = notes[i].startTime - (notes[i - 1].startTime + notes[i - 1].duration);
      if (gap > 0.1) {
        breathPositions.push(Math.floor((notes[i - 1].startTime + notes[i - 1].duration) * this.sampleRate));
      }
    }

    // 渲染每个音符并叠加
    for (const note of notes) {
      const noteBuffer = this.renderNote(note);
      const offset = Math.floor(note.startTime * this.sampleRate);
      addToBuffer(output, noteBuffer, offset);
    }

    // 注入呼吸音
    if (this.config.breathIntensity > 0) {
      this.breathGen.injectBreath(output, breathPositions, this.config.breathIntensity);
    }

    // 标准化防止削波
    normalizeBuffer(output);
    return output;
  }

  /**
   * 获取底层格式合成器
   */
  getFormantSynth(): FormantSynthesizer {
    return this.formantSynth;
  }

  /** 重置渲染器状态 */
  reset(): void {
    this.formantSynth.reset();
    this.vibratoGen.reset();
  }
}

// 为 SingingVoiceRenderer 的私有方法提供类型扩展
declare module './vocalSynthesis' {
  interface FormantSynthesizer {
    getFilter(): VocalTractFilter;
  }
}

// 动态添加 getFilter 方法到 FormantSynthesizer 原型
(FormantSynthesizer.prototype as unknown as Record<string, unknown>).getFilter = function (): VocalTractFilter {
  return (this as { filter: VocalTractFilter }).filter;
};

// ==================== WAV 文件导出 ====================

/**
 * WAV 文件生成器
 */
export class WavExporter {
  /**
   * 生成标准RIFF WAV文件的Uint8Array
   * @param audioData 音频数据 (Float32Array, [-1, 1])
   * @param options 导出选项
   * @returns WAV文件的Uint8Array
   */
  static export(audioData: Float32Array, options: WavExportOptions): Uint8Array {
    const { sampleRate, channels, bitDepth } = options;
    let pcmData: ArrayBufferLike;
    let dataLength: number;

    if (bitDepth === 16) {
      const int16 = floatToInt16(audioData);
      pcmData = int16.buffer;
      dataLength = int16.length * 2;
    } else if (bitDepth === 24) {
      const int24 = floatToInt24(audioData);
      // 24位需要打包成3字节
      pcmData = new ArrayBuffer(int24.length * 3);
      const view = new DataView(pcmData);
      for (let i = 0; i < int24.length; i++) {
        const val = int24[i];
        view.setInt8(i * 3, (val >> 0) & 0xFF);
        view.setInt8(i * 3 + 1, (val >> 8) & 0xFF);
        view.setInt8(i * 3 + 2, (val >> 16) & 0xFF);
      }
      dataLength = int24.length * 3;
    } else {
      // 32-bit float
      pcmData = audioData.buffer.slice(audioData.byteOffset, audioData.byteOffset + audioData.byteLength);
      dataLength = audioData.length * 4;
    }

    const headerSize = 44;
    const totalSize = headerSize + dataLength;
    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);

    const writeString = (offset: number, str: string): void => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    // RIFF chunk descriptor
    writeString(0, 'RIFF');
    view.setUint32(4, totalSize - 8, true);
    writeString(8, 'WAVE');

    // fmt sub-chunk
    writeString(12, 'fmt ');
    view.setUint32(16, bitDepth === 32 ? 18 : 16, true); // Subchunk1Size
    view.setUint16(20, bitDepth === 32 ? 3 : 1, true); // AudioFormat (1=PCM, 3=IEEE float)
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * channels * (bitDepth / 8), true); // ByteRate
    view.setUint16(32, channels * (bitDepth / 8), true); // BlockAlign
    view.setUint16(34, bitDepth, true); // BitsPerSample

    // 扩展fmt (32-bit float 需要)
    if (bitDepth === 32) {
      view.setUint16(36, 0, true); // Extra param size
      writeString(38, 'data');
      view.setUint32(42, dataLength, true);
    } else {
      // data sub-chunk
      writeString(36, 'data');
      view.setUint32(40, dataLength, true);
    }

    // 写入PCM数据
    const dataOffset = bitDepth === 32 ? 46 : 44;
    const pcmView = new Uint8Array(pcmData);
    const outputView = new Uint8Array(buffer, dataOffset, dataLength);
    outputView.set(pcmView);

    return new Uint8Array(buffer);
  }

  /**
   * 生成 Blob (浏览器环境可用)
   * @param audioData 音频数据
   * @param options 导出选项
   * @returns WAV Blob
   */
  static exportBlob(audioData: Float32Array, options: WavExportOptions): Blob {
    const wavArray = WavExporter.export(audioData, options);
    return new Blob([wavArray as any], { type: 'audio/wav' });
  }

  /**
   * 生成 Data URL (浏览器环境可用)
   * @param audioData 音频数据
   * @param options 导出选项
   * @returns Data URL 字符串
   */
  static exportDataUrl(audioData: Float32Array, options: WavExportOptions): string {
    const wavArray = WavExporter.export(audioData, options);
    let binary = '';
    const bytes = new Uint8Array(wavArray);
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return 'data:audio/wav;base64,' + btoa(binary);
  }
}

// ==================== 主合成引擎 ====================

/**
 * AI 歌声合成主引擎
 * 整合所有子系统，提供高层API
 */
export class VocalSynthesisEngine {
  private config: SynthesisConfig;
  private renderer: SingingVoiceRenderer;
  private exporter = WavExporter;

  constructor(config: Partial<SynthesisConfig> = {}) {
    this.config = {
      sampleRate: config.sampleRate || DEFAULT_SAMPLE_RATE,
      voiceType: config.voiceType || 'soprano',
      globalVelocity: config.globalVelocity ?? 0.8,
      globalVibratoDepth: config.globalVibratoDepth ?? 5.0,
      globalVibratoRate: config.globalVibratoRate ?? 6.0,
      glissandoRate: config.glissandoRate ?? 8.0,
      breathIntensity: config.breathIntensity ?? 0.06,
      tailDecay: config.tailDecay ?? 0.2,
    };
    this.renderer = new SingingVoiceRenderer(this.config);
  }

  /**
   * 更新配置
   * @param config 部分配置项
   */
  updateConfig(config: Partial<SynthesisConfig>): void {
    this.config = { ...this.config, ...config };
    this.renderer = new SingingVoiceRenderer(this.config);
  }

  /**
   * 获取当前配置
   */
  getConfig(): SynthesisConfig {
    return { ...this.config };
  }

  /**
   * 合成单音符
   * @param note 音符事件
   * @returns 音频缓冲区
   */
  synthesizeNote(note: NoteEvent): Float32Array {
    return this.renderer.renderNote(note);
  }

  /**
   * 合成整句歌声
   * @param notes 音符序列
   * @returns 音频缓冲区
   */
  synthesizePhrase(notes: NoteEvent[]): Float32Array {
    return this.renderer.renderPhrase(notes);
  }

  /**
   * 根据简谱歌词合成
   * @param lyrics 歌词数组 (每个元素对应一个音符)
   * @param notes 音符名数组 (如 ["C4", "D4", "E4"])
   * @param durations 时长数组 (秒)
   * @returns 音频缓冲区
   */
  synthesizeFromLyricsAndNotes(lyrics: string[], notes: string[], durations: number[]): Float32Array {
    if (lyrics.length !== notes.length || notes.length !== durations.length) {
      throw new Error('lyrics, notes, and durations must have the same length');
    }
    const mapper = new NoteFrequencyMapper();
    const events: NoteEvent[] = [];
    let currentTime = 0;
    for (let i = 0; i < notes.length; i++) {
      const freq = mapper.noteNameToFrequency(notes[i]);
      const midi = frequencyToMidi(freq);
      events.push({
        midiNote: Math.round(midi),
        startTime: currentTime,
        duration: durations[i],
        lyric: lyrics[i],
        velocity: 0.8,
      });
      currentTime += durations[i];
    }
    return this.synthesizePhrase(events);
  }

  /**
   * 导出 WAV Uint8Array
   * @param audioData 音频数据
   * @param bitDepth 位深度
   * @returns WAV文件数据
   */
  exportWav(audioData: Float32Array, bitDepth: 16 | 24 | 32 = 16): Uint8Array {
    return this.exporter.export(audioData, {
      sampleRate: this.config.sampleRate,
      channels: 1,
      bitDepth,
    });
  }

  /**
   * 导出 WAV Blob (浏览器环境)
   * @param audioData 音频数据
   * @param bitDepth 位深度
   * @returns WAV Blob
   */
  exportWavBlob(audioData: Float32Array, bitDepth: 16 | 24 | 32 = 16): Blob {
    return this.exporter.exportBlob(audioData, {
      sampleRate: this.config.sampleRate,
      channels: 1,
      bitDepth,
    });
  }

  /** 重置引擎状态 */
  reset(): void {
    this.renderer.reset();
  }
}

// ==================== 便捷函数 ====================

/**
 * 快速合成单音 (便捷函数)
 * @param freq 频率 (Hz)
 * @param duration 时长 (秒)
 * @param vowel 元音
 * @param sampleRate 采样率
 * @returns 音频缓冲区
 */
export function quickSynthesizeTone(freq: number, duration: number, vowel = 'a', sampleRate: SampleRate = DEFAULT_SAMPLE_RATE): Float32Array {
  const synth = new FormantSynthesizer(sampleRate);
  const length = Math.floor(duration * sampleRate);
  const buffer = synth.synthesize(length, freq, vowel, 0.5);
  normalizeBuffer(buffer);
  return buffer;
}

/**
 * 快速导出单音为 WAV
 * @param freq 频率
 * @param duration 时长
 * @param vowel 元音
 * @param sampleRate 采样率
 * @returns WAV Uint8Array
 */
export function quickExportToneWav(freq: number, duration: number, vowel = 'a', sampleRate: SampleRate = DEFAULT_SAMPLE_RATE): Uint8Array {
  const buffer = quickSynthesizeTone(freq, duration, vowel, sampleRate);
  return WavExporter.export(buffer, { sampleRate, channels: 1, bitDepth: 16 });
}

/**
 * 检测音频基频序列 (便捷函数)
 * @param buffer 音频数据
 * @param sampleRate 采样率
 * @returns 基频序列
 */
export function quickDetectPitch(buffer: Float32Array, sampleRate: number): Float32Array {
  const detector = new YinPitchDetector({
    sampleRate,
    minFrequency: 50,
    maxFrequency: 1500,
    threshold: 0.15,
  });
  return detector.detectPitchSequence(buffer, 2048, 512);
}

// ==================== 默认导出 ====================

export default VocalSynthesisEngine;
