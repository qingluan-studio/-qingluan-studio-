/**
 * @fileoverview 青鸾 DAW - 采样器引擎与打击乐合成器
 *
 * 本模块提供两个核心类：
 * - SamplerEngine：通用采样回放引擎，支持 Base64-WAV 加载、音高变换、
 *   循环交叉淡化、ADSR 包络等标准采样器功能。
 * - DrumSampler：预置打击乐采样合成器，使用数学生成近似波形，
 *   包含底鼓（Kick）、军鼓（Snare）、踩镲（Hi-Hat）、通鼓（Tom）、
 *   镲片（Crash / Ride）等核心打击乐音色。
 *
 * 所有内部处理统一使用 44100 Hz 采样率，输出单声道 Float32Array。
 *
 * @module samplerEngine
 * @version 1.0.0
 * @author 青鸾音频实验室
 */

import { clamp, lerp, normalizeBuffer } from '../utils/audioUtils.js';

// =============================================================================
// 全局常量
// =============================================================================

/** 统一采样率 */
const SAMPLE_RATE = 44100;

/** 最大采样时长（秒），防止异常加载导致内存溢出 */
const MAX_SAMPLE_DURATION_SECONDS = 60;

/** 最大采样长度（样本数） */
const MAX_SAMPLE_LENGTH = MAX_SAMPLE_DURATION_SECONDS * SAMPLE_RATE;

/** 极小值 */
const EPSILON = 1e-10;

// =============================================================================
// 底层音频工具函数
// =============================================================================

/**
 * 将 Base64 字符串解码为 Uint8Array。
 * 这是浏览器/Node 通用实现，不依赖 atob 或 Buffer。
 *
 * @param base64 - Base64 编码字符串
 * @returns 解码后的字节数组
 */
function base64ToUint8Array(base64: string): Uint8Array {
  // 移除可能的 Data-URI 前缀，如 data:audio/wav;base64,
  const commaIndex = base64.indexOf(',');
  const clean = commaIndex >= 0 ? base64.slice(commaIndex + 1) : base64;

  // 简易 Base64 解码表
  const lookup = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const map = new Map<string, number>();
  for (let i = 0; i < lookup.length; i++) map.set(lookup[i], i);

  const len = clean.length;
  let padding = 0;
  if (clean[len - 1] === '=') padding++;
  if (clean[len - 2] === '=') padding++;

  const bytes = new Uint8Array((len * 3 / 4) - padding);
  let bytePos = 0;

  for (let i = 0; i < len; i += 4) {
    const enc1 = map.get(clean[i]) ?? 0;
    const enc2 = map.get(clean[i + 1]) ?? 0;
    const enc3 = map.get(clean[i + 2]) ?? 0;
    const enc4 = map.get(clean[i + 3]) ?? 0;

    bytes[bytePos++] = (enc1 << 2) | (enc2 >> 4);
    if (bytePos < bytes.length) bytes[bytePos++] = ((enc2 & 15) << 4) | (enc3 >> 2);
    if (bytePos < bytes.length) bytes[bytePos++] = ((enc3 & 3) << 6) | enc4;
  }

  return bytes;
}

/**
 * 解析标准 RIFF/WAVE 文件格式（PCM 16-bit 或 24-bit 或 32-bit float）。
 * 提取单声道数据（若为立体声则混合为单声道）。
 *
 * 支持的格式：
 * - PCM (fmt 编码 1)：16-bit signed integer、24-bit signed integer、32-bit signed integer
 * - IEEE Float (fmt 编码 3)：32-bit float
 *
 * @param bytes - WAV 文件的原始字节
 * @returns 解码后的单声道 Float32Array，值域 [-1, 1]
 */
function parseWav(bytes: Uint8Array): Float32Array {
  // 辅助：读取小端序 16-bit 无符号整数
  function readUInt16(offset: number): number {
    return bytes[offset] | (bytes[offset + 1] << 8);
  }

  // 辅助：读取小端序 32-bit 无符号整数
  function readUInt32(offset: number): number {
    return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24);
  }

  // 验证 RIFF 和 WAVE 标记
  const riffHeader = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  const waveHeader = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
  if (riffHeader !== 'RIFF' || waveHeader !== 'WAVE') {
    throw new Error('Invalid WAV file: missing RIFF/WAVE header');
  }

  // 遍历 chunk 定位 fmt 和 data
  let fmtOffset = -1;
  let dataOffset = -1;
  let dataSize = 0;
  let offset = 12;

  while (offset < bytes.length - 8) {
    const chunkId = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
    const chunkSize = readUInt32(offset + 4);
    if (chunkId === 'fmt ') {
      fmtOffset = offset + 8;
    } else if (chunkId === 'data') {
      dataOffset = offset + 8;
      dataSize = chunkSize;
    }
    offset += 8 + chunkSize + (chunkSize % 2); // chunk 大小为奇数时补 1 字节
  }

  if (fmtOffset < 0 || dataOffset < 0) {
    throw new Error('Invalid WAV file: missing fmt or data chunk');
  }

  // 解析 fmt chunk
  const audioFormat = readUInt16(fmtOffset);
  const numChannels = readUInt16(fmtOffset + 2);
  const sampleRate = readUInt32(fmtOffset + 4);
  const bitsPerSample = readUInt16(fmtOffset + 14);

  if (sampleRate !== SAMPLE_RATE) {
    // 允许不同采样率，但后续需要重采样（此处简化：直接读取，由调用方处理）
    // 为了简化，这里假设常见 44100/48000，后续 pitchShift 可以微调
  }

  const bytesPerSample = bitsPerSample / 8;
  const totalSamples = Math.floor(dataSize / (bytesPerSample * numChannels));

  const result = new Float32Array(totalSamples);

  for (let i = 0; i < totalSamples; i++) {
    const frameOffset = dataOffset + i * bytesPerSample * numChannels;
    let sum = 0;

    for (let ch = 0; ch < numChannels; ch++) {
      const chOffset = frameOffset + ch * bytesPerSample;
      let sample = 0;

      if (audioFormat === 1) {
        // PCM Integer
        if (bitsPerSample === 8) {
          // 8-bit PCM 为无符号
          sample = (bytes[chOffset] - 128) / 128.0;
        } else if (bitsPerSample === 16) {
          const val = bytes[chOffset] | (bytes[chOffset + 1] << 8);
          sample = (val >= 32768 ? val - 65536 : val) / 32768.0;
        } else if (bitsPerSample === 24) {
          const val = bytes[chOffset] | (bytes[chOffset + 1] << 8) | (bytes[chOffset + 2] << 16);
          // 符号扩展 24-bit -> 32-bit
          const signed = val >= 8388608 ? val - 16777216 : val;
          sample = signed / 8388608.0;
        } else if (bitsPerSample === 32) {
          const val = bytes[chOffset] | (bytes[chOffset + 1] << 8) | (bytes[chOffset + 2] << 16) | (bytes[chOffset + 3] << 24);
          sample = val / 2147483648.0;
        }
      } else if (audioFormat === 3) {
        // IEEE Float
        if (bitsPerSample === 32) {
          // 手动解析 32-bit float（IEEE 754）
          const b0 = bytes[chOffset];
          const b1 = bytes[chOffset + 1];
          const b2 = bytes[chOffset + 2];
          const b3 = bytes[chOffset + 3];
          const bits = b0 | (b1 << 8) | (b2 << 16) | (b3 << 24);
          const sign = bits >>> 31 === 0 ? 1.0 : -1.0;
          const exponent = (bits >>> 23) & 0xFF;
          const mantissa = bits & 0x7FFFFF;
          if (exponent === 0 && mantissa === 0) {
            sample = 0;
          } else if (exponent === 0xFF) {
            sample = sign * Infinity;
          } else {
            const frac = mantissa / 0x800000;
            sample = sign * Math.pow(2, exponent - 127) * (1 + frac);
          }
        }
      }

      sum += sample;
    }

    // 混合为单声道（取平均）
    result[i] = sum / numChannels;
  }

  return result;
}

/**
 * 将 Float32Array 编码为 16-bit PCM 的 WAV 文件字节数组（单声道）。
 * 主要用于内部测试或导出，返回值可用于生成 Data URI。
 *
 * @param buffer - 单声道音频数据，值域 [-1, 1]
 * @returns WAV 文件字节
 */
function encodeWav(buffer: Float32Array): Uint8Array {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = SAMPLE_RATE * numChannels * bitsPerSample / 8;
  const blockAlign = numChannels * bitsPerSample / 8;
  const dataSize = buffer.length * blockAlign;
  const fileSize = 36 + dataSize;

  const bytes = new Uint8Array(fileSize + 8);
  const view = new DataView(bytes.buffer);
  let offset = 0;

  function writeString(str: string) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset++, str.charCodeAt(i));
    }
  }

  function writeUint32(val: number) {
    view.setUint32(offset, val, true);
    offset += 4;
  }

  function writeUint16(val: number) {
    view.setUint16(offset, val, true);
    offset += 2;
  }

  writeString('RIFF');
  writeUint32(fileSize);
  writeString('WAVE');
  writeString('fmt ');
  writeUint32(16); // fmt chunk size
  writeUint16(1); // PCM
  writeUint16(numChannels);
  writeUint32(SAMPLE_RATE);
  writeUint32(byteRate);
  writeUint16(blockAlign);
  writeUint16(bitsPerSample);
  writeString('data');
  writeUint32(dataSize);

  for (let i = 0; i < buffer.length; i++) {
    const sample = clamp(buffer[i], -1, 1);
    const intVal = Math.floor(sample < 0 ? sample * 32768 : sample * 32767);
    view.setInt16(offset, intVal, true);
    offset += 2;
  }

  return bytes;
}

/**
 * 线性插值重采样（简易音高变换）。
 * 通过改变读取速度实现音高变化，同时使用线性插值减少混叠。
 *
 * @param buffer - 原始音频缓冲区
 * @param speedRatio - 播放速度比（>1 音高升高且时长缩短，<1 音高降低且时长拉长）
 * @returns 重采样后的缓冲区
 */
function resampleLinear(buffer: Float32Array, speedRatio: number): Float32Array {
  if (Math.abs(speedRatio - 1.0) < EPSILON) {
    return new Float32Array(buffer);
  }
  const newLength = Math.floor(buffer.length / speedRatio);
  const out = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const readPos = i * speedRatio;
    const idx0 = Math.floor(readPos);
    const idx1 = Math.min(idx0 + 1, buffer.length - 1);
    const frac = readPos - idx0;
    out[i] = buffer[idx0] * (1 - frac) + buffer[idx1] * frac;
  }
  return out;
}

/**
 * 白噪声生成器。
 */
function whiteNoise(length: number, amplitude: number = 1.0): Float32Array {
  const buf = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    buf[i] = (Math.random() * 2.0 - 1.0) * amplitude;
  }
  return buf;
}

/**
 * 粉红噪声生成器（Paul Kellet 简化近似）。
 */
function pinkNoise(length: number, amplitude: number = 1.0): Float32Array {
  const buf = new Float32Array(length);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2.0 - 1.0;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.96900 * b2 + white * 0.1538520;
    b3 = 0.86650 * b3 + white * 0.3104856;
    b4 = 0.55000 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.0168980;
    buf[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11 * amplitude;
    b6 = white * 0.115926;
  }
  return buf;
}

/**
 * 一阶递归低通滤波器。
 */
function lowPassFilter(input: Float32Array, cutoffHz: number): Float32Array {
  const output = new Float32Array(input.length);
  const rc = 1.0 / (2.0 * Math.PI * cutoffHz);
  const dt = 1.0 / SAMPLE_RATE;
  const alpha = dt / (rc + dt);
  let yPrev = 0;
  for (let i = 0; i < input.length; i++) {
    yPrev = alpha * input[i] + (1.0 - alpha) * yPrev;
    output[i] = yPrev;
  }
  return output;
}

/**
 * 带通滤波器（状态变量滤波器结构，提取带通输出）。
 */
function bandPassFilter(input: Float32Array, cutoffHz: number, q: number): Float32Array {
  const output = new Float32Array(input.length);
  const f = 2.0 * Math.sin(Math.PI * cutoffHz / SAMPLE_RATE);
  let low = 0, band = 0;
  for (let i = 0; i < input.length; i++) {
    low = low + f * band;
    const high = input[i] - low - q * band;
    band = band + f * high;
    output[i] = band; // 带通输出
  }
  return output;
}

/**
 * 指数 ADSR 包络生成器。
 */
function createExponentialADSREnvelope(
  length: number,
  attack: number,
  decay: number,
  sustain: number,
  release: number,
  totalDuration: number
): Float32Array {
  const env = new Float32Array(length);
  const attackSamples = Math.max(1, Math.floor(attack * SAMPLE_RATE));
  const decaySamples = Math.max(1, Math.floor(decay * SAMPLE_RATE));
  const releaseSamples = Math.max(1, Math.floor(release * SAMPLE_RATE));
  const releaseStart = Math.max(attackSamples + decaySamples, length - releaseSamples);

  for (let i = 0; i < length; i++) {
    if (i < attackSamples) {
      const t = i / attackSamples;
      env[i] = 1.0 - Math.exp(-5.0 * t);
    } else if (i < attackSamples + decaySamples) {
      const t = (i - attackSamples) / decaySamples;
      env[i] = sustain + (1.0 - sustain) * Math.exp(-3.0 * t);
    } else if (i < releaseStart) {
      env[i] = sustain;
    } else {
      const t = (i - releaseStart) / releaseSamples;
      env[i] = sustain * Math.exp(-5.0 * t);
    }
  }
  return env;
}

// =============================================================================
// SamplerEngine 类
// =============================================================================

/**
 * 采样回放参数。
 *
 * 用于 `playSample` 方法，控制采样的音高、力度、起止点和循环行为。
 */
export interface SamplePlayParams {
  /** 音高偏移（半音），正值升高，负值降低。默认 0 */
  pitch?: number;
  /** 演奏力度（0~1），影响输出音量。默认 1 */
  velocity?: number;
  /** 起始点（秒），从采样内部某处开始播放。默认 0 */
  start?: number;
  /** 结束点（秒），提前截断采样。默认采样全长 */
  end?: number;
  /** 是否启用循环播放。默认 false */
  loop?: boolean;
}

/**
 * SamplerEngine - 通用采样回放引擎。
 *
 * 功能特性：
 * - 加载 Base64 编码的 WAV 采样数据
 * - 支持音高变换（半音级，基于线性插值重采样）
 * - 支持起始/结束点裁剪
 * - 支持循环播放（带可选交叉淡化，由 crossfadeLoop 方法处理）
 * - 支持 ADSR 振幅包络
 * - 所有采样以单声道 Float32Array 存储，值域 [-1, 1]
 *
 * 使用示例：
 * ```ts
 * const engine = new SamplerEngine();
 * engine.loadSample('piano-C4', base64WavString);
 * const buf = engine.playSample('piano-C4', { pitch: -2, velocity: 0.8, start: 0.05 });
 * ```
 */
export class SamplerEngine {
  /** 内部采样存储表：采样名 -> 单声道 PCM 数据 */
  private samples: Map<string, Float32Array> = new Map();

  /** 采样元数据：采样名 -> 原始信息 */
  private sampleInfo: Map<string, { duration: number; sampleRate: number; length: number }> = new Map();

  /**
   * 加载 Base64-WAV 采样到引擎内存。
   *
   * 本方法会解析 RIFF/WAVE 格式，将任意位深/通道数的 PCM 数据
   * 转换为内部单声道 32-bit float 格式。
   *
   * @param name - 采样名称（后续播放时引用）
   * @param base64Wav - Base64 编码的 WAV 数据（可包含 Data URI 前缀）
   * @throws 如果 WAV 格式无效或解析失败
   */
  loadSample(name: string, base64Wav: string): void {
    if (!name || name.trim().length === 0) {
      throw new Error('SamplerEngine.loadSample: sample name must be non-empty');
    }
    if (!base64Wav || base64Wav.length === 0) {
      throw new Error('SamplerEngine.loadSample: base64Wav must be non-empty');
    }

    try {
      const bytes = base64ToUint8Array(base64Wav);
      const pcm = parseWav(bytes);

      // 如果解析出的采样率不是 44100，需要重采样（简化处理：线性重采样）
      // 注意：parseWav 当前不返回采样率，因此这里假设输入为 44100
      // 若未来需要支持多采样率，可扩展 parseWav 的返回值

      if (pcm.length > MAX_SAMPLE_LENGTH) {
        throw new Error(`SamplerEngine.loadSample: sample exceeds max length of ${MAX_SAMPLE_LENGTH} samples`);
      }

      this.samples.set(name, pcm);
      this.sampleInfo.set(name, {
        duration: pcm.length / SAMPLE_RATE,
        sampleRate: SAMPLE_RATE,
        length: pcm.length
      });
    } catch (err) {
      throw new Error(`SamplerEngine.loadSample: failed to parse WAV for "${name}" - ${err}`);
    }
  }

  /**
   * 卸载已加载的采样，释放内存。
   * @param name - 采样名称
   */
  unloadSample(name: string): void {
    this.samples.delete(name);
    this.sampleInfo.delete(name);
  }

  /**
   * 检查采样是否已加载。
   * @param name - 采样名称
   */
  hasSample(name: string): boolean {
    return this.samples.has(name);
  }

  /**
   * 获取已加载采样的信息。
   * @param name - 采样名称
   * @returns 元数据对象，若未加载则返回 undefined
   */
  getSampleInfo(name: string): { duration: number; sampleRate: number; length: number } | undefined {
    return this.sampleInfo.get(name);
  }

  /**
   * 获取已加载采样的原始 PCM 缓冲区副本。
   * @param name - 采样名称
   * @returns Float32Array 副本，若未加载则抛出错误
   */
  getSampleBuffer(name: string): Float32Array {
    const buf = this.samples.get(name);
    if (!buf) {
      throw new Error(`SamplerEngine.getSampleBuffer: sample "${name}" not found`);
    }
    return new Float32Array(buf);
  }

  /**
   * 返回当前引擎中已加载的采样名称列表。
   */
  listSamples(): string[] {
    return Array.from(this.samples.keys());
  }

  /**
   * 清除所有已加载的采样。
   */
  clear(): void {
    this.samples.clear();
    this.sampleInfo.clear();
  }

  /**
   * 播放指定采样。
   *
   * 执行流程：
   * 1. 查找采样缓冲区
   * 2. 根据 start/end 参数裁剪
   * 3. 应用音高变换（若有）
   * 4. 应用力度缩放
   * 5. 若启用 loop，将裁剪后的缓冲区做循环延展（简易循环）
   *
   * 注意：本方法不施加 ADSR 包络，如需包络请对返回值调用 `applyEnvelope`。
   *
   * @param name - 采样名称
   * @param params - 播放参数
   * @returns 处理后的音频缓冲区
   */
  playSample(name: string, params: SamplePlayParams = {}): Float32Array {
    const source = this.samples.get(name);
    if (!source) {
      throw new Error(`SamplerEngine.playSample: sample "${name}" not loaded`);
    }

    const pitch = params.pitch ?? 0;
    const velocity = clamp(params.velocity ?? 1.0, 0, 1);
    const startSec = Math.max(0, params.start ?? 0);
    const endSec = params.end ?? (source.length / SAMPLE_RATE);
    const loop = params.loop ?? false;

    // 将时间转换为样本索引
    let startIdx = Math.floor(startSec * SAMPLE_RATE);
    let endIdx = Math.floor(endSec * SAMPLE_RATE);
    startIdx = clamp(startIdx, 0, source.length - 1);
    endIdx = clamp(endIdx, startIdx + 1, source.length);

    // 裁剪
    let cropped = source.subarray(startIdx, endIdx);

    // 音高变换：半音 -> 速度比
    // 上升 1 个八度（12 半音）-> 速度比 2.0（时长减半，频率翻倍）
    const speedRatio = Math.pow(2, pitch / 12);
    let processed: Float32Array;
    if (Math.abs(speedRatio - 1.0) > EPSILON) {
      processed = resampleLinear(cropped, speedRatio);
    } else {
      processed = new Float32Array(cropped);
    }

    // 若启用循环，将缓冲区扩展为原始时长（或至少 2 秒）
    if (loop) {
      const targetLen = Math.max(processed.length, SAMPLE_RATE * 2);
      const looped = new Float32Array(targetLen);
      for (let i = 0; i < targetLen; i++) {
        looped[i] = processed[i % processed.length];
      }
      processed = looped;
    }

    // 力度缩放
    if (velocity !== 1.0) {
      for (let i = 0; i < processed.length; i++) {
        processed[i] *= velocity;
      }
    }

    return processed;
  }

  /**
   * 对音频缓冲区施加 ADSR 振幅包络。
   *
   * 本方法采用指数曲线，生成自然的乐器能量建立与衰减。
   *
   * @param buffer - 输入音频缓冲区
   * @param attack - Attack 时间（秒）
   * @param decay - Decay 时间（秒）
   * @param sustain - Sustain 电平（0~1）
   * @param release - Release 时间（秒）
   * @returns 施加包络后的新缓冲区
   */
  applyEnvelope(
    buffer: Float32Array,
    attack: number,
    decay: number,
    sustain: number,
    release: number
  ): Float32Array {
    if (buffer.length === 0) return new Float32Array(0);
    const length = buffer.length;
    const totalDuration = length / SAMPLE_RATE;
    const env = createExponentialADSREnvelope(length, attack, decay, sustain, release, totalDuration);
    const out = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      out[i] = buffer[i] * env[i];
    }
    return out;
  }

  /**
   * 对缓冲区进行交叉淡化循环处理。
   *
   * 在循环点（loopStart / loopEnd）之间创建交叉淡化区域，
   * 消除循环接缝处的"咔哒"声和不连续感。
   *
   * 算法：
   * 1. 从 loopEnd - crossfadeLength 到 loopEnd，振幅逐渐淡出
   * 2. 从 loopStart 到 loopStart + crossfadeLength，振幅从 0 淡入
   * 3. 两段叠加，实现平滑过渡
   * 4. 最终输出将循环区域延长，以容纳完整的交叉淡化
   *
   * @param buffer - 原始采样缓冲区
   * @param loopStart - 循环起点（样本索引）
   * @param loopEnd - 循环终点（样本索引，不含）
   * @param crossfadeLength - 交叉淡化长度（样本数）
   * @returns 处理后的循环缓冲区（长度 = loopEnd + crossfadeLength）
   */
  crossfadeLoop(
    buffer: Float32Array,
    loopStart: number,
    loopEnd: number,
    crossfadeLength: number
  ): Float32Array {
    if (buffer.length === 0) return new Float32Array(0);

    loopStart = Math.max(0, Math.floor(loopStart));
    loopEnd = Math.min(buffer.length, Math.floor(loopEnd));
    crossfadeLength = Math.max(0, Math.floor(crossfadeLength));

    if (loopStart >= loopEnd) {
      throw new Error('SamplerEngine.crossfadeLoop: loopStart must be less than loopEnd');
    }

    // 确保交叉淡化长度不超过循环体长度的一半
    const loopBody = loopEnd - loopStart;
    crossfadeLength = Math.min(crossfadeLength, Math.floor(loopBody / 2));

    // 输出长度：从 0 到 loopEnd，再加上 crossfadeLength 的尾音
    const outputLength = loopEnd + crossfadeLength;
    const out = new Float32Array(outputLength);

    // 复制前半段（0 到 loopEnd）
    for (let i = 0; i < loopEnd; i++) {
      out[i] = buffer[i];
    }

    // 交叉淡化区域：从 loopEnd - crossfadeLength 开始淡出
    // 同时从 loopStart 开始读取并淡入叠加
    for (let i = 0; i < crossfadeLength; i++) {
      const fadeOutPos = loopEnd - crossfadeLength + i;
      const fadeInPos = loopStart + i;
      const fadeOutGain = 1.0 - (i / crossfadeLength);
      const fadeInGain = i / crossfadeLength;

      const fadeOutSample = fadeOutPos < buffer.length ? buffer[fadeOutPos] : 0;
      const fadeInSample = fadeInPos < buffer.length ? buffer[fadeInPos] : 0;

      // 在输出数组的对应位置叠加
      // 淡出段继续衰减，淡入段从循环起点后接
      const targetPos = loopEnd + i;
      if (targetPos < outputLength) {
        out[targetPos] = fadeInSample * fadeInGain;
      }
      if (fadeOutPos >= 0 && fadeOutPos < outputLength) {
        out[fadeOutPos] = out[fadeOutPos] * fadeOutGain + fadeOutSample * (1 - fadeOutGain);
        // 注意：这里将淡出段替换为混合值
        out[fadeOutPos] = fadeOutSample * fadeOutGain + fadeInSample * fadeInGain;
      }
    }

    return out;
  }

  /**
   * 简易音高变换（线性插值重采样）。
   *
   * 以半音为单位对缓冲区进行音高偏移。
   * 正值升高音高并缩短时长，负值降低音高并延长时长。
   *
   * 算法原理：
   * - 半音与频率比的关系为 `ratio = 2^(semitones/12)`
   * - 音高升高 12 半音 -> 速度翻倍 -> 时长减半
   * - 通过线性插值改变读取步长实现无级变速
   *
   * 注意：本方法为纯时间域处理，极端音高偏移可能引入混叠或颗粒感。
   * 对于高质量需求，建议使用频域相位声码器（Phase Vocoder）。
   *
   * @param buffer - 原始音频缓冲区
   * @param semitones - 半音偏移量（可为小数，如 7.0 为纯五度）
   * @returns 音高变换后的新缓冲区
   */
  pitchShift(buffer: Float32Array, semitones: number): Float32Array {
    if (buffer.length === 0) return new Float32Array(0);
    const speedRatio = Math.pow(2, semitones / 12);
    return resampleLinear(buffer, speedRatio);
  }

  /**
   * 将内部采样导出为 Base64-WAV 字符串（Data URI 格式）。
   *
   * @param name - 采样名称
   * @returns Data URI 格式的 Base64 WAV 字符串
   */
  exportSampleAsDataURI(name: string): string {
    const buf = this.samples.get(name);
    if (!buf) {
      throw new Error(`SamplerEngine.exportSampleAsDataURI: sample "${name}" not found`);
    }
    const wavBytes = encodeWav(buf);
    // 转为 Base64
    const lookup = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let base64 = '';
    const padding = wavBytes.length % 3;
    for (let i = 0; i < wavBytes.length; i += 3) {
      const b0 = wavBytes[i];
      const b1 = i + 1 < wavBytes.length ? wavBytes[i + 1] : 0;
      const b2 = i + 2 < wavBytes.length ? wavBytes[i + 2] : 0;
      const bitmap = (b0 << 16) | (b1 << 8) | b2;
      base64 += lookup[(bitmap >> 18) & 63];
      base64 += lookup[(bitmap >> 12) & 63];
      base64 += (i + 1 < wavBytes.length) ? lookup[(bitmap >> 6) & 63] : '=';
      base64 += (i + 2 < wavBytes.length) ? lookup[bitmap & 63] : '=';
    }
    return `data:audio/wav;base64,${base64}`;
  }
}

// =============================================================================
// 打击乐采样数学生成
// =============================================================================

/**
 * 合成底鼓（Kick Drum）采样。
 *
 * 底鼓的声学特征：
 * 1. 极快的起音（click）
 * 2. 正弦波从高频迅速扫频到低频（pitch drop）
 * 3. 低频持续约 100-200 ms 后指数衰减
 * 4. 音头有宽频噪声冲击（模拟踩槌击打鼓皮）
 *
 * @param duration - 采样时长（秒），默认 0.5
 * @returns 底鼓波形
 */
function synthesizeKick(duration: number = 0.5): Float32Array {
  const length = Math.floor(duration * SAMPLE_RATE);
  const buf = new Float32Array(length);

  // 参数：起始频率、结束频率、衰减系数
  const startFreq = 150;
  const endFreq = 45;
  const decay = 15.0;

  // 正弦扫频 + 指数衰减
  let phase = 0;
  for (let i = 0; i < length; i++) {
    const t = i / SAMPLE_RATE;
    // 指数频率下降
    const freq = endFreq + (startFreq - endFreq) * Math.exp(-decay * t);
    const phaseInc = (2.0 * Math.PI * freq) / SAMPLE_RATE;
    phase += phaseInc;
    const amp = Math.exp(-t * 8.0); // 整体振幅衰减
    buf[i] = Math.sin(phase) * amp;
  }

  // 音头 click：宽频短噪声
  const clickLen = Math.floor(0.005 * SAMPLE_RATE);
  const click = whiteNoise(clickLen, 0.8);
  const clickFiltered = lowPassFilter(click, 6000);
  for (let i = 0; i < clickFiltered.length && i < length; i++) {
    buf[i] += clickFiltered[i] * Math.exp(-i * 0.05);
  }

  normalizeBuffer(buf);
  return buf;
}

/**
 * 合成军鼓（Snare Drum）采样。
 *
 * 军鼓声学特征：
 * 1. 鼓皮体 tone（中频正弦，约 180-250 Hz）
 * 2. 大量金属沙带（snares）噪声，宽频带、持续较短
 * 3. 音头 click
 * 4. 整体衰减约 150-300 ms
 *
 * @param duration - 采样时长（秒），默认 0.4
 * @returns 军鼓波形
 */
function synthesizeSnare(duration: number = 0.4): Float32Array {
  const length = Math.floor(duration * SAMPLE_RATE);
  const buf = new Float32Array(length);

  // 鼓体 tone
  const bodyFreq = 200;
  let phase = 0;
  for (let i = 0; i < length; i++) {
    const t = i / SAMPLE_RATE;
    const phaseInc = (2.0 * Math.PI * bodyFreq) / SAMPLE_RATE;
    phase += phaseInc;
    const amp = Math.exp(-t * 12.0);
    buf[i] += Math.sin(phase) * amp * 0.5;
  }

  // 沙带噪声：带通滤波噪声模拟金属丝振动
  const noise = whiteNoise(length, 1.0);
  const snareNoise = bandPassFilter(noise, 3000, 0.4);
  for (let i = 0; i < length; i++) {
    const t = i / SAMPLE_RATE;
    const amp = Math.exp(-t * 18.0); // 噪声衰减更快
    buf[i] += snareNoise[i] * amp * 0.6;
  }

  // 音头 click
  const clickLen = Math.floor(0.003 * SAMPLE_RATE);
  const click = whiteNoise(clickLen, 0.9);
  for (let i = 0; i < clickLen && i < length; i++) {
    buf[i] += click[i] * Math.exp(-i * 0.1);
  }

  normalizeBuffer(buf);
  return buf;
}

/**
 * 合成闭合踩镲（Closed Hi-Hat）采样。
 *
 * 踩镲特征：
 * 1. 金属撞击产生极高频噪声（8-15 kHz）
 * 2. 极短衰减（20-80 ms）
 * 3. 有轻微的"chick"音头
 * 4. 闭合态比开放态短促很多
 *
 * @param duration - 采样时长（秒），默认 0.15
 * @returns 闭合踩镲波形
 */
function synthesizeClosedHiHat(duration: number = 0.15): Float32Array {
  const length = Math.floor(duration * SAMPLE_RATE);
  const buf = new Float32Array(length);

  // 高频带通噪声
  const noise = whiteNoise(length, 1.0);
  const filtered = bandPassFilter(noise, 10000, 0.5);

  for (let i = 0; i < length; i++) {
    const t = i / SAMPLE_RATE;
    // 极快衰减
    const amp = Math.exp(-t * 60.0);
    buf[i] = filtered[i] * amp;
  }

  // 金属共振：叠加高频正弦衰减
  const metalFreqs = [8000, 12000];
  for (const mf of metalFreqs) {
    let phase = 0;
    for (let i = 0; i < length; i++) {
      const t = i / SAMPLE_RATE;
      phase += (2.0 * Math.PI * mf) / SAMPLE_RATE;
      const amp = Math.exp(-t * 40.0) * 0.15;
      buf[i] += Math.sin(phase) * amp;
    }
  }

  normalizeBuffer(buf);
  return buf;
}

/**
 * 合成开放踩镲（Open Hi-Hat）采样。
 *
 * 相比闭合态：
 * - 衰减时间更长（200-500 ms）
 * - 低频"shimmer"更明显
 * - 能量分布略向中高频偏移
 *
 * @param duration - 采样时长（秒），默认 0.5
 * @returns 开放踩镲波形
 */
function synthesizeOpenHiHat(duration: number = 0.5): Float32Array {
  const length = Math.floor(duration * SAMPLE_RATE);
  const buf = new Float32Array(length);

  // 宽频带噪声，带通略低
  const noise = whiteNoise(length, 1.0);
  const filtered = bandPassFilter(noise, 7000, 0.35);

  for (let i = 0; i < length; i++) {
    const t = i / SAMPLE_RATE;
    const amp = Math.exp(-t * 10.0);
    buf[i] = filtered[i] * amp;
  }

  // 更多金属泛音
  const metalFreqs = [6000, 9000, 13000];
  for (const mf of metalFreqs) {
    let phase = 0;
    for (let i = 0; i < length; i++) {
      const t = i / SAMPLE_RATE;
      phase += (2.0 * Math.PI * mf) / SAMPLE_RATE;
      const amp = Math.exp(-t * 12.0) * 0.12;
      buf[i] += Math.sin(phase) * amp;
    }
  }

  normalizeBuffer(buf);
  return buf;
}

/**
 * 合成通鼓（Tom）采样。
 *
 * 通鼓介于底鼓和军鼓之间：
 * - 有明确的音高（比底鼓高）
 * - 无沙带噪声
 * - 有鼓皮 tone + 少量体共鸣
 *
 * @param frequency - 基频（Hz），通常 80-200
 * @param duration - 采样时长（秒），默认 0.4
 * @returns 通鼓波形
 */
function synthesizeTom(frequency: number, duration: number = 0.4): Float32Array {
  const length = Math.floor(duration * SAMPLE_RATE);
  const buf = new Float32Array(length);

  // 鼓皮 tone：正弦 + 轻微扫频
  let phase = 0;
  const startFreq = frequency * 1.3;
  const endFreq = frequency;
  for (let i = 0; i < length; i++) {
    const t = i / SAMPLE_RATE;
    const freq = endFreq + (startFreq - endFreq) * Math.exp(-t * 20.0);
    phase += (2.0 * Math.PI * freq) / SAMPLE_RATE;
    const amp = Math.exp(-t * 8.0);
    buf[i] += Math.sin(phase) * amp * 0.7;
  }

  // 体共鸣噪声（极少）
  const noise = whiteNoise(length, 0.3);
  const bodyNoise = lowPassFilter(noise, 1500);
  for (let i = 0; i < length; i++) {
    const t = i / SAMPLE_RATE;
    const amp = Math.exp(-t * 10.0);
    buf[i] += bodyNoise[i] * amp * 0.2;
  }

  // click
  const clickLen = Math.floor(0.003 * SAMPLE_RATE);
  const click = whiteNoise(clickLen, 0.5);
  for (let i = 0; i < clickLen && i < length; i++) {
    buf[i] += click[i] * Math.exp(-i * 0.1);
  }

  normalizeBuffer(buf);
  return buf;
}

/**
 * 合成吊镲 / 碎音镲（Crash Cymbal）采样。
 *
 * 特征：
 * - 极宽频带噪声（几乎全频域）
 * - 大量非谐波金属泛音（频率密集）
 * - 起音有爆炸感，衰减很长（1-4 秒）
 * - 高频先衰减，低频持续
 *
 * @param duration - 采样时长（秒），默认 2.5
 * @returns 碎音镲波形
 */
function synthesizeCrash(duration: number = 2.5): Float32Array {
  const length = Math.floor(duration * SAMPLE_RATE);
  const buf = new Float32Array(length);

  // 多层噪声：高频层先衰减，低频层后衰减
  const highNoise = whiteNoise(length, 0.7);
  const midNoise = whiteNoise(length, 0.8);
  const lowNoise = pinkNoise(length, 0.9);

  for (let i = 0; i < length; i++) {
    const t = i / SAMPLE_RATE;
    const highAmp = Math.exp(-t * 8.0);
    const midAmp = Math.exp(-t * 3.0);
    const lowAmp = Math.exp(-t * 1.2);
    buf[i] = highNoise[i] * highAmp * 0.3 + midNoise[i] * midAmp * 0.4 + lowNoise[i] * lowAmp * 0.3;
  }

  // 密集金属泛音：随机频率的正弦簇
  const numMetals = 30;
  for (let m = 0; m < numMetals; m++) {
    const mf = 3000 + Math.random() * 12000; // 3000-15000 Hz
    const mAmp = 0.02 + Math.random() * 0.04;
    const mDecay = 2.0 + Math.random() * 6.0;
    let phase = Math.random() * Math.PI * 2;
    for (let i = 0; i < length; i++) {
      const t = i / SAMPLE_RATE;
      phase += (2.0 * Math.PI * mf) / SAMPLE_RATE;
      const amp = Math.exp(-t * mDecay) * mAmp;
      buf[i] += Math.sin(phase) * amp;
    }
  }

  normalizeBuffer(buf);
  return buf;
}

/**
 * 合成节奏镲（Ride Cymbal）采样。
 *
 * 相比碎音镲：
 * - 音高感更强（明确的"ping"音）
 * - 衰减适中（1-2 秒）
 * - 金属泛音更规则
 * - 起音 click 明显
 *
 * @param duration - 采样时长（秒），默认 1.5
 * @returns 节奏镲波形
 */
function synthesizeRide(duration: number = 1.5): Float32Array {
  const length = Math.floor(duration * SAMPLE_RATE);
  const buf = new Float32Array(length);

  // "Ping" tone：清晰的金属音高
  const pingFreq = 450 + Math.random() * 150;
  let phase = 0;
  for (let i = 0; i < length; i++) {
    const t = i / SAMPLE_RATE;
    phase += (2.0 * Math.PI * pingFreq) / SAMPLE_RATE;
    const amp = Math.exp(-t * 3.0) * 0.5;
    buf[i] += Math.sin(phase) * amp;
  }

  // 泛音列
  const harmonics = [1.5, 2.3, 3.1, 4.4];
  for (const h of harmonics) {
    let p = 0;
    for (let i = 0; i < length; i++) {
      const t = i / SAMPLE_RATE;
      p += (2.0 * Math.PI * pingFreq * h) / SAMPLE_RATE;
      const amp = Math.exp(-t * 4.0) * 0.15;
      buf[i] += Math.sin(p) * amp;
    }
  }

  // 噪声层
  const noise = whiteNoise(length, 0.6);
  const filtered = bandPassFilter(noise, 5000, 0.3);
  for (let i = 0; i < length; i++) {
    const t = i / SAMPLE_RATE;
    const amp = Math.exp(-t * 2.5);
    buf[i] += filtered[i] * amp * 0.4;
  }

  // Bell-like attack click
  const clickLen = Math.floor(0.005 * SAMPLE_RATE);
  const click = whiteNoise(clickLen, 0.7);
  for (let i = 0; i < clickLen && i < length; i++) {
    buf[i] += click[i] * Math.exp(-i * 0.08);
  }

  normalizeBuffer(buf);
  return buf;
}

/**
 * 合成拍手（Hand Clap）采样。
 *
 * 特征：
 * - 多重散射冲击（多手掌 slightly 不同时间撞击）
 * - 宽频带噪声 burst
 * - 极短（< 100 ms）
 *
 * @param duration - 采样时长（秒），默认 0.15
 * @returns 拍手波形
 */
function synthesizeClap(duration: number = 0.15): Float32Array {
  const length = Math.floor(duration * SAMPLE_RATE);
  const buf = new Float32Array(length);

  // 多重冲击：4 层 slightly 延迟的噪声 burst
  const delays = [0, 0.008, 0.018, 0.028];
  const amps = [1.0, 0.7, 0.5, 0.3];
  for (let l = 0; l < delays.length; l++) {
    const start = Math.floor(delays[l] * SAMPLE_RATE);
    const burstLen = Math.floor(0.02 * SAMPLE_RATE);
    const burst = whiteNoise(burstLen, amps[l]);
    const burstFiltered = bandPassFilter(burst, 2500, 0.5);
    for (let i = 0; i < burstFiltered.length && start + i < length; i++) {
      const env = Math.exp(-i / (SAMPLE_RATE * 0.008));
      buf[start + i] += burstFiltered[i] * env;
    }
  }

  normalizeBuffer(buf);
  return buf;
}

// =============================================================================
// DrumSampler 类
// =============================================================================

/**
 * 打击乐演奏参数。
 */
export interface DrumHitParams {
  /** 力度（0~1），影响音量和音头亮度。默认 1 */
  velocity?: number;
  /** 音高偏移（半音），仅对通鼓有明显效果。默认 0 */
  pitch?: number;
  /** 采样起始偏移（秒）。默认 0 */
  start?: number;
}

/**
 * DrumSampler - 预置打击乐采样合成器。
 *
 * 本类内置了通过数学生成算法合成的打击乐音色，无需外部采样文件即可使用。
 * 包含完整的标准鼓组（Drum Kit）：
 * - Kick（底鼓）
 * - Snare（军鼓）
 * - HiHatClosed（闭合踩镲）
 * - HiHatOpen（开放踩镲）
 * - TomLow / TomMid / TomHigh（低/中/高通鼓）
 * - Crash（碎音镲）
 * - Ride（节奏镲）
 * - Clap（拍手）
 *
 * 所有采样在首次调用时惰性生成（lazy generation）并缓存，
 * 避免不必要的内存占用。
 *
 * 使用示例：
 * ```ts
 * const drums = new DrumSampler();
 * const kick = drums.play('kick', { velocity: 0.9 });
 * const snare = drums.play('snare', { velocity: 0.8 });
 * ```
 */
export class DrumSampler {
  /** 采样缓存 */
  private cache: Map<string, Float32Array> = new Map();
  /** 记录采样是否已生成 */
  private generated: Set<string> = new Set();

  /** 通鼓基频配置 */
  private tomFrequencies: Record<string, number> = {
    tomLow: 80,
    tomMid: 120,
    tomHigh: 180
  };

  /**
   * 获取指定打击乐采样的原始缓冲区（不应用任何播放参数）。
   * 若采样尚未生成，则触发数学生成并缓存。
   *
   * @param name - 采样名称
   * @returns Float32Array 缓冲区
   */
  getSample(name: string): Float32Array {
    if (this.cache.has(name)) {
      return this.cache.get(name)!;
    }

    let buf: Float32Array;
    switch (name) {
      case 'kick':
        buf = synthesizeKick(0.5);
        break;
      case 'snare':
        buf = synthesizeSnare(0.4);
        break;
      case 'hiHatClosed':
        buf = synthesizeClosedHiHat(0.15);
        break;
      case 'hiHatOpen':
        buf = synthesizeOpenHiHat(0.5);
        break;
      case 'tomLow':
        buf = synthesizeTom(this.tomFrequencies.tomLow, 0.5);
        break;
      case 'tomMid':
        buf = synthesizeTom(this.tomFrequencies.tomMid, 0.45);
        break;
      case 'tomHigh':
        buf = synthesizeTom(this.tomFrequencies.tomHigh, 0.4);
        break;
      case 'crash':
        buf = synthesizeCrash(2.5);
        break;
      case 'ride':
        buf = synthesizeRide(1.5);
        break;
      case 'clap':
        buf = synthesizeClap(0.15);
        break;
      default:
        throw new Error(`DrumSampler.getSample: unknown drum name "${name}"`);
    }

    this.cache.set(name, buf);
    this.generated.add(name);
    return buf;
  }

  /**
   * 播放指定打击乐音色，应用力度、音高和起始偏移。
   *
   * @param name - 打击乐名称
   * @param params - 演奏参数
   * @returns 处理后的音频缓冲区
   */
  play(name: string, params: DrumHitParams = {}): Float32Array {
    const source = this.getSample(name);
    const velocity = clamp(params.velocity ?? 1.0, 0, 1);
    const pitch = params.pitch ?? 0;
    const startSec = Math.max(0, params.start ?? 0);

    // 起始偏移
    let startIdx = Math.floor(startSec * SAMPLE_RATE);
    startIdx = clamp(startIdx, 0, source.length - 1);
    let cropped = source.subarray(startIdx);

    // 音高变换（仅对通鼓等有音高感的鼓有效）
    let processed: Float32Array;
    if (Math.abs(pitch) > EPSILON) {
      const speedRatio = Math.pow(2, pitch / 12);
      processed = resampleLinear(cropped, speedRatio);
    } else {
      processed = new Float32Array(cropped);
    }

    // 力度应用：不仅仅是振幅缩放，还轻微影响亮度（通过动态低通模拟）
    if (velocity < 1.0) {
      // 低力度时略微削减高频（模拟轻击）
      const cutoff = lerp(3000, 12000, velocity);
      processed = lowPassFilter(processed, cutoff);
    }

    // 振幅缩放
    if (velocity !== 1.0) {
      for (let i = 0; i < processed.length; i++) {
        processed[i] *= velocity;
      }
    }

    return processed;
  }

  /**
   * 预生成所有内置打击乐采样，避免首次播放时的延迟。
   */
  preloadAll(): void {
    const names = this.listDrumNames();
    for (const name of names) {
      this.getSample(name);
    }
  }

  /**
   * 获取所有内置打击乐名称列表。
   */
  listDrumNames(): string[] {
    return [
      'kick', 'snare', 'hiHatClosed', 'hiHatOpen',
      'tomLow', 'tomMid', 'tomHigh', 'crash', 'ride', 'clap'
    ];
  }

  /**
   * 检查指定打击乐是否已缓存。
   * @param name - 打击乐名称
   */
  isCached(name: string): boolean {
    return this.cache.has(name);
  }

  /**
   * 清空缓存，释放内存。
   */
  clearCache(): void {
    this.cache.clear();
    this.generated.clear();
  }

  /**
   * 获取缓存占用的大致样本数。
   */
  getCacheSizeInSamples(): number {
    let total = 0;
    for (const buf of this.cache.values()) {
      total += buf.length;
    }
    return total;
  }

  /**
   * 设置通鼓基频。
   * @param tom - 通鼓名称（'tomLow' | 'tomMid' | 'tomHigh'）
   * @param frequency - 新基频（Hz）
   */
  setTomFrequency(tom: 'tomLow' | 'tomMid' | 'tomHigh', frequency: number): void {
    if (this.tomFrequencies[tom] !== undefined) {
      this.tomFrequencies[tom] = clamp(frequency, 40, 500);
      // 若已缓存，删除旧缓存以便下次重新生成
      if (this.cache.has(tom)) {
        this.cache.delete(tom);
        this.generated.delete(tom);
      }
    }
  }
}

// =============================================================================
// 模块级便捷导出函数
// =============================================================================

/**
 * 快速合成一个底鼓采样（无需实例化 DrumSampler）。
 * @param duration - 时长（秒）
 */
export function quickKick(duration: number = 0.5): Float32Array {
  return synthesizeKick(duration);
}

/**
 * 快速合成一个军鼓采样。
 * @param duration - 时长（秒）
 */
export function quickSnare(duration: number = 0.4): Float32Array {
  return synthesizeSnare(duration);
}

/**
 * 快速合成一个闭合踩镲采样。
 * @param duration - 时长（秒）
 */
export function quickHiHatClosed(duration: number = 0.15): Float32Array {
  return synthesizeClosedHiHat(duration);
}

/**
 * 快速合成一个碎音镲采样。
 * @param duration - 时长（秒）
 */
export function quickCrash(duration: number = 2.5): Float32Array {
  return synthesizeCrash(duration);
}

// =============================================================================
// 采样后处理效果器（Sample Post-Processing Effects）
// =============================================================================

/**
 * 环形调制（Ring Modulation）。
 *
 * 将输入信号与一个载波频率相乘，产生输入频率 ± 载波频率的边带。
 * 常用于合成金属感、机器人声或破坏性的音色变形。
 *
 * @param input - 输入信号
 * @param carrierFreq - 载波频率（Hz）
 * @param mix - 干湿比（0~1）
 * @returns 环形调制后的信号
 */
export function applyRingModulation(input: Float32Array, carrierFreq: number, mix: number = 0.5): Float32Array {
  const output = new Float32Array(input.length);
  const phaseInc = (2.0 * Math.PI * carrierFreq) / SAMPLE_RATE;
  let phase = 0;
  for (let i = 0; i < input.length; i++) {
    phase += phaseInc;
    const modulator = Math.sin(phase);
    output[i] = input[i] * (1 - mix) + (input[i] * modulator) * mix;
  }
  return output;
}

/**
 * 比特压缩器（Bitcrusher）。
 *
 * 通过降低采样位深和采样率，模拟老式数字设备或低保真设备的粗糙质感。
 *
 * @param input - 输入信号
 * @param bitDepth - 目标位深（1~16），越低失真越严重
 * @param sampleRateReduction - 采样率降采样因子（1 = 无降采样，4 = 1/4 采样率）
 * @returns 比特压缩后的信号
 */
export function applyBitcrusher(input: Float32Array, bitDepth: number = 8, sampleRateReduction: number = 1): Float32Array {
  const output = new Float32Array(input.length);
  const levels = Math.pow(2, clamp(bitDepth, 1, 16) - 1);
  const hold = Math.max(1, Math.floor(sampleRateReduction));
  let heldSample = 0;

  for (let i = 0; i < input.length; i++) {
    if (i % hold === 0) {
      // 量化到指定位深
      const quantized = Math.floor(input[i] * levels) / levels;
      heldSample = quantized;
    }
    output[i] = heldSample;
  }
  return output;
}

/**
 * 简单反馈延迟（Simple Feedback Delay）。
 *
 * @param input - 输入信号
 * @param delayTimeSec - 延迟时间（秒）
 * @param feedback - 反馈量（0~1，超过 0.9 可能自激）
 * @param mix - 干湿比（0~1）
 * @returns 延迟处理后的信号
 */
export function applySimpleDelay(input: Float32Array, delayTimeSec: number, feedback: number = 0.4, mix: number = 0.35): Float32Array {
  const output = new Float32Array(input.length);
  const delaySamples = Math.floor(delayTimeSec * SAMPLE_RATE);
  const delayLine = new Float32Array(delaySamples);
  let writeIdx = 0;

  for (let i = 0; i < input.length; i++) {
    const delayed = delayLine[writeIdx];
    const sample = input[i] + delayed * clamp(feedback, 0, 0.99);
    delayLine[writeIdx] = sample;
    output[i] = input[i] * (1 - mix) + delayed * mix;
    writeIdx = (writeIdx + 1) % delaySamples;
  }
  return output;
}

/**
 * 采样反向（Reverse）。
 *
 * 将缓冲区时间轴完全颠倒，常用于特殊音效设计。
 *
 * @param input - 输入信号
 * @returns 反向后的新缓冲区
 */
export function reverseBuffer(input: Float32Array): Float32Array {
  const output = new Float32Array(input.length);
  for (let i = 0; i < input.length; i++) {
    output[i] = input[input.length - 1 - i];
  }
  return output;
}

/**
 * 简易基频检测（过零率法 + 峰值自相关粗略估计）。
 *
 * 适用于单音采样的基频估计，不适用于和弦或噪声。
 *
 * @param buffer - 输入信号
 * @returns 估计基频（Hz），若检测失败返回 0
 */
/**
 * 计算缓冲区时长（秒）。
 *
 * @param buffer - 音频缓冲区
 * @returns 时长（秒）
 */
export function calculateBufferDuration(buffer: Float32Array): number {
  return buffer.length / SAMPLE_RATE;
}

/**
 * 简易基频检测（过零率法 + 峰值自相关粗略估计）。
 *
 * 适用于单音采样的基频估计，不适用于和弦或噪声。
 *
 * @param buffer - 输入信号
 * @returns 估计基频（Hz），若检测失败返回 0
 */
export function estimateFundamentalFrequency(buffer: Float32Array): number {
  if (buffer.length < 1024) return 0;
  // 步骤 1：过零率粗略估算周期
  let crossings = 0;
  let lastCrossing = 0;
  const crossingIntervals: number[] = [];
  for (let i = 1; i < buffer.length; i++) {
    if ((buffer[i] >= 0) !== (buffer[i - 1] >= 0)) {
      if (lastCrossing > 0) {
        crossingIntervals.push(i - lastCrossing);
      }
      lastCrossing = i;
      crossings++;
    }
  }
  if (crossingIntervals.length < 5) return 0;
  // 取中位数周期
  crossingIntervals.sort((a, b) => a - b);
  const medianPeriod = crossingIntervals[Math.floor(crossingIntervals.length / 2)];
  return SAMPLE_RATE / medianPeriod;
}
