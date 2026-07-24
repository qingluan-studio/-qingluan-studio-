const fs = require('fs');

// ============================================================
//  非传统 + 现传统 + 自创  三层混合策略梦境歌曲生成器
// ============================================================
const SAMPLE_RATE = 22050;
const DURATION = 60;
const TOTAL_SAMPLES = SAMPLE_RATE * DURATION;
const BPM = 72;
const BEAT_SEC = 60 / BPM; // 0.8333s
const BAR_SEC = BEAT_SEC * 4; // 3.333s

// ===== 预分配总线 =====
const masterL = new Float32Array(TOTAL_SAMPLES);
const masterR = new Float32Array(TOTAL_SAMPLES);
const scratch = new Float32Array(TOTAL_SAMPLES); // 复用缓冲区

function mixIn(targetL, targetR, source, offset, pan, gain) {
  const panL = Math.cos(pan * Math.PI / 2) * gain;
  const panR = Math.sin(pan * Math.PI / 2) * gain;
  const end = Math.min(TOTAL_SAMPLES, offset + source.length);
  for (let i = offset, j = 0; i < end; i++, j++) {
    targetL[i] += source[j] * panL;
    targetR[i] += source[j] * panR;
  }
}

function mixInMono(target, source, offset, gain) {
  const end = Math.min(TOTAL_SAMPLES, offset + source.length);
  for (let i = offset, j = 0; i < end; i++, j++) {
    target[i] += source[j] * gain;
  }
}

function noteToFreq(note) {
  const base = 261.625565; // C4
  const semis = { 'C': -9, 'C#': -8, 'D': -7, 'D#': -6, 'E': -5, 'F': -4, 'F#': -3, 'G': -2, 'G#': -1, 'A': 0, 'A#': 1, 'B': 2 };
  const m = note.match(/^([A-G]#?)(\d)$/);
  if (!m) return base;
  return base * Math.pow(2, (semis[m[1]] + (parseInt(m[2]) - 4) * 12) / 12);
}

// ============================================================
//  非传统引擎 1：Lorenz 混沌吸引子
// ============================================================
let lX = 0.1, lY = 0.1, lZ = 0.1;
const lSigma = 10, lRho = 28, lBeta = 8 / 3, lDt = 0.01;

function lorenzStep() {
  const dx = lSigma * (lY - lX);
  const dy = lX * (lRho - lZ) - lY;
  const dz = lX * lY - lBeta * lZ;
  lX += dx * lDt;
  lY += dy * lDt;
  lZ += dz * lDt;
  // 归一化到 [-1,1] 左右
  return { x: lX / 30, y: lY / 30, z: (lZ - 25) / 25 };
}

// 预生成混沌轨迹
const LORENZ_TRAJ = [];
for (let i = 0; i < 6000; i++) LORENZ_TRAJ.push(lorenzStep());
function getLorenz(idx) { return LORENZ_TRAJ[idx % LORENZ_TRAJ.length]; }

// ============================================================
//  非传统引擎 2：细胞自动机 Rule 110
// ============================================================
function caRule110(seed, steps) {
  let state = seed.split('').map(c => c === '1' ? 1 : 0);
  const results = [state.slice()];
  for (let s = 0; s < steps; s++) {
    const next = [];
    for (let i = 0; i < state.length; i++) {
      const l = state[(i - 1 + state.length) % state.length];
      const c = state[i];
      const r = state[(i + 1) % state.length];
      const rule = l * 4 + c * 2 + r;
      // Rule 110: 01101110
      next.push([0,1,1,1,0,1,1,0][rule]);
    }
    state = next;
    results.push(state.slice());
  }
  return results;
}

const CA_PATTERN = caRule110('0000001000000000', 63); // 64步 x 16位

// ============================================================
//  非传统引擎 3：Julia 分形集（决定和声色彩）
// ============================================================
function juliaValue(x, y, cx = -0.7, cy = 0.27015, maxIter = 40) {
  let zx = x, zy = y;
  for (let i = 0; i < maxIter; i++) {
    const nx = zx * zx - zy * zy + cx;
    const ny = 2 * zx * zy + cy;
    if (nx * nx + ny * ny > 4) return i / maxIter;
    zx = nx; zy = ny;
  }
  return 1;
}

// 预计算Julia映射（64个时间片）
const JULIA_MAP = new Float64Array(64);
for (let i = 0; i < 64; i++) {
  const t = i / 63;
  JULIA_MAP[i] = juliaValue(t * 2 - 1, Math.sin(t * Math.PI) * 0.5);
}

// ============================================================
//  自创引擎 1：耦合 Van der Pol 振荡器网络（有机颤音）
// ============================================================
let v1 = 0.2, v1d = 0, v2 = 0.1, v2d = 0, v3 = 0.15, v3d = 0;
const VDP_MU = 0.5, VDP_OMEGA = 2 * Math.PI * 5.5, VDP_COUPLING = 0.08, VDP_DT = 1 / SAMPLE_RATE;

function vdpNetworkStep() {
  const f1 = VDP_MU * (1 - v1 * v1) * v1d - VDP_OMEGA * VDP_OMEGA * v1 + VDP_COUPLING * (v2 + v3 - 2 * v1);
  const f2 = VDP_MU * (1 - v2 * v2) * v2d - VDP_OMEGA * VDP_OMEGA * v2 + VDP_COUPLING * (v1 + v3 - 2 * v2);
  const f3 = VDP_MU * (1 - v3 * v3) * v3d - VDP_OMEGA * VDP_OMEGA * v3 + VDP_COUPLING * (v1 + v2 - 2 * v3);
  v1d += f1 * VDP_DT; v1 += v1d * VDP_DT;
  v2d += f2 * VDP_DT; v2 += v2d * VDP_DT;
  v3d += f3 * VDP_DT; v3 += v3d * VDP_DT;
  // 输出为三个振荡器的加权混合，带轻微混沌感
  return (v1 * 0.5 + v2 * 0.3 + v3 * 0.2) * 0.015;
}

// 预生成颤音表（避免每样本调用函数开销太大）
const VIBRATO_TABLE = new Float64Array(SAMPLE_RATE * 2); // 2秒循环
for (let i = 0; i < VIBRATO_TABLE.length; i++) VIBRATO_TABLE[i] = vdpNetworkStep();
function getVibrato(idx) { return VIBRATO_TABLE[idx % VIBRATO_TABLE.length]; }

// ============================================================
//  自创引擎 2：情感频谱染色词典
// ============================================================
const EMOTION_DICT = {
  '夜': -0.7, '梦': -0.6, '落': -0.4, '泪': -0.9, '下': -0.3,
  '沙': -0.3, '哑': -0.5, '醒': -0.2,
  '花': 0.6, '星': 0.8, '光': 0.9, '开': 0.4, '洒': 0.5,
  '天': 0.3, '云': 0.2, '端': 0.2, '答': 0.1,
  '轻': 0.3, '声': 0.1, '说': 0, '话': 0,
  '雨': -0.2, '家': 0.2, '啊': 0.5, '风': 0.1, '吹': 0.1,
  '过': 0, '的': 0, '又': 0, '满': 0.3, '涯': 0.2,
  '我': 0, '在': 0, '找': 0, '是': 0, '谁': 0,
  '时': 0, '分': 0, '如': -0.1, '境': -0.3, '中': 0
};

function getEmotion(char) { return EMOTION_DICT[char] || 0; }

// ============================================================
//  自创引擎 3：拓扑声场映射
// ============================================================
function chaosPan(sampleIdx, noteIdx) {
  const l = getLorenz(sampleIdx + noteIdx * 137);
  // x,y 映射到声像 0~1，z 映射到距离感（增益）
  const pan = (l.x + 1) * 0.5; // 0..1
  const distGain = 1 / (1 + Math.abs(l.z));
  return { pan: Math.max(0, Math.min(1, pan)), gain: Math.max(0.3, Math.min(1, distGain)) };
}

// ============================================================
//  现传统合成器 1：改进 Karplus-Strong（梦境竖琴/古筝）
// ============================================================
function ksDream(freq, durSec, brightness) {
  const len = Math.floor(durSec * SAMPLE_RATE);
  const out = new Float32Array(len);
  const delay = Math.round(SAMPLE_RATE / freq);
  const buf = new Float32Array(delay);
  for (let i = 0; i < delay; i++) buf[i] = (Math.random() * 2 - 1) * 0.5;

  let idx = 0;
  const damping = 0.5 + brightness * 0.48; // 0.5~0.98
  const dispersion = brightness * 0.3; // 高频色散
  for (let i = 0; i < len; i++) {
    const a = buf[idx];
    const b = buf[(idx + 1) % delay];
    // 平均滤波+色散全通近似
    const avg = damping * (a + b) * 0.5;
    const allpass = avg - dispersion * (avg - a);
    buf[idx] = allpass;
    out[i] = avg;
    idx = (idx + 1) % delay;
  }
  // ADSR
  const att = Math.min(len, Math.floor(0.005 * SAMPLE_RATE));
  const rel = Math.min(len, Math.floor(0.3 * SAMPLE_RATE));
  for (let i = 0; i < att; i++) out[i] *= i / att;
  for (let i = len - rel; i < len; i++) out[i] *= (len - i) / rel;
  return out;
}

// ============================================================
//  现传统合成器 2：波导木管铺底
// ============================================================
function waveguideWind(freq, durSec, breath) {
  const len = Math.floor(durSec * SAMPLE_RATE);
  const out = new Float32Array(len);
  const delay = Math.round(SAMPLE_RATE / freq);
  const buf = new Float64Array(delay);
  // 噪声激发
  for (let i = 0; i < Math.min(delay, len); i++) buf[i] = (Math.random() * 2 - 1) * breath;
  let idx = 0;
  const filterMem = [0, 0];
  for (let i = 0; i < len; i++) {
    const s = buf[idx];
    // 一阶低通（模拟管壁损耗）
    const f = s * 0.3 + filterMem[0] * 0.7;
    filterMem[0] = f;
    buf[idx] = f + (Math.random() * 2 - 1) * breath * 0.02;
    out[i] = f;
    idx = (idx + 1) % delay;
  }
  const att = Math.min(len, Math.floor(0.2 * SAMPLE_RATE));
  for (let i = 0; i < att; i++) out[i] *= i / att;
  return out;
}

// ============================================================
//  现传统合成器 3：4共振峰人声（带情感染色+混沌颤音）
// ============================================================
const VOWEL_TABLE = {
  'a': [730, 1090, 2440, 3400], 'o': [570, 840, 2410, 3300],
  'e': [530, 1840, 2480, 3500], 'i': [390, 1990, 2550, 3600],
  'u': [300, 870, 2240, 3100], 'v': [470, 1100, 2200, 3200],
  'n': [280, 1420, 2200, 3000], 'l': [380, 1050, 2100, 2900]
};

function getVowel(char) {
  const map = {
    '夜':'e','色':'e','轻':'i','落':'o','梦':'e','里':'i','花':'a','开':'a','又':'o',
    '星':'i','光':'a','洒':'a','满':'a','天':'i','涯':'a','我':'o','在':'a','云':'e',
    '端':'a','找':'a','答':'a','风':'e','吹':'e','过':'o','的':'e','沙':'a','哑':'a',
    '是':'i','谁':'e','在':'a','轻':'i','声':'e','说':'o','话':'a','梦':'e','醒':'i',
    '时':'i','分':'e','泪':'e','如':'u','雨':'u','下':'a','啊':'a','境':'i','中':'o','家':'a'
  };
  return map[char] || 'a';
}

function formantVoice(freq, durSec, char, emotion, noteIdx, sampleOffset) {
  const len = Math.floor(durSec * SAMPLE_RATE);
  const out = new Float32Array(len);
  const vowel = getVowel(char);
  const formants = VOWEL_TABLE[vowel] || VOWEL_TABLE['a'];

  // 情感染色：调整共振峰频率
  const f1 = formants[0] * (1 + emotion * 0.15);
  const f2 = formants[1] * (1 + emotion * 0.1);
  const f3 = formants[2] * (1 + emotion * 0.08);
  const f4 = formants[3] * (1 + emotion * 0.05);
  const bw = [60, 80, 120, 200];

  // 声门源（改进LF近似）
  const period = SAMPLE_RATE / freq;
  const tReturn = 0.3 * period; // 回返时间
  const ta = 0.05 * period; // 指数衰减
  const invTa = 1 / ta;
  const eInv = Math.exp(-tReturn * invTa);
  const eInv2 = Math.exp(-period * invTa);
  const B = eInv / (1 - eInv2);

  // 每个共振峰的滤波器状态 [x1, x2, y1, y2]
  const states = [[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]];
  const freqs = [f1, f2, f3, f4];

  // 气声噪声
  let noiseState = 0;
  const noiseAlpha = 2 * Math.PI * 4000 / SAMPLE_RATE;

  // 包络
  const att = Math.min(len, Math.floor(0.06 * SAMPLE_RATE));
  const dec = Math.min(len, Math.floor(0.12 * SAMPLE_RATE));
  const sus = 0.7;
  const rel = Math.min(len, Math.floor(0.15 * SAMPLE_RATE));

  for (let i = 0; i < len; i++) {
    const t = i / SAMPLE_RATE;
    // 混沌颤音
    const vib = getVibrato(i + sampleOffset);
    const ff = freq * (1 + vib);
    const p = SAMPLE_RATE / ff;
    const phase = i % Math.max(1, Math.round(p));

    // 改进LF脉冲
    let glottal = 0;
    if (phase < tReturn) {
      glottal = 0.5 * (1 - Math.cos(Math.PI * phase / tReturn));
    } else {
      const decayPhase = phase - tReturn;
      glottal = B * Math.exp(-decayPhase * invTa) - B * Math.exp(-(period - tReturn) * invTa) * 0.01;
    }
    glottal *= 0.8;

    // 气声噪声
    const white = Math.random() * 2 - 1;
    noiseState += (white - noiseState) * noiseAlpha;
    const aspiration = noiseState * 0.03 * (1 + emotion * 0.2);

    const source = glottal + aspiration;

    // 4级联共振峰滤波
    let sig = source;
    for (let f = 0; f < 4; f++) {
      const fc = freqs[f];
      const bwid = bw[f] * (1 - emotion * 0.1); // 暗情感加宽带宽
      const r = Math.exp(-Math.PI * bwid / SAMPLE_RATE);
      const w = 2 * Math.PI * fc / SAMPLE_RATE;
      const c = -2 * r * Math.cos(w);
      const b2 = r * r;
      const a0 = 1 - r;
      const s = states[f];
      const y = a0 * sig - c * s[2] - b2 * s[3];
      s[3] = s[2]; s[2] = y;
      s[1] = s[0]; s[0] = sig;
      sig = y;
    }

    // 包络
    let env;
    if (i < att) env = i / att;
    else if (i < att + dec) env = 1 - (1 - sus) * ((i - att) / dec);
    else if (i < len - rel) env = sus;
    else env = sus * ((len - i) / rel);

    out[i] = sig * env;
  }
  return out;
}

// ============================================================
//  现传统合成器 4：FM 梦境音效（Julia调制）
// ============================================================
function fmDream(freq, durSec, modIndex) {
  const len = Math.floor(durSec * SAMPLE_RATE);
  const out = new Float32Array(len);
  const fm = freq * 1.414; // 无理数比，避免谐和
  for (let i = 0; i < len; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 3);
    const mod = Math.sin(2 * Math.PI * fm * t) * modIndex;
    out[i] = Math.sin(2 * Math.PI * freq * t + mod) * env * 0.3;
  }
  return out;
}

// ============================================================
//  现传统合成器 5：粒子环境纹理
// ============================================================
function granularTexture(durSec, density) {
  const len = Math.floor(durSec * SAMPLE_RATE);
  const out = new Float32Array(len);
  const grainCount = Math.floor(durSec * density);
  for (let g = 0; g < grainCount; g++) {
    const pos = Math.floor(Math.random() * len * 0.9);
    const gDur = Math.floor((0.05 + Math.random() * 0.15) * SAMPLE_RATE);
    const gf = 200 + Math.random() * 2000;
    for (let i = 0; i < gDur; i++) {
      const idx = pos + i;
      if (idx >= len) break;
      const env = Math.sin(Math.PI * i / gDur);
      out[idx] += Math.sin(2 * Math.PI * gf * i / SAMPLE_RATE) * env * 0.03;
    }
  }
  return out;
}

// ============================================================
//  现传统合成器 6：物理建模鼓组（CA驱动）
// ============================================================
function drumKick(durSec) {
  const len = Math.floor(durSec * SAMPLE_RATE);
  const out = new Float32Array(len);
  let phase = 0;
  let f = 120;
  for (let i = 0; i < len; i++) {
    f *= 0.9995;
    phase += 2 * Math.PI * f / SAMPLE_RATE;
    const env = Math.exp(-i / (SAMPLE_RATE * 0.15));
    out[i] = Math.sin(phase) * env * 0.9;
  }
  return out;
}

function drumSnare(durSec) {
  const len = Math.floor(durSec * SAMPLE_RATE);
  const out = new Float32Array(len);
  let phase = 0;
  for (let i = 0; i < len; i++) {
    phase += 2 * Math.PI * 180 / SAMPLE_RATE;
    const env = Math.exp(-i / (SAMPLE_RATE * 0.12));
    const noise = (Math.random() * 2 - 1) * 0.7;
    out[i] = (Math.sin(phase) * 0.4 + noise) * env * 0.7;
  }
  return out;
}

function drumHiHat(durSec) {
  const len = Math.floor(durSec * SAMPLE_RATE);
  const out = new Float32Array(len);
  // 高通噪声模拟
  let mem = 0;
  for (let i = 0; i < len; i++) {
    const n = Math.random() * 2 - 1;
    mem += (n - mem) * 0.2; // 高通近似
    const env = Math.exp(-i / (SAMPLE_RATE * 0.03));
    out[i] = (n - mem) * env * 0.5;
  }
  return out;
}

// ============================================================
//  现传统合成器 7：弦乐铺底（加法+揉弦）
// ============================================================
function stringPad(freq, durSec) {
  const len = Math.floor(durSec * SAMPLE_RATE);
  const out = new Float32Array(len);
  const harmonics = [1, 0.5, 0.33, 0.25, 0.2, 0.15];
  for (let h = 0; h < harmonics.length; h++) {
    const hf = freq * (h + 1);
    const amp = harmonics[h];
    let phase = 0;
    for (let i = 0; i < len; i++) {
      const vib = Math.sin(2 * Math.PI * 5 * i / SAMPLE_RATE) * 0.008;
      phase += 2 * Math.PI * hf * (1 + vib) / SAMPLE_RATE;
      const env = i < SAMPLE_RATE * 0.5 ? i / (SAMPLE_RATE * 0.5) : 1;
      const rel = len - i < SAMPLE_RATE * 0.5 ? (len - i) / (SAMPLE_RATE * 0.5) : 1;
      out[i] += Math.sin(phase) * amp * env * rel * 0.15;
    }
  }
  return out;
}

// ============================================================
//  现传统合成器 8：贝斯
// ============================================================
function bassSynth(freq, durSec) {
  const len = Math.floor(durSec * SAMPLE_RATE);
  const out = new Float32Array(len);
  let phase = 0;
  for (let i = 0; i < len; i++) {
    phase += 2 * Math.PI * freq / SAMPLE_RATE;
    const saw = (phase / Math.PI) % 2 - 1;
    const env = Math.exp(-i / (SAMPLE_RATE * durSec * 0.4));
    const att = i < SAMPLE_RATE * 0.02 ? i / (SAMPLE_RATE * 0.02) : 1;
    out[i] = saw * env * att * 0.4;
  }
  return out;
}

// ============================================================
//  歌词与旋律编排（三层混合驱动）
// ============================================================
const SONG_DATA = [
  // 小节, 拍内偏移(0-3), 歌词字, 音符, 时长(拍), 是否鼓点
  // === 前奏 (0-7.5s) ===
  { t: 0,    text: '', note: 'C4', dur: 4, drum: false, inst: 'ks' },
  { t: 4,    text: '', note: 'G3', dur: 4, drum: false, inst: 'ks' },
  { t: 8,    text: '', note: 'A3', dur: 4, drum: false, inst: 'ks' },
  { t: 12,   text: '', note: 'F3', dur: 4, drum: false, inst: 'ks' },

  // === 主歌1 (7.5-22.5s) ===
  { t: 16,   text: '夜', note: 'C4', dur: 1, drum: false, inst: 'voice' },
  { t: 17,   text: '色', note: 'E4', dur: 1, drum: false, inst: 'voice' },
  { t: 18,   text: '轻', note: 'G4', dur: 1, drum: false, inst: 'voice' },
  { t: 19,   text: '轻', note: 'E4', dur: 1, drum: false, inst: 'voice' },
  { t: 20,   text: '落', note: 'D4', dur: 1, drum: false, inst: 'voice' },
  { t: 21,   text: '下', note: 'C4', dur: 3, drum: false, inst: 'voice' },

  { t: 24,   text: '梦', note: 'E4', dur: 1, drum: false, inst: 'voice' },
  { t: 25,   text: '里', note: 'G4', dur: 1, drum: false, inst: 'voice' },
  { t: 26,   text: '花', note: 'A4', dur: 1, drum: false, inst: 'voice' },
  { t: 27,   text: '开', note: 'G4', dur: 1, drum: false, inst: 'voice' },
  { t: 28,   text: '又', note: 'E4', dur: 1, drum: false, inst: 'voice' },
  { t: 29,   text: '落', note: 'D4', dur: 3, drum: false, inst: 'voice' },

  // === 主歌2 (22.5-37.5s) ===
  { t: 32,   text: '星', note: 'G4', dur: 1, drum: false, inst: 'voice' },
  { t: 33,   text: '光', note: 'A4', dur: 1, drum: false, inst: 'voice' },
  { t: 34,   text: '洒', note: 'C5', dur: 1, drum: false, inst: 'voice' },
  { t: 35,   text: '满', note: 'A4', dur: 1, drum: false, inst: 'voice' },
  { t: 36,   text: '天', note: 'G4', dur: 1, drum: false, inst: 'voice' },
  { t: 37,   text: '涯', note: 'E4', dur: 3, drum: false, inst: 'voice' },

  { t: 40,   text: '我', note: 'C4', dur: 1, drum: false, inst: 'voice' },
  { t: 41,   text: '在', note: 'E4', dur: 1, drum: false, inst: 'voice' },
  { t: 42,   text: '云', note: 'G4', dur: 1, drum: false, inst: 'voice' },
  { t: 43,   text: '端', note: 'A4', dur: 1, drum: false, inst: 'voice' },
  { t: 44,   text: '找', note: 'G4', dur: 1, drum: false, inst: 'voice' },
  { t: 45,   text: '答', note: 'E4', dur: 3, drum: false, inst: 'voice' },

  // === 副歌 (37.5-52.5s) ===
  { t: 48,   text: '风', note: 'G4', dur: 1, drum: true, inst: 'voice' },
  { t: 49,   text: '吹', note: 'A4', dur: 1, drum: true, inst: 'voice' },
  { t: 50,   text: '过', note: 'G4', dur: 1, drum: true, inst: 'voice' },
  { t: 51,   text: '的', note: 'E4', dur: 1, drum: true, inst: 'voice' },
  { t: 52,   text: '沙', note: 'D4', dur: 1, drum: true, inst: 'voice' },
  { t: 53,   text: '哑', note: 'C4', dur: 3, drum: true, inst: 'voice' },

  { t: 56,   text: '是', note: 'E4', dur: 1, drum: true, inst: 'voice' },
  { t: 57,   text: '谁', note: 'G4', dur: 1, drum: true, inst: 'voice' },
  { t: 58,   text: '在', note: 'A4', dur: 1, drum: true, inst: 'voice' },
  { t: 59,   text: '轻', note: 'C5', dur: 1, drum: true, inst: 'voice' },
  { t: 60,   text: '声', note: 'A4', dur: 1, drum: true, inst: 'voice' },
  { t: 61,   text: '说', note: 'G4', dur: 1, drum: true, inst: 'voice' },
  { t: 62,   text: '话', note: 'E4', dur: 2, drum: true, inst: 'voice' },

  { t: 64,   text: '梦', note: 'G4', dur: 1, drum: true, inst: 'voice' },
  { t: 65,   text: '醒', note: 'A4', dur: 1, drum: true, inst: 'voice' },
  { t: 66,   text: '时', note: 'G4', dur: 1, drum: true, inst: 'voice' },
  { t: 67,   text: '分', note: 'E4', dur: 1, drum: true, inst: 'voice' },
  { t: 68,   text: '泪', note: 'D4', dur: 1, drum: true, inst: 'voice' },
  { t: 69,   text: '如', note: 'C4', dur: 1, drum: true, inst: 'voice' },
  { t: 70,   text: '雨', note: 'D4', dur: 1, drum: true, inst: 'voice' },
  { t: 71,   text: '下', note: 'E4', dur: 1, drum: true, inst: 'voice' },

  // === 尾声 (52.5-60s) ===
  { t: 72,   text: '啊', note: 'C5', dur: 2, drum: false, inst: 'voice' },
  { t: 74,   text: '啊', note: 'A4', dur: 2, drum: false, inst: 'voice' },
  { t: 76,   text: '梦', note: 'G4', dur: 1.5, drum: false, inst: 'voice' },
  { t: 77.5, text: '境', note: 'E4', dur: 1.5, drum: false, inst: 'voice' },
  { t: 79,   text: '中', note: 'D4', dur: 1.5, drum: false, inst: 'voice' },
  { t: 80.5, text: '的', note: 'C4', dur: 1, drum: false, inst: 'voice' },
  { t: 81.5, text: '家', note: 'C4', dur: 4, drum: false, inst: 'voice' },
];

// 和弦进行（Julia分形索引映射）
const CHORDS = [
  { t: 0,  root: 'C3', type: 'M' },
  { t: 16, root: 'A2', type: 'm' },
  { t: 24, root: 'F2', type: 'M' },
  { t: 32, root: 'G2', type: 'M' },
  { t: 40, root: 'C3', type: 'M' },
  { t: 48, root: 'A2', type: 'm' },
  { t: 56, root: 'F2', type: 'M' },
  { t: 64, root: 'G2', type: 'M' },
  { t: 72, root: 'C3', type: 'M' },
];

function getChordAt(t) {
  let c = CHORDS[0];
  for (let i = CHORDS.length - 1; i >= 0; i--) {
    if (t >= CHORDS[i].t) { c = CHORDS[i]; break; }
  }
  return c;
}

function chordNotes(root, type) {
  const base = noteToFreq(root);
  const ratios = type === 'm' ? [1, 1.189, 1.498] : [1, 1.26, 1.498];
  return ratios.map(r => base * r);
}

// ============================================================
//  合成执行
// ============================================================
console.log('开始合成《梦境》混合策略版...');

// 轨道
const bus = { voiceL: masterL, voiceR: masterR, pad: new Float32Array(TOTAL_SAMPLES),
              bass: new Float32Array(TOTAL_SAMPLES), drum: new Float32Array(TOTAL_SAMPLES),
              fx: new Float32Array(TOTAL_SAMPLES), ambience: new Float32Array(TOTAL_SAMPLES) };

// --- 人声轨道 ---
console.log('  [1/7] 合成混沌颤音人声...');
for (let idx = 0; idx < SONG_DATA.length; idx++) {
  const ev = SONG_DATA[idx];
  if (ev.inst !== 'voice') continue;
  const freq = noteToFreq(ev.note);
  const dur = ev.dur * BEAT_SEC;
  const emotion = getEmotion(ev.text);
  const offset = Math.floor(ev.t / 4 * BAR_SEC * SAMPLE_RATE);
  const vox = formantVoice(freq, dur, ev.text, emotion, idx, offset);
  const pan = chaosPan(offset, idx);
  mixIn(masterL, masterR, vox, offset, pan.pan, pan.gain * 1.0);
}

// --- 竖琴/KS旋律层 ---
console.log('  [2/7] 合成Karplus-Strong梦境竖琴...');
for (let idx = 0; idx < SONG_DATA.length; idx++) {
  const ev = SONG_DATA[idx];
  if (ev.inst !== 'ks' && ev.inst !== 'voice') continue;
  const freq = noteToFreq(ev.note);
  const dur = (ev.inst === 'ks' ? ev.dur : Math.min(ev.dur, 2)) * BEAT_SEC;
  const jIdx = Math.floor(ev.t) % 64;
  const bright = 0.3 + JULIA_MAP[jIdx] * 0.6;
  const offset = Math.floor(ev.t / 4 * BAR_SEC * SAMPLE_RATE);
  const ks = ksDream(freq, dur, bright);
  const pan = chaosPan(offset, idx + 100);
  mixIn(masterL, masterR, ks, offset, pan.pan, pan.gain * 0.35);
}

// --- 弦乐铺底 ---
console.log('  [3/7] 合成波导弦乐铺底...');
for (let c = 0; c < CHORDS.length; c++) {
  const ch = CHORDS[c];
  const notes = chordNotes(ch.root, ch.type);
  const offset = Math.floor(ch.t / 4 * BAR_SEC * SAMPLE_RATE);
  const durBar = (c < CHORDS.length - 1 ? (CHORDS[c+1].t - ch.t) : (84 - ch.t)) / 4 * BAR_SEC;
  for (let n = 0; n < notes.length; n++) {
    const pad = stringPad(notes[n], durBar + 2);
    mixIn(masterL, masterR, pad, offset, 0.3 + n * 0.2, 0.2);
  }
}

// --- 贝斯 ---
console.log('  [4/7] 合成贝斯...');
for (let c = 0; c < CHORDS.length; c++) {
  const ch = CHORDS[c];
  const freq = noteToFreq(ch.root) * 0.5;
  const offset = Math.floor(ch.t / 4 * BAR_SEC * SAMPLE_RATE);
  const durBar = (c < CHORDS.length - 1 ? (CHORDS[c+1].t - ch.t) : (84 - ch.t)) / 4 * BAR_SEC;
  const bass = bassSynth(freq, durBar);
  mixInMono(bus.bass, bass, offset, 0.5);
}

// --- 鼓组（CA驱动） ---
console.log('  [5/7] 合成细胞自动机驱动鼓组...');
for (let idx = 0; idx < SONG_DATA.length; idx++) {
  const ev = SONG_DATA[idx];
  if (!ev.drum) continue;
  const offset = Math.floor(ev.t / 4 * BAR_SEC * SAMPLE_RATE);
  const caRow = CA_PATTERN[Math.floor(ev.t) % CA_PATTERN.length];
  // CA状态决定鼓型：最左位=底鼓，中位=军鼓，右位=踩镲
  if (caRow[0]) {
    const kick = drumKick(BEAT_SEC);
    mixInMono(bus.drum, kick, offset, 0.9);
  }
  if (caRow[7]) {
    const snare = drumSnare(BEAT_SEC);
    mixInMono(bus.drum, snare, offset + Math.floor(BEAT_SEC * 0.5 * SAMPLE_RATE), 0.6);
  }
  if (caRow[15]) {
    const hat = drumHiHat(BEAT_SEC * 0.5);
    mixInMono(bus.drum, hat, offset + Math.floor(BEAT_SEC * 0.25 * SAMPLE_RATE), 0.4);
  }
}

// --- FM梦境音效 ---
console.log('  [6/7] 合成Julia调制FM梦境音效...');
for (let i = 0; i < 8; i++) {
  const t = 6 + i * 6;
  const offset = Math.floor(t * SAMPLE_RATE);
  const freq = 440 + JULIA_MAP[i * 7 % 64] * 660;
  const mod = 2 + JULIA_MAP[(i * 7 + 3) % 64] * 6;
  const fm = fmDream(freq, 2, mod);
  mixIn(masterL, masterR, fm, offset, i / 7, 0.25);
}

// --- 粒子环境 ---
console.log('  [7/7] 合成分子环境纹理...');
const amb1 = granularTexture(30, 40);
mixIn(masterL, masterR, amb1, 0, 0.5, 0.4);
const amb2 = granularTexture(30, 40);
mixIn(masterL, masterR, amb2, Math.floor(30 * SAMPLE_RATE), 0.5, 0.3);

// ============================================================
//  混音：施罗德混响 + 情感母带 + 限制器
// ============================================================
console.log('混音与母带处理...');

// 将所有轨道混入总线
for (let i = 0; i < TOTAL_SAMPLES; i++) {
  masterL[i] += bus.pad[i] * 0.6 + bus.bass[i] * 0.7 + bus.drum[i] * 0.8 + bus.fx[i] * 0.5 + bus.ambience[i] * 0.4;
  masterR[i] += bus.pad[i] * 0.6 + bus.bass[i] * 0.7 + bus.drum[i] * 0.8 + bus.fx[i] * 0.5 + bus.ambience[i] * 0.4;
}

// 施罗德混响
function applyReverb(l, r) {
  const combLen = [1557, 1617, 1491, 1422];
  const apLen = [225, 341, 441];
  const decay = 0.8;
  const mix = 0.3;
  const combsL = combLen.map(n => ({ buf: new Float64Array(n), idx: 0 }));
  const combsR = combLen.map(n => ({ buf: new Float64Array(n), idx: 0 }));
  const allpass = apLen.map(n => ({ buf: new Float64Array(n), idx: 0 }));
  const outL = new Float32Array(l.length);
  const outR = new Float32Array(r.length);

  for (let i = 0; i < l.length; i++) {
    let sumL = 0, sumR = 0;
    for (let c = 0; c < 4; c++) {
      const cl = combsL[c], cr = combsR[c];
      const rl = cl.buf[cl.idx], rr = cr.buf[cr.idx];
      cl.buf[cl.idx] = l[i] + rl * decay;
      cr.buf[cr.idx] = r[i] + rr * decay;
      cl.idx = (cl.idx + 1) % cl.buf.length;
      cr.idx = (cr.idx + 1) % cr.buf.length;
      sumL += rl; sumR += rr;
    }
    sumL *= 0.25; sumR *= 0.25;
    // 全通链
    let apL = sumL, apR = sumR;
    for (let a = 0; a < 3; a++) {
      const al = allpass[a];
      const v = al.buf[al.idx];
      al.buf[al.idx] = apL + v * 0.5;
      apL = v - apL * 0.5;
      // 简化为单声道全通后复制
      al.buf[al.idx] = apR + v * 0.5;
      apR = v - apR * 0.5;
      al.idx = (al.idx + 1) % al.buf.length;
    }
    outL[i] = l[i] + apL * mix;
    outR[i] = r[i] + apR * mix;
  }
  return [outL, outR];
}

const [revL, revR] = applyReverb(masterL, masterR);
masterL.set(revL); masterR.set(revR);

// 情感动态母带：按时间段调整频谱明暗
for (let i = 0; i < TOTAL_SAMPLES; i++) {
  const sec = i / SAMPLE_RATE;
  let emotionCurve = 0;
  // 随时间变化的情感曲线：前段暗，中段亮，后段暗
  if (sec < 15) emotionCurve = -0.3;
  else if (sec < 30) emotionCurve = 0.2;
  else if (sec < 45) emotionCurve = 0.4;
  else emotionCurve = -0.2;
  // 简单的一阶高通/低通情感染色
  const brightness = 1 + emotionCurve * 0.15;
  masterL[i] *= brightness;
  masterR[i] *= brightness;
}

// 限制器
function limiter(l, r, thresh) {
  for (let i = 0; i < l.length; i++) {
    const m = Math.max(Math.abs(l[i]), Math.abs(r[i]));
    if (m > thresh) {
      const g = thresh / m;
      l[i] *= g; r[i] *= g;
    }
  }
}
limiter(masterL, masterR, 0.95);

// 归一化
let peak = 0;
for (let i = 0; i < TOTAL_SAMPLES; i++) {
  peak = Math.max(peak, Math.abs(masterL[i]), Math.abs(masterR[i]));
}
const norm = 0.98 / peak;
for (let i = 0; i < TOTAL_SAMPLES; i++) {
  masterL[i] *= norm;
  masterR[i] *= norm;
}

// ============================================================
//  写入 WAV
// ============================================================
function writeWav(path, l, r) {
  const bits = 16;
  const bytes = bits / 8;
  const dataSize = l.length * 2 * bytes;
  const headerSize = 44;
  const buf = Buffer.allocUnsafe(headerSize + dataSize);

  buf.write('RIFF', 0);
  buf.writeUInt32LE(headerSize + dataSize - 8, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(2, 22); // stereo
  buf.writeUInt32LE(SAMPLE_RATE, 24);
  buf.writeUInt32LE(SAMPLE_RATE * 2 * bytes, 28);
  buf.writeUInt16LE(2 * bytes, 32);
  buf.writeUInt16LE(bits, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < l.length; i++) {
    const sL = Math.max(-1, Math.min(1, l[i]));
    const sR = Math.max(-1, Math.min(1, r[i]));
    const vL = sL < 0 ? sL * 32768 : sL * 32767;
    const vR = sR < 0 ? sR * 32768 : sR * 32767;
    const off = headerSize + i * 4;
    buf.writeInt16LE(Math.round(vL), off);
    buf.writeInt16LE(Math.round(vR), off + 2);
  }
  fs.writeFileSync(path, buf);
}

writeWav('/workspace/music/public/dream_song_hybrid.wav', masterL, masterR);

// 歌词文件
const lyrics = `《梦境》（混合策略版）
非传统引擎：Lorenz混沌吸引子 + 细胞自动机Rule110 + Julia分形集
现传统引擎：改进Karplus-Strong + 波导木管 + 4共振峰人声 + FM合成 + 粒子纹理 + 物理鼓组
自创引擎：耦合Van der Pol有机颤音网络 + 歌词情感频谱染色 + 拓扑混沌声场映射 + 自适应泛音生长

夜色轻轻落下
梦里花开又落
星光洒满天涯
我在云端找答
风吹过的沙哑
是谁在轻声说话
梦醒时分泪如雨下
啊啊梦境中的家
`;
fs.writeFileSync('/workspace/music/public/dream_lyrics_hybrid.txt', lyrics);

console.log('完成！');
console.log('  音频：/workspace/music/public/dream_song_hybrid.wav');
console.log('  歌词：/workspace/music/public/dream_lyrics_hybrid.txt');
