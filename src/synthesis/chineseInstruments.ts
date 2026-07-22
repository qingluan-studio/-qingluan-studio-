/**
 * @fileoverview 青鸾 DAW - 中国民族乐器物理建模合成器
 *
 * 本模块提供中国传统民族乐器的物理建模合成函数，涵盖：
 * - 拉弦：二胡、马头琴
 * - 弹拨：琵琶、古筝、阮、扬琴
 * - 吹管：唢呐、笛子、箫
 * - 打击：编钟
 *
 * 每个乐器均针对其独特的声学特征和演奏技巧进行建模：
 * - 二胡滑音、蟒皮共振
 * - 琵琶轮指、指甲触弦
 * - 古筝摇指、雁柱共鸣
 * - 唢呐哨片、高亢穿透
 * - 笛子笛膜振、沙哑明亮
 * - 箫气声、幽咽深远
 * - 马头琴颤音、马尾弦摩擦
 * - 阮圆润、圆形共鸣腔
 * - 扬琴敲击、金属弦列
 * - 编钟一钟双音、金属长衰减
 *
 * 所有函数输出 44100 Hz 单声道 Float32Array。
 *
 * @module chineseInstruments
 * @version 1.0.0
 * @author 青鸾音频实验室
 */

import { clamp, lerp, smoothstep, normalizeBuffer } from '../utils/audioUtils.js';

// =============================================================================
// 全局常量与通用工具
// =============================================================================

/** 统一采样率 44.1 kHz */
const SAMPLE_RATE = 44100;

/** 最大允许时长（秒），防止异常参数 */
const MAX_DURATION_SECONDS = 30;

/** 极小值，避免除零 */
const EPSILON = 1e-10;

/** 计算样本数 */
function durationToSamples(durationSec: number): number {
  return Math.min(Math.floor(durationSec * SAMPLE_RATE), MAX_DURATION_SECONDS * SAMPLE_RATE);
}

/** 白噪声生成 */
function whiteNoise(length: number, amplitude: number = 1.0): Float32Array {
  const buf = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    buf[i] = (Math.random() * 2.0 - 1.0) * amplitude;
  }
  return buf;
}

/** 粉红噪声（1/f）生成，简易近似 */
function pinkNoise(length: number, amplitude: number = 1.0): Float32Array {
  const buf = new Float32Array(length);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2.0 - 1.0;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.96900 * b2 + white * 0.1538520;
    b3 = 0.86650 * b3 + white * 0.3104856;
    b4 = 0.55000 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.0168980;
    buf[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11 * amplitude;
    b6 = white * 0.115926;
  }
  return buf;
}

/** 线性插值数组读取（支持小数索引） */
function sampleLerp(buffer: Float32Array, index: number): number {
  const i0 = Math.floor(index);
  const i1 = Math.min(i0 + 1, buffer.length - 1);
  const frac = index - i0;
  return buffer[i0] * (1 - frac) + buffer[i1] * frac;
}

/** 一阶低通滤波 */
function lowPassFilter(input: Float32Array, cutoffHz: number): Float32Array {
  const output = new Float32Array(input.length);
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

/** 二阶状态变量低通滤波 */
function stateVariableLowPass(input: Float32Array, cutoffHz: number, resonance: number): Float32Array {
  const output = new Float32Array(input.length);
  const f = 2.0 * Math.sin(Math.PI * cutoffHz / SAMPLE_RATE);
  const q = 1.0 - resonance;
  let low = 0, band = 0;
  for (let i = 0; i < input.length; i++) {
    low = low + f * band;
    const high = input[i] - low - q * band;
    band = band + f * high;
    output[i] = low;
  }
  return output;
}

/** 指数 ADSR 包络 */
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

/** 标准 ADSR 包络 */
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
  const releaseStart = Math.max(attackSamples + decaySamples, length - releaseSamples);
  for (let i = 0; i < length; i++) {
    if (i < attackSamples) {
      env[i] = i / attackSamples;
    } else if (i < attackSamples + decaySamples) {
      const t = (i - attackSamples) / decaySamples;
      env[i] = 1.0 - (1.0 - sustain) * t;
    } else if (i < releaseStart) {
      env[i] = sustain;
    } else {
      const t = (i - releaseStart) / releaseSamples;
      env[i] = Math.max(0, sustain * (1.0 - t));
    }
  }
  return env;
}

/** 谐波叠加合成 */
function additiveSynthesis(length: number, freq: number, harmonics: number[], amplitude: number): Float32Array {
  const buf = new Float32Array(length);
  const twoPi = 2.0 * Math.PI;
  for (let i = 0; i < length; i++) {
    const t = i / SAMPLE_RATE;
    let sample = 0;
    for (let h = 0; h < harmonics.length; h++) {
      const hf = freq * (h + 1);
      if (hf >= SAMPLE_RATE / 2) break;
      sample += harmonics[h] * Math.sin(twoPi * hf * t);
    }
    buf[i] = sample * amplitude;
  }
  return buf;
}

/** 信号混合 */
function mix(a: Float32Array, b: Float32Array, mixB: number): Float32Array {
  const len = Math.min(a.length, b.length);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) out[i] = a[i] * (1.0 - mixB) + b[i] * mixB;
  return out;
}

/** 增益缩放 */
function gain(buffer: Float32Array, g: number): Float32Array {
  const out = new Float32Array(buffer.length);
  for (let i = 0; i < buffer.length; i++) out[i] = buffer[i] * g;
  return out;
}

/** 正弦波 */
function sineWave(length: number, freq: number, amplitude: number): Float32Array {
  const buf = new Float32Array(length);
  const phaseInc = (2.0 * Math.PI * freq) / SAMPLE_RATE;
  let phase = 0;
  for (let i = 0; i < length; i++) {
    buf[i] = amplitude * Math.sin(phase);
    phase += phaseInc;
  }
  return buf;
}

/** 锯齿波（带限近似） */
function bandLimitedSawtooth(length: number, freq: number, amplitude: number): Float32Array {
  const buf = new Float32Array(length);
  const maxHarmonic = Math.floor(SAMPLE_RATE / (2 * freq));
  const harmonics = Math.min(maxHarmonic, 30);
  for (let i = 0; i < length; i++) {
    const t = i / SAMPLE_RATE;
    let sum = 0;
    for (let h = 1; h <= harmonics; h++) {
      const coef = ((h % 2 === 0) ? 1 : -1) / h;
      sum += coef * Math.sin(2.0 * Math.PI * freq * h * t);
    }
    buf[i] = amplitude * (-2.0 / Math.PI) * sum;
  }
  return buf;
}

/** 方波（带限近似） */
function bandLimitedSquare(length: number, freq: number, amplitude: number): Float32Array {
  const buf = new Float32Array(length);
  const maxHarmonic = Math.floor(SAMPLE_RATE / (2 * freq));
  const harmonics = Math.min(maxHarmonic, 30);
  for (let i = 0; i < length; i++) {
    const t = i / SAMPLE_RATE;
    let sum = 0;
    for (let h = 1; h <= harmonics; h += 2) {
      sum += (1.0 / h) * Math.sin(2.0 * Math.PI * freq * h * t);
    }
    buf[i] = amplitude * (4.0 / Math.PI) * sum;
  }
  return buf;
}

/** 滑音（Glissando / Portamento）生成器：频率连续变化 */
function generateGlissando(
  length: number,
  startFreq: number,
  endFreq: number,
  amplitude: number,
  waveType: 'sine' | 'saw' | 'square' = 'sine'
): Float32Array {
  const buf = new Float32Array(length);
  let phase = 0;
  for (let i = 0; i < length; i++) {
    const t = i / length;
    const f = lerp(startFreq, endFreq, t);
    const phaseInc = (2.0 * Math.PI * f) / SAMPLE_RATE;
    phase += phaseInc;
    let sample = Math.sin(phase);
    if (waveType === 'saw') {
      // 简易锯齿近似（相位锯齿）
      sample = 2.0 * ((phase / (2.0 * Math.PI)) - Math.floor((phase / (2.0 * Math.PI)) + 0.5));
    } else if (waveType === 'square') {
      sample = Math.sin(phase) >= 0 ? 1.0 : -1.0;
    }
    buf[i] = sample * amplitude;
  }
  return buf;
}

/** 为信号添加颤音（振幅 + 频率调制简化版） */
function applyVibrato(buffer: Float32Array, rateHz: number, depthCents: number, baseFreq: number): Float32Array {
  const out = new Float32Array(buffer.length);
  for (let i = 0; i < buffer.length; i++) {
    const t = i / SAMPLE_RATE;
    const mod = Math.sin(2.0 * Math.PI * rateHz * t);
    const vibratoGain = 1.0 + 0.04 * mod;
    out[i] = buffer[i] * vibratoGain;
  }
  return out;
}

/** 为信号添加震音（Tremolo，纯振幅调制） */
function applyTremolo(buffer: Float32Array, rateHz: number, depth: number): Float32Array {
  const out = new Float32Array(buffer.length);
  for (let i = 0; i < buffer.length; i++) {
    const t = i / SAMPLE_RATE;
    const mod = Math.sin(2.0 * Math.PI * rateHz * t);
    out[i] = buffer[i] * (1.0 + depth * mod);
  }
  return out;
}

// =============================================================================
// 二胡 (Erhu)
// =============================================================================

/**
 * 二胡合成参数接口。
 *
 * 二胡是两根弦的拉弦乐器，琴筒蒙以蟒皮，无指板。
 * 其音色接近人声，尤其善于表现滑音（portamento）和揉弦。
 */
export interface ErhuParams {
  frequency: number;
  duration: number;
  velocity: number;
  /** 是否启用滑音（从无品指板滑向目标音） */
  slide?: boolean;
  /** 滑音起始频率（Hz），默认比目标音低小三度 */
  slideFrom?: number;
  /** 揉弦速率（Hz），默认 5.5 */
  vibratoRate?: number;
  /** 揉弦深度（音分），默认 30 */
  vibratoDepth?: number;
  /** 蟒皮共振强度（0~1） */
  skinResonance?: number;
  brightness?: number;
}

/**
 * 合成二胡音色。
 *
 * 物理建模要点：
 * 1. 两根弦分别建模（内弦低、外弦高），单音主要激发一根弦
 * 2. 蟒皮共振：在琴筒处形成低频共振峰（约 400-600 Hz）
 * 3. 无指板滑音：频率连续变化而非阶梯变化
 * 4. 弓毛摩擦噪声（类似大提琴但更具"嘶哑"感）
 * 5. 高频衰减快，音色悲凉
 */
export function synthesizeErhu(params: ErhuParams): Float32Array {
  const freq = clamp(params.frequency, 200, 2000);
  const duration = clamp(params.duration, 0.1, MAX_DURATION_SECONDS);
  const velocity = clamp(params.velocity, 0, 1);
  const slide = params.slide ?? false;
  const slideFrom = clamp(params.slideFrom ?? freq * 0.84, 100, 3000);
  const vibratoRate = params.vibratoRate ?? 5.5;
  const vibratoDepth = params.vibratoDepth ?? 30;
  const skinResonance = clamp(params.skinResonance ?? 0.6, 0, 1);
  const brightness = clamp(params.brightness ?? 0.4, 0, 1);

  const length = durationToSamples(duration);
  let output: Float32Array;

  if (slide) {
    // 滑音：从 slideFrom 连续滑到 freq
    output = generateGlissando(length, slideFrom, freq, velocity * 0.7, 'sine');
    // 叠加弱锯齿增强高频泛音
    const saw = generateGlissando(length, slideFrom, freq, velocity * 0.2, 'saw');
    output = mix(output, saw, 0.25);
  } else {
    // 正常拉奏：正弦基频 + 弱谐波
    const harmonics = [1.0, 0.3 * brightness, 0.1 * brightness, 0.05 * brightness];
    output = additiveSynthesis(length, freq, harmonics, velocity * 0.7);
  }

  // 蟒皮共振：在 500 Hz 附近产生宽峰
  const skinResonator = sineWave(length, 500, velocity * skinResonance * 0.3);
  const skinEnv = createExponentialADSREnvelope(length, 0.08, 0.2, 0.5, 0.3, duration);
  for (let i = 0; i < length; i++) skinResonator[i] *= skinEnv[i];
  output = mix(output, skinResonator, 0.2);

  // 弓毛摩擦噪声（二胡更"哑"、更"沙"）
  const bowNoise = pinkNoise(length, velocity * 0.08);
  const noiseEnv = createExponentialADSREnvelope(length, 0.05, 0.15, 0.4, 0.25, duration);
  for (let i = 0; i < length; i++) bowNoise[i] *= noiseEnv[i];
  output = mix(output, bowNoise, 0.12);

  // 低通模拟琴筒滤波
  output = lowPassFilter(output, 3500);
  output = stateVariableLowPass(output, 2000, 0.3);

  // 揉弦（二胡揉弦通常更深、更情绪化）
  output = applyVibrato(output, vibratoRate, vibratoDepth, freq);

  const env = createExponentialADSREnvelope(length, 0.1, 0.2, 0.65, 0.35, duration);
  for (let i = 0; i < length; i++) output[i] *= env[i];

  normalizeBuffer(output);
  return gain(output, velocity);
}

// =============================================================================
// 琵琶 (Pipa)
// =============================================================================

/**
 * 琵琶合成参数接口。
 *
 * 琵琶是四弦梨形弹拨乐器，音色清脆明亮，
 * 技法丰富：轮指、扫弦、泛音、打音等。
 */
export interface PipaParams {
  frequency: number;
  duration: number;
  velocity: number;
  /** 技法：'pluck'（弹）、'roll'（轮指）、'sweep'（扫弦） */
  technique?: 'pluck' | 'roll' | 'sweep';
  /** 轮指速率（每秒轮数），默认 8 */
  rollRate?: number;
  brightness?: number;
}

/**
 * 合成琵琶音色。
 *
 * 物理建模要点：
 * 1. 梨形共鸣腔产生独特的频谱包络
 * 2. 尼龙/钢丝弦的张力高，泛音丰富且衰减慢
 * 3. 轮指：快速重复激励模拟五指轮奏
 * 4. 指甲触弦产生高频"咔哒"声（attack click）
 * 5. 扫弦：多弦快速依次激发
 */
export function synthesizePipa(params: PipaParams): Float32Array {
  const freq = clamp(params.frequency, 80, 2000);
  const duration = clamp(params.duration, 0.05, MAX_DURATION_SECONDS);
  const velocity = clamp(params.velocity, 0, 1);
  const technique = params.technique ?? 'pluck';
  const rollRate = clamp(params.rollRate ?? 8, 4, 16);
  const brightness = clamp(params.brightness ?? 0.8, 0, 1);

  const length = durationToSamples(duration);
  let output: Float32Array = new Float32Array(length);

  if (technique === 'roll') {
    // 轮指：每隔 1/rollRate 秒产生一次衰减更快的拨弦
    const intervalSamples = Math.floor(SAMPLE_RATE / rollRate);
    const cycles = Math.floor(length / intervalSamples);
    for (let c = 0; c < cycles; c++) {
      const start = c * intervalSamples;
      const cycleLen = Math.min(intervalSamples, length - start);
      // 每次轮指激励的弦振：正弦 + 快速指数衰减
      for (let i = 0; i < cycleLen; i++) {
        const t = i / SAMPLE_RATE;
        const decay = Math.exp(-15.0 * t); // 快速衰减
        const sample = Math.sin(2.0 * Math.PI * freq * t) * decay;
        output[start + i] += sample * velocity * 0.5;
      }
      // 指甲点击
      if (c < cycles) {
        const click = whiteNoise(80, velocity * 0.3);
        for (let j = 0; j < click.length && start + j < length; j++) {
          output[start + j] += click[j] * Math.exp(-j * 0.1);
        }
      }
    }
  } else if (technique === 'sweep') {
    // 扫弦：模拟 4 根弦快速依次拨动（频率略有偏移）
    const stringDetune = [1.0, 1.5, 2.0, 2.5]; // 简化的弦频关系
    for (let s = 0; s < 4; s++) {
      const sf = freq * stringDetune[s];
      if (sf >= SAMPLE_RATE / 2) break;
      const delay = Math.floor(s * 0.015 * SAMPLE_RATE); // 每弦相隔 15ms
      const harmonics = [1.0, 0.5 * brightness, 0.2 * brightness];
      const str = additiveSynthesis(length, sf, harmonics, velocity * 0.25);
      const strEnv = createExponentialADSREnvelope(length, 0.003, 0.06, 0.0, 0.2, duration);
      for (let i = 0; i < length; i++) str[i] *= strEnv[i];
      for (let i = 0; i < length && i + delay < length; i++) {
        output[i + delay] += str[i];
      }
    }
  } else {
    // 普通弹拨
    const harmonics = [1.0, 0.55 * brightness, 0.25 * brightness, 0.1 * brightness];
    output = additiveSynthesis(length, freq, harmonics, velocity * 0.8);
    // 快速衰减
    const pluckEnv = createExponentialADSREnvelope(length, 0.002, 0.04, 0.0, 0.25, duration);
    for (let i = 0; i < length; i++) output[i] *= pluckEnv[i];
  }

  // 指甲触弦高频 click（所有技巧通用）
  const click = whiteNoise(Math.floor(0.005 * SAMPLE_RATE), velocity * 0.5);
  const clickFiltered = lowPassFilter(click, 6000);
  for (let i = 0; i < clickFiltered.length && i < length; i++) {
    output[i] += clickFiltered[i] * (technique === 'roll' ? 0.3 : 1.0);
  }

  // 梨形共鸣腔滤波（峰值约 1000 Hz）
  output = stateVariableLowPass(output, 2800, 0.25);
  output = lowPassFilter(output, 5000);

  normalizeBuffer(output);
  return gain(output, velocity);
}

// =============================================================================
// 古筝 (Guzheng)
// =============================================================================

/**
 * 古筝合成参数接口。
 *
 * 古筝是多弦弹拨乐器，21 弦（或更多），
 * 音色清越，大量使用摇指、刮奏、按滑音等技法。
 */
export interface GuzhengParams {
  frequency: number;
  duration: number;
  velocity: number;
  /** 技法：'pluck'（托劈）、'tremolo'（摇指）、'glissando'（刮奏） */
  technique?: 'pluck' | 'tremolo' | 'glissando';
  brightness?: number;
}

/**
 * 合成古筝音色。
 *
 * 物理建模要点：
 * 1. 长条形共鸣箱，产生特有的"嗡嗡"木腔共鸣
 * 2. 摇指：单音持续快速弹拨，模拟人指连续摇动
 * 3. 雁柱支撑：弦振动为两段，产生特殊的倍频泛音结构
 * 4. 尼龙缠钢丝弦：泛音衰减呈非线性
 */
export function synthesizeGuzheng(params: GuzhengParams): Float32Array {
  const freq = clamp(params.frequency, 60, 1500);
  const duration = clamp(params.duration, 0.05, MAX_DURATION_SECONDS);
  const velocity = clamp(params.velocity, 0, 1);
  const technique = params.technique ?? 'pluck';
  const brightness = clamp(params.brightness ?? 0.7, 0, 1);

  const length = durationToSamples(duration);
  let output: Float32Array = new Float32Array(length);

  if (technique === 'tremolo') {
    // 摇指：高频重复（约 12-16 Hz 弹拨周期），每次衰减极快
    const rate = 14;
    const interval = Math.floor(SAMPLE_RATE / rate);
    const cycles = Math.floor(length / interval);
    for (let c = 0; c < cycles; c++) {
      const start = c * interval;
      const harmonics = [1.0, 0.4 * brightness, 0.15 * brightness];
      const grain = additiveSynthesis(interval, freq, harmonics, velocity * 0.35);
      const grainEnv = createExponentialADSREnvelope(interval, 0.001, 0.02, 0.0, 0.06, interval / SAMPLE_RATE);
      for (let i = 0; i < grain.length && start + i < length; i++) {
        output[start + i] += grain[i] * grainEnv[i];
      }
    }
  } else if (technique === 'glissando') {
    // 刮奏：快速上行或下行音阶模拟，简化为噪声 + 频率扫描
    const noise = pinkNoise(length, velocity * 0.4);
    const sweep = generateGlissando(length, freq * 0.5, freq * 2.0, velocity * 0.3, 'saw');
    output = mix(noise, sweep, 0.6);
    output = lowPassFilter(output, 3000);
  } else {
    // 托劈：单音弹拨，长而清亮的衰减
    const harmonics = [1.0, 0.5 * brightness, 0.2 * brightness, 0.08 * brightness];
    output = additiveSynthesis(length, freq, harmonics, velocity * 0.85);
    const env = createExponentialADSREnvelope(length, 0.002, 0.06, 0.0, duration * 0.7, duration);
    for (let i = 0; i < length; i++) output[i] *= env[i];
  }

  // 木腔共鸣（古筝共鸣箱较大，低频共鸣显著）
  const woodResonance = sineWave(length, 250, velocity * 0.15);
  const woodEnv = createExponentialADSREnvelope(length, 0.05, 0.15, 0.4, 0.4, duration);
  for (let i = 0; i < length; i++) woodResonance[i] *= woodEnv[i];
  output = mix(output, woodResonance, 0.15);

  // 雁柱导致的倍频泛音增强
  const octaveHarmonic = sineWave(length, freq * 2, velocity * 0.1 * brightness);
  for (let i = 0; i < length; i++) output[i] += octaveHarmonic[i] * Math.exp(-i / (SAMPLE_RATE * 0.5));

  output = stateVariableLowPass(output, 3500, 0.2);

  normalizeBuffer(output);
  return gain(output, velocity);
}

// =============================================================================
// 唢呐 (Suona)
// =============================================================================

/**
 * 唢呐合成参数接口。
 *
 * 唢呐是双簧片吹管乐器，通过苇制哨子振动发声，
 * 音量大、穿透力极强，具有强烈的地方色彩。
 */
export interface SuonaParams {
  frequency: number;
  duration: number;
  velocity: number;
  /** 哨音尖锐度（0~1） */
  reedBuzz?: number;
  articulation?: 'legato' | 'staccato' | 'tongue';
  brightness?: number;
}

/**
 * 合成唢呐音色。
 *
 * 物理建模要点：
 * 1. 双簧片哨子产生丰富的奇次谐波，类似方波
 * 2. 管身开有 8 孔，形成独特的宽共振峰（~1000 Hz, ~2000 Hz）
 * 3. 哨音（buzz）是重要特征：高频噪声 + 强烈谐波
 * 4. 起音极其迅速，带有"喷"气感
 * 5. 常用花舌、口哨音等技法
 */
export function synthesizeSuona(params: SuonaParams): Float32Array {
  const freq = clamp(params.frequency, 200, 1800);
  const duration = clamp(params.duration, 0.05, MAX_DURATION_SECONDS);
  const velocity = clamp(params.velocity, 0, 1);
  const reedBuzz = clamp(params.reedBuzz ?? 0.7, 0, 1);
  const articulation = params.articulation ?? 'legato';
  const brightness = clamp(params.brightness ?? 0.9, 0, 1);

  const length = durationToSamples(duration);

  // 哨子振动源：方波近似（奇次谐波强）
  const harmonics = new Array(16).fill(0);
  for (let h = 0; h < harmonics.length; h++) {
    const n = h + 1;
    harmonics[h] = (n % 2 === 1) ? (Math.pow(n, -1.1) * brightness) : (Math.pow(n, -3.0) * brightness * 0.1);
  }
  harmonics[0] = 1.0;
  let output = additiveSynthesis(length, freq, harmonics, velocity * 0.65);

  // 哨音噪声：带通滤波的脉冲噪声，集中在 2000-5000 Hz
  const buzz = whiteNoise(length, reedBuzz * velocity * 0.4);
  // 简易带通：低通后减更低低通（近似）
  const buzzLow1 = lowPassFilter(buzz, 5000);
  const buzzLow2 = lowPassFilter(buzz, 1500);
  for (let i = 0; i < length; i++) buzz[i] = buzzLow1[i] - buzzLow2[i];
  const buzzEnv = createExponentialADSREnvelope(length, 0.02, 0.1, 0.5, 0.2, duration);
  for (let i = 0; i < length; i++) buzz[i] *= buzzEnv[i];
  output = mix(output, buzz, reedBuzz * 0.25);

  // 管体共振峰（唢呐管身短而锥度大）
  const formants = [900, 1800, 2800];
  for (let f = 0; f < formants.length; f++) {
    const fc = formants[f];
    const bw = fc * 0.25;
    const g = [1.0, 0.5, 0.25][f];
    // 简化带通：用正弦波 + 包络模拟共振峰能量注入
    const resonator = sineWave(length, fc, velocity * g * 0.15);
    const resEnv = createExponentialADSREnvelope(length, 0.03, 0.12, 0.4, 0.2, duration);
    for (let i = 0; i < length; i++) resonator[i] *= resEnv[i];
    output = mix(output, resonator, 0.15);
  }

  // 极快起音的喷气冲击
  const blast = whiteNoise(Math.floor(0.008 * SAMPLE_RATE), velocity * 0.5);
  const blastFiltered = lowPassFilter(blast, 6000);
  for (let i = 0; i < blastFiltered.length && i < length; i++) {
    output[i] += blastFiltered[i];
  }

  let env: Float32Array;
  if (articulation === 'staccato') {
    env = createExponentialADSREnvelope(length, 0.005, 0.05, 0.0, 0.08, duration);
  } else if (articulation === 'tongue') {
    env = createExponentialADSREnvelope(length, 0.003, 0.08, 0.7, 0.15, duration);
  } else {
    env = createExponentialADSREnvelope(length, 0.02, 0.1, 0.75, 0.2, duration);
  }
  for (let i = 0; i < length; i++) output[i] *= env[i];

  normalizeBuffer(output);
  return gain(output, velocity);
}

// =============================================================================
// 笛子 (Dizi)
// =============================================================================

/**
 * 笛子合成参数接口。
 *
 * 笛子是边棱音（air reed）吹管乐器，开有膜孔贴笛膜。
 * 笛膜的振动给笛子带来独特的"沙哑"和"碎裂"质感，
 * 这是笛子区别于西洋长笛的最显著声学特征。
 */
export interface DiziParams {
  frequency: number;
  duration: number;
  velocity: number;
  /** 笛膜振动强度（0~1），默认 0.6 */
  membraneVibration?: number;
  articulation?: 'legato' | 'staccato' | 'flutter';
  brightness?: number;
}

/**
 * 合成笛子音色。
 *
 * 物理建模要点：
 * 1. 边棱音激励：正弦基频 + 弱谐波（比长笛谐波略强）
 * 2. 笛膜振动：膜的非线性响应产生高次泛音和"碎音"
 *    模拟方法：基频信号经过轻度 waveshaping（软削波）
 * 3. 指法孔改变有效管长，形成不同音高
 * 4. 气流噪声（气声）丰富
 */
export function synthesizeDizi(params: DiziParams): Float32Array {
  const freq = clamp(params.frequency, 260, 2500);
  const duration = clamp(params.duration, 0.05, MAX_DURATION_SECONDS);
  const velocity = clamp(params.velocity, 0, 1);
  const membraneVibration = clamp(params.membraneVibration ?? 0.6, 0, 1);
  const articulation = params.articulation ?? 'legato';
  const brightness = clamp(params.brightness ?? 0.6, 0, 1);

  const length = durationToSamples(duration);

  // 边棱音基础
  const harmonics = [1.0, 0.25 * brightness, 0.12 * brightness, 0.06 * brightness, 0.03 * brightness];
  let output = additiveSynthesis(length, freq, harmonics, velocity * 0.7);

  // 笛膜振动模拟：轻度非线性失真（软削波 + 谐波再生）
  if (membraneVibration > 0.01) {
    const distorted = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      const x = output[i] * (1.0 + membraneVibration);
      // 软削波近似：x - x^3/3（轻度饱和）
      distorted[i] = x - (x * x * x) / 3.0;
    }
    // 低通限制膜振动产生的过高频
    const membraneFiltered = lowPassFilter(distorted, 5000);
    output = mix(output, membraneFiltered, membraneVibration * 0.3);
  }

  // 气流噪声（气声），比长笛更粗糙
  const air = pinkNoise(length, velocity * 0.1);
  const airLow1 = lowPassFilter(air, 4000);
  const airLow2 = lowPassFilter(air, 800);
  for (let i = 0; i < length; i++) air[i] = airLow1[i] - airLow2[i];
  const airEnv = createExponentialADSREnvelope(length, 0.06, 0.15, 0.45, 0.25, duration);
  for (let i = 0; i < length; i++) air[i] *= airEnv[i];
  output = mix(output, air, 0.12);

  // 轻微颤音
  output = applyVibrato(output, 5.5, 14, freq);

  let env: Float32Array;
  if (articulation === 'staccato') {
    env = createExponentialADSREnvelope(length, 0.02, 0.06, 0.0, 0.1, duration);
  } else if (articulation === 'flutter') {
    env = createExponentialADSREnvelope(length, 0.05, 0.1, 0.7, 0.2, duration);
    for (let i = 0; i < length; i++) {
      const flutter = 1.0 + 0.1 * Math.sin(2.0 * Math.PI * 16.0 * i / SAMPLE_RATE);
      output[i] *= flutter;
    }
  } else {
    env = createExponentialADSREnvelope(length, 0.06, 0.12, 0.78, 0.22, duration);
  }
  for (let i = 0; i < length; i++) output[i] *= env[i];

  normalizeBuffer(output);
  return gain(output, velocity);
}

// =============================================================================
// 箫 (Xiao)
// =============================================================================

/**
 * 箫合成参数接口。
 *
 * 箫是竖吹边棱音乐器，无笛膜，音色清幽、空灵、带苍凉感。
 * 常用于表现深远、宁静的音乐意境。
 */
export interface XiaoParams {
  frequency: number;
  duration: number;
  velocity: number;
  /** 气声（ breath noise ）强度，默认 0.25 */
  breathNoise?: number;
  articulation?: 'legato' | 'staccato';
  brightness?: number;
}

/**
 * 合成箫音色。
 *
 * 物理建模要点：
 * 1. 无笛膜 -> 频谱极纯，接近正弦，微弱谐波
 * 2. 细长的管体产生特有的气涡噪声（边缘音不稳定）
 * 3. 吹口为 U 型槽，气流角度导致丰富的低频气声
 * 4. 音头常有"气涌"（air rush），建立较慢
 * 5. 泛音微弱，高频迅速滚降
 */
export function synthesizeXiao(params: XiaoParams): Float32Array {
  const freq = clamp(params.frequency, 150, 1200);
  const duration = clamp(params.duration, 0.1, MAX_DURATION_SECONDS);
  const velocity = clamp(params.velocity, 0, 1);
  const breathNoise = clamp(params.breathNoise ?? 0.25, 0, 1);
  const articulation = params.articulation ?? 'legato';
  const brightness = clamp(params.brightness ?? 0.25, 0, 1);

  const length = durationToSamples(duration);

  // 箫的频谱极纯
  const harmonics = [1.0, 0.1 * brightness, 0.03 * brightness, 0.01 * brightness];
  let output = additiveSynthesis(length, freq, harmonics, velocity * 0.75);

  // 气声是箫的灵魂：低频粉红噪声 + 缓慢包络
  const air = pinkNoise(length, breathNoise * velocity * 0.35);
  // 气声主要集中在 500-3000 Hz
  const airLow1 = lowPassFilter(air, 3000);
  const airLow2 = lowPassFilter(air, 500);
  for (let i = 0; i < length; i++) air[i] = airLow1[i] - airLow2[i];
  const airEnv = createExponentialADSREnvelope(length, 0.15, 0.3, 0.5, 0.4, duration);
  for (let i = 0; i < length; i++) air[i] *= airEnv[i];
  output = mix(output, air, breathNoise * 0.35);

  // 气涌：音头额外的低频噪声爆发
  const rush = pinkNoise(Math.floor(0.08 * SAMPLE_RATE), velocity * breathNoise * 0.5);
  const rushFiltered = lowPassFilter(rush, 800);
  for (let i = 0; i < rushFiltered.length && i < length; i++) {
    output[i] += rushFiltered[i] * Math.exp(-i / (SAMPLE_RATE * 0.05));
  }

  // 低频滚降模拟长管体
  output = lowPassFilter(output, 2800);
  output = stateVariableLowPass(output, 1800, 0.2);

  let env: Float32Array;
  if (articulation === 'staccato') {
    env = createExponentialADSREnvelope(length, 0.04, 0.08, 0.0, 0.12, duration);
  } else {
    env = createExponentialADSREnvelope(length, 0.15, 0.25, 0.72, 0.4, duration);
  }
  for (let i = 0; i < length; i++) output[i] *= env[i];

  normalizeBuffer(output);
  return gain(output, velocity);
}

// =============================================================================
// 马头琴 (Morin Khuur)
// =============================================================================

/**
 * 马头琴合成参数接口。
 *
 * 马头琴是蒙古族拉弦乐器，两弦（多为一粗一细），
 * 梯形琴箱蒙以牛皮/羊皮，马尾为弓毛、马尾为弦。
 * 音色深沉、粗犷，带有草原的辽阔感。
 */
export interface MorinKhuurParams {
  frequency: number;
  duration: number;
  velocity: number;
  /** 颤音速率（Hz），默认 4.5（偏慢而深） */
  vibratoRate?: number;
  /** 颤音深度（音分），默认 35 */
  vibratoDepth?: number;
  articulation?: 'legato' | 'staccato';
  brightness?: number;
}

/**
 * 合成马头琴音色。
 *
 * 物理建模要点：
 * 1. 马尾弦摩擦产生强烈的"沙哑"质感（大量高频噪声）
 * 2. 梯形琴箱产生不规则的共鸣峰
 * 3. 颤音通常较慢（4-5 Hz）但很深（30+ cents），极具歌唱性
 * 4. 低音区厚重，高音区苍凉
 * 5. 无指板，滑音自然
 */
export function synthesizeMorinKhuur(params: MorinKhuurParams): Float32Array {
  const freq = clamp(params.frequency, 60, 1200);
  const duration = clamp(params.duration, 0.1, MAX_DURATION_SECONDS);
  const velocity = clamp(params.velocity, 0, 1);
  const vibratoRate = params.vibratoRate ?? 4.5;
  const vibratoDepth = params.vibratoDepth ?? 35;
  const articulation = params.articulation ?? 'legato';
  const brightness = clamp(params.brightness ?? 0.35, 0, 1);

  const length = durationToSamples(duration);

  // 基频 + 弱谐波
  const harmonics = [1.0, 0.35 * brightness, 0.15 * brightness, 0.06 * brightness];
  let output = additiveSynthesis(length, freq, harmonics, velocity * 0.7);

  // 马尾弦摩擦噪声：粗糙、宽频带、持续时间较长
  const horsehairNoise = pinkNoise(length, velocity * 0.15);
  const noiseEnv = createExponentialADSREnvelope(length, 0.1, 0.2, 0.5, 0.35, duration);
  for (let i = 0; i < length; i++) horsehairNoise[i] *= noiseEnv[i];
  output = mix(output, horsehairNoise, 0.18);

  // 梯形琴箱不规则共鸣：多个宽峰
  const resonances = [300, 700, 1400];
  const resGains = [0.2, 0.12, 0.06];
  for (let r = 0; r < resonances.length; r++) {
    const res = sineWave(length, resonances[r], velocity * resGains[r]);
    const resEnv = createExponentialADSREnvelope(length, 0.08, 0.2, 0.4, 0.3, duration);
    for (let i = 0; i < length; i++) res[i] *= resEnv[i];
    output = mix(output, res, 0.1);
  }

  // 低通模拟皮面滤波
  output = lowPassFilter(output, 3200);
  output = stateVariableLowPass(output, 2000, 0.35);

  // 深而慢的颤音
  output = applyVibrato(output, vibratoRate, vibratoDepth, freq);

  let env: Float32Array;
  if (articulation === 'staccato') {
    env = createExponentialADSREnvelope(length, 0.03, 0.06, 0.0, 0.15, duration);
  } else {
    env = createExponentialADSREnvelope(length, 0.12, 0.22, 0.68, 0.4, duration);
  }
  for (let i = 0; i < length; i++) output[i] *= env[i];

  normalizeBuffer(output);
  return gain(output, velocity);
}

// =============================================================================
// 阮 (Ruan)
// =============================================================================

/**
 * 阮合成参数接口。
 *
 * 阮是圆形共鸣箱的弹拨乐器，分大、中、小阮，
 * 音色圆润、浑厚、温和，介于月琴和琵琶之间。
 */
export interface RuanParams {
  frequency: number;
  duration: number;
  velocity: number;
  /** 技法：'pluck'（弹）、'strum'（扫） */
  technique?: 'pluck' | 'strum';
  brightness?: number;
}

/**
 * 合成阮音色。
 *
 * 物理建模要点：
 * 1. 圆形共鸣箱产生均匀的频谱包络，无明显尖锐峰
 * 2. 音色"圆润" -> 偶次谐波相对丰富，高频柔和滚降
 * 3. 尼龙弦或钢丝弦，张力中等，衰减适中
 * 4. 弹挑时指尖肉垫触弦，attack 较软（比琵琶暗）
 */
export function synthesizeRuan(params: RuanParams): Float32Array {
  const freq = clamp(params.frequency, 80, 1500);
  const duration = clamp(params.duration, 0.05, MAX_DURATION_SECONDS);
  const velocity = clamp(params.velocity, 0, 1);
  const technique = params.technique ?? 'pluck';
  const brightness = clamp(params.brightness ?? 0.45, 0, 1);

  const length = durationToSamples(duration);
  let output: Float32Array;

  if (technique === 'strum') {
    // 扫弦：多弦依次激发（简化为 3 根主要弦）
    output = new Float32Array(length);
    const detunes = [1.0, 1.25, 1.5];
    for (let s = 0; s < detunes.length; s++) {
      const sf = freq * detunes[s];
      if (sf >= SAMPLE_RATE / 2) break;
      const harmonics = [1.0, 0.4 * brightness, 0.15 * brightness];
      const str = additiveSynthesis(length, sf, harmonics, velocity * 0.3);
      const strEnv = createExponentialADSREnvelope(length, 0.003, 0.05, 0.0, 0.25, duration);
      for (let i = 0; i < length; i++) str[i] *= strEnv[i];
      const delay = Math.floor(s * 0.02 * SAMPLE_RATE);
      for (let i = 0; i < length && i + delay < length; i++) {
        output[i + delay] += str[i];
      }
    }
  } else {
    // 单音弹拨：圆润的谐波结构
    const harmonics = [1.0, 0.45 * brightness, 0.25 * brightness, 0.1 * brightness, 0.04 * brightness];
    output = additiveSynthesis(length, freq, harmonics, velocity * 0.8);
    const env = createExponentialADSREnvelope(length, 0.004, 0.06, 0.0, duration * 0.6, duration);
    for (let i = 0; i < length; i++) output[i] *= env[i];
  }

  // 圆形共鸣箱：宽频均匀共鸣，低 Q 值
  const bodyResonance = sineWave(length, 400, velocity * 0.12);
  const bodyEnv = createExponentialADSREnvelope(length, 0.05, 0.15, 0.35, 0.3, duration);
  for (let i = 0; i < length; i++) bodyResonance[i] *= bodyEnv[i];
  output = mix(output, bodyResonance, 0.15);

  // 软 attack 模拟（指尖肉垫缓冲）
  const softAttack = lowPassFilter(output, 6000);
  output = mix(output, softAttack, 0.3);

  output = lowPassFilter(output, 4500);

  normalizeBuffer(output);
  return gain(output, velocity);
}

// =============================================================================
// 扬琴 (Yangqin)
// =============================================================================

/**
 * 扬琴合成参数接口。
 *
 * 扬琴是击弦乐器，梯形共鸣箱上张有多排金属弦，
 * 用琴竹敲击发声，音色如大珠小珠落玉盘，清脆明亮。
 */
export interface YangqinParams {
  frequency: number;
  duration: number;
  velocity: number;
  /** 敲击位置：'center'（正中）、'edge'（偏边缘，更多高频） */
  strikePosition?: 'center' | 'edge';
  brightness?: number;
}

/**
 * 合成扬琴音色。
 *
 * 物理建模要点：
 * 1. 金属弦产生丰富的非谐波泛音列（钢弦刚度导致非理想谐波）
  * 2. 琴竹敲击产生极短的冲击瞬态（高频 click）
 * 3. 梯形共鸣箱产生多个分离的共振峰
 * 4. 余音较长，金属感强
 * 5. 多弦同音（为了音量会配多根同音弦），产生拍音（beating）
 */
export function synthesizeYangqin(params: YangqinParams): Float32Array {
  const freq = clamp(params.frequency, 100, 3000);
  const duration = clamp(params.duration, 0.05, MAX_DURATION_SECONDS);
  const velocity = clamp(params.velocity, 0, 1);
  const strikePosition = params.strikePosition ?? 'center';
  const brightness = clamp(params.brightness ?? 0.75, 0, 1);

  const length = durationToSamples(duration);

  // 金属弦非谐波泛音：频率略微偏离整数倍（stiffness effect）
  const inharmonicity = 0.0005 * freq; // 简化刚度系数
  const harmonics: number[] = [];
  for (let h = 0; h < 12; h++) {
    const n = h + 1;
    // 刚度导致的高次偏调
    const detune = 1.0 + inharmonicity * n * n;
    harmonics.push(Math.pow(n, -1.3) * brightness / detune);
  }
  harmonics[0] = 1.0;

  let output: Float32Array = new Float32Array(length);
  // 由于非谐波性，不能直接用 additiveSynthesis（它假设整数倍），需要逐个计算
  for (let i = 0; i < length; i++) {
    const t = i / SAMPLE_RATE;
    let sample = 0;
    for (let h = 0; h < harmonics.length; h++) {
      const n = h + 1;
      const detune = 1.0 + inharmonicity * n * n;
      const hf = freq * n * detune;
      if (hf >= SAMPLE_RATE / 2) break;
      sample += harmonics[h] * Math.sin(2.0 * Math.PI * hf * t);
    }
    output[i] = sample * velocity * 0.7;
  }

  // 多弦同音拍音模拟：两弦频率差 1-3 Hz
  const beating = sineWave(length, freq + 2.0, velocity * 0.08);
  const beatEnv = createExponentialADSREnvelope(length, 0.002, 0.08, 0.0, duration * 0.8, duration);
  for (let i = 0; i < length; i++) beating[i] *= beatEnv[i];
  output = mix(output, beating, 0.2);

  // 琴竹敲击瞬态：极短的高频 click
  const clickAmp = strikePosition === 'edge' ? 0.6 : 0.35;
  const clickCutoff = strikePosition === 'edge' ? 8000 : 5000;
  const click = whiteNoise(Math.floor(0.004 * SAMPLE_RATE), velocity * clickAmp);
  const clickFiltered = lowPassFilter(click, clickCutoff);
  for (let i = 0; i < clickFiltered.length && i < length; i++) {
    output[i] += clickFiltered[i];
  }

  // 梯形共鸣箱共振峰（简化为 600 Hz 和 2000 Hz）
  const res1 = sineWave(length, 600, velocity * 0.1);
  const res2 = sineWave(length, 2000, velocity * 0.05);
  for (let i = 0; i < length; i++) {
    const env = Math.exp(-i / (SAMPLE_RATE * 0.3));
    output[i] += (res1[i] + res2[i]) * env;
  }

  // 整体衰减包络
  const env = createExponentialADSREnvelope(length, 0.001, 0.04, 0.0, duration * 0.75, duration);
  for (let i = 0; i < length; i++) output[i] *= env[i];

  output = stateVariableLowPass(output, 6000, 0.15);

  normalizeBuffer(output);
  return gain(output, velocity);
}

// =============================================================================
// 编钟 (Bianzhong)
// =============================================================================

/**
 * 编钟合成参数接口。
 *
 * 编钟是中国古代大型打击乐器，青铜铸造，一钟双音（正鼓音、侧鼓音），
 * 具有极其复杂的金属衰减特性：高频迅速衰减，低频长鸣，
 * 并伴随明显的非谐波泛音和拍音。
 */
export interface BianzhongParams {
  frequency: number;
  duration: number;
  velocity: number;
  /** 敲击位置：'center'（正鼓音）、'side'（侧鼓音，高小三度） */
  strikePosition?: 'center' | 'side';
  /** 钟体大小因子：越大低频越丰富、衰减越长 */
  size?: 'small' | 'medium' | 'large';
  brightness?: number;
}

/**
 * 合成编钟音色。
 *
 * 物理建模要点：
 * 1. 一钟双音：正鼓音（基础音）和侧鼓音（通常高小三度）
 * 2. 青铜的复杂振动模式产生大量非谐波泛音
 * 3. 高频泛音极快衰减（几毫秒到几十毫秒）
 * 4. 低频基频可持续数秒甚至数十秒
 * 5. 不同频率模态的衰减时间差异巨大（time-varying spectrum）
 * 6. 敲击产生宽频金属噪声
 */
export function synthesizeBianzhong(params: BianzhongParams): Float32Array {
  const freq = clamp(params.frequency, 60, 2000);
  const duration = clamp(params.duration, 0.2, MAX_DURATION_SECONDS);
  const velocity = clamp(params.velocity, 0, 1);
  const strikePosition = params.strikePosition ?? 'center';
  const size = params.size ?? 'medium';
  const brightness = clamp(params.brightness ?? 0.5, 0, 1);

  const length = durationToSamples(duration);

  // 一钟双音：侧鼓音通常比正鼓音高约 3-5 个半音
  const sideFreq = strikePosition === 'side' ? freq * Math.pow(2, 4 / 12) : freq;
  const mainFreq = strikePosition === 'side' ? freq : freq;

  // 根据钟大小调整衰减系数
  const decayScale = size === 'small' ? 0.3 : size === 'large' ? 2.5 : 1.0;

  // 编钟的振动模态（简化）：基频 + 非谐波泛音
  // 实际编钟频谱极其复杂，这里用一组代表性强的高次模态近似
  const modes = [
    { ratio: 1.0, amp: 1.0, decay: 0.8 },
    { ratio: 1.18, amp: 0.25, decay: 2.0 },
    { ratio: 1.53, amp: 0.15, decay: 3.0 },
    { ratio: 2.05, amp: 0.08, decay: 4.5 },
    { ratio: 2.72, amp: 0.04, decay: 6.0 },
    { ratio: 3.41, amp: 0.02, decay: 8.0 },
  ];

  const output = new Float32Array(length);

  // 合成正鼓音
  for (const mode of modes) {
    const mf = mainFreq * mode.ratio;
    if (mf >= SAMPLE_RATE / 2) break;
    const amp = mode.amp * brightness;
    const decay = mode.decay / decayScale;
    for (let i = 0; i < length; i++) {
      const t = i / SAMPLE_RATE;
      const env = Math.exp(-decay * t * (freq * 0.005)); // 基频越高衰减越快
      output[i] += amp * Math.sin(2.0 * Math.PI * mf * t) * env;
    }
  }

  // 若敲击侧鼓，叠加侧鼓音（较弱）
  if (strikePosition === 'side') {
    for (const mode of modes) {
      const mf = sideFreq * mode.ratio;
      if (mf >= SAMPLE_RATE / 2) break;
      const amp = mode.amp * brightness * 0.6;
      const decay = mode.decay / decayScale;
      for (let i = 0; i < length; i++) {
        const t = i / SAMPLE_RATE;
        const env = Math.exp(-decay * t * (freq * 0.005));
        output[i] += amp * Math.sin(2.0 * Math.PI * mf * t) * env;
      }
    }
  }

  // 金属敲击瞬态：宽频带、极短
  const metalClick = whiteNoise(Math.floor(0.006 * SAMPLE_RATE), velocity * 0.8);
  const clickFiltered = lowPassFilter(metalClick, 10000);
  for (let i = 0; i < clickFiltered.length && i < length; i++) {
    output[i] += clickFiltered[i];
  }

  // 金属长衰减后的拍音（不同模态干涉）
  const beatFreq = 0.5; // Hz
  for (let i = 0; i < length; i++) {
    const t = i / SAMPLE_RATE;
    const beat = 1.0 + 0.03 * Math.sin(2.0 * Math.PI * beatFreq * t);
    output[i] *= beat;
  }

  // 编钟无 sustain，纯衰减
  const masterEnv = createExponentialADSREnvelope(length, 0.001, 0.02, 0.0, duration * 0.95, duration);
  for (let i = 0; i < length; i++) output[i] *= masterEnv[i];

  normalizeBuffer(output);
  return gain(output, velocity);
}

// =============================================================================
// ChineseEnsemble 合奏编排类
// =============================================================================

/**
 * 合奏事件描述。
 */
interface EnsembleEvent {
  instrument: string;
  startTime: number;
  params: unknown;
}

/**
 * ChineseEnsemble - 中国民族乐器合奏编排器。
 *
 * 按照传统民族管弦乐队的声部布局进行混合：
 * - 拉弦组：二胡、马头琴（舞台左前）
 * - 弹拨组：琵琶、古筝、阮、扬琴（中前）
 * - 吹管组：唢呐、笛子、箫（后区或侧区）
 * - 打击组：编钟（根据需求定位）
 *
 * 示例：
 * ```ts
 * const ensemble = new ChineseEnsemble();
 * ensemble.addErhu(0, { frequency: 440, duration: 3, velocity: 0.7 });
 * ensemble.addPipa(0, { frequency: 880, duration: 1, velocity: 0.6, technique: 'roll' });
 * const mix = ensemble.mixdown(5);
 * ```
 */
export class ChineseEnsemble {
  private events: EnsembleEvent[] = [];
  private panPositions: Map<string, number> = new Map();

  constructor() {
    // 传统民乐队摆位（面对观众视角）
    this.panPositions.set('erhu', -0.5);
    this.panPositions.set('morinKhuur', -0.3);
    this.panPositions.set('pipa', -0.1);
    this.panPositions.set('guzheng', 0.0);
    this.panPositions.set('ruan', 0.1);
    this.panPositions.set('yangqin', 0.25);
    this.panPositions.set('suona', 0.4);
    this.panPositions.set('dizi', -0.4);
    this.panPositions.set('xiao', -0.25);
    this.panPositions.set('bianzhong', 0.0);
  }

  /** 添加自定义事件 */
  addEvent(instrument: string, startTime: number, params: unknown): void {
    this.events.push({ instrument, startTime, params });
  }

  addErhu(startTime: number, params: ErhuParams): void {
    this.events.push({ instrument: 'erhu', startTime, params });
  }

  addPipa(startTime: number, params: PipaParams): void {
    this.events.push({ instrument: 'pipa', startTime, params });
  }

  addGuzheng(startTime: number, params: GuzhengParams): void {
    this.events.push({ instrument: 'guzheng', startTime, params });
  }

  addSuona(startTime: number, params: SuonaParams): void {
    this.events.push({ instrument: 'suona', startTime, params });
  }

  addDizi(startTime: number, params: DiziParams): void {
    this.events.push({ instrument: 'dizi', startTime, params });
  }

  addXiao(startTime: number, params: XiaoParams): void {
    this.events.push({ instrument: 'xiao', startTime, params });
  }

  addMorinKhuur(startTime: number, params: MorinKhuurParams): void {
    this.events.push({ instrument: 'morinKhuur', startTime, params });
  }

  addRuan(startTime: number, params: RuanParams): void {
    this.events.push({ instrument: 'ruan', startTime, params });
  }

  addYangqin(startTime: number, params: YangqinParams): void {
    this.events.push({ instrument: 'yangqin', startTime, params });
  }

  addBianzhong(startTime: number, params: BianzhongParams): void {
    this.events.push({ instrument: 'bianzhong', startTime, params });
  }

  /** 设置/获取声像 */
  setPan(instrument: string, pan: number): void {
    this.panPositions.set(instrument, clamp(pan, -1, 1));
  }

  getPan(instrument: string): number {
    return this.panPositions.get(instrument) ?? 0;
  }

  clear(): void {
    this.events = [];
  }

  getEventCount(): number {
    return this.events.length;
  }

  private renderEvent(event: EnsembleEvent): Float32Array {
    const p = event.params as any;
    switch (event.instrument) {
      case 'erhu': return synthesizeErhu(p as ErhuParams);
      case 'pipa': return synthesizePipa(p as PipaParams);
      case 'guzheng': return synthesizeGuzheng(p as GuzhengParams);
      case 'suona': return synthesizeSuona(p as SuonaParams);
      case 'dizi': return synthesizeDizi(p as DiziParams);
      case 'xiao': return synthesizeXiao(p as XiaoParams);
      case 'morinKhuur': return synthesizeMorinKhuur(p as MorinKhuurParams);
      case 'ruan': return synthesizeRuan(p as RuanParams);
      case 'yangqin': return synthesizeYangqin(p as YangqinParams);
      case 'bianzhong': return synthesizeBianzhong(p as BianzhongParams);
      default:
        return new Float32Array(durationToSamples(p.duration ?? 1));
    }
  }

  /**
   * 混音生成总谱。
   * @param totalDuration - 总时长（秒）
   */
  mixdown(totalDuration: number): Float32Array {
    const totalSamples = durationToSamples(totalDuration);
    const master = new Float32Array(totalSamples);

    for (const event of this.events) {
      const buffer = this.renderEvent(event);
      const startSample = Math.floor(event.startTime * SAMPLE_RATE);
      const pan = this.getPan(event.instrument);
      const panGain = Math.cos((pan + 1) * Math.PI / 4);

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
   * 带统计报告的混音。
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
// 模块元数据
// =============================================================================

/** 本模块支持的民族乐器名称列表 */
export const CHINESE_INSTRUMENTS = [
  'erhu', 'pipa', 'guzheng', 'suona', 'dizi',
  'xiao', 'morinKhuur', 'ruan', 'yangqin', 'bianzhong'
] as const;

/** 乐器按家族分类 */
export const CHINESE_FAMILIES = {
  bowed: ['erhu', 'morinKhuur'],
  plucked: ['pipa', 'guzheng', 'ruan'],
  wind: ['suona', 'dizi', 'xiao'],
  hammered: ['yangqin'],
  percussion: ['bianzhong']
} as const;

// =============================================================================
// 民族乐器声学效果与律制处理
// =============================================================================

/**
 * 中国传统律制转换器。
 *
 * 西方十二平均律（Equal Temperament）虽然通用，但中国传统音乐理论上
 * 更常使用"三分损益律"（五度相生律）和"纯律"。
 * 本模块提供从十二平均律 MIDI 音符编号到传统律制频率的转换，
 * 用于在数字合成中还原更地道的中国音韵。
 */

/** 支持的律制类型 */
export type TuningSystem = 'equalTemperament' | 'pythagorean' | 'justIntonation' | 'quarterTone';

/**
 * 五度相生律（Pythagorean Tuning）频率计算。
 *
 * 以黄钟（通常对应 C）为基音，按"三分损益"（即频率比 3:2 和 2:3）
 * 连续生律。该律制的大二度（9/8）较大，小二度（256/243）较小，
 * 因此旋律听起来比平均律更"挺拔"。
 *
 * @param midiNote - MIDI 音符编号（以 C4=60 为黄钟基准）
 * @param baseFreq - 黄钟基频（Hz），默认 261.63（C4）
 * @returns 五度相生律频率
 */
export function pythagoreanFrequency(midiNote: number, baseFreq: number = 261.625565): number {
  // 以 C 为基准，计算半音偏移
  const semitones = midiNote - 60;
  // 五度相生律中，各音相对于平均律的偏移（音分）
  // C(0), C#(114), D(204), D#(294), E(408), F(498), F#(612), G(702), G#(816), A(906), A#(996), B(1110)
  const centsTable = [0, 114, 204, 294, 408, 498, 612, 702, 816, 906, 996, 1110];
  const octave = Math.floor(semitones / 12);
  const degree = ((semitones % 12) + 12) % 12;
  const cents = centsTable[degree] + octave * 1200;
  return baseFreq * Math.pow(2, cents / 1200);
}

/**
 * 纯律（Just Intonation）频率计算（以大调音阶为例）。
 *
 * 纯律基于自然泛音列的整数比，大调音阶频率比为：
 * 1/1, 9/8, 5/4, 4/3, 3/2, 5/3, 15/8, 2/1
 * 纯律的大三度（5/4 = 386 音分）比平均律（400 音分）更"纯"、更柔和。
 *
 * @param scaleDegree - 大调音阶级数（0=C, 1=D, 2=E...）
 * @param octave - 八度偏移
 * @param baseFreq - 基频（Hz）
 * @returns 纯律频率
 */
export function justIntonationFrequency(scaleDegree: number, octave: number = 0, baseFreq: number = 261.625565): number {
  const ratios = [1 / 1, 9 / 8, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 15 / 8, 2 / 1];
  const degree = ((scaleDegree % 7) + 7) % 7;
  const oct = Math.floor(scaleDegree / 7) + octave;
  return baseFreq * ratios[degree] * Math.pow(2, oct);
}

/**
 * 四分音（Quarter Tone）微分音频率。
 *
 * 用于模拟某些中国地方戏曲和维吾尔/阿拉伯音乐影响下的微分音效果。
 *
 * @param midiNote - 基础 MIDI 音符
 * @param quarterToneOffset - 四分音偏移（-2 ~ +2，1 = 50 音分）
 * @returns 微分音频率
 */
export function quarterToneFrequency(midiNote: number, quarterToneOffset: number): number {
  const base = 440 * Math.pow(2, (midiNote - 69) / 12);
  const cents = quarterToneOffset * 50;
  return base * Math.pow(2, cents / 1200);
}

/**
 * 通用律制频率转换入口。
 *
 * @param midiNote - MIDI 音符编号
 * @param system - 律制类型
 * @param baseFreq - 基频（Hz）
 * @returns 对应律制的频率
 */
export function convertTuning(midiNote: number, system: TuningSystem = 'equalTemperament', baseFreq: number = 261.625565): number {
  switch (system) {
    case 'pythagorean':
      return pythagoreanFrequency(midiNote, baseFreq);
    case 'justIntonation':
      return justIntonationFrequency(midiNote - 60, 0, baseFreq);
    case 'quarterTone':
      // 默认向上偏移 1/4 音作为示例
      return quarterToneFrequency(midiNote, 1);
    case 'equalTemperament':
    default:
      return 440 * Math.pow(2, (midiNote - 69) / 12);
  }
}

/**
 * 环境声学模拟：中国古建筑混响。
 *
 * 不同类型的中国传统建筑具有独特的声学特征：
 * - 大殿（如故宫太和殿）：体积庞大、砖木石混合，混响时间长（2~4 秒），低频丰富
 * - 园林亭榭：开放半开放空间，混响极短（0.3~0.8 秒），高频清晰
 * - 山洞/石窟：类似长混响腔体，具有明显回声与金属色彩
 *
 * @param input - 输入信号
 * @param hallType - 建筑类型
 * @param mix - 干湿比
 * @returns 带环境混响的信号
 */
export function applyChineseHallReverb(
  input: Float32Array,
  hallType: 'greatHall' | 'gardenPavilion' | 'cave',
  mix: number = 0.3
): Float32Array {
  const length = input.length;
  const output = new Float32Array(length);

  // 根据建筑类型选择混响参数
  let combDelays: number[];
  let combFeedback: number;
  let damping: number;

  switch (hallType) {
    case 'greatHall':
      // 大殿：长混响、强低频、高阻尼吸收高频
      combDelays = [2133, 2213, 2377, 2617];
      combFeedback = 0.92;
      damping = 0.75;
      break;
    case 'cave':
      // 山洞：极长混响、低频共振峰明显、反射清晰
      combDelays = [3011, 3121, 3313, 3571];
      combFeedback = 0.96;
      damping = 0.45;
      break;
    case 'gardenPavilion':
    default:
      // 园林：短混响、通透、高频保留
      combDelays = [1051, 1103, 1171, 1231];
      combFeedback = 0.55;
      damping = 0.25;
      break;
  }

  // 梳状滤波器组
  const combSums = new Float32Array(length);
  for (let c = 0; c < combDelays.length; c++) {
    const delay = combDelays[c];
    const delayLine = new Float32Array(delay);
    let writeIdx = 0;
    let filterStore = 0;
    for (let i = 0; i < length; i++) {
      const delayed = delayLine[writeIdx];
      filterStore = delayed * (1 - damping) + filterStore * damping;
      const sample = input[i] + filterStore * combFeedback;
      delayLine[writeIdx] = sample;
      combSums[i] += delayed;
      writeIdx = (writeIdx + 1) % delay;
    }
  }

  // 全通滤波器增加密度
  const allpassDelays = hallType === 'gardenPavilion' ? [181, 97] : [401, 211];
  const allpassFeedback = 0.5;
  const apBuffer1 = new Float32Array(allpassDelays[0]);
  const apBuffer2 = new Float32Array(allpassDelays[1]);
  let apIdx1 = 0, apIdx2 = 0;

  for (let i = 0; i < length; i++) {
    let sample = combSums[i];
    const delayed1 = apBuffer1[apIdx1];
    const ap1 = delayed1 - allpassFeedback * sample;
    apBuffer1[apIdx1] = sample + allpassFeedback * ap1;
    sample = ap1 + delayed1 * allpassFeedback;
    apIdx1 = (apIdx1 + 1) % allpassDelays[0];

    const delayed2 = apBuffer2[apIdx2];
    const ap2 = delayed2 - allpassFeedback * sample;
    apBuffer2[apIdx2] = sample + allpassFeedback * ap2;
    sample = ap2 + delayed2 * allpassFeedback;
    apIdx2 = (apIdx2 + 1) % allpassDelays[1];

    output[i] = input[i] * (1 - mix) + sample * mix * 0.25;
  }

  normalizeBuffer(output);
  return output;
}

/**
 * 滑音曲线生成器（Portamento / Glissando Curves）。
 *
 * 中国拉弦乐器（二胡、马头琴）和弹拨乐器（琵琶、古筝）的滑音
 * 并非简单的线性变化，而是具有特定"韵味"的曲线：
 * - 线性（linear）：西方风格，较少用于传统民乐
 * - 指数起（expIn）：慢起快收，模拟手指逐渐加速滑动
 * - 指数落（expOut）：快起慢收，模拟到达目标音后的缓冲
 * - S 曲线（sigmoid）：最自然的滑音，符合人体运动学
 *
 * @param startFreq - 起始频率（Hz）
 * @param endFreq - 目标频率（Hz）
 * @param duration - 滑音时长（秒）
 * @param curve - 曲线类型
 * @returns 频率数组（每采样一帧）
 */
export function generatePortamentoCurve(
  startFreq: number,
  endFreq: number,
  duration: number,
  curve: 'linear' | 'expIn' | 'expOut' | 'sigmoid' = 'sigmoid'
): Float32Array {
  const length = durationToSamples(duration);
  const freqs = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const t = i / length;
    let eased: number;
    switch (curve) {
      case 'expIn':
        eased = Math.pow(t, 3);
        break;
      case 'expOut':
        eased = 1.0 - Math.pow(1.0 - t, 3);
        break;
      case 'sigmoid':
        eased = 1.0 / (1.0 + Math.exp(-10.0 * (t - 0.5)));
        break;
      case 'linear':
      default:
        eased = t;
        break;
    }
    freqs[i] = lerp(startFreq, endFreq, eased);
  }
  return freqs;
}

/**
 * 装饰音（Appoggiatura / Grace Note）生成。
 *
 * 中国传统音乐中的"倚音"、"颤音"、"打音"等装饰技法，
 * 通过短时频率偏移模拟。
 *
 * @param baseFreq - 基础音高（Hz）
 * @param graceFreq - 装饰音音高（Hz）
 * @param totalDuration - 总时长（秒）
 * @param graceRatio - 装饰音占用总时长的比例（0~0.5）
 * @param amplitude - 振幅
 * @returns 装饰音波形
 */
export function synthesizeGraceNote(
  baseFreq: number,
  graceFreq: number,
  totalDuration: number,
  graceRatio: number = 0.15,
  amplitude: number = 0.7
): Float32Array {
  const length = durationToSamples(totalDuration);
  const graceSamples = Math.floor(length * clamp(graceRatio, 0.05, 0.5));
  const out = new Float32Array(length);
  let phase = 0;

  for (let i = 0; i < length; i++) {
    let freq: number;
    let amp: number;
    if (i < graceSamples) {
      // 装饰音阶段：从装饰音快速滑向主音
      const t = i / graceSamples;
      freq = lerp(graceFreq, baseFreq, t * t);
      amp = Math.exp(-t * 3.0) * 0.8 + 0.2;
    } else {
      freq = baseFreq;
      amp = 1.0;
    }
    phase += (2.0 * Math.PI * freq) / SAMPLE_RATE;
    out[i] = Math.sin(phase) * amplitude * amp;
  }

  return out;
}

/**
 * 噪声门（Noise Gate）。
 *
 * 用于抑制民族乐器录音/合成中的本底噪声，
 * 特别适用于箫、笛子等气声明显的乐器后处理。
 *
 * @param input - 输入信号
 * @param threshold - 阈值（dB，相对于 0 dBFS），默认 -50
 * @param attack - 开门时间（秒），默认 0.005
 * @param release - 关门时间（秒），默认 0.05
 * @returns 噪声门处理后的信号
 */
export function applyNoiseGate(
  input: Float32Array,
  threshold: number = -50,
  attack: number = 0.005,
  release: number = 0.05
): Float32Array {
  const output = new Float32Array(input.length);
  const thresholdLinear = Math.pow(10, threshold / 20);
  const attackCoeff = Math.exp(-1.0 / (attack * SAMPLE_RATE));
  const releaseCoeff = Math.exp(-1.0 / (release * SAMPLE_RATE));
  let envelope = 0;
  let gain = 0;

  for (let i = 0; i < input.length; i++) {
    const absX = Math.abs(input[i]);
    // 包络跟随
    if (absX > envelope) {
      envelope = attackCoeff * (envelope - absX) + absX;
    } else {
      envelope = releaseCoeff * (envelope - absX) + absX;
    }

    // 门控逻辑：高于阈值逐渐开门，低于阈值逐渐关门
    const targetGain = envelope > thresholdLinear ? 1.0 : 0.0;
    if (targetGain > gain) {
      gain = attackCoeff * (gain - targetGain) + targetGain;
    } else {
      gain = releaseCoeff * (gain - targetGain) + targetGain;
    }

    output[i] = input[i] * gain;
  }

  return output;
}

/**
 * 瞬态塑形器（Transient Shaper）。
 *
 * 增强或衰减信号的 attack 和 sustain 部分，
 * 对弹拨乐器（琵琶、扬琴）和打击乐器（编钟）尤为有用。
 *
 * @param input - 输入信号
 * @param attackBoost - Attack 增强量（dB，-12 ~ +12），正值让音头更尖锐
 * @param sustainBoost - Sustain 增强量（dB，-12 ~ +12），正值让尾音更长
 * @returns 瞬态塑形后的信号
 */
export function applyTransientShaper(
  input: Float32Array,
  attackBoost: number = 0,
  sustainBoost: number = 0
): Float32Array {
  const output = new Float32Array(input.length);
  const attackAmp = Math.pow(10, clamp(attackBoost, -12, 12) / 20);
  const sustainAmp = Math.pow(10, clamp(sustainBoost, -12, 12) / 20);

  // 使用微分检测瞬态：差值大表示 attack，差值小表示 sustain
  const diff = new Float32Array(input.length);
  diff[0] = 0;
  for (let i = 1; i < input.length; i++) {
    diff[i] = Math.abs(input[i] - input[i - 1]);
  }
  // 平滑差分信号
  const smoothedDiff = lowPassFilter(diff, 50);

  for (let i = 0; i < input.length; i++) {
    const transientAmount = smoothedDiff[i] * 50; // 放大到 0~1 范围
    const gain = lerp(sustainAmp, attackAmp, clamp(transientAmount, 0, 1));
    output[i] = input[i] * gain;
  }

  normalizeBuffer(output);
  return output;
}

/**
 * 频谱质心（Spectral Centroid）近似计算。
 *
 * 通过过零率和峰值密度快速估算频谱质心，
 * 用于区分"明亮"（高质心）与"暗淡"（低质心）音色。
 *
 * @param buffer - 输入信号
 * @returns 归一化质心估计值（0~1，1 表示极高频）
 */
export function estimateSpectralCentroid(buffer: Float32Array): number {
  // 方法：分段计算局部过零率和峰值能量
  const segmentSize = 1024;
  const numSegments = Math.floor(buffer.length / segmentSize);
  if (numSegments === 0) return 0;

  let weightedSum = 0;
  let totalWeight = 0;

  for (let s = 0; s < numSegments; s++) {
    const start = s * segmentSize;
    let segmentZCR = 0;
    let segmentPeak = 0;
    for (let i = start + 1; i < start + segmentSize; i++) {
      if ((buffer[i] >= 0) !== (buffer[i - 1] >= 0)) segmentZCR++;
      const abs = Math.abs(buffer[i]);
      if (abs > segmentPeak) segmentPeak = abs;
    }
    const normZCR = segmentZCR / segmentSize;
    const weight = segmentPeak;
    weightedSum += normZCR * weight;
    totalWeight += weight;
  }

  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

/**
 * 淡入淡出（Fade In / Fade Out）。
 *
 * @param buffer - 输入信号
 * @param fadeInSec - 淡入时长（秒）
 * @param fadeOutSec - 淡出时长（秒）
 * @param curve - 曲线类型：'linear' | 'exponential' | 'sigmoid'
 * @returns 处理后的信号
 */
export function applyFade(
  buffer: Float32Array,
  fadeInSec: number,
  fadeOutSec: number,
  curve: 'linear' | 'exponential' | 'sigmoid' = 'sigmoid'
): Float32Array {
  const out = new Float32Array(buffer.length);
  const fadeInSamples = Math.floor(fadeInSec * SAMPLE_RATE);
  const fadeOutSamples = Math.floor(fadeOutSec * SAMPLE_RATE);

  for (let i = 0; i < buffer.length; i++) {
    let gain = 1.0;
    if (i < fadeInSamples) {
      const t = i / fadeInSamples;
      gain = curve === 'exponential' ? (1 - Math.exp(-5 * t)) : curve === 'sigmoid' ? smoothstep(0, 1, t) : t;
    }
    if (i >= buffer.length - fadeOutSamples) {
      const t = (buffer.length - 1 - i) / fadeOutSamples;
      const fadeOutGain = curve === 'exponential' ? (1 - Math.exp(-5 * t)) : curve === 'sigmoid' ? smoothstep(0, 1, t) : t;
      gain = Math.min(gain, fadeOutGain);
    }
    out[i] = buffer[i] * gain;
  }

  return out;
}

/**
 * 时间域简易时间拉伸（不改变音高）。
 *
 * 使用重叠相加（Overlap-Add）思想的简化实现，
 * 通过颗粒复制实现时间延长或缩短，音质一般但计算极轻。
 *
 * @param buffer - 输入信号
 * @param stretchFactor - 拉伸因子（>1 延长，<1 缩短）
 * @returns 拉伸后的信号
 */
export function simpleTimeStretch(buffer: Float32Array, stretchFactor: number): Float32Array {
  if (Math.abs(stretchFactor - 1.0) < EPSILON) return new Float32Array(buffer);
  const grainSize = 512;
  const hopSize = Math.floor(grainSize / 4);
  const newLength = Math.floor(buffer.length * stretchFactor);
  const out = new Float32Array(newLength);
  const window = new Float32Array(grainSize);
  for (let i = 0; i < grainSize; i++) {
    window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (grainSize - 1));
  }

  let outPos = 0;
  let inPos = 0;
  while (inPos + grainSize < buffer.length && outPos + grainSize < newLength) {
    for (let i = 0; i < grainSize; i++) {
      out[outPos + i] += buffer[inPos + i] * window[i];
    }
    inPos += hopSize;
    outPos += Math.floor(hopSize * stretchFactor);
  }

  normalizeBuffer(out);
  return out;
}

export type ChineseInstrumentName = typeof CHINESE_INSTRUMENTS[number];
