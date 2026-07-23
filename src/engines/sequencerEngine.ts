/**
 * @file sequencerEngine.ts
 * @description 青鸾数字音频工作站 - 步进音序器引擎
 * 提供多轨步进音序器、琶音器与鼓机音序器的完整实现。
 * 支持 16/32/64 步步进模式、Euclidean 节奏生成、Pattern A/B 切换、
 * 填充(Fill)、条件触发、微时间偏移、概率触发等高级功能。
 *
 * @module qingluan-daw/engines/sequencerEngine
 * @version 1.0.0
 */

import {
  clamp,
  lerp,
  midiToFrequency,
  noteToMidi,
  midiToNoteName,
  calculateNoteDuration,
  quantizeTime,
} from '../utils/audioUtils.js';

// =============================================================================
// 常量定义
// =============================================================================

/** 统一采样率：44100 Hz */
export const SAMPLE_RATE = 44100;

/** 默认步进数 */
export const DEFAULT_STEPS = 16;

/** 最大支持步进数 */
export const MAX_STEPS = 64;

/** 默认轨道数 */
export const DEFAULT_TRACKS = 8;

/** 最大轨道数 */
export const MAX_TRACKS = 16;

/** 默认 BPM */
export const DEFAULT_BPM = 120;

/** 默认 Swing 百分比 (0-1) */
export const DEFAULT_SWING = 0.0;

/** 最小触发概率 */
export const MIN_PROBABILITY = 0.0;

/** 最大触发概率 */
export const MAX_PROBABILITY = 1.0;

/** 默认音轨增益 */
export const DEFAULT_TRACK_GAIN = 0.8;

// =============================================================================
// 类型定义
// =============================================================================

/**
 * 步进音序器轨道状态
 * @interface SequencerTrack
 */
export interface SequencerTrack {
  /** 轨道唯一标识 */
  id: string;
  /** 轨道名称 */
  name: string;
  /** 步进触发模式 (true=触发) */
  steps: boolean[];
  /** 每步力度 (0.0 ~ 1.0) */
  velocity: number[];
  /** 每步触发概率 (0.0 ~ 1.0) */
  probability: number[];
  /** 微时间偏移 (-0.5 ~ 0.5 拍) */
  microTiming: number[];
  /** 条件触发字符串数组 */
  condition: string[];
  /** 轨道静音状态 */
  muted: boolean;
  /** 轨道独奏状态 */
  soloed: boolean;
  /** 轨道增益 (0.0 ~ 1.0) */
  gain: number;
  /** 基础音高 (MIDI 音符编号) */
  basePitch: number;
  /** 输出声像 (-1.0 ~ 1.0) */
  pan: number;
}

/**
 * 琶音器模式类型
 * @typedef ArpMode
 */
export type ArpMode =
  | 'up'
  | 'down'
  | 'upDown'
  | 'downUp'
  | 'random'
  | 'order'
  | 'chord';

/**
 * 琶音器节奏类型
 * @typedef ArpRate
 */
export type ArpRate =
  | '1/1'
  | '1/2'
  | '1/4'
  | '1/8'
  | '1/16'
  | '1/32'
  | '1/4t'
  | '1/8t'
  | '1/16t'
  | '1/4d'
  | '1/8d'
  | '1/16d';

/**
 * 琶音器配置
 * @interface ArpeggiatorConfig
 */
export interface ArpeggiatorConfig {
  /** 输入和弦音符数组 (MIDI) */
  notes: number[];
  /** 琶音模式 */
  mode: ArpMode;
  /** 八度范围 (1 ~ 4) */
  octaveRange: number;
  /** 节奏速率 */
  rate: ArpRate;
  /** Swing 量 (0.0 ~ 1.0) */
  swing: number;
  /** 门限长度 (0.0 ~ 1.0，相对于步长) */
  gateLength: number;
  /** 是否三连音 */
  isTriplet: boolean;
  /** 是否附点 */
  isDotted: boolean;
}

/**
 * 琶音器输出事件
 * @interface ArpEvent
 */
export interface ArpEvent {
  /** 事件时间（秒） */
  time: number;
  /** MIDI 音高 */
  pitch: number;
  /** 力度 (0.0 ~ 1.0) */
  velocity: number;
  /** 持续时间（秒） */
  duration: number;
}

/**
 * 鼓机风格预设
 * @interface DrumKitPreset
 */
export interface DrumKitPreset {
  /** 预设名称 */
  name: string;
  /** 各鼓件基础音高 (MIDI) */
  pitches: Record<string, number>;
  /** 各鼓件默认力度 */
  defaultVelocity: Record<string, number>;
  /** 各鼓件声像 */
  pan: Record<string, number>;
  /** 典型 Pattern 模板 */
  patterns: Record<string, boolean[][]>;
}

/**
 * 鼓机轨道映射
 * @interface DrumTrackMap
 */
export interface DrumTrackMap {
  /** 轨道索引 */
  index: number;
  /** 鼓件名称 (kick, snare, hihat, etc.) */
  instrument: string;
  /** 对应 MIDI 音符 */
  pitch: number;
}

/**
 * 步进事件
 * @interface StepEvent
 */
export interface StepEvent {
  /** 轨道 ID */
  trackId: string;
  /** 步进索引 */
  stepIndex: number;
  /** 事件时间（秒） */
  time: number;
  /** 力度 */
  velocity: number;
  /** 音高 */
  pitch: number;
  /** 持续时间（秒） */
  duration: number;
}

/**
 * 生成序列结果
 * @interface SequenceResult
 */
export interface SequenceResult {
  /** 事件数组 */
  events: StepEvent[];
  /** 总时长（秒） */
  totalDuration: number;
  /** BPM */
  bpm: number;
  /** 步进数 */
  stepCount: number;
}

// =============================================================================
// StepSequencer 类
// =============================================================================

/**
 * 多轨步进音序器
 *
 * 支持 16/32/64 步步进，每轨独立控制力度、概率、微时间偏移与条件触发。
 * 提供 Pattern A/B 切换、Fill 填充、Euclidean 节奏生成等高级功能。
 *
 * @class StepSequencer
 * @example
 * ```ts
 * const seq = new StepSequencer(16, 8);
 * seq.setPattern('track-0', [true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false]);
 * seq.setVelocity('track-0', Array(16).fill(0.9));
 * const result = seq.generateSequence(4, 128);
 * ```
 */
export class StepSequencer {
  /** 当前步进数 */
  public stepCount: number;
  /** 最大轨道数 */
  public maxTracks: number;
  /** 当前 BPM */
  public bpm: number;
  /** Swing 量 (0.0 ~ 1.0) */
  public swing: number;
  /** 当前 Pattern 索引 ('A' | 'B') */
  public currentPattern: 'A' | 'B';
  /** 是否正在 Fill 模式 */
  public fillMode: boolean;
  /**  Fill 模式长度（小节数） */
  public fillLength: number;
  /** 轨道映射表 */
  public tracks: Map<string, SequencerTrack>;
  /** Pattern A 数据 */
  private patternA: Map<string, SequencerTrack>;
  /** Pattern B 数据 */
  private patternB: Map<string, SequencerTrack>;
  /** 当前播放步进索引 */
  private currentStep: number;
  /** 随机种子状态（用于概率触发可复现） */
  private rngState: number;
  /** 全局播放小节计数 */
  private barCounter: number;
  /** 条件触发解析缓存 */
  private conditionCache: Map<string, (bar: number, step: number, stepCount: number) => boolean>;

  /**
   * 创建步进音序器实例
   * @param stepCount - 步进数 (16 | 32 | 64)
   * @param maxTracks - 最大轨道数 (1 ~ 16)
   * @param bpm - 初始 BPM
   */
  constructor(stepCount: number = DEFAULT_STEPS, maxTracks: number = DEFAULT_TRACKS, bpm: number = DEFAULT_BPM) {
    this.stepCount = clamp(stepCount, 4, MAX_STEPS);
    this.maxTracks = clamp(maxTracks, 1, MAX_TRACKS);
    this.bpm = clamp(bpm, 20, 300);
    this.swing = DEFAULT_SWING;
    this.currentPattern = 'A';
    this.fillMode = false;
    this.fillLength = 1;
    this.currentStep = 0;
    this.rngState = Date.now() % 2147483647;
    this.barCounter = 0;
    this.tracks = new Map();
    this.patternA = new Map();
    this.patternB = new Map();
    this.conditionCache = new Map();
  }

  /**
   * 初始化默认轨道
   * @param count - 要初始化的轨道数
   */
  public initDefaultTracks(count: number): void {
    const n = clamp(count, 1, this.maxTracks);
    for (let i = 0; i < n; i++) {
      const id = `track-${i}`;
      this.addTrack(id, `轨道 ${i + 1}`);
    }
  }

  /**
   * 添加新轨道
   * @param id - 轨道唯一标识
   * @param name - 轨道显示名称
   * @returns 创建的轨道对象
   */
  public addTrack(id: string, name: string): SequencerTrack {
    if (this.tracks.size >= this.maxTracks) {
      throw new Error(`已达到最大轨道数限制: ${this.maxTracks}`);
    }
    const track: SequencerTrack = {
      id,
      name,
      steps: new Array(this.stepCount).fill(false),
      velocity: new Array(this.stepCount).fill(0.8),
      probability: new Array(this.stepCount).fill(1.0),
      microTiming: new Array(this.stepCount).fill(0.0),
      condition: new Array(this.stepCount).fill(''),
      muted: false,
      soloed: false,
      gain: DEFAULT_TRACK_GAIN,
      basePitch: 60 + this.tracks.size,
      pan: 0.0,
    };
    this.tracks.set(id, track);
    this.patternA.set(id, this.cloneTrack(track));
    this.patternB.set(id, this.cloneTrack(track));
    return track;
  }

  /**
   * 移除轨道
   * @param trackId - 轨道标识
   */
  public removeTrack(trackId: string): void {
    this.tracks.delete(trackId);
    this.patternA.delete(trackId);
    this.patternB.delete(trackId);
  }

  /**
   * 设置指定轨道的步进触发模式
   * @param trackId - 轨道标识
   * @param steps - 布尔数组，true 表示该步触发
   */
  public setPattern(trackId: string, steps: boolean[]): void {
    const track = this.tracks.get(trackId);
    if (!track) {
      throw new Error(`轨道不存在: ${trackId}`);
    }
    track.steps = steps.slice(0, this.stepCount);
    while (track.steps.length < this.stepCount) {
      track.steps.push(false);
    }
    this.syncCurrentPattern(trackId);
  }

  /**
   * 设置指定轨道的每步力度
   * @param trackId - 轨道标识
   * @param steps - 力度数组 (0.0 ~ 1.0)
   */
  public setVelocity(trackId: string, steps: number[]): void {
    const track = this.tracks.get(trackId);
    if (!track) {
      throw new Error(`轨道不存在: ${trackId}`);
    }
    track.velocity = steps.map((v) => clamp(v, 0, 1)).slice(0, this.stepCount);
    while (track.velocity.length < this.stepCount) {
      track.velocity.push(0.8);
    }
    this.syncCurrentPattern(trackId);
  }

  /**
   * 设置指定轨道的每步触发概率
   * @param trackId - 轨道标识
   * @param steps - 概率数组 (0.0 ~ 1.0)
   */
  public setProbability(trackId: string, steps: number[]): void {
    const track = this.tracks.get(trackId);
    if (!track) {
      throw new Error(`轨道不存在: ${trackId}`);
    }
    track.probability = steps.map((v) => clamp(v, 0, 1)).slice(0, this.stepCount);
    while (track.probability.length < this.stepCount) {
      track.probability.push(1.0);
    }
    this.syncCurrentPattern(trackId);
  }

  /**
   * 设置指定轨道的微时间偏移
   * @param trackId - 轨道标识
   * @param offsets - 偏移数组 (-0.5 ~ 0.5 拍)
   */
  public setMicroTiming(trackId: string, offsets: number[]): void {
    const track = this.tracks.get(trackId);
    if (!track) {
      throw new Error(`轨道不存在: ${trackId}`);
    }
    track.microTiming = offsets.map((v) => clamp(v, -0.5, 0.5)).slice(0, this.stepCount);
    while (track.microTiming.length < this.stepCount) {
      track.microTiming.push(0.0);
    }
    this.syncCurrentPattern(trackId);
  }

  /**
   * 设置指定轨道的条件触发
   * @param trackId - 轨道标识
   * @param conditions - 条件字符串数组，如 '1:2' 表示每2小节第1拍, 'F' 表示 Fill 时触发
   */
  public setCondition(trackId: string, conditions: string[]): void {
    const track = this.tracks.get(trackId);
    if (!track) {
      throw new Error(`轨道不存在: ${trackId}`);
    }
    track.condition = conditions.slice(0, this.stepCount);
    while (track.condition.length < this.stepCount) {
      track.condition.push('');
    }
    this.conditionCache.clear();
    this.syncCurrentPattern(trackId);
  }

  /**
   * 切换 Pattern A/B
   * @param pattern - 'A' 或 'B'
   */
  public switchPattern(pattern: 'A' | 'B'): void {
    this.currentPattern = pattern;
    // 将当前 pattern 数据加载到活跃 tracks
    const source = pattern === 'A' ? this.patternA : this.patternB;
    for (const [id, trackData] of source) {
      const active = this.tracks.get(id);
      if (active) {
        active.steps = [...trackData.steps];
        active.velocity = [...trackData.velocity];
        active.probability = [...trackData.probability];
        active.microTiming = [...trackData.microTiming];
        active.condition = [...trackData.condition];
      }
    }
  }

  /**
   * 保存当前轨道状态到指定 Pattern
   * @param pattern - 'A' 或 'B'
   */
  public saveToPattern(pattern: 'A' | 'B'): void {
    const target = pattern === 'A' ? this.patternA : this.patternB;
    for (const [id, track] of this.tracks) {
      target.set(id, this.cloneTrack(track));
    }
  }

  /**
   * 触发 Fill 模式（持续指定小节数后自动关闭）
   * @param length - Fill 长度（小节数），默认 1
   */
  public triggerFill(length: number = 1): void {
    this.fillMode = true;
    this.fillLength = clamp(length, 1, 4);
  }

  /**
   * 取消 Fill 模式
   */
  public cancelFill(): void {
    this.fillMode = false;
    this.fillLength = 0;
  }

  /**
   * 生成 Euclidean 节奏分布
   * @param pulses - 脉冲数（触发次数）
   * @param steps - 总步数
   * @param rotation - 旋转偏移量
   * @returns 布尔数组，表示每步是否触发
   */
  public static generateEuclidean(pulses: number, steps: number, rotation: number = 0): boolean[] {
    if (pulses <= 0) return new Array(steps).fill(false);
    if (pulses >= steps) return new Array(steps).fill(true);

    const pattern: boolean[] = new Array(steps).fill(false);
    // Bresenham 算法风格的 Euclidean 分布
    let bucket = 0;
    for (let i = 0; i < steps; i++) {
      bucket += pulses;
      if (bucket >= steps) {
        bucket -= steps;
        pattern[(i + rotation) % steps] = true;
      }
    }
    return pattern;
  }

  /**
   * 为指定轨道应用 Euclidean 节奏
   * @param trackId - 轨道标识
   * @param pulses - 脉冲数
   * @param rotation - 旋转偏移
   */
  public applyEuclidean(trackId: string, pulses: number, rotation: number = 0): void {
    const euclid = StepSequencer.generateEuclidean(pulses, this.stepCount, rotation);
    this.setPattern(trackId, euclid);
  }

  /**
   * 生成完整序列音频事件
   *
   * 根据当前 BPM、步进数、轨道设置生成一系列带时间戳的触发事件。
   * 支持 Swing、微时间偏移、概率触发与条件判断。
   *
   * @param durationBars - 总小节数
   * @param bpm - BPM（覆盖当前设置）
   * @returns 序列结果对象
   */
  public generateSequence(durationBars: number, bpm?: number): SequenceResult {
    const tempo = bpm ?? this.bpm;
    const beatDuration = 60.0 / tempo;
    const stepDuration = (beatDuration * 4) / this.stepCount;
    const totalDuration = durationBars * 4 * beatDuration;
    const events: StepEvent[] = [];

    // 检查是否有独奏轨道
    const hasSolo = Array.from(this.tracks.values()).some((t) => t.soloed);

    for (let bar = 0; bar < durationBars; bar++) {
      // 更新 Fill 模式计数
      if (this.fillMode) {
        this.fillLength--;
        if (this.fillLength <= 0) {
          this.fillMode = false;
        }
      }

      for (let step = 0; step < this.stepCount; step++) {
        const globalStep = bar * this.stepCount + step;
        // Swing 处理：奇数步（以 0 为起始）延迟
        let timeOffset = 0;
        if (step % 2 === 1 && this.swing > 0) {
          timeOffset = stepDuration * this.swing * 0.66;
        }
        const baseTime = globalStep * stepDuration + timeOffset;

        for (const track of this.tracks.values()) {
          if (track.muted) continue;
          if (hasSolo && !track.soloed) continue;
          if (!track.steps[step]) continue;

          // 概率触发判断
          const prob = track.probability[step];
          if (prob < 1.0 && this.randomFloat() > prob) continue;

          // 条件触发判断
          const cond = track.condition[step];
          if (cond && !this.evaluateCondition(cond, bar, step, this.stepCount)) continue;

          // 微时间偏移
          const microOffset = track.microTiming[step] * beatDuration;
          const eventTime = clamp(baseTime + microOffset, 0, totalDuration);
          const vel = track.velocity[step] * track.gain;
          const dur = stepDuration * 0.9;

          events.push({
            trackId: track.id,
            stepIndex: step,
            time: eventTime,
            velocity: vel,
            pitch: track.basePitch,
            duration: dur,
          });
        }
      }
    }

    // 按时间排序
    events.sort((a, b) => a.time - b.time);

    return {
      events,
      totalDuration,
      bpm: tempo,
      stepCount: this.stepCount,
    };
  }

  /**
   * 将事件渲染为音频缓冲区（单声道合成示例）
   * @param result - generateSequence 返回的结果
   * @returns Float32Array 音频缓冲区
   */
  public renderToBuffer(result: SequenceResult): Float32Array {
    const sampleCount = Math.ceil(result.totalDuration * SAMPLE_RATE);
    const buffer = new Float32Array(sampleCount);
    for (const ev of result.events) {
      const startSample = Math.floor(ev.time * SAMPLE_RATE);
      const durationSamples = Math.floor(ev.duration * SAMPLE_RATE);
      const freq = midiToFrequency(ev.pitch);
      const amp = ev.velocity;
      for (let i = 0; i < durationSamples; i++) {
        const t = i / SAMPLE_RATE;
        const envelope = Math.exp(-t * 10);
        const sample = Math.sin(2 * Math.PI * freq * t) * amp * envelope;
        const idx = startSample + i;
        if (idx < sampleCount) {
          buffer[idx] += sample;
        }
      }
    }
    // 软限幅
    for (let i = 0; i < buffer.length; i++) {
      buffer[i] = Math.tanh(buffer[i]);
    }
    return buffer;
  }

  /**
   * 设置轨道静音
   * @param trackId - 轨道标识
   * @param muted - 是否静音
   */
  public setMute(trackId: string, muted: boolean): void {
    const track = this.tracks.get(trackId);
    if (track) track.muted = muted;
  }

  /**
   * 设置轨道独奏
   * @param trackId - 轨道标识
   * @param soloed - 是否独奏
   */
  public setSolo(trackId: string, soloed: boolean): void {
    const track = this.tracks.get(trackId);
    if (track) track.soloed = soloed;
  }

  /**
   * 设置轨道增益
   * @param trackId - 轨道标识
   * @param gain - 增益值 (0.0 ~ 1.0)
   */
  public setTrackGain(trackId: string, gain: number): void {
    const track = this.tracks.get(trackId);
    if (track) track.gain = clamp(gain, 0, 1);
  }

  /**
   * 设置轨道基础音高
   * @param trackId - 轨道标识
   * @param pitch - MIDI 音符编号
   */
  public setTrackPitch(trackId: string, pitch: number): void {
    const track = this.tracks.get(trackId);
    if (track) track.basePitch = clamp(pitch, 0, 127);
  }

  /**
   * 设置轨道声像
   * @param trackId - 轨道标识
   * @param pan - 声像 (-1.0 ~ 1.0)
   */
  public setTrackPan(trackId: string, pan: number): void {
    const track = this.tracks.get(trackId);
    if (track) track.pan = clamp(pan, -1, 1);
  }

  /**
   * 重置播放状态
   */
  public reset(): void {
    this.currentStep = 0;
    this.barCounter = 0;
    this.rngState = Date.now() % 2147483647;
    this.fillMode = false;
  }

  /**
   * 克隆轨道数据
   */
  private cloneTrack(track: SequencerTrack): SequencerTrack {
    return {
      ...track,
      steps: [...track.steps],
      velocity: [...track.velocity],
      probability: [...track.probability],
      microTiming: [...track.microTiming],
      condition: [...track.condition],
    };
  }

  /**
   * 同步当前活跃轨道数据到 Pattern 存储
   */
  private syncCurrentPattern(trackId: string): void {
    const track = this.tracks.get(trackId);
    if (!track) return;
    const target = this.currentPattern === 'A' ? this.patternA : this.patternB;
    target.set(trackId, this.cloneTrack(track));
  }

  /**
   * 伪随机数生成（Park-Miller LCG）
   */
  private randomFloat(): number {
    this.rngState = (16807 * this.rngState) % 2147483647;
    return (this.rngState - 1) / 2147483646;
  }

  /**
   * 解析并评估条件字符串
   * @param cond - 条件字符串
   * @param bar - 当前小节
   * @param step - 当前步进
   * @param stepCount - 每小节步进数
   */
  private evaluateCondition(cond: string, bar: number, step: number, stepCount: number): boolean {
    if (cond === 'F') return this.fillMode;
    if (cond === '!F') return !this.fillMode;

    // 解析格式如 "1:2"（每2小节第1拍）或 "1:2:3"（每3小节从第1拍开始持续2拍）
    const match = cond.match(/^(\d+):(\d+)$/);
    if (match) {
      const every = parseInt(match[2], 10);
      const offset = parseInt(match[1], 10);
      if (every <= 0) return true;
      // 将小节映射到周期中的位置
      return (bar % every) === (offset % every);
    }

    const match2 = cond.match(/^(\d+):(\d+):(\d+)$/);
    if (match2) {
      const start = parseInt(match2[1], 10);
      const len = parseInt(match2[2], 10);
      const every = parseInt(match2[3], 10);
      const pos = bar % every;
      return pos >= start && pos < start + len;
    }

    // 默认通过
    return true;
  }
}

// =============================================================================
// Arpeggiator 类
// =============================================================================

/**
 * 琶音器引擎
 *
 * 将输入和弦转换为按指定模式排列的单音序列，支持多种方向模式、
 * 八度扩展、三连音/附点节奏等。
 *
 * @class Arpeggiator
 * @example
 * ```ts
 * const arp = new Arpeggiator();
 * arp.setPattern([60, 64, 67], 'upDown', 2, '1/16');
 * const events = arp.generateEvents(4, 128);
 * ```
 */
export class Arpeggiator {
  /** 输入和弦音符 */
  public notes: number[];
  /** 琶音模式 */
  public mode: ArpMode;
  /** 八度范围 */
  public octaveRange: number;
  /** 节奏速率 */
  public rate: ArpRate;
  /** Swing 量 */
  public swing: number;
  /** 门限长度比例 */
  public gateLength: number;
  /** 是否三连音 */
  public isTriplet: boolean;
  /** 是否附点 */
  public isDotted: boolean;
  /** 当前播放索引 */
  private currentIndex: number;
  /** 方向状态（用于 upDown / downUp） */
  private direction: 1 | -1;
  /** 随机数状态 */
  private rngState: number;

  constructor() {
    this.notes = [];
    this.mode = 'up';
    this.octaveRange = 1;
    this.rate = '1/16';
    this.swing = 0.0;
    this.gateLength = 0.8;
    this.isTriplet = false;
    this.isDotted = false;
    this.currentIndex = 0;
    this.direction = 1;
    this.rngState = Date.now() % 2147483647;
  }

  /**
   * 设置琶音模式与参数
   * @param notes - 输入和弦音符 (MIDI 编号数组)
   * @param mode - 琶音方向模式
   * @param octaveRange - 八度扩展范围 (1 ~ 4)
   * @param rate - 节奏速率
   */
  public setPattern(notes: number[], mode: ArpMode, octaveRange: number = 1, rate: ArpRate = '1/16'): void {
    this.notes = [...notes].sort((a, b) => a - b);
    this.mode = mode;
    this.octaveRange = clamp(octaveRange, 1, 4);
    this.rate = rate;
    this.currentIndex = 0;
    this.direction = 1;
  }

  /**
   * 设置三连音模式
   * @param enabled - 是否启用
   */
  public setTriplet(enabled: boolean): void {
    this.isTriplet = enabled;
    if (enabled) this.isDotted = false;
  }

  /**
   * 设置附点模式
   * @param enabled - 是否启用
   */
  public setDotted(enabled: boolean): void {
    this.isDotted = enabled;
    if (enabled) this.isTriplet = false;
  }

  /**
   * 生成琶音事件序列
   * @param durationBars - 总小节数
   * @param bpm - BPM
   * @returns 琶音事件数组
   */
  public generateEvents(durationBars: number, bpm: number): ArpEvent[] {
    const beatDuration = 60.0 / bpm;
    const stepDuration = this.rateToSeconds(beatDuration);
    const totalDuration = durationBars * 4 * beatDuration;
    const events: ArpEvent[] = [];

    const noteList = this.buildNoteList();
    if (noteList.length === 0) return events;

    let time = 0;
    let index = 0;
    let dir = 1;

    while (time < totalDuration) {
      const pitch = this.selectNextPitch(noteList, index, dir);
      // 更新索引与方向
      const next = this.advanceIndex(noteList.length, index, dir);
      index = next.index;
      dir = next.direction;

      let eventDuration = stepDuration * this.gateLength;
      if (eventDuration > stepDuration * 0.99) eventDuration = stepDuration * 0.99;

      let eventTime = time;
      // Swing 处理
      const stepIndex = Math.round(time / stepDuration);
      if (stepIndex % 2 === 1 && this.swing > 0) {
        eventTime += stepDuration * this.swing * 0.66;
      }

      events.push({
        time: eventTime,
        pitch,
        velocity: 0.85,
        duration: eventDuration,
      });

      time += stepDuration;
    }

    return events;
  }

  /**
   * 生成琶音音频缓冲区（简单正弦合成）
   * @param durationBars - 总小节数
   * @param bpm - BPM
   * @returns Float32Array 音频缓冲区
   */
  public generateBuffer(durationBars: number, bpm: number): Float32Array {
    const events = this.generateEvents(durationBars, bpm);
    const totalDuration = durationBars * (240 / bpm);
    const sampleCount = Math.ceil(totalDuration * SAMPLE_RATE);
    const buffer = new Float32Array(sampleCount);

    for (const ev of events) {
      const startSample = Math.floor(ev.time * SAMPLE_RATE);
      const durSamples = Math.floor(ev.duration * SAMPLE_RATE);
      const freq = midiToFrequency(ev.pitch);
      const amp = ev.velocity;
      for (let i = 0; i < durSamples; i++) {
        const t = i / SAMPLE_RATE;
        const env = Math.exp(-t * 8);
        const s = Math.sin(2 * Math.PI * freq * t) * amp * env;
        const idx = startSample + i;
        if (idx < sampleCount) buffer[idx] += s;
      }
    }

    for (let i = 0; i < buffer.length; i++) {
      buffer[i] = Math.tanh(buffer[i]);
    }
    return buffer;
  }

  /**
   * 构建扩展八度后的音符列表
   */
  private buildNoteList(): number[] {
    const list: number[] = [];
    for (let oct = 0; oct < this.octaveRange; oct++) {
      for (const n of this.notes) {
        list.push(n + oct * 12);
      }
    }
    if (this.mode === 'down' || this.mode === 'downUp') {
      list.sort((a, b) => b - a);
    }
    return list;
  }

  /**
   * 根据模式选择下一个音高
   */
  private selectNextPitch(noteList: number[], index: number, direction: number): number {
    if (this.mode === 'random') {
      return noteList[Math.floor(this.randomFloat() * noteList.length)];
    }
    if (this.mode === 'chord') {
      // chord 模式返回根音，但事件会在同一时间触发所有和弦音（由调用方处理）
      return noteList[0];
    }
    const idx = clamp(index, 0, noteList.length - 1);
    return noteList[idx];
  }

  /**
   * 推进播放索引
   */
  private advanceIndex(len: number, index: number, direction: number): { index: number; direction: number } {
    if (len === 0) return { index: 0, direction: 1 };
    if (this.mode === 'random') return { index: 0, direction: 1 };
    if (this.mode === 'order') {
      return { index: (index + 1) % len, direction: 1 };
    }
    if (this.mode === 'up') {
      return { index: (index + 1) % len, direction: 1 };
    }
    if (this.mode === 'down') {
      return { index: (index + 1) % len, direction: -1 };
    }
    if (this.mode === 'upDown') {
      let next = index + direction;
      let dir = direction;
      if (next >= len) {
        next = len - 2;
        dir = -1;
        if (next < 0) next = 0;
      } else if (next < 0) {
        next = 1;
        dir = 1;
        if (next >= len) next = 0;
      }
      return { index: next, direction: dir };
    }
    if (this.mode === 'downUp') {
      let next = index + direction;
      let dir = direction;
      if (next >= len) {
        next = len - 2;
        dir = -1;
        if (next < 0) next = 0;
      } else if (next < 0) {
        next = 1;
        dir = 1;
        if (next >= len) next = 0;
      }
      return { index: next, direction: dir };
    }
    if (this.mode === 'chord') {
      return { index: 0, direction: 1 };
    }
    return { index: (index + 1) % len, direction: 1 };
  }

  /**
   * 将速率标记转换为秒
   */
  private rateToSeconds(beatDuration: number): number {
    const baseRates: Record<ArpRate, number> = {
      '1/1': beatDuration * 4,
      '1/2': beatDuration * 2,
      '1/4': beatDuration,
      '1/8': beatDuration / 2,
      '1/16': beatDuration / 4,
      '1/32': beatDuration / 8,
      '1/4t': (beatDuration * 4) / 3,
      '1/8t': (beatDuration * 2) / 3,
      '1/16t': beatDuration / 3,
      '1/4d': beatDuration * 1.5,
      '1/8d': beatDuration * 0.75,
      '1/16d': beatDuration * 0.375,
    };
    let seconds = baseRates[this.rate] ?? beatDuration / 4;
    if (this.isTriplet) {
      seconds = seconds * (2 / 3);
    } else if (this.isDotted) {
      seconds = seconds * 1.5;
    }
    return seconds;
  }

  /**
   * 伪随机数
   */
  private randomFloat(): number {
    this.rngState = (16807 * this.rngState) % 2147483647;
    return (this.rngState - 1) / 2147483646;
  }
}

// =============================================================================
// DrumSequencer 类
// =============================================================================

/**
 * 鼓机音序器
 *
 * 内置多种经典鼓机风格预设（TR-808、TR-909、TR-707、LinnDrum、CR-78），
 * 支持快速加载风格模板、独立鼓件参数调节与多轨步进编辑。
 *
 * @class DrumSequencer
 * @example
 * ```ts
 * const drum = new DrumSequencer('tr808');
 * drum.setStep('kick', 0, true, 1.0);
 * drum.setStep('snare', 4, true, 0.9);
 * const buffer = drum.generateBuffer(4, 120);
 * ```
 */
export class DrumSequencer {
  /** 当前风格名称 */
  public currentStyle: string;
  /** 步进数 */
  public stepCount: number;
  /** BPM */
  public bpm: number;
  /** 鼓件映射表 */
  public drumMap: Map<string, DrumTrackMap>;
  /** 步进数据: instrument -> boolean[] */
  public stepData: Map<string, boolean[]>;
  /** 力度数据: instrument -> number[] */
  public velocityData: Map<string, number[]>;
  /** 声像数据 */
  public panData: Map<string, number>;
  /** 增益数据 */
  public gainData: Map<string, number>;
  /** 音高微调 ( cents ) */
  public tuneData: Map<string, number>;
  /** 风格预设库 */
  public static readonly PRESETS: Record<string, DrumKitPreset> = {
    tr808: {
      name: 'TR-808',
      pitches: {
        kick: 36,
        snare: 38,
        hihatClosed: 42,
        hihatOpen: 46,
        clap: 39,
        tomLow: 43,
        tomMid: 47,
        tomHigh: 50,
        cowbell: 56,
        cymbal: 49,
      },
      defaultVelocity: {
        kick: 1.0,
        snare: 0.9,
        hihatClosed: 0.7,
        hihatOpen: 0.75,
        clap: 0.9,
        tomLow: 0.8,
        tomMid: 0.8,
        tomHigh: 0.8,
        cowbell: 0.7,
        cymbal: 0.6,
      },
      pan: {
        kick: 0.0,
        snare: 0.0,
        hihatClosed: 0.2,
        hihatOpen: 0.2,
        clap: -0.1,
        tomLow: -0.3,
        tomMid: 0.0,
        tomHigh: 0.3,
        cowbell: -0.2,
        cymbal: 0.0,
      },
      patterns: {
        basic: [
          [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false],
          [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false],
          [false, false, true, false, false, false, true, false, false, false, true, false, false, false, true, false],
          [false, false, false, false, false, false, false, false, false, false, false, false, false, false, true, false],
        ],
      },
    },
    tr909: {
      name: 'TR-909',
      pitches: {
        kick: 36,
        snare: 38,
        hihatClosed: 42,
        hihatOpen: 46,
        clap: 39,
        rimshot: 37,
        crash: 49,
        ride: 51,
        tomLow: 41,
        tomHigh: 48,
      },
      defaultVelocity: {
        kick: 1.0,
        snare: 0.95,
        hihatClosed: 0.8,
        hihatOpen: 0.85,
        clap: 0.9,
        rimshot: 0.75,
        crash: 0.7,
        ride: 0.6,
        tomLow: 0.8,
        tomHigh: 0.8,
      },
      pan: {
        kick: 0.0,
        snare: 0.0,
        hihatClosed: 0.15,
        hihatOpen: 0.15,
        clap: -0.05,
        rimshot: 0.1,
        crash: -0.1,
        ride: 0.1,
        tomLow: -0.2,
        tomHigh: 0.2,
      },
      patterns: {
        basic: [
          [true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false],
          [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false],
          [true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true],
          [false, false, false, false, false, false, false, false, false, false, false, false, true, false, false, false],
        ],
      },
    },
    tr707: {
      name: 'TR-707',
      pitches: {
        kick: 36,
        snare: 38,
        hihatClosed: 42,
        hihatOpen: 46,
        clap: 39,
        tomLow: 43,
        tomHigh: 47,
        crash: 49,
        ride: 51,
        cowbell: 56,
      },
      defaultVelocity: {
        kick: 1.0,
        snare: 0.9,
        hihatClosed: 0.75,
        hihatOpen: 0.8,
        clap: 0.85,
        tomLow: 0.8,
        tomHigh: 0.8,
        crash: 0.65,
        ride: 0.6,
        cowbell: 0.7,
      },
      pan: {
        kick: 0.0,
        snare: 0.0,
        hihatClosed: 0.25,
        hihatOpen: 0.25,
        clap: 0.0,
        tomLow: -0.25,
        tomHigh: 0.25,
        crash: 0.0,
        ride: 0.1,
        cowbell: -0.15,
      },
      patterns: {
        basic: [
          [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false],
          [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false],
          [false, false, true, false, false, false, true, false, false, false, true, false, false, false, true, false],
          [false, false, false, false, false, false, false, false, false, false, false, false, false, false, true, false],
        ],
      },
    },
    linndrum: {
      name: 'LinnDrum',
      pitches: {
        kick: 36,
        snare: 38,
        hihatClosed: 42,
        hihatOpen: 46,
        clap: 39,
        tomLow: 43,
        tomHigh: 47,
        congaHigh: 62,
        congaLow: 63,
        tambourine: 54,
        cowbell: 56,
      },
      defaultVelocity: {
        kick: 1.0,
        snare: 0.9,
        hihatClosed: 0.7,
        hihatOpen: 0.75,
        clap: 0.85,
        tomLow: 0.75,
        tomHigh: 0.75,
        congaHigh: 0.7,
        congaLow: 0.7,
        tambourine: 0.6,
        cowbell: 0.65,
      },
      pan: {
        kick: 0.0,
        snare: 0.05,
        hihatClosed: 0.2,
        hihatOpen: 0.2,
        clap: -0.1,
        tomLow: -0.2,
        tomHigh: 0.2,
        congaHigh: 0.15,
        congaLow: -0.15,
        tambourine: 0.1,
        cowbell: -0.1,
      },
      patterns: {
        basic: [
          [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false],
          [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false],
          [false, false, true, false, false, false, true, false, false, false, true, false, false, false, true, false],
          [false, false, false, false, false, false, false, false, false, false, false, false, true, false, false, false],
        ],
      },
    },
    cr78: {
      name: 'CR-78',
      pitches: {
        kick: 36,
        snare: 38,
        hihatClosed: 42,
        hihatOpen: 46,
        claves: 75,
        cowbell: 56,
        congaHigh: 62,
        congaLow: 63,
        tambourine: 54,
        guiro: 67,
      },
      defaultVelocity: {
        kick: 1.0,
        snare: 0.85,
        hihatClosed: 0.65,
        hihatOpen: 0.7,
        claves: 0.6,
        cowbell: 0.6,
        congaHigh: 0.65,
        congaLow: 0.65,
        tambourine: 0.55,
        guiro: 0.55,
      },
      pan: {
        kick: 0.0,
        snare: 0.0,
        hihatClosed: 0.2,
        hihatOpen: 0.2,
        claves: -0.1,
        cowbell: -0.15,
        congaHigh: 0.15,
        congaLow: -0.15,
        tambourine: 0.1,
        guiro: 0.0,
      },
      patterns: {
        basic: [
          [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false],
          [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false],
          [true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true],
          [false, false, false, false, false, false, false, false, false, false, false, false, false, false, true, false],
        ],
      },
    },
  };

  /**
   * 创建鼓机音序器
   * @param style - 风格预设名称 ('tr808' | 'tr909' | 'tr707' | 'linndrum' | 'cr78')
   * @param stepCount - 步进数，默认 16
   */
  constructor(style: string = 'tr808', stepCount: number = 16) {
    this.currentStyle = style;
    this.stepCount = stepCount;
    this.bpm = DEFAULT_BPM;
    this.drumMap = new Map();
    this.stepData = new Map();
    this.velocityData = new Map();
    this.panData = new Map();
    this.gainData = new Map();
    this.tuneData = new Map();
    this.loadPreset(style);
  }

  /**
   * 加载指定风格预设
   * @param style - 预设名称
   */
  public loadPreset(style: string): void {
    const preset = DrumSequencer.PRESETS[style];
    if (!preset) {
      throw new Error(`未知鼓机风格: ${style}`);
    }
    this.currentStyle = style;
    this.drumMap.clear();
    this.stepData.clear();
    this.velocityData.clear();
    this.panData.clear();
    this.gainData.clear();
    this.tuneData.clear();

    let idx = 0;
    for (const [instrument, pitch] of Object.entries(preset.pitches)) {
      this.drumMap.set(instrument, { index: idx, instrument, pitch });
      this.stepData.set(instrument, new Array(this.stepCount).fill(false));
      const velArray = new Array(this.stepCount).fill(preset.defaultVelocity[instrument] ?? 0.8);
      this.velocityData.set(instrument, velArray);
      this.panData.set(instrument, preset.pan[instrument] ?? 0.0);
      this.gainData.set(instrument, 1.0);
      this.tuneData.set(instrument, 0.0);
      idx++;
    }
  }

  /**
   * 设置单个步进状态
   * @param instrument - 鼓件名称
   * @param step - 步进索引
   * @param active - 是否触发
   * @param velocity - 力度 (0.0 ~ 1.0)
   */
  public setStep(instrument: string, step: number, active: boolean, velocity?: number): void {
    if (!this.stepData.has(instrument)) {
      throw new Error(`鼓件不存在: ${instrument}`);
    }
    const s = clamp(step, 0, this.stepCount - 1);
    const steps = this.stepData.get(instrument)!;
    steps[s] = active;
    if (velocity !== undefined) {
      const vels = this.velocityData.get(instrument)!;
      vels[s] = clamp(velocity, 0, 1);
    }
  }

  /**
   * 获取步进状态
   * @param instrument - 鼓件名称
   * @param step - 步进索引
   * @returns 是否触发
   */
  public getStep(instrument: string, step: number): boolean {
    const steps = this.stepData.get(instrument);
    if (!steps) return false;
    return steps[clamp(step, 0, this.stepCount - 1)];
  }

  /**
   * 批量设置鼓件步进模式
   * @param instrument - 鼓件名称
   * @param pattern - 布尔数组
   */
  public setPattern(instrument: string, pattern: boolean[]): void {
    if (!this.stepData.has(instrument)) {
      throw new Error(`鼓件不存在: ${instrument}`);
    }
    const arr = pattern.slice(0, this.stepCount);
    while (arr.length < this.stepCount) arr.push(false);
    this.stepData.set(instrument, arr);
  }

  /**
   * 批量设置鼓件力度
   * @param instrument - 鼓件名称
   * @param velocities - 力度数组
   */
  public setVelocities(instrument: string, velocities: number[]): void {
    if (!this.velocityData.has(instrument)) {
      throw new Error(`鼓件不存在: ${instrument}`);
    }
    const arr = velocities.map((v) => clamp(v, 0, 1)).slice(0, this.stepCount);
    while (arr.length < this.stepCount) arr.push(0.8);
    this.velocityData.set(instrument, arr);
  }

  /**
   * 为指定鼓件应用 Euclidean 节奏
   * @param instrument - 鼓件名称
   * @param pulses - 脉冲数
   * @param rotation - 旋转偏移
   */
  public applyEuclidean(instrument: string, pulses: number, rotation: number = 0): void {
    const pattern = StepSequencer.generateEuclidean(pulses, this.stepCount, rotation);
    this.setPattern(instrument, pattern);
  }

  /**
   * 设置鼓件声像
   * @param instrument - 鼓件名称
   * @param pan - 声像 (-1.0 ~ 1.0)
   */
  public setPan(instrument: string, pan: number): void {
    this.panData.set(instrument, clamp(pan, -1, 1));
  }

  /**
   * 设置鼓件增益
   * @param instrument - 鼓件名称
   * @param gain - 增益 (0.0 ~ 1.0)
   */
  public setGain(instrument: string, gain: number): void {
    this.gainData.set(instrument, clamp(gain, 0, 1));
  }

  /**
   * 设置鼓件音高微调
   * @param instrument - 鼓件名称
   * @param cents - 音分偏移 (-100 ~ 100)
   */
  public setTune(instrument: string, cents: number): void {
    this.tuneData.set(instrument, clamp(cents, -100, 100));
  }

  /**
   * 生成鼓机事件序列
   * @param durationBars - 总小节数
   * @param bpm - BPM
   * @returns StepEvent 数组
   */
  public generateSequence(durationBars: number, bpm: number = DEFAULT_BPM): StepEvent[] {
    const beatDuration = 60.0 / bpm;
    const stepDuration = (beatDuration * 4) / this.stepCount;
    const totalDuration = durationBars * 4 * beatDuration;
    const events: StepEvent[] = [];

    for (let bar = 0; bar < durationBars; bar++) {
      for (let step = 0; step < this.stepCount; step++) {
        const time = (bar * this.stepCount + step) * stepDuration;
        for (const [instrument, steps] of this.stepData) {
          if (!steps[step]) continue;
          const map = this.drumMap.get(instrument);
          if (!map) continue;
          const vel = this.velocityData.get(instrument)?.[step] ?? 0.8;
          const gain = this.gainData.get(instrument) ?? 1.0;
          const tune = this.tuneData.get(instrument) ?? 0.0;
          const pitch = map.pitch + tune / 100;

          events.push({
            trackId: instrument,
            stepIndex: step,
            time,
            velocity: vel * gain,
            pitch,
            duration: stepDuration * 0.95,
          });
        }
      }
    }

    events.sort((a, b) => a.time - b.time);
    return events;
  }

  /**
   * 生成鼓机音频缓冲区（简化合成）
   * @param durationBars - 总小节数
   * @param bpm - BPM
   * @returns Float32Array 立体声交错缓冲区
   */
  public generateBuffer(durationBars: number, bpm: number = DEFAULT_BPM): Float32Array {
    const events = this.generateSequence(durationBars, bpm);
    const totalDuration = durationBars * (240 / bpm);
    const sampleCount = Math.ceil(totalDuration * SAMPLE_RATE);
    const left = new Float32Array(sampleCount);
    const right = new Float32Array(sampleCount);

    for (const ev of events) {
      const startSample = Math.floor(ev.time * SAMPLE_RATE);
      const durSamples = Math.floor(ev.duration * SAMPLE_RATE);
      const freq = midiToFrequency(ev.pitch);
      const amp = ev.velocity;
      const pan = this.panData.get(ev.trackId) ?? 0.0;
      const leftGain = Math.cos((pan + 1) * Math.PI / 4) * Math.SQRT2 / 2;
      const rightGain = Math.sin((pan + 1) * Math.PI / 4) * Math.SQRT2 / 2;

      // 简单合成：kick 用正弦下降，snare 用噪声+正弦，hihat 用高频噪声
      const isKick = ev.trackId.includes('kick');
      const isSnare = ev.trackId.includes('snare');
      const isHihat = ev.trackId.includes('hihat');

      for (let i = 0; i < durSamples; i++) {
        const t = i / SAMPLE_RATE;
        let sample = 0;
        if (isKick) {
          const f = freq * Math.exp(-t * 20);
          sample = Math.sin(2 * Math.PI * f * t) * amp * Math.exp(-t * 8);
        } else if (isSnare) {
          const noise = (Math.random() * 2 - 1);
          sample = (Math.sin(2 * Math.PI * freq * t) * 0.5 + noise * 0.5) * amp * Math.exp(-t * 12);
        } else if (isHihat) {
          const noise = (Math.random() * 2 - 1);
          sample = noise * amp * Math.exp(-t * 40);
        } else {
          sample = Math.sin(2 * Math.PI * freq * t) * amp * Math.exp(-t * 10);
        }

        const idx = startSample + i;
        if (idx < sampleCount) {
          left[idx] += sample * leftGain;
          right[idx] += sample * rightGain;
        }
      }
    }

    // 合并为立体声交错
    const stereo = new Float32Array(sampleCount * 2);
    for (let i = 0; i < sampleCount; i++) {
      stereo[i * 2] = Math.tanh(left[i]);
      stereo[i * 2 + 1] = Math.tanh(right[i]);
    }
    return stereo;
  }

  /**
   * 设置 BPM
   * @param bpm - BPM
   */
  public setBpm(bpm: number): void {
    this.bpm = clamp(bpm, 20, 300);
  }

  /**
   * 设置步进数（会清空当前数据）
   * @param count - 步进数
   */
  public setStepCount(count: number): void {
    this.stepCount = clamp(count, 4, MAX_STEPS);
    // 重新初始化当前风格以匹配新步进数
    this.loadPreset(this.currentStyle);
  }

  /**
   * 清除所有步进数据
   */
  public clearAll(): void {
    for (const key of this.stepData.keys()) {
      this.stepData.set(key, new Array(this.stepCount).fill(false));
      const defVel = DrumSequencer.PRESETS[this.currentStyle]?.defaultVelocity[key] ?? 0.8;
      this.velocityData.set(key, new Array(this.stepCount).fill(defVel));
    }
  }

  /**
   * 复制 Pattern
   * @returns 当前状态快照
   */
  public cloneState(): {
    stepData: Map<string, boolean[]>;
    velocityData: Map<string, number[]>;
    panData: Map<string, number>;
    gainData: Map<string, number>;
    tuneData: Map<string, number>;
  } {
    const cloneSteps = new Map<string, boolean[]>();
    const cloneVel = new Map<string, number[]>();
    for (const [k, v] of this.stepData) cloneSteps.set(k, [...v]);
    for (const [k, v] of this.velocityData) cloneVel.set(k, [...v]);
    return {
      stepData: cloneSteps,
      velocityData: cloneVel,
      panData: new Map(this.panData),
      gainData: new Map(this.gainData),
      tuneData: new Map(this.tuneData),
    };
  }

  /**
   * 从快照恢复状态
   * @param state - cloneState 返回的对象
   */
  public restoreState(state: {
    stepData: Map<string, boolean[]>;
    velocityData: Map<string, number[]>;
    panData: Map<string, number>;
    gainData: Map<string, number>;
    tuneData: Map<string, number>;
  }): void {
    this.stepData = new Map(state.stepData);
    this.velocityData = new Map(state.velocityData);
    this.panData = new Map(state.panData);
    this.gainData = new Map(state.gainData);
    this.tuneData = new Map(state.tuneData);
  }
}

// =============================================================================
// 工具函数
// =============================================================================

/**
 * 合并多个步进事件序列到同一时间轴
 * @param sequences - 待合并的序列数组
 * @returns 合并后的事件数组（按时间排序）
 */
export function mergeSequences(sequences: SequenceResult[]): SequenceResult {
  const events: StepEvent[] = [];
  let maxDuration = 0;
  let bpm = DEFAULT_BPM;
  let stepCount = DEFAULT_STEPS;

  for (const seq of sequences) {
    events.push(...seq.events);
    if (seq.totalDuration > maxDuration) maxDuration = seq.totalDuration;
    bpm = seq.bpm;
    stepCount = seq.stepCount;
  }

  events.sort((a, b) => a.time - b.time);
  return { events, totalDuration: maxDuration, bpm, stepCount };
}

/**
 * 量化事件时间到指定网格
 * @param events - 事件数组
 * @param grid - 网格大小（秒）
 * @returns 量化后的事件数组
 */
export function quantizeEvents(events: StepEvent[], grid: number): StepEvent[] {
  return events.map((ev) => ({
    ...ev,
    time: quantizeTime(ev.time, grid),
  }));
}

/**
 * 为事件序列添加 Humanize（微时间随机偏移）
 * @param events - 事件数组
 * @param amount - 偏移强度（秒）
 * @returns 处理后的事件数组
 */
export function humanizeEvents(events: StepEvent[], amount: number): StepEvent[] {
  return events.map((ev) => {
    const offset = (Math.random() * 2 - 1) * amount;
    return {
      ...ev,
      time: Math.max(0, ev.time + offset),
    };
  });
}

/**
 * 将步进事件序列导出为 MIDI-note-like 对象（便于后续合成器使用）
 * @param result - 序列结果
 * @returns 扁平化事件列表
 */
export function flattenSequence(result: SequenceResult): StepEvent[] {
  return result.events.map((ev) => ({ ...ev }));
}

// =============================================================================
// 默认导出
// =============================================================================

export default {
  StepSequencer,
  Arpeggiator,
  DrumSequencer,
  mergeSequences,
  quantizeEvents,
  humanizeEvents,
  flattenSequence,
};
