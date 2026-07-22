/**
 * @file waveEditor.ts
 * @description 青鸾数字音频工作站 - 波形编辑器核心模块
 * 提供音频波形的加载、剪切、复制、粘贴、淡入淡出、时间拉伸、音高变换、
 * 标准化、反相、过零点检测等音频编辑功能，同时支持峰值与 RMS 数据提取供前端渲染。
 * @module qingluan-daw/editors/waveEditor
 * @version 2.0.0
 */

import { clamp, lerp, hannWindow, normalizeBuffer, panToGain } from '../utils/audioUtils.js';

// =============================================================================
// 常量定义
// =============================================================================

/** 统一采样率：44100 Hz */
export const SAMPLE_RATE = 44100;

/** 最大振幅（32 位浮点标准） */
export const MAX_AMPLITUDE = 1.0;

/** 最小可识别振幅（避免除零） */
export const MIN_AMPLITUDE = 1e-10;

/** 默认淡入淡出曲线类型 */
export const DEFAULT_FADE_CURVE = 'linear';

/** 时间拉伸默认窗口大小（样本数） */
export const DEFAULT_STRETCH_WINDOW = 2048;

/** 时间拉伸默认重叠率（0~1） */
export const DEFAULT_STRETCH_OVERLAP = 0.5;

/** 音高变换默认窗口大小 */
export const DEFAULT_PITCH_WINDOW = 2048;

// =============================================================================
// 类型定义
// =============================================================================

/**
 * 淡入淡出曲线类型
 * - linear: 线性
 * - logarithmic: 对数
 * - exponential: 指数
 * - scurve: S 型曲线（Sigmoid）
 * - cosine: 余弦缓动
 */
export type FadeCurve = 'linear' | 'logarithmic' | 'exponential' | 'scurve' | 'cosine';

/**
 * 波形峰值数据点
 * @interface PeakData
 */
export interface PeakData {
  /** 样本索引 */
  index: number;
  /** 最大正值 */
  max: number;
  /** 最小负值 */
  min: number;
  /** 绝对峰值 */
  absPeak: number;
}

/**
 * RMS 数据点
 * @interface RMSData
 */
export interface RMSData {
  /** 块起始样本索引 */
  index: number;
  /** RMS 值 */
  rms: number;
  /** 块内最大振幅 */
  peak: number;
}

/**
 * 过零点信息
 * @interface ZeroCrossing
 */
export interface ZeroCrossing {
  /** 过零点样本索引（插值后的浮点位置） */
  position: number;
  /** 过零点方向：1 表示负到正，-1 表示正到负 */
  direction: number;
}

/**
 * 编辑区域标记
 * @interface RegionMarker
 */
export interface RegionMarker {
  /** 区域起始样本 */
  startSample: number;
  /** 区域结束样本 */
  endSample: number;
  /** 区域名称 */
  name?: string;
  /** 区域颜色 */
  color?: string;
}

/**
 * 音频统计信息
 * @interface AudioStatistics
 */
export interface AudioStatistics {
  /** 样本总数 */
  length: number;
  /** 时长（秒） */
  duration: number;
  /** 最大振幅 */
  peakAmplitude: number;
  /** 最小振幅 */
  minAmplitude: number;
  /** 平均绝对值 */
  averageAbs: number;
  /** DC 偏移量 */
  dcOffset: number;
  /** RMS 值 */
  rms: number;
}

// =============================================================================
// 曲线函数
// =============================================================================

/**
 * 计算线性曲线增益值
 * @param t - 归一化时间（0~1）
 * @returns 增益值（0~1）
 */
function linearCurve(t: number): number {
  return clamp(t, 0, 1);
}

/**
 * 计算对数曲线增益值
 * 对数淡入：起始快速上升，末尾缓慢；对数淡出需反向使用
 * @param t - 归一化时间（0~1）
 * @returns 增益值
 */
function logarithmicCurve(t: number): number {
  const c = clamp(t, 0, 1);
  // 使用 log10 映射：t=0 时为 0，t=1 时为 1
  return Math.log10(1 + c * 9) / Math.log10(10);
}

/**
 * 计算指数曲线增益值
 * 指数淡入：起始缓慢，末尾快速上升
 * @param t - 归一化时间（0~1）
 * @returns 增益值
 */
function exponentialCurve(t: number): number {
  const c = clamp(t, 0, 1);
  return (Math.exp(c * Math.log(101)) - 1) / 100;
}

/**
 * 计算 S 型曲线（Sigmoid）增益值
 * 淡入淡出均呈现平滑的 S 形过渡
 * @param t - 归一化时间（0~1）
 * @returns 增益值
 */
function scurveCurve(t: number): number {
  const c = clamp(t, 0, 1);
  // 平滑的 S 型：3t^2 - 2t^3（smoothstep）
  return c * c * (3 - 2 * c);
}

/**
 * 计算余弦缓动曲线
 * @param t - 归一化时间（0~1）
 * @returns 增益值
 */
function cosineCurve(t: number): number {
  const c = clamp(t, 0, 1);
  return (1 - Math.cos(c * Math.PI)) / 2;
}

/**
 * 根据曲线类型获取对应的增益函数
 * @param curve - 曲线类型字符串
 * @returns 增益计算函数
 */
function getFadeCurveFunction(curve: FadeCurve): (t: number) => number {
  switch (curve) {
    case 'linear':
      return linearCurve;
    case 'logarithmic':
      return logarithmicCurve;
    case 'exponential':
      return exponentialCurve;
    case 'scurve':
      return scurveCurve;
    case 'cosine':
      return cosineCurve;
    default:
      return linearCurve;
  }
}

// =============================================================================
// 波形编辑器主类
// =============================================================================

/**
 * 波形编辑器核心类，负责音频样本的加载、编辑与效果处理
 * @class WaveEditor
 */
export class WaveEditor {
  /** 当前音频缓冲区 */
  private buffer: Float32Array = new Float32Array(0);

  /** 当前缓冲区长度（样本数） */
  private length: number = 0;

  /** 剪贴板（用于复制粘贴） */
  private clipboard: Float32Array = new Float32Array(0);

  /** 区域标记列表 */
  private markers: RegionMarker[] = [];

  /** 历史记录栈（深拷贝快照） */
  private history: Float32Array[] = [];

  /** 最大历史深度 */
  private maxHistoryDepth: number = 50;

  /**
   * 创建波形编辑器实例
   * @param initialBuffer - 可选的初始音频缓冲区
   */
  constructor(initialBuffer?: Float32Array) {
    if (initialBuffer && initialBuffer.length > 0) {
      this.loadBuffer(initialBuffer);
    }
  }

  // ---------------------------------------------------------------------------
  // 内部工具方法
  // ---------------------------------------------------------------------------

  /**
   * 保存当前状态到历史栈
   * @private
   */
  private saveState(): void {
    const snapshot = new Float32Array(this.buffer);
    this.history.push(snapshot);
    if (this.history.length > this.maxHistoryDepth) {
      this.history.shift();
    }
  }

  /**
   * 确保索引在有效范围内
   * @param sample - 样本索引
   * @returns 限制后的索引
   * @private
   */
  private clampIndex(sample: number): number {
    return clamp(sample, 0, this.length);
  }

  /**
   * 确保范围有效（start < end 且在边界内）
   * @param startSample - 起始样本
   * @param endSample - 结束样本
   * @returns 规范化后的 [start, end]
   * @private
   */
  private normalizeRange(startSample: number, endSample: number): [number, number] {
    const s = this.clampIndex(startSample);
    const e = this.clampIndex(endSample);
    return [Math.min(s, e), Math.max(s, e)];
  }

  /**
   * 创建新的缓冲区并替换当前缓冲区
   * @param newBuffer - 新缓冲区
   * @private
   */
  private replaceBuffer(newBuffer: Float32Array): void {
    this.buffer = newBuffer;
    this.length = newBuffer.length;
  }

  // ---------------------------------------------------------------------------
  // 基础加载与访问
  // ---------------------------------------------------------------------------

  /**
   * 加载音频缓冲区
   * @param buffer - 音频样本数组（假设为单声道 32 位浮点，范围 [-1, 1]）
   */
  loadBuffer(buffer: Float32Array): void {
    if (!buffer || buffer.length === 0) {
      this.replaceBuffer(new Float32Array(0));
      return;
    }
    this.saveState();
    this.replaceBuffer(new Float32Array(buffer));
  }

  /**
   * 获取当前缓冲区（只读副本）
   * @returns 当前音频缓冲区的深拷贝
   */
  getBuffer(): Float32Array {
    return new Float32Array(this.buffer);
  }

  /**
   * 获取缓冲区长度（样本数）
   * @returns 样本数
   */
  getLength(): number {
    return this.length;
  }

  /**
   * 获取音频时长（秒）
   * @returns 秒数
   */
  getDuration(): number {
    return this.length / SAMPLE_RATE;
  }

  /**
   * 获取指定样本值
   * @param index - 样本索引
   * @returns 样本值，越界返回 0
   */
  getSample(index: number): number {
    if (index < 0 || index >= this.length) return 0;
    return this.buffer[index];
  }

  /**
   * 设置指定样本值
   * @param index - 样本索引
   * @param value - 新值
   */
  setSample(index: number, value: number): void {
    if (index < 0 || index >= this.length) return;
    this.buffer[index] = value;
  }

  // ---------------------------------------------------------------------------
  // 剪切/复制/粘贴/删除/裁剪
  // ---------------------------------------------------------------------------

  /**
   * 剪切指定范围的音频
   * 将范围内容放入剪贴板，并从原缓冲区移除
   * @param startSample - 起始样本（包含）
   * @param endSample - 结束样本（不包含）
   * @returns 剪贴板内容
   */
  cut(startSample: number, endSample: number): Float32Array {
    const [s, e] = this.normalizeRange(startSample, endSample);
    if (s >= e) return new Float32Array(0);

    this.saveState();
    const cutLen = e - s;
    const cutData = new Float32Array(this.buffer.subarray(s, e));
    this.clipboard = new Float32Array(cutData);

    const newBuffer = new Float32Array(this.length - cutLen);
    newBuffer.set(this.buffer.subarray(0, s), 0);
    newBuffer.set(this.buffer.subarray(e), s);
    this.replaceBuffer(newBuffer);
    return cutData;
  }

  /**
   * 复制指定范围的音频到剪贴板
   * @param startSample - 起始样本（包含）
   * @param endSample - 结束样本（不包含）
   * @returns 复制的数据
   */
  copy(startSample: number, endSample: number): Float32Array {
    const [s, e] = this.normalizeRange(startSample, endSample);
    if (s >= e) return new Float32Array(0);
    const copied = new Float32Array(this.buffer.subarray(s, e));
    this.clipboard = copied;
    return copied;
  }

  /**
   * 在指定位置粘贴音频数据
   * @param insertSample - 插入起始样本位置
   * @param buffer - 要粘贴的音频数据（为空则粘贴剪贴板内容）
   * @returns 粘贴后的总样本数
   */
  paste(insertSample: number, buffer?: Float32Array): number {
    const src = buffer && buffer.length > 0 ? buffer : this.clipboard;
    if (src.length === 0) return this.length;

    const pos = this.clampIndex(insertSample);
    this.saveState();

    const newBuffer = new Float32Array(this.length + src.length);
    newBuffer.set(this.buffer.subarray(0, pos), 0);
    newBuffer.set(src, pos);
    newBuffer.set(this.buffer.subarray(pos), pos + src.length);
    this.replaceBuffer(newBuffer);
    return this.length;
  }

  /**
   * 删除指定范围的音频（不放入剪贴板）
   * @param startSample - 起始样本（包含）
   * @param endSample - 结束样本（不包含）
   * @returns 删除后的总样本数
   */
  delete(startSample: number, endSample: number): number {
    const [s, e] = this.normalizeRange(startSample, endSample);
    if (s >= e) return this.length;

    this.saveState();
    const deleteLen = e - s;
    const newBuffer = new Float32Array(this.length - deleteLen);
    newBuffer.set(this.buffer.subarray(0, s), 0);
    newBuffer.set(this.buffer.subarray(e), s);
    this.replaceBuffer(newBuffer);
    return this.length;
  }

  /**
   * 裁剪音频（只保留指定范围）
   * @param startSample - 保留起始样本（包含）
   * @param endSample - 保留结束样本（不包含）
   * @returns 裁剪后的缓冲区
   */
  trim(startSample: number, endSample: number): Float32Array {
    const [s, e] = this.normalizeRange(startSample, endSample);
    if (s >= e) {
      this.saveState();
      this.replaceBuffer(new Float32Array(0));
      return this.buffer;
    }

    this.saveState();
    const trimmed = new Float32Array(this.buffer.subarray(s, e));
    this.replaceBuffer(trimmed);
    return trimmed;
  }

  /**
   * 插入静音
   * @param insertSample - 插入位置
   * @param lengthSamples - 静音长度（样本数）
   */
  insertSilence(insertSample: number, lengthSamples: number): void {
    const len = Math.max(0, Math.floor(lengthSamples));
    if (len === 0) return;
    this.saveState();
    const pos = this.clampIndex(insertSample);
    const silence = new Float32Array(len);
    const newBuffer = new Float32Array(this.length + len);
    newBuffer.set(this.buffer.subarray(0, pos), 0);
    newBuffer.set(silence, pos);
    newBuffer.set(this.buffer.subarray(pos), pos + len);
    this.replaceBuffer(newBuffer);
  }

  /**
   * 获取剪贴板内容
   * @returns 剪贴板深拷贝
   */
  getClipboard(): Float32Array {
    return new Float32Array(this.clipboard);
  }

  /**
   * 清空剪贴板
   */
  clearClipboard(): void {
    this.clipboard = new Float32Array(0);
  }

  // ---------------------------------------------------------------------------
  // 淡入淡出
  // ---------------------------------------------------------------------------

  /**
   * 淡入处理
   * @param startSample - 淡入起始样本（包含）
   * @param endSample - 淡入结束样本（不包含）
   * @param curve - 曲线类型，默认 'linear'
   */
  fadeIn(startSample: number, endSample: number, curve: FadeCurve = DEFAULT_FADE_CURVE): void {
    const [s, e] = this.normalizeRange(startSample, endSample);
    if (s >= e) return;
    this.saveState();

    const curveFn = getFadeCurveFunction(curve);
    const len = e - s;
    for (let i = 0; i < len; i++) {
      const t = i / (len - 1 || 1);
      const gain = curveFn(t);
      this.buffer[s + i] *= gain;
    }
  }

  /**
   * 淡出处理
   * @param startSample - 淡出起始样本（包含）
   * @param endSample - 淡出结束样本（不包含）
   * @param curve - 曲线类型，默认 'linear'
   */
  fadeOut(startSample: number, endSample: number, curve: FadeCurve = DEFAULT_FADE_CURVE): void {
    const [s, e] = this.normalizeRange(startSample, endSample);
    if (s >= e) return;
    this.saveState();

    const curveFn = getFadeCurveFunction(curve);
    const len = e - s;
    for (let i = 0; i < len; i++) {
      const t = i / (len - 1 || 1);
      const gain = curveFn(1 - t); // 反向：从 1 衰减到 0
      this.buffer[s + i] *= gain;
    }
  }

  /**
   * 对指定范围应用增益包络（通用淡入淡出）
   * @param startSample - 起始样本
   * @param endSample - 结束样本
   * @param startGain - 起始增益（0~1+）
   * @param endGain - 结束增益（0~1+）
   * @param curve - 曲线类型
   */
  applyGainEnvelope(
    startSample: number,
    endSample: number,
    startGain: number,
    endGain: number,
    curve: FadeCurve = 'linear'
  ): void {
    const [s, e] = this.normalizeRange(startSample, endSample);
    if (s >= e) return;
    this.saveState();

    const curveFn = getFadeCurveFunction(curve);
    const len = e - s;
    for (let i = 0; i < len; i++) {
      const t = curveFn(i / (len - 1 || 1));
      const gain = lerp(startGain, endGain, t);
      this.buffer[s + i] *= gain;
    }
  }

  // ---------------------------------------------------------------------------
  // 交叉淡化
  // ---------------------------------------------------------------------------

  /**
   * 交叉淡化（Crossfade）
   * 将两段音频缓冲区的尾部与头部进行平滑过渡混合
   * @param bufferA - 第一段音频
   * @param bufferB - 第二段音频
   * @param length - 交叉淡化长度（样本数）
   * @param curve - 曲线类型
   * @returns 混合后的音频缓冲区
   */
  crossfade(
    bufferA: Float32Array,
    bufferB: Float32Array,
    length: number,
    curve: FadeCurve = 'linear'
  ): Float32Array {
    if (!bufferA || !bufferB) return new Float32Array(0);
    const fadeLen = Math.max(0, Math.min(length, bufferA.length, bufferB.length));
    if (fadeLen === 0) {
      // 无交叉淡化，直接拼接
      const result = new Float32Array(bufferA.length + bufferB.length);
      result.set(bufferA, 0);
      result.set(bufferB, bufferA.length);
      return result;
    }

    const curveFn = getFadeCurveFunction(curve);
    const headA = bufferA.subarray(0, bufferA.length - fadeLen);
    const tailA = bufferA.subarray(bufferA.length - fadeLen);
    const headB = bufferB.subarray(0, fadeLen);
    const tailB = bufferB.subarray(fadeLen);

    const result = new Float32Array(bufferA.length + bufferB.length - fadeLen);
    result.set(headA, 0);

    // 交叉淡化区域：A 淡出，B 淡入
    for (let i = 0; i < fadeLen; i++) {
      const t = i / (fadeLen - 1 || 1);
      const gainA = curveFn(1 - t);
      const gainB = curveFn(t);
      result[headA.length + i] = tailA[i] * gainA + headB[i] * gainB;
    }

    result.set(tailB, headA.length + fadeLen);
    return result;
  }

  /**
   * 在当前缓冲区尾部与另一段音频进行交叉淡化拼接
   * @param other - 另一段音频
   * @param length - 交叉淡化长度
   * @param curve - 曲线类型
   * @returns 拼接后的总长度
   */
  crossfadeAppend(other: Float32Array, length: number, curve: FadeCurve = 'linear'): number {
    const result = this.crossfade(this.buffer, other, length, curve);
    this.saveState();
    this.replaceBuffer(result);
    return this.length;
  }

  // ---------------------------------------------------------------------------
  // 时间拉伸与音高变换
  // ---------------------------------------------------------------------------

  /**
   * 简易时间拉伸（重叠相加法，Overlap-Add）
   * 改变音频时长而不改变音高，质量适合预览与简单编辑。
   * 采用固定窗口大小与 hop 大小的相位声码器简化版。
   * @param buffer - 输入音频（为空则使用当前缓冲区）
   * @param ratio - 时间比例（>1 变慢/拉长，<1 变快/压缩）
   * @param windowSize - 窗口大小，默认 2048
   * @param overlap - 重叠率，默认 0.5
   * @returns 拉伸后的音频缓冲区
   */
  timeStretch(
    buffer?: Float32Array,
    ratio: number = 1.0,
    windowSize: number = DEFAULT_STRETCH_WINDOW,
    overlap: number = DEFAULT_STRETCH_OVERLAP
  ): Float32Array {
    const src = buffer && buffer.length > 0 ? buffer : this.buffer;
    if (src.length === 0 || ratio <= 0 || Math.abs(ratio - 1) < 0.001) {
      return new Float32Array(src);
    }

    this.saveState();
    const winSize = Math.max(64, Math.pow(2, Math.round(Math.log2(windowSize))));
    const hopIn = Math.floor(winSize * (1 - clamp(overlap, 0, 0.9)));
    const hopOut = Math.round(hopIn * ratio);
    const win = hannWindow(winSize);

    const outLen = Math.max(1, Math.ceil(src.length * ratio + winSize));
    const output = new Float32Array(outLen);
    const norm = new Float32Array(outLen); // 归一化因子

    let inPos = 0;
    let outPos = 0;

    while (inPos + winSize <= src.length) {
      for (let i = 0; i < winSize; i++) {
        const sample = src[inPos + i] * win[i];
        if (outPos + i < output.length) {
          output[outPos + i] += sample;
          norm[outPos + i] += win[i];
        }
      }
      inPos += hopIn;
      outPos += hopOut;
    }

    // 归一化重叠区域
    for (let i = 0; i < output.length; i++) {
      if (norm[i] > 0.01) {
        output[i] /= norm[i];
      }
    }

    // 裁剪尾部空白
    let validEnd = output.length;
    while (validEnd > 0 && Math.abs(output[validEnd - 1]) < MIN_AMPLITUDE) {
      validEnd--;
    }
    const trimmed = output.subarray(0, validEnd + winSize);

    if (!buffer) {
      this.replaceBuffer(new Float32Array(trimmed));
    }
    return new Float32Array(trimmed);
  }

  /**
   * 简易音高变换（结合重采样与时间拉伸补偿）
   * 改变音高而不改变时长（近似），适合简单移调。
   * 实现方式：先按半音比例重采样改变音高与时长，再用时间拉伸补偿时长。
   * @param buffer - 输入音频（为空则使用当前缓冲区）
   * @param semitones - 半音偏移（正数升高，负数降低）
   * @returns 变换后的音频缓冲区
   */
  pitchShift(buffer?: Float32Array, semitones: number = 0): Float32Array {
    if (semitones === 0) return new Float32Array(buffer || this.buffer);

    const src = buffer && buffer.length > 0 ? buffer : this.buffer;
    if (src.length === 0) return new Float32Array(0);

    this.saveState();
    // 半音对应的重采样比率：2^(semitones/12)
    const resampleRatio = Math.pow(2, semitones / 12);

    // 1) 线性插值重采样
    const resampledLen = Math.max(1, Math.floor(src.length / resampleRatio));
    const resampled = new Float32Array(resampledLen);
    for (let i = 0; i < resampledLen; i++) {
      const srcPos = i * resampleRatio;
      const idx = Math.floor(srcPos);
      const frac = srcPos - idx;
      const a = src[idx] || 0;
      const b = src[idx + 1] || 0;
      resampled[i] = a + (b - a) * frac;
    }

    // 2) 时间拉伸补偿回原始时长
    const targetRatio = src.length / resampledLen;
    const result = this.timeStretch(resampled, targetRatio, DEFAULT_PITCH_WINDOW, 0.5);

    if (!buffer) {
      this.replaceBuffer(result);
    }
    return result;
  }

  // ---------------------------------------------------------------------------
  // 效果处理
  // ---------------------------------------------------------------------------

  /**
   * 标准化（Normalize）
   * 将音频峰值放大到指定目标电平（默认 0dBFS / 1.0）
   * @param targetPeak - 目标峰值（默认 1.0）
   * @returns 应用的增益倍数
   */
  normalize(targetPeak: number = MAX_AMPLITUDE): number {
    if (this.length === 0) return 1;
    this.saveState();

    let maxAmp = 0;
    for (let i = 0; i < this.length; i++) {
      const abs = Math.abs(this.buffer[i]);
      if (abs > maxAmp) maxAmp = abs;
    }

    if (maxAmp < MIN_AMPLITUDE) return 1;
    const gain = targetPeak / maxAmp;
    for (let i = 0; i < this.length; i++) {
      this.buffer[i] *= gain;
    }
    return gain;
  }

  /**
   * 反转（Reverse）
   * 将音频样本顺序倒置
   */
  reverse(): void {
    if (this.length === 0) return;
    this.saveState();
    const len = this.length;
    const mid = Math.floor(len / 2);
    for (let i = 0; i < mid; i++) {
      const temp = this.buffer[i];
      this.buffer[i] = this.buffer[len - 1 - i];
      this.buffer[len - 1 - i] = temp;
    }
  }

  /**
   * 反相（Invert Phase）
   * 将所有样本乘以 -1
   */
  invertPhase(): void {
    if (this.length === 0) return;
    this.saveState();
    for (let i = 0; i < this.length; i++) {
      this.buffer[i] = -this.buffer[i];
    }
  }

  /**
   * 移除直流偏移（DC Offset）
   * 计算整个缓冲区的平均值并从每个样本减去
   */
  dcOffset(): void {
    if (this.length === 0) return;
    this.saveState();

    let sum = 0;
    for (let i = 0; i < this.length; i++) {
      sum += this.buffer[i];
    }
    const offset = sum / this.length;
    if (Math.abs(offset) < MIN_AMPLITUDE) return;

    for (let i = 0; i < this.length; i++) {
      this.buffer[i] -= offset;
    }
  }

  /**
   * 应用增益
   * @param gain - 增益倍数（1.0 为原音量）
   * @param startSample - 起始样本（可选，默认 0）
   * @param endSample - 结束样本（可选，默认末尾）
   */
  applyGain(gain: number, startSample?: number, endSample?: number): void {
    if (this.length === 0 || gain === 1) return;
    const s = startSample !== undefined ? this.clampIndex(startSample) : 0;
    const e = endSample !== undefined ? this.clampIndex(endSample) : this.length;
    this.saveState();
    for (let i = s; i < e; i++) {
      this.buffer[i] *= gain;
    }
  }

  /**
   * 应用硬限幅（Hard Clip）
   * @param threshold - 限幅阈值（默认 1.0）
   */
  hardClip(threshold: number = MAX_AMPLITUDE): void {
    if (this.length === 0) return;
    this.saveState();
    const th = Math.max(MIN_AMPLITUDE, threshold);
    for (let i = 0; i < this.length; i++) {
      if (this.buffer[i] > th) this.buffer[i] = th;
      else if (this.buffer[i] < -th) this.buffer[i] = -th;
    }
  }

  /**
   * 应用软饱和（Soft Saturation / Tanh）
   * 使用双曲正切实现温和的非线性饱和失真
   * @param drive - 驱动量（默认 1.0，越大失真越明显）
   */
  softSaturate(drive: number = 1.0): void {
    if (this.length === 0) return;
    this.saveState();
    const d = Math.max(0.1, drive);
    for (let i = 0; i < this.length; i++) {
      this.buffer[i] = Math.tanh(this.buffer[i] * d);
    }
  }

  // ---------------------------------------------------------------------------
  // 峰值与 RMS 数据（供前端渲染）
  // ---------------------------------------------------------------------------

  /**
   * 获取波形峰值数据
   * 将音频分块，每块提取最大正值与最小负值，用于前端绘制波形缩略图
   * @param samplesPerPeak - 每个峰值块包含的样本数
   * @returns 峰值数据数组
   */
  getPeaks(samplesPerPeak: number): PeakData[] {
    if (this.length === 0 || samplesPerPeak <= 0) return [];
    const blockSize = Math.max(1, Math.floor(samplesPerPeak));
    const numBlocks = Math.ceil(this.length / blockSize);
    const peaks: PeakData[] = [];

    for (let b = 0; b < numBlocks; b++) {
      const start = b * blockSize;
      const end = Math.min(start + blockSize, this.length);
      let maxVal = -Infinity;
      let minVal = Infinity;

      for (let i = start; i < end; i++) {
        const s = this.buffer[i];
        if (s > maxVal) maxVal = s;
        if (s < minVal) minVal = s;
      }

      peaks.push({
        index: start,
        max: maxVal === -Infinity ? 0 : maxVal,
        min: minVal === Infinity ? 0 : minVal,
        absPeak: Math.max(Math.abs(maxVal), Math.abs(minVal)),
      });
    }

    return peaks;
  }

  /**
   * 获取 RMS（均方根）数据
   * 分块计算每块的 RMS 值，反映感知响度
   * @param samplesPerBlock - 每块样本数
   * @returns RMS 数据数组
   */
  getRMS(samplesPerBlock: number): RMSData[] {
    if (this.length === 0 || samplesPerBlock <= 0) return [];
    const blockSize = Math.max(1, Math.floor(samplesPerBlock));
    const numBlocks = Math.ceil(this.length / blockSize);
    const result: RMSData[] = [];

    for (let b = 0; b < numBlocks; b++) {
      const start = b * blockSize;
      const end = Math.min(start + blockSize, this.length);
      let sumSq = 0;
      let peak = 0;

      for (let i = start; i < end; i++) {
        const s = this.buffer[i];
        sumSq += s * s;
        const abs = Math.abs(s);
        if (abs > peak) peak = abs;
      }

      const count = end - start;
      const rms = count > 0 ? Math.sqrt(sumSq / count) : 0;
      result.push({
        index: start,
        rms,
        peak,
      });
    }

    return result;
  }

  /**
   * 获取过零点（Zero Crossings）
   * 检测信号从负到正或从正到负的穿越点，常用于切片、相位对齐
   * @returns 过零点数组
   */
  getZeroCrossings(): ZeroCrossing[] {
    if (this.length < 2) return [];
    const crossings: ZeroCrossing[] = [];

    for (let i = 0; i < this.length - 1; i++) {
      const curr = this.buffer[i];
      const next = this.buffer[i + 1];
      if (curr === 0) {
        // 恰好为零：根据前后符号判断方向
        const prev = i > 0 ? this.buffer[i - 1] : 0;
        if (prev < 0 && next >= 0) {
          crossings.push({ position: i, direction: 1 });
        } else if (prev > 0 && next <= 0) {
          crossings.push({ position: i, direction: -1 });
        }
      } else if (curr < 0 && next > 0) {
        // 负到正：线性插值估算精确位置
        const frac = Math.abs(curr) / (Math.abs(curr) + next);
        crossings.push({ position: i + frac, direction: 1 });
      } else if (curr > 0 && next < 0) {
        // 正到负
        const frac = curr / (curr + Math.abs(next));
        crossings.push({ position: i + frac, direction: -1 });
      }
    }

    return crossings;
  }

  /**
   * 获取过零点附近的样本索引（用于切片对齐）
   * @param targetSample - 目标样本位置
   * @param searchRadius - 搜索半径（样本数）
   * @returns 最近的过零点位置（浮点），未找到返回 targetSample
   */
  findNearestZeroCrossing(targetSample: number, searchRadius: number = 100): number {
    if (this.length < 2) return targetSample;
    const center = Math.round(clamp(targetSample, 0, this.length - 1));
    const radius = Math.max(1, searchRadius);

    // 在搜索半径内寻找过零点
    for (let r = 0; r <= radius; r++) {
      for (const sign of [-1, 1]) {
        const idx = center + r * sign;
        if (idx < 0 || idx >= this.length - 1) continue;
        const curr = this.buffer[idx];
        const next = this.buffer[idx + 1];
        if ((curr <= 0 && next > 0) || (curr >= 0 && next < 0)) {
          if (curr === 0) return idx;
          const frac = Math.abs(curr) / (Math.abs(curr) + Math.abs(next));
          return idx + frac;
        }
      }
    }
    return targetSample;
  }

  // ---------------------------------------------------------------------------
  // 音频统计
  // ---------------------------------------------------------------------------

  /**
   * 计算并返回当前音频的统计信息
   * @returns 统计信息对象
   */
  getStatistics(): AudioStatistics {
    if (this.length === 0) {
      return {
        length: 0,
        duration: 0,
        peakAmplitude: 0,
        minAmplitude: 0,
        averageAbs: 0,
        dcOffset: 0,
        rms: 0,
      };
    }

    let peak = 0;
    let minAmp = Infinity;
    let sumAbs = 0;
    let sum = 0;
    let sumSq = 0;

    for (let i = 0; i < this.length; i++) {
      const s = this.buffer[i];
      const abs = Math.abs(s);
      if (abs > peak) peak = abs;
      if (s < minAmp) minAmp = s;
      sumAbs += abs;
      sum += s;
      sumSq += s * s;
    }

    return {
      length: this.length,
      duration: this.length / SAMPLE_RATE,
      peakAmplitude: peak,
      minAmplitude: minAmp === Infinity ? 0 : minAmp,
      averageAbs: sumAbs / this.length,
      dcOffset: sum / this.length,
      rms: Math.sqrt(sumSq / this.length),
    };
  }

  // ---------------------------------------------------------------------------
  // 区域标记
  // ---------------------------------------------------------------------------

  /**
   * 添加区域标记
   * @param marker - 区域标记对象
   */
  addMarker(marker: RegionMarker): void {
    this.markers.push(marker);
  }

  /**
   * 移除区域标记
   * @param index - 标记索引
   */
  removeMarker(index: number): void {
    if (index >= 0 && index < this.markers.length) {
      this.markers.splice(index, 1);
    }
  }

  /**
   * 获取所有区域标记
   * @returns 标记数组
   */
  getMarkers(): RegionMarker[] {
    return this.markers.slice();
  }

  /**
   * 清除所有标记
   */
  clearMarkers(): void {
    this.markers = [];
  }

  // ---------------------------------------------------------------------------
  // 撤销与重做
  // ---------------------------------------------------------------------------

  /**
   * 撤销
   * @returns 是否成功
   */
  undo(): boolean {
    if (this.history.length === 0) return false;
    const prev = this.history.pop()!;
    this.replaceBuffer(new Float32Array(prev));
    return true;
  }

  /**
   * 获取历史深度
   * @returns 当前历史栈大小
   */
  getHistoryDepth(): number {
    return this.history.length;
  }

  /**
   * 清空历史
   */
  clearHistory(): void {
    this.history = [];
  }
}

// =============================================================================
// 独立音频处理函数
// =============================================================================

/**
 * 将立体声交错缓冲区拆分为左右声道
 * @param interleaved - 交错样本数组 [L,R,L,R,...]
 * @returns [左声道, 右声道]
 */
export function deinterleaveStereo(interleaved: Float32Array): [Float32Array, Float32Array] {
  const len = Math.floor(interleaved.length / 2);
  const left = new Float32Array(len);
  const right = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    left[i] = interleaved[i * 2];
    right[i] = interleaved[i * 2 + 1];
  }
  return [left, right];
}

/**
 * 将左右声道合并为交错缓冲区
 * @param left - 左声道
 * @param right - 右声道
 * @returns 交错样本数组
 */
export function interleaveStereo(left: Float32Array, right: Float32Array): Float32Array {
  const len = Math.min(left.length, right.length);
  const result = new Float32Array(len * 2);
  for (let i = 0; i < len; i++) {
    result[i * 2] = left[i];
    result[i * 2 + 1] = right[i];
  }
  return result;
}

/**
 * 混合两个音频缓冲区
 * @param a - 缓冲区 A
 * @param b - 缓冲区 B
 * @param mixA - A 的混合比例（0~1）
 * @param mixB - B 的混合比例（0~1）
 * @returns 混合后的缓冲区
 */
export function mixBuffers(a: Float32Array, b: Float32Array, mixA: number = 0.5, mixB: number = 0.5): Float32Array {
  const len = Math.max(a.length, b.length);
  const result = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const av = a[i] || 0;
    const bv = b[i] || 0;
    result[i] = av * mixA + bv * mixB;
  }
  return result;
}

/**
 * 对音频缓冲区应用简单低通滤波（一阶 IIR）
 * @param buffer - 输入音频
 * @param cutoffHz - 截止频率
 * @param sampleRate - 采样率
 * @returns 滤波后的缓冲区
 */
export function simpleLowpass(buffer: Float32Array, cutoffHz: number, sampleRate: number = SAMPLE_RATE): Float32Array {
  if (buffer.length === 0) return new Float32Array(0);
  const rc = 1.0 / (2 * Math.PI * cutoffHz);
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
 * 对音频缓冲区应用简单高通滤波（一阶 IIR）
 * @param buffer - 输入音频
 * @param cutoffHz - 截止频率
 * @param sampleRate - 采样率
 * @returns 滤波后的缓冲区
 */
export function simpleHighpass(buffer: Float32Array, cutoffHz: number, sampleRate: number = SAMPLE_RATE): Float32Array {
  if (buffer.length === 0) return new Float32Array(0);
  const rc = 1.0 / (2 * Math.PI * cutoffHz);
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
 * 生成静音缓冲区
 * @param durationSeconds - 时长（秒）
 * @param sampleRate - 采样率
 * @returns 静音缓冲区
 */
export function generateSilence(durationSeconds: number, sampleRate: number = SAMPLE_RATE): Float32Array {
  const len = Math.max(0, Math.floor(durationSeconds * sampleRate));
  return new Float32Array(len);
}

/**
 * 生成测试信号（正弦波）
 * @param frequency - 频率（Hz）
 * @param durationSeconds - 时长（秒）
 * @param amplitude - 振幅（0~1）
 * @param sampleRate - 采样率
 * @returns 正弦波缓冲区
 */
export function generateSine(
  frequency: number,
  durationSeconds: number,
  amplitude: number = 0.5,
  sampleRate: number = SAMPLE_RATE
): Float32Array {
  const len = Math.max(0, Math.floor(durationSeconds * sampleRate));
  const buf = new Float32Array(len);
  const amp = clamp(amplitude, 0, 1);
  for (let i = 0; i < len; i++) {
    buf[i] = Math.sin((2 * Math.PI * frequency * i) / sampleRate) * amp;
  }
  return buf;
}

/**
 * 生成测试信号（方波）
 * @param frequency - 频率（Hz）
 * @param durationSeconds - 时长（秒）
 * @param amplitude - 振幅（0~1）
 * @param sampleRate - 采样率
 * @returns 方波缓冲区
 */
export function generateSquare(
  frequency: number,
  durationSeconds: number,
  amplitude: number = 0.5,
  sampleRate: number = SAMPLE_RATE
): Float32Array {
  const len = Math.max(0, Math.floor(durationSeconds * sampleRate));
  const buf = new Float32Array(len);
  const amp = clamp(amplitude, 0, 1);
  const period = sampleRate / frequency;
  for (let i = 0; i < len; i++) {
    buf[i] = ((i % period) < period / 2 ? 1 : -1) * amp;
  }
  return buf;
}

/**
 * 生成测试信号（锯齿波）
 * @param frequency - 频率（Hz）
 * @param durationSeconds - 时长（秒）
 * @param amplitude - 振幅（0~1）
 * @param sampleRate - 采样率
 * @returns 锯齿波缓冲区
 */
export function generateSawtooth(
  frequency: number,
  durationSeconds: number,
  amplitude: number = 0.5,
  sampleRate: number = SAMPLE_RATE
): Float32Array {
  const len = Math.max(0, Math.floor(durationSeconds * sampleRate));
  const buf = new Float32Array(len);
  const amp = clamp(amplitude, 0, 1);
  const period = sampleRate / frequency;
  for (let i = 0; i < len; i++) {
    const phase = (i % period) / period;
    buf[i] = (phase * 2 - 1) * amp;
  }
  return buf;
}

/**
 * 生成测试信号（三角波）
 * @param frequency - 频率（Hz）
 * @param durationSeconds - 时长（秒）
 * @param amplitude - 振幅（0~1）
 * @param sampleRate - 采样率
 * @returns 三角波缓冲区
 */
export function generateTriangle(
  frequency: number,
  durationSeconds: number,
  amplitude: number = 0.5,
  sampleRate: number = SAMPLE_RATE
): Float32Array {
  const len = Math.max(0, Math.floor(durationSeconds * sampleRate));
  const buf = new Float32Array(len);
  const amp = clamp(amplitude, 0, 1);
  const period = sampleRate / frequency;
  for (let i = 0; i < len; i++) {
    const phase = (i % period) / period;
    let val: number;
    if (phase < 0.25) val = phase / 0.25;
    else if (phase < 0.75) val = 1 - (phase - 0.25) / 0.25;
    else val = -1 + (phase - 0.75) / 0.25;
    buf[i] = val * amp;
  }
  return buf;
}

/**
 * 生成白噪声
 * @param durationSeconds - 时长（秒）
 * @param amplitude - 振幅（0~1）
 * @param sampleRate - 采样率
 * @returns 白噪声缓冲区
 */
export function generateWhiteNoise(
  durationSeconds: number,
  amplitude: number = 0.3,
  sampleRate: number = SAMPLE_RATE
): Float32Array {
  const len = Math.max(0, Math.floor(durationSeconds * sampleRate));
  const buf = new Float32Array(len);
  const amp = clamp(amplitude, 0, 1);
  for (let i = 0; i < len; i++) {
    buf[i] = (Math.random() * 2 - 1) * amp;
  }
  return buf;
}

/**
 * 生成脉冲信号（单个样本尖峰）
 * @param durationSeconds - 时长（秒）
 * @param amplitude - 振幅（0~1）
 * @param sampleRate - 采样率
 * @returns 脉冲缓冲区
 */
export function generateImpulse(
  durationSeconds: number,
  amplitude: number = 1.0,
  sampleRate: number = SAMPLE_RATE
): Float32Array {
  const len = Math.max(0, Math.floor(durationSeconds * sampleRate));
  const buf = new Float32Array(len);
  if (len > 0) buf[0] = clamp(amplitude, 0, 1);
  return buf;
}

/**
 * 计算音频缓冲区的一阶差分（离散微分）
 * @param buffer - 输入音频
 * @returns 差分缓冲区（长度-1）
 */
export function differentiate(buffer: Float32Array): Float32Array {
  if (buffer.length < 2) return new Float32Array(0);
  const out = new Float32Array(buffer.length - 1);
  for (let i = 1; i < buffer.length; i++) {
    out[i - 1] = buffer[i] - buffer[i - 1];
  }
  return out;
}

/**
 * 计算音频缓冲区的累积和（离散积分）
 * @param buffer - 输入音频
 * @returns 累积和缓冲区
 */
export function integrate(buffer: Float32Array): Float32Array {
  if (buffer.length === 0) return new Float32Array(0);
  const out = new Float32Array(buffer.length);
  out[0] = buffer[0];
  for (let i = 1; i < buffer.length; i++) {
    out[i] = out[i - 1] + buffer[i];
  }
  return out;
}

/**
 * 计算自相关系数（用于基频检测）
 * @param buffer - 输入音频
 * @param lag - 延迟样本数
 * @returns 自相关系数
 */
export function autocorrelation(buffer: Float32Array, lag: number): number {
  if (buffer.length === 0 || lag < 0 || lag >= buffer.length) return 0;
  let sum = 0;
  for (let i = 0; i < buffer.length - lag; i++) {
    sum += buffer[i] * buffer[i + lag];
  }
  return sum / (buffer.length - lag);
}

/**
 * 计算频谱质心近似（基于一阶差分能量）
 * 快速估计音频的"亮度"
 * @param buffer - 输入音频
 * @returns 归一化质心值（0~1）
 */
export function spectralCentroidApprox(buffer: Float32Array): number {
  if (buffer.length < 2) return 0;
  const diff = differentiate(buffer);
  let sum = 0;
  let weightedSum = 0;
  for (let i = 0; i < diff.length; i++) {
    const energy = diff[i] * diff[i];
    sum += energy;
    weightedSum += energy * i;
  }
  return sum > 0 ? weightedSum / sum / diff.length : 0;
}

/**
 * 对音频缓冲区应用立体声声像变换（单声道转立体声）
 * @param mono - 单声道输入
 * @param pan - 声像值（-1=全左，0=居中，1=全右）
 * @returns 交错立体声缓冲区 [L,R,L,R,...]
 */
export function applyPan(mono: Float32Array, pan: number): Float32Array {
  const len = mono.length;
  const stereo = new Float32Array(len * 2);
  const [leftGain, rightGain] = panToGain(pan);
  for (let i = 0; i < len; i++) {
    stereo[i * 2] = mono[i] * leftGain;
    stereo[i * 2 + 1] = mono[i] * rightGain;
  }
  return stereo;
}

/**
 * 对音频缓冲区应用窗口函数（通用接口）
 * @param buffer - 输入音频
 * @param window - 窗口数组（长度应与 buffer 相同或更短，居中应用）
 * @returns 加窗后的缓冲区
 */
export function applyWindow(buffer: Float32Array, window: Float32Array): Float32Array {
  if (buffer.length === 0) return new Float32Array(0);
  const out = new Float32Array(buffer.length);
  const halfWin = Math.floor(window.length / 2);
  const start = Math.floor(buffer.length / 2) - halfWin;
  for (let i = 0; i < buffer.length; i++) {
    const winIdx = i - start;
    const win = winIdx >= 0 && winIdx < window.length ? window[winIdx] : 0;
    out[i] = buffer[i] * win;
  }
  return out;
}

/**
 * 创建汉明窗（Hamming Window）
 * @param size - 窗口大小
 * @returns 汉明窗数组
 */
export function hammingWindow(size: number): Float32Array {
  const w = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    w[i] = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (size - 1));
  }
  return w;
}

/**
 * 创建布莱克曼窗（Blackman Window）
 * @param size - 窗口大小
 * @returns 布莱克曼窗数组
 */
export function blackmanWindow(size: number): Float32Array {
  const w = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    const a0 = 0.42;
    const a1 = 0.5;
    const a2 = 0.08;
    const frac = (2 * Math.PI * i) / (size - 1);
    w[i] = a0 - a1 * Math.cos(frac) + a2 * Math.cos(2 * frac);
  }
  return w;
}

/**
 * 寻找缓冲区中的最大振幅位置
 * @param buffer - 输入音频
 * @returns { index: number, value: number }
 */
export function findPeak(buffer: Float32Array): { index: number; value: number } {
  if (buffer.length === 0) return { index: -1, value: 0 };
  let maxIdx = 0;
  let maxVal = Math.abs(buffer[0]);
  for (let i = 1; i < buffer.length; i++) {
    const abs = Math.abs(buffer[i]);
    if (abs > maxVal) {
      maxVal = abs;
      maxIdx = i;
    }
  }
  return { index: maxIdx, value: buffer[maxIdx] };
}

/**
 * 寻找缓冲区中的最小振幅位置
 * @param buffer - 输入音频
 * @returns { index: number, value: number }
 */
export function findTrough(buffer: Float32Array): { index: number; value: number } {
  if (buffer.length === 0) return { index: -1, value: 0 };
  let minIdx = 0;
  let minVal = buffer[0];
  for (let i = 1; i < buffer.length; i++) {
    if (buffer[i] < minVal) {
      minVal = buffer[i];
      minIdx = i;
    }
  }
  return { index: minIdx, value: minVal };
}

// =============================================================================
// 默认导出
// =============================================================================

export default WaveEditor;
