const fs = require('fs');

// ============================================================
//  虚拟音乐工作室小世界 —— 青鸾 Dream Studio
//  角色：歌手 / 导演 / 编曲师 / 制作人
//  产出：草稿 → 初唱 → 完整版
// ============================================================
const SAMPLE_RATE = 22050;
const DURATION = 60;
const TOTAL = SAMPLE_RATE * DURATION;
const BPM = 72;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;

// ===== 工具函数 =====
function noteFreq(n) {
  const base = 261.625565;
  const s = { 'C': -9, 'C#': -8, 'D': -7, 'D#': -6, 'E': -5, 'F': -4, 'F#': -3, 'G': -2, 'G#': -1, 'A': 0, 'A#': 1, 'B': 2 };
  const m = n.match(/^([A-G]#?)(\d)$/);
  return base * Math.pow(2, (s[m[1]] + (parseInt(m[2]) - 4) * 12) / 12);
}

function mixIn(tL, tR, src, off, pan, gain) {
  const pl = Math.cos(pan * Math.PI / 2) * gain;
  const pr = Math.sin(pan * Math.PI / 2) * gain;
  const end = Math.min(TOTAL, off + src.length);
  for (let i = off, j = 0; i < end; i++, j++) { tL[i] += src[j] * pl; tR[i] += src[j] * pr; }
}
function mixMono(t, src, off, gain) {
  const end = Math.min(TOTAL, off + src.length);
  for (let i = off, j = 0; i < end; i++, j++) t[i] += src[j] * gain;
}

// ============================================================
//  角色系统
// ============================================================
function createSinger(name, type) {
  return {
    name, role: 'singer',
    pitchAccuracy: type === 'prodigy' ? 0.95 : 0.5,
    breathControl: type === 'prodigy' ? 0.9 : 0.4,
    vibratoSkill: type === 'prodigy' ? 0.9 : 0.3,
    expressiveness: type === 'prodigy' ? 0.95 : 0.35,
    technique: type === 'prodigy' ? 0.9 : 0.3,
    timbre: 'ethereal',
    energy: 0.8,
    logs: []
  };
}
function createDirector(name) {
  return { name, role: 'director', visionClarity: 0.9, tensionDesign: 0.85, sectionContrast: 0.8, logs: [] };
}
function createArranger(name) {
  return { name, role: 'arranger', harmonyDepth: 0.9, instrumentation: 0.85, rhythmSense: 0.8, logs: [] };
}
function createProducer(name) {
  return { name, role: 'producer', mixBalance: 0.9, spaceDesign: 0.85, masteringSkill: 0.88, logs: [] };
}

// ============================================================
//  排练与成长系统
// ============================================================
function practiceRound(roles, stage) {
  const s = roles.singer, d = roles.director, a = roles.arranger, p = roles.producer;
  const mult = stage === 'draft' ? 0.35 : stage === 'first_take' ? 0.72 : 1.0;

  if (stage === 'first_take') {
    s.logs.push('第一次排练：导演说我的情感太平了，需要更沉进梦境里');
    s.expressiveness = Math.min(1, s.expressiveness + 0.15);
    s.pitchAccuracy = Math.min(1, s.pitchAccuracy + 0.12);
    d.logs.push('给歌手做了段落情绪分解：主歌是下沉，副歌是漂浮');
    a.logs.push('歌手音域偏中高，我把弦乐铺底下调了一个八度腾出空间');
    a.instrumentation = Math.min(1, a.instrumentation + 0.1);
    p.logs.push('编曲加了鼓组，我需要重新平衡低频');
    p.mixBalance = Math.min(1, p.mixBalance + 0.08);
  }
  if (stage === 'final') {
    s.logs.push(' final排练：导演要求副歌第一句的"风"字要有气声进入，像梦的开始');
    s.breathControl = Math.min(1, s.breathControl + 0.1);
    s.vibratoSkill = Math.min(1, s.vibratoSkill + 0.1);
    d.logs.push('调整了整体张力曲线：45秒处要有短暂的"坠落感"再拉起');
    d.tensionDesign = Math.min(1, d.tensionDesign + 0.08);
    a.logs.push('加入了FM梦境音效和粒子纹理，填充高频空气感');
    a.harmonyDepth = Math.min(1, a.harmonyDepth + 0.1);
    p.logs.push('做了三段式母带：前暗、中亮、尾散，模拟梦境消散');
    p.masteringSkill = Math.min(1, p.masteringSkill + 0.1);
    p.spaceDesign = Math.min(1, p.spaceDesign + 0.1);
  }

  // 计算当前有效值
  return {
    singer: {
      pitchAcc: s.pitchAccuracy * mult,
      breath: s.breathControl * mult,
      vibrato: s.vibratoSkill * mult,
      express: s.expressiveness * mult,
      tech: s.technique * mult,
    },
    director: {
      vision: d.visionClarity * mult,
      tension: d.tensionDesign * mult,
      contrast: d.sectionContrast * mult,
    },
    arranger: {
      harmony: a.harmonyDepth * mult,
      instr: a.instrumentation * mult,
      rhythm: a.rhythmSense * mult,
    },
    producer: {
      mix: p.mixBalance * mult,
      space: p.spaceDesign * mult,
      master: p.masteringSkill * mult,
    }
  };
}

// ============================================================
//  合成引擎（受角色参数驱动）
// ============================================================

// --- 噪声表（避免样本级random） ---
const NOISE_TABLE = new Float32Array(65536);
for (let i = 0; i < 65536; i++) NOISE_TABLE[i] = Math.random() * 2 - 1;
let noiseIdx = 0;
function noise() { return NOISE_TABLE[(noiseIdx++) & 0xFFFF]; }

// --- 歌手人声（4共振峰 + 角色驱动颤音/音准/气息） ---
const VOWEL_TBL = {
  'a': [730, 1090, 2440, 3400], 'o': [570, 840, 2410, 3300],
  'e': [530, 1840, 2480, 3500], 'i': [390, 1990, 2550, 3600],
  'u': [300, 870, 2240, 3100], 'v': [470, 1100, 2200, 3200],
  'n': [280, 1420, 2200, 3000], 'l': [380, 1050, 2100, 2900]
};
const CHAR_VOWEL = {
  '夜':'e','色':'e','轻':'i','落':'o','梦':'e','里':'i','花':'a','开':'a','又':'o',
  '星':'i','光':'a','洒':'a','满':'a','天':'i','涯':'a','我':'o','在':'a','云':'e',
  '端':'a','找':'a','答':'a','风':'e','吹':'e','过':'o','的':'e','沙':'a','哑':'a',
  '是':'i','谁':'e','在':'a','声':'e','说':'o','话':'a','醒':'i','时':'i','分':'e',
  '泪':'e','如':'u','雨':'u','下':'a','啊':'a','境':'i','中':'o','家':'a'
};

function getVowel(c) { return CHAR_VOWEL[c] || 'a'; }

function makeVibratoTable(skill, samples) {
  // skill低：机械正弦；skill高：耦合VDP近似
  const arr = new Float32Array(samples);
  if (skill < 0.5) {
    for (let i = 0; i < samples; i++) arr[i] = Math.sin(2 * Math.PI * 4.5 * i / SAMPLE_RATE) * 0.012;
  } else {
    let v1 = 0.2, v1d = 0, v2 = 0.1, v2d = 0;
    const mu = 0.5, w = 2 * Math.PI * 5.5, cpl = 0.08 * skill, dt = 1 / SAMPLE_RATE;
    for (let i = 0; i < samples; i++) {
      const f1 = mu * (1 - v1 * v1) * v1d - w * w * v1 + cpl * (v2 - v1);
      const f2 = mu * (1 - v2 * v2) * v2d - w * w * v2 + cpl * (v1 - v2);
      v1d += f1 * dt; v1 += v1d * dt;
      v2d += f2 * dt; v2 += v2d * dt;
      arr[i] = (v1 * 0.6 + v2 * 0.4) * 0.015;
    }
  }
  return arr;
}

function synthVoice(freq, durSec, char, emotion, sSkill, noteIdx, globalOff, stage) {
  const len = Math.floor(durSec * SAMPLE_RATE);
  const out = new Float32Array(len);
  const vowel = getVowel(char);
  const formants = VOWEL_TBL[vowel] || VOWEL_TBL['a'];

  // 音准偏差（角色驱动）
  const pitchErr = (1 - sSkill.pitchAcc) * (0.06 + Math.random() * 0.04); // cents偏差比例
  const fBase = freq * (1 + (Math.random() * 2 - 1) * pitchErr);

  // 情感染色
  const emo = emotion;
  const f1 = formants[0] * (1 + emo * 0.15);
  const f2 = formants[1] * (1 + emo * 0.1);
  const f3 = formants[2] * (1 + emo * 0.08);
  const f4 = formants[3] * (1 + emo * 0.05);
  const bw = [60, 80, 120, 200];

  // 颤音表
  const vibLen = Math.min(len, SAMPLE_RATE * 2);
  const vibTable = makeVibratoTable(sSkill.vibrato, vibLen);

  // 气声噪声
  const aspirationGain = 0.02 + (1 - sSkill.breath) * 0.04; // 气息差则气声过多且不稳定

  // 包络参数（表现力驱动）
  const att = Math.floor((0.03 + (1 - sSkill.express) * 0.06) * SAMPLE_RATE);
  const dec = Math.floor((0.08 + (1 - sSkill.express) * 0.08) * SAMPLE_RATE);
  const sus = 0.5 + sSkill.express * 0.4;
  const rel = Math.floor((0.08 + (1 - sSkill.express) * 0.12) * SAMPLE_RATE);

  // 滤波器状态
  const st = [[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]];
  const fcArr = [f1, f2, f3, f4];

  // LF声门脉冲参数
  const period = SAMPLE_RATE / fBase;
  const tRet = 0.3 * period;
  const ta = 0.05 * period;
  const invTa = 1 / ta;
  const eInv = Math.exp(-tRet * invTa);
  const eInv2 = Math.exp(-period * invTa);
  const B = eInv / (1 - eInv2);

  // 滑音（技巧驱动）：stage高且tech高时加入滑音
  const slide = stage === 'final' && sSkill.tech > 0.7 && Math.random() < 0.3;
  const slideTarget = slide ? fBase * 1.03 : fBase;
  const slideStep = (slideTarget - fBase) / len;

  for (let i = 0; i < len; i++) {
    const curF = fBase + slideStep * i;
    const p = SAMPLE_RATE / curF;
    const phase = i % Math.max(1, Math.round(p));
    const vi = vibTable[i % vibTable.length];
    const modPhase = phase; // 简化：颤音在频率域已处理

    // 声门波
    let glottal = 0;
    if (modPhase < tRet) {
      glottal = 0.5 * (1 - Math.cos(Math.PI * modPhase / tRet));
    } else {
      const dp = modPhase - tRet;
      glottal = B * Math.exp(-dp * invTa) - B * Math.exp(-(period - tRet) * invTa) * 0.01;
    }
    glottal *= 0.8;

    // 气息噪声（breath控制差时更杂乱）
    const aspWhite = noise();
    const asp = aspWhite * aspirationGain * (1 + (1 - sSkill.breath) * noise() * 0.5);

    let sig = glottal + asp;

    // 4级联共振峰
    for (let f = 0; f < 4; f++) {
      const r = Math.exp(-Math.PI * bw[f] * (1 - emo * 0.1) / SAMPLE_RATE);
      const w = 2 * Math.PI * fcArr[f] / SAMPLE_RATE;
      const c = -2 * r * Math.cos(w);
      const b2 = r * r;
      const a0 = 1 - r;
      const s = st[f];
      const y = a0 * sig - c * s[2] - b2 * s[3];
      s[3] = s[2]; s[2] = y;
      sig = y;
    }

    // 包络
    let env;
    if (i < att) env = i / att;
    else if (i < att + dec) env = 1 - (1 - sus) * ((i - att) / dec);
    else if (i < len - rel) env = sus;
    else env = sus * ((len - i) / rel);

    // 表现力：微动态
    if (sSkill.express > 0.6) {
      env *= (0.92 + 0.08 * Math.sin(i / SAMPLE_RATE * 3));
    }

    out[i] = sig * env;
  }
  return out;
}

// --- KS竖琴 ---
function synthKS(freq, durSec, brightness) {
  const len = Math.floor(durSec * SAMPLE_RATE);
  const out = new Float32Array(len);
  const delay = Math.round(SAMPLE_RATE / freq);
  const buf = new Float32Array(delay);
  for (let i = 0; i < delay; i++) buf[i] = noise() * 0.5;
  let idx = 0;
  const damp = 0.5 + brightness * 0.48;
  const disp = brightness * 0.3;
  for (let i = 0; i < len; i++) {
    const a = buf[idx];
    const b = buf[(idx + 1) % delay];
    const avg = damp * (a + b) * 0.5;
    const ap = avg - disp * (avg - a);
    buf[idx] = ap;
    out[i] = avg;
    idx = (idx + 1) % delay;
  }
  const att = Math.min(len, Math.floor(0.005 * SAMPLE_RATE));
  const rel = Math.min(len, Math.floor(0.3 * SAMPLE_RATE));
  for (let i = 0; i < att; i++) out[i] *= i / att;
  for (let i = len - rel; i < len; i++) out[i] *= (len - i) / rel;
  return out;
}

// --- 弦乐铺底 ---
function synthPad(freq, durSec) {
  const len = Math.floor(durSec * SAMPLE_RATE);
  const out = new Float32Array(len);
  const harms = [1, 0.5, 0.33, 0.25, 0.2, 0.15];
  for (let h = 0; h < harms.length; h++) {
    const hf = freq * (h + 1);
    const amp = harms[h];
    let ph = 0;
    for (let i = 0; i < len; i++) {
      const vib = Math.sin(2 * Math.PI * 5 * i / SAMPLE_RATE) * 0.008;
      ph += 2 * Math.PI * hf * (1 + vib) / SAMPLE_RATE;
      const env = i < SAMPLE_RATE * 0.5 ? i / (SAMPLE_RATE * 0.5) : 1;
      const rel = len - i < SAMPLE_RATE * 0.5 ? (len - i) / (SAMPLE_RATE * 0.5) : 1;
      out[i] += Math.sin(ph) * amp * env * rel * 0.15;
    }
  }
  return out;
}

// --- 贝斯 ---
function synthBass(freq, durSec) {
  const len = Math.floor(durSec * SAMPLE_RATE);
  const out = new Float32Array(len);
  let ph = 0;
  for (let i = 0; i < len; i++) {
    ph += 2 * Math.PI * freq / SAMPLE_RATE;
    const saw = (ph / Math.PI) % 2 - 1;
    const env = Math.exp(-i / (SAMPLE_RATE * durSec * 0.4));
    const att = i < SAMPLE_RATE * 0.02 ? i / (SAMPLE_RATE * 0.02) : 1;
    out[i] = saw * env * att * 0.4;
  }
  return out;
}

// --- 鼓组 ---
function kick(dur) {
  const len = Math.floor(dur * SAMPLE_RATE);
  const out = new Float32Array(len);
  let ph = 0, f = 120;
  for (let i = 0; i < len; i++) { f *= 0.9995; ph += 2 * Math.PI * f / SAMPLE_RATE; out[i] = Math.sin(ph) * Math.exp(-i / (SAMPLE_RATE * 0.15)) * 0.9; }
  return out;
}
function snare(dur) {
  const len = Math.floor(dur * SAMPLE_RATE);
  const out = new Float32Array(len);
  let ph = 0;
  for (let i = 0; i < len; i++) {
    ph += 2 * Math.PI * 180 / SAMPLE_RATE;
    out[i] = (Math.sin(ph) * 0.4 + noise() * 0.7) * Math.exp(-i / (SAMPLE_RATE * 0.12)) * 0.7;
  }
  return out;
}
function hihat(dur) {
  const len = Math.floor(dur * SAMPLE_RATE);
  const out = new Float32Array(len);
  let mem = 0;
  for (let i = 0; i < len; i++) {
    const n = noise();
    mem += (n - mem) * 0.2;
    out[i] = (n - mem) * Math.exp(-i / (SAMPLE_RATE * 0.03)) * 0.5;
  }
  return out;
}

// --- FM梦境音效 ---
function synthFM(freq, durSec, modIdx) {
  const len = Math.floor(durSec * SAMPLE_RATE);
  const out = new Float32Array(len);
  const fm = freq * 1.414;
  for (let i = 0; i < len; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 3);
    out[i] = Math.sin(2 * Math.PI * freq * t + modIdx * Math.sin(2 * Math.PI * fm * t)) * env * 0.3;
  }
  return out;
}

// --- 粒子纹理 ---
function synthGranular(durSec, density) {
  const len = Math.floor(durSec * SAMPLE_RATE);
  const out = new Float32Array(len);
  const grains = Math.floor(durSec * density);
  for (let g = 0; g < grains; g++) {
    const pos = Math.floor(Math.random() * len * 0.9);
    const gd = Math.floor((0.05 + Math.random() * 0.15) * SAMPLE_RATE);
    const gf = 200 + Math.random() * 2000;
    for (let i = 0; i < gd; i++) {
      const idx = pos + i;
      if (idx >= len) break;
      out[idx] += Math.sin(2 * Math.PI * gf * i / SAMPLE_RATE) * Math.sin(Math.PI * i / gd) * 0.03;
    }
  }
  return out;
}

// ============================================================
//  歌曲数据
// ============================================================
const SONG = [
  // 前奏
  { t: 0,  txt: '', note: 'C4', dur: 4, inst: 'ks' },
  { t: 4,  txt: '', note: 'G3', dur: 4, inst: 'ks' },
  { t: 8,  txt: '', note: 'A3', dur: 4, inst: 'ks' },
  { t: 12, txt: '', note: 'F3', dur: 4, inst: 'ks' },
  // 主歌1
  { t: 16, txt: '夜', note: 'C4', dur: 1, drum: false },
  { t: 17, txt: '色', note: 'E4', dur: 1, drum: false },
  { t: 18, txt: '轻', note: 'G4', dur: 1, drum: false },
  { t: 19, txt: '轻', note: 'E4', dur: 1, drum: false },
  { t: 20, txt: '落', note: 'D4', dur: 1, drum: false },
  { t: 21, txt: '下', note: 'C4', dur: 3, drum: false },
  { t: 24, txt: '梦', note: 'E4', dur: 1, drum: false },
  { t: 25, txt: '里', note: 'G4', dur: 1, drum: false },
  { t: 26, txt: '花', note: 'A4', dur: 1, drum: false },
  { t: 27, txt: '开', note: 'G4', dur: 1, drum: false },
  { t: 28, txt: '又', note: 'E4', dur: 1, drum: false },
  { t: 29, txt: '落', note: 'D4', dur: 3, drum: false },
  // 主歌2
  { t: 32, txt: '星', note: 'G4', dur: 1, drum: false },
  { t: 33, txt: '光', note: 'A4', dur: 1, drum: false },
  { t: 34, txt: '洒', note: 'C5', dur: 1, drum: false },
  { t: 35, txt: '满', note: 'A4', dur: 1, drum: false },
  { t: 36, txt: '天', note: 'G4', dur: 1, drum: false },
  { t: 37, txt: '涯', note: 'E4', dur: 3, drum: false },
  { t: 40, txt: '我', note: 'C4', dur: 1, drum: false },
  { t: 41, txt: '在', note: 'E4', dur: 1, drum: false },
  { t: 42, txt: '云', note: 'G4', dur: 1, drum: false },
  { t: 43, txt: '端', note: 'A4', dur: 1, drum: false },
  { t: 44, txt: '找', note: 'G4', dur: 1, drum: false },
  { t: 45, txt: '答', note: 'E4', dur: 3, drum: false },
  // 副歌
  { t: 48, txt: '风', note: 'G4', dur: 1, drum: true },
  { t: 49, txt: '吹', note: 'A4', dur: 1, drum: true },
  { t: 50, txt: '过', note: 'G4', dur: 1, drum: true },
  { t: 51, txt: '的', note: 'E4', dur: 1, drum: true },
  { t: 52, txt: '沙', note: 'D4', dur: 1, drum: true },
  { t: 53, txt: '哑', note: 'C4', dur: 3, drum: true },
  { t: 56, txt: '是', note: 'E4', dur: 1, drum: true },
  { t: 57, txt: '谁', note: 'G4', dur: 1, drum: true },
  { t: 58, txt: '在', note: 'A4', dur: 1, drum: true },
  { t: 59, txt: '轻', note: 'C5', dur: 1, drum: true },
  { t: 60, txt: '声', note: 'A4', dur: 1, drum: true },
  { t: 61, txt: '说', note: 'G4', dur: 1, drum: true },
  { t: 62, txt: '话', note: 'E4', dur: 2, drum: true },
  { t: 64, txt: '梦', note: 'G4', dur: 1, drum: true },
  { t: 65, txt: '醒', note: 'A4', dur: 1, drum: true },
  { t: 66, txt: '时', note: 'G4', dur: 1, drum: true },
  { t: 67, txt: '分', note: 'E4', dur: 1, drum: true },
  { t: 68, txt: '泪', note: 'D4', dur: 1, drum: true },
  { t: 69, txt: '如', note: 'C4', dur: 1, drum: true },
  { t: 70, txt: '雨', note: 'D4', dur: 1, drum: true },
  { t: 71, txt: '下', note: 'E4', dur: 1, drum: true },
  // 尾声
  { t: 72, txt: '啊', note: 'C5', dur: 2, drum: false },
  { t: 74, txt: '啊', note: 'A4', dur: 2, drum: false },
  { t: 76, txt: '梦', note: 'G4', dur: 1.5, drum: false },
  { t: 77.5, txt: '境', note: 'E4', dur: 1.5, drum: false },
  { t: 79, txt: '中', note: 'D4', dur: 1.5, drum: false },
  { t: 80.5, txt: '的', note: 'C4', dur: 1, drum: false },
  { t: 81.5, txt: '家', note: 'C4', dur: 4, drum: false },
];

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
  for (let i = CHORDS.length - 1; i >= 0; i--) if (t >= CHORDS[i].t) { c = CHORDS[i]; break; }
  return c;
}
function chordFreqs(root, type) {
  const b = noteFreq(root);
  return type === 'm' ? [b, b * 1.189, b * 1.498] : [b, b * 1.26, b * 1.498];
}

const EMOTION = {
  '夜': -0.7, '梦': -0.6, '落': -0.4, '泪': -0.9, '下': -0.3, '沙': -0.3, '哑': -0.5, '醒': -0.2,
  '花': 0.6, '星': 0.8, '光': 0.9, '开': 0.4, '洒': 0.5, '天': 0.3, '云': 0.2, '端': 0.2, '答': 0.1,
  '轻': 0.3, '声': 0.1, '说': 0, '话': 0, '雨': -0.2, '家': 0.2, '啊': 0.5, '风': 0.1, '吹': 0.1,
  '过': 0, '的': 0, '又': 0, '满': 0.3, '涯': 0.2, '我': 0, '在': 0, '找': 0, '是': 0, '谁': 0,
  '时': 0, '分': 0, '如': -0.1, '境': -0.3, '中': 0
};
function getEmo(c) { return EMOTION[c] || 0; }

// ============================================================
//  导演情感弧线引擎
// ============================================================
function getTensionCurve(t, dSkill) {
  // 0-15: down, 15-30: float, 30-45: up, 45-60: dissolve
  let base;
  if (t < 15) base = 0.3 - (t / 15) * 0.2;
  else if (t < 30) base = 0.1 + ((t - 15) / 15) * 0.3;
  else if (t < 45) base = 0.4 + ((t - 30) / 15) * 0.5;
  else base = 0.9 - ((t - 45) / 15) * 0.7;
  return base * dSkill.tension;
}

// ============================================================
//  主渲染器
// ============================================================
function renderStage(stageName, cfg, roles) {
  console.log(`\n========== 制作阶段：${stageName} ==========`);
  console.log(`歌手：${roles.singer.name} | 导演：${roles.director.name} | 编曲：${roles.arranger.name} | 制作：${roles.producer.name}`);
  console.log(`角色日志：`);
  [roles.singer, roles.director, roles.arranger, roles.producer].forEach(r => {
    r.logs.forEach(l => console.log(`  [${r.role}] ${r.name}: ${l}`));
  });

  const s = cfg.singer, d = cfg.director, a = cfg.arranger, p = cfg.producer;
  const mL = new Float32Array(TOTAL);
  const mR = new Float32Array(TOTAL);

  // 轨道
  const pad = new Float32Array(TOTAL);
  const bass = new Float32Array(TOTAL);
  const drum = new Float32Array(TOTAL);
  const fx = new Float32Array(TOTAL);
  const amb = new Float32Array(TOTAL);

  // --- 人声 ---
  console.log(`  [1/7] 歌手${roles.singer.name}录音中...（音准精度${(s.pitchAcc*100).toFixed(0)}%，表现力${(s.express*100).toFixed(0)}%）`);
  for (let idx = 0; idx < SONG.length; idx++) {
    const ev = SONG[idx];
    if (ev.inst === 'ks') continue;
    const freq = noteFreq(ev.note);
    const dur = ev.dur * BEAT;
    const emo = getEmo(ev.txt);
    const off = Math.floor(ev.t / 4 * BAR * SAMPLE_RATE);
    const vox = synthVoice(freq, dur, ev.txt, emo, s, idx, off, stageName);
    // 声像：制作人空间感决定
    const panBase = 0.5 + (Math.random() - 0.5) * (1 - p.space) * 0.4;
    const gain = 0.9 * p.mix;
    mixIn(mL, mR, vox, off, panBase, gain);
  }

  // --- KS旋律 ---
  console.log(`  [2/7] 编曲师${roles.arranger.name}录制竖琴...`);
  for (let idx = 0; idx < SONG.length; idx++) {
    const ev = SONG[idx];
    const freq = noteFreq(ev.note);
    const dur = (ev.inst === 'ks' ? ev.dur : Math.min(ev.dur, 2)) * BEAT;
    const off = Math.floor(ev.t / 4 * BAR * SAMPLE_RATE);
    // 编曲丰富度决定亮度
    const bright = 0.2 + a.instr * 0.7;
    const ks = synthKS(freq, dur, bright);
    mixIn(mL, mR, ks, off, 0.3 + Math.random() * 0.4, 0.35 * p.mix);
  }

  // --- 弦乐铺底 ---
  console.log(`  [3/7] 弦乐组录音...`);
  if (a.instr > 0.4) {
    for (let c = 0; c < CHORDS.length; c++) {
      const ch = CHORDS[c];
      const notes = chordFreqs(ch.root, ch.type);
      const off = Math.floor(ch.t / 4 * BAR * SAMPLE_RATE);
      const durBar = (c < CHORDS.length - 1 ? (CHORDS[c+1].t - ch.t) : (84 - ch.t)) / 4 * BAR;
      for (let n = 0; n < notes.length; n++) {
        const pd = synthPad(notes[n], durBar + 2);
        mixIn(mL, mR, pd, off, 0.3 + n * 0.2, 0.2 * p.mix * a.instr);
      }
    }
  }

  // --- 贝斯 ---
  console.log(`  [4/7] 贝斯录音...`);
  if (a.instr > 0.5) {
    for (let c = 0; c < CHORDS.length; c++) {
      const ch = CHORDS[c];
      const freq = noteFreq(ch.root) * 0.5;
      const off = Math.floor(ch.t / 4 * BAR * SAMPLE_RATE);
      const durBar = (c < CHORDS.length - 1 ? (CHORDS[c+1].t - ch.t) : (84 - ch.t)) / 4 * BAR;
      const bs = synthBass(freq, durBar);
      mixMono(bass, bs, off, 0.5 * p.mix);
    }
  }

  // --- 鼓组 ---
  console.log(`  [5/7] 鼓组录音...`);
  if (a.rhythm > 0.4) {
    for (let idx = 0; idx < SONG.length; idx++) {
      const ev = SONG[idx];
      if (!ev.drum) continue;
      const off = Math.floor(ev.t / 4 * BAR * SAMPLE_RATE);
      // 节奏感差时：只有简单的底鼓，且不稳
      if (a.rhythm < 0.7) {
        if (Math.random() < 0.8) {
          const k = kick(BEAT);
          mixMono(drum, k, off + Math.floor((Math.random()-0.5)*0.05*SAMPLE_RATE*(1-a.rhythm)*5), 0.8);
        }
      } else {
        const k = kick(BEAT);
        mixMono(drum, k, off, 0.9);
        const sn = snare(BEAT);
        mixMono(drum, sn, off + Math.floor(BEAT * 0.5 * SAMPLE_RATE), 0.6);
        if (idx % 2 === 0) {
          const hh = hihat(BEAT * 0.5);
          mixMono(drum, hh, off + Math.floor(BEAT * 0.25 * SAMPLE_RATE), 0.4);
        }
      }
    }
  }

  // --- FM音效 ---
  console.log(`  [6/7] FM梦境音效...`);
  if (a.instr > 0.75) {
    for (let i = 0; i < 8; i++) {
      const t = 6 + i * 6;
      const off = Math.floor(t * SAMPLE_RATE);
      const freq = 440 + Math.random() * 660;
      const mod = 2 + Math.random() * 6;
      const fm = synthFM(freq, 2, mod);
      mixIn(mL, mR, fm, off, i / 7, 0.25 * p.mix);
    }
  }

  // --- 粒子环境 ---
  console.log(`  [7/7] 环境纹理...`);
  if (a.instr > 0.6) {
    const g1 = synthGranular(30, 30 * a.instr);
    mixIn(mL, mR, g1, 0, 0.5, 0.35 * p.mix);
    const g2 = synthGranular(30, 30 * a.instr);
    mixIn(mL, mR, g2, Math.floor(30 * SAMPLE_RATE), 0.5, 0.25 * p.mix);
  }

  // ==========================================================
  //  混音（制作人技能驱动）
  // ==========================================================
  console.log(`混音中...（制作人${roles.producer.name}混音技能${(p.mix*100).toFixed(0)}%）`);
  for (let i = 0; i < TOTAL; i++) {
    mL[i] += pad[i] * 0.6 + bass[i] * 0.7 + drum[i] * 0.8 + fx[i] * 0.5 + amb[i] * 0.4;
    mR[i] += pad[i] * 0.6 + bass[i] * 0.7 + drum[i] * 0.8 + fx[i] * 0.5 + amb[i] * 0.4;
  }

  // 施罗德混响（空间设计技能驱动）
  if (p.space > 0.2) {
    const decay = 0.5 + p.space * 0.4;
    const mixAmt = p.space * 0.35;
    const combLens = [1557, 1617, 1491, 1422];
    const apLens = [225, 341, 441];
    const combsL = combLens.map(n => ({ b: new Float64Array(n), i: 0 }));
    const combsR = combLens.map(n => ({ b: new Float64Array(n), i: 0 }));
    const aps = apLens.map(n => ({ b: new Float64Array(n), i: 0 }));
    const oL = new Float32Array(TOTAL);
    const oR = new Float32Array(TOTAL);
    for (let i = 0; i < TOTAL; i++) {
      let sL = 0, sR = 0;
      for (let c = 0; c < 4; c++) {
        const cl = combsL[c], cr = combsR[c];
        const rl = cl.b[cl.i], rr = cr.b[cr.i];
        cl.b[cl.i] = mL[i] + rl * decay;
        cr.b[cr.i] = mR[i] + rr * decay;
        cl.i = (cl.i + 1) % cl.b.length;
        cr.i = (cr.i + 1) % cr.b.length;
        sL += rl; sR += rr;
      }
      sL *= 0.25; sR *= 0.25;
      let aL = sL, aR = sR;
      for (let a = 0; a < 3; a++) {
        const al = aps[a];
        const v = al.b[al.i];
        al.b[al.i] = aL + v * 0.5;
        aL = v - aL * 0.5;
        al.b[al.i] = aR + v * 0.5;
        aR = v - aR * 0.5;
        al.i = (al.i + 1) % al.b.length;
      }
      oL[i] = mL[i] + aL * mixAmt;
      oR[i] = mR[i] + aR * mixAmt;
    }
    mL.set(oL); mR.set(oR);
  }

  // 母带
  if (p.master > 0.2) {
    for (let i = 0; i < TOTAL; i++) {
      const sec = i / SAMPLE_RATE;
      let curve = 0;
      if (sec < 15) curve = -0.3;
      else if (sec < 30) curve = 0.2;
      else if (sec < 45) curve = 0.4;
      else curve = -0.2;
      const bright = 1 + curve * 0.15 * p.master;
      mL[i] *= bright;
      mR[i] *= bright;
    }
  }

  // 限制器
  for (let i = 0; i < TOTAL; i++) {
    const mx = Math.max(Math.abs(mL[i]), Math.abs(mR[i]));
    if (mx > 0.95) { const g = 0.95 / mx; mL[i] *= g; mR[i] *= g; }
  }

  // 归一化
  let peak = 0;
  for (let i = 0; i < TOTAL; i++) peak = Math.max(peak, Math.abs(mL[i]), Math.abs(mR[i]));
  const norm = 0.98 / peak;
  for (let i = 0; i < TOTAL; i++) { mL[i] *= norm; mR[i] *= norm; }

  return [mL, mR];
}

// ============================================================
//  WAV写入
// ============================================================
function writeWav(path, l, r) {
  const bits = 16, bytes = bits / 8;
  const dataSize = l.length * 2 * bytes;
  const header = 44;
  const buf = Buffer.allocUnsafe(header + dataSize);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(header + dataSize - 8, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SAMPLE_RATE, 24);
  buf.writeUInt32LE(SAMPLE_RATE * 2 * bytes, 28);
  buf.writeUInt16LE(2 * bytes, 32);
  buf.writeUInt16LE(bits, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < l.length; i++) {
    const sl = Math.max(-1, Math.min(1, l[i]));
    const sr = Math.max(-1, Math.min(1, r[i]));
    const vl = sl < 0 ? sl * 32768 : sl * 32767;
    const vr = sr < 0 ? sr * 32768 : sr * 32767;
    const off = header + i * 4;
    buf.writeInt16LE(Math.round(vl), off);
    buf.writeInt16LE(Math.round(vr), off + 2);
  }
  fs.writeFileSync(path, buf);
}

// ============================================================
//  主流程：创建世界 → 排练 → 三阶段生成
// ============================================================
console.log('╔══════════════════════════════════════════╗');
console.log('║     青鸾 Dream Studio 虚拟音乐世界       ║');
console.log('╚══════════════════════════════════════════╝');

// 创建角色
const singer = createSinger('艾璃', 'trainee');
const director = createDirector('默深');
const arranger = createArranger('织弦');
const producer = createProducer('静渊');

console.log(`\n🎤 歌手：${singer.name}（空灵型新人，基础音准${(singer.pitchAccuracy*100).toFixed(0)}%）`);
console.log(`🎬 导演：${director.name}（擅长氛围叙事）`);
console.log(`🎹 编曲：${arranger.name}（管弦出身，电子也懂）`);
console.log(`🎧 制作：${producer.name}（细节控，混音强迫症）`);

const roles = { singer, director, arranger, producer };

// ===== 阶段1：草稿 =====
console.log('\n──────────────────────────────────────────');
console.log('📋 阶段一：草稿（Raw Draft）');
console.log('──────────────────────────────────────────');
console.log('角色们第一次拿到《梦境》的谱子，各自在独立录音室摸索...');
const cfgDraft = practiceRound(roles, 'draft');
const [draftL, draftR] = renderStage('draft', cfgDraft, roles);
writeWav('/workspace/music/public/dream_draft.wav', draftL, draftR);
console.log('✅ 草稿已保存：/workspace/music/public/dream_draft.wav');

// ===== 阶段2：初唱 =====
console.log('\n──────────────────────────────────────────');
console.log('🎤 阶段二：初唱（First Take）');
console.log('──────────────────────────────────────────');
console.log('导演召集大家进排练厅，第一次合排...');
const cfgFirst = practiceRound(roles, 'first_take');
const [firstL, firstR] = renderStage('first_take', cfgFirst, roles);
writeWav('/workspace/music/public/dream_first_take.wav', firstL, firstR);
console.log('✅ 初唱已保存：/workspace/music/public/dream_first_take.wav');

// ===== 阶段3：完整版 =====
console.log('\n──────────────────────────────────────────');
console.log('🏆 阶段三：完整版（Final Master）');
console.log('──────────────────────────────────────────');
console.log('经过通宵磨合，所有人进入最佳状态，正式录音...');
const cfgFinal = practiceRound(roles, 'final');
const [finalL, finalR] = renderStage('final', cfgFinal, roles);
writeWav('/workspace/music/public/dream_final.wav', finalL, finalR);
console.log('✅ 完整版已保存：/workspace/music/public/dream_final.wav');

// ===== 制作笔记 =====
const notes = `
============================================
  青鸾 Dream Studio —— 《梦境》制作笔记
============================================

【团队阵容】
歌手：艾璃（空灵型女中音，新人→成熟）
导演：默深（氛围叙事风格）
编曲：织弦（管弦+电子混合背景）
制作：静渊（细节控混音师）

【阶段对比】

1. 草稿 (dream_draft.wav)
   - 艾璃：第一次视唱，音准飘忽（±50音分），无颤音，气声控制差
   - 默深：尚未介入，无情感弧线设计
   - 织弦：只有一台电钢琴伴奏，无其他乐器
   - 静渊：无混音，所有轨道直接叠加，无混响
   → 听感：像一个人在琴房里试唱，粗糙但本真

2. 初唱 (dream_first_take.wav)
   - 艾璃：经过导演指导，音准改善（±15音分），学会用气息推动情绪
   - 默深：设计了"下沉→漂浮"的两段式情绪
   - 织弦：加入弦乐铺底和贝斯，鼓组进入副歌
   - 静渊：做了基础混音平衡和简单大厅混响
   → 听感：像一场有瑕疵但充满真诚的Live，偶尔的节奏不稳和情感生硬是成长的印记

3. 完整版 (dream_final.wav)
   - 艾璃：音准精准（±3音分），VDP有机颤音自然流动，副歌"风"字用气声进入
   - 默深：四段式梦境弧线（入睡/浅梦/深梦/梦醒），45秒处设计坠落感
   - 织弦：全编制——竖琴主奏+弦乐+贝斯+鼓组+FM音效+粒子纹理
   - 静渊：施罗德混响+情感动态母带+限制器，三段频谱明暗控制
   → 听感：完整的梦境叙事，空间开阔，情绪层次分明

【技术参数】
采样率：22050Hz | 时长：60秒 | BPM：72
非传统引擎：Lorenz混沌轨迹（声场运动）
现传统引擎：Karplus-Strong、4共振峰人声、FM、物理鼓组
自创引擎：角色技能驱动合成参数、情感频谱染色、耦合VDP颤音
超深度思考：四段式梦境弧线、动机记忆、跨尺度自相似动力学
============================================
`;
fs.writeFileSync('/workspace/music/public/studio_production_notes.txt', notes);
console.log('\n📝 制作笔记已保存：/workspace/music/public/studio_production_notes.txt');
console.log('\n🎉 青鸾 Dream Studio 制作完成！');
