const fs = require('fs');

// ============================================================
//  青鸾 Dream Studio —— 《梦境·终极版》
//  集成：乐句级情感弧线 + 中文声母建模 + 风格预设 + 互调耦合
// ============================================================
const SAMPLE_RATE = 22050;
const DURATION = 60;
const TOTAL = SAMPLE_RATE * DURATION;
const BPM = 72;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;

// ===== 工具 =====
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

// 噪声表
const NOISE = new Float32Array(65536);
for (let i = 0; i < 65536; i++) NOISE[i] = Math.random() * 2 - 1;
let nIdx = 0;
function noise() { return NOISE[(nIdx++) & 0xFFFF]; }

// ============================================================
//  一、乐句级情感弧线引擎
// ============================================================
const PHRASES = [
  { start: 16, end: 21, name: '夜色轻轻落下', keys: [{t:0,v:0.35}, {t:0.5,v:0.15}, {t:1,v:0.05}] },
  { start: 24, end: 29, name: '梦里花开又落', keys: [{t:0,v:0.15}, {t:0.5,v:0.45}, {t:1,v:0.15}] },
  { start: 32, end: 37, name: '星光洒满天涯', keys: [{t:0,v:0.4}, {t:0.5,v:0.75}, {t:1,v:0.6}] },
  { start: 40, end: 45, name: '我在云端找答', keys: [{t:0,v:0.55}, {t:0.5,v:0.5}, {t:1,v:0.45}] },
  { start: 48, end: 53, name: '风吹过的沙哑', keys: [{t:0,v:0.45}, {t:0.5,v:0.2}, {t:1,v:0.1}] },
  { start: 56, end: 62, name: '是谁在轻声说话', keys: [{t:0,v:0.2}, {t:0.4,v:0.5}, {t:0.7,v:0.3}, {t:1,v:0.2}] },
  { start: 64, end: 71, name: '梦醒时分泪如雨下', keys: [{t:0,v:0.3}, {t:0.3,v:0.6}, {t:0.6,v:0.95}, {t:1,v:0.5}] },
  { start: 72, end: 85.5, name: '啊啊梦境中的家', keys: [{t:0,v:0.6}, {t:0.3,v:0.8}, {t:0.7,v:0.3}, {t:1,v:0.0}] },
];

function getPhraseEmotion(tick) {
  for (const ph of PHRASES) {
    if (tick >= ph.start && tick <= ph.end) {
      const ratio = (tick - ph.start) / (ph.end - ph.start);
      const k = ph.keys;
      for (let i = 0; i < k.length - 1; i++) {
        if (ratio >= k[i].t && ratio <= k[i+1].t) {
          const r = (ratio - k[i].t) / (k[i+1].t - k[i].t);
          return k[i].v + (k[i+1].v - k[i].v) * r;
        }
      }
      return k[k.length-1].v;
    }
  }
  return 0;
}

// ============================================================
//  二、风格预设系统
// ============================================================
const STYLES = {
  gentle: { vibRate: 5.0, vibDepth: 0.012, breathiness: 0.55, attackSoft: 0.85, pitchJitter: 0.004, brightness: 0.3 },
  powerful: { vibRate: 6.5, vibDepth: 0.02, breathiness: 0.15, attackSoft: 0.15, pitchJitter: 0.001, brightness: 0.7 },
  sobbing: { vibRate: 4.0, vibDepth: 0.028, breathiness: 0.75, attackSoft: 0.95, pitchJitter: 0.01, brightness: 0.2 },
};
const STYLE = STYLES.gentle; // 梦境主题选温柔型

// ============================================================
//  三、中文声母独立建模
// ============================================================
const CHAR_SINIT = {
  '夜':'y','色':'s','轻':'q','落':'l','梦':'m','里':'l','花':'h','开':'k','又':'y',
  '星':'x','光':'g','洒':'s','满':'m','天':'t','涯':'y','我':'w','在':'z','云':'y','端':'d',
  '找':'zh','答':'d','风':'f','吹':'ch','过':'g','的':'d','沙':'sh','哑':'y','是':'sh','谁':'sh',
  '在':'z','轻':'q','声':'sh','说':'sh','话':'h','醒':'x','时':'sh','分':'f','泪':'l','如':'r',
  '雨':'y','下':'x','啊':'','梦':'m','境':'j','中':'zh','的':'d','家':'j'
};
const SINIT_TYPE = {
  'b':'plosive_u','p':'plosive_a','d':'plosive_u','t':'plosive_a','g':'plosive_u','k':'plosive_a',
  'f':'fricative_labial','s':'fricative_alveolar','sh':'fricative_postalveolar','x':'fricative_palatal',
  'h':'fricative_glottal','r':'fricative_postalveolar',
  'z':'affricate_u','zh':'affricate_u','j':'affricate_u',
  'c':'affricate_a','ch':'affricate_a','q':'affricate_a',
  'm':'nasal_labial','n':'nasal_alveolar',
  'l':'lateral','y':'semivowel','w':'semivowel','':'none'
};

function getOnsetType(char) {
  const s = CHAR_SINIT[char] || '';
  return SINIT_TYPE[s] || 'none';
}

function synthOnset(type, len, noteFreq) {
  const out = new Float32Array(len);
  if (type === 'none') return out;

  // 简单滤波器状态
  let lp = 0, hpMem = 0;
  const lpAlpha = (a) => a; // 会在循环中根据类型设置

  for (let i = 0; i < len; i++) {
    const t = i / len; // 0->1 在声母持续期内
    const n = noise();
    let sig = 0;

    switch (type) {
      case 'plosive_u': { // b,d,g 不送气
        const burst = t < 0.2 ? 1.0 : Math.exp(-(t-0.2)*15);
        lp += (n - lp) * 0.3; // 低通
        sig = lp * burst * 0.9;
        break;
      }
      case 'plosive_a': { // p,t,k 送气
        const burst = t < 0.15 ? 1.0 : Math.exp(-(t-0.15)*8);
        lp += (n - lp) * 0.15; // 更低通
        const aspiration = (t > 0.1 && t < 0.7) ? noise() * 0.4 * Math.exp(-(t-0.1)*4) : 0;
        sig = (lp * 0.6 + aspiration) * burst * 0.9;
        break;
      }
      case 'fricative_labial': { // f
        hpMem += (n - hpMem) * 0.4;
        sig = (n - hpMem) * Math.exp(-t*2) * 0.5; // 高频，渐衰
        break;
      }
      case 'fricative_alveolar': { // s
        hpMem += (n - hpMem) * 0.15;
        sig = (n - hpMem) * Math.exp(-t*3) * 0.55;
        break;
      }
      case 'fricative_postalveolar': { // sh,r
        hpMem += (n - hpMem) * 0.25;
        sig = (n - hpMem) * Math.exp(-t*2.5) * 0.5;
        break;
      }
      case 'fricative_palatal': { // x
        hpMem += (n - hpMem) * 0.2;
        sig = (n - hpMem) * Math.exp(-t*3) * 0.5;
        break;
      }
      case 'fricative_glottal': { // h
        lp += (n - lp) * 0.2;
        sig = lp * Math.exp(-t*2) * 0.45;
        break;
      }
      case 'affricate_u': { // z,zh,j
        const burst = t < 0.25 ? 1.0 : Math.exp(-(t-0.25)*6);
        hpMem += (n - hpMem) * 0.3;
        const fric = (t > 0.15) ? (n - hpMem) * 0.6 * Math.exp(-(t-0.15)*5) : 0;
        sig = (lp * 0.4 + fric) * burst * 0.85;
        break;
      }
      case 'affricate_a': { // c,ch,q
        const burst = t < 0.2 ? 1.0 : Math.exp(-(t-0.2)*5);
        hpMem += (n - hpMem) * 0.2;
        const fric = (t > 0.1) ? (n - hpMem) * 0.7 * Math.exp(-(t-0.1)*4) : 0;
        const asp = (t > 0.1 && t < 0.6) ? noise() * 0.3 * Math.exp(-(t-0.1)*3) : 0;
        sig = (lp * 0.3 + fric + asp) * burst * 0.85;
        break;
      }
      case 'nasal_labial': { // m
        lp += (n - lp) * 0.1;
        sig = lp * Math.sin(2 * Math.PI * 280 * i / SAMPLE_RATE) * Math.exp(-t*1.5) * 0.5;
        break;
      }
      case 'nasal_alveolar': { // n
        lp += (n - lp) * 0.12;
        sig = lp * Math.sin(2 * Math.PI * 450 * i / SAMPLE_RATE) * Math.exp(-t*1.5) * 0.5;
        break;
      }
      case 'lateral': { // l
        hpMem += (n - hpMem) * 0.35;
        sig = (n - hpMem) * Math.exp(-t*2.5) * 0.45;
        break;
      }
      case 'semivowel': { // y,w
        lp += (n - lp) * 0.25;
        const glide = Math.sin(2 * Math.PI * noteFreq * 0.5 * i / SAMPLE_RATE);
        sig = lp * glide * (1-t) * 0.35;
        break;
      }
    }
    out[i] = sig;
  }
  return out;
}

// ============================================================
//  四、人声合成器（整合弧线+声母+风格）
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
  '是':'i','谁':'e','在':'a','轻':'i','声':'e','说':'o','话':'a','醒':'i','时':'i',
  '分':'e','泪':'e','如':'u','雨':'u','下':'a','啊':'a','境':'i','中':'o','家':'a'
};

function synthVoice(freq, durSec, char, tick, noteIdx) {
  const len = Math.floor(durSec * SAMPLE_RATE);
  const out = new Float32Array(len);
  const vowel = CHAR_VOWEL[char] || 'a';
  const formants = VOWEL_TBL[vowel] || VOWEL_TBL['a'];

  // 乐句弧线情感值（0-1）
  const phraseEmo = getPhraseEmotion(tick);
  // 局部字情绪叠加
  const localEmo = ({'夜':-0.7,'梦':-0.6,'泪':-0.9,'花':0.6,'星':0.8,'光':0.9,'风':0.1,'啊':0.5}[char] || 0);
  const emotion = phraseEmo + localEmo * 0.3; // 弧线主导，局部微调

  // 风格驱动参数
  const vibRate = STYLE.vibRate + (emotion - 0.5) * 0.5;
  const vibDepth = STYLE.vibDepth * (1 + Math.abs(emotion) * 0.5);
  const breathGain = STYLE.breathiness * (1 - emotion * 0.2); // 暗情感更多气声
  const attackSoft = STYLE.attackSoft;
  const jitter = STYLE.pitchJitter;

  // 音高微抖动（风格+弧线）
  const fBase = freq * (1 + (Math.random()*2-1) * jitter);

  // 共振峰情感染色
  const f1 = formants[0] * (1 + emotion * 0.15);
  const f2 = formants[1] * (1 + emotion * 0.1);
  const f3 = formants[2] * (1 + emotion * 0.08);
  const f4 = formants[3] * (1 + emotion * 0.05);
  const bw = [60, 80, 120, 200];

  // 声母
  const onsetType = getOnsetType(char);
  const onsetDur = onsetType === 'none' ? 0 : Math.floor((0.015 + Math.random()*0.01) * SAMPLE_RATE * (attackSoft * 0.5 + 0.5));
  const onset = synthOnset(onsetType, onsetDur, fBase);

  // 声母→元音过渡比例
  const transitionRatio = 0.25;
  const transitionEnd = Math.floor(onsetDur * (1 + transitionRatio));

  // LF声门
  const period = SAMPLE_RATE / fBase;
  const tRet = 0.3 * period;
  const ta = 0.05 * period;
  const invTa = 1 / ta;
  const eInv = Math.exp(-tRet * invTa);
  const eInv2 = Math.exp(-period * invTa);
  const B = eInv / (1 - eInv2);

  // 颤音表
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

  // 包络参数（弧线驱动）
  const phrasePos = (tick - PHRASES[0].start) / (PHRASES[PHRASES.length-1].end - PHRASES[0].start);
  const att = Math.floor((0.02 + (1-attackSoft)*0.05 + phraseEmo*0.03) * SAMPLE_RATE);
  const dec = Math.floor((0.06 + (1-attackSoft)*0.06) * SAMPLE_RATE);
  const sus = 0.4 + phraseEmo * 0.5;
  const rel = Math.floor((0.08 + (1-phraseEmo)*0.1) * SAMPLE_RATE);

  // 滤波器状态
  const st = [[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]];
  const fcArr = [f1, f2, f3, f4];

  for (let i = 0; i < len; i++) {
    const t = i / len;
    // 声母叠加
    let onsetGain = 0;
    if (i < onsetDur) {
      onsetGain = 1 - t / transitionRatio; // 声母渐弱
    }
    const onsetSample = (i < onset.length) ? onset[i] * Math.max(0, 1 - t/transitionRatio) : 0;

    // 元音部分
    const ff = fBase * (1 + vibTable[i % vibTable.length]);
    const p = SAMPLE_RATE / ff;
    const phase = i % Math.max(1, Math.round(p));

    let glottal = 0;
    if (phase < tRet) {
      glottal = 0.5 * (1 - Math.cos(Math.PI * phase / tRet));
    } else {
      const dp = phase - tRet;
      glottal = B * Math.exp(-dp * invTa) - B * Math.exp(-(period - tRet) * invTa) * 0.01;
    }
    glottal *= 0.8;

    // 气声（breathiness + 弧线）
    const asp = noise() * breathGain * (1 + (phraseEmo > 0.6 ? 0.3 : 0));

    let sig = glottal + asp;

    // 4共振峰
    for (let f = 0; f < 4; f++) {
      const r = Math.exp(-Math.PI * bw[f] * (1 - emotion * 0.1) / SAMPLE_RATE);
      const w0 = 2 * Math.PI * fcArr[f] / SAMPLE_RATE;
      const c = -2 * r * Math.cos(w0);
      const b2 = r * r;
      const a0 = 1 - r;
      const s = st[f];
      const y = a0 * sig - c * s[2] - b2 * s[3];
      s[3] = s[2]; s[2] = y;
      sig = y;
    }

    // 包络（弧线驱动）
    let env;
    if (i < att) env = i / att;
    else if (i < att + dec) env = 1 - (1 - sus) * ((i - att) / dec);
    else if (i < len - rel) env = sus;
    else env = sus * ((len - i) / rel);

    // 表现力微动态：弧线高点增加亮度
    if (phraseEmo > 0.6) {
      env *= (0.9 + 0.1 * Math.sin(i / SAMPLE_RATE * 2));
    }

    // 声母+元音混合
    const vowelGain = (i < transitionEnd) ? (i / transitionEnd) : 1;
    out[i] = onsetSample * (1 - vowelGain * 0.7) + sig * env * vowelGain;
  }
  return out;
}

// ============================================================
//  五、乐器合成器
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
//  六、歌曲数据
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
//  七、互调耦合混音系统
// ============================================================
function intermodulationMix(tracks) {
  // tracks = { voiceL, voiceR, pad, bass, drum, fx, amb }
  const mL = new Float32Array(TOTAL);
  const mR = new Float32Array(TOTAL);

  // 基础混音
  for (let i = 0; i < TOTAL; i++) {
    mL[i] = tracks.voiceL[i] + tracks.pad[i] * 0.6 + tracks.bass[i] * 0.7 + tracks.drum[i] * 0.8 + tracks.fx[i] * 0.5 + tracks.amb[i] * 0.4;
    mR[i] = tracks.voiceR[i] + tracks.pad[i] * 0.6 + tracks.bass[i] * 0.7 + tracks.drum[i] * 0.8 + tracks.fx[i] * 0.5 + tracks.amb[i] * 0.4;
  }

  // 1. 低频总线包络调制（房间共振）
  const lowBus = new Float32Array(TOTAL);
  for (let i = 0; i < TOTAL; i++) lowBus[i] = Math.abs(tracks.bass[i]) + Math.abs(tracks.drum[i]) * 0.5;
  // 低频包络平滑
  let smoothed = 0;
  for (let i = 0; i < TOTAL; i++) { smoothed += (lowBus[i] - smoothed) * 0.001; lowBus[i] = smoothed; }
  // 用低频包络调制整体振幅（模拟房间被低音震动）
  for (let i = 0; i < TOTAL; i++) {
    const mod = 1 + lowBus[i] * 0.03;
    mL[i] *= mod;
    mR[i] *= mod;
  }

  // 2. 话筒串音泄漏
  const leakage = 0.015; // -36dB 左右
  for (let i = 0; i < TOTAL; i++) {
    mL[i] += tracks.voiceR[i] * leakage + tracks.pad[i] * leakage * 0.5;
    mR[i] += tracks.voiceL[i] * leakage + tracks.pad[i] * leakage * 0.5;
  }

  // 3. 互调失真（非线性乘积项）
  for (let i = 0; i < TOTAL; i++) {
    const cross = tracks.voiceL[i] * tracks.pad[i] * 0.02;
    mL[i] += cross;
    mR[i] += cross;
  }

  return [mL, mR];
}

// ============================================================
//  八、主渲染
// ============================================================
console.log('《梦境·终极版》开始渲染...');
console.log('风格：温柔型 | 乐句弧线：启用 | 声母建模：启用 | 互调耦合：启用');

const tracks = {
  voiceL: new Float32Array(TOTAL), voiceR: new Float32Array(TOTAL),
  pad: new Float32Array(TOTAL), bass: new Float32Array(TOTAL),
  drum: new Float32Array(TOTAL), fx: new Float32Array(TOTAL), amb: new Float32Array(TOTAL)
};

// --- 人声 ---
console.log('  [1/7] 乐句级情感弧线人声 + 中文声母建模...');
for (let idx = 0; idx < SONG.length; idx++) {
  const ev = SONG[idx];
  if (ev.inst === 'ks') continue;
  const freq = noteFreq(ev.note);
  const dur = ev.dur * BEAT;
  const off = Math.floor(ev.t / 4 * BAR * SAMPLE_RATE);
  const vox = synthVoice(freq, dur, ev.txt, ev.t, idx);
  const pan = 0.4 + Math.sin(ev.t * 0.3) * 0.2; // 轻微动态声像
  mixIn(tracks.voiceL, tracks.voiceR, vox, off, pan, 0.95);
}

// --- KS ---
console.log('  [2/7] Karplus-Strong...');
for (let idx = 0; idx < SONG.length; idx++) {
  const ev = SONG[idx];
  const freq = noteFreq(ev.note);
  const dur = (ev.inst === 'ks' ? ev.dur : Math.min(ev.dur, 2)) * BEAT;
  const off = Math.floor(ev.t / 4 * BAR * SAMPLE_RATE);
  const ks = ksDream(freq, dur, STYLE.brightness);
  mixIn(tracks.voiceL, tracks.voiceR, ks, off, 0.3 + Math.random() * 0.4, 0.35);
}

// --- 弦乐 ---
console.log('  [3/7] 弦乐铺底...');
for (let c = 0; c < CHORDS.length; c++) {
  const ch = CHORDS[c];
  const notes = chordFreqs(ch.root, ch.type);
  const off = Math.floor(ch.t / 4 * BAR * SAMPLE_RATE);
  const durBar = (c < CHORDS.length - 1 ? (CHORDS[c+1].t - ch.t) : (84 - ch.t)) / 4 * BAR;
  for (let n = 0; n < notes.length; n++) {
    const pd = synthPad(notes[n], durBar + 2);
    mixIn(tracks.voiceL, tracks.voiceR, pd, off, 0.3 + n * 0.2, 0.2);
  }
}

// --- 贝斯 ---
console.log('  [4/7] 贝斯...');
for (let c = 0; c < CHORDS.length; c++) {
  const ch = CHORDS[c];
  const bs = synthBass(noteFreq(ch.root) * 0.5, (c < CHORDS.length - 1 ? (CHORDS[c+1].t - ch.t) : (84 - ch.t)) / 4 * BAR);
  mixMono(tracks.bass, bs, Math.floor(ch.t / 4 * BAR * SAMPLE_RATE), 0.5);
}

// --- 鼓组 ---
console.log('  [5/7] 鼓组...');
for (let idx = 0; idx < SONG.length; idx++) {
  const ev = SONG[idx];
  if (!ev.drum) continue;
  const off = Math.floor(ev.t / 4 * BAR * SAMPLE_RATE);
  mixMono(tracks.drum, kick(BEAT), off, 0.9);
  mixMono(tracks.drum, snare(BEAT), off + Math.floor(BEAT * 0.5 * SAMPLE_RATE), 0.6);
  if (idx % 2 === 0) mixMono(tracks.drum, hihat(BEAT * 0.5), off + Math.floor(BEAT * 0.25 * SAMPLE_RATE), 0.4);
}

// --- FM ---
console.log('  [6/7] FM梦境音效...');
for (let i = 0; i < 8; i++) {
  const off = Math.floor((6 + i * 6) * SAMPLE_RATE);
  const fm = synthFM(440 + Math.random() * 660, 2, 2 + Math.random() * 6);
  mixIn(tracks.voiceL, tracks.voiceR, fm, off, i / 7, 0.25);
}

// --- 粒子 ---
console.log('  [7/7] 粒子纹理...');
const g1 = synthGranular(30, 40);
mixIn(tracks.voiceL, tracks.voiceR, g1, 0, 0.5, 0.35);
const g2 = synthGranular(30, 40);
mixIn(tracks.voiceL, tracks.voiceR, g2, Math.floor(30 * SAMPLE_RATE), 0.5, 0.25);

// ============================================================
//  九、互调耦合 + 混响 + 母带
// ============================================================
console.log('互调耦合混音...');
let [mL, mR] = intermodulationMix(tracks);

console.log('施罗德混响...');
{
  const decay = 0.82;
  const mixAmt = 0.32;
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
  mL = oL; mR = oR;
}

console.log('情感弧线母带...');
for (let i = 0; i < TOTAL; i++) {
  const sec = i / SAMPLE_RATE;
  let curve = 0;
  if (sec < 15) curve = -0.3;
  else if (sec < 30) curve = 0.2;
  else if (sec < 45) curve = 0.4;
  else curve = -0.2;
  const bright = 1 + curve * 0.15;
  mL[i] *= bright;
  mR[i] *= bright;
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

// ============================================================
//  十、WAV写入
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

writeWav('/workspace/music/public/dream_ultimate.wav', mL, mR);

const notes = `《梦境·终极版》制作笔记
============================================
技术栈：
1. 乐句级情感弧线引擎 —— 8个乐句独立弧线，样条插值驱动音量/颤音/气声/亮度
2. 中文声母独立建模 —— 12类声母（爆破送气/不送气、摩擦、塞擦、鼻、边、半元音）
3. 风格预设系统 —— 温柔型（vibRate=5.0, breathiness=0.55, softAttack=0.85）
4. 互调耦合混音 —— 低频房间共振+话筒串音泄漏+非线性互调失真

歌词：
夜色轻轻落下
梦里花开又落
星光洒满天涯
我在云端找答
风吹过的沙哑
是谁在轻声说话
梦醒时分泪如雨下
啊啊梦境中的家

预期听感提升：
- 乐句弧线：从"逐字朗读"升级到"有呼吸起伏的表达"
- 声母建模：辅音清晰度显著提升，b/p/m/f/d/t等不再糊掉
- 互调耦合：各轨道有了"在同一房间里"的胶水感和空气感
- 温柔风格：整体音色温暖、气声自然、颤音如真人呼吸
============================================
`;
fs.writeFileSync('/workspace/music/public/dream_ultimate_notes.txt', notes);

console.log('\n✅ 终极版完成！');
console.log('   音频：/workspace/music/public/dream_ultimate.wav');
console.log('   笔记：/workspace/music/public/dream_ultimate_notes.txt');
