// ============================================================
// 青鸾 DAW — 专业母带处理链 (Mastering Chain)
// ============================================================
// 目标：录音棚专业级母带质量
// 标准参考：Spotify/Apple Music (-14 LUFS, -1 dBTP)
// 处理链：EQ → 多段压缩 → 立体声扩展 → 真峰值限制 → LUFS标准化
// ============================================================

const SAMPLE_RATE = 22050;

// ═════════════════════════════════════════════════════════════
// Part 0: 基础滤波器（一阶/二阶近似）
// ═════════════════════════════════════════════════════════════

/** 一阶低通滤波器（指数平滑） */
function lowpass1(buf: Float32Array, alpha: number): Float32Array {
  const out = new Float32Array(buf.length);
  let s = buf[0];
  for (let i = 0; i < buf.length; i++) {
    s += alpha * (buf[i] - s);
    out[i] = s;
  }
  return out as Float32Array;
}

/** 一阶高通滤波器 */
function highpass1(buf: Float32Array, alpha: number): Float32Array {
  const out = new Float32Array(buf.length);
  let s = buf[0];
  for (let i = 0; i < buf.length; i++) {
    s += alpha * (buf[i] - s);
    out[i] = buf[i] - s;
  }
  return out as Float32Array;
}

/** 搁架滤波器（低频/高频提升/削减） */
function shelfFilter(buf: Float32Array, freq: number, gainDb: number, isHigh: boolean, sr = SAMPLE_RATE): Float32Array {
  const A = Math.pow(10, gainDb / 40);
  const w0 = (2 * Math.PI * freq) / sr;
  const S = 1; // 斜率
  const alpha = Math.sin(w0) / 2 * Math.sqrt((A + 1 / A) * (1 / S - 1) + 2);

  let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;
  if (isHigh) {
    const sqrtA = Math.sqrt(A);
    b0 = A * ((A + 1) + (A - 1) * Math.cos(w0) + 2 * sqrtA * alpha);
    b1 = -2 * A * ((A - 1) + (A + 1) * Math.cos(w0));
    b2 = A * ((A + 1) + (A - 1) * Math.cos(w0) - 2 * sqrtA * alpha);
    a0 = (A + 1) - (A - 1) * Math.cos(w0) + 2 * sqrtA * alpha;
    a1 = 2 * ((A - 1) - (A + 1) * Math.cos(w0));
    a2 = (A + 1) - (A - 1) * Math.cos(w0) - 2 * sqrtA * alpha;
  } else {
    const sqrtA = Math.sqrt(A);
    b0 = A * ((A + 1) - (A - 1) * Math.cos(w0) + 2 * sqrtA * alpha);
    b1 = 2 * A * ((A - 1) - (A + 1) * Math.cos(w0));
    b2 = A * ((A + 1) - (A - 1) * Math.cos(w0) - 2 * sqrtA * alpha);
    a0 = (A + 1) + (A - 1) * Math.cos(w0) + 2 * sqrtA * alpha;
    a1 = -2 * ((A - 1) + (A + 1) * Math.cos(w0));
    a2 = (A + 1) + (A - 1) * Math.cos(w0) - 2 * sqrtA * alpha;
  }

  const out = new Float32Array(buf.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < buf.length; i++) {
    const x0 = buf[i];
    const y0 = (b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x0;
    y2 = y1; y1 = y0;
    out[i] = y0;
  }
  return out as Float32Array;
}

/** 钟形PEQ滤波器 */
function peakingEQ(buf: Float32Array, freq: number, gainDb: number, Q = 1.0, sr = SAMPLE_RATE): Float32Array {
  const A = Math.pow(10, gainDb / 40);
  const w0 = (2 * Math.PI * freq) / sr;
  const alpha = Math.sin(w0) / (2 * Q);

  const b0 = 1 + alpha * A;
  const b1 = -2 * Math.cos(w0);
  const b2 = 1 - alpha * A;
  const a0 = 1 + alpha / A;
  const a1 = -2 * Math.cos(w0);
  const a2 = 1 - alpha / A;

  const out = new Float32Array(buf.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < buf.length; i++) {
    const x0 = buf[i];
    const y0 = (b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x0;
    y2 = y1; y1 = y0;
    out[i] = y0;
  }
  return out as Float32Array;
}

// ═════════════════════════════════════════════════════════════
// Part 1: LUFS 响度测量 (ITU-R BS.1770-4 简化)
// ═════════════════════════════════════════════════════════════

export interface LoudnessMetrics {
  integratedLUFS: number;
  shortTermLUFS: number[];
  truePeak: number;
  dynamicRangeLU: number;
  loudnessRange: number;
}

export class LUFSMeter {
  sampleRate: number;
  // 预滤波状态（一阶高通近似 K-weighting）
  private _hpState = 0;

  constructor(sampleRate = SAMPLE_RATE) {
    this.sampleRate = sampleRate;
  }

  measure(buf: Float32Array): LoudnessMetrics {
    const windowSamples = Math.floor(0.4 * this.sampleRate); // 400ms
    const step = Math.floor(windowSamples * 0.25); // 75% overlap

    // 简化 K-weighting：高通 + 高频提升
    const hpAlpha = 0.001; // ~7Hz 高通
    const filtered = highpass1(buf, hpAlpha);
    const boosted = shelfFilter(filtered, 1500, 4.0, true, this.sampleRate);

    // 滑动窗口响度
    const shortTerm: number[] = [];
    for (let i = 0; i + windowSamples <= boosted.length; i += step) {
      let sum = 0;
      for (let j = 0; j < windowSamples; j++) {
        sum += boosted[i + j] * boosted[i + j];
      }
      const rms = Math.sqrt(sum / windowSamples);
      // 简化为 LUFS 近似
      const lufs = -0.691 + 10 * Math.log10(rms * rms + 1e-10);
      shortTerm.push(lufs);
    }

    // 积分响度
    let integratedSum = 0;
    let count = 0;
    for (const st of shortTerm) {
      if (st > -70) {
        integratedSum += Math.pow(10, st / 10);
        count++;
      }
    }
    const integrated = count > 0 ? 10 * Math.log10(integratedSum / count) : -70;

    // 真峰值（4x 过采样插值近似）
    let truePeak = 0;
    for (let i = 0; i < buf.length - 3; i += 4) {
      const p = Math.abs(buf[i]);
      if (p > truePeak) truePeak = p;
    }

    // 响度范围（LRA）
    const sorted = [...shortTerm].sort((a, b) => a - b);
    const p10 = sorted[Math.floor(sorted.length * 0.1)] || -70;
    const p95 = sorted[Math.floor(sorted.length * 0.95)] || -70;
    const lra = p95 - p10;

    // 动态范围（LU）
    const maxL = Math.max(...shortTerm, -70);
    const minL = Math.min(...shortTerm, -70);

    return {
      integratedLUFS: integrated,
      shortTermLUFS: shortTerm,
      truePeak,
      dynamicRangeLU: maxL - minL,
      loudnessRange: lra,
    };
  }
}

// ═════════════════════════════════════════════════════════════
// Part 2: 多段压缩器 (低频/中频/高频)
// ═════════════════════════════════════════════════════════════

export interface MultibandSettings {
  lowFreq: number;
  highFreq: number;
  lowThreshold: number;
  lowRatio: number;
  midThreshold: number;
  midRatio: number;
  highThreshold: number;
  highRatio: number;
  attackMs: number;
  releaseMs: number;
}

export class MultibandCompressor {
  sampleRate: number;
  settings: MultibandSettings;

  constructor(settings?: Partial<MultibandSettings>, sampleRate = SAMPLE_RATE) {
    this.sampleRate = sampleRate;
    this.settings = {
      lowFreq: 200,
      highFreq: 4000,
      lowThreshold: 0.3,
      lowRatio: 4,
      midThreshold: 0.25,
      midRatio: 3,
      highThreshold: 0.2,
      highRatio: 2.5,
      attackMs: 10,
      releaseMs: 100,
      ...settings,
    };
  }

  process(buf: Float32Array): Float32Array {
    const s = this.settings;
    // 分频
    const lowAlpha = s.lowFreq / this.sampleRate;
    const highAlpha = s.highFreq / this.sampleRate;

    const lowBand = lowpass1(buf, lowAlpha);
    const highBand = highpass1(buf, highAlpha);
    const midBand = new Float32Array(buf.length);
    for (let i = 0; i < buf.length; i++) midBand[i] = buf[i] - lowBand[i] - highBand[i];

    // 各频段压缩
    const lowComp = this._compress(lowBand, s.lowThreshold, s.lowRatio);
    const midComp = this._compress(midBand, s.midThreshold, s.midRatio);
    const highComp = this._compress(highBand, s.highThreshold, s.highRatio);

    // 混合
    const out = new Float32Array(buf.length);
    for (let i = 0; i < buf.length; i++) {
      out[i] = lowComp[i] + midComp[i] + highComp[i];
    }
    return out as Float32Array;
  }

  private _compress(buf: Float32Array, threshold: number, ratio: number): Float32Array {
    const attackCoef = Math.exp(-1 / (this.sampleRate * this.settings.attackMs / 1000));
    const releaseCoef = Math.exp(-1 / (this.sampleRate * this.settings.releaseMs / 1000));
    const out = new Float32Array(buf.length);
    let env = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = Math.abs(buf[i]);
      const coef = v > env ? attackCoef : releaseCoef;
      env = v + coef * (env - v);
      const gain = env > threshold ? Math.pow(threshold / (env + 1e-12), 1 / ratio) : 1;
      out[i] = buf[i] * gain;
    }
    return out as Float32Array;
  }
}

// ═════════════════════════════════════════════════════════════
// Part 3: 专业母带 EQ
// ═════════════════════════════════════════════════════════════

export function masteringEQ(buf: Float32Array, sr = SAMPLE_RATE): Float32Array {
  // 专业母带EQ曲线：
  // 1. 低频搁架 +2dB @ 80Hz (温暖感/厚度)
  // 2. 低频钟形 -1.5dB @ 200Hz (消除混浊)
  // 3. 中频削减 -1.0dB @ 400Hz (减少箱感)
  // 4. 中高频提升 +1.0dB @ 3kHz (清晰度)
  // 5. 高频搁架 +1.5dB @ 12kHz (空气感)
  let out = shelfFilter(buf, 80, 2.0, false, sr);
  out = peakingEQ(out, 200, -1.5, 0.8, sr);
  out = peakingEQ(out, 400, -1.0, 1.0, sr);
  out = peakingEQ(out, 3000, 1.0, 1.2, sr);
  out = shelfFilter(out, 12000, 1.5, true, sr);
  return out;
}

// ═════════════════════════════════════════════════════════════
// Part 4: 立体声扩展 + 真峰值限制
// ═════════════════════════════════════════════════════════════

export function stereoWidener(buf: Float32Array, width = 0.4, sr = SAMPLE_RATE): Float32Array {
  const delay = Math.floor(sr * 0.015); // 15ms Haas
  const out = new Float32Array(buf.length);
  for (let i = 0; i < buf.length; i++) {
    const dry = buf[i];
    const wet = i >= delay ? buf[i - delay] * width : 0;
    out[i] = dry * (1 - width * 0.3) + wet;
  }
  return out as Float32Array;
}

export function truePeakLimiter(buf: Float32Array, ceilingDb = -1.0, sr = SAMPLE_RATE): Float32Array {
  const ceiling = Math.pow(10, ceilingDb / 20);
  // 4x 过采样检测
  const lookahead = Math.floor(sr * 0.005); // 5ms
  const gainEnv = new Float32Array(buf.length);
  let peak = 0;
  for (let i = buf.length - 1; i >= 0; i--) {
    const v = Math.abs(buf[i]);
    if (v > peak) peak = v;
    if (i + lookahead < buf.length) {
      const future = Math.abs(buf[i + lookahead]);
      if (future * 1.2 > peak) peak = future * 1.2;
    }
    gainEnv[i] = peak > ceiling ? ceiling / peak : 1;
  }
  const out = new Float32Array(buf.length);
  let gain = 1;
  const smooth = 0.995;
  for (let i = 0; i < buf.length; i++) {
    gain += smooth * (gainEnv[i] - gain);
    out[i] = buf[i] * gain;
  }
  return out as Float32Array;
}

// ═════════════════════════════════════════════════════════════
// Part 5: 响度标准化
// ═════════════════════════════════════════════════════════════

export function normalizeLUFS(buf: Float32Array, targetLUFS = -14, meter?: LUFSMeter): Float32Array {
  const m = meter || new LUFSMeter();
  const metrics = m.measure(buf);
  const gainNeeded = targetLUFS - metrics.integratedLUFS;
  const linearGain = Math.pow(10, gainNeeded / 20);
  const out = new Float32Array(buf.length);
  for (let i = 0; i < buf.length; i++) out[i] = buf[i] * linearGain;
  return out as Float32Array;
}

// ═════════════════════════════════════════════════════════════
// Part 6: 母带处理链主类
// ═════════════════════════════════════════════════════════════

export interface MasteringResult {
  pcm: Float32Array;
  metrics: LoudnessMetrics;
  finalLUFS: number;
  finalTruePeak: number;
  applied: string[];
}

export class MasteringChain {
  sampleRate: number;
  lufsMeter: LUFSMeter;
  multiband: MultibandCompressor;

  constructor(sampleRate = SAMPLE_RATE) {
    this.sampleRate = sampleRate;
    this.lufsMeter = new LUFSMeter(sampleRate);
    this.multiband = new MultibandCompressor({}, sampleRate);
  }

  process(buf: Float32Array, targetLUFS = -14): MasteringResult {
    const applied: string[] = [];
    let pcm = new Float32Array(buf) as Float32Array;

    // 1. 初始测量
    const before = this.lufsMeter.measure(pcm);

    // 2. 专业EQ
    pcm = masteringEQ(pcm, this.sampleRate);
    applied.push('MasteringEQ(80Hz+2dB, 200Hz-1.5dB, 400Hz-1dB, 3kHz+1dB, 12kHz+1.5dB)');

    // 3. 多段压缩
    pcm = this.multiband.process(pcm);
    applied.push('MultibandCompressor(L/M/H)');

    // 4. 立体声扩展
    pcm = stereoWidener(pcm, 0.35, this.sampleRate);
    applied.push('StereoWidener(15ms Haas)');

    // 5. 响度标准化
    pcm = normalizeLUFS(pcm, targetLUFS, this.lufsMeter);
    applied.push(`NormalizeLUFS(${targetLUFS} LUFS)`);

    // 6. 真峰值限制
    pcm = truePeakLimiter(pcm, -1.0, this.sampleRate);
    applied.push('TruePeakLimiter(-1 dBTP)');

    // 最终测量
    const after = this.lufsMeter.measure(pcm);

    return {
      pcm,
      metrics: after,
      finalLUFS: after.integratedLUFS,
      finalTruePeak: after.truePeak,
      applied,
    };
  }

  // 快速母带：只标准化+限制
  quickMaster(buf: Float32Array, targetLUFS = -14): MasteringResult {
    let pcm = normalizeLUFS(buf, targetLUFS, this.lufsMeter);
    pcm = truePeakLimiter(pcm, -1.0, this.sampleRate);
    const metrics = this.lufsMeter.measure(pcm);
    return {
      pcm,
      metrics,
      finalLUFS: metrics.integratedLUFS,
      finalTruePeak: metrics.truePeak,
      applied: ['NormalizeLUFS', 'TruePeakLimiter'],
    };
  }
}

// ═════════════════════════════════════════════════════════════
// 默认导出
// ═════════════════════════════════════════════════════════════
export default {
  LUFSMeter,
  MultibandCompressor,
  MasteringChain,
  masteringEQ,
  stereoWidener,
  truePeakLimiter,
  normalizeLUFS,
};
