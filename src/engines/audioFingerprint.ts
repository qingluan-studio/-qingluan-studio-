/**
 * 音乐声学指纹引擎
 * 基于简化版 Chromaprint/AcoustID 算法
 */

import { fft, computeMagnitudeSpectrum } from '../visualization/musicVisualizer.js';

const FRAME_SIZE = 4096;
const HOP_SIZE = 2048;
const NUM_BANDS = 8;
const F_MIN = 20;

interface FingerprintParts {
  subFingerprint: Uint8Array;
  globalHash: bigint;
}

function hannWindow(size: number): Float32Array {
  const window = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1));
  }
  return window;
}

function calculateZCR(frame: Float32Array): number {
  let crossings = 0;
  for (let i = 1; i < frame.length; i++) {
    if ((frame[i] >= 0) !== (frame[i - 1] >= 0)) {
      crossings++;
    }
  }
  return crossings / (frame.length - 1);
}

function calculateSpectralCentroid(magnitude: Float32Array, sampleRate: number): number {
  const nyquist = sampleRate / 2;
  let sum = 0;
  let weightedSum = 0;
  const binFreq = nyquist / (magnitude.length - 1);
  for (let i = 0; i < magnitude.length; i++) {
    const freq = i * binFreq;
    sum += magnitude[i];
    weightedSum += freq * magnitude[i];
  }
  return sum > 0 ? weightedSum / sum : 0;
}

function calculateSpectralRolloff(magnitude: Float32Array, sampleRate: number, threshold = 0.85): number {
  const nyquist = sampleRate / 2;
  let totalEnergy = 0;
  for (let i = 0; i < magnitude.length; i++) {
    totalEnergy += magnitude[i];
  }
  const targetEnergy = totalEnergy * threshold;
  let cumulative = 0;
  const binFreq = nyquist / (magnitude.length - 1);
  for (let i = 0; i < magnitude.length; i++) {
    cumulative += magnitude[i];
    if (cumulative >= targetEnergy) {
      return i * binFreq;
    }
  }
  return nyquist;
}

function getBandBoundaries(sampleRate: number): Float32Array {
  const fMax = sampleRate / 2;
  const boundaries = new Float32Array(NUM_BANDS + 1);
  const logMin = Math.log2(F_MIN);
  const logMax = Math.log2(fMax);
  for (let i = 0; i <= NUM_BANDS; i++) {
    boundaries[i] = Math.pow(2, logMin + ((logMax - logMin) * i) / NUM_BANDS);
  }
  return boundaries;
}

function freqToBin(freq: number, sampleRate: number, fftSize: number): number {
  return Math.round((freq * fftSize) / sampleRate);
}

function encodeSymbol(diff: number): number {
  const smallThreshold = 0.3;
  const largeThreshold = 1.0;
  if (diff > largeThreshold) return 3;
  if (diff > smallThreshold) return 1;
  if (diff < -largeThreshold) return 3;
  if (diff < -smallThreshold) return 2;
  return 0;
}

function packSymbols(symbols: number[]): Uint8Array {
  const numPairs = symbols.length / NUM_BANDS;
  const bytes = new Uint8Array(numPairs * (NUM_BANDS / 4));
  let byteIdx = 0;
  for (let p = 0; p < numPairs; p++) {
    let byte = 0;
    for (let b = 0; b < NUM_BANDS; b++) {
      const sym = symbols[p * NUM_BANDS + b] & 0x03;
      byte |= sym << ((NUM_BANDS - 1 - b) * 2);
    }
    bytes[byteIdx++] = byte;
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  const binStr = Array.from(bytes)
    .map((b) => String.fromCharCode(b))
    .join('');
  return btoa(binStr);
}

function base64ToBytes(base64: string): Uint8Array {
  const binStr = atob(base64);
  const bytes = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) {
    bytes[i] = binStr.charCodeAt(i);
  }
  return bytes;
}

function globalHashToHex(hash: bigint): string {
  return hash.toString(16).padStart(16, '0');
}

function hexToGlobalHash(hex: string): bigint {
  return BigInt('0x' + hex);
}

/**
 * 生成音频指纹
 * @param pcm 单声道 PCM 数据（已归一化到 [-1, 1]）
 * @param sampleRate 采样率
 * @returns 指纹字符串（subfp_base64:globalhash_hex）
 */
export function generateFingerprint(pcm: Float32Array, sampleRate: number): string {
  const numFrames = Math.max(0, Math.floor((pcm.length - FRAME_SIZE) / HOP_SIZE) + 1);
  if (numFrames < 2) {
    const emptyHash = BigInt(0);
    return `${bytesToBase64(new Uint8Array(0))}:${globalHashToHex(emptyHash)}`;
  }

  const window = hannWindow(FRAME_SIZE);
  const boundaries = getBandBoundaries(sampleRate);
  const binBoundaries = new Int32Array(NUM_BANDS + 1);
  for (let i = 0; i <= NUM_BANDS; i++) {
    binBoundaries[i] = freqToBin(boundaries[i], sampleRate, FRAME_SIZE);
  }

  const bandEnergies: number[][] = [];
  const zcrValues: number[] = [];
  const centroidValues: number[] = [];
  let totalMagnitudeForRolloff: Float32Array | null = null;

  for (let f = 0; f < numFrames; f++) {
    const start = f * HOP_SIZE;
    const frame = new Float32Array(FRAME_SIZE);
    for (let i = 0; i < FRAME_SIZE; i++) {
      frame[i] = pcm[start + i] * window[i];
    }

    zcrValues.push(calculateZCR(frame));

    const complexSpectrum = fft(frame, false);
    const magnitude = computeMagnitudeSpectrum(complexSpectrum);

    centroidValues.push(calculateSpectralCentroid(magnitude, sampleRate));

    if (totalMagnitudeForRolloff === null) {
      totalMagnitudeForRolloff = new Float32Array(magnitude.length);
    }
    for (let i = 0; i < magnitude.length; i++) {
      totalMagnitudeForRolloff[i] += magnitude[i];
    }

    const energies: number[] = [];
    for (let b = 0; b < NUM_BANDS; b++) {
      let energy = 0;
      const low = Math.max(0, binBoundaries[b]);
      const high = Math.min(magnitude.length - 1, binBoundaries[b + 1]);
      for (let k = low; k <= high; k++) {
        energy += magnitude[k];
      }
      energies.push(energy);
    }
    bandEnergies.push(energies);
  }

  // Sub-fingerprint: encode adjacent frame differences
  const symbols: number[] = [];
  for (let f = 1; f < numFrames; f++) {
    const prev = bandEnergies[f - 1];
    const curr = bandEnergies[f];
    for (let b = 0; b < NUM_BANDS; b++) {
      const diff = Math.log(curr[b] + 1e-12) - Math.log(prev[b] + 1e-12);
      symbols.push(encodeSymbol(diff));
    }
  }

  const subFpBytes = packSymbols(symbols);
  const subFpBase64 = bytesToBase64(subFpBytes);

  // Global feature hash
  const zcrMean = zcrValues.reduce((a, b) => a + b, 0) / zcrValues.length;
  const zcrStd = Math.sqrt(
    zcrValues.reduce((sum, v) => sum + (v - zcrMean) ** 2, 0) / zcrValues.length
  );
  const centroidMean = centroidValues.reduce((a, b) => a + b, 0) / centroidValues.length;
  const rolloff = totalMagnitudeForRolloff
    ? calculateSpectralRolloff(totalMagnitudeForRolloff, sampleRate)
    : sampleRate / 2;

  const nyquist = sampleRate / 2;
  const qZcrMean = Math.min(65535, Math.max(0, Math.round(zcrMean * 65535)));
  const qZcrStd = Math.min(65535, Math.max(0, Math.round(zcrStd * 65535)));
  const qCentroid = Math.min(65535, Math.max(0, Math.round((centroidMean / nyquist) * 65535)));
  const qRolloff = Math.min(65535, Math.max(0, Math.round((rolloff / nyquist) * 65535)));

  const globalHash =
    (BigInt(qZcrMean) << BigInt(48)) |
    (BigInt(qZcrStd) << BigInt(32)) |
    (BigInt(qCentroid) << BigInt(16)) |
    BigInt(qRolloff);

  return `${subFpBase64}:${globalHashToHex(globalHash)}`;
}

/**
 * 解析指纹字符串为组成部分
 */
export function parseFingerprint(fingerprint: string): FingerprintParts {
  const parts = fingerprint.split(':');
  if (parts.length !== 2) {
    throw new Error('Invalid fingerprint format');
  }
  return {
    subFingerprint: base64ToBytes(parts[0]),
    globalHash: hexToGlobalHash(parts[1]),
  };
}

/**
 * 计算两个指纹的汉明距离
 * @returns 相似度分数 0.0-1.0（1.0 表示完全相同）
 */
export function compareFingerprints(fp1: string, fp2: string): number {
  try {
    const p1 = parseFingerprint(fp1);
    const p2 = parseFingerprint(fp2);

    const len = Math.max(p1.subFingerprint.length, p2.subFingerprint.length);
    if (len === 0) return p1.subFingerprint.length === p2.subFingerprint.length ? 1.0 : 0.0;

    let hammingDistance = 0;
    const minLen = Math.min(p1.subFingerprint.length, p2.subFingerprint.length);

    for (let i = 0; i < minLen; i++) {
      const xor = p1.subFingerprint[i] ^ p2.subFingerprint[i];
      hammingDistance += popcount(xor);
    }

    // Penalize length difference
    hammingDistance += Math.abs(p1.subFingerprint.length - p2.subFingerprint.length) * 8;

    const maxDistance = len * 8;
    return Math.max(0, 1.0 - hammingDistance / maxDistance);
  } catch {
    return 0.0;
  }
}

function popcount(x: number): number {
  let count = 0;
  let v = x;
  while (v) {
    count += v & 1;
    v >>= 1;
  }
  return count;
}

/**
 * 在指纹数据库中查找最相似的 N 个指纹
 */
export function findSimilarFingerprints(
  fp: string,
  database: string[],
  topN = 5
): Array<{ fp: string; similarity: number }> {
  const results = database
    .filter((dbFp) => dbFp !== fp)
    .map((dbFp) => ({
      fp: dbFp,
      similarity: compareFingerprints(fp, dbFp),
    }));

  results.sort((a, b) => b.similarity - a.similarity);
  return results.slice(0, topN);
}

/**
 * 获取全局哈希的十六进制表示
 */
export function getGlobalHashHex(fingerprint: string): string {
  const parts = parseFingerprint(fingerprint);
  return globalHashToHex(parts.globalHash);
}

/**
 * 获取指纹前 N 位字符用于展示
 */
export function getFingerprintPrefix(fingerprint: string, length = 16): string {
  return fingerprint.slice(0, length);
}
