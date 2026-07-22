/**
 * ============================================================
 * 青鸾数字音频工作站 - 高级音频效果器引擎
 * QingLuan DAW - Advanced Audio Effects Engine
 * ============================================================
 * 本模块提供一系列专业级音频效果处理函数，涵盖镶边、相位器、
 * 激励器、去齿音、立体声扩展、多段压缩、砖墙限制、颤音、自动声像、
 * 环形调制、比特破碎以及波形塑形等效果。
 *
 * 所有效果器均直接操作 Float32Array 缓冲区，采样率统一为 44100Hz。
 * 采用 ESM 模块格式，支持独立调用与链式组合。
 * ============================================================
 */

import { clamp, lerp, dbToGain, gainToDb, hannWindow, normalizeBuffer } from '../utils/audioUtils.js';

// ============================================================================
// 全局常量与类型定义
// ============================================================================

/** 统一采样率：44100 Hz */
const SAMPLE_RATE: number = 44100;

/** 双声道缓冲区结构（非交错格式） */
export interface StereoPair {
  left: Float32Array;
  right: Float32Array;
}

/** 多段压缩器频段配置 */
export interface BandConfig {
  /** 低频截止频率（Hz） */
  lowFreq: number;
  /** 高频截止频率（Hz） */
  highFreq: number;
  /** 阈值（dB） */
  thresholdDb: number;
  /** 压缩比（如 4 表示 4:1） */
  ratio: number;
  /** 启动时间（毫秒） */
  attackMs: number;
  /** 释放时间（毫秒） */
  releaseMs: number;
  /** 增益补偿（dB） */
  makeupGainDb: number;
}

/** 波形塑形曲线类型 */
export type WaveshaperType = 'tanh' | 'arctan' | 'sigmoid' | 'polynomial' | 'hardclip' | 'softclip' | 'sinefold';

// ============================================================================
// 内部工具类与辅助函数
// ============================================================================

/**
 * 内部延迟线类（用于需要连续记忆的效果器）
 * 支持分数延迟的线性插值读取。
 */
class DelayLineInternal {
  private buffer: Float32Array;
  private writeIndex: number = 0;
  private maxDelaySamples: number;

  constructor(maxDelayMs: number) {
    this.maxDelaySamples = Math.ceil((maxDelayMs / 1000.0) * SAMPLE_RATE);
    this.buffer = new Float32Array(this.maxDelaySamples);
  }

  /**
   * 写入一个样本到延迟线
   * @param input 输入样本值
   */
  public write(input: number): void {
    this.buffer[this.writeIndex] = input;
    this.writeIndex = (this.writeIndex + 1) % this.maxDelaySamples;
  }

  /**
   * 读取指定延迟时间（毫秒）的样本，使用线性插值
   * @param delayMs 延迟时间（毫秒）
   * @returns 延迟后的样本值
   */
  public read(delayMs: number): number {
    const delaySamples: number = (delayMs / 1000.0) * SAMPLE_RATE;
    let readIndex: number = this.writeIndex - delaySamples;
    while (readIndex < 0) readIndex += this.maxDelaySamples;

    const i0: number = Math.floor(readIndex) % this.maxDelaySamples;
    const i1: number = (i0 + 1) % this.maxDelaySamples;
    const frac: number = readIndex - Math.floor(readIndex);

    return this.buffer[i0] * (1.0 - frac) + this.buffer[i1] * frac;
  }

  /** 重置延迟线状态 */
  public reset(): void {
    this.buffer.fill(0.0);
    this.writeIndex = 0;
  }
}

/**
 * 内部一阶全通滤波器（用于相位器）
 * 一阶全通滤波器传递函数：H(z) = (c + z^-1) / (1 + c*z^-1)
 * 其中 c = (tan(pi*fc/fs) - 1) / (tan(pi*fc/fs) + 1)
 */
class AllPass1stOrder {
  private x1: number = 0.0;
  private y1: number = 0.0;
  private c: number = 0.0;

  /**
   * 设计一阶全通滤波器
   * @param freq 中心频率（凹口/峰值频率）
   */
  public design(freq: number): void {
    const w: number = Math.tan((Math.PI * freq) / SAMPLE_RATE);
    this.c = (w - 1.0) / (w + 1.0);
  }

  /** 处理单个样本 */
  public process(input: number): number {
    const y: number = this.c * input + this.x1 - this.c * this.y1;
    this.x1 = input;
    this.y1 = y;
    return y;
  }

  /** 重置状态 */
  public reset(): void {
    this.x1 = 0.0;
    this.y1 = 0.0;
  }
}

/**
 * 内部二阶带通滤波器（用于去齿音等频率选择性处理）
 * 使用双二次（Biquad）结构实现带通响应。
 */
class BandPassBiquad {
  private x1: number = 0.0;
  private x2: number = 0.0;
  private y1: number = 0.0;
  private y2: number = 0.0;
  private a0: number = 1.0;
  private a1: number = 0.0;
  private a2: number = 0.0;
  private b1: number = 0.0;
  private b2: number = 0.0;

  /**
   * 设计带通滤波器
   * @param freq 中心频率（Hz）
   * @param q 品质因数
   */
  public design(freq: number, q: number): void {
    const w0: number = (2.0 * Math.PI * freq) / SAMPLE_RATE;
    const cosW0: number = Math.cos(w0);
    const sinW0: number = Math.sin(w0);
    const alpha: number = sinW0 / (2.0 * q);

    const b0: number = alpha;
    const b1: number = 0.0;
    const b2: number = -alpha;
    const a0: number = 1.0 + alpha;
    const a1: number = -2.0 * cosW0;
    const a2: number = 1.0 - alpha;

    this.a0 = b0 / a0;
    this.a1 = b1 / a0;
    this.a2 = b2 / a0;
    this.b1 = a1 / a0;
    this.b2 = a2 / a0;
  }

  /** 处理单个样本 */
  public process(input: number): number {
    const y: number =
      this.a0 * input +
      this.a1 * this.x1 +
      this.a2 * this.x2 -
      this.b1 * this.y1 -
      this.b2 * this.y2;

    this.x2 = this.x1;
    this.x1 = input;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }

  /** 重置状态 */
  public reset(): void {
    this.x1 = 0.0;
    this.x2 = 0.0;
    this.y1 = 0.0;
    this.y2 = 0.0;
  }
}

/**
 * 内部二阶 Linkwitz-Riley 分频器
 * 由两个 Butterworth 二阶滤波器级联构成，提供 24dB/oct 的衰减。
 */
class CrossoverLR {
  private lpX1: number = 0.0;
  private lpX2: number = 0.0;
  private lpY1: number = 0.0;
  private lpY2: number = 0.0;
  private hpX1: number = 0.0;
  private hpX2: number = 0.0;
  private hpY1: number = 0.0;
  private hpY2: number = 0.0;

  private lpA0: number = 1.0;
  private lpA1: number = 0.0;
  private lpA2: number = 0.0;
  private lpB1: number = 0.0;
  private lpB2: number = 0.0;

  private hpA0: number = 1.0;
  private hpA1: number = 0.0;
  private hpA2: number = 0.0;
  private hpB1: number = 0.0;
  private hpB2: number = 0.0;

  /**
   * 设计低通/高通分频对
   * @param freq 分频频率（Hz）
   */
  public design(freq: number): void {
    const w0: number = (2.0 * Math.PI * freq) / SAMPLE_RATE;
    const cosW0: number = Math.cos(w0);
    const sinW0: number = Math.sin(w0);
    const q: number = 0.70710678; // Butterworth Q = 1/sqrt(2)
    const alpha: number = sinW0 / (2.0 * q);

    // 低通系数
    const lpB0: number = (1.0 - cosW0) / 2.0;
    const lpB1: number = 1.0 - cosW0;
    const lpB2: number = (1.0 - cosW0) / 2.0;
    const lpA0: number = 1.0 + alpha;
    const lpA1: number = -2.0 * cosW0;
    const lpA2: number = 1.0 - alpha;

    this.lpA0 = lpB0 / lpA0;
    this.lpA1 = lpB1 / lpA0;
    this.lpA2 = lpB2 / lpA0;
    this.lpB1 = lpA1 / lpA0;
    this.lpB2 = lpA2 / lpA0;

    // 高通系数
    const hpB0: number = (1.0 + cosW0) / 2.0;
    const hpB1: number = -(1.0 + cosW0);
    const hpB2: number = (1.0 + cosW0) / 2.0;
    const hpA0: number = 1.0 + alpha;
    const hpA1: number = -2.0 * cosW0;
    const hpA2: number = 1.0 - alpha;

    this.hpA0 = hpB0 / hpA0;
    this.hpA1 = hpB1 / hpA0;
    this.hpA2 = hpB2 / hpA0;
    this.hpB1 = hpA1 / hpA0;
    this.hpB2 = hpA2 / hpA0;
  }

  /**
   * 处理样本并返回低通/高通输出
   * @param input 输入样本
   * @returns [lowPassOutput, highPassOutput]
   */
  public process(input: number): [number, number] {
    const lpY: number =
      this.lpA0 * input +
      this.lpA1 * this.lpX1 +
      this.lpA2 * this.lpX2 -
      this.lpB1 * this.lpY1 -
      this.lpB2 * this.lpY2;

    this.lpX2 = this.lpX1;
    this.lpX1 = input;
    this.lpY2 = this.lpY1;
    this.lpY1 = lpY;

    const hpY: number =
      this.hpA0 * input +
      this.hpA1 * this.hpX1 +
      this.hpA2 * this.hpX2 -
      this.hpB1 * this.hpY1 -
      this.hpB2 * this.hpY2;

    this.hpX2 = this.hpX1;
    this.hpX1 = input;
    this.hpY2 = this.hpY1;
    this.hpY1 = hpY;

    return [lpY, hpY];
  }

  /** 重置状态 */
  public reset(): void {
    this.lpX1 = 0.0;
    this.lpX2 = 0.0;
    this.lpY1 = 0.0;
    this.lpY2 = 0.0;
    this.hpX1 = 0.0;
    this.hpX2 = 0.0;
    this.hpY1 = 0.0;
    this.hpY2 = 0.0;
  }
}

/**
 * 内部动态压缩器单元（用于多段压缩）
 * 实现基于峰值检测的简单压缩器。
 */
class CompressorUnit {
  private thresholdLinear: number;
  private ratio: number;
  private attackCoeff: number;
  private releaseCoeff: number;
  private makeupGain: number;
  private envelope: number = 0.0;

  constructor(thresholdDb: number, ratio: number, attackMs: number, releaseMs: number, makeupGainDb: number) {
    this.thresholdLinear = dbToGain(thresholdDb);
    this.ratio = ratio;
    this.attackCoeff = Math.exp(-1.0 / ((attackMs / 1000.0) * SAMPLE_RATE));
    this.releaseCoeff = Math.exp(-1.0 / ((releaseMs / 1000.0) * SAMPLE_RATE));
    this.makeupGain = dbToGain(makeupGainDb);
  }

  /** 处理单个样本 */
  public process(input: number): number {
    const detected: number = Math.abs(input);
    if (detected > this.envelope) {
      this.envelope = this.attackCoeff * this.envelope + (1.0 - this.attackCoeff) * detected;
    } else {
      this.envelope = this.releaseCoeff * this.envelope + (1.0 - this.releaseCoeff) * detected;
    }

    let gain: number = 1.0;
    if (this.envelope > this.thresholdLinear) {
      const dbOver: number = gainToDb(this.envelope / this.thresholdLinear);
      const reductionDb: number = dbOver * (1.0 - 1.0 / this.ratio);
      gain = dbToGain(-reductionDb);
    }

    return input * gain * this.makeupGain;
  }

  /** 重置状态 */
  public reset(): void {
    this.envelope = 0.0;
  }
}

/**
 * 计算平均绝对值（用于电平检测）
 * @param buffer 输入缓冲区
 * @returns 平均绝对值
 */
function averageAbs(buffer: Float32Array): number {
  let sum: number = 0.0;
  for (let i: number = 0; i < buffer.length; i++) {
    sum += Math.abs(buffer[i]);
  }
  return sum / buffer.length;
}

/**
 * 计算峰值电平
 * @param buffer 输入缓冲区
 * @returns 峰值（0.0 ~ 1.0+）
 */
function peakLevel(buffer: Float32Array): number {
  let peak: number = 0.0;
  for (let i: number = 0; i < buffer.length; i++) {
    peak = Math.max(peak, Math.abs(buffer[i]));
  }
  return peak;
}

// ============================================================================
// 一、镶边效果器 (Flanger)
// ============================================================================

/**
 * 对输入缓冲区应用镶边（Flanger）效果。
 *
 * 镶边是一种基于短延迟的调制效果，延迟时间通常在 0.1ms ~ 10ms 之间
 * 由 LFO（低频振荡器）调制，并带有反馈回路，产生特有的"扫频"空洞感。
 *
 * @param buffer - 输入的单声道音频缓冲区（会被原地修改）
 * @param rate - LFO 调制速率（Hz），建议范围 0.1 ~ 5.0
 * @param depth - 调制深度（0.0 ~ 1.0），决定延迟时间变化范围
 * @param feedback - 反馈量（-0.99 ~ 0.99），正值增强共振峰，负值产生空心感
 * @returns 处理后的缓冲区（原地修改后的引用）
 *
 * @example
 * ```ts
 * const buffer = new Float32Array(44100);
 * applyFlanger(buffer, 0.5, 0.7, 0.6);
 * ```
 */
export function applyFlanger(buffer: Float32Array, rate: number, depth: number, feedback: number): Float32Array {
  // 参数校验与限制
  const safeRate: number = clamp(rate, 0.01, 20.0);
  const safeDepth: number = clamp(depth, 0.0, 1.0);
  const safeFeedback: number = clamp(feedback, -0.999, 0.999);

  const length: number = buffer.length;

  // 镶边延迟参数：基础延迟 0.1ms，最大延迟 10ms
  const baseDelayMs: number = 0.1;
  const maxDelayMs: number = 10.0;

  // 创建延迟线，最大支持 20ms 以确保安全
  const delayLine: DelayLineInternal = new DelayLineInternal(20.0);

  // LFO 相位增量
  const phaseIncrement: number = safeRate / SAMPLE_RATE;
  let phase: number = 0.0;

  // 主处理循环
  for (let i: number = 0; i < length; i++) {
    const input: number = buffer[i];

    // 计算当前 LFO 值（三角波，范围 -1 ~ 1）
    const lfoValue: number = 1.0 - 4.0 * Math.abs(phase - 0.5);

    // 将 LFO 映射到延迟时间范围
    const modulation: number = (lfoValue + 1.0) * 0.5; // 0 ~ 1
    const currentDelayMs: number = baseDelayMs + modulation * (maxDelayMs - baseDelayMs) * safeDepth;

    // 从延迟线读取延迟样本
    const delayed: number = delayLine.read(currentDelayMs);

    // 构建反馈信号：输入 + 延迟信号 * 反馈系数
    const feedbackSignal: number = input + delayed * safeFeedback;

    // 写入延迟线
    delayLine.write(feedbackSignal);

    // 输出为干湿混合（默认 50% 湿信号）
    buffer[i] = input * 0.5 + delayed * 0.5;

    // 更新 LFO 相位
    phase += phaseIncrement;
    if (phase >= 1.0) phase -= 1.0;
  }

  return buffer;
}

// ============================================================================
// 二、相位器 (Phaser)
// ============================================================================

/**
 * 对输入缓冲区应用相位器（Phaser）效果。
 *
 * 相位器通过级联多个全通滤波器，在频谱中产生移动的凹口（notch）。
 * 原始信号与相移信号混合后，凹口频率处的信号相互抵消，产生独特的" sweeping "效果。
 *
 * @param buffer - 输入的单声道音频缓冲区（会被原地修改）
 * @param stages - 全通滤波器级数（建议 2 ~ 12，偶数级数效果更平滑）
 * @param rate - LFO 调制速率（Hz），建议范围 0.1 ~ 3.0
 * @param depth - 调制深度（0.0 ~ 1.0），控制凹口频率移动范围
 * @returns 处理后的缓冲区
 *
 * @example
 * ```ts
 * const buffer = new Float32Array(44100);
 * applyPhaser(buffer, 6, 0.4, 0.8);
 * ```
 */
export function applyPhaser(buffer: Float32Array, stages: number, rate: number, depth: number): Float32Array {
  const safeStages: number = Math.max(2, Math.min(stages, 24));
  const safeRate: number = clamp(rate, 0.01, 10.0);
  const safeDepth: number = clamp(depth, 0.0, 1.0);

  const length: number = buffer.length;

  // 创建全通滤波器级联
  const allpassFilters: AllPass1stOrder[] = [];
  for (let s: number = 0; s < safeStages; s++) {
    allpassFilters.push(new AllPass1stOrder());
  }

  // LFO 参数：频率范围 100Hz ~ 8000Hz
  const minFreq: number = 100.0;
  const maxFreq: number = 8000.0;
  const phaseIncrement: number = safeRate / SAMPLE_RATE;
  let phase: number = 0.0;

  // 反馈量（轻度反馈增强共振）
  const feedback: number = 0.3;
  let feedbackState: number = 0.0;

  for (let i: number = 0; i < length; i++) {
    const input: number = buffer[i];

    // 计算当前调制频率
    const lfoValue: number = Math.sin(2.0 * Math.PI * phase); // -1 ~ 1
    const modulatedFreq: number = minFreq + (lfoValue + 1.0) * 0.5 * (maxFreq - minFreq) * safeDepth;

    // 为各级全通滤波器分配略有不同的频率（对数分布）
    const freqRatio: number = Math.pow(maxFreq / minFreq, 1.0 / safeStages);
    for (let s: number = 0; s < safeStages; s++) {
      const stageFreq: number = modulatedFreq * Math.pow(freqRatio, s * 0.3);
      allpassFilters[s].design(clamp(stageFreq, 20.0, 18000.0));
    }

    // 级联处理：输入 + 反馈
    let signal: number = input + feedbackState * feedback;
    for (let s: number = 0; s < safeStages; s++) {
      signal = allpassFilters[s].process(signal);
    }

    // 更新反馈状态
    feedbackState = signal;

    // 混合原始信号与相移信号（经典相位器混合比例）
    const output: number = input * 0.5 + signal * 0.5;
    buffer[i] = output;

    // 更新 LFO 相位
    phase += phaseIncrement;
    if (phase >= 1.0) phase -= 1.0;
  }

  return buffer;
}

// ============================================================================
// 三、激励器 (Exciter)
// ============================================================================

/**
 * 对输入缓冲区应用激励器（Exciter）效果。
 *
 * 激励器通过提取高频成分并施加轻度非线性失真（谐波生成），
 * 在不显著增加音量的前提下增加声音的明亮度和存在感。
 * 常用于人声、鼓组总线以及母带处理。
 *
 * @param buffer - 输入的单声道音频缓冲区（会被原地修改）
 * @param amount - 激励强度（0.0 ~ 1.0），0 为无效果，1 为最大强度
 * @returns 处理后的缓冲区
 *
 * @example
 * ```ts
 * const buffer = new Float32Array(44100);
 * applyExciter(buffer, 0.4);
 * ```
 */
export function applyExciter(buffer: Float32Array, amount: number): Float32Array {
  const safeAmount: number = clamp(amount, 0.0, 1.0);
  if (safeAmount < 0.001) return buffer;

  const length: number = buffer.length;

  // 激励器通常作用于 2kHz 以上的高频段
  const highPassFreq: number = 2500.0;
  const q: number = 0.707;

  // 设计高通滤波器（二阶 Butterworth）
  const w0: number = (2.0 * Math.PI * highPassFreq) / SAMPLE_RATE;
  const cosW0: number = Math.cos(w0);
  const sinW0: number = Math.sin(w0);
  const alpha: number = sinW0 / (2.0 * q);

  const b0: number = (1.0 + cosW0) / 2.0;
  const b1: number = -(1.0 + cosW0);
  const b2: number = (1.0 + cosW0) / 2.0;
  const a0: number = 1.0 + alpha;
  const a1: number = -2.0 * cosW0;
  const a2: number = 1.0 - alpha;

  const na0: number = b0 / a0;
  const na1: number = b1 / a0;
  const na2: number = b2 / a0;
  const nb1: number = a1 / a0;
  const nb2: number = a2 / a0;

  let x1: number = 0.0;
  let x2: number = 0.0;
  let y1: number = 0.0;
  let y2: number = 0.0;

  // 谐波生成参数：使用轻度 tanh 失真
  const drive: number = 1.0 + safeAmount * 4.0; // 1x ~ 5x 驱动

  for (let i: number = 0; i < length; i++) {
    const input: number = buffer[i];

    // 1. 高通滤波提取高频
    const highFreq: number = na0 * input + na1 * x1 + na2 * x2 - nb1 * y1 - nb2 * y2;
    x2 = x1;
    x1 = input;
    y2 = y1;
    y1 = highFreq;

    // 2. 对高频成分施加轻度 tanh 非线性，产生奇次和偶次谐波
    const driven: number = highFreq * drive;
    const harmonics: number = Math.tanh(driven) * 0.8 + Math.tanh(driven * 2.0) * 0.2;

    // 3. 提取新增谐波（减去原始高频，仅保留失真产物）
    const harmonicOnly: number = (harmonics - highFreq) * safeAmount;

    // 4. 混合回原始信号
    buffer[i] = input + harmonicOnly * 0.5;
  }

  // 防止削波：若激励后峰值超过 1.0，进行轻度软限幅
  for (let i: number = 0; i < length; i++) {
    if (buffer[i] > 1.0) buffer[i] = 1.0 + Math.tanh(buffer[i] - 1.0) * 0.1;
    if (buffer[i] < -1.0) buffer[i] = -1.0 + Math.tanh(buffer[i] + 1.0) * 0.1;
  }

  return buffer;
}

// ============================================================================
// 四、去齿音 (De-Esser)
// ============================================================================

/**
 * 对输入缓冲区应用去齿音（De-Esser）效果。
 *
 * 去齿音器检测高频齿音区域（通常 4kHz ~ 10kHz）的能量，
 * 当能量超过设定阈值时，对该频段施加动态衰减。
 * 这是人声处理中不可或缺的工具。
 *
 * @param buffer - 输入的单声道音频缓冲区（会被原地修改）
 * @param threshold - 触发阈值（dB），建议范围 -40 ~ -10
 * @param freq - 中心频率（Hz），通常 4000 ~ 10000
 * @returns 处理后的缓冲区
 *
 * @example
 * ```ts
 * const buffer = new Float32Array(44100);
 * applyDeEsser(buffer, -24, 6500);
 * ```
 */
export function applyDeEsser(buffer: Float32Array, threshold: number, freq: number): Float32Array {
  const safeThreshold: number = clamp(threshold, -60.0, 0.0);
  const safeFreq: number = clamp(freq, 2000.0, 16000.0);
  const thresholdLinear: number = dbToGain(safeThreshold);

  const length: number = buffer.length;

  // 使用带通滤波器隔离齿音频段
  const bpFilter: BandPassBiquad = new BandPassBiquad();
  bpFilter.design(safeFreq, 1.5); // Q = 1.5，较窄的带宽

  // 包络检测参数
  const attackMs: number = 1.0;
  const releaseMs: number = 30.0;
  const attackCoeff: number = Math.exp(-1.0 / ((attackMs / 1000.0) * SAMPLE_RATE));
  const releaseCoeff: number = Math.exp(-1.0 / ((releaseMs / 1000.0) * SAMPLE_RATE));
  let envelope: number = 0.0;

  // 增益衰减平滑
  let currentGain: number = 1.0;
  const smoothCoeff: number = 0.995; // 增益系数平滑

  for (let i: number = 0; i < length; i++) {
    const input: number = buffer[i];

    // 提取齿音频段
    const sibilance: number = bpFilter.process(input);
    const detected: number = Math.abs(sibilance);

    // 更新包络
    if (detected > envelope) {
      envelope = attackCoeff * envelope + (1.0 - attackCoeff) * detected;
    } else {
      envelope = releaseCoeff * envelope + (1.0 - releaseCoeff) * detected;
    }

    // 计算目标增益：若包络超过阈值，则衰减至阈值电平
    let targetGain: number = 1.0;
    if (envelope > thresholdLinear) {
      targetGain = thresholdLinear / (envelope + 1e-10);
    }

    // 平滑增益变化（避免抽吸声）
    currentGain = smoothCoeff * currentGain + (1.0 - smoothCoeff) * targetGain;

    // 应用增益（仅衰减，不提升）
    buffer[i] = input * currentGain;
  }

  return buffer;
}

// ============================================================================
// 五、立体声扩展 (Stereo Widener)
// ============================================================================

/**
 * 对输入的交错立体声缓冲区应用立体声扩展（M/S 处理）。
 *
 * 立体声扩展通过 Mid/Side 编码调整侧声道（Side）的增益来实现：
 * - Mid = (L + R) / 2
 * - Side = (L - R) / 2
 * - 新 L = Mid + Side * width
 * - 新 R = Mid - Side * width
 *
 * width > 1 时扩展声场，width < 1 时缩窄，width = 0 时变为单声道。
 *
 * **注意**：输入缓冲区必须为交错立体声格式（L0, R0, L1, R1, ...）。
 *
 * @param buffer - 交错的立体声音频缓冲区（长度必须为偶数，会被原地修改）
 * @param width - 宽度系数（0.0 ~ 3.0），1.0 为原始宽度
 * @returns 处理后的缓冲区
 *
 * @example
 * ```ts
 * const stereo = new Float32Array(88200); // 1秒立体声
 * applyStereoWidener(stereo, 1.5);
 * ```
 */
export function applyStereoWidener(buffer: Float32Array, width: number): Float32Array {
  const safeWidth: number = clamp(width, 0.0, 3.0);
  const length: number = buffer.length;

  // 确保长度为偶数（立体声样本对）
  const pairCount: number = Math.floor(length / 2);

  for (let i: number = 0; i < pairCount; i++) {
    const leftIdx: number = i * 2;
    const rightIdx: number = i * 2 + 1;

    const left: number = buffer[leftIdx];
    const right: number = buffer[rightIdx];

    // M/S 解码
    const mid: number = (left + right) * 0.5;
    const side: number = (left - right) * 0.5;

    // 调整侧声道增益
    const newLeft: number = mid + side * safeWidth;
    const newRight: number = mid - side * safeWidth;

    // 软限幅防止削波
    buffer[leftIdx] = clamp(newLeft, -1.2, 1.2);
    buffer[rightIdx] = clamp(newRight, -1.2, 1.2);
  }

  return buffer;
}

// ============================================================================
// 六、多段压缩器 (Multiband Compression)
// ============================================================================

/**
 * 对输入缓冲区应用多段压缩（Multiband Compression）。
 *
 * 多段压缩将音频分为 3 ~ 5 个频段，对每个频段独立应用压缩，
 * 从而在控制动态的同时保持各频段间的平衡。常用于母带处理和总线压缩。
 *
 * @param buffer - 输入的单声道音频缓冲区（会被原地修改）
 * @param bands - 频段配置数组，长度决定段数（3 ~ 5）
 * @returns 处理后的缓冲区
 *
 * @example
 * ```ts
 * const buffer = new Float32Array(44100);
 * applyMultibandCompression(buffer, [
 *   { lowFreq: 0, highFreq: 200, thresholdDb: -20, ratio: 4, attackMs: 20, releaseMs: 150, makeupGainDb: 3 },
 *   { lowFreq: 200, highFreq: 4000, thresholdDb: -16, ratio: 3, attackMs: 10, releaseMs: 100, makeupGainDb: 2 },
 *   { lowFreq: 4000, highFreq: 20000, thresholdDb: -18, ratio: 2.5, attackMs: 5, releaseMs: 80, makeupGainDb: 2 },
 * ]);
 * ```
 */
export function applyMultibandCompression(buffer: Float32Array, bands: BandConfig[]): Float32Array {
  const numBands: number = clamp(bands.length, 3, 5);
  const length: number = buffer.length;

  if (numBands < 3) {
    throw new Error('多段压缩器至少需要 3 个频段配置');
  }

  // 按频率排序
  const sortedBands: BandConfig[] = bands.slice(0, numBands).sort((a, b) => a.lowFreq - b.lowFreq);

  // 构建分频器链
  const crossovers: CrossoverLR[] = [];
  for (let b: number = 0; b < numBands - 1; b++) {
    const xo: CrossoverLR = new CrossoverLR();
    xo.design(sortedBands[b].highFreq);
    crossovers.push(xo);
  }

  // 为每段创建压缩器
  const compressors: CompressorUnit[] = [];
  for (let b: number = 0; b < numBands; b++) {
    const cfg: BandConfig = sortedBands[b];
    compressors.push(
      new CompressorUnit(
        cfg.thresholdDb,
        cfg.ratio,
        cfg.attackMs,
        cfg.releaseMs,
        cfg.makeupGainDb
      )
    );
  }

  // 处理每段需要保存的滤波器状态：采用树形分频结构
  // 重置所有状态
  for (const xo of crossovers) xo.reset();
  for (const comp of compressors) comp.reset();

  // 逐样本处理
  for (let i: number = 0; i < length; i++) {
    const input: number = buffer[i];

    // 分频：通过级联分频器分离各频段
    const bandSignals: number[] = new Array(numBands).fill(0.0);

    if (numBands === 3) {
      const [low, midHigh] = crossovers[0].process(input);
      const [mid, high] = crossovers[1].process(midHigh);
      bandSignals[0] = low;
      bandSignals[1] = mid;
      bandSignals[2] = high;
    } else if (numBands === 4) {
      const [low, rest1] = crossovers[0].process(input);
      const [midLow, rest2] = crossovers[1].process(rest1);
      const [midHigh, high] = crossovers[2].process(rest2);
      bandSignals[0] = low;
      bandSignals[1] = midLow;
      bandSignals[2] = midHigh;
      bandSignals[3] = high;
    } else if (numBands === 5) {
      const [b1, rest1] = crossovers[0].process(input);
      const [b2, rest2] = crossovers[1].process(rest1);
      const [b3, rest3] = crossovers[2].process(rest2);
      const [b4, b5] = crossovers[3].process(rest3);
      bandSignals[0] = b1;
      bandSignals[1] = b2;
      bandSignals[2] = b3;
      bandSignals[3] = b4;
      bandSignals[4] = b5;
    }

    // 各段独立压缩并混合
    let output: number = 0.0;
    for (let b: number = 0; b < numBands; b++) {
      output += compressors[b].process(bandSignals[b]);
    }

    buffer[i] = output;
  }

  return buffer;
}

// ============================================================================
// 七、砖墙限制器 (Brickwall Limiter)
// ============================================================================

/**
 * 对输入缓冲区应用砖墙限制器（Brickwall Limiter）。
 *
 * 砖墙限制器确保输出信号绝对不超过设定的阈值电平，
 * 通过极快的攻击时间和可控的释放时间，防止任何削波失真。
 * 常用于母带处理的最后阶段。
 *
 * @param buffer - 输入的单声道音频缓冲区（会被原地修改）
 * @param threshold - 限制阈值（dB），建议 -3.0 ~ -0.1
 * @param release - 释放时间（毫秒），建议 10 ~ 500
 * @returns 处理后的缓冲区
 *
 * @example
 * ```ts
 * const buffer = new Float32Array(44100);
 * applyBrickwallLimiter(buffer, -1.0, 50);
 * ```
 */
export function applyBrickwallLimiter(buffer: Float32Array, threshold: number, release: number): Float32Array {
  const safeThreshold: number = clamp(threshold, -12.0, -0.05);
  const safeRelease: number = clamp(release, 1.0, 1000.0);
  const thresholdLinear: number = dbToGain(safeThreshold);

  const length: number = buffer.length;

  // 包络检测：峰值保持 + 释放衰减
  const releaseCoeff: number = Math.exp(-1.0 / ((safeRelease / 1000.0) * SAMPLE_RATE));
  let envelope: number = 0.0;

  // 前瞻检测：使用 1ms 的前瞻窗口平滑峰值
  const lookaheadSamples: number = Math.ceil(0.001 * SAMPLE_RATE);
  const lookaheadBuffer: Float32Array = new Float32Array(lookaheadSamples);
  let lookaheadIndex: number = 0;

  // 增益缓冲区（先计算增益，再应用，保证释放曲线连贯）
  const gainBuffer: Float32Array = new Float32Array(length);

  // 第一遍：计算每个样本的目标增益
  for (let i: number = 0; i < length; i++) {
    const input: number = Math.abs(buffer[i]);

    // 前瞻缓冲
    lookaheadBuffer[lookaheadIndex] = input;
    lookaheadIndex = (lookaheadIndex + 1) % lookaheadSamples;

    // 前瞻窗口内的最大值作为检测输入
    let detected: number = 0.0;
    for (let j: number = 0; j < lookaheadSamples; j++) {
      detected = Math.max(detected, lookaheadBuffer[j]);
    }

    // 更新包络：立即跟随峰值，按释放系数衰减
    if (detected > envelope) {
      envelope = detected;
    } else {
      envelope = releaseCoeff * envelope + (1.0 - releaseCoeff) * detected;
    }

    // 计算增益：确保输出不超过阈值
    let gain: number = 1.0;
    if (envelope > thresholdLinear) {
      gain = thresholdLinear / envelope;
    }

    gainBuffer[i] = gain;
  }

  // 第二遍：应用增益并平滑增益变化（避免互调失真）
  let smoothedGain: number = 1.0;
  const gainSmoothCoeff: number = 0.85; // 增益平滑系数

  for (let i: number = 0; i < length; i++) {
    smoothedGain = gainSmoothCoeff * smoothedGain + (1.0 - gainSmoothCoeff) * gainBuffer[i];
    buffer[i] = buffer[i] * smoothedGain;
  }

  return buffer;
}

// ============================================================================
// 八、颤音 (Tremolo)
// ============================================================================

/**
 * 对输入缓冲区应用颤音（Tremolo）效果。
 *
 * 颤音通过周期性地调制信号振幅，产生音量的脉动感。
 * 支持正弦波、三角波、方波三种调制波形。
 *
 * @param buffer - 输入的单声道音频缓冲区（会被原地修改）
 * @param rate - 调制速率（Hz），建议 0.5 ~ 20
 * @param depth - 调制深度（0.0 ~ 1.0），1.0 时振幅从 0 到 1
 * @param shape - LFO 波形，可选 'sine' | 'triangle' | 'square'
 * @returns 处理后的缓冲区
 *
 * @example
 * ```ts
 * const buffer = new Float32Array(44100);
 * applyTremolo(buffer, 5.0, 0.6, 'sine');
 * ```
 */
export function applyTremolo(buffer: Float32Array, rate: number, depth: number, shape: string): Float32Array {
  const safeRate: number = clamp(rate, 0.01, 50.0);
  const safeDepth: number = clamp(depth, 0.0, 1.0);
  const safeShape: string = ['sine', 'triangle', 'square'].includes(shape) ? shape : 'sine';

  const length: number = buffer.length;
  const phaseIncrement: number = safeRate / SAMPLE_RATE;
  let phase: number = 0.0;

  for (let i: number = 0; i < length; i++) {
    let lfoValue: number = 0.0;

    switch (safeShape) {
      case 'sine':
        lfoValue = Math.sin(2.0 * Math.PI * phase);
        break;
      case 'triangle':
        lfoValue = 1.0 - 4.0 * Math.abs(phase - 0.5);
        break;
      case 'square':
        lfoValue = phase < 0.5 ? 1.0 : -1.0;
        break;
    }

    // 振幅调制：基础增益 1.0，深度决定调制范围
    // depth=1 时范围为 0 ~ 1，depth=0.5 时范围为 0.5 ~ 1
    const modulation: number = 1.0 - safeDepth * 0.5 + lfoValue * safeDepth * 0.5;

    buffer[i] = buffer[i] * modulation;

    phase += phaseIncrement;
    if (phase >= 1.0) phase -= 1.0;
  }

  return buffer;
}

// ============================================================================
// 九、自动声像 (Auto-Pan)
// ============================================================================

/**
 * 对输入的交错立体声缓冲区应用自动声像（Auto-Pan）效果。
 *
 * 自动声像通过 LFO 周期性地改变左右声道的相对增益，
 * 使声音在立体声场中左右摆动。使用恒功率声像律保持音量稳定。
 *
 * **注意**：输入缓冲区必须为交错立体声格式（L0, R0, L1, R1, ...）。
 *
 * @param buffer - 交错的立体声音频缓冲区（长度必须为偶数，会被原地修改）
 * @param rate - 声像摆动速率（Hz），建议 0.1 ~ 10
 * @param depth - 摆动深度（0.0 ~ 1.0），1.0 时从最左到最右
 * @returns 处理后的缓冲区
 *
 * @example
 * ```ts
 * const stereo = new Float32Array(88200);
 * applyAutoPan(stereo, 1.0, 0.8);
 * ```
 */
export function applyAutoPan(buffer: Float32Array, rate: number, depth: number): Float32Array {
  const safeRate: number = clamp(rate, 0.01, 20.0);
  const safeDepth: number = clamp(depth, 0.0, 1.0);

  const length: number = buffer.length;
  const pairCount: number = Math.floor(length / 2);
  const phaseIncrement: number = safeRate / SAMPLE_RATE;
  let phase: number = 0.0;

  for (let i: number = 0; i < pairCount; i++) {
    const leftIdx: number = i * 2;
    const rightIdx: number = i * 2 + 1;

    const left: number = buffer[leftIdx];
    const right: number = buffer[rightIdx];

    // 单声道化输入（自动声像通常作用于单声道源或合并信号）
    const mono: number = (left + right) * 0.5;

    // LFO：正弦波，-1 ~ 1
    const lfoValue: number = Math.sin(2.0 * Math.PI * phase);

    // 声像位置：-depth ~ +depth
    const pan: number = lfoValue * safeDepth;

    // 恒功率声像律
    // pan = -1 时完全左，pan = 1 时完全右
    const angle: number = (pan + 1.0) * Math.PI * 0.25;
    const leftGain: number = Math.cos(angle) * Math.SQRT2 * 0.5;
    const rightGain: number = Math.sin(angle) * Math.SQRT2 * 0.5;

    buffer[leftIdx] = mono * leftGain * 2.0; // 增益补偿
    buffer[rightIdx] = mono * rightGain * 2.0;

    phase += phaseIncrement;
    if (phase >= 1.0) phase -= 1.0;
  }

  return buffer;
}

// ============================================================================
// 十、环形调制 (Ring Modulation)
// ============================================================================

/**
 * 对输入缓冲区应用环形调制（Ring Modulation）效果。
 *
 * 环形调制将输入信号与载波振荡器相乘，产生和频与差频分量：
 * f_out = f_in + f_carrier  以及  |f_in - f_carrier|
 * 这会产生金属感、不协和的音色，常用于科幻音效和实验音乐。
 *
 * @param buffer - 输入的单声道音频缓冲区（会被原地修改）
 * @param freq - 载波频率（Hz），建议 50 ~ 5000
 * @param amount - 调制量（0.0 ~ 1.0），控制效果强度
 * @returns 处理后的缓冲区
 *
 * @example
 * ```ts
 * const buffer = new Float32Array(44100);
 * applyRingModulation(buffer, 440, 0.5);
 * ```
 */
export function applyRingModulation(buffer: Float32Array, freq: number, amount: number): Float32Array {
  const safeFreq: number = clamp(freq, 1.0, 20000.0);
  const safeAmount: number = clamp(amount, 0.0, 1.0);

  if (safeAmount < 0.001) return buffer;

  const length: number = buffer.length;
  const phaseIncrement: number = safeFreq / SAMPLE_RATE;
  let phase: number = 0.0;

  for (let i: number = 0; i < length; i++) {
    const input: number = buffer[i];
    const carrier: number = Math.sin(2.0 * Math.PI * phase);

    // 环形调制：输入 * 载波
    const modulated: number = input * carrier;

    // 干湿混合
    buffer[i] = input * (1.0 - safeAmount) + modulated * safeAmount;

    phase += phaseIncrement;
    if (phase >= 1.0) phase -= 1.0;
  }

  return buffer;
}

// ============================================================================
// 十一、比特破碎 (Bit Crusher)
// ============================================================================

/**
 * 对输入缓冲区应用比特破碎（Bit Crusher）效果。
 *
 * 比特破碎通过降低采样精度（量化）和/或降低有效采样率（降采样），
 * 模拟早期数字音频设备的粗糙音质，产生 Lo-Fi 效果。
 *
 * @param buffer - 输入的单声道音频缓冲区（会被原地修改）
 * @param bits - 目标比特深度（1 ~ 16），越小失真越明显
 * @param sampleRateReduction - 降采样因子（>= 1），如 4 表示每 4 个样本保持一次
 * @returns 处理后的缓冲区
 *
 * @example
 * ```ts
 * const buffer = new Float32Array(44100);
 * applyBitCrusher(buffer, 8, 4);
 * ```
 */
export function applyBitCrusher(buffer: Float32Array, bits: number, sampleRateReduction: number): Float32Array {
  const safeBits: number = Math.max(1, Math.min(32, bits));
  const safeReduction: number = Math.max(1, Math.floor(sampleRateReduction));

  const length: number = buffer.length;
  const levels: number = Math.pow(2.0, safeBits - 1);

  let holdSample: number = 0.0;
  let sampleCounter: number = 0;

  for (let i: number = 0; i < length; i++) {
    const input: number = buffer[i];

    // 降采样：每隔 safeReduction 个样本重新量化一次
    if (sampleCounter >= safeReduction) {
      sampleCounter = 0;
      // 量化到指定位深度
      holdSample = Math.round(input * levels) / levels;
    }
    sampleCounter++;

    // 输出量化后的保持样本
    buffer[i] = holdSample;
  }

  return buffer;
}

// ============================================================================
// 十二、波形塑形 (Waveshaper)
// ============================================================================

/**
 * 对输入缓冲区应用波形塑形（Waveshaper）效果。
 *
 * 波形塑形通过非线性传递函数改变信号的波形，产生谐波失真。
 * 支持多种经典曲线：tanh、arctan、sigmoid、polynomial、hardclip、softclip、sinefold。
 *
 * @param buffer - 输入的单声道音频缓冲区（会被原地修改）
 * @param amount - 失真量（0.0 ~ 1.0），控制驱动程度
 * @param type - 塑形曲线类型
 * @returns 处理后的缓冲区
 *
 * @example
 * ```ts
 * const buffer = new Float32Array(44100);
 * applyWaveshaper(buffer, 0.5, 'tanh');
 * applyWaveshaper(buffer, 0.7, 'sinefold');
 * ```
 */
export function applyWaveshaper(buffer: Float32Array, amount: number, type: string): Float32Array {
  const safeAmount: number = clamp(amount, 0.0, 1.0);
  const safeType: WaveshaperType = (
    ['tanh', 'arctan', 'sigmoid', 'polynomial', 'hardclip', 'softclip', 'sinefold'].includes(type)
      ? type
      : 'tanh'
  ) as WaveshaperType;

  if (safeAmount < 0.001) return buffer;

  const length: number = buffer.length;

  // 预计算驱动增益：amount 从 0 到 1 映射到 1x ~ 20x
  const drive: number = 1.0 + safeAmount * 19.0;

  for (let i: number = 0; i < length; i++) {
    const input: number = buffer[i];
    const driven: number = input * drive;
    let shaped: number = 0.0;

    switch (safeType) {
      case 'tanh': {
        // 双曲正切软削波：平滑的奇次谐波
        shaped = Math.tanh(driven);
        break;
      }
      case 'arctan': {
        // 反正切软削波：比 tanh 更柔和
        const factor: number = 1.0 + safeAmount * 9.0;
        shaped = Math.atan(driven * factor) / Math.atan(factor);
        break;
      }
      case 'sigmoid': {
        // Sigmoid 曲线：y = x / (1 + |x|)
        shaped = driven / (1.0 + Math.abs(driven));
        break;
      }
      case 'polynomial': {
        // 多项式塑形：引入偶次和奇次谐波
        // y = x - 0.3*x^3 + 0.1*x^5（适度饱和）
        const x2: number = driven * driven;
        const x3: number = x2 * driven;
        const x5: number = x3 * x2;
        shaped = driven - 0.3 * x3 + 0.1 * x5;
        // 软限幅
        shaped = Math.tanh(shaped);
        break;
      }
      case 'hardclip': {
        // 硬削波：最激进的失真
        shaped = clamp(driven, -1.0, 1.0);
        break;
      }
      case 'softclip': {
        // 软削波：三段线性近似
        const threshold: number = 1.0 / 3.0;
        if (Math.abs(driven) < threshold) {
          shaped = driven * 2.0;
        } else if (Math.abs(driven) < 2.0 * threshold) {
          const sign: number = Math.sign(driven);
          shaped = sign * (3.0 - Math.pow(2.0 - sign * driven * 3.0, 2.0)) / 3.0;
        } else {
          shaped = Math.sign(driven);
        }
        break;
      }
      case 'sinefold': {
        // 正弦折叠：产生丰富的谐波系列
        shaped = Math.sin(driven * Math.PI * 0.5);
        break;
      }
    }

    // 干湿混合
    buffer[i] = input * (1.0 - safeAmount) + shaped * safeAmount;
  }

  return buffer;
}

// ============================================================================
// 高级效果链 (AdvancedEffectsChain)
// ============================================================================

/**
 * 效果链节点类型枚举
 */
export enum AdvancedEffectType {
  Flanger = 'flanger',
  Phaser = 'phaser',
  Exciter = 'exciter',
  DeEsser = 'deesser',
  StereoWidener = 'stereoWidener',
  MultibandCompression = 'multibandCompression',
  BrickwallLimiter = 'brickwallLimiter',
  Tremolo = 'tremolo',
  AutoPan = 'autoPan',
  RingModulation = 'ringModulation',
  BitCrusher = 'bitCrusher',
  Waveshaper = 'waveshaper',
}

/**
 * 效果链节点配置接口
 */
export interface AdvancedEffectNode {
  /** 效果器类型 */
  type: AdvancedEffectType;
  /** 是否启用 */
  enabled: boolean;
  /** 湿信号混合比例（0.0 ~ 1.0） */
  wet: number;
  /** 效果器参数（键值对） */
  params: Record<string, number | string>;
}

/**
 * 高级效果链类（AdvancedEffectsChain）
 *
 * 支持链式调用多个高级效果器，提供启用/禁用、湿信号比例控制、
 * 预设保存与加载等功能。所有效果器按添加顺序串行处理。
 *
 * @example
 * ```ts
 * const chain = new AdvancedEffectsChain();
 * chain.addEffect(AdvancedEffectType.Flanger, { rate: 0.5, depth: 0.7, feedback: 0.6 });
 * chain.addEffect(AdvancedEffectType.BrickwallLimiter, { threshold: -1.0, release: 50 });
 * chain.process(buffer);
 * ```
 */
export class AdvancedEffectsChain {
  private nodes: AdvancedEffectNode[] = [];
  private sampleRate: number = SAMPLE_RATE;

  /**
   * 创建新的高级效果链实例
   * @param sampleRate 采样率（默认 44100）
   */
  constructor(sampleRate?: number) {
    if (sampleRate !== undefined) {
      this.sampleRate = sampleRate;
    }
  }

  /**
   * 添加效果器到链尾
   * @param type 效果器类型
   * @param params 效果器参数对象
   * @param wet 湿信号比例（0.0 ~ 1.0，默认 1.0）
   * @returns 当前实例（支持链式调用）
   */
  public addEffect(type: AdvancedEffectType, params: Record<string, number | string> = {}, wet: number = 1.0): AdvancedEffectsChain {
    this.nodes.push({
      type,
      enabled: true,
      wet: clamp(wet, 0.0, 1.0),
      params: { ...params },
    });
    return this;
  }

  /**
   * 在指定位置插入效果器
   * @param index 插入位置索引
   * @param type 效果器类型
   * @param params 效果器参数
   * @param wet 湿信号比例
   * @returns 当前实例
   */
  public insertEffect(index: number, type: AdvancedEffectType, params: Record<string, number | string> = {}, wet: number = 1.0): AdvancedEffectsChain {
    if (index < 0 || index > this.nodes.length) {
      throw new Error(`插入索引 ${index} 超出范围 [0, ${this.nodes.length}]`);
    }
    this.nodes.splice(index, 0, {
      type,
      enabled: true,
      wet: clamp(wet, 0.0, 1.0),
      params: { ...params },
    });
    return this;
  }

  /**
   * 移除指定位置的效果器
   * @param index 效果器索引
   * @returns 当前实例
   */
  public removeEffect(index: number): AdvancedEffectsChain {
    if (index < 0 || index >= this.nodes.length) {
      throw new Error(`移除索引 ${index} 超出范围 [0, ${this.nodes.length - 1}]`);
    }
    this.nodes.splice(index, 1);
    return this;
  }

  /**
   * 设置效果器的启用状态
   * @param index 效果器索引
   * @param enabled 是否启用
   * @returns 当前实例
   */
  public setEnabled(index: number, enabled: boolean): AdvancedEffectsChain {
    if (index >= 0 && index < this.nodes.length) {
      this.nodes[index].enabled = enabled;
    }
    return this;
  }

  /**
   * 设置效果器的湿信号比例
   * @param index 效果器索引
   * @param wet 湿信号比例（0.0 ~ 1.0）
   * @returns 当前实例
   */
  public setWet(index: number, wet: number): AdvancedEffectsChain {
    if (index >= 0 && index < this.nodes.length) {
      this.nodes[index].wet = clamp(wet, 0.0, 1.0);
    }
    return this;
  }

  /**
   * 更新效果器参数
   * @param index 效果器索引
   * @param params 新参数（会与现有参数合并）
   * @returns 当前实例
   */
  public setParams(index: number, params: Record<string, number | string>): AdvancedEffectsChain {
    if (index >= 0 && index < this.nodes.length) {
      this.nodes[index].params = { ...this.nodes[index].params, ...params };
    }
    return this;
  }

  /**
   * 获取效果链长度
   * @returns 效果器数量
   */
  public get length(): number {
    return this.nodes.length;
  }

  /**
   * 清空效果链
   * @returns 当前实例
   */
  public clear(): AdvancedEffectsChain {
    this.nodes = [];
    return this;
  }

  /**
   * 处理单声道缓冲区
   * @param buffer 输入的单声道缓冲区（会被原地修改）
   * @returns 处理后的缓冲区
   */
  public processMono(buffer: Float32Array): Float32Array {
    for (let n: number = 0; n < this.nodes.length; n++) {
      const node: AdvancedEffectNode = this.nodes[n];
      if (!node.enabled) continue;

      // 创建临时缓冲区以支持干湿混合
      const dryBuffer: Float32Array = buffer.slice();
      const p: Record<string, number | string> = node.params;

      switch (node.type) {
        case AdvancedEffectType.Flanger: {
          applyFlanger(buffer, Number(p.rate ?? 0.5), Number(p.depth ?? 0.7), Number(p.feedback ?? 0.5));
          break;
        }
        case AdvancedEffectType.Phaser: {
          applyPhaser(buffer, Number(p.stages ?? 6), Number(p.rate ?? 0.5), Number(p.depth ?? 0.7));
          break;
        }
        case AdvancedEffectType.Exciter: {
          applyExciter(buffer, Number(p.amount ?? 0.3));
          break;
        }
        case AdvancedEffectType.DeEsser: {
          applyDeEsser(buffer, Number(p.threshold ?? -24), Number(p.freq ?? 6500));
          break;
        }
        case AdvancedEffectType.Tremolo: {
          applyTremolo(buffer, Number(p.rate ?? 5.0), Number(p.depth ?? 0.5), String(p.shape ?? 'sine'));
          break;
        }
        case AdvancedEffectType.RingModulation: {
          applyRingModulation(buffer, Number(p.freq ?? 440), Number(p.amount ?? 0.5));
          break;
        }
        case AdvancedEffectType.BitCrusher: {
          applyBitCrusher(buffer, Number(p.bits ?? 8), Number(p.sampleRateReduction ?? 4));
          break;
        }
        case AdvancedEffectType.Waveshaper: {
          applyWaveshaper(buffer, Number(p.amount ?? 0.5), String(p.type ?? 'tanh'));
          break;
        }
        case AdvancedEffectType.BrickwallLimiter: {
          applyBrickwallLimiter(buffer, Number(p.threshold ?? -1.0), Number(p.release ?? 50));
          break;
        }
        case AdvancedEffectType.MultibandCompression: {
          // 单声道不支持多段压缩的默认参数，需要传入 bands
          if (p.bands && Array.isArray(p.bands)) {
            applyMultibandCompression(buffer, p.bands as unknown as BandConfig[]);
          }
          break;
        }
        default: {
          // 立体声专属效果器在单声道模式下跳过
          break;
        }
      }

      // 应用湿信号混合
      if (node.wet < 1.0) {
        const dryGain: number = 1.0 - node.wet;
        for (let i: number = 0; i < buffer.length; i++) {
          buffer[i] = dryBuffer[i] * dryGain + buffer[i] * node.wet;
        }
      }
    }

    return buffer;
  }

  /**
   * 处理交错立体声缓冲区
   * @param buffer 交错的立体声缓冲区（长度必须为偶数，会被原地修改）
   * @returns 处理后的缓冲区
   */
  public processStereo(buffer: Float32Array): Float32Array {
    if (buffer.length % 2 !== 0) {
      throw new Error('立体声缓冲区长度必须为偶数（交错格式 L0,R0,L1,R1...）');
    }

    for (let n: number = 0; n < this.nodes.length; n++) {
      const node: AdvancedEffectNode = this.nodes[n];
      if (!node.enabled) continue;

      const dryBuffer: Float32Array = buffer.slice();
      const p: Record<string, number | string> = node.params;

      switch (node.type) {
        case AdvancedEffectType.StereoWidener: {
          applyStereoWidener(buffer, Number(p.width ?? 1.5));
          break;
        }
        case AdvancedEffectType.AutoPan: {
          applyAutoPan(buffer, Number(p.rate ?? 1.0), Number(p.depth ?? 0.8));
          break;
        }
        case AdvancedEffectType.Flanger: {
          // 将立体声拆分为左右分别处理
          const left: Float32Array = new Float32Array(buffer.length / 2);
          const right: Float32Array = new Float32Array(buffer.length / 2);
          for (let i: number = 0; i < left.length; i++) {
            left[i] = buffer[i * 2];
            right[i] = buffer[i * 2 + 1];
          }
          applyFlanger(left, Number(p.rate ?? 0.5), Number(p.depth ?? 0.7), Number(p.feedback ?? 0.5));
          applyFlanger(right, Number(p.rate ?? 0.5), Number(p.depth ?? 0.7), Number(p.feedback ?? 0.5));
          for (let i: number = 0; i < left.length; i++) {
            buffer[i * 2] = left[i];
            buffer[i * 2 + 1] = right[i];
          }
          break;
        }
        case AdvancedEffectType.Phaser: {
          const left: Float32Array = new Float32Array(buffer.length / 2);
          const right: Float32Array = new Float32Array(buffer.length / 2);
          for (let i: number = 0; i < left.length; i++) {
            left[i] = buffer[i * 2];
            right[i] = buffer[i * 2 + 1];
          }
          applyPhaser(left, Number(p.stages ?? 6), Number(p.rate ?? 0.5), Number(p.depth ?? 0.7));
          applyPhaser(right, Number(p.stages ?? 6), Number(p.rate ?? 0.5), Number(p.depth ?? 0.7));
          for (let i: number = 0; i < left.length; i++) {
            buffer[i * 2] = left[i];
            buffer[i * 2 + 1] = right[i];
          }
          break;
        }
        case AdvancedEffectType.Exciter: {
          const left: Float32Array = new Float32Array(buffer.length / 2);
          const right: Float32Array = new Float32Array(buffer.length / 2);
          for (let i: number = 0; i < left.length; i++) {
            left[i] = buffer[i * 2];
            right[i] = buffer[i * 2 + 1];
          }
          applyExciter(left, Number(p.amount ?? 0.3));
          applyExciter(right, Number(p.amount ?? 0.3));
          for (let i: number = 0; i < left.length; i++) {
            buffer[i * 2] = left[i];
            buffer[i * 2 + 1] = right[i];
          }
          break;
        }
        case AdvancedEffectType.DeEsser: {
          const left: Float32Array = new Float32Array(buffer.length / 2);
          const right: Float32Array = new Float32Array(buffer.length / 2);
          for (let i: number = 0; i < left.length; i++) {
            left[i] = buffer[i * 2];
            right[i] = buffer[i * 2 + 1];
          }
          applyDeEsser(left, Number(p.threshold ?? -24), Number(p.freq ?? 6500));
          applyDeEsser(right, Number(p.threshold ?? -24), Number(p.freq ?? 6500));
          for (let i: number = 0; i < left.length; i++) {
            buffer[i * 2] = left[i];
            buffer[i * 2 + 1] = right[i];
          }
          break;
        }
        case AdvancedEffectType.Tremolo: {
          const left: Float32Array = new Float32Array(buffer.length / 2);
          const right: Float32Array = new Float32Array(buffer.length / 2);
          for (let i: number = 0; i < left.length; i++) {
            left[i] = buffer[i * 2];
            right[i] = buffer[i * 2 + 1];
          }
          applyTremolo(left, Number(p.rate ?? 5.0), Number(p.depth ?? 0.5), String(p.shape ?? 'sine'));
          applyTremolo(right, Number(p.rate ?? 5.0), Number(p.depth ?? 0.5), String(p.shape ?? 'sine'));
          for (let i: number = 0; i < left.length; i++) {
            buffer[i * 2] = left[i];
            buffer[i * 2 + 1] = right[i];
          }
          break;
        }
        case AdvancedEffectType.RingModulation: {
          const left: Float32Array = new Float32Array(buffer.length / 2);
          const right: Float32Array = new Float32Array(buffer.length / 2);
          for (let i: number = 0; i < left.length; i++) {
            left[i] = buffer[i * 2];
            right[i] = buffer[i * 2 + 1];
          }
          applyRingModulation(left, Number(p.freq ?? 440), Number(p.amount ?? 0.5));
          applyRingModulation(right, Number(p.freq ?? 440), Number(p.amount ?? 0.5));
          for (let i: number = 0; i < left.length; i++) {
            buffer[i * 2] = left[i];
            buffer[i * 2 + 1] = right[i];
          }
          break;
        }
        case AdvancedEffectType.BitCrusher: {
          const left: Float32Array = new Float32Array(buffer.length / 2);
          const right: Float32Array = new Float32Array(buffer.length / 2);
          for (let i: number = 0; i < left.length; i++) {
            left[i] = buffer[i * 2];
            right[i] = buffer[i * 2 + 1];
          }
          applyBitCrusher(left, Number(p.bits ?? 8), Number(p.sampleRateReduction ?? 4));
          applyBitCrusher(right, Number(p.bits ?? 8), Number(p.sampleRateReduction ?? 4));
          for (let i: number = 0; i < left.length; i++) {
            buffer[i * 2] = left[i];
            buffer[i * 2 + 1] = right[i];
          }
          break;
        }
        case AdvancedEffectType.Waveshaper: {
          const left: Float32Array = new Float32Array(buffer.length / 2);
          const right: Float32Array = new Float32Array(buffer.length / 2);
          for (let i: number = 0; i < left.length; i++) {
            left[i] = buffer[i * 2];
            right[i] = buffer[i * 2 + 1];
          }
          applyWaveshaper(left, Number(p.amount ?? 0.5), String(p.type ?? 'tanh'));
          applyWaveshaper(right, Number(p.amount ?? 0.5), String(p.type ?? 'tanh'));
          for (let i: number = 0; i < left.length; i++) {
            buffer[i * 2] = left[i];
            buffer[i * 2 + 1] = right[i];
          }
          break;
        }
        case AdvancedEffectType.BrickwallLimiter: {
          const left: Float32Array = new Float32Array(buffer.length / 2);
          const right: Float32Array = new Float32Array(buffer.length / 2);
          for (let i: number = 0; i < left.length; i++) {
            left[i] = buffer[i * 2];
            right[i] = buffer[i * 2 + 1];
          }
          applyBrickwallLimiter(left, Number(p.threshold ?? -1.0), Number(p.release ?? 50));
          applyBrickwallLimiter(right, Number(p.threshold ?? -1.0), Number(p.release ?? 50));
          for (let i: number = 0; i < left.length; i++) {
            buffer[i * 2] = left[i];
            buffer[i * 2 + 1] = right[i];
          }
          break;
        }
        default: {
          break;
        }
      }

      // 应用湿信号混合
      if (node.wet < 1.0) {
        const dryGain: number = 1.0 - node.wet;
        for (let i: number = 0; i < buffer.length; i++) {
          buffer[i] = dryBuffer[i] * dryGain + buffer[i] * node.wet;
        }
      }
    }

    return buffer;
  }

  /**
   * 根据缓冲区长度自动判断单声道/立体声并处理
   * @param buffer 音频缓冲区
   * @param isStereo 是否为交错立体声（默认 false）
   * @returns 处理后的缓冲区
   */
  public process(buffer: Float32Array, isStereo: boolean = false): Float32Array {
    if (isStereo) {
      return this.processStereo(buffer);
    }
    return this.processMono(buffer);
  }

  /**
   * 导出效果链配置为 JSON 对象
   * @returns 效果链配置
   */
  public exportConfig(): AdvancedEffectNode[] {
    return this.nodes.map((node) => ({ ...node, params: { ...node.params } }));
  }

  /**
   * 从 JSON 配置导入效果链
   * @param config 效果链配置
   * @returns 当前实例
   */
  public importConfig(config: AdvancedEffectNode[]): AdvancedEffectsChain {
    this.nodes = config.map((node) => ({
      type: node.type,
      enabled: node.enabled,
      wet: node.wet,
      params: { ...node.params },
    }));
    return this;
  }

  /**
   * 加载人声处理预设
   * @returns 当前实例
   */
  public loadVocalPreset(): AdvancedEffectsChain {
    this.clear();
    this.addEffect(AdvancedEffectType.DeEsser, { threshold: -26, freq: 7000 }, 1.0);
    this.addEffect(AdvancedEffectType.Exciter, { amount: 0.25 }, 0.4);
    this.addEffect(AdvancedEffectType.StereoWidener, { width: 1.2 }, 0.3);
    this.addEffect(AdvancedEffectType.BrickwallLimiter, { threshold: -2.0, release: 80 }, 1.0);
    return this;
  }

  /**
   * 加载吉他/合成器处理预设
   * @returns 当前实例
   */
  public loadSynthPreset(): AdvancedEffectsChain {
    this.clear();
    this.addEffect(AdvancedEffectType.Flanger, { rate: 0.3, depth: 0.6, feedback: 0.4 }, 0.5);
    this.addEffect(AdvancedEffectType.Phaser, { stages: 8, rate: 0.2, depth: 0.5 }, 0.4);
    this.addEffect(AdvancedEffectType.Waveshaper, { amount: 0.3, type: 'tanh' }, 0.3);
    this.addEffect(AdvancedEffectType.BrickwallLimiter, { threshold: -1.5, release: 40 }, 1.0);
    return this;
  }

  /**
   * 加载 Lo-Fi 实验预设
   * @returns 当前实例
   */
  public loadLoFiPreset(): AdvancedEffectsChain {
    this.clear();
    this.addEffect(AdvancedEffectType.BitCrusher, { bits: 8, sampleRateReduction: 2 }, 0.6);
    this.addEffect(AdvancedEffectType.RingModulation, { freq: 220, amount: 0.15 }, 0.3);
    this.addEffect(AdvancedEffectType.Waveshaper, { amount: 0.2, type: 'softclip' }, 0.4);
    this.addEffect(AdvancedEffectType.Tremolo, { rate: 3.0, depth: 0.3, shape: 'triangle' }, 0.4);
    return this;
  }

  /**
   * 加载母带处理预设
   * @returns 当前实例
   */
  public loadMasteringPreset(): AdvancedEffectsChain {
    this.clear();
    this.addEffect(AdvancedEffectType.Exciter, { amount: 0.15 }, 0.3);
    this.addEffect(AdvancedEffectType.StereoWidener, { width: 1.1 }, 0.2);
    this.addEffect(AdvancedEffectType.BrickwallLimiter, { threshold: -0.5, release: 30 }, 1.0);
    return this;
  }
}

// ============================================================================
// 附加工具函数与辅助类
// ============================================================================

/**
 * 生成测试正弦波缓冲区
 * @param freq 频率（Hz）
 * @param durationSec 持续时间（秒）
 * @param amplitude 振幅（0.0 ~ 1.0，默认 0.5）
 * @returns 生成的正弦波缓冲区
 */
export function createTestSignal(freq: number, durationSec: number, amplitude: number = 0.5): Float32Array {
  const safeFreq: number = clamp(freq, 1.0, 20000.0);
  const safeDuration: number = Math.max(0.001, durationSec);
  const safeAmp: number = clamp(amplitude, 0.0, 1.0);
  const length: number = Math.floor(safeDuration * SAMPLE_RATE);
  const buffer: Float32Array = new Float32Array(length);

  for (let i: number = 0; i < length; i++) {
    buffer[i] = Math.sin((2.0 * Math.PI * safeFreq * i) / SAMPLE_RATE) * safeAmp;
  }

  return buffer;
}

/**
 * 生成测试白噪声缓冲区
 * @param durationSec 持续时间（秒）
 * @param amplitude 振幅（0.0 ~ 1.0，默认 0.3）
 * @returns 生成的白噪声缓冲区
 */
export function createWhiteNoise(durationSec: number, amplitude: number = 0.3): Float32Array {
  const safeDuration: number = Math.max(0.001, durationSec);
  const safeAmp: number = clamp(amplitude, 0.0, 1.0);
  const length: number = Math.floor(safeDuration * SAMPLE_RATE);
  const buffer: Float32Array = new Float32Array(length);

  for (let i: number = 0; i < length; i++) {
    buffer[i] = (Math.random() * 2.0 - 1.0) * safeAmp;
  }

  return buffer;
}

/**
 * 将单声道缓冲区转换为交错立体声缓冲区
 * @param mono 单声道输入
 * @returns 交错立体声输出（长度 = mono.length * 2）
 */
export function monoToStereo(mono: Float32Array): Float32Array {
  const stereo: Float32Array = new Float32Array(mono.length * 2);
  for (let i: number = 0; i < mono.length; i++) {
    stereo[i * 2] = mono[i];
    stereo[i * 2 + 1] = mono[i];
  }
  return stereo;
}

/**
 * 将交错立体声缓冲区拆分为左右两个单声道缓冲区
 * @param stereo 交错立体声输入
 * @returns [left, right] 单声道缓冲区数组
 */
export function stereoToMonoPair(stereo: Float32Array): [Float32Array, Float32Array] {
  const halfLength: number = Math.floor(stereo.length / 2);
  const left: Float32Array = new Float32Array(halfLength);
  const right: Float32Array = new Float32Array(halfLength);

  for (let i: number = 0; i < halfLength; i++) {
    left[i] = stereo[i * 2];
    right[i] = stereo[i * 2 + 1];
  }

  return [left, right];
}

/**
 * 将左右单声道缓冲区合并为交错立体声缓冲区
 * @param left 左声道
 * @param right 右声道
 * @returns 交错立体声缓冲区
 */
export function monoPairToStereo(left: Float32Array, right: Float32Array): Float32Array {
  const length: number = Math.min(left.length, right.length);
  const stereo: Float32Array = new Float32Array(length * 2);

  for (let i: number = 0; i < length; i++) {
    stereo[i * 2] = left[i];
    stereo[i * 2 + 1] = right[i];
  }

  return stereo;
}

/**
 * 验证多段压缩器的频段配置是否合法
 * @param bands 频段配置数组
 * @returns 验证结果 [是否合法, 错误信息]
 */
export function validateBandConfig(bands: BandConfig[]): [boolean, string] {
  if (!Array.isArray(bands) || bands.length < 3 || bands.length > 5) {
    return [false, '频段数量必须在 3 ~ 5 之间'];
  }

  const sorted: BandConfig[] = [...bands].sort((a, b) => a.lowFreq - b.lowFreq);

  for (let i: number = 0; i < sorted.length; i++) {
    const b: BandConfig = sorted[i];
    if (b.lowFreq < 0 || b.highFreq > SAMPLE_RATE / 2) {
      return [false, `频段 ${i} 频率超出有效范围 (0 ~ ${SAMPLE_RATE / 2} Hz)`];
    }
    if (b.lowFreq >= b.highFreq) {
      return [false, `频段 ${i} 的 lowFreq 必须小于 highFreq`];
    }
    if (b.ratio < 1.0) {
      return [false, `频段 ${i} 的压缩比必须 >= 1.0`];
    }
  }

  // 检查频段是否连续覆盖
  for (let i: number = 1; i < sorted.length; i++) {
    if (Math.abs(sorted[i].lowFreq - sorted[i - 1].highFreq) > 1.0) {
      return [false, `频段 ${i - 1} 与频段 ${i} 之间不连续`];
    }
  }

  return [true, ''];
}

/**
 * 创建标准 3 段母带压缩配置
 * @returns 3 段压缩配置数组
 */
export function createMasteringBands3(): BandConfig[] {
  return [
    { lowFreq: 0, highFreq: 250, thresholdDb: -20, ratio: 4, attackMs: 20, releaseMs: 150, makeupGainDb: 3 },
    { lowFreq: 250, highFreq: 4000, thresholdDb: -16, ratio: 3, attackMs: 10, releaseMs: 100, makeupGainDb: 2 },
    { lowFreq: 4000, highFreq: 22050, thresholdDb: -18, ratio: 2.5, attackMs: 5, releaseMs: 80, makeupGainDb: 2 },
  ];
}

/**
 * 创建标准 4 段人声压缩配置
 * @returns 4 段压缩配置数组
 */
export function createVocalBands4(): BandConfig[] {
  return [
    { lowFreq: 0, highFreq: 200, thresholdDb: -24, ratio: 3, attackMs: 15, releaseMs: 120, makeupGainDb: 2 },
    { lowFreq: 200, highFreq: 1000, thresholdDb: -18, ratio: 2.5, attackMs: 8, releaseMs: 80, makeupGainDb: 1.5 },
    { lowFreq: 1000, highFreq: 5000, thresholdDb: -20, ratio: 3, attackMs: 5, releaseMs: 60, makeupGainDb: 2 },
    { lowFreq: 5000, highFreq: 22050, thresholdDb: -22, ratio: 2, attackMs: 3, releaseMs: 50, makeupGainDb: 1 },
  ];
}

/**
 * 创建标准 5 段全频压缩配置
 * @returns 5 段压缩配置数组
 */
export function createFullRangeBands5(): BandConfig[] {
  return [
    { lowFreq: 0, highFreq: 120, thresholdDb: -22, ratio: 3, attackMs: 25, releaseMs: 200, makeupGainDb: 3 },
    { lowFreq: 120, highFreq: 500, thresholdDb: -18, ratio: 2.5, attackMs: 12, releaseMs: 120, makeupGainDb: 2 },
    { lowFreq: 500, highFreq: 2000, thresholdDb: -16, ratio: 2, attackMs: 8, releaseMs: 90, makeupGainDb: 1.5 },
    { lowFreq: 2000, highFreq: 8000, thresholdDb: -20, ratio: 2.5, attackMs: 5, releaseMs: 70, makeupGainDb: 2 },
    { lowFreq: 8000, highFreq: 22050, thresholdDb: -24, ratio: 2, attackMs: 3, releaseMs: 50, makeupGainDb: 1.5 },
  ];
}

/**
 * 计算缓冲区的峰值因子（Crest Factor）
 * 峰值因子 = 峰值 / RMS，反映信号的动态范围
 * @param buffer 输入缓冲区
 * @returns 峰值因子（dB）
 */
export function calculateCrestFactor(buffer: Float32Array): number {
  let peak: number = 0.0;
  let sumSquares: number = 0.0;

  for (let i: number = 0; i < buffer.length; i++) {
    const abs: number = Math.abs(buffer[i]);
    peak = Math.max(peak, abs);
    sumSquares += abs * abs;
  }

  const rms: number = Math.sqrt(sumSquares / buffer.length);
  if (rms < 1e-10) return 0.0;

  return gainToDb(peak / rms);
}

/**
 * 对两个缓冲区进行交叉淡化（Crossfade）
 * @param fromBuffer 起始缓冲区
 * @param toBuffer 目标缓冲区
 * @param fadeSamples 淡化样本数
 * @returns 交叉淡化后的缓冲区
 */
export function crossfadeBuffers(fromBuffer: Float32Array, toBuffer: Float32Array, fadeSamples: number): Float32Array {
  const length: number = Math.min(fromBuffer.length, toBuffer.length);
  const safeFade: number = Math.max(1, Math.min(fadeSamples, length));
  const output: Float32Array = new Float32Array(length);

  for (let i: number = 0; i < length; i++) {
    if (i < safeFade) {
      const t: number = i / safeFade;
      output[i] = fromBuffer[i] * (1.0 - t) + toBuffer[i] * t;
    } else {
      output[i] = toBuffer[i];
    }
  }

  return output;
}

/**
 * 对缓冲区应用淡入效果
 * @param buffer 输入缓冲区（原地修改）
 * @param fadeSamples 淡入样本数
 * @returns 处理后的缓冲区
 */
export function applyFadeIn(buffer: Float32Array, fadeSamples: number): Float32Array {
  const safeFade: number = Math.max(1, Math.min(fadeSamples, buffer.length));
  for (let i: number = 0; i < safeFade; i++) {
    const gain: number = i / safeFade;
    buffer[i] *= gain;
  }
  return buffer;
}

/**
 * 对缓冲区应用淡出效果
 * @param buffer 输入缓冲区（原地修改）
 * @param fadeSamples 淡出样本数
 * @returns 处理后的缓冲区
 */
export function applyFadeOut(buffer: Float32Array, fadeSamples: number): Float32Array {
  const safeFade: number = Math.max(1, Math.min(fadeSamples, buffer.length));
  const startIdx: number = buffer.length - safeFade;
  for (let i: number = 0; i < safeFade; i++) {
    const gain: number = 1.0 - i / safeFade;
    buffer[startIdx + i] *= gain;
  }
  return buffer;
}

// ============================================================================
// 附加专业工具类与高级功能
// ============================================================================

/**
 * 立体声镶边处理器（StereoFlanger）
 * 提供独立的左右声道 LFO 相位偏移，产生宽广的立体声镶边效果。
 */
export class StereoFlanger {
  private leftDelay: DelayLineInternal;
  private rightDelay: DelayLineInternal;
  private rate: number;
  private depth: number;
  private feedback: number;
  private phase: number = 0.0;
  private phaseOffset: number; // 左右 LFO 相位差
  private baseDelayMs: number = 0.1;
  private maxDelayMs: number = 10.0;

  /**
   * 创建立体声镶边器实例
   * @param rate LFO 速率（Hz）
   * @param depth 调制深度（0.0 ~ 1.0）
   * @param feedback 反馈量（-0.99 ~ 0.99）
   * @param phaseOffset 左右相位差（0.0 ~ 1.0），0.5 表示反相
   */
  constructor(rate: number = 0.5, depth: number = 0.7, feedback: number = 0.5, phaseOffset: number = 0.25) {
    this.rate = clamp(rate, 0.01, 20.0);
    this.depth = clamp(depth, 0.0, 1.0);
    this.feedback = clamp(feedback, -0.999, 0.999);
    this.phaseOffset = clamp(phaseOffset, 0.0, 1.0);
    this.leftDelay = new DelayLineInternal(20.0);
    this.rightDelay = new DelayLineInternal(20.0);
  }

  /**
   * 处理立体声样本对
   * @param leftIn 左声道输入
   * @param rightIn 右声道输入
   * @returns [leftOut, rightOut]
   */
  public processSample(leftIn: number, rightIn: number): [number, number] {
    const phaseIncrement: number = this.rate / SAMPLE_RATE;

    // 左声道 LFO
    const leftLfo: number = 1.0 - 4.0 * Math.abs(this.phase - 0.5);
    const leftMod: number = (leftLfo + 1.0) * 0.5;
    const leftDelayMs: number = this.baseDelayMs + leftMod * (this.maxDelayMs - this.baseDelayMs) * this.depth;
    const leftDelayed: number = this.leftDelay.read(leftDelayMs);
    const leftFeedback: number = leftIn + leftDelayed * this.feedback;
    this.leftDelay.write(leftFeedback);
    const leftOut: number = leftIn * 0.5 + leftDelayed * 0.5;

    // 右声道 LFO（带相位偏移）
    let rightPhase: number = this.phase + this.phaseOffset;
    if (rightPhase >= 1.0) rightPhase -= 1.0;
    const rightLfo: number = 1.0 - 4.0 * Math.abs(rightPhase - 0.5);
    const rightMod: number = (rightLfo + 1.0) * 0.5;
    const rightDelayMs: number = this.baseDelayMs + rightMod * (this.maxDelayMs - this.baseDelayMs) * this.depth;
    const rightDelayed: number = this.rightDelay.read(rightDelayMs);
    const rightFeedback: number = rightIn + rightDelayed * this.feedback;
    this.rightDelay.write(rightFeedback);
    const rightOut: number = rightIn * 0.5 + rightDelayed * 0.5;

    // 更新相位
    this.phase += phaseIncrement;
    if (this.phase >= 1.0) this.phase -= 1.0;

    return [leftOut, rightOut];
  }

  /**
   * 处理整个交错立体声缓冲区
   * @param buffer 交错立体声缓冲区（长度必须为偶数，原地修改）
   * @returns 处理后的缓冲区
   */
  public processBlock(buffer: Float32Array): Float32Array {
    const pairCount: number = Math.floor(buffer.length / 2);
    for (let i: number = 0; i < pairCount; i++) {
      const leftIdx: number = i * 2;
      const rightIdx: number = i * 2 + 1;
      const [leftOut, rightOut] = this.processSample(buffer[leftIdx], buffer[rightIdx]);
      buffer[leftIdx] = leftOut;
      buffer[rightIdx] = rightOut;
    }
    return buffer;
  }

  /** 重置内部状态 */
  public reset(): void {
    this.leftDelay.reset();
    this.rightDelay.reset();
    this.phase = 0.0;
  }

  /** 设置 LFO 速率 */
  public setRate(rate: number): void {
    this.rate = clamp(rate, 0.01, 20.0);
  }

  /** 设置调制深度 */
  public setDepth(depth: number): void {
    this.depth = clamp(depth, 0.0, 1.0);
  }

  /** 设置反馈量 */
  public setFeedback(feedback: number): void {
    this.feedback = clamp(feedback, -0.999, 0.999);
  }
}

/**
 * 多段频谱分析器（MultibandAnalyzer）
 * 对缓冲区进行粗略的频段能量分析，返回各频段电平。
 */
export class MultibandAnalyzer {
  private crossovers: CrossoverLR[] = [];
  private numBands: number;

  /**
   * 创建多段分析器
   * @param crossoverFreqs 分频频率数组（Hz）
   */
  constructor(crossoverFreqs: number[] = [200, 2000, 8000]) {
    this.numBands = crossoverFreqs.length + 1;
    for (const freq of crossoverFreqs) {
      const xo: CrossoverLR = new CrossoverLR();
      xo.design(freq);
      this.crossovers.push(xo);
    }
  }

  /**
   * 分析缓冲区的频段能量
   * @param buffer 输入缓冲区
   * @returns 各频段 RMS 电平数组（dB）
   */
  public analyze(buffer: Float32Array): number[] {
    // 重置分频器状态
    for (const xo of this.crossovers) xo.reset();

    // 累加各频段能量
    const sums: number[] = new Array(this.numBands).fill(0.0);

    for (let i: number = 0; i < buffer.length; i++) {
      const input: number = buffer[i];
      const bandValues: number[] = new Array(this.numBands).fill(0.0);

      if (this.numBands === 2) {
        const [low, high] = this.crossovers[0].process(input);
        bandValues[0] = low;
        bandValues[1] = high;
      } else if (this.numBands === 3) {
        const [low, midHigh] = this.crossovers[0].process(input);
        const [mid, high] = this.crossovers[1].process(midHigh);
        bandValues[0] = low;
        bandValues[1] = mid;
        bandValues[2] = high;
      } else if (this.numBands === 4) {
        const [b1, rest1] = this.crossovers[0].process(input);
        const [b2, rest2] = this.crossovers[1].process(rest1);
        const [b3, b4] = this.crossovers[2].process(rest2);
        bandValues[0] = b1;
        bandValues[1] = b2;
        bandValues[2] = b3;
        bandValues[3] = b4;
      }

      for (let b: number = 0; b < this.numBands; b++) {
        sums[b] += bandValues[b] * bandValues[b];
      }
    }

    // 转换为 dB
    const result: number[] = [];
    for (let b: number = 0; b < this.numBands; b++) {
      const rms: number = Math.sqrt(sums[b] / buffer.length);
      result.push(gainToDb(rms));
    }

    return result;
  }
}

/**
 * 对输入缓冲区应用谐波共振增强（Harmonic Resonance Enhancement）。
 * 通过一组调谐的带通滤波器增强特定谐波系列的能量。
 *
 * @param buffer - 输入的单声道音频缓冲区（会被原地修改）
 * @param fundamental - 基频（Hz）
 * @param harmonics - 要增强的谐波数量（1 ~ 8）
 * @param amount - 增强量（0.0 ~ 1.0）
 * @returns 处理后的缓冲区
 */
export function applyHarmonicResonance(buffer: Float32Array, fundamental: number, harmonics: number, amount: number): Float32Array {
  const safeFundamental: number = clamp(fundamental, 20.0, 8000.0);
  const safeHarmonics: number = Math.max(1, Math.min(harmonics, 8));
  const safeAmount: number = clamp(amount, 0.0, 1.0);

  if (safeAmount < 0.001) return buffer;

  const length: number = buffer.length;

  // 创建调谐带通滤波器
  const filters: BandPassBiquad[] = [];
  for (let h: number = 1; h <= safeHarmonics; h++) {
    const freq: number = safeFundamental * h;
    if (freq >= SAMPLE_RATE / 2) break;
    const filter: BandPassBiquad = new BandPassBiquad();
    filter.design(freq, 8.0); // 高 Q 值产生共振峰
    filters.push(filter);
  }

  for (let i: number = 0; i < length; i++) {
    const input: number = buffer[i];
    let enhanced: number = 0.0;

    for (const filter of filters) {
      enhanced += filter.process(input);
    }

    // 平均并混合
    if (filters.length > 0) {
      enhanced /= filters.length;
    }

    buffer[i] = input + enhanced * safeAmount;
  }

  // 软限幅
  for (let i: number = 0; i < length; i++) {
    buffer[i] = Math.tanh(buffer[i]);
  }

  return buffer;
}

/**
 * 对输入缓冲区应用微分延迟调制（Differential Delay Modulation）。
 * 通过调制左右声道的微分延迟时间，产生微妙的立体声运动感。
 *
 * @param buffer - 交错立体声缓冲区（长度必须为偶数，原地修改）
 * @param rate - 调制速率（Hz）
 * @param depth - 延迟差异深度（微秒级），建议 10 ~ 200
 * @returns 处理后的缓冲区
 */
export function applyMicroDelayModulation(buffer: Float32Array, rate: number, depth: number): Float32Array {
  const safeRate: number = clamp(rate, 0.01, 10.0);
  const safeDepth: number = clamp(depth, 1.0, 500.0); // 微秒
  const pairCount: number = Math.floor(buffer.length / 2);

  const leftDelay: DelayLineInternal = new DelayLineInternal(2.0); // 2ms 最大延迟
  const rightDelay: DelayLineInternal = new DelayLineInternal(2.0);

  const phaseIncrement: number = safeRate / SAMPLE_RATE;
  let phase: number = 0.0;

  for (let i: number = 0; i < pairCount; i++) {
    const leftIdx: number = i * 2;
    const rightIdx: number = i * 2 + 1;

    const leftIn: number = buffer[leftIdx];
    const rightIn: number = buffer[rightIdx];

    // LFO 调制延迟时间（微秒级）
    const lfoValue: number = Math.sin(2.0 * Math.PI * phase);
    const delayOffsetMs: number = (lfoValue * safeDepth) / 1000.0; // 转毫秒

    leftDelay.write(leftIn);
    rightDelay.write(rightIn);

    buffer[leftIdx] = leftDelay.read(0.5 + delayOffsetMs);
    buffer[rightIdx] = rightDelay.read(0.5 - delayOffsetMs);

    phase += phaseIncrement;
    if (phase >= 1.0) phase -= 1.0;
  }

  return buffer;
}

// ============================================================================
// 模块元数据与工具导出
// ============================================================================

/**
 * 获取本模块的版本信息
 * @returns 版本字符串
 */
export function getAdvancedEffectsVersion(): string {
  return '1.0.0';
}

/**
 * 获取本模块支持的效果器列表
 * @returns 效果器类型数组
 */
export function getSupportedAdvancedEffects(): AdvancedEffectType[] {
  return [
    AdvancedEffectType.Flanger,
    AdvancedEffectType.Phaser,
    AdvancedEffectType.Exciter,
    AdvancedEffectType.DeEsser,
    AdvancedEffectType.StereoWidener,
    AdvancedEffectType.MultibandCompression,
    AdvancedEffectType.BrickwallLimiter,
    AdvancedEffectType.Tremolo,
    AdvancedEffectType.AutoPan,
    AdvancedEffectType.RingModulation,
    AdvancedEffectType.BitCrusher,
    AdvancedEffectType.Waveshaper,
  ];
}

/**
 * 获取指定效果器的默认参数
 * @param type 效果器类型
 * @returns 默认参数对象
 */
export function getDefaultParams(type: AdvancedEffectType): Record<string, unknown> {
  switch (type) {
    case AdvancedEffectType.Flanger:
      return { rate: 0.5, depth: 0.7, feedback: 0.5 };
    case AdvancedEffectType.Phaser:
      return { stages: 6, rate: 0.5, depth: 0.7 };
    case AdvancedEffectType.Exciter:
      return { amount: 0.3 };
    case AdvancedEffectType.DeEsser:
      return { threshold: -24, freq: 6500 };
    case AdvancedEffectType.StereoWidener:
      return { width: 1.5 };
    case AdvancedEffectType.MultibandCompression:
      return {
        bands: [
          { lowFreq: 0, highFreq: 200, thresholdDb: -20, ratio: 4, attackMs: 20, releaseMs: 150, makeupGainDb: 3 },
          { lowFreq: 200, highFreq: 4000, thresholdDb: -16, ratio: 3, attackMs: 10, releaseMs: 100, makeupGainDb: 2 },
          { lowFreq: 4000, highFreq: 20000, thresholdDb: -18, ratio: 2.5, attackMs: 5, releaseMs: 80, makeupGainDb: 2 },
        ],
      };
    case AdvancedEffectType.BrickwallLimiter:
      return { threshold: -1.0, release: 50 };
    case AdvancedEffectType.Tremolo:
      return { rate: 5.0, depth: 0.5, shape: 'sine' };
    case AdvancedEffectType.AutoPan:
      return { rate: 1.0, depth: 0.8 };
    case AdvancedEffectType.RingModulation:
      return { freq: 440, amount: 0.5 };
    case AdvancedEffectType.BitCrusher:
      return { bits: 8, sampleRateReduction: 4 };
    case AdvancedEffectType.Waveshaper:
      return { amount: 0.5, type: 'tanh' };
    default:
      return {};
  }
}

/**
 * 计算缓冲区DC偏移量
 * @param buffer 输入缓冲区
 * @returns DC偏移量
 */
export function calculateDCOffset(buffer: Float32Array): number {
  let sum: number = 0.0;
  for (let i: number = 0; i < buffer.length; i++) {
    sum += buffer[i];
  }
  return sum / buffer.length;
}

/**
 * 移除缓冲区DC偏移
 * @param buffer 输入缓冲区（原地修改）
 * @returns 处理后的缓冲区
 */
export function removeDCOffset(buffer: Float32Array): Float32Array {
  const dc: number = calculateDCOffset(buffer);
  if (Math.abs(dc) < 1e-10) return buffer;
  for (let i: number = 0; i < buffer.length; i++) {
    buffer[i] -= dc;
  }
  return buffer;
}

/**
 * 反转缓冲区相位
 * @param buffer 输入缓冲区（原地修改）
 * @returns 处理后的缓冲区
 */
export function invertPhase(buffer: Float32Array): Float32Array {
  for (let i: number = 0; i < buffer.length; i++) {
    buffer[i] = -buffer[i];
  }
  return buffer;
}

/**
 * 对两个单声道缓冲区进行极性相关检测
 * @param a 缓冲区A
 * @param b 缓冲区B
 * @returns 相关系数（-1.0 ~ 1.0）
 */
export function polarityCorrelation(a: Float32Array, b: Float32Array): number {
  const length: number = Math.min(a.length, b.length);
  let sumProduct: number = 0.0;
  let sumA2: number = 0.0;
  let sumB2: number = 0.0;

  for (let i: number = 0; i < length; i++) {
    sumProduct += a[i] * b[i];
    sumA2 += a[i] * a[i];
    sumB2 += b[i] * b[i];
  }

  const denom: number = Math.sqrt(sumA2 * sumB2);
  if (denom < 1e-10) return 0.0;
  return sumProduct / denom;
}
