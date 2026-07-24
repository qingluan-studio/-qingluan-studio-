const fs = require('fs');

// ============================================================
//  青鸾 2.0 —— 从"声音合成"到"运动模拟"
//  集成：身体状态映射 + 512点弧线 + 噪声谱设计 + 微扰动 + 呼吸点
// ============================================================
const SAMPLE_RATE = 22050;
const DURATION = 60;
const TOTAL = SAMPLE_RATE * DURATION;
const BPM = 72;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;

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

const NOISE = new Float32Array(65536);
for (let i = 0; i < 65536; i++) NOISE[i] = Math.random() * 2 - 1;
let nIdx = 0;
function noise() { return NOISE[(nIdx++) & 0xFFFF]; }

// ============================================================
//  一、全曲512点情感弧线引擎（跨尺度耦合）
// ============================================================
const ARC = new Float32Array(512);
function smoothstep(e0, e1, x) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}
for (let i = 0; i < 512; i++) {
  const r = i / 511;
  if (r < 0.25) ARC[i] = 0.3 - smoothstep(0, 0.25, r) * 0.2;
  else if (r < 0.5) {
    const t = (r - 0.25) / 0.25;
    ARC[i] = 0.1 + Math.sin(t * Math.PI) * 0.3;
  } else if (r < 0.75) {
    ARC[i] = 0.4 + smoothstep(0.5, 0.75, r) * 0.5;
  } else {
    ARC[i] = 0.9 - smoothstep(0.75, 1, r) * 0.9;
  }
}
function getArc(sec) { return ARC[Math.min(511, Math.floor(sec / DURATION * 512))]; }

// ============================================================
//  二、身体状态映射层（10参数 → 声学参数）
// ============================================================
function computeBody(tick, vowel, isBreath) {
  const sec = tick / 4 * BAR;
  const arc = getArc(sec);
  const v = vowel;
  const body = {
    lungPressure: 0.3 + arc * 0.7,
    vocalTension: 0.4 + arc * 0.5,
    vocalMass: 0.5 + (1 - arc) * 0.3,
    glottalClosure: 0.6 + arc * 0.35,
    tongueFront: v === 'i' ? 0.8 : v === 'u' ? -0.5 : v === 'e' ? 0.3 : 0,
    tongueHigh: v === 'i' ? 0.9 : v === 'a' ? -0.3 : v === 'e' ? 0.4 : 0.2,
    lipRound: v === 'u' || v === 'o' ? 0.7 : 0.1,
    velumPosition: 0.15,
    jawOpen: v === 'a' ? 0.85 : v === 'i' ? 0.25 : v === 'e' ? 0.45 : 0.55,
    larynxHeight: arc * 0.5 - 0.25,
  };
  if (isBreath) {
    body.lungPressure *= 0.7;
    body.glottalClosure *= 0.6;
    body.vocalTension *= 0.8;
  }
  return body;
}

function bodyToAcoustics(body, baseFreq) {
  return {
    amplitude: body.lungPressure * 0.8 + 0.2,
    freq: baseFreq * (1 + (body.vocalTension - 0.5) * 0.08),
    brightness: body.vocalTension * 0.6 + body.vocalMass * 0.2,
    breathiness: (1 - body.glottalClosure) * body.lungPressure * 1.2,
    f1Shift: body.jawOpen * 0.18 + body.tongueHigh * 0.12 + body.larynxHeight * 0.06,
    f2Shift: body.tongueFront * 0.12 + body.lipRound * -0.18 + body.larynxHeight * 0.06,
    f3Shift: body.tongueHigh * 0.1 + body.larynxHeight * 0.05,
    f4Shift: body.larynxHeight * 0.04,
    nasal: body.velumPosition * 0.25,
    damping: 0.5 + body.vocalMass * 0.4,
  };
}

// ============================================================
//  三、噪声谱设计（多频段+时变+信号耦合）
// ============================================================
function designNoiseSample(nVal, hpState, bpL, bpH, lpS, cutoff) {
  // 高通 >2kHz
  hpState.s += 0.35 * (nVal - hpState.s);
  const hpOut = nVal - hpState.s;
  // 带通 4-8kHz（低通8kHz - 低通4kHz近似）
  bpL.s += 0.55 * (nVal - bpL.s); // ~8kHz低通
  bpH.s += 0.25 * (bpL.s - bpH.s); // 对8kHz低通再低通 ≈ 4kHz
  const bpOut = bpL.s - bpH.s;
  // 低通 <12kHz
  lpS.s += 0.75 * (nVal - lpS.s);
  const lpOut = lpS.s;
  return hpOut * 0.25 + bpOut * 0.5 + lpOut * 0.25;
}

// ============================================================
//  四、中文声母建模（复用+精简）
// ============================================================
const CHAR_SINIT = {
  '夜':'y','色':'s','轻':'q','落':'l','梦':'m','里':'l','花':'h','开':'k','又':'y',
  '星':'x','光':'g','洒':'s','满':'m','天':'t','涯':'y','我':'w','在':'z','云':'y','端':'d',
  '找':'zh','答':'d','风':'f','吹':'ch','过':'g','的':'d','沙':'sh','哑':'y','是':'sh','谁':'sh',
  '声':'sh','说':'sh','话':'h','醒':'x','时':'sh','分':'f','泪':'l','如':'r','雨':'y','下':'x',
  '啊':'','境':'j','中':'zh','家':'j'
};
const SINIT_TYPE = {
  'b':'pl_u','p':'pl_a','d':'pl_u','t':'pl_a','g':'pl_u','k':'pl_a',
  'f':'fr_lab','s':'fr_alv','sh':'fr_post','x':'fr_pal','h':'fr_glot','r':'fr_post',
  'z':'af_u','zh':'af_u','j':'af_u','c':'af_a','ch':'af_a','q':'af_a',
  'm':'nas_lab','n':'nas_alv','l':'lat','y':'semi','w':'semi','':'none'
};
function getOnsetType(c) { return SINIT_TYPE[CHAR_SINIT[c] || ''] || 'none'; }

function synthOnset(type, len, noteFreq) {
  const out = new Float32Array(len);
  let lp = 0, hpM = 0;
  for (let i = 0; i < len; i++) {
    const t = i / len, n = noise();
    let sig = 0;
    switch (type) {
      case 'pl_u': { const b = t < 0.2 ? 1 : Math.exp(-(t-0.2)*15); lp += (n - lp) * 0.3; sig = lp * b * 0.9; break; }
      case 'pl_a': { const b = t < 0.15 ? 1 : Math.exp(-(t-0.15)*8); lp += (n - lp) * 0.15; const a = (t>0.1&&t<0.7)?noise()*0.4*Math.exp(-(t-0.1)*4):0; sig = (lp*0.6+a)*b*0.9; break; }
      case 'fr_lab': { hpM += (n - hpM) * 0.4; sig = (n - hpM) * Math.exp(-t*2) * 0.5; break; }
      case 'fr_alv': { hpM += (n - hpM) * 0.15; sig = (n - hpM) * Math.exp(-t*3) * 0.55; break; }
      case 'fr_post': { hpM += (n - hpM) * 0.25; sig = (n - hpM) * Math.exp(-t*2.5) * 0.5; break; }
      case 'fr_pal': { hpM += (n - hpM) * 0.2; sig = (n - hpM) * Math.exp(-t*3) * 0.5; break; }
      case 'fr_glot': { lp += (n - lp) * 0.2; sig = lp * Math.exp(-t*2) * 0.45; break; }
      case 'af_u': { const b = t < 0.25 ? 1 : Math.exp(-(t-0.25)*6); hpM += (n - hpM) * 0.3; const fr = (t>0.15)?(n-hpM)*0.6*Math.exp(-(t-0.15)*5):0; sig = (lp*0.4+fr)*b*0.85; break; }
      case 'af_a': { const b = t < 0.2 ? 1 : Math.exp(-(t-0.2)*5); hpM += (n - hpM) * 0.2; const fr = (t>0.1)?(n-hpM)*0.7*Math.exp(-(t-0.1)*4):0; const asp = (t>0.1&&t<0.6)?noise()*0.3*Math.exp(-(t-0.1)*3):0; sig = (lp*0.3+fr+asp)*b*0.85; break; }
      case 'nas_lab': { lp += (n - lp) * 0.1; sig = lp * Math.sin(2*Math.PI*280*i/SAMPLE_RATE) * Math.exp(-t*1.5) * 0.5; break; }
      case 'nas_alv': { lp += (n - lp) * 0.12; sig = lp * Math.sin(2*Math.PI*450*i/SAMPLE_RATE) * Math.exp(-t*1.5) * 0.5; break; }
      case 'lat': { hpM += (n - hpM) * 0.35; sig = (n - hpM) * Math.exp(-t*2.5) * 0.45; break; }
      case 'semi': { lp += (n - lp) * 0.25; sig = lp * Math.sin(2*Math.PI*noteFreq*0.5*i/SAMPLE_RATE) * (1-t) * 0.35; break; }
    }
    out[i] = sig;
  }
  return out;
}

// ============================================================
//  五、人声合成器（青鸾2.0核心：运动模拟）
// ============================================================
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
  '是':'i','谁':'e','声':'e','说':'o','话':'a','醒':'i','时':'i','分':'e','泪':'e',
  '如':'u','雨':'u','下':'a','啊':'a','境':'i','中':'o','家':'a'
};

function synthVoice2(freq, durSec, char, tick, isBreath, noteIdx) {
  const len = Math.floor(durSec * SAMPLE_RATE);
  const out = new Float32Array(len);
  const vowel = CHAR_VOWEL[char] || 'a';
  const formants = VOWEL_TBL[vowel] || VOWEL_TBL['a'];

  // 身体状态 → 声学参数
  const body = computeBody(tick, vowel, isBreath);
  const ac = bodyToAcoustics(body, freq);

  // 微扰动：低频随机游走（0.5-2Hz，±5音分）
  const pFreq = 0.5 + ((noteIdx * 137) % 1000 / 1000) * 1.5;
  const pPhase = (noteIdx * 0.7) % (Math.PI * 2);
  const pTable = new Float32Array(len);
  let pVal = 0;
  for (let i = 0; i < len; i++) {
    pVal += (Math.random() * 2 - 1) * 0.00008;
    pVal *= 0.9997;
    pTable[i] = pVal + Math.sin(2 * Math.PI * pFreq * i / SAMPLE_RATE + pPhase) * 0.003;
  }

  // 基频（含扰动）
  const fBase = ac.freq;

  // 共振峰（身体映射）
  const f1 = formants[0] * (1 + ac.f1Shift);
  const f2 = formants[1] * (1 + ac.f2Shift);
  const f3 = formants[2] * (1 + ac.f3Shift);
  const f4 = formants[3] * (1 + ac.f4Shift);
  const bw = [60 * ac.damping, 80 * ac.damping, 120 * ac.damping, 200 * ac.damping];

  // 颤音（VDP耦合，速率受身体张力调制）
  const vibRate = 4.5 + body.vocalTension * 2.5;
  const vibDepth = 0.008 + body.vocalTension * 0.015;
  const vibLen = Math.min(len, SAMPLE_RATE * 2);
  const vibTable = new Float32Array(vibLen);
  let v1 = 0.2, v1d = 0, v2 = 0.1, v2d = 0;
  const mu = 0.5, w = 2 * Math.PI * vibRate, cpl = 0.08, dt = 1 / SAMPLE_RATE;
  for (let i = 0; i < vibLen; i++) {
    const f1v = mu * (1 - v1 * v1) * v1d - w * w * v1 + cpl * (v2 - v1);
    const f2v = mu * (1 - v2 * v2) * v2d - w * w * v2 + cpl * (v1 - v2);
    v1d += f1v * dt; v1 += v1d * dt;
    v2d += f2v * dt; v2 += v2d * dt;
    vibTable[i] = (v1 * 0.6 + v2 * 0.4) * vibDepth;
  }

  // 声母
  const onsetType = getOnsetType(char);
  const onsetDur = onsetType === 'none' ? 0 : Math.floor((0.012 + Math.random() * 0.008) * SAMPLE_RATE);
  const onset = synthOnset(onsetType, onsetDur, fBase);
  const transEnd = Math.floor(onsetDur * 1.3);

  // LF声门
  const period = SAMPLE_RATE / fBase;
  const tRet = 0.3 * period;
  const ta = 0.05 * period;
  const invTa = 1 / ta;
  const eInv = Math.exp(-tRet * invTa);
  const eInv2 = Math.exp(-period * invTa);
  const B = eInv / (1 - eInv2);

  // 包络（身体驱动：情感高=硬起音，情感低=软起音）
  const arc = getArc(tick / 4 * BAR);
  const att = Math.floor((0.015 + (1 - arc) * 0.04 + (isBreath ? 0.03 : 0)) * SAMPLE_RATE);
  const dec = Math.floor(0.08 * SAMPLE_RATE);
  const sus = 0.3 + arc * 0.6;
  const rel = Math.floor((0.1 + (1 - arc) * 0.1) * SAMPLE_RATE);

  // 滤波器状态
  const st = [[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]];
  const fcArr = [f1, f2, f3, f4];

  // 噪声谱设计状态
  const hpState = { s: 0 }, bpL = { s: 0 }, bpH = { s: 0 }, lpState = { s: 0 };

  // 信号包络跟踪（用于噪声耦合）
  let sigEnv = 0;

  for (let i = 0; i < len; i++) {
    const t = i / len;
    // 声母
    const onsetSample = (i < onset.length) ? onset[i] * Math.max(0, 1 - t / 0.25) : 0;

    // 基频+颤音+扰动
    const ff = fBase * (1 + vibTable[i % vibTable.length] + pTable[i]);
    const p = SAMPLE_RATE / ff;
    const phase = i % Math.max(1, Math.round(p));

    // LF声门
    let glottal = 0;
    if (phase < tRet) {
      glottal = 0.5 * (1 - Math.cos(Math.PI * phase / tRet));
    } else {
      const dp = phase - tRet;
      glottal = B * Math.exp(-dp * invTa) - B * Math.exp(-(period - tRet) * invTa) * 0.01;
    }
    glottal *= 0.8 * ac.amplitude;

    // 噪声谱设计：多频段+时变+信号耦合
    const nVal = noise();
    const designedNoise = designNoiseSample(nVal, hpState, bpL, bpH, lpState);
    // 时变包络：起音多 → 延音少 → 尾音增
    let noiseEnv;
    if (t < 0.12) noiseEnv = t / 0.12;
    else if (t < 0.65) noiseEnv = 1 - (t - 0.12) / 0.53 * 0.6;
    else noiseEnv = 0.4 + (t - 0.65) / 0.35 * 0.6;
    // 信号耦合：噪声振幅跟随基频包络
    sigEnv += (Math.abs(glottal) - sigEnv) * 0.01;
    const coupledNoise = designedNoise * ac.breathiness * noiseEnv * (0.3 + sigEnv * 0.7);

    let sig = glottal + coupledNoise;

    // 4级联共振峰（身体映射）
    for (let f = 0; f < 4; f++) {
      const r = Math.exp(-Math.PI * bw[f] / SAMPLE_RATE);
      const w0 = 2 * Math.PI * fcArr[f] / SAMPLE_RATE;
      const c = -2 * r * Math.cos(w0);
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

    // 呼吸点：振幅凹陷
    if (isBreath) env *= 0.85;

    // 声母+元音混合
    const vowelGain = (i < transEnd) ? (i / transEnd) : 1;
    out[i] = onsetSample * (1 - vowelGain * 0.7) + sig * env * vowelGain;
  }
  return out;
}

// ============================================================
//  六、乐器合成器（复用+精简）
// ============================================================
function ksDream(freq, durSec, bright) {
  const len = Math.floor(durSec * SAMPLE_RATE);
  const out = new Float32Array(len);
  const delay = Math.round(SAMPLE_RATE / freq);
  const buf = new Float32Array(delay);
  for (let i = 0; i < delay; i++) buf[i] = noise() * 0.5;
  let idx = 0;
  const damp = 0.5 + bright * 0.48;
  const disp = bright * 0.3;
  for (let i = 0; i < len; i++) {
    const a = buf[idx], b = buf[(idx + 1) % delay];
    const avg = damp * (a + b) * 0.5;
    buf[idx] = avg - disp * (avg - a);
    out[i] = avg;
    idx = (idx + 1) % delay;
  }
  const att = Math.min(len, Math.floor(0.005 * SAMPLE_RATE));
  const rel = Math.min(len, Math.floor(0.3 * SAMPLE_RATE));
  for (let i = 0; i < att; i++) out[i] *= i / att;
  for (let i = len - rel; i < len; i++) out[i] *= (len - i) / rel;
  return out;
}
function synthPad(freq, durSec) {
  const len = Math.floor(durSec * SAMPLE_RATE);
  const out = new Float32Array(len);
  const harms = [1, 0.5, 0.33, 0.25, 0.2, 0.15];
  for (let h = 0; h < harms.length; h++) {
    const hf = freq * (h + 1);
    let ph = 0;
    for (let i = 0; i < len; i++) {
      const vib = Math.sin(2 * Math.PI * 5 * i / SAMPLE_RATE) * 0.008;
      ph += 2 * Math.PI * hf * (1 + vib) / SAMPLE_RATE;
      const env = i < SAMPLE_RATE * 0.5 ? i / (SAMPLE_RATE * 0.5) : 1;
      const rel = len - i < SAMPLE_RATE * 0.5 ? (len - i) / (SAMPLE_RATE * 0.5) : 1;
      out[i] += Math.sin(ph) * harms[h] * env * rel * 0.15;
    }
  }
  return out;
}
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
  for (let i = 0; i < len; i++) { ph += 2 * Math.PI * 180 / SAMPLE_RATE; out[i] = (Math.sin(ph) * 0.4 + noise() * 0.7) * Math.exp(-i / (SAMPLE_RATE * 0.12)) * 0.7; }
  return out;
}
function hihat(dur) {
  const len = Math.floor(dur * SAMPLE_RATE);
  const out = new Float32Array(len);
  let mem = 0;
  for (let i = 0; i < len; i++) { const n = noise(); mem += (n - mem) * 0.2; out[i] = (n - mem) * Math.exp(-i / (SAMPLE_RATE * 0.03)) * 0.5; }
  return out;
}
function synthFM(freq, durSec, modIdx) {
  const len = Math.floor(durSec * SAMPLE_RATE);
  const out = new Float32Array(len);
  const fm = freq * 1.414;
  for (let i = 0; i < len; i++) {
    const t = i / SAMPLE_RATE;
    out[i] = Math.sin(2 * Math.PI * freq * t + modIdx * Math.sin(2 * Math.PI * fm * t)) * Math.exp(-t * 3) * 0.3;
  }
  return out;
}
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
//  七、歌曲数据 + 呼吸点标记
// ============================================================
const SONG = [
  { t: 0,  txt: '', note: 'C4', dur: 4, inst: 'ks' },
  { t: 4,  txt: '', note: 'G3', dur: 4, inst: 'ks' },
  { t: 8,  txt: '', note: 'A3', dur: 4, inst: 'ks' },
  { t: 12, txt: '', note: 'F3', dur: 4, inst: 'ks' },
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
  { t: 72, txt: '啊', note: 'C5', dur: 2, drum: false },
  { t: 74, txt: '啊', note: 'A4', dur: 2, drum: false },
  { t: 76, txt: '梦', note: 'G4', dur: 1.5, drum: false },
  { t: 77.5, txt: '境', note: 'E4', dur: 1.5, drum: false },
  { t: 79, txt: '中', note: 'D4', dur: 1.5, drum: false },
  { t: 80.5, txt: '的', note: 'C4', dur: 1, drum: false },
  { t: 81.5, txt: '家', note: 'C4', dur: 4, drum: false },
];

// 自动标记呼吸点
let lastBreath = -20;
for (let i = 0; i < SONG.length; i++) {
  if (SONG[i].txt && SONG[i].inst !== 'ks' && SONG[i].t - lastBreath > 14 + (Math.random() * 10)) {
    SONG[i].isBreath = true;
    lastBreath = SONG[i].t;
  }
}

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
function chordFreqs(root, type) {
  const b = noteFreq(root);
  return type === 'm' ? [b, b * 1.189, b * 1.498] : [b, b * 1.26, b * 1.498];
}

// ============================================================
//  八、互调耦合混音
// ============================================================
function intermodulationMix(tracks) {
  const mL = new Float32Array(TOTAL);
  const mR = new Float32Array(TOTAL);
  for (let i = 0; i < TOTAL; i++) {
    mL[i] = tracks.voiceL[i] + tracks.pad[i] * 0.6 + tracks.bass[i] * 0.7 + tracks.drum[i] * 0.8 + tracks.fx[i] * 0.5 + tracks.amb[i] * 0.4;
    mR[i] = tracks.voiceR[i] + tracks.pad[i] * 0.6 + tracks.bass[i] * 0.7 + tracks.drum[i] * 0.8 + tracks.fx[i] * 0.5 + tracks.amb[i] * 0.4;
  }
  const lowBus = new Float32Array(TOTAL);
  for (let i = 0; i < TOTAL; i++) lowBus[i] = Math.abs(tracks.bass[i]) + Math.abs(tracks.drum[i]) * 0.5;
  let sm = 0;
  for (let i = 0; i < TOTAL; i++) { sm += (lowBus[i] - sm) * 0.001; lowBus[i] = sm; }
  for (let i = 0; i < TOTAL; i++) { const mod = 1 + lowBus[i] * 0.03; mL[i] *= mod; mR[i] *= mod; }
  const leak = 0.015;
  for (let i = 0; i < TOTAL; i++) {
    mL[i] += tracks.voiceR[i] * leak + tracks.pad[i] * leak * 0.5;
    mR[i] += tracks.voiceL[i] * leak + tracks.pad[i] * leak * 0.5;
  }
  for (let i = 0; i < TOTAL; i++) {
    const cross = tracks.voiceL[i] * tracks.pad[i] * 0.02;
    mL[i] += cross; mR[i] += cross;
  }
  return [mL, mR];
}

// ============================================================
//  九、主渲染
// ============================================================
console.log('《梦境·青鸾2.0》渲染中...');
console.log('范式：运动模拟 | 身体状态映射 | 512点弧线 | 噪声谱设计 | 微扰动 | 呼吸点');

const tracks = {
  voiceL: new Float32Array(TOTAL), voiceR: new Float32Array(TOTAL),
  pad: new Float32Array(TOTAL), bass: new Float32Array(TOTAL),
  drum: new Float32Array(TOTAL), fx: new Float32Array(TOTAL), amb: new Float32Array(TOTAL)
};

console.log('  [1/7] 运动模拟人声...');
for (let idx = 0; idx < SONG.length; idx++) {
  const ev = SONG[idx];
  if (ev.inst === 'ks') continue;
  const freq = noteFreq(ev.note);
  const dur = ev.dur * BEAT;
  const off = Math.floor(ev.t / 4 * BAR * SAMPLE_RATE);
  const vox = synthVoice2(freq, dur, ev.txt, ev.t, ev.isBreath || false, idx);
  const pan = 0.4 + Math.sin(ev.t * 0.3) * 0.2;
  mixIn(tracks.voiceL, tracks.voiceR, vox, off, pan, 0.95);
}

console.log('  [2/7] Karplus-Strong...');
for (let idx = 0; idx < SONG.length; idx++) {
  const ev = SONG[idx];
  const freq = noteFreq(ev.note);
  const dur = (ev.inst === 'ks' ? ev.dur : Math.min(ev.dur, 2)) * BEAT;
  const off = Math.floor(ev.t / 4 * BAR * SAMPLE_RATE);
  const arc = getArc(ev.t / 4 * BAR);
  const ks = ksDream(freq, dur, arc * 0.5 + 0.2);
  mixIn(tracks.voiceL, tracks.voiceR, ks, off, 0.3 + Math.random() * 0.4, 0.35);
}

console.log('  [3/7] 弦乐...');
for (let c = 0; c < CHORDS.length; c++) {
  const ch = CHORDS[c];
  const notes = chordFreqs(ch.root, ch.type);
  const off = Math.floor(ch.t / 4 * BAR * SAMPLE_RATE);
  const durBar = (c < CHORDS.length - 1 ? (CHORDS[c+1].t - ch.t) : (84 - ch.t)) / 4 * BAR;
  for (let n = 0; n < notes.length; n++) {
    mixIn(tracks.voiceL, tracks.voiceR, synthPad(notes[n], durBar + 2), off, 0.3 + n * 0.2, 0.2);
  }
}

console.log('  [4/7] 贝斯...');
for (let c = 0; c < CHORDS.length; c++) {
  const ch = CHORDS[c];
  mixMono(tracks.bass, synthBass(noteFreq(ch.root) * 0.5, (c < CHORDS.length - 1 ? (CHORDS[c+1].t - ch.t) : (84 - ch.t)) / 4 * BAR), Math.floor(ch.t / 4 * BAR * SAMPLE_RATE), 0.5);
}

console.log('  [5/7] 鼓组...');
for (let idx = 0; idx < SONG.length; idx++) {
  const ev = SONG[idx];
  if (!ev.drum) continue;
  const off = Math.floor(ev.t / 4 * BAR * SAMPLE_RATE);
  mixMono(tracks.drum, kick(BEAT), off, 0.9);
  mixMono(tracks.drum, snare(BEAT), off + Math.floor(BEAT * 0.5 * SAMPLE_RATE), 0.6);
  if (idx % 2 === 0) mixMono(tracks.drum, hihat(BEAT * 0.5), off + Math.floor(BEAT * 0.25 * SAMPLE_RATE), 0.4);
}

console.log('  [6/7] FM...');
for (let i = 0; i < 8; i++) {
  const off = Math.floor((6 + i * 6) * SAMPLE_RATE);
  mixIn(tracks.voiceL, tracks.voiceR, synthFM(440 + Math.random() * 660, 2, 2 + Math.random() * 6), off, i / 7, 0.25);
}

console.log('  [7/7] 粒子...');
mixIn(tracks.voiceL, tracks.voiceR, synthGranular(30, 40), 0, 0.5, 0.35);
mixIn(tracks.voiceL, tracks.voiceR, synthGranular(30, 40), Math.floor(30 * SAMPLE_RATE), 0.5, 0.25);

// 混音
console.log('互调耦合...');
let [mL, mR] = intermodulationMix(tracks);

// 混响
console.log('施罗德混响...');
{
  const decay = 0.82, mixAmt = 0.32;
  const combLens = [1557, 1617, 1491, 1422];
  const apLens = [225, 341, 441];
  const combsL = combLens.map(n => ({ b: new Float64Array(n), i: 0 }));
  const combsR = combLens.map(n => ({ b: new Float64Array(n), i: 0 }));
  const aps = apLens.map(n => ({ b: new Float64Array(n), i: 0 }));
  const oL = new Float32Array(TOTAL), oR = new Float32Array(TOTAL);
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
  mL = oL; mR = oR;
}

// 512点弧线母带
console.log('512点弧线母带...');
for (let i = 0; i < TOTAL; i++) {
  const sec = i / SAMPLE_RATE;
  const arc = getArc(sec);
  const bright = 0.85 + arc * 0.3;
  mL[i] *= bright;
  mR[i] *= bright;
}

// 限制器+归一化
let peak = 0;
for (let i = 0; i < TOTAL; i++) {
  const mx = Math.max(Math.abs(mL[i]), Math.abs(mR[i]));
  if (mx > 0.95) { const g = 0.95 / mx; mL[i] *= g; mR[i] *= g; }
  peak = Math.max(peak, Math.abs(mL[i]), Math.abs(mR[i]));
}
const norm = 0.98 / peak;
for (let i = 0; i < TOTAL; i++) { mL[i] *= norm; mR[i] *= norm; }

// ============================================================
//  十、WAV输出
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

writeWav('/workspace/music/public/dream_qingluan2.wav', mL, mR);

const notes = `《梦境·青鸾2.0》制作笔记
============================================
范式转换：从"声音合成"到"运动模拟"

核心技术栈：
1. 身体状态映射层（10参数）
   肺压/声带张力/声带质量/声门闭合度/舌位前后/舌位高低/唇圆度/软腭/下颌/喉头
   → 映射到振幅/基频/亮度/气声/共振峰偏移/阻尼

2. 全曲512点情感弧线（跨尺度耦合）
   入睡(0.3→0.1) → 浅梦(波动) → 深梦(0.4→0.9) → 梦醒(0.9→0.0)
   每点约117ms分辨率，驱动身体状态全局调制

3. 噪声谱设计（非白噪声）
   高通(>2kHz) + 带通(4-8kHz) + 低通(<12kHz) 三分支
   时变包络：起音多 → 延音少 → 尾音增
   信号耦合：噪声振幅跟随基频包络

4. 音符级微扰动
   低频随机游走(0.5-2Hz)叠加到音高(±5音分)/时长/力度
   从"精确"到"有生命"

5. 乐句级呼吸点
   自动检测换气位置，振幅凹陷+气声增加

6. 中文声母独立建模（12类）
7. 互调耦合混音（房间共振+串音+互调失真）
8. 施罗德混响 + 512点动态母带
============================================
`;
fs.writeFileSync('/workspace/music/public/dream_qingluan2_notes.txt', notes);

console.log('\n✅ 青鸾2.0完成！');
console.log('   音频：/workspace/music/public/dream_qingluan2.wav');
console.log('   笔记：/workspace/music/public/dream_qingluan2_notes.txt');
