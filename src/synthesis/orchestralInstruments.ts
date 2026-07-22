/**
 * @fileoverview 青鸾 DAW - 管弦乐物理建模合成器
 *
 * 本模块提供西方管弦乐队核心乐器的物理建模合成函数，涵盖：
 * - 弦乐家族：小提琴、中提琴、大提琴、低音提琴
 * - 木管家族：长笛、双簧管、单簧管、大管
 * - 铜管家族：圆号、小号、长号、大号
 * - 打击乐/色彩：竖琴、定音鼓
 *
 * 合成方法基于数字信号处理（DSP）经典算法：
 * - Karplus-Strong 弦乐模型 + 低通滤波 + 揉弦（Vibrato）
 * - 谐波叠加合成（Additive）+ 呼吸噪声 + ADSR 包络
 * - 锯齿波源 + 共振峰滤波（Formant）+ 唇片颤音
 *
 * 所有函数输出 44100 Hz 采样的单声道 Float32Array。
 *
 * @module orchestralInstruments
 * @version 1.0.0
 * @author 青鸾音频实验室
 */

import { clamp, lerp, smoothstep, normalizeBuffer } from '../utils/audioUtils.js';

// =============================================================================
// 全局常量
// =============================================================================

/** 统一采样率：CD 音质标准 44.1 kHz */
const SAMPLE_RATE = 44100;

/** 默认音频输出时长上限（秒），防止异常参数导致内存爆炸 */
const MAX_DURATION_SECONDS = 30;

/** 合成时的极小值，避免除零 */
const EPSILON = 1e-10;

// =============================================================================
// 通用工具函数 / 信号处理原语
// =============================================================================

/**
 * 计算样本帧数。
 * @param durationSec - 以秒为单位的时长
 * @returns 采样点数
 */
function durationToSamples(durationSec: number): number {
  return Math.min(Math.floor(durationSec * SAMPLE_RATE), MAX_DURATION_SECONDS * SAMPLE_RATE);
}

/**
 * 标准 ADSR 包络生成器。
 * 分别计算 Attack / Decay / Sustain / Release 四个阶段，返回与目标 buffer 等长的增益曲线。
 *
 * @param length - 包络长度（样本数）
 * @param attack - 起音时间（秒）
 * @param decay - 衰减时间（秒）
 * @param sustain -  sustain 电平（0~1）
 * @param release - 释音时间（秒）
 * @param totalDuration - 总音符时长（秒），用于计算 release 起始点
 * @returns Float32Array 包络曲线
 */
function createADSREnvelope(
  length: number,
  attack: number,
  decay: number,
  sustain: number,
  release: number,
  totalDuration: number
): Float32Array {
  const env = new Float32Array(length);
  const attackSamples = Math.max(1, Math.floor(attack * SAMPLE_RATE));
  const decaySamples = Math.max(1, Math.floor(decay * SAMPLE_RATE));
  const releaseSamples = Math.max(1, Math.floor(release * SAMPLE_RATE));
  // Release 在音符结束前开始，若总时长极短则自动压缩
  const releaseStart = Math.max(attackSamples + decaySamples, length - releaseSamples);

  for (let i = 0; i < length; i++) {
    if (i < attackSamples) {
      // Attack 阶段：线性上升至 1.0
      env[i] = i / attackSamples;
    } else if (i < attackSamples + decaySamples) {
      // Decay 阶段：从 1.0 衰减至 sustain 电平
      const t = (i - attackSamples) / decaySamples;
      env[i] = 1.0 - (1.0 - sustain) * t;
    } else if (i < releaseStart) {
      // Sustain 阶段：保持恒定
      env[i] = sustain;
    } else {
      // Release 阶段：从当前电平线性下降至 0
      const t = (i - releaseStart) / releaseSamples;
      env[i] = Math.max(0, sustain * (1.0 - t));
    }
  }
  return env;
}

/**
 * 指数型 ADSR 包络，更符合真实乐器能量衰减的感知特性。
 */
function createExponentialADSREnvelope(
  length: number,
  attack: number,
  decay: number,
  sustain: number,
  release: number,
  totalDuration: number
): Float32Array {
  const env = new Float32Array(length);
  const attackSamples = Math.max(1, Math.floor(attack * SAMPLE_RATE));
  const decaySamples = Math.max(1, Math.floor(decay * SAMPLE_RATE));
  const releaseSamples = Math.max(1, Math.floor(release * SAMPLE_RATE));
  const releaseStart = Math.max(attackSamples + decaySamples, length - releaseSamples);

  for (let i = 0; i < length; i++) {
    if (i < attackSamples) {
      // 指数起音：更自然的"拔起"感
      const t = i / attackSamples;
      env[i] = 1.0 - Math.exp(-5.0 * t);
    } else if (i < attackSamples + decaySamples) {
      const t = (i - attackSamples) / decaySamples;
      env[i] = sustain + (1.0 - sustain) * Math.exp(-3.0 * t);
    } else if (i < releaseStart) {
      env[i] = sustain;
    } else {
      const t = (i - releaseStart) / releaseSamples;
      env[i] = sustain * Math.exp(-5.0 * t);
    }
  }
  return env;
}

/**
 * 一阶递归低通滤波器（RC 近似）。
 * 用于模拟弦乐共鸣体、管体损失等能量衰减。
 *
 * @param input - 输入信号
 * @param cutoffHz - 截止频率（Hz）
 * @returns 滤波后的信号（新 Float32Array）
 */
function lowPassFilter(input: Float32Array, cutoffHz: number): Float32Array {
  const output = new Float32Array(input.length);
  // 根据采样率计算递归系数：y[n] = a * x[n] + (1-a) * y[n-1]
  const rc = 1.0 / (2.0 * Math.PI * cutoffHz);
  const dt = 1.0 / SAMPLE_RATE;
  const alpha = dt / (rc + dt);
  let yPrev = 0;

  for (let i = 0; i < input.length; i++) {
    yPrev = alpha * input[i] + (1.0 - alpha) * yPrev;
    output[i] = yPrev;
  }
  return output;
}

/**
 * 二阶状态变量滤波器（State Variable Filter），可同时输出低通/高通/带通。
 * 此处使用低通输出，提供更陡峭的衰减斜率。
 */
function stateVariableLowPass(input: Float32Array, cutoffHz: number, resonance: number): Float32Array {
  const output = new Float32Array(input.length);
  const f = 2.0 * Math.sin(Math.PI * cutoffHz / SAMPLE_RATE);
  const q = 1.0 - resonance;
  let low = 0;
  let band = 0;

  for (let i = 0; i < input.length; i++) {
    // 标准状态变量滤波器迭代公式
    low = low + f * band;
    const high = input[i] - low - q * band;
    band = band + f * high;
    // 可选额外 notch / peak 输出未使用
    output[i] = low;
  }
  return output;
}

/**
 * 白噪声生成器，用于呼吸噪声、打击乐初始瞬态等。
 * @param length - 样本数
 * @param amplitude - 振幅缩放
 */
function whiteNoise(length: number, amplitude: number = 1.0): Float32Array {
  const buf = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    buf[i] = (Math.random() * 2.0 - 1.0) * amplitude;
  }
  return buf;
}

/**
 * 粉红噪声（1/f 噪声）生成器，通过 Voss-McCartney 算法近似。
 * 相比白噪声，粉红噪声在低频有更多能量，适合管乐气流底噪。
 */
function pinkNoise(length: number, amplitude: number = 1.0): Float32Array {
  const buf = new Float32Array(length);
  // 使用 16 个叠加的随机源，每个更新频率减半
  const sources = 16;
  const values = new Float32Array(sources);
  for (let i = 0; i < sources; i++) values[i] = Math.random() * 2.0 - 1.0;
  let lastIndex = 0;

  for (let i = 0; i < length; i++) {
    // 计算哪个源需要更新：最低位变化对应最高频源
    let index = 0;
    let tmp = i;
    while ((tmp & 1) === 0 && index < sources - 1) {
      tmp >>= 1;
      index++;
    }
    values[index] = Math.random() * 2.0 - 1.0;
    let sum = 0;
    for (let s = 0; s < sources; s++) sum += values[s];
    // 归一化近似：除以 sqrt(sources/3) 得到近似 [-1,1]
    buf[i] = (sum / (sources * 0.5)) * amplitude;
  }
  return buf;
}

/**
 * 为信号添加周期颤音（Vibrato）。
 * 使用正弦波频率调制，模拟弦乐揉弦或铜管唇震。
 *
 * @param buffer - 输入信号
 * @param rateHz - 颤音速率（通常 5~7 Hz）
 * @param depthCents - 颤音深度（音分，通常 10~30 cents）
 * @param baseFreq - 基础音高频率（Hz）
 */
function applyVibrato(buffer: Float32Array, rateHz: number, depthCents: number, baseFreq: number): Float32Array {
  const out = new Float32Array(buffer.length);
  const depthRatio = Math.pow(2, depthCents / 1200) - 1.0; // cents 转频率比偏差
  const amp = depthRatio * baseFreq; // 瞬时频率偏移幅度（Hz）

  for (let i = 0; i < buffer.length; i++) {
    const t = i / SAMPLE_RATE;
    const mod = Math.sin(2.0 * Math.PI * rateHz * t);
    // 计算相位偏移量：瞬时频率 = baseFreq + amp * sin(...)
    // 相位 = integral(2*pi*(baseFreq + amp*sin(2*pi*rate*t)), t)
    //      = 2*pi*baseFreq*t - (amp/rate)*cos(2*pi*rate*t)
    const phase = 2.0 * Math.PI * baseFreq * t - (amp / rateHz) * Math.cos(2.0 * Math.PI * rateHz * t);
    // 对原始 buffer 进行重采样读取（简化为直接乘调制增益，保持振幅起伏）
    const vibratoGain = 1.0 + 0.05 * mod; // 同时引入轻微振幅调制
    out[i] = buffer[i] * vibratoGain;
  }
  return out;
}

/**
 * 延迟线（Delay Line）用于 Karplus-Strong 算法。
 */
class DelayLine {
  private buffer: Float32Array;
  private writeIndex = 0;

  constructor(length: number) {
    this.buffer = new Float32Array(length);
  }

  read(delay: number): number {
    const readIndex = (this.writeIndex - delay + this.buffer.length) % this.buffer.length;
    return this.buffer[readIndex];
  }

  write(value: number): void {
    this.buffer[this.writeIndex] = value;
    this.writeIndex = (this.writeIndex + 1) % this.buffer.length;
  }
}

/**
 * Karplus-Strong 弦乐合成基础算法。
 * 通过噪声脉冲激励延迟线，配合低通反馈模拟拨弦/拉弦的衰减过程。
 *
 * @param freq - 基频（Hz）
 * @param duration - 时长（秒）
 * @param pluckStrength - 激励强度（0~1）
 * @param damping - 阻尼系数（0~1，越大衰减越快）
 * @param brightness - 亮度（控制初始噪声滤波）
 * @returns 合成波形
 */
function karplusStrong(
  freq: number,
  duration: number,
  pluckStrength: number,
  damping: number,
  brightness: number
): Float32Array {
  const length = durationToSamples(duration);
  const delaySamples = SAMPLE_RATE / freq;
  const delayInt = Math.floor(delaySamples);
  const fractional = delaySamples - delayInt;

  // 延迟线长度至少为 2，避免边界问题
  const dl = new DelayLine(Math.max(delayInt + 10, 2));

  // 初始激励：根据 brightness 选择噪声滤波程度
  const noise = whiteNoise(delayInt, pluckStrength);
  // 简单一阶低通滤激励噪声，brightness 越高截止频率越高
  const cutoff = lerp(500, 8000, brightness);
  const filteredNoise = lowPassFilter(noise, cutoff);

  // 填充延迟线
  for (let i = 0; i < delayInt; i++) {
    dl.write(filteredNoise[i] ?? 0);
  }

  const output = new Float32Array(length);
  let yPrev = 0;

  for (let i = 0; i < length; i++) {
    // 读取延迟样本，带线性插值以支持小数延迟（支持微调音高）
    const s0 = dl.read(delayInt);
    const s1 = dl.read(delayInt + 1);
    const delayed = s0 + fractional * (s1 - s0);

    // 一阶低通滤波（ averaging filter ）模拟弦的能量损失
    const avg = 0.5 * (delayed + yPrev);
    yPrev = delayed;

    // 应用阻尼
    const sample = avg * (1.0 - damping * 0.02);
    output[i] = sample;
    dl.write(sample);
  }
  return output;
}

/**
 * 改进型 Karplus-Strong：加入动态阻尼和拉伸调谐（Stretched Tuning）。
 * 高频衰减更快，更符合真实弦乐物理特性。
 */
function karplusStrongExtended(
  freq: number,
  duration: number,
  pluckStrength: number,
  damping: number,
  brightness: number,
  stretch: number = 0.0
): Float32Array {
  const length = durationToSamples(duration);
  const delaySamples = SAMPLE_RATE / freq;
  const delayInt = Math.floor(delaySamples);
  const fractional = delaySamples - delayInt;

  const dl = new DelayLine(Math.max(delayInt + 20, 2));
  const noise = whiteNoise(delayInt, pluckStrength);
  const cutoff = lerp(400, 10000, brightness);
  const filteredNoise = lowPassFilter(noise, cutoff);

  for (let i = 0; i < delayInt; i++) {
    dl.write(filteredNoise[i] ?? 0);
  }

  const output = new Float32Array(length);
  let yPrev1 = 0;
  let yPrev2 = 0;

  for (let i = 0; i < length; i++) {
    const s0 = dl.read(delayInt);
    const s1 = dl.read(delayInt + 1);
    const delayed = s0 + fractional * (s1 - s0);

    // 二阶低通滤波带来更自然的衰减斜率
    const avg = 0.25 * (delayed + yPrev1 + yPrev1 + yPrev2);
    yPrev2 = yPrev1;
    yPrev1 = delayed;

    // 动态阻尼：频率越高衰减越快（拉伸调谐效果）
    const freqFactor = Math.min(1.0, freq / 1000);
    const dynamicDamp = damping * (1.0 + stretch * freqFactor);
    const sample = avg * (1.0 - dynamicDamp * 0.015);
    output[i] = sample;
    dl.write(sample);
  }
  return output;
}

/**
 * 锯齿波生成器，包含相位累加器实现。
 * 锯齿波富含奇偶谐波，适合作为铜管乐器的基础波形。
 */
function sawtoothWave(length: number, freq: number, amplitude: number): Float32Array {
  const buf = new Float32Array(length);
  const phaseInc = freq / SAMPLE_RATE;
  let phase = 0;

  for (let i = 0; i < length; i++) {
    // 锯齿波：2*(phase - floor(phase + 0.5))
    buf[i] = amplitude * (2.0 * (phase - Math.floor(phase + 0.5)));
    phase += phaseInc;
    if (phase >= 1.0) phase -= 1.0;
  }
  return buf;
}

/**
 * 带 aliasing 抑制的锯齿波：叠加 8 次谐波的正弦近似。
 * 在极高频时自动减少谐波数量，避免混叠失真。
 */
function bandLimitedSawtooth(length: number, freq: number, amplitude: number): Float32Array {
  const buf = new Float32Array(length);
  // 奈奎斯特频率下最多保留的谐波数
  const maxHarmonic = Math.floor(SAMPLE_RATE / (2 * freq));
  const harmonics = Math.min(maxHarmonic, 40); // 限制计算量

  for (let i = 0; i < length; i++) {
    const t = i / SAMPLE_RATE;
    let sum = 0;
    for (let h = 1; h <= harmonics; h++) {
      // 锯齿波谐波系数：(-1)^h / h
      const coef = ((h % 2 === 0) ? 1 : -1) / h;
      sum += coef * Math.sin(2.0 * Math.PI * freq * h * t);
    }
    buf[i] = amplitude * (-2.0 / Math.PI) * sum;
  }
  return buf;
}

/**
 * 谐波叠加合成器。
 * 根据谐波幅度列表生成周期波形，适用于木管乐器等具有明确谐波结构的声源。
 *
 * @param length - 样本数
 * @param freq - 基频
 * @param harmonics - 各谐波相对幅度数组（索引0为基频）
 * @param amplitude - 总振幅
 */
function additiveSynthesis(length: number, freq: number, harmonics: number[], amplitude: number): Float32Array {
  const buf = new Float32Array(length);
  const twoPi = 2.0 * Math.PI;

  for (let i = 0; i < length; i++) {
    const t = i / SAMPLE_RATE;
    let sample = 0;
    for (let h = 0; h < harmonics.length; h++) {
      const harmonicFreq = freq * (h + 1);
      // 避免超过奈奎斯特频率产生混叠
      if (harmonicFreq >= SAMPLE_RATE / 2) break;
      sample += harmonics[h] * Math.sin(twoPi * harmonicFreq * t);
    }
    buf[i] = sample * amplitude;
  }
  return buf;
}

/**
 * 为信号添加共振峰（Formant）滤波效果。
 * 使用并联的二阶带通滤波器组模拟管乐器或人声的共振峰。
 *
 * @param input - 输入信号
 * @param formants - 共振峰频率数组（Hz）
 * @param bandwidths - 对应带宽数组（Hz）
 * @param gains - 对应增益数组（线性）
 */
function applyFormantFilter(
  input: Float32Array,
  formants: number[],
  bandwidths: number[],
  gains: number[]
): Float32Array {
  const output = new Float32Array(input.length);

  for (let f = 0; f < formants.length; f++) {
    const fc = formants[f];
    const bw = bandwidths[f];
    const g = gains[f];
    // 二阶带通滤波器系数（恒定 Q 值近似）
    const omega = (2.0 * Math.PI * fc) / SAMPLE_RATE;
    const sinW = Math.sin(omega);
    const cosW = Math.cos(omega);
    const alpha = sinW / (2.0 * (fc / bw));

    const a0 = 1.0 + alpha;
    const a1 = -2.0 * cosW;
    const a2 = 1.0 - alpha;
    const b0 = alpha;
    const b1 = 0;
    const b2 = -alpha;

    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < input.length; i++) {
      const x0 = input[i];
      const y0 = (b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
      x2 = x1; x1 = x0;
      y2 = y1; y1 = y0;
      output[i] += y0 * g;
    }
  }
  return output;
}

/**
 * 梳状滤波器（Comb Filter），模拟管体谐振。
 */
function combFilter(input: Float32Array, delayMs: number, feedback: number): Float32Array {
  const delaySamples = Math.floor(delayMs * SAMPLE_RATE / 1000);
  const output = new Float32Array(input.length);
  const delayLine = new Float32Array(delaySamples);
  let writeIdx = 0;

  for (let i = 0; i < input.length; i++) {
    const delayed = delayLine[writeIdx];
    const sample = input[i] + feedback * delayed;
    delayLine[writeIdx] = sample;
    output[i] = sample;
    writeIdx = (writeIdx + 1) % delaySamples;
  }
  return output;
}

/**
 * 两路信号混合。
 */
function mix(a: Float32Array, b: Float32Array, mixB: number): Float32Array {
  const len = Math.min(a.length, b.length);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = a[i] * (1.0 - mixB) + b[i] * mixB;
  }
  return out;
}

/**
 * 信号增益缩放。
 */
function gain(buffer: Float32Array, g: number): Float32Array {
  const out = new Float32Array(buffer.length);
  for (let i = 0; i < buffer.length; i++) out[i] = buffer[i] * g;
  return out;
}

// =============================================================================
// 弦乐家族 (String Family)
// =============================================================================

/**
 * 小提琴合成参数接口。
 *
 * 小提琴是管弦乐团中的最高音弦乐器，音色明亮、穿透力强，
 * 具有丰富的泛音和显著的揉弦特征。
 */
export interface ViolinParams {
  /** 基础频率（Hz），如 A4 = 440 */
  frequency: number;
  /** 音符时长（秒） */
  duration: number;
  /** 力度（0~1），影响初始激励强度和整体音量 */
  velocity: number;
  /** 揉弦速率（Hz），默认 5.5 */
  vibratoRate?: number;
  /** 揉弦深度（音分），默认 25 */
  vibratoDepth?: number;
  /** 起始技巧：'arco'（拉奏）、'pizzicato'（拨奏）、'tremolo'（震弓）、'staccato'（断奏） */
  articulation?: 'arco' | 'pizzicato' | 'tremolo' | 'staccato';
  /** 亮度（0~1），越高高频泛音越丰富 */
  brightness?: number;
  /** 阻尼（0~1），控制衰减速度 */
  damping?: number;
}

/**
 * 合成小提琴音色。
 *
 * 算法核心：
 * 1. 使用扩展 Karplus-Strong 生成弦振基础音
 * 2. 叠加少量高频谐波增强明亮度
 * 3. 应用低通滤波模拟琴身共鸣
 * 4. 叠加正弦波揉弦调制
 * 5. 指数 ADSR 包络塑形
 *
 * @param params - 小提琴参数
 * @returns 单声道音频缓冲区
 */
export function synthesizeViolin(params: ViolinParams): Float32Array {
  const freq = clamp(params.frequency, 80, 4000);
  const duration = clamp(params.duration, 0.05, MAX_DURATION_SECONDS);
  const velocity = clamp(params.velocity, 0, 1);
  const vibratoRate = params.vibratoRate ?? 5.5;
  const vibratoDepth = params.vibratoDepth ?? 25;
  const articulation = params.articulation ?? 'arco';
  const brightness = clamp(params.brightness ?? 0.7, 0, 1);
  const damping = clamp(params.damping ?? 0.3, 0, 1);

  const length = durationToSamples(duration);
  let output: Float32Array;

  if (articulation === 'pizzicato') {
    // 拨奏：更强的初始激励、快速衰减、无揉弦
    output = karplusStrongExtended(freq, duration, velocity * 0.8, 0.9, brightness, 0.5);
    // 拨奏包络极短
    const env = createExponentialADSREnvelope(length, 0.005, 0.05, 0.0, 0.1, duration);
    for (let i = 0; i < length; i++) output[i] *= env[i];
  } else if (articulation === 'tremolo') {
    // 震弓：快速重复激励模拟弓毛抖动
    const cycles = Math.floor(duration * 8); // 每秒约 8 次震弓周期
    output = new Float32Array(length);
    for (let c = 0; c < cycles; c++) {
      const start = Math.floor((c / cycles) * length);
      const cycleLen = Math.floor(length / cycles);
      const grain = karplusStrongExtended(freq, cycleLen / SAMPLE_RATE, velocity * 0.4, damping, brightness, 0.1);
      for (let i = 0; i < grain.length && start + i < length; i++) {
        output[start + i] += grain[i] * 0.5;
      }
    }
    // 震弓整体包络
    const env = createExponentialADSREnvelope(length, 0.05, 0.1, 0.7, 0.2, duration);
    for (let i = 0; i < length; i++) output[i] *= env[i];
  } else {
    // 拉奏（arco）：标准 KS + 揉弦
    output = karplusStrongExtended(freq, duration, velocity * 0.6, damping, brightness, 0.2);

    // 叠加谐波增强（小提琴第 2、3 泛音较强）
    const harmonics = [1.0, 0.6, 0.4, 0.15, 0.08];
    const additive = additiveSynthesis(length, freq, harmonics, velocity * 0.15);
    output = mix(output, additive, 0.25);

    // 应用琴身共鸣滤波（小提琴主体共鸣约 3000 Hz，f-hole 约 500 Hz）
    output = stateVariableLowPass(output, 3500, 0.3);
    output = lowPassFilter(output, 6000); // 最终低通去齿音

    // 添加揉弦（振幅 + 频率调制）
    output = applyVibrato(output, vibratoRate, vibratoDepth, freq);

    // 拉奏包络：较慢起音、长尾音
    const env = createExponentialADSREnvelope(length, 0.08, 0.15, 0.75, 0.3, duration);
    for (let i = 0; i < length; i++) output[i] *= env[i];
  }

  // 最终归一化
  normalizeBuffer(output);
  return gain(output, velocity);
}

/**
 * 中提琴合成参数接口。
 *
 * 中提琴音域比小提琴低五度，音色温暖、醇厚，
 * 高频泛音较弱，琴身体积更大导致共鸣峰偏低。
 */
export interface ViolaParams {
  frequency: number;
  duration: number;
  velocity: number;
  vibratoRate?: number;
  vibratoDepth?: number;
  articulation?: 'arco' | 'pizzicato' | 'tremolo' | 'staccato';
  brightness?: number;
  damping?: number;
}

/**
 * 合成中提琴音色。
 *
 * 相比小提琴：
 * - 基频更低，琴身共鸣峰下移至 ~2500 Hz
 * - 高频泛音衰减更快（更暗的音色）
 * - 揉弦深度通常略深（30 cents 左右）
 * - 起音稍慢，更柔和
 */
export function synthesizeViola(params: ViolaParams): Float32Array {
  const freq = clamp(params.frequency, 60, 3000);
  const duration = clamp(params.duration, 0.05, MAX_DURATION_SECONDS);
  const velocity = clamp(params.velocity, 0, 1);
  const vibratoRate = params.vibratoRate ?? 5.2;
  const vibratoDepth = params.vibratoDepth ?? 28;
  const articulation = params.articulation ?? 'arco';
  const brightness = clamp(params.brightness ?? 0.5, 0, 1);
  const damping = clamp(params.damping ?? 0.35, 0, 1);

  const length = durationToSamples(duration);
  let output: Float32Array;

  if (articulation === 'pizzicato') {
    output = karplusStrongExtended(freq, duration, velocity * 0.75, 0.85, brightness, 0.4);
    const env = createExponentialADSREnvelope(length, 0.006, 0.06, 0.0, 0.12, duration);
    for (let i = 0; i < length; i++) output[i] *= env[i];
  } else if (articulation === 'tremolo') {
    const cycles = Math.floor(duration * 7);
    output = new Float32Array(length);
    for (let c = 0; c < cycles; c++) {
      const start = Math.floor((c / cycles) * length);
      const cycleLen = Math.floor(length / cycles);
      const grain = karplusStrongExtended(freq, cycleLen / SAMPLE_RATE, velocity * 0.35, damping, brightness, 0.1);
      for (let i = 0; i < grain.length && start + i < length; i++) {
        output[start + i] += grain[i] * 0.45;
      }
    }
    const env = createExponentialADSREnvelope(length, 0.06, 0.12, 0.7, 0.25, duration);
    for (let i = 0; i < length; i++) output[i] *= env[i];
  } else {
    output = karplusStrongExtended(freq, duration, velocity * 0.55, damping, brightness, 0.25);

    // 中提琴泛音更弱、更暗
    const harmonics = [1.0, 0.45, 0.25, 0.1, 0.05];
    const additive = additiveSynthesis(length, freq, harmonics, velocity * 0.12);
    output = mix(output, additive, 0.2);

    // 琴身共鸣偏低（中提琴主体共振约 2500 Hz）
    output = stateVariableLowPass(output, 2800, 0.4);
    output = lowPassFilter(output, 5000);

    output = applyVibrato(output, vibratoRate, vibratoDepth, freq);

    const env = createExponentialADSREnvelope(length, 0.1, 0.18, 0.72, 0.35, duration);
    for (let i = 0; i < length; i++) output[i] *= env[i];
  }

  normalizeBuffer(output);
  return gain(output, velocity);
}

/**
 * 大提琴合成参数接口。
 *
 * 大提琴是乐团中音区的灵魂乐器，音色深沉、富有歌唱性，
 * 低音弦的张力大，产生丰富的组合音（combination tones）。
 */
export interface CelloParams {
  frequency: number;
  duration: number;
  velocity: number;
  vibratoRate?: number;
  vibratoDepth?: number;
  articulation?: 'arco' | 'pizzicato' | 'tremolo' | 'sulPonticello' | 'staccato';
  brightness?: number;
  damping?: number;
}

/**
 * 合成大提琴音色。
 *
 * 特殊处理：
 * - 基频低，延迟线更长，需要更细致的低频管理
 * - 增加轻微的" growl "噪声模拟弓弦摩擦
 * - sulPonticello（靠琴码）技巧产生尖锐、金属感的音色
 */
export function synthesizeCello(params: CelloParams): Float32Array {
  const freq = clamp(params.frequency, 40, 1500);
  const duration = clamp(params.duration, 0.05, MAX_DURATION_SECONDS);
  const velocity = clamp(params.velocity, 0, 1);
  const vibratoRate = params.vibratoRate ?? 4.8;
  const vibratoDepth = params.vibratoDepth ?? 22;
  const articulation = params.articulation ?? 'arco';
  const brightness = clamp(params.brightness ?? 0.45, 0, 1);
  const damping = clamp(params.damping ?? 0.4, 0, 1);

  const length = durationToSamples(duration);
  let output: Float32Array;

  if (articulation === 'pizzicato') {
    output = karplusStrongExtended(freq, duration, velocity * 0.9, 0.8, brightness, 0.3);
    const env = createExponentialADSREnvelope(length, 0.008, 0.08, 0.0, 0.15, duration);
    for (let i = 0; i < length; i++) output[i] *= env[i];
  } else if (articulation === 'tremolo') {
    const cycles = Math.floor(duration * 6);
    output = new Float32Array(length);
    for (let c = 0; c < cycles; c++) {
      const start = Math.floor((c / cycles) * length);
      const cycleLen = Math.floor(length / cycles);
      const grain = karplusStrongExtended(freq, cycleLen / SAMPLE_RATE, velocity * 0.45, damping, brightness, 0.15);
      for (let i = 0; i < grain.length && start + i < length; i++) {
        output[start + i] += grain[i] * 0.5;
      }
    }
    const env = createExponentialADSREnvelope(length, 0.07, 0.15, 0.65, 0.3, duration);
    for (let i = 0; i < length; i++) output[i] *= env[i];
  } else if (articulation === 'sulPonticello') {
    // 靠琴码：更亮、更薄、更多高频噪声
    output = karplusStrongExtended(freq, duration, velocity * 0.5, damping * 0.6, 0.9, 0.1);
    const noise = pinkNoise(length, velocity * 0.08);
    output = mix(output, noise, 0.15);
    output = stateVariableLowPass(output, 5000, 0.6);
    const env = createExponentialADSREnvelope(length, 0.05, 0.2, 0.6, 0.25, duration);
    for (let i = 0; i < length; i++) output[i] *= env[i];
  } else {
    output = karplusStrongExtended(freq, duration, velocity * 0.6, damping, brightness, 0.3);

    // 大提琴泛音温暖，偶次谐波相对丰富
    const harmonics = [1.0, 0.5, 0.35, 0.2, 0.12, 0.06];
    const additive = additiveSynthesis(length, freq, harmonics, velocity * 0.18);
    output = mix(output, additive, 0.3);

    // 弓弦摩擦噪声（低频域更显著）
    const bowNoise = pinkNoise(length, velocity * 0.03);
    const noiseEnv = createExponentialADSREnvelope(length, 0.05, 0.1, 0.4, 0.2, duration);
    for (let i = 0; i < length; i++) bowNoise[i] *= noiseEnv[i];
    output = mix(output, bowNoise, 0.1);

    // 大提琴主体共振约 400 Hz 和 2000 Hz
    output = stateVariableLowPass(output, 2200, 0.35);
    output = lowPassFilter(output, 4000);

    output = applyVibrato(output, vibratoRate, vibratoDepth, freq);

    const env = createExponentialADSREnvelope(length, 0.12, 0.2, 0.68, 0.4, duration);
    for (let i = 0; i < length; i++) output[i] *= env[i];
  }

  normalizeBuffer(output);
  return gain(output, velocity);
}

/**
 * 低音提琴（Double Bass）合成参数接口。
 *
 * 低音提琴是弦乐家族最低音乐器，提供管弦乐队的低音基础。
 * 琴弦极粗、张力大，起音有显著的"打击感"。
 */
export interface DoubleBassParams {
  frequency: number;
  duration: number;
  velocity: number;
  vibratoRate?: number;
  vibratoDepth?: number;
  articulation?: 'arco' | 'pizzicato' | 'slap';
  brightness?: number;
  damping?: number;
}

/**
 * 合成低音提琴音色。
 *
 * 低音提琴的物理特点：
 * - 有效弦长很长，延迟线参数特殊
 * - 高频迅速衰减，声音暗沉
 * - Pizzicato（爵士风格）极其常见
 * - Slap 技巧产生打击乐性质的瞬态
 */
export function synthesizeDoubleBass(params: DoubleBassParams): Float32Array {
  const freq = clamp(params.frequency, 30, 800);
  const duration = clamp(params.duration, 0.05, MAX_DURATION_SECONDS);
  const velocity = clamp(params.velocity, 0, 1);
  const vibratoRate = params.vibratoRate ?? 4.0;
  const vibratoDepth = params.vibratoDepth ?? 18;
  const articulation = params.articulation ?? 'arco';
  const brightness = clamp(params.brightness ?? 0.3, 0, 1);
  const damping = clamp(params.damping ?? 0.5, 0, 1);

  const length = durationToSamples(duration);
  let output: Float32Array;

  if (articulation === 'pizzicato') {
    output = karplusStrongExtended(freq, duration, velocity * 1.0, 0.75, brightness, 0.2);
    const env = createExponentialADSREnvelope(length, 0.004, 0.07, 0.0, 0.18, duration);
    for (let i = 0; i < length; i++) output[i] *= env[i];
  } else if (articulation === 'slap') {
    // Slap：极强的瞬态 + 快速衰减 + 低频噪声冲击
    output = karplusStrongExtended(freq, duration, velocity * 1.2, 0.9, 0.5, 0.1);
    const click = whiteNoise(Math.floor(0.005 * SAMPLE_RATE), velocity * 0.5);
    for (let i = 0; i < click.length && i < length; i++) output[i] += click[i];
    const env = createExponentialADSREnvelope(length, 0.002, 0.05, 0.0, 0.15, duration);
    for (let i = 0; i < length; i++) output[i] *= env[i];
  } else {
    output = karplusStrongExtended(freq, duration, velocity * 0.65, damping, brightness, 0.35);

    // 低音提琴泛音以基频和二次谐波为主
    const harmonics = [1.0, 0.4, 0.15, 0.06, 0.03];
    const additive = additiveSynthesis(length, freq, harmonics, velocity * 0.15);
    output = mix(output, additive, 0.2);

    // 琴身大，共鸣极低（约 200 Hz）
    output = stateVariableLowPass(output, 1200, 0.5);
    output = lowPassFilter(output, 2500);

    output = applyVibrato(output, vibratoRate, vibratoDepth, freq);

    const env = createExponentialADSREnvelope(length, 0.15, 0.25, 0.6, 0.5, duration);
    for (let i = 0; i < length; i++) output[i] *= env[i];
  }

  normalizeBuffer(output);
  return gain(output, velocity);
}

// =============================================================================
// 木管家族 (Woodwind Family)
// =============================================================================

/**
 * 长笛合成参数接口。
 *
 * 长笛是无簧片木管，通过吹口边缘 splitting air 产生边棱音（edge tone），
 * 音色清澈、空灵，高频泛音丰富但幅度低。
 */
export interface FluteParams {
  frequency: number;
  duration: number;
  velocity: number;
  breathNoise?: number;
  articulation?: 'legato' | 'staccato' | 'flutter';
  brightness?: number;
}

/**
 * 合成长笛音色。
 *
 * 算法：
 * 1. 正弦波基频 + 弱谐波（长笛近似正弦，泛音极弱）
 * 2. 叠加粉红噪声模拟气流声
 * 3. 噪声通过高通滤波，仅保留"气声"频段
 * 4. ADSR 包络：起音稍慢（气流建立需要时间）
 */
export function synthesizeFlute(params: FluteParams): Float32Array {
  const freq = clamp(params.frequency, 220, 2500);
  const duration = clamp(params.duration, 0.05, MAX_DURATION_SECONDS);
  const velocity = clamp(params.velocity, 0, 1);
  const breathNoise = clamp(params.breathNoise ?? 0.15, 0, 1);
  const articulation = params.articulation ?? 'legato';
  const brightness = clamp(params.brightness ?? 0.4, 0, 1);

  const length = durationToSamples(duration);

  // 长笛谐波结构：基频强，泛音弱且随频率升高迅速衰减
  const harmonics = [1.0, 0.15 * brightness, 0.08 * brightness, 0.04 * brightness, 0.02 * brightness];
  let output = additiveSynthesis(length, freq, harmonics, velocity * 0.7);

  // 气流噪声：粉红噪声 + 高通（>2000 Hz 的气声成分）
  const noise = pinkNoise(length, breathNoise * velocity * 0.4);
  // 简易高通：用低通相减近似
  const noiseLowpass = lowPassFilter(noise, 1500);
  for (let i = 0; i < length; i++) {
    noise[i] = (noise[i] - noiseLowpass[i]) * 0.5;
  }
  output = mix(output, noise, breathNoise * 0.3);

  // 轻微颤音（长笛演奏家常用腹部颤音，速率稍快）
  output = applyVibrato(output, 5.8, 12, freq);

  // 包络
  let env: Float32Array;
  if (articulation === 'staccato') {
    env = createExponentialADSREnvelope(length, 0.03, 0.08, 0.0, 0.1, duration);
  } else if (articulation === 'flutter') {
    // 花舌：快速振幅调制模拟舌头颤动
    env = createExponentialADSREnvelope(length, 0.06, 0.1, 0.7, 0.2, duration);
    for (let i = 0; i < length; i++) {
      const flutter = 1.0 + 0.15 * Math.sin(2.0 * Math.PI * 18.0 * i / SAMPLE_RATE);
      output[i] *= flutter;
    }
  } else {
    env = createExponentialADSREnvelope(length, 0.1, 0.15, 0.8, 0.25, duration);
  }
  for (let i = 0; i < length; i++) output[i] *= env[i];

  normalizeBuffer(output);
  return gain(output, velocity);
}

/**
 * 双簧管（Oboe）合成参数接口。
 *
 * 双簧管使用两片苇制簧片振动，音色 nasal、穿透力强，
 * 具有丰富的奇次谐波，是管弦乐团的标准定音乐器。
 */
export interface OboeParams {
  frequency: number;
  duration: number;
  velocity: number;
  reedHarshness?: number;
  articulation?: 'legato' | 'staccato' | 'marcato';
  brightness?: number;
}

/**
 * 合成双簧管音色。
 *
 * 簧片乐器特征：
 * - 奇次谐波丰富（类似方波频谱）
 * - 起音有明确的"簧片啁啾"（reed chirp）
 * - 管体为圆锥形，产生偶次谐波填充
 */
export function synthesizeOboe(params: OboeParams): Float32Array {
  const freq = clamp(params.frequency, 200, 1800);
  const duration = clamp(params.duration, 0.05, MAX_DURATION_SECONDS);
  const velocity = clamp(params.velocity, 0, 1);
  const reedHarshness = clamp(params.reedHarshness ?? 0.5, 0, 1);
  const articulation = params.articulation ?? 'legato';
  const brightness = clamp(params.brightness ?? 0.55, 0, 1);

  const length = durationToSamples(duration);

  // 双簧管谐波：奇次强，偶次弱
  const harmonics = new Array(12).fill(0);
  for (let h = 0; h < harmonics.length; h++) {
    const n = h + 1;
    if (n % 2 === 1) {
      harmonics[h] = Math.pow(n, -1.2) * brightness; // 奇次谐波按 ~1/n 衰减
    } else {
      harmonics[h] = Math.pow(n, -2.5) * brightness * 0.3; // 偶次弱很多
    }
  }
  harmonics[0] = 1.0; // 基频归一
  let output = additiveSynthesis(length, freq, harmonics, velocity * 0.65);

  // 簧片啁啾噪声：短促的高频脉冲
  const chirpLen = Math.floor(0.02 * SAMPLE_RATE);
  const chirp = whiteNoise(chirpLen, reedHarshness * velocity * 0.3);
  const chirpFiltered = lowPassFilter(chirp, 4000);
  for (let i = 0; i < chirpFiltered.length && i < length; i++) {
    output[i] += chirpFiltered[i];
  }

  // 呼吸噪声（较少）
  const noise = pinkNoise(length, velocity * 0.06);
  output = mix(output, noise, 0.08);

  // 轻微颤音
  output = applyVibrato(output, 5.2, 14, freq);

  let env: Float32Array;
  if (articulation === 'staccato') {
    env = createExponentialADSREnvelope(length, 0.02, 0.06, 0.0, 0.08, duration);
  } else if (articulation === 'marcato') {
    env = createExponentialADSREnvelope(length, 0.015, 0.2, 0.55, 0.2, duration);
  } else {
    env = createExponentialADSREnvelope(length, 0.06, 0.12, 0.75, 0.2, duration);
  }
  for (let i = 0; i < length; i++) output[i] *= env[i];

  normalizeBuffer(output);
  return gain(output, velocity);
}

/**
 * 单簧管（Clarinet）合成参数接口。
 *
 * 单簧管也是单簧片乐器，但管体为圆柱形，
 * 导致频谱更接近方波（奇次谐波强，偶次谐波极弱）。
 */
export interface ClarinetParams {
  frequency: number;
  duration: number;
  velocity: number;
  reedHarshness?: number;
  articulation?: 'legato' | 'staccato' | 'sforzando';
  brightness?: number;
}

/**
 * 合成单簧管音色。
 *
 * 圆柱形管体 -> 奇次谐波主导。
 * 簧片相对较软，起音比双簧管稍慢，音色更圆润、暗哑。
 */
export function synthesizeClarinet(params: ClarinetParams): Float32Array {
  const freq = clamp(params.frequency, 140, 1600);
  const duration = clamp(params.duration, 0.05, MAX_DURATION_SECONDS);
  const velocity = clamp(params.velocity, 0, 1);
  const reedHarshness = clamp(params.reedHarshness ?? 0.35, 0, 1);
  const articulation = params.articulation ?? 'legato';
  const brightness = clamp(params.brightness ?? 0.4, 0, 1);

  const length = durationToSamples(duration);

  // 单簧管：奇次谐波近似方波，偶次几乎缺失
  const harmonics = new Array(12).fill(0);
  for (let h = 0; h < harmonics.length; h++) {
    const n = h + 1;
    if (n % 2 === 1) {
      harmonics[h] = (1.0 / n) * brightness;
    } else {
      harmonics[h] = 0.01 * brightness; // 极小偶次谐波
    }
  }
  harmonics[0] = 1.0;
  let output = additiveSynthesis(length, freq, harmonics, velocity * 0.7);

  // 簧片啁啾（单簧管更柔和）
  const chirpLen = Math.floor(0.015 * SAMPLE_RATE);
  const chirp = whiteNoise(chirpLen, reedHarshness * velocity * 0.2);
  const chirpFiltered = lowPassFilter(chirp, 3500);
  for (let i = 0; i < chirpFiltered.length && i < length; i++) {
    output[i] += chirpFiltered[i];
  }

  const noise = pinkNoise(length, velocity * 0.05);
  output = mix(output, noise, 0.06);
  output = applyVibrato(output, 4.8, 10, freq);

  let env: Float32Array;
  if (articulation === 'staccato') {
    env = createExponentialADSREnvelope(length, 0.025, 0.07, 0.0, 0.1, duration);
  } else if (articulation === 'sforzando') {
    // 突强：快速起音后轻微衰减再保持
    env = createADSREnvelope(length, 0.005, 0.15, 0.6, 0.25, duration);
  } else {
    env = createExponentialADSREnvelope(length, 0.08, 0.18, 0.72, 0.22, duration);
  }
  for (let i = 0; i < length; i++) output[i] *= env[i];

  normalizeBuffer(output);
  return gain(output, velocity);
}

/**
 * 大管（Bassoon）合成参数接口。
 *
 * 大管是双簧片低音木管，音色厚重、幽默，
 * 管体折叠长，低频响应丰富。
 */
export interface BassoonParams {
  frequency: number;
  duration: number;
  velocity: number;
  reedHarshness?: number;
  articulation?: 'legato' | 'staccato' | 'tenuto';
  brightness?: number;
}

/**
 * 合成大管音色。
 *
 * 特点：
 * - 基频强，高频迅速滚降
 * - 双簧片特征带来鼻音色彩
 * - 起音有明显的气涌（air rush）
 */
export function synthesizeBassoon(params: BassoonParams): Float32Array {
  const freq = clamp(params.frequency, 40, 700);
  const duration = clamp(params.duration, 0.05, MAX_DURATION_SECONDS);
  const velocity = clamp(params.velocity, 0, 1);
  const reedHarshness = clamp(params.reedHarshness ?? 0.45, 0, 1);
  const articulation = params.articulation ?? 'legato';
  const brightness = clamp(params.brightness ?? 0.3, 0, 1);

  const length = durationToSamples(duration);

  // 大管谐波丰富但高频衰减极快
  const harmonics = new Array(10).fill(0);
  for (let h = 0; h < harmonics.length; h++) {
    const n = h + 1;
    harmonics[h] = Math.pow(n, -1.5) * brightness;
  }
  harmonics[0] = 1.0;
  let output = additiveSynthesis(length, freq, harmonics, velocity * 0.75);

  // 气涌噪声（大管气息声显著）
  const air = pinkNoise(length, velocity * 0.12);
  const airEnv = createExponentialADSREnvelope(length, 0.1, 0.2, 0.5, 0.3, duration);
  for (let i = 0; i < length; i++) air[i] *= airEnv[i];
  output = mix(output, air, 0.15);

  // 啁啾
  const chirpLen = Math.floor(0.025 * SAMPLE_RATE);
  const chirp = whiteNoise(chirpLen, reedHarshness * velocity * 0.25);
  const chirpFiltered = lowPassFilter(chirp, 3000);
  for (let i = 0; i < chirpFiltered.length && i < length; i++) {
    output[i] += chirpFiltered[i];
  }

  output = applyVibrato(output, 4.5, 16, freq);

  let env: Float32Array;
  if (articulation === 'staccato') {
    env = createExponentialADSREnvelope(length, 0.03, 0.08, 0.0, 0.12, duration);
  } else if (articulation === 'tenuto') {
    env = createExponentialADSREnvelope(length, 0.08, 0.05, 0.9, 0.15, duration);
  } else {
    env = createExponentialADSREnvelope(length, 0.12, 0.2, 0.7, 0.3, duration);
  }
  for (let i = 0; i < length; i++) output[i] *= env[i];

  normalizeBuffer(output);
  return gain(output, velocity);
}

// =============================================================================
// 铜管家族 (Brass Family)
// =============================================================================

/**
 * 圆号（French Horn）合成参数接口。
 *
 * 圆号管体极长（约 3.7 米展开），具有温暖的圆筒-圆锥混合共振，
 * 音色柔和、丰满，高频泛音被大量吸收。
 */
export interface FrenchHornParams {
  frequency: number;
  duration: number;
  velocity: number;
  lipVibratoRate?: number;
  lipVibratoDepth?: number;
  articulation?: 'legato' | 'staccato' | 'stopped';
  brightness?: number;
  mute?: boolean;
}

/**
 * 合成圆号音色。
 *
 * 算法：
 * 1. 带限锯齿波作为唇振源
 * 2. 通过多个带通滤波器模拟圆号的宽共振峰（~350 Hz, ~800 Hz, ~1500 Hz）
 * 3. 添加唇片颤音（lip vibrato）
 * 4. Stopped（堵号）技巧产生金属般的嗡嗡声（brassy buzz）
 */
export function synthesizeFrenchHorn(params: FrenchHornParams): Float32Array {
  const freq = clamp(params.frequency, 60, 1000);
  const duration = clamp(params.duration, 0.05, MAX_DURATION_SECONDS);
  const velocity = clamp(params.velocity, 0, 1);
  const lipVibratoRate = params.lipVibratoRate ?? 5.0;
  const lipVibratoDepth = params.lipVibratoDepth ?? 20;
  const articulation = params.articulation ?? 'legato';
  const brightness = clamp(params.brightness ?? 0.35, 0, 1);
  const mute = params.mute ?? false;

  const length = durationToSamples(duration);

  // 圆号基础波形：偏暗的锯齿
  let source = bandLimitedSawtooth(length, freq, velocity * 0.5);

  // 圆号共振峰（宽而柔和）
  const formants = mute ? [450, 1000, 2200] : [350, 800, 1500];
  const bandwidths = mute ? [300, 400, 600] : [250, 350, 500];
  const gains = mute ? [1.0, 0.6, 0.2] : [1.0, 0.7, 0.3];
  source = applyFormantFilter(source, formants, bandwidths, gains);

  // 堵号技巧：大量高频、尖锐的共振峰
  if (articulation === 'stopped') {
    const buzz = bandLimitedSawtooth(length, freq * 1.5, velocity * 0.15); // 显著的高次分音
    source = mix(source, buzz, 0.25);
    source = stateVariableLowPass(source, 3500, 0.7);
  }

  // 唇片颤音（圆号演奏家常用手腕/嘴唇颤音）
  source = applyVibrato(source, lipVibratoRate, lipVibratoDepth, freq);

  // 弱音器：削弱高频、加阻尼
  if (mute) {
    source = lowPassFilter(source, 2000);
  }

  let env: Float32Array;
  if (articulation === 'staccato') {
    env = createExponentialADSREnvelope(length, 0.03, 0.08, 0.0, 0.1, duration);
  } else {
    env = createExponentialADSREnvelope(length, 0.1, 0.2, 0.72, 0.35, duration);
  }
  for (let i = 0; i < length; i++) source[i] *= env[i];

  normalizeBuffer(source);
  return gain(source, velocity);
}

/**
 * 小号（Trumpet）合成参数接口。
 *
 * 小号是铜管中音最高、最明亮的乐器，
 * 具有强烈的"金属芯"和清晰的泛音列。
 */
export interface TrumpetParams {
  frequency: number;
  duration: number;
  velocity: number;
  lipVibratoRate?: number;
  lipVibratoDepth?: number;
  articulation?: 'legato' | 'staccato' | 'marcato' | 'flutter';
  brightness?: number;
  mute?: 'none' | 'harmon' | 'straight';
}

/**
 * 合成小号音色。
 *
 * 小号特点：
 * - 锯齿波谐波极其丰富
 * - 起音迅速、有明确的"音头"（attack blast）
 * - 共振峰高且尖锐（~800 Hz, ~1200 Hz, ~2500 Hz）
 * - Harmon 弱音器产生"哇哇"效果（通过剧烈改变共振峰模拟）
 */
export function synthesizeTrumpet(params: TrumpetParams): Float32Array {
  const freq = clamp(params.frequency, 150, 1500);
  const duration = clamp(params.duration, 0.05, MAX_DURATION_SECONDS);
  const velocity = clamp(params.velocity, 0, 1);
  const lipVibratoRate = params.lipVibratoRate ?? 5.8;
  const lipVibratoDepth = params.lipVibratoDepth ?? 18;
  const articulation = params.articulation ?? 'legato';
  const brightness = clamp(params.brightness ?? 0.8, 0, 1);
  const mute = params.mute ?? 'none';

  const length = durationToSamples(duration);

  // 小号锯齿波更亮
  let source = bandLimitedSawtooth(length, freq, velocity * 0.6);

  // 基础共振峰
  let formants: number[];
  let bandwidths: number[];
  let gains: number[];

  if (mute === 'harmon') {
    // Harmon 弱音器：窄带、高频突出
    formants = [600, 1400, 2800];
    bandwidths = [150, 200, 400];
    gains = [1.0, 0.8, 0.5];
  } else if (mute === 'straight') {
    // Straight 弱音器：更闷、高频被截
    formants = [500, 1000, 1800];
    bandwidths = [200, 300, 500];
    gains = [1.0, 0.5, 0.15];
  } else {
    formants = [800, 1200, 2500];
    bandwidths = [200, 280, 450];
    gains = [1.0, 0.85, 0.4];
  }
  source = applyFormantFilter(source, formants, bandwidths, gains);

  // 音头冲击：短促噪声 + 快速频率建立
  const blastLen = Math.floor(0.015 * SAMPLE_RATE);
  const blast = whiteNoise(blastLen, velocity * 0.35);
  const blastFiltered = lowPassFilter(blast, 5000);
  for (let i = 0; i < blastFiltered.length && i < length; i++) {
    source[i] += blastFiltered[i];
  }

  source = applyVibrato(source, lipVibratoRate, lipVibratoDepth, freq);

  if (articulation === 'flutter') {
    // 花舌颤音
    for (let i = 0; i < length; i++) {
      const flutter = 1.0 + 0.12 * Math.sin(2.0 * Math.PI * 20.0 * i / SAMPLE_RATE);
      source[i] *= flutter;
    }
  }

  let env: Float32Array;
  if (articulation === 'staccato') {
    env = createExponentialADSREnvelope(length, 0.01, 0.06, 0.0, 0.08, duration);
  } else if (articulation === 'marcato') {
    env = createExponentialADSREnvelope(length, 0.005, 0.15, 0.6, 0.2, duration);
  } else {
    env = createExponentialADSREnvelope(length, 0.04, 0.12, 0.78, 0.22, duration);
  }
  for (let i = 0; i < length; i++) source[i] *= env[i];

  normalizeBuffer(source);
  return gain(source, velocity);
}

/**
 * 长号（Trombone）合成参数接口。
 *
 * 长号使用滑管改变管长，音色宏大、庄严，
 * 低音区具有强烈的管体共振和轻微的"撕裂感"。
 */
export interface TromboneParams {
  frequency: number;
  duration: number;
  velocity: number;
  lipVibratoRate?: number;
  lipVibratoDepth?: number;
  articulation?: 'legato' | 'staccato' | 'glissando';
  brightness?: number;
}

/**
 * 合成长号音色。
 *
 * 长号的圆柱形管体比例更高，导致偶次谐波比圆号丰富，
 * 滑管技巧通过连续频率扫描模拟。
 */
export function synthesizeTrombone(params: TromboneParams): Float32Array {
  const freq = clamp(params.frequency, 50, 800);
  const duration = clamp(params.duration, 0.05, MAX_DURATION_SECONDS);
  const velocity = clamp(params.velocity, 0, 1);
  const lipVibratoRate = params.lipVibratoRate ?? 4.8;
  const lipVibratoDepth = params.lipVibratoDepth ?? 16;
  const articulation = params.articulation ?? 'legato';
  const brightness = clamp(params.brightness ?? 0.5, 0, 1);

  const length = durationToSamples(duration);
  let source: Float32Array;

  if (articulation === 'glissando') {
    // 滑音：从低半音滑到目标音（或反向）
    source = new Float32Array(length);
    const startFreq = freq * 0.85;
    for (let i = 0; i < length; i++) {
      const t = i / length;
      const f = lerp(startFreq, freq, t * t); // 二次缓入
      const phase = (2.0 * Math.PI * f * i) / SAMPLE_RATE;
      source[i] = Math.sin(phase) * velocity;
    }
    // 滑音叠加锯齿 richer
    const saw = bandLimitedSawtooth(length, freq, velocity * 0.3);
    source = mix(source, saw, 0.4);
  } else {
    source = bandLimitedSawtooth(length, freq, velocity * 0.55);
  }

  // 长号共振峰（宽、强）
  const formants = [450, 900, 1800];
  const bandwidths = [220, 320, 500];
  const gains = [1.0, 0.8, 0.35];
  source = applyFormantFilter(source, formants, bandwidths, gains);

  const blastLen = Math.floor(0.02 * SAMPLE_RATE);
  const blast = whiteNoise(blastLen, velocity * 0.3);
  const blastFiltered = lowPassFilter(blast, 4500);
  for (let i = 0; i < blastFiltered.length && i < length; i++) {
    source[i] += blastFiltered[i];
  }

  source = applyVibrato(source, lipVibratoRate, lipVibratoDepth, freq);

  let env: Float32Array;
  if (articulation === 'staccato') {
    env = createExponentialADSREnvelope(length, 0.015, 0.07, 0.0, 0.1, duration);
  } else {
    env = createExponentialADSREnvelope(length, 0.06, 0.18, 0.7, 0.3, duration);
  }
  for (let i = 0; i < length; i++) source[i] *= env[i];

  normalizeBuffer(source);
  return gain(source, velocity);
}

/**
 * 大号（Tuba）合成参数接口。
 *
 * 大号是铜管家族的最低音，管体庞大，
 * 音色深沉稳重，泛音列稀疏。
 */
export interface TubaParams {
  frequency: number;
  duration: number;
  velocity: number;
  lipVibratoRate?: number;
  lipVibratoDepth?: number;
  articulation?: 'legato' | 'staccato' | 'tenuto';
  brightness?: number;
}

/**
 * 合成大号音色。
 *
 * 大号特点：
 * - 极低频，需要特别注意直流偏移和扬声器保护
 * - 起音非常慢（大量空气需要填充管体）
 * - 高频泛音极少，频谱集中在基频附近
 */
export function synthesizeTuba(params: TubaParams): Float32Array {
  const freq = clamp(params.frequency, 30, 500);
  const duration = clamp(params.duration, 0.05, MAX_DURATION_SECONDS);
  const velocity = clamp(params.velocity, 0, 1);
  const lipVibratoRate = params.lipVibratoRate ?? 4.2;
  const lipVibratoDepth = params.lipVibratoDepth ?? 12;
  const articulation = params.articulation ?? 'legato';
  const brightness = clamp(params.brightness ?? 0.25, 0, 1);

  const length = durationToSamples(duration);

  // 大号用更暗的锯齿 + 强低通
  let source = bandLimitedSawtooth(length, freq, velocity * 0.6);

  // 大号共振峰极低
  const formants = [250, 500, 1000];
  const bandwidths = [180, 250, 400];
  const gains = [1.0, 0.5, 0.15];
  source = applyFormantFilter(source, formants, bandwidths, gains);

  // 强低通限制高频
  source = lowPassFilter(source, 1800);

  // 气流填充噪声（极低频粉红噪声）
  const air = pinkNoise(length, velocity * 0.08);
  const airLow = lowPassFilter(air, 300);
  source = mix(source, airLow, 0.1);

  source = applyVibrato(source, lipVibratoRate, lipVibratoDepth, freq);

  let env: Float32Array;
  if (articulation === 'staccato') {
    env = createExponentialADSREnvelope(length, 0.02, 0.06, 0.0, 0.12, duration);
  } else if (articulation === 'tenuto') {
    env = createExponentialADSREnvelope(length, 0.15, 0.1, 0.85, 0.3, duration);
  } else {
    env = createExponentialADSREnvelope(length, 0.18, 0.25, 0.65, 0.45, duration);
  }
  for (let i = 0; i < length; i++) source[i] *= env[i];

  normalizeBuffer(source);
  return gain(source, velocity);
}

// =============================================================================
// 色彩乐器 / 打击乐 (Harp & Timpani)
// =============================================================================

/**
 * 竖琴合成参数接口。
 *
 * 竖琴通过拨动琴弦发声，每根弦独立振动，
 * 音色清澈、晶莹剔透，具有快速的音头衰减。
 */
export interface HarpParams {
  frequency: number;
  duration: number;
  velocity: number;
  /** 是否在音符开始时同时产生踏板噪音 */
  pedalNoise?: boolean;
  brightness?: number;
  damping?: number;
}

/**
 * 合成竖琴音色。
 *
 * 竖琴本质上是多组不同长度的弦，
 * 单音合成使用 Karplus-Strong 配合非常短的衰减时间，
 * 并加入弦的二次共振（sympathetic resonance）模拟。
 */
export function synthesizeHarp(params: HarpParams): Float32Array {
  const freq = clamp(params.frequency, 30, 4000);
  const duration = clamp(params.duration, 0.05, MAX_DURATION_SECONDS);
  const velocity = clamp(params.velocity, 0, 1);
  const pedalNoise = params.pedalNoise ?? false;
  const brightness = clamp(params.brightness ?? 0.75, 0, 1);
  const damping = clamp(params.damping ?? 0.7, 0, 1);

  const length = durationToSamples(duration);

  // 主弦 KS
  let output = karplusStrongExtended(freq, duration, velocity * 0.9, damping, brightness, 0.15);

  // 二次共振：附近频率的微弱振动模拟其他弦的共鸣
  const sympatheticDetune = [1.003, 0.997, 2.001, 2.998];
  const sympatheticGains = [0.04, 0.04, 0.02, 0.015];
  for (let s = 0; s < sympatheticDetune.length; s++) {
    const sym = karplusStrongExtended(
      freq * sympatheticDetune[s],
      duration * 0.7,
      velocity * sympatheticGains[s],
      damping * 1.2,
      brightness * 0.8,
      0.1
    );
    for (let i = 0; i < sym.length && i < length; i++) {
      output[i] += sym[i];
    }
  }

  // 踏板噪音
  if (pedalNoise) {
    const pNoise = whiteNoise(Math.floor(0.03 * SAMPLE_RATE), velocity * 0.1);
    const pFiltered = lowPassFilter(pNoise, 2000);
    for (let i = 0; i < pFiltered.length && i < length; i++) {
      output[i] += pFiltered[i];
    }
  }

  // 竖琴包络：极快起音、无 sustain、自然衰减
  const env = createExponentialADSREnvelope(length, 0.003, 0.05, 0.0, duration * 0.8, duration);
  for (let i = 0; i < length; i++) output[i] *= env[i];

  normalizeBuffer(output);
  return gain(output, velocity);
}

/**
 * 定音鼓（Timpani）合成参数接口。
 *
 * 定音鼓是有确定音高的打击乐器，通过绷紧的鼓皮振动发声，
 * 具有复杂的非谐波泛音列和明显的音高弯曲（pitch bend）衰减特征。
 */
export interface TimpaniParams {
  frequency: number;
  duration: number;
  velocity: number;
  /** 鼓皮张力 / 音高弯曲程度 */
  pitchBendAmount?: number;
  brightness?: number;
  /** 使用软槌（soft）或硬槌（hard） */
  mallet?: 'soft' | 'hard';
}

/**
 * 合成定音鼓音色。
 *
 * 物理特点：
 * - 膜振动产生非谐波泛音（频率不成整数倍）
 * - 起音有强烈的打击瞬态
 * - 衰减过程中音高略微下降（鼓皮松弛）
 * - 硬槌产生更多高频，软槌更暗
 */
export function synthesizeTimpani(params: TimpaniParams): Float32Array {
  const freq = clamp(params.frequency, 50, 500);
  const duration = clamp(params.duration, 0.05, MAX_DURATION_SECONDS);
  const velocity = clamp(params.velocity, 0, 1);
  const pitchBendAmount = clamp(params.pitchBendAmount ?? 0.15, 0, 1);
  const brightness = clamp(params.brightness ?? 0.5, 0, 1);
  const mallet = params.mallet ?? 'soft';

  const length = durationToSamples(duration);

  // 膜振动非谐波模式：近似 Bessel 函数零点比率
  // 基频 f01, 然后 f11≈1.59*f01, f21≈2.14*f01, f02≈2.30*f01...
  const modes = [1.0, 1.59, 2.14, 2.30, 2.65, 3.0];
  const modeAmps = [1.0, 0.45, 0.25, 0.15, 0.08, 0.05];
  const modeDecay = [0.8, 1.2, 1.6, 2.0, 2.4, 3.0]; // 高频衰减更快

  const output = new Float32Array(length);

  for (let m = 0; m < modes.length; m++) {
    const modeFreq = freq * modes[m];
    if (modeFreq >= SAMPLE_RATE / 2) break;

    const amp = modeAmps[m] * brightness;
    const decay = modeDecay[m] * (mallet === 'soft' ? 1.3 : 0.9);

    for (let i = 0; i < length; i++) {
      const t = i / SAMPLE_RATE;
      // 音高弯曲：频率随时间轻微下降
      const bend = 1.0 - pitchBendAmount * 0.05 * t;
      const phase = 2.0 * Math.PI * modeFreq * bend * t;
      // 指数衰减
      const env = Math.exp(-decay * t * freq * 0.01);
      output[i] += amp * Math.sin(phase) * env;
    }
  }

  // 打击瞬态：硬槌更多高频点击
  const clickCutoff = mallet === 'soft' ? 2000 : 6000;
  const click = whiteNoise(Math.floor(0.01 * SAMPLE_RATE), velocity * (mallet === 'soft' ? 0.4 : 0.7));
  const clickFiltered = lowPassFilter(click, clickCutoff);
  for (let i = 0; i < clickFiltered.length && i < length; i++) {
    output[i] += clickFiltered[i];
  }

  // 整体振幅包络（定音鼓无 sustain）
  const env = createExponentialADSREnvelope(length, 0.001, 0.1, 0.0, duration * 0.9, duration);
  for (let i = 0; i < length; i++) output[i] *= env[i];

  normalizeBuffer(output);
  return gain(output, velocity);
}

// =============================================================================
// OrchestralSection 编排类
// =============================================================================

/**
 * 声部事件描述，用于 OrchestralSection 内部队列。
 */
interface SectionEvent {
  /** 乐器类型标识 */
  instrument: string;
  /** 开始时间（秒，相对于片段起点） */
  startTime: number;
  /** 合成参数对象（具体类型由 instrument 决定） */
  params: unknown;
}

/**
 * OrchestralSection - 管弦乐声部编排器。
 *
 * 本类允许用户像指挥一样编排多个乐器声部：
 * - 按时间轴添加不同乐器的事件
 * - 自动进行声像（Pan）分配
 * - 提供一键混合（mixdown）生成总谱音频
 *
 * 示例：
 * ```ts
 * const section = new OrchestralSection();
 * section.addViolin({ frequency: 440, duration: 2, velocity: 0.8, startTime: 0 });
 * section.addCello({ frequency: 220, duration: 2, velocity: 0.6, startTime: 0 });
 * const master = section.mixdown(10); // 生成 10 秒总谱
 * ```
 */
export class OrchestralSection {
  /** 内部事件队列 */
  private events: SectionEvent[] = [];
  /** 默认声像位置表（-1 = 极左，1 = 极右） */
  private panPositions: Map<string, number> = new Map();

  constructor() {
    // 初始化标准管弦乐摆位（面对观众的视角）
    this.panPositions.set('violin', -0.6);
    this.panPositions.set('viola', -0.25);
    this.panPositions.set('cello', 0.3);
    this.panPositions.set('doubleBass', 0.5);
    this.panPositions.set('flute', -0.4);
    this.panPositions.set('oboe', -0.15);
    this.panPositions.set('clarinet', 0.15);
    this.panPositions.set('bassoon', 0.35);
    this.panPositions.set('frenchHorn', -0.1);
    this.panPositions.set('trumpet', 0.25);
    this.panPositions.set('trombone', 0.4);
    this.panPositions.set('tuba', 0.45);
    this.panPositions.set('harp', -0.5);
    this.panPositions.set('timpani', 0.0);
  }

  /**
   * 添加自定义事件到编排队列。
   * @param instrument - 乐器标识字符串
   * @param startTime - 开始时间（秒）
   * @param params - 合成参数对象
   */
  addEvent(instrument: string, startTime: number, params: unknown): void {
    this.events.push({ instrument, startTime, params });
  }

  /** 添加小提琴声部 */
  addViolin(startTime: number, params: ViolinParams): void {
    this.events.push({ instrument: 'violin', startTime, params });
  }

  /** 添加中提琴声部 */
  addViola(startTime: number, params: ViolaParams): void {
    this.events.push({ instrument: 'viola', startTime, params });
  }

  /** 添加大提琴声部 */
  addCello(startTime: number, params: CelloParams): void {
    this.events.push({ instrument: 'cello', startTime, params });
  }

  /** 添加低音提琴声部 */
  addDoubleBass(startTime: number, params: DoubleBassParams): void {
    this.events.push({ instrument: 'doubleBass', startTime, params });
  }

  /** 添加长笛声部 */
  addFlute(startTime: number, params: FluteParams): void {
    this.events.push({ instrument: 'flute', startTime, params });
  }

  /** 添加双簧管声部 */
  addOboe(startTime: number, params: OboeParams): void {
    this.events.push({ instrument: 'oboe', startTime, params });
  }

  /** 添加单簧管声部 */
  addClarinet(startTime: number, params: ClarinetParams): void {
    this.events.push({ instrument: 'clarinet', startTime, params });
  }

  /** 添加大管声部 */
  addBassoon(startTime: number, params: BassoonParams): void {
    this.events.push({ instrument: 'bassoon', startTime, params });
  }

  /** 添加圆号声部 */
  addFrenchHorn(startTime: number, params: FrenchHornParams): void {
    this.events.push({ instrument: 'frenchHorn', startTime, params });
  }

  /** 添加小号声部 */
  addTrumpet(startTime: number, params: TrumpetParams): void {
    this.events.push({ instrument: 'trumpet', startTime, params });
  }

  /** 添加长号声部 */
  addTrombone(startTime: number, params: TromboneParams): void {
    this.events.push({ instrument: 'trombone', startTime, params });
  }

  /** 添加大号声部 */
  addTuba(startTime: number, params: TubaParams): void {
    this.events.push({ instrument: 'tuba', startTime, params });
  }

  /** 添加竖琴声部 */
  addHarp(startTime: number, params: HarpParams): void {
    this.events.push({ instrument: 'harp', startTime, params });
  }

  /** 添加定音鼓声部 */
  addTimpani(startTime: number, params: TimpaniParams): void {
    this.events.push({ instrument: 'timpani', startTime, params });
  }

  /**
   * 设置某乐器的默认声像位置。
   * @param instrument - 乐器标识
   * @param pan - 声像值（-1 到 1）
   */
  setPan(instrument: string, pan: number): void {
    this.panPositions.set(instrument, clamp(pan, -1, 1));
  }

  /**
   * 获取某乐器的声像位置。
   */
  getPan(instrument: string): number {
    return this.panPositions.get(instrument) ?? 0;
  }

  /**
   * 清空编排队列。
   */
  clear(): void {
    this.events = [];
  }

  /**
   * 获取当前队列中的事件数量。
   */
  getEventCount(): number {
    return this.events.length;
  }

  /**
   * 渲染指定乐器事件的音频片段。
   * @private
   */
  private renderEvent(event: SectionEvent): Float32Array {
    const p = event.params as any;
    switch (event.instrument) {
      case 'violin': return synthesizeViolin(p as ViolinParams);
      case 'viola': return synthesizeViola(p as ViolaParams);
      case 'cello': return synthesizeCello(p as CelloParams);
      case 'doubleBass': return synthesizeDoubleBass(p as DoubleBassParams);
      case 'flute': return synthesizeFlute(p as FluteParams);
      case 'oboe': return synthesizeOboe(p as OboeParams);
      case 'clarinet': return synthesizeClarinet(p as ClarinetParams);
      case 'bassoon': return synthesizeBassoon(p as BassoonParams);
      case 'frenchHorn': return synthesizeFrenchHorn(p as FrenchHornParams);
      case 'trumpet': return synthesizeTrumpet(p as TrumpetParams);
      case 'trombone': return synthesizeTrombone(p as TromboneParams);
      case 'tuba': return synthesizeTuba(p as TubaParams);
      case 'harp': return synthesizeHarp(p as HarpParams);
      case 'timpani': return synthesizeTimpani(p as TimpaniParams);
      default:
        // 未知乐器返回静音
        return new Float32Array(durationToSamples(p.duration ?? 1));
    }
  }

  /**
   * 执行混音，生成总谱音频缓冲区。
   *
   * 所有事件按 startTime 定位混合到总线上。
   * 每个乐器按预置声像做简单的振幅声像（恒定功率声像律）。
   *
   * @param totalDuration - 总谱总时长（秒）
   * @returns Float32Array 单声道混合结果
   */
  mixdown(totalDuration: number): Float32Array {
    const totalSamples = durationToSamples(totalDuration);
    const master = new Float32Array(totalSamples);

    for (const event of this.events) {
      const buffer = this.renderEvent(event);
      const startSample = Math.floor(event.startTime * SAMPLE_RATE);
      const pan = this.getPan(event.instrument);
      // 恒定功率声像：左声道 cos(p), 右声道 sin(p)
      // 单声道混合取平均振幅补偿
      const panGain = Math.cos((pan + 1) * Math.PI / 4); // 映射 [-1,1] -> [0, π/2]

      for (let i = 0; i < buffer.length; i++) {
        const idx = startSample + i;
        if (idx >= 0 && idx < totalSamples) {
          master[idx] += buffer[i] * panGain;
        }
      }
    }

    normalizeBuffer(master);
    return master;
  }

  /**
   * 生成带统计信息的混音报告。
   * 返回对象包含峰值、RMS 能量、事件数等元数据。
   *
   * @param totalDuration - 总谱总时长（秒）
   */
  mixdownWithReport(totalDuration: number): { buffer: Float32Array; peak: number; rms: number; events: number } {
    const buffer = this.mixdown(totalDuration);
    let peak = 0;
    let sumSq = 0;
    for (let i = 0; i < buffer.length; i++) {
      const abs = Math.abs(buffer[i]);
      if (abs > peak) peak = abs;
      sumSq += buffer[i] * buffer[i];
    }
    const rms = Math.sqrt(sumSq / buffer.length);
    return { buffer, peak, rms, events: this.events.length };
  }
}

// =============================================================================
// 模块元数据导出
// =============================================================================

/** 本模块支持的乐器名称列表 */
export const ORCHESTRAL_INSTRUMENTS = [
  'violin', 'viola', 'cello', 'doubleBass',
  'flute', 'oboe', 'clarinet', 'bassoon',
  'frenchHorn', 'trumpet', 'trombone', 'tuba',
  'harp', 'timpani'
] as const;

/** 乐器家族分类映射 */
export const ORCHESTRAL_FAMILIES = {
  strings: ['violin', 'viola', 'cello', 'doubleBass'],
  woodwinds: ['flute', 'oboe', 'clarinet', 'bassoon'],
  brass: ['frenchHorn', 'trumpet', 'trombone', 'tuba'],
  percussion: ['harp', 'timpani']
} as const;

// =============================================================================
// 管弦乐效果与空间处理（Orchestral Effects & Spatial Processing）
// =============================================================================

/**
 * 简易施罗德混响（Schroeder Reverb）。
 *
 * 经典的人工混响结构：4 个并联梳状滤波器（Comb Filter）
 * 后接 2 个串联全通滤波器（All-pass Filter）。
 * 模拟音乐厅的密集早期反射与平滑尾音。
 *
 * @param input - 输入信号
 * @param roomSize - 房间大小（0~1），影响混响时间
 * @param damping - 高频阻尼（0~1），越大高频衰减越快
 * @param mix - 干湿比（0 = 全干，1 = 全湿）
 * @returns 混响处理后的信号
 */
export function applySchroederReverb(
  input: Float32Array,
  roomSize: number,
  damping: number,
  mix: number
): Float32Array {
  const length = input.length;
  const output = new Float32Array(length);

  // 梳状滤波器延迟时间（样本数），模拟不同墙面的早期反射
  const combDelays = [1553, 1613, 1733, 1931];
  const combFeedback = clamp(roomSize * 0.75, 0.3, 0.95);
  const combDamp = clamp(damping, 0, 1);

  // 并联 4 路梳状滤波器
  const combSums = new Float32Array(length);
  for (let c = 0; c < combDelays.length; c++) {
    const delay = combDelays[c];
    const delayLine = new Float32Array(delay);
    let writeIdx = 0;
    let filterStore = 0;
    for (let i = 0; i < length; i++) {
      const delayed = delayLine[writeIdx];
      // 一阶低通滤波器嵌套在反馈回路中（高频阻尼）
      filterStore = delayed * (1 - combDamp) + filterStore * combDamp;
      const sample = input[i] + filterStore * combFeedback;
      delayLine[writeIdx] = sample;
      combSums[i] += delayed;
      writeIdx = (writeIdx + 1) % delay;
    }
  }

  // 串联 2 路全通滤波器，增加反射密度
  const allpassDelays = [337, 113];
  const allpassFeedback = 0.5;
  let apBuffer1 = new Float32Array(allpassDelays[0]);
  let apBuffer2 = new Float32Array(allpassDelays[1]);
  let apIdx1 = 0, apIdx2 = 0;

  for (let i = 0; i < length; i++) {
    let sample = combSums[i];
    // 第一级全通
    const delayed1 = apBuffer1[apIdx1];
    const ap1 = delayed1 - allpassFeedback * sample;
    apBuffer1[apIdx1] = sample + allpassFeedback * ap1;
    sample = ap1 + delayed1 * allpassFeedback;
    apIdx1 = (apIdx1 + 1) % allpassDelays[0];

    // 第二级全通
    const delayed2 = apBuffer2[apIdx2];
    const ap2 = delayed2 - allpassFeedback * sample;
    apBuffer2[apIdx2] = sample + allpassFeedback * ap2;
    sample = ap2 + delayed2 * allpassFeedback;
    apIdx2 = (apIdx2 + 1) % allpassDelays[1];

    output[i] = input[i] * (1 - mix) + sample * mix * 0.25; // 梳状并联增益补偿
  }

  normalizeBuffer(output);
  return output;
}

/**
 * 合唱效果器（Chorus）。
 *
 * 通过多个时变延迟线（LFO 调制）模拟多乐器同时演奏的
 * 微小时间差与音高差，增加声音的厚度与温暖感。
 *
 * @param input - 输入信号
 * @param rateHz - LFO 速率（Hz），通常 0.5~2.0
 * @param depth - 调制深度（0~1），控制延迟变化范围
 * @param voices - 合唱声部数量（2~4），默认 3
 * @param mix - 干湿比（0~1）
 * @returns 合唱处理后的信号
 */
export function applyChorus(
  input: Float32Array,
  rateHz: number,
  depth: number,
  voices: number = 3,
  mix: number = 0.4
): Float32Array {
  const length = input.length;
  const output = new Float32Array(length);
  const maxDelaySamples = Math.floor(0.03 * SAMPLE_RATE); // 最大 30ms 延迟
  const delayLine = new Float32Array(maxDelaySamples + 1);
  let writeIdx = 0;

  // 为每个声部分配不同相位和速率的 LFO
  const voicePhases = [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3];
  const voiceDepths = [depth, depth * 0.85, depth * 1.1];

  for (let i = 0; i < length; i++) {
    const t = i / SAMPLE_RATE;
    delayLine[writeIdx] = input[i];

    let wet = 0;
    const activeVoices = Math.min(voices, 3);
    for (let v = 0; v < activeVoices; v++) {
      const lfo = Math.sin(2 * Math.PI * rateHz * t + voicePhases[v]);
      const delayAmt = (maxDelaySamples / 2) * (1 + lfo * voiceDepths[v]);
      const readPos = writeIdx - delayAmt;
      const idx0 = Math.floor(readPos) % delayLine.length;
      const idx1 = (idx0 + 1) % delayLine.length;
      const frac = readPos - Math.floor(readPos);
      const delayed = delayLine[(idx0 + delayLine.length) % delayLine.length] * (1 - frac)
                    + delayLine[(idx1 + delayLine.length) % delayLine.length] * frac;
      wet += delayed;
    }

    output[i] = input[i] * (1 - mix) + (wet / activeVoices) * mix;
    writeIdx = (writeIdx + 1) % delayLine.length;
  }

  return output;
}

/**
 * 三段参数均衡器（3-Band Parametric EQ）。
 *
 * 针对管弦乐混音常用频段进行 sculpting：
 * - 低频（Low）：80 Hz  shelving，控制底噪与温暖度
 * - 中频（Mid）：1200 Hz  peaking，控制木管与铜管清晰度
 * - 高频（High）：8000 Hz  shelving，控制弦乐空气感
 *
 * @param input - 输入信号
 * @param lowGain - 低频增益（dB，-12 ~ +12）
 * @param midGain - 中频增益（dB，-12 ~ +12）
 * @param highGain - 高频增益（dB，-12 ~ +12）
 * @returns 均衡后的信号
 */
export function applyParametricEQ(
  input: Float32Array,
  lowGain: number,
  midGain: number,
  highGain: number
): Float32Array {
  const output = new Float32Array(input.length);

  //  shelving / peaking 增益转换（线性近似）
  const lowAmp = Math.pow(10, clamp(lowGain, -12, 12) / 20);
  const midAmp = Math.pow(10, clamp(midGain, -12, 12) / 20);
  const highAmp = Math.pow(10, clamp(highGain, -12, 12) / 20);

  // 低频 shelving：一阶低通提取低频成分后放大
  const lowCutoff = 80;
  const rcLow = 1.0 / (2.0 * Math.PI * lowCutoff);
  const dt = 1.0 / SAMPLE_RATE;
  const alphaLow = dt / (rcLow + dt);
  let lowPass = 0;

  // 高频 shelving：一阶高通提取高频成分后放大
  const highCutoff = 8000;
  const rcHigh = 1.0 / (2.0 * Math.PI * highCutoff);
  const alphaHigh = dt / (rcHigh + dt);
  let highPassPrev = 0;
  let highPassOut = 0;

  // 中频 peaking：带通滤波器（简化实现：低通后的信号再高通）
  const midFc = 1200;
  const bw = 400;
  const midLowRC = 1.0 / (2.0 * Math.PI * (midFc - bw / 2));
  const midHighRC = 1.0 / (2.0 * Math.PI * (midFc + bw / 2));
  const alphaMidLow = dt / (midLowRC + dt);
  const alphaMidHigh = dt / (midHighRC + dt);
  let midLowPass = 0;
  let midHighPassPrev = 0;
  let midHighPassOut = 0;

  for (let i = 0; i < input.length; i++) {
    const x = input[i];

    // 低频通路
    lowPass = alphaLow * x + (1.0 - alphaLow) * lowPass;
    const lowComponent = lowPass;

    // 高频通路
    highPassOut = alphaHigh * (highPassOut + x - highPassPrev);
    highPassPrev = x;
    const highComponent = x - highPassOut; // 近似高通

    // 中频通路
    midLowPass = alphaMidLow * x + (1.0 - alphaMidLow) * midLowPass;
    const midHighPassResult = alphaMidHigh * (midHighPassOut + midLowPass - midHighPassPrev);
    midHighPassPrev = midLowPass;
    midHighPassOut = midHighPassResult;
    const midComponent = midLowPass - midHighPassOut;

    // 原始信号减去被提升/削减的频段，再叠加处理后的频段
    // 简化：直接按增益混合三段
    output[i] = lowComponent * lowAmp + midComponent * midAmp + highComponent * highAmp + (x - lowComponent - midComponent - highComponent);
  }

  normalizeBuffer(output);
  return output;
}

/**
 * 动态范围压缩器（Dynamic Range Compressor）。
 *
 * 用于控制管弦乐动态，防止峰值过载，
 * 同时提升弱音细节（类似管弦乐录音中的多段压缩）。
 *
 * @param input - 输入信号
 * @param threshold - 阈值（dB，相对于 0 dBFS），默认 -20
 * @param ratio - 压缩比（N:1），默认 4
 * @param attack - 起控时间（秒），默认 0.01
 * @param release - 释放时间（秒），默认 0.1
 * @param makeupGain - 补偿增益（dB），默认 3
 * @returns 压缩后的信号
 */
export function applyCompressor(
  input: Float32Array,
  threshold: number = -20,
  ratio: number = 4,
  attack: number = 0.01,
  release: number = 0.1,
  makeupGain: number = 3
): Float32Array {
  const output = new Float32Array(input.length);
  const attackCoeff = Math.exp(-1.0 / (attack * SAMPLE_RATE));
  const releaseCoeff = Math.exp(-1.0 / (release * SAMPLE_RATE));
  const thresholdLinear = Math.pow(10, threshold / 20);
  const makeupLinear = Math.pow(10, makeupGain / 20);
  let envelope = 0;

  for (let i = 0; i < input.length; i++) {
    const absX = Math.abs(input[i]);
    // 包络检波：峰值保持
    if (absX > envelope) {
      envelope = attackCoeff * (envelope - absX) + absX;
    } else {
      envelope = releaseCoeff * (envelope - absX) + absX;
    }

    // 计算增益衰减量
    let gain = 1.0;
    if (envelope > thresholdLinear) {
      const dbOver = Math.log10(envelope / thresholdLinear) * 20;
      const dbGainReduction = dbOver * (1.0 - 1.0 / ratio);
      gain = Math.pow(10, -dbGainReduction / 20);
    }

    output[i] = input[i] * gain * makeupLinear;
  }

  normalizeBuffer(output);
  return output;
}

/**
 * 空间声像扩展（Stereo Widening 模拟）。
 *
 * 虽然本模块输出单声道，但可以通过 Mid/Side 处理原理
 * 模拟声像宽度的变化，为后续立体声混音提供控制参数。
 *
 * @param input - 输入信号（单声道，视为 Mid）
 * @param width - 宽度（0 = 单声道，1 = 自然宽度，>1 = 超宽）
 * @returns 包含左右声道增益信息的对象，实际仍输出单声道和信号
 */
export function calculateStereoWidth(input: Float32Array, width: number): { leftGain: number; rightGain: number; mono: Float32Array } {
  const w = clamp(width, 0, 2);
  // Mid/Side 转 Left/Right：
  // L = Mid + Side, R = Mid - Side
  // 宽度控制 Side 的增益
  const sideGain = w * 0.5;
  const midGain = 1.0 - sideGain * 0.5;
  const leftGain = midGain + sideGain;
  const rightGain = midGain - sideGain;
  return { leftGain, rightGain, mono: new Float32Array(input) };
}

/**
 * 管弦乐齐奏一击（Orchestral Hit / Staccato Chord）。
 *
 * 模拟整支管弦乐队同时演奏一个短促和弦的标志性音效（如流行/电影配乐常见的 "orchestral hit"）。
 * 通过叠加弦乐、铜管和木管的短促 staccato 采样，并施加强力压缩和短混响得到。
 *
 * @param rootFreq - 和弦根音频率（Hz）
 * @param chordType - 和弦类型：'major' | 'minor' | 'diminished' | 'dominant7'
 * @param duration - 总时长（秒），通常 0.3~0.8
 * @param velocity - 力度（0~1）
 * @returns 齐奏波形
 */
export function synthesizeOrchestralHit(
  rootFreq: number,
  chordType: 'major' | 'minor' | 'diminished' | 'dominant7',
  duration: number = 0.5,
  velocity: number = 1.0
): Float32Array {
  const length = durationToSamples(duration);
  const output = new Float32Array(length);

  // 根据和弦类型确定频率比
  let ratios: number[];
  switch (chordType) {
    case 'minor':
      ratios = [1.0, Math.pow(2, 3 / 12), Math.pow(2, 7 / 12)];
      break;
    case 'diminished':
      ratios = [1.0, Math.pow(2, 3 / 12), Math.pow(2, 6 / 12)];
      break;
    case 'dominant7':
      ratios = [1.0, Math.pow(2, 4 / 12), Math.pow(2, 7 / 12), Math.pow(2, 10 / 12)];
      break;
    case 'major':
    default:
      ratios = [1.0, Math.pow(2, 4 / 12), Math.pow(2, 7 / 12)];
      break;
  }

  // 叠加各声部：低音弦乐 + 中音铜管 + 高音木管
  const voiceConfigs = [
    { instrument: 'cello', ratioIdx: 0, gain: 0.5, octave: -1 },
    { instrument: 'viola', ratioIdx: 0, gain: 0.35, octave: 0 },
    { instrument: 'violin', ratioIdx: 1, gain: 0.35, octave: 0 },
    { instrument: 'frenchHorn', ratioIdx: 1, gain: 0.4, octave: -1 },
    { instrument: 'trumpet', ratioIdx: 2, gain: 0.35, octave: 0 },
    { instrument: 'oboe', ratioIdx: 2, gain: 0.25, octave: 0 },
  ];

  for (const vc of voiceConfigs) {
    const freq = rootFreq * ratios[vc.ratioIdx] * Math.pow(2, vc.octave);
    if (freq < 30 || freq > 4000) continue;

    let voiceBuf: Float32Array;
    // 调用本模块已有的合成函数（简化参数）
    switch (vc.instrument) {
      case 'violin':
        voiceBuf = synthesizeViolin({ frequency: freq, duration, velocity: velocity * vc.gain, articulation: 'staccato', brightness: 0.8 });
        break;
      case 'viola':
        voiceBuf = synthesizeViola({ frequency: freq, duration, velocity: velocity * vc.gain, articulation: 'staccato', brightness: 0.6 });
        break;
      case 'cello':
        voiceBuf = synthesizeCello({ frequency: freq, duration, velocity: velocity * vc.gain, articulation: 'staccato', brightness: 0.5 });
        break;
      case 'frenchHorn':
        voiceBuf = synthesizeFrenchHorn({ frequency: freq, duration, velocity: velocity * vc.gain, articulation: 'staccato', brightness: 0.4 });
        break;
      case 'trumpet':
        voiceBuf = synthesizeTrumpet({ frequency: freq, duration, velocity: velocity * vc.gain, articulation: 'staccato', brightness: 0.8 });
        break;
      case 'oboe':
        voiceBuf = synthesizeOboe({ frequency: freq, duration, velocity: velocity * vc.gain, articulation: 'staccato', brightness: 0.6 });
        break;
      default:
        voiceBuf = new Float32Array(length);
    }

    for (let i = 0; i < Math.min(voiceBuf.length, length); i++) {
      output[i] += voiceBuf[i];
    }
  }

  // 施加强力压缩和短混响增强冲击力
  const compressed = applyCompressor(output, -24, 8, 0.001, 0.05, 6);
  const reverbed = applySchroederReverb(compressed, 0.3, 0.6, 0.25);

  normalizeBuffer(reverbed);
  return gain(reverbed, velocity);
}

/**
 * 分段 RMS 能量分析。
 *
 * 将缓冲区划分为若干段，计算每段的 RMS（均方根）能量，
 * 用于动态分析、自动增益控制或可视化。
 *
 * @param buffer - 输入信号
 * @param numSegments - 分段数量
 * @returns 每段的 RMS 值数组（0~1）
 */
export function analyzeSegmentedRMS(buffer: Float32Array, numSegments: number = 16): number[] {
  const segmentLength = Math.floor(buffer.length / numSegments);
  const result: number[] = [];
  for (let s = 0; s < numSegments; s++) {
    let sumSq = 0;
    const start = s * segmentLength;
    const end = Math.min(start + segmentLength, buffer.length);
    for (let i = start; i < end; i++) {
      sumSq += buffer[i] * buffer[i];
    }
    result.push(Math.sqrt(sumSq / (end - start)));
  }
  return result;
}

/**
 * 过零率（Zero Crossing Rate）计算。
 *
 * 用于区分音调性信号（低 ZCR）和噪声/打击乐（高 ZCR）。
 *
 * @param buffer - 输入信号
 * @returns 过零率（0~1）
 */
export function calculateZeroCrossingRate(buffer: Float32Array): number {
  if (buffer.length < 2) return 0;
  let crossings = 0;
  for (let i = 1; i < buffer.length; i++) {
    if ((buffer[i] >= 0) !== (buffer[i - 1] >= 0)) {
      crossings++;
    }
  }
  return crossings / (buffer.length - 1);
}

/**
 * 缓冲区切片（时间域）。
 *
 * @param buffer - 原始缓冲区
 * @param startSec - 起始时间（秒）
 * @param endSec - 结束时间（秒）
 * @returns 切片后的新缓冲区
 */
export function sliceBuffer(buffer: Float32Array, startSec: number, endSec: number): Float32Array {
  const startIdx = Math.max(0, Math.floor(startSec * SAMPLE_RATE));
  const endIdx = Math.min(buffer.length, Math.floor(endSec * SAMPLE_RATE));
  return buffer.subarray(startIdx, endIdx) as Float32Array;
}

/**
 * 拼接多个缓冲区。
 *
 * @param buffers - 缓冲区数组
 * @returns 拼接后的长缓冲区
 */
export function concatBuffers(buffers: Float32Array[]): Float32Array {
  const totalLength = buffers.reduce((sum, b) => sum + b.length, 0);
  const out = new Float32Array(totalLength);
  let offset = 0;
  for (const b of buffers) {
    out.set(b, offset);
    offset += b.length;
  }
  return out;
}

export type OrchestralInstrumentName = typeof ORCHESTRAL_INSTRUMENTS[number];
