/**
 * ============================================================
 * 模拟录音痕迹引擎 (Analog Recording Artifact Engine)
 * 给数字音频添加真实录音棚/模拟设备的痕迹，
 * 让AI音乐听起来像是从真实麦克风录制的。
 * ============================================================
 */

const SAMPLE_RATE: number = 44100;

// ============================================================================
// 配置接口
// ============================================================================

export interface ArtifactConfig {
  tapeSaturation?: number;    // 0-1，磁带饱和程度
  tubeWarmth?: number;        // 0-1，电子管温暖感
  hissLevel?: number;         // 0-1，白噪声底噪
  roomTone?: number;          // 0-1，房间环境底噪
  humLevel?: number;          // 0-1，50/60Hz 电源哼声
  wowFlutter?: number;        // 0-1，磁带音高微颤
  vinylCrackle?: number;      // 0-1，黑胶噼啪声
  bitCrush?: number;          // 0-1，轻微 bit reduction（模拟老旧设备）
  sampleRate: number;
}

// ============================================================================
// 内部工具函数
// ============================================================================

/** dB 转线性增益 */
function dbToGain(db: number): number {
  return Math.pow(10.0, db / 20.0);
}

/** 钳制数值范围 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** 生成白噪声 */
function generateWhiteNoise(length: number): Float32Array {
  const noise = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    noise[i] = Math.random() * 2.0 - 1.0;
  }
  return noise;
}

/** 生成粉噪声（简单 Voss-McCartney 近似） */
function generatePinkNoise(length: number): Float32Array {
  const noise = new Float32Array(length);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2.0 - 1.0;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.96900 * b2 + white * 0.1538520;
    b3 = 0.86650 * b3 + white * 0.3104856;
    b4 = 0.55000 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.0168980;
    noise[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
    b6 = white * 0.115926;
  }
  return noise;
}

/** 一阶 IIR 低通滤波器（状态保持） */
function lowpassFilter(input: Float32Array, cutoffHz: number, sampleRate: number): Float32Array {
  const output = new Float32Array(input.length);
  const rc = 1.0 / (2.0 * Math.PI * cutoffHz);
  const dt = 1.0 / sampleRate;
  const alpha = dt / (rc + dt);
  let y = input[0];
  for (let i = 0; i < input.length; i++) {
    y += alpha * (input[i] - y);
    output[i] = y;
  }
  return output;
}

/** 一阶 IIR 高通滤波器（状态保持） */
function highpassFilter(input: Float32Array, cutoffHz: number, sampleRate: number): Float32Array {
  const output = new Float32Array(input.length);
  const rc = 1.0 / (2.0 * Math.PI * cutoffHz);
  const dt = 1.0 / sampleRate;
  const alpha = rc / (rc + dt);
  let y = 0;
  let xPrev = input[0];
  for (let i = 0; i < input.length; i++) {
    y = alpha * (y + input[i] - xPrev);
    xPrev = input[i];
    output[i] = y;
  }
  return output;
}

/** 简单峰值滤波器（用于磁带低频提升） */
function lowShelfBoost(input: Float32Array, freq: number, gainDb: number, sampleRate: number): Float32Array {
  const output = new Float32Array(input.length);
  const A = Math.pow(10.0, gainDb / 40.0);
  const w0 = (2.0 * Math.PI * freq) / sampleRate;
  const cosw0 = Math.cos(w0);
  const sinw0 = Math.sin(w0);
  const S = 1.0;
  const alpha = sinw0 / 2.0 * Math.sqrt((A + 1.0 / A) * (1.0 / S - 1.0) + 2.0);

  const b0 = A * ((A + 1.0) - (A - 1.0) * cosw0 + 2.0 * Math.sqrt(A) * alpha);
  const b1 = 2.0 * A * ((A - 1.0) - (A + 1.0) * cosw0);
  const b2 = A * ((A + 1.0) - (A - 1.0) * cosw0 - 2.0 * Math.sqrt(A) * alpha);
  const a0 = (A + 1.0) + (A - 1.0) * cosw0 + 2.0 * Math.sqrt(A) * alpha;
  const a1 = -2.0 * ((A - 1.0) + (A + 1.0) * cosw0);
  const a2 = (A + 1.0) + (A - 1.0) * cosw0 - 2.0 * Math.sqrt(A) * alpha;

  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < input.length; i++) {
    const x = input[i];
    const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x;
    y2 = y1; y1 = y;
    output[i] = y;
  }
  return output;
}

// ============================================================================
// 模拟录音痕迹引擎主类
// ============================================================================

export class AnalogArtifactEngine {
  private config: Required<ArtifactConfig>;
  private humPhase: number = 0.0;
  private crackleTimer: number = 0.0;
  private wowFlutterDelayLine: Float32Array = new Float32Array(0);
  private wowFlutterWriteIndex: number = 0;

  constructor(config: ArtifactConfig) {
    this.config = {
      tapeSaturation: config.tapeSaturation ?? 0.0,
      tubeWarmth: config.tubeWarmth ?? 0.0,
      hissLevel: config.hissLevel ?? 0.0,
      roomTone: config.roomTone ?? 0.0,
      humLevel: config.humLevel ?? 0.0,
      wowFlutter: config.wowFlutter ?? 0.0,
      vinylCrackle: config.vinylCrackle ?? 0.0,
      bitCrush: config.bitCrush ?? 0.0,
      sampleRate: config.sampleRate ?? SAMPLE_RATE,
    };
  }

  // --------------------------------------------------------------------------
  // 核心处理
  // --------------------------------------------------------------------------

  public process(input: Float32Array): Float32Array {
    let output: Float32Array = input.slice();

    if (this.config.tapeSaturation > 0) {
      output = this.addTapeSaturation(output, this.config.tapeSaturation);
    }
    if (this.config.tubeWarmth > 0) {
      output = this.addTubeWarmth(output, this.config.tubeWarmth);
    }
    if (this.config.wowFlutter > 0) {
      output = this.addWowFlutter(output, this.config.wowFlutter);
    }
    if (this.config.bitCrush > 0) {
      output = this.addBitCrush(output, this.config.bitCrush);
    }
    if (this.config.humLevel > 0) {
      output = this.addHum(output, this.config.humLevel);
    }
    if (this.config.hissLevel > 0) {
      output = this.addHiss(output, this.config.hissLevel);
    }
    if (this.config.roomTone > 0) {
      output = this.addRoomTone(output, this.config.roomTone);
    }
    if (this.config.vinylCrackle > 0) {
      output = this.addVinylCrackle(output, this.config.vinylCrackle);
    }

    return output;
  }

  // --------------------------------------------------------------------------
  // 1. 磁带饱和
  // --------------------------------------------------------------------------

  public addTapeSaturation(input: Float32Array, amount: number): Float32Array {
    const amt = clamp(amount, 0.0, 1.0);
    if (amt <= 0.0) return input;

    const drive = 1.0 + amt * 9.0; // 1 ~ 10
    const norm = Math.tanh(drive);
    const output = new Float32Array(input.length);

    for (let i = 0; i < input.length; i++) {
      output[i] = Math.tanh(input[i] * drive) / norm;
    }

    // 轻微低频提升模拟磁带低频响应 (+1.5dB @ 100Hz)
    return lowShelfBoost(output, 100.0, 1.5, this.config.sampleRate);
  }

  // --------------------------------------------------------------------------
  // 2. 电子管温暖感
  // --------------------------------------------------------------------------

  public addTubeWarmth(input: Float32Array, amount: number): Float32Array {
    const amt = clamp(amount, 0.0, 1.0);
    if (amt <= 0.0) return input;

    const mix = amt * 0.4; // 湿信号不超过 40%，避免过度失真
    const output = new Float32Array(input.length);

    for (let i = 0; i < input.length; i++) {
      const x = input[i];
      let warmed: number;
      if (x >= 0.0) {
        warmed = Math.tanh(x);
      } else {
        warmed = Math.tanh(x * 1.2);
      }
      output[i] = x * (1.0 - mix) + warmed * mix;
    }

    // 一阶低通 @ 8kHz 滚降高频
    return lowpassFilter(output, 8000.0, this.config.sampleRate);
  }

  // --------------------------------------------------------------------------
  // 3. 底噪 (Hiss)
  // --------------------------------------------------------------------------

  public addHiss(input: Float32Array, level: number): Float32Array {
    const lvl = clamp(level, 0.0, 1.0);
    if (lvl <= 0.0) return input;

    // -60dB ~ -50dB
    const gain = dbToGain(-60.0 + lvl * 10.0);
    const noise = generateWhiteNoise(input.length);
    const filtered = highpassFilter(noise, 3000.0, this.config.sampleRate);

    const output = new Float32Array(input.length);
    for (let i = 0; i < input.length; i++) {
      output[i] = input[i] + filtered[i] * gain;
    }
    return output;
  }

  // --------------------------------------------------------------------------
  // 4. 房间环境底噪 (Room Tone)
  // --------------------------------------------------------------------------

  public addRoomTone(input: Float32Array, level: number): Float32Array {
    const lvl = clamp(level, 0.0, 1.0);
    if (lvl <= 0.0) return input;

    // 粉噪声低通到 500Hz，约 -70dB
    const gain = dbToGain(-70.0 + lvl * 5.0);
    const noise = generatePinkNoise(input.length);
    const filtered = lowpassFilter(noise, 500.0, this.config.sampleRate);

    const output = new Float32Array(input.length);
    for (let i = 0; i < input.length; i++) {
      output[i] = input[i] + filtered[i] * gain;
    }

    // 极轻微混响尾音（pre-delay 20ms，rt60 0.3s）
    return this.addSimpleReverbTail(output, 0.02, 0.3, 0.03 * lvl);
  }

  private addSimpleReverbTail(input: Float32Array, preDelaySec: number, rt60: number, wetLevel: number): Float32Array {
    if (wetLevel <= 0.0) return input;
    const preDelaySamples = Math.round(preDelaySec * this.config.sampleRate);
    const decay = Math.pow(10.0, -3.0 / (rt60 * this.config.sampleRate)); // 每 sample 衰减
    const output = new Float32Array(input.length);

    // 使用简单梳状滤波器组近似混响
    const combDelays = [1200, 1600, 2100, 2600];
    const combGains = [0.35, 0.30, 0.28, 0.25];
    const combs: Float32Array[] = combDelays.map(d => new Float32Array(d));
    const combIndices = [0, 0, 0, 0];

    for (let i = 0; i < input.length; i++) {
      let reverb = 0.0;
      for (let c = 0; c < combs.length; c++) {
        const d = combDelays[c];
        const idx = combIndices[c];
        const fb = combs[c][idx] * combGains[c] * decay;
        const inSample = (i >= preDelaySamples) ? input[i - preDelaySamples] : 0.0;
        combs[c][idx] = inSample + fb;
        reverb += combs[c][idx];
        combIndices[c] = (idx + 1) % d;
      }
      output[i] = input[i] + reverb * wetLevel * 0.25;
    }

    return output;
  }

  // --------------------------------------------------------------------------
  // 5. 电源哼声 (Hum)
  // --------------------------------------------------------------------------

  public addHum(input: Float32Array, level: number, freq: number = 50.0): Float32Array {
    const lvl = clamp(level, 0.0, 1.0);
    if (lvl <= 0.0) return input;

    // -80dB ~ -70dB
    const gain = dbToGain(-80.0 + lvl * 10.0);
    const output = new Float32Array(input.length);
    const sr = this.config.sampleRate;

    for (let i = 0; i < input.length; i++) {
      const t = this.humPhase / sr;
      // 基波 + 3次 + 5次谐波
      let hum = Math.sin(2.0 * Math.PI * freq * t);
      hum += 0.3 * Math.sin(2.0 * Math.PI * freq * 3.0 * t);
      hum += 0.15 * Math.sin(2.0 * Math.PI * freq * 5.0 * t);
      output[i] = input[i] + hum * gain;
      this.humPhase += 1;
    }

    return output;
  }

  // --------------------------------------------------------------------------
  // 6. 磁带抖动 (Wow & Flutter)
  // --------------------------------------------------------------------------

  public addWowFlutter(input: Float32Array, amount: number): Float32Array {
    const amt = clamp(amount, 0.0, 1.0);
    if (amt <= 0.0) return input;

    const sr = this.config.sampleRate;
    // Wow: 0.5-5 Hz，±10 cents
    const wowFreq = 1.5 + Math.random() * 2.0;
    const wowDepth = amt * 0.0015; // 约 ±10 cents 对应的延迟变化
    // Flutter: 5-15 Hz，±3 cents
    const flutterFreq = 7.0 + Math.random() * 5.0;
    const flutterDepth = amt * 0.0005;

    const maxDelaySamples = Math.ceil((wowDepth + flutterDepth) * sr) + 4;
    const delayLine = this.ensureDelayLine(maxDelaySamples * 2 + input.length);

    // 先写入输入到延迟线
    for (let i = 0; i < input.length; i++) {
      delayLine[this.wowFlutterWriteIndex] = input[i];
      this.wowFlutterWriteIndex = (this.wowFlutterWriteIndex + 1) % delayLine.length;
    }

    const output = new Float32Array(input.length);
    let readIndex = (this.wowFlutterWriteIndex - input.length + delayLine.length) % delayLine.length;

    for (let i = 0; i < input.length; i++) {
      const t = i / sr;
      const modDelay = wowDepth * sr * Math.sin(2.0 * Math.PI * wowFreq * t)
                     + flutterDepth * sr * Math.sin(2.0 * Math.PI * flutterFreq * t);
      const totalDelay = maxDelaySamples + modDelay;
      const readPos = (readIndex + totalDelay) % delayLine.length;
      const i0 = Math.floor(readPos);
      const frac = readPos - i0;
      const s0 = delayLine[i0 % delayLine.length];
      const s1 = delayLine[(i0 + 1) % delayLine.length];
      output[i] = s0 + frac * (s1 - s0);

      readIndex = (readIndex + 1) % delayLine.length;
    }

    return output;
  }

  private ensureDelayLine(size: number): Float32Array {
    if (this.wowFlutterDelayLine.length < size) {
      const newLine = new Float32Array(size);
      // 迁移旧数据
      for (let i = 0; i < this.wowFlutterDelayLine.length; i++) {
        newLine[i] = this.wowFlutterDelayLine[i];
      }
      this.wowFlutterDelayLine = newLine;
    }
    return this.wowFlutterDelayLine;
  }

  // --------------------------------------------------------------------------
  // 7. 黑胶噼啪声 (Vinyl Crackle)
  // --------------------------------------------------------------------------

  public addVinylCrackle(input: Float32Array, level: number): Float32Array {
    const lvl = clamp(level, 0.0, 1.0);
    if (lvl <= 0.0) return input;

    // -50dB ~ -40dB
    const gain = dbToGain(-50.0 + lvl * 10.0);
    const output = new Float32Array(input);
    const sr = this.config.sampleRate;

    // 平均每秒 2-5 个 pop
    const avgInterval = sr / (2.0 + lvl * 3.0);

    for (let i = 0; i < input.length; i++) {
      this.crackleTimer -= 1.0;
      if (this.crackleTimer <= 0.0) {
        // 生成一个 pop
        const popDuration = Math.round(0.001 * sr); // 约 1ms
        const popAmp = gain * (0.5 + Math.random() * 0.5);
        for (let p = 0; p < popDuration; p++) {
          const idx = i + p;
          if (idx >= input.length) break;
          const decay = Math.exp(-p / (popDuration * 0.3));
          output[idx] += popAmp * decay * (Math.random() * 2.0 - 1.0);
        }
        // 指数分布重置计时器
        this.crackleTimer = -avgInterval * Math.log(Math.random());
      }
    }

    return output;
  }

  // --------------------------------------------------------------------------
  // 8. 轻微 Bit Reduction
  // --------------------------------------------------------------------------

  public addBitCrush(input: Float32Array, amount: number): Float32Array {
    const amt = clamp(amount, 0.0, 1.0);
    if (amt <= 0.0) return input;

    // 12 ~ 14 bits
    const bits = 14.0 - amt * 2.0;
    const levels = Math.pow(2.0, bits - 1.0);
    const output = new Float32Array(input.length);

    for (let i = 0; i < input.length; i++) {
      output[i] = Math.round(input[i] * levels) / levels;
    }

    return output;
  }
}

// ============================================================================
// 便捷函数
// ============================================================================

/** 一键添加"录音棚感" — 温和的磁带饱和 + 电子管温暖 + 轻微底噪 + 房间感 */
export function addStudioFeel(input: Float32Array, sampleRate: number, intensity: number = 0.5): Float32Array {
  const inten = clamp(intensity, 0.0, 1.0);
  const engine = new AnalogArtifactEngine({
    sampleRate,
    tapeSaturation: inten * 0.35,
    tubeWarmth: inten * 0.4,
    hissLevel: inten * 0.2,
    roomTone: inten * 0.25,
    humLevel: inten * 0.1,
    wowFlutter: inten * 0.15,
    vinylCrackle: 0.0,
    bitCrush: inten * 0.1,
  });
  return engine.process(input);
}

/** 一键添加"磁带感" — 较强的磁带饱和 + 抖动 + 底噪 + 轻微 bit reduction */
export function addTapeFeel(input: Float32Array, sampleRate: number, intensity: number = 0.6): Float32Array {
  const inten = clamp(intensity, 0.0, 1.0);
  const engine = new AnalogArtifactEngine({
    sampleRate,
    tapeSaturation: inten * 0.7,
    tubeWarmth: inten * 0.3,
    hissLevel: inten * 0.4,
    roomTone: inten * 0.15,
    humLevel: inten * 0.15,
    wowFlutter: inten * 0.5,
    vinylCrackle: 0.0,
    bitCrush: inten * 0.25,
  });
  return engine.process(input);
}

/** 一键添加"黑胶感" — 黑胶噼啪 + 哼声 + 轻微饱和 + 房间感 */
export function addVinylFeel(input: Float32Array, sampleRate: number, intensity: number = 0.5): Float32Array {
  const inten = clamp(intensity, 0.0, 1.0);
  const engine = new AnalogArtifactEngine({
    sampleRate,
    tapeSaturation: inten * 0.2,
    tubeWarmth: inten * 0.3,
    hissLevel: inten * 0.25,
    roomTone: inten * 0.3,
    humLevel: inten * 0.2,
    wowFlutter: inten * 0.3,
    vinylCrackle: inten * 0.6,
    bitCrush: 0.0,
  });
  return engine.process(input);
}
