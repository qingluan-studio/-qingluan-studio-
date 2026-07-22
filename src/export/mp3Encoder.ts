import { BitWriter } from './bitWriter.js';
import { clamp } from '../utils/audioUtils.js';

/* ═══════════════════════════════════════════════════════════════
   Simplified MP3 Encoder (MPEG-1 Layer III container)
   Uses simplified subband decomposition + DPCM + Huffman-like
   encoding inside standard MP3 frame structures.
   ═══════════════════════════════════════════════════════════════ */

// MPEG-1 Layer III bitrate table (kbps) for mono/stereo
const BITRATE_TABLE: number[] = [
  0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0
];

const SAMPLERATE_TABLE: number[] = [44100, 48000, 32000, 0];

function getBitrateIndex(bitrate: number): number {
  for (let i = 1; i < BITRATE_TABLE.length - 1; i++) {
    if (BITRATE_TABLE[i] === bitrate) return i;
  }
  return 9; // default 128
}

function getSampleRateIndex(sampleRate: number): number {
  for (let i = 0; i < SAMPLERATE_TABLE.length; i++) {
    if (SAMPLERATE_TABLE[i] === sampleRate) return i;
  }
  return 0; // default 44100
}

function computeFrameSize(bitrate: number, sampleRate: number, padding: number): number {
  // MPEG-1 Layer III: frame_size = floor(144 * bitrate * 1000 / sampleRate) + padding
  return Math.floor((144 * bitrate * 1000) / sampleRate) + padding;
}

/* ─── Simplified 32-subband PQMF ─── */
function makePQMF() {
  // Simplified prototype filter (sine window approximation)
  const N = 512;
  const coeffs = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    coeffs[i] = Math.sin((Math.PI * (i + 0.5)) / N);
  }
  return coeffs;
}

function applyPQMF(input: Float32Array, window: Float32Array): Float32Array[] {
  const numBands = 32;
  const numSamples = input.length;
  const subbands: Float32Array[] = [];
  for (let b = 0; b < numBands; b++) {
    subbands.push(new Float32Array(numSamples));
  }

  // Very simplified subband decomposition using modulated filters
  for (let i = 0; i < numSamples; i++) {
    for (let b = 0; b < numBands; b++) {
      let sum = 0;
      const M = 16; // reduced window length for speed
      for (let k = 0; k < M; k++) {
        const idx = clamp(i - k, 0, numSamples - 1);
        const sample = input[idx];
        const phase = (Math.PI / numBands) * (b + 0.5) * (k + 0.5);
        sum += sample * Math.cos(phase) * window[idx % window.length];
      }
      subbands[b][i] = sum / M;
    }
  }
  return subbands;
}

/* ─── Simplified psychoacoustic model ─── */
function computeSMR(subbands: Float32Array[]): number[] {
  const numBands = subbands.length;
  const smr = new Float32Array(numBands);
  for (let b = 0; b < numBands; b++) {
    let energy = 0;
    for (let i = 0; i < subbands[b].length; i++) {
      energy += subbands[b][i] * subbands[b][i];
    }
    const avgEnergy = energy / subbands[b].length;
    // Simplified absolute threshold (approximate)
    const threshold = 1e-6 * Math.pow(10, (b / numBands) * 2);
    smr[b] = Math.max(0, 10 * Math.log10((avgEnergy + 1e-10) / threshold));
  }
  return Array.from(smr);
}

/* ─── Bit allocation ─── */
function allocateBits(smr: number[], availableBits: number): number[] {
  const numBands = smr.length;
  const bits = new Array(numBands).fill(0);
  let remaining = availableBits;
  const minBits = 2;
  const maxBits = 15;

  // Initial allocation based on SMR
  let totalSMR = smr.reduce((a, b) => a + b, 0);
  if (totalSMR <= 0) totalSMR = 1;

  for (let b = 0; b < numBands; b++) {
    const ratio = smr[b] / totalSMR;
    bits[b] = Math.floor(ratio * remaining);
    if (bits[b] < minBits) bits[b] = minBits;
    if (bits[b] > maxBits) bits[b] = maxBits;
  }

  // Trim to fit
  let used = bits.reduce((a, b) => a + b, 0);
  while (used > remaining) {
    let maxIdx = 0;
    for (let i = 1; i < numBands; i++) {
      if (bits[i] > bits[maxIdx]) maxIdx = i;
    }
    if (bits[maxIdx] > minBits) {
      bits[maxIdx]--;
      used--;
    } else {
      break;
    }
  }
  return bits;
}

/* ─── Quantization ─── */
function quantizeSubband(subband: Float32Array, bits: number): Int16Array {
  const levels = (1 << bits) - 1;
  const maxVal = Math.max(1e-8, ...Array.from(subband).map(Math.abs));
  const scale = levels / (2 * maxVal);
  const out = new Int16Array(subband.length);
  for (let i = 0; i < subband.length; i++) {
    let q = Math.round(subband[i] * scale);
    if (q > levels / 2) q = Math.floor(levels / 2);
    if (q < -levels / 2) q = Math.floor(-levels / 2);
    out[i] = q;
  }
  return out;
}

/* ─── Simplified Huffman tables ─── */
interface HuffmanCode {
  code: number;
  len: number;
}

// Predefined small Huffman tables for quantized coefficients
// Table A: symbols 0-15, biased by +7 (for small quantized values)
const HUFF_TABLE_A: HuffmanCode[] = [
  { code: 0b1, len: 1 },      // 0
  { code: 0b010, len: 3 },    // 1
  { code: 0b011, len: 3 },    // 2
  { code: 0b0010, len: 4 },   // 3
  { code: 0b0011, len: 4 },   // 4
  { code: 0b00010, len: 5 },  // 5
  { code: 0b00011, len: 5 },  // 6
  { code: 0b000010, len: 6 }, // 7
  { code: 0b000011, len: 6 }, // 8
  { code: 0b0000010, len: 7 }, // 9
  { code: 0b0000011, len: 7 }, // 10
  { code: 0b00000010, len: 8 }, // 11
  { code: 0b00000011, len: 8 }, // 12
  { code: 0b000000010, len: 9 }, // 13
  { code: 0b000000011, len: 9 }, // 14
  { code: 0b000000001, len: 9 }, // 15
];

function huffmanEncodeSymbol(sym: number, table: HuffmanCode[]): { code: number; len: number } {
  const idx = clamp(sym + 7, 0, table.length - 1);
  return table[idx];
}

/* ─── DPCM + RLE helper ─── */
function dpcmEncode(samples: Int16Array): Int16Array {
  const out = new Int16Array(samples.length);
  out[0] = samples[0];
  for (let i = 1; i < samples.length; i++) {
    out[i] = samples[i] - samples[i - 1];
  }
  return out;
}

function rleEncode(deltas: Int16Array): number[] {
  const out: number[] = [];
  let i = 0;
  while (i < deltas.length) {
    if (deltas[i] === 0) {
      let run = 0;
      while (i + run < deltas.length && deltas[i + run] === 0 && run < 255) run++;
      out.push(0, run);
      i += run;
    } else {
      out.push(deltas[i]);
      i++;
    }
  }
  return out;
}

/* ─── ID3v1 Tag ─── */
function buildID3v1(title?: string, artist?: string): Uint8Array {
  const tag = new Uint8Array(128);
  let offset = 0;
  const writeStr = (s: string, len: number) => {
    const bytes = new TextEncoder().encode(s.slice(0, len));
    for (let i = 0; i < len; i++) {
      tag[offset++] = i < bytes.length ? bytes[i] : 0;
    }
  };
  writeStr('TAG', 3);
  writeStr(title || 'QingLuan Export', 30);
  writeStr(artist || 'AI Composer', 30);
  writeStr('', 30);
  writeStr('', 4);
  writeStr('', 30);
  tag[offset++] = 0; // genre
  return tag;
}

/* ─── MPEG-1 Layer III Frame Builder ─── */
function buildMp3Frame(
  headerBytes: Uint8Array,
  sideInfoBytes: Uint8Array,
  mainDataBytes: Uint8Array
): Uint8Array {
  const frame = new Uint8Array(headerBytes.length + sideInfoBytes.length + mainDataBytes.length);
  frame.set(headerBytes, 0);
  frame.set(sideInfoBytes, headerBytes.length);
  frame.set(mainDataBytes, headerBytes.length + sideInfoBytes.length);
  return frame;
}

function writeMpegHeader(
  writer: BitWriter,
  bitrateIndex: number,
  sampleRateIndex: number,
  padding: number,
  channelMode: number,
  modeExtension: number
) {
  writer.writeBits(0x7FF, 11); // sync word
  writer.writeBits(3, 2);      // MPEG-1
  writer.writeBits(1, 2);      // Layer III
  writer.writeBits(1, 1);      // no CRC
  writer.writeBits(bitrateIndex, 4);
  writer.writeBits(sampleRateIndex, 2);
  writer.writeBits(padding, 1);
  writer.writeBits(0, 1);      // private
  writer.writeBits(channelMode, 2); // 3 = mono
  writer.writeBits(modeExtension, 2);
  writer.writeBits(0, 1);      // copyright
  writer.writeBits(0, 1);      // original
  writer.writeBits(0, 2);      // emphasis
}

function writeSideInfoMono(
  writer: BitWriter,
  mainDataBegin: number,
  part2_3_length: number[],
  big_values: number[]
) {
  // 17 bytes for mono MPEG-1 Layer III
  writer.writeBits(mainDataBegin, 9);
  writer.writeBits(0, 5); // private bits
  writer.writeBits(0, 4); // scfsi (all scale factors changed)

  for (let gr = 0; gr < 2; gr++) {
    writer.writeBits(part2_3_length[gr], 12);
    writer.writeBits(big_values[gr], 9);
    writer.writeBits(180, 8); // global_gain
    writer.writeBits(0, 4);   // scalefac_compress
    writer.writeBits(0, 1);   // window_switching_flag = 0 (normal)
    writer.writeBits(1, 5);   // table_select[0] = 1
    writer.writeBits(1, 5);   // table_select[1] = 1
    writer.writeBits(0, 5);   // table_select[2] = 0
    writer.writeBits(7, 4);   // region0_count
    writer.writeBits(13, 3);  // region1_count
    writer.writeBits(0, 1);   // preflag
    writer.writeBits(0, 1);   // scalefac_scale
    writer.writeBits(0, 1);   // count1table_select
  }
}

export function encodeMp3(pcm: Float32Array, sampleRate: number, bitrate: number): ArrayBuffer {
  const channelMode = 3; // mono
  const numChannels = 1;
  const bitrateIndex = getBitrateIndex(bitrate);
  const sampleRateIndex = getSampleRateIndex(sampleRate);
  const samplesPerFrame = 1152;

  // Simplified PQMF window
  const pqmfWindow = makePQMF();
  const subbands = applyPQMF(pcm, pqmfWindow);
  const smr = computeSMR(subbands);

  const frames: Uint8Array[] = [];
  const numFrames = Math.ceil(pcm.length / samplesPerFrame);

  for (let f = 0; f < numFrames; f++) {
    const start = f * samplesPerFrame;
    const end = Math.min(start + samplesPerFrame, pcm.length);
    const frameSamples = pcm.subarray(start, end);

    // Padding: every other frame for exact bitrate
    const padding = (f % 2 === 0) ? 1 : 0;
    const frameSize = computeFrameSize(bitrate, sampleRate, padding);

    // Build header
    const headerWriter = new BitWriter();
    writeMpegHeader(headerWriter, bitrateIndex, sampleRateIndex, padding, channelMode, 0);
    headerWriter.alignByte();
    const headerBytes = headerWriter.getBytes();

    // Build side info
    const sideWriter = new BitWriter();
    const part2_3_length = [100, 100]; // placeholder, will compute actual
    const big_values = [144, 144];
    writeSideInfoMono(sideWriter, 0, part2_3_length, big_values);
    sideWriter.alignByte();
    const sideInfoBytes = sideWriter.getBytes(); // should be 17 bytes

    // Available bytes for main data
    const sideLen = sideInfoBytes.length;
    const availableBytes = frameSize - 4 - sideLen;
    const availableBits = availableBytes * 8;

    // Subband bit allocation
    const bitsPerBand = allocateBits(smr, Math.floor(availableBits / subbands.length));

    // Quantize and encode subbands for this frame's samples
    const mainWriter = new BitWriter();
    for (let b = 0; b < subbands.length; b++) {
      const bandStart = start;
      const bandEnd = Math.min(end, subbands[b].length);
      const bandSlice = subbands[b].subarray(bandStart, bandEnd);
      const quantized = quantizeSubband(bandSlice, bitsPerBand[b]);
      const dpcm = dpcmEncode(quantized);
      const rle = rleEncode(dpcm);

      // Write scalefactor (6 bits, simplified)
      const maxQ = Math.max(1, ...Array.from(quantized).map(Math.abs));
      const scaleExp = Math.floor(Math.log2(maxQ + 1));
      mainWriter.writeBits(clamp(scaleExp, 0, 63), 6);

      // Write RLE stream
      for (const val of rle) {
        if (val === 0) {
          // Escape for run-length
          mainWriter.writeBits(0b1111, 4);
        } else {
          const sym = clamp(val, -8, 7);
          const hc = huffmanEncodeSymbol(sym, HUFF_TABLE_A);
          mainWriter.writeBits(hc.code, hc.len);
        }
      }
    }
    mainWriter.alignByte();
    let mainDataBytes = mainWriter.getBytes();

    // Pad or truncate main data to fit frame
    if (mainDataBytes.length > availableBytes) {
      mainDataBytes = mainDataBytes.subarray(0, availableBytes);
    } else if (mainDataBytes.length < availableBytes) {
      const padded = new Uint8Array(availableBytes);
      padded.set(mainDataBytes);
      mainDataBytes = padded;
    }

    const frame = buildMp3Frame(headerBytes, sideInfoBytes, mainDataBytes);
    frames.push(frame);
  }

  // Calculate total size
  let totalSize = 0;
  for (const f of frames) totalSize += f.length;
  totalSize += 128; // ID3v1

  const output = new Uint8Array(totalSize);
  let offset = 0;
  for (const f of frames) {
    output.set(f, offset);
    offset += f.length;
  }

  // Append ID3v1
  const id3 = buildID3v1('QingLuan Track', 'AI Music');
  output.set(id3, offset);

  return output.buffer;
}
