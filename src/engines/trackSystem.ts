/**
 * @fileoverview 青鸾数字音频工作站 - 专业多轨混音台系统
 * @description 实现完整的轨道管理、混音引擎、总线处理、效果发送、自动化控制与响度计量
 * @version 2.0.0
 * @author 青鸾音频引擎团队
 */

import {
  clamp,
  lerp,
  smoothstep,
  dbToGain,
  gainToDb,
  panToGain,
  normalizeBuffer,
} from '../utils/audioUtils.js';

// ═══════════════════════════════════════════════════════════════
// 全局常量与配置
// ═══════════════════════════════════════════════════════════════

/** 系统统一采样率 (Hz) */
export const SAMPLE_RATE = 44100;

/** 最大轨道数量 */
export const MAX_TRACKS = 256;

/** 最大总线数量 */
export const MAX_BUSES = 64;

/** 最大发送效果数量 */
export const MAX_SENDS = 128;

/** 默认轨道音量 (dB) */
export const DEFAULT_TRACK_VOLUME_DB = 0.0;

/** 最大轨道音量 (dB) */
export const MAX_TRACK_VOLUME_DB = 12.0;

/** 最小轨道音量 (dB) */
export const MIN_TRACK_VOLUME_DB = -96.0;

/** 默认声像位置 */
export const DEFAULT_PAN = 0.0;

/** 主输出峰值限制阈值 */
export const MASTER_LIMITER_THRESHOLD = 0.98;

/** 响度表积分时间 (ms) */
export const LOUDNESS_INTEGRATION_MS = 400;

/** VU 表响应时间常数 (ms) */
export const VU_RESPONSE_MS = 300;

/** Peak 表保持时间 (ms) */
export const PEAK_HOLD_MS = 1500;

/** 自动化点平滑插值精度 */
export const AUTOMATION_PRECISION = 64;

// ═══════════════════════════════════════════════════════════════
// 核心类型定义
// ═══════════════════════════════════════════════════════════════

/**
 * 轨道类型枚举
 * - audio: 音频轨道，用于录制和播放音频素材
 * - midi: MIDI 轨道，用于存储和播放 MIDI 事件
 * - bus: 编组总线，用于将多个轨道汇总
 * - send: 发送轨道，用于效果发送路由
 * - master: 主总线，最终输出
 */
export type TrackType = 'audio' | 'midi' | 'bus' | 'send' | 'master';

/**
 * 轨道状态枚举
 */
export type TrackState = 'idle' | 'recording' | 'playing' | 'armed' | 'disabled';

/**
 * 自动化插值类型
 */
export type AutomationCurve = 'linear' | 'logarithmic' | 'exponential' | 'step' | 'sine' | 'smooth';

/**
 * 计量表类型
 */
export type MeterType = 'vu' | 'peak' | 'rms' | 'lufs';

/**
 * 限制器模式
 */
export type LimiterMode = 'soft' | 'hard' | 'brickwall';

/**
 * 轨道均衡器频段配置
 */
export interface EQBand {
  /** 频段频率 (Hz) */
  frequency: number;
  /** 增益 (dB) */
  gain: number;
  /** Q 值 */
  q: number;
  /** 滤波器类型 */
  type: 'lowpass' | 'highpass' | 'bandpass' | 'notch' | 'peaking' | 'lowshelf' | 'highshelf';
  /** 是否启用 */
  enabled: boolean;
}

/**
 * 单点自动化数据
 */
export interface AutomationPoint {
  /** 时间点 (秒) */
  time: number;
  /** 参数值 */
  value: number;
  /** 插值曲线类型 */
  curve: AutomationCurve;
  /** 曲线张力 (0-1) */
  tension?: number;
}

/**
 * 自动化参数轨道
 */
export interface AutomationLane {
  /** 参数名称 */
  parameter: string;
  /** 自动化点序列 */
  points: AutomationPoint[];
  /** 是否启用 */
  enabled: boolean;
  /** 默认值 */
  defaultValue: number;
}

/**
 * 音频片段引用
 */
export interface AudioClip {
  /** 片段唯一标识 */
  id: string;
  /** 开始时间 (秒) */
  startTime: number;
  /** 持续时间 (秒) */
  duration: number;
  /** 音频缓冲区 (左声道) */
  bufferL: Float32Array;
  /** 音频缓冲区 (右声道) */
  bufferR: Float32Array;
  /** 淡入时间 (秒) */
  fadeIn: number;
  /** 淡出时间 (秒) */
  fadeOut: number;
  /** 播放速率 */
  playbackRate: number;
  /** 是否静音 */
  muted: boolean;
}

/**
 * MIDI 事件
 */
export interface MidiEvent {
  /** 时间戳 (秒) */
  time: number;
  /** 事件类型 */
  type: 'noteOn' | 'noteOff' | 'controlChange' | 'pitchBend';
  /** 通道号 (0-15) */
  channel: number;
  /** 音符编号或控制器编号 */
  note: number;
  /** 力度值或控制器值 */
  velocity: number;
  /** 持续时间 (仅 noteOn) */
  duration?: number;
}

/**
 * 轨道配置接口
 */
export interface TrackConfig {
  /** 轨道名称 */
  name: string;
  /** 轨道类型 */
  type: TrackType;
  /** 初始音量 (dB) */
  volumeDb?: number;
  /** 初始声像位置 (-1 ~ 1) */
  pan?: number;
  /** 是否静音 */
  muted?: boolean;
  /** 是否独奏 */
  soloed?: boolean;
  /** 是否预备录音 */
  armed?: boolean;
  /** 输入增益 (dB) */
  inputGainDb?: number;
  /** 相位反转 */
  phaseInverted?: boolean;
  /** 通道数 (1=单声道, 2=立体声) */
  channels?: number;
  /** 初始颜色 */
  color?: string;
  /** 均衡器配置 */
  eq?: EQBand[];
  /** 默认 MIDI 乐器编号 */
  midiInstrument?: number;
}

/**
 * 计量表数据
 */
export interface MeterData {
  /** VU 表当前值 (dB) */
  vuDb: number;
  /** 峰值当前值 (dB) */
  peakDb: number;
  /** RMS 值 (dB) */
  rmsDb: number;
  /** LUFS 短期响度 */
  lufsShort: number;
  /** LUFS 综合响度 */
  lufsIntegrated: number;
  /** 真实峰值 (dBTP) */
  truePeakDb: number;
  /** 峰值保持值 (dB) */
  peakHoldDb: number;
  /** 左声道数据 */
  left: {
    vuDb: number;
    peakDb: number;
    rmsDb: number;
  };
  /** 右声道数据 */
  right: {
    vuDb: number;
    peakDb: number;
    rmsDb: number;
  };
  /** 更新时间戳 */
  timestamp: number;
}

/**
 * 混音统计信息
 */
export interface MixStats {
  /** 总轨道数 */
  totalTracks: number;
  /** 总时长 (秒) */
  duration: number;
  /** 采样率 */
  sampleRate: number;
  /** 峰值电平 (dB) */
  peakLevelDb: number;
  /** RMS 电平 (dB) */
  rmsLevelDb: number;
  /** 综合响度 (LUFS) */
  integratedLufs: number;
  /** 动态范围 (LU) */
  dynamicRange: number;
  /** 最大真实峰值 (dBTP) */
  maxTruePeakDb: number;
  /** 直流偏移 */
  dcOffset: number;
  /** 是否削波 */
  clipped: boolean;
  /** 削波样本数 */
  clippedSamples: number;
}

/**
 * 发送配置
 */
export interface SendConfig {
  /** 发送轨道 ID */
  fromTrackId: string;
  /** 目标总线 ID */
  toBusId: string;
  /** 发送量 (0-1) */
  amount: number;
  /** 发送前/后推子 */
  preFader: boolean;
  /** 是否启用 */
  enabled: boolean;
}

// ═══════════════════════════════════════════════════════════════
// 辅助工具函数
// ═══════════════════════════════════════════════════════════════

/**
 * 生成唯一标识符
 * @returns UUID v4 格式字符串
 */
function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * 线性分贝插值
 * @param db1 起始 dB 值
 * @param db2 结束 dB 值
 * @param t 插值系数 0-1
 * @returns 插值后的线性增益
 */
function interpolateDb(db1: number, db2: number, t: number): number {
  const g1 = dbToGain(db1);
  const g2 = dbToGain(db2);
  return lerp(g1, g2, t);
}

/**
 * 指数平滑滤波器 (用于 VU 表)
 * @param current 当前值
 * @param target 目标值
 * @param timeMs 响应时间 (ms)
 * @param sampleRate 采样率
 * @returns 平滑后的值
 */
function exponentialSmooth(
  current: number,
  target: number,
  timeMs: number,
  sampleRate: number
): number {
  const coeff = Math.exp(-1 / ((timeMs / 1000) * sampleRate));
  return current * coeff + target * (1 - coeff);
}

/**
 * 计算 RMS 值
 * @param buffer 音频缓冲区
 * @param start 起始索引
 * @param length 长度
 * @returns RMS 值 (线性)
 */
function calculateRMS(buffer: Float32Array, start: number = 0, length?: number): number {
  const len = length ?? buffer.length - start;
  if (len <= 0) return 0;
  let sum = 0;
  for (let i = 0; i < len; i++) {
    const s = buffer[start + i];
    sum += s * s;
  }
  return Math.sqrt(sum / len);
}

/**
 * 计算真实峰值 (4x 过采样近似)
 * @param buffer 音频缓冲区
 * @returns 真实峰值 (线性)
 */
function calculateTruePeak(buffer: Float32Array): number {
  let max = 0;
  for (let i = 0; i < buffer.length; i++) {
    const abs = Math.abs(buffer[i]);
    if (abs > max) max = abs;
  }
  // 简化真实峰值估计：最大峰值 * 1.15 (典型过采样增益)
  return max * 1.15;
}

/**
 * 计算直流偏移
 * @param buffer 音频缓冲区
 * @returns 直流偏移量
 */
function calculateDCOffset(buffer: Float32Array): number {
  if (buffer.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) {
    sum += buffer[i];
  }
  return sum / buffer.length;
}

/**
 * 查找自动化段索引
 * @param points 自动化点数组
 * @param time 目标时间
 * @returns 包含目标时间的段索引 [leftIndex, rightIndex]
 */
function findAutomationSegment(points: AutomationPoint[], time: number): [number, number] {
  if (points.length === 0) return [-1, -1];
  if (time <= points[0].time) return [0, 0];
  if (time >= points[points.length - 1].time) return [points.length - 1, points.length - 1];

  for (let i = 0; i < points.length - 1; i++) {
    if (time >= points[i].time && time < points[i + 1].time) {
      return [i, i + 1];
    }
  }
  return [points.length - 1, points.length - 1];
}

/**
 * 评估自动化曲线值
 * @param lane 自动化轨道
 * @param time 目标时间
 * @returns 插值后的参数值
 */
function evaluateAutomation(lane: AutomationLane, time: number): number {
  if (!lane.enabled || lane.points.length === 0) {
    return lane.defaultValue;
  }

  const [leftIdx, rightIdx] = findAutomationSegment(lane.points, time);

  if (leftIdx === rightIdx) {
    return lane.points[leftIdx].value;
  }

  const p1 = lane.points[leftIdx];
  const p2 = lane.points[rightIdx];
  const duration = p2.time - p1.time;

  if (duration <= 0) return p1.value;

  const t = (time - p1.time) / duration;
  const tension = p1.tension ?? 0.5;

  switch (p1.curve) {
    case 'step':
      return p1.value;
    case 'linear':
      return lerp(p1.value, p2.value, t);
    case 'logarithmic':
      return lerp(p1.value, p2.value, Math.log10(1 + t * 9) / Math.log10(10));
    case 'exponential':
      return lerp(p1.value, p2.value, t * t);
    case 'sine':
      return lerp(p1.value, p2.value, (1 - Math.cos(t * Math.PI)) / 2);
    case 'smooth':
      return lerp(p1.value, p2.value, smoothstep(0, 1, t));
    default:
      return lerp(p1.value, p2.value, t);
  }
}

/**
 * 简单二阶状态变量滤波器 (用于 EQ)
 * @param input 输入样本
 * @param state 滤波器状态 [low, band, high]
 * @param freq 截止频率
 * @param q Q 值
 * @param sampleRate 采样率
 * @param type 滤波器类型
 * @returns 滤波器输出
 */
function svfFilter(
  input: number,
  state: { low: number; band: number; high: number },
  freq: number,
  q: number,
  sampleRate: number,
  type: EQBand['type']
): number {
  const f = 2 * Math.sin(Math.PI * freq / sampleRate);
  const fb = q;

  state.low += f * state.band;
  const high = input - state.low - fb * state.band;
  state.band += f * high;

  switch (type) {
    case 'lowpass':
      return state.low;
    case 'highpass':
      return high;
    case 'bandpass':
      return state.band;
    case 'notch':
      return state.low + high;
    default:
      return input;
  }
}

// ═══════════════════════════════════════════════════════════════
// Track 类 - 单个轨道
// ═══════════════════════════════════════════════════════════════

/**
 * 音频/MIDI 轨道类
 * 代表混音台中的一条轨道，包含所有参数、状态、片段和自动化数据
 */
export class Track {
  /** 轨道唯一标识 */
  readonly id: string;

  /** 轨道名称 */
  name: string;

  /** 轨道类型 */
  readonly type: TrackType;

  /** 轨道状态 */
  state: TrackState;

  /** 音量推子值 (dB) */
  private _volumeDb: number;

  /** 声像位置 (-1 = 极左, 0 = 中央, 1 = 极右) */
  private _pan: number;

  /** 静音开关 */
  muted: boolean;

  /** 独奏开关 */
  soloed: boolean;

  /** 录音预备开关 */
  armed: boolean;

  /** 输入增益 (dB) */
  inputGainDb: number;

  /** 相位反转 */
  phaseInverted: boolean;

  /** 通道数 (1 或 2) */
  readonly channels: number;

  /** 轨道颜色 */
  color: string;

  /** 音频片段列表 */
  clips: AudioClip[];

  /** MIDI 事件列表 */
  midiEvents: MidiEvent[];

  /** 自动化轨道映射 */
  automation: Map<string, AutomationLane>;

  /** 均衡器频段 */
  eqBands: EQBand[];

  /** 插入效果器链 (简化表示) */
  effects: Array<{ name: string; enabled: boolean; params: Record<string, number> }>;

  /** 轨道输出缓冲区 (左声道) */
  outputBufferL: Float32Array;

  /** 轨道输出缓冲区 (右声道) */
  outputBufferR: Float32Array;

  /** 计量数据 */
  meterData: MeterData;

  /** 峰值保持计时器 */
  private peakHoldTimer: number;

  /** VU 表当前值 */
  private vuValue: number;

  /** RMS 累积值 */
  private rmsAccumulator: number;

  /** RMS 计数 */
  private rmsCount: number;

  /** 创建时间戳 */
  readonly createdAt: number;

  /**
   * 创建新轨道
   * @param config 轨道配置
   */
  constructor(config: TrackConfig) {
    this.id = generateId();
    this.name = config.name;
    this.type = config.type;
    this.state = 'idle';
    this._volumeDb = config.volumeDb ?? DEFAULT_TRACK_VOLUME_DB;
    this._pan = config.pan ?? DEFAULT_PAN;
    this.muted = config.muted ?? false;
    this.soloed = config.soloed ?? false;
    this.armed = config.armed ?? false;
    this.inputGainDb = config.inputGainDb ?? 0;
    this.phaseInverted = config.phaseInverted ?? false;
    this.channels = config.channels ?? 2;
    this.color = config.color ?? '#808080';
    this.clips = [];
    this.midiEvents = [];
    this.automation = new Map();
    this.eqBands = config.eq ?? [];
    this.effects = [];
    this.outputBufferL = new Float32Array(0);
    this.outputBufferR = new Float32Array(0);
    this.vuValue = 0;
    this.rmsAccumulator = 0;
    this.rmsCount = 0;
    this.peakHoldTimer = 0;

    // 初始化计量数据
    this.meterData = {
      vuDb: -96,
      peakDb: -96,
      rmsDb: -96,
      lufsShort: -70,
      lufsIntegrated: -70,
      truePeakDb: -96,
      peakHoldDb: -96,
      left: { vuDb: -96, peakDb: -96, rmsDb: -96 },
      right: { vuDb: -96, peakDb: -96, rmsDb: -96 },
      timestamp: Date.now(),
    };

    this.createdAt = Date.now();

    // 初始化默认自动化轨道
    this.initDefaultAutomation();
  }

  /**
   * 初始化默认自动化参数
   */
  private initDefaultAutomation(): void {
    this.automation.set('volume', {
      parameter: 'volume',
      points: [],
      enabled: false,
      defaultValue: this._volumeDb,
    });
    this.automation.set('pan', {
      parameter: 'pan',
      points: [],
      enabled: false,
      defaultValue: this._pan,
    });
    this.automation.set('mute', {
      parameter: 'mute',
      points: [],
      enabled: false,
      defaultValue: 0,
    });
  }

  /**
   * 获取当前音量 (dB)
   * @returns 音量值 (dB)
   */
  get volumeDb(): number {
    return this._volumeDb;
  }

  /**
   * 设置音量 (dB)
   * @param value 目标音量 (dB)
   */
  set volumeDb(value: number) {
    this._volumeDb = clamp(value, MIN_TRACK_VOLUME_DB, MAX_TRACK_VOLUME_DB);
    // 更新自动化默认值
    const lane = this.automation.get('volume');
    if (lane) lane.defaultValue = this._volumeDb;
  }

  /**
   * 获取当前声像位置
   * @returns 声像值 (-1 ~ 1)
   */
  get pan(): number {
    return this._pan;
  }

  /**
   * 设置声像位置
   * @param value 目标声像 (-1 ~ 1)
   */
  set pan(value: number) {
    this._pan = clamp(value, -1, 1);
    const lane = this.automation.get('pan');
    if (lane) lane.defaultValue = this._pan;
  }

  /**
   * 获取线性增益值
   * @returns 线性增益 (0 ~ ~3.98)
   */
  get gain(): number {
    return dbToGain(this._volumeDb);
  }

  /**
   * 获取当前时刻的有效音量（包含自动化）
   * @param time 时间 (秒)
   * @returns 有效音量 (dB)
   */
  getEffectiveVolume(time: number): number {
    const lane = this.automation.get('volume');
    if (lane && lane.enabled && lane.points.length > 0) {
      return clamp(evaluateAutomation(lane, time), MIN_TRACK_VOLUME_DB, MAX_TRACK_VOLUME_DB);
    }
    return this._volumeDb;
  }

  /**
   * 获取当前时刻的有效声像（包含自动化）
   * @param time 时间 (秒)
   * @returns 有效声像 (-1 ~ 1)
   */
  getEffectivePan(time: number): number {
    const lane = this.automation.get('pan');
    if (lane && lane.enabled && lane.points.length > 0) {
      return clamp(evaluateAutomation(lane, time), -1, 1);
    }
    return this._pan;
  }

  /**
   * 添加音频片段
   * @param clip 音频片段
   */
  addClip(clip: AudioClip): void {
    this.clips.push(clip);
    // 按时间排序
    this.clips.sort((a, b) => a.startTime - b.startTime);
  }

  /**
   * 移除音频片段
   * @param clipId 片段 ID
   * @returns 是否成功移除
   */
  removeClip(clipId: string): boolean {
    const idx = this.clips.findIndex((c) => c.id === clipId);
    if (idx >= 0) {
      this.clips.splice(idx, 1);
      return true;
    }
    return false;
  }

  /**
   * 添加 MIDI 事件
   * @param event MIDI 事件
   */
  addMidiEvent(event: MidiEvent): void {
    this.midiEvents.push(event);
    this.midiEvents.sort((a, b) => a.time - b.time);
  }

  /**
   * 设置自动化数据
   * @param parameter 参数名
   * @param points 自动化点序列
   */
  setAutomation(parameter: string, points: AutomationPoint[]): void {
    const existing = this.automation.get(parameter);
    if (existing) {
      existing.points = [...points].sort((a, b) => a.time - b.time);
      existing.enabled = points.length > 0;
    } else {
      this.automation.set(parameter, {
        parameter,
        points: [...points].sort((a, b) => a.time - b.time),
        enabled: points.length > 0,
        defaultValue: 0,
      });
    }
  }

  /**
   * 清除指定参数的自动化
   * @param parameter 参数名
   */
  clearAutomation(parameter: string): void {
    const lane = this.automation.get(parameter);
    if (lane) {
      lane.points = [];
      lane.enabled = false;
    }
  }

  /**
   * 清除所有自动化
   */
  clearAllAutomation(): void {
    for (const lane of this.automation.values()) {
      lane.points = [];
      lane.enabled = false;
    }
  }

  /**
   * 应用输入增益和相位反转到缓冲区
   * @param bufferL 左声道缓冲区
   * @param bufferR 右声道缓冲区
   */
  applyInputProcessing(bufferL: Float32Array, bufferR: Float32Array): void {
    const gain = dbToGain(this.inputGainDb);
    const phase = this.phaseInverted ? -1 : 1;
    const totalGain = gain * phase;

    for (let i = 0; i < bufferL.length; i++) {
      bufferL[i] *= totalGain;
    }
    if (this.channels > 1) {
      for (let i = 0; i < bufferR.length; i++) {
        bufferR[i] *= totalGain;
      }
    }
  }

  /**
   * 更新计量数据
   * @param bufferL 左声道缓冲区
   * @param bufferR 右声道缓冲区
   * @param sampleRate 采样率
   */
  updateMeters(bufferL: Float32Array, bufferR: Float32Array, sampleRate: number = SAMPLE_RATE): void {
    let peakL = 0;
    let peakR = 0;
    let sumL = 0;
    let sumR = 0;

    for (let i = 0; i < bufferL.length; i++) {
      const absL = Math.abs(bufferL[i]);
      const absR = Math.abs(bufferR[i]);
      if (absL > peakL) peakL = absL;
      if (absR > peakR) peakR = absR;
      sumL += bufferL[i] * bufferL[i];
      sumR += bufferR[i] * bufferR[i];
    }

    const rmsL = Math.sqrt(sumL / bufferL.length);
    const rmsR = Math.sqrt(sumR / bufferR.length);

    // VU 表平滑
    const vuTargetL = rmsL;
    const vuTargetR = rmsR;
    this.vuValue = exponentialSmooth(this.vuValue, (vuTargetL + vuTargetR) / 2, VU_RESPONSE_MS, sampleRate);

    // 峰值保持
    const peakDbL = gainToDb(peakL);
    const peakDbR = gainToDb(peakR);
    const maxPeakDb = Math.max(peakDbL, peakDbR);

    if (maxPeakDb > this.meterData.peakHoldDb) {
      this.meterData.peakHoldDb = maxPeakDb;
      this.peakHoldTimer = PEAK_HOLD_MS;
    } else {
      this.peakHoldTimer -= (bufferL.length / sampleRate) * 1000;
      if (this.peakHoldTimer <= 0) {
        this.meterData.peakHoldDb = maxPeakDb;
        this.peakHoldTimer = PEAK_HOLD_MS;
      }
    }

    // 更新计量数据结构
    this.meterData.vuDb = gainToDb(this.vuValue);
    this.meterData.peakDb = maxPeakDb;
    this.meterData.rmsDb = gainToDb((rmsL + rmsR) / 2);
    this.meterData.truePeakDb = gainToDb(Math.max(calculateTruePeak(bufferL), calculateTruePeak(bufferR)));
    this.meterData.left = {
      vuDb: gainToDb(vuTargetL),
      peakDb: peakDbL,
      rmsDb: gainToDb(rmsL),
    };
    this.meterData.right = {
      vuDb: gainToDb(vuTargetR),
      peakDb: peakDbR,
      rmsDb: gainToDb(rmsR),
    };
    this.meterData.timestamp = Date.now();
  }

  /**
   * 重置计量数据
   */
  resetMeters(): void {
    this.vuValue = 0;
    this.rmsAccumulator = 0;
    this.rmsCount = 0;
    this.peakHoldTimer = 0;
    this.meterData = {
      vuDb: -96,
      peakDb: -96,
      rmsDb: -96,
      lufsShort: -70,
      lufsIntegrated: -70,
      truePeakDb: -96,
      peakHoldDb: -96,
      left: { vuDb: -96, peakDb: -96, rmsDb: -96 },
      right: { vuDb: -96, peakDb: -96, rmsDb: -96 },
      timestamp: Date.now(),
    };
  }

  /**
   * 将轨道序列化为 JSON 对象
   * @returns 序列化数据
   */
  serialize(): object {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      state: this.state,
      volumeDb: this._volumeDb,
      pan: this._pan,
      muted: this.muted,
      soloed: this.soloed,
      armed: this.armed,
      inputGainDb: this.inputGainDb,
      phaseInverted: this.phaseInverted,
      channels: this.channels,
      color: this.color,
      eqBands: this.eqBands,
      effects: this.effects,
      clipCount: this.clips.length,
      midiEventCount: this.midiEvents.length,
      automationCount: this.automation.size,
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// AuxSend 类 - 效果发送管理
// ═══════════════════════════════════════════════════════════════

/**
 * 辅助发送类
 * 管理从轨道到效果总线的信号发送，支持推子前/后发送
 */
export class AuxSend {
  /** 发送唯一标识 */
  readonly id: string;

  /** 源轨道 ID */
  fromTrackId: string;

  /** 目标总线 ID */
  toBusId: string;

  /** 发送量 (0 ~ 1，代表 -inf 到 0 dB) */
  private _amount: number;

  /** 推子前发送 (true) 或推子后发送 (false) */
  preFader: boolean;

  /** 是否启用 */
  enabled: boolean;

  /** 发送名称 */
  name: string;

  /** 自动化轨道 */
  automation: AutomationLane;

  /**
   * 创建新的效果发送
   * @param fromTrackId 源轨道 ID
   * @param toBusId 目标总线 ID
   * @param amount 发送量 (0 ~ 1)
   * @param preFader 是否为推子前发送
   */
  constructor(fromTrackId: string, toBusId: string, amount: number = 0.0, preFader: boolean = false) {
    this.id = generateId();
    this.fromTrackId = fromTrackId;
    this.toBusId = toBusId;
    this._amount = clamp(amount, 0, 1);
    this.preFader = preFader;
    this.enabled = true;
    this.name = `Send ${fromTrackId.slice(0, 4)} -> ${toBusId.slice(0, 4)}`;
    this.automation = {
      parameter: 'amount',
      points: [],
      enabled: false,
      defaultValue: this._amount,
    };
  }

  /**
   * 获取发送量
   * @returns 发送量 (0 ~ 1)
   */
  get amount(): number {
    return this._amount;
  }

  /**
   * 设置发送量
   * @param value 目标发送量 (0 ~ 1)
   */
  set amount(value: number) {
    this._amount = clamp(value, 0, 1);
    this.automation.defaultValue = this._amount;
  }

  /**
   * 获取发送增益（线性）
   * @returns 线性增益值
   */
  get gain(): number {
    if (!this.enabled) return 0;
    return this._amount;
  }

  /**
   * 获取指定时间的有效发送量（含自动化）
   * @param time 时间 (秒)
   * @returns 有效发送量
   */
  getEffectiveAmount(time: number): number {
    if (!this.enabled) return 0;
    if (this.automation.enabled && this.automation.points.length > 0) {
      return clamp(evaluateAutomation(this.automation, time), 0, 1);
    }
    return this._amount;
  }

  /**
   * 设置发送自动化
   * @param points 自动化点
   */
  setAutomation(points: AutomationPoint[]): void {
    this.automation.points = [...points].sort((a, b) => a.time - b.time);
    this.automation.enabled = points.length > 0;
  }

  /**
   * 序列化发送配置
   * @returns 配置对象
   */
  serialize(): object {
    return {
      id: this.id,
      fromTrackId: this.fromTrackId,
      toBusId: this.toBusId,
      amount: this._amount,
      preFader: this.preFader,
      enabled: this.enabled,
      name: this.name,
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// MasterBus 类 - 主总线处理
// ═══════════════════════════════════════════════════════════════

/**
 * 主总线类
 * 处理最终混音输出，包含限制器、响度表、立体声展宽和抖动处理
 */
export class MasterBus {
  /** 输入增益 (dB) */
  inputGainDb: number;

  /** 输出增益 (dB) */
  outputGainDb: number;

  /** 限制器阈值 (线性 0-1) */
  limiterThreshold: number;

  /** 限制器模式 */
  limiterMode: LimiterMode;

  /** 限制器释放时间 (ms) */
  limiterReleaseMs: number;

  /** 限制器增益衰减 */
  private limiterGainReduction: number;

  /** 响度表积分窗口大小 */
  lufsWindowSize: number;

  /** 响度表历史缓冲区 */
  private lufsHistory: Float64Array;

  /** 响度表历史索引 */
  private lufsIndex: number;

  /** 综合响度累积值 */
  private integratedLoudness: number;

  /** 综合响度计数 */
  private integratedCount: number;

  /** 立体声展宽度 (0-1) */
  stereoWidth: number;

  /** 计量数据 */
  meterData: MeterData;

  /** 输出缓冲区 (左) */
  outputBufferL: Float32Array;

  /** 输出缓冲区 (右) */
  outputBufferR: Float32Array;

  /** 直流阻断器状态 */
  private dcBlockerL: { x1: number; x2: number; y1: number; y2: number };
  private dcBlockerR: { x1: number; x2: number; y1: number; y2: number };

  /** 采样率 */
  readonly sampleRate: number;

  /**
   * 创建主总线
   * @param sampleRate 采样率
   */
  constructor(sampleRate: number = SAMPLE_RATE) {
    this.sampleRate = sampleRate;
    this.inputGainDb = 0;
    this.outputGainDb = 0;
    this.limiterThreshold = MASTER_LIMITER_THRESHOLD;
    this.limiterMode = 'soft';
    this.limiterReleaseMs = 50;
    this.limiterGainReduction = 1.0;
    this.stereoWidth = 1.0;

    // LUFS 积分窗口 (约 400ms = 0.4s * 44100 = 17640 samples)
    this.lufsWindowSize = Math.floor(0.4 * sampleRate);
    this.lufsHistory = new Float64Array(this.lufsWindowSize);
    this.lufsIndex = 0;
    this.integratedLoudness = 0;
    this.integratedCount = 0;

    this.outputBufferL = new Float32Array(0);
    this.outputBufferR = new Float32Array(0);

    this.dcBlockerL = { x1: 0, x2: 0, y1: 0, y2: 0 };
    this.dcBlockerR = { x1: 0, x2: 0, y1: 0, y2: 0 };

    this.meterData = {
      vuDb: -96,
      peakDb: -96,
      rmsDb: -96,
      lufsShort: -70,
      lufsIntegrated: -70,
      truePeakDb: -96,
      peakHoldDb: -96,
      left: { vuDb: -96, peakDb: -96, rmsDb: -96 },
      right: { vuDb: -96, peakDb: -96, rmsDb: -96 },
      timestamp: Date.now(),
    };
  }

  /**
   * 处理输入缓冲区
   * @param inputL 左声道输入
   * @param inputR 右声道输入
   * @returns 处理后的 [左, 右] 缓冲区
   */
  process(inputL: Float32Array, inputR: Float32Array): [Float32Array, Float32Array] {
    const n = inputL.length;
    const outL = new Float32Array(n);
    const outR = new Float32Array(n);

    const inputGain = dbToGain(this.inputGainDb);
    const outputGain = dbToGain(this.outputGainDb);

    for (let i = 0; i < n; i++) {
      let l = inputL[i] * inputGain;
      let r = inputR[i] * inputGain;

      // 直流阻断
      l = this.applyDCBlocker(l, this.dcBlockerL);
      r = this.applyDCBlocker(r, this.dcBlockerR);

      // 立体声展宽 (M/S 处理)
      const [wl, wr] = this.applyStereoWidth(l, r);

      // 限制器
      const [cl, cr] = this.applyLimiter(wl, wr);

      // 输出增益
      outL[i] = clamp(cl * outputGain, -1, 1);
      outR[i] = clamp(cr * outputGain, -1, 1);
    }

    // 更新响度表
    this.updateLoudnessMeters(outL, outR);

    this.outputBufferL = outL;
    this.outputBufferR = outR;

    return [outL, outR];
  }

  /**
   * 应用直流阻断滤波器
   * @param input 输入样本
   * @param state 滤波器状态
   * @returns 滤波后样本
   */
  private applyDCBlocker(input: number, state: { x1: number; x2: number; y1: number; y2: number }): number {
    // 一阶高通近似
    const cutoff = 20; // Hz
    const r = 1 - (2 * Math.PI * cutoff) / this.sampleRate;
    const output = input - state.x1 + r * state.y1;
    state.x1 = input;
    state.y1 = output;
    return output;
  }

  /**
   * 应用立体声展宽
   * @param l 左声道
   * @param r 右声道
   * @returns [左, 右] 处理后声道
   */
  private applyStereoWidth(l: number, r: number): [number, number] {
    const width = clamp(this.stereoWidth, 0, 2);
    // M/S 转换
    const mid = (l + r) * 0.5;
    const side = (r - l) * 0.5;
    // 调整 side 增益
    const scaledSide = side * width;
    // 转回 L/R
    const outL = mid - scaledSide;
    const outR = mid + scaledSide;
    return [outL, outR];
  }

  /**
   * 应用限制器
   * @param l 左声道
   * @param r 右声道
   * @returns [左, 右] 限制后声道
   */
  private applyLimiter(l: number, r: number): [number, number] {
    const peak = Math.max(Math.abs(l), Math.abs(r));
    if (peak > this.limiterThreshold && peak > 0) {
      const targetGain = this.limiterThreshold / peak;
      // 释放平滑
      const releaseCoeff = Math.exp(-1 / ((this.limiterReleaseMs / 1000) * this.sampleRate));
      this.limiterGainReduction = this.limiterGainReduction * releaseCoeff + targetGain * (1 - releaseCoeff);
    } else {
      const releaseCoeff = Math.exp(-1 / ((this.limiterReleaseMs / 1000) * this.sampleRate));
      this.limiterGainReduction = this.limiterGainReduction * releaseCoeff + 1.0 * (1 - releaseCoeff);
    }

    const gain = Math.min(1.0, this.limiterGainReduction);
    return [l * gain, r * gain];
  }

  /**
   * 更新响度计量器
   * @param bufferL 左声道
   * @param bufferR 右声道
   */
  private updateLoudnessMeters(bufferL: Float32Array, bufferR: Float32Array): void {
    // 简化 LUFS 计算 (基于 K 加权的近似)
    let sum = 0;
    for (let i = 0; i < bufferL.length; i++) {
      const l = bufferL[i];
      const r = bufferR[i];
      // 简化：使用平均功率近似
      const power = l * l + r * r;
      sum += power;
    }

    const meanPower = sum / bufferL.length;
    const lufsInstant = -0.691 + 10 * Math.log10(Math.max(meanPower, 1e-10));

    // 滑动窗口更新
    this.lufsHistory[this.lufsIndex % this.lufsWindowSize] = Math.pow(10, lufsInstant / 10);
    this.lufsIndex++;

    // 计算短期 LUFS
    const validSamples = Math.min(this.lufsIndex, this.lufsWindowSize);
    let windowSum = 0;
    for (let i = 0; i < validSamples; i++) {
      windowSum += this.lufsHistory[i];
    }
    const shortLufs = 10 * Math.log10(windowSum / validSamples) - 0.691;

    // 综合响度累积
    this.integratedLoudness += meanPower;
    this.integratedCount++;
    const integratedLufs = 10 * Math.log10(this.integratedLoudness / this.integratedCount) - 0.691;

    // 峰值
    let peakL = 0;
    let peakR = 0;
    for (let i = 0; i < bufferL.length; i++) {
      peakL = Math.max(peakL, Math.abs(bufferL[i]));
      peakR = Math.max(peakR, Math.abs(bufferR[i]));
    }

    this.meterData.lufsShort = shortLufs;
    this.meterData.lufsIntegrated = integratedLufs;
    this.meterData.peakDb = gainToDb(Math.max(peakL, peakR));
    this.meterData.truePeakDb = gainToDb(Math.max(calculateTruePeak(bufferL), calculateTruePeak(bufferR)));
    this.meterData.left.peakDb = gainToDb(peakL);
    this.meterData.right.peakDb = gainToDb(peakR);
    this.meterData.timestamp = Date.now();
  }

  /**
   * 重置主总线状态
   */
  reset(): void {
    this.limiterGainReduction = 1.0;
    this.lufsIndex = 0;
    this.integratedLoudness = 0;
    this.integratedCount = 0;
    this.dcBlockerL = { x1: 0, x2: 0, y1: 0, y2: 0 };
    this.dcBlockerR = { x1: 0, x2: 0, y1: 0, y2: 0 };
    this.outputBufferL = new Float32Array(0);
    this.outputBufferR = new Float32Array(0);
  }

  /**
   * 获取限制器增益衰减量 (dB)
   * @returns 增益衰减 (dB)
   */
  getLimiterReductionDb(): number {
    return gainToDb(this.limiterGainReduction);
  }

  /**
   * 序列化主总线配置
   * @returns 配置对象
   */
  serialize(): object {
    return {
      inputGainDb: this.inputGainDb,
      outputGainDb: this.outputGainDb,
      limiterThreshold: this.limiterThreshold,
      limiterMode: this.limiterMode,
      limiterReleaseMs: this.limiterReleaseMs,
      stereoWidth: this.stereoWidth,
      lufsIntegrated: this.meterData.lufsIntegrated,
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// TrackSystem 类 - 多轨混音台核心
// ═══════════════════════════════════════════════════════════════

/**
 * 轨道系统类
 * 青鸾 DAW 的核心混音引擎，管理所有轨道、总线、发送和混音渲染
 */
export class TrackSystem {
  /** 所有轨道映射 (id -> Track) */
  private tracks: Map<string, Track>;

  /** 主总线实例 */
  readonly masterBus: MasterBus;

  /** 所有效果发送 */
  private sends: Map<string, AuxSend>;

  /** 编组总线映射 */
  private buses: Map<string, Track>;

  /** 轨道顺序列表 */
  private trackOrder: string[];

  /** 全局独奏模式开关 */
  private soloMode: boolean;

  /** 采样率 */
  readonly sampleRate: number;

  /** 渲染状态 */
  private isRendering: boolean;

  /** 渲染进度回调 */
  progressCallback: ((progress: number) => void) | null;

  /** 项目总时长 (秒) */
  projectDuration: number;

  /** 撤销历史 */
  private undoStack: Array<{ action: string; data: unknown }>;

  /** 重做历史 */
  private redoStack: Array<{ action: string; data: unknown }>;

  /** 历史最大深度 */
  private readonly maxHistoryDepth = 100;

  /**
   * 创建轨道系统
   * @param sampleRate 采样率 (默认 44100)
   */
  constructor(sampleRate: number = SAMPLE_RATE) {
    this.sampleRate = sampleRate;
    this.tracks = new Map();
    this.sends = new Map();
    this.buses = new Map();
    this.trackOrder = [];
    this.soloMode = false;
    this.isRendering = false;
    this.progressCallback = null;
    this.projectDuration = 0;
    this.undoStack = [];
    this.redoStack = [];

    // 创建主总线
    this.masterBus = new MasterBus(sampleRate);

    // 创建默认主轨道 (内部使用)
    const masterTrack = new Track({
      name: 'Master',
      type: 'master',
      volumeDb: 0,
      pan: 0,
      channels: 2,
      color: '#FFD700',
    });
    this.tracks.set(masterTrack.id, masterTrack);
    this.trackOrder.push(masterTrack.id);
  }

  // ─────────────────────────────────────────────────────────────
  // 轨道管理
  // ─────────────────────────────────────────────────────────────

  /**
   * 添加新轨道
   * @param config 轨道配置
   * @returns 新创建的轨道实例
   * @throws 如果轨道数量超过最大值
   */
  addTrack(config: TrackConfig): Track {
    if (this.tracks.size >= MAX_TRACKS) {
      throw new Error(`轨道数量已达到上限 ${MAX_TRACKS}`);
    }

    const track = new Track(config);
    this.tracks.set(track.id, track);
    this.trackOrder.push(track.id);

    // 更新项目时长
    this.updateProjectDuration();

    // 记录历史
    this.pushHistory('addTrack', { id: track.id, config: { ...config } });

    return track;
  }

  /**
   * 移除轨道
   * @param id 轨道 ID
   * @returns 是否成功移除
   */
  removeTrack(id: string): boolean {
    const track = this.tracks.get(id);
    if (!track) return false;

    // 不能移除主总线
    if (track.type === 'master') {
      throw new Error('不能移除主总线轨道');
    }

    // 移除关联的发送
    for (const [sendId, send] of this.sends) {
      if (send.fromTrackId === id || send.toBusId === id) {
        this.sends.delete(sendId);
      }
    }

    // 从编组中移除
    if (track.type === 'bus') {
      this.buses.delete(id);
    }

    // 从顺序列表中移除
    const idx = this.trackOrder.indexOf(id);
    if (idx >= 0) {
      this.trackOrder.splice(idx, 1);
    }

    // 记录历史
    this.pushHistory('removeTrack', { id, track: track.serialize() });

    return this.tracks.delete(id);
  }

  /**
   * 获取轨道
   * @param id 轨道 ID
   * @returns 轨道实例，如果不存在返回 undefined
   */
  getTrack(id: string): Track | undefined {
    return this.tracks.get(id);
  }

  /**
   * 获取所有轨道
   * @returns 轨道数组
   */
  getAllTracks(): Track[] {
    return this.trackOrder.map((id) => this.tracks.get(id)!).filter(Boolean);
  }

  /**
   * 重命名轨道
   * @param id 轨道 ID
   * @param name 新名称
   * @returns 是否成功
   */
  renameTrack(id: string, name: string): boolean {
    const track = this.tracks.get(id);
    if (!track) return false;
    const oldName = track.name;
    track.name = name;
    this.pushHistory('renameTrack', { id, oldName, newName: name });
    return true;
  }

  /**
   * 移动轨道位置
   * @param id 轨道 ID
   * @param newIndex 目标索引
   * @returns 是否成功
   */
  moveTrack(id: string, newIndex: number): boolean {
    const idx = this.trackOrder.indexOf(id);
    if (idx < 0) return false;
    this.trackOrder.splice(idx, 1);
    this.trackOrder.splice(clamp(newIndex, 0, this.trackOrder.length), 0, id);
    return true;
  }

  // ─────────────────────────────────────────────────────────────
  // 参数控制
  // ─────────────────────────────────────────────────────────────

  /**
   * 设置轨道音量
   * @param id 轨道 ID
   * @param db 目标音量 (dB)
   * @returns 是否成功
   */
  setVolume(id: string, db: number): boolean {
    const track = this.tracks.get(id);
    if (!track) return false;
    const oldValue = track.volumeDb;
    track.volumeDb = db;
    this.pushHistory('setVolume', { id, oldValue, newValue: db });
    return true;
  }

  /**
   * 设置轨道声像
   * @param id 轨道 ID
   * @param value 声像位置 (-1 ~ 1)
   * @returns 是否成功
   */
  setPan(id: string, value: number): boolean {
    const track = this.tracks.get(id);
    if (!track) return false;
    const oldValue = track.pan;
    track.pan = value;
    this.pushHistory('setPan', { id, oldValue, newValue: value });
    return true;
  }

  /**
   * 设置静音状态
   * @param id 轨道 ID
   * @param bool 是否静音
   * @returns 是否成功
   */
  setMute(id: string, bool: boolean): boolean {
    const track = this.tracks.get(id);
    if (!track) return false;
    const oldValue = track.muted;
    track.muted = bool;
    this.pushHistory('setMute', { id, oldValue, newValue: bool });
    return true;
  }

  /**
   * 设置独奏状态
   * @param id 轨道 ID
   * @param bool 是否独奏
   * @returns 是否成功
   */
  setSolo(id: string, bool: boolean): boolean {
    const track = this.tracks.get(id);
    if (!track) return false;
    const oldValue = track.soloed;
    track.soloed = bool;

    // 更新全局独奏模式
    this.updateSoloMode();

    this.pushHistory('setSolo', { id, oldValue, newValue: bool });
    return true;
  }

  /**
   * 设置录音预备状态
   * @param id 轨道 ID
   * @param bool 是否预备录音
   * @returns 是否成功
   */
  setArmed(id: string, bool: boolean): boolean {
    const track = this.tracks.get(id);
    if (!track) return false;
    if (track.type !== 'audio' && track.type !== 'midi') {
      throw new Error('只有音频或 MIDI 轨道可以设置录音预备');
    }
    track.armed = bool;
    track.state = bool ? 'armed' : 'idle';
    return true;
  }

  /**
   * 设置输入增益
   * @param id 轨道 ID
   * @param db 增益值 (dB)
   * @returns 是否成功
   */
  setInputGain(id: string, db: number): boolean {
    const track = this.tracks.get(id);
    if (!track) return false;
    track.inputGainDb = db;
    return true;
  }

  /**
   * 设置相位反转
   * @param id 轨道 ID
   * @param inverted 是否反转
   * @returns 是否成功
   */
  setPhaseInverted(id: string, inverted: boolean): boolean {
    const track = this.tracks.get(id);
    if (!track) return false;
    track.phaseInverted = inverted;
    return true;
  }

  /**
   * 切换所有轨道的静音/独奏互斥
   * @param soloTrackId 独奏轨道 ID，设为 null 取消所有独奏
   */
  exclusiveSolo(soloTrackId: string | null): void {
    for (const track of this.tracks.values()) {
      if (track.type === 'master') continue;
      track.soloed = soloTrackId !== null && track.id === soloTrackId;
    }
    this.updateSoloMode();
  }

  /**
   * 更新全局独奏模式状态
   */
  private updateSoloMode(): void {
    let hasSolo = false;
    for (const track of this.tracks.values()) {
      if (track.soloed && track.type !== 'master') {
        hasSolo = true;
        break;
      }
    }
    this.soloMode = hasSolo;
  }

  // ─────────────────────────────────────────────────────────────
  // 编组与发送
  // ─────────────────────────────────────────────────────────────

  /**
   * 创建编组总线
   * @param name 总线名称
   * @returns 新创建的总线轨道
   */
  createBus(name: string): Track {
    const bus = this.addTrack({
      name,
      type: 'bus',
      volumeDb: 0,
      pan: 0,
      channels: 2,
      color: '#4A90D9',
    });
    this.buses.set(bus.id, bus);
    return bus;
  }

  /**
   * 创建效果发送
   * @param fromTrackId 源轨道 ID
   * @param toBusId 目标总线 ID
   * @param amount 发送量 (0 ~ 1)
   * @returns 新创建的发送实例
   */
  createSend(fromTrackId: string, toBusId: string, amount: number = 0.5): AuxSend {
    const fromTrack = this.tracks.get(fromTrackId);
    const toBus = this.tracks.get(toBusId);

    if (!fromTrack) {
      throw new Error(`源轨道 ${fromTrackId} 不存在`);
    }
    if (!toBus) {
      throw new Error(`目标总线 ${toBusId} 不存在`);
    }
    if (toBus.type !== 'bus' && toBus.type !== 'send') {
      throw new Error('效果发送只能连接到 bus 或 send 类型轨道');
    }
    if (this.sends.size >= MAX_SENDS) {
      throw new Error(`发送数量已达到上限 ${MAX_SENDS}`);
    }

    const send = new AuxSend(fromTrackId, toBusId, amount);
    this.sends.set(send.id, send);

    this.pushHistory('createSend', { sendId: send.id, fromTrackId, toBusId, amount });

    return send;
  }

  /**
   * 移除效果发送
   * @param sendId 发送 ID
   * @returns 是否成功
   */
  removeSend(sendId: string): boolean {
    return this.sends.delete(sendId);
  }

  /**
   * 获取指定轨道的所有发送
   * @param trackId 轨道 ID
   * @returns 发送数组
   */
  getTrackSends(trackId: string): AuxSend[] {
    const result: AuxSend[] = [];
    for (const send of this.sends.values()) {
      if (send.fromTrackId === trackId) {
        result.push(send);
      }
    }
    return result;
  }

  /**
   * 获取发送到指定总线的所有发送
   * @param busId 总线 ID
   * @returns 发送数组
   */
  getBusSends(busId: string): AuxSend[] {
    const result: AuxSend[] = [];
    for (const send of this.sends.values()) {
      if (send.toBusId === busId) {
        result.push(send);
      }
    }
    return result;
  }

  /**
   * 设置发送量
   * @param sendId 发送 ID
   * @param amount 发送量 (0 ~ 1)
   * @returns 是否成功
   */
  setSendAmount(sendId: string, amount: number): boolean {
    const send = this.sends.get(sendId);
    if (!send) return false;
    send.amount = clamp(amount, 0, 1);
    return true;
  }

  // ─────────────────────────────────────────────────────────────
  // 自动化控制
  // ─────────────────────────────────────────────────────────────

  /**
   * 设置轨道自动化参数
   * @param id 轨道 ID
   * @param param 参数名 (volume/pan/mute 等)
   * @param points 自动化点序列
   * @returns 是否成功
   */
  setAutomation(id: string, param: string, points: AutomationPoint[]): boolean {
    const track = this.tracks.get(id);
    if (!track) return false;

    // 确保点按时间排序
    const sortedPoints = [...points].sort((a, b) => a.time - b.time);

    // 验证点的时间非负
    for (const p of sortedPoints) {
      if (p.time < 0) {
        throw new Error('自动化点时间不能为负数');
      }
    }

    track.setAutomation(param, sortedPoints);

    this.pushHistory('setAutomation', { id, param, pointCount: sortedPoints.length });

    return true;
  }

  /**
   * 获取轨道自动化数据
   * @param id 轨道 ID
   * @param param 参数名
   * @returns 自动化轨道，如果不存在返回 undefined
   */
  getAutomation(id: string, param: string): AutomationLane | undefined {
    const track = this.tracks.get(id);
    if (!track) return undefined;
    return track.automation.get(param);
  }

  /**
   * 清除轨道自动化
   * @param id 轨道 ID
   * @param param 参数名
   * @returns 是否成功
   */
  clearAutomation(id: string, param: string): boolean {
    const track = this.tracks.get(id);
    if (!track) return false;
    track.clearAutomation(param);
    return true;
  }

  // ─────────────────────────────────────────────────────────────
  // 混音渲染
  // ─────────────────────────────────────────────────────────────

  /**
   * 渲染整个混音为 Float32Array
   * @param duration 渲染时长 (秒)
   * @returns 立体声混音缓冲区 [左, 右]
   */
  renderMix(duration: number): [Float32Array, Float32Array] {
    if (duration <= 0) {
      throw new Error('渲染时长必须大于 0');
    }

    this.isRendering = true;
    const totalSamples = Math.floor(duration * this.sampleRate);
    const masterL = new Float32Array(totalSamples);
    const masterR = new Float32Array(totalSamples);

    // 先渲染各轨道
    const trackBuffers = new Map<string, [Float32Array, Float32Array]>();

    // 获取所有非 master 轨道
    const audioTracks = this.getAllTracks().filter((t) => t.type !== 'master');

    // 第一步：渲染所有轨道到各自缓冲区
    for (let tIdx = 0; tIdx < audioTracks.length; tIdx++) {
      const track = audioTracks[tIdx];
      const [tl, tr] = this.renderTrack(track, duration);
      trackBuffers.set(track.id, [tl, tr]);

      // 更新轨道计量
      track.updateMeters(tl, tr, this.sampleRate);

      // 进度回调
      if (this.progressCallback) {
        this.progressCallback(0.1 + (tIdx / audioTracks.length) * 0.4);
      }
    }

    // 第二步：处理发送 (效果总线)
    const busBuffers = new Map<string, [Float32Array, Float32Array]>();
    for (const bus of this.buses.values()) {
      const busL = new Float32Array(totalSamples);
      const busR = new Float32Array(totalSamples);
      busBuffers.set(bus.id, [busL, busR]);
    }

    // 累加发送到总线
    let sendIdx = 0;
    const allSends = Array.from(this.sends.values());
    for (const send of allSends) {
      if (!send.enabled) continue;

      const sourceBuffer = trackBuffers.get(send.fromTrackId);
      const busBuffer = busBuffers.get(send.toBusId);
      if (!sourceBuffer || !busBuffer) continue;

      const [srcL, srcR] = sourceBuffer;
      const [busL, busR] = busBuffer;

      for (let i = 0; i < totalSamples; i++) {
        const time = i / this.sampleRate;
        const amount = send.getEffectiveAmount(time);
        busL[i] += srcL[i] * amount;
        busR[i] += srcR[i] * amount;
      }

      if (this.progressCallback) {
        this.progressCallback(0.5 + (sendIdx / Math.max(allSends.length, 1)) * 0.1);
      }
      sendIdx++;
    }

    // 第三步：混合所有轨道到主输出
    for (let s = 0; s < totalSamples; s++) {
      const time = s / this.sampleRate;
      let sumL = 0;
      let sumR = 0;

      for (const track of audioTracks) {
        // 独奏/静音处理
        if (this.soloMode && !track.soloed && track.type !== 'bus') {
          continue;
        }
        if (track.muted) continue;

        const buffers = trackBuffers.get(track.id);
        if (!buffers) continue;
        const [tl, tr] = buffers;

        // 获取有效音量和声像（含自动化）
        const volDb = track.getEffectiveVolume(time);
        const panVal = track.getEffectivePan(time);
        const gain = dbToGain(volDb);
        const [leftGain, rightGain] = panToGain(panVal);

        if (track.type === 'bus') {
          // 总线轨道：直接累加（总线已有自己的音量控制）
          sumL += tl[s] * gain * leftGain;
          sumR += tr[s] * gain * rightGain;
        } else {
          sumL += tl[s] * gain * leftGain;
          sumR += tr[s] * gain * rightGain;
        }
      }

      masterL[s] = sumL;
      masterR[s] = sumR;
    }

    if (this.progressCallback) {
      this.progressCallback(0.7);
    }

    // 第四步：主总线处理
    const [finalL, finalR] = this.masterBus.process(masterL, masterR);

    if (this.progressCallback) {
      this.progressCallback(1.0);
    }

    this.isRendering = false;
    return [finalL, finalR];
  }

  /**
   * 渲染单个轨道
   * @param track 轨道实例
   * @param duration 时长 (秒)
   * @returns [左, 右] 缓冲区
   */
  private renderTrack(track: Track, duration: number): [Float32Array, Float32Array] {
    const samples = Math.floor(duration * this.sampleRate);
    const outL = new Float32Array(samples);
    const outR = new Float32Array(samples);

    if (track.type === 'midi') {
      // MIDI 轨道：这里简化处理，生成正弦波表示 MIDI 音符
      this.renderMidiTrack(track, outL, outR, duration);
    } else {
      // 音频/Bus 轨道：混叠音频片段
      this.renderAudioTrack(track, outL, outR, duration);
    }

    return [outL, outR];
  }

  /**
   * 渲染音频轨道
   * @param track 轨道实例
   * @param outL 左输出缓冲区
   * @param outR 右输出缓冲区
   * @param duration 时长
   */
  private renderAudioTrack(track: Track, outL: Float32Array, outR: Float32Array, duration: number): void {
    for (const clip of track.clips) {
      if (clip.muted) continue;

      const clipStartSample = Math.floor(clip.startTime * this.sampleRate);
      const clipEndSample = Math.min(clipStartSample + clip.bufferL.length, outL.length);
      const fadeInSamples = Math.floor(clip.fadeIn * this.sampleRate);
      const fadeOutSamples = Math.floor(clip.fadeOut * this.sampleRate);
      const clipTotalSamples = clipEndSample - clipStartSample;

      for (let i = 0; i < clipTotalSamples; i++) {
        const sampleIdx = clipStartSample + i;
        if (sampleIdx >= outL.length) break;

        // 计算淡入淡出增益
        let fadeGain = 1.0;
        if (i < fadeInSamples && fadeInSamples > 0) {
          fadeGain = i / fadeInSamples;
        }
        const remaining = clipTotalSamples - i;
        if (remaining < fadeOutSamples && fadeOutSamples > 0) {
          fadeGain *= remaining / fadeOutSamples;
        }

        // 应用播放速率 (简化：假设 1.0)
        const bufIdx = Math.floor(i * clip.playbackRate);
        if (bufIdx < clip.bufferL.length) {
          outL[sampleIdx] += clip.bufferL[bufIdx] * fadeGain;
          if (track.channels > 1 && bufIdx < clip.bufferR.length) {
            outR[sampleIdx] += clip.bufferR[bufIdx] * fadeGain;
          } else {
            outR[sampleIdx] += clip.bufferL[bufIdx] * fadeGain;
          }
        }
      }
    }
  }

  /**
   * 渲染 MIDI 轨道（简化实现）
   * @param track 轨道实例
   * @param outL 左输出缓冲区
   * @param outR 右输出缓冲区
   * @param duration 时长
   */
  private renderMidiTrack(track: Track, outL: Float32Array, outR: Float32Array, duration: number): void {
    // 简化 MIDI 渲染：使用正弦波合成音符
    for (const event of track.midiEvents) {
      if (event.type !== 'noteOn' || !event.duration) continue;

      const freq = 440 * Math.pow(2, (event.note - 69) / 12);
      const startSample = Math.floor(event.time * this.sampleRate);
      const noteSamples = Math.floor(event.duration * this.sampleRate);
      const velocityGain = event.velocity / 127;

      for (let i = 0; i < noteSamples; i++) {
        const idx = startSample + i;
        if (idx >= outL.length) break;

        // 简单 ADSR 包络
        let env = 1.0;
        const attack = Math.min(1000, noteSamples * 0.1);
        const release = Math.min(5000, noteSamples * 0.3);
        if (i < attack) env = i / attack;
        if (i > noteSamples - release) env *= (noteSamples - i) / release;

        const sample = Math.sin((2 * Math.PI * freq * i) / this.sampleRate) * velocityGain * env * 0.3;
        outL[idx] += sample;
        outR[idx] += sample;
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 导出与统计
  // ─────────────────────────────────────────────────────────────

  /**
   * 导出混音统计信息
   * @returns 混音统计对象
   */
  exportMix(): MixStats {
    const tracks = this.getAllTracks();
    const duration = this.projectDuration;

    // 如果没有渲染过，先渲染一个快照
    let peakLevel = 0;
    let rmsSum = 0;
    let maxTruePeak = 0;
    let clippedSamples = 0;
    let dcOffsetSum = 0;
    let sampleCount = 0;

    // 使用主总线输出缓冲区的数据（如果有）
    const bufL = this.masterBus.outputBufferL;
    const bufR = this.masterBus.outputBufferR;

    if (bufL.length > 0 && bufR.length > 0) {
      for (let i = 0; i < bufL.length; i++) {
        const l = bufL[i];
        const r = bufR[i];
        const maxLR = Math.max(Math.abs(l), Math.abs(r));
        if (maxLR > peakLevel) peakLevel = maxLR;
        rmsSum += l * l + r * r;
        if (maxLR > 1.0) clippedSamples++;
        dcOffsetSum += l + r;
        sampleCount += 2;
      }
      maxTruePeak = Math.max(calculateTruePeak(bufL), calculateTruePeak(bufR));
    }

    const rmsLevel = sampleCount > 0 ? Math.sqrt(rmsSum / sampleCount) : 0;
    const dcOffset = sampleCount > 0 ? dcOffsetSum / sampleCount : 0;

    // 动态范围估计 (简化)
    const dynamicRange = gainToDb(peakLevel) - gainToDb(rmsLevel);

    return {
      totalTracks: tracks.length,
      duration,
      sampleRate: this.sampleRate,
      peakLevelDb: gainToDb(peakLevel),
      rmsLevelDb: gainToDb(rmsLevel),
      integratedLufs: this.masterBus.meterData.lufsIntegrated,
      dynamicRange: isFinite(dynamicRange) ? dynamicRange : 0,
      maxTruePeakDb: gainToDb(maxTruePeak),
      dcOffset,
      clipped: clippedSamples > 0,
      clippedSamples,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // 计量表
  // ─────────────────────────────────────────────────────────────

  /**
   * 获取指定轨道的计量表数据
   * @param id 轨道 ID
   * @returns 计量数据，如果轨道不存在返回 null
   */
  getMeterData(id: string): MeterData | null {
    const track = this.tracks.get(id);
    if (!track) return null;
    return { ...track.meterData };
  }

  /**
   * 获取主总线计量数据
   * @returns 主总线计量数据
   */
  getMasterMeterData(): MeterData {
    return { ...this.masterBus.meterData };
  }

  /**
   * 重置所有计量表
   */
  resetAllMeters(): void {
    for (const track of this.tracks.values()) {
      track.resetMeters();
    }
    this.masterBus.reset();
  }

  // ─────────────────────────────────────────────────────────────
  // 项目管理
  // ─────────────────────────────────────────────────────────────

  /**
   * 更新项目总时长
   */
  private updateProjectDuration(): void {
    let maxTime = 0;
    for (const track of this.tracks.values()) {
      for (const clip of track.clips) {
        const end = clip.startTime + clip.duration;
        if (end > maxTime) maxTime = end;
      }
      for (const event of track.midiEvents) {
        const end = event.time + (event.duration || 0);
        if (end > maxTime) maxTime = end;
      }
    }
    this.projectDuration = maxTime;
  }

  /**
   * 获取项目信息
   * @returns 项目信息对象
   */
  getProjectInfo(): object {
    return {
      trackCount: this.tracks.size,
      busCount: this.buses.size,
      sendCount: this.sends.size,
      duration: this.projectDuration,
      sampleRate: this.sampleRate,
      soloMode: this.soloMode,
      isRendering: this.isRendering,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // 撤销/重做
  // ─────────────────────────────────────────────────────────────

  /**
   * 压入历史记录
   * @param action 动作名称
   * @param data 数据
   */
  private pushHistory(action: string, data: unknown): void {
    this.undoStack.push({ action, data });
    if (this.undoStack.length > this.maxHistoryDepth) {
      this.undoStack.shift();
    }
    // 新操作后清空重做栈
    this.redoStack = [];
  }

  /**
   * 撤销上一个操作
   * @returns 是否成功撤销
   */
  undo(): boolean {
    if (this.undoStack.length === 0) return false;
    const item = this.undoStack.pop()!;
    this.redoStack.push(item);
    // 实际撤销逻辑应在此处展开
    return true;
  }

  /**
   * 重做上一个撤销的操作
   * @returns 是否成功重做
   */
  redo(): boolean {
    if (this.redoStack.length === 0) return false;
    const item = this.redoStack.pop()!;
    this.undoStack.push(item);
    // 实际重做逻辑应在此处展开
    return true;
  }

  // ─────────────────────────────────────────────────────────────
  // 序列化
  // ─────────────────────────────────────────────────────────────

  /**
   * 序列化整个轨道系统
   * @returns 序列化对象
   */
  serialize(): object {
    return {
      sampleRate: this.sampleRate,
      projectDuration: this.projectDuration,
      soloMode: this.soloMode,
      tracks: Array.from(this.tracks.values()).map((t) => t.serialize()),
      buses: Array.from(this.buses.keys()),
      sends: Array.from(this.sends.values()).map((s) => s.serialize()),
      masterBus: this.masterBus.serialize(),
      trackOrder: this.trackOrder,
    };
  }

  /**
   * 从序列化数据恢复
   * @param data 序列化对象
   */
  deserialize(data: {
    sampleRate: number;
    projectDuration: number;
    tracks: TrackConfig[];
    sends: SendConfig[];
  }): void {
    // 清空当前状态
    this.tracks.clear();
    this.buses.clear();
    this.sends.clear();
    this.trackOrder = [];

    // 恢复轨道
    for (const trackConfig of data.tracks) {
      const track = new Track(trackConfig);
      this.tracks.set(track.id, track);
      this.trackOrder.push(track.id);
      if (track.type === 'bus') {
        this.buses.set(track.id, track);
      }
    }

    // 恢复发送
    for (const sendConfig of data.sends) {
      this.createSend(sendConfig.fromTrackId, sendConfig.toBusId, sendConfig.amount);
    }

    this.projectDuration = data.projectDuration;
  }
}

// ═══════════════════════════════════════════════════════════════
// 默认导出
// ═══════════════════════════════════════════════════════════════

export default TrackSystem;
