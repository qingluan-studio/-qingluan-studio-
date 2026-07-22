/**
 * 公共音频/数学工具函数
 */

/** 限制值在范围内 */
export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** 线性插值 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** 平滑步插值 (smoothstep) */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** 将值从源范围映射到目标范围 */
export function mapRange(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
  return outMin + ((value - inMin) / (inMax - inMin)) * (outMax - outMin);
}

/** dB 转线性增益 */
export function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

/** 线性增益转 dB */
export function gainToDb(gain: number): number {
  return 20 * Math.log10(Math.max(gain, 1e-10));
}

/** MIDI 音符编号转频率 (Hz) */
export function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** 频率 (Hz) 转 MIDI 音符编号 */
export function frequencyToMidi(freq: number): number {
  return 69 + 12 * Math.log2(freq / 440);
}

/** 半音偏移转换为频率比 */
export function semitoneToRatio(semitones: number): number {
  return Math.pow(2, semitones / 12);
}

/** 将 Float32Array 标准化到 [-1, 1] 范围 (原地修改) */
export function normalizeBuffer(buffer: Float32Array): number {
  let maxAmp = 0;
  for (let i = 0; i < buffer.length; i++) {
    const abs = Math.abs(buffer[i]);
    if (abs > maxAmp) maxAmp = abs;
  }
  if (maxAmp > 1e-10 && maxAmp > 1.0) {
    const scale = 1.0 / maxAmp;
    for (let i = 0; i < buffer.length; i++) {
      buffer[i] *= scale;
    }
  }
  return maxAmp;
}

/** 创建汉宁窗 (Hann Window) */
export function hannWindow(size: number): Float32Array {
  const w = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1));
  }
  return w;
}

/** 快速傅里叶变换 - Cooley-Tukey (原地修改 real/imag) */
export function fft(real: Float32Array, imag: Float32Array, invert: boolean): void {
  const n = real.length;
  if (n !== imag.length) {
    throw new Error('Real and imag arrays must have same length');
  }
  if ((n & (n - 1)) !== 0) {
    throw new Error('FFT size must be power of 2');
  }

  let j = 0;
  for (let i = 1; i < n; i++) {
    let bit = n >> 1;
    while (j >= bit) {
      j -= bit;
      bit >>= 1;
    }
    j += bit;
    if (i < j) {
      let temp = real[i];
      real[i] = real[j];
      real[j] = temp;
      temp = imag[i];
      imag[i] = imag[j];
      imag[j] = temp;
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const ang = (2 * Math.PI) / len * (invert ? -1 : 1);
    const wlenReal = Math.cos(ang);
    const wlenImag = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wReal = 1;
      let wImag = 0;
      for (let k = 0; k < len / 2; k++) {
        const uReal = real[i + k];
        const uImag = imag[i + k];
        const vReal = real[i + k + len / 2] * wReal - imag[i + k + len / 2] * wImag;
        const vImag = real[i + k + len / 2] * wImag + imag[i + k + len / 2] * wReal;
        real[i + k] = uReal + vReal;
        imag[i + k] = uImag + vImag;
        real[i + k + len / 2] = uReal - vReal;
        imag[i + k + len / 2] = uImag - vImag;
        const nextWReal = wReal * wlenReal - wImag * wlenImag;
        wImag = wReal * wlenImag + wImag * wlenReal;
        wReal = nextWReal;
      }
    }
  }

  if (invert) {
    for (let i = 0; i < n; i++) {
      real[i] /= n;
      imag[i] /= n;
    }
  }
}
