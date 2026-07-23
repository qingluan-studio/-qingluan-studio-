/**
 * @fileoverview 青鸾数字音频工作站 - 粒子合成器引擎
 * @description 基于微粒子切割与重组的粒子合成系统，支持窗口函数、粒子云、精确调度与多声道输出
 * @version 2.0.0
 * @author 青鸾音频引擎团队
 */

import {
  clamp,
  lerp,
  smoothstep,
  dbToGain,
  hannWindow,
  semitoneToRatio,
} from '../utils/audioUtils.js';

// ═══════════════════════════════════════════════════════════════
// 全局常量
// ═══════════════════════════════════════════════════════════════

/** 系统统一采样率 (Hz) */
export const SAMPLE_RATE = 44100;

/** 最大同时播放粒子数 */
export const MAX_GRAINS = 4096;

/** 默认粒子大小 (毫秒) */
export const DEFAULT_GRAIN_SIZE_MS = 100;

/** 默认粒子密度 (Hz) */
export const DEFAULT_GRAIN_DENSITY_HZ = 20;

/** 最大粒子大小 (毫秒) */
export const MAX_GRAIN_SIZE_MS = 2000;

/** 最小粒子大小 (毫秒) */
export const MIN_GRAIN_SIZE_MS = 1;

/** 最大密度 (Hz) */
export const MAX_DENSITY_HZ = 1000;

/** 最小密度 (Hz) */
export const MIN_DENSITY_HZ = 0.1;

/** 最大播放速率 */
export const MAX_PLAYBACK_RATE = 4.0;

/** 最小播放速率 */
export const MIN_PLAYBACK_RATE = -4.0;

/** 最大音高偏移 (半音) */
export const MAX_PITCH_SHIFT = 48;

/** 最小音高偏移 (半音) */
export const MIN_PITCH_SHIFT = -48;

/** 最大 spray 范围 (毫秒) */
export const MAX_SPRAY_MS = 5000;

/** 默认立体声展宽 */
export const DEFAULT_STEREO_WIDTH = 1.0;

// ═══════════════════════════════════════════════════════════════
// 核心类型定义
// ═══════════════════════════════════════════════════════════════

/**
 * 窗口函数类型
 */
export type WindowType = 'hann' | 'gaussian' | 'cosine' | 'triangle' | 'rectangular';

/**
 * 粒子播放模式
 */
export type GrainMode = 'sync' | 'async';

/**
 * 粒子方向
 */
export type GrainDirection = 'forward' | 'reverse' | 'random';

/**
 * 粒子参数配置
 */
export interface GrainConfig {
  /** 粒子大小 (毫秒) */
  grainSizeMs: number;
  /** 粒子密度 (Hz) */
  densityHz: number;
  /** 随机度 (0-1) */
  randomness: number;
  /** 播放速率 */
  playbackRate: number;
  /** 音高偏移 (半音) */
  pitchShift: number;
  /** Spray 范围 (毫秒) */
  sprayMs: number;
  /** 源起始位置 (0-1) */
  positionStart: number;
  /** 源结束位置 (0-1) */
  positionEnd: number;
  /** 窗口函数类型 */
  windowType: WindowType;
  /** 播放模式 */
  mode: GrainMode;
  /** 播放方向 */
  direction: GrainDirection;
  /** 立体声展宽 */
  stereoWidth: number;
  /** 增益 (dB) */
  gainDb: number;
  /** 反向粒子比例 (0-1) */
  reverseProbability: number;
  /** 粒子数量上限 */
  maxGrains: number;
}

/**
 * 单个粒子实例
 */
export interface Grain {
  /** 粒子唯一标识 */
  id: number;
  /** 当前年龄 (样本数) */
  age: number;
  /** 总寿命 (样本数) */
  lifespan: number;
  /** 源缓冲区起始位置 (样本索引) */
  sourceStart: number;
  /** 源缓冲区读取方向 (1 = 正向, -1 = 反向) */
  direction: number;
  /** 音高比率 */
  pitchRatio: number;
  /** 当前振幅 */
  amplitude: number;
  /** 窗口函数缓冲区 */
  window: Float32Array;
  /** 声像位置 (-1 ~ 1) */
  pan: number;
  /** 是否存活 */
  alive: boolean;
  /** 左声道增益 */
  gainL: number;
  /** 右声道增益 */
  gainR: number;
}

/**
 * 调度事件
 */
export interface ScheduleEvent {
  /** 触发时间 (样本索引) */
  time: number;
  /** 粒子大小 (样本数) */
  grainSize: number;
  /** 源位置 (样本索引) */
  sourcePosition: number;
  /** 音高比率 */
  pitchRatio: number;
  /** 振幅 */
  amplitude: number;
  /** 方向 */
  direction: number;
  /** 声像 */
  pan: number;
}

/**
 * 粒子云状态
 */
export interface GrainCloudState {
  /** 活跃粒子数 */
  activeGrains: number;
  /** 已生成粒子总数 */
  totalGenerated: number;
  /** 已销毁粒子总数 */
  totalDestroyed: number;
  /** 当前平均重叠数 */
  averageOverlap: number;
  /** 当前 CPU 负载估计 (0-1) */
  cpuLoad: number;
}

// ═══════════════════════════════════════════════════════════════
// 辅助工具函数
// ═══════════════════════════════════════════════════════════════

/**
 * 生成指定类型的窗口函数
 * @param size 窗口大小 (样本数)
 * @param type 窗口类型
 * @returns 窗口函数数组
 */
export function generateWindow(size: number, type: WindowType): Float32Array {
  const window = new Float32Array(size);

  switch (type) {
    case 'hann': {
      // 汉宁窗: 0.5 - 0.5 * cos(2π * n / (N-1))
      for (let i = 0; i < size; i++) {
        window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1));
      }
      break;
    }

    case 'gaussian': {
      // 高斯窗: exp(-0.5 * ((n - N/2) / (σ * N/2))^2)
      const sigma = 0.3;
      const half = size / 2;
      for (let i = 0; i < size; i++) {
        const x = (i - half) / (sigma * half);
        window[i] = Math.exp(-0.5 * x * x);
      }
      break;
    }

    case 'cosine': {
      // 余弦窗: cos(π * n / (N-1) - π/2) = sin(π * n / (N-1))
      for (let i = 0; i < size; i++) {
        window[i] = Math.sin((Math.PI * i) / (size - 1));
      }
      break;
    }

    case 'triangle': {
      // 三角窗
      const half = size / 2;
      for (let i = 0; i < size; i++) {
        window[i] = 1 - Math.abs((i - half) / half);
      }
      break;
    }

    case 'rectangular': {
      // 矩形窗 (无衰减)
      window.fill(1.0);
      // 在边缘添加极小的淡入淡出以避免爆音
      const fade = Math.min(10, size / 4);
      for (let i = 0; i < fade; i++) {
        const t = i / fade;
        window[i] *= t;
        window[size - 1 - i] *= t;
      }
      break;
    }

    default:
      window.fill(1.0);
  }

  return window;
}

/**
 * 计算粒子密度对应的间隔 (样本数)
 * @param densityHz 密度 (Hz)
 * @param sampleRate 采样率
 * @returns 间隔样本数
 */
export function densityToInterval(densityHz: number, sampleRate: number): number {
  const hz = clamp(densityHz, MIN_DENSITY_HZ, MAX_DENSITY_HZ);
  return Math.floor(sampleRate / hz);
}

/**
 * 毫秒转样本数
 * @param ms 毫秒
 * @param sampleRate 采样率
 * @returns 样本数
 */
export function msToSamples(ms: number, sampleRate: number): number {
  return Math.floor((ms / 1000) * sampleRate);
}

/**
 * 样本数转毫秒
 * @param samples 样本数
 * @param sampleRate 采样率
 * @returns 毫秒
 */
export function samplesToMs(samples: number, sampleRate: number): number {
  return (samples / sampleRate) * 1000;
}

/**
 * 线性声像到增益
 * @param pan 声像位置 (-1 ~ 1)
 * @returns [左增益, 右增益]
 */
export function panToGainLinear(pan: number): [number, number] {
  const p = clamp(pan, -1, 1);
  const left = p <= 0 ? 1.0 : 1.0 - p;
  const right = p >= 0 ? 1.0 : 1.0 + p;
  return [left, right];
}

// ═══════════════════════════════════════════════════════════════
// GrainScheduler 类 - 粒子调度器
// ═══════════════════════════════════════════════════════════════

/**
 * 粒子调度器类
 * 精确计算粒子的触发时间、位置和参数，支持同步和异步两种模式
 */
export class GrainScheduler {
  /** 采样率 */
  readonly sampleRate: number;

  /** 同步模式间隔 (样本数) */
  private syncInterval: number;

  /** 异步模式下一次触发时间 */
  private nextEventTime: number;

  /** 当前样本时钟 */
  private sampleClock: number;

  /** 调度事件队列 */
  private eventQueue: ScheduleEvent[];

  /** 配置 */
  private config: GrainConfig;

  /** 事件计数器 */
  private eventCounter: number;

  /**
   * 创建粒子调度器
   * @param config 粒子配置
   * @param sampleRate 采样率
   */
  constructor(config: Partial<GrainConfig> = {}, sampleRate: number = SAMPLE_RATE) {
    this.sampleRate = sampleRate;
    this.sampleClock = 0;
    this.nextEventTime = 0;
    this.eventCounter = 0;
    this.eventQueue = [];

    this.config = {
      grainSizeMs: config.grainSizeMs ?? DEFAULT_GRAIN_SIZE_MS,
      densityHz: config.densityHz ?? DEFAULT_GRAIN_DENSITY_HZ,
      randomness: config.randomness ?? 0.1,
      playbackRate: config.playbackRate ?? 1.0,
      pitchShift: config.pitchShift ?? 0,
      sprayMs: config.sprayMs ?? 0,
      positionStart: config.positionStart ?? 0,
      positionEnd: config.positionEnd ?? 1,
      windowType: config.windowType ?? 'hann',
      mode: config.mode ?? 'async',
      direction: config.direction ?? 'forward',
      stereoWidth: config.stereoWidth ?? DEFAULT_STEREO_WIDTH,
      gainDb: config.gainDb ?? 0,
      reverseProbability: config.reverseProbability ?? 0,
      maxGrains: config.maxGrains ?? MAX_GRAINS,
    };

    this.syncInterval = densityToInterval(this.config.densityHz, sampleRate);
  }

  /**
   * 更新配置
   * @param config 新配置 (部分)
   */
  setConfig(config: Partial<GrainConfig>): void {
    Object.assign(this.config, config);
    this.syncInterval = densityToInterval(this.config.densityHz, this.sampleRate);
  }

  /**
   * 设置粒子密度
   * @param hz 密度 (Hz)
   */
  setDensity(hz: number): void {
    this.config.densityHz = clamp(hz, MIN_DENSITY_HZ, MAX_DENSITY_HZ);
    this.syncInterval = densityToInterval(this.config.densityHz, this.sampleRate);
  }

  /**
   * 设置粒子大小
   * @param ms 大小 (毫秒)
   */
  setGrainSize(ms: number): void {
    this.config.grainSizeMs = clamp(ms, MIN_GRAIN_SIZE_MS, MAX_GRAIN_SIZE_MS);
  }

  /**
   * 设置播放位置范围
   * @param start 起始位置 (0-1)
   * @param end 结束位置 (0-1)
   */
  setPosition(start: number, end: number): void {
    this.config.positionStart = clamp(start, 0, 1);
    this.config.positionEnd = clamp(end, 0, 1);
  }

  /**
   * 推进时钟并生成新的调度事件
   * @param samples 前进的样本数
   * @param sourceLength 源缓冲区长度
   * @returns 新生成的事件数组
   */
  tick(samples: number, sourceLength: number): ScheduleEvent[] {
    const newEvents: ScheduleEvent[] = [];
    this.sampleClock += samples;

    if (this.config.mode === 'sync') {
      // 同步模式：在固定间隔触发
      while (this.nextEventTime <= this.sampleClock) {
        const event = this.createEvent(sourceLength);
        event.time = this.nextEventTime;
        newEvents.push(event);
        this.nextEventTime += this.syncInterval;
      }
    } else {
      // 异步模式：泊松分布近似，随机间隔
      while (this.nextEventTime <= this.sampleClock) {
        const event = this.createEvent(sourceLength);
        event.time = this.nextEventTime;
        newEvents.push(event);

        // 计算下一个事件的随机间隔 (指数分布)
        const lambda = this.config.densityHz / this.sampleRate;
        const u = Math.max(1e-10, Math.random());
        const interval = -Math.log(u) / lambda;
        this.nextEventTime += Math.floor(interval);
      }
    }

    // 清理过期事件
    this.eventQueue = this.eventQueue.filter((e) => e.time + e.grainSize > this.sampleClock);
    this.eventQueue.push(...newEvents);

    return newEvents;
  }

  /**
   * 创建单个调度事件
   * @param sourceLength 源缓冲区长度
   * @returns 调度事件
   */
  private createEvent(sourceLength: number): ScheduleEvent {
    const cfg = this.config;
    const grainSizeSamples = msToSamples(
      cfg.grainSizeMs * (1 + (Math.random() - 0.5) * cfg.randomness),
      this.sampleRate
    );

    // 计算源位置
    const rangeStart = Math.floor(cfg.positionStart * sourceLength);
    const rangeEnd = Math.floor(cfg.positionEnd * sourceLength);
    const rangeSize = Math.max(1, rangeEnd - rangeStart);

    // 基础位置 + spray 随机偏移
    const basePosition = rangeStart + Math.random() * rangeSize;
    const spraySamples = msToSamples(cfg.sprayMs * cfg.randomness, this.sampleRate);
    const sourcePosition = clamp(
      Math.floor(basePosition + (Math.random() - 0.5) * spraySamples),
      0,
      Math.max(0, sourceLength - grainSizeSamples)
    );

    // 音高比率
    const pitchRatio = cfg.playbackRate * semitoneToRatio(cfg.pitchShift);

    // 方向
    let direction = 1;
    if (cfg.direction === 'reverse') {
      direction = -1;
    } else if (cfg.direction === 'random') {
      direction = Math.random() < cfg.reverseProbability ? -1 : 1;
    } else {
      // forward 模式下仍可能根据概率反向
      if (Math.random() < cfg.reverseProbability) {
        direction = -1;
      }
    }

    // 声像
    const pan = (Math.random() * 2 - 1) * cfg.stereoWidth;

    this.eventCounter++;

    return {
      time: this.nextEventTime,
      grainSize: grainSizeSamples,
      sourcePosition,
      pitchRatio,
      amplitude: dbToGain(cfg.gainDb),
      direction,
      pan,
    };
  }

  /**
   * 重置调度器状态
   */
  reset(): void {
    this.sampleClock = 0;
    this.nextEventTime = 0;
    this.eventCounter = 0;
    this.eventQueue = [];
  }

  /**
   * 获取已调度事件总数
   * @returns 事件数量
   */
  getEventCount(): number {
    return this.eventCounter;
  }

  /**
   * 获取当前事件队列
   * @returns 事件数组
   */
  getEventQueue(): ScheduleEvent[] {
    return [...this.eventQueue];
  }
}

// ═══════════════════════════════════════════════════════════════
// GrainCloud 类 - 粒子云管理
// ═══════════════════════════════════════════════════════════════

/**
 * 粒子云类
 * 管理数千个同时活跃的粒子实例，处理生成、更新和销毁生命周期
 */
export class GrainCloud {
  /** 活跃粒子数组 */
  private grains: Grain[];

  /** 粒子池 (复用已销毁粒子) */
  private grainPool: Grain[];

  /** 源音频缓冲区 */
  private sourceBuffer: Float32Array;

  /** 源缓冲区长度 */
  private sourceLength: number;

  /** 采样率 */
  readonly sampleRate: number;

  /** 配置 */
  private config: GrainConfig;

  /** 统计信息 */
  private stats: {
    totalGenerated: number;
    totalDestroyed: number;
    peakActive: number;
  };

  /** 下一个粒子 ID */
  private nextGrainId: number;

  /**
   * 创建粒子云
   * @param config 粒子配置
   * @param sampleRate 采样率
   */
  constructor(config: Partial<GrainConfig> = {}, sampleRate: number = SAMPLE_RATE) {
    this.sampleRate = sampleRate;
    this.grains = [];
    this.grainPool = [];
    this.sourceBuffer = new Float32Array(0);
    this.sourceLength = 0;
    this.nextGrainId = 1;
    this.stats = {
      totalGenerated: 0,
      totalDestroyed: 0,
      peakActive: 0,
    };

    this.config = {
      grainSizeMs: config.grainSizeMs ?? DEFAULT_GRAIN_SIZE_MS,
      densityHz: config.densityHz ?? DEFAULT_GRAIN_DENSITY_HZ,
      randomness: config.randomness ?? 0.1,
      playbackRate: config.playbackRate ?? 1.0,
      pitchShift: config.pitchShift ?? 0,
      sprayMs: config.sprayMs ?? 0,
      positionStart: config.positionStart ?? 0,
      positionEnd: config.positionEnd ?? 1,
      windowType: config.windowType ?? 'hann',
      mode: config.mode ?? 'async',
      direction: config.direction ?? 'forward',
      stereoWidth: config.stereoWidth ?? DEFAULT_STEREO_WIDTH,
      gainDb: config.gainDb ?? 0,
      reverseProbability: config.reverseProbability ?? 0,
      maxGrains: config.maxGrains ?? MAX_GRAINS,
    };
  }

  /**
   * 加载粒子源音频
   * @param buffer 单声道音频缓冲区
   */
  loadSource(buffer: Float32Array): void {
    this.sourceBuffer = buffer;
    this.sourceLength = buffer.length;
  }

  /**
   * 更新配置
   * @param config 新配置
   */
  setConfig(config: Partial<GrainConfig>): void {
    Object.assign(this.config, config);
  }

  /**
   * 根据调度事件生成新粒子
   * @param events 调度事件数组
   */
  spawnGrains(events: ScheduleEvent[]): void {
    for (const event of events) {
      if (this.grains.length >= this.config.maxGrains) break;

      const grain = this.createGrain(event);
      this.grains.push(grain);
      this.stats.totalGenerated++;
    }

    if (this.grains.length > this.stats.peakActive) {
      this.stats.peakActive = this.grains.length;
    }
  }

  /**
   * 创建单个粒子
   * @param event 调度事件
   * @returns 粒子实例
   */
  private createGrain(event: ScheduleEvent): Grain {
    // 尝试从池中复用
    let grain = this.grainPool.pop();

    if (!grain) {
      grain = {
        id: 0,
        age: 0,
        lifespan: 0,
        sourceStart: 0,
        direction: 1,
        pitchRatio: 1,
        amplitude: 1,
        window: new Float32Array(0),
        pan: 0,
        alive: true,
        gainL: 1,
        gainR: 1,
      };
    }

    grain.id = this.nextGrainId++;
    grain.age = 0;
    grain.lifespan = event.grainSize;
    grain.sourceStart = event.sourcePosition;
    grain.direction = event.direction;
    grain.pitchRatio = event.pitchRatio;
    grain.amplitude = event.amplitude;
    grain.pan = event.pan;
    grain.alive = true;

    // 生成窗口函数
    grain.window = generateWindow(event.grainSize, this.config.windowType);

    // 计算声像增益
    const [gl, gr] = panToGainLinear(event.pan);
    grain.gainL = gl;
    grain.gainR = gr;

    return grain;
  }

  /**
   * 推进所有粒子的生命周期并渲染输出
   * @param samples 前进的样本数
   * @returns [左声道输出, 右声道输出]
   */
  process(samples: number): [Float32Array, Float32Array] {
    const outL = new Float32Array(samples);
    const outR = new Float32Array(samples);

    if (this.sourceLength === 0) {
      return [outL, outR];
    }

    // 处理每个活跃粒子
    const aliveGrains: Grain[] = [];

    for (const grain of this.grains) {
      if (!grain.alive) continue;

      for (let i = 0; i < samples; i++) {
        if (grain.age >= grain.lifespan) {
          grain.alive = false;
          break;
        }

        // 计算源读取位置
        const readPosBase = grain.sourceStart + grain.age * grain.direction * grain.pitchRatio;
        const readPos = Math.floor(readPosBase);

        // 边界检查
        if (readPos < 0 || readPos >= this.sourceLength - 1) {
          grain.age++;
          continue;
        }

        // 线性插值读取源样本
        const frac = readPosBase - readPos;
        const s0 = this.sourceBuffer[readPos];
        const s1 = this.sourceBuffer[readPos + 1];
        const sourceSample = lerp(s0, s1, frac);

        // 应用窗口函数和振幅
        const windowIdx = Math.min(grain.age, grain.window.length - 1);
        const envelope = grain.window[windowIdx] * grain.amplitude;
        const sample = sourceSample * envelope;

        // 写入输出
        outL[i] += sample * grain.gainL;
        outR[i] += sample * grain.gainR;

        grain.age++;
      }

      if (grain.alive) {
        aliveGrains.push(grain);
      } else {
        this.recycleGrain(grain);
      }
    }

    this.grains = aliveGrains;
    this.stats.totalDestroyed += this.grains.length - aliveGrains.length;

    return [outL, outR];
  }

  /**
   * 复用粒子实例到对象池
   * @param grain 要回收的粒子
   */
  private recycleGrain(grain: Grain): void {
    if (this.grainPool.length < 1000) {
      this.grainPool.push(grain);
    }
  }

  /**
   * 清空所有活跃粒子
   */
  clear(): void {
    for (const grain of this.grains) {
      this.recycleGrain(grain);
    }
    this.grains = [];
  }

  /**
   * 获取粒子云状态
   * @returns 状态对象
   */
  getState(): GrainCloudState {
    const active = this.grains.length;
    const avgOverlap = active * (this.config.grainSizeMs / 1000) * this.config.densityHz;
    return {
      activeGrains: active,
      totalGenerated: this.stats.totalGenerated,
      totalDestroyed: this.stats.totalDestroyed,
      averageOverlap: avgOverlap,
      cpuLoad: clamp(active / this.config.maxGrains, 0, 1),
    };
  }

  /**
   * 重置粒子云
   */
  reset(): void {
    this.clear();
    this.stats = {
      totalGenerated: 0,
      totalDestroyed: 0,
      peakActive: 0,
    };
    this.nextGrainId = 1;
  }
}

// ═══════════════════════════════════════════════════════════════
// GranularSynthesizer 类 - 粒子合成器主类
// ═══════════════════════════════════════════════════════════════

/**
 * 粒子合成器主类
 * 青鸾 DAW 的粒子合成引擎，整合调度器与粒子云，提供完整的粒子合成功能
 */
export class GranularSynthesizer {
  /** 粒子云实例 */
  readonly cloud: GrainCloud;

  /** 调度器实例 */
  readonly scheduler: GrainScheduler;

  /** 配置 */
  private config: GrainConfig;

  /** 采样率 */
  readonly sampleRate: number;

  /** 源缓冲区 (单声道) */
  private sourceBuffer: Float32Array;

  /** 源是否已加载 */
  private sourceLoaded: boolean;

  /** 当前播放位置 */
  private currentPosition: number;

  /** 输出缓冲区 (左) */
  private outputBufferL: Float32Array;

  /** 输出缓冲区 (右) */
  private outputBufferR: Float32Array;

  /** 是否正在播放 */
  private playing: boolean;

  /** 进度回调 */
  progressCallback: ((progress: number) => void) | null;

  /**
   * 创建粒子合成器
   * @param config 初始配置
   * @param sampleRate 采样率
   */
  constructor(config: Partial<GrainConfig> = {}, sampleRate: number = SAMPLE_RATE) {
    this.sampleRate = sampleRate;
    this.sourceBuffer = new Float32Array(0);
    this.sourceLoaded = false;
    this.currentPosition = 0;
    this.outputBufferL = new Float32Array(0);
    this.outputBufferR = new Float32Array(0);
    this.playing = false;
    this.progressCallback = null;

    this.config = {
      grainSizeMs: config.grainSizeMs ?? DEFAULT_GRAIN_SIZE_MS,
      densityHz: config.densityHz ?? DEFAULT_GRAIN_DENSITY_HZ,
      randomness: config.randomness ?? 0.1,
      playbackRate: config.playbackRate ?? 1.0,
      pitchShift: config.pitchShift ?? 0,
      sprayMs: config.sprayMs ?? 0,
      positionStart: config.positionStart ?? 0,
      positionEnd: config.positionEnd ?? 1,
      windowType: config.windowType ?? 'hann',
      mode: config.mode ?? 'async',
      direction: config.direction ?? 'forward',
      stereoWidth: config.stereoWidth ?? DEFAULT_STEREO_WIDTH,
      gainDb: config.gainDb ?? 0,
      reverseProbability: config.reverseProbability ?? 0,
      maxGrains: config.maxGrains ?? MAX_GRAINS,
    };

    this.cloud = new GrainCloud(this.config, sampleRate);
    this.scheduler = new GrainScheduler(this.config, sampleRate);
  }

  /**
   * 加载粒子源音频
   * @param buffer 单声道 Float32Array
   */
  loadGrainSource(buffer: Float32Array): void {
    if (buffer.length === 0) {
      throw new Error('源音频缓冲区不能为空');
    }
    this.sourceBuffer = buffer;
    this.sourceLoaded = true;
    this.cloud.loadSource(buffer);
    this.currentPosition = 0;
  }

  /**
   * 设置粒子大小
   * @param ms 大小 (毫秒)
   */
  setGrainSize(ms: number): void {
    this.config.grainSizeMs = clamp(ms, MIN_GRAIN_SIZE_MS, MAX_GRAIN_SIZE_MS);
    this.cloud.setConfig({ grainSizeMs: this.config.grainSizeMs });
    this.scheduler.setConfig({ grainSizeMs: this.config.grainSizeMs });
  }

  /**
   * 设置粒子密度
   * @param hz 密度 (Hz)
   */
  setGrainDensity(hz: number): void {
    this.config.densityHz = clamp(hz, MIN_DENSITY_HZ, MAX_DENSITY_HZ);
    this.cloud.setConfig({ densityHz: this.config.densityHz });
    this.scheduler.setDensity(this.config.densityHz);
  }

  /**
   * 设置粒子随机度
   * @param amount 随机度 (0-1)
   */
  setGrainRandomness(amount: number): void {
    this.config.randomness = clamp(amount, 0, 1);
    this.cloud.setConfig({ randomness: this.config.randomness });
    this.scheduler.setConfig({ randomness: this.config.randomness });
  }

  /**
   * 设置播放速率
   * @param rate 播放速率 (负值表示反向)
   */
  setPlaybackRate(rate: number): void {
    this.config.playbackRate = clamp(rate, MIN_PLAYBACK_RATE, MAX_PLAYBACK_RATE);
    this.cloud.setConfig({ playbackRate: this.config.playbackRate });
    this.scheduler.setConfig({ playbackRate: this.config.playbackRate });
  }

  /**
   * 设置音高偏移
   * @param semitones 半音数
   */
  setPitchShift(semitones: number): void {
    this.config.pitchShift = clamp(semitones, MIN_PITCH_SHIFT, MAX_PITCH_SHIFT);
    this.cloud.setConfig({ pitchShift: this.config.pitchShift });
    this.scheduler.setConfig({ pitchShift: this.config.pitchShift });
  }

  /**
   * 设置 Spray 范围
   * @param amount Spray 范围 (毫秒)
   */
  setSpray(amount: number): void {
    this.config.sprayMs = clamp(amount, 0, MAX_SPRAY_MS);
    this.cloud.setConfig({ sprayMs: this.config.sprayMs });
    this.scheduler.setConfig({ sprayMs: this.config.sprayMs });
  }

  /**
   * 设置源播放位置范围
   * @param start 起始位置 (0-1)
   * @param end 结束位置 (0-1)
   */
  setPosition(start: number, end: number): void {
    const s = clamp(start, 0, 1);
    const e = clamp(end, 0, 1);
    this.config.positionStart = Math.min(s, e);
    this.config.positionEnd = Math.max(s, e);
    this.cloud.setConfig({ positionStart: this.config.positionStart, positionEnd: this.config.positionEnd });
    this.scheduler.setPosition(this.config.positionStart, this.config.positionEnd);
  }

  /**
   * 设置窗口函数类型
   * @param type 窗口类型
   */
  setWindowType(type: WindowType): void {
    this.config.windowType = type;
    this.cloud.setConfig({ windowType: type });
    this.scheduler.setConfig({ windowType: type });
  }

  /**
   * 设置播放模式
   * @param mode 同步/异步模式
   */
  setMode(mode: GrainMode): void {
    this.config.mode = mode;
    this.cloud.setConfig({ mode });
    this.scheduler.setConfig({ mode });
  }

  /**
   * 设置播放方向
   * @param direction 方向类型
   */
  setDirection(direction: GrainDirection): void {
    this.config.direction = direction;
    this.cloud.setConfig({ direction });
    this.scheduler.setConfig({ direction });
  }

  /**
   * 设置立体声展宽
   * @param width 宽度 (0-1)
   */
  setStereoWidth(width: number): void {
    this.config.stereoWidth = clamp(width, 0, 1);
    this.cloud.setConfig({ stereoWidth: this.config.stereoWidth });
    this.scheduler.setConfig({ stereoWidth: this.config.stereoWidth });
  }

  /**
   * 设置输出增益
   * @param db 增益 (dB)
   */
  setGain(db: number): void {
    this.config.gainDb = db;
    this.cloud.setConfig({ gainDb: db });
    this.scheduler.setConfig({ gainDb: db });
  }

  /**
   * 设置反向粒子概率
   * @param probability 概率 (0-1)
   */
  setReverseProbability(probability: number): void {
    this.config.reverseProbability = clamp(probability, 0, 1);
    this.cloud.setConfig({ reverseProbability: this.config.reverseProbability });
    this.scheduler.setConfig({ reverseProbability: this.config.reverseProbability });
  }

  /**
   * 合成指定时长的粒子音频
   * @param duration 时长 (秒)
   * @returns 立体声缓冲区 [左, 右]
   */
  synthesize(duration: number): [Float32Array, Float32Array] {
    if (!this.sourceLoaded) {
      throw new Error('未加载粒子源音频，请先调用 loadGrainSource()');
    }
    if (duration <= 0) {
      throw new Error('合成时长必须大于 0');
    }

    const totalSamples = Math.floor(duration * this.sampleRate);
    const outL = new Float32Array(totalSamples);
    const outR = new Float32Array(totalSamples);

    const blockSize = 512; // 分块处理
    let processedSamples = 0;

    this.cloud.reset();
    this.scheduler.reset();
    this.playing = true;

    while (processedSamples < totalSamples) {
      const currentBlockSize = Math.min(blockSize, totalSamples - processedSamples);

      // 调度新粒子
      const events = this.scheduler.tick(currentBlockSize, this.sourceBuffer.length);
      this.cloud.spawnGrains(events);

      // 处理粒子
      const [blockL, blockR] = this.cloud.process(currentBlockSize);

      // 写入输出
      for (let i = 0; i < currentBlockSize; i++) {
        outL[processedSamples + i] = blockL[i];
        outR[processedSamples + i] = blockR[i];
      }

      processedSamples += currentBlockSize;

      // 更新进度
      if (this.progressCallback) {
        this.progressCallback(processedSamples / totalSamples);
      }
    }

    this.playing = false;
    this.outputBufferL = outL;
    this.outputBufferR = outR;

    // 归一化 (可选)
    // normalizeBuffer(outL);
    // normalizeBuffer(outR);

    return [outL, outR];
  }

  /**
   * 获取当前配置
   * @returns 配置副本
   */
  getConfig(): GrainConfig {
    return { ...this.config };
  }

  /**
   * 获取粒子云状态
   * @returns 状态对象
   */
  getCloudState(): GrainCloudState {
    return this.cloud.getState();
  }

  /**
   * 获取最后合成的输出缓冲区
   * @returns [左, 右]
   */
  getOutputBuffers(): [Float32Array, Float32Array] {
    return [new Float32Array(this.outputBufferL), new Float32Array(this.outputBufferR)];
  }

  /**
   * 检查是否正在播放/合成
   * @returns 是否正在播放
   */
  isPlaying(): boolean {
    return this.playing;
  }

  /**
   * 停止当前合成
   */
  stop(): void {
    this.playing = false;
    this.cloud.clear();
  }

  /**
   * 重置合成器到初始状态
   */
  reset(): void {
    this.stop();
    this.cloud.reset();
    this.scheduler.reset();
    this.currentPosition = 0;
    this.outputBufferL = new Float32Array(0);
    this.outputBufferR = new Float32Array(0);
  }

  /**
   * 获取源音频时长 (秒)
   * @returns 时长
   */
  getSourceDuration(): number {
    return this.sourceBuffer.length / this.sampleRate;
  }

  /**
   * 获取源音频长度 (样本数)
   * @returns 长度
   */
  getSourceLength(): number {
    return this.sourceBuffer.length;
  }
}

// ═══════════════════════════════════════════════════════════════
// 扩展工具与预设
// ═══════════════════════════════════════════════════════════════

/**
 * 粒子合成器预设配置
 */
export interface GranularPreset {
  name: string;
  description: string;
  config: Partial<GrainConfig>;
}

/**
 * 云纹理预设
 * 生成平滑、梦幻的云状纹理
 */
export const CLOUD_TEXTURE_PRESET: GranularPreset = {
  name: 'cloud_texture',
  description: '平滑云状纹理，适合氛围音乐',
  config: {
    grainSizeMs: 250,
    densityHz: 40,
    randomness: 0.8,
    sprayMs: 2000,
    windowType: 'gaussian',
    mode: 'async',
    stereoWidth: 1.0,
    pitchShift: 0,
    reverseProbability: 0.3,
  },
};

/**
 * 节奏切片预设
 * 生成有节奏感的切片效果
 */
export const RHYTHMIC_CHOP_PRESET: GranularPreset = {
  name: 'rhythmic_chop',
  description: '有节奏的粒子切片',
  config: {
    grainSizeMs: 50,
    densityHz: 8,
    randomness: 0.1,
    sprayMs: 0,
    windowType: 'hann',
    mode: 'sync',
    stereoWidth: 0.3,
    pitchShift: 0,
    reverseProbability: 0.1,
  },
};

/**
 * 时间拉伸预设
 * 极端时间拉伸效果
 */
export const TIME_STRETCH_PRESET: GranularPreset = {
  name: 'time_stretch',
  description: '极端时间拉伸，保持音高',
  config: {
    grainSizeMs: 120,
    densityHz: 60,
    randomness: 0.05,
    sprayMs: 50,
    windowType: 'cosine',
    mode: 'async',
    stereoWidth: 0.5,
    pitchShift: 0,
    reverseProbability: 0,
  },
};

/**
 *  glitch 故障预设
 * 随机跳跃和反向的故障效果
 */
export const GLITCH_PRESET: GranularPreset = {
  name: 'glitch',
  description: '故障艺术风格粒子效果',
  config: {
    grainSizeMs: 30,
    densityHz: 25,
    randomness: 0.95,
    sprayMs: 500,
    windowType: 'rectangular',
    mode: 'async',
    stereoWidth: 1.0,
    pitchShift: 0,
    reverseProbability: 0.5,
  },
};

/**
 * 所有内置预设映射
 */
export const GRANULAR_PRESETS: Map<string, GranularPreset> = new Map([
  ['cloud_texture', CLOUD_TEXTURE_PRESET],
  ['rhythmic_chop', RHYTHMIC_CHOP_PRESET],
  ['time_stretch', TIME_STRETCH_PRESET],
  ['glitch', GLITCH_PRESET],
]);

/**
 * 将粒子合成器应用于现有音频缓冲区
 * 一步到位的便捷函数
 * @param source 源音频
 * @param duration 输出时长 (秒)
 * @param presetName 预设名称或配置
 * @returns 处理后的立体声缓冲区
 */
export function granularProcess(
  source: Float32Array,
  duration: number,
  presetName: string | Partial<GrainConfig>
): [Float32Array, Float32Array] {
  const synth = new GranularSynthesizer();
  synth.loadGrainSource(source);

  if (typeof presetName === 'string') {
    const preset = GRANULAR_PRESETS.get(presetName);
    if (preset) {
      Object.assign(synth.getConfig(), preset.config);
    }
  } else {
    Object.assign(synth.getConfig(), presetName);
  }

  return synth.synthesize(duration);
}

/**
 * 生成随机源缓冲区 (用于测试)
 * @param duration 时长 (秒)
 * @param sampleRate 采样率
 * @returns 噪声缓冲区
 */
export function generateNoiseSource(duration: number, sampleRate: number = SAMPLE_RATE): Float32Array {
  const samples = Math.floor(duration * sampleRate);
  const buffer = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    buffer[i] = (Math.random() * 2 - 1) * 0.1;
  }
  return buffer;
}

/**
 * 生成扫频源缓冲区 (用于测试)
 * @param duration 时长 (秒)
 * @param startFreq 起始频率
 * @param endFreq 结束频率
 * @param sampleRate 采样率
 * @returns 扫频缓冲区
 */
export function generateSweepSource(
  duration: number,
  startFreq: number,
  endFreq: number,
  sampleRate: number = SAMPLE_RATE
): Float32Array {
  const samples = Math.floor(duration * sampleRate);
  const buffer = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const t = i / samples;
    const freq = lerp(startFreq, endFreq, t);
    buffer[i] = Math.sin((2 * Math.PI * freq * i) / sampleRate) * 0.5;
  }
  return buffer;
}

// ═══════════════════════════════════════════════════════════════
// 扩展预设与高级工具
// ═══════════════════════════════════════════════════════════════

/**
 * 反向延迟粒子预设
 * 模拟反向延迟效果
 */
export const REVERSE_DELAY_PRESET: GranularPreset = {
  name: 'reverse_delay',
  description: '反向延迟风格的粒子效果',
  config: {
    grainSizeMs: 200,
    densityHz: 5,
    randomness: 0.2,
    sprayMs: 100,
    windowType: 'triangle',
    mode: 'sync',
    stereoWidth: 0.8,
    pitchShift: 0,
    reverseProbability: 1.0,
  },
};

/**
 * 微声纹理预设
 * 极小粒子生成的细腻纹理
 */
export const MICRO_SOUND_PRESET: GranularPreset = {
  name: 'micro_sound',
  description: '极短粒子微声纹理',
  config: {
    grainSizeMs: 5,
    densityHz: 200,
    randomness: 0.9,
    sprayMs: 100,
    windowType: 'hann',
    mode: 'async',
    stereoWidth: 1.0,
    pitchShift: 12,
    reverseProbability: 0.4,
  },
};

/**
 * 慢动作预设
 * 极慢播放，保留细节
 */
export const SLOW_MOTION_PRESET: GranularPreset = {
  name: 'slow_motion',
  description: '慢动作效果，极低密度大粒子',
  config: {
    grainSizeMs: 500,
    densityHz: 2,
    randomness: 0.05,
    sprayMs: 10,
    windowType: 'gaussian',
    mode: 'sync',
    stereoWidth: 0.6,
    pitchShift: -12,
    reverseProbability: 0.0,
  },
};

/**
 * 雨滴预设
 * 随机分布的短粒子，模拟雨滴声
 */
export const RAIN_DROP_PRESET: GranularPreset = {
  name: 'rain_drop',
  description: '随机分布的短粒子，如雨滴',
  config: {
    grainSizeMs: 20,
    densityHz: 15,
    randomness: 1.0,
    sprayMs: 3000,
    windowType: 'hann',
    mode: 'async',
    stereoWidth: 1.0,
    pitchShift: -5,
    reverseProbability: 0.1,
  },
};

// 注册额外预设
GRANULAR_PRESETS.set('reverse_delay', REVERSE_DELAY_PRESET);
GRANULAR_PRESETS.set('micro_sound', MICRO_SOUND_PRESET);
GRANULAR_PRESETS.set('slow_motion', SLOW_MOTION_PRESET);
GRANULAR_PRESETS.set('rain_drop', RAIN_DROP_PRESET);

/**
 * 创建粒子琶音效果
 * 通过快速改变音高偏移来生成琶音
 * @param synth 粒子合成器实例
 * @param duration 总时长 (秒)
 * @param intervals 音程数组 (半音)
 * @returns 立体声缓冲区
 */
export function grainArpeggio(
  synth: GranularSynthesizer,
  duration: number,
  intervals: number[]
): [Float32Array, Float32Array] {
  if (!synth.isPlaying && intervals.length === 0) {
    throw new Error('需要提供音程数组');
  }

  const totalSamples = Math.floor(duration * synth.sampleRate);
  const outL = new Float32Array(totalSamples);
  const outR = new Float32Array(totalSamples);

  const stepDuration = duration / intervals.length;
  const stepSamples = Math.floor(stepDuration * synth.sampleRate);

  for (let i = 0; i < intervals.length; i++) {
    synth.setPitchShift(intervals[i]);
    const [blockL, blockR] = synth.synthesize(stepDuration);

    const start = i * stepSamples;
    for (let s = 0; s < blockL.length && start + s < totalSamples; s++) {
      outL[start + s] = blockL[s];
      outR[start + s] = blockR[s];
    }
  }

  return [outL, outR];
}

/**
 * 粒子卷积混合
 * 将两个源音频通过粒子合成混合在一起
 * @param sourceA 源 A
 * @param sourceB 源 B
 * @param duration 输出时长
 * @param crossfade 交叉淡化比例 (0 = 全 A, 1 = 全 B)
 * @returns 混合后的立体声缓冲区
 */
export function grainCrossfadeMix(
  sourceA: Float32Array,
  sourceB: Float32Array,
  duration: number,
  crossfade: number = 0.5
): [Float32Array, Float32Array] {
  const synthA = new GranularSynthesizer({ positionStart: 0, positionEnd: 1, stereoWidth: 0.5 });
  const synthB = new GranularSynthesizer({ positionStart: 0, positionEnd: 1, stereoWidth: 0.5 });

  synthA.loadGrainSource(sourceA);
  synthB.loadGrainSource(sourceB);

  const [aL, aR] = synthA.synthesize(duration);
  const [bL, bR] = synthB.synthesize(duration);

  const outL = new Float32Array(aL.length);
  const outR = new Float32Array(aR.length);

  const cf = clamp(crossfade, 0, 1);
  for (let i = 0; i < outL.length; i++) {
    outL[i] = aL[i] * (1 - cf) + bL[i] * cf;
    outR[i] = aR[i] * (1 - cf) + bR[i] * cf;
  }

  return [outL, outR];
}

/**
 * 获取所有预设名称列表
 * @returns 预设名称数组
 */
export function getAllPresetNames(): string[] {
  return Array.from(GRANULAR_PRESETS.keys());
}

/**
 * 获取预设详情
 * @param name 预设名称
 * @returns 预设对象，不存在返回 undefined
 */
export function getPreset(name: string): GranularPreset | undefined {
  return GRANULAR_PRESETS.get(name);
}

// ═══════════════════════════════════════════════════════════════
// 默认导出
// ═══════════════════════════════════════════════════════════════

export default GranularSynthesizer;
