/**
 * @file reverbEngine.ts
 * @description 青鸾数字音频工作站 - 混响引擎
 * 提供板式、弹簧、大厅、房间、大教堂、密室、竞技场等多种混响算法，
 * 支持早期反射与晚期尾音分离控制、预延迟、高低频阻尼、调制混响、
 * 反向混响、冻结功能、卷积混响与基于全通滤波器的施罗德混响。
 *
 * @module qingluan-daw/effects/reverbEngine
 * @version 1.0.0
 */

import {
  clamp,
  lerp,
  smoothstep,
  normalizeBuffer,
  hannWindow,
  fft,
} from '../utils/audioUtils.js';

// =============================================================================
// 常量定义
// =============================================================================

/** 统一采样率 */
export const SAMPLE_RATE = 44100;

/** 最大预延迟时间（毫秒） */
export const MAX_PRE_DELAY_MS = 500;

/** 默认预延迟时间（毫秒） */
export const DEFAULT_PRE_DELAY_MS = 20;

/** 最大衰减时间（秒） */
export const MAX_DECAY = 20.0;

/** 默认衰减时间（秒） */
export const DEFAULT_DECAY = 2.0;

/** 混响尾音计算阈值（dB） */
export const TAIL_THRESHOLD_DB = -60;

/** 早期反射默认增益 */
export const DEFAULT_EARLY_GAIN = 0.6;

/** 晚期尾音默认增益 */
export const DEFAULT_LATE_GAIN = 0.8;

/** 调制速率默认值（Hz） */
export const DEFAULT_MOD_RATE = 0.5;

/** 调制深度默认值 */
export const DEFAULT_MOD_DEPTH = 0.003;

// =============================================================================
// 类型定义
// =============================================================================

/**
 * 混响参数配置
 * @interface ReverbParams
 */
export interface ReverbParams {
  /** 衰减时间 (秒) */
  decay: number;
  /** 预延迟 (毫秒) */
  preDelayMs: number;
  /** 干湿比 (0.0 ~ 1.0) */
  mix: number;
  /** 早期反射增益 (0.0 ~ 1.0) */
  earlyGain: number;
  /** 晚期尾音增益 (0.0 ~ 1.0) */
  lateGain: number;
  /** 高频阻尼 (0.0 ~ 1.0) */
  highDamping: number;
  /** 低频阻尼 (0.0 ~ 1.0) */
  lowDamping: number;
  /** 房间尺寸 (0.0 ~ 1.0) */
  roomSize: number;
  /** 调制速率 (Hz) */
  modRate: number;
  /** 调制深度 (秒) */
  modDepth: number;
  /** 扩散度 (0.0 ~ 1.0) */
  diffusion: number;
}

/**
 * 空间预设参数
 * @interface SpacePreset
 */
export interface SpacePreset {
  /** 预设名称 */
  name: string;
  /** 混响类型 */
  type: ReverbType;
  /** 参数配置 */
  params: Partial<ReverbParams>;
  /** 描述 */
  description: string;
}

/**
 * 混响类型枚举
 * @typedef ReverbType
 */
export type ReverbType =
  | 'plate'
  | 'spring'
  | 'hall'
  | 'room'
  | 'cathedral'
  | 'chamber'
  | 'arena'
  | 'modulated'
  | 'reverse';

/**
 * 脉冲响应数据
 * @interface ImpulseResponse
 */
export interface ImpulseResponse {
  /** 采样率 */
  sampleRate: number;
  /** 左声道数据 */
  left: Float32Array;
  /** 右声道数据 */
  right: Float32Array;
  /** 原始时长（秒） */
  duration: number;
}

/**
 * 梳状滤波器状态
 * @interface CombState
 */
interface CombState {
  buffer: Float32Array;
  index: number;
  feedback: number;
  filterStore: number;
  damp1: number;
  damp2: number;
}

/**
 * 全通滤波器状态
 * @interface AllPassState
 */
interface AllPassState {
  buffer: Float32Array;
  index: number;
}

// =============================================================================
// ReverbEngine 类
// =============================================================================

/**
 * 主混响引擎
 *
 * 实现多种经典混响算法，支持早期反射与晚期尾音分离控制、
 * 预延迟、高低频阻尼、调制混响、反向混响与冻结功能。
 *
 * @class ReverbEngine
 * @example
 * ```ts
 * const reverb = new ReverbEngine();
 * const wet = reverb.createPlateReverb(dryBuffer, 2.5, 0.4, 0.3);
 * ```
 */
export class ReverbEngine {
  /** 当前采样率 */
  public sampleRate: number;
  /** 预延迟缓冲区（毫秒） */
  public preDelayMs: number;
  /** 早期反射增益 */
  public earlyGain: number;
  /** 晚期尾音增益 */
  public lateGain: number;
  /** 高频阻尼系数 (0~1) */
  public highDamping: number;
  /** 低频阻尼系数 (0~1) */
  public lowDamping: number;
  /** 调制速率 (Hz) */
  public modRate: number;
  /** 调制深度 (秒) */
  public modDepth: number;
  /** 冻结标志 */
  public freeze: boolean;
  /** 内部调制相位 */
  private modPhase: number;
  /** 早期反射延迟线长度表（采样点） */
  private earlyDelays: number[];
  /** 早期反射增益表 */
  private earlyGains: number[];

  constructor(sampleRate: number = SAMPLE_RATE) {
    this.sampleRate = sampleRate;
    this.preDelayMs = DEFAULT_PRE_DELAY_MS;
    this.earlyGain = DEFAULT_EARLY_GAIN;
    this.lateGain = DEFAULT_LATE_GAIN;
    this.highDamping = 0.3;
    this.lowDamping = 0.1;
    this.modRate = DEFAULT_MOD_RATE;
    this.modDepth = DEFAULT_MOD_DEPTH;
    this.freeze = false;
    this.modPhase = 0;
    this.earlyDelays = [0.0043, 0.0051, 0.0061, 0.0073, 0.0087, 0.0103, 0.0123, 0.0147];
    this.earlyGains = [0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.15];
  }

  /**
   * 创建板式混响
   *
   * 模拟金属板混响的明亮、密集尾音特性，适合人声与打击乐。
   *
   * @param buffer - 输入单声道缓冲区
   * @param decay - 衰减时间 (秒)
   * @param damping - 高频阻尼 (0.0 ~ 1.0)
   * @param mix - 干湿比 (0.0 ~ 1.0)
   * @returns 输出缓冲区
   */
  public createPlateReverb(buffer: Float32Array, decay: number, damping: number, mix: number): Float32Array {
    const params: Partial<ReverbParams> = {
      decay: clamp(decay, 0.1, MAX_DECAY),
      preDelayMs: 15,
      mix: clamp(mix, 0, 1),
      earlyGain: 0.5,
      lateGain: 0.9,
      highDamping: clamp(damping, 0, 1),
      lowDamping: 0.05,
      roomSize: 0.3,
      diffusion: 0.9,
      modRate: 0.2,
      modDepth: 0.001,
    };
    return this.processReverb(buffer, 'plate', params);
  }

  /**
   * 创建弹簧混响
   *
   * 模拟弹簧混响的金属色彩与色彩感，适合吉他、复古合成器。
   *
   * @param buffer - 输入单声道缓冲区
   * @param decay - 衰减时间 (秒)
   * @param stiffness - 弹簧硬度 (0.0 ~ 1.0)
   * @param mix - 干湿比 (0.0 ~ 1.0)
   * @returns 输出缓冲区
   */
  public createSpringReverb(buffer: Float32Array, decay: number, stiffness: number, mix: number): Float32Array {
    const params: Partial<ReverbParams> = {
      decay: clamp(decay, 0.1, MAX_DECAY),
      preDelayMs: 8,
      mix: clamp(mix, 0, 1),
      earlyGain: 0.4,
      lateGain: 0.7,
      highDamping: clamp(stiffness, 0, 1) * 0.5 + 0.2,
      lowDamping: 0.2,
      roomSize: 0.2,
      diffusion: 0.6,
      modRate: 2.0,
      modDepth: 0.002,
    };
    return this.processReverb(buffer, 'spring', params);
  }

  /**
   * 创建大厅混响
   *
   * 模拟音乐厅的宏大空间感，衰减较长，扩散度高。
   *
   * @param buffer - 输入单声道缓冲区
   * @param decay - 衰减时间 (秒)
   * @param roomSize - 房间尺寸 (0.0 ~ 1.0)
   * @param mix - 干湿比 (0.0 ~ 1.0)
   * @returns 输出缓冲区
   */
  public createHallReverb(buffer: Float32Array, decay: number, roomSize: number, mix: number): Float32Array {
    const params: Partial<ReverbParams> = {
      decay: clamp(decay, 0.1, MAX_DECAY),
      preDelayMs: 30 + clamp(roomSize, 0, 1) * 40,
      mix: clamp(mix, 0, 1),
      earlyGain: 0.6,
      lateGain: 0.85,
      highDamping: 0.4,
      lowDamping: 0.15,
      roomSize: clamp(roomSize, 0, 1),
      diffusion: 0.85,
      modRate: 0.1,
      modDepth: 0.0005,
    };
    return this.processReverb(buffer, 'hall', params);
  }

  /**
   * 创建房间混响
   *
   * 模拟小型房间的紧凑混响，适合鼓组与近距离录音。
   *
   * @param buffer - 输入单声道缓冲区
   * @param decay - 衰减时间 (秒)
   * @param roomSize - 房间尺寸 (0.0 ~ 1.0)
   * @param mix - 干湿比 (0.0 ~ 1.0)
   * @returns 输出缓冲区
   */
  public createRoomReverb(buffer: Float32Array, decay: number, roomSize: number, mix: number): Float32Array {
    const params: Partial<ReverbParams> = {
      decay: clamp(decay, 0.1, 5.0),
      preDelayMs: 5 + clamp(roomSize, 0, 1) * 15,
      mix: clamp(mix, 0, 1),
      earlyGain: 0.7,
      lateGain: 0.6,
      highDamping: 0.5,
      lowDamping: 0.2,
      roomSize: clamp(roomSize, 0, 1),
      diffusion: 0.7,
      modRate: 0.3,
      modDepth: 0.001,
    };
    return this.processReverb(buffer, 'room', params);
  }

  /**
   * 创建大教堂混响
   *
   * 极长衰减、高密度、宏大空间感，适合管风琴、合唱与史诗音乐。
   *
   * @param buffer - 输入单声道缓冲区
   * @param decay - 衰减时间 (秒)
   * @param mix - 干湿比 (0.0 ~ 1.0)
   * @returns 输出缓冲区
   */
  public createCathedralReverb(buffer: Float32Array, decay: number, mix: number): Float32Array {
    const params: Partial<ReverbParams> = {
      decay: clamp(decay, 1.0, MAX_DECAY),
      preDelayMs: 60,
      mix: clamp(mix, 0, 1),
      earlyGain: 0.55,
      lateGain: 0.95,
      highDamping: 0.25,
      lowDamping: 0.05,
      roomSize: 0.95,
      diffusion: 0.95,
      modRate: 0.05,
      modDepth: 0.0003,
    };
    return this.processReverb(buffer, 'cathedral', params);
  }

  /**
   * 创建密室混响
   *
   * 中等衰减、温暖亲密感，适合室内乐、爵士与弦乐。
   *
   * @param buffer - 输入单声道缓冲区
   * @param decay - 衰减时间 (秒)
   * @param mix - 干湿比 (0.0 ~ 1.0)
   * @returns 输出缓冲区
   */
  public createChamberReverb(buffer: Float32Array, decay: number, mix: number): Float32Array {
    const params: Partial<ReverbParams> = {
      decay: clamp(decay, 0.3, 5.0),
      preDelayMs: 12,
      mix: clamp(mix, 0, 1),
      earlyGain: 0.65,
      lateGain: 0.75,
      highDamping: 0.35,
      lowDamping: 0.1,
      roomSize: 0.5,
      diffusion: 0.8,
      modRate: 0.4,
      modDepth: 0.001,
    };
    return this.processReverb(buffer, 'chamber', params);
  }

  /**
   * 创建竞技场混响
   *
   * 超大空间、明显早期反射、尾音扩散极广，适合大型演出与体育场馆模拟。
   *
   * @param buffer - 输入单声道缓冲区
   * @param decay - 衰减时间 (秒)
   * @param mix - 干湿比 (0.0 ~ 1.0)
   * @returns 输出缓冲区
   */
  public createArenaReverb(buffer: Float32Array, decay: number, mix: number): Float32Array {
    const params: Partial<ReverbParams> = {
      decay: clamp(decay, 0.5, MAX_DECAY),
      preDelayMs: 45,
      mix: clamp(mix, 0, 1),
      earlyGain: 0.75,
      lateGain: 0.8,
      highDamping: 0.45,
      lowDamping: 0.15,
      roomSize: 0.9,
      diffusion: 0.75,
      modRate: 0.15,
      modDepth: 0.0008,
    };
    return this.processReverb(buffer, 'arena', params);
  }

  /**
   * 创建调制混响
   *
   * 在晚期尾音中加入 chorus 式调制，产生丰富流动的空间色彩。
   *
   * @param buffer - 输入单声道缓冲区
   * @param decay - 衰减时间 (秒)
   * @param mix - 干湿比 (0.0 ~ 1.0)
   * @param modRate - 调制速率 (Hz)
   * @param modDepth - 调制深度
   * @returns 输出缓冲区
   */
  public createModulatedReverb(
    buffer: Float32Array,
    decay: number,
    mix: number,
    modRate: number = DEFAULT_MOD_RATE,
    modDepth: number = DEFAULT_MOD_DEPTH
  ): Float32Array {
    const params: Partial<ReverbParams> = {
      decay: clamp(decay, 0.1, MAX_DECAY),
      preDelayMs: 20,
      mix: clamp(mix, 0, 1),
      earlyGain: 0.5,
      lateGain: 0.85,
      highDamping: 0.3,
      lowDamping: 0.1,
      roomSize: 0.6,
      diffusion: 0.9,
      modRate: clamp(modRate, 0.01, 10),
      modDepth: clamp(modDepth, 0, 0.02),
    };
    return this.processReverb(buffer, 'modulated', params);
  }

  /**
   * 创建反向混响
   *
   * 将输入缓冲反向后应用混响，再反转回来，产生吸气的膨胀感。
   *
   * @param buffer - 输入单声道缓冲区
   * @param decay - 衰减时间 (秒)
   * @param mix - 干湿比 (0.0 ~ 1.0)
   * @returns 输出缓冲区
   */
  public createReverseReverb(buffer: Float32Array, decay: number, mix: number): Float32Array {
    // 反转输入
    const reversed = new Float32Array(buffer.length);
    for (let i = 0; i < buffer.length; i++) {
      reversed[i] = buffer[buffer.length - 1 - i];
    }

    const params: Partial<ReverbParams> = {
      decay: clamp(decay, 0.5, MAX_DECAY),
      preDelayMs: 0,
      mix: 1.0,
      earlyGain: 0.3,
      lateGain: 1.0,
      highDamping: 0.2,
      lowDamping: 0.05,
      roomSize: 0.8,
      diffusion: 0.95,
      modRate: 0.1,
      modDepth: 0.0005,
    };

    const wetReversed = this.processReverb(reversed, 'reverse', params);
    // 再次反转回来
    const wet = new Float32Array(wetReversed.length);
    for (let i = 0; i < wetReversed.length; i++) {
      wet[i] = wetReversed[wetReversed.length - 1 - i];
    }

    // 干湿混合
    const m = clamp(mix, 0, 1);
    const output = new Float32Array(buffer.length);
    for (let i = 0; i < output.length; i++) {
      output[i] = buffer[i] * (1 - m) + wet[i] * m;
    }
    return output;
  }

  /**
   * 设置预延迟时间
   * @param ms - 毫秒数
   */
  public setPreDelay(ms: number): void {
    this.preDelayMs = clamp(ms, 0, MAX_PRE_DELAY_MS);
  }

  /**
   * 设置早期反射增益
   * @param gain - 增益 (0.0 ~ 1.0)
   */
  public setEarlyGain(gain: number): void {
    this.earlyGain = clamp(gain, 0, 1);
  }

  /**
   * 设置晚期尾音增益
   * @param gain - 增益 (0.0 ~ 1.0)
   */
  public setLateGain(gain: number): void {
    this.lateGain = clamp(gain, 0, 1);
  }

  /**
   * 设置高频阻尼
   * @param damping - 阻尼系数 (0.0 ~ 1.0)
   */
  public setHighDamping(damping: number): void {
    this.highDamping = clamp(damping, 0, 1);
  }

  /**
   * 设置低频阻尼
   * @param damping - 阻尼系数 (0.0 ~ 1.0)
   */
  public setLowDamping(damping: number): void {
    this.lowDamping = clamp(damping, 0, 1);
  }

  /**
   * 设置冻结状态
   * @param enabled - 是否冻结
   */
  public setFreeze(enabled: boolean): void {
    this.freeze = enabled;
  }

  /**
   * 获取内置空间预设列表
   * @returns 预设数组
   */
  public static getSpacePresets(): SpacePreset[] {
    return [
      {
        name: '小房间',
        type: 'room',
        params: { decay: 0.8, roomSize: 0.2, preDelayMs: 5, highDamping: 0.6, mix: 0.25 },
        description: '紧凑的小型房间，适合鼓组与近距离人声',
      },
      {
        name: '录音棚',
        type: 'room',
        params: { decay: 1.2, roomSize: 0.4, preDelayMs: 10, highDamping: 0.4, mix: 0.2 },
        description: '专业录音室的受控混响环境',
      },
      {
        name: '音乐厅',
        type: 'hall',
        params: { decay: 3.5, roomSize: 0.9, preDelayMs: 35, highDamping: 0.25, mix: 0.35 },
        description: '大型音乐厅的宏大空间感',
      },
      {
        name: '洞穴',
        type: 'hall',
        params: { decay: 6.0, roomSize: 1.0, preDelayMs: 80, highDamping: 0.5, lowDamping: 0.3, mix: 0.4 },
        description: '深邃洞穴的极长衰减与湿冷质感',
      },
      {
        name: '下水道',
        type: 'chamber',
        params: { decay: 4.5, roomSize: 0.6, preDelayMs: 50, highDamping: 0.6, lowDamping: 0.1, mix: 0.45 },
        description: '狭窄管道的金属反射与低频轰鸣',
      },
      {
        name: '外太空',
        type: 'modulated',
        params: { decay: 10.0, roomSize: 1.0, preDelayMs: 100, highDamping: 0.1, lowDamping: 0.0, mix: 0.6, modRate: 0.2, modDepth: 0.005 },
        description: '超现实真空空间感，极长调制尾音',
      },
      {
        name: '大教堂',
        type: 'cathedral',
        params: { decay: 8.0, preDelayMs: 60, highDamping: 0.2, mix: 0.5 },
        description: '哥特式大教堂的史诗级宏大混响',
      },
      {
        name: '竞技场',
        type: 'arena',
        params: { decay: 3.0, preDelayMs: 45, highDamping: 0.4, mix: 0.3 },
        description: '体育场的宽广反射与人群包围感',
      },
      {
        name: '密室',
        type: 'chamber',
        params: { decay: 2.0, preDelayMs: 12, highDamping: 0.3, mix: 0.3 },
        description: '木质密室的温暖亲密氛围',
      },
      {
        name: '金属板',
        type: 'plate',
        params: { decay: 2.5, preDelayMs: 15, highDamping: 0.35, mix: 0.35 },
        description: '经典板式混响的明亮密集尾音',
      },
    ];
  }

  // =============================================================================
  // 内部处理核心
  // =============================================================================

  /**
   * 通用混响处理流程
   */
  private processReverb(buffer: Float32Array, type: ReverbType, userParams: Partial<ReverbParams>): Float32Array {
    const params: ReverbParams = {
      decay: DEFAULT_DECAY,
      preDelayMs: DEFAULT_PRE_DELAY_MS,
      mix: 0.3,
      earlyGain: this.earlyGain,
      lateGain: this.lateGain,
      highDamping: this.highDamping,
      lowDamping: this.lowDamping,
      roomSize: 0.5,
      modRate: this.modRate,
      modDepth: this.modDepth,
      diffusion: 0.8,
      ...userParams,
    };

    // 1. 预延迟
    const preDelaySamples = Math.floor((params.preDelayMs / 1000) * this.sampleRate);
    const delayed = this.applyPreDelay(buffer, preDelaySamples);

    // 2. 早期反射
    const early = this.applyEarlyReflections(delayed, params.earlyGain, params.roomSize);

    // 3. 晚期尾音（施罗德网络）
    const late = this.applyLateReverb(delayed, params);

    // 4. 合并早期+晚期
    const wetLength = Math.max(early.length, late.length);
    const wet = new Float32Array(wetLength);
    for (let i = 0; i < wetLength; i++) {
      const e = i < early.length ? early[i] : 0;
      const l = i < late.length ? late[i] : 0;
      wet[i] = e * params.earlyGain + l * params.lateGain;
    }

    // 5. 干湿混合
    const outputLength = Math.max(buffer.length, wet.length);
    const output = new Float32Array(outputLength);
    const dryGain = 1.0 - params.mix;
    const wetGain = params.mix;
    for (let i = 0; i < outputLength; i++) {
      const dry = i < buffer.length ? buffer[i] : 0;
      const w = i < wet.length ? wet[i] : 0;
      output[i] = dry * dryGain + w * wetGain;
    }

    return output;
  }

  /**
   * 应用预延迟
   */
  private applyPreDelay(buffer: Float32Array, delaySamples: number): Float32Array {
    if (delaySamples <= 0) return new Float32Array(buffer);
    const out = new Float32Array(buffer.length + delaySamples);
    for (let i = 0; i < buffer.length; i++) {
      out[i + delaySamples] = buffer[i];
    }
    return out;
  }

  /**
   * 应用早期反射（多重延迟叠加）
   */
  private applyEarlyReflections(buffer: Float32Array, gain: number, roomSize: number): Float32Array {
    const out = new Float32Array(buffer.length);
    const sizeScale = 0.5 + roomSize * 1.5;
    for (let i = 0; i < this.earlyDelays.length; i++) {
      const delaySamples = Math.floor(this.earlyDelays[i] * sizeScale * this.sampleRate);
      const g = this.earlyGains[i] * gain;
      for (let j = 0; j < buffer.length; j++) {
        if (j + delaySamples < out.length) {
          out[j + delaySamples] += buffer[j] * g;
        }
      }
    }
    // 加入直达声
    for (let i = 0; i < buffer.length; i++) {
      out[i] += buffer[i] * 0.5;
    }
    return out;
  }

  /**
   * 应用晚期尾音（施罗德混响网络）
   */
  private applyLateReverb(buffer: Float32Array, params: ReverbParams): Float32Array {
    // 梳状滤波器延迟时间（基于房间尺寸缩放）
    const roomScale = 0.5 + params.roomSize * 1.5;
    const combDelays = [
      Math.floor(0.0297 * roomScale * this.sampleRate),
      Math.floor(0.0371 * roomScale * this.sampleRate),
      Math.floor(0.0411 * roomScale * this.sampleRate),
      Math.floor(0.0437 * roomScale * this.sampleRate),
      Math.floor(0.0509 * roomScale * this.sampleRate),
      Math.floor(0.0533 * roomScale * this.sampleRate),
      Math.floor(0.0597 * roomScale * this.sampleRate),
      Math.floor(0.0619 * roomScale * this.sampleRate),
    ];

    // 计算反馈系数以匹配目标衰减时间
    // T60 = -3 * delay / log10(feedback)
    const getFeedback = (delaySamples: number) => {
      const delaySec = delaySamples / this.sampleRate;
      if (params.decay <= 0) return 0;
      return Math.pow(10, (-3 * delaySec) / params.decay);
    };

    // 初始化梳状滤波器
    const combs: CombState[] = combDelays.map((d) => ({
      buffer: new Float32Array(d),
      index: 0,
      feedback: getFeedback(d),
      filterStore: 0,
      damp1: params.highDamping,
      damp2: 1 - params.highDamping,
    }));

    // 全通滤波器延迟时间
    const allpassDelays = [
      Math.floor(0.005 * roomScale * this.sampleRate),
      Math.floor(0.010 * roomScale * this.sampleRate),
      Math.floor(0.015 * roomScale * this.sampleRate),
      Math.floor(0.020 * roomScale * this.sampleRate),
    ];

    const allpasses: AllPassState[] = allpassDelays.map((d) => ({
      buffer: new Float32Array(d),
      index: 0,
    }));

    const outputLength = buffer.length + Math.floor(params.decay * this.sampleRate * 2);
    const output = new Float32Array(outputLength);

    // 处理输入
    for (let i = 0; i < outputLength; i++) {
      const input = i < buffer.length ? buffer[i] : 0;
      let combSum = 0;

      // 梳状滤波器组
      for (const comb of combs) {
        const delayed = comb.buffer[comb.index];
        // 低通滤波器在反馈回路中（阻尼）
        comb.filterStore = delayed * comb.damp2 + comb.filterStore * comb.damp1;
        const feedback = this.freeze ? 0.999 : comb.feedback;
        const newSample = input + comb.filterStore * feedback;
        comb.buffer[comb.index] = newSample;
        comb.index = (comb.index + 1) % comb.buffer.length;
        combSum += delayed;
      }
      combSum /= combs.length;

      // 全通滤波器组
      let sample = combSum;
      for (const ap of allpasses) {
        const delayed = ap.buffer[ap.index];
        const feedforward = sample - delayed * 0.5;
        ap.buffer[ap.index] = sample + delayed * 0.5;
        ap.index = (ap.index + 1) % ap.buffer.length;
        sample = feedforward;
      }

      // 低频阻尼（一阶高通近似）
      // 简单实现：衰减极低频能量
      if (params.lowDamping > 0) {
        const lowFreqAtten = 1.0 - params.lowDamping * 0.3;
        sample *= lowFreqAtten;
      }

      // 调制效果（LFO 调制延迟线读取位置）
      if (params.modRate > 0 && params.modDepth > 0) {
        this.modPhase += (params.modRate * 2 * Math.PI) / this.sampleRate;
        const mod = Math.sin(this.modPhase) * params.modDepth * this.sampleRate;
        // 对最终输出施加轻微振幅调制作为近似
        sample *= 1.0 + Math.sin(this.modPhase) * 0.02;
      }

      output[i] = sample;
    }

    // 根据扩散度进行额外扩散处理
    if (params.diffusion > 0.5) {
      this.diffuseOutput(output, params.diffusion);
    }

    return output;
  }

  /**
   * 对输出进行额外扩散平滑
   */
  private diffuseOutput(buffer: Float32Array, diffusion: number): void {
    const amount = (diffusion - 0.5) * 0.3;
    let prev = 0;
    for (let i = 0; i < buffer.length; i++) {
      const curr = buffer[i];
      buffer[i] = curr + prev * amount;
      prev = curr;
    }
  }
}

// =============================================================================
// ConvolutionReverb 类
// =============================================================================

/**
 * 卷积混响
 *
 * 通过加载脉冲响应（IR）文件或数据，实现真实空间的高精度模拟。
 * 支持立体声 IR、长度裁剪与预延迟偏移。
 *
 * @class ConvolutionReverb
 * @example
 * ```ts
 * const conv = new ConvolutionReverb();
 * conv.loadImpulseResponse(irData, 44100);
 * const wet = conv.process(dryBuffer);
 * ```
 */
export class ConvolutionReverb {
  /** 当前脉冲响应 */
  public ir: ImpulseResponse | null;
  /** 采样率 */
  public sampleRate: number;
  /** 预延迟（采样点） */
  public preDelaySamples: number;
  /** 干湿比 */
  public mix: number;
  /** IR 增益补偿 */
  public irGain: number;

  constructor(sampleRate: number = SAMPLE_RATE) {
    this.ir = null;
    this.sampleRate = sampleRate;
    this.preDelaySamples = 0;
    this.mix = 0.3;
    this.irGain = 1.0;
  }

  /**
   * 加载脉冲响应数据
   * @param left - 左声道 IR 数据
   * @param right - 右声道 IR 数据（可选，单声道则传入 null）
   * @param sampleRate - IR 采样率
   */
  public loadImpulseResponse(left: Float32Array, right: Float32Array | null, sampleRate: number): void {
    this.ir = {
      sampleRate,
      left: new Float32Array(left),
      right: right ? new Float32Array(right) : new Float32Array(left),
      duration: left.length / sampleRate,
    };
    // 自动增益补偿
    this.irGain = this.calculateIRGain();
  }

  /**
   * 从单声道 IR 加载
   * @param monoIR - 单声道 IR 数据
   * @param sampleRate - 采样率
   */
  public loadMonoImpulseResponse(monoIR: Float32Array, sampleRate: number): void {
    this.loadImpulseResponse(monoIR, null, sampleRate);
  }

  /**
   * 处理单声道输入（返回单声道）
   * @param input - 输入缓冲区
   * @returns 输出缓冲区
   */
  public process(input: Float32Array): Float32Array {
    if (!this.ir) {
      return new Float32Array(input);
    }

    const irL = this.ir.left;
    const outputLength = input.length + irL.length + this.preDelaySamples - 1;
    const wet = new Float32Array(outputLength);

    // 时域卷积（直接计算，适用于短 IR）
    // 对于长 IR 应使用 FFT 快速卷积，此处提供基础实现
    if (irL.length <= 2048) {
      this.convolveTimeDomain(input, irL, wet);
    } else {
      this.convolveFFT(input, irL, wet);
    }

    // 应用预延迟与增益
    if (this.preDelaySamples > 0) {
      const delayed = new Float32Array(wet.length + this.preDelaySamples);
      for (let i = 0; i < wet.length; i++) {
        delayed[i + this.preDelaySamples] = wet[i] * this.irGain;
      }
      return this.mixDryWet(input, delayed);
    }

    for (let i = 0; i < wet.length; i++) {
      wet[i] *= this.irGain;
    }
    return this.mixDryWet(input, wet);
  }

  /**
   * 处理立体声输入
   * @param left - 左声道输入
   * @param right - 右声道输入
   * @returns 立体声输出对象 {left, right}
   */
  public processStereo(left: Float32Array, right: Float32Array): { left: Float32Array; right: Float32Array } {
    if (!this.ir) {
      return { left: new Float32Array(left), right: new Float32Array(right) };
    }
    const wetL = this.process(left);
    const wetR = this.process(right);
    return { left: wetL, right: wetR };
  }

  /**
   * 设置预延迟
   * @param ms - 毫秒数
   */
  public setPreDelay(ms: number): void {
    this.preDelaySamples = Math.floor((clamp(ms, 0, MAX_PRE_DELAY_MS) / 1000) * this.sampleRate);
  }

  /**
   * 设置干湿比
   * @param mix - 湿信号比例 (0.0 ~ 1.0)
   */
  public setMix(mix: number): void {
    this.mix = clamp(mix, 0, 1);
  }

  /**
   * 裁剪 IR 长度
   * @param maxLengthSeconds - 最大长度（秒）
   */
  public trimImpulseResponse(maxLengthSeconds: number): void {
    if (!this.ir) return;
    const maxSamples = Math.floor(maxLengthSeconds * this.ir.sampleRate);
    if (this.ir.left.length > maxSamples) {
      this.ir.left = this.ir.left.slice(0, maxSamples);
      this.ir.right = this.ir.right.slice(0, maxSamples);
      this.ir.duration = maxLengthSeconds;
    }
  }

  /**
   * 时域直接卷积
   */
  private convolveTimeDomain(input: Float32Array, ir: Float32Array, output: Float32Array): void {
    for (let i = 0; i < input.length; i++) {
      const s = input[i];
      if (s === 0) continue;
      for (let j = 0; j < ir.length; j++) {
        output[i + j] += s * ir[j];
      }
    }
  }

  /**
   * 基于 FFT 的快速重叠相加卷积
   */
  private convolveFFT(input: Float32Array, ir: Float32Array, output: Float32Array): void {
    const n = input.length + ir.length - 1;
    // 找到不小于 n 的最小 2 的幂
    let fftSize = 1;
    while (fftSize < n) fftSize <<= 1;

    const realA = new Float32Array(fftSize);
    const imagA = new Float32Array(fftSize);
    const realB = new Float32Array(fftSize);
    const imagB = new Float32Array(fftSize);

    for (let i = 0; i < input.length; i++) realA[i] = input[i];
    for (let i = 0; i < ir.length; i++) realB[i] = ir[i];

    fft(realA, imagA, false);
    fft(realB, imagB, false);

    const realOut = new Float32Array(fftSize);
    const imagOut = new Float32Array(fftSize);

    for (let i = 0; i < fftSize; i++) {
      realOut[i] = realA[i] * realB[i] - imagA[i] * imagB[i];
      imagOut[i] = realA[i] * imagB[i] + imagA[i] * realB[i];
    }

    fft(realOut, imagOut, true);

    for (let i = 0; i < output.length && i < realOut.length; i++) {
      output[i] = realOut[i];
    }
  }

  /**
   * 计算 IR 增益补偿（防止输出过大）
   */
  private calculateIRGain(): number {
    if (!this.ir) return 1.0;
    let sum = 0;
    for (let i = 0; i < this.ir.left.length; i++) {
      sum += Math.abs(this.ir.left[i]);
    }
    const avg = sum / this.ir.left.length;
    if (avg < 1e-10) return 1.0;
    return clamp(1.0 / (avg * 10), 0.01, 10.0);
  }

  /**
   * 干湿混合
   */
  private mixDryWet(dry: Float32Array, wet: Float32Array): Float32Array {
    const len = Math.max(dry.length, wet.length);
    const out = new Float32Array(len);
    const dryGain = 1.0 - this.mix;
    const wetGain = this.mix;
    for (let i = 0; i < len; i++) {
      const d = i < dry.length ? dry[i] : 0;
      const w = i < wet.length ? wet[i] : 0;
      out[i] = d * dryGain + w * wetGain;
    }
    return out;
  }
}

// =============================================================================
// AllPassReverb 类
// =============================================================================

/**
 * 基于全通滤波器的施罗德混响
 *
 * 经典施罗德混响结构：并联梳状滤波器 + 串联全通滤波器。
 * 提供轻量级、低延迟的混响实现，适合实时处理。
 *
 * @class AllPassReverb
 * @example
 * ```ts
 * const apr = new AllPassReverb();
 * apr.setDecay(2.0);
 * apr.setRoomSize(0.7);
 * const wet = apr.processBlock(dryBuffer);
 * ```
 */
export class AllPassReverb {
  /** 采样率 */
  public sampleRate: number;
  /** 衰减时间 (秒) */
  public decay: number;
  /** 房间尺寸 (0.0 ~ 1.0) */
  public roomSize: number;
  /** 干湿比 (0.0 ~ 1.0) */
  public mix: number;
  /** 扩散度 (0.0 ~ 1.0) */
  public diffusion: number;
  /** 梳状滤波器状态 */
  private combs: CombState[];
  /** 全通滤波器状态 */
  private allpasses: AllPassState[];
  /** 输入历史（用于冻结） */
  private inputHistory: Float32Array;
  /** 历史索引 */
  private historyIndex: number;
  /** 冻结标志 */
  private freezeEnabled: boolean;

  constructor(sampleRate: number = SAMPLE_RATE) {
    this.sampleRate = sampleRate;
    this.decay = 2.0;
    this.roomSize = 0.5;
    this.mix = 0.3;
    this.diffusion = 0.8;
    this.freezeEnabled = false;
    this.inputHistory = new Float32Array(sampleRate * 2);
    this.historyIndex = 0;
    this.combs = [];
    this.allpasses = [];
    this.initFilters();
  }

  /**
   * 设置衰减时间
   * @param decay - 秒
   */
  public setDecay(decay: number): void {
    this.decay = clamp(decay, 0.1, MAX_DECAY);
    this.updateCombFeedback();
  }

  /**
   * 设置房间尺寸
   * @param size - (0.0 ~ 1.0)
   */
  public setRoomSize(size: number): void {
    this.roomSize = clamp(size, 0, 1);
    this.initFilters();
  }

  /**
   * 设置干湿比
   * @param mix - (0.0 ~ 1.0)
   */
  public setMix(mix: number): void {
    this.mix = clamp(mix, 0, 1);
  }

  /**
   * 设置扩散度
   * @param diffusion - (0.0 ~ 1.0)
   */
  public setDiffusion(diffusion: number): void {
    this.diffusion = clamp(diffusion, 0, 1);
  }

  /**
   * 设置冻结状态
   * @param enabled - 是否冻结
   */
  public setFreeze(enabled: boolean): void {
    this.freezeEnabled = enabled;
    if (enabled) {
      // 冻结时设置反馈接近 1
      for (const comb of this.combs) {
        comb.feedback = 0.999;
      }
    } else {
      this.updateCombFeedback();
    }
  }

  /**
   * 处理单个样本
   * @param input - 输入样本
   * @returns 输出样本
   */
  public processSample(input: number): number {
    let combSum = 0;
    for (const comb of this.combs) {
      const delayed = comb.buffer[comb.index];
      comb.filterStore = delayed * (1 - 0.3) + comb.filterStore * 0.3;
      const fb = this.freezeEnabled ? 0.999 : comb.feedback;
      const newSample = input + comb.filterStore * fb;
      comb.buffer[comb.index] = newSample;
      comb.index = (comb.index + 1) % comb.buffer.length;
      combSum += delayed;
    }
    let sample = combSum / this.combs.length;

    for (const ap of this.allpasses) {
      const delayed = ap.buffer[ap.index];
      const out = -sample + delayed;
      ap.buffer[ap.index] = input + delayed * 0.5;
      ap.index = (ap.index + 1) % ap.buffer.length;
      sample = out;
    }

    return input * (1 - this.mix) + sample * this.mix;
  }

  /**
   * 处理整个缓冲区
   * @param input - 输入缓冲区
   * @returns 输出缓冲区
   */
  public processBlock(input: Float32Array): Float32Array {
    const output = new Float32Array(input.length);
    for (let i = 0; i < input.length; i++) {
      output[i] = this.processSample(input[i]);
    }
    return output;
  }

  /**
   * 重置内部状态
   */
  public reset(): void {
    this.initFilters();
    this.historyIndex = 0;
    this.inputHistory.fill(0);
  }

  /**
   * 初始化滤波器
   */
  private initFilters(): void {
    const scale = 0.5 + this.roomSize * 1.5;
    const combDelays = [
      Math.floor(0.0297 * scale * this.sampleRate),
      Math.floor(0.0371 * scale * this.sampleRate),
      Math.floor(0.0411 * scale * this.sampleRate),
      Math.floor(0.0437 * scale * this.sampleRate),
      Math.floor(0.0509 * scale * this.sampleRate),
      Math.floor(0.0533 * scale * this.sampleRate),
      Math.floor(0.0597 * scale * this.sampleRate),
      Math.floor(0.0619 * scale * this.sampleRate),
    ];

    this.combs = combDelays.map((d) => ({
      buffer: new Float32Array(Math.max(1, d)),
      index: 0,
      feedback: 0,
      filterStore: 0,
      damp1: 0.3,
      damp2: 0.7,
    }));
    this.updateCombFeedback();

    const allpassDelays = [
      Math.floor(0.005 * scale * this.sampleRate),
      Math.floor(0.010 * scale * this.sampleRate),
      Math.floor(0.015 * scale * this.sampleRate),
      Math.floor(0.020 * scale * this.sampleRate),
    ];

    this.allpasses = allpassDelays.map((d) => ({
      buffer: new Float32Array(Math.max(1, d)),
      index: 0,
    }));
  }

  /**
   * 更新梳状滤波器反馈系数
   */
  private updateCombFeedback(): void {
    for (const comb of this.combs) {
      const delaySec = comb.buffer.length / this.sampleRate;
      if (this.decay > 0) {
        comb.feedback = Math.pow(10, (-3 * delaySec) / this.decay);
      } else {
        comb.feedback = 0;
      }
    }
  }
}

// =============================================================================
// 工具函数
// =============================================================================

/**
 * 计算混响尾音长度（基于衰减时间与阈值）
 * @param decay - T60 衰减时间 (秒)
 * @param thresholdDb - 阈值 (dB)，默认 -60
 * @returns 尾音长度 (秒)
 */
export function calculateTailLength(decay: number, thresholdDb: number = TAIL_THRESHOLD_DB): number {
  // T60 定义：衰减 60dB 的时间
  // 对于任意阈值，时间 = decay * (thresholdDb / -60)
  return decay * (Math.abs(thresholdDb) / 60);
}

/**
 * 生成白噪声脉冲（用于测试 IR）
 * @param sampleRate - 采样率
 * @param duration - 持续时间 (秒)
 * @returns 白噪声缓冲区
 */
export function generateWhiteNoiseImpulse(sampleRate: number, duration: number): Float32Array {
  const samples = Math.floor(duration * sampleRate);
  const buffer = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    buffer[i] = Math.random() * 2 - 1;
  }
  // 应用指数衰减
  const decayFactor = 5.0 / duration;
  for (let i = 0; i < samples; i++) {
    buffer[i] *= Math.exp(-i / sampleRate * decayFactor);
  }
  return buffer;
}

/**
 * 测量缓冲区 RT60 衰减时间
 * @param buffer - 单声道缓冲区（应为脉冲响应）
 * @param sampleRate - 采样率
 * @returns RT60 估算值 (秒)
 */
export function estimateRT60(buffer: Float32Array, sampleRate: number): number {
  // 找到峰值
  let peak = 0;
  let peakIndex = 0;
  for (let i = 0; i < buffer.length; i++) {
    const abs = Math.abs(buffer[i]);
    if (abs > peak) {
      peak = abs;
      peakIndex = i;
    }
  }
  if (peak < 1e-10) return 0;

  // 找到衰减 60dB 的位置
  const threshold = peak * 0.001;
  let endIndex = buffer.length - 1;
  for (let i = peakIndex; i < buffer.length; i++) {
    if (Math.abs(buffer[i]) < threshold) {
      endIndex = i;
      break;
    }
  }

  return (endIndex - peakIndex) / sampleRate;
}

/**
 * 对 IR 进行高低频阻尼预处理
 * @param ir - 脉冲响应缓冲区
 * @param highDamping - 高频阻尼 (0~1)
 * @param lowDamping - 低频阻尼 (0~1)
 * @param sampleRate - 采样率
 * @returns 处理后缓冲区
 */
export function dampenImpulseResponse(
  ir: Float32Array,
  highDamping: number,
  lowDamping: number,
  sampleRate: number
): Float32Array {
  const out = new Float32Array(ir.length);
  // 简单一阶 IIR 低通（高频阻尼）与高通（低频阻尼）近似
  let lowpassState = 0;
  let highpassState = 0;
  const lowpassCoef = 1.0 - highDamping * 0.5;
  const highpassCoef = lowDamping * 0.3;

  for (let i = 0; i < ir.length; i++) {
    lowpassState = lowpassState * (1 - lowpassCoef) + ir[i] * lowpassCoef;
    highpassState = highpassState * (1 - highpassCoef) + lowpassState * highpassCoef;
    out[i] = lowpassState - highpassState;
  }
  return out;
}

/**
 * 将单声道 IR 转换为立体声（通过轻微延迟差）
 * @param monoIR - 单声道 IR
 * @param delayDifferenceMs - 左右延迟差 (毫秒)
 * @param sampleRate - 采样率
 * @returns 立体声 IR 对象
 */
export function monoToStereoIR(
  monoIR: Float32Array,
  delayDifferenceMs: number,
  sampleRate: number
): { left: Float32Array; right: Float32Array } {
  const delaySamples = Math.floor((delayDifferenceMs / 1000) * sampleRate);
  const left = new Float32Array(monoIR.length + delaySamples);
  const right = new Float32Array(monoIR.length + delaySamples);

  for (let i = 0; i < monoIR.length; i++) {
    left[i] = monoIR[i];
    right[i + delaySamples] = monoIR[i];
  }

  return { left, right };
}

/**
 * 生成合成脉冲响应（用于快速测试）
 * @param type - 空间类型
 * @param duration - 持续时间 (秒)
 * @param sampleRate - 采样率
 * @returns IR 缓冲区
 */
export function generateSyntheticIR(type: ReverbType, duration: number, sampleRate: number): Float32Array {
  const samples = Math.floor(duration * sampleRate);
  const ir = new Float32Array(samples);

  // 根据类型调整衰减特性
  const decayMap: Record<ReverbType, number> = {
    plate: 3.0,
    spring: 1.5,
    hall: 4.0,
    room: 1.0,
    cathedral: 8.0,
    chamber: 2.0,
    arena: 3.5,
    modulated: 4.0,
    reverse: 2.0,
  };
  const baseDecay = decayMap[type] ?? 2.0;
  const decayFactor = 3.0 / baseDecay;

  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    const envelope = Math.exp(-t * decayFactor);
    // 加入随机反射
    const reflection = Math.sin(2 * Math.PI * 100 * t) * Math.exp(-t * 2);
    ir[i] = (Math.random() * 2 - 1) * envelope * 0.5 + reflection * envelope * 0.3;
  }

  return ir;
}

// =============================================================================
// 预设快捷函数
// =============================================================================

/**
 * 快速应用小房间混响
 * @param buffer - 输入缓冲区
 * @param mix - 干湿比
 * @returns 输出缓冲区
 */
export function quickRoomReverb(buffer: Float32Array, mix: number = 0.2): Float32Array {
  const engine = new ReverbEngine();
  return engine.createRoomReverb(buffer, 0.8, 0.2, mix);
}

/**
 * 快速应用大厅混响
 * @param buffer - 输入缓冲区
 * @param mix - 干湿比
 * @returns 输出缓冲区
 */
export function quickHallReverb(buffer: Float32Array, mix: number = 0.3): Float32Array {
  const engine = new ReverbEngine();
  return engine.createHallReverb(buffer, 3.5, 0.9, mix);
}

/**
 * 快速应用板式混响
 * @param buffer - 输入缓冲区
 * @param mix - 干湿比
 * @returns 输出缓冲区
 */
export function quickPlateReverb(buffer: Float32Array, mix: number = 0.25): Float32Array {
  const engine = new ReverbEngine();
  return engine.createPlateReverb(buffer, 2.5, 0.4, mix);
}

// =============================================================================
// 默认导出
// =============================================================================

export default {
  ReverbEngine,
  ConvolutionReverb,
  AllPassReverb,
  calculateTailLength,
  generateWhiteNoiseImpulse,
  estimateRT60,
  dampenImpulseResponse,
  monoToStereoIR,
  generateSyntheticIR,
  quickRoomReverb,
  quickHallReverb,
  quickPlateReverb,
};
