/**
 * MusicVisualizer.ts
 * 音乐可视化引擎
 * TypeScript Strict Mode
 */

// ============================================================================
// 类型定义与接口
// ============================================================================

/** 音频数据采样格式 */
export interface AudioData {
  left: Float32Array;
  right: Float32Array;
  sampleRate: number;
  timestamp: number;
}

/** 频谱数据 */
export interface SpectrumData {
  frequencies: Float32Array;
  magnitudes: Float32Array;
  phases: Float32Array;
  bands: {
    subBass: number;
    bass: number;
    lowMid: number;
    mid: number;
    highMid: number;
    presence: number;
    brilliance: number;
  };
}

/** 2D向量 */
export interface Vec2 {
  x: number;
  y: number;
}

/** 3D向量 */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** RGB颜色 */
export interface RGB {
  r: number;
  g: number;
  b: number;
}

/** HSL颜色 */
export interface HSL {
  h: number;
  s: number;
  l: number;
}

/** 粒子对象 */
export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: RGB;
  alpha: number;
  trail: Vec2[];
}

/** 节拍检测结果 */
export interface BeatInfo {
  isBeat: boolean;
  energy: number;
  bpm: number;
  confidence: number;
  spectrumCentroid: number;
}

/** 可视化配置 */
export interface VisualizerConfig {
  fftSize: number;
  smoothing: number;
  sensitivity: number;
  colorScheme: ColorScheme;
  particleCount: number;
  trailLength: number;
  enable3D: boolean;
  decayRate: number;
  peakHoldTime: number;
}

/** 配色方案枚举 */
export type ColorScheme = 'rainbow' | 'heat' | 'neon' | 'geek' | 'mood';

/** 情绪类型 */
export type MoodType = 'happy' | 'sad' | 'energetic' | 'calm';

/** 分形参数 */
export interface FractalParams {
  cx: number;
  cy: number;
  zoom: number;
  rotation: number;
  maxIter: number;
  type: 'mandelbrot' | 'julia';
  colorCycle: number;
}

/** 渲染上下文包装 */
export interface RenderContext {
  ctx2d: any; // Canvas 2D上下文
  gl: any;    // WebGL上下文
  width: number;
  height: number;
  dpr: number;
}

/** 水波涟漪 */
export interface Ripple {
  x: number;
  y: number;
  radius: number;
  strength: number;
  age: number;
  maxAge: number;
}

// ============================================================================
// 常量定义
// ============================================================================

export const DEFAULT_FFT_SIZE = 512;
export const SPECTRUM_BANDS = 256;
export const MAX_PARTICLES = 2048;
export const MAX_TRAIL_LENGTH = 32;
export const TWO_PI = Math.PI * 2;
export const INV_TWO_PI = 1 / TWO_PI;
export const LOG10 = Math.log(10);

// 频带划分频率 (Hz)
export const BAND_RANGES = {
  subBass: [20, 60],
  bass: [60, 250],
  lowMid: [250, 500],
  mid: [500, 2000],
  highMid: [2000, 4000],
  presence: [4000, 6000],
  brilliance: [6000, 20000],
} as const;

// ============================================================================
// 数学工具函数
// ============================================================================

/**
 * 将值从源范围映射到目标范围
 */
export function mapRange(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
  return outMin + ((value - inMin) / (inMax - inMin)) * (outMax - outMin);
}

/**
 * 线性插值
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * 平滑插值 (smoothstep)
 */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * 限制值在范围内
 */
export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * 计算dB值
 */
export function toDecibel(linear: number): number {
  return 20 * Math.log10(Math.max(1e-10, linear));
}

/**
 * dB转线性
 */
export function fromDecibel(db: number): number {
  return Math.pow(10, db / 20);
}

/**
 * 计算平均值
 */
export function average(arr: Float32Array | number[]): number {
  let sum = 0;
  for (let i = 0; i < arr.length; i++) sum += arr[i];
  return sum / arr.length;
}

/**
 * 计算均方根 (RMS)
 */
export function rms(arr: Float32Array | number[]): number {
  let sum = 0;
  for (let i = 0; i < arr.length; i++) sum += arr[i] * arr[i];
  return Math.sqrt(sum / arr.length);
}

/**
 * 计算数组最大值
 */
export function maxValue(arr: Float32Array | number[]): number {
  let max = -Infinity;
  for (let i = 0; i < arr.length; i++) if (arr[i] > max) max = arr[i];
  return max;
}

/**
 * 快速幂
 */
export function fastPow(x: number, y: number): number {
  return Math.exp(y * Math.log(x));
}

/**
 * 汉宁窗函数
 */
export function hannWindow(n: number, N: number): number {
  return 0.5 * (1 - Math.cos((TWO_PI * n) / (N - 1)));
}

/**
 * 布莱克曼窗函数
 */
export function blackmanWindow(n: number, N: number): number {
  const a0 = 0.42;
  const a1 = 0.5;
  const a2 = 0.08;
  return a0 - a1 * Math.cos((TWO_PI * n) / (N - 1)) + a2 * Math.cos((4 * Math.PI * n) / (N - 1));
}

// ============================================================================
// 色彩空间转换
// ============================================================================

/**
 * HSL转RGB
 */
export function hslToRgb(h: number, s: number, l: number): RGB {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;

  if (h >= 0 && h < 60) { r = c; g = x; b = 0; }
  else if (h >= 60 && h < 120) { r = x; g = c; b = 0; }
  else if (h >= 120 && h < 180) { r = 0; g = c; b = x; }
  else if (h >= 180 && h < 240) { r = 0; g = x; b = c; }
  else if (h >= 240 && h < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }

  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

/**
 * RGB转HSL
 */
export function rgbToHsl(r: number, g: number, b: number): HSL {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h: h * 360, s, l };
}

/**
 * RGB转CSS字符串
 */
export function rgbToCss(c: RGB): string {
  return `rgb(${c.r},${c.g},${c.b})`;
}

/**
 * RGBA转CSS字符串
 */
export function rgbaToCss(c: RGB, a: number): string {
  return `rgba(${c.r},${c.g},${c.b},${a.toFixed(3)})`;
}

// ============================================================================
// FFT 实现 (纯JavaScript，不依赖Web Audio API)
// ============================================================================

/**
 * 复数结构
 */
export interface Complex {
  re: number;
  im: number;
}

/**
 * 位反转置换
 */
function bitReversePermutation(input: Float32Array): Complex[] {
  const n = input.length;
  const result: Complex[] = new Array(n);
  const bits = Math.log2(n);
  for (let i = 0; i < n; i++) {
    let reversed = 0;
    for (let j = 0; j < bits; j++) {
      reversed = (reversed << 1) | ((i >> j) & 1);
    }
    result[i] = { re: input[reversed], im: 0 };
  }
  return result;
}

/**
 * 复数乘法
 */
function complexMul(a: Complex, b: Complex): Complex {
  return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re };
}

/**
 * 复数加法
 */
function complexAdd(a: Complex, b: Complex): Complex {
  return { re: a.re + b.re, im: a.im + b.im };
}

/**
 * 复数减法
 */
function complexSub(a: Complex, b: Complex): Complex {
  return { re: a.re - b.re, im: a.im - b.im };
}

/**
 * Cooley-Tukey FFT算法 (基2-FFT)
 * @param input 时域采样数据
 * @param inverse 是否逆变换
 */
export function fft(input: Float32Array, inverse = false): Complex[] {
  const n = input.length;
  if (n <= 1) return [{ re: input[0] || 0, im: 0 }];
  if ((n & (n - 1)) !== 0) {
    throw new Error('FFT输入长度必须是2的幂次');
  }

  const output = bitReversePermutation(input);
  const sign = inverse ? 1 : -1;

  for (let len = 2; len <= n; len <<= 1) {
    const halfLen = len >> 1;
    const angleStep = (sign * TWO_PI) / len;
    for (let i = 0; i < n; i += len) {
      let angle = 0;
      for (let j = 0; j < halfLen; j++) {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const twiddle: Complex = { re: cos, im: sin };
        const even = output[i + j];
        const odd = complexMul(output[i + j + halfLen], twiddle);
        output[i + j] = complexAdd(even, odd);
        output[i + j + halfLen] = complexSub(even, odd);
        angle += angleStep;
      }
    }
  }

  if (inverse) {
    for (let i = 0; i < n; i++) {
      output[i].re /= n;
      output[i].im /= n;
    }
  }

  return output;
}

/**
 * 计算幅值谱
 */
export function computeMagnitudeSpectrum(complexArray: Complex[]): Float32Array {
  const n = complexArray.length >> 1;
  const result = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const re = complexArray[i].re;
    const im = complexArray[i].im;
    result[i] = Math.sqrt(re * re + im * im);
  }
  return result;
}

/**
 * 计算相位谱
 */
export function computePhaseSpectrum(complexArray: Complex[]): Float32Array {
  const n = complexArray.length >> 1;
  const result = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    result[i] = Math.atan2(complexArray[i].im, complexArray[i].re);
  }
  return result;
}

/**
 * 应用窗函数到信号
 */
export function applyWindow(signal: Float32Array, windowType: 'hann' | 'blackman' | 'rect' = 'hann'): Float32Array {
  const N = signal.length;
  const result = new Float32Array(N);
  for (let n = 0; n < N; n++) {
    let w = 1;
    if (windowType === 'hann') w = hannWindow(n, N);
    else if (windowType === 'blackman') w = blackmanWindow(n, N);
    result[n] = signal[n] * w;
  }
  return result;
}

// ============================================================================
// 频谱色彩映射
// ============================================================================

/**
 * 彩虹配色方案
 * @param t 0-1 频率归一化值
 * @param energy 能量值控制亮度
 */
export function rainbowColor(t: number, energy: number): RGB {
  const hue = t * 360;
  const sat = 0.9;
  const light = 0.3 + energy * 0.5;
  return hslToRgb(hue, sat, clamp(light, 0, 1));
}

/**
 * 热力配色方案
 */
export function heatColor(t: number, energy: number): RGB {
  const r = clamp(t * 2, 0, 1);
  const g = clamp((t - 0.5) * 2, 0, 1);
  const b = clamp((t - 0.75) * 4, 0, 1);
  const intensity = 0.4 + energy * 0.6;
  return {
    r: Math.round(r * 255 * intensity),
    g: Math.round(g * 255 * intensity),
    b: Math.round(b * 255 * intensity),
  };
}

/**
 * 霓虹配色方案
 */
export function neonColor(t: number, energy: number): RGB {
  const hue = (t * 300 + 180) % 360;
  const sat = 1.0;
  const light = 0.5 + energy * 0.4;
  const rgb = hslToRgb(hue, sat, clamp(light, 0, 1));
  // 增强霓虹感
  return {
    r: Math.min(255, rgb.r + 40),
    g: Math.min(255, rgb.g + 40),
    b: Math.min(255, rgb.b + 40),
  };
}

/**
 * 极客配色方案 (矩阵绿/黑客风格)
 */
export function geekColor(t: number, energy: number): RGB {
  const g = Math.round((0.4 + t * 0.6) * 255 * (0.5 + energy * 0.5));
  const rb = Math.round(t * 40 * energy);
  return { r: rb, g: Math.min(255, g), b: rb };
}

/**
 * 情绪色彩映射
 */
export function moodColor(mood: MoodType, energy: number, t: number): RGB {
  switch (mood) {
    case 'happy':
      return hslToRgb(50 + t * 40, 0.9, 0.5 + energy * 0.3);
    case 'sad':
      return hslToRgb(200 + t * 40, 0.5, 0.3 + energy * 0.2);
    case 'energetic':
      return hslToRgb(0 + t * 60, 1.0, 0.4 + energy * 0.4);
    case 'calm':
      return hslToRgb(160 + t * 40, 0.4, 0.4 + energy * 0.3);
    default:
      return rainbowColor(t, energy);
  }
}

/**
 * 通用色彩映射器
 */
export function mapSpectrumToColor(
  index: number,
  total: number,
  energy: number,
  scheme: ColorScheme,
  mood?: MoodType
): RGB {
  const t = index / Math.max(1, total - 1);
  switch (scheme) {
    case 'rainbow': return rainbowColor(t, energy);
    case 'heat': return heatColor(t, energy);
    case 'neon': return neonColor(t, energy);
    case 'geek': return geekColor(t, energy);
    case 'mood': return moodColor(mood || 'happy', energy, t);
    default: return rainbowColor(t, energy);
  }
}

/**
 * 频谱能量控制亮度/饱和度
 */
export function applyEnergyToColor(baseColor: RGB, energy: number): RGB {
  const factor = 0.5 + energy * 1.5;
  return {
    r: clamp(Math.round(baseColor.r * factor), 0, 255),
    g: clamp(Math.round(baseColor.g * factor), 0, 255),
    b: clamp(Math.round(baseColor.b * factor), 0, 255),
  };
}

// ============================================================================
// 频谱可视化渲染函数
// ============================================================================

/**
 * 生成频谱柱状图顶点着色器
 */
export function spectrumBarVertexShader(): string {
  return `
    attribute vec2 a_position;
    attribute vec4 a_color;
    varying vec4 v_color;
    void main() {
      gl_Position = vec4(a_position, 0.0, 1.0);
      v_color = a_color;
    }
  `;
}

/**
 * 生成频谱柱状图片段着色器
 */
export function spectrumBarFragmentShader(): string {
  return `
    precision mediump float;
    varying vec4 v_color;
    void main() {
      gl_FragColor = v_color;
    }
  `;
}

/**
 * 绘制256段FFT频谱柱状图 (Canvas 2D)
 */
export function drawSpectrumBars(
  ctx: any,
  spectrum: Float32Array,
  width: number,
  height: number,
  colorScheme: ColorScheme,
  peakHold?: Float32Array,
  peakDecay?: Float32Array
): void {
  const bars = Math.min(SPECTRUM_BANDS, spectrum.length);
  const barWidth = width / bars;
  const gap = 1;

  for (let i = 0; i < bars; i++) {
    const magnitude = spectrum[i];
    const barHeight = magnitude * height;
    const x = i * barWidth;
    const y = height - barHeight;

    const color = mapSpectrumToColor(i, bars, magnitude, colorScheme);
    ctx.fillStyle = rgbToCss(color);
    ctx.fillRect(x + gap / 2, y, barWidth - gap, barHeight);

    // 峰值保持线
    if (peakHold && peakDecay) {
      const peakY = height - peakHold[i] * height;
      ctx.fillStyle = rgbaToCss({ r: 255, g: 255, b: 255 }, 0.7);
      ctx.fillRect(x + gap / 2, peakY, barWidth - gap, 2);
    }
  }
}

/**
 * 绘制圆形频谱（极坐标）
 */
export function drawCircularSpectrum(
  ctx: any,
  spectrum: Float32Array,
  width: number,
  height: number,
  colorScheme: ColorScheme,
  rotation = 0
): void {
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(cx, cy) * 0.3;
  const maxRadius = Math.min(cx, cy) * 0.9;
  const bars = Math.min(SPECTRUM_BANDS, spectrum.length);
  const angleStep = TWO_PI / bars;

  for (let i = 0; i < bars; i++) {
    const magnitude = spectrum[i];
    const angle = i * angleStep + rotation;
    const barLen = radius + magnitude * (maxRadius - radius);

    const x1 = cx + Math.cos(angle) * radius;
    const y1 = cy + Math.sin(angle) * radius;
    const x2 = cx + Math.cos(angle) * barLen;
    const y2 = cy + Math.sin(angle) * barLen;

    const color = mapSpectrumToColor(i, bars, magnitude, colorScheme);
    ctx.strokeStyle = rgbToCss(color);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
}

/**
 * 3D频谱瀑布历史数据管理
 */
export class SpectrumHistory {
  private history: Float32Array[] = [];
  private maxHistory: number;

  constructor(maxHistory = 64) {
    this.maxHistory = maxHistory;
  }

  push(spectrum: Float32Array): void {
    const copy = new Float32Array(spectrum);
    this.history.unshift(copy);
    if (this.history.length > this.maxHistory) {
      this.history.pop();
    }
  }

  get(): Float32Array[] {
    return this.history;
  }

  clear(): void {
    this.history = [];
  }
}

/**
 * 绘制3D频谱瀑布
 */
export function drawSpectrumWaterfall(
  ctx: any,
  history: SpectrumHistory,
  width: number,
  height: number,
  colorScheme: ColorScheme
): void {
  const frames = history.get();
  if (frames.length === 0) return;

  const rows = frames.length;
  const cols = frames[0].length;
  const cellHeight = height / rows;
  const cellWidth = width / cols;

  for (let r = 0; r < rows; r++) {
    const row = frames[r];
    const depthAlpha = 1 - r / rows;
    for (let c = 0; c < cols; c++) {
      const mag = row[c];
      const color = mapSpectrumToColor(c, cols, mag, colorScheme);
      ctx.fillStyle = rgbaToCss(color, depthAlpha * mag);
      ctx.fillRect(c * cellWidth, r * cellHeight, cellWidth + 1, cellHeight + 1);
    }
  }
}

/**
 * 更新峰值保持数组
 */
export function updatePeakHold(
  spectrum: Float32Array,
  peaks: Float32Array,
  decayRate: number,
  dt: number
): void {
  const len = Math.min(spectrum.length, peaks.length);
  for (let i = 0; i < len; i++) {
    if (spectrum[i] > peaks[i]) {
      peaks[i] = spectrum[i];
    } else {
      peaks[i] = Math.max(0, peaks[i] - decayRate * dt);
    }
  }
}

// ============================================================================
// 波形可视化渲染函数
// ============================================================================

/**
 * 绘制时域波形（左右声道）
 */
export function drawWaveform(
  ctx: any,
  left: Float32Array,
  right: Float32Array,
  width: number,
  height: number,
  colorLeft: RGB = { r: 0, g: 200, b: 255 },
  colorRight: RGB = { r: 255, g: 50, b: 150 }
): void {
  const step = Math.max(1, Math.floor(left.length / width));
  const cy = height / 2;

  // 左声道
  ctx.strokeStyle = rgbToCss(colorLeft);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let x = 0; x < width; x++) {
    const idx = x * step;
    const amp = left[idx] || 0;
    const y = cy + amp * cy * 0.9;
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // 右声道
  ctx.strokeStyle = rgbToCss(colorRight);
  ctx.beginPath();
  for (let x = 0; x < width; x++) {
    const idx = x * step;
    const amp = right[idx] || 0;
    const y = cy + amp * cy * 0.9;
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

/**
 * 绘制李萨如图形 (XY模式)
 */
export function drawLissajous(
  ctx: any,
  left: Float32Array,
  right: Float32Array,
  width: number,
  height: number,
  colorScheme: ColorScheme,
  trailAlpha = 0.3
): void {
  const cx = width / 2;
  const cy = height / 2;
  const scale = Math.min(cx, cy) * 0.9;
  const len = Math.min(left.length, right.length);
  const step = Math.max(1, Math.floor(len / 4096));

  for (let i = 0; i < len - step; i += step) {
    const x1 = cx + left[i] * scale;
    const y1 = cy + right[i] * scale;
    const x2 = cx + left[i + step] * scale;
    const y2 = cy + right[i + step] * scale;

    const t = i / len;
    const energy = Math.abs(left[i]);
    const color = mapSpectrumToColor(Math.floor(t * 255), 256, energy, colorScheme);
    ctx.strokeStyle = rgbaToCss(color, trailAlpha);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
}

/**
 * 示波器余辉效果缓冲
 */
export class OscilloscopePersistence {
  private buffer: ImageData | null = null;
  private decay: number;

  constructor(decay = 0.85) {
    this.decay = decay;
  }

  apply(ctx: any, width: number, height: number): void {
    if (!this.buffer) {
      this.buffer = ctx.getImageData(0, 0, width, height);
    } else {
      const data = this.buffer.data;
      for (let i = 3; i < data.length; i += 4) {
        data[i] = Math.floor(data[i] * this.decay);
      }
      ctx.putImageData(this.buffer, 0, 0);
    }
  }

  capture(ctx: any, width: number, height: number): void {
    this.buffer = ctx.getImageData(0, 0, width, height);
  }
}

/**
 * 绘制示波器风格波形（带余辉）
 */
export function drawOscilloscope(
  ctx: any,
  left: Float32Array,
  width: number,
  height: number,
  persistence: OscilloscopePersistence,
  color: RGB = { r: 0, g: 255, b: 120 }
): void {
  persistence.apply(ctx, width, height);

  const step = Math.max(1, Math.floor(left.length / width));
  const cy = height / 2;

  ctx.strokeStyle = rgbToCss(color);
  ctx.lineWidth = 2;
  ctx.shadowBlur = 8;
  ctx.shadowColor = rgbToCss(color);
  ctx.beginPath();

  for (let x = 0; x < width; x++) {
    const idx = x * step;
    const amp = left[idx] || 0;
    const y = cy + amp * cy * 0.95;
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.shadowBlur = 0;

  persistence.capture(ctx, width, height);
}

/**
 * 绘制粒子波形
 */
export function drawParticleWaveform(
  ctx: any,
  left: Float32Array,
  right: Float32Array,
  width: number,
  height: number,
  colorScheme: ColorScheme,
  time: number
): void {
  const samples = Math.min(left.length, right.length);
  const step = Math.max(1, Math.floor(samples / 256));
  const cy = height / 2;

  for (let i = 0; i < samples; i += step) {
    const t = i / samples;
    const x = t * width;
    const amp = (left[i] + right[i]) * 0.5;
    const y = cy + amp * cy * 0.9;

    const energy = Math.abs(amp);
    const color = mapSpectrumToColor(i, samples, energy, colorScheme);
    const size = 2 + energy * 6;

    ctx.fillStyle = rgbToCss(color);
    ctx.beginPath();
    ctx.arc(x, y, size, 0, TWO_PI);
    ctx.fill();

    // 脉冲光环
    const pulse = Math.sin(time * 10 + i * 0.1) * 0.5 + 0.5;
    ctx.fillStyle = rgbaToCss(color, 0.2 * pulse);
    ctx.beginPath();
    ctx.arc(x, y, size * 2, 0, TWO_PI);
    ctx.fill();
  }
}

// ============================================================================
// 粒子系统
// ============================================================================

/**
 * 创建粒子
 */
export function createParticle(x: number, y: number, vx: number, vy: number, size: number, color: RGB): Particle {
  return {
    x, y, vx, vy,
    life: 1.0,
    maxLife: 1.0 + Math.random() * 2.0,
    size,
    color,
    alpha: 1.0,
    trail: [],
  };
}

/**
 * 更新粒子位置
 */
export function updateParticle(p: Particle, dt: number, gravity = 0): void {
  p.trail.push({ x: p.x, y: p.y });
  if (p.trail.length > MAX_TRAIL_LENGTH) p.trail.shift();

  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.vy += gravity * dt;
  p.life -= dt;
  p.alpha = clamp(p.life / p.maxLife, 0, 1);
}

/**
 * 绘制粒子
 */
export function drawParticle(ctx: any, p: Particle): void {
  const alpha = p.alpha;

  // 拖尾
  if (p.trail.length > 1) {
    ctx.strokeStyle = rgbaToCss(p.color, alpha * 0.4);
    ctx.lineWidth = p.size * 0.5;
    ctx.beginPath();
    for (let i = 0; i < p.trail.length; i++) {
      const pt = p.trail[i];
      if (i === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    }
    ctx.stroke();
  }

  // 粒子本体
  ctx.fillStyle = rgbaToCss(p.color, alpha);
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.size, 0, TWO_PI);
  ctx.fill();
}

/**
 * 音频驱动粒子系统
 * 低频→大粒子，高频→小粒子
 */
export class AudioDrivenParticles {
  particles: Particle[] = [];
  private maxCount: number;

  constructor(maxCount = MAX_PARTICLES) {
    this.maxCount = maxCount;
  }

  update(
    spectrum: Float32Array,
    width: number,
    height: number,
    dt: number,
    colorScheme: ColorScheme
  ): void {
    // 根据频谱能量生成新粒子
    const bassEnergy = average(spectrum.slice(0, Math.floor(spectrum.length * 0.1)));
    const trebleEnergy = average(spectrum.slice(Math.floor(spectrum.length * 0.5)));

    const spawnCount = Math.floor(bassEnergy * 10);
    for (let i = 0; i < spawnCount && this.particles.length < this.maxCount; i++) {
      const freqIndex = Math.floor(Math.random() * spectrum.length);
      const freqRatio = freqIndex / spectrum.length;
      const size = (1 - freqRatio) * 8 + 2; // 低频大，高频小
      const energy = spectrum[freqIndex];
      const color = mapSpectrumToColor(freqIndex, spectrum.length, energy, colorScheme);
      const x = Math.random() * width;
      const y = Math.random() * height;
      const angle = Math.random() * TWO_PI;
      const speed = energy * 200;
      const p = createParticle(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, size, color);
      p.maxLife = 1 + trebleEnergy * 3;
      this.particles.push(p);
    }

    // 更新现有粒子
    for (let i = this.particles.length - 1; i >= 0; i--) {
      updateParticle(this.particles[i], dt, 20);
      if (this.particles[i].life <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  draw(ctx: any): void {
    for (const p of this.particles) {
      drawParticle(ctx, p);
    }
  }

  clear(): void {
    this.particles = [];
  }
}

/**
 * 粒子舞蹈（随节拍跳跃）
 */
export class DancingParticles {
  particles: Particle[] = [];
  private floorY: number;
  private beatEnergy = 0;

  constructor(count: number, width: number, height: number) {
    this.floorY = height * 0.85;
    for (let i = 0; i < count; i++) {
      const x = (width / count) * i + width / count / 2;
      const color = hslToRgb((i / count) * 360, 0.8, 0.5);
      this.particles.push(createParticle(x, this.floorY, 0, 0, 6, color));
    }
  }

  update(beat: BeatInfo, width: number, height: number, dt: number): void {
    this.floorY = height * 0.85;
    if (beat.isBeat) {
      this.beatEnergy = beat.energy;
    }
    this.beatEnergy = Math.max(0, this.beatEnergy - dt * 3);

    const stepX = width / this.particles.length;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      p.x = stepX * i + stepX / 2;

      // 节拍触发跳跃
      if (beat.isBeat && Math.random() < 0.3) {
        p.vy = -this.beatEnergy * 400 * (0.5 + Math.random() * 0.5);
      }

      p.vy += 800 * dt; // 重力
      p.y += p.vy * dt;

      // 地面碰撞
      if (p.y > this.floorY) {
        p.y = this.floorY;
        p.vy *= -0.5; // 弹性衰减
      }

      // 更新拖尾
      p.trail.push({ x: p.x, y: p.y });
      if (p.trail.length > 12) p.trail.shift();
    }
  }

  draw(ctx: any): void {
    for (const p of this.particles) {
      drawParticle(ctx, p);
    }
  }
}

/**
 * 粒子拖尾系统（音频强度控制拖尾长度）
 */
export class ParticleTrails {
  particles: Particle[] = [];
  private maxCount: number;

  constructor(maxCount = 512) {
    this.maxCount = maxCount;
  }

  emit(x: number, y: number, energy: number, colorScheme: ColorScheme): void {
    if (this.particles.length >= this.maxCount) return;
    const angle = Math.random() * TWO_PI;
    const speed = 50 + energy * 300;
    const color = mapSpectrumToColor(Math.floor(energy * 255), 256, energy, colorScheme);
    const p = createParticle(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, 2 + energy * 4, color);
    p.maxLife = 0.5 + energy * 2;
    this.particles.push(p);
  }

  update(dt: number, globalEnergy: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      const targetTrailLen = Math.floor(globalEnergy * MAX_TRAIL_LENGTH);
      while (p.trail.length > targetTrailLen) p.trail.shift();
      updateParticle(p, dt, 0);
      if (p.life <= 0) this.particles.splice(i, 1);
    }
  }

  draw(ctx: any): void {
    for (const p of this.particles) {
      drawParticle(ctx, p);
    }
  }

  clear(): void {
    this.particles = [];
  }
}

/**
 * 粒子爆炸（节拍触发）
 */
export class ParticleExplosion {
  particles: Particle[] = [];

  explode(x: number, y: number, energy: number, colorScheme: ColorScheme, count = 50): void {
    for (let i = 0; i < count; i++) {
      const angle = (TWO_PI / count) * i + Math.random() * 0.5;
      const speed = (100 + Math.random() * 300) * energy;
      const color = mapSpectrumToColor(Math.floor(Math.random() * 255), 256, energy, colorScheme);
      const p = createParticle(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, 3 + Math.random() * 4, color);
      p.maxLife = 1 + energy * 2 + Math.random();
      this.particles.push(p);
    }
  }

  update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      updateParticle(this.particles[i], dt, 100);
      if (this.particles[i].life <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  draw(ctx: any): void {
    for (const p of this.particles) {
      drawParticle(ctx, p);
    }
  }

  clear(): void {
    this.particles = [];
  }
}

// ============================================================================
// 分形动画
// ============================================================================

/**
 * 计算Mandelbrot集迭代次数
 */
export function mandelbrotIterations(cx: number, cy: number, maxIter: number): number {
  let zx = 0, zy = 0;
  let iter = 0;
  while (zx * zx + zy * zy <= 4 && iter < maxIter) {
    const tmp = zx * zx - zy * zy + cx;
    zy = 2 * zx * zy + cy;
    zx = tmp;
    iter++;
  }
  return iter;
}

/**
 * 计算Julia集迭代次数
 */
export function juliaIterations(zx: number, zy: number, cx: number, cy: number, maxIter: number): number {
  let iter = 0;
  while (zx * zx + zy * zy <= 4 && iter < maxIter) {
    const tmp = zx * zx - zy * zy + cx;
    zy = 2 * zx * zy + cy;
    zx = tmp;
    iter++;
  }
  return iter;
}

/**
 * 迭代次数映射到颜色
 */
export function fractalColor(iter: number, maxIter: number, colorCycle: number): RGB {
  if (iter >= maxIter) return { r: 0, g: 0, b: 0 };
  const t = (iter / maxIter + colorCycle) % 1;
  return hslToRgb(t * 360, 0.8, 0.5);
}

/**
 * 绘制分形（Canvas 2D逐像素）
 */
export function drawFractal(
  ctx: any,
  width: number,
  height: number,
  params: FractalParams
): void {
  const imageData: ImageData = ctx.createImageData(width, height);
  const data = imageData.data;

  const aspect = width / height;
  const zoom = params.zoom || 1;
  const centerX = params.cx || 0;
  const centerY = params.cy || 0;
  const cosR = Math.cos(params.rotation || 0);
  const sinR = Math.sin(params.rotation || 0);

  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      // 归一化到[-1,1]
      let nx = ((px / width) * 2 - 1) * aspect;
      let ny = (py / height) * 2 - 1;

      // 旋转
      const rx = nx * cosR - ny * sinR;
      const ry = nx * sinR + ny * cosR;

      // 缩放平移
      const fx = centerX + rx / zoom;
      const fy = centerY + ry / zoom;

      let iter: number;
      if (params.type === 'julia') {
        iter = juliaIterations(fx, fy, centerX, centerY, params.maxIter);
      } else {
        iter = mandelbrotIterations(fx, fy, params.maxIter);
      }

      const color = fractalColor(iter, params.maxIter, params.colorCycle);
      const idx = (py * width + px) * 4;
      data[idx] = color.r;
      data[idx + 1] = color.g;
      data[idx + 2] = color.b;
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

/**
 * 分形WebGL顶点着色器
 */
export function fractalVertexShader(): string {
  return `
    attribute vec2 a_position;
    void main() {
      gl_Position = vec4(a_position, 0.0, 1.0);
    }
  `;
}

/**
 * 分形WebGL片段着色器 (Mandelbrot / Julia)
 */
export function fractalFragmentShader(): string {
  return `
    precision highp float;
    uniform vec2 u_resolution;
    uniform vec2 u_center;
    uniform float u_zoom;
    uniform float u_rotation;
    uniform int u_maxIter;
    uniform float u_colorCycle;
    uniform int u_type; // 0=mandelbrot, 1=julia
    uniform vec2 u_juliaC;

    vec2 rotate(vec2 p, float angle) {
      float c = cos(angle);
      float s = sin(angle);
      return vec2(p.x * c - p.y * s, p.x * s + p.y * c);
    }

    vec3 hsl2rgb(float h, float s, float l) {
      float c = (1.0 - abs(2.0 * l - 1.0)) * s;
      float x = c * (1.0 - abs(mod(h / 60.0, 2.0) - 1.0));
      float m = l - c / 2.0;
      vec3 rgb;
      if (h < 60.0) rgb = vec3(c, x, 0.0);
      else if (h < 120.0) rgb = vec3(x, c, 0.0);
      else if (h < 180.0) rgb = vec3(0.0, c, x);
      else if (h < 240.0) rgb = vec3(0.0, x, c);
      else if (h < 300.0) rgb = vec3(x, 0.0, c);
      else rgb = vec3(c, 0.0, x);
      return rgb + m;
    }

    void main() {
      vec2 uv = (gl_FragCoord.xy / u_resolution.xy) * 2.0 - 1.0;
      uv.x *= u_resolution.x / u_resolution.y;
      uv = rotate(uv, u_rotation);
      vec2 c = u_center + uv / u_zoom;

      vec2 z;
      if (u_type == 0) {
        z = c;
        c = u_center;
      } else {
        z = c;
        c = u_juliaC;
      }

      float iter = 0.0;
      for (int i = 0; i < 1000; i++) {
        if (i >= u_maxIter) break;
        if (dot(z, z) > 4.0) break;
        float tmp = z.x * z.x - z.y * z.y + c.x;
        z.y = 2.0 * z.x * z.y + c.y;
        z.x = tmp;
        iter += 1.0;
      }

      if (iter >= float(u_maxIter)) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
      } else {
        float t = (iter / float(u_maxIter) + u_colorCycle);
        t = t - floor(t);
        vec3 col = hsl2rgb(t * 360.0, 0.8, 0.5);
        gl_FragColor = vec4(col, 1.0);
      }
    }
  `;
}

/**
 * 音频控制的分形参数更新
 */
export function updateFractalParamsFromAudio(
  params: FractalParams,
  spectrum: Float32Array,
  beat: BeatInfo,
  time: number,
  dt: number
): FractalParams {
  const bass = average(spectrum.slice(0, Math.floor(spectrum.length * 0.1)));
  const treble = average(spectrum.slice(Math.floor(spectrum.length * 0.6)));

  // 音频控制缩放
  const zoomSpeed = bass * 2;
  params.zoom = params.zoom * (1 + zoomSpeed * dt);
  if (params.zoom > 1e6) params.zoom = 1;

  // 音频控制旋转
  params.rotation += treble * dt * 0.5;

  // 音频控制颜色迭代
  params.colorCycle = (params.colorCycle + bass * dt * 0.2) % 1;

  // 节拍突变
  if (beat.isBeat) {
    params.maxIter = Math.min(1000, Math.max(50, Math.floor(params.maxIter + beat.energy * 50)));
  }

  return params;
}

/**
 * 分形音乐视频生成器（参数序列）
 */
export class FractalVideoGenerator {
  private frames: FractalParams[] = [];
  private currentIndex = 0;

  generateFromAudio(spectrumHistory: Float32Array[], beatHistory: BeatInfo[]): void {
    let params: FractalParams = {
      cx: -0.5, cy: 0, zoom: 1, rotation: 0,
      maxIter: 100, type: 'mandelbrot', colorCycle: 0,
    };

    for (let i = 0; i < spectrumHistory.length; i++) {
      const spectrum = spectrumHistory[i];
      const beat = beatHistory[i] || { isBeat: false, energy: 0, bpm: 0, confidence: 0, spectrumCentroid: 0 };
      const dt = 1 / 30; // 假设30fps

      params = updateFractalParamsFromAudio(params, spectrum, beat, i * dt, dt);
      this.frames.push({ ...params });
    }
  }

  getFrame(index: number): FractalParams | null {
    if (index < 0 || index >= this.frames.length) return null;
    return this.frames[index];
  }

  nextFrame(): FractalParams | null {
    const frame = this.frames[this.currentIndex];
    this.currentIndex++;
    return frame || null;
  }

  reset(): void {
    this.currentIndex = 0;
  }

  getLength(): number {
    return this.frames.length;
  }
}

// ============================================================================
// 综合场景
// ============================================================================

/**
 * 绘制赛博朋克场景：霓虹网格 + 频谱柱 + 粒子
 */
export function drawCyberpunkScene(
  ctx: any,
  spectrum: Float32Array,
  width: number,
  height: number,
  particles: AudioDrivenParticles,
  time: number
): void {
  // 深色背景
  ctx.fillStyle = '#050510';
  ctx.fillRect(0, 0, width, height);

  // 霓虹网格
  const gridSize = 40;
  const perspective = 0.6;
  const horizonY = height * 0.4;

  ctx.strokeStyle = 'rgba(0, 255, 255, 0.15)';
  ctx.lineWidth = 1;

  // 水平线
  for (let y = horizonY; y < height; y += gridSize * perspective) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  // 垂直透视网格
  const cx = width / 2;
  for (let i = -20; i <= 20; i++) {
    const x = cx + i * gridSize * 2;
    ctx.beginPath();
    ctx.moveTo(cx + (x - cx) * 0.1, horizonY);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  // 频谱柱（在网格上）
  const bars = Math.min(64, spectrum.length);
  const barWidth = width / bars;
  for (let i = 0; i < bars; i++) {
    const mag = spectrum[i];
    const h = mag * height * 0.5;
    const x = i * barWidth;
    const y = height - h;

    const color = neonColor(i / bars, mag);
    ctx.fillStyle = rgbaToCss(color, 0.8);
    ctx.fillRect(x + 2, y, barWidth - 4, h);

    // 霓虹发光边缘
    ctx.strokeStyle = rgbaToCss(color, 0.5);
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 2, y, barWidth - 4, h);
  }

  // 粒子
  particles.draw(ctx);

  // 扫描线效果
  const scanY = (time * 100) % height;
  ctx.fillStyle = 'rgba(0, 255, 255, 0.05)';
  ctx.fillRect(0, scanY, width, 2);
}

/**
 * 绘制宇宙场景：星空 + 脉冲星 + 波形环
 */
export function drawCosmosScene(
  ctx: any,
  spectrum: Float32Array,
  left: Float32Array,
  width: number,
  height: number,
  time: number
): void {
  // 星空背景
  ctx.fillStyle = '#000005';
  ctx.fillRect(0, 0, width, height);

  // 随机星星（伪随机保持位置稳定）
  const seedRandom = (s: number): number => {
    const x = Math.sin(s * 12.9898 + 78.233) * 43758.5453;
    return x - Math.floor(x);
  };

  for (let i = 0; i < 200; i++) {
    const sx = seedRandom(i) * width;
    const sy = seedRandom(i + 1000) * height;
    const size = seedRandom(i + 2000) * 2 + 0.5;
    const twinkle = Math.sin(time * 3 + i) * 0.5 + 0.5;
    ctx.fillStyle = `rgba(255,255,255,${0.3 + twinkle * 0.7})`;
    ctx.beginPath();
    ctx.arc(sx, sy, size, 0, TWO_PI);
    ctx.fill();
  }

  // 脉冲星（中心，随低频脉动）
  const cx = width / 2;
  const cy = height / 2;
  const bass = average(spectrum.slice(0, Math.floor(spectrum.length * 0.1)));
  const pulseRadius = 20 + bass * 80;

  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, pulseRadius * 3);
  gradient.addColorStop(0, 'rgba(100, 200, 255, 0.8)');
  gradient.addColorStop(0.3, 'rgba(50, 100, 255, 0.3)');
  gradient.addColorStop(1, 'rgba(0, 0, 50, 0)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(cx, cy, pulseRadius * 3, 0, TWO_PI);
  ctx.fill();

  // 波形环
  const ringRadius = Math.min(cx, cy) * 0.6;
  const samples = Math.min(left.length, 360);
  const step = Math.max(1, Math.floor(left.length / samples));

  ctx.strokeStyle = 'rgba(100, 220, 255, 0.6)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < samples; i++) {
    const angle = (i / samples) * TWO_PI;
    const amp = left[i * step] || 0;
    const r = ringRadius + amp * 60;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.stroke();
}

/**
 * 水波场景：音频驱动水波涟漪
 */
export class WaterRippleScene {
  ripples: Ripple[] = [];
  private gridWidth = 0;
  private gridHeight = 0;
  private buffer1: Float32Array = new Float32Array(0);
  private buffer2: Float32Array = new Float32Array(0);
  private damping = 0.96;

  constructor() {}

  init(width: number, height: number, resolution = 2): void {
    this.gridWidth = Math.ceil(width / resolution);
    this.gridHeight = Math.ceil(height / resolution);
    const size = this.gridWidth * this.gridHeight;
    this.buffer1 = new Float32Array(size);
    this.buffer2 = new Float32Array(size);
  }

  addRipple(x: number, y: number, strength: number): void {
    this.ripples.push({
      x, y, radius: 0, strength,
      age: 0, maxAge: 120,
    });
  }

  update(spectrum: Float32Array, width: number, height: number, beat: BeatInfo): void {
    if (this.buffer1.length === 0) this.init(width, height);

    // 节拍触发涟漪
    if (beat.isBeat) {
      const energy = beat.energy;
      this.addRipple(
        Math.random() * width,
        Math.random() * height,
        energy * 255
      );
    }

    // 低频能量驱动中心涟漪
    const bass = average(spectrum.slice(0, Math.floor(spectrum.length * 0.1)));
    if (bass > 0.6) {
      this.addRipple(width / 2, height / 2, bass * 200);
    }

    // 更新涟漪元数据
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i];
      r.age++;
      r.radius += 2;
      if (r.age >= r.maxAge) {
        this.ripples.splice(i, 1);
      }
    }

    // 波传播模拟
    const w = this.gridWidth;
    const h = this.gridHeight;
    const b1 = this.buffer1;
    const b2 = this.buffer2;

    // 在当前buffer2中应用涟漪源
    for (const r of this.ripples) {
      const gx = Math.floor((r.x / width) * w);
      const gy = Math.floor((r.y / height) * h);
      const idx = gy * w + gx;
      if (idx >= 0 && idx < b2.length) {
        b2[idx] += r.strength * Math.sin((r.age / r.maxAge) * Math.PI);
      }
    }

    // 波传播
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = y * w + x;
        b1[idx] = (
          b2[idx - 1] + b2[idx + 1] +
          b2[idx - w] + b2[idx + w]
        ) * 0.5 - b1[idx];
        b1[idx] *= this.damping;
      }
    }

    // 交换缓冲区
    [this.buffer1, this.buffer2] = [this.buffer2, this.buffer1];
  }

  draw(ctx: any, width: number, height: number): void {
    if (this.buffer1.length === 0) return;

    const w = this.gridWidth;
    const h = this.gridHeight;
    const cellW = width / w;
    const cellH = height / h;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        const val = this.buffer2[idx];
        const intensity = clamp(Math.abs(val) / 128, 0, 1);
        if (intensity < 0.02) continue;

        const r = Math.floor(intensity * 50);
        const g = Math.floor(intensity * 100 + 50);
        const b = Math.floor(intensity * 200 + 55);
        ctx.fillStyle = `rgba(${r},${g},${b},${intensity})`;
        ctx.fillRect(x * cellW, y * cellH, cellW + 1, cellH + 1);
      }
    }
  }
}

/**
 * 火焰场景：音频驱动火焰粒子
 */
export class FireScene {
  particles: Particle[] = [];
  private maxCount: number;
  private heatMap: Float32Array = new Float32Array(0);

  constructor(maxCount = 1024) {
    this.maxCount = maxCount;
  }

  init(width: number, height: number): void {
    this.heatMap = new Float32Array(width);
  }

  update(spectrum: Float32Array, width: number, height: number, dt: number): void {
    if (this.heatMap.length !== width) this.init(width, height);

    const bass = average(spectrum.slice(0, Math.floor(spectrum.length * 0.15)));

    // 生成火焰粒子
    const spawnCount = Math.floor(bass * 20);
    for (let i = 0; i < spawnCount && this.particles.length < this.maxCount; i++) {
      const x = Math.random() * width;
      const size = 4 + Math.random() * 8;
      const heat = Math.random();
      const r = Math.round(200 + heat * 55);
      const g = Math.round(heat * 150);
      const b = 0;
      const p = createParticle(x, height, (Math.random() - 0.5) * 30, -50 - heat * 150, size, { r, g, b });
      p.maxLife = 0.5 + heat * 1.5;
      this.particles.push(p);
    }

    // 更新粒子
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.vx += (Math.random() - 0.5) * 20 * dt;
      updateParticle(p, dt, -20); // 火焰向上
      if (p.life <= 0) this.particles.splice(i, 1);
    }
  }

  draw(ctx: any): void {
    // 使用additive blending模拟发光
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.particles) {
      const alpha = p.alpha;
      const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 2);
      gradient.addColorStop(0, rgbaToCss(p.color, alpha));
      gradient.addColorStop(1, rgbaToCss(p.color, 0));
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 2, 0, TWO_PI);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  clear(): void {
    this.particles = [];
  }
}

// ============================================================================
// 音频分析器工具
// ============================================================================

/**
 * 频带能量计算
 */
export function computeBandEnergy(spectrum: Float32Array, sampleRate: number): SpectrumData['bands'] {
  const nyquist = sampleRate / 2;
  const binFreq = nyquist / spectrum.length;

  const rangeEnergy = (low: number, high: number): number => {
    let sum = 0;
    let count = 0;
    const startBin = Math.floor(low / binFreq);
    const endBin = Math.min(spectrum.length, Math.ceil(high / binFreq));
    for (let i = startBin; i < endBin; i++) {
      sum += spectrum[i];
      count++;
    }
    return count > 0 ? sum / count : 0;
  };

  return {
    subBass: rangeEnergy(BAND_RANGES.subBass[0], BAND_RANGES.subBass[1]),
    bass: rangeEnergy(BAND_RANGES.bass[0], BAND_RANGES.bass[1]),
    lowMid: rangeEnergy(BAND_RANGES.lowMid[0], BAND_RANGES.lowMid[1]),
    mid: rangeEnergy(BAND_RANGES.mid[0], BAND_RANGES.mid[1]),
    highMid: rangeEnergy(BAND_RANGES.highMid[0], BAND_RANGES.highMid[1]),
    presence: rangeEnergy(BAND_RANGES.presence[0], BAND_RANGES.presence[1]),
    brilliance: rangeEnergy(BAND_RANGES.brilliance[0], BAND_RANGES.brilliance[1]),
  };
}

/**
 * 实时FFT包装（应用窗函数并计算频谱）
 */
export function analyzeSpectrum(
  timeDomain: Float32Array,
  sampleRate: number,
  windowType: 'hann' | 'blackman' | 'rect' = 'hann'
): SpectrumData {
  const windowed = applyWindow(timeDomain, windowType);
  const complexSpectrum = fft(windowed);
  const magnitudes = computeMagnitudeSpectrum(complexSpectrum);
  const phases = computePhaseSpectrum(complexSpectrum);

  // 归一化
  const maxMag = maxValue(magnitudes);
  const normalized = new Float32Array(magnitudes.length);
  if (maxMag > 0) {
    for (let i = 0; i < magnitudes.length; i++) {
      normalized[i] = magnitudes[i] / maxMag;
    }
  }

  const nyquist = sampleRate / 2;
  const freqs = new Float32Array(magnitudes.length);
  for (let i = 0; i < freqs.length; i++) {
    freqs[i] = (i / freqs.length) * nyquist;
  }

  return {
    frequencies: freqs,
    magnitudes: normalized,
    phases,
    bands: computeBandEnergy(normalized, sampleRate),
  };
}

/**
 * 节拍检测器
 */
export class BeatDetector {
  private energyHistory: number[] = [];
  private maxHistory = 43; // ~1秒 at 43fps
  private threshold = 1.3;
  private lastBeatTime = 0;
  private beatInterval = 0;
  private beatCount = 0;

  detect(spectrum: Float32Array, time: number): BeatInfo {
    const instantEnergy = rms(spectrum);
    this.energyHistory.push(instantEnergy);
    if (this.energyHistory.length > this.maxHistory) {
      this.energyHistory.shift();
    }

    const localEnergy = average(this.energyHistory);
    const variance = this.energyHistory.reduce((sum, e) => sum + (e - localEnergy) ** 2, 0) / this.energyHistory.length;
    const c = -0.0025714 * variance + 1.5142857;
    const adjustedThreshold = this.threshold * c;

    const isBeat = instantEnergy > localEnergy * adjustedThreshold && (time - this.lastBeatTime) > 0.15;

    if (isBeat) {
      if (this.lastBeatTime > 0) {
        this.beatInterval = time - this.lastBeatTime;
      }
      this.lastBeatTime = time;
      this.beatCount++;
    }

    const bpm = this.beatInterval > 0 ? 60 / this.beatInterval : 0;
    const centroid = this.spectralCentroid(spectrum);

    return {
      isBeat,
      energy: instantEnergy,
      bpm,
      confidence: isBeat ? 1 : 0,
      spectrumCentroid: centroid,
    };
  }

  private spectralCentroid(spectrum: Float32Array): number {
    let numerator = 0;
    let denominator = 0;
    for (let i = 0; i < spectrum.length; i++) {
      numerator += i * spectrum[i];
      denominator += spectrum[i];
    }
    return denominator > 0 ? numerator / denominator : 0;
  }

  reset(): void {
    this.energyHistory = [];
    this.lastBeatTime = 0;
    this.beatInterval = 0;
    this.beatCount = 0;
  }
}

/**
 * BPM估算器（基于峰值间隔统计）
 */
export class BpmEstimator {
  private intervals: number[] = [];
  private lastPeakTime = 0;
  private peakThreshold = 0.5;

  addPeak(time: number, energy: number): void {
    if (energy < this.peakThreshold) return;
    if (this.lastPeakTime > 0) {
      const interval = time - this.lastPeakTime;
      if (interval > 0.2 && interval < 3.0) {
        this.intervals.push(interval);
      }
    }
    this.lastPeakTime = time;
  }

  estimateBpm(): number {
    if (this.intervals.length < 2) return 0;
    // 取中位数
    const sorted = [...this.intervals].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    return median > 0 ? 60 / median : 0;
  }

  getConfidence(): number {
    if (this.intervals.length < 4) return 0;
    const mean = average(this.intervals);
    const variance = this.intervals.reduce((s, v) => s + (v - mean) ** 2, 0) / this.intervals.length;
    const stdDev = Math.sqrt(variance);
    return clamp(1 - stdDev / mean, 0, 1);
  }

  reset(): void {
    this.intervals = [];
    this.lastPeakTime = 0;
  }
}

/**
 * 音高检测（自相关法）
 */
export function detectPitch(buffer: Float32Array, sampleRate: number): number {
  const n = buffer.length;
  const maxLag = Math.min(n, Math.floor(sampleRate / 50)); // 最低50Hz
  const minLag = Math.floor(sampleRate / 2000); // 最高2000Hz

  let bestLag = 0;
  let bestCorrelation = -Infinity;

  // 计算自相关
  for (let lag = minLag; lag < maxLag; lag++) {
    let correlation = 0;
    for (let i = 0; i < n - lag; i++) {
      correlation += buffer[i] * buffer[i + lag];
    }
    if (correlation > bestCorrelation) {
      bestCorrelation = correlation;
      bestLag = lag;
    }
  }

  if (bestLag === 0) return 0;

  // 抛物线插值精化
  const y1 = bestLag > minLag ? computeAutocorrelation(buffer, bestLag - 1) : bestCorrelation;
  const y2 = bestCorrelation;
  const y3 = bestLag < maxLag - 1 ? computeAutocorrelation(buffer, bestLag + 1) : bestCorrelation;
  const shift = (y3 - y1) / (2 * (2 * y2 - y1 - y3));
  const refinedLag = bestLag + (isNaN(shift) ? 0 : shift);

  return sampleRate / refinedLag;
}

function computeAutocorrelation(buffer: Float32Array, lag: number): number {
  let sum = 0;
  for (let i = 0; i < buffer.length - lag; i++) {
    sum += buffer[i] * buffer[i + lag];
  }
  return sum;
}

/**
 * 响度检测（LUFS简化版，基于K加权滤波和积分）
 */
export class LoudnessMeter {
  private powerHistory: number[] = [];
  private maxHistory = 300; // ~5秒 at 60fps

  measure(buffer: Float32Array, sampleRate: number): number {
    // 简化K加权（高通滤波近似）
    const filtered = this.highPassFilter(buffer, sampleRate, 100);

    // 计算短时功率
    let power = 0;
    for (let i = 0; i < filtered.length; i++) {
      power += filtered[i] * filtered[i];
    }
    power /= filtered.length;

    // 转LUFS近似
    const lufs = -0.691 + 10 * Math.log10(Math.max(1e-10, power));

    this.powerHistory.push(lufs);
    if (this.powerHistory.length > this.maxHistory) this.powerHistory.shift();

    return lufs;
  }

  getIntegratedLoudness(): number {
    if (this.powerHistory.length === 0) return -70;
    const avgPower = this.powerHistory.reduce((s, v) => s + Math.pow(10, v / 10), 0) / this.powerHistory.length;
    return 10 * Math.log10(Math.max(1e-10, avgPower));
  }

  getShortTermLoudness(): number {
    if (this.powerHistory.length === 0) return -70;
    const recent = this.powerHistory.slice(-60);
    const avgPower = recent.reduce((s, v) => s + Math.pow(10, v / 10), 0) / recent.length;
    return 10 * Math.log10(Math.max(1e-10, avgPower));
  }

  reset(): void {
    this.powerHistory = [];
  }

  private highPassFilter(input: Float32Array, sampleRate: number, cutoff: number): Float32Array {
    const rc = 1 / (TWO_PI * cutoff);
    const dt = 1 / sampleRate;
    const alpha = rc / (rc + dt);
    const output = new Float32Array(input.length);
    output[0] = input[0];
    for (let i = 1; i < input.length; i++) {
      output[i] = alpha * (output[i - 1] + input[i] - input[i - 1]);
    }
    return output;
  }
}

// ============================================================================
// WebGL 辅助工具
// ============================================================================

/**
 * 创建WebGL着色器
 */
export function createShader(gl: any, type: number, source: string): any {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error('Shader编译错误: ' + info);
  }
  return shader;
}

/**
 * 创建WebGL程序
 */
export function createProgram(gl: any, vsSource: string, fsSource: string): any {
  const vs = createShader(gl, gl.VERTEX_SHADER, vsSource);
  const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    throw new Error('Program链接错误: ' + info);
  }
  return program;
}

/**
 * 创建全屏四边形缓冲区
 */
export function createFullScreenQuad(gl: any): any {
  const positions = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
  return buffer;
}

/**
 * 通用后处理片段着色器（辉光/泛光）
 */
export function bloomFragmentShader(): string {
  return `
    precision mediump float;
    uniform sampler2D u_texture;
    uniform vec2 u_resolution;
    uniform float u_intensity;
    varying vec2 v_texCoord;

    void main() {
      vec4 color = texture2D(u_texture, v_texCoord);
      vec2 texel = 1.0 / u_resolution;
      vec4 bloom = vec4(0.0);

      for (float x = -2.0; x <= 2.0; x += 1.0) {
        for (float y = -2.0; y <= 2.0; y += 1.0) {
          bloom += texture2D(u_texture, v_texCoord + vec2(x, y) * texel);
        }
      }
      bloom /= 25.0;
      bloom = max(bloom - 0.5, 0.0) * u_intensity;

      gl_FragColor = color + bloom;
    }
  `;
}

/**
 * 带纹理坐标的顶点着色器
 */
export function texturedVertexShader(): string {
  return `
    attribute vec2 a_position;
    varying vec2 v_texCoord;
    void main() {
      v_texCoord = a_position * 0.5 + 0.5;
      gl_Position = vec4(a_position, 0.0, 1.0);
    }
  `;
}

// ============================================================================
// 主可视化引擎
// ============================================================================

/**
 * 可视化模式枚举
 */
export type VisualMode =
  | 'spectrumBars'
  | 'circularSpectrum'
  | 'spectrumWaterfall'
  | 'waveform'
  | 'lissajous'
  | 'oscilloscope'
  | 'particleWave'
  | 'audioParticles'
  | 'dancingParticles'
  | 'particleTrails'
  | 'particleExplosion'
  | 'fractal'
  | 'cyberpunk'
  | 'cosmos'
  | 'waterRipple'
  | 'fire';

/**
 * 音乐可视化主引擎
 */
export class MusicVisualizer {
  config: VisualizerConfig;
  spectrumHistory: SpectrumHistory;
  audioParticles: AudioDrivenParticles;
  dancingParticles: DancingParticles;
  particleTrails: ParticleTrails;
  particleExplosion: ParticleExplosion;
  beatDetector: BeatDetector;
  bpmEstimator: BpmEstimator;
  loudnessMeter: LoudnessMeter;
  waterScene: WaterRippleScene;
  fireScene: FireScene;
  oscilloscopePersistence: OscilloscopePersistence;
  peakHold: Float32Array;
  private lastTime = 0;
  private width = 0;
  private height = 0;

  constructor(config?: Partial<VisualizerConfig>) {
    this.config = {
      fftSize: DEFAULT_FFT_SIZE,
      smoothing: 0.8,
      sensitivity: 1.0,
      colorScheme: 'rainbow',
      particleCount: MAX_PARTICLES,
      trailLength: MAX_TRAIL_LENGTH,
      enable3D: false,
      decayRate: 2.0,
      peakHoldTime: 0.5,
      ...config,
    };

    this.spectrumHistory = new SpectrumHistory(64);
    this.audioParticles = new AudioDrivenParticles(this.config.particleCount);
    this.dancingParticles = new DancingParticles(32, 800, 600);
    this.particleTrails = new ParticleTrails(512);
    this.particleExplosion = new ParticleExplosion();
    this.beatDetector = new BeatDetector();
    this.bpmEstimator = new BpmEstimator();
    this.loudnessMeter = new LoudnessMeter();
    this.waterScene = new WaterRippleScene();
    this.fireScene = new FireScene();
    this.oscilloscopePersistence = new OscilloscopePersistence(0.88);
    this.peakHold = new Float32Array(SPECTRUM_BANDS);
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.waterScene.init(width, height);
  }

  /**
   * 主渲染循环
   */
  render(
    ctx: any,
    audio: AudioData,
    mode: VisualMode,
    time: number,
    gl?: any
  ): void {
    const dt = Math.min(time - this.lastTime, 0.1);
    this.lastTime = time;

    if (this.width === 0) this.width = ctx.canvas?.width || 800;
    if (this.height === 0) this.height = ctx.canvas?.height || 600;

    // 音频分析
    const spectrumData = analyzeSpectrum(
      new Float32Array(audio.left.slice(0, this.config.fftSize)),
      audio.sampleRate,
      'hann'
    );
    const spectrum = spectrumData.magnitudes;
    const beat = this.beatDetector.detect(spectrum, time);
    this.bpmEstimator.addPeak(time, beat.energy);
    this.loudnessMeter.measure(audio.left, audio.sampleRate);

    // 平滑与峰值保持
    updatePeakHold(spectrum, this.peakHold, this.config.decayRate, dt);
    this.spectrumHistory.push(spectrum);

    // 清屏
    ctx.clearRect(0, 0, this.width, this.height);

    switch (mode) {
      case 'spectrumBars':
        drawSpectrumBars(ctx, spectrum, this.width, this.height, this.config.colorScheme, this.peakHold);
        break;
      case 'circularSpectrum':
        drawCircularSpectrum(ctx, spectrum, this.width, this.height, this.config.colorScheme, time * 0.2);
        break;
      case 'spectrumWaterfall':
        drawSpectrumWaterfall(ctx, this.spectrumHistory, this.width, this.height, this.config.colorScheme);
        break;
      case 'waveform':
        drawWaveform(ctx, audio.left, audio.right, this.width, this.height);
        break;
      case 'lissajous':
        drawLissajous(ctx, audio.left, audio.right, this.width, this.height, this.config.colorScheme);
        break;
      case 'oscilloscope':
        drawOscilloscope(ctx, audio.left, this.width, this.height, this.oscilloscopePersistence);
        break;
      case 'particleWave':
        drawParticleWaveform(ctx, audio.left, audio.right, this.width, this.height, this.config.colorScheme, time);
        break;
      case 'audioParticles':
        this.audioParticles.update(spectrum, this.width, this.height, dt, this.config.colorScheme);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, this.width, this.height);
        this.audioParticles.draw(ctx);
        break;
      case 'dancingParticles':
        this.dancingParticles.update(beat, this.width, this.height, dt);
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, this.width, this.height);
        this.dancingParticles.draw(ctx);
        break;
      case 'particleTrails':
        this.particleTrails.update(dt, beat.energy);
        // 随机在频谱强处发射
        if (beat.energy > 0.3) {
          this.particleTrails.emit(
            Math.random() * this.width,
            Math.random() * this.height,
            beat.energy,
            this.config.colorScheme
          );
        }
        ctx.fillStyle = 'rgba(0,0,0,0.1)';
        ctx.fillRect(0, 0, this.width, this.height);
        this.particleTrails.draw(ctx);
        break;
      case 'particleExplosion':
        if (beat.isBeat) {
          this.particleExplosion.explode(
            this.width / 2 + (Math.random() - 0.5) * this.width * 0.5,
            this.height / 2 + (Math.random() - 0.5) * this.height * 0.5,
            beat.energy,
            this.config.colorScheme,
            80
          );
        }
        this.particleExplosion.update(dt);
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.fillRect(0, 0, this.width, this.height);
        this.particleExplosion.draw(ctx);
        break;
      case 'fractal': {
        const params: FractalParams = {
          cx: -0.5 + Math.sin(time * 0.1) * 0.2,
          cy: Math.cos(time * 0.15) * 0.2,
          zoom: 1 + time * 0.1,
          rotation: time * 0.05,
          maxIter: 100 + Math.floor(beat.energy * 200),
          type: 'mandelbrot',
          colorCycle: time * 0.02,
        };
        updateFractalParamsFromAudio(params, spectrum, beat, time, dt);
        if (gl) {
          // WebGL渲染路径
          const program = createProgram(gl, fractalVertexShader(), fractalFragmentShader());
          gl.useProgram(program);
          // 设置uniforms并绘制...
        } else {
          drawFractal(ctx, this.width, this.height, params);
        }
        break;
      }
      case 'cyberpunk':
        this.audioParticles.update(spectrum, this.width, this.height, dt, this.config.colorScheme);
        drawCyberpunkScene(ctx, spectrum, this.width, this.height, this.audioParticles, time);
        break;
      case 'cosmos':
        drawCosmosScene(ctx, spectrum, audio.left, this.width, this.height, time);
        break;
      case 'waterRipple':
        this.waterScene.update(spectrum, this.width, this.height, beat);
        ctx.fillStyle = '#000510';
        ctx.fillRect(0, 0, this.width, this.height);
        this.waterScene.draw(ctx, this.width, this.height);
        break;
      case 'fire':
        this.fireScene.update(spectrum, this.width, this.height, dt);
        ctx.fillStyle = '#050100';
        ctx.fillRect(0, 0, this.width, this.height);
        this.fireScene.draw(ctx);
        break;
      default:
        drawSpectrumBars(ctx, spectrum, this.width, this.height, this.config.colorScheme);
    }
  }

  /**
   * 获取当前分析信息
   */
  getAnalysisInfo(): {
    bpm: number;
    loudness: number;
    integratedLoudness: number;
    beatCount: number;
  } {
    return {
      bpm: this.bpmEstimator.estimateBpm(),
      loudness: this.loudnessMeter.getShortTermLoudness(),
      integratedLoudness: this.loudnessMeter.getIntegratedLoudness(),
      beatCount: this.beatDetector['beatCount'] || 0,
    };
  }

  reset(): void {
    this.spectrumHistory.clear();
    this.audioParticles.clear();
    this.particleTrails.clear();
    this.particleExplosion.clear();
    this.fireScene.clear();
    this.beatDetector.reset();
    this.bpmEstimator.reset();
    this.loudnessMeter.reset();
    this.peakHold.fill(0);
  }
}

// ============================================================================
// 便捷导出函数
// ============================================================================

/**
 * 快速创建并渲染一帧
 */
export function renderVisualizerFrame(
  ctx: any,
  audio: AudioData,
  mode: VisualMode,
  time: number,
  config?: Partial<VisualizerConfig>
): void {
  const visualizer = new MusicVisualizer(config);
  if (ctx.canvas) {
    visualizer.resize(ctx.canvas.width, ctx.canvas.height);
  }
  visualizer.render(ctx, audio, mode, time);
}

/**
 * 生成完整的频谱可视化WebGL程序源码（供外部使用）
 */
export function generateSpectrumWebGLProgram(gl: any): { program: any; uniforms: Record<string, any> } {
  const program = createProgram(gl, spectrumBarVertexShader(), spectrumBarFragmentShader());
  const uniforms: Record<string, any> = {};
  // 此处可扩展uniform位置缓存
  return { program, uniforms };
}

/**
 * 生成完整的分形WebGL程序源码（供外部使用）
 */
export function generateFractalWebGLProgram(gl: any): { program: any; uniforms: Record<string, any> } {
  const program = createProgram(gl, fractalVertexShader(), fractalFragmentShader());
  const uniforms: Record<string, any> = {};
  return { program, uniforms };
}
