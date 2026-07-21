import { BitWriter } from './bitWriter.js';

const CRC8_TABLE = new Uint8Array(256);
const CRC16_TABLE = new Uint16Array(256);

(function initTables() {
  for (let i = 0; i < 256; i++) {
    let c8 = i;
    let c16 = i << 8;
    for (let j = 0; j < 8; j++) {
      c8 = (c8 << 1) ^ ((c8 & 0x80) ? 0x07 : 0);
      c16 = (c16 << 1) ^ ((c16 & 0x8000) ? 0x8005 : 0);
    }
    CRC8_TABLE[i] = c8 & 0xFF;
    CRC16_TABLE[i] = c16 & 0xFFFF;
  }
})();

function crc8(data: Uint8Array): number {
  let crc = 0;
  for (let i = 0; i < data.length; i++) {
    crc = CRC8_TABLE[crc ^ data[i]];
  }
  return crc;
}

function crc16(data: Uint8Array): number {
  let crc = 0;
  for (let i = 0; i < data.length; i++) {
    crc = ((crc << 8) ^ CRC16_TABLE[((crc >> 8) ^ data[i]) & 0xFF]) & 0xFFFF;
  }
  return crc;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function toIntegerSamples(pcm: Float32Array, bps: number): Int32Array {
  const out = new Int32Array(pcm.length);
  const maxVal = (1 << (bps - 1)) - 1;
  for (let i = 0; i < pcm.length; i++) {
    let v = Math.round(clamp(pcm[i], -1, 1) * maxVal);
    if (v > maxVal) v = maxVal;
    if (v < -(maxVal + 1)) v = -(maxVal + 1);
    out[i] = v;
  }
  return out;
}

function computeFixedResiduals(samples: Int32Array, order: number): Int32Array {
  const n = samples.length;
  const res = new Int32Array(n - order);
  if (order === 0) {
    for (let i = 0; i < n; i++) res[i] = samples[i];
  } else if (order === 1) {
    for (let i = 1; i < n; i++) res[i - 1] = samples[i] - samples[i - 1];
  } else if (order === 2) {
    for (let i = 2; i < n; i++) res[i - 2] = samples[i] - (2 * samples[i - 1] - samples[i - 2]);
  } else if (order === 3) {
    for (let i = 3; i < n; i++) {
      res[i - 3] = samples[i] - (3 * samples[i - 1] - 3 * samples[i - 2] + samples[i - 3]);
    }
  } else if (order === 4) {
    for (let i = 4; i < n; i++) {
      res[i - 4] = samples[i] - (4 * samples[i - 1] - 6 * samples[i - 2] + 4 * samples[i - 3] - samples[i - 4]);
    }
  }
  return res;
}

function levinsonDurbin(r: Float64Array, order: number): number[] {
  const a = new Float64Array(order + 1);
  const ref = new Float64Array(order);
  const err = new Float64Array(order + 1);
  a[0] = 1;
  err[0] = r[0];
  for (let k = 1; k <= order; k++) {
    let sum = 0;
    for (let j = 1; j < k; j++) sum += a[j] * r[k - j];
    ref[k - 1] = (r[k] - sum) / err[k - 1];
    a[k] = ref[k - 1];
    for (let j = 1; j < k; j++) a[j] -= ref[k - 1] * a[k - j];
    err[k] = err[k - 1] * (1 - ref[k - 1] * ref[k - 1]);
  }
  const coeffs: number[] = [];
  for (let i = 1; i <= order; i++) coeffs.push(-a[i]);
  return coeffs;
}

function computeLPC(samples: Int32Array, order: number): number[] {
  const n = samples.length;
  const r = new Float64Array(order + 1);
  for (let k = 0; k <= order; k++) {
    let sum = 0;
    for (let i = 0; i < n - k; i++) sum += samples[i] * samples[i + k];
    r[k] = sum;
  }
  if (r[0] === 0) return new Array(order).fill(0);
  for (let k = 0; k <= order; k++) r[k] /= r[0];
  return levinsonDurbin(r, order);
}

function estimateRiceParameter(data: Int32Array): number {
  if (data.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    const u = v >= 0 ? (v << 1) : ((-v - 1) << 1) | 1;
    sum += u;
  }
  const mean = sum / data.length;
  if (mean <= 0) return 0;
  const p = Math.floor(Math.log2(mean * 0.6931));
  return clamp(p, 0, 14);
}

function riceEncode(writer: BitWriter, data: Int32Array, param: number) {
  const mask = (1 << param) - 1;
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    const u = v >= 0 ? (v << 1) : ((-v - 1) << 1) | 1;
    const q = u >>> param;
    for (let j = 0; j < q; j++) writer.writeBits(0, 1);
    writer.writeBits(1, 1);
    if (param > 0) writer.writeBits(u & mask, param);
  }
}

function encodeRicePartition(writer: BitWriter, residuals: Int32Array, partitionOrder: number) {
  const numPartitions = 1 << partitionOrder;
  const partitionSize = residuals.length >>> partitionOrder;
  writer.writeBits(0, 2); // Rice method
  writer.writeBits(partitionOrder, 4);
  for (let p = 0; p < numPartitions; p++) {
    const start = p * partitionSize;
    const end = start + partitionSize;
    const slice = residuals.subarray(start, end);
    let param = estimateRiceParameter(slice);
    if (param > 14) {
      writer.writeBits(0b1111, 4);
      writer.writeBits(param, 5);
    } else {
      writer.writeBits(param, 4);
    }
    riceEncode(writer, slice, param);
  }
}

function buildStreamInfo(
  blockSizeMin: number, blockSizeMax: number, sampleRate: number,
  channels: number, bps: number, totalSamples: number, md5: Uint8Array
): Uint8Array {
  const w = new BitWriter();
  w.writeBits(blockSizeMin, 16);
  w.writeBits(blockSizeMax, 16);
  w.writeBits(0, 24);
  w.writeBits(0, 24);
  w.writeBits(sampleRate, 20);
  w.writeBits(channels - 1, 3);
  w.writeBits(bps - 1, 5);
  w.writeBits(totalSamples, 36);
  for (let i = 0; i < 16; i++) w.writeBits(md5[i] ?? 0, 8);
  return w.getBytes();
}

function md5FromSamples(_samples: Int32Array, _bps: number): Uint8Array {
  return new Uint8Array(16);
}

export function encodeFlac(pcm: Float32Array, sampleRate: number, compressionLevel: number): ArrayBuffer {
  const channels = 1;
  const bps = compressionLevel >= 5 ? 24 : 16;
  const blockSize = 4096;
  const samples = toIntegerSamples(pcm, bps);
  const totalSamples = samples.length;

  const out = new BitWriter();
  out.writeUint8(0x66);
  out.writeUint8(0x4C);
  out.writeUint8(0x61);
  out.writeUint8(0x43);

  const md5 = md5FromSamples(samples, bps);
  const streamInfo = buildStreamInfo(blockSize, blockSize, sampleRate, channels, bps, totalSamples, md5);
  out.writeBits(1, 1);
  out.writeBits(0, 7);
  out.writeBits(streamInfo.length, 24);
  for (const b of streamInfo) out.writeBits(b, 8);

  const numBlocks = Math.ceil(totalSamples / blockSize);
  for (let blk = 0; blk < numBlocks; blk++) {
    const start = blk * blockSize;
    const end = Math.min(start + blockSize, totalSamples);
    const blockSamples = samples.subarray(start, end);
    const frameNumber = blk;

    const frameWriter = new BitWriter();
    frameWriter.writeBits(0x3FFE, 14);
    frameWriter.writeBits(0, 1);
    frameWriter.writeBits(0, 1);

    let blockSizeCode: number;
    if (blockSize === 4096) blockSizeCode = 12;
    else if (blockSize === 2048) blockSizeCode = 11;
    else if (blockSize === 1024) blockSizeCode = 10;
    else if (blockSize === 512) blockSizeCode = 9;
    else if (blockSize === 256) blockSizeCode = 8;
    else if (blockSize === 8192) blockSizeCode = 13;
    else if (blockSize === 16384) blockSizeCode = 14;
    else if (blockSize === 32768) blockSizeCode = 15;
    else { blockSizeCode = 6; }
    frameWriter.writeBits(blockSizeCode, 4);

    let sampleRateCode: number;
    let sampleRateBits = 0;
    let sampleRateExtra = 0;
    if (sampleRate === 88200) sampleRateCode = 1;
    else if (sampleRate === 176400) sampleRateCode = 2;
    else if (sampleRate === 192000) sampleRateCode = 3;
    else if (sampleRate === 8000) sampleRateCode = 4;
    else if (sampleRate === 16000) sampleRateCode = 5;
    else if (sampleRate === 22050) sampleRateCode = 6;
    else if (sampleRate === 24000) sampleRateCode = 7;
    else if (sampleRate === 32000) sampleRateCode = 8;
    else if (sampleRate === 44100) sampleRateCode = 9;
    else if (sampleRate === 48000) sampleRateCode = 10;
    else if (sampleRate === 96000) sampleRateCode = 11;
    else {
      sampleRateCode = 12;
      sampleRateBits = 8;
      sampleRateExtra = sampleRate;
    }
    frameWriter.writeBits(sampleRateCode, 4);
    frameWriter.writeBits(0, 4);
    frameWriter.writeBits(bps - 1, 3);
    frameWriter.writeBits(0, 1);
    frameWriter.writeUtf8Like(frameNumber);
    if (blockSizeCode === 6) frameWriter.writeBits(blockSize - 1, 8);
    else if (blockSizeCode === 7) frameWriter.writeBits(blockSize - 1, 16);
    if (sampleRateBits === 8) frameWriter.writeBits(sampleRateExtra, 8);
    else if (sampleRateBits === 16) frameWriter.writeBits(sampleRateExtra, 16);

    frameWriter.alignByte();
    const headerBytes = frameWriter.getBytes();
    const headerCrc = crc8(headerBytes);

    const order = Math.min(12, Math.max(0, compressionLevel));
    const actualOrder = Math.min(order, blockSamples.length);

    let bestOrder = 0;
    let bestScore = Infinity;
    for (let o = 0; o <= 4 && o <= actualOrder; o++) {
      const res = computeFixedResiduals(blockSamples, o);
      let sum = 0;
      for (let i = 0; i < res.length; i++) sum += Math.abs(res[i]);
      if (sum < bestScore) { bestScore = sum; bestOrder = o; }
    }

    if (bestOrder <= 4) {
      frameWriter.writeBits(0, 1);
      frameWriter.writeBits(0b001000 + bestOrder, 6);
      frameWriter.writeBits(0, 1);
      for (let i = 0; i < bestOrder; i++) {
        frameWriter.writeSignedInt(blockSamples[i], bps);
      }
      const residuals = computeFixedResiduals(blockSamples, bestOrder);
      encodeRicePartition(frameWriter, residuals, 0);
    } else {
      const lpcOrder = actualOrder;
      const coeffs = computeLPC(blockSamples, lpcOrder);
      frameWriter.writeBits(0, 1);
      frameWriter.writeBits(0b011000 + (lpcOrder - 1), 6);
      frameWriter.writeBits(0, 1);
      for (let i = 0; i < lpcOrder; i++) {
        frameWriter.writeSignedInt(blockSamples[i], bps);
      }
      const qlpPrecision = 12;
      const shift = 10;
      frameWriter.writeBits(qlpPrecision - 1, 4);
      frameWriter.writeSignedInt(shift, 5);
      for (let i = 0; i < lpcOrder; i++) {
        const q = Math.round(coeffs[i] * (1 << shift));
        frameWriter.writeSignedInt(q, qlpPrecision);
      }
      const residuals = new Int32Array(blockSamples.length - lpcOrder);
      for (let i = lpcOrder; i < blockSamples.length; i++) {
        let pred = 0;
        for (let j = 0; j < lpcOrder; j++) {
          pred += coeffs[j] * blockSamples[i - 1 - j];
        }
        residuals[i - lpcOrder] = blockSamples[i] - Math.round(pred);
      }
      encodeRicePartition(frameWriter, residuals, 0);
    }

    frameWriter.alignByte();
    const framePayload = frameWriter.getBytes();
    const frameCrc = crc16(framePayload);

    for (const b of headerBytes) out.writeBits(b, 8);
    out.writeBits(headerCrc, 8);
    for (const b of framePayload) out.writeBits(b, 8);
    out.writeBits((frameCrc >> 8) & 0xFF, 8);
    out.writeBits(frameCrc & 0xFF, 8);
  }

  return out.getArrayBuffer();
}
