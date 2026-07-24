import { writeFileSync } from 'fs';

const SAMPLE_RATE = 44100;

function generateSine(freq, duration, velocity = 0.5) {
  const len = Math.floor(duration * SAMPLE_RATE);
  const buf = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / SAMPLE_RATE;
    // ADSR 包络
    const attack = 0.02;
    const decay = 0.1;
    const sustain = 0.6;
    const release = 0.3;
    let env = 0;
    if (t < attack) env = t / attack;
    else if (t < attack + decay) env = 1 - (1 - sustain) * ((t - attack) / decay);
    else if (t < duration - release) env = sustain;
    else env = sustain * ((duration - t) / release);
    if (env < 0) env = 0;
    // 正弦波 + 少量泛音增加丰富度
    let sample = Math.sin(2 * Math.PI * freq * t);
    sample += 0.3 * Math.sin(2 * Math.PI * freq * 2 * t);
    sample += 0.15 * Math.sin(2 * Math.PI * freq * 3 * t);
    sample += 0.08 * Math.sin(2 * Math.PI * freq * 4 * t);
    sample += 0.05 * Math.sin(2 * Math.PI * freq * 5 * t);
    buf[i] = sample * env * velocity;
  }
  return buf;
}

function mixBuffers(buffers) {
  if (buffers.length === 0) return new Float32Array(0);
  let maxLen = 0;
  for (const b of buffers) maxLen = Math.max(maxLen, b.length);
  const out = new Float32Array(maxLen);
  for (const b of buffers) {
    for (let i = 0; i < b.length; i++) out[i] += b[i];
  }
  // 防止削波
  let peak = 0;
  for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]));
  if (peak > 1) {
    for (let i = 0; i < out.length; i++) out[i] /= peak;
  }
  return out;
}

function pcmToWav(pcm) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = SAMPLE_RATE * numChannels * bitsPerSample / 8;
  const blockAlign = numChannels * bitsPerSample / 8;
  const dataSize = pcm.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeString = (offset, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  return Buffer.from(buffer);
}

// C大调旋律：小星星变奏曲风格
const melody = [
  { note: 60, dur: 0.5 }, // C4
  { note: 60, dur: 0.5 },
  { note: 67, dur: 0.5 }, // G4
  { note: 67, dur: 0.5 },
  { note: 69, dur: 0.5 }, // A4
  { note: 69, dur: 0.5 },
  { note: 67, dur: 1.0 }, // G4
  { note: 65, dur: 0.5 }, // F4
  { note: 65, dur: 0.5 },
  { note: 64, dur: 0.5 }, // E4
  { note: 64, dur: 0.5 },
  { note: 62, dur: 0.5 }, // D4
  { note: 62, dur: 0.5 },
  { note: 60, dur: 1.0 }, // C4
  // 第二段
  { note: 67, dur: 0.5 },
  { note: 67, dur: 0.5 },
  { note: 65, dur: 0.5 },
  { note: 65, dur: 0.5 },
  { note: 64, dur: 0.5 },
  { note: 64, dur: 0.5 },
  { note: 62, dur: 1.0 },
  { note: 67, dur: 0.5 },
  { note: 67, dur: 0.5 },
  { note: 65, dur: 0.5 },
  { note: 65, dur: 0.5 },
  { note: 64, dur: 0.5 },
  { note: 64, dur: 0.5 },
  { note: 62, dur: 1.0 },
  // 结尾
  { note: 60, dur: 0.5 },
  { note: 67, dur: 0.5 },
  { note: 69, dur: 0.5 },
  { note: 67, dur: 0.5 },
  { note: 65, dur: 0.5 },
  { note: 64, dur: 0.5 },
  { note: 62, dur: 0.5 },
  { note: 60, dur: 1.5 },
];

// 和弦伴奏（C-G-Am-F）
const chords = [
  { root: 261.63, dur: 2 }, // C
  { root: 392.00, dur: 2 }, // G
  { root: 440.00, dur: 2 }, // A
  { root: 349.23, dur: 2 }, // F
  { root: 261.63, dur: 2 },
  { root: 392.00, dur: 2 },
  { root: 440.00, dur: 2 },
  { root: 349.23, dur: 2 },
  { root: 261.63, dur: 4 },
];

function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

const noteBuffers = [];
let currentTime = 0;
for (const n of melody) {
  const freq = midiToFreq(n.note);
  const buf = generateSine(freq, n.dur, 0.6);
  // 放到正确的时间位置
  const startSample = Math.floor(currentTime * SAMPLE_RATE);
  const fullBuf = new Float32Array(startSample + buf.length);
  fullBuf.set(buf, startSample);
  noteBuffers.push(fullBuf);
  currentTime += n.dur;
}

const chordBuffers = [];
let chordTime = 0;
for (const ch of chords) {
  // 三和弦：根音+三度+五度
  const root = ch.root;
  const third = root * Math.pow(2, 4/12);
  const fifth = root * Math.pow(2, 7/12);
  const b1 = generateSine(root, ch.dur, 0.15);
  const b2 = generateSine(third, ch.dur, 0.12);
  const b3 = generateSine(fifth, ch.dur, 0.12);
  const chordMix = new Float32Array(b1.length);
  for (let i = 0; i < chordMix.length; i++) {
    chordMix[i] = b1[i] + b2[i] + b3[i];
  }
  const startSample = Math.floor(chordTime * SAMPLE_RATE);
  const fullBuf = new Float32Array(startSample + chordMix.length);
  fullBuf.set(chordMix, startSample);
  chordBuffers.push(fullBuf);
  chordTime += ch.dur;
}

// 贝斯低音
const bassNotes = [
  { freq: 65.41, dur: 2 }, // C2
  { freq: 98.00, dur: 2 }, // G2
  { freq: 110.00, dur: 2 }, // A2
  { freq: 87.31, dur: 2 }, // F2
  { freq: 65.41, dur: 2 },
  { freq: 98.00, dur: 2 },
  { freq: 110.00, dur: 2 },
  { freq: 87.31, dur: 2 },
  { freq: 65.41, dur: 4 },
];

const bassBuffers = [];
let bassTime = 0;
for (const bn of bassNotes) {
  const buf = generateSine(bn.freq, bn.dur, 0.4);
  const startSample = Math.floor(bassTime * SAMPLE_RATE);
  const fullBuf = new Float32Array(startSample + buf.length);
  fullBuf.set(buf, startSample);
  bassBuffers.push(fullBuf);
  bassTime += bn.dur;
}

// 简单的鼓点节奏
function generateKick(duration) {
  const len = Math.floor(duration * SAMPLE_RATE);
  const buf = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / SAMPLE_RATE;
    const freq = 60 * Math.exp(-t * 30);
    const env = Math.exp(-t * 20);
    buf[i] = Math.sin(2 * Math.PI * freq * t) * env * 0.8;
  }
  return buf;
}

function generateSnare(duration) {
  const len = Math.floor(duration * SAMPLE_RATE);
  const buf = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / SAMPLE_RATE;
    const noise = (Math.random() * 2 - 1);
    const env = Math.exp(-t * 15);
    const tone = Math.sin(2 * Math.PI * 200 * t) * env * 0.3;
    buf[i] = (noise * env * 0.5 + tone) * 0.6;
  }
  return buf;
}

function generateHiHat(duration) {
  const len = Math.floor(duration * SAMPLE_RATE);
  const buf = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / SAMPLE_RATE;
    const noise = (Math.random() * 2 - 1);
    const env = Math.exp(-t * 60);
    buf[i] = noise * env * 0.3;
  }
  return buf;
}

// 4/4 拍，BPM=100，每拍0.6秒
const beatDur = 0.6;
const drumBuffers = [];
for (let bar = 0; bar < 9; bar++) {
  for (let beat = 0; beat < 4; beat++) {
    const t = (bar * 4 + beat) * beatDur;
    const startSample = Math.floor(t * SAMPLE_RATE);
    // 第1拍：底鼓
    if (beat === 0 || beat === 2) {
      const kick = generateKick(0.3);
      const full = new Float32Array(startSample + kick.length);
      full.set(kick, startSample);
      drumBuffers.push(full);
    }
    // 第2、4拍：军鼓
    if (beat === 1 || beat === 3) {
      const snare = generateSnare(0.3);
      const full = new Float32Array(startSample + snare.length);
      full.set(snare, startSample);
      drumBuffers.push(full);
    }
    // 每拍都有踩镲
    const hat = generateHiHat(0.1);
    const hatFull = new Float32Array(startSample + hat.length);
    hatFull.set(hat, startSample);
    drumBuffers.push(hatFull);
  }
}

const allBuffers = [...noteBuffers, ...chordBuffers, ...bassBuffers, ...drumBuffers];
const finalMix = mixBuffers(allBuffers);

// 添加简单的混响尾音（简易施罗德混响）
function simpleReverb(input, mix = 0.2) {
  const comb1 = new Float32Array(input.length);
  const delay1 = Math.floor(0.03 * SAMPLE_RATE);
  for (let i = 0; i < input.length; i++) {
    comb1[i] = input[i] + (comb1[i - delay1] || 0) * 0.7;
  }
  const comb2 = new Float32Array(input.length);
  const delay2 = Math.floor(0.037 * SAMPLE_RATE);
  for (let i = 0; i < input.length; i++) {
    comb2[i] = input[i] + (comb2[i - delay2] || 0) * 0.7;
  }
  const out = new Float32Array(input.length);
  for (let i = 0; i < input.length; i++) {
    out[i] = input[i] * (1 - mix) + (comb1[i] + comb2[i]) * 0.5 * mix;
  }
  return out;
}

const withReverb = simpleReverb(finalMix, 0.15);

// 最终标准化
let finalPeak = 0;
for (let i = 0; i < withReverb.length; i++) {
  finalPeak = Math.max(finalPeak, Math.abs(withReverb[i]));
}
if (finalPeak > 1) {
  for (let i = 0; i < withReverb.length; i++) withReverb[i] /= finalPeak;
}

const wavData = pcmToWav(withReverb);
writeFileSync('/workspace/music/demo_music.wav', wavData);

console.log('✅ 演示音乐已生成: /workspace/music/demo_music.wav');
console.log(`   时长: ${(withReverb.length / SAMPLE_RATE).toFixed(2)} 秒`);
console.log(`   样本数: ${withReverb.length}`);
console.log(`   峰值: ${finalPeak.toFixed(4)}`);
