/**
 * ============================================================
 * Audio Effects Engine - 完整音频效果器引擎
 * TypeScript Strict Mode | 中文注释
 * ============================================================
 */

// ============================================================================
// 基础类型与通用接口
// ============================================================================

/** 采样率，默认 44100Hz */
export const DEFAULT_SAMPLE_RATE: number = 22050;

/** 单声道音频缓冲区 */
export type MonoBuffer = Float32Array;

/** 立体声音频缓冲区 */
export interface StereoBuffer {
  left: MonoBuffer;
  right: MonoBuffer;
}

/** 通用音频块（单声道或立体声） */
export type AudioBlock = MonoBuffer | StereoBuffer;

/** 效果器基础接口 */
export interface IAudioEffect {
  /** 处理一帧样本（单声道） */
  processSample(input: number, channel?: number): number;
  /** 处理整个缓冲区（单声道） */
  processBlock(input: MonoBuffer, output: MonoBuffer): void;
  /** 重置内部状态 */
  reset(): void;
  /** 旁通开关 */
  bypass: boolean;
  /** 湿信号比例 0.0 ~ 1.0 */
  wet: number;
  /** 效果器名称 */
  readonly name: string;
}

/** 效果器基础抽象类 */
export abstract class AudioEffectBase implements IAudioEffect {
  public bypass: boolean = false;
  public wet: number = 1.0;
  public abstract readonly name: string;
  protected sampleRate: number;

  constructor(sampleRate: number = DEFAULT_SAMPLE_RATE) {
    this.sampleRate = sampleRate;
  }

  public abstract processSample(input: number, channel?: number): number;

  public processBlock(input: MonoBuffer, output: MonoBuffer): void {
    const len: number = input.length;
    if (this.bypass) {
      for (let i: number = 0; i < len; i++) {
        output[i] = input[i];
      }
      return;
    }
    const dryGain: number = 1.0 - this.wet;
    for (let i: number = 0; i < len; i++) {
      const wetSample: number = this.processSample(input[i]);
      output[i] = input[i] * dryGain + wetSample * this.wet;
    }
  }

  public abstract reset(): void;

  /** 将分贝转换为线性增益 */
  protected dbToGain(db: number): number {
    return Math.pow(10.0, db / 20.0);
  }

  /** 将线性增益转换为分贝 */
  protected gainToDb(gain: number): number {
    return 20.0 * Math.log10(Math.max(gain, 1e-10));
  }

  /** 限制数值范围 */
  protected clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }
}

// ============================================================================
// 一、卷积混响（Convolution Reverb）
// ============================================================================

/** 混响类型枚举 */
export enum ReverbType {
  Room = 'room',
  Hall = 'hall',
  Church = 'church',
  Plate = 'plate',
  Spring = 'spring',
  Cave = 'cave',
  Tunnel = 'tunnel',
  Cathedral = 'cathedral',
  Bathroom = 'bathroom',
  Arena = 'arena',
  Forest = 'forest',
}

/** 卷积混响配置 */
export interface ConvolutionReverbConfig {
  sampleRate: number;
  reverbType: ReverbType;
  preDelayMs: number;
  rt60: number; // 混响时间（秒）
  wetLevel: number;
  dryLevel: number;
  earlyReflectionsGain: number;
  lateReverbGain: number;
}

/** 脉冲响应生成器 */
export class ImpulseResponseGenerator {
  private sampleRate: number;

  constructor(sampleRate: number = DEFAULT_SAMPLE_RATE) {
    this.sampleRate = sampleRate;
  }

  /** 生成脉冲响应 */
  public generate(type: ReverbType, rt60: number): MonoBuffer {
    const length: number = Math.ceil(rt60 * this.sampleRate) + 1;
    const ir: MonoBuffer = new Float32Array(length);

    switch (type) {
      case ReverbType.Room:
        this.generateRoom(ir, rt60);
        break;
      case ReverbType.Hall:
        this.generateHall(ir, rt60);
        break;
      case ReverbType.Church:
        this.generateChurch(ir, rt60);
        break;
      case ReverbType.Plate:
        this.generatePlate(ir, rt60);
        break;
      case ReverbType.Spring:
        this.generateSpring(ir, rt60);
        break;
      case ReverbType.Cave:
        this.generateCave(ir, rt60);
        break;
      case ReverbType.Tunnel:
        this.generateTunnel(ir, rt60);
        break;
      case ReverbType.Cathedral:
        this.generateCathedral(ir, rt60);
        break;
      case ReverbType.Bathroom:
        this.generateBathroom(ir, rt60);
        break;
      case ReverbType.Arena:
        this.generateArena(ir, rt60);
        break;
      case ReverbType.Forest:
        this.generateForest(ir, rt60);
        break;
      default:
        this.generateRoom(ir, rt60);
    }

    this.normalize(ir);
    return ir;
  }

  /** 房间脉冲响应：快速衰减，密集反射 */
  private generateRoom(ir: MonoBuffer, rt60: number): void {
    const length: number = ir.length;
    const decay: number = -3.0 / (rt60 * this.sampleRate); // 指数衰减系数
    for (let i: number = 0; i < length; i++) {
      const t: number = i / this.sampleRate;
      // 早期反射 + 晚期扩散噪声
      const envelope: number = Math.exp(decay * i) * (1.0 + 0.3 * Math.sin(20.0 * t));
      ir[i] = (Math.random() * 2.0 - 1.0) * envelope;
    }
  }

  /** 大厅脉冲响应：较长预延迟，平滑衰减 */
  private generateHall(ir: MonoBuffer, rt60: number): void {
    const length: number = ir.length;
    const decay: number = -3.0 / (rt60 * this.sampleRate);
    for (let i: number = 0; i < length; i++) {
      const t: number = i / this.sampleRate;
      const envelope: number = Math.exp(decay * i) * Math.pow(1.0 - i / length, 1.5);
      // 添加早期稀疏反射
      const early: number = i < this.sampleRate * 0.05 ? Math.sin(100.0 * t) * Math.exp(-30.0 * t) : 0;
      ir[i] = ((Math.random() * 2.0 - 1.0) * envelope + early) * 0.5;
    }
  }

  /** 教堂脉冲响应：非常长的混响，低频丰富 */
  private generateChurch(ir: MonoBuffer, rt60: number): void {
    const length: number = ir.length;
    const decay: number = -3.0 / (rt60 * this.sampleRate);
    for (let i: number = 0; i < length; i++) {
      const t: number = i / this.sampleRate;
      // 低频更多能量
      const lowFreqEnv: number = Math.exp(decay * 0.7 * i);
      const highFreqEnv: number = Math.exp(decay * 1.3 * i);
      const noise: number = Math.random() * 2.0 - 1.0;
      const lowNoise: number = Math.sin(2.0 * Math.PI * 50.0 * t) * 0.5 + noise * 0.5;
      ir[i] = lowNoise * lowFreqEnv * 0.6 + noise * highFreqEnv * 0.4;
    }
  }

  /** 板式混响：金属质感，高密度，中频突出 */
  private generatePlate(ir: MonoBuffer, rt60: number): void {
    const length: number = ir.length;
    const decay: number = -3.0 / (rt60 * this.sampleRate);
    for (let i: number = 0; i < length; i++) {
      const t: number = i / this.sampleRate;
      const envelope: number = Math.exp(decay * i) * (1.0 + 0.1 * Math.sin(200.0 * t));
      ir[i] = (Math.random() * 2.0 - 1.0) * envelope * 0.8;
    }
  }

  /** 弹簧混响：振铃效果，特征共振 */
  private generateSpring(ir: MonoBuffer, rt60: number): void {
    const length: number = ir.length;
    const decay: number = -3.0 / (rt60 * this.sampleRate);
    for (let i: number = 0; i < length; i++) {
      const t: number = i / this.sampleRate;
      const envelope: number = Math.exp(decay * i);
      // 弹簧特征频率 ~2-4kHz 的振铃
      const ring1: number = Math.sin(2.0 * Math.PI * 2500.0 * t) * Math.exp(-10.0 * t);
      const ring2: number = Math.sin(2.0 * Math.PI * 3800.0 * t) * Math.exp(-15.0 * t);
      ir[i] = ((Math.random() * 2.0 - 1.0) * 0.3 + ring1 * 0.5 + ring2 * 0.3) * envelope;
    }
  }

  /** 洞穴脉冲响应：非常长且不均匀衰减，回声感 */
  private generateCave(ir: MonoBuffer, rt60: number): void {
    const length: number = ir.length;
    const decay: number = -3.0 / (rt60 * this.sampleRate);
    for (let i: number = 0; i < length; i++) {
      const t: number = i / this.sampleRate;
      // 周期性回声模式
      const echo: number = Math.sin(2.0 * Math.PI * 2.0 * t) * 0.5 + 0.5;
      const envelope: number = Math.exp(decay * i) * (0.5 + 0.5 * echo);
      ir[i] = (Math.random() * 2.0 - 1.0) * envelope;
    }
  }

  /** 隧道脉冲响应：重复回声，缓慢衰减 */
  private generateTunnel(ir: MonoBuffer, rt60: number): void {
    const length: number = ir.length;
    const decay: number = -3.0 / (rt60 * this.sampleRate);
    const echoInterval: number = Math.floor(0.15 * this.sampleRate); // 150ms 回声间隔
    for (let i: number = 0; i < length; i++) {
      const t: number = i / this.sampleRate;
      const echoIndex: number = Math.floor(i / echoInterval);
      const echoDecay: number = Math.exp(decay * i) * Math.pow(0.7, echoIndex);
      const envelope: number = Math.exp(decay * i) * 0.5 + echoDecay * 0.5;
      ir[i] = (Math.random() * 2.0 - 1.0) * envelope;
    }
  }

  /** 大教堂脉冲响应：极长混响，低频丰富，高扩散 */
  private generateCathedral(ir: MonoBuffer, rt60: number): void {
    const length: number = ir.length;
    const decay: number = -3.0 / (rt60 * this.sampleRate);
    for (let i: number = 0; i < length; i++) {
      const t: number = i / this.sampleRate;
      const lowEnv: number = Math.exp(decay * 0.6 * i);
      const highEnv: number = Math.exp(decay * 1.5 * i);
      const noise: number = Math.random() * 2.0 - 1.0;
      const lowNoise: number = Math.sin(2.0 * Math.PI * 60.0 * t) * 0.4 + noise * 0.6;
      ir[i] = lowNoise * lowEnv * 0.65 + noise * highEnv * 0.35;
    }
  }

  /** 浴室脉冲响应：短混响，瓷砖反射导致高频增强 */
  private generateBathroom(ir: MonoBuffer, rt60: number): void {
    const length: number = ir.length;
    const decay: number = -3.0 / (rt60 * this.sampleRate);
    for (let i: number = 0; i < length; i++) {
      const t: number = i / this.sampleRate;
      const lowEnv: number = Math.exp(decay * 1.3 * i);
      const highEnv: number = Math.exp(decay * 0.8 * i);
      const noise: number = Math.random() * 2.0 - 1.0;
      const ring: number = Math.sin(2.0 * Math.PI * 8000.0 * t) * Math.exp(-20.0 * t) * 0.3;
      ir[i] = (noise * 0.7 + ring) * highEnv * 0.6 + noise * lowEnv * 0.4;
    }
  }

  /** 竞技场脉冲响应：超长 RT60，高扩散，稀疏早期反射 */
  private generateArena(ir: MonoBuffer, rt60: number): void {
    const length: number = ir.length;
    const decay: number = -3.0 / (rt60 * this.sampleRate);
    for (let i: number = 0; i < length; i++) {
      const t: number = i / this.sampleRate;
      const envelope: number = Math.exp(decay * i) * Math.pow(1.0 - i / length, 0.8);
      const early: number = i < this.sampleRate * 0.08 ? Math.sin(50.0 * t) * Math.exp(-8.0 * t) * 0.3 : 0;
      ir[i] = ((Math.random() * 2.0 - 1.0) * envelope + early) * 0.8;
    }
  }

  /** 森林脉冲响应：短 RT60，高阻尼，散射感 */
  private generateForest(ir: MonoBuffer, rt60: number): void {
    const length: number = ir.length;
    const decay: number = -3.0 / (rt60 * this.sampleRate);
    for (let i: number = 0; i < length; i++) {
      const t: number = i / this.sampleRate;
      const highDamp: number = Math.exp(decay * 2.5 * i);
      const lowEnv: number = Math.exp(decay * 0.9 * i);
      const noise: number = Math.random() * 2.0 - 1.0;
      const scatter: number = Math.sin(2.0 * Math.PI * 200.0 * t + Math.random() * Math.PI) * 0.2;
      ir[i] = (noise * lowEnv * 0.6 + scatter * highDamp) * 0.7;
    }
  }

  /** 归一化脉冲响应 */
  private normalize(ir: MonoBuffer): void {
    let maxVal: number = 0.0;
    for (let i: number = 0; i < ir.length; i++) {
      maxVal = Math.max(maxVal, Math.abs(ir[i]));
    }
    if (maxVal > 1e-10) {
      const scale: number = 1.0 / maxVal;
      for (let i: number = 0; i < ir.length; i++) {
        ir[i] *= scale;
      }
    }
  }
}

/** 时域卷积处理器（直接计算 + 重叠相加优化） */
export class ConvolutionProcessor {
  private impulseResponse: MonoBuffer;
  private sampleRate: number;
  private blockSize: number;
  private overlapBuffer: MonoBuffer;
  private inputBuffer: MonoBuffer;
  private bufferIndex: number;

  constructor(impulseResponse: MonoBuffer, sampleRate: number = DEFAULT_SAMPLE_RATE, blockSize: number = 512) {
    this.impulseResponse = impulseResponse;
    this.sampleRate = sampleRate;
    this.blockSize = blockSize;
    this.overlapBuffer = new Float32Array(impulseResponse.length + blockSize - 1);
    this.inputBuffer = new Float32Array(blockSize);
    this.bufferIndex = 0;
  }

  /** 重置状态 */
  public reset(): void {
    this.overlapBuffer.fill(0.0);
    this.inputBuffer.fill(0.0);
    this.bufferIndex = 0;
  }

  /** 处理单个样本（使用滑动缓冲区实现实时卷积） */
  public processSample(input: number): number {
    this.inputBuffer[this.bufferIndex] = input;
    this.bufferIndex++;

    if (this.bufferIndex >= this.blockSize) {
      this.processBlock();
      this.bufferIndex = 0;
    }

    // 返回当前重叠缓冲区中的对应样本
    const outputIndex: number = this.bufferIndex + this.overlapBuffer.length - this.blockSize;
    return this.overlapBuffer[outputIndex] || 0.0;
  }

  /** 处理整个输入块 */
  public processBlockInput(input: MonoBuffer, output: MonoBuffer): void {
    const inputLen: number = input.length;
    const irLen: number = this.impulseResponse.length;

    for (let n: number = 0; n < inputLen; n++) {
      let sum: number = 0.0;
      // 直接卷积计算
      const maxK: number = Math.min(n + 1, irLen);
      for (let k: number = 0; k < maxK; k++) {
        sum += input[n - k] * this.impulseResponse[k];
      }
      output[n] = sum;
    }
  }

  /** 重叠相加法处理 */
  private processBlock(): void {
    const irLen: number = this.impulseResponse.length;
    const tempOutput: MonoBuffer = new Float32Array(this.blockSize + irLen - 1);

    // 直接卷积
    for (let n: number = 0; n < tempOutput.length; n++) {
      let sum: number = 0.0;
      const startK: number = Math.max(0, n - (this.blockSize - 1));
      const endK: number = Math.min(irLen - 1, n);
      for (let k: number = startK; k <= endK; k++) {
        const inputIdx: number = n - k;
        if (inputIdx >= 0 && inputIdx < this.blockSize) {
          sum += this.inputBuffer[inputIdx] * this.impulseResponse[k];
        }
      }
      tempOutput[n] = sum;
    }

    // 重叠相加
    for (let i: number = 0; i < this.overlapBuffer.length; i++) {
      if (i < tempOutput.length) {
        this.overlapBuffer[i] = tempOutput[i];
      } else {
        this.overlapBuffer[i] = 0.0;
      }
    }
  }
}

/** 卷积混响效果器 */
export class ConvolutionReverb extends AudioEffectBase {
  public readonly name: string = 'ConvolutionReverb';
  private irGenerator: ImpulseResponseGenerator;
  private earlyReflections: ConvolutionProcessor | null = null;
  private lateReverb: ConvolutionProcessor | null = null;
  private preDelaySamples: number = 0;
  private preDelayBuffer: MonoBuffer;
  private preDelayIndex: number = 0;
  private config: ConvolutionReverbConfig;
  private earlyGain: number = 0.5;
  private lateGain: number = 0.5;

  constructor(config: Partial<ConvolutionReverbConfig> = {}, sampleRateArg?: number) {
    const sampleRate: number = sampleRateArg ?? config.sampleRate ?? DEFAULT_SAMPLE_RATE;
    super(sampleRate);
    this.config = {
      sampleRate,
      reverbType: config.reverbType || ReverbType.Room,
      preDelayMs: config.preDelayMs ?? 20.0,
      rt60: config.rt60 ?? 1.5,
      wetLevel: config.wetLevel ?? 0.3,
      dryLevel: config.dryLevel ?? 0.7,
      earlyReflectionsGain: config.earlyReflectionsGain ?? 0.4,
      lateReverbGain: config.lateReverbGain ?? 0.6,
    };

    this.irGenerator = new ImpulseResponseGenerator(sampleRate);
    this.preDelaySamples = Math.floor((this.config.preDelayMs / 1000.0) * sampleRate);
    this.preDelayBuffer = new Float32Array(this.preDelaySamples);
    this.earlyGain = this.config.earlyReflectionsGain;
    this.lateGain = this.config.lateReverbGain;
    this.wet = this.config.wetLevel;

    this.generateImpulseResponses();
  }

  /** 生成早期反射和晚期混响的脉冲响应 */
  private generateImpulseResponses(): void {
    const fullIR: MonoBuffer = this.irGenerator.generate(this.config.reverbType, this.config.rt60);

    // 分离早期反射（前 50ms）和晚期混响
    const earlyLen: number = Math.min(Math.floor(0.05 * this.sampleRate), fullIR.length);
    const earlyIR: MonoBuffer = fullIR.slice(0, earlyLen);
    const lateIR: MonoBuffer = fullIR.slice(earlyLen);

    this.earlyReflections = new ConvolutionProcessor(earlyIR, this.sampleRate, 256);
    this.lateReverb = new ConvolutionProcessor(lateIR, this.sampleRate, 512);
  }

  /** 设置混响时间 RT60 */
  public setRT60(rt60: number): void {
    this.config.rt60 = Math.max(0.1, rt60);
    this.generateImpulseResponses();
  }

  /** 设置预延迟（毫秒） */
  public setPreDelay(ms: number): void {
    this.config.preDelayMs = Math.max(0, ms);
    this.preDelaySamples = Math.floor((this.config.preDelayMs / 1000.0) * this.sampleRate);
    this.preDelayBuffer = new Float32Array(this.preDelaySamples);
    this.preDelayIndex = 0;
  }

  /** 设置混响类型 */
  public setReverbType(type: ReverbType): void {
    this.config.reverbType = type;
    this.generateImpulseResponses();
  }

  public processSample(input: number, _channel?: number): number {
    if (this.bypass) return input;

    // 预延迟
    const delayedInput: number = this.preDelayBuffer[this.preDelayIndex] || 0.0;
    this.preDelayBuffer[this.preDelayIndex] = input;
    this.preDelayIndex = (this.preDelayIndex + 1) % this.preDelaySamples;

    // 早期反射
    let earlySample: number = 0.0;
    if (this.earlyReflections) {
      earlySample = this.earlyReflections.processSample(delayedInput);
    }

    // 晚期混响
    let lateSample: number = 0.0;
    if (this.lateReverb) {
      lateSample = this.lateReverb.processSample(delayedInput);
    }

    const wetSignal: number = earlySample * this.earlyGain + lateSample * this.lateGain;
    return input * this.config.dryLevel + wetSignal * this.wet;
  }

  public reset(): void {
    this.preDelayBuffer.fill(0.0);
    this.preDelayIndex = 0;
    this.earlyReflections?.reset();
    this.lateReverb?.reset();
  }
}

// ============================================================================
// 二、FIR 均衡器（Parametric EQ）
// ============================================================================

/** 滤波器类型 */
export enum FilterType {
  Peak = 'peak',
  Notch = 'notch',
  LowPass = 'lowpass',
  HighPass = 'highpass',
  LowShelf = 'lowshelf',
  HighShelf = 'highshelf',
}

/** Biquad 滤波器系数 */
export interface BiquadCoefficients {
  a0: number;
  a1: number;
  a2: number;
  b1: number;
  b2: number;
}

/** Biquad 滤波器状态 */
interface BiquadState {
  x1: number;
  x2: number;
  y1: number;
  y2: number;
}

/** Biquad 滤波器（二阶 IIR，用于 EQ 各频段） */
export class BiquadFilter {
  private coeffs: BiquadCoefficients = { a0: 1, a1: 0, a2: 0, b1: 0, b2: 0 };
  private state: BiquadState = { x1: 0, x2: 0, y1: 0, y2: 0 };
  private sampleRate: number;

  constructor(sampleRate: number = DEFAULT_SAMPLE_RATE) {
    this.sampleRate = sampleRate;
  }

  /** 设计峰值滤波器 */
  public designPeak(frequency: number, q: number, gainDb: number): void {
    const w0: number = (2.0 * Math.PI * frequency) / this.sampleRate;
    const cosW0: number = Math.cos(w0);
    const sinW0: number = Math.sin(w0);
    const alpha: number = sinW0 / (2.0 * q);
    const A: number = Math.pow(10.0, gainDb / 40.0);

    const b0: number = 1.0 + alpha * A;
    const b1: number = -2.0 * cosW0;
    const b2: number = 1.0 - alpha * A;
    const a0: number = 1.0 + alpha / A;
    const a1: number = -2.0 * cosW0;
    const a2: number = 1.0 - alpha / A;

    this.normalizeCoeffs({ a0, a1, a2, b1: a1 / a0, b2: a2 / a0 });
    this.state = { x1: 0, x2: 0, y1: 0, y2: 0 };
  }

  /** 设计陷波滤波器 */
  public designNotch(frequency: number, q: number): void {
    const w0: number = (2.0 * Math.PI * frequency) / this.sampleRate;
    const cosW0: number = Math.cos(w0);
    const sinW0: number = Math.sin(w0);
    const alpha: number = sinW0 / (2.0 * q);

    const b0: number = 1.0;
    const b1: number = -2.0 * cosW0;
    const b2: number = 1.0;
    const a0: number = 1.0 + alpha;
    const a1: number = -2.0 * cosW0;
    const a2: number = 1.0 - alpha;

    this.normalizeCoeffs({ a0, a1, a2, b1: a1 / a0, b2: a2 / a0 });
    this.state = { x1: 0, x2: 0, y1: 0, y2: 0 };
  }

  /** 设计低通滤波器（Butterworth） */
  public designLowPass(frequency: number, order: 6 | 12 | 24 = 12): void {
    // 使用二阶节级联，这里先实现单二阶节（12dB/oct）
    const w0: number = (2.0 * Math.PI * frequency) / this.sampleRate;
    const cosW0: number = Math.cos(w0);
    const sinW0: number = Math.sin(w0);
    // Butterworth Q = 1/sqrt(2) ~ 0.707
    const q: number = order === 6 ? 0.5176 : order === 24 ? 1.3066 : 0.7071;
    const alpha: number = sinW0 / (2.0 * q);

    const b0: number = (1.0 - cosW0) / 2.0;
    const b1: number = 1.0 - cosW0;
    const b2: number = (1.0 - cosW0) / 2.0;
    const a0: number = 1.0 + alpha;
    const a1: number = -2.0 * cosW0;
    const a2: number = 1.0 - alpha;

    this.normalizeCoeffs({ a0, a1, a2, b1: a1 / a0, b2: a2 / a0 });
    // 存储归一化后的前馈系数
    this.coeffs.a0 = b0 / a0;
    this.coeffs.a1 = b1 / a0;
    this.coeffs.a2 = b2 / a0;
    this.state = { x1: 0, x2: 0, y1: 0, y2: 0 };
  }

  /** 设计高通滤波器（Butterworth） */
  public designHighPass(frequency: number, order: 6 | 12 | 24 = 12): void {
    const w0: number = (2.0 * Math.PI * frequency) / this.sampleRate;
    const cosW0: number = Math.cos(w0);
    const sinW0: number = Math.sin(w0);
    const q: number = order === 6 ? 0.5176 : order === 24 ? 1.3066 : 0.7071;
    const alpha: number = sinW0 / (2.0 * q);

    const b0: number = (1.0 + cosW0) / 2.0;
    const b1: number = -(1.0 + cosW0);
    const b2: number = (1.0 + cosW0) / 2.0;
    const a0: number = 1.0 + alpha;
    const a1: number = -2.0 * cosW0;
    const a2: number = 1.0 - alpha;

    this.normalizeCoeffs({ a0, a1, a2, b1: a1 / a0, b2: a2 / a0 });
    this.coeffs.a0 = b0 / a0;
    this.coeffs.a1 = b1 / a0;
    this.coeffs.a2 = b2 / a0;
    this.state = { x1: 0, x2: 0, y1: 0, y2: 0 };
  }

  /** 设计低架滤波器 */
  public designLowShelf(frequency: number, gainDb: number, q: number = 0.707): void {
    const w0: number = (2.0 * Math.PI * frequency) / this.sampleRate;
    const cosW0: number = Math.cos(w0);
    const sinW0: number = Math.sin(w0);
    const A: number = Math.pow(10.0, gainDb / 40.0);
    const alpha: number = (sinW0 / 2.0) * Math.sqrt((A + 1.0 / A) * (1.0 / q - 1.0) + 2.0);

    const sqrtA2Alpha: number = 2.0 * Math.sqrt(A) * alpha;
    const b0: number = A * ((A + 1.0) - (A - 1.0) * cosW0 + sqrtA2Alpha);
    const b1: number = 2.0 * A * ((A - 1.0) - (A + 1.0) * cosW0);
    const b2: number = A * ((A + 1.0) - (A - 1.0) * cosW0 - sqrtA2Alpha);
    const a0: number = (A + 1.0) + (A - 1.0) * cosW0 + sqrtA2Alpha;
    const a1: number = -2.0 * ((A - 1.0) + (A + 1.0) * cosW0);
    const a2: number = (A + 1.0) + (A - 1.0) * cosW0 - sqrtA2Alpha;

    this.normalizeCoeffs({ a0, a1, a2, b1: a1 / a0, b2: a2 / a0 });
    this.coeffs.a0 = b0 / a0;
    this.coeffs.a1 = b1 / a0;
    this.coeffs.a2 = b2 / a0;
    this.state = { x1: 0, x2: 0, y1: 0, y2: 0 };
  }

  /** 设计高架滤波器 */
  public designHighShelf(frequency: number, gainDb: number, q: number = 0.707): void {
    const w0: number = (2.0 * Math.PI * frequency) / this.sampleRate;
    const cosW0: number = Math.cos(w0);
    const sinW0: number = Math.sin(w0);
    const A: number = Math.pow(10.0, gainDb / 40.0);
    const alpha: number = (sinW0 / 2.0) * Math.sqrt((A + 1.0 / A) * (1.0 / q - 1.0) + 2.0);

    const sqrtA2Alpha: number = 2.0 * Math.sqrt(A) * alpha;
    const b0: number = A * ((A + 1.0) + (A - 1.0) * cosW0 + sqrtA2Alpha);
    const b1: number = -2.0 * A * ((A - 1.0) + (A + 1.0) * cosW0);
    const b2: number = A * ((A + 1.0) + (A - 1.0) * cosW0 - sqrtA2Alpha);
    const a0: number = (A + 1.0) - (A - 1.0) * cosW0 + sqrtA2Alpha;
    const a1: number = 2.0 * ((A - 1.0) - (A + 1.0) * cosW0);
    const a2: number = (A + 1.0) - (A - 1.0) * cosW0 - sqrtA2Alpha;

    this.normalizeCoeffs({ a0, a1, a2, b1: a1 / a0, b2: a2 / a0 });
    this.coeffs.a0 = b0 / a0;
    this.coeffs.a1 = b1 / a0;
    this.coeffs.a2 = b2 / a0;
    this.state = { x1: 0, x2: 0, y1: 0, y2: 0 };
  }

  private normalizeCoeffs(coeffs: BiquadCoefficients): void {
    this.coeffs = { ...coeffs };
  }

  /** 处理单个样本 */
  public process(input: number): number {
    const y: number =
      this.coeffs.a0 * input +
      this.coeffs.a1 * this.state.x1 +
      this.coeffs.a2 * this.state.x2 -
      this.coeffs.b1 * this.state.y1 -
      this.coeffs.b2 * this.state.y2;

    this.state.x2 = this.state.x1;
    this.state.x1 = input;
    this.state.y2 = this.state.y1;
    this.state.y1 = y;

    return y;
  }

  public reset(): void {
    this.state = { x1: 0, x2: 0, y1: 0, y2: 0 };
  }
}

/** EQ 频段配置 */
export interface EQBand {
  frequency: number;
  gainDb: number;
  q: number;
  type: FilterType;
  enabled: boolean;
}

/** EQ 预设类型 */
export enum EQPreset {
  Pop = 'pop',
  Rock = 'rock',
  Jazz = 'jazz',
  Classical = 'classical',
  Electronic = 'electronic',
  VocalBoost = 'vocalBoost',
  BassBoost = 'bassBoost',
  Flat = 'flat',
}

/** 参数均衡器 */
export class ParametricEQ extends AudioEffectBase {
  public readonly name: string = 'ParametricEQ';
  private bands: BiquadFilter[] = [];
  private bandConfigs: EQBand[] = [];
  private numBands: number;

  constructor(numBands: number = 5, sampleRate: number = DEFAULT_SAMPLE_RATE) {
    super(sampleRate);
    this.numBands = numBands;
    for (let i: number = 0; i < numBands; i++) {
      this.bands.push(new BiquadFilter(sampleRate));
      this.bandConfigs.push({
        frequency: 1000.0,
        gainDb: 0.0,
        q: 1.0,
        type: FilterType.Peak,
        enabled: true,
      });
    }
    this.applyDefaultFrequencies();
  }

  /** 应用默认频率分布 */
  private applyDefaultFrequencies(): void {
    if (this.numBands === 3) {
      this.setBand(0, { frequency: 250, type: FilterType.LowShelf });
      this.setBand(1, { frequency: 1000, type: FilterType.Peak });
      this.setBand(2, { frequency: 4000, type: FilterType.HighShelf });
    } else if (this.numBands === 5) {
      this.setBand(0, { frequency: 100, type: FilterType.LowShelf });
      this.setBand(1, { frequency: 300, type: FilterType.Peak });
      this.setBand(2, { frequency: 1000, type: FilterType.Peak });
      this.setBand(3, { frequency: 3000, type: FilterType.Peak });
      this.setBand(4, { frequency: 8000, type: FilterType.HighShelf });
    } else if (this.numBands === 8) {
      const freqs: number[] = [60, 170, 310, 600, 1000, 3000, 6000, 12000];
      freqs.forEach((f, i) => this.setBand(i, { frequency: f, type: FilterType.Peak }));
    } else if (this.numBands === 10) {
      const freqs: number[] = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
      freqs.forEach((f, i) => this.setBand(i, { frequency: f, type: FilterType.Peak }));
    }
  }

  /** 设置单个频段 */
  public setBand(index: number, config: Partial<EQBand>): void {
    if (index < 0 || index >= this.numBands) return;
    const band: EQBand = this.bandConfigs[index];
    if (config.frequency !== undefined) band.frequency = config.frequency;
    if (config.gainDb !== undefined) band.gainDb = config.gainDb;
    if (config.q !== undefined) band.q = config.q;
    if (config.type !== undefined) band.type = config.type;
    if (config.enabled !== undefined) band.enabled = config.enabled;
    this.updateFilter(index);
  }

  /** 更新滤波器系数 */
  private updateFilter(index: number): void {
    const band: EQBand = this.bandConfigs[index];
    const filter: BiquadFilter = this.bands[index];

    switch (band.type) {
      case FilterType.Peak:
        filter.designPeak(band.frequency, band.q, band.gainDb);
        break;
      case FilterType.Notch:
        filter.designNotch(band.frequency, band.q);
        break;
      case FilterType.LowPass:
        filter.designLowPass(band.frequency);
        break;
      case FilterType.HighPass:
        filter.designHighPass(band.frequency);
        break;
      case FilterType.LowShelf:
        filter.designLowShelf(band.frequency, band.gainDb, band.q);
        break;
      case FilterType.HighShelf:
        filter.designHighShelf(band.frequency, band.gainDb, band.q);
        break;
    }
  }

  /** 加载预设 */
  public loadPreset(preset: EQPreset): void {
    switch (preset) {
      case EQPreset.Pop:
        this.loadPopPreset();
        break;
      case EQPreset.Rock:
        this.loadRockPreset();
        break;
      case EQPreset.Jazz:
        this.loadJazzPreset();
        break;
      case EQPreset.Classical:
        this.loadClassicalPreset();
        break;
      case EQPreset.Electronic:
        this.loadElectronicPreset();
        break;
      case EQPreset.VocalBoost:
        this.loadVocalBoostPreset();
        break;
      case EQPreset.BassBoost:
        this.loadBassBoostPreset();
        break;
      case EQPreset.Flat:
        this.loadFlatPreset();
        break;
    }
  }

  private loadPopPreset(): void {
    if (this.numBands >= 5) {
      this.setBand(0, { gainDb: 2.0 });
      this.setBand(1, { gainDb: 1.0 });
      this.setBand(2, { gainDb: 3.0 });
      this.setBand(3, { gainDb: 2.0 });
      this.setBand(4, { gainDb: 1.5 });
    }
  }

  private loadRockPreset(): void {
    if (this.numBands >= 5) {
      this.setBand(0, { gainDb: 4.0 });
      this.setBand(1, { gainDb: 2.0 });
      this.setBand(2, { gainDb: -1.0 });
      this.setBand(3, { gainDb: 2.0 });
      this.setBand(4, { gainDb: 3.0 });
    }
  }

  private loadJazzPreset(): void {
    if (this.numBands >= 5) {
      this.setBand(0, { gainDb: 1.0 });
      this.setBand(1, { gainDb: 2.0 });
      this.setBand(2, { gainDb: 1.0 });
      this.setBand(3, { gainDb: 3.0 });
      this.setBand(4, { gainDb: 2.0 });
    }
  }

  private loadClassicalPreset(): void {
    if (this.numBands >= 5) {
      this.setBand(0, { gainDb: 0.0 });
      this.setBand(1, { gainDb: 0.0 });
      this.setBand(2, { gainDb: 0.0 });
      this.setBand(3, { gainDb: 1.0 });
      this.setBand(4, { gainDb: 2.0 });
    }
  }

  private loadElectronicPreset(): void {
    if (this.numBands >= 5) {
      this.setBand(0, { gainDb: 5.0 });
      this.setBand(1, { gainDb: 1.0 });
      this.setBand(2, { gainDb: -1.0 });
      this.setBand(3, { gainDb: 2.0 });
      this.setBand(4, { gainDb: 4.0 });
    }
  }

  private loadVocalBoostPreset(): void {
    if (this.numBands >= 5) {
      this.setBand(0, { gainDb: -1.0 });
      this.setBand(1, { gainDb: 2.0 });
      this.setBand(2, { gainDb: 4.0 });
      this.setBand(3, { gainDb: 2.0 });
      this.setBand(4, { gainDb: 1.0 });
    }
  }

  private loadBassBoostPreset(): void {
    if (this.numBands >= 5) {
      this.setBand(0, { gainDb: 6.0 });
      this.setBand(1, { gainDb: 3.0 });
      this.setBand(2, { gainDb: 0.0 });
      this.setBand(3, { gainDb: -1.0 });
      this.setBand(4, { gainDb: 0.0 });
    }
  }

  private loadFlatPreset(): void {
    for (let i: number = 0; i < this.numBands; i++) {
      this.setBand(i, { gainDb: 0.0 });
    }
  }

  public processSample(input: number, _channel?: number): number {
    if (this.bypass) return input;
    let output: number = input;
    for (let i: number = 0; i < this.numBands; i++) {
      if (this.bandConfigs[i].enabled) {
        output = this.bands[i].process(output);
      }
    }
    return output;
  }

  public reset(): void {
    for (const filter of this.bands) {
      filter.reset();
    }
  }
}

/** 31段图形均衡器（1/3倍频程） */
export class GraphicEQ extends AudioEffectBase {
  public readonly name: string = 'GraphicEQ';
  private bands: BiquadFilter[] = [];
  private gainsDb: number[] = new Array(31).fill(0.0);
  private readonly frequencies: number[] = [
    20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160,
    200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600,
    2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000, 20000,
  ];

  constructor(sampleRate: number = DEFAULT_SAMPLE_RATE) {
    super(sampleRate);
    for (let i: number = 0; i < 31; i++) {
      const filter: BiquadFilter = new BiquadFilter(sampleRate);
      filter.designPeak(this.frequencies[i], 4.318, 0.0); // 1/3倍频程 Q 值
      this.bands.push(filter);
    }
  }

  /** 设置频段增益（-12dB ~ +12dB） */
  public setBandGain(bandIndex: number, gainDb: number): void {
    if (bandIndex < 0 || bandIndex >= 31) return;
    this.gainsDb[bandIndex] = this.clamp(gainDb, -12.0, 12.0);
    this.bands[bandIndex].designPeak(this.frequencies[bandIndex], 4.318, this.gainsDb[bandIndex]);
  }

  /** 获取频段增益 */
  public getBandGain(bandIndex: number): number {
    return this.gainsDb[bandIndex] || 0.0;
  }

  public processSample(input: number, _channel?: number): number {
    if (this.bypass) return input;
    let output: number = input;
    for (let i: number = 0; i < 31; i++) {
      output = this.bands[i].process(output);
    }
    return output;
  }

  public reset(): void {
    for (const filter of this.bands) {
      filter.reset();
    }
  }
}

// ============================================================================
// 三、动态处理
// ============================================================================

/** 检测器类型 */
export enum DetectorType {
  RMS = 'rms',
  Peak = 'peak',
}

/** 压缩器配置 */
export interface CompressorConfig {
  thresholdDb: number;
  ratio: number;
  attackMs: number;
  releaseMs: number;
  kneeDb: number;
  makeupGainDb: number;
  detectorType: DetectorType;
}

/** 动态处理器基类 */
export abstract class DynamicsProcessor extends AudioEffectBase {
  protected thresholdDb: number;
  protected ratio: number;
  protected attackMs: number;
  protected releaseMs: number;
  protected kneeDb: number;
  protected makeupGainDb: number;
  protected detectorType: DetectorType;
  protected envelope: number = 0.0;
  protected attackCoeff: number;
  protected releaseCoeff: number;
  protected sampleRate: number;

  constructor(config: Partial<CompressorConfig> = {}, sampleRate: number = DEFAULT_SAMPLE_RATE) {
    super(sampleRate);
    this.sampleRate = sampleRate;
    this.thresholdDb = config.thresholdDb ?? -20.0;
    this.ratio = config.ratio ?? 4.0;
    this.attackMs = config.attackMs ?? 10.0;
    this.releaseMs = config.releaseMs ?? 100.0;
    this.kneeDb = config.kneeDb ?? 3.0;
    this.makeupGainDb = config.makeupGainDb ?? 0.0;
    this.detectorType = config.detectorType || DetectorType.RMS;
    this.attackCoeff = this.calculateCoeff(this.attackMs);
    this.releaseCoeff = this.calculateCoeff(this.releaseMs);
  }

  protected calculateCoeff(timeMs: number): number {
    return Math.exp(-1.0 / ((timeMs / 1000.0) * this.sampleRate));
  }

  protected detect(input: number): number {
    if (this.detectorType === DetectorType.RMS) {
      return input * input; // 平方检测
    } else {
      return Math.abs(input); // 峰值检测
    }
  }

  protected updateEnvelope(detected: number): void {
    if (detected > this.envelope) {
      this.envelope = this.attackCoeff * this.envelope + (1.0 - this.attackCoeff) * detected;
    } else {
      this.envelope = this.releaseCoeff * this.envelope + (1.0 - this.releaseCoeff) * detected;
    }
  }

  protected dbToLinear(db: number): number {
    return Math.pow(10.0, db / 20.0);
  }

  protected linearToDb(linear: number): number {
    return 20.0 * Math.log10(Math.max(linear, 1e-10));
  }

  public abstract processSample(input: number, channel?: number): number;

  public reset(): void {
    this.envelope = 0.0;
  }
}

/** 压缩器 */
export class Compressor extends DynamicsProcessor {
  public readonly name: string = 'Compressor';

  constructor(config: Partial<CompressorConfig> = {}, sampleRate: number = DEFAULT_SAMPLE_RATE) {
    super(config, sampleRate);
  }

  /** 批量设置参数 */
  public setParameters(config: Partial<CompressorConfig>): void {
    if (config.thresholdDb !== undefined) this.thresholdDb = config.thresholdDb;
    if (config.ratio !== undefined) this.ratio = config.ratio;
    if (config.attackMs !== undefined) {
      this.attackMs = config.attackMs;
      this.attackCoeff = this.calculateCoeff(config.attackMs);
    }
    if (config.releaseMs !== undefined) {
      this.releaseMs = config.releaseMs;
      this.releaseCoeff = this.calculateCoeff(config.releaseMs);
    }
    if (config.makeupGainDb !== undefined) this.makeupGainDb = config.makeupGainDb;
    if (config.kneeDb !== undefined) this.kneeDb = config.kneeDb;
    if (config.detectorType !== undefined) this.detectorType = config.detectorType;
  }

  public processSample(input: number, _channel?: number): number {
    if (this.bypass) return input;

    const detected: number = this.detect(input);
    this.updateEnvelope(detected);

    let envelopeDb: number;
    if (this.detectorType === DetectorType.RMS) {
      envelopeDb = this.linearToDb(Math.sqrt(this.envelope));
    } else {
      envelopeDb = this.linearToDb(this.envelope);
    }

    // 增益计算（带膝部处理）
    let gainDb: number = 0.0;
    const diff: number = envelopeDb - this.thresholdDb;

    if (diff < -this.kneeDb / 2.0) {
      gainDb = 0.0;
    } else if (diff > this.kneeDb / 2.0) {
      gainDb = (this.thresholdDb - envelopeDb) * (1.0 - 1.0 / this.ratio);
    } else {
      // 膝部区域：平滑过渡
      const kneeRatio: number = (diff + this.kneeDb / 2.0) / this.kneeDb;
      gainDb = (this.thresholdDb - envelopeDb) * (1.0 - 1.0 / this.ratio) * kneeRatio * kneeRatio / 2.0;
    }

    const gain: number = this.dbToLinear(gainDb + this.makeupGainDb);
    return input * gain;
  }
}

/** 限制器（带前瞻的砖墙限制） */
export class Limiter extends DynamicsProcessor {
  public readonly name: string = 'Limiter';
  private lookaheadBuffer: MonoBuffer;
  private lookaheadSamples: number;
  private lookaheadIndex: number;

  constructor(
    config: Partial<CompressorConfig> & { lookaheadMs?: number } = {},
    sampleRate: number = DEFAULT_SAMPLE_RATE
  ) {
    super(
      {
        thresholdDb: config.thresholdDb ?? -1.0,
        ratio: config.ratio ?? 100.0,
        attackMs: config.attackMs ?? 1.0,
        releaseMs: config.releaseMs ?? 50.0,
        kneeDb: 0.0,
        makeupGainDb: 0.0,
        detectorType: DetectorType.Peak,
      },
      sampleRate
    );
    this.lookaheadMs = config.lookaheadMs ?? 5.0;
    this.lookaheadSamples = Math.floor((this.lookaheadMs / 1000.0) * sampleRate);
    this.lookaheadBuffer = new Float32Array(this.lookaheadSamples);
    this.lookaheadIndex = 0;
  }

  private lookaheadMs: number;

  public processSample(input: number, _channel?: number): number {
    if (this.bypass) return input;

    // 存储样本到前瞻缓冲区
    this.lookaheadBuffer[this.lookaheadIndex] = input;
    this.lookaheadIndex = (this.lookaheadIndex + 1) % this.lookaheadSamples;

    const detected: number = this.detect(input);
    this.updateEnvelope(detected);

    const envelopeDb: number = this.linearToDb(this.envelope);
    let gainDb: number = 0.0;

    if (envelopeDb > this.thresholdDb) {
      gainDb = this.thresholdDb - envelopeDb;
    }

    const gain: number = this.dbToLinear(gainDb);
    return input * gain;
  }

  public reset(): void {
    super.reset();
    this.lookaheadBuffer.fill(0.0);
    this.lookaheadIndex = 0;
  }
}

/** 扩展器/噪声门 */
export class ExpanderGate extends DynamicsProcessor {
  public readonly name: string = 'ExpanderGate';
  private floorDb: number;
  private isGate: boolean;

  constructor(
    config: Partial<CompressorConfig> & { floorDb?: number; isGate?: boolean } = {},
    sampleRate: number = DEFAULT_SAMPLE_RATE
  ) {
    super(
      {
        thresholdDb: config.thresholdDb ?? -40.0,
        ratio: config.ratio ?? 2.0,
        attackMs: config.attackMs ?? 5.0,
        releaseMs: config.releaseMs ?? 50.0,
        kneeDb: 0.0,
        makeupGainDb: 0.0,
        detectorType: DetectorType.RMS,
      },
      sampleRate
    );
    this.floorDb = config.floorDb ?? -80.0;
    this.isGate = config.isGate ?? false;
  }

  public processSample(input: number, _channel?: number): number {
    if (this.bypass) return input;

    const detected: number = this.detect(input);
    this.updateEnvelope(detected);

    let envelopeDb: number;
    if (this.detectorType === DetectorType.RMS) {
      envelopeDb = this.linearToDb(Math.sqrt(this.envelope));
    } else {
      envelopeDb = this.linearToDb(this.envelope);
    }

    let gainDb: number = 0.0;
    const diff: number = envelopeDb - this.thresholdDb;

    if (this.isGate) {
      // 噪声门：低于阈值时衰减到地板
      if (envelopeDb < this.thresholdDb) {
        gainDb = this.floorDb;
      } else {
        gainDb = 0.0;
      }
    } else {
      // 扩展器：低于阈值时按扩展比衰减
      if (envelopeDb < this.thresholdDb) {
        gainDb = diff * (this.ratio - 1.0);
      }
    }

    const gain: number = this.dbToLinear(gainDb);
    return input * gain;
  }
}

/** 多段压缩器频段 */
export interface MultibandBand {
  lowFreq: number;
  highFreq: number;
  compressor: Compressor;
}

/** 多段压缩器 */
export class MultibandCompressor extends AudioEffectBase {
  public readonly name: string = 'MultibandCompressor';
  private bands: MultibandBand[] = [];
  private lowpassFilters: BiquadFilter[] = [];
  private highpassFilters: BiquadFilter[] = [];
  private numBands: number;
  private crossoverFilters: BiquadFilter[][] = [];

  constructor(
    numBands: number = 3,
    crossoverFreqs: number[] = [200, 2000],
    sampleRate: number = DEFAULT_SAMPLE_RATE
  ) {
    super(sampleRate);
    this.numBands = numBands;

    // 创建Linkwitz-Riley分频器（每段需要低通和高通）
    for (let i: number = 0; i < numBands - 1; i++) {
      const lp: BiquadFilter = new BiquadFilter(sampleRate);
      const hp: BiquadFilter = new BiquadFilter(sampleRate);
      // 使用二阶Butterworth级联实现24dB/oct Linkwitz-Riley
      lp.designLowPass(crossoverFreqs[i], 24);
      hp.designHighPass(crossoverFreqs[i], 24);
      this.crossoverFilters.push([lp, hp]);
    }

    // 为每段创建压缩器
    const freqs: number[] = [0, ...crossoverFreqs, sampleRate / 2];
    for (let i: number = 0; i < numBands; i++) {
      this.bands.push({
        lowFreq: freqs[i],
        highFreq: freqs[i + 1],
        compressor: new Compressor({}, sampleRate),
      });
    }
  }

  /** 设置频段压缩器参数 */
  public setBandCompressor(bandIndex: number, config: Partial<CompressorConfig>): void {
    if (bandIndex < 0 || bandIndex >= this.numBands) return;
    const band: MultibandBand = this.bands[bandIndex];
    band.compressor.setParameters(config);
  }

  public processSample(input: number, _channel?: number): number {
    if (this.bypass) return input;

    // 分频处理
    const bandSignals: number[] = new Array(this.numBands).fill(0.0);

    if (this.numBands === 2) {
      const lp: BiquadFilter = this.crossoverFilters[0][0];
      const hp: BiquadFilter = this.crossoverFilters[0][1];
      bandSignals[0] = lp.process(input);
      bandSignals[1] = hp.process(input);
    } else if (this.numBands === 3) {
      // 三分频：低、中、高
      const lp1: BiquadFilter = this.crossoverFilters[0][0];
      const hp1: BiquadFilter = this.crossoverFilters[0][1];
      const lp2: BiquadFilter = this.crossoverFilters[1][0];
      const hp2: BiquadFilter = this.crossoverFilters[1][1];

      const low: number = lp1.process(input);
      const midHigh: number = hp1.process(input);
      bandSignals[0] = low;
      bandSignals[1] = lp2.process(midHigh);
      bandSignals[2] = hp2.process(midHigh);
    } else if (this.numBands === 4) {
      const lp1: BiquadFilter = this.crossoverFilters[0][0];
      const hp1: BiquadFilter = this.crossoverFilters[0][1];
      const lp2: BiquadFilter = this.crossoverFilters[1][0];
      const hp2: BiquadFilter = this.crossoverFilters[1][1];
      const lp3: BiquadFilter = this.crossoverFilters[2][0];
      const hp3: BiquadFilter = this.crossoverFilters[2][1];

      const low: number = lp1.process(input);
      const rest1: number = hp1.process(input);
      const midLow: number = lp2.process(rest1);
      const rest2: number = hp2.process(rest1);
      bandSignals[0] = low;
      bandSignals[1] = midLow;
      bandSignals[2] = lp3.process(rest2);
      bandSignals[3] = hp3.process(rest2);
    }

    // 各段独立压缩后混合
    let output: number = 0.0;
    for (let i: number = 0; i < this.numBands; i++) {
      output += this.bands[i].compressor.processSample(bandSignals[i]);
    }

    return output;
  }

  public reset(): void {
    for (const filterPair of this.crossoverFilters) {
      for (const filter of filterPair) {
        filter.reset();
      }
    }
    for (const band of this.bands) {
      band.compressor.reset();
    }
  }
}

/** 动态 EQ 配置 */
export interface DynamicEQConfig {
  lowFreq: number;
  midFreq: number;
  highFreq: number;
  lowThreshold: number;
  midThreshold: number;
  highThreshold: number;
  lowGain: number;
  midGain: number;
  highGain: number;
  attackMs: number;
  releaseMs: number;
}

/** 动态 EQ：三频段阈值检测 + 动态增益调节 */
export class DynamicEQ extends AudioEffectBase {
  public readonly name: string = 'DynamicEQ';
  private lowPass: BiquadFilter;
  private midHighPass: BiquadFilter;
  private midLowPass: BiquadFilter;
  private highPass: BiquadFilter;
  private lowThreshold: number;
  private midThreshold: number;
  private highThreshold: number;
  private lowGainDb: number;
  private midGainDb: number;
  private highGainDb: number;
  private midFreq: number;
  private attackCoeff: number;
  private releaseCoeff: number;
  private lowEnvelope: number = 0.0;
  private midEnvelope: number = 0.0;
  private highEnvelope: number = 0.0;
  private currentLowGainDb: number = 0.0;
  private currentMidGainDb: number = 0.0;
  private currentHighGainDb: number = 0.0;

  constructor(config: Partial<DynamicEQConfig> = {}, sampleRate: number = DEFAULT_SAMPLE_RATE) {
    super(sampleRate);
    const lowFreq: number = config.lowFreq ?? 250.0;
    const highFreq: number = config.highFreq ?? 4000.0;
    this.midFreq = config.midFreq ?? 1000.0;

    this.lowThreshold = config.lowThreshold ?? -20.0;
    this.midThreshold = config.midThreshold ?? -20.0;
    this.highThreshold = config.highThreshold ?? -20.0;
    this.lowGainDb = config.lowGain ?? -3.0;
    this.midGainDb = config.midGain ?? -3.0;
    this.highGainDb = config.highGain ?? -3.0;

    const attackMs: number = config.attackMs ?? 10.0;
    const releaseMs: number = config.releaseMs ?? 100.0;
    this.attackCoeff = Math.exp(-1.0 / ((attackMs / 1000.0) * sampleRate));
    this.releaseCoeff = Math.exp(-1.0 / ((releaseMs / 1000.0) * sampleRate));

    this.lowPass = new BiquadFilter(sampleRate);
    this.lowPass.designLowPass(lowFreq, 12);

    this.midHighPass = new BiquadFilter(sampleRate);
    this.midHighPass.designHighPass(lowFreq, 12);

    this.midLowPass = new BiquadFilter(sampleRate);
    this.midLowPass.designLowPass(highFreq, 12);

    this.highPass = new BiquadFilter(sampleRate);
    this.highPass.designHighPass(highFreq, 12);
  }

  public processSample(input: number, _channel?: number): number {
    if (this.bypass) return input;

    const lowSignal: number = this.lowPass.process(input);
    const midSignal: number = this.midLowPass.process(this.midHighPass.process(input));
    const highSignal: number = this.highPass.process(input);

    this.lowEnvelope = this.updateEnvelope(this.lowEnvelope, Math.abs(lowSignal));
    const lowEnvDb: number = this.gainToDb(this.lowEnvelope);
    const lowTarget: number = lowEnvDb > this.lowThreshold ? this.lowGainDb : 0.0;
    this.currentLowGainDb = this.smoothGain(this.currentLowGainDb, lowTarget);

    this.midEnvelope = this.updateEnvelope(this.midEnvelope, Math.abs(midSignal));
    const midEnvDb: number = this.gainToDb(this.midEnvelope);
    const midTarget: number = midEnvDb > this.midThreshold ? this.midGainDb : 0.0;
    this.currentMidGainDb = this.smoothGain(this.currentMidGainDb, midTarget);

    this.highEnvelope = this.updateEnvelope(this.highEnvelope, Math.abs(highSignal));
    const highEnvDb: number = this.gainToDb(this.highEnvelope);
    const highTarget: number = highEnvDb > this.highThreshold ? this.highGainDb : 0.0;
    this.currentHighGainDb = this.smoothGain(this.currentHighGainDb, highTarget);

    const lowOut: number = lowSignal * this.dbToGain(this.currentLowGainDb);
    const midOut: number = midSignal * this.dbToGain(this.currentMidGainDb);
    const highOut: number = highSignal * this.dbToGain(this.currentHighGainDb);

    return lowOut + midOut + highOut;
  }

  private updateEnvelope(envelope: number, detected: number): number {
    if (detected > envelope) {
      return this.attackCoeff * envelope + (1.0 - this.attackCoeff) * detected;
    } else {
      return this.releaseCoeff * envelope + (1.0 - this.releaseCoeff) * detected;
    }
  }

  private smoothGain(current: number, target: number): number {
    if (target > current) {
      return this.attackCoeff * current + (1.0 - this.attackCoeff) * target;
    } else {
      return this.releaseCoeff * current + (1.0 - this.releaseCoeff) * target;
    }
  }

  public processBlock(input: MonoBuffer, output: MonoBuffer): void {
    const len: number = input.length;
    if (this.bypass) {
      for (let i: number = 0; i < len; i++) {
        output[i] = input[i];
      }
      return;
    }
    const dryGain: number = 1.0 - this.wet;
    for (let i: number = 0; i < len; i++) {
      const wetSample: number = this.processSample(input[i]);
      output[i] = input[i] * dryGain + wetSample * this.wet;
    }
  }

  public reset(): void {
    this.lowPass.reset();
    this.midHighPass.reset();
    this.midLowPass.reset();
    this.highPass.reset();
    this.lowEnvelope = 0.0;
    this.midEnvelope = 0.0;
    this.highEnvelope = 0.0;
    this.currentLowGainDb = 0.0;
    this.currentMidGainDb = 0.0;
    this.currentHighGainDb = 0.0;
  }
}

/** 侧链压缩器配置 */
export interface SidechainCompressorConfig {
  threshold: number;
  ratio: number;
  attackMs: number;
  releaseMs: number;
  makeupGain: number;
  sidechain?: MonoBuffer;
}

/** 侧链压缩器：支持外部侧链输入，无侧链时对主信号自身压缩 */
export class SidechainCompressor extends AudioEffectBase {
  public readonly name: string = 'SidechainCompressor';
  private thresholdDb: number;
  private ratio: number;
  private attackMs: number;
  private releaseMs: number;
  private makeupGainDb: number;
  private attackCoeff: number;
  private releaseCoeff: number;
  private envelope: number = 0.0;
  private sidechainBuffer: MonoBuffer | null = null;
  private sidechainIndex: number = 0;
  private hasSidechainSample: boolean = false;
  private sidechainSample: number = 0.0;

  constructor(config: Partial<SidechainCompressorConfig> = {}, sampleRate: number = DEFAULT_SAMPLE_RATE) {
    super(sampleRate);
    this.thresholdDb = config.threshold ?? -20.0;
    this.ratio = config.ratio ?? 4.0;
    this.attackMs = config.attackMs ?? 10.0;
    this.releaseMs = config.releaseMs ?? 100.0;
    this.makeupGainDb = config.makeupGain ?? 0.0;
    this.attackCoeff = Math.exp(-1.0 / ((this.attackMs / 1000.0) * sampleRate));
    this.releaseCoeff = Math.exp(-1.0 / ((this.releaseMs / 1000.0) * sampleRate));
    if (config.sidechain) {
      this.sidechainBuffer = config.sidechain;
    }
  }

  /** 设置侧链块缓冲区（用于 processBlock） */
  public setSidechainBlock(block: MonoBuffer | null): void {
    this.sidechainBuffer = block;
    this.sidechainIndex = 0;
  }

  /** 设置单样本侧链输入（用于 processSample） */
  public setSidechainInput(sample: number): void {
    this.sidechainSample = sample;
    this.hasSidechainSample = true;
  }

  private updateEnvelope(detected: number): void {
    if (detected > this.envelope) {
      this.envelope = this.attackCoeff * this.envelope + (1.0 - this.attackCoeff) * detected;
    } else {
      this.envelope = this.releaseCoeff * this.envelope + (1.0 - this.releaseCoeff) * detected;
    }
  }

  private compressSample(input: number, detectedInput: number): number {
    const detected: number = detectedInput * detectedInput;
    this.updateEnvelope(detected);
    const envelopeDb: number = this.gainToDb(Math.sqrt(this.envelope));
    let gainDb: number = 0.0;
    const diff: number = envelopeDb - this.thresholdDb;
    if (diff > 0) {
      gainDb = -diff * (1.0 - 1.0 / this.ratio);
    }
    return input * this.dbToGain(gainDb + this.makeupGainDb);
  }

  public processSample(input: number, _channel?: number): number {
    if (this.bypass) return input;
    const detectedInput: number = this.hasSidechainSample ? this.sidechainSample : input;
    return this.compressSample(input, detectedInput);
  }

  public processBlock(input: MonoBuffer, output: MonoBuffer): void {
    const len: number = input.length;
    if (this.bypass) {
      for (let i: number = 0; i < len; i++) {
        output[i] = input[i];
      }
      return;
    }
    const hasSidechain: boolean = this.sidechainBuffer !== null && this.sidechainBuffer.length >= len;
    const dryGain: number = 1.0 - this.wet;
    for (let i: number = 0; i < len; i++) {
      const detectedInput: number = hasSidechain ? this.sidechainBuffer![i] : input[i];
      const wetSample: number = this.compressSample(input[i], detectedInput);
      output[i] = input[i] * dryGain + wetSample * this.wet;
    }
  }

  public reset(): void {
    this.envelope = 0.0;
    this.sidechainIndex = 0;
    this.hasSidechainSample = false;
    this.sidechainSample = 0.0;
  }
}

// ============================================================================
// 四、失真效果器
// ============================================================================

/** 失真类型枚举 */
export enum DistortionType {
  SoftClip = 'softClip',
  HardClip = 'hardClip',
  Tube = 'tube',
  Transistor = 'transistor',
  Fuzz = 'fuzz',
  WaveShaper = 'waveShaper',
}

/** 失真效果器配置 */
export interface DistortionConfig {
  type: DistortionType;
  drive: number; // 0.0 ~ 1.0
  outputGain: number;
  tone: number; // 0.0 ~ 1.0（高低频平衡）
  blend: number; // 干湿混合 0.0 ~ 1.0
}

/** 波形整形查找表 */
export class WaveShaperTable {
  private table: Float32Array;
  private size: number;

  constructor(size: number = 1024) {
    this.size = size;
    this.table = new Float32Array(size);
    this.generateIdentity();
  }

  /** 生成恒等映射 */
  public generateIdentity(): void {
    for (let i: number = 0; i < this.size; i++) {
      const x: number = (i / (this.size - 1)) * 2.0 - 1.0;
      this.table[i] = x;
    }
  }

  /** 生成反正切软削波曲线 */
  public generateArctan(amount: number): void {
    for (let i: number = 0; i < this.size; i++) {
      const x: number = (i / (this.size - 1)) * 2.0 - 1.0;
      this.table[i] = Math.atan(x * amount) / Math.atan(amount);
    }
  }

  /** 生成双曲正切软削波 */
  public generateTanh(amount: number): void {
    for (let i: number = 0; i < this.size; i++) {
      const x: number = (i / (this.size - 1)) * 2.0 - 1.0;
      this.table[i] = Math.tanh(x * amount) / Math.tanh(amount);
    }
  }

  /** 生成多项式波形整形 */
  public generatePolynomial(coeffs: number[]): void {
    for (let i: number = 0; i < this.size; i++) {
      const x: number = (i / (this.size - 1)) * 2.0 - 1.0;
      let y: number = 0.0;
      let power: number = 1.0;
      for (const c of coeffs) {
        y += c * power;
        power *= x;
      }
      this.table[i] = this.clamp(y, -1.0, 1.0);
    }
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  /** 查找表映射 */
  public lookup(input: number): number {
    const clamped: number = this.clamp(input, -1.0, 1.0);
    const idx: number = Math.floor((clamped + 1.0) * 0.5 * (this.size - 1));
    const frac: number = (clamped + 1.0) * 0.5 * (this.size - 1) - idx;
    const i0: number = Math.max(0, Math.min(this.size - 1, idx));
    const i1: number = Math.max(0, Math.min(this.size - 1, idx + 1));
    // 线性插值
    return this.table[i0] * (1.0 - frac) + this.table[i1] * frac;
  }
}

/** 失真效果器 */
export class Distortion extends AudioEffectBase {
  public readonly name: string = 'Distortion';
  private type: DistortionType;
  private drive: number;
  private outputGain: number;
  private tone: number;
  private blend: number;
  private waveShaper: WaveShaperTable;
  private toneFilter: BiquadFilter;
  private preFilter: BiquadFilter;

  constructor(config: Partial<DistortionConfig> = {}, sampleRate: number = DEFAULT_SAMPLE_RATE) {
    super(sampleRate);
    this.type = config.type || DistortionType.SoftClip;
    this.drive = config.drive ?? 0.5;
    this.outputGain = config.outputGain ?? 1.0;
    this.tone = config.tone ?? 0.5;
    this.blend = config.blend ?? 1.0;
    this.waveShaper = new WaveShaperTable(2048);
    this.toneFilter = new BiquadFilter(sampleRate);
    this.preFilter = new BiquadFilter(sampleRate);
    this.updateWaveShaper();
    this.updateToneFilter();
  }

  /** 更新波形整形器 */
  private updateWaveShaper(): void {
    const amount: number = 1.0 + this.drive * 19.0; // 1 ~ 20
    switch (this.type) {
      case DistortionType.SoftClip:
        this.waveShaper.generateArctan(amount);
        break;
      case DistortionType.Tube:
        // 电子管：偶次谐波为主，温暖感
        this.waveShaper.generateTanh(amount * 0.7);
        break;
      case DistortionType.Transistor:
        // 晶体管：奇次谐波为主，尖锐感
        this.waveShaper.generatePolynomial([0, 1.0, 0, amount * 0.3]);
        break;
      case DistortionType.Fuzz:
        // 法兹：极度不对称削波
        this.waveShaper.generatePolynomial([0.2, 1.0, -0.5 * amount, 0.8 * amount]);
        break;
      case DistortionType.WaveShaper:
        this.waveShaper.generatePolynomial([0, 1.0, 0.2 * amount, -0.1 * amount]);
        break;
      default:
        this.waveShaper.generateIdentity();
    }
  }

  /** 更新音色滤波器 */
  private updateToneFilter(): void {
    // tone 控制低通截止频率
    const freq: number = 200.0 + this.tone * 8000.0;
    this.toneFilter.designLowPass(freq, 12);
    this.preFilter.designHighPass(80.0, 6);
  }

  public setDrive(drive: number): void {
    this.drive = this.clamp(drive, 0.0, 1.0);
    this.updateWaveShaper();
  }

  public setType(type: DistortionType): void {
    this.type = type;
    this.updateWaveShaper();
  }

  public setTone(tone: number): void {
    this.tone = this.clamp(tone, 0.0, 1.0);
    this.updateToneFilter();
  }

  public processSample(input: number, _channel?: number): number {
    if (this.bypass) return input;

    // 前置滤波去除直流
    let filtered: number = this.preFilter.process(input);

    // 应用增益驱动
    const gain: number = 1.0 + this.drive * 9.0; // 1x ~ 10x
    const driven: number = filtered * gain;

    let distorted: number;
    if (this.type === DistortionType.HardClip) {
      // 硬削波
      distorted = this.clamp(driven, -1.0, 1.0);
    } else {
      // 软削波 / 波形整形
      distorted = this.waveShaper.lookup(driven);
    }

    // 音色滤波
    const toned: number = this.toneFilter.process(distorted);

    // 混合干湿信号
    return input * (1.0 - this.blend) + toned * this.blend * this.outputGain;
  }

  public reset(): void {
    this.waveShaper.generateIdentity();
    this.toneFilter.reset();
    this.preFilter.reset();
  }
}

/** 模糊度控制器（实现法兹音色微调） */
export class FuzzControl {
  private fuzzAmount: number = 0.5;
  private gateThreshold: number = 0.01;
  private octaveMix: number = 0.0;

  /** 设置模糊度 */
  public setFuzz(amount: number): void {
    this.fuzzAmount = Math.max(0.0, Math.min(1.0, amount));
  }

  /** 设置门限（清理底部噪声） */
  public setGate(threshold: number): void {
    this.gateThreshold = Math.max(0.0, Math.min(0.5, threshold));
  }

  /** 设置八度混合（产生八度效果） */
  public setOctaveMix(mix: number): void {
    this.octaveMix = Math.max(0.0, Math.min(1.0, mix));
  }

  /** 处理模糊度 */
  public process(input: number): number {
    let signal: number = input;

    // 门限处理
    if (Math.abs(signal) < this.gateThreshold) {
      signal = 0.0;
    }

    // 产生八度效果（全波整流）
    if (this.octaveMix > 0.0) {
      const octave: number = Math.abs(signal) * 2.0 - 1.0;
      signal = signal * (1.0 - this.octaveMix) + octave * this.octaveMix;
    }

    return signal * (0.5 + this.fuzzAmount * 0.5);
  }
}

// ============================================================================
// 五、时间类效果器
// ============================================================================

/** 延迟配置 */
export interface DelayConfig {
  delayMs: number;
  feedback: number; // 0.0 ~ 0.99
  mix: number; // 0.0 ~ 1.0
  type: 'mono' | 'stereo' | 'pingpong' | 'pong';
}

/** 基础延迟线 */
export class DelayLine {
  private buffer: MonoBuffer;
  private writeIndex: number = 0;
  private sampleRate: number;

  constructor(maxDelayMs: number, sampleRate: number = DEFAULT_SAMPLE_RATE) {
    this.sampleRate = sampleRate;
    const maxSamples: number = Math.ceil((maxDelayMs / 1000.0) * sampleRate);
    this.buffer = new Float32Array(maxSamples);
  }

  /** 写入样本并读取延迟样本 */
  public readWrite(input: number, delayMs: number): number {
    const delaySamples: number = (delayMs / 1000.0) * this.sampleRate;
    const readIndex: number = this.writeIndex - delaySamples;
    const i0: number = Math.floor(readIndex);
    const frac: number = readIndex - i0;

    const len: number = this.buffer.length;
    const idx0: number = ((i0 % len) + len) % len;
    const idx1: number = ((idx0 + 1) % len);

    // 线性插值
    const output: number = this.buffer[idx0] * (1.0 - frac) + this.buffer[idx1] * frac;

    this.buffer[this.writeIndex] = input;
    this.writeIndex = (this.writeIndex + 1) % len;

    return output;
  }

  /** 仅读取不写入 */
  public read(delayMs: number): number {
    const delaySamples: number = (delayMs / 1000.0) * this.sampleRate;
    const readIndex: number = this.writeIndex - delaySamples;
    const i0: number = Math.floor(readIndex);
    const frac: number = readIndex - i0;

    const len: number = this.buffer.length;
    const idx0: number = ((i0 % len) + len) % len;
    const idx1: number = ((idx0 + 1) % len);

    return this.buffer[idx0] * (1.0 - frac) + this.buffer[idx1] * frac;
  }

  /** 仅写入 */
  public write(input: number): void {
    this.buffer[this.writeIndex] = input;
    this.writeIndex = (this.writeIndex + 1) % this.buffer.length;
  }

  public reset(): void {
    this.buffer.fill(0.0);
    this.writeIndex = 0;
  }
}

/** 延迟效果器 */
export class Delay extends AudioEffectBase {
  public readonly name: string = 'Delay';
  private delayLineLeft: DelayLine;
  private delayLineRight: DelayLine;
  private delayMs: number;
  private feedback: number;
  private mix: number;
  private type: 'mono' | 'stereo' | 'pingpong' | 'pong';
  private pongState: number = 0.0;

  constructor(config: Partial<DelayConfig> = {}, sampleRate: number = DEFAULT_SAMPLE_RATE) {
    super(sampleRate);
    this.delayMs = config.delayMs ?? 300.0;
    this.feedback = config.feedback ?? 0.4;
    this.mix = config.mix ?? 0.5;
    this.type = config.type || 'mono';
    this.delayLineLeft = new DelayLine(5000.0, sampleRate);
    this.delayLineRight = new DelayLine(5000.0, sampleRate);
  }

  public setDelayMs(ms: number): void {
    this.delayMs = Math.max(1.0, ms);
  }

  public setFeedback(feedback: number): void {
    this.feedback = this.clamp(feedback, 0.0, 0.999);
  }

  public processSample(input: number, channel?: number): number {
    if (this.bypass) return input;

    const ch: number = channel || 0;

    if (this.type === 'mono') {
      const delayed: number = this.delayLineLeft.readWrite(input + this.delayLineLeft.read(this.delayMs) * this.feedback, this.delayMs);
      return input * (1.0 - this.mix) + delayed * this.mix;
    } else if (this.type === 'stereo') {
      const delayLine: DelayLine = ch === 0 ? this.delayLineLeft : this.delayLineRight;
      const delayed: number = delayLine.readWrite(input + delayLine.read(this.delayMs) * this.feedback, this.delayMs);
      return input * (1.0 - this.mix) + delayed * this.mix;
    } else if (this.type === 'pingpong') {
      // 乒乓延迟：左→右→左→右
      const leftDelayed: number = this.delayLineLeft.read(this.delayMs);
      const rightDelayed: number = this.delayLineRight.read(this.delayMs);
      const feedbackLeft: number = input + rightDelayed * this.feedback;
      const feedbackRight: number = leftDelayed * this.feedback;
      this.delayLineLeft.write(feedbackLeft);
      this.delayLineRight.write(feedbackRight);
      return ch === 0
        ? input * (1.0 - this.mix) + leftDelayed * this.mix
        : input * (1.0 - this.mix) + rightDelayed * this.mix;
    } else {
      // pong: 单通道乒乓
      const delayed: number = this.delayLineLeft.read(this.delayMs);
      const output: number = input * (1.0 - this.mix) + delayed * this.mix;
      this.delayLineLeft.write(input + delayed * this.feedback);
      return output;
    }
  }

  public reset(): void {
    this.delayLineLeft.reset();
    this.delayLineRight.reset();
    this.pongState = 0.0;
  }
}

/** 多抽头回声效果器 */
export class MultiTapDelay extends AudioEffectBase {
  public readonly name: string = 'MultiTapDelay';
  private taps: { delayLine: DelayLine; delayMs: number; gain: number }[] = [];
  private feedbackDelay: DelayLine;
  private feedbackGain: number;
  private mix: number;

  constructor(
    tapDelays: { delayMs: number; gain: number }[] = [
      { delayMs: 100, gain: 0.6 },
      { delayMs: 200, gain: 0.4 },
      { delayMs: 300, gain: 0.25 },
      { delayMs: 450, gain: 0.15 },
    ],
    feedbackGain: number = 0.3,
    mix: number = 0.5,
    sampleRate: number = DEFAULT_SAMPLE_RATE
  ) {
    super(sampleRate);
    this.feedbackGain = feedbackGain;
    this.mix = mix;

    let maxDelay: number = 0;
    for (const tap of tapDelays) {
      maxDelay = Math.max(maxDelay, tap.delayMs);
    }

    this.feedbackDelay = new DelayLine(maxDelay + 100, sampleRate);

    for (const tap of tapDelays) {
      this.taps.push({
        delayLine: new DelayLine(maxDelay + 50, sampleRate),
        delayMs: tap.delayMs,
        gain: tap.gain,
      });
    }
  }

  public processSample(input: number, _channel?: number): number {
    if (this.bypass) return input;

    let output: number = input;
    let tapSum: number = 0.0;

    for (const tap of this.taps) {
      const delayed: number = tap.delayLine.readWrite(input, tap.delayMs);
      tapSum += delayed * tap.gain;
    }

    // 反馈回路
    const feedback: number = this.feedbackDelay.readWrite(tapSum, this.taps[this.taps.length - 1].delayMs) * this.feedbackGain;

    output = input * (1.0 - this.mix) + (tapSum + feedback) * this.mix;
    return output;
  }

  public reset(): void {
    for (const tap of this.taps) {
      tap.delayLine.reset();
    }
    this.feedbackDelay.reset();
  }
}

/** LFO（低频振荡器） */
export class LFO {
  private phase: number = 0.0;
  private frequency: number;
  private sampleRate: number;
  private waveform: 'sine' | 'triangle' | 'square' | 'saw';

  constructor(frequency: number = 1.0, sampleRate: number = DEFAULT_SAMPLE_RATE, waveform: 'sine' | 'triangle' | 'square' | 'saw' = 'sine') {
    this.frequency = frequency;
    this.sampleRate = sampleRate;
    this.waveform = waveform;
  }

  public setFrequency(freq: number): void {
    this.frequency = freq;
  }

  public setWaveform(waveform: 'sine' | 'triangle' | 'square' | 'saw'): void {
    this.waveform = waveform;
  }

  /** 生成下一个样本 */
  public next(): number {
    const phaseIncrement: number = this.frequency / this.sampleRate;
    this.phase += phaseIncrement;
    while (this.phase >= 1.0) this.phase -= 1.0;

    switch (this.waveform) {
      case 'sine':
        return Math.sin(2.0 * Math.PI * this.phase);
      case 'triangle':
        return 1.0 - 4.0 * Math.abs(this.phase - 0.5);
      case 'square':
        return this.phase < 0.5 ? 1.0 : -1.0;
      case 'saw':
        return 2.0 * this.phase - 1.0;
      default:
        return Math.sin(2.0 * Math.PI * this.phase);
    }
  }

  public reset(): void {
    this.phase = 0.0;
  }
}

/** 合唱效果器（Chorus） */
export class Chorus extends AudioEffectBase {
  public readonly name: string = 'Chorus';
  private delayLine: DelayLine;
  private rate: number; // LFO 频率 Hz
  private depth: number; // 调制深度 0.0 ~ 1.0
  private lfo: LFO;
  private baseDelayMs: number = 20.0;
  private voices: number;
  private lfoPhaseOffsets: number[];

  constructor(
    rate: number = 0.5,
    depth: number = 0.5,
    voices: number = 3,
    sampleRate: number = DEFAULT_SAMPLE_RATE
  ) {
    super(sampleRate);
    this.rate = rate;
    this.depth = depth;
    this.voices = voices;
    this.delayLine = new DelayLine(100.0, sampleRate);
    this.lfo = new LFO(rate, sampleRate, 'sine');
    this.lfoPhaseOffsets = [];
    for (let i: number = 0; i < voices; i++) {
      this.lfoPhaseOffsets.push(i / voices);
    }
  }

  public setRate(rate: number): void {
    this.rate = rate;
    this.lfo.setFrequency(rate);
  }

  public setDepth(depth: number): void {
    this.depth = this.clamp(depth, 0.0, 1.0);
  }

  public processSample(input: number, _channel?: number): number {
    if (this.bypass) return input;

    // 写入延迟线
    this.delayLine.write(input);

    let wet: number = 0.0;
    const maxModulationMs: number = 5.0 * this.depth; // 最大调制 5ms

    for (let v: number = 0; v < this.voices; v++) {
      const lfoPhase: number = this.lfoPhaseOffsets[v];
      const lfoValue: number = Math.sin(2.0 * Math.PI * (this.lfo.next() + lfoPhase));
      const modulationMs: number = this.baseDelayMs + lfoValue * maxModulationMs;
      const delayed: number = this.delayLine.read(modulationMs);
      wet += delayed;
    }

    wet /= this.voices;

    return input * (1.0 - this.wet) + wet * this.wet;
  }

  public reset(): void {
    this.delayLine.reset();
    this.lfo.reset();
  }
}

/** 镶边效果器（Flanger） */
export class Flanger extends AudioEffectBase {
  public readonly name: string = 'Flanger';
  private delayLine: DelayLine;
  private rate: number;
  private depth: number;
  private feedback: number;
  private lfo: LFO;
  private baseDelayMs: number = 0.1; // 0.1ms ~ 10ms 范围
  private maxDelayMs: number = 10.0;

  constructor(
    rate: number = 0.25,
    depth: number = 0.7,
    feedback: number = 0.5,
    sampleRate: number = DEFAULT_SAMPLE_RATE
  ) {
    super(sampleRate);
    this.rate = rate;
    this.depth = depth;
    this.feedback = feedback;
    this.delayLine = new DelayLine(50.0, sampleRate);
    this.lfo = new LFO(rate, sampleRate, 'triangle');
  }

  public setRate(rate: number): void {
    this.rate = rate;
    this.lfo.setFrequency(rate);
  }

  public setDepth(depth: number): void {
    this.depth = this.clamp(depth, 0.0, 1.0);
  }

  public setFeedback(feedback: number): void {
    this.feedback = this.clamp(feedback, -0.99, 0.99);
  }

  public processSample(input: number, _channel?: number): number {
    if (this.bypass) return input;

    const lfoValue: number = this.lfo.next(); // -1 ~ 1
    const delayMs: number = this.baseDelayMs + (lfoValue + 1.0) * 0.5 * (this.maxDelayMs - this.baseDelayMs) * this.depth;

    const delayed: number = this.delayLine.read(delayMs);
    const feedbackSignal: number = input + delayed * this.feedback;
    this.delayLine.write(feedbackSignal);

    return input * (1.0 - this.wet) + delayed * this.wet;
  }

  public reset(): void {
    this.delayLine.reset();
    this.lfo.reset();
  }
}

/** 全通滤波器（用于相位器） */
export class AllPassFilter {
  private stateX1: number = 0.0;
  private stateY1: number = 0.0;
  private coeff: number = 0.0;

  /** 设计全通滤波器，centerFreq 为凹口频率 */
  public design(sampleRate: number, centerFreq: number, q: number): void {
    const w0: number = (2.0 * Math.PI * centerFreq) / sampleRate;
    const cosW0: number = Math.cos(w0);
    const alpha: number = Math.sin(w0) / (2.0 * q);

    const a1: number = (1.0 - alpha) / (1.0 + alpha);
    const a2: number = -cosW0 / (1.0 + alpha);
    // 二阶全通的标准形式：y[n] = a*(x[n] - y[n-1]) + x[n-1]
    // 简化为系数控制
    this.coeff = (1.0 - Math.tan(w0 / (2.0 * q))) / (1.0 + Math.tan(w0 / (2.0 * q)));
  }

  public process(input: number): number {
    const y: number = this.coeff * input + this.stateX1 - this.coeff * this.stateY1;
    this.stateX1 = input;
    this.stateY1 = y;
    return y;
  }

  public reset(): void {
    this.stateX1 = 0.0;
    this.stateY1 = 0.0;
  }
}

/** 相位器（Phaser） */
export class Phaser extends AudioEffectBase {
  public readonly name: string = 'Phaser';
  private allpassFilters: AllPassFilter[] = [];
  private numStages: number;
  private rate: number;
  private depth: number;
  private feedback: number;
  private lfo: LFO;
  private minFreq: number;
  private maxFreq: number;

  constructor(
    numStages: number = 6,
    rate: number = 0.5,
    depth: number = 0.7,
    feedback: number = 0.3,
    sampleRate: number = DEFAULT_SAMPLE_RATE
  ) {
    super(sampleRate);
    this.numStages = numStages;
    this.rate = rate;
    this.depth = depth;
    this.feedback = feedback;
    this.minFreq = 200.0;
    this.maxFreq = 4000.0;
    this.lfo = new LFO(rate, sampleRate, 'sine');

    for (let i: number = 0; i < numStages; i++) {
      this.allpassFilters.push(new AllPassFilter());
    }
  }

  public setRate(rate: number): void {
    this.rate = rate;
    this.lfo.setFrequency(rate);
  }

  public setDepth(depth: number): void {
    this.depth = this.clamp(depth, 0.0, 1.0);
  }

  public setFeedback(feedback: number): void {
    this.feedback = this.clamp(feedback, 0.0, 0.99);
  }

  public processSample(input: number, _channel?: number): number {
    if (this.bypass) return input;

    const lfoValue: number = (this.lfo.next() + 1.0) * 0.5; // 0 ~ 1
    const modulatedFreq: number = this.minFreq + lfoValue * (this.maxFreq - this.minFreq) * this.depth;

    // 更新全通滤波器频率
    const freqStep: number = (this.maxFreq - this.minFreq) / this.numStages;
    for (let i: number = 0; i < this.numStages; i++) {
      const stageFreq: number = modulatedFreq + i * freqStep * 0.5;
      this.allpassFilters[i].design(this.sampleRate, stageFreq, 1.0);
    }

    // 级联全通滤波器
    let output: number = input;
    for (const apf of this.allpassFilters) {
      output = apf.process(output);
    }

    // 反馈
    const result: number = input + output * (1.0 + this.feedback);

    return input * (1.0 - this.wet) + result * this.wet * 0.5;
  }

  public reset(): void {
    for (const apf of this.allpassFilters) {
      apf.reset();
    }
    this.lfo.reset();
  }
}

/** 颤音效果器（Tremolo） */
export class Tremolo extends AudioEffectBase {
  public readonly name: string = 'Tremolo';
  private rate: number;
  private depth: number;
  private lfo: LFO;
  private waveform: 'sine' | 'triangle' | 'square';

  constructor(
    rate: number = 5.0,
    depth: number = 0.5,
    waveform: 'sine' | 'triangle' | 'square' = 'sine',
    sampleRate: number = DEFAULT_SAMPLE_RATE
  ) {
    super(sampleRate);
    this.rate = rate;
    this.depth = depth;
    this.waveform = waveform;
    this.lfo = new LFO(rate, sampleRate, waveform);
  }

  public setRate(rate: number): void {
    this.rate = rate;
    this.lfo.setFrequency(rate);
  }

  public setDepth(depth: number): void {
    this.depth = this.clamp(depth, 0.0, 1.0);
  }

  public setWaveform(waveform: 'sine' | 'triangle' | 'square'): void {
    this.waveform = waveform;
    this.lfo.setWaveform(waveform);
  }

  public processSample(input: number, _channel?: number): number {
    if (this.bypass) return input;

    const lfoValue: number = this.lfo.next(); // -1 ~ 1
    const modulation: number = 1.0 - this.depth * 0.5 + lfoValue * this.depth * 0.5;

    return input * modulation;
  }

  public reset(): void {
    this.lfo.reset();
  }
}

// ============================================================================
// 六、特殊效果器
// ============================================================================

/** 声码器配置 */
export interface VocoderConfig {
  numBands: number;
  attackMs: number;
  releaseMs: number;
}

/** 声码器（Vocoder）：载波 + 调制波 → 频谱包络控制 */
export class Vocoder extends AudioEffectBase {
  public readonly name: string = 'Vocoder';
  private numBands: number;
  private carrierFilters: BiquadFilter[] = [];
  private modulatorFilters: BiquadFilter[] = [];
  private envelopeFollowers: { envelope: number; attackCoeff: number; releaseCoeff: number }[] = [];
  private frequencies: number[];

  constructor(config: Partial<VocoderConfig> = {}, sampleRate: number = DEFAULT_SAMPLE_RATE) {
    super(sampleRate);
    this.numBands = config.numBands ?? 16;
    const attackMs: number = config.attackMs ?? 5.0;
    const releaseMs: number = config.releaseMs ?? 20.0;

    // 对数分布频段
    this.frequencies = [];
    const minFreq: number = 100.0;
    const maxFreq: number = 8000.0;
    for (let i: number = 0; i < this.numBands; i++) {
      const logFreq: number = minFreq * Math.pow(maxFreq / minFreq, i / (this.numBands - 1));
      this.frequencies.push(logFreq);
    }

    for (let i: number = 0; i < this.numBands; i++) {
      const cf: BiquadFilter = new BiquadFilter(sampleRate);
      const mf: BiquadFilter = new BiquadFilter(sampleRate);
      cf.designPeak(this.frequencies[i], 2.0, 0.0);
      mf.designPeak(this.frequencies[i], 2.0, 0.0);
      this.carrierFilters.push(cf);
      this.modulatorFilters.push(mf);
      this.envelopeFollowers.push({
        envelope: 0.0,
        attackCoeff: Math.exp(-1.0 / ((attackMs / 1000.0) * sampleRate)),
        releaseCoeff: Math.exp(-1.0 / ((releaseMs / 1000.0) * sampleRate)),
      });
    }
  }

  private carrierInput: number = 0.0;

  /** 输入载波信号（通常是合成器 Saw/Square） */
  public setCarrierInput(input: number): void {
    this.carrierInput = input;
  }

  public processSample(modulatorInput: number, _channel?: number): number {
    if (this.bypass) return modulatorInput;

    let output: number = 0.0;

    for (let i: number = 0; i < this.numBands; i++) {
      // 调制器分频并提取包络
      const modBand: number = this.modulatorFilters[i].process(modulatorInput);
      const modEnvelope: number = Math.abs(modBand);
      const follower = this.envelopeFollowers[i];

      if (modEnvelope > follower.envelope) {
        follower.envelope = follower.attackCoeff * follower.envelope + (1.0 - follower.attackCoeff) * modEnvelope;
      } else {
        follower.envelope = follower.releaseCoeff * follower.envelope + (1.0 - follower.releaseCoeff) * modEnvelope;
      }

      // 载波分频并应用调制器包络
      const carBand: number = this.carrierFilters[i].process(this.carrierInput);
      output += carBand * follower.envelope * 10.0; // 增益补偿
    }

    return output * this.wet + modulatorInput * (1.0 - this.wet);
  }

  public reset(): void {
    for (let i: number = 0; i < this.numBands; i++) {
      this.carrierFilters[i].reset();
      this.modulatorFilters[i].reset();
      this.envelopeFollowers[i].envelope = 0.0;
    }
  }
}

/** 比特压碎效果器（Bit Crusher） */
export class BitCrusher extends AudioEffectBase {
  public readonly name: string = 'BitCrusher';
  private bitDepth: number;
  private sampleRateReduction: number; // 降采样因子 >= 1
  private holdSample: number = 0.0;
  private sampleCounter: number = 0;

  constructor(bitDepth: number = 8, sampleRateReduction: number = 4, sampleRate: number = DEFAULT_SAMPLE_RATE) {
    super(sampleRate);
    this.bitDepth = bitDepth;
    this.sampleRateReduction = sampleRateReduction;
  }

  public setBitDepth(bits: number): void {
    this.bitDepth = Math.max(1, Math.min(32, bits));
  }

  public setSampleRateReduction(factor: number): void {
    this.sampleRateReduction = Math.max(1, factor);
  }

  public processSample(input: number, _channel?: number): number {
    if (this.bypass) return input;

    // 降采样保持
    this.sampleCounter++;
    if (this.sampleCounter >= this.sampleRateReduction) {
      this.sampleCounter = 0;
      // 量化
      const levels: number = Math.pow(2.0, this.bitDepth - 1);
      this.holdSample = Math.round(input * levels) / levels;
    }

    return input * (1.0 - this.wet) + this.holdSample * this.wet;
  }

  public reset(): void {
    this.holdSample = 0.0;
    this.sampleCounter = 0;
  }
}

/** 环形调制器 */
export class RingModulator extends AudioEffectBase {
  public readonly name: string = 'RingModulator';
  private frequency: number;
  private oscillatorPhase: number = 0.0;
  private waveform: 'sine' | 'square' | 'triangle';

  constructor(frequency: number = 440.0, waveform: 'sine' | 'square' | 'triangle' = 'sine', sampleRate: number = DEFAULT_SAMPLE_RATE) {
    super(sampleRate);
    this.frequency = frequency;
    this.waveform = waveform;
  }

  public setFrequency(freq: number): void {
    this.frequency = freq;
  }

  public setWaveform(waveform: 'sine' | 'square' | 'triangle'): void {
    this.waveform = waveform;
  }

  private getOscillatorValue(): number {
    const phaseIncrement: number = this.frequency / this.sampleRate;
    this.oscillatorPhase += phaseIncrement;
    while (this.oscillatorPhase >= 1.0) this.oscillatorPhase -= 1.0;

    switch (this.waveform) {
      case 'sine':
        return Math.sin(2.0 * Math.PI * this.oscillatorPhase);
      case 'square':
        return this.oscillatorPhase < 0.5 ? 1.0 : -1.0;
      case 'triangle':
        return 1.0 - 4.0 * Math.abs(this.oscillatorPhase - 0.5);
      default:
        return Math.sin(2.0 * Math.PI * this.oscillatorPhase);
    }
  }

  public processSample(input: number, _channel?: number): number {
    if (this.bypass) return input;

    const carrier: number = this.getOscillatorValue();
    const modulated: number = input * carrier;

    return input * (1.0 - this.wet) + modulated * this.wet;
  }

  public reset(): void {
    this.oscillatorPhase = 0.0;
  }
}

/** 自动声像（Auto-Pan） */
export class AutoPan extends AudioEffectBase {
  public readonly name: string = 'AutoPan';
  private rate: number;
  private depth: number;
  private lfo: LFO;

  constructor(rate: number = 1.0, depth: number = 0.8, sampleRate: number = DEFAULT_SAMPLE_RATE) {
    super(sampleRate);
    this.rate = rate;
    this.depth = depth;
    this.lfo = new LFO(rate, sampleRate, 'sine');
  }

  public setRate(rate: number): void {
    this.rate = rate;
    this.lfo.setFrequency(rate);
  }

  public setDepth(depth: number): void {
    this.depth = this.clamp(depth, 0.0, 1.0);
  }

  /** 返回左右声道增益 [leftGain, rightGain] */
  public processStereo(input: number): [number, number] {
    if (this.bypass) return [input, input];

    const lfoValue: number = this.lfo.next(); // -1 ~ 1
    const pan: number = lfoValue * this.depth; // -depth ~ depth

    // 恒功率声像律
    const leftGain: number = Math.cos((pan + 1.0) * Math.PI * 0.25) * Math.SQRT2 * 0.5;
    const rightGain: number = Math.sin((pan + 1.0) * Math.PI * 0.25) * Math.SQRT2 * 0.5;

    return [input * leftGain, input * rightGain];
  }

  public processSample(input: number, _channel?: number): number {
    // 单声道处理时返回平均
    const [left, right] = this.processStereo(input);
    return (left + right) * 0.5;
  }

  public reset(): void {
    this.lfo.reset();
  }
}

/** 立体声展宽器（Stereo Widener） */
export class StereoWidener extends AudioEffectBase {
  public readonly name: string = 'StereoWidener';
  private width: number; // 0.0 = 单声道, 1.0 = 正常, 2.0 = 超宽

  constructor(width: number = 1.5, sampleRate: number = DEFAULT_SAMPLE_RATE) {
    super(sampleRate);
    this.width = width;
  }

  public setWidth(width: number): void {
    this.width = Math.max(0.0, Math.min(3.0, width));
  }

  /** 处理立体声对，返回 [left, right] */
  public processStereoPair(left: number, right: number): [number, number] {
    if (this.bypass) return [left, right];

    const mid: number = (left + right) * 0.5;
    const side: number = (left - right) * 0.5;

    // 调整侧声道增益
    const sideGain: number = this.width;
    const newLeft: number = mid + side * sideGain;
    const newRight: number = mid - side * sideGain;

    // 防止削波
    const maxVal: number = Math.max(Math.abs(newLeft), Math.abs(newRight), 1.0);
    const scale: number = 1.0 / maxVal;

    return [newLeft * scale, newRight * scale];
  }

  public processSample(input: number, _channel?: number): number {
    // 单声道直通
    return input;
  }

  public reset(): void {
    // 无状态
  }
}

/** 激励器（Exciter）：谐波增强 */
export class Exciter extends AudioEffectBase {
  public readonly name: string = 'Exciter';
  private amount: number;
  private highPassFreq: number;
  private highPass: BiquadFilter;
  private harmonicEnhancer: WaveShaperTable;

  constructor(amount: number = 0.3, highPassFreq: number = 3000.0, sampleRate: number = DEFAULT_SAMPLE_RATE) {
    super(sampleRate);
    this.amount = amount;
    this.highPassFreq = highPassFreq;
    this.highPass = new BiquadFilter(sampleRate);
    this.highPass.designHighPass(highPassFreq, 12);
    this.harmonicEnhancer = new WaveShaperTable(1024);
    this.harmonicEnhancer.generateTanh(3.0);
  }

  public setAmount(amount: number): void {
    this.amount = this.clamp(amount, 0.0, 1.0);
  }

  public setHighPassFreq(freq: number): void {
    this.highPassFreq = freq;
    this.highPass.designHighPass(freq, 12);
  }

  public processSample(input: number, _channel?: number): number {
    if (this.bypass) return input;

    // 提取高频
    const highFreq: number = this.highPass.process(input);

    // 添加谐波失真
    const harmonics: number = this.harmonicEnhancer.lookup(highFreq) - highFreq; // 仅保留新增谐波

    // 混合
    return input + harmonics * this.amount * this.wet;
  }

  public reset(): void {
    this.highPass.reset();
  }
}

// ============================================================================
// 七、效果链管理器
// ============================================================================

/** 路由类型 */
export enum RoutingType {
  Serial = 'serial',
  Parallel = 'parallel',
}

/** 效果链预设类型 */
export enum ChainPreset {
  Guitar = 'guitar',
  Vocal = 'vocal',
  Drum = 'drum',
  Synth = 'synth',
  Mastering = 'mastering',
  Ambient = 'ambient',
}

/** 效果链节点 */
export interface EffectChainNode {
  effect: IAudioEffect;
  routing: RoutingType;
  mix?: number; // 并行混合比例
}

/** 效果链管理器 */
export class EffectChainManager {
  private effects: EffectChainNode[] = [];
  private sampleRate: number;
  private cpuLoadEstimate: number = 0.0;

  constructor(sampleRate: number = DEFAULT_SAMPLE_RATE) {
    this.sampleRate = sampleRate;
  }

  /** 添加效果器到链尾 */
  public addEffect(effect: IAudioEffect, routing: RoutingType = RoutingType.Serial, mix: number = 1.0): void {
    this.effects.push({ effect, routing, mix });
    this.updateCpuEstimate();
  }

  /** 插入效果器到指定位置 */
  public insertEffect(index: number, effect: IAudioEffect, routing: RoutingType = RoutingType.Serial, mix: number = 1.0): void {
    if (index < 0 || index > this.effects.length) return;
    this.effects.splice(index, 0, { effect, routing, mix });
    this.updateCpuEstimate();
  }

  /** 移除效果器 */
  public removeEffect(index: number): void {
    if (index < 0 || index >= this.effects.length) return;
    this.effects.splice(index, 1);
    this.updateCpuEstimate();
  }

  /** 获取效果器 */
  public getEffect(index: number): IAudioEffect | null {
    if (index < 0 || index >= this.effects.length) return null;
    return this.effects[index].effect;
  }

  /** 设置效果器旁通 */
  public setBypass(index: number, bypass: boolean): void {
    const node: EffectChainNode | undefined = this.effects[index];
    if (node) {
      node.effect.bypass = bypass;
    }
  }

  /** 设置效果器湿信号比例 */
  public setWet(index: number, wet: number): void {
    const node: EffectChainNode | undefined = this.effects[index];
    if (node) {
      node.effect.wet = Math.max(0.0, Math.min(1.0, wet));
    }
  }

  /** 处理单一样本（串行路由） */
  public processSample(input: number, channel?: number): number {
    let output: number = input;
    let parallelMix: number = 0.0;
    let parallelCount: number = 0;

    for (const node of this.effects) {
      if (node.routing === RoutingType.Serial) {
        // 先混合之前的并行结果
        if (parallelCount > 0) {
          output = output * 0.5 + parallelMix * 0.5;
          parallelMix = 0.0;
          parallelCount = 0;
        }
        output = node.effect.processSample(output, channel);
      } else {
        // 并行处理
        const wetSignal: number = node.effect.processSample(input, channel);
        parallelMix += wetSignal * (node.mix || 1.0);
        parallelCount++;
      }
    }

    if (parallelCount > 0) {
      output = output * (1.0 - 0.5) + parallelMix * 0.5;
    }

    return output;
  }

  /** 处理整个缓冲区 */
  public processBlock(input: MonoBuffer, output: MonoBuffer, channel?: number): void {
    const len: number = input.length;
    for (let i: number = 0; i < len; i++) {
      output[i] = this.processSample(input[i], channel);
    }
  }

  /** 重置所有效果器 */
  public reset(): void {
    for (const node of this.effects) {
      node.effect.reset();
    }
  }

  /** 清空效果链 */
  public clear(): void {
    this.effects = [];
    this.cpuLoadEstimate = 0.0;
  }

  /** 获取效果链长度 */
  public get length(): number {
    return this.effects.length;
  }

  /** 加载预设链 */
  public loadPreset(preset: ChainPreset): void {
    this.clear();
    switch (preset) {
      case ChainPreset.Guitar:
        this.loadGuitarChain();
        break;
      case ChainPreset.Vocal:
        this.loadVocalChain();
        break;
      case ChainPreset.Drum:
        this.loadDrumChain();
        break;
      case ChainPreset.Synth:
        this.loadSynthChain();
        break;
      case ChainPreset.Mastering:
        this.loadMasteringChain();
        break;
      case ChainPreset.Ambient:
        this.loadAmbientChain();
        break;
    }
  }

  /** 吉他效果链：压缩 → 失真 → 延迟 → 混响 */
  private loadGuitarChain(): void {
    const compressor: Compressor = new Compressor(
      { thresholdDb: -12, ratio: 4, attackMs: 5, releaseMs: 50 },
      this.sampleRate
    );
    const distortion: Distortion = new Distortion(
      { type: DistortionType.Tube, drive: 0.4, tone: 0.6 },
      this.sampleRate
    );
    const delay: Delay = new Delay({ delayMs: 350, feedback: 0.3, mix: 0.25, type: 'stereo' }, this.sampleRate);
    const reverb: ConvolutionReverb = new ConvolutionReverb(
      { reverbType: ReverbType.Room, rt60: 1.2, wetLevel: 0.2 },
      this.sampleRate
    );

    this.addEffect(compressor);
    this.addEffect(distortion);
    this.addEffect(delay);
    this.addEffect(reverb);
  }

  /** 人声效果链：EQ → 压缩 → 合唱 → 混响 */
  private loadVocalChain(): void {
    const eq: ParametricEQ = new ParametricEQ(5, this.sampleRate);
    eq.loadPreset(EQPreset.VocalBoost);

    const compressor: Compressor = new Compressor(
      { thresholdDb: -18, ratio: 3, attackMs: 8, releaseMs: 80, kneeDb: 6 },
      this.sampleRate
    );

    const chorus: Chorus = new Chorus(0.8, 0.3, 3, this.sampleRate);
    chorus.wet = 0.15;

    const reverb: ConvolutionReverb = new ConvolutionReverb(
      { reverbType: ReverbType.Hall, rt60: 2.0, preDelayMs: 25, wetLevel: 0.25 },
      this.sampleRate
    );

    this.addEffect(eq);
    this.addEffect(compressor);
    this.addEffect(chorus);
    this.addEffect(reverb);
  }

  /** 鼓效果链：门限 → 压缩 → 均衡 → 限制器 */
  private loadDrumChain(): void {
    const gate: ExpanderGate = new ExpanderGate(
      { thresholdDb: -50, floorDb: -80, isGate: true, attackMs: 0.1, releaseMs: 30 },
      this.sampleRate
    );

    const compressor: Compressor = new Compressor(
      { thresholdDb: -8, ratio: 6, attackMs: 2, releaseMs: 60, makeupGainDb: 3 },
      this.sampleRate
    );

    const eq: ParametricEQ = new ParametricEQ(5, this.sampleRate);
    eq.loadPreset(EQPreset.Rock);

    const limiter: Limiter = new Limiter({ thresholdDb: -2, lookaheadMs: 2 }, this.sampleRate);

    this.addEffect(gate);
    this.addEffect(compressor);
    this.addEffect(eq);
    this.addEffect(limiter);
  }

  /** 合成器效果链：合唱 → 延迟 → 混响 → 激励器 */
  private loadSynthChain(): void {
    const chorus: Chorus = new Chorus(0.3, 0.4, 4, this.sampleRate);
    chorus.wet = 0.25;

    const delay: Delay = new Delay({ delayMs: 250, feedback: 0.35, mix: 0.2, type: 'pingpong' }, this.sampleRate);

    const reverb: ConvolutionReverb = new ConvolutionReverb(
      { reverbType: ReverbType.Plate, rt60: 1.8, wetLevel: 0.3 },
      this.sampleRate
    );

    const exciter: Exciter = new Exciter(0.2, 2500.0, this.sampleRate);
    exciter.wet = 0.3;

    this.addEffect(chorus);
    this.addEffect(delay);
    this.addEffect(reverb);
    this.addEffect(exciter);
  }

  /** 母带效果链：EQ → 多段压缩 → 限制器 */
  private loadMasteringChain(): void {
    const eq: ParametricEQ = new ParametricEQ(8, this.sampleRate);
    eq.loadPreset(EQPreset.Flat);

    const multiband: MultibandCompressor = new MultibandCompressor(3, [250, 4000], this.sampleRate);
    multiband.setBandCompressor(0, { thresholdDb: -20, ratio: 2, attackMs: 20, releaseMs: 150 });
    multiband.setBandCompressor(1, { thresholdDb: -16, ratio: 3, attackMs: 15, releaseMs: 100 });
    multiband.setBandCompressor(2, { thresholdDb: -18, ratio: 2.5, attackMs: 10, releaseMs: 80 });

    const limiter: Limiter = new Limiter({ thresholdDb: -1.5, lookaheadMs: 5 }, this.sampleRate);

    this.addEffect(eq);
    this.addEffect(multiband);
    this.addEffect(limiter);
  }

  /** 环境效果链：延迟 → 合唱 → 混响 → 相位器 */
  private loadAmbientChain(): void {
    const delay: MultiTapDelay = new MultiTapDelay(
      [
        { delayMs: 200, gain: 0.5 },
        { delayMs: 400, gain: 0.35 },
        { delayMs: 600, gain: 0.2 },
        { delayMs: 800, gain: 0.1 },
      ],
      0.25,
      0.4,
      this.sampleRate
    );

    const chorus: Chorus = new Chorus(0.15, 0.6, 5, this.sampleRate);
    chorus.wet = 0.35;

    const reverb: ConvolutionReverb = new ConvolutionReverb(
      { reverbType: ReverbType.Church, rt60: 4.0, preDelayMs: 40, wetLevel: 0.45 },
      this.sampleRate
    );

    const phaser: Phaser = new Phaser(8, 0.1, 0.5, 0.4, this.sampleRate);
    phaser.wet = 0.2;

    this.addEffect(delay);
    this.addEffect(chorus);
    this.addEffect(reverb);
    this.addEffect(phaser);
  }

  /** CPU 负载估算（相对值 0.0 ~ 1.0） */
  private updateCpuEstimate(): void {
    let load: number = 0.0;
    for (const node of this.effects) {
      const name: string = node.effect.name;
      // 基于效果器复杂度的粗略估计
      switch (name) {
        case 'ConvolutionReverb':
          load += 0.25;
          break;
        case 'MultibandCompressor':
          load += 0.15;
          break;
        case 'GraphicEQ':
          load += 0.12;
          break;
        case 'ParametricEQ':
          load += 0.06;
          break;
        case 'Phaser':
        case 'Chorus':
        case 'Flanger':
          load += 0.05;
          break;
        case 'Vocoder':
          load += 0.2;
          break;
        case 'Distortion':
        case 'Compressor':
        case 'Limiter':
        case 'Delay':
        case 'MultiTapDelay':
          load += 0.03;
          break;
        default:
          load += 0.02;
      }
    }
    this.cpuLoadEstimate = Math.min(1.0, load);
  }

  public getCpuLoadEstimate(): number {
    return this.cpuLoadEstimate;
  }
}

// ============================================================================
// 工具函数
// ============================================================================

/** 创建立体声缓冲区 */
export function createStereoBuffer(length: number): StereoBuffer {
  return {
    left: new Float32Array(length),
    right: new Float32Array(length),
  };
}

/** 处理立体声块 */
export function processStereoBlock(
  effect: IAudioEffect,
  input: StereoBuffer,
  output: StereoBuffer
): void {
  const len: number = input.left.length;
  for (let i: number = 0; i < len; i++) {
    output.left[i] = effect.processSample(input.left[i], 0);
    output.right[i] = effect.processSample(input.right[i], 1);
  }
}

/** 生成测试正弦波 */
export function generateSineWave(frequency: number, durationSec: number, sampleRate: number = DEFAULT_SAMPLE_RATE): MonoBuffer {
  const length: number = Math.floor(durationSec * sampleRate);
  const buffer: MonoBuffer = new Float32Array(length);
  for (let i: number = 0; i < length; i++) {
    buffer[i] = Math.sin(2.0 * Math.PI * frequency * i / sampleRate);
  }
  return buffer;
}

/** 生成白噪声 */
export function generateWhiteNoise(durationSec: number, sampleRate: number = DEFAULT_SAMPLE_RATE): MonoBuffer {
  const length: number = Math.floor(durationSec * sampleRate);
  const buffer: MonoBuffer = new Float32Array(length);
  for (let i: number = 0; i < length; i++) {
    buffer[i] = Math.random() * 2.0 - 1.0;
  }
  return buffer;
}

/** 缓冲区拷贝 */
export function copyBuffer(src: MonoBuffer, dst: MonoBuffer): void {
  const len: number = Math.min(src.length, dst.length);
  for (let i: number = 0; i < len; i++) {
    dst[i] = src[i];
  }
}

/** 计算缓冲区 RMS 电平 */
export function calculateRMS(buffer: MonoBuffer): number {
  let sum: number = 0.0;
  for (let i: number = 0; i < buffer.length; i++) {
    sum += buffer[i] * buffer[i];
  }
  return Math.sqrt(sum / buffer.length);
}

/** 计算缓冲区峰值电平 */
export function calculatePeak(buffer: MonoBuffer): number {
  let peak: number = 0.0;
  for (let i: number = 0; i < buffer.length; i++) {
    peak = Math.max(peak, Math.abs(buffer[i]));
  }
  return peak;
}


