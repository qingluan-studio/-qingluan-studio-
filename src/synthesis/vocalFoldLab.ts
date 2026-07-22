/**
 * 声带实验室引擎 (Vocal Fold Lab Engine)
 * 基于 Ishizaka-Flanagan 双质量模型的精细物理仿真
 * 独立运行，可交互可视化，纯 TypeScript + PCM Float32Array
 */

// ==================== 接口定义 ====================

export interface VocalFoldParams {
  /** 声带长度 mm，默认 15（男声）/ 12（女声） */
  length: number;
  /** 声带厚度 mm，默认 3 */
  thickness: number;
  /** 声带深度 mm，默认 2 */
  depth: number;
  /** 声带张力 0-1，默认 0.5 */
  tension: number;
  /** 声带刚度 0-1，默认 0.5 */
  stiffness: number;
  /** 单位面积质量 mg/cm²，默认 20 */
  mass: number;
  /** 黏膜层质量占比 0-1，默认 0.3 */
  mucosalMassRatio: number;
  /** 黏膜层刚度 0-1，默认 0.2 */
  mucosalStiffness: number;
  /** 黏膜层阻尼 0-1，默认 0.15 */
  mucosalDamping: number;
  /** 声门下压力 kPa，默认 0.8 */
  subglottalPressure: number;
  /** 声带碰撞刚度，默认 0.8 */
  contactStiffness: number;
  /** 开放商 0-1，默认 0.5（ emergent，用于读数与提示） */
  openQuotient: number;
  /** 声门波不对称度 0-1，默认 0.3（ emergent，由黏膜参数主导） */
  skewness: number;
}

export interface VocalFoldState {
  /** 左声带上层位移 mm（0=休息位置，越大越靠近中线） */
  leftUpper: number;
  /** 左声带下层位移 mm */
  leftLower: number;
  /** 右声带上层位移 mm */
  rightUpper: number;
  /** 右声带下层位移 mm */
  rightLower: number;
  /** 声门面积 mm² */
  glottalArea: number;
  /** 气流速度 m/s */
  airflow: number;
}

// ==================== 物理常量 ====================

const RHO_AIR = 1.225; // 空气密度 kg/m³
const DEFAULT_SAMPLE_RATE = 44100;

// ==================== 声带实验室引擎 ====================

/** buildPhysics 返回的物理系数包 */
interface Physics {
  massLower: number;
  massUpper: number;
  kLower: number;
  kUpper: number;
  kCoupling: number;
  kContact: number;
  cLower: number;
  cUpper: number;
  Psub: number;
  restDispM: number;
  restDispMm: number;
  effArea: number;
  depthM: number;
  leakage: number;
  dt: number;
}

export class VocalFoldLab {
  private sampleRate: number;
  private dt: number;

  // 仿真历史（用于可视化）
  private history: Array<VocalFoldState & { time: number }> = [];

  // 运行状态（每步更新）
  private leftLowerX = 0;
  private leftLowerV = 0;
  private leftUpperX = 0;
  private leftUpperV = 0;
  private rightLowerX = 0;
  private rightLowerV = 0;
  private rightUpperX = 0;
  private rightUpperV = 0;

  constructor(sampleRate?: number) {
    this.sampleRate = sampleRate ?? DEFAULT_SAMPLE_RATE;
    this.dt = 1.0 / this.sampleRate;
  }

  // ---------- 核心：生成声门波 ----------

  /**
   * 根据参数生成指定时长的声门波（glottal flow waveform）
   * 物理模型自振荡，基频由张力/刚度/质量自然决定
   */
  generateGlottalWave(params: VocalFoldParams, duration: number): Float32Array {
    const samples = Math.floor(duration * this.sampleRate);
    const output = new Float32Array(samples);
    this.history = [];

    // 重置状态
    this.resetState();

    // 预仿真：丢弃前 50ms 让瞬态衰减，进入稳定极限环
    const warmupSamples = Math.floor(0.05 * this.sampleRate);
    const phy = this.buildPhysics(params);
    for (let i = 0; i < warmupSamples; i++) {
      this.stepPhysics(phy);
    }

    // 正式仿真
    for (let i = 0; i < samples; i++) {
      const state = this.stepPhysics(phy);
      // 声门波 = 体积速度 (m³/s)，转归一化音频幅度
      output[i] = state.volumeFlow;

      // 每 64 采样记录一帧状态（降低历史数据量）
      if (i % 64 === 0) {
        this.history.push({
          time: i / this.sampleRate,
          leftUpper: state.leftUpper,
          leftLower: state.leftLower,
          rightUpper: state.rightUpper,
          rightLower: state.rightLower,
          glottalArea: state.glottalArea,
          airflow: state.airflow,
        });
      }
    }

    this.normalizeAudio(output);
    return output;
  }

  /**
   * 生成带音高变化的声门波（模拟唱歌时的音高变化）
   * 通过实时调整张力来跟踪目标基频
   */
  generateSingingGlottalWave(
    params: VocalFoldParams,
    pitchContour: Array<{ time: number; freq: number }>
  ): Float32Array {
    if (pitchContour.length === 0) {
      return new Float32Array(0);
    }

    // 计算总时长
    const lastTime = pitchContour[pitchContour.length - 1].time;
    const samples = Math.floor(lastTime * this.sampleRate);
    const output = new Float32Array(samples);
    this.history = [];

    this.resetState();

    // 先做一次基线物理估计，得到当前参数的自然基频
    const basePhy = this.buildPhysics(params);
    const baseFreq = this.estimateNaturalFrequency(basePhy);

    // 构建逐采样目标频率曲线
    const targetF0 = new Float32Array(samples);
    for (let i = 0; i < samples; i++) {
      const t = i / this.sampleRate;
      targetF0[i] = this.interpolatePitchContour(t, pitchContour);
    }

    // 预仿真
    const warmupSamples = Math.floor(0.05 * this.sampleRate);
    let phy = basePhy;
    for (let i = 0; i < warmupSamples; i++) {
      const desired = targetF0[i] ?? targetF0[warmupSamples - 1];
      phy = this.retunePhysics(basePhy, baseFreq, desired);
      this.stepPhysics(phy);
    }

    // 正式仿真
    for (let i = 0; i < samples; i++) {
      const desired = targetF0[i];
      phy = this.retunePhysics(basePhy, baseFreq, desired);
      const state = this.stepPhysics(phy);
      output[i] = state.volumeFlow;

      if (i % 64 === 0) {
        this.history.push({
          time: i / this.sampleRate,
          leftUpper: state.leftUpper,
          leftLower: state.leftLower,
          rightUpper: state.rightUpper,
          rightLower: state.rightLower,
          glottalArea: state.glottalArea,
          airflow: state.airflow,
        });
      }
    }

    this.normalizeAudio(output);
    return output;
  }

  /** 获取每一帧的物理状态（用于可视化） */
  getSimulationHistory(): Array<VocalFoldState & { time: number }> {
    return this.history;
  }

  // ---------- 快速预设 ----------

  static MaleVoice(): VocalFoldParams {
    return {
      length: 15,
      thickness: 3.2,
      depth: 2.2,
      tension: 0.4,
      stiffness: 0.55,
      mass: 22,
      mucosalMassRatio: 0.3,
      mucosalStiffness: 0.2,
      mucosalDamping: 0.15,
      subglottalPressure: 0.8,
      contactStiffness: 0.8,
      openQuotient: 0.5,
      skewness: 0.3,
    };
  }

  static FemaleVoice(): VocalFoldParams {
    return {
      length: 12,
      thickness: 2.4,
      depth: 1.8,
      tension: 0.55,
      stiffness: 0.5,
      mass: 16,
      mucosalMassRatio: 0.35,
      mucosalStiffness: 0.22,
      mucosalDamping: 0.14,
      subglottalPressure: 0.75,
      contactStiffness: 0.75,
      openQuotient: 0.55,
      skewness: 0.35,
    };
  }

  static ChildVoice(): VocalFoldParams {
    return {
      length: 9,
      thickness: 2.0,
      depth: 1.5,
      tension: 0.5,
      stiffness: 0.45,
      mass: 12,
      mucosalMassRatio: 0.4,
      mucosalStiffness: 0.25,
      mucosalDamping: 0.13,
      subglottalPressure: 0.65,
      contactStiffness: 0.6,
      openQuotient: 0.6,
      skewness: 0.4,
    };
  }

  static FalsettoVoice(): VocalFoldParams {
    return {
      length: 14,
      thickness: 2.0,
      depth: 1.6,
      tension: 0.85,
      stiffness: 0.35,
      mass: 14,
      mucosalMassRatio: 0.5,
      mucosalStiffness: 0.15,
      mucosalDamping: 0.1,
      subglottalPressure: 0.6,
      contactStiffness: 0.3,
      openQuotient: 0.8,
      skewness: 0.5,
    };
  }

  static FryVoice(): VocalFoldParams {
    return {
      length: 16,
      thickness: 3.5,
      depth: 2.5,
      tension: 0.15,
      stiffness: 0.7,
      mass: 28,
      mucosalMassRatio: 0.25,
      mucosalStiffness: 0.3,
      mucosalDamping: 0.25,
      subglottalPressure: 0.4,
      contactStiffness: 0.9,
      openQuotient: 0.35,
      skewness: 0.2,
    };
  }

  static WhistleVoice(): VocalFoldParams {
    return {
      length: 11,
      thickness: 1.8,
      depth: 1.4,
      tension: 0.95,
      stiffness: 0.3,
      mass: 10,
      mucosalMassRatio: 0.55,
      mucosalStiffness: 0.12,
      mucosalDamping: 0.08,
      subglottalPressure: 1.2,
      contactStiffness: 0.2,
      openQuotient: 0.9,
      skewness: 0.6,
    };
  }

  static GrowlVoice(): VocalFoldParams {
    return {
      length: 15,
      thickness: 3.8,
      depth: 2.8,
      tension: 0.35,
      stiffness: 0.75,
      mass: 26,
      mucosalMassRatio: 0.28,
      mucosalStiffness: 0.35,
      mucosalDamping: 0.3,
      subglottalPressure: 1.4,
      contactStiffness: 1.0,
      openQuotient: 0.4,
      skewness: 0.25,
    };
  }

  static BreathyVoice(): VocalFoldParams {
    return {
      length: 14,
      thickness: 2.8,
      depth: 2.0,
      tension: 0.3,
      stiffness: 0.4,
      mass: 18,
      mucosalMassRatio: 0.45,
      mucosalStiffness: 0.18,
      mucosalDamping: 0.12,
      subglottalPressure: 0.5,
      contactStiffness: 0.25,
      openQuotient: 0.85,
      skewness: 0.45,
    };
  }

  // ==================== 私有物理引擎 ====================

  private resetState(): void {
    this.leftLowerX = 0;
    this.leftLowerV = 0;
    this.leftUpperX = 0;
    this.leftUpperV = 0;
    this.rightLowerX = 0;
    this.rightLowerV = 0;
    this.rightUpperX = 0;
    this.rightUpperV = 0;
  }

  /** 物理系数包 */
  private buildPhysics(params: VocalFoldParams) {
    // 几何：长度 mm -> m
    const lengthM = params.length * 1e-3;
    const depthM = params.depth * 1e-3;

    // 面积 cm² = (length * depth) / 100
    const areaCm2 = (params.length * params.depth) / 100;

    // 总质量 kg
    const totalMassKg = params.mass * areaCm2 * 1e-6;
    const massLower = totalMassKg * (1 - params.mucosalMassRatio);
    const massUpper = totalMassKg * params.mucosalMassRatio;

    // 张力因子：显著影响刚度与基频
    const tensionFactor = 0.2 + 3.0 * params.tension;

    // 基础刚度 N/m（按长度缩放）
    const baseK = (100 + params.stiffness * 4900) * lengthM;
    const kLower = baseK * tensionFactor;
    const kUpper = baseK * tensionFactor * params.mucosalStiffness;
    const kCoupling = baseK * 0.6;
    const kContact = baseK * params.contactStiffness * 8;

    // 阻尼
    const baseC = (0.002 + params.stiffness * 0.008) * lengthM;
    const cLower = baseC;
    const cUpper = baseC * params.mucosalDamping;

    // 压力 Pa
    const Psub = params.subglottalPressure * 1000;

    // 休息半宽 mm -> m
    const restDispMm = 0.3 + (1 - params.tension) * 1.2; // 0.3 ~ 1.5 mm
    const restDispM = restDispMm * 1e-3;

    // 有效气动面积（承受压力的投影面积）m²
    const effArea = lengthM * depthM;

    return {
      massLower,
      massUpper,
      kLower,
      kUpper,
      kCoupling,
      kContact,
      cLower,
      cUpper,
      Psub,
      restDispM,
      restDispMm,
      effArea,
      depthM,
      leakage: 0.001 + (1 - params.contactStiffness) * 0.005,
      dt: this.dt,
    };
  }

  /** 重新调谐物理参数以匹配目标基频 */
  private retunePhysics(base: Physics, baseFreq: number, targetFreq: number): Physics {
    if (baseFreq <= 0 || targetFreq <= 0) return base;
    const ratio = targetFreq / baseFreq;
    const scale = ratio * ratio; // 刚度 ∝ f²
    return {
      ...base,
      kLower: base.kLower * scale,
      kUpper: base.kUpper * scale,
      kCoupling: base.kCoupling * scale,
      kContact: base.kContact * scale,
    };
  }

  /** 估计自然基频（基于上层等效刚度/质量） */
  private estimateNaturalFrequency(phy: Physics): number {
    const kEff = phy.kUpper + phy.kCoupling;
    if (phy.massUpper <= 0 || kEff <= 0) return 100;
    return (1 / (2 * Math.PI)) * Math.sqrt(kEff / phy.massUpper);
  }

  /** 单步物理仿真 */
  private stepPhysics(phy: Physics): VocalFoldState & { volumeFlow: number } {
    const dt = phy.dt;

    // ---- 左声带 ----
    const left = this.stepSide(
      phy,
      this.leftLowerX,
      this.leftLowerV,
      this.leftUpperX,
      this.leftUpperV
    );
    this.leftLowerX = left.lowerX;
    this.leftLowerV = left.lowerV;
    this.leftUpperX = left.upperX;
    this.leftUpperV = left.upperV;

    // ---- 右声带（对称但独立，允许未来引入微扰/病理） ----
    const right = this.stepSide(
      phy,
      this.rightLowerX,
      this.rightLowerV,
      this.rightUpperX,
      this.rightUpperV
    );
    this.rightLowerX = right.lowerX;
    this.rightLowerV = right.lowerV;
    this.rightUpperX = right.upperX;
    this.rightUpperV = right.upperV;

    // ---- 声门几何 ----
    // 单侧剩余开度 mm
    const leftOpenMm = Math.max(0, phy.restDispMm - this.leftUpperX * 1e3);
    const rightOpenMm = Math.max(0, phy.restDispMm - this.rightUpperX * 1e3);
    // 总声门面积 mm² = 2 * depth * (平均剩余开度)
    const avgOpenMm = (leftOpenMm + rightOpenMm) * 0.5;
    const glottalAreaMm2 = 2 * (phy.depthM * 1e3) * avgOpenMm;
    const glottalAreaM2 = glottalAreaMm2 * 1e-6;

    // ---- 气流 ----
    let airflowVelocity = 0;
    let volumeFlow = 0;
    if (glottalAreaM2 > 1e-12) {
      const Cd = 0.82;
      airflowVelocity = Cd * Math.sqrt((2 * phy.Psub) / RHO_AIR);
      volumeFlow = airflowVelocity * glottalAreaM2;
    } else {
      // 泄漏流
      const leakageArea = phy.leakage * phy.effArea;
      airflowVelocity = phy.Psub * 0.001;
      volumeFlow = leakageArea * Math.sqrt((2 * phy.Psub) / RHO_AIR);
    }

    return {
      leftUpper: this.leftUpperX * 1e3,
      leftLower: this.leftLowerX * 1e3,
      rightUpper: this.rightUpperX * 1e3,
      rightLower: this.rightLowerX * 1e3,
      glottalArea: glottalAreaMm2,
      airflow: airflowVelocity,
      volumeFlow,
    };
  }

  /** 单步更新单侧（下层 + 上层） */
  private stepSide(
    phy: Physics,
    lowerX: number,
    lowerV: number,
    upperX: number,
    upperV: number
  ) {
    const dt = phy.dt;

    // ---- 下层（本体层）受力 ----
    // 弹簧恢复力（指向休息位置 x=0）
    const fSpringLower = -phy.kLower * lowerX;
    const fDampLower = -phy.cLower * lowerV;

    // 声门下压力：推开声带（与关闭方向相反 => 若 x 正方向为关闭，则压力为负）
    const fPressure = -phy.Psub * phy.effArea;

    // 伯努利吸合力：气流速度越高，吸力越大（指向关闭方向 => 正）
    // 简化：用跨声门压差近似
    const pressureDrop = phy.Psub * 0.5; // 声门消耗约一半压降
    const fBernoulli = pressureDrop * phy.effArea;

    // 碰撞：当位移超过休息半宽时，与对侧碰撞
    const penetration = lowerX - phy.restDispM;
    const fCollisionLower = penetration > 0 ? -phy.kContact * penetration : 0;

    const aLower = (fSpringLower + fDampLower + fPressure + fBernoulli + fCollisionLower) / phy.massLower;

    // ---- 上层（黏膜层）受力 ----
    // 下层耦合带动
    const fCoupling = phy.kCoupling * (lowerX - upperX);
    const fSpringUpper = -phy.kUpper * upperX;
    const fDampUpper = -phy.cUpper * upperV;

    // 碰撞（黏膜层更靠外，更早接触）
    const penUpper = upperX - phy.restDispM;
    const fCollisionUpper = penUpper > 0 ? -phy.kContact * penUpper : 0;

    const aUpper = (fCoupling + fSpringUpper + fDampUpper + fCollisionUpper) / phy.massUpper;

    // ---- 半隐式欧拉积分（提升稳定性） ----
    const newLowerV = lowerV + aLower * dt;
    const newLowerX = lowerX + newLowerV * dt;
    const newUpperV = upperV + aUpper * dt;
    const newUpperX = upperX + newUpperV * dt;

    return {
      lowerX: newLowerX,
      lowerV: newLowerV,
      upperX: newUpperX,
      upperV: newUpperV,
    };
  }

  /** 在音高轮廓上插值 */
  private interpolatePitchContour(
    t: number,
    contour: Array<{ time: number; freq: number }>
  ): number {
    if (t <= contour[0].time) return contour[0].freq;
    if (t >= contour[contour.length - 1].time) return contour[contour.length - 1].freq;

    for (let i = 0; i < contour.length - 1; i++) {
      const a = contour[i];
      const b = contour[i + 1];
      if (t >= a.time && t <= b.time) {
        const segT = (t - a.time) / (b.time - a.time);
        // 对频率做线性插值（更自然）
        return a.freq + segT * (b.freq - a.freq);
      }
    }
    return contour[contour.length - 1].freq;
  }

  /** 归一化音频缓冲区 */
  private normalizeAudio(buffer: Float32Array): void {
    let maxAmp = 0;
    for (let i = 0; i < buffer.length; i++) {
      const abs = Math.abs(buffer[i]);
      if (abs > maxAmp) maxAmp = abs;
    }
    if (maxAmp > 1e-10) {
      const scale = 1.0 / maxAmp;
      for (let i = 0; i < buffer.length; i++) {
        buffer[i] *= scale;
      }
    }
  }
}

// ==================== 便捷函数 ====================

/**
 * 直接生成声音：按目标基频自动调整张力
 */
export function synthesizeWithVocalFold(
  params: VocalFoldParams,
  pitchHz: number,
  duration: number,
  sampleRate?: number
): Float32Array {
  const lab = new VocalFoldLab(sampleRate);
  // 构造单点音高轮廓
  const contour = [
    { time: 0, freq: pitchHz },
    { time: duration, freq: pitchHz },
  ];
  return lab.generateSingingGlottalWave(params, contour);
}

// ==================== 声带-声道耦合 ====================

/**
 * 简化 Kelly-Lochbaum 波导 + 共振峰滤波器
 * 把声门波送入由 formants 定义的声道，输出辐射音频
 */
export function glottalToAcoustic(
  glottalWave: Float32Array,
  formants: number[],
  sampleRate: number
): Float32Array {
  const output = new Float32Array(glottalWave.length);

  // 按现有项目习惯：为每个共振峰建立二阶带通（双二阶）并级联
  const resonators: BiquadResonator[] = [];
  // 默认带宽与增益
  const defaultBandwidths = [60, 90, 120, 200, 300, 400];
  const defaultGains = [1.0, 0.85, 0.65, 0.45, 0.3, 0.2];

  for (let i = 0; i < formants.length; i++) {
    const r = new BiquadResonator();
    const bw = defaultBandwidths[i] ?? 300;
    const gain = defaultGains[i] ?? 0.2;
    r.setParams(formants[i], bw, sampleRate, gain);
    resonators.push(r);
  }

  // 一阶差分辐射滤波器（唇端辐射近似）
  let prev = 0;
  for (let i = 0; i < glottalWave.length; i++) {
    let sample = glottalWave[i];
    for (const r of resonators) {
      sample = r.process(sample);
    }
    // 辐射滤波器：一阶高通近似 y[n] = x[n] - x[n-1]
    const radiated = sample - prev;
    prev = sample;
    output[i] = radiated;
  }

  // 轻微去直流并标准化
  let mean = 0;
  for (let i = 0; i < output.length; i++) mean += output[i];
  mean /= output.length;
  for (let i = 0; i < output.length; i++) output[i] -= mean;

  let maxAmp = 0;
  for (let i = 0; i < output.length; i++) {
    const abs = Math.abs(output[i]);
    if (abs > maxAmp) maxAmp = abs;
  }
  if (maxAmp > 1e-10) {
    const scale = 1.0 / maxAmp;
    for (let i = 0; i < output.length; i++) output[i] *= scale;
  }

  return output;
}

// ==================== 内部工具：双二阶共振器 ====================

class BiquadResonator {
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;
  private a0 = 1;
  private a1 = 0;
  private a2 = 0;
  private b0 = 1;
  private b1 = 0;
  private b2 = 0;
  private gain = 1;

  setParams(frequency: number, bandwidth: number, sampleRate: number, gain = 1): void {
    const omega = (2 * Math.PI * frequency) / sampleRate;
    const sinOmega = Math.sin(omega);
    const cosOmega = Math.cos(omega);
    const alpha = sinOmega / (2 * (frequency / bandwidth));

    this.b0 = alpha;
    this.b1 = 0;
    this.b2 = -alpha;
    this.a0 = 1 + alpha;
    this.a1 = -2 * cosOmega;
    this.a2 = 1 - alpha;
    this.gain = gain;
  }

  process(input: number): number {
    const output = (this.b0 * input + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2) / this.a0;
    this.x2 = this.x1;
    this.x1 = input;
    this.y2 = this.y1;
    this.y1 = output;
    return output * this.gain;
  }
}
