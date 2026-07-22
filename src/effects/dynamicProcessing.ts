/**
 * ============================================================
 * 青鸾数字音频工作站 - 动态处理引擎
 * QingLuan DAW - Dynamic Processing Engine
 * ============================================================
 * 本模块提供专业级动态范围处理功能，涵盖噪声门、扩展器、瞬态塑形器、
 * 闪避器、RMS 压缩器、前瞻限制器以及自动增益等处理工具。
 *
 * 所有处理函数直接操作 Float32Array 缓冲区，采样率统一为 44100Hz。
 * 采用 ESM 模块格式，支持独立调用与组合处理。
 * ============================================================
 */

import { clamp, lerp, dbToGain, gainToDb } from '../utils/audioUtils.js';

// ============================================================================
// 全局常量与类型定义
// ============================================================================

/** 统一采样率：44100 Hz */
const SAMPLE_RATE: number = 44100;

/** 噪声门配置接口 */
export interface NoiseGateConfig {
  /** 阈值（dB），低于此电平的门被关闭 */
  thresholdDb: number;
  /** 启动时间（毫秒），门打开的速度 */
  attackMs: number;
  /** 释放时间（毫秒），门关闭的速度 */
  releaseMs: number;
  /** 保持时间（毫秒），信号低于阈值后保持打开的时间 */
  holdMs: number;
}

/** 扩展器配置接口 */
export interface ExpanderConfig {
  /** 阈值（dB） */
  thresholdDb: number;
  /** 扩展比（如 2 表示 1:2） */
  ratio: number;
  /** 启动时间（毫秒） */
  attackMs: number;
  /** 释放时间（毫秒） */
  releaseMs: number;
}

/** 瞬态塑形器配置接口 */
export interface TransientShaperConfig {
  /**  attack 增强/衰减量（-1.0 ~ 1.0），正值增强瞬态 */
  attack: number;
  /** sustain 增强/衰减量（-1.0 ~ 1.0），正值延长 sustain */
  sustain: number;
}

/** 闪避器配置接口 */
export interface DuckerConfig {
  /** 阈值（dB） */
  thresholdDb: number;
  /** 闪避比（如 4 表示 4:1） */
  ratio: number;
}

/** RMS 压缩器配置接口 */
export interface CompressorRMSConfig {
  /** 阈值（dB） */
  thresholdDb: number;
  /** 压缩比 */
  ratio: number;
  /** 启动时间（毫秒） */
  attackMs: number;
  /** 释放时间（毫秒） */
  releaseMs: number;
}

/** 前瞻限制器配置接口 */
export interface LookaheadLimiterConfig {
  /** 限制阈值（dB） */
  thresholdDb: number;
  /** 前瞻时间（毫秒） */
  lookaheadMs: number;
  /** 释放时间（毫秒） */
  releaseMs: number;
}

/** 自动增益配置接口 */
export interface AutoGainConfig {
  /** 目标电平（dBFS） */
  targetDb: number;
}

/** 动态处理器类型枚举 */
export enum DynamicProcessorType {
  NoiseGate = 'noiseGate',
  Expander = 'expander',
  TransientShaper = 'transientShaper',
  Ducker = 'ducker',
  CompressorRMS = 'compressorRMS',
  LookaheadLimiter = 'lookaheadLimiter',
  AutoGain = 'autoGain',
}

/** 动态处理器节点接口 */
export interface DynamicProcessorNode {
  type: DynamicProcessorType;
  enabled: boolean;
  params: Record<string, number>;
}

// ============================================================================
// 内部辅助函数与类
// ============================================================================

/**
 * 计算 RMS 电平（均方根）
 * @param buffer 输入缓冲区
 * @param start 起始索引
 * @param end 结束索引
 * @returns RMS 值
 */
function calculateRMSWindow(buffer: Float32Array, start: number, end: number): number {
  let sum: number = 0.0;
  const s: number = Math.max(0, start);
  const e: number = Math.min(buffer.length, end);
  const count: number = e - s;
  if (count <= 0) return 0.0;
  for (let i: number = s; i < e; i++) {
    sum += buffer[i] * buffer[i];
  }
  return Math.sqrt(sum / count);
}

/**
 * 计算峰值电平
 * @param buffer 输入缓冲区
 * @param start 起始索引
 * @param end 结束索引
 * @returns 峰值
 */
function calculatePeakWindow(buffer: Float32Array, start: number, end: number): number {
  let peak: number = 0.0;
  const s: number = Math.max(0, start);
  const e: number = Math.min(buffer.length, end);
  for (let i: number = s; i < e; i++) {
    peak = Math.max(peak, Math.abs(buffer[i]));
  }
  return peak;
}

/**
 * 计算一阶差分（微分近似）
 * @param buffer 输入缓冲区
 * @returns 差分缓冲区
 */
function differentiate(buffer: Float32Array): Float32Array {
  const length: number = buffer.length;
  const diff: Float32Array = new Float32Array(length);
  diff[0] = buffer[0];
  for (let i: number = 1; i < length; i++) {
    diff[i] = buffer[i] - buffer[i - 1];
  }
  return diff;
}

/**
 * 计算累积和（积分近似）
 * @param buffer 输入缓冲区
 * @returns 累积缓冲区
 */
function integrate(buffer: Float32Array): Float32Array {
  const length: number = buffer.length;
  const integ: Float32Array = new Float32Array(length);
  let sum: number = 0.0;
  for (let i: number = 0; i < length; i++) {
    sum += buffer[i];
    integ[i] = sum;
  }
  return integ;
}

/**
 * 计算指数平滑系数
 * @param timeMs 时间常数（毫秒）
 * @param sampleRate 采样率
 * @returns 平滑系数
 */
function timeConstantToCoeff(timeMs: number, sampleRate: number = SAMPLE_RATE): number {
  return Math.exp(-1.0 / ((timeMs / 1000.0) * sampleRate));
}

// ============================================================================
// 一、噪声门 (Noise Gate)
// ============================================================================

/**
 * 对输入缓冲区应用噪声门（Noise Gate）效果。
 *
 * 噪声门用于抑制低于阈值的信号（如环境噪声、呼吸声、串音等）。
 * 当信号电平高于阈值时，门快速打开（attack）；当信号持续低于阈值
 * 超过保持时间后，门开始关闭（release），将信号衰减到极低的电平。
 *
 * @param buffer - 输入的单声道音频缓冲区（会被原地修改）
 * @param threshold - 阈值（dB），建议范围 -60 ~ -20
 * @param attack - 启动时间（毫秒），建议 0.1 ~ 10
 * @param release - 释放时间（毫秒），建议 10 ~ 500
 * @param hold - 保持时间（毫秒），建议 0 ~ 200
 * @returns 处理后的缓冲区
 *
 * @example
 * ```ts
 * const buffer = new Float32Array(44100);
 * applyNoiseGate(buffer, -40, 0.5, 50, 20);
 * ```
 */
export function applyNoiseGate(
  buffer: Float32Array,
  threshold: number,
  attack: number,
  release: number,
  hold: number
): Float32Array {
  const safeThreshold: number = clamp(threshold, -80.0, 0.0);
  const safeAttack: number = clamp(attack, 0.01, 100.0);
  const safeRelease: number = clamp(release, 1.0, 2000.0);
  const safeHold: number = clamp(hold, 0.0, 1000.0);

  const length: number = buffer.length;
  const thresholdLinear: number = dbToGain(safeThreshold);

  // 时间系数
  const attackCoeff: number = timeConstantToCoeff(safeAttack);
  const releaseCoeff: number = timeConstantToCoeff(safeRelease);
  const holdSamples: number = Math.floor((safeHold / 1000.0) * SAMPLE_RATE);

  // 状态变量
  let envelope: number = 0.0;
  let gain: number = 0.0;
  let holdCounter: number = 0;
  let isOpen: boolean = false;

  for (let i: number = 0; i < length; i++) {
    const input: number = Math.abs(buffer[i]);

    // 峰值检测（用于门的开关判断）
    if (input > envelope) {
      envelope = attackCoeff * envelope + (1.0 - attackCoeff) * input;
    } else {
      envelope = releaseCoeff * envelope + (1.0 - releaseCoeff) * input;
    }

    // 门状态机
    if (envelope > thresholdLinear) {
      // 信号高于阈值：门打开，重置保持计数器
      isOpen = true;
      holdCounter = holdSamples;
    } else if (holdCounter > 0) {
      // 保持期内保持打开
      holdCounter--;
    } else {
      // 保持期结束，门关闭
      isOpen = false;
    }

    // 增益平滑：打开时快速上升到 1.0，关闭时按释放时间衰减
    if (isOpen) {
      gain = attackCoeff * gain + (1.0 - attackCoeff) * 1.0;
    } else {
      gain = releaseCoeff * gain + (1.0 - releaseCoeff) * 0.0;
    }

    // 应用增益（完全关闭时保留极小的底噪，避免绝对零导致的数字 artifacts）
    const floorGain: number = 0.0001; // -80dB 地板
    const finalGain: number = Math.max(gain, floorGain);
    buffer[i] = buffer[i] * finalGain;
  }

  return buffer;
}

// ============================================================================
// 二、扩展器 (Expander)
// ============================================================================

/**
 * 对输入缓冲区应用扩展器（Expander）效果。
 *
 * 扩展器与压缩器相反：它减小低于阈值的信号的增益，从而扩大动态范围。
 * 当 ratio = ∞ 时，扩展器退化为噪声门。
 * 常用于恢复过度压缩音频的动态感，或作为门限的柔和替代。
 *
 * @param buffer - 输入的单声道音频缓冲区（会被原地修改）
 * @param threshold - 阈值（dB），建议范围 -50 ~ -20
 * @param ratio - 扩展比（如 2 表示 1:2，低于阈值的信号按 2:1 衰减）
 * @param attack - 启动时间（毫秒），建议 1 ~ 50
 * @param release - 释放时间（毫秒），建议 10 ~ 500
 * @returns 处理后的缓冲区
 *
 * @example
 * ```ts
 * const buffer = new Float32Array(44100);
 * applyExpander(buffer, -35, 2, 5, 80);
 * ```
 */
export function applyExpander(
  buffer: Float32Array,
  threshold: number,
  ratio: number,
  attack: number,
  release: number
): Float32Array {
  const safeThreshold: number = clamp(threshold, -80.0, 0.0);
  const safeRatio: number = Math.max(1.0, ratio);
  const safeAttack: number = clamp(attack, 0.1, 500.0);
  const safeRelease: number = clamp(release, 1.0, 2000.0);

  const length: number = buffer.length;
  const thresholdLinear: number = dbToGain(safeThreshold);

  const attackCoeff: number = timeConstantToCoeff(safeAttack);
  const releaseCoeff: number = timeConstantToCoeff(safeRelease);

  let envelope: number = 0.0;
  let gain: number = 1.0;

  for (let i: number = 0; i < length; i++) {
    const input: number = Math.abs(buffer[i]);

    // 峰值包络检测
    if (input > envelope) {
      envelope = attackCoeff * envelope + (1.0 - attackCoeff) * input;
    } else {
      envelope = releaseCoeff * envelope + (1.0 - releaseCoeff) * input;
    }

    // 计算目标增益
    let targetGain: number = 1.0;
    if (envelope < thresholdLinear) {
      // 低于阈值：按扩展比衰减
      const dbBelow: number = gainToDb(thresholdLinear / (envelope + 1e-10));
      const reductionDb: number = dbBelow * (1.0 - 1.0 / safeRatio);
      targetGain = dbToGain(-reductionDb);
    }

    // 增益平滑（防止抽吸声）
    if (targetGain < gain) {
      gain = attackCoeff * gain + (1.0 - attackCoeff) * targetGain;
    } else {
      gain = releaseCoeff * gain + (1.0 - releaseCoeff) * targetGain;
    }

    buffer[i] = buffer[i] * gain;
  }

  return buffer;
}

// ============================================================================
// 三、瞬态塑形器 (Transient Shaper)
// ============================================================================

/**
 * 对输入缓冲区应用瞬态塑形器（Transient Shaper）效果。
 *
 * 瞬态塑形器通过检测信号的微分（变化率）来区分 attack（起振）和 sustain（持续）阶段。
 * - 正的 attack 值增强打击感（如鼓的敲击）
 * - 负的 attack 值柔化起振（如平滑人声）
 * - 正的 sustain 值延长尾音（如增加混响感）
 * - 负的 sustain 值缩短尾音（如去房间声）
 *
 * @param buffer - 输入的单声道音频缓冲区（会被原地修改）
 * @param attack - Attack 调节量（-1.0 ~ 1.0），正值增强瞬态
 * @param sustain - Sustain 调节量（-1.0 ~ 1.0），正值延长 sustain
 * @returns 处理后的缓冲区
 *
 * @example
 * ```ts
 * const buffer = new Float32Array(44100);
 * applyTransientShaper(buffer, 0.6, -0.3); // 增强 attack，缩短 sustain
 * ```
 */
export function applyTransientShaper(buffer: Float32Array, attack: number, sustain: number): Float32Array {
  const safeAttack: number = clamp(attack, -1.0, 1.0);
  const safeSustain: number = clamp(sustain, -1.0, 1.0);

  if (Math.abs(safeAttack) < 0.001 && Math.abs(safeSustain) < 0.001) {
    return buffer;
  }

  const length: number = buffer.length;

  // 第一步：计算信号的微分（近似变化率）
  const diff: Float32Array = differentiate(buffer);

  // 第二步：对微分信号取绝对值并进行包络检测，提取瞬态强度
  const attackCoeffFast: number = timeConstantToCoeff(1.0); // 1ms 快速 attack
  const releaseCoeffSlow: number = timeConstantToCoeff(100.0); // 100ms 慢释放

  let envelope: number = 0.0;
  const transientEnvelope: Float32Array = new Float32Array(length);

  for (let i: number = 0; i < length; i++) {
    const detected: number = Math.abs(diff[i]);

    if (detected > envelope) {
      envelope = attackCoeffFast * envelope + (1.0 - attackCoeffFast) * detected;
    } else {
      envelope = releaseCoeffSlow * envelope + (1.0 - releaseCoeffSlow) * detected;
    }

    transientEnvelope[i] = envelope;
  }

  // 第三步：归一化瞬态包络
  let maxEnv: number = 0.0;
  for (let i: number = 0; i < length; i++) {
    maxEnv = Math.max(maxEnv, transientEnvelope[i]);
  }
  if (maxEnv > 1e-10) {
    const invMax: number = 1.0 / maxEnv;
    for (let i: number = 0; i < length; i++) {
      transientEnvelope[i] *= invMax;
    }
  }

  // 第四步：分离 attack 和 sustain 成分
  // attack 成分 ≈ 瞬态包络 * 原信号
  // sustain 成分 ≈ (1 - 瞬态包络) * 原信号
  const attackSignal: Float32Array = new Float32Array(length);
  const sustainSignal: Float32Array = new Float32Array(length);

  for (let i: number = 0; i < length; i++) {
    const env: number = transientEnvelope[i];
    attackSignal[i] = buffer[i] * env;
    sustainSignal[i] = buffer[i] * (1.0 - env);
  }

  // 第五步：根据参数调节 attack 和 sustain
  // attack 增益映射：-1 ~ 1 → 0 ~ 2
  const attackGain: number = 1.0 + safeAttack;
  // sustain 增益映射：-1 ~ 1 → 0 ~ 2
  const sustainGain: number = 1.0 + safeSustain;

  for (let i: number = 0; i < length; i++) {
    buffer[i] = attackSignal[i] * attackGain + sustainSignal[i] * sustainGain;
  }

  // 第六步：软限幅防止削波
  for (let i: number = 0; i < length; i++) {
    buffer[i] = Math.tanh(buffer[i]);
  }

  return buffer;
}

// ============================================================================
// 四、闪避器 (Ducker)
// ============================================================================

/**
 * 对输入缓冲区应用闪避器（Ducker）效果。
 *
 * 闪避器根据侧链（sidechain）信号的电平来衰减主信号。
 * 典型应用场景：当有人声（侧链）时，自动降低背景音乐（主信号）的音量。
 * 侧链信号与主信号长度必须一致。
 *
 * @param buffer - 主信号的单声道音频缓冲区（会被原地修改）
 * @param sidechain - 侧链信号的单声道音频缓冲区（用于触发闪避）
 * @param threshold - 闪避阈值（dB），侧链超过此电平时触发
 * @param ratio - 闪避比（如 4 表示 4:1）
 * @returns 处理后的缓冲区
 *
 * @example
 * ```ts
 * const music = new Float32Array(44100);
 * const voice = new Float32Array(44100);
 * applyDucker(music, voice, -20, 6);
 * ```
 */
export function applyDucker(
  buffer: Float32Array,
  sidechain: Float32Array,
  threshold: number,
  ratio: number
): Float32Array {
  if (buffer.length !== sidechain.length) {
    throw new Error(`主信号长度 (${buffer.length}) 与侧链信号长度 (${sidechain.length}) 不一致`);
  }

  const safeThreshold: number = clamp(threshold, -60.0, 0.0);
  const safeRatio: number = Math.max(1.0, ratio);
  const thresholdLinear: number = dbToGain(safeThreshold);

  const length: number = buffer.length;

  // 闪避器使用较快的 attack 和释放，以实现平滑的音量变化
  const attackMs: number = 10.0;
  const releaseMs: number = 80.0;
  const attackCoeff: number = timeConstantToCoeff(attackMs);
  const releaseCoeff: number = timeConstantToCoeff(releaseMs);

  let envelope: number = 0.0;
  let gain: number = 1.0;

  for (let i: number = 0; i < length; i++) {
    const sidechainLevel: number = Math.abs(sidechain[i]);

    // 对侧链信号进行包络检测
    if (sidechainLevel > envelope) {
      envelope = attackCoeff * envelope + (1.0 - attackCoeff) * sidechainLevel;
    } else {
      envelope = releaseCoeff * envelope + (1.0 - releaseCoeff) * sidechainLevel;
    }

    // 计算目标增益：侧链超过阈值时衰减主信号
    let targetGain: number = 1.0;
    if (envelope > thresholdLinear) {
      const dbOver: number = gainToDb(envelope / thresholdLinear);
      const reductionDb: number = dbOver * (1.0 - 1.0 / safeRatio);
      targetGain = dbToGain(-reductionDb);
    }

    // 增益平滑
    if (targetGain < gain) {
      gain = attackCoeff * gain + (1.0 - attackCoeff) * targetGain;
    } else {
      gain = releaseCoeff * gain + (1.0 - releaseCoeff) * targetGain;
    }

    buffer[i] = buffer[i] * gain;
  }

  return buffer;
}

// ============================================================================
// 五、RMS 压缩器 (Compressor RMS)
// ============================================================================

/**
 * 对输入缓冲区应用 RMS 压缩器效果。
 *
 * RMS 压缩器使用均方根值检测输入电平，相比峰值检测更"平滑"，
 * 对短促的瞬态不敏感，能更自然地控制整体动态范围。
 * 常用于总线压缩和人声处理。
 *
 * @param buffer - 输入的单声道音频缓冲区（会被原地修改）
 * @param threshold - 阈值（dB），建议 -30 ~ -10
 * @param ratio - 压缩比（如 4 表示 4:1）
 * @param attack - 启动时间（毫秒），建议 1 ~ 100
 * @param release - 释放时间（毫秒），建议 10 ~ 1000
 * @returns 处理后的缓冲区
 *
 * @example
 * ```ts
 * const buffer = new Float32Array(44100);
 * applyCompressorRMS(buffer, -18, 4, 10, 100);
 * ```
 */
export function applyCompressorRMS(
  buffer: Float32Array,
  threshold: number,
  ratio: number,
  attack: number,
  release: number
): Float32Array {
  const safeThreshold: number = clamp(threshold, -60.0, 0.0);
  const safeRatio: number = Math.max(1.0, ratio);
  const safeAttack: number = clamp(attack, 0.1, 500.0);
  const safeRelease: number = clamp(release, 1.0, 2000.0);
  const thresholdLinear: number = dbToGain(safeThreshold);

  const length: number = buffer.length;

  const attackCoeff: number = timeConstantToCoeff(safeAttack);
  const releaseCoeff: number = timeConstantToCoeff(safeRelease);

  // RMS 窗口大小：约 20ms 的滑动窗口
  const rmsWindowSamples: number = Math.floor(0.02 * SAMPLE_RATE);

  let rmsEnvelope: number = 0.0;
  let gain: number = 1.0;

  // 预计算平方值以提高性能
  const squared: Float32Array = new Float32Array(length);
  for (let i: number = 0; i < length; i++) {
    squared[i] = buffer[i] * buffer[i];
  }

  // 滑动窗口 RMS 计算
  let windowSum: number = 0.0;
  const queue: number[] = [];

  for (let i: number = 0; i < length; i++) {
    windowSum += squared[i];
    queue.push(squared[i]);

    if (queue.length > rmsWindowSamples) {
      windowSum -= queue.shift()!;
    }

    const windowSize: number = queue.length;
    const rms: number = Math.sqrt(windowSum / windowSize);

    // RMS 包络平滑
    if (rms > rmsEnvelope) {
      rmsEnvelope = attackCoeff * rmsEnvelope + (1.0 - attackCoeff) * rms;
    } else {
      rmsEnvelope = releaseCoeff * rmsEnvelope + (1.0 - releaseCoeff) * rms;
    }

    // 计算增益衰减量
    let targetGain: number = 1.0;
    if (rmsEnvelope > thresholdLinear) {
      const dbOver: number = gainToDb(rmsEnvelope / thresholdLinear);
      const reductionDb: number = dbOver * (1.0 - 1.0 / safeRatio);
      targetGain = dbToGain(-reductionDb);
    }

    // 增益平滑（避免抽吸）
    if (targetGain < gain) {
      gain = attackCoeff * gain + (1.0 - attackCoeff) * targetGain;
    } else {
      gain = releaseCoeff * gain + (1.0 - releaseCoeff) * targetGain;
    }

    buffer[i] = buffer[i] * gain;
  }

  return buffer;
}

// ============================================================================
// 六、前瞻限制器 (Lookahead Limiter)
// ============================================================================

/**
 * 对输入缓冲区应用前瞻限制器（Lookahead Limiter）。
 *
 * 前瞻限制器通过预先查看未来信号（lookahead）来提前降低增益，
 * 从而在不产生削波的前提下实现极快的限制响应。
 * 这是母带处理中防止削波的标准工具。
 *
 * @param buffer - 输入的单声道音频缓冲区（会被原地修改）
 * @param threshold - 限制阈值（dB），建议 -3.0 ~ -0.1
 * @param lookahead - 前瞻时间（毫秒），建议 1 ~ 20
 * @param release - 释放时间（毫秒），建议 10 ~ 500
 * @returns 处理后的缓冲区
 *
 * @example
 * ```ts
 * const buffer = new Float32Array(44100);
 * applyLookaheadLimiter(buffer, -1.0, 5, 50);
 * ```
 */
export function applyLookaheadLimiter(
  buffer: Float32Array,
  threshold: number,
  lookahead: number,
  release: number
): Float32Array {
  const safeThreshold: number = clamp(threshold, -12.0, -0.05);
  const safeLookahead: number = clamp(lookahead, 0.1, 50.0);
  const safeRelease: number = clamp(release, 1.0, 1000.0);
  const thresholdLinear: number = dbToGain(safeThreshold);

  const length: number = buffer.length;
  const lookaheadSamples: number = Math.ceil((safeLookahead / 1000.0) * SAMPLE_RATE);
  const releaseCoeff: number = timeConstantToCoeff(safeRelease);

  // 第一步：计算每个样本所需的瞬时增益（基于前瞻窗口内的峰值）
  const gainBuffer: Float32Array = new Float32Array(length);
  let envelope: number = 0.0;

  for (let i: number = 0; i < length; i++) {
    // 查找前瞻窗口内的峰值
    let futurePeak: number = 0.0;
    const end: number = Math.min(length, i + lookaheadSamples);
    for (let j: number = i; j < end; j++) {
      futurePeak = Math.max(futurePeak, Math.abs(buffer[j]));
    }

    // 更新包络（释放阶段自然衰减，attack 阶段立即跟随）
    if (futurePeak > envelope) {
      envelope = futurePeak;
    } else {
      envelope = releaseCoeff * envelope + (1.0 - releaseCoeff) * futurePeak;
    }

    // 计算所需增益
    let gain: number = 1.0;
    if (envelope > thresholdLinear) {
      gain = thresholdLinear / envelope;
    }

    gainBuffer[i] = gain;
  }

  // 第二步：平滑增益曲线（防止增益突变导致的失真）
  const gainSmoothCoeff: number = 0.92;
  let smoothedGain: number = 1.0;

  for (let i: number = 0; i < length; i++) {
    smoothedGain = gainSmoothCoeff * smoothedGain + (1.0 - gainSmoothCoeff) * gainBuffer[i];
    buffer[i] = buffer[i] * smoothedGain;
  }

  return buffer;
}

// ============================================================================
// 七、自动增益 (Auto Gain)
// ============================================================================

/**
 * 对输入缓冲区应用自动增益（Auto Gain）效果。
 *
 * 自动增益计算缓冲区的整体电平，并将其调整到目标 dB 值。
 * 使用缓慢变化的增益系数，避免产生抽吸声。
 * 常用于批量音频文件的电平统一。
 *
 * @param buffer - 输入的单声道音频缓冲区（会被原地修改）
 * @param targetDb - 目标电平（dBFS），建议 -23 ~ -12
 * @returns 处理后的缓冲区
 *
 * @example
 * ```ts
 * const buffer = new Float32Array(44100);
 * applyAutoGain(buffer, -18);
 * ```
 */
export function applyAutoGain(buffer: Float32Array, targetDb: number): Float32Array {
  const safeTargetDb: number = clamp(targetDb, -60.0, 0.0);
  const targetLinear: number = dbToGain(safeTargetDb);

  const length: number = buffer.length;

  // 第一步：计算缓冲区的 RMS 电平
  let sumSquares: number = 0.0;
  for (let i: number = 0; i < length; i++) {
    sumSquares += buffer[i] * buffer[i];
  }
  const rms: number = Math.sqrt(sumSquares / length);

  // 防止除以零
  if (rms < 1e-10) return buffer;

  // 第二步：计算需要的总增益
  const totalGain: number = targetLinear / rms;

  // 第三步：应用缓慢上升的增益（避免突变）
  // 使用指数增长从 1.0 过渡到 totalGain
  const logGainStart: number = Math.log(1.0);
  const logGainEnd: number = Math.log(totalGain);

  for (let i: number = 0; i < length; i++) {
    const t: number = i / length; // 0 ~ 1
    // 使用平滑过渡曲线（S-curve）
    const smoothT: number = t * t * (3.0 - 2.0 * t);
    const currentLogGain: number = logGainStart + (logGainEnd - logGainStart) * smoothT;
    const currentGain: number = Math.exp(currentLogGain);
    buffer[i] = buffer[i] * currentGain;
  }

  // 第四步：最终峰值限制，防止削波
  let peak: number = 0.0;
  for (let i: number = 0; i < length; i++) {
    peak = Math.max(peak, Math.abs(buffer[i]));
  }
  if (peak > 1.0) {
    const limitGain: number = 1.0 / peak;
    for (let i: number = 0; i < length; i++) {
      buffer[i] = buffer[i] * limitGain;
    }
  }

  return buffer;
}

// ============================================================================
// 动态处理器组合类 (DynamicsProcessor)
// ============================================================================

/**
 * 动态处理器组合类（DynamicsProcessor）
 *
 * 该类允许将多种动态处理模块按顺序组合成一条处理链，
 * 并提供统一的配置接口、预设加载、旁通控制等功能。
 * 适用于人声通道条、鼓组总线、母带链等场景。
 *
 * @example
 * ```ts
 * const proc = new DynamicsProcessor();
 * proc.addNoiseGate(-45, 0.5, 30, 10);
 * proc.addCompressorRMS(-18, 3, 8, 100);
 * proc.addLookaheadLimiter(-1, 5, 40);
 * proc.process(buffer);
 * ```
 */
export class DynamicsProcessor {
  private nodes: DynamicProcessorNode[] = [];
  private sampleRate: number = SAMPLE_RATE;

  constructor(sampleRate?: number) {
    if (sampleRate !== undefined) {
      this.sampleRate = sampleRate;
    }
  }

  /**
   * 添加噪声门
   * @param threshold 阈值（dB）
   * @param attack 启动时间（ms）
   * @param release 释放时间（ms）
   * @param hold 保持时间（ms）
   * @returns 当前实例
   */
  public addNoiseGate(threshold: number, attack: number, release: number, hold: number): DynamicsProcessor {
    this.nodes.push({
      type: DynamicProcessorType.NoiseGate,
      enabled: true,
      params: { threshold, attack, release, hold },
    });
    return this;
  }

  /**
   * 添加扩展器
   * @param threshold 阈值（dB）
   * @param ratio 扩展比
   * @param attack 启动时间（ms）
   * @param release 释放时间（ms）
   * @returns 当前实例
   */
  public addExpander(threshold: number, ratio: number, attack: number, release: number): DynamicsProcessor {
    this.nodes.push({
      type: DynamicProcessorType.Expander,
      enabled: true,
      params: { threshold, ratio, attack, release },
    });
    return this;
  }

  /**
   * 添加瞬态塑形器
   * @param attack Attack 调节量（-1.0 ~ 1.0）
   * @param sustain Sustain 调节量（-1.0 ~ 1.0）
   * @returns 当前实例
   */
  public addTransientShaper(attack: number, sustain: number): DynamicsProcessor {
    this.nodes.push({
      type: DynamicProcessorType.TransientShaper,
      enabled: true,
      params: { attack, sustain },
    });
    return this;
  }

  /**
   * 添加闪避器
   * @param sidechain 侧链信号缓冲区
   * @param threshold 阈值（dB）
   * @param ratio 闪避比
   * @returns 当前实例
   */
  public addDucker(sidechain: Float32Array, threshold: number, ratio: number): DynamicsProcessor {
    // 闪避器需要保存侧链引用，通过特殊参数传递
    this.nodes.push({
      type: DynamicProcessorType.Ducker,
      enabled: true,
      params: { threshold, ratio },
    });
    // 将侧链存储在实例属性中以便处理时使用
    this._sidechainBuffers.push(sidechain);
    return this;
  }

  private _sidechainBuffers: Float32Array[] = [];

  /**
   * 添加 RMS 压缩器
   * @param threshold 阈值（dB）
   * @param ratio 压缩比
   * @param attack 启动时间（ms）
   * @param release 释放时间（ms）
   * @returns 当前实例
   */
  public addCompressorRMS(threshold: number, ratio: number, attack: number, release: number): DynamicsProcessor {
    this.nodes.push({
      type: DynamicProcessorType.CompressorRMS,
      enabled: true,
      params: { threshold, ratio, attack, release },
    });
    return this;
  }

  /**
   * 添加前瞻限制器
   * @param threshold 阈值（dB）
   * @param lookahead 前瞻时间（ms）
   * @param release 释放时间（ms）
   * @returns 当前实例
   */
  public addLookaheadLimiter(threshold: number, lookahead: number, release: number): DynamicsProcessor {
    this.nodes.push({
      type: DynamicProcessorType.LookaheadLimiter,
      enabled: true,
      params: { threshold, lookahead, release },
    });
    return this;
  }

  /**
   * 添加自动增益
   * @param targetDb 目标电平（dB）
   * @returns 当前实例
   */
  public addAutoGain(targetDb: number): DynamicsProcessor {
    this.nodes.push({
      type: DynamicProcessorType.AutoGain,
      enabled: true,
      params: { targetDb },
    });
    return this;
  }

  /**
   * 设置指定节点的启用状态
   * @param index 节点索引
   * @param enabled 是否启用
   * @returns 当前实例
   */
  public setEnabled(index: number, enabled: boolean): DynamicsProcessor {
    if (index >= 0 && index < this.nodes.length) {
      this.nodes[index].enabled = enabled;
    }
    return this;
  }

  /**
   * 移除指定节点
   * @param index 节点索引
   * @returns 当前实例
   */
  public removeNode(index: number): DynamicsProcessor {
    if (index >= 0 && index < this.nodes.length) {
      this.nodes.splice(index, 1);
      // 同步移除侧链缓存
      if (this._sidechainBuffers[index]) {
        this._sidechainBuffers.splice(index, 1);
      }
    }
    return this;
  }

  /**
   * 清空所有节点
   * @returns 当前实例
   */
  public clear(): DynamicsProcessor {
    this.nodes = [];
    this._sidechainBuffers = [];
    return this;
  }

  /**
   * 获取节点数量
   * @returns 节点数量
   */
  public get length(): number {
    return this.nodes.length;
  }

  /**
   * 处理单声道缓冲区
   * @param buffer 输入的单声道缓冲区（会被原地修改）
   * @returns 处理后的缓冲区
   */
  public process(buffer: Float32Array): Float32Array {
    let sidechainIndex: number = 0;

    for (let n: number = 0; n < this.nodes.length; n++) {
      const node: DynamicProcessorNode = this.nodes[n];
      if (!node.enabled) continue;

      const p: Record<string, number> = node.params;

      switch (node.type) {
        case DynamicProcessorType.NoiseGate: {
          applyNoiseGate(buffer, p.threshold, p.attack, p.release, p.hold);
          break;
        }
        case DynamicProcessorType.Expander: {
          applyExpander(buffer, p.threshold, p.ratio, p.attack, p.release);
          break;
        }
        case DynamicProcessorType.TransientShaper: {
          applyTransientShaper(buffer, p.attack, p.sustain);
          break;
        }
        case DynamicProcessorType.Ducker: {
          const sc: Float32Array = this._sidechainBuffers[sidechainIndex];
          if (sc && sc.length === buffer.length) {
            applyDucker(buffer, sc, p.threshold, p.ratio);
          }
          sidechainIndex++;
          break;
        }
        case DynamicProcessorType.CompressorRMS: {
          applyCompressorRMS(buffer, p.threshold, p.ratio, p.attack, p.release);
          break;
        }
        case DynamicProcessorType.LookaheadLimiter: {
          applyLookaheadLimiter(buffer, p.threshold, p.lookahead, p.release);
          break;
        }
        case DynamicProcessorType.AutoGain: {
          applyAutoGain(buffer, p.targetDb);
          break;
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
      throw new Error('立体声缓冲区长度必须为偶数');
    }

    const halfLength: number = buffer.length / 2;
    const left: Float32Array = new Float32Array(halfLength);
    const right: Float32Array = new Float32Array(halfLength);

    // 解交错
    for (let i: number = 0; i < halfLength; i++) {
      left[i] = buffer[i * 2];
      right[i] = buffer[i * 2 + 1];
    }

    // 分别处理左右声道
    this.process(left);
    this.process(right);

    // 重新交错
    for (let i: number = 0; i < halfLength; i++) {
      buffer[i * 2] = left[i];
      buffer[i * 2 + 1] = right[i];
    }

    return buffer;
  }

  /**
   * 加载人声动态处理预设
   * 链：噪声门 → RMS 压缩 → 前瞻限制
   * @returns 当前实例
   */
  public loadVocalPreset(): DynamicsProcessor {
    this.clear();
    this.addNoiseGate(-45, 0.5, 50, 15);
    this.addCompressorRMS(-18, 3.5, 8, 120);
    this.addLookaheadLimiter(-2, 3, 60);
    return this;
  }

  /**
   * 加载鼓组动态处理预设
   * 链：瞬态塑形 → RMS 压缩 → 前瞻限制
   * @returns 当前实例
   */
  public loadDrumPreset(): DynamicsProcessor {
    this.clear();
    this.addTransientShaper(0.4, -0.2);
    this.addCompressorRMS(-12, 4, 3, 80);
    this.addLookaheadLimiter(-1, 2, 40);
    return this;
  }

  /**
   * 加载总线压缩预设
   * 链：RMS 压缩 → 前瞻限制
   * @returns 当前实例
   */
  public loadBusPreset(): DynamicsProcessor {
    this.clear();
    this.addCompressorRMS(-20, 2, 20, 150);
    this.addLookaheadLimiter(-1.5, 5, 50);
    return this;
  }

  /**
   * 加载母带动态预设
   * 链：RMS 压缩 → 前瞻限制 → 自动增益
   * @returns 当前实例
   */
  public loadMasteringPreset(): DynamicsProcessor {
    this.clear();
    this.addCompressorRMS(-22, 1.5, 30, 200);
    this.addLookaheadLimiter(-0.8, 8, 30);
    this.addAutoGain(-14);
    return this;
  }

  /**
   * 导出配置
   * @returns 配置对象数组
   */
  public exportConfig(): DynamicProcessorNode[] {
    return this.nodes.map((node) => ({ ...node, params: { ...node.params } }));
  }

  /**
   * 导入配置
   * @param config 配置对象数组
   * @returns 当前实例
   */
  public importConfig(config: DynamicProcessorNode[]): DynamicsProcessor {
    this.nodes = config.map((node) => ({
      type: node.type,
      enabled: node.enabled,
      params: { ...node.params },
    }));
    return this;
  }
}

// ============================================================================
// 附加动态处理工具函数与类
// ============================================================================

/**
 * 动态范围测量仪（DynamicsMeter）
 * 用于实时监控处理前后的增益衰减量、峰值、RMS 等参数。
 */
export class DynamicsMeter {
  private peakInput: number = 0.0;
  private peakOutput: number = 0.0;
  private rmsSumInput: number = 0.0;
  private rmsSumOutput: number = 0.0;
  private sampleCount: number = 0;
  private maxReductionDb: number = 0.0;

  /** 重置所有计量数据 */
  public reset(): void {
    this.peakInput = 0.0;
    this.peakOutput = 0.0;
    this.rmsSumInput = 0.0;
    this.rmsSumOutput = 0.0;
    this.sampleCount = 0;
    this.maxReductionDb = 0.0;
  }

  /**
   * 推送一对输入/输出样本进行计量
   * @param input 输入样本
   * @param output 输出样本
   */
  public feed(input: number, output: number): void {
    const absIn: number = Math.abs(input);
    const absOut: number = Math.abs(output);

    this.peakInput = Math.max(this.peakInput, absIn);
    this.peakOutput = Math.max(this.peakOutput, absOut);
    this.rmsSumInput += absIn * absIn;
    this.rmsSumOutput += absOut * absOut;
    this.sampleCount++;

    // 计算瞬时增益衰减量
    if (absIn > 1e-10) {
      const reductionDb: number = gainToDb(absOut / absIn);
      this.maxReductionDb = Math.min(this.maxReductionDb, reductionDb);
    }
  }

  /** 获取输入峰值电平（dB） */
  public getInputPeakDb(): number {
    return gainToDb(this.peakInput);
  }

  /** 获取输出峰值电平（dB） */
  public getOutputPeakDb(): number {
    return gainToDb(this.peakOutput);
  }

  /** 获取输入 RMS 电平（dB） */
  public getInputRmsDb(): number {
    if (this.sampleCount === 0) return -Infinity;
    return gainToDb(Math.sqrt(this.rmsSumInput / this.sampleCount));
  }

  /** 获取输出 RMS 电平（dB） */
  public getOutputRmsDb(): number {
    if (this.sampleCount === 0) return -Infinity;
    return gainToDb(Math.sqrt(this.rmsSumOutput / this.sampleCount));
  }

  /** 获取最大增益衰减量（dB，负值表示衰减） */
  public getMaxReductionDb(): number {
    return this.maxReductionDb;
  }

  /** 获取当前处理的样本数 */
  public getSampleCount(): number {
    return this.sampleCount;
  }
}

/**
 * 对输入缓冲区应用并行压缩（Parallel / New York Compression）。
 *
 * 并行压缩将原始信号与重度压缩后的信号混合，保留瞬态细节的同时增加密度。
 * 这是鼓组和人声处理中非常流行的技术。
 *
 * @param buffer - 输入的单声道音频缓冲区（会被原地修改）
 * @param threshold - 压缩阈值（dB）
 * @param ratio - 压缩比
 * @param attack - 启动时间（毫秒）
 * @param release - 释放时间（毫秒）
 * @param mix - 压缩信号混合比例（0.0 ~ 1.0），0.5 为典型的平行压缩
 * @returns 处理后的缓冲区
 */
export function applyParallelCompression(
  buffer: Float32Array,
  threshold: number,
  ratio: number,
  attack: number,
  release: number,
  mix: number
): Float32Array {
  const safeMix: number = clamp(mix, 0.0, 1.0);
  if (safeMix < 0.001) return buffer;

  const length: number = buffer.length;

  // 复制缓冲区用于压缩处理
  const compressed: Float32Array = new Float32Array(buffer);
  applyCompressorRMS(compressed, threshold, ratio, attack, release);

  // 混合原始信号与压缩信号
  const dryGain: number = 1.0 - safeMix;
  const wetGain: number = safeMix;

  for (let i: number = 0; i < length; i++) {
    buffer[i] = buffer[i] * dryGain + compressed[i] * wetGain;
  }

  return buffer;
}

/**
 * 计算缓冲区的动态范围（基于峰值因子）
 * @param buffer 输入缓冲区
 * @returns 动态范围（dB）
 */
export function calculateDynamicRange(buffer: Float32Array): number {
  let peak: number = 0.0;
  let sumSquares: number = 0.0;

  for (let i: number = 0; i < buffer.length; i++) {
    const abs: number = Math.abs(buffer[i]);
    peak = Math.max(peak, abs);
    sumSquares += abs * abs;
  }

  const rms: number = Math.sqrt(sumSquares / buffer.length);
  if (rms < 1e-10 || peak < 1e-10) return 0.0;

  return gainToDb(peak / rms);
}

/**
 * 对缓冲区应用增益分段（Gain Staging）
 * 将信号调整到健康的电平范围，防止后续处理过载。
 * @param buffer 输入缓冲区（原地修改）
 * @param headroomDb 目标余量（dB），默认 -12
 * @returns 处理后的缓冲区
 */
export function applyGainStaging(buffer: Float32Array, headroomDb: number = -12.0): Float32Array {
  const safeHeadroom: number = clamp(headroomDb, -24.0, -3.0);
  const targetPeak: number = dbToGain(safeHeadroom);

  // 计算当前峰值
  let currentPeak: number = 0.0;
  for (let i: number = 0; i < buffer.length; i++) {
    currentPeak = Math.max(currentPeak, Math.abs(buffer[i]));
  }

  if (currentPeak < 1e-10) return buffer;

  // 计算所需增益
  const gain: number = targetPeak / currentPeak;

  // 应用增益
  for (let i: number = 0; i < buffer.length; i++) {
    buffer[i] *= gain;
  }

  return buffer;
}

/**
 * 创建侧链闪避信号的简单包络跟随器
 * @param sidechain 侧链输入缓冲区
 * @param attackMs 启动时间（毫秒）
 * @param releaseMs 释放时间（毫秒）
 * @returns 包络缓冲区（0.0 ~ 1.0）
 */
export function generateSidechainEnvelope(sidechain: Float32Array, attackMs: number, releaseMs: number): Float32Array {
  const safeAttack: number = clamp(attackMs, 0.1, 500.0);
  const safeRelease: number = clamp(releaseMs, 1.0, 2000.0);
  const attackCoeff: number = timeConstantToCoeff(safeAttack);
  const releaseCoeff: number = timeConstantToCoeff(safeRelease);

  const length: number = sidechain.length;
  const envelope: Float32Array = new Float32Array(length);
  let env: number = 0.0;

  for (let i: number = 0; i < length; i++) {
    const detected: number = Math.abs(sidechain[i]);

    if (detected > env) {
      env = attackCoeff * env + (1.0 - attackCoeff) * detected;
    } else {
      env = releaseCoeff * env + (1.0 - releaseCoeff) * detected;
    }

    envelope[i] = env;
  }

  return envelope;
}

/**
 * 对两个缓冲区进行增益匹配的混合
 * @param bufferA 缓冲区 A
 * @param bufferB 缓冲区 B
 * @param mixA A 的比例（0.0 ~ 1.0）
 * @returns 混合后的缓冲区
 */
export function mixMatchedGain(bufferA: Float32Array, bufferB: Float32Array, mixA: number): Float32Array {
  const safeMixA: number = clamp(mixA, 0.0, 1.0);
  const mixB: number = 1.0 - safeMixA;
  const length: number = Math.min(bufferA.length, bufferB.length);
  const output: Float32Array = new Float32Array(length);

  // 计算各自 RMS 以进行增益匹配
  let sumA: number = 0.0;
  let sumB: number = 0.0;
  for (let i: number = 0; i < length; i++) {
    sumA += bufferA[i] * bufferA[i];
    sumB += bufferB[i] * bufferB[i];
  }
  const rmsA: number = Math.sqrt(sumA / length);
  const rmsB: number = Math.sqrt(sumB / length);

  const matchGainA: number = rmsA > 1e-10 ? 1.0 / rmsA : 1.0;
  const matchGainB: number = rmsB > 1e-10 ? 1.0 / rmsB : 1.0;

  for (let i: number = 0; i < length; i++) {
    output[i] = bufferA[i] * matchGainA * safeMixA + bufferB[i] * matchGainB * mixB;
  }

  return output;
}

// ============================================================================
// 模块元数据与工具导出
// ============================================================================

/**
 * 获取本模块的版本信息
 * @returns 版本字符串
 */
export function getDynamicProcessingVersion(): string {
  return '1.0.0';
}

/**
 * 获取支持的动态处理器类型列表
 * @returns 处理器类型数组
 */
export function getSupportedDynamicProcessors(): DynamicProcessorType[] {
  return [
    DynamicProcessorType.NoiseGate,
    DynamicProcessorType.Expander,
    DynamicProcessorType.TransientShaper,
    DynamicProcessorType.Ducker,
    DynamicProcessorType.CompressorRMS,
    DynamicProcessorType.LookaheadLimiter,
    DynamicProcessorType.AutoGain,
  ];
}

/**
 * 获取指定动态处理器的默认参数
 * @param type 处理器类型
 * @returns 默认参数对象
 */
export function getDefaultDynamicParams(type: DynamicProcessorType): Record<string, number> {
  switch (type) {
    case DynamicProcessorType.NoiseGate:
      return { threshold: -40, attack: 0.5, release: 50, hold: 20 };
    case DynamicProcessorType.Expander:
      return { threshold: -35, ratio: 2, attack: 5, release: 80 };
    case DynamicProcessorType.TransientShaper:
      return { attack: 0.3, sustain: -0.2 };
    case DynamicProcessorType.Ducker:
      return { threshold: -20, ratio: 4 };
    case DynamicProcessorType.CompressorRMS:
      return { threshold: -18, ratio: 3, attack: 10, release: 100 };
    case DynamicProcessorType.LookaheadLimiter:
      return { threshold: -1.0, lookahead: 5, release: 50 };
    case DynamicProcessorType.AutoGain:
      return { targetDb: -18 };
    default:
      return {};
  }
}

/**
 * 快速估算缓冲区的 LUFS 近似值（使用 RMS 作为简近似）
 * @param buffer 输入缓冲区
 * @returns 估算电平（dB）
 */
export function estimateLoudness(buffer: Float32Array): number {
  let sumSquares: number = 0.0;
  for (let i: number = 0; i < buffer.length; i++) {
    sumSquares += buffer[i] * buffer[i];
  }
  const rms: number = Math.sqrt(sumSquares / buffer.length);
  return gainToDb(rms);
}

/**
 * 快速估算缓冲器的峰值电平
 * @param buffer 输入缓冲区
 * @returns 峰值电平（dB）
 */
export function estimatePeakDb(buffer: Float32Array): number {
  let peak: number = 0.0;
  for (let i: number = 0; i < buffer.length; i++) {
    peak = Math.max(peak, Math.abs(buffer[i]));
  }
  return gainToDb(peak);
}

/**
 * 计算缓冲区的真峰值（True Peak）近似值
 * 通过 4x 插值来近似模拟过采样峰值检测。
 * @param buffer 输入缓冲区
 * @returns 真峰值电平（dB）
 */
export function estimateTruePeakDb(buffer: Float32Array): number {
  let truePeak: number = 0.0;
  for (let i: number = 0; i < buffer.length - 1; i++) {
    const s0: number = buffer[i];
    const s1: number = buffer[i + 1];
    // 线性插值查找中间峰值
    for (let j: number = 1; j < 4; j++) {
      const t: number = j / 4;
      const interp: number = s0 * (1.0 - t) + s1 * t;
      truePeak = Math.max(truePeak, Math.abs(interp));
    }
    truePeak = Math.max(truePeak, Math.abs(s0));
  }
  return gainToDb(truePeak);
}

/**
 * 对缓冲区应用直流偏移移除
 * @param buffer 输入缓冲区（原地修改）
 * @returns 处理后的缓冲区
 */
export function removeDCOffset(buffer: Float32Array): Float32Array {
  let sum: number = 0.0;
  for (let i: number = 0; i < buffer.length; i++) {
    sum += buffer[i];
  }
  const dc: number = sum / buffer.length;
  if (Math.abs(dc) < 1e-10) return buffer;
  for (let i: number = 0; i < buffer.length; i++) {
    buffer[i] -= dc;
  }
  return buffer;
}

/**
 * 对缓冲区进行软拐点压缩（Soft Knee Compression）
 * 在阈值附近使用平滑过渡，减少抽吸感。
 * @param buffer 输入缓冲区（原地修改）
 * @param threshold 阈值（dB）
 * @param ratio 压缩比
 * @param knee 拐点宽度（dB）
 * @param attack 启动时间（ms）
 * @param release 释放时间（ms）
 * @returns 处理后的缓冲区
 */
export function applySoftKneeCompression(
  buffer: Float32Array,
  threshold: number,
  ratio: number,
  knee: number,
  attack: number,
  release: number
): Float32Array {
  const safeThreshold: number = clamp(threshold, -60.0, 0.0);
  const safeRatio: number = Math.max(1.0, ratio);
  const safeKnee: number = clamp(knee, 0.0, 12.0);
  const safeAttack: number = clamp(attack, 0.1, 500.0);
  const safeRelease: number = clamp(release, 1.0, 2000.0);

  const thresholdLinear: number = dbToGain(safeThreshold);
  const attackCoeff: number = timeConstantToCoeff(safeAttack);
  const releaseCoeff: number = timeConstantToCoeff(safeRelease);

  let envelope: number = 0.0;
  let gain: number = 1.0;

  for (let i: number = 0; i < buffer.length; i++) {
    const input: number = Math.abs(buffer[i]);

    if (input > envelope) {
      envelope = attackCoeff * envelope + (1.0 - attackCoeff) * input;
    } else {
      envelope = releaseCoeff * envelope + (1.0 - releaseCoeff) * input;
    }

    let targetGain: number = 1.0;
    if (envelope > thresholdLinear) {
      const dbOver: number = gainToDb(envelope / thresholdLinear);
      // 软拐点处理
      let reductionDb: number = 0.0;
      if (dbOver <= safeKnee / 2.0) {
        reductionDb = (dbOver * dbOver) / (2.0 * safeKnee) * (1.0 - 1.0 / safeRatio);
      } else {
        reductionDb = (dbOver - safeKnee / 2.0) * (1.0 - 1.0 / safeRatio);
      }
      targetGain = dbToGain(-reductionDb);
    }

    if (targetGain < gain) {
      gain = attackCoeff * gain + (1.0 - attackCoeff) * targetGain;
    } else {
      gain = releaseCoeff * gain + (1.0 - releaseCoeff) * targetGain;
    }

    buffer[i] = buffer[i] * gain;
  }

  return buffer;
}
