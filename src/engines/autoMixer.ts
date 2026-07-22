// ============================================================
// 青鸾 DAW — AI 自动化混音助手 (Auto Mixer)
// ============================================================
// 根据轨道动态特征、风格、乐器类型自动分配混音参数
// ============================================================

const SAMPLE_RATE = 22050;

/** 单轨自动混音参数 */
export interface TrackAutoMixParams {
  gain: number;
  pan: number;
  eqLow: number;
  eqMid: number;
  eqHigh: number;
  compressorThreshold: number;
  compressorRatio: number;
  duckingReduction?: number;
}

/** 自动混音结果：按轨道名称索引 */
export interface AutoMixResult {
  [trackName: string]: TrackAutoMixParams;
}

// ── dB / linear 转换工具 ──

function dbToLinear(db: number): number {
  return Math.pow(10, db / 20);
}

function linearToDb(linear: number): number {
  return 20 * Math.log10(linear + 1e-12);
}

// ── 核心分析 ──

export interface TrackDynamics {
  rms: number;
  peak: number;
  crestFactor: number;
  lra: number;
}

/**
 * 分析轨道动态特征
 * @param trackPCM 单声道 PCM 数据
 */
export function analyzeTrackDynamics(trackPCM: Float32Array): TrackDynamics {
  const len = trackPCM.length;
  if (len === 0) {
    return { rms: 0, peak: 0, crestFactor: 1, lra: 0 };
  }

  // RMS
  let sumSq = 0;
  let peak = 0;
  for (let i = 0; i < len; i++) {
    const v = trackPCM[i];
    sumSq += v * v;
    const absV = Math.abs(v);
    if (absV > peak) peak = absV;
  }
  const rms = Math.sqrt(sumSq / len);

  // Crest Factor
  const crestFactor = rms > 0 ? peak / rms : 1;

  // LRA（Loudness Range）：分块计算短期 RMS，取 95th 与 10th 百分位差
  const blockSize = Math.floor(SAMPLE_RATE * 0.5); // 0.5s 一块
  const blockRMS: number[] = [];
  for (let i = 0; i < len; i += blockSize) {
    let blockSum = 0;
    const end = Math.min(i + blockSize, len);
    const blockLen = end - i;
    for (let j = i; j < end; j++) {
      blockSum += trackPCM[j] * trackPCM[j];
    }
    const blockRms = Math.sqrt(blockSum / blockLen);
    if (blockRms > 0) {
      blockRMS.push(linearToDb(blockRms));
    }
  }

  let lra = 0;
  if (blockRMS.length > 2) {
    blockRMS.sort((a, b) => a - b);
    const p10Index = Math.floor(blockRMS.length * 0.1);
    const p95Index = Math.floor(blockRMS.length * 0.95);
    lra = blockRMS[p95Index] - blockRMS[p10Index];
  }

  return { rms, peak, crestFactor, lra };
}

// ── 风格映射 ──

const STYLE_PAN_MAP: Record<string, Record<string, number>> = {
  default: {
    drumKit: 0,
    bass: 0.05,
    acousticGuitar: -0.3,
    electricGuitar: -0.3,
    piano: 0.3,
    synth: 0.3,
    violin: -0.6,
    cello: 0.6,
    flute: 0.4,
    saxophone: -0.2,
    guzheng: -0.3,
    erhu: 0.2,
    pipa: -0.25,
    dizi: 0.25,
    xiao: 0.3,
    luoGu: 0.1,
    yangQin: 0.2,
    suoNa: -0.1,
    vocal: 0.1,
    melody: 0.1,
    strings: 0.5,
  },
};

function getInstrumentPan(instrument: string, _style: string): number {
  const map = STYLE_PAN_MAP.default;
  return map[instrument] ?? (Math.random() * 0.4 - 0.2);
}

// ── EQ 预设 ──

interface EQPreset {
  eqLow: number;
  eqMid: number;
  eqHigh: number;
}

function getInstrumentEQ(instrument: string): EQPreset {
  switch (instrument) {
    case 'bass':
      return { eqLow: 3, eqMid: -2, eqHigh: 0 };
    case 'acousticGuitar':
    case 'electricGuitar':
      return { eqLow: -3, eqMid: 0, eqHigh: 2 };
    case 'vocal':
    case 'melody':
      return { eqLow: -2, eqMid: 0, eqHigh: 3 };
    case 'violin':
    case 'cello':
    case 'strings':
    case 'erhu':
      return { eqLow: 0, eqMid: 0, eqHigh: 4 };
    case 'drumKit':
      return { eqLow: 2, eqMid: 1, eqHigh: 1 };
    case 'piano':
    case 'yangQin':
      return { eqLow: 0, eqMid: -1, eqHigh: 1 };
    case 'synth':
      return { eqLow: 1, eqMid: 0, eqHigh: 2 };
    default:
      return { eqLow: 0, eqMid: 0, eqHigh: 0 };
  }
}

// ── 智能闪避检测 ──

/**
 * 检测底鼓瞬态能量，返回平均闪避衰减量 (dB)
 */
function detectKickDucking(
  drumPCM: Float32Array,
  sampleRate: number
): number {
  const attackSamples = Math.ceil(sampleRate * 0.005); // 5ms
  const releaseSamples = Math.ceil(sampleRate * 0.08); // 80ms
  const blockSize = Math.ceil(sampleRate * 0.01); // 10ms 块

  let transientCount = 0;
  let totalReductionDb = 0;

  for (let i = 0; i < drumPCM.length; i += blockSize) {
    const end = Math.min(i + blockSize, drumPCM.length);
    let blockMax = 0;
    for (let j = i; j < end; j++) {
      const absV = Math.abs(drumPCM[j]);
      if (absV > blockMax) blockMax = absV;
    }

    // 检测瞬态：当前块能量显著高于周围
    const lookBehind = Math.max(0, i - releaseSamples);
    const lookAhead = Math.min(drumPCM.length, end + attackSamples);
    let surroundingMax = 0;
    for (let j = lookBehind; j < lookAhead; j++) {
      if (j < i || j >= end) {
        const absV = Math.abs(drumPCM[j]);
        if (absV > surroundingMax) surroundingMax = absV;
      }
    }

    if (blockMax > surroundingMax * 1.8 && blockMax > 0.3) {
      transientCount++;
      // 衰减量 2-4dB，根据瞬态强度决定
      const reductionDb = 2 + Math.min(2, (blockMax - 0.3) * 4);
      totalReductionDb += reductionDb;
    }
  }

  return transientCount > 0 ? totalReductionDb / transientCount : 0;
}

// ── 主混音函数 ──

/**
 * AI 自动混音
 * @param tracks 轨道 PCM 数据 Map（key 为乐器名）
 * @param style 音乐风格
 */
export function autoMixTracks(
  tracks: Map<string, Float32Array>,
  style: string
): AutoMixResult {
  const result: AutoMixResult = {};
  const dynamics = new Map<string, TrackDynamics>();

  // 1. 分析所有轨道动态
  for (const [name, pcm] of tracks.entries()) {
    dynamics.set(name, analyzeTrackDynamics(pcm));
  }

  // 2. 找到鼓组参考
  const drumPCM = tracks.get('drumKit');
  const drumDynamics = dynamics.get('drumKit');
  const drumRMS = drumDynamics?.rms ?? 0.1;
  const drumRefGain = dbToLinear(-6); // 鼓组目标 -6dB

  // 目标总混音 RMS 接近 -14 LUFS（近似对应 RMS linear ~0.15）
  const targetTotalRMS = 0.15;

  // 3. 计算闪避量（如果存在鼓组）
  let duckingDb = 0;
  if (drumPCM && drumPCM.length > 0) {
    duckingDb = detectKickDucking(drumPCM, SAMPLE_RATE);
    if (duckingDb < 1.5) duckingDb = 2; // 最小 2dB
    if (duckingDb > 4) duckingDb = 4; // 最大 4dB
  }

  // 4. 逐轨计算参数
  for (const [name, dyn] of dynamics.entries()) {
    const instrument = name;
    const eq = getInstrumentEQ(instrument);

    // 声像
    const pan = getInstrumentPan(instrument, style);

    // 增益：以鼓组为参考，根据 RMS 差异调整
    let gain: number;
    if (instrument === 'drumKit') {
      gain = drumRefGain;
    } else {
      // 基础增益 = 鼓参考增益 * (鼓RMS / 当前RMS)
      const balanceGain =
        dyn.rms > 0 ? (drumRMS / dyn.rms) * drumRefGain : drumRefGain;
      // 根据乐器类型微调
      const instrumentGainMap: Record<string, number> = {
        bass: 0.9,
        vocal: 1.1,
        melody: 1.1,
        acousticGuitar: 0.95,
        electricGuitar: 0.9,
        piano: 0.95,
        synth: 0.85,
        violin: 0.9,
        cello: 0.9,
        strings: 0.85,
        flute: 0.9,
        saxophone: 0.95,
        guzheng: 0.9,
        erhu: 1.0,
        pipa: 0.9,
        dizi: 0.9,
        xiao: 0.9,
        luoGu: 1.0,
        yangQin: 0.9,
        suoNa: 1.0,
      };
      const typeMul = instrumentGainMap[instrument] ?? 0.9;
      gain = balanceGain * typeMul;
    }

    // 将总预期 RMS 拉向目标
    const trackCount = tracks.size;
    if (trackCount > 0) {
      // 简单假设：各轨不相关，总能量 ≈ sqrt(sum(gain_i^2 * rms_i^2))
      // 这里做个经验微调，让 gain 不要太夸张
      gain = Math.min(1.5, Math.max(0.05, gain));
    }

    // 压缩器参数
    const crestFactor = dyn.crestFactor;
    const ratio = crestFactor > 15 ? 4 : 2;
    const thresholdDb = linearToDb(dyn.rms) + 6;
    const thresholdLinear = dbToLinear(thresholdDb);

    // 闪避：对 bass 和 vocal/melody 应用
    let duckingReduction: number | undefined;
    if (
      duckingDb > 0 &&
      (instrument === 'bass' || instrument === 'vocal' || instrument === 'melody')
    ) {
      duckingReduction = duckingDb;
      // 闪避时预降低静态增益（补偿平均电平）
      gain *= dbToLinear(-duckingDb * 0.3);
    }

    result[name] = {
      gain: parseFloat(gain.toFixed(4)),
      pan: parseFloat(pan.toFixed(2)),
      eqLow: eq.eqLow,
      eqMid: eq.eqMid,
      eqHigh: eq.eqHigh,
      compressorThreshold: parseFloat(thresholdLinear.toFixed(4)),
      compressorRatio: ratio,
      duckingReduction,
    };
  }

  return result;
}

// ── 应用自动混音到多轨 ──

/**
 * 根据 AutoMixResult 将多轨混音为单声道/立体声
 * 简单实现：应用每轨 gain + 声像 → 立体声 interleaved
 */
export function applyAutoMix(
  tracks: Map<string, Float32Array>,
  mixSettings: AutoMixResult,
  sampleRate: number
): Float32Array {
  let maxLen = 0;
  for (const pcm of tracks.values()) {
    if (pcm.length > maxLen) maxLen = pcm.length;
  }
  if (maxLen === 0) return new Float32Array(0);

  const stereo = new Float32Array(maxLen * 2);

  for (const [name, pcm] of tracks.entries()) {
    const params = mixSettings[name];
    if (!params) continue;

    const gain = params.gain;
    const pan = params.pan; // -1 ~ 1
    const leftGain = gain * (1 - Math.max(0, pan));
    const rightGain = gain * (1 + Math.min(0, pan));
    // 更标准的声像律：
    // pan < 0: left = gain, right = gain * (1 + pan)
    // pan > 0: left = gain * (1 - pan), right = gain
    const panLeft = pan <= 0 ? gain : gain * (1 - pan);
    const panRight = pan >= 0 ? gain : gain * (1 + pan);

    for (let i = 0; i < pcm.length; i++) {
      const v = pcm[i];
      stereo[i * 2] += v * panLeft;
      stereo[i * 2 + 1] += v * panRight;
    }
  }

  // 软限幅防止削波
  const limiterThreshold = 0.98;
  for (let i = 0; i < stereo.length; i++) {
    if (stereo[i] > limiterThreshold) {
      stereo[i] = limiterThreshold + (stereo[i] - limiterThreshold) * 0.1;
    } else if (stereo[i] < -limiterThreshold) {
      stereo[i] = -limiterThreshold + (stereo[i] + limiterThreshold) * 0.1;
    }
  }

  return stereo;
}

// ── 默认导出 ──
export default {
  analyzeTrackDynamics,
  autoMixTracks,
  applyAutoMix,
};
