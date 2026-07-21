/**
 * =============================================================================
 * RealisticArrangerEngine - 真人级别伴奏/编曲引擎
 * =============================================================================
 * 纯 TypeScript 实现，严格模式兼容。
 * 支持物理建模乐器合成、人性化演奏、非传统伴奏技术、智能编曲与多轨混音。
 * @author AI Composer Engine
 * @version 1.0.0
 * =============================================================================
 */

// ==================== 全局常量 ====================
const SAMPLE_RATE = 44100;
const TWO_PI = Math.PI * 2;
const MAX_TRACKS = 16;

// ==================== 核心类型定义 ====================

/** 音符事件 */
export interface NoteEvent {
  /** 音符 MIDI 编号 */
  midi: number;
  /** 起始时间（秒） */
  startTime: number;
  /** 持续时间（秒） */
  duration: number;
  /** 力度 0-1 */
  velocity: number;
  /** 可选滑音目标 */
  slideTo?: number;
  /** 可选装饰音列表 */
  ornaments?: number[];
}

/** 轨道配置 */
export interface TrackConfig {
  /** 轨道名称 */
  name: string;
  /** 乐器类型 */
  instrument: InstrumentType;
  /** 增益 0-2 */
  gain: number;
  /** 声像 -1~1 */
  pan: number;
  /** 是否静音 */
  mute: boolean;
  /** 是否独奏 */
  solo: boolean;
  /** 高频增益 dB */
  highShelfDb: number;
  /** 低频增益 dB */
  lowShelfDb: number;
}

/** 乐器类型枚举 */
export type InstrumentType =
  | "piano"
  | "acousticGuitar"
  | "electricGuitar"
  | "bass"
  | "drumKit"
  | "violin"
  | "cello"
  | "flute"
  | "saxophone"
  | "synth"
  | "guzheng"
  | "erhu"
  | "pipa"
  | "dizi"
  | "xiao"
  | "luoGu"
  | "yangQin"
  | "suoNa";

/** 风格类型 */
export type StyleType =
  | "pop"
  | "rock"
  | "jazz"
  | "electronic"
  | "classical"
  | "folk"
  | "chinese"
  | "rnb"
  | "metal"
  | "blues";

/** 情绪类型 */
export type EmotionType = "happy" | "sad" | "tense" | "relaxed" | "epic" | "romantic";

/** 段落类型 */
export type SectionType = "intro" | "verse" | "preChorus" | "chorus" | "bridge" | "outro";

/** 段落定义 */
export interface Section {
  type: SectionType;
  bars: number;
  chordProgression: ChordEvent[];
}

/** 和弦事件 */
export interface ChordEvent {
  startBar: number;
  durationBars: number;
  root: number;
  quality: ChordQuality;
}

/** 和弦性质 */
export type ChordQuality =
  | "major"
  | "minor"
  | "dim"
  | "aug"
  | "maj7"
  | "min7"
  | "dom7"
  | "sus2"
  | "sus4"
  | "add9"
  | "m7b5"
  | "9"
  | "min9";

/** 伴奏生成输入参数 */
export interface ArrangementInput {
  key: string;
  bpm: number;
  style: StyleType;
  sections: Section[];
  emotion: EmotionType;
  totalDuration?: number;
}

/** 多轨音频输出 */
export interface MultiTrackOutput {
  tracks: Float32Array[];
  mixed: Float32Array;
  sampleRate: number;
  duration: number;
}

/** MIDI 风格事件序列 */
export interface MidiEvent {
  type: "noteOn" | "noteOff";
  track: number;
  midi: number;
  time: number;
  velocity: number;
}

/** 效果器参数 */
export interface EffectParams {
  reverbAmount: number;
  delayTime: number;
  delayFeedback: number;
  chorusRate: number;
  chorusDepth: number;
}

// ==================== 音频数学工具 ====================

/**
 * 音频工具类，提供基础信号生成与处理函数
 */
export class AudioUtils {
  /** 生成白噪声 */
  static whiteNoise(length: number): Float32Array {
    const buf = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      buf[i] = Math.random() * 2 - 1;
    }
    return buf;
  }

  /** 生成粉红噪声（近似） */
  static pinkNoise(length: number): Float32Array {
    const buf = new Float32Array(length);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      buf[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }
    return buf;
  }

  /** 正弦波 */
  static sineWave(freq: number, duration: number, amp = 1.0, phase = 0): Float32Array {
    const len = Math.floor(duration * SAMPLE_RATE);
    const buf = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      buf[i] = Math.sin(TWO_PI * freq * i / SAMPLE_RATE + phase) * amp;
    }
    return buf;
  }

  /** 锯齿波 */
  static sawWave(freq: number, duration: number, amp = 1.0): Float32Array {
    const len = Math.floor(duration * SAMPLE_RATE);
    const buf = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      const t = (i * freq / SAMPLE_RATE) % 1;
      buf[i] = (2 * t - 1) * amp;
    }
    return buf;
  }

  /** 方波 */
  static squareWave(freq: number, duration: number, amp = 1.0): Float32Array {
    const len = Math.floor(duration * SAMPLE_RATE);
    const buf = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      const t = (i * freq / SAMPLE_RATE) % 1;
      buf[i] = (t < 0.5 ? 1 : -1) * amp;
    }
    return buf;
  }

  /** 三角波 */
  static triangleWave(freq: number, duration: number, amp = 1.0): Float32Array {
    const len = Math.floor(duration * SAMPLE_RATE);
    const buf = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      const t = (i * freq / SAMPLE_RATE) % 1;
      buf[i] = (4 * Math.abs(t - 0.5) - 1) * amp;
    }
    return buf;
  }

  /** 指数衰减包络 */
  static expDecay(length: number, decayTime: number): Float32Array {
    const env = new Float32Array(length);
    const tau = decayTime * SAMPLE_RATE;
    for (let i = 0; i < length; i++) {
      env[i] = Math.exp(-i / tau);
    }
    return env;
  }

  /** ADSR 包络 */
  static adsr(length: number, attack: number, decay: number, sustain: number, release: number): Float32Array {
    const env = new Float32Array(length);
    const aSamples = Math.max(1, Math.floor(attack * SAMPLE_RATE));
    const dSamples = Math.max(1, Math.floor(decay * SAMPLE_RATE));
    const rSamples = Math.max(1, Math.floor(release * SAMPLE_RATE));
    for (let i = 0; i < length; i++) {
      if (i < aSamples) {
        env[i] = i / aSamples;
      } else if (i < aSamples + dSamples) {
        const t = (i - aSamples) / dSamples;
        env[i] = 1 - (1 - sustain) * t;
      } else if (i < length - rSamples) {
        env[i] = sustain;
      } else {
        const t = (i - (length - rSamples)) / rSamples;
        env[i] = sustain * (1 - t);
      }
    }
    return env;
  }

  /** 简单一阶低通滤波器（IIR） */
  static lowpass(input: Float32Array, cutoffHz: number): Float32Array {
    const rc = 1.0 / (TWO_PI * cutoffHz);
    const dt = 1.0 / SAMPLE_RATE;
    const alpha = dt / (rc + dt);
    const out = new Float32Array(input.length);
    let y = input[0] ?? 0;
    for (let i = 0; i < input.length; i++) {
      y += alpha * (input[i] - y);
      out[i] = y;
    }
    return out;
  }

  /** 简单一阶高通滤波器（IIR） */
  static highpass(input: Float32Array, cutoffHz: number): Float32Array {
    const rc = 1.0 / (TWO_PI * cutoffHz);
    const dt = 1.0 / SAMPLE_RATE;
    const alpha = rc / (rc + dt);
    const out = new Float32Array(input.length);
    let y = input[0] ?? 0;
    let prevX = input[0] ?? 0;
    for (let i = 0; i < input.length; i++) {
      y = alpha * (y + input[i] - prevX);
      out[i] = y;
      prevX = input[i];
    }
    return out;
  }

  /** 共振峰滤波器（模拟 vocal tract） */
  static formantFilter(input: Float32Array, freq: number, q: number): Float32Array {
    const w0 = TWO_PI * freq / SAMPLE_RATE;
    const cosw0 = Math.cos(w0);
    const sinw0 = Math.sin(w0);
    const alpha = sinw0 / (2 * q);
    const a0 = 1 + alpha;
    const a1 = -2 * cosw0;
    const a2 = 1 - alpha;
    const b0 = (1 - cosw0) / 2;
    const b1 = 1 - cosw0;
    const b2 = b0;
    const out = new Float32Array(input.length);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < input.length; i++) {
      const x0 = input[i];
      const y0 = (b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
      out[i] = y0;
      x2 = x1; x1 = x0;
      y2 = y1; y1 = y0;
    }
    return out;
  }

  /** 硬削波失真 */
  static hardClip(input: Float32Array, threshold: number): Float32Array {
    const out = new Float32Array(input.length);
    for (let i = 0; i < input.length; i++) {
      out[i] = Math.max(-threshold, Math.min(threshold, input[i]));
    }
    return out;
  }

  /** 软过载失真 */
  static softClip(input: Float32Array, drive: number): Float32Array {
    const out = new Float32Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const x = input[i] * drive;
      out[i] = Math.tanh(x);
    }
    return out;
  }

  /** 将 buffer 混入目标（支持偏移） */
  static mixInto(target: Float32Array, source: Float32Array, offset: number, amp = 1.0): void {
    for (let i = 0; i < source.length; i++) {
      const idx = offset + i;
      if (idx >= 0 && idx < target.length) {
        target[idx] += source[i] * amp;
      }
    }
  }

  /** MIDI 转频率 */
  static midiToFreq(midi: number): number {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  /** 频率转 MIDI */
  static freqToMidi(freq: number): number {
    return 69 + 12 * Math.log2(freq / 440);
  }

  /** 获取和弦音高列表 */
  static chordToMidi(root: number, quality: ChordQuality): number[] {
    const intervals: Record<ChordQuality, number[]> = {
      major: [0, 4, 7],
      minor: [0, 3, 7],
      dim: [0, 3, 6],
      aug: [0, 4, 8],
      maj7: [0, 4, 7, 11],
      min7: [0, 3, 7, 10],
      dom7: [0, 4, 7, 10],
      sus2: [0, 2, 7],
      sus4: [0, 5, 7],
      add9: [0, 4, 7, 14],
      m7b5: [0, 3, 6, 10],
      "9": [0, 4, 7, 10, 14],
      min9: [0, 3, 7, 10, 14],
    };
    return intervals[quality].map((semitone) => root + semitone);
  }

  /** 计算 buffer RMS */
  static rms(buf: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      sum += buf[i] * buf[i];
    }
    return Math.sqrt(sum / buf.length);
  }

  /** 线性插值 */
  static lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  /** 高斯分布随机数（Box-Muller） */
  static gaussianRandom(mean = 0, std = 1): number {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    const mag = std * Math.sqrt(-2.0 * Math.log(u));
    return mean + mag * Math.cos(TWO_PI * v);
  }

  /** 计算 buffer 峰值 */
  static peak(buf: Float32Array): number {
    let max = 0;
    for (let i = 0; i < buf.length; i++) {
      const abs = Math.abs(buf[i]);
      if (abs > max) max = abs;
    }
    return max;
  }

  /** 简单压缩器 */
  static compress(input: Float32Array, threshold: number, ratio: number): Float32Array {
    const out = new Float32Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const sample = input[i];
      if (Math.abs(sample) > threshold) {
        const sign = sample < 0 ? -1 : 1;
        const excess = Math.abs(sample) - threshold;
        out[i] = sign * (threshold + excess / ratio);
      } else {
        out[i] = sample;
      }
    }
    return out;
  }

  /** 快速卷积（简单实现，适用于短核） */
  static convolve(input: Float32Array, kernel: Float32Array): Float32Array {
    const out = new Float32Array(input.length + kernel.length - 1);
    for (let i = 0; i < input.length; i++) {
      for (let j = 0; j < kernel.length; j++) {
        out[i + j] += input[i] * kernel[j];
      }
    }
    return out;
  }
}

// ==================== 效果处理器 ====================

/**
 *  Schroeder 混响（简化版）
 *  使用多个梳状滤波器 + 全通滤波器串联模拟房间混响
 */
export class ReverbProcessor {
  private combDelays = [1557, 1617, 1491, 1422, 1277, 1356, 1188, 1116];
  private allpassDelays = [225, 556, 441, 341];
  private combFeedback = 0.84;
  private allpassFeedback = 0.5;

  process(input: Float32Array, amount: number): Float32Array {
    if (amount <= 0) return new Float32Array(input);
    const len = input.length;
    const out = new Float32Array(len);

    // 梳状滤波器并行组
    const combBuffers = this.combDelays.map((d) => new Float32Array(d));
    const combIndices = new Int32Array(this.combDelays.length);
    const allpassBuffers = this.allpassDelays.map((d) => new Float32Array(d));
    const allpassIndices = new Int32Array(this.allpassDelays.length);

    for (let i = 0; i < len; i++) {
      let sample = input[i];
      let combSum = 0;
      for (let c = 0; c < this.combDelays.length; c++) {
        const delayLen = this.combDelays[c];
        const idx = combIndices[c];
        const delayed = combBuffers[c][idx];
        combBuffers[c][idx] = sample + delayed * this.combFeedback;
        combSum += delayed;
        combIndices[c] = (idx + 1) % delayLen;
      }
      let allpassIn = combSum / this.combDelays.length;

      // 全通滤波器串联
      for (let a = 0; a < this.allpassDelays.length; a++) {
        const delayLen = this.allpassDelays[a];
        const idx = allpassIndices[a];
        const delayed = allpassBuffers[a][idx];
        const allpassOut = -allpassIn + delayed;
        allpassBuffers[a][idx] = allpassIn + delayed * this.allpassFeedback;
        allpassIn = allpassOut;
        allpassIndices[a] = (idx + 1) % delayLen;
      }

      out[i] = input[i] * (1 - amount) + allpassIn * amount;
    }

    return out;
  }
}

/**
 * 延迟效果器（Delay）
 * 支持反馈与时变声像
 */
export class DelayProcessor {
  process(input: Float32Array, delayTimeSec: number, feedback: number, amount: number): Float32Array {
    if (amount <= 0 || delayTimeSec <= 0) return new Float32Array(input);
    const delaySamples = Math.floor(delayTimeSec * SAMPLE_RATE);
    const len = input.length;
    const out = new Float32Array(len);
    const delayLine = new Float32Array(delaySamples);
    let writeIndex = 0;

    for (let i = 0; i < len; i++) {
      const delayed = delayLine[writeIndex];
      const sample = input[i] + delayed * feedback;
      delayLine[writeIndex] = sample;
      out[i] = input[i] * (1 - amount) + delayed * amount;
      writeIndex = (writeIndex + 1) % delaySamples;
    }

    return out;
  }
}

/**
 * 合唱效果器（Chorus）
 * 使用 LFO 调制延迟时间产生厚度和声感
 */
export class ChorusProcessor {
  process(input: Float32Array, rate: number, depth: number, amount: number): Float32Array {
    if (amount <= 0) return new Float32Array(input);
    const len = input.length;
    const out = new Float32Array(len);
    const maxDelay = Math.floor(0.03 * SAMPLE_RATE); // 30ms max
    const delayLine = new Float32Array(maxDelay);
    let writeIndex = 0;

    for (let i = 0; i < len; i++) {
      const lfo = Math.sin(TWO_PI * rate * i / SAMPLE_RATE);
      const modDelay = (1 + lfo) * 0.5 * depth * maxDelay;
      const readIndex = (writeIndex - Math.floor(modDelay) + maxDelay) % maxDelay;
      const frac = modDelay - Math.floor(modDelay);
      const a = delayLine[readIndex];
      const b = delayLine[(readIndex + 1) % maxDelay];
      const delayed = a + (b - a) * frac;

      delayLine[writeIndex] = input[i];
      out[i] = input[i] * (1 - amount) + delayed * amount;
      writeIndex = (writeIndex + 1) % maxDelay;
    }

    return out;
  }
}

// ==================== 乐器合成器基类 ====================

/**
 * 乐器合成器抽象基类
 * 所有具体乐器继承此类，实现 renderNote 方法
 */
export abstract class InstrumentSynthesizer {
  /** 乐器类型 */
  abstract readonly type: InstrumentType;

  /** 合成单个音符，返回音频 buffer */
  abstract renderNote(note: NoteEvent, emotion: EmotionType): Float32Array;

  /** 多音符渲染 */
  renderNotes(notes: NoteEvent[], emotion: EmotionType): Float32Array {
    if (notes.length === 0) return new Float32Array(0);
    const maxEnd = Math.max(...notes.map((n) => Math.floor((n.startTime + n.duration) * SAMPLE_RATE)));
    const output = new Float32Array(maxEnd + Math.floor(SAMPLE_RATE * 2));
    for (const note of notes) {
      const buf = this.renderNote(note, emotion);
      const offset = Math.floor(note.startTime * SAMPLE_RATE);
      AudioUtils.mixInto(output, buf, offset, note.velocity);
    }
    return output;
  }
}

// ==================== 西方乐器合成器 ====================

/**
 * 钢琴合成器
 * 多个谐波（12个泛音）+ 指数衰减包络 + 弦间共鸣模拟 + 踏板共振
 */
export class PianoSynthesizer extends InstrumentSynthesizer {
  readonly type = "piano" as const;

  renderNote(note: NoteEvent, _emotion: EmotionType): Float32Array {
    const freq = AudioUtils.midiToFreq(note.midi);
    const duration = note.duration;
    const len = Math.floor((duration + 4.0) * SAMPLE_RATE);
    const buf = new Float32Array(len);

    // 12个泛音
    const harmonics = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const harmonicAmps = [1.0, 0.55, 0.35, 0.25, 0.18, 0.12, 0.08, 0.06, 0.04, 0.03, 0.02, 0.015];

    for (let h = 0; h < harmonics.length; h++) {
      const hf = freq * harmonics[h];
      const hAmp = harmonicAmps[h] * note.velocity;
      const decay = 0.3 + 2.0 / harmonics[h]; // 高频衰减更快
      const phase = Math.random() * TWO_PI;
      for (let i = 0; i < len; i++) {
        const t = i / SAMPLE_RATE;
        const env = Math.exp(-t / decay);
        buf[i] += Math.sin(TWO_PI * hf * t + phase) * hAmp * env;
      }
    }

    // 弦间共鸣（模拟其他弦的微弱振动）
    const sympatheticFreqs = [freq * 1.4983, freq * 1.3348, freq * 1.1892];
    for (const sf of sympatheticFreqs) {
      const sPhase = Math.random() * TWO_PI;
      for (let i = 0; i < len; i++) {
        const t = i / SAMPLE_RATE;
        const env = Math.exp(-t / 1.5) * 0.03 * note.velocity;
        buf[i] += Math.sin(TWO_PI * sf * t + sPhase) * env;
      }
    }

    // 踏板共振（低频噪声混响感）
    const pedalNoise = AudioUtils.pinkNoise(len);
    const pedalEnv = AudioUtils.expDecay(len, 2.0);
    for (let i = 0; i < len; i++) {
      buf[i] += pedalNoise[i] * pedalEnv[i] * 0.02 * note.velocity;
    }

    return buf;
  }
}

/**
 * 原声吉他合成器
 * Karplus-Strong 拨弦算法（噪声激发 + 循环移位 + 低通滤波）+ 滑音效果
 */
export class AcousticGuitarSynthesizer extends InstrumentSynthesizer {
  readonly type = "acousticGuitar" as const;

  renderNote(note: NoteEvent, _emotion: EmotionType): Float32Array {
    const freq = AudioUtils.midiToFreq(note.midi);
    const duration = note.duration + 2.0;
    const len = Math.floor(duration * SAMPLE_RATE);
    const delaySamples = SAMPLE_RATE / freq;
    const buf = new Float32Array(len);

    // Karplus-Strong 初始化
    const delayLineSize = Math.ceil(delaySamples);
    const delayLine = new Float32Array(delayLineSize);
    for (let i = 0; i < delayLineSize; i++) {
      delayLine[i] = (Math.random() * 2 - 1) * note.velocity;
    }

    let readIndex = 0;
    let prevSample = 0;
    const filterCoeff = 0.5; // 简单平均低通

    for (let i = 0; i < len; i++) {
      const current = delayLine[readIndex];
      const filtered = filterCoeff * (current + prevSample);
      prevSample = current;
      delayLine[readIndex] = filtered * 0.995; // 衰减
      buf[i] = filtered;
      readIndex = (readIndex + 1) % delayLineSize;
    }

    // 滑音效果
    if (note.slideTo !== undefined) {
      const targetFreq = AudioUtils.midiToFreq(note.slideTo);
      const slideStart = Math.floor(note.duration * 0.5 * SAMPLE_RATE);
      const slideEnd = Math.min(len, Math.floor(note.duration * SAMPLE_RATE));
      for (let i = slideStart; i < slideEnd; i++) {
        const t = (i - slideStart) / (slideEnd - slideStart);
        const f = AudioUtils.lerp(freq, targetFreq, t);
        // 简单频率偏移近似（通过重采样相位调制）
        buf[i] *= Math.sin(TWO_PI * f * i / SAMPLE_RATE) * 0.5;
      }
    }

    return buf;
  }
}

/**
 * 电吉他合成器
 * Karplus-Strong + 失真/过载 + 哇音效果
 */
export class ElectricGuitarSynthesizer extends InstrumentSynthesizer {
  readonly type = "electricGuitar" as const;

  renderNote(note: NoteEvent, _emotion: EmotionType): Float32Array {
    const freq = AudioUtils.midiToFreq(note.midi);
    const duration = note.duration + 1.5;
    const len = Math.floor(duration * SAMPLE_RATE);
    const buf = new Float32Array(len);

    // Karplus-Strong 基础
    const delaySamples = SAMPLE_RATE / freq;
    const delayLineSize = Math.ceil(delaySamples);
    const delayLine = new Float32Array(delayLineSize);
    for (let i = 0; i < delayLineSize; i++) {
      delayLine[i] = (Math.random() * 2 - 1) * note.velocity;
    }

    let readIndex = 0;
    let prevSample = 0;
    for (let i = 0; i < len; i++) {
      const current = delayLine[readIndex];
      const filtered = 0.5 * (current + prevSample);
      prevSample = current;
      delayLine[readIndex] = filtered * 0.996;
      buf[i] = filtered;
      readIndex = (readIndex + 1) % delayLineSize;
    }

    // 失真/过载
    const driven = AudioUtils.softClip(buf, 4.0);

    // 哇音效果（LFO 控制低通滤波）
    const wahRate = 2.0; // Hz
    const wahOut = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      const lfo = 0.5 + 0.5 * Math.sin(TWO_PI * wahRate * i / SAMPLE_RATE);
      const cutoff = 300 + lfo * 2000;
      // 简化：逐样本调整截止频率不现实，改为振幅调制模拟
      wahOut[i] = driven[i] * (0.7 + 0.3 * lfo);
    }

    return wahOut;
  }
}

/**
 * 贝斯合成器
 * 低通滤波正弦波 + 指数衰减 + 击弦/勾弦模拟
 */
export class BassSynthesizer extends InstrumentSynthesizer {
  readonly type = "bass" as const;

  renderNote(note: NoteEvent, _emotion: EmotionType): Float32Array {
    const freq = AudioUtils.midiToFreq(note.midi);
    const duration = note.duration + 1.0;
    const len = Math.floor(duration * SAMPLE_RATE);
    const buf = new Float32Array(len);

    // 低通滤波正弦波（基础音）
    for (let i = 0; i < len; i++) {
      const t = i / SAMPLE_RATE;
      const env = Math.exp(-t / 0.4);
      // 加入轻微谐波使声音不那么纯
      const val = Math.sin(TWO_PI * freq * t) + 0.3 * Math.sin(TWO_PI * freq * 2 * t);
      buf[i] = val * note.velocity * env;
    }

    // 击弦/勾弦模拟（attack 噪声 burst）
    const attackLen = Math.min(len, Math.floor(0.02 * SAMPLE_RATE));
    const noise = AudioUtils.whiteNoise(attackLen);
    const attackEnv = AudioUtils.expDecay(attackLen, 0.005);
    for (let i = 0; i < attackLen; i++) {
      buf[i] += noise[i] * attackEnv[i] * 0.5 * note.velocity;
    }

    const filtered = AudioUtils.lowpass(buf, 800);
    return filtered;
  }
}

/**
 * 架子鼓合成器
 * 底鼓、军鼓、踩镲、吊镲、通鼓独立合成
 */
export class DrumKitSynthesizer extends InstrumentSynthesizer {
  readonly type = "drumKit" as const;

  renderNote(note: NoteEvent, _emotion: EmotionType): Float32Array {
    // 根据 MIDI 音高映射鼓件
    const drumType = this.midiToDrumType(note.midi);
    switch (drumType) {
      case "kick": return this.synthesizeKick(note, _emotion);
      case "snare": return this.synthesizeSnare(note, _emotion);
      case "hihat": return this.synthesizeHiHat(note, _emotion);
      case "crash": return this.synthesizeCrash(note, _emotion);
      case "tom": return this.synthesizeTom(note, _emotion);
      default: return this.synthesizeKick(note, _emotion);
    }
  }

  private midiToDrumType(midi: number): "kick" | "snare" | "hihat" | "crash" | "tom" {
    if (midi >= 35 && midi <= 36) return "kick";
    if (midi >= 38 && midi <= 40) return "snare";
    if (midi >= 42 && midi <= 46) return "hihat";
    if (midi >= 49 && midi <= 52) return "crash";
    return "tom";
  }

  /** 底鼓：正弦波扫频（60→30Hz）+ 衰减 */
  private synthesizeKick(note: NoteEvent, _emotion: EmotionType): Float32Array {
    const duration = 0.5;
    const len = Math.floor(duration * SAMPLE_RATE);
    const buf = new Float32Array(len);
    const startFreq = 60;
    const endFreq = 30;
    for (let i = 0; i < len; i++) {
      const t = i / SAMPLE_RATE;
      const freq = AudioUtils.lerp(startFreq, endFreq, Math.min(1, t / 0.1));
      const env = Math.exp(-t / 0.15);
      const phase = TWO_PI * (startFreq * t + (endFreq - startFreq) * t * t / (2 * 0.1));
      buf[i] = Math.sin(phase) * env * note.velocity;
    }
    return buf;
  }

  /** 军鼓：白噪声 + 正弦波(200Hz) + 衰减 */
  private synthesizeSnare(note: NoteEvent, _emotion: EmotionType): Float32Array {
    const duration = 0.4;
    const len = Math.floor(duration * SAMPLE_RATE);
    const buf = new Float32Array(len);
    const noise = AudioUtils.whiteNoise(len);
    for (let i = 0; i < len; i++) {
      const t = i / SAMPLE_RATE;
      const env = Math.exp(-t / 0.12);
      const tone = Math.sin(TWO_PI * 200 * t) * 0.4;
      buf[i] = (noise[i] * 0.6 + tone) * env * note.velocity;
    }
    return buf;
  }

  /** 踩镲：高通噪声 + 快速衰减 */
  private synthesizeHiHat(note: NoteEvent, _emotion: EmotionType): Float32Array {
    const duration = 0.15;
    const len = Math.floor(duration * SAMPLE_RATE);
    const buf = new Float32Array(len);
    const noise = AudioUtils.whiteNoise(len);
    const hp = AudioUtils.highpass(noise, 8000);
    for (let i = 0; i < len; i++) {
      const t = i / SAMPLE_RATE;
      const env = Math.exp(-t / 0.03);
      buf[i] = hp[i] * env * note.velocity * 0.6;
    }
    return buf;
  }

  /** 吊镲：噪声 + 长衰减 + 金属感谐波 */
  private synthesizeCrash(note: NoteEvent, _emotion: EmotionType): Float32Array {
    const duration = 2.0;
    const len = Math.floor(duration * SAMPLE_RATE);
    const buf = new Float32Array(len);
    const noise = AudioUtils.pinkNoise(len);
    const metalFreqs = [400, 600, 900, 1300, 1800];
    for (let i = 0; i < len; i++) {
      const t = i / SAMPLE_RATE;
      const env = Math.exp(-t / 0.8);
      let metal = 0;
      for (const mf of metalFreqs) {
        metal += Math.sin(TWO_PI * mf * t) * 0.05;
      }
      buf[i] = (noise[i] * 0.5 + metal) * env * note.velocity;
    }
    return buf;
  }

  /** 通鼓：正弦波 + 中频衰减 */
  private synthesizeTom(note: NoteEvent, _emotion: EmotionType): Float32Array {
    const freq = AudioUtils.midiToFreq(note.midi);
    const duration = 0.6;
    const len = Math.floor(duration * SAMPLE_RATE);
    const buf = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      const t = i / SAMPLE_RATE;
      const env = Math.exp(-t / 0.25);
      buf[i] = Math.sin(TWO_PI * freq * t) * env * note.velocity;
    }
    return buf;
  }
}

/**
 * 小提琴合成器
 * 锯齿波 + 低通滤波 + 颤音(LFO) + 滑音 + 弓压变化
 */
export class ViolinSynthesizer extends InstrumentSynthesizer {
  readonly type = "violin" as const;

  renderNote(note: NoteEvent, _emotion: EmotionType): Float32Array {
    const freq = AudioUtils.midiToFreq(note.midi);
    const duration = note.duration + 0.5;
    const len = Math.floor(duration * SAMPLE_RATE);
    const buf = new Float32Array(len);

    // 颤音参数
    const vibratoRate = 6.0; // Hz
    const vibratoDepth = 0.015; // 半音

    // 滑音
    const targetFreq = note.slideTo !== undefined ? AudioUtils.midiToFreq(note.slideTo) : freq;

    for (let i = 0; i < len; i++) {
      const t = i / SAMPLE_RATE;
      const env = AudioUtils.adsr(len, 0.1, 0.2, 0.8, 0.4)[i];

      // 滑音插值
      const slideT = Math.min(1, t / (note.duration * 0.5));
      const currentFreq = AudioUtils.lerp(freq, targetFreq, slideT);

      // 颤音
      const vibrato = Math.sin(TWO_PI * vibratoRate * t) * vibratoDepth;
      const modFreq = currentFreq * Math.pow(2, vibrato / 12);

      // 锯齿波
      let sample = 0;
      for (let h = 1; h <= 8; h++) {
        sample += Math.sin(TWO_PI * modFreq * h * t) / h;
      }

      // 弓压变化（模拟 bow pressure 的轻微噪声）
      const bowNoise = (Math.random() * 2 - 1) * 0.02;

      buf[i] = (sample + bowNoise) * env * note.velocity * 0.3;
    }

    return AudioUtils.lowpass(buf, 4000);
  }
}

/**
 * 大提琴合成器
 * 类似小提琴但更低频
 */
export class CelloSynthesizer extends InstrumentSynthesizer {
  readonly type = "cello" as const;

  renderNote(note: NoteEvent, emotion: EmotionType): Float32Array {
    const violin = new ViolinSynthesizer();
    const buf = violin.renderNote(note, emotion);
    return AudioUtils.lowpass(buf, 2500);
  }
}

/**
 * 长笛合成器
 * 正弦波 + 偶次谐波 + 气息噪声 + 泛音控制
 */
export class FluteSynthesizer extends InstrumentSynthesizer {
  readonly type = "flute" as const;

  renderNote(note: NoteEvent, _emotion: EmotionType): Float32Array {
    const freq = AudioUtils.midiToFreq(note.midi);
    const duration = note.duration + 0.3;
    const len = Math.floor(duration * SAMPLE_RATE);
    const buf = new Float32Array(len);

    const noise = AudioUtils.pinkNoise(len);

    for (let i = 0; i < len; i++) {
      const t = i / SAMPLE_RATE;
      const env = AudioUtils.adsr(len, 0.05, 0.15, 0.7, 0.3)[i];

      // 正弦波 + 偶次谐波
      let sample = Math.sin(TWO_PI * freq * t);
      sample += 0.2 * Math.sin(TWO_PI * freq * 2 * t);
      sample += 0.1 * Math.sin(TWO_PI * freq * 4 * t);
      sample += 0.05 * Math.sin(TWO_PI * freq * 6 * t);

      // 气息噪声
      const breath = noise[i] * 0.08;

      buf[i] = (sample + breath) * env * note.velocity * 0.4;
    }

    return buf;
  }
}

/**
 * 萨克斯合成器
 * 锯齿波 + 共振峰滤波 + 气息噪声
 */
export class SaxophoneSynthesizer extends InstrumentSynthesizer {
  readonly type = "saxophone" as const;

  renderNote(note: NoteEvent, _emotion: EmotionType): Float32Array {
    const freq = AudioUtils.midiToFreq(note.midi);
    const duration = note.duration + 0.4;
    const len = Math.floor(duration * SAMPLE_RATE);
    const buf = new Float32Array(len);

    const saw = AudioUtils.sawWave(freq, duration + 0.4, note.velocity);
    const noise = AudioUtils.pinkNoise(len);

    for (let i = 0; i < len; i++) {
      const t = i / SAMPLE_RATE;
      const env = AudioUtils.adsr(len, 0.08, 0.2, 0.75, 0.35)[i];
      const breath = noise[i] * 0.06;
      buf[i] = (saw[i] + breath) * env * 0.3;
    }

    // 共振峰滤波（模拟萨克斯管体）
    const f1 = AudioUtils.formantFilter(buf, 500, 5);
    const f2 = AudioUtils.formantFilter(f1, 1200, 4);
    return f2;
  }
}

/**
 * 合成器（键盘合成器）
 * 多种波形 + 滤波器包络 + ADSR
 */
export class SynthSynthesizer extends InstrumentSynthesizer {
  readonly type = "synth" as const;

  renderNote(note: NoteEvent, emotion: EmotionType): Float32Array {
    const freq = AudioUtils.midiToFreq(note.midi);
    const duration = note.duration + 0.5;
    const len = Math.floor(duration * SAMPLE_RATE);
    const buf = new Float32Array(len);

    let waveform = "saw" as "saw" | "square" | "triangle" | "sine";
    let osc: Float32Array;
    // 可扩展波形选择
    if (waveform === "square") {
      osc = AudioUtils.squareWave(freq, duration + 0.5, note.velocity);
    } else if (waveform === "triangle") {
      osc = AudioUtils.triangleWave(freq, duration + 0.5, note.velocity);
    } else if (waveform === "sine") {
      osc = AudioUtils.sineWave(freq, duration + 0.5, note.velocity);
    } else {
      osc = AudioUtils.sawWave(freq, duration + 0.5, note.velocity);
    }

    const env = AudioUtils.adsr(len, 0.02, 0.2, 0.6, 0.4);

    // 滤波器包络（截止频率随时间变化）
    for (let i = 0; i < len; i++) {
      const t = i / SAMPLE_RATE;
      const filterEnv = Math.exp(-t / 0.3);
      const cutoff = 200 + filterEnv * 4000;
      // 简化：用振幅缩放模拟滤波效果
      const filterSim = Math.min(1, cutoff / 3000);
      buf[i] = osc[i] * env[i] * filterSim;
    }

    return buf;
  }
}

// ==================== 中国乐器合成器 ====================

/**
 * 古筝合成器
 * Karplus-Strong 变体（多弦共鸣、揉弦效果、按音滑音）
 */
export class GuzhengSynthesizer extends InstrumentSynthesizer {
  readonly type = "guzheng" as const;

  renderNote(note: NoteEvent, _emotion: EmotionType): Float32Array {
    const freq = AudioUtils.midiToFreq(note.midi);
    const duration = note.duration + 3.0;
    const len = Math.floor(duration * SAMPLE_RATE);
    const buf = new Float32Array(len);

    // Karplus-Strong 基础
    const delaySamples = SAMPLE_RATE / freq;
    const delayLineSize = Math.ceil(delaySamples);
    const delayLine = new Float32Array(delayLineSize);
    for (let i = 0; i < delayLineSize; i++) {
      delayLine[i] = (Math.random() * 2 - 1) * note.velocity;
    }

    let readIndex = 0;
    let prevSample = 0;
    for (let i = 0; i < len; i++) {
      const current = delayLine[readIndex];
      const filtered = 0.5 * (current + prevSample);
      prevSample = current;
      delayLine[readIndex] = filtered * 0.998;
      buf[i] = filtered;
      readIndex = (readIndex + 1) % delayLineSize;
    }

    // 揉弦效果（vibrato 较慢且深）
    const vibratoRate = 5.0;
    const vibratoDepth = 0.03;
    for (let i = 0; i < len; i++) {
      const t = i / SAMPLE_RATE;
      const vibrato = Math.sin(TWO_PI * vibratoRate * t) * vibratoDepth;
      const mod = 1 + vibrato * Math.min(1, t * 2); // 渐入
      buf[i] *= mod;
    }

    // 多弦共鸣（五声音阶相关弦）
    const symFreqs = [freq * 1.12246, freq * 1.25992, freq * 1.49831];
    for (const sf of symFreqs) {
      const sLen = Math.ceil(SAMPLE_RATE / sf);
      const sLine = new Float32Array(sLen);
      for (let j = 0; j < sLen; j++) sLine[j] = (Math.random() * 2 - 1) * 0.02 * note.velocity;
      let sIdx = 0, sPrev = 0;
      for (let i = 0; i < len; i++) {
        const cur = sLine[sIdx];
        const filt = 0.5 * (cur + sPrev);
        sPrev = cur;
        sLine[sIdx] = filt * 0.997;
        buf[i] += filt;
        sIdx = (sIdx + 1) % sLen;
      }
    }

    // 按音滑音
    if (note.slideTo !== undefined) {
      const targetFreq = AudioUtils.midiToFreq(note.slideTo);
      const slideStart = Math.floor(note.duration * 0.3 * SAMPLE_RATE);
      const slideEnd = Math.min(len, Math.floor(note.duration * 0.9 * SAMPLE_RATE));
      for (let i = slideStart; i < slideEnd; i++) {
        const t = (i - slideStart) / (slideEnd - slideStart);
        const f = AudioUtils.lerp(freq, targetFreq, t);
        buf[i] *= Math.sin(TWO_PI * f * i / SAMPLE_RATE) * 0.3;
      }
    }

    return buf;
  }
}

/**
 * 二胡合成器
 * 锯齿波 + 特殊共振峰（模拟蛇皮，F1~700Hz, F2~1500Hz）+ 揉弦颤音 + 滑音
 */
export class ErhuSynthesizer extends InstrumentSynthesizer {
  readonly type = "erhu" as const;

  renderNote(note: NoteEvent, _emotion: EmotionType): Float32Array {
    const freq = AudioUtils.midiToFreq(note.midi);
    const duration = note.duration + 1.0;
    const len = Math.floor(duration * SAMPLE_RATE);
    const buf = new Float32Array(len);

    // 锯齿波基础
    const saw = AudioUtils.sawWave(freq, duration + 1.0, note.velocity);

    // 揉弦颤音（较深，模拟二胡揉弦）
    const vibratoRate = 5.5;
    const vibratoDepth = 0.04;
    for (let i = 0; i < len; i++) {
      const t = i / SAMPLE_RATE;
      const env = AudioUtils.adsr(len, 0.15, 0.3, 0.75, 0.5)[i];
      const vibrato = Math.sin(TWO_PI * vibratoRate * t) * vibratoDepth * Math.min(1, t);
      const modFreq = freq * Math.pow(2, vibrato / 12);
      // 重采样相位偏移来模拟频率变化（简化）
      const phaseIdx = Math.floor(i * modFreq / freq);
      const sample = saw[Math.min(phaseIdx, saw.length - 1)] || 0;
      buf[i] = sample * env;
    }

    // 蛇皮共振峰
    const f1 = AudioUtils.formantFilter(buf, 700, 6);
    const f2 = AudioUtils.formantFilter(f1, 1500, 5);

    // 滑音
    if (note.slideTo !== undefined) {
      const targetFreq = AudioUtils.midiToFreq(note.slideTo);
      const slideStart = Math.floor(note.duration * 0.2 * SAMPLE_RATE);
      const slideEnd = Math.min(len, Math.floor(note.duration * 0.7 * SAMPLE_RATE));
      for (let i = slideStart; i < slideEnd; i++) {
        const t = (i - slideStart) / (slideEnd - slideStart);
        const f = AudioUtils.lerp(freq, targetFreq, t);
        f2[i] *= Math.sin(TWO_PI * f * i / SAMPLE_RATE) * 0.5;
      }
    }

    return f2;
  }
}

/**
 * 琵琶合成器
 * 快速衰减拨弦 + 轮指效果（多个快速重复音符）
 */
export class PipaSynthesizer extends InstrumentSynthesizer {
  readonly type = "pipa" as const;

  renderNote(note: NoteEvent, _emotion: EmotionType): Float32Array {
    const freq = AudioUtils.midiToFreq(note.midi);
    const duration = note.duration + 1.0;
    const len = Math.floor(duration * SAMPLE_RATE);
    const buf = new Float32Array(len);

    // 基础快速衰减拨弦
    const delaySamples = SAMPLE_RATE / freq;
    const delayLineSize = Math.ceil(delaySamples);
    const delayLine = new Float32Array(delayLineSize);
    for (let i = 0; i < delayLineSize; i++) {
      delayLine[i] = (Math.random() * 2 - 1) * note.velocity;
    }

    let readIndex = 0;
    let prevSample = 0;
    for (let i = 0; i < len; i++) {
      const current = delayLine[readIndex];
      const filtered = 0.5 * (current + prevSample);
      prevSample = current;
      delayLine[readIndex] = filtered * 0.995;
      buf[i] = filtered;
      readIndex = (readIndex + 1) % delayLineSize;
    }

    // 轮指效果（如果有装饰音）
    if (note.ornaments && note.ornaments.length > 0) {
      for (let o = 0; o < note.ornaments.length; o++) {
        const oFreq = AudioUtils.midiToFreq(note.ornaments[o]);
        const oOffset = Math.floor((o * 0.08) * SAMPLE_RATE);
        const oLen = Math.floor(0.3 * SAMPLE_RATE);
        const oBuf = new Float32Array(oLen);
        const oDelaySize = Math.ceil(SAMPLE_RATE / oFreq);
        const oDelay = new Float32Array(oDelaySize);
        for (let j = 0; j < oDelaySize; j++) oDelay[j] = (Math.random() * 2 - 1) * note.velocity * 0.5;
        let oR = 0, oP = 0;
        for (let j = 0; j < oLen; j++) {
          const cur = oDelay[oR];
          const filt = 0.5 * (cur + oP);
          oP = cur;
          oDelay[oR] = filt * 0.99;
          oBuf[j] = filt;
          oR = (oR + 1) % oDelaySize;
        }
        AudioUtils.mixInto(buf, oBuf, oOffset, 0.6);
      }
    }

    return buf;
  }
}

/**
 * 笛子合成器
 * 正弦波 + 谐波列 + 气息噪声 + 花舌效果（快速颤音）+ 滑音
 */
export class DiziSynthesizer extends InstrumentSynthesizer {
  readonly type = "dizi" as const;

  renderNote(note: NoteEvent, _emotion: EmotionType): Float32Array {
    const freq = AudioUtils.midiToFreq(note.midi);
    const duration = note.duration + 0.5;
    const len = Math.floor(duration * SAMPLE_RATE);
    const buf = new Float32Array(len);

    const noise = AudioUtils.pinkNoise(len);

    for (let i = 0; i < len; i++) {
      const t = i / SAMPLE_RATE;
      const env = AudioUtils.adsr(len, 0.04, 0.15, 0.8, 0.3)[i];

      // 正弦波 + 谐波列
      let sample = Math.sin(TWO_PI * freq * t);
      sample += 0.25 * Math.sin(TWO_PI * freq * 2 * t);
      sample += 0.12 * Math.sin(TWO_PI * freq * 3 * t);
      sample += 0.06 * Math.sin(TWO_PI * freq * 4 * t);

      // 气息噪声
      const breath = noise[i] * 0.05;

      // 花舌效果（快速颤音 12Hz）
      const huashe = 1 + 0.08 * Math.sin(TWO_PI * 12 * t) * Math.min(1, t * 3);

      buf[i] = (sample + breath) * env * note.velocity * huashe * 0.35;
    }

    // 滑音
    if (note.slideTo !== undefined) {
      const targetFreq = AudioUtils.midiToFreq(note.slideTo);
      const slideStart = Math.floor(note.duration * 0.4 * SAMPLE_RATE);
      const slideEnd = Math.min(len, Math.floor(note.duration * 0.8 * SAMPLE_RATE));
      for (let i = slideStart; i < slideEnd; i++) {
        const t = (i - slideStart) / (slideEnd - slideStart);
        const f = AudioUtils.lerp(freq, targetFreq, t);
        buf[i] *= Math.sin(TWO_PI * f * i / SAMPLE_RATE) * 0.4;
      }
    }

    return buf;
  }
}

/**
 * 箫合成器
 * 更低频管乐 + 气息控制
 */
export class XiaoSynthesizer extends InstrumentSynthesizer {
  readonly type = "xiao" as const;

  renderNote(note: NoteEvent, _emotion: EmotionType): Float32Array {
    const freq = AudioUtils.midiToFreq(note.midi);
    const duration = note.duration + 1.0;
    const len = Math.floor(duration * SAMPLE_RATE);
    const buf = new Float32Array(len);

    const noise = AudioUtils.pinkNoise(len);

    for (let i = 0; i < len; i++) {
      const t = i / SAMPLE_RATE;
      const env = AudioUtils.adsr(len, 0.1, 0.3, 0.85, 0.6)[i];

      // 更低频，更纯
      let sample = Math.sin(TWO_PI * freq * t);
      sample += 0.15 * Math.sin(TWO_PI * freq * 2 * t);
      sample += 0.05 * Math.sin(TWO_PI * freq * 3 * t);

      // 气息控制（更柔和）
      const breath = noise[i] * 0.04;

      buf[i] = (sample + breath) * env * note.velocity * 0.4;
    }

    return AudioUtils.lowpass(buf, 3500);
  }
}

/**
 * 锣鼓合成器
 * 非线性失真噪声 + 金属谐波 + 快速衰减
 */
export class LuoGuSynthesizer extends InstrumentSynthesizer {
  readonly type = "luoGu" as const;

  renderNote(note: NoteEvent, _emotion: EmotionType): Float32Array {
    const duration = 1.5;
    const len = Math.floor(duration * SAMPLE_RATE);
    const buf = new Float32Array(len);
    const noise = AudioUtils.whiteNoise(len);

    // 非线性失真噪声
    const distorted = AudioUtils.softClip(noise, 3.0);

    // 金属谐波
    const metalFreqs = [200, 350, 520, 800, 1100];
    for (let i = 0; i < len; i++) {
      const t = i / SAMPLE_RATE;
      const env = Math.exp(-t / 0.3);
      let metal = 0;
      for (const mf of metalFreqs) {
        metal += Math.sin(TWO_PI * mf * t) * 0.06;
      }
      buf[i] = (distorted[i] * 0.4 + metal) * env * note.velocity;
    }

    return buf;
  }
}

/**
 * 扬琴合成器
 * 金属拨弦感（短衰减 + 高频泛音）
 */
export class YangQinSynthesizer extends InstrumentSynthesizer {
  readonly type = "yangQin" as const;

  renderNote(note: NoteEvent, _emotion: EmotionType): Float32Array {
    const freq = AudioUtils.midiToFreq(note.midi);
    const duration = note.duration + 1.5;
    const len = Math.floor(duration * SAMPLE_RATE);
    const buf = new Float32Array(len);

    // 高频泛音丰富
    const harmonics = [1, 2, 3, 4, 5, 6, 7, 8];
    const amps = [1.0, 0.6, 0.4, 0.3, 0.2, 0.15, 0.1, 0.08];

    for (let h = 0; h < harmonics.length; h++) {
      const hf = freq * harmonics[h];
      const hAmp = amps[h] * note.velocity;
      const phase = Math.random() * TWO_PI;
      for (let i = 0; i < len; i++) {
        const t = i / SAMPLE_RATE;
        const env = Math.exp(-t / (0.2 + h * 0.05));
        buf[i] += Math.sin(TWO_PI * hf * t + phase) * hAmp * env;
      }
    }

    return buf;
  }
}

/**
 * 唢呐合成器
 * 方波 + 强谐波 + 气息噪声 + 滑音
 */
export class SuoNaSynthesizer extends InstrumentSynthesizer {
  readonly type = "suoNa" as const;

  renderNote(note: NoteEvent, _emotion: EmotionType): Float32Array {
    const freq = AudioUtils.midiToFreq(note.midi);
    const duration = note.duration + 0.6;
    const len = Math.floor(duration * SAMPLE_RATE);
    const buf = new Float32Array(len);

    const noise = AudioUtils.pinkNoise(len);

    for (let i = 0; i < len; i++) {
      const t = i / SAMPLE_RATE;
      const env = AudioUtils.adsr(len, 0.03, 0.15, 0.85, 0.25)[i];

      // 方波 + 强谐波
      let sample = 0;
      for (let h = 1; h <= 6; h += 2) {
        sample += Math.sin(TWO_PI * freq * h * t) / h;
      }
      sample *= 0.6;

      const breath = noise[i] * 0.06;
      buf[i] = (sample + breath) * env * note.velocity * 0.5;
    }

    // 滑音
    if (note.slideTo !== undefined) {
      const targetFreq = AudioUtils.midiToFreq(note.slideTo);
      const slideStart = Math.floor(note.duration * 0.3 * SAMPLE_RATE);
      const slideEnd = Math.min(len, Math.floor(note.duration * 0.8 * SAMPLE_RATE));
      for (let i = slideStart; i < slideEnd; i++) {
        const t = (i - slideStart) / (slideEnd - slideStart);
        const f = AudioUtils.lerp(freq, targetFreq, t);
        buf[i] *= Math.sin(TWO_PI * f * i / SAMPLE_RATE) * 0.5;
      }
    }

    return buf;
  }
}

// ==================== 人性化演奏算法 ====================

/**
 * 人性化引擎
 * 力度随机化、时间微扰、Swing、音符长度变化、呼吸点、动态变化、情绪映射
 */
export class HumanizationEngine {
  private chaosX = 0.1;
  private chaosY = 0.2;

  /**
   * 对音符列表施加人性化处理
   */
  humanize(notes: NoteEvent[], emotion: EmotionType, bpm: number): NoteEvent[] {
    const result: NoteEvent[] = notes.map((n) => ({ ...n }));
    const beatDur = 60 / bpm;

    for (const note of result) {
      // 1. 力度随机化：Gaussian 分布微扰 ±10%
      const velPerturb = AudioUtils.gaussianRandom(0, 0.1);
      note.velocity = Math.max(0.01, Math.min(1, note.velocity + velPerturb));

      // 2. 时间微扰：混沌映射控制 timing 偏移 ±5-20ms
      this.chaosStep();
      const timeJitterMs = 5 + 15 * Math.abs(this.chaosX);
      const timeOffset = (Math.random() < 0.5 ? -1 : 1) * timeJitterMs / 1000;
      note.startTime += timeOffset;

      // 3. 音符长度变化：根据情绪决定 legato / staccato 倾向
      if (emotion === "sad" || emotion === "romantic") {
        // legato：延长 10%
        note.duration *= 1.1;
      } else if (emotion === "happy" || emotion === "tense") {
        // staccato：缩短 50%
        note.duration *= 0.5;
      }

      // 4. 呼吸点：管乐/声乐中自动插入休止（通过缩短尾音模拟）
      if (note.duration > beatDur * 2) {
        note.duration -= 0.05; // 微小休止
      }
    }

    // 5. Swing/Shuffle：三连音感觉的节奏偏移（作用于偶数拍位置音符）
    for (const note of result) {
      const beatPos = note.startTime / beatDur;
      const frac = beatPos % 1;
      if (frac > 0.4 && frac < 0.7) {
        // 位于反拍附近，向后偏移 1/3 拍感觉
        note.startTime += beatDur * 0.15;
      }
    }

    // 6. 动态变化：crescendo / decrescendo 包络（整体力度趋势）
    const totalSpan = result.length > 0
      ? Math.max(...result.map((n) => n.startTime + n.duration)) - Math.min(...result.map((n) => n.startTime))
      : 0;
    if (totalSpan > 0) {
      const startTime = Math.min(...result.map((n) => n.startTime));
      for (const note of result) {
        const t = (note.startTime - startTime) / totalSpan;
        const crescendo = 0.85 + 0.3 * Math.sin(t * Math.PI); // 拱形动态
        note.velocity *= crescendo;
      }
    }

    // 7. 情绪映射
    this.applyEmotionMapping(result, emotion);

    return result;
  }

  /** 情绪映射：调整音色亮暗与 attack/release */
  applyEmotionMapping(notes: NoteEvent[], emotion: EmotionType): void {
    for (const note of notes) {
      switch (emotion) {
        case "happy":
          note.velocity *= 1.05; // 更亮（通过力度映射）
          break;
        case "sad":
          note.velocity *= 0.9; // 更暗
          break;
        case "epic":
          note.velocity = Math.min(1, note.velocity * 1.15);
          break;
        case "relaxed":
          note.velocity *= 0.95;
          break;
      }
    }
  }

  /** 混沌映射步进（Logistic map 变体） */
  private chaosStep(): void {
    const r = 3.99;
    const nextX = r * this.chaosX * (1 - this.chaosX);
    const nextY = r * this.chaosY * (1 - this.chaosY);
    this.chaosX = nextX;
    this.chaosY = nextY;
  }
}

// ==================== 非传统伴奏技术 ====================

/**
 * 混沌力度映射
 * Lorenz 吸引子控制每个音符的力度变化
 */
export class ChaosEngine {
  private sigma = 10;
  private rho = 28;
  private beta = 8 / 3;
  private x = 0.1;
  private y = 0;
  private z = 0;
  private dt = 0.01;

  /** Lorenz 吸引子步进 */
  step(): void {
    const dx = this.sigma * (this.y - this.x) * this.dt;
    const dy = (this.x * (this.rho - this.z) - this.y) * this.dt;
    const dz = (this.x * this.y - this.beta * this.z) * this.dt;
    this.x += dx;
    this.y += dy;
    this.z += dz;
  }

  /** 生成混沌力度序列 */
  generateVelocitySequence(count: number): number[] {
    const seq: number[] = [];
    for (let i = 0; i < count; i++) {
      this.step();
      const norm = Math.abs(this.x) / 30; // 归一化
      seq.push(Math.max(0.1, Math.min(1, norm)));
    }
    return seq;
  }

  /** 映射到音符力度 */
  mapToNotes(notes: NoteEvent[]): NoteEvent[] {
    const velocities = this.generateVelocitySequence(notes.length);
    return notes.map((n, i) => ({
      ...n,
      velocity: Math.max(0.1, Math.min(1, n.velocity * velocities[i])),
    }));
  }
}

/**
 * 分形旋律变奏
 * Mandelbrot 集生成装饰音和经过音
 */
export class FractalMelodyEngine {
  /**
   * 判断点是否属于 Mandelbrot 集，返回迭代次数
   */
  mandelbrotIterations(cx: number, cy: number, maxIter = 50): number {
    let zx = 0, zy = 0;
    for (let i = 0; i < maxIter; i++) {
      const zx2 = zx * zx - zy * zy + cx;
      const zy2 = 2 * zx * zy + cy;
      zx = zx2;
      zy = zy2;
      if (zx * zx + zy * zy > 4) return i;
    }
    return maxIter;
  }

  /**
   * 生成分形装饰音
   * @param baseNote 基础音符 MIDI
   * @param count 装饰音数量
   */
  generateOrnaments(baseNote: number, count: number): number[] {
    const ornaments: number[] = [];
    for (let i = 0; i < count; i++) {
      const cx = (i / count) * 2.5 - 2.0;
      const cy = ((i * 7) % count / count) * 1.5 - 0.75;
      const iter = this.mandelbrotIterations(cx, cy, 30);
      const offset = (iter % 7) - 3; // -3 到 +3 半音
      ornaments.push(baseNote + offset);
    }
    return ornaments;
  }

  /**
   * 生成经过音序列
   */
  generatePassingTones(startMidi: number, endMidi: number, steps: number): number[] {
    const tones: number[] = [];
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const cx = t * 2.0 - 1.5;
      const cy = Math.sin(t * Math.PI) * 0.5;
      const iter = this.mandelbrotIterations(cx, cy, 20);
      const base = AudioUtils.lerp(startMidi, endMidi, t);
      const micro = (iter % 3) - 1; // 微调
      tones.push(Math.round(base + micro));
    }
    return tones;
  }
}

/**
 * 量子叠加态和声
 * 多个和弦叠加，按概率坍缩选择
 */
export class QuantumHarmonyEngine {
  /**
   * 量子叠加态和弦生成
   * @param baseChord 基础和弦
   * @param candidates 候选叠加和弦列表
   * @param probabilities 概率分布（坍缩概率）
   */
  collapseChord(baseChord: number[], candidates: number[][], probabilities: number[]): number[] {
    const rand = Math.random();
    let cum = 0;
    for (let i = 0; i < candidates.length; i++) {
      cum += probabilities[i] ?? 0;
      if (rand <= cum) {
        // 坍缩到候选和弦，与基础和弦叠加
        return this.superpose(baseChord, candidates[i]);
      }
    }
    return baseChord;
  }

  /** 叠加两个和弦（取并集并排序） */
  private superpose(a: number[], b: number[]): number[] {
    const set = new Set([...a, ...b]);
    return Array.from(set).sort((x, y) => x - y);
  }

  /** 生成量子化伴奏和弦 */
  generateQuantumChords(
    progression: ChordEvent[],
    keyMidi: number,
    emotion: EmotionType
  ): ChordEvent[] {
    const candidates: number[][] = [
      [0, 4, 7],
      [0, 3, 7],
      [0, 4, 7, 11],
      [0, 3, 7, 10],
      [0, 5, 7],
    ];
    const probs = [0.3, 0.2, 0.2, 0.15, 0.15];
    return progression.map((chord) => {
      const base = AudioUtils.chordToMidi(chord.root, chord.quality);
      const collapsed = this.collapseChord(base, candidates.map((c) => c.map((n) => n + chord.root)), probs);
      return { ...chord, root: collapsed[0], quality: "major" as ChordQuality };
    });
  }
}

/**
 * 细胞自动机节奏
 * 1D CA 控制鼓组填充和过门
 */
export class CellularRhythmEngine {
  private rule: number;

  constructor(rule = 150) {
    this.rule = rule;
  }

  /** 1D 细胞自动机一步演化 */
  evolve(cells: number[]): number[] {
    const next: number[] = [];
    for (let i = 0; i < cells.length; i++) {
      const left = cells[(i - 1 + cells.length) % cells.length];
      const center = cells[i];
      const right = cells[(i + 1) % cells.length];
      const pattern = (left << 2) | (center << 1) | right;
      next.push((this.rule >> pattern) & 1);
    }
    return next;
  }

  /** 生成鼓组填充模式（16步） */
  generateFill(seed?: number[]): number[] {
    let cells = seed ?? Array.from({ length: 16 }, () => (Math.random() > 0.5 ? 1 : 0));
    for (let g = 0; g < 4; g++) {
      cells = this.evolve(cells);
    }
    return cells;
  }

  /** 生成过门事件 */
  generateFillEvents(beatStart: number, bpm: number): NoteEvent[] {
    const pattern = this.generateFill();
    const beatDur = 60 / bpm;
    const stepDur = beatDur / 4; // 16分音符
    const events: NoteEvent[] = [];
    const drumMidis = [36, 38, 42, 46, 41]; // kick, snare, hihat, openHat, tom
    for (let i = 0; i < pattern.length; i++) {
      if (pattern[i] === 1) {
        const drum = drumMidis[i % drumMidis.length];
        events.push({
          midi: drum,
          startTime: beatStart + i * stepDur,
          duration: 0.1,
          velocity: 0.7 + Math.random() * 0.3,
        });
      }
    }
    return events;
  }
}

/**
 * 奇异吸引子贝斯线
 * Rössler 吸引子生成低音走向
 */
export class StrangeAttractorBassEngine {
  private a = 0.2;
  private b = 0.2;
  private c = 5.7;
  private x = 0.1;
  private y = 0;
  private z = 0;
  private dt = 0.01;

  step(): void {
    const dx = -(this.y + this.z) * this.dt;
    const dy = (this.x + this.a * this.y) * this.dt;
    const dz = (this.b + this.z * (this.x - this.c)) * this.dt;
    this.x += dx;
    this.y += dy;
    this.z += dz;
  }

  /** 生成贝斯线 MIDI 序列 */
  generateBassLine(rootMidi: number, bars: number, bpm: number): NoteEvent[] {
    const notes: NoteEvent[] = [];
    const beatDur = 60 / bpm;
    const totalBeats = bars * 4;

    for (let i = 0; i < totalBeats; i++) {
      this.step();
      // 将吸引子坐标映射到音阶偏移
      const offset = Math.floor(Math.abs(this.x) * 3) % 7;
      const scaleOffsets = [0, 2, 4, 5, 7, 9, 11]; // 大调音阶
      const midi = rootMidi + scaleOffsets[offset];
      const dur = beatDur * (0.8 + Math.abs(this.y) * 0.4);
      notes.push({
        midi,
        startTime: i * beatDur,
        duration: Math.min(dur, beatDur * 1.5),
        velocity: 0.6 + Math.abs(this.z) * 0.2,
      });
    }
    return notes;
  }
}

/**
 * 分形布朗运动琶音
 * fBm 生成琶音模式
 */
export class FBMArpeggioEngine {
  /**
   * 一维 fBm 噪声（中点位移法近似）
   */
  fbm1D(length: number, hurst = 0.7): Float32Array {
    const buf = new Float32Array(length);
    buf[0] = Math.random() * 2 - 1;
    buf[length - 1] = Math.random() * 2 - 1;

    let step = length - 1;
    let scale = 1.0;
    while (step > 1) {
      for (let i = 0; i < length - 1; i += step) {
        const mid = i + step / 2;
        if (mid < length) {
          buf[mid] = (buf[i] + buf[i + step]) / 2 + (Math.random() * 2 - 1) * scale;
        }
      }
      step /= 2;
      scale *= Math.pow(0.5, hurst);
    }
    return buf;
  }

  /** 生成琶音事件 */
  generateArpeggio(chordMidis: number[], startTime: number, duration: number, density: number): NoteEvent[] {
    const notes: NoteEvent[] = [];
    const steps = Math.floor(duration * density);
    const fbm = this.fbm1D(steps);
    const stepDur = duration / steps;

    for (let i = 0; i < steps; i++) {
      const idx = Math.floor(Math.abs(fbm[i]) * chordMidis.length) % chordMidis.length;
      const midi = chordMidis[idx];
      const vel = 0.4 + 0.6 * Math.abs(fbm[i]);
      notes.push({
        midi,
        startTime: startTime + i * stepDur,
        duration: stepDur * 0.8,
        velocity: Math.min(1, vel),
      });
    }
    return notes;
  }
}

// ==================== 智能编曲器 ====================

/**
 * 风格模板
 * 定义不同风格的乐器配置、密度、节奏型
 */
export class StyleTemplates {
  static getTemplate(style: StyleType): {
    instruments: InstrumentType[];
    densityBySection: Record<SectionType, number>;
    drumPatterns: Record<string, number[]>;
    scale: "major" | "minor" | "pentatonic";
    swingAmount: number;
  } {
    const templates: Record<StyleType, ReturnType<typeof StyleTemplates.getTemplate>> = {
      pop: {
        instruments: ["piano", "acousticGuitar", "bass", "drumKit", "synth", "violin", "cello", "flute"],
        densityBySection: { intro: 0.3, verse: 0.5, preChorus: 0.7, chorus: 0.9, bridge: 0.6, outro: 0.3 },
        drumPatterns: {
          basic: [36, 0, 42, 0, 38, 0, 42, 0],
          fill: [36, 38, 42, 38, 36, 38, 42, 46],
        },
        scale: "major",
        swingAmount: 0.0,
      },
      rock: {
        instruments: ["electricGuitar", "bass", "drumKit", "synth", "cello", "saxophone"],
        densityBySection: { intro: 0.4, verse: 0.7, preChorus: 0.8, chorus: 1.0, bridge: 0.7, outro: 0.4 },
        drumPatterns: {
          basic: [36, 0, 42, 42, 38, 0, 42, 0],
          fill: [36, 36, 38, 38, 36, 38, 46, 46],
        },
        scale: "minor",
        swingAmount: 0.0,
      },
      jazz: {
        instruments: ["piano", "bass", "drumKit", "saxophone", "violin", "cello", "flute"],
        densityBySection: { intro: 0.3, verse: 0.6, preChorus: 0.7, chorus: 0.8, bridge: 0.7, outro: 0.3 },
        drumPatterns: {
          basic: [36, 0, 42, 42, 36, 0, 42, 42],
          fill: [36, 38, 42, 38, 36, 38, 46, 42],
        },
        scale: "major",
        swingAmount: 0.3,
      },
      electronic: {
        instruments: ["synth", "bass", "drumKit", "piano", "cello"],
        densityBySection: { intro: 0.2, verse: 0.6, preChorus: 0.8, chorus: 1.0, bridge: 0.5, outro: 0.2 },
        drumPatterns: {
          basic: [36, 0, 42, 0, 36, 0, 42, 0],
          fill: [36, 42, 38, 42, 36, 42, 46, 42],
        },
        scale: "minor",
        swingAmount: 0.0,
      },
      classical: {
        instruments: ["piano", "violin", "cello", "flute", "bass"],
        densityBySection: { intro: 0.3, verse: 0.5, preChorus: 0.6, chorus: 0.9, bridge: 0.6, outro: 0.3 },
        drumPatterns: { basic: [], fill: [] },
        scale: "major",
        swingAmount: 0.0,
      },
      folk: {
        instruments: ["acousticGuitar", "flute", "bass", "violin", "cello"],
        densityBySection: { intro: 0.3, verse: 0.5, preChorus: 0.6, chorus: 0.8, bridge: 0.5, outro: 0.3 },
        drumPatterns: {
          basic: [36, 0, 42, 0, 38, 0, 42, 0],
          fill: [36, 38, 42, 0, 36, 38, 46, 0],
        },
        scale: "major",
        swingAmount: 0.1,
      },
      chinese: {
        instruments: ["guzheng", "erhu", "dizi", "luoGu", "pipa", "xiao", "yangQin", "suoNa"],
        densityBySection: { intro: 0.2, verse: 0.4, preChorus: 0.6, chorus: 0.85, bridge: 0.6, outro: 0.2 },
        drumPatterns: {
          basic: [36, 0, 42, 42, 38, 0, 42, 42],
          fill: [36, 38, 46, 38, 36, 38, 46, 38],
        },
        scale: "pentatonic",
        swingAmount: 0.05,
      },
      rnb: {
        instruments: ["piano", "bass", "drumKit", "synth", "saxophone", "violin", "cello"],
        densityBySection: { intro: 0.3, verse: 0.6, preChorus: 0.8, chorus: 0.9, bridge: 0.7, outro: 0.3 },
        drumPatterns: {
          basic: [36, 0, 42, 0, 36, 42, 38, 42],
          fill: [36, 38, 42, 38, 36, 42, 46, 42],
        },
        scale: "minor",
        swingAmount: 0.15,
      },
      metal: {
        instruments: ["electricGuitar", "bass", "drumKit", "synth", "cello"],
        densityBySection: { intro: 0.5, verse: 0.8, preChorus: 0.9, chorus: 1.0, bridge: 0.8, outro: 0.5 },
        drumPatterns: {
          basic: [36, 36, 42, 42, 38, 38, 42, 42],
          fill: [36, 38, 36, 38, 46, 38, 36, 38],
        },
        scale: "minor",
        swingAmount: 0.0,
      },
      blues: {
        instruments: ["electricGuitar", "bass", "drumKit", "saxophone", "piano", "violin"],
        densityBySection: { intro: 0.3, verse: 0.5, preChorus: 0.6, chorus: 0.8, bridge: 0.6, outro: 0.3 },
        drumPatterns: {
          basic: [36, 0, 42, 0, 36, 0, 42, 0],
          fill: [36, 38, 42, 38, 36, 38, 46, 38],
        },
        scale: "minor",
        swingAmount: 0.2,
      },
    };
    return templates[style] ?? templates.pop;
  }
}

/**
 * 编曲引擎
 * 歌曲结构、自动分配乐器密度、过门、低音线、和声填充
 */
export class ArrangementEngine {
  private style: StyleType;
  private bpm: number;
  private emotion: EmotionType;

  constructor(style: StyleType, bpm: number, emotion: EmotionType) {
    this.style = style;
    this.bpm = bpm;
    this.emotion = emotion;
  }

  /**
   * 为整个歌曲生成编曲事件
   */
  arrangeSections(sections: Section[]): Map<InstrumentType, NoteEvent[]> {
    const result = new Map<InstrumentType, NoteEvent[]>();
    const template = StyleTemplates.getTemplate(this.style);
    let currentTime = 0;
    const beatDur = 60 / this.bpm;

    // 初始化每轨事件列表
    for (const inst of template.instruments) {
      result.set(inst, []);
    }

    const caEngine = new CellularRhythmEngine(150);
    const attractorBass = new StrangeAttractorBassEngine();
    const fbmArp = new FBMArpeggioEngine();
    const fractalMelody = new FractalMelodyEngine();
    const quantumEngine = new QuantumHarmonyEngine();

    for (const section of sections) {
      const sectionDur = section.bars * 4 * beatDur;
      const density = template.densityBySection[section.type];

      // 1. 鼓组节奏
      if (template.drumPatterns.basic.length > 0) {
        const drumEvents = this.generateDrumPattern(
          currentTime,
          section.bars,
          beatDur,
          template.drumPatterns.basic,
          density
        );
        const drumList = result.get("drumKit") ?? [];
        result.set("drumKit", drumList.concat(drumEvents));
      }

      // 2. 过门（Fill）
      if (section.type === "preChorus" || section.type === "bridge") {
        const fillTime = currentTime + (section.bars - 1) * 4 * beatDur;
        const fillEvents = caEngine.generateFillEvents(fillTime, this.bpm);
        const drumList = result.get("drumKit") ?? [];
        result.set("drumKit", drumList.concat(fillEvents));
      }

      // 3. 低音线
      const bassInst = this.style === "metal" || this.style === "rock" ? "bass" : "bass";
      if (result.has(bassInst)) {
        const root = section.chordProgression[0]?.root ?? 36;
        const bassNotes = attractorBass.generateBassLine(root, section.bars, this.bpm);
        for (const n of bassNotes) n.startTime += currentTime;
        const bassList = result.get(bassInst) ?? [];
        result.set(bassInst, bassList.concat(bassNotes));
      }

      // 4. 和声填充（和弦内音分解、琶音、柱式和弦）
      const harmonyInst = template.instruments.find((i) =>
        ["piano", "acousticGuitar", "guzheng", "synth"].includes(i)
      );
      if (harmonyInst) {
        const harmonyEvents = this.generateHarmony(
          section.chordProgression,
          currentTime,
          beatDur,
          density,
          fbmArp,
          fractalMelody
        );
        const hList = result.get(harmonyInst) ?? [];
        result.set(harmonyInst, hList.concat(harmonyEvents));
      }

      // 5. 旋律层
      const melodyInst = template.instruments.find((i) =>
        ["violin", "flute", "saxophone", "erhu", "dizi", "electricGuitar"].includes(i)
      );
      if (melodyInst) {
        const melodyEvents = this.generateMelody(
          section.chordProgression,
          currentTime,
          section.bars,
          beatDur,
          density
        );
        const mList = result.get(melodyInst) ?? [];
        result.set(melodyInst, mList.concat(melodyEvents));
      }

      // 5.5 对位旋律层（Chorus / Bridge 密度高时添加第二旋律线）
      if ((section.type === 'chorus' || section.type === 'bridge') && density > 0.6) {
        const counterInst = template.instruments.find((i) =>
          ["cello", "flute", "saxophone", "synth", "erhu"].includes(i)
        );
        if (counterInst && counterInst !== melodyInst) {
          const counterEvents = this.generateCounterpoint(
            section.chordProgression,
            currentTime,
            section.bars,
            beatDur,
            density
          );
          const cList = result.get(counterInst) ?? [];
          result.set(counterInst, cList.concat(counterEvents));
        }
      }

      // 6. 中国风特殊处理：加花、滑音
      if (this.style === "chinese") {
        const chineseInst = template.instruments.find((i) => ["erhu", "dizi", "guzheng"].includes(i));
        if (chineseInst) {
          const ornamentEvents = this.generateChineseOrnaments(
            section.chordProgression,
            currentTime,
            beatDur,
            fractalMelody
          );
          const cList = result.get(chineseInst) ?? [];
          result.set(chineseInst, cList.concat(ornamentEvents));
        }
      }

      currentTime += sectionDur;
    }

    return result;
  }

  private generateDrumPattern(
    startTime: number,
    bars: number,
    beatDur: number,
    pattern: number[],
    density: number
  ): NoteEvent[] {
    const events: NoteEvent[] = [];
    const stepsPerBar = pattern.length;
    const stepDur = (4 * beatDur) / stepsPerBar;
    for (let b = 0; b < bars; b++) {
      for (let s = 0; s < stepsPerBar; s++) {
        if (Math.random() > density && pattern[s] !== 0) continue; // 密度控制
        const midi = pattern[s];
        if (midi === 0) continue;
        events.push({
          midi,
          startTime: startTime + b * 4 * beatDur + s * stepDur,
          duration: 0.1,
          velocity: 0.7 + Math.random() * 0.25,
        });
      }
    }
    return events;
  }

  private generateHarmony(
    progression: ChordEvent[],
    sectionStart: number,
    beatDur: number,
    density: number,
    fbmArp: FBMArpeggioEngine,
    fractal: FractalMelodyEngine
  ): NoteEvent[] {
    const events: NoteEvent[] = [];
    for (const chord of progression) {
      const chordStart = sectionStart + chord.startBar * 4 * beatDur;
      const chordDur = chord.durationBars * 4 * beatDur;
      const chordMidis = AudioUtils.chordToMidi(chord.root, chord.quality);

      if (density > 0.7) {
        // 柱式和弦
        for (const midi of chordMidis) {
          events.push({
            midi,
            startTime: chordStart,
            duration: chordDur * 0.8,
            velocity: 0.5 + Math.random() * 0.2,
          });
        }
      } else {
        // 琶音
        const arp = fbmArp.generateArpeggio(chordMidis, chordStart, chordDur, 2 + density * 4);
        events.push(...arp);
      }

      // 分形装饰音
      if (density > 0.6) {
        const ornaments = fractal.generateOrnaments(chord.root, 4);
        for (let i = 0; i < ornaments.length; i++) {
          events.push({
            midi: ornaments[i],
            startTime: chordStart + i * 0.2,
            duration: 0.15,
            velocity: 0.3,
          });
        }
      }
    }
    return events;
  }

  private generateMelody(
    progression: ChordEvent[],
    sectionStart: number,
    bars: number,
    beatDur: number,
    density: number
  ): NoteEvent[] {
    const events: NoteEvent[] = [];
    const scale = [0, 2, 4, 5, 7, 9, 11];
    let currentBar = 0;
    for (const chord of progression) {
      const chordStart = sectionStart + chord.startBar * 4 * beatDur;
      const notesPerBar = Math.floor(2 + density * 4);
      for (let n = 0; n < notesPerBar * chord.durationBars; n++) {
        const step = n / notesPerBar;
        const offset = scale[Math.floor(Math.random() * scale.length)];
        const midi = chord.root + offset + (Math.random() > 0.8 ? 12 : 0);
        events.push({
          midi,
          startTime: chordStart + step * beatDur,
          duration: beatDur * 0.5,
          velocity: 0.5 + Math.random() * 0.3,
        });
      }
      currentBar += chord.durationBars;
    }
    return events;
  }

  private generateChineseOrnaments(
    progression: ChordEvent[],
    sectionStart: number,
    beatDur: number,
    fractal: FractalMelodyEngine
  ): NoteEvent[] {
    const events: NoteEvent[] = [];
    const pentatonic = [0, 2, 4, 7, 9]; // 五声音阶
    for (const chord of progression) {
      const chordStart = sectionStart + chord.startBar * 4 * beatDur;
      const passing = fractal.generatePassingTones(chord.root, chord.root + 4, 3);
      for (let i = 0; i < passing.length; i++) {
        const pentOffset = pentatonic[Math.floor(Math.random() * pentatonic.length)];
        events.push({
          midi: passing[i] + pentOffset,
          startTime: chordStart + i * 0.25 * beatDur,
          duration: 0.2,
          velocity: 0.4,
          slideTo: passing[i] + pentOffset + 2,
        });
      }
    }
    return events;
  }

  /**
   * 对位旋律生成 — 与主旋律形成三度/六度平行或反向进行
   */
  private generateCounterpoint(
    progression: ChordEvent[],
    sectionStart: number,
    bars: number,
    beatDur: number,
    density: number
  ): NoteEvent[] {
    const events: NoteEvent[] = [];
    const scale = [0, 2, 4, 5, 7, 9, 11];
    // 对位使用更稀疏的节奏，与主旋律错开
    const notesPerBar = Math.max(1, Math.floor(1 + density * 2));
    for (const chord of progression) {
      const chordStart = sectionStart + chord.startBar * 4 * beatDur;
      const chordMidis = AudioUtils.chordToMidi(chord.root, chord.quality);
      for (let n = 0; n < notesPerBar * chord.durationBars; n++) {
        const step = (n + 0.5) / notesPerBar; // 错开半拍
        // 优先选择和弦内音下方三度或六度
        const chordTone = chordMidis[Math.floor(Math.random() * chordMidis.length)];
        const interval = Math.random() > 0.5 ? -3 : -8; // 下方三度或十度
        const midi = chordTone + interval;
        events.push({
          midi,
          startTime: chordStart + step * beatDur,
          duration: beatDur * 0.6,
          velocity: 0.35 + Math.random() * 0.2, // 更轻柔
        });
      }
    }
    return events;
  }
}

// ==================== 多轨混音引擎 ====================

/**
 * 单轨混音器
 * 增益、声像、EQ、静音、独奏
 */
export class TrackMixer {
  private config: TrackConfig;
  private buffer: Float32Array;

  constructor(config: TrackConfig, buffer: Float32Array) {
    this.config = config;
    this.buffer = buffer;
  }

  getConfig(): TrackConfig {
    return this.config;
  }

  getBuffer(): Float32Array {
    return this.buffer;
  }

  /** 处理轨道并输出立体声（interleaved L/R） */
  process(): Float32Array {
    if (this.config.mute) return new Float32Array(this.buffer.length * 2);

    const pan = this.config.pan;
    const gain = this.config.gain;
    const len = this.buffer.length;
    const out = new Float32Array(len * 2);

    // 简单 shelving EQ 模拟（增益缩放近似）
    const lowBoost = Math.pow(10, this.config.lowShelfDb / 20);
    const highBoost = Math.pow(10, this.config.highShelfDb / 20);

    const leftGain = gain * Math.min(1, 1 - pan) * Math.SQRT1_2;
    const rightGain = gain * Math.min(1, 1 + pan) * Math.SQRT1_2;

    for (let i = 0; i < len; i++) {
      const sample = this.buffer[i];
      // 简单 EQ：低频通过增益，高频通过另一增益（此处简化统一处理）
      const eqSample = sample * ((lowBoost + highBoost) / 2);
      out[i * 2] = eqSample * leftGain;
      out[i * 2 + 1] = eqSample * rightGain;
    }

    return out;
  }

  getRMS(): number {
    return AudioUtils.rms(this.buffer);
  }
}

/**
 * 多轨混音引擎
 * 最多16轨，自动平衡，限制器
 */
export class MixingEngine {
  private tracks: TrackMixer[] = [];

  addTrack(config: TrackConfig, buffer: Float32Array): void {
    if (this.tracks.length >= MAX_TRACKS) {
      throw new Error(`轨道数超过最大值 ${MAX_TRACKS}`);
    }
    this.tracks.push(new TrackMixer(config, buffer));
  }

  /**
   * 混音并输出立体声 interleaved Float32Array
   */
  mix(): Float32Array {
    if (this.tracks.length === 0) return new Float32Array(0);

    // 确定最大长度
    let maxLen = 0;
    for (const t of this.tracks) {
      const len = t.getBuffer().length;
      if (len > maxLen) maxLen = len;
    }

    // 检查是否有 solo 轨道
    const hasSolo = this.tracks.some((t) => t.getConfig().solo);

    const mixed = new Float32Array(maxLen * 2);

    // 先计算 RMS 用于自动平衡
    const rmsValues = this.tracks.map((t) => t.getRMS());
    const avgRMS = rmsValues.reduce((a, b) => a + b, 0) / rmsValues.length;

    for (let i = 0; i < this.tracks.length; i++) {
      const track = this.tracks[i];
      const cfg = track.getConfig();
      if (hasSolo && !cfg.solo) continue;

      const processed = track.process();
      const trackMaxLen = processed.length / 2;

      // 自动平衡
      const rms = rmsValues[i];
      const balanceGain = avgRMS > 0 ? avgRMS / (rms + 1e-10) : 1;
      const autoGain = Math.min(2, balanceGain);

      for (let j = 0; j < trackMaxLen; j++) {
        mixed[j * 2] += processed[j * 2] * autoGain;
        mixed[j * 2 + 1] += processed[j * 2 + 1] * autoGain;
      }
    }

    // 限制器防止削波
    const limiterThreshold = 0.95;
    for (let i = 0; i < mixed.length; i++) {
      if (mixed[i] > limiterThreshold) {
        mixed[i] = limiterThreshold + (mixed[i] - limiterThreshold) * 0.1;
      } else if (mixed[i] < -limiterThreshold) {
        mixed[i] = -limiterThreshold + (mixed[i] + limiterThreshold) * 0.1;
      }
    }

    return mixed;
  }

  /** 导出各轨原始 buffer */
  exportTracks(): Float32Array[] {
    return this.tracks.map((t) => new Float32Array(t.getBuffer()));
  }
}

// ==================== 伴奏生成入口 ====================

/**
 * RealisticArrangerEngine 主类
 * 输入调性、BPM、风格、段落、情绪，输出多轨音频与 MIDI 事件
 */
export default class RealisticArrangerEngine {
  private sampleRate = SAMPLE_RATE;

  /**
   * 获取乐器合成器实例
   */
  private getSynthesizer(type: InstrumentType): InstrumentSynthesizer {
    switch (type) {
      case "piano": return new PianoSynthesizer();
      case "acousticGuitar": return new AcousticGuitarSynthesizer();
      case "electricGuitar": return new ElectricGuitarSynthesizer();
      case "bass": return new BassSynthesizer();
      case "drumKit": return new DrumKitSynthesizer();
      case "violin": return new ViolinSynthesizer();
      case "cello": return new CelloSynthesizer();
      case "flute": return new FluteSynthesizer();
      case "saxophone": return new SaxophoneSynthesizer();
      case "synth": return new SynthSynthesizer();
      case "guzheng": return new GuzhengSynthesizer();
      case "erhu": return new ErhuSynthesizer();
      case "pipa": return new PipaSynthesizer();
      case "dizi": return new DiziSynthesizer();
      case "xiao": return new XiaoSynthesizer();
      case "luoGu": return new LuoGuSynthesizer();
      case "yangQin": return new YangQinSynthesizer();
      case "suoNa": return new SuoNaSynthesizer();
      default: return new PianoSynthesizer();
    }
  }

  /**
   * 生成完整伴奏
   * @param input 编曲输入参数
   * @returns 多轨音频输出
   */
  generate(input: ArrangementInput): MultiTrackOutput {
    const { style, bpm, sections, emotion } = input;

    // 1. 编曲规划
    const arranger = new ArrangementEngine(style, bpm, emotion);
    const arrangement = arranger.arrangeSections(sections);

    // 2. 人性化处理
    const humanizer = new HumanizationEngine();
    for (const [inst, notes] of arrangement.entries()) {
      const humanized = humanizer.humanize(notes, emotion, bpm);
      arrangement.set(inst, humanized);
    }

    // 3. 混沌力度映射（可选增强）
    const chaos = new ChaosEngine();
    for (const [inst, notes] of arrangement.entries()) {
      if (["drumKit", "bass", "synth"].includes(inst)) {
        const mapped = chaos.mapToNotes(notes);
        arrangement.set(inst, mapped);
      }
    }

    // 4. 计算总时长
    let totalDuration = input.totalDuration ?? 0;
    if (totalDuration === 0) {
      for (const notes of arrangement.values()) {
        for (const n of notes) {
          totalDuration = Math.max(totalDuration, n.startTime + n.duration);
        }
      }
      totalDuration += 2; // 尾部余量
    }
    const totalSamples = Math.ceil(totalDuration * this.sampleRate);

    // 5. 逐轨合成
    const template = StyleTemplates.getTemplate(style);
    const trackBuffers = new Map<InstrumentType, Float32Array>();
    const trackConfigs: TrackConfig[] = [];

    for (const [inst, notes] of arrangement.entries()) {
      const synth = this.getSynthesizer(inst);
      const buffer = new Float32Array(totalSamples);
      for (const note of notes) {
        const noteBuf = synth.renderNote(note, emotion);
        const offset = Math.floor(note.startTime * this.sampleRate);
        AudioUtils.mixInto(buffer, noteBuf, offset, note.velocity);
      }
      trackBuffers.set(inst, buffer);
      trackConfigs.push({
        name: inst,
        instrument: inst,
        gain: 0.8,
        pan: Math.random() * 0.4 - 0.2,
        mute: false,
        solo: false,
        highShelfDb: 0,
        lowShelfDb: 0,
      });
    }

    // 6. 多轨混音
    const mixer = new MixingEngine();
    for (const cfg of trackConfigs) {
      const buf = trackBuffers.get(cfg.instrument);
      if (buf) mixer.addTrack(cfg, buf);
    }

    const mixed = mixer.mix();

    // 7. 分离立体声为单声道各轨（返回单声道 buffer 列表）
    const tracks: Float32Array[] = [];
    for (const cfg of trackConfigs) {
      const buf = trackBuffers.get(cfg.instrument);
      if (buf) tracks.push(buf);
    }

    return {
      tracks,
      mixed,
      sampleRate: this.sampleRate,
      duration: totalDuration,
    };
  }

  /**
   * 生成 MIDI-like 事件序列
   */
  generateMidiEvents(input: ArrangementInput): MidiEvent[] {
    const { style, bpm, sections, emotion } = input;
    const arranger = new ArrangementEngine(style, bpm, emotion);
    const arrangement = arranger.arrangeSections(sections);

    const midiEvents: MidiEvent[] = [];
    let trackIdx = 0;
    for (const [inst, notes] of arrangement.entries()) {
      for (const note of notes) {
        midiEvents.push({
          type: "noteOn",
          track: trackIdx,
          midi: note.midi,
          time: note.startTime,
          velocity: Math.floor(note.velocity * 127),
        });
        midiEvents.push({
          type: "noteOff",
          track: trackIdx,
          midi: note.midi,
          time: note.startTime + note.duration,
          velocity: 0,
        });
      }
      trackIdx++;
    }

    midiEvents.sort((a, b) => a.time - b.time);
    return midiEvents;
  }

  /**
   * 将 Float32Array 导出为 WAV 格式二进制数据
   * @param interleavedStereo 立体声 interleaved 数据
   */
  exportWav(interleavedStereo: Float32Array): ArrayBuffer {
    const sampleRate = this.sampleRate;
    const numChannels = 2;
    const numFrames = interleavedStereo.length / numChannels;
    const bytesPerSample = 2;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = numFrames * blockAlign;

    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    // RIFF chunk
    this.writeString(view, 0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    this.writeString(view, 8, "WAVE");

    // fmt chunk
    this.writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true); // 16-bit

    // data chunk
    this.writeString(view, 36, "data");
    view.setUint32(40, dataSize, true);

    let offset = 44;
    for (let i = 0; i < interleavedStereo.length; i++) {
      const sample = Math.max(-1, Math.min(1, interleavedStereo[i]));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }

    return buffer;
  }

  private writeString(view: DataView, offset: number, str: string): void {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }
}

// ==================== 附加工具函数 ====================

/**
 * 快速生成标准段落结构
 */
export function generateStandardSections(
  keyRoot: number,
  barsPerSection: number = 8,
  style: StyleType = 'pop'
): Section[] {
  // 丰富和弦进行：根据风格选择不同级数和弦品质
  const richQualitiesMap: Record<string, ChordQuality[]> = {
    pop:    ["major", "minor", "min7", "major", "dom7", "minor", "min7", "maj7"],
    rock:   ["major", "minor", "minor", "major", "dom7", "minor", "dom7", "major"],
    jazz:   ["maj7", "min7", "min7", "maj7", "dom7", "min7", "m7b5", "dom7"],
    rnb:    ["maj7", "min7", "min9", "maj7", "dom7", "minor", "min7", "maj7"],
    blues:  ["dom7", "dom7", "dom7", "dom7", "dom7", "dom7", "dom7", "dom7"],
    folk:   ["major", "minor", "major", "major", "major", "minor", "dom7", "major"],
    classical: ["major", "minor", "min7", "major", "dom7", "minor", "dim", "major"],
    chinese: ["major", "minor", "major", "major", "minor", "minor", "major", "major"],
    electronic: ["minor", "min7", "major", "min7", "minor", "min7", "dom7", "minor"],
    metal:  ["minor", "dim", "major", "minor", "minor", "dim", "major", "minor"],
  };
  const qualities = richQualitiesMap[style] || richQualitiesMap.pop;
  const progression = qualities.map((q, i) => ({
    startBar: i * 2,
    durationBars: 2,
    root: keyRoot + [0, 2, 4, 5, 7, 9, 11, 0][i],
    quality: q,
  }));

  // 转调：Bridge 升全音（或半音）增加张力
  const bridgeProgression = progression.slice(4, 6).map(ch => ({
    ...ch,
    root: ch.root + 2, // 升全音
    quality: ch.quality === 'minor' ? 'min7' : 'maj7' as ChordQuality,
  }));

  return [
    { type: "intro", bars: 4, chordProgression: progression.slice(0, 2) },
    { type: "verse", bars: barsPerSection, chordProgression: progression },
    { type: "preChorus", bars: 4, chordProgression: progression.slice(2, 6) },
    { type: "chorus", bars: barsPerSection, chordProgression: progression },
    { type: "bridge", bars: 4, chordProgression: bridgeProgression },
    { type: "outro", bars: 4, chordProgression: progression.slice(0, 2) },
  ];
}

/**
 * 将调性字符串解析为根音 MIDI
 */
export function parseKeyToMidi(key: string): number {
  const map: Record<string, number> = {
    C: 60, "C#": 61, Db: 61, D: 62, "D#": 63, Eb: 63, E: 64,
    F: 65, "F#": 66, Gb: 66, G: 67, "G#": 68, Ab: 68, A: 69,
    "A#": 70, Bb: 70, B: 71,
  };
  return map[key] ?? 60;
}

// ==================== 扩展效果工具 ====================

/**
 * 音频后处理链
 * 应用混响、延迟、合唱等效果到总线
 */
export class MasterBusProcessor {
  private reverb = new ReverbProcessor();
  private delay = new DelayProcessor();
  private chorus = new ChorusProcessor();

  process(input: Float32Array, params: EffectParams): Float32Array {
    let buf: Float32Array = input;
    if (params.reverbAmount > 0) {
      buf = this.reverb.process(buf, params.reverbAmount);
    }
    if (params.delayTime > 0 && params.delayFeedback > 0) {
      buf = this.delay.process(buf, params.delayTime, params.delayFeedback, 0.3);
    }
    if (params.chorusDepth > 0) {
      buf = this.chorus.process(buf, params.chorusRate, params.chorusDepth, 0.25);
    }
    return buf;
  }
}

/**
 * 五声音阶工具
 * 中国风格音阶辅助
 */
export class PentatonicScale {
  static readonly intervals = [0, 2, 4, 7, 9];

  static getNotes(root: number, octaves = 2): number[] {
    const notes: number[] = [];
    for (let o = 0; o < octaves; o++) {
      for (const interval of PentatonicScale.intervals) {
        notes.push(root + interval + o * 12);
      }
    }
    return notes;
  }

  static quantize(midi: number, root: number): number {
    const octave = Math.floor((midi - root) / 12);
    const rel = ((midi - root) % 12 + 12) % 12;
    let closest = PentatonicScale.intervals[0];
    let minDist = Infinity;
    for (const interval of PentatonicScale.intervals) {
      const dist = Math.abs(interval - rel);
      if (dist < minDist) {
        minDist = dist;
        closest = interval;
      }
    }
    return root + closest + octave * 12;
  }
}

/**
 * 节奏网格量化器
 * 将音符时间对齐到网格，同时保留微扰感
 */
export class RhythmQuantizer {
  static quantize(notes: NoteEvent[], bpm: number, grid: "1/4" | "1/8" | "1/16" = "1/16", strength = 0.5): NoteEvent[] {
    const beatDur = 60 / bpm;
    const gridMap = { "1/4": 1, "1/8": 0.5, "1/16": 0.25 };
    const step = gridMap[grid] * beatDur;
    return notes.map((n) => {
      const quantized = Math.round(n.startTime / step) * step;
      const mixed = AudioUtils.lerp(n.startTime, quantized, strength);
      return { ...n, startTime: mixed };
    });
  }
}

/**
 * 和声进行生成器
 * 根据风格和情绪自动生成和弦进行
 */
export class ChordProgressionGenerator {
  static generate(style: StyleType, keyRoot: number, bars: number): ChordEvent[] {
    const progressions: Record<StyleType, Array<[number, string]>> = {
      pop: [[0, "major"], [5, "major"], [3, "minor"], [4, "major"]],
      rock: [[0, "minor"], [5, "major"], [3, "minor"], [4, "major"]],
      jazz: [[0, "maj7"], [2, "min7"], [5, "dom7"], [0, "maj7"]],
      electronic: [[0, "minor"], [3, "minor"], [5, "major"], [4, "major"]],
      classical: [[0, "major"], [4, "major"], [5, "major"], [0, "major"]],
      folk: [[0, "major"], [5, "major"], [4, "major"], [0, "major"]],
      chinese: [[0, "major"], [2, "minor"], [4, "major"], [5, "major"]],
      rnb: [[0, "min7"], [3, "min7"], [4, "maj7"], [5, "dom7"]],
      metal: [[0, "minor"], [6, "major"], [3, "minor"], [5, "major"]],
      blues: [[0, "dom7"], [0, "dom7"], [0, "dom7"], [0, "dom7"]],
    };

    const prog = progressions[style] ?? progressions.pop;
    const events: ChordEvent[] = [];
    const chordsPerBar = 1;
    for (let b = 0; b < bars; b++) {
      const [offset, quality] = prog[b % prog.length];
      events.push({
        startBar: b,
        durationBars: chordsPerBar,
        root: keyRoot + (offset as number),
        quality: quality as ChordQuality,
      });
    }
    return events;
  }
}

// ==================== GM MIDI 标准映射 ====================

/**
 * GM MIDI 鼓组标准映射
 * 提供常见鼓件名称到 MIDI 音符的转换
 */
export class GMDrumMap {
  static readonly kick = 36;
  static readonly snare = 38;
  static readonly handClap = 39;
  static readonly closedHiHat = 42;
  static readonly openHiHat = 46;
  static readonly crashCymbal1 = 49;
  static readonly rideCymbal1 = 51;
  static readonly highTom = 50;
  static readonly midTom = 47;
  static readonly lowTom = 43;
  static readonly hiBongo = 60;
  static readonly lowBongo = 61;
  static readonly tambourine = 54;
  static readonly splashCymbal = 55;
  static readonly cowbell = 56;
  static readonly vibraslap = 58;
  static readonly rideBell = 53;
  static readonly chineseCymbal = 52;
  static readonly sideStick = 37;
  static readonly pedalHiHat = 44;

  static getAllMidis(): number[] {
    return [
      GMDrumMap.kick, GMDrumMap.snare, GMDrumMap.handClap,
      GMDrumMap.closedHiHat, GMDrumMap.openHiHat, GMDrumMap.crashCymbal1,
      GMDrumMap.rideCymbal1, GMDrumMap.highTom, GMDrumMap.midTom,
      GMDrumMap.lowTom, GMDrumMap.hiBongo, GMDrumMap.lowBongo,
      GMDrumMap.tambourine, GMDrumMap.splashCymbal, GMDrumMap.cowbell,
      GMDrumMap.vibraslap, GMDrumMap.rideBell, GMDrumMap.chineseCymbal,
      GMDrumMap.sideStick, GMDrumMap.pedalHiHat,
    ];
  }

  static nameForMidi(midi: number): string {
    const map: Record<number, string> = {
      [GMDrumMap.kick]: "Kick",
      [GMDrumMap.snare]: "Snare",
      [GMDrumMap.closedHiHat]: "Closed Hi-Hat",
      [GMDrumMap.openHiHat]: "Open Hi-Hat",
      [GMDrumMap.crashCymbal1]: "Crash Cymbal",
      [GMDrumMap.rideCymbal1]: "Ride Cymbal",
      [GMDrumMap.sideStick]: "Side Stick",
      [GMDrumMap.pedalHiHat]: "Pedal Hi-Hat",
      [GMDrumMap.highTom]: "High Tom",
      [GMDrumMap.midTom]: "Mid Tom",
      [GMDrumMap.lowTom]: "Low Tom",
    };
    return map[midi] ?? "Unknown";
  }
}

/**
 * GM MIDI 乐器标准映射
 * 提供乐器名称到 MIDI 程序号的转换
 */
export class GMInstrumentMap {
  static readonly acousticGrandPiano = 0;
  static readonly brightAcousticPiano = 1;
  static readonly electricGrandPiano = 2;
  static readonly harpsichord = 6;
  static readonly clavinet = 7;
  static readonly celesta = 8;
  static readonly glockenspiel = 9;
  static readonly musicBox = 10;
  static readonly vibraphone = 11;
  static readonly marimba = 12;
  static readonly xylophone = 13;
  static readonly tubularBells = 14;
  static readonly dulcimer = 15;
  static readonly drawbarOrgan = 16;
  static readonly percussionOrgan = 17;
  static readonly rockOrgan = 18;
  static readonly churchOrgan = 19;
  static readonly reedOrgan = 20;
  static readonly accordion = 21;
  static readonly harmonica = 22;
  static readonly tangoAccordion = 23;
  static readonly acousticGuitarNylon = 24;
  static readonly acousticGuitarSteel = 25;
  static readonly electricGuitarJazz = 26;
  static readonly electricGuitarClean = 27;
  static readonly electricGuitarMuted = 28;
  static readonly overdrivenGuitar = 29;
  static readonly distortionGuitar = 30;
  static readonly guitarHarmonics = 31;
  static readonly acousticBass = 32;
  static readonly electricBassFinger = 33;
  static readonly electricBassPick = 34;
  static readonly fretlessBass = 35;
  static readonly slapBass1 = 36;
  static readonly slapBass2 = 37;
  static readonly synthBass1 = 38;
  static readonly synthBass2 = 39;
  static readonly violin = 40;
  static readonly viola = 41;
  static readonly cello = 42;
  static readonly contrabass = 43;
  static readonly tremoloStrings = 44;
  static readonly pizzicatoStrings = 45;
  static readonly orchestralHarp = 46;
  static readonly timpani = 47;
  static readonly stringEnsemble1 = 48;
  static readonly stringEnsemble2 = 49;
  static readonly synthStrings1 = 50;
  static readonly synthStrings2 = 51;
  static readonly choirAahs = 52;
  static readonly voiceOohs = 53;
  static readonly synthVoice = 54;
  static readonly orchestraHit = 55;
  static readonly trumpet = 56;
  static readonly trombone = 57;
  static readonly tuba = 58;
  static readonly mutedTrumpet = 59;
  static readonly frenchHorn = 60;
  static readonly brassSection = 61;
  static readonly synthBrass1 = 62;
  static readonly synthBrass2 = 63;
  static readonly sopranoSax = 64;
  static readonly altoSax = 65;
  static readonly tenorSax = 66;
  static readonly baritoneSax = 67;
  static readonly oboe = 68;
  static readonly englishHorn = 69;
  static readonly bassoon = 70;
  static readonly clarinet = 71;
  static readonly piccolo = 72;
  static readonly flute = 73;
  static readonly recorder = 74;
  static readonly panFlute = 75;
  static readonly blownBottle = 76;
  static readonly shakuhachi = 77;
  static readonly whistle = 78;
  static readonly ocarina = 79;
  static readonly lead1Square = 80;
  static readonly lead2Sawtooth = 81;
  static readonly lead3Calliope = 82;
  static readonly lead4Chiff = 83;
  static readonly lead5Charang = 84;
  static readonly lead6Voice = 85;
  static readonly lead7Fifths = 86;
  static readonly lead8BassLead = 87;
  static readonly pad1NewAge = 88;
  static readonly pad2Warm = 89;
  static readonly pad3Polysynth = 90;
  static readonly pad4Choir = 91;
  static readonly pad5Bowed = 92;
  static readonly pad6Metallic = 93;
  static readonly pad7Halo = 94;
  static readonly pad8Sweep = 95;
  static readonly fx1Rain = 96;
  static readonly fx2Soundtrack = 97;
  static readonly fx3Crystal = 98;
  static readonly fx4Atmosphere = 99;
  static readonly fx5Brightness = 100;
  static readonly fx6Goblins = 101;
  static readonly fx7Echoes = 102;
  static readonly fx8SciFi = 103;
  static readonly sitar = 104;
  static readonly banjo = 105;
  static readonly shamisen = 106;
  static readonly koto = 107;
  static readonly kalimba = 108;
  static readonly bagpipe = 109;
  static readonly fiddle = 110;
  static readonly shanai = 111;
  static readonly tinkleBell = 112;
  static readonly agogo = 113;
  static readonly steelDrums = 114;
  static readonly woodblock = 115;
  static readonly taikoDrum = 116;
  static readonly melodicTom = 117;
  static readonly synthDrum = 118;
  static readonly reverseCymbal = 119;
  static readonly guitarFretNoise = 120;
  static readonly breathNoise = 121;
  static readonly seashore = 122;
  static readonly birdTweet = 123;
  static readonly telephoneRing = 124;
  static readonly helicopter = 125;
  static readonly applause = 126;
  static readonly gunshot = 127;
}

// ==================== 调式音阶生成器 ====================

/**
 * 音乐调式音阶生成器
 * 支持大调、自然小调、和声小调、旋律小调、多利亚、弗里几亚、利底亚、混合利底亚、洛克里亚
 */
export type ModalScaleName =
  | "ionian" | "dorian" | "phrygian" | "lydian" | "mixolydian"
  | "aeolian" | "locrian" | "harmonicMinor" | "melodicMinor"
  | "pentatonicMajor" | "pentatonicMinor" | "bluesScale"
  | "wholeTone" | "diminished";

export class ModalScale {
  static readonly ionian = [0, 2, 4, 5, 7, 9, 11];
  static readonly dorian = [0, 2, 3, 5, 7, 9, 10];
  static readonly phrygian = [0, 1, 3, 5, 7, 8, 10];
  static readonly lydian = [0, 2, 4, 6, 7, 9, 11];
  static readonly mixolydian = [0, 2, 4, 5, 7, 9, 10];
  static readonly aeolian = [0, 2, 3, 5, 7, 8, 10];
  static readonly locrian = [0, 1, 3, 5, 6, 8, 10];
  static readonly harmonicMinor = [0, 2, 3, 5, 7, 8, 11];
  static readonly melodicMinor = [0, 2, 3, 5, 7, 9, 11];
  static readonly pentatonicMajor = [0, 2, 4, 7, 9];
  static readonly pentatonicMinor = [0, 3, 5, 7, 10];
  static readonly bluesScale = [0, 3, 5, 6, 7, 10];
  static readonly wholeTone = [0, 2, 4, 6, 8, 10];
  static readonly diminished = [0, 2, 3, 5, 6, 8, 9, 11];

  static getScale(mode: ModalScaleName, root: number, octaves = 2): number[] {
    const intervals = ModalScale[mode];
    const notes: number[] = [];
    for (let o = 0; o < octaves; o++) {
      for (const interval of intervals) {
        notes.push(root + interval + o * 12);
      }
    }
    return notes;
  }

  static quantize(midi: number, root: number, mode: ModalScaleName): number {
    const intervals = ModalScale[mode];
    const octave = Math.floor((midi - root) / 12);
    const rel = ((midi - root) % 12 + 12) % 12;
    let closest = intervals[0];
    let minDist = Infinity;
    for (const interval of intervals) {
      const dist = Math.abs(interval - rel);
      if (dist < minDist) {
        minDist = dist;
        closest = interval;
      }
    }
    return root + closest + octave * 12;
  }
}

// ==================== 风格节奏型库 ====================

/**
 * 扩展风格节奏型库
 * 提供更丰富的鼓组节奏型和变奏模式
 */
export class RhythmPatternLibrary {
  static getPattern(style: StyleType, intensity: "low" | "medium" | "high"): number[] {
    const patterns: Record<StyleType, Record<string, number[]>> = {
      pop: {
        low: [36, 0, 0, 0, 0, 0, 42, 0, 38, 0, 0, 0, 0, 0, 42, 0],
        medium: [36, 0, 42, 0, 38, 0, 42, 0, 36, 0, 42, 0, 38, 0, 42, 0],
        high: [36, 42, 42, 42, 38, 42, 42, 42, 36, 42, 42, 42, 38, 42, 46, 42],
      },
      rock: {
        low: [36, 0, 0, 0, 38, 0, 0, 0, 36, 0, 0, 0, 38, 0, 0, 0],
        medium: [36, 0, 42, 42, 38, 0, 42, 0, 36, 0, 42, 42, 38, 0, 42, 0],
        high: [36, 42, 36, 42, 38, 42, 38, 42, 36, 42, 36, 42, 38, 46, 38, 46],
      },
      jazz: {
        low: [36, 0, 0, 0, 36, 0, 0, 0, 36, 0, 0, 0, 36, 0, 0, 0],
        medium: [36, 0, 42, 42, 36, 0, 42, 42, 36, 0, 42, 42, 36, 0, 42, 42],
        high: [36, 42, 42, 42, 36, 42, 42, 42, 36, 42, 42, 42, 36, 42, 46, 42],
      },
      electronic: {
        low: [36, 0, 0, 0, 0, 0, 0, 0, 36, 0, 0, 0, 0, 0, 0, 0],
        medium: [36, 0, 42, 0, 36, 0, 42, 0, 36, 0, 42, 0, 36, 0, 42, 0],
        high: [36, 42, 42, 42, 36, 42, 42, 42, 36, 42, 42, 42, 36, 42, 42, 42],
      },
      classical: {
        low: [],
        medium: [],
        high: [],
      },
      folk: {
        low: [36, 0, 0, 0, 38, 0, 0, 0, 36, 0, 0, 0, 38, 0, 0, 0],
        medium: [36, 0, 42, 0, 38, 0, 42, 0, 36, 0, 42, 0, 38, 0, 42, 0],
        high: [36, 42, 42, 42, 38, 42, 42, 42, 36, 42, 42, 42, 38, 42, 46, 42],
      },
      chinese: {
        low: [36, 0, 0, 0, 38, 0, 0, 0, 36, 0, 0, 0, 38, 0, 0, 0],
        medium: [36, 0, 42, 42, 38, 0, 42, 42, 36, 0, 42, 42, 38, 0, 42, 42],
        high: [36, 42, 46, 42, 38, 42, 46, 42, 36, 42, 46, 42, 38, 42, 46, 42],
      },
      rnb: {
        low: [36, 0, 0, 0, 0, 0, 42, 0, 38, 0, 0, 0, 0, 0, 42, 0],
        medium: [36, 0, 42, 0, 36, 42, 42, 0, 36, 0, 42, 0, 38, 42, 42, 0],
        high: [36, 42, 42, 42, 36, 42, 42, 42, 36, 42, 42, 42, 38, 42, 46, 42],
      },
      metal: {
        low: [36, 0, 36, 0, 38, 0, 38, 0, 36, 0, 36, 0, 38, 0, 38, 0],
        medium: [36, 36, 42, 42, 38, 38, 42, 42, 36, 36, 42, 42, 38, 38, 42, 42],
        high: [36, 36, 36, 36, 38, 38, 38, 38, 36, 36, 36, 36, 46, 46, 46, 46],
      },
      blues: {
        low: [36, 0, 0, 0, 36, 0, 0, 0, 36, 0, 0, 0, 36, 0, 0, 0],
        medium: [36, 0, 42, 0, 36, 0, 42, 0, 36, 0, 42, 0, 38, 0, 42, 0],
        high: [36, 42, 42, 42, 36, 42, 42, 42, 36, 42, 42, 42, 38, 42, 46, 42],
      },
    };
    return (patterns[style] ?? patterns.pop)[intensity] ?? [];
  }

  static getFillPattern(style: StyleType): number[] {
    const fills: Record<StyleType, number[]> = {
      pop: [36, 38, 42, 38, 36, 38, 42, 46, 36, 38, 42, 46, 36, 38, 46, 46],
      rock: [36, 36, 38, 38, 36, 38, 46, 46, 36, 38, 36, 38, 46, 46, 46, 46],
      jazz: [36, 38, 42, 38, 36, 38, 46, 42, 36, 38, 42, 38, 36, 38, 46, 42],
      electronic: [36, 42, 38, 42, 36, 42, 46, 42, 36, 42, 38, 42, 36, 42, 46, 42],
      classical: [],
      folk: [36, 38, 42, 0, 36, 38, 46, 0, 36, 38, 42, 0, 36, 38, 46, 0],
      chinese: [36, 38, 46, 38, 36, 38, 46, 38, 36, 38, 46, 38, 36, 38, 46, 38],
      rnb: [36, 38, 42, 38, 36, 42, 46, 42, 36, 38, 42, 38, 36, 42, 46, 42],
      metal: [36, 38, 36, 38, 46, 38, 36, 38, 36, 38, 36, 38, 46, 46, 46, 46],
      blues: [36, 38, 42, 38, 36, 38, 46, 38, 36, 38, 42, 38, 36, 38, 46, 38],
    };
    return fills[style] ?? fills.pop;
  }
}

// ==================== 音频分析工具 ====================

/**
 * 频谱分析器（简化 STFT）
 * 提供短时傅里叶变换幅值谱计算
 */
export class SpectrumAnalyzer {
  private windowSize: number;
  private hopSize: number;

  constructor(windowSize = 2048, hopSize = 512) {
    this.windowSize = windowSize;
    this.hopSize = hopSize;
  }

  /** 汉宁窗 */
  private hannWindow(size: number): Float32Array {
    const win = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      win[i] = 0.5 * (1 - Math.cos((TWO_PI * i) / (size - 1)));
    }
    return win;
  }

  /** 简化 DFT（仅计算幅值谱） */
  analyze(buffer: Float32Array): Float32Array[] {
    const frames: Float32Array[] = [];
    const window = this.hannWindow(this.windowSize);
    for (let start = 0; start + this.windowSize <= buffer.length; start += this.hopSize) {
      const frame = new Float32Array(this.windowSize / 2);
      for (let k = 0; k < this.windowSize / 2; k++) {
        let real = 0;
        let imag = 0;
        for (let n = 0; n < this.windowSize; n++) {
          const sample = buffer[start + n] * window[n];
          const angle = -(TWO_PI * k * n) / this.windowSize;
          real += sample * Math.cos(angle);
          imag += sample * Math.sin(angle);
        }
        frame[k] = Math.sqrt(real * real + imag * imag) / this.windowSize;
      }
      frames.push(frame);
    }
    return frames;
  }

  /** 计算频谱质心（亮度指标） */
  spectralCentroid(frames: Float32Array[]): number[] {
    const centroids: number[] = [];
    const binFreq = SAMPLE_RATE / this.windowSize;
    for (const frame of frames) {
      let sumAmp = 0;
      let weightedSum = 0;
      for (let k = 0; k < frame.length; k++) {
        sumAmp += frame[k];
        weightedSum += frame[k] * k * binFreq;
      }
      centroids.push(sumAmp > 0 ? weightedSum / sumAmp : 0);
    }
    return centroids;
  }

  /** 计算频谱平坦度（噪声/音调指标） */
  spectralFlatness(frames: Float32Array[]): number[] {
    const flatness: number[] = [];
    for (const frame of frames) {
      let geometric = 0;
      let arithmetic = 0;
      let count = 0;
      for (let k = 0; k < frame.length; k++) {
        if (frame[k] > 1e-10) {
          geometric += Math.log(frame[k]);
          arithmetic += frame[k];
          count++;
        }
      }
      if (count > 0) {
        geometric = Math.exp(geometric / count);
        arithmetic = arithmetic / count;
        flatness.push(geometric / (arithmetic + 1e-10));
      } else {
        flatness.push(0);
      }
    }
    return flatness;
  }
}

// ==================== 混音自动化 ====================

/**
 * 自动化包络生成器
 * 为轨道增益、声像、效果量生成随时间变化的包络
 */
export class AutomationEnvelope {
  static createFadeIn(duration: number, curve: "linear" | "exponential" = "linear"): Float32Array {
    const len = Math.floor(duration * SAMPLE_RATE);
    const env = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      env[i] = curve === "exponential" ? t * t : t;
    }
    return env;
  }

  static createFadeOut(duration: number, curve: "linear" | "exponential" = "linear"): Float32Array {
    const len = Math.floor(duration * SAMPLE_RATE);
    const env = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      env[i] = curve === "exponential" ? (1 - t) * (1 - t) : 1 - t;
    }
    return env;
  }

  static createCrescendo(totalDuration: number, startDb: number, endDb: number): Float32Array {
    const len = Math.floor(totalDuration * SAMPLE_RATE);
    const env = new Float32Array(len);
    const startGain = Math.pow(10, startDb / 20);
    const endGain = Math.pow(10, endDb / 20);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      env[i] = AudioUtils.lerp(startGain, endGain, t);
    }
    return env;
  }

  static applyToBuffer(buffer: Float32Array, envelope: Float32Array): void {
    const len = Math.min(buffer.length, envelope.length);
    for (let i = 0; i < len; i++) {
      buffer[i] *= envelope[i];
    }
  }
}

// ==================== 高级导出工具 ====================

/**
 * WAV 导出选项
 */
export interface WavExportOptions {
  bitDepth: 16 | 24 | 32;
  floatFormat: boolean;
  numChannels: 1 | 2;
}

/**
 * 高级 WAV 导出器
 * 支持 16/24/32bit 和浮点格式
 */
export class WavExporter {
  static export(buffer: Float32Array, sampleRate: number, options: WavExportOptions): ArrayBuffer {
    const numChannels = options.numChannels;
    const numFrames = buffer.length / numChannels;
    const bytesPerSample = options.bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = numFrames * blockAlign;

    const headerSize = 44;
    const totalSize = headerSize + dataSize;
    const arrayBuffer = new ArrayBuffer(totalSize);
    const view = new DataView(arrayBuffer);

    // RIFF chunk descriptor
    WavExporter.writeString(view, 0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    WavExporter.writeString(view, 8, "WAVE");

    // fmt sub-chunk
    WavExporter.writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    const formatCode = options.floatFormat ? 3 : 1;
    view.setUint16(20, formatCode, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, options.bitDepth, true);

    // data sub-chunk
    WavExporter.writeString(view, 36, "data");
    view.setUint32(40, dataSize, true);

    let offset = 44;
    for (let i = 0; i < buffer.length; i++) {
      const sample = Math.max(-1, Math.min(1, buffer[i]));
      if (options.floatFormat) {
        view.setFloat32(offset, sample, true);
        offset += 4;
      } else if (options.bitDepth === 32) {
        const intSample = sample < 0 ? sample * 0x80000000 : sample * 0x7fffffff;
        view.setInt32(offset, Math.floor(intSample), true);
        offset += 4;
      } else if (options.bitDepth === 24) {
        const intSample = sample < 0 ? sample * 0x800000 : sample * 0x7fffff;
        const val = Math.floor(intSample);
        view.setInt8(offset, val & 0xff);
        view.setInt8(offset + 1, (val >> 8) & 0xff);
        view.setInt8(offset + 2, (val >> 16) & 0xff);
        offset += 3;
      } else {
        const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
        view.setInt16(offset, Math.floor(intSample), true);
        offset += 2;
      }
    }

    return arrayBuffer;
  }

  private static writeString(view: DataView, offset: number, str: string): void {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }
}

// ==================== 预设工厂 ====================

/**
 * 伴奏预设工厂
 * 快速生成常见编曲配置的预设参数
 */
export class ArrangementPresetFactory {
  static createPopBallad(key = "C", bpm = 72): ArrangementInput {
    const root = parseKeyToMidi(key);
    return {
      key,
      bpm,
      style: "pop",
      emotion: "romantic",
      sections: [
        { type: "intro", bars: 4, chordProgression: ChordProgressionGenerator.generate("pop", root, 4) },
        { type: "verse", bars: 8, chordProgression: ChordProgressionGenerator.generate("pop", root, 8) },
        { type: "preChorus", bars: 4, chordProgression: ChordProgressionGenerator.generate("pop", root + 2, 4) },
        { type: "chorus", bars: 8, chordProgression: ChordProgressionGenerator.generate("pop", root, 8) },
        { type: "bridge", bars: 4, chordProgression: ChordProgressionGenerator.generate("pop", root + 5, 4) },
        { type: "outro", bars: 4, chordProgression: ChordProgressionGenerator.generate("pop", root, 4) },
      ],
    };
  }

  static createRockAnthem(key = "E", bpm = 140): ArrangementInput {
    const root = parseKeyToMidi(key);
    return {
      key,
      bpm,
      style: "rock",
      emotion: "epic",
      sections: [
        { type: "intro", bars: 4, chordProgression: ChordProgressionGenerator.generate("rock", root, 4) },
        { type: "verse", bars: 8, chordProgression: ChordProgressionGenerator.generate("rock", root, 8) },
        { type: "preChorus", bars: 4, chordProgression: ChordProgressionGenerator.generate("rock", root + 2, 4) },
        { type: "chorus", bars: 8, chordProgression: ChordProgressionGenerator.generate("rock", root, 8) },
        { type: "bridge", bars: 4, chordProgression: ChordProgressionGenerator.generate("rock", root + 7, 4) },
        { type: "outro", bars: 4, chordProgression: ChordProgressionGenerator.generate("rock", root, 4) },
      ],
    };
  }

  static createChineseFolk(key = "G", bpm = 90): ArrangementInput {
    const root = parseKeyToMidi(key);
    return {
      key,
      bpm,
      style: "chinese",
      emotion: "relaxed",
      sections: [
        { type: "intro", bars: 4, chordProgression: ChordProgressionGenerator.generate("chinese", root, 4) },
        { type: "verse", bars: 8, chordProgression: ChordProgressionGenerator.generate("chinese", root, 8) },
        { type: "preChorus", bars: 4, chordProgression: ChordProgressionGenerator.generate("chinese", root + 2, 4) },
        { type: "chorus", bars: 8, chordProgression: ChordProgressionGenerator.generate("chinese", root, 8) },
        { type: "bridge", bars: 4, chordProgression: ChordProgressionGenerator.generate("chinese", root + 5, 4) },
        { type: "outro", bars: 4, chordProgression: ChordProgressionGenerator.generate("chinese", root, 4) },
      ],
    };
  }

  static createJazzStandard(key = "Bb", bpm = 120): ArrangementInput {
    const root = parseKeyToMidi(key);
    return {
      key,
      bpm,
      style: "jazz",
      emotion: "relaxed",
      sections: [
        { type: "intro", bars: 4, chordProgression: ChordProgressionGenerator.generate("jazz", root, 4) },
        { type: "verse", bars: 8, chordProgression: ChordProgressionGenerator.generate("jazz", root, 8) },
        { type: "preChorus", bars: 4, chordProgression: ChordProgressionGenerator.generate("jazz", root + 2, 4) },
        { type: "chorus", bars: 8, chordProgression: ChordProgressionGenerator.generate("jazz", root, 8) },
        { type: "bridge", bars: 4, chordProgression: ChordProgressionGenerator.generate("jazz", root + 5, 4) },
        { type: "outro", bars: 4, chordProgression: ChordProgressionGenerator.generate("jazz", root, 4) },
      ],
    };
  }

  static createElectronicDance(key = "F", bpm = 128): ArrangementInput {
    const root = parseKeyToMidi(key);
    return {
      key,
      bpm,
      style: "electronic",
      emotion: "happy",
      sections: [
        { type: "intro", bars: 8, chordProgression: ChordProgressionGenerator.generate("electronic", root, 8) },
        { type: "verse", bars: 16, chordProgression: ChordProgressionGenerator.generate("electronic", root, 16) },
        { type: "preChorus", bars: 8, chordProgression: ChordProgressionGenerator.generate("electronic", root + 3, 8) },
        { type: "chorus", bars: 16, chordProgression: ChordProgressionGenerator.generate("electronic", root, 16) },
        { type: "bridge", bars: 8, chordProgression: ChordProgressionGenerator.generate("electronic", root + 7, 8) },
        { type: "outro", bars: 8, chordProgression: ChordProgressionGenerator.generate("electronic", root, 8) },
      ],
    };
  }
}

// ==================== 节拍与速度工具 ====================

/**
 * 速度转换工具
 * 提供 BPM、毫秒、采样数之间的互转
 */
export class TempoConverter {
  static bpmToMs(bpm: number, subdivision: "1/1" | "1/2" | "1/4" | "1/8" | "1/16" = "1/4"): number {
    const beatMs = 60000 / bpm;
    const divMap = { "1/1": 4, "1/2": 2, "1/4": 1, "1/8": 0.5, "1/16": 0.25 };
    return beatMs * (divMap[subdivision] ?? 1);
  }

  static bpmToSamples(bpm: number, subdivision: "1/1" | "1/2" | "1/4" | "1/8" | "1/16" = "1/4"): number {
    return Math.floor((TempoConverter.bpmToMs(bpm, subdivision) / 1000) * SAMPLE_RATE);
  }

  static msToBpm(ms: number): number {
    return 60000 / ms;
  }

  static tapTempo(tapIntervalsMs: number[]): number {
    if (tapIntervalsMs.length === 0) return 120;
    const avg = tapIntervalsMs.reduce((a, b) => a + b, 0) / tapIntervalsMs.length;
    return TempoConverter.msToBpm(avg);
  }
}

// ==================== 音符名称工具 ====================

/**
 * MIDI 音符名称转换
 */
export class NoteName {
  static readonly names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

  static fromMidi(midi: number): string {
    const octave = Math.floor(midi / 12) - 1;
    const name = NoteName.names[midi % 12];
    return `${name}${octave}`;
  }

  static toMidi(name: string): number {
    const match = name.match(/^([A-G][#b]?)(-?\d+)$/);
    if (!match) return 60;
    const noteName = match[1];
    const octave = parseInt(match[2], 10);
    const index = NoteName.names.indexOf(noteName);
    if (index === -1) return 60;
    return (octave + 1) * 12 + index;
  }
}

// ==================== 音频缓冲工具 ====================

/**
 * 音频缓冲区操作工具
 */
export class AudioBufferUtils {
  static createSilence(duration: number): Float32Array {
    return new Float32Array(Math.floor(duration * SAMPLE_RATE));
  }

  static concat(buffers: Float32Array[]): Float32Array {
    const totalLen = buffers.reduce((sum, b) => sum + b.length, 0);
    const result = new Float32Array(totalLen);
    let offset = 0;
    for (const buf of buffers) {
      result.set(buf, offset);
      offset += buf.length;
    }
    return result;
  }

  static slice(buffer: Float32Array, startSec: number, endSec: number): Float32Array {
    const start = Math.floor(startSec * SAMPLE_RATE);
    const end = Math.floor(endSec * SAMPLE_RATE);
    return buffer.slice(Math.max(0, start), Math.min(buffer.length, end));
  }

  static fadeInPlace(buffer: Float32Array, fadeDuration: number): void {
    const samples = Math.floor(fadeDuration * SAMPLE_RATE);
    for (let i = 0; i < Math.min(samples, buffer.length); i++) {
      buffer[i] *= i / samples;
    }
  }

  static fadeOutPlace(buffer: Float32Array, fadeDuration: number): void {
    const samples = Math.floor(fadeDuration * SAMPLE_RATE);
    const start = Math.max(0, buffer.length - samples);
    for (let i = start; i < buffer.length; i++) {
      buffer[i] *= (buffer.length - i) / samples;
    }
  }

  static normalize(buffer: Float32Array, targetPeak = 0.95): void {
    const peak = AudioUtils.peak(buffer);
    if (peak > 0) {
      const scale = targetPeak / peak;
      for (let i = 0; i < buffer.length; i++) {
        buffer[i] *= scale;
      }
    }
  }

  static stereoToMono(stereo: Float32Array): Float32Array {
    const frames = Math.floor(stereo.length / 2);
    const mono = new Float32Array(frames);
    for (let i = 0; i < frames; i++) {
      mono[i] = (stereo[i * 2] + stereo[i * 2 + 1]) * 0.5;
    }
    return mono;
  }

  static monoToStereo(mono: Float32Array): Float32Array {
    const stereo = new Float32Array(mono.length * 2);
    for (let i = 0; i < mono.length; i++) {
      stereo[i * 2] = mono[i];
      stereo[i * 2 + 1] = mono[i];
    }
    return stereo;
  }
}

// ==================== 额外效果器 ====================

/**
 * 相位效果器（Phaser）
 * 使用全通滤波器级联产生扫频凹陷效果
 */
export class PhaserProcessor {
  process(input: Float32Array, rate: number, depth: number, amount: number): Float32Array {
    if (amount <= 0) return new Float32Array(input);
    const len = input.length;
    const out = new Float32Array(len);
    const stages = 6;
    const allpassStates = new Float32Array(stages);

    for (let i = 0; i < len; i++) {
      const lfo = 0.5 + 0.5 * Math.sin(TWO_PI * rate * i / SAMPLE_RATE);
      const freq = 200 + lfo * depth * 2000;
      const coeff = (Math.tan(Math.PI * freq / SAMPLE_RATE) - 1) / (Math.tan(Math.PI * freq / SAMPLE_RATE) + 1);

      let sample = input[i];
      for (let s = 0; s < stages; s++) {
        const newState = sample * -coeff + allpassStates[s];
        allpassStates[s] = newState * coeff + sample;
        sample = newState;
      }

      out[i] = input[i] * (1 - amount) + sample * amount;
    }

    return out;
  }
}

/**
 * 颤音效果器（Tremolo）
 * 振幅调制产生音量周期性变化
 */
export class TremoloProcessor {
  process(input: Float32Array, rate: number, depth: number): Float32Array {
    if (depth <= 0) return new Float32Array(input);
    const len = input.length;
    const out = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      const lfo = 0.5 + 0.5 * Math.sin(TWO_PI * rate * i / SAMPLE_RATE);
      const amp = 1 - depth + depth * lfo;
      out[i] = input[i] * amp;
    }
    return out;
  }
}

/**
 * 环形调制器（Ring Modulator）
 * 用于生成金属感、不和谐音色
 */
export class RingModulator {
  process(input: Float32Array, carrierFreq: number, amount: number): Float32Array {
    if (amount <= 0) return new Float32Array(input);
    const len = input.length;
    const out = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      const carrier = Math.sin(TWO_PI * carrierFreq * i / SAMPLE_RATE);
      out[i] = input[i] * (1 - amount) + (input[i] * carrier) * amount;
    }
    return out;
  }
}

// ==================== 风格子模板扩展 ====================

/**
 * 风格子类型配置
 * 提供更细粒度的风格控制
 */
export class StyleSubTemplates {
  static getSubTemplate(style: StyleType, subType: string): {
    bpmRange: [number, number];
    recommendedInstruments: InstrumentType[];
    characteristicEffects: EffectParams;
  } {
    const defaults: EffectParams = { reverbAmount: 0.2, delayTime: 0.3, delayFeedback: 0.3, chorusRate: 0.5, chorusDepth: 0.3 };
    const map: Record<string, { bpmRange: [number, number]; recommendedInstruments: InstrumentType[]; characteristicEffects: EffectParams }> = {
      "pop-ballad": { bpmRange: [60, 80], recommendedInstruments: ["piano", "acousticGuitar", "violin", "bass", "drumKit"], characteristicEffects: { ...defaults, reverbAmount: 0.4 } },
      "pop-dance": { bpmRange: [120, 130], recommendedInstruments: ["synth", "bass", "drumKit"], characteristicEffects: { ...defaults, delayTime: 0.25, delayFeedback: 0.4 } },
      "rock-hard": { bpmRange: [130, 160], recommendedInstruments: ["electricGuitar", "bass", "drumKit", "synth"], characteristicEffects: { ...defaults, reverbAmount: 0.15 } },
      "rock-soft": { bpmRange: [90, 110], recommendedInstruments: ["acousticGuitar", "electricGuitar", "bass", "drumKit"], characteristicEffects: { ...defaults, reverbAmount: 0.3, chorusDepth: 0.5 } },
      "jazz-bebop": { bpmRange: [180, 240], recommendedInstruments: ["piano", "bass", "drumKit", "saxophone"], characteristicEffects: { ...defaults, reverbAmount: 0.25 } },
      "jazz-cool": { bpmRange: [80, 100], recommendedInstruments: ["piano", "bass", "drumKit", "saxophone", "flute"], characteristicEffects: { ...defaults, reverbAmount: 0.5, delayTime: 0.4 } },
      "electronic-ambient": { bpmRange: [80, 110], recommendedInstruments: ["synth", "bass"], characteristicEffects: { ...defaults, reverbAmount: 0.6, delayTime: 0.5, delayFeedback: 0.5 } },
      "electronic-techno": { bpmRange: [125, 140], recommendedInstruments: ["synth", "bass", "drumKit"], characteristicEffects: { ...defaults, reverbAmount: 0.1 } },
      "chinese-guzheng": { bpmRange: [70, 100], recommendedInstruments: ["guzheng", "erhu", "dizi", "luoGu"], characteristicEffects: { ...defaults, reverbAmount: 0.35 } },
      "chinese-pekingopera": { bpmRange: [90, 140], recommendedInstruments: ["erhu", "pipa", "dizi", "suoNa", "luoGu", "yangQin"], characteristicEffects: { ...defaults, reverbAmount: 0.2 } },
    };
    return map[`${style}-${subType}`] ?? { bpmRange: [100, 120], recommendedInstruments: ["piano", "bass", "drumKit"], characteristicEffects: defaults };
  }
}

// ==================== 乐器编配建议器 ====================

/**
 * 根据段落类型和风格推荐乐器编配
 */
export class InstrumentationAdvisor {
  static advise(sectionType: SectionType, style: StyleType, density: number): { melody: InstrumentType[]; harmony: InstrumentType[]; rhythm: InstrumentType[]; percussion: InstrumentType[] } {
    const melodyOptions: Record<StyleType, InstrumentType[]> = {
      pop: ["piano", "synth", "violin"],
      rock: ["electricGuitar", "synth"],
      jazz: ["saxophone", "flute", "piano"],
      electronic: ["synth"],
      classical: ["violin", "flute", "cello"],
      folk: ["flute", "acousticGuitar"],
      chinese: ["erhu", "dizi", "guzheng", "pipa"],
      rnb: ["saxophone", "synth", "piano"],
      metal: ["electricGuitar", "synth"],
      blues: ["electricGuitar", "saxophone"],
    };

    const harmonyOptions: Record<StyleType, InstrumentType[]> = {
      pop: ["piano", "acousticGuitar", "synth"],
      rock: ["electricGuitar", "synth"],
      jazz: ["piano", "synth"],
      electronic: ["synth"],
      classical: ["piano", "violin", "cello"],
      folk: ["acousticGuitar", "piano"],
      chinese: ["guzheng", "yangQin", "xiao"],
      rnb: ["piano", "synth"],
      metal: ["electricGuitar", "synth"],
      blues: ["piano", "electricGuitar"],
    };

    const rhythmOptions: Record<StyleType, InstrumentType[]> = {
      pop: ["bass", "acousticGuitar"],
      rock: ["bass", "electricGuitar"],
      jazz: ["bass", "piano"],
      electronic: ["bass", "synth"],
      classical: ["cello", "violin"],
      folk: ["bass", "acousticGuitar"],
      chinese: ["erhu", "guzheng"],
      rnb: ["bass", "synth"],
      metal: ["bass", "electricGuitar"],
      blues: ["bass", "electricGuitar"],
    };

    const percussionOptions: Record<StyleType, InstrumentType[]> = {
      pop: ["drumKit"],
      rock: ["drumKit"],
      jazz: ["drumKit"],
      electronic: ["drumKit"],
      classical: [],
      folk: ["drumKit"],
      chinese: ["luoGu", "drumKit"],
      rnb: ["drumKit"],
      metal: ["drumKit"],
      blues: ["drumKit"],
    };

    const pick = (arr: InstrumentType[], count: number) => arr.slice(0, Math.max(1, Math.floor(count * density)));
    return {
      melody: pick(melodyOptions[style] ?? ["piano"], 1),
      harmony: pick(harmonyOptions[style] ?? ["piano"], 2),
      rhythm: pick(rhythmOptions[style] ?? ["bass"], 1),
      percussion: pick(percussionOptions[style] ?? ["drumKit"], 1),
    };
  }
}

// ==================== 动态范围控制 ====================

/**
 * 动态范围处理器
 * 模拟模拟磁带/电子管的压缩特性
 */
export class DynamicsProcessor {
  /**
   * 光学压缩器模拟（慢 attack，平滑 release）
   */
  static opticalCompress(input: Float32Array, threshold: number, ratio: number, attackMs: number, releaseMs: number): Float32Array {
    const out = new Float32Array(input.length);
    const attackSamples = Math.max(1, Math.floor(attackMs * SAMPLE_RATE / 1000));
    const releaseSamples = Math.max(1, Math.floor(releaseMs * SAMPLE_RATE / 1000));
    let envelope = 0;
    let gain = 1;

    for (let i = 0; i < input.length; i++) {
      const abs = Math.abs(input[i]);
      if (abs > envelope) {
        envelope += (abs - envelope) / attackSamples;
      } else {
        envelope += (abs - envelope) / releaseSamples;
      }

      if (envelope > threshold) {
        const dbOver = Math.log10(envelope / threshold) * 20;
        const dbGain = -dbOver * (1 - 1 / ratio);
        const targetGain = Math.pow(10, dbGain / 20);
        gain += (targetGain - gain) * 0.1;
      } else {
        gain += (1 - gain) * 0.05;
      }

      out[i] = input[i] * gain;
    }

    return out;
  }

  /**
   * 砖墙限制器（Brickwall Limiter）
   */
  static brickwallLimit(input: Float32Array, threshold: number, lookaheadSamples = 100): Float32Array {
    const out = new Float32Array(input.length);
    const delayLine = new Float32Array(lookaheadSamples);
    let writeIdx = 0;
    let maxPeak = 0;

    for (let i = 0; i < input.length; i++) {
      const sample = input[i];
      delayLine[writeIdx] = sample;
      writeIdx = (writeIdx + 1) % lookaheadSamples;

      const abs = Math.abs(sample);
      if (abs > maxPeak) maxPeak = abs;
      else maxPeak *= 0.999;

      const readIdx = (writeIdx + 1) % lookaheadSamples;
      const delayed = delayLine[readIdx];
      const gain = maxPeak > threshold ? threshold / maxPeak : 1;
      out[i] = delayed * gain;
    }

    return out;
  }
}

// ==================== 智能音量平衡 ====================

/**
 * 智能响度平衡器
 * 根据 ITU-R BS.1770-4 简化算法估算响度并平衡
 */
export class LoudnessBalancer {
  static calculateLKFS(buffer: Float32Array): number {
    // 简化 K 加权滤波器
    const filtered = AudioUtils.highpass(AudioUtils.lowpass(buffer, 20000), 20);
    let sumSquares = 0;
    for (let i = 0; i < filtered.length; i++) {
      sumSquares += filtered[i] * filtered[i];
    }
    const rms = Math.sqrt(sumSquares / filtered.length);
    return 20 * Math.log10(rms + 1e-10);
  }

  static balanceToTarget(buffer: Float32Array, targetLKFS = -14): void {
    const current = LoudnessBalancer.calculateLKFS(buffer);
    const gainDb = targetLKFS - current;
    const gain = Math.pow(10, gainDb / 20);
    for (let i = 0; i < buffer.length; i++) {
      buffer[i] *= gain;
    }
  }
}

// ==================== 装饰音生成器 ====================

/**
 * 自动装饰音生成器
 * 根据风格生成倚音、回音、波音等装饰音
 */
export class OrnamentGenerator {
  static graceNote(mainNote: NoteEvent, intervalSemitones: number, durationSec = 0.05): NoteEvent {
    return {
      midi: mainNote.midi + intervalSemitones,
      startTime: mainNote.startTime - durationSec,
      duration: durationSec,
      velocity: mainNote.velocity * 0.7,
    };
  }

  static mordent(mainNote: NoteEvent, upper = true): NoteEvent[] {
    const interval = upper ? 1 : -1;
    return [
      { ...mainNote, duration: mainNote.duration * 0.25 },
      { midi: mainNote.midi + interval, startTime: mainNote.startTime + mainNote.duration * 0.25, duration: mainNote.duration * 0.25, velocity: mainNote.velocity },
      { ...mainNote, startTime: mainNote.startTime + mainNote.duration * 0.5, duration: mainNote.duration * 0.5 },
    ];
  }

  static turn(mainNote: NoteEvent): NoteEvent[] {
    const dur = mainNote.duration / 5;
    return [
      { midi: mainNote.midi + 1, startTime: mainNote.startTime, duration: dur, velocity: mainNote.velocity * 0.6 },
      { midi: mainNote.midi, startTime: mainNote.startTime + dur, duration: dur, velocity: mainNote.velocity * 0.6 },
      { midi: mainNote.midi - 1, startTime: mainNote.startTime + dur * 2, duration: dur, velocity: mainNote.velocity * 0.6 },
      { midi: mainNote.midi, startTime: mainNote.startTime + dur * 3, duration: dur * 2, velocity: mainNote.velocity },
    ];
  }

  static trill(mainNote: NoteEvent, intervalSemitones = 1, rateHz = 8): NoteEvent[] {
    const notes: NoteEvent[] = [];
    const period = 1 / rateHz;
    let t = mainNote.startTime;
    let toggle = false;
    while (t < mainNote.startTime + mainNote.duration) {
      const dur = Math.min(period, mainNote.startTime + mainNote.duration - t);
      notes.push({
        midi: toggle ? mainNote.midi + intervalSemitones : mainNote.midi,
        startTime: t,
        duration: dur,
        velocity: mainNote.velocity * 0.8,
      });
      t += dur;
      toggle = !toggle;
    }
    return notes;
  }
}

// ==================== 调性分析工具 ====================

/**
 * 简单调性检测器
 * 根据音符分布估算最可能的调性
 */
export class KeyDetector {
  static detectKey(midis: number[]): { key: string; mode: "major" | "minor"; confidence: number } {
    const counts = new Array(12).fill(0);
    for (const m of midis) {
      counts[m % 12]++;
    }

    const majorProfile = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
    const minorProfile = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

    let bestKey = 0;
    let bestMode: "major" | "minor" = "major";
    let bestScore = -Infinity;

    for (let k = 0; k < 12; k++) {
      let majorScore = 0;
      let minorScore = 0;
      for (let i = 0; i < 12; i++) {
        const idx = (i + k) % 12;
        majorScore += counts[idx] * majorProfile[i];
        minorScore += counts[idx] * minorProfile[i];
      }
      if (majorScore > bestScore) {
        bestScore = majorScore;
        bestKey = k;
        bestMode = "major";
      }
      if (minorScore > bestScore) {
        bestScore = minorScore;
        bestKey = k;
        bestMode = "minor";
      }
    }

    const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const total = midis.length || 1;
    const confidence = bestScore / total;
    return { key: names[bestKey], mode: bestMode, confidence };
  }
}

// ==================== 全局引擎工厂 ====================

/**
 * 快速创建 RealisticArrangerEngine 并生成伴奏的便捷函数
 */
export function createArrangement(
  key: string,
  bpm: number,
  style: StyleType,
  emotion: EmotionType,
  barsPerSection = 8
): MultiTrackOutput {
  const engine = new RealisticArrangerEngine();
  const root = parseKeyToMidi(key);
  const sections = generateStandardSections(root, barsPerSection, style);
  return engine.generate({ key, bpm, style, emotion, sections });
}

/**
 * 导出伴奏为 WAV Blob（浏览器环境可用）
 */
export function exportArrangementToWav(output: MultiTrackOutput): ArrayBuffer {
  const engine = new RealisticArrangerEngine();
  return engine.exportWav(output.mixed);
}

// ==================== 版本与元数据 ====================

/** 引擎版本 */
export const ENGINE_VERSION = "1.0.0";

/** 引擎名称 */
export const ENGINE_NAME = "RealisticArrangerEngine";

/** 支持的采样率列表 */
export const SUPPORTED_SAMPLE_RATES = [44100, 48000, 96000];

/** 默认效果参数 */
export const DEFAULT_EFFECT_PARAMS: EffectParams = {
  reverbAmount: 0.2,
  delayTime: 0.3,
  delayFeedback: 0.3,
  chorusRate: 0.5,
  chorusDepth: 0.3,
};

