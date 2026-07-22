/**
 * @file automationEngine.ts
 * @description 青鸾数字音频工作站 - 自动化引擎核心模块
 * 提供多轨道自动化参数管理（音量、声像、滤波器等）、贝塞尔曲线插值、
 * ADSR 包络生成器与低频振荡器（LFO）实现。
 * @module qingluan-daw/engines/automationEngine
 * @version 2.0.0
 */

import { clamp, lerp } from '../utils/audioUtils.js';

// =============================================================================
// 常量定义
// =============================================================================

/** 统一采样率：44100 Hz */
export const SAMPLE_RATE = 44100;

/** 默认自动化轨道最小值 */
export const DEFAULT_AUTOMATION_MIN = 0;

/** 默认自动化轨道最大值 */
export const DEFAULT_AUTOMATION_MAX = 1;

/** 默认贝塞尔曲线平滑度因子 */
export const BEZIER_SMOOTHNESS = 0.25;

/** 包络最小触发阈值 */
export const ENVELOPE_THRESHOLD = 1e-10;

/** LFO 默认频率（Hz） */
export const DEFAULT_LFO_FREQUENCY = 1.0;

/** LFO 默认振幅 */
export const DEFAULT_LFO_AMPLITUDE = 1.0;

/** LFO 默认相位偏移（弧度） */
export const DEFAULT_LFO_PHASE = 0;

// =============================================================================
// 类型定义
// =============================================================================

/**
 * 自动化曲线类型
 * - linear: 线性插值
 * - bezier: 贝塞尔曲线插值
 * - step: 阶梯/保持（到达下一个点前保持当前值）
 */
export type CurveType = 'linear' | 'bezier' | 'step' | 'exponential';

/**
 * 自动化控制点
 * @interface AutomationPoint
 */
export interface AutomationPoint {
  /** 时间（秒） */
  time: number;
  /** 参数值 */
  value: number;
  /** 曲线类型 */
  curveType: CurveType;
  /** 贝塞尔控制点 1 (t1, v1)，可选 */
  cp1?: { t: number; v: number };
  /** 贝塞尔控制点 2 (t2, v2)，可选 */
  cp2?: { t: number; v: number };
}

/**
 * 自动化轨道定义
 * @interface AutomationTrack
 */
export interface AutomationTrack {
  /** 轨道唯一标识 */
  id: string;
  /** 轨道名称（如 "Volume", "Pan", "Filter Cutoff"） */
  name: string;
  /** 参数最小值 */
  minValue: number;
  /** 参数最大值 */
  maxValue: number;
  /** 默认值 */
  defaultValue: number;
  /** 控制点数组（按时间升序排列） */
  points: AutomationPoint[];
  /** 参数单位（如 "dB", "Hz", "%"） */
  unit?: string;
}

/**
 * 自动化数据采样结果
 * @interface AutomationSample
 */
export interface AutomationSample {
  /** 采样时间 */
  time: number;
  /** 采样值 */
  value: number;
}

/**
 * 包络阶段枚举
 * @enum EnvelopeStage
 */
export enum EnvelopeStage {
  /** 空闲/关闭 */
  Idle = 'idle',
  /** 延迟（触发后到 Attack 的等待） */
  Delay = 'delay',
  /** 启动（Attack） */
  Attack = 'attack',
  /** 保持（Hold） */
  Hold = 'hold',
  /** 衰减（Decay） */
  Decay = 'decay',
  /** 持续（Sustain） */
  Sustain = 'sustain',
  /** 释放（Release） */
  Release = 'release',
  /** 结束后（Post-Release） */
  PostRelease = 'postRelease',
}

/**
 * 包络生成器配置
 * @interface EnvelopeConfig
 */
export interface EnvelopeConfig {
  /** 延迟时间（秒） */
  delayTime: number;
  /** 启动时间（秒） */
  attackTime: number;
  /** 保持时间（秒） */
  holdTime: number;
  /** 衰减时间（秒） */
  decayTime: number;
  /** 持续电平（0~1） */
  sustainLevel: number;
  /** 释放时间（秒） */
  releaseTime: number;
  /** 启动曲线（默认线性） */
  attackCurve: CurveType;
  /** 衰减曲线 */
  decayCurve: CurveType;
  /** 释放曲线 */
  releaseCurve: CurveType;
  /** 初始电平 */
  initialLevel: number;
  /** 峰值电平 */
  peakLevel: number;
}

/**
 * LFO 波形类型
 * @enum LFOWaveform
 */
export enum LFOWaveform {
  /** 正弦波 */
  Sine = 'sine',
  /** 三角波 */
  Triangle = 'triangle',
  /** 方波 */
  Square = 'square',
  /** 锯齿波 */
  Sawtooth = 'sawtooth',
  /** 采样保持（随机） */
  SampleAndHold = 'sampleAndHold',
}

/**
 * LFO 配置
 * @interface LFOConfig
 */
export interface LFOConfig {
  /** 波形类型 */
  waveform: LFOWaveform;
  /** 频率（Hz） */
  frequency: number;
  /** 振幅 */
  amplitude: number;
  /** 相位偏移（弧度） */
  phaseOffset: number;
  /** 输出中心值 */
  centerValue: number;
  /** 是否与宿主同步 */
  syncToHost: boolean;
  /** 同步后的音符分数（如 1/4, 1/8） */
  syncNoteValue?: number;
}

// =============================================================================
// 贝塞尔曲线插值工具
// =============================================================================

/**
 * 计算一维三次贝塞尔曲线在参数 t 处的值
 * B(t) = (1-t)^3 * P0 + 3(1-t)^2 * t * P1 + 3(1-t) * t^2 * P2 + t^3 * P3
 * @param p0 - 起点值
 * @param p1 - 控制点 1 值
 * @param p2 - 控制点 2 值
 * @param p3 - 终点值
 * @param t - 参数（0~1）
 * @returns 插值结果
 */
export function cubicBezier1D(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const c = clamp(t, 0, 1);
  const u = 1 - c;
  const u2 = u * u;
  const u3 = u2 * u;
  const c2 = c * c;
  const c3 = c2 * c;
  return u3 * p0 + 3 * u2 * c * p1 + 3 * u * c2 * p2 + c3 * p3;
}

/**
 * 计算二维三次贝塞尔曲线在参数 t 处的点坐标
 * @param p0 - 起点 {x,y}
 * @param p1 - 控制点 1
 * @param p2 - 控制点 2
 * @param p3 - 终点
 * @param t - 参数（0~1）
 * @returns {x, y}
 */
export function cubicBezier2D(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  t: number
): { x: number; y: number } {
  const c = clamp(t, 0, 1);
  return {
    x: cubicBezier1D(p0.x, p1.x, p2.x, p3.x, c),
    y: cubicBezier1D(p0.y, p1.y, p2.y, p3.y, c),
  };
}

/**
 * 通过二分搜索找到贝塞尔曲线上给定 x 对应的 y 值
 * 假设 x 随 t 单调递增（控制点合理时成立）
 * @param p0 - 起点 {t,v}
 * @param p1 - 控制点 1
 * @param p2 - 控制点 2
 * @param p3 - 终点
 * @param targetX - 目标 x（时间）
 * @param iterations - 迭代精度，默认 20
 * @returns 插值后的 y（值）
 */
export function bezierValueAtX(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  targetX: number,
  iterations: number = 20
): number {
  let low = 0;
  let high = 1;
  for (let i = 0; i < iterations; i++) {
    const mid = (low + high) / 2;
    const pt = cubicBezier2D(p0, p1, p2, p3, mid);
    if (pt.x < targetX) {
      low = mid;
    } else {
      high = mid;
    }
  }
  const t = (low + high) / 2;
  return cubicBezier2D(p0, p1, p2, p3, t).y;
}

/**
 * 生成默认的贝塞尔控制点
 * 根据起点和终点自动生成平滑的控制点
 * @param p0 - 起点 {time, value}
 * @param p3 - 终点 {time, value}
 * @returns [cp1, cp2]
 */
export function generateDefaultControlPoints(
  p0: { time: number; value: number },
  p3: { time: number; value: number }
): [AutomationPoint['cp1'], AutomationPoint['cp2']] {
  const dt = p3.time - p0.time;
  const dv = p3.value - p0.value;
  const cp1 = {
    t: p0.time + dt * BEZIER_SMOOTHNESS,
    v: p0.value + dv * 0.1,
  };
  const cp2 = {
    t: p3.time - dt * BEZIER_SMOOTHNESS,
    v: p3.value - dv * 0.1,
  };
  return [cp1, cp2];
}

// =============================================================================
// 自动化引擎主类
// =============================================================================

/**
 * 自动化引擎核心类，管理多条自动化轨道的控制点、插值与数据生成
 * @class AutomationEngine
 */
export class AutomationEngine {
  /** 轨道存储表 */
  private tracks: Map<string, AutomationTrack> = new Map();

  /** 轨道 ID 计数器 */
  private trackIdCounter: number = 0;

  /**
   * 创建自动化引擎实例
   * 初始化时可选择预创建常用轨道
   * @param createDefaultTracks - 是否创建默认常用轨道
   */
  constructor(createDefaultTracks: boolean = true) {
    if (createDefaultTracks) {
      this.createDefaultTracks();
    }
  }

  // ---------------------------------------------------------------------------
  // 内部工具方法
  // ---------------------------------------------------------------------------

  /**
   * 生成唯一轨道 ID
   * @returns 轨道 ID
   * @private
   */
  private generateTrackId(): string {
    this.trackIdCounter += 1;
    return `automation_track_${this.trackIdCounter}`;
  }

  /**
   * 确保控制点数组按时间升序排列
   * @param points - 控制点数组
   * @private
   */
  private sortPoints(points: AutomationPoint[]): void {
    points.sort((a, b) => a.time - b.time);
  }

  /**
   * 创建预设的常用自动化轨道
   * @private
   */
  private createDefaultTracks(): void {
    this.addTrack({
      id: 'volume',
      name: '主音量 (Master Volume)',
      minValue: 0,
      maxValue: 1,
      defaultValue: 0.8,
      unit: 'linear',
      points: [],
    });
    this.addTrack({
      id: 'pan',
      name: '声像 (Pan)',
      minValue: -1,
      maxValue: 1,
      defaultValue: 0,
      unit: 'pan',
      points: [],
    });
    this.addTrack({
      id: 'filterCutoff',
      name: '滤波器截止频率 (Filter Cutoff)',
      minValue: 20,
      maxValue: 20000,
      defaultValue: 20000,
      unit: 'Hz',
      points: [],
    });
    this.addTrack({
      id: 'filterResonance',
      name: '滤波器共振峰 (Filter Resonance)',
      minValue: 0,
      maxValue: 20,
      defaultValue: 1,
      unit: 'Q',
      points: [],
    });
    this.addTrack({
      id: 'reverbSend',
      name: '混响发送量 (Reverb Send)',
      minValue: 0,
      maxValue: 1,
      defaultValue: 0,
      unit: 'send',
      points: [],
    });
    this.addTrack({
      id: 'delaySend',
      name: '延迟发送量 (Delay Send)',
      minValue: 0,
      maxValue: 1,
      defaultValue: 0,
      unit: 'send',
      points: [],
    });
    this.addTrack({
      id: 'chorusAmount',
      name: '合唱深度 (Chorus Depth)',
      minValue: 0,
      maxValue: 1,
      defaultValue: 0,
      unit: 'depth',
      points: [],
    });
  }

  // ---------------------------------------------------------------------------
  // 轨道管理
  // ---------------------------------------------------------------------------

  /**
   * 添加自动化轨道
   * @param track - 轨道定义（id 可选）
   * @returns 轨道 ID
   */
  addTrack(track: Omit<AutomationTrack, 'id'> & { id?: string }): string {
    const id = track.id || this.generateTrackId();
    const newTrack: AutomationTrack = {
      ...track,
      id,
      minValue: track.minValue ?? DEFAULT_AUTOMATION_MIN,
      maxValue: track.maxValue ?? DEFAULT_AUTOMATION_MAX,
      defaultValue: track.defaultValue ?? track.minValue ?? DEFAULT_AUTOMATION_MIN,
      points: track.points ? track.points.slice() : [],
    };
    this.tracks.set(id, newTrack);
    return id;
  }

  /**
   * 移除自动化轨道
   * @param trackId - 轨道 ID
   * @returns 是否成功移除
   */
  removeTrack(trackId: string): boolean {
    return this.tracks.delete(trackId);
  }

  /**
   * 获取轨道定义
   * @param trackId - 轨道 ID
   * @returns 轨道定义或 undefined
   */
  getTrack(trackId: string): AutomationTrack | undefined {
    const track = this.tracks.get(trackId);
    return track ? { ...track, points: track.points.slice() } : undefined;
  }

  /**
   * 获取所有轨道 ID
   * @returns ID 数组
   */
  getAllTrackIds(): string[] {
    return Array.from(this.tracks.keys());
  }

  /**
   * 判断轨道是否存在
   * @param trackId - 轨道 ID
   * @returns 是否存在
   */
  hasTrack(trackId: string): boolean {
    return this.tracks.has(trackId);
  }

  /**
   * 设置轨道名称
   * @param trackId - 轨道 ID
   * @param name - 新名称
   */
  setTrackName(trackId: string, name: string): boolean {
    const track = this.tracks.get(trackId);
    if (!track) return false;
    track.name = name;
    return true;
  }

  /**
   * 设置轨道范围
   * @param trackId - 轨道 ID
   * @param minValue - 最小值
   * @param maxValue - 最大值
   */
  setTrackRange(trackId: string, minValue: number, maxValue: number): boolean {
    const track = this.tracks.get(trackId);
    if (!track) return false;
    track.minValue = minValue;
    track.maxValue = maxValue;
    return true;
  }

  // ---------------------------------------------------------------------------
  // 控制点 CRUD
  // ---------------------------------------------------------------------------

  /**
   * 添加自动化控制点
   * @param trackId - 轨道 ID
   * @param time - 时间（秒）
   * @param value - 参数值
   * @param curveType - 曲线类型
   * @returns 添加后的控制点索引
   */
  addAutomationPoint(
    trackId: string,
    time: number,
    value: number,
    curveType: CurveType = 'linear'
  ): number {
    const track = this.tracks.get(trackId);
    if (!track) {
      throw new Error(`自动化轨道不存在: ${trackId}`);
    }

    const clampedValue = clamp(value, track.minValue, track.maxValue);
    const point: AutomationPoint = { time, value: clampedValue, curveType };

    // 查找插入位置以保持有序
    let insertIdx = track.points.length;
    for (let i = 0; i < track.points.length; i++) {
      if (track.points[i].time > time) {
        insertIdx = i;
        break;
      }
    }
    track.points.splice(insertIdx, 0, point);

    // 如果是 bezier 类型且未提供控制点，自动生成
    if (curveType === 'bezier') {
      const prev = track.points[insertIdx - 1];
      const next = track.points[insertIdx + 1];
      const p0 = prev ? { time: prev.time, value: prev.value } : { time: time - 1, value: clampedValue };
      const p3 = next ? { time: next.time, value: next.value } : { time: time + 1, value: clampedValue };
      const [cp1, cp2] = generateDefaultControlPoints(p0, p3);
      point.cp1 = cp1;
      point.cp2 = cp2;
    }

    return insertIdx;
  }

  /**
   * 移除自动化控制点
   * @param trackId - 轨道 ID
   * @param index - 控制点索引
   * @returns 是否成功移除
   */
  removeAutomationPoint(trackId: string, index: number): boolean {
    const track = this.tracks.get(trackId);
    if (!track || index < 0 || index >= track.points.length) return false;
    track.points.splice(index, 1);
    return true;
  }

  /**
   * 更新自动化控制点
   * @param trackId - 轨道 ID
   * @param index - 控制点索引
   * @param updates - 部分更新字段
   * @returns 是否成功
   */
  updateAutomationPoint(
    trackId: string,
    index: number,
    updates: Partial<Omit<AutomationPoint, 'time'>> & { time?: number }
  ): boolean {
    const track = this.tracks.get(trackId);
    if (!track || index < 0 || index >= track.points.length) return false;

    const point = track.points[index];
    if (updates.time !== undefined) {
      point.time = updates.time;
      this.sortPoints(track.points);
    }
    if (updates.value !== undefined) {
      point.value = clamp(updates.value, track.minValue, track.maxValue);
    }
    if (updates.curveType !== undefined) {
      point.curveType = updates.curveType;
      // 更新曲线类型时重新生成默认控制点
      if (point.curveType === 'bezier' && !point.cp1) {
        const prev = track.points[index - 1];
        const next = track.points[index + 1];
        const p0 = prev ? { time: prev.time, value: prev.value } : { time: point.time - 1, value: point.value };
        const p3 = next ? { time: next.time, value: next.value } : { time: point.time + 1, value: point.value };
        const [cp1, cp2] = generateDefaultControlPoints(p0, p3);
        point.cp1 = cp1;
        point.cp2 = cp2;
      }
    }
    if (updates.cp1 !== undefined) point.cp1 = updates.cp1;
    if (updates.cp2 !== undefined) point.cp2 = updates.cp2;
    return true;
  }

  /**
   * 获取指定轨道的所有控制点
   * @param trackId - 轨道 ID
   * @returns 控制点数组深拷贝
   */
  getAutomationPoints(trackId: string): AutomationPoint[] {
    const track = this.tracks.get(trackId);
    if (!track) return [];
    return track.points.map((p) => ({ ...p, cp1: p.cp1 ? { ...p.cp1 } : undefined, cp2: p.cp2 ? { ...p.cp2 } : undefined }));
  }

  // ---------------------------------------------------------------------------
  // 插值查询
  // ---------------------------------------------------------------------------

  /**
   * 获取指定时刻的自动化参数值
   * 根据前后控制点进行插值计算
   * @param trackId - 轨道 ID
   * @param time - 时间（秒）
   * @returns 插值后的参数值；轨道不存在或无时返回默认值
   */
  getValueAtTime(trackId: string, time: number): number {
    const track = this.tracks.get(trackId);
    if (!track) return 0;
    if (track.points.length === 0) return track.defaultValue;

    // 早于第一个点
    if (time <= track.points[0].time) {
      return track.points[0].value;
    }
    // 晚于最后一个点
    if (time >= track.points[track.points.length - 1].time) {
      return track.points[track.points.length - 1].value;
    }

    // 查找所在区间
    for (let i = 0; i < track.points.length - 1; i++) {
      const curr = track.points[i];
      const next = track.points[i + 1];
      if (time >= curr.time && time < next.time) {
        const duration = next.time - curr.time;
        if (duration <= 0) return curr.value;
        const t = (time - curr.time) / duration;

        switch (curr.curveType) {
          case 'step':
            return curr.value;
          case 'bezier': {
            const p0 = { x: curr.time, y: curr.value };
            const p3 = { x: next.time, y: next.value };
            const cp1 = curr.cp1 || { t: lerp(curr.time, next.time, BEZIER_SMOOTHNESS), v: curr.value };
            const cp2 = curr.cp2 || { t: lerp(curr.time, next.time, 1 - BEZIER_SMOOTHNESS), v: next.value };
            return bezierValueAtX(p0, { x: cp1.t, y: cp1.v }, { x: cp2.t, y: cp2.v }, p3, time);
          }
          case 'linear':
          default:
            return lerp(curr.value, next.value, t);
        }
      }
    }

    return track.defaultValue;
  }

  /**
   * 生成指定时间范围的自动化数据点数组
   * 用于前端曲线绘制或参数自动化采样
   * @param trackId - 轨道 ID
   * @param startTime - 起始时间（秒）
   * @param endTime - 结束时间（秒）
   * @param resolution - 分辨率（每秒采样点数）
   * @returns 采样数据数组
   */
  getAutomationData(
    trackId: string,
    startTime: number,
    endTime: number,
    resolution: number
  ): AutomationSample[] {
    const track = this.tracks.get(trackId);
    if (!track) return [];

    const s = Math.min(startTime, endTime);
    const e = Math.max(startTime, endTime);
    const res = Math.max(1, resolution);
    const samples: AutomationSample[] = [];

    const totalSamples = Math.max(1, Math.ceil((e - s) * res));
    for (let i = 0; i <= totalSamples; i++) {
      const t = s + (i / totalSamples) * (e - s);
      const value = this.getValueAtTime(trackId, t);
      samples.push({ time: t, value });
    }

    return samples;
  }

  // ---------------------------------------------------------------------------
  // 复制与清空
  // ---------------------------------------------------------------------------

  /**
   * 复制自动化数据从源轨道到目标轨道
   * 覆盖目标轨道的所有控制点，保留目标轨道的范围定义
   * @param sourceTrackId - 源轨道 ID
   * @param targetTrackId - 目标轨道 ID
   * @returns 是否成功
   */
  copyAutomation(sourceTrackId: string, targetTrackId: string): boolean {
    const source = this.tracks.get(sourceTrackId);
    const target = this.tracks.get(targetTrackId);
    if (!source || !target) return false;

    target.points = source.points.map((p) => ({
      ...p,
      cp1: p.cp1 ? { ...p.cp1 } : undefined,
      cp2: p.cp2 ? { ...p.cp2 } : undefined,
    }));
    return true;
  }

  /**
   * 清空指定轨道的所有自动化控制点
   * @param trackId - 轨道 ID
   * @returns 是否成功
   */
  clearAutomation(trackId: string): boolean {
    const track = this.tracks.get(trackId);
    if (!track) return false;
    track.points = [];
    return true;
  }

  /**
   * 清空所有轨道的自动化数据
   */
  clearAllAutomation(): void {
    for (const track of this.tracks.values()) {
      track.points = [];
    }
  }

  // ---------------------------------------------------------------------------
  // 批量操作
  // ---------------------------------------------------------------------------

  /**
   * 在时间轴上平移自动化控制点
   * @param trackId - 轨道 ID
   * @param offsetSeconds - 时间偏移量（秒，正数向后，负数向前）
   * @param startTime - 仅偏移大于等于此时间的点（可选）
   * @returns 被偏移的点数
   */
  shiftAutomation(trackId: string, offsetSeconds: number, startTime?: number): number {
    const track = this.tracks.get(trackId);
    if (!track) return 0;
    let count = 0;
    for (const point of track.points) {
      if (startTime !== undefined && point.time < startTime) continue;
      point.time += offsetSeconds;
      if (point.cp1) point.cp1.t += offsetSeconds;
      if (point.cp2) point.cp2.t += offsetSeconds;
      count++;
    }
    this.sortPoints(track.points);
    return count;
  }

  /**
   * 缩放自动化数值范围
   * @param trackId - 轨道 ID
   * @param scale - 缩放比例
   * @param center - 缩放中心值（默认取当前中点）
   * @returns 是否成功
   */
  scaleAutomationValues(trackId: string, scale: number, center?: number): boolean {
    const track = this.tracks.get(trackId);
    if (!track) return false;
    const c = center !== undefined ? center : (track.minValue + track.maxValue) / 2;
    for (const point of track.points) {
      point.value = clamp((point.value - c) * scale + c, track.minValue, track.maxValue);
    }
    return true;
  }
}

// =============================================================================
// 包络生成器（Envelope Generator）
// =============================================================================

/**
 * ADSR + 多阶段包络生成器
 * 支持 Delay、Attack、Hold、Decay、Sustain、Release 及结束后阶段，
 * 可逐样本生成包络电平，用于振幅、滤波器等参数调制。
 * @class EnvelopeGenerator
 */
export class EnvelopeGenerator {
  /** 当前阶段 */
  private stage: EnvelopeStage = EnvelopeStage.Idle;

  /** 当前电平 */
  private currentLevel: number = 0;

  /** 目标电平（用于阶段内计算） */
  private targetLevel: number = 0;

  /** 阶段起始电平 */
  private stageStartLevel: number = 0;

  /** 阶段内已消耗时间（秒） */
  private stageTime: number = 0;

  /** 配置参数 */
  private config: EnvelopeConfig;

  /** 采样率 */
  private sampleRate: number = SAMPLE_RATE;

  /** 释放触发时的电平 */
  private releaseStartLevel: number = 0;

  /** 是否已触发 */
  private triggered: boolean = false;

  /**
   * 创建包络生成器
   * @param config - 部分配置，未提供字段使用默认值
   * @param sampleRate - 采样率
   */
  constructor(config?: Partial<EnvelopeConfig>, sampleRate: number = SAMPLE_RATE) {
    this.sampleRate = Math.max(1, sampleRate);
    this.config = {
      delayTime: 0,
      attackTime: 0.01,
      holdTime: 0,
      decayTime: 0.3,
      sustainLevel: 0.7,
      releaseTime: 0.5,
      attackCurve: 'linear',
      decayCurve: 'linear',
      releaseCurve: 'linear',
      initialLevel: 0,
      peakLevel: 1,
      ...config,
    };
    this.currentLevel = this.config.initialLevel;
  }

  /**
   * 触发包络（Note On）
   * 从 Idle 进入 Delay -> Attack -> ... 流程
   */
  trigger(): void {
    this.triggered = true;
    this.stage = this.config.delayTime > 0 ? EnvelopeStage.Delay : EnvelopeStage.Attack;
    this.stageTime = 0;
    this.stageStartLevel = this.currentLevel;
    if (this.stage === EnvelopeStage.Attack) {
      this.targetLevel = this.config.peakLevel;
    }
  }

  /**
   * 释放包络（Note Off）
   * 进入 Release 阶段
   */
  release(): void {
    if (!this.triggered) return;
    this.triggered = false;
    this.stage = EnvelopeStage.Release;
    this.stageTime = 0;
    this.releaseStartLevel = this.currentLevel;
  }

  /**
   * 重置包络到初始状态
   */
  reset(): void {
    this.stage = EnvelopeStage.Idle;
    this.currentLevel = this.config.initialLevel;
    this.stageTime = 0;
    this.triggered = false;
  }

  /**
   * 设置包络配置
   * @param config - 部分配置更新
   */
  setConfig(config: Partial<EnvelopeConfig>): void {
    Object.assign(this.config, config);
  }

  /**
   * 获取当前配置
   * @returns 当前配置深拷贝
   */
  getConfig(): EnvelopeConfig {
    return { ...this.config };
  }

  /**
   * 获取当前阶段
   * @returns 包络阶段
   */
  getCurrentStage(): EnvelopeStage {
    return this.stage;
  }

  /**
   * 获取当前电平
   * @returns 当前电平值
   */
  getCurrentLevel(): number {
    return this.currentLevel;
  }

  /**
   * 判断包络是否处于活动状态（非 Idle/PostRelease）
   * @returns 是否活动
   */
  isActive(): boolean {
    return this.stage !== EnvelopeStage.Idle && this.stage !== EnvelopeStage.PostRelease;
  }

  /**
   * 生成下一个样本的包络电平
   * 调用一次前进一个采样点，应在音频回调中逐样本调用
   * @returns 当前样本的包络电平
   */
  processSample(): number {
    const dt = 1 / this.sampleRate;
    this.stageTime += dt;

    switch (this.stage) {
      case EnvelopeStage.Idle:
        this.currentLevel = this.config.initialLevel;
        break;

      case EnvelopeStage.Delay:
        this.currentLevel = this.config.initialLevel;
        if (this.stageTime >= this.config.delayTime) {
          this.stage = EnvelopeStage.Attack;
          this.stageTime = 0;
          this.stageStartLevel = this.currentLevel;
          this.targetLevel = this.config.peakLevel;
        }
        break;

      case EnvelopeStage.Attack: {
        const atkProgress = this.config.attackTime > 0 ? this.stageTime / this.config.attackTime : 1;
        const t = clamp(atkProgress, 0, 1);
        this.currentLevel = this.interpolateLevel(
          this.stageStartLevel,
          this.targetLevel,
          t,
          this.config.attackCurve
        );
        if (t >= 1) {
          this.stage = this.config.holdTime > 0 ? EnvelopeStage.Hold : EnvelopeStage.Decay;
          this.stageTime = 0;
          this.stageStartLevel = this.currentLevel;
        }
        break;
      }

      case EnvelopeStage.Hold:
        this.currentLevel = this.config.peakLevel;
        if (this.stageTime >= this.config.holdTime) {
          this.stage = EnvelopeStage.Decay;
          this.stageTime = 0;
          this.stageStartLevel = this.currentLevel;
        }
        break;

      case EnvelopeStage.Decay: {
        const decayProgress = this.config.decayTime > 0 ? this.stageTime / this.config.decayTime : 1;
        const t = clamp(decayProgress, 0, 1);
        this.currentLevel = this.interpolateLevel(
          this.stageStartLevel,
          this.config.sustainLevel,
          t,
          this.config.decayCurve
        );
        if (t >= 1) {
          this.stage = EnvelopeStage.Sustain;
          this.stageTime = 0;
        }
        break;
      }

      case EnvelopeStage.Sustain:
        this.currentLevel = this.config.sustainLevel;
        // Sustain 阶段持续直到 release() 被调用
        break;

      case EnvelopeStage.Release: {
        const relProgress = this.config.releaseTime > 0 ? this.stageTime / this.config.releaseTime : 1;
        const t = clamp(relProgress, 0, 1);
        this.currentLevel = this.interpolateLevel(
          this.releaseStartLevel,
          this.config.initialLevel,
          t,
          this.config.releaseCurve
        );
        if (t >= 1) {
          this.stage = EnvelopeStage.PostRelease;
          this.stageTime = 0;
          this.currentLevel = this.config.initialLevel;
        }
        break;
      }

      case EnvelopeStage.PostRelease:
        this.currentLevel = this.config.initialLevel;
        break;
    }

    return this.currentLevel;
  }

  /**
   * 批量处理多个样本，返回电平数组
   * @param numSamples - 样本数
   * @returns 电平数组
   */
  processBlock(numSamples: number): Float32Array {
    const block = new Float32Array(numSamples);
    for (let i = 0; i < numSamples; i++) {
      block[i] = this.processSample();
    }
    return block;
  }

  /**
   * 内部电平插值
   * @param start - 起始电平
   * @param end - 目标电平
   * @param t - 进度（0~1）
   * @param curve - 曲线类型
   * @returns 插值电平
   * @private
   */
  private interpolateLevel(start: number, end: number, t: number, curve: CurveType): number {
    switch (curve) {
      case 'exponential': {
        // 指数映射：更快接近目标
        const expT = t === 0 ? 0 : Math.pow(t, 0.5);
        return lerp(start, end, expT);
      }
      case 'bezier':
        // 使用 smoothstep 近似贝塞尔
        return lerp(start, end, t * t * (3 - 2 * t));
      case 'step':
        return t >= 1 ? end : start;
      case 'linear':
      default:
        return lerp(start, end, t);
    }
  }
}

// =============================================================================
// 低频振荡器（LFO）
// =============================================================================

/**
 * 低频振荡器，用于生成周期性调制信号
 * 支持正弦、三角、方波、锯齿、采样保持等波形，可同步宿主速度。
 * @class LFO
 */
export class LFO {
  /** 当前相位（0~1） */
  private phase: number = 0;

  /** 当前采样保持值 */
  private sampleHoldValue: number = 0;

  /** 上次触发采样保持的相位 */
  private lastSampleHoldPhase: number = -1;

  /** 配置 */
  private config: LFOConfig;

  /** 采样率 */
  private sampleRate: number = SAMPLE_RATE;

  /** 当前输出值缓存 */
  private currentValue: number = 0;

  /**
   * 创建 LFO 实例
   * @param config - 部分配置
   * @param sampleRate - 采样率
   */
  constructor(config?: Partial<LFOConfig>, sampleRate: number = SAMPLE_RATE) {
    this.sampleRate = Math.max(1, sampleRate);
    this.config = {
      waveform: LFOWaveform.Sine,
      frequency: DEFAULT_LFO_FREQUENCY,
      amplitude: DEFAULT_LFO_AMPLITUDE,
      phaseOffset: DEFAULT_LFO_PHASE,
      centerValue: 0,
      syncToHost: false,
      syncNoteValue: 0.25,
      ...config,
    };
  }

  /**
   * 设置配置
   * @param config - 部分配置更新
   */
  setConfig(config: Partial<LFOConfig>): void {
    Object.assign(this.config, config);
  }

  /**
   * 获取当前配置
   * @returns 配置深拷贝
   */
  getConfig(): LFOConfig {
    return { ...this.config };
  }

  /**
   * 重置相位
   * @param phase - 新相位（0~1），默认 0
   */
  reset(phase: number = 0): void {
    this.phase = clamp(phase, 0, 1);
    this.lastSampleHoldPhase = -1;
    this.updateValue();
  }

  /**
   * 设置频率
   * @param freq - 频率（Hz）
   */
  setFrequency(freq: number): void {
    this.config.frequency = Math.max(0, freq);
  }

  /**
   * 设置振幅
   * @param amp - 振幅
   */
  setAmplitude(amp: number): void {
    this.config.amplitude = amp;
  }

  /**
   * 获取当前输出值
   * @returns 当前值
   */
  getValue(): number {
    return this.currentValue;
  }

  /**
   * 获取当前相位
   * @returns 相位（0~1）
   */
  getPhase(): number {
    return this.phase;
  }

  /**
   * 同步到宿主 BPM
   * @param bpm - 宿主 BPM
   * @param noteValue - 音符时值比例（1=全音符, 0.25=四分音符, 0.125=八分音符...）
   */
  syncToBPM(bpm: number, noteValue: number = 0.25): void {
    if (bpm <= 0) return;
    // 频率 = BPM / 60 * noteValue
    // 例如 120 BPM, 四分音符: 120/60 * 1 = 2 Hz
    this.config.frequency = (bpm / 60) * noteValue;
    this.config.syncToHost = true;
    this.config.syncNoteValue = noteValue;
  }

  /**
   * 处理单个采样步进
   * 更新相位并重新计算输出值
   * @returns 当前输出值
   */
  processSample(): number {
    const phaseIncrement = this.config.frequency / this.sampleRate;
    this.phase += phaseIncrement;
    while (this.phase >= 1) {
      this.phase -= 1;
    }
    this.updateValue();
    return this.currentValue;
  }

  /**
   * 批量处理多个样本
   * @param numSamples - 样本数
   * @returns 输出值数组
   */
  processBlock(numSamples: number): Float32Array {
    const block = new Float32Array(numSamples);
    for (let i = 0; i < numSamples; i++) {
      block[i] = this.processSample();
    }
    return block;
  }

  /**
   * 更新当前输出值（根据波形类型）
   * @private
   */
  private updateValue(): void {
    const p = this.phase + this.config.phaseOffset / (2 * Math.PI);
    const wrapped = p - Math.floor(p);
    const wave = this.computeWaveform(wrapped);
    this.currentValue = this.config.centerValue + wave * this.config.amplitude;
  }

  /**
   * 根据波形类型计算归一化波形值（-1~1）
   * @param phase01 - 归一化相位（0~1）
   * @returns 波形值（-1~1）
   * @private
   */
  private computeWaveform(phase01: number): number {
    const p = clamp(phase01, 0, 1);
    switch (this.config.waveform) {
      case LFOWaveform.Sine:
        return Math.sin(p * 2 * Math.PI);

      case LFOWaveform.Triangle: {
        // 三角波：0->1 线性上升，1->0 线性下降
        if (p < 0.25) return p / 0.25;
        if (p < 0.75) return 1 - (p - 0.25) / 0.25;
        return -1 + (p - 0.75) / 0.25;
      }

      case LFOWaveform.Square:
        return p < 0.5 ? 1 : -1;

      case LFOWaveform.Sawtooth:
        return p * 2 - 1;

      case LFOWaveform.SampleAndHold: {
        // 每次相位回绕时更新随机值
        const phaseInt = Math.floor(p * 10); // 细分相位用于检测变化
        if (phaseInt !== this.lastSampleHoldPhase) {
          this.sampleHoldValue = Math.random() * 2 - 1;
          this.lastSampleHoldPhase = phaseInt;
        }
        return this.sampleHoldValue;
      }

      default:
        return Math.sin(p * 2 * Math.PI);
    }
  }
}

// =============================================================================
// 辅助函数
// =============================================================================

/**
 * 将线性自动化值映射到对数频率（用于滤波器截止频率等）
 * @param normalized - 归一化值（0~1）
 * @param minFreq - 最低频率
 * @param maxFreq - 最高频率
 * @returns 频率值（Hz）
 */
export function mapToLogFrequency(normalized: number, minFreq: number = 20, maxFreq: number = 20000): number {
  const t = clamp(normalized, 0, 1);
  return minFreq * Math.pow(maxFreq / minFreq, t);
}

/**
 * 将频率映射回归一化线性值
 * @param freq - 频率（Hz）
 * @param minFreq - 最低频率
 * @param maxFreq - 最高频率
 * @returns 归一化值（0~1）
 */
export function mapFromLogFrequency(freq: number, minFreq: number = 20, maxFreq: number = 20000): number {
  const f = clamp(freq, minFreq, maxFreq);
  return Math.log(f / minFreq) / Math.log(maxFreq / minFreq);
}

/**
 * 将声像值（-1~1）转换为左右声道增益
 * @param pan - 声像值（-1=全左，0=居中，1=全右）
 * @returns [左增益, 右增益]
 */
export function panToGain(pan: number): [number, number] {
  const p = clamp(pan, -1, 1);
  // 使用等功率声像法则（constant power panning）
  const angle = (p + 1) * (Math.PI / 4);
  const left = Math.cos(angle);
  const right = Math.sin(angle);
  return [left, right];
}

/**
 * 生成自动化斜坡（线性）
 * @param startValue - 起始值
 * @param endValue - 结束值
 * @param duration - 持续时间（秒）
 * @param sampleRate - 采样率
 * @returns 斜坡采样数组
 */
export function generateRamp(startValue: number, endValue: number, duration: number, sampleRate: number = SAMPLE_RATE): Float32Array {
  const len = Math.max(1, Math.floor(duration * sampleRate));
  const ramp = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / (len - 1 || 1);
    ramp[i] = lerp(startValue, endValue, t);
  }
  return ramp;
}

/**
 * 生成自动化阶梯（步进）
 * @param steps - 阶梯值数组
 * @param stepDuration - 每阶持续时间（秒）
 * @param sampleRate - 采样率
 * @returns 阶梯采样数组
 */
export function generateStep(steps: number[], stepDuration: number, sampleRate: number = SAMPLE_RATE): Float32Array {
  if (steps.length === 0) return new Float32Array(0);
  const stepSamples = Math.max(1, Math.floor(stepDuration * sampleRate));
  const totalLen = steps.length * stepSamples;
  const result = new Float32Array(totalLen);
  for (let s = 0; s < steps.length; s++) {
    for (let i = 0; i < stepSamples; i++) {
      result[s * stepSamples + i] = steps[s];
    }
  }
  return result;
}

// =============================================================================
// 自动化预设与批量工具
// =============================================================================

/**
 * 包络预设配置集合
 * 提供常见乐器类型的 ADSR 起点参数
 */
export const ENVELOPE_PRESETS: Record<string, Partial<EnvelopeConfig>> = {
  /** 钢琴风格：快 Attack，短 Decay，低 Sustain */
  piano: {
    attackTime: 0.005,
    holdTime: 0.01,
    decayTime: 0.4,
    sustainLevel: 0.2,
    releaseTime: 0.3,
    attackCurve: 'exponential',
    decayCurve: 'exponential',
    releaseCurve: 'linear',
  },
  /** 弦乐风格：慢 Attack，长 Decay，高 Sustain */
  strings: {
    attackTime: 0.3,
    holdTime: 0.1,
    decayTime: 0.5,
    sustainLevel: 0.8,
    releaseTime: 0.8,
    attackCurve: 'linear',
    decayCurve: 'linear',
    releaseCurve: 'linear',
  },
  /** 风琴风格：极快 Attack，无 Decay，全 Sustain */
  organ: {
    attackTime: 0.01,
    holdTime: 0,
    decayTime: 0.05,
    sustainLevel: 1.0,
    releaseTime: 0.1,
    attackCurve: 'linear',
    decayCurve: 'linear',
    releaseCurve: 'linear',
  },
  /** 打击乐风格：极快 Attack，无 Sustain，短 Release */
  pluck: {
    attackTime: 0.001,
    holdTime: 0,
    decayTime: 0.3,
    sustainLevel: 0.0,
    releaseTime: 0.05,
    attackCurve: 'exponential',
    decayCurve: 'exponential',
    releaseCurve: 'exponential',
  },
  /** 铜管风格：中等 Attack，高 Sustain */
  brass: {
    attackTime: 0.05,
    holdTime: 0.05,
    decayTime: 0.2,
    sustainLevel: 0.9,
    releaseTime: 0.4,
    attackCurve: 'bezier',
    decayCurve: 'linear',
    releaseCurve: 'linear',
  },
  /**  pad 风格：极慢 Attack，长 Release */
  pad: {
    attackTime: 1.0,
    holdTime: 0.2,
    decayTime: 1.0,
    sustainLevel: 0.7,
    releaseTime: 2.0,
    attackCurve: 'linear',
    decayCurve: 'linear',
    releaseCurve: 'linear',
  },
};

/**
 * LFO 预设配置集合
 */
export const LFO_PRESETS: Record<string, Partial<LFOConfig>> = {
  /** 慢速正弦颤音（适用于音量/音高微调） */
  slowVibrato: {
    waveform: LFOWaveform.Sine,
    frequency: 5,
    amplitude: 0.1,
    centerValue: 0,
  },
  /** 快速颤音 */
  fastVibrato: {
    waveform: LFOWaveform.Sine,
    frequency: 15,
    amplitude: 0.15,
    centerValue: 0,
  },
  /** 滤波器扫描（三角波慢速） */
  filterSweep: {
    waveform: LFOWaveform.Triangle,
    frequency: 0.5,
    amplitude: 0.5,
    centerValue: 0.5,
  },
  /** 采样保持（随机调制） */
  randomMod: {
    waveform: LFOWaveform.SampleAndHold,
    frequency: 8,
    amplitude: 0.3,
    centerValue: 0,
  },
  /** 锯齿下降（用于节奏性效果） */
  rhythmicFall: {
    waveform: LFOWaveform.Sawtooth,
    frequency: 2,
    amplitude: 0.5,
    centerValue: 0.5,
  },
};

/**
 * 批量创建多条自动化斜坡
 * 常用于在多个轨道同时创建同步的淡入淡出
 * @param engine - 自动化引擎实例
 * @param trackIds - 目标轨道 ID 数组
 * @param startTime - 起始时间（秒）
 * @param endTime - 结束时间（秒）
 * @param startValues - 起始值数组（与 trackIds 一一对应）
 * @param endValues - 结束值数组
 * @param curveType - 曲线类型
 * @returns 是否全部成功
 */
export function batchAddRamps(
  engine: AutomationEngine,
  trackIds: string[],
  startTime: number,
  endTime: number,
  startValues: number[],
  endValues: number[],
  curveType: CurveType = 'linear'
): boolean {
  if (trackIds.length !== startValues.length || trackIds.length !== endValues.length) {
    return false;
  }
  let allSuccess = true;
  for (let i = 0; i < trackIds.length; i++) {
    try {
      engine.addAutomationPoint(trackIds[i], startTime, startValues[i], curveType);
      engine.addAutomationPoint(trackIds[i], endTime, endValues[i], curveType);
    } catch {
      allSuccess = false;
    }
  }
  return allSuccess;
}

/**
 * 自动化剪辑（Automation Clip）辅助类
 * 用于将一段自动化数据作为可复用的"片段"进行管理和实例化
 * @class AutomationClip
 */
export class AutomationClip {
  /** 片段名称 */
  name: string;
  /** 片段持续时间（秒） */
  duration: number;
  /** 采样分辨率（每秒点数） */
  resolution: number;
  /** 采样数据 */
  samples: AutomationSample[];

  /**
   * 创建自动化剪辑
   * @param name - 名称
   * @param samples - 采样数据数组
   */
  constructor(name: string, samples: AutomationSample[]) {
    this.name = name;
    this.samples = samples.slice();
    if (this.samples.length > 0) {
      this.duration = this.samples[this.samples.length - 1].time - this.samples[0].time;
      this.resolution = this.samples.length / (this.duration || 1);
    } else {
      this.duration = 0;
      this.resolution = 100;
    }
  }

  /**
   * 从引擎轨道提取剪辑
   * @param engine - 自动化引擎
   * @param trackId - 轨道 ID
   * @param startTime - 起始时间
   * @param endTime - 结束时间
   * @param resolution - 分辨率
   * @returns 自动化剪辑实例
   */
  static fromTrack(
    engine: AutomationEngine,
    trackId: string,
    startTime: number,
    endTime: number,
    resolution: number = 100
  ): AutomationClip {
    const samples = engine.getAutomationData(trackId, startTime, endTime, resolution);
    return new AutomationClip(`${trackId}_clip`, samples);
  }

  /**
   * 获取剪辑在指定本地时间处的值（循环读取）
   * @param localTime - 相对于剪辑起始的时间
   * @returns 插值后的值；空剪辑返回 0
   */
  getValueAt(localTime: number): number {
    if (this.samples.length === 0) return 0;
    const loopedTime = localTime % this.duration;
    // 二分查找最近样本
    let low = 0;
    let high = this.samples.length - 1;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (this.samples[mid].time < loopedTime) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    const idx = Math.max(1, low);
    const prev = this.samples[idx - 1];
    const curr = this.samples[idx];
    const dt = curr.time - prev.time;
    if (dt <= 0) return prev.value;
    const t = (loopedTime - prev.time) / dt;
    return lerp(prev.value, curr.value, t);
  }

  /**
   * 将剪辑实例化到引擎轨道（平铺写入）
   * @param engine - 自动化引擎
   * @param trackId - 目标轨道 ID
   * @param startTime - 目标起始时间
   * @param repeatCount - 重复次数（默认 1）
   */
  instantiate(engine: AutomationEngine, trackId: string, startTime: number, repeatCount: number = 1): void {
    if (!engine.hasTrack(trackId)) return;
    for (let r = 0; r < repeatCount; r++) {
      const offset = startTime + r * this.duration;
      for (const sample of this.samples) {
        engine.addAutomationPoint(trackId, offset + sample.time, sample.value, 'linear');
      }
    }
  }
}

// =============================================================================
// 默认导出
// =============================================================================

export default AutomationEngine;
