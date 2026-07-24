import { writeFileSync } from 'fs';

const SAMPLE_RATE = 22050; // 降低采样率加速生成
const BPM = 72; // 慢板，梦境感
const SECONDS_PER_BEAT = 60 / BPM;
const TOTAL_DURATION = 60; // 1分钟

// ========== 梦境主题歌词 ==========
const LYRICS = [
  { text: "夜", note: 60, dur: 0.5 },
  { text: "色", note: 62, dur: 0.5 },
  { text: "轻", note: 64, dur: 0.5 },
  { text: "轻", note: 64, dur: 0.5 },
  { text: "落", note: 62, dur: 1.0 },
  { text: "下", note: 60, dur: 1.0 },
  // 第二句
  { text: "梦", note: 67, dur: 0.5 },
  { text: "里", note: 65, dur: 0.5 },
  { text: "花", note: 64, dur: 0.5 },
  { text: "开", note: 62, dur: 0.5 },
  { text: "又", note: 60, dur: 0.5 },
  { text: "落", note: 59, dur: 1.5 },
  // 第三句
  { text: "星", note: 60, dur: 0.5 },
  { text: "光", note: 62, dur: 0.5 },
  { text: "洒", note: 64, dur: 0.5 },
  { text: "满", note: 67, dur: 0.5 },
  { text: "天", note: 69, dur: 0.5 },
  { text: "涯", note: 67, dur: 1.5 },
  // 第四句
  { text: "我", note: 65, dur: 0.5 },
  { text: "在", note: 64, dur: 0.5 },
  { text: "云", note: 62, dur: 0.5 },
  { text: "端", note: 60, dur: 0.5 },
  { text: "找", note: 59, dur: 0.5 },
  { text: "答", note: 60, dur: 2.0 },
  // 第五句
  { text: "风", note: 64, dur: 0.5 },
  { text: "吹", note: 65, dur: 0.5 },
  { text: "过", note: 67, dur: 0.5 },
  { text: "的", note: 65, dur: 0.5 },
  { text: "沙", note: 64, dur: 1.0 },
  { text: "哑", note: 62, dur: 1.0 },
  // 第六句
  { text: "是", note: 60, dur: 0.5 },
  { text: "谁", note: 62, dur: 0.5 },
  { text: "在", note: 64, dur: 0.5 },
  { text: "轻", note: 65, dur: 0.5 },
  { text: "声", note: 67, dur: 0.5 },
  { text: "说", note: 69, dur: 0.5 },
  { text: "话", note: 67, dur: 1.5 },
  // 第七句
  { text: "梦", note: 65, dur: 0.5 },
  { text: "醒", note: 64, dur: 0.5 },
  { text: "时", note: 62, dur: 0.5 },
  { text: "分", note: 60, dur: 0.5 },
  { text: "泪", note: 59, dur: 0.5 },
  { text: "如", note: 60, dur: 0.5 },
  { text: "雨", note: 62, dur: 0.5 },
  { text: "下", note: 64, dur: 2.0 },
  // 尾声
  { text: "啊", note: 67, dur: 0.75 },
  { text: "啊", note: 65, dur: 0.75 },
  { text: "梦", note: 64, dur: 1.0 },
  { text: "境", note: 62, dur: 1.0 },
  { text: "中", note: 60, dur: 1.5 },
  { text: "的", note: 59, dur: 0.5 },
  { text: "家", note: 60, dur: 2.0 },
];

// ========== 工具函数 ==========
function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function createBuffer(seconds) {
  return new Float32Array(Math.floor(seconds * SAMPLE_RATE));
}

// ========== 人声合成（简化但高质量的共振峰合成） ==========
// 使用级联共振峰滤波器模拟元音
const VOWEL_FORMANTS = {
  'a': [{f:700,a:1,bw:90}, {f:1220,a:0.5,bw:110}, {f:2600,a:0.25,bw:170}],
  'o': [{f:500,a:1,bw:80}, {f:900,a:0.4,bw:100}, {f:2400,a:0.15,bw:150}],
  'e': [{f:400,a:1,bw:70}, {f:2000,a:0.5,bw:130}, {f:2800,a:0.2,bw:180}],
  'i': [{f:300,a:1,bw:60}, {f:2500,a:0.5,bw:140}, {f:3300,a:0.15,bw:200}],
  'u': [{f:300,a:1,bw:60}, {f:700,a:0.4,bw:90}, {f:2200,a:0.1,bw:140}],
  'v': [{f:500,a:1,bw:80}, {f:1500,a:0.45,bw:120}, {f:2500,a:0.2,bw:160}], // 通用元音
  'n': [{f:250,a:0.8,bw:50}, {f:1700,a:0.3,bw:100}, {f:2500,a:0.1,bw:150}], // 鼻音
  'l': [{f:300,a:0.9,bw:60}, {f:1200,a:0.35,bw:110}, {f:2400,a:0.15,bw:160}], // 边音
};

function getVowelForChar(char) {
  const c = char.toLowerCase();
  // 拼音到元音的粗略映射
  if ('啊卡妈那拉嘎哈'.includes(c)) return 'a';
  if ('哦波破莫佛罗'.includes(c)) return 'o';
  if ('额得特呢了哥呵'.includes(c)) return 'e';
  if ('衣比皮米力鸡七'.includes(c)) return 'i';
  if ('乌布普木夫卢古胡'.includes(c)) return 'u';
  if ('语女吕居区需鱼于'.includes(c)) return 'v';
  if ('嗯嗯'.includes(c)) return 'n';
  return 'a'; // 默认
}

// 二阶带通滤波器（共振峰）
function bandpassFilter(input, centerFreq, bandwidth, sampleRate) {
  const r = Math.exp(-Math.PI * bandwidth / sampleRate);
  const w = 2 * Math.PI * centerFreq / sampleRate;
  const a1 = -2 * r * Math.cos(w);
  const a2 = r * r;
  const b0 = (1 - r) * Math.sin(w);
  const out = new Float32Array(input.length);
  let z1 = 0, z2 = 0;
  for (let i = 0; i < input.length; i++) {
    const x = input[i];
    const y = b0 * x - a1 * z1 - a2 * z2;
    out[i] = y;
    z2 = z1;
    z1 = y;
  }
  return out;
}

// 声门脉冲（更真实的声源）
function glottalPulse(freq, duration, vibratoRate = 5.5, vibratoDepth = 0.015) {
  const len = Math.floor(duration * SAMPLE_RATE);
  const buf = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / SAMPLE_RATE;
    // 颤音
    const vib = Math.sin(2 * Math.PI * vibratoRate * t) * vibratoDepth;
    const f = freq * (1 + vib);
    const period = SAMPLE_RATE / f;
    const phase = (i % period) / period;
    // LF 声门模型近似
    let pulse = 0;
    if (phase < 0.6) {
      pulse = 0.5 * (1 - Math.cos(Math.PI * phase / 0.6));
    } else {
      pulse = -0.3 * Math.sin(Math.PI * (phase - 0.6) / 0.4);
    }
    // 添加一些噪声模拟气声
    const breath = (Math.random() * 2 - 1) * 0.03;
    buf[i] = pulse * 0.8 + breath;
  }
  return buf;
}

// 生成一个音节的人声
function synthesizeSyllable(char, freq, duration, velocity = 0.7) {
  const vowel = getVowelForChar(char);
  const formants = VOWEL_FORMANTS[vowel] || VOWEL_FORMANTS['a'];
  
  // 声源
  let source = glottalPulse(freq, duration);
  
  // ADSR 包络（人声专用）
  const attack = 0.08;
  const decay = 0.15;
  const sustain = 0.7;
  const release = Math.min(0.3, duration * 0.4);
  for (let i = 0; i < source.length; i++) {
    const t = i / SAMPLE_RATE;
    let env = 0;
    if (t < attack) env = t / attack;
    else if (t < attack + decay) env = 1 - (1 - sustain) * ((t - attack) / decay);
    else if (t < duration - release) env = sustain;
    else env = sustain * Math.max(0, (duration - t) / release);
    source[i] *= env * velocity;
  }
  
  // 级联共振峰滤波
  let output = source;
  for (const fmt of formants) {
    output = bandpassFilter(output, fmt.f, fmt.bw, SAMPLE_RATE);
    // 按共振峰幅度缩放
    for (let i = 0; i < output.length; i++) output[i] *= fmt.a;
  }
  
  // 低频增强（胸腔共鸣）
  output = bandpassFilter(output, 250, 60, SAMPLE_RATE);
  
  return output;
}

// ========== 伴奏生成 ==========

// 钢琴音色（加法合成 + 衰减）
function synthesizePiano(freq, duration, velocity = 0.5) {
  const len = Math.floor(duration * SAMPLE_RATE);
  const buf = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / SAMPLE_RATE;
    // 多个泛音，高频衰减快
    let sample = 0;
    for (let h = 1; h <= 8; h++) {
      const f = freq * h;
      const decay = Math.exp(-t * (2 + h * 0.8));
      const detune = Math.sin(2 * Math.PI * t * 0.5) * 2; // 轻微失谐
      sample += Math.sin(2 * Math.PI * (f + detune) * t) * decay * (1 / h);
    }
    // 起音冲击
    const attack = t < 0.01 ? t / 0.01 : 1;
    buf[i] = sample * attack * velocity;
  }
  return buf;
}

// 弦乐音色
function synthesizeStrings(freq, duration, velocity = 0.4) {
  const len = Math.floor(duration * SAMPLE_RATE);
  const buf = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / SAMPLE_RATE;
    let sample = 0;
    for (let h = 1; h <= 6; h++) {
      const f = freq * h;
      const decay = Math.exp(-t * (0.8 + h * 0.3));
      const vib = Math.sin(2 * Math.PI * 5 * t) * 3; // 揉弦
      sample += Math.sin(2 * Math.PI * (f + vib) * t) * decay * (1 / h);
    }
    const attack = t < 0.1 ? t / 0.1 : 1;
    buf[i] = sample * attack * velocity;
  }
  return buf;
}

// 贝斯
function synthesizeBass(freq, duration, velocity = 0.6) {
  const len = Math.floor(duration * SAMPLE_RATE);
  const buf = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / SAMPLE_RATE;
    // 锯齿波 + 低通
    const period = SAMPLE_RATE / freq;
    const saw = 2 * ((i % period) / period) - 1;
    const env = Math.exp(-t * 4);
    const attack = t < 0.02 ? t / 0.02 : 1;
    buf[i] = saw * env * attack * velocity;
  }
  return buf;
}

// 鼓组
function generateKick(duration) {
  const len = Math.floor(duration * SAMPLE_RATE);
  const buf = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / SAMPLE_RATE;
    const f = 60 * Math.exp(-t * 25);
    const env = Math.exp(-t * 15);
    buf[i] = Math.sin(2 * Math.PI * f * t) * env * 0.9;
  }
  return buf;
}

function generateSnare(duration) {
  const len = Math.floor(duration * SAMPLE_RATE);
  const buf = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / SAMPLE_RATE;
    const noise = (Math.random() * 2 - 1);
    const env = Math.exp(-t * 12);
    const tone = Math.sin(2 * Math.PI * 180 * t) * env * 0.3;
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
    const env = Math.exp(-t * 50);
    buf[i] = noise * env * 0.25;
  }
  return buf;
}

// ========== 混音工具 ==========
function mixToBuffer(target, source, startTime) {
  const startSample = Math.floor(startTime * SAMPLE_RATE);
  for (let i = 0; i < source.length && startSample + i < target.length; i++) {
    target[startSample + i] += source[i];
  }
}

function normalize(buffer) {
  let peak = 0;
  for (let i = 0; i < buffer.length; i++) {
    peak = Math.max(peak, Math.abs(buffer[i]));
  }
  if (peak > 1) {
    for (let i = 0; i < buffer.length; i++) buffer[i] /= peak;
  }
  return buffer;
}

// 简单混响
function applyReverb(input, decay = 2, mix = 0.2) {
  const out = new Float32Array(input.length);
  const delays = [0.03, 0.037, 0.041, 0.043].map(d => Math.floor(d * SAMPLE_RATE));
  const feedbacks = [0.5, 0.45, 0.4, 0.35];
  const combs = delays.map(() => new Float32Array(input.length));
  
  for (let c = 0; c < delays.length; c++) {
    const d = delays[c];
    const fb = feedbacks[c];
    for (let i = 0; i < input.length; i++) {
      combs[c][i] = input[i] + (combs[c][i - d] || 0) * fb;
    }
  }
  
  for (let i = 0; i < input.length; i++) {
    let rev = 0;
    for (let c = 0; c < delays.length; c++) rev += combs[c][i];
    out[i] = input[i] * (1 - mix) + (rev / delays.length) * mix;
  }
  return out;
}

// 限制器
function limiter(buffer, threshold = 0.95) {
  for (let i = 0; i < buffer.length; i++) {
    if (buffer[i] > threshold) buffer[i] = threshold + (buffer[i] - threshold) * 0.1;
    else if (buffer[i] < -threshold) buffer[i] = -threshold + (buffer[i] + threshold) * 0.1;
  }
  return buffer;
}

// ========== 主生成逻辑 ==========
console.log('🎵 开始生成《梦境》歌曲...');
console.log('   时长: 60秒 | BPM: 72 | 采样率: 22050Hz');
console.log('   包含: 人声+钢琴+弦乐+贝斯+鼓组+混响');

const master = createBuffer(TOTAL_DURATION + 3); // 多加3秒混响尾音

// 和弦进行: C - G - Am - F (I - V - vi - IV)
const CHORD_ROOTS = [
  { root: 261.63, start: 0, dur: 4 },   // C
  { root: 392.00, start: 4, dur: 4 },   // G
  { root: 220.00, start: 8, dur: 4 },   // A
  { root: 349.23, start: 12, dur: 4 },  // F
  { root: 261.63, start: 16, dur: 4 },
  { root: 392.00, start: 20, dur: 4 },
  { root: 220.00, start: 24, dur: 4 },
  { root: 349.23, start: 28, dur: 4 },
  { root: 261.63, start: 32, dur: 4 },
  { root: 392.00, start: 36, dur: 4 },
  { root: 220.00, start: 40, dur: 4 },
  { root: 349.23, start: 44, dur: 4 },
  { root: 261.63, start: 48, dur: 4 },
  { root: 392.00, start: 52, dur: 4 },
  { root: 220.00, start: 56, dur: 4 },
];

// 生成人声
console.log('🎤 生成人声轨道...');
let lyricText = '';
let currentTime = 0.5; // 前奏留白
for (let i = 0; i < LYRICS.length; i++) {
  const syllable = LYRICS[i];
  const freq = midiToFreq(syllable.note);
  const dur = syllable.dur * SECONDS_PER_BEAT;
  const voice = synthesizeSyllable(syllable.text, freq, dur, 0.75);
  mixToBuffer(master, voice, currentTime);
  lyricText += syllable.text;
  if (i < LYRICS.length - 1) lyricText += '';
  currentTime += dur;
  if (i % 5 === 0) process.stdout.write('.');
}
console.log(' 完成');

// 生成钢琴和弦
console.log('🎹 生成钢琴轨道...');
for (const ch of CHORD_ROOTS) {
  const third = ch.root * Math.pow(2, 4/12);
  const fifth = ch.root * Math.pow(2, 7/12);
  const p1 = synthesizePiano(ch.root, ch.dur * SECONDS_PER_BEAT, 0.18);
  const p2 = synthesizePiano(third, ch.dur * SECONDS_PER_BEAT, 0.14);
  const p3 = synthesizePiano(fifth, ch.dur * SECONDS_PER_BEAT, 0.14);
  mixToBuffer(master, p1, ch.start * SECONDS_PER_BEAT);
  mixToBuffer(master, p2, ch.start * SECONDS_PER_BEAT);
  mixToBuffer(master, p3, ch.start * SECONDS_PER_BEAT);
}
console.log(' 完成');

// 生成弦乐铺底
console.log('🎻 生成弦乐轨道...');
for (const ch of CHORD_ROOTS) {
  const third = ch.root * Math.pow(2, 4/12);
  const s1 = synthesizeStrings(ch.root, ch.dur * SECONDS_PER_BEAT, 0.12);
  const s2 = synthesizeStrings(third, ch.dur * SECONDS_PER_BEAT, 0.1);
  mixToBuffer(master, s1, ch.start * SECONDS_PER_BEAT);
  mixToBuffer(master, s2, ch.start * SECONDS_PER_BEAT);
}
console.log(' 完成');

// 生成贝斯
console.log('🎸 生成贝斯轨道...');
const BASS_PATTERN = [0, 2, 2.5, 3]; // 每小节4拍中的贝斯位置
for (const ch of CHORD_ROOTS) {
  for (const beat of BASS_PATTERN) {
    const t = ch.start * SECONDS_PER_BEAT + beat * SECONDS_PER_BEAT;
    const bass = synthesizeBass(ch.root * 0.5, 0.4 * SECONDS_PER_BEAT, 0.5);
    mixToBuffer(master, bass, t);
  }
}
console.log(' 完成');

// 生成鼓组
console.log('🥁 生成鼓组轨道...');
const beatDur = SECONDS_PER_BEAT;
const totalBeats = Math.floor(TOTAL_DURATION / beatDur);
for (let beat = 0; beat < totalBeats; beat++) {
  const t = beat * beatDur;
  // 底鼓: 1, 3拍
  if (beat % 4 === 0 || beat % 4 === 2) {
    const kick = generateKick(0.3);
    mixToBuffer(master, kick, t);
  }
  // 军鼓: 2, 4拍
  if (beat % 4 === 1 || beat % 4 === 3) {
    const snare = generateSnare(0.3);
    mixToBuffer(master, snare, t);
  }
  // 踩镲: 每拍
  const hat = generateHiHat(0.1);
  mixToBuffer(master, hat, t);
  // 反拍踩镲
  const hat2 = generateHiHat(0.08);
  mixToBuffer(master, hat2, t + beatDur * 0.5);
}
console.log(' 完成');

// 应用混响
console.log('🌊 应用混响...');
const withReverb = applyReverb(master, 2.5, 0.18);
console.log(' 完成');

// 限制器 + 标准化
console.log('📊 最终处理...');
limiter(withReverb, 0.95);
normalize(withReverb);
console.log(' 完成');

// 转换为 WAV
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

const wavData = pcmToWav(withReverb);
writeFileSync('/workspace/music/public/dream_song.wav', wavData);

// 保存歌词
const fullLyrics = `《梦境》

夜色轻轻落下
梦里花开又落
星光洒满天涯
我在云端找答

风吹过的沙哑
是谁在轻声说话
梦醒时分泪如雨下
啊啊梦境中的家
`;
writeFileSync('/workspace/music/public/dream_lyrics.txt', fullLyrics);

console.log('\n✅ 《梦境》歌曲生成完成！');
console.log(`   文件: /workspace/music/public/dream_song.wav`);
console.log(`   大小: ${(wavData.length / 1024 / 1024).toFixed(2)} MB`);
console.log(`   时长: ${(withReverb.length / SAMPLE_RATE).toFixed(2)} 秒`);
console.log(`   歌词已保存: /workspace/music/public/dream_lyrics.txt`);
