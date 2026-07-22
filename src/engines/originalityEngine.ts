/**
 * 原创性保护引擎 (Originality Protection Engine)
 * 为青鸾 DAW 生成的音乐提供：
 *   1. 不可感知的频域+时域双模数字水印
 *   2. 真人感强化（相位误差、麦克风串音、压缩痕迹、调音台串扰）
 *   3. 防抄袭检测与唯一动机生成
 *
 * 策略：不是对抗机器检测，而是证明原创 + 好到不像 AI。
 */

import { fft, Complex, TWO_PI } from '../visualization/musicVisualizer.js';
import { clamp, dbToGain, hannWindow } from '../utils/audioUtils.js';

const SAMPLE_RATE = 44100;
const FRAME_SIZE = 2048;
const HOP_SIZE = 1024;
const WATERMARK_BAND_LOW = 4000;
const WATERMARK_BAND_HIGH = 8000;
const SYNC_CODE = 0xa55a;
const NUM_CHIP_BINS = 8;
const PRBS_SEED = 0x1a2b3c4d;

// ═════════════════════════════════════════════════════════════
// 内部工具函数
// ═════════════════════════════════════════════════════════════

/** DJB2 字符串哈希 -> 32 位无符号整数 */
function stringHash32(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/** CRC-16 (CCITT) */
function crc16(data: Uint8Array): number {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i] << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xffff;
    }
  }
  return crc;
}

/** 伪随机比特：基于 xorshift 的确定性序列 */
function prbsBit(seed: number, index: number): boolean {
  let s = (seed ^ index) >>> 0;
  s ^= s << 13;
  s ^= s >>> 17;
  s ^= s << 5;
  return ((s >>> 0) & 1) === 1;
}

function bitsToBytes(bits: number[]): Uint8Array {
  const bytes = new Uint8Array(Math.ceil(bits.length / 8));
  for (let i = 0; i < bits.length; i++) {
    if (bits[i]) bytes[i >> 3] |= 1 << (7 - (i & 7));
  }
  return bytes;
}

function bytesToBits(bytes: Uint8Array): number[] {
  const bits: number[] = [];
  for (let i = 0; i < bytes.length; i++) {
    for (let j = 7; j >= 0; j--) bits.push((bytes[i] >> j) & 1);
  }
  return bits;
}

function uintToBits(v: number, len: number): number[] {
  const bits: number[] = [];
  for (let i = len - 1; i >= 0; i--) bits.push((v >>> i) & 1);
  return bits;
}

function bitsToUint(bits: number[], len: number): number {
  let v = 0;
  for (let i = 0; i < len; i++) v = (v << 1) | (bits[i] & 1);
  return len === 32 ? v >>> 0 : v;
}

/** 一阶 IIR 低通滤波器 */
function lowpassIIR(input: Float32Array, cutoff: number, sampleRate: number): Float32Array {
  const rc = 1.0 / (2.0 * Math.PI * cutoff);
  const dt = 1.0 / sampleRate;
  const alpha = dt / (rc + dt);
  const output = new Float32Array(input.length);
  let y = input[0] ?? 0;
  for (let i = 0; i < input.length; i++) {
    y += alpha * (input[i] - y);
    output[i] = y;
  }
  return output;
}

/** 计算信号 RMS（按窗口） */
function windowedRms(pcm: Float32Array, start: number, size: number): number {
  let sum = 0;
  const end = Math.min(start + size, pcm.length);
  for (let i = start; i < end; i++) {
    sum += pcm[i] * pcm[i];
  }
  return Math.sqrt(sum / (end - start));
}

// ═════════════════════════════════════════════════════════════
// IFFT 辅助（频域水印需要修改频谱后逆变换）
// ═════════════════════════════════════════════════════════════

function bitReversePermutationComplex(input: Complex[]): Complex[] {
  const n = input.length;
  const result: Complex[] = new Array(n);
  const bits = Math.log2(n);
  for (let i = 0; i < n; i++) {
    let reversed = 0;
    for (let j = 0; j < bits; j++) {
      reversed = (reversed << 1) | ((i >> j) & 1);
    }
    result[i] = { re: input[reversed].re, im: input[reversed].im };
  }
  return result;
}

function ifft(input: Complex[]): Float32Array {
  const n = input.length;
  if ((n & (n - 1)) !== 0) {
    throw new Error('IFFT 输入长度必须是 2 的幂次');
  }
  const output = bitReversePermutationComplex(input);
  const angleStep = TWO_PI / n;

  for (let len = 2; len <= n; len <<= 1) {
    const halfLen = len >> 1;
    const step = angleStep * (n / len);
    for (let i = 0; i < n; i += len) {
      let angle = 0;
      for (let j = 0; j < halfLen; j++) {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const even = output[i + j];
        const oddRe = output[i + j + halfLen].re * cos - output[i + j + halfLen].im * sin;
        const oddIm = output[i + j + halfLen].re * sin + output[i + j + halfLen].im * cos;
        output[i + j] = { re: even.re + oddRe, im: even.im + oddIm };
        output[i + j + halfLen] = { re: even.re - oddRe, im: even.im - oddIm };
        angle += step;
      }
    }
  }

  const result = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    result[i] = output[i].re / n;
  }
  return result;
}

// ═════════════════════════════════════════════════════════════
// 接口定义
// ═════════════════════════════════════════════════════════════

export interface WatermarkConfig {
  creatorId: string;
  timestamp: number;
  projectHash: string;
  strength?: number;
}

export interface WatermarkResult {
  embedded: boolean;
  creatorId: string;
  timestamp: number;
  projectHash: string;
  confidence: number;
}

// ═════════════════════════════════════════════════════════════
// OriginalityEngine：频域 + 时域双模水印
// ═════════════════════════════════════════════════════════════

export class OriginalityEngine {
  private readonly _sampleRate: number;
  private readonly _window: Float32Array;

  constructor(sampleRate?: number) {
    this._sampleRate = sampleRate ?? SAMPLE_RATE;
    this._window = hannWindow(FRAME_SIZE);
  }

  /** 将配置编码为比特流（含 3 重冗余） */
  private _buildWatermarkBits(config: WatermarkConfig): number[] {
    const creatorHash = stringHash32(config.creatorId);
    const ts = Math.floor(config.timestamp / 1000) & 0xffffffff;
    const projHash = stringHash32(config.projectHash);

    const payloadBits: number[] = [
      ...uintToBits(SYNC_CODE, 16),
      ...uintToBits(creatorHash, 32),
      ...uintToBits(ts, 32),
      ...uintToBits(projHash, 32),
    ];

    const payloadBytes = bitsToBytes(payloadBits);
    const crc = crc16(payloadBytes);
    payloadBits.push(...uintToBits(crc, 16));

    const redundant: number[] = [];
    for (let r = 0; r < 3; r++) {
      redundant.push(...payloadBits);
    }
    return redundant; // 384 bits
  }

  embedWatermark(pcm: Float32Array, config: WatermarkConfig): Float32Array {
    const strength = clamp(config.strength ?? 0.02, 0.001, 0.1);
    const watermarkBits = this._buildWatermarkBits(config);
    const numFrames = Math.max(0, Math.floor((pcm.length - FRAME_SIZE) / HOP_SIZE) + 1);
    if (numFrames === 0) return new Float32Array(pcm);

    const output = new Float32Array(pcm.length);
    const norm = new Float32Array(pcm.length);

    const binLow = Math.round((WATERMARK_BAND_LOW * FRAME_SIZE) / this._sampleRate);
    const binHigh = Math.round((WATERMARK_BAND_HIGH * FRAME_SIZE) / this._sampleRate);
    const bandWidth = Math.max(1, binHigh - binLow - NUM_CHIP_BINS);

    for (let f = 0; f < numFrames; f++) {
      const start = f * HOP_SIZE;
      const frame = new Float32Array(FRAME_SIZE);
      for (let i = 0; i < FRAME_SIZE; i++) {
        frame[i] = pcm[start + i] * this._window[i];
      }

      const spectrum = fft(frame, false);
      const bit = watermarkBits[f % watermarkBits.length];
      const chipStart = binLow + ((stringHash32(`${PRBS_SEED}_${f}`) >>> 0) % bandWidth);

      let avgMag = 0;
      for (let k = 0; k < NUM_CHIP_BINS; k++) {
        const idx = chipStart + k;
        const re = spectrum[idx].re;
        const im = spectrum[idx].im;
        avgMag += Math.sqrt(re * re + im * im);
      }
      avgMag /= NUM_CHIP_BINS;

      for (let k = 0; k < NUM_CHIP_BINS; k++) {
        const idx = chipStart + k;
        const chipSign = prbsBit(PRBS_SEED, f * 31 + k * 17) ? 1 : -1;
        const bitSign = bit ? 1 : -1;
        const delta = strength * avgMag * bitSign * chipSign;

        const re = spectrum[idx].re;
        const im = spectrum[idx].im;
        const mag = Math.sqrt(re * re + im * im);
        const newMag = Math.max(mag * 0.1, mag + delta);
        const scale = mag > 1e-9 ? newMag / mag : 1;
        spectrum[idx].re *= scale;
        spectrum[idx].im *= scale;

        // 保持共轭对称
        const mirror = FRAME_SIZE - idx;
        if (mirror !== idx) {
          spectrum[mirror].re = spectrum[idx].re;
          spectrum[mirror].im = -spectrum[idx].im;
        }
      }

      const timeDomain = ifft(spectrum);
      for (let i = 0; i < FRAME_SIZE; i++) {
        output[start + i] += timeDomain[i] * this._window[i];
        norm[start + i] += this._window[i] * this._window[i];
      }
    }

    const result = new Float32Array(pcm.length);
    for (let i = 0; i < pcm.length; i++) {
      if (norm[i] > 0.001) {
        result[i] = output[i] / norm[i];
      } else {
        result[i] = pcm[i];
      }
    }

    return this._embedTemporalWatermark(result, stringHash32(config.creatorId));
  }

  private _embedTemporalWatermark(pcm: Float32Array, creatorHash: number): Float32Array {
    const result = new Float32Array(pcm);
    const syncByte = 0x5a;
    const dataByte = creatorHash & 0xff;
    const bits: number[] = [];
    for (let i = 7; i >= 0; i--) bits.push((syncByte >> i) & 1);
    for (let i = 7; i >= 0; i--) bits.push((dataByte >> i) & 1);

    const blockSize = 256;
    const silenceThresh = 0.001;
    let silentStart = -1;

    for (let pos = 0; pos < pcm.length; pos += blockSize) {
      const rms = windowedRms(pcm, pos, blockSize);
      if (rms < silenceThresh) {
        if (silentStart < 0) silentStart = pos;
      } else {
        if (silentStart >= 0 && pos - silentStart >= 2048) {
          let pulsePos = silentStart + blockSize;
          for (let b = 0; b < bits.length && pulsePos < pos; b++) {
            const interval = bits[b] ? 512 : 256;
            if (pulsePos < result.length) {
              result[pulsePos] += 0.0005;
            }
            pulsePos += interval;
          }
        }
        silentStart = -1;
      }
    }
    return result;
  }

  extractWatermark(pcm: Float32Array): WatermarkResult | null {
    const numFrames = Math.max(0, Math.floor((pcm.length - FRAME_SIZE) / HOP_SIZE) + 1);
    if (numFrames < 128) return null;

    const watermarkLen = 384; // 128 bits * 3
    const votes = new Int32Array(watermarkLen);

    const binLow = Math.round((WATERMARK_BAND_LOW * FRAME_SIZE) / this._sampleRate);
    const binHigh = Math.round((WATERMARK_BAND_HIGH * FRAME_SIZE) / this._sampleRate);
    const bandWidth = Math.max(1, binHigh - binLow - NUM_CHIP_BINS);

    for (let f = 0; f < numFrames; f++) {
      const start = f * HOP_SIZE;
      const frame = new Float32Array(FRAME_SIZE);
      for (let i = 0; i < FRAME_SIZE; i++) {
        frame[i] = pcm[start + i] * this._window[i];
      }
      const spectrum = fft(frame, false);
      const chipStart = binLow + ((stringHash32(`${PRBS_SEED}_${f}`) >>> 0) % bandWidth);

      let avgMag = 0;
      const mags = new Float32Array(NUM_CHIP_BINS);
      for (let k = 0; k < NUM_CHIP_BINS; k++) {
        const idx = chipStart + k;
        const re = spectrum[idx].re;
        const im = spectrum[idx].im;
        mags[k] = Math.sqrt(re * re + im * im);
        avgMag += mags[k];
      }
      avgMag /= NUM_CHIP_BINS;
      if (avgMag < 1e-12) continue;

      let correlation = 0;
      for (let k = 0; k < NUM_CHIP_BINS; k++) {
        const chipSign = prbsBit(PRBS_SEED, f * 31 + k * 17) ? 1 : -1;
        correlation += (mags[k] / avgMag) * chipSign;
      }

      const bitIdx = f % watermarkLen;
      votes[bitIdx] += correlation > 0 ? 1 : -1;
    }

    const decodedBits: number[] = [];
    for (let i = 0; i < watermarkLen; i++) {
      decodedBits.push(votes[i] >= 0 ? 1 : 0);
    }

    for (let block = 0; block < 3; block++) {
      const offset = block * 128;
      const syncBits = decodedBits.slice(offset, offset + 16);
      const syncVal = bitsToUint(syncBits, 16);
      if (syncVal !== SYNC_CODE) continue;

      const creatorHash = bitsToUint(decodedBits.slice(offset + 16, offset + 48), 32);
      const tsRaw = bitsToUint(decodedBits.slice(offset + 48, offset + 80), 32);
      const projHash = bitsToUint(decodedBits.slice(offset + 80, offset + 112), 32);
      const crcBits = bitsToUint(decodedBits.slice(offset + 112, offset + 128), 16);

      const payloadBytes = bitsToBytes(decodedBits.slice(offset, offset + 112));
      const expectedCrc = crc16(payloadBytes);
      if (crcBits !== expectedCrc) continue;

      let confSum = 0;
      for (let i = offset; i < offset + 128; i++) {
        confSum += Math.abs(votes[i]);
      }
      const confidence = clamp(confSum / (128 * Math.max(1, Math.floor(numFrames / watermarkLen))), 0, 1);

      return {
        embedded: true,
        creatorId: `creator_${creatorHash.toString(16)}`,
        timestamp: tsRaw * 1000,
        projectHash: projHash.toString(16).padStart(8, '0'),
        confidence,
      };
    }

    return null;
  }

  verifyOrigin(pcm: Float32Array, expectedCreatorId?: string): boolean {
    const result = this.extractWatermark(pcm);
    if (!result || !result.embedded) return false;
    if (expectedCreatorId !== undefined) {
      const expectedHash = `creator_${stringHash32(expectedCreatorId).toString(16)}`;
      return result.creatorId === expectedHash && result.confidence > 0.3;
    }
    return result.confidence > 0.3;
  }

  generateProjectHash(params: Record<string, unknown>): string {
    const keys = Object.keys(params).sort();
    const str = JSON.stringify(params, keys);
    return stringHash32(str).toString(16).padStart(8, '0');
  }
}

// ═════════════════════════════════════════════════════════════
// HumanFeelEnhancer：真人感强化
// ═════════════════════════════════════════════════════════════

export class HumanFeelEnhancer {
  private readonly _sampleRate: number;

  constructor(sampleRate?: number) {
    this._sampleRate = sampleRate ?? SAMPLE_RATE;
  }

  /** 一键应用全套真人感处理（最终输出为立体声 interleaved） */
  enhance(pcm: Float32Array, params?: {
    humanizationIntensity?: number;
    analogIntensity?: number;
    breathNoise?: number;
    microTiming?: number;
  }): Float32Array {
    const p = {
      humanizationIntensity: clamp(params?.humanizationIntensity ?? 0.5, 0, 1),
      analogIntensity: clamp(params?.analogIntensity ?? 0.5, 0, 1),
      breathNoise: clamp(params?.breathNoise ?? 0.3, 0, 1),
      microTiming: clamp(params?.microTiming ?? 0.5, 0, 1),
    };

    let signal: Float32Array = new Float32Array(pcm);
    signal = this.addConsoleCrosstalk(signal, p.analogIntensity);
    signal = this.addCompressionArtifacts(signal, p.analogIntensity);
    signal = this.addMicBleed(signal, p.analogIntensity);
    signal = this.addPhaseImperfection(signal, p.analogIntensity);
    return signal;
  }

  addPhaseImperfection(pcm: Float32Array, amount = 0.5): Float32Array {
    const delaySamples = Math.round((0.0001 + 0.0004 * clamp(amount, 0, 1)) * this._sampleRate);
    const stereo = new Float32Array(pcm.length * 2);
    const right = new Float32Array(pcm.length);
    for (let i = 0; i < pcm.length; i++) {
      right[i] = i >= delaySamples ? pcm[i - delaySamples] : 0;
    }
    const filtered = lowpassIIR(right, 10000, this._sampleRate);
    for (let i = 0; i < pcm.length; i++) {
      stereo[i * 2] = pcm[i];
      stereo[i * 2 + 1] = filtered[i] * 0.97 + pcm[i] * 0.03;
    }
    return stereo;
  }

  addMicBleed(pcm: Float32Array, amount = 0.5): Float32Array {
    const delaySamples = Math.round((0.005 + 0.01 * Math.random()) * this._sampleRate);
    const attenuation = dbToGain(-30) * clamp(amount, 0, 1);
    const delayed = new Float32Array(pcm.length);
    for (let i = 0; i < pcm.length; i++) {
      delayed[i] = i >= delaySamples ? pcm[i - delaySamples] : 0;
    }
    const filtered = lowpassIIR(delayed, 5000, this._sampleRate);
    const output = new Float32Array(pcm.length);
    for (let i = 0; i < pcm.length; i++) {
      output[i] = pcm[i] + filtered[i] * attenuation;
    }
    return output;
  }

  addCompressionArtifacts(pcm: Float32Array, amount = 0.5): Float32Array {
    const threshold = 0.1; // -20dB
    const ratio = 1.2;
    const wet = 0.1 * clamp(amount, 0, 1);
    const attackCoeff = Math.exp(-1.0 / (this._sampleRate * 0.001));
    const releaseCoeff = Math.exp(-1.0 / (this._sampleRate * 0.1));

    const output = new Float32Array(pcm.length);
    let envelope = 1.0;

    for (let i = 0; i < pcm.length; i++) {
      const x = pcm[i];
      const absX = Math.abs(x);
      let targetGain = 1.0;
      if (absX > threshold) {
        const compressed = threshold + (absX - threshold) / ratio;
        targetGain = compressed / absX;
      }
      if (targetGain < envelope) {
        envelope = attackCoeff * envelope + (1 - attackCoeff) * targetGain;
      } else {
        envelope = releaseCoeff * envelope + (1 - releaseCoeff) * targetGain;
      }
      output[i] = x * (1.0 - wet) + x * envelope * wet;
    }
    return output;
  }

  addConsoleCrosstalk(pcm: Float32Array, amount = 0.5): Float32Array {
    const delaySamples = Math.round(0.0003 * this._sampleRate);
    const attenuation = dbToGain(-40) * clamp(amount, 0, 1);
    const output = new Float32Array(pcm.length);
    for (let i = 0; i < pcm.length; i++) {
      const bleed = i >= delaySamples ? pcm[i - delaySamples] : 0;
      output[i] = pcm[i] + bleed * attenuation;
    }
    return output;
  }
}

// ═════════════════════════════════════════════════════════════
// 防抄袭检测
// ═════════════════════════════════════════════════════════════

export interface NoteInfo {
  midi: number;
  startTime: number;
}

export function checkSelfSimilarity(notes: NoteInfo[]): number {
  if (notes.length < 8) return 0.0;

  const sorted = [...notes].sort((a, b) => a.startTime - b.startTime);
  const windowSize = 8.0;
  const segments = new Map<number, number[]>();
  for (const note of sorted) {
    const idx = Math.floor(note.startTime / windowSize);
    if (!segments.has(idx)) segments.set(idx, []);
    segments.get(idx)!.push(note.midi);
  }

  const signatures: string[] = [];
  for (const [, midis] of segments) {
    if (midis.length < 2) continue;
    const intervals: number[] = [];
    for (let i = 1; i < midis.length; i++) {
      intervals.push(midis[i] - midis[i - 1]);
    }
    signatures.push(intervals.join(','));
  }

  if (signatures.length === 0) return 0.0;

  const freq = new Map<string, number>();
  for (const sig of signatures) {
    freq.set(sig, (freq.get(sig) ?? 0) + 1);
  }

  let maxCount = 1;
  for (const count of freq.values()) {
    if (count > maxCount) maxCount = count;
  }

  if (maxCount <= 3) return 0.0;
  return clamp((maxCount - 3) * 0.2, 0, 1);
}

export function generateUniqueMotif(seed: string, length?: number): number[] {
  const hash = stringHash32(seed);
  const len = clamp(length ?? (4 + ((hash >>> 4) % 5)), 4, 8);
  const scale = [0, 2, 4, 5, 7, 9, 11]; // 大调音阶半音
  const baseNote = 60; // C4

  const motif: number[] = [];
  let s = hash >>> 0;
  for (let i = 0; i < len; i++) {
    // xorshift
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    const degree = (s >>> 0) % scale.length;
    const octave = ((s >>> 8) & 1);
    motif.push(baseNote + octave * 12 + scale[degree]);
  }
  return motif;
}
