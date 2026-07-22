// ============================================================
// 青鸾 DAW — 人性化演奏引擎 (Humanization Engine)
// ============================================================
// 核心目标：让AI生成的音乐在快手/抖音等平台上无法被识别为AI音乐
// 核心哲学：演奏者的不完美是有规律的、符合人类习惯的，不是纯随机噪声
// 驱动力：
//   • 时间微偏移（连贯的加速/减速，非纯随机）
//   • 力度呼吸感（乐句起伏，强拍重弱拍轻）
//   • 音高微漂移（弦乐/管乐/钢琴的不同滑入特征）
//   • 连奏/断奏随机化（模拟手指离开琴键的差异）
//   • 律动模板（swing/shuffle/latin/funk）
// ============================================================

const SAMPLE_RATE = 44100;

// ═════════════════════════════════════════════════════════════
// Part 0: 公共工具
// ═════════════════════════════════════════════════════════════

/** 可复现的伪随机数生成器 (Mulberry32 变体) */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Perlin fade 曲线: 6t^5 - 15t^4 + 10t^3 */
function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/** Box-Muller 高斯分布随机数 */
function gaussianRandom(rand: () => number): number {
  let u = 0, v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

// ═════════════════════════════════════════════════════════════
// Part 1: 一维 Perlin 噪声
// ═════════════════════════════════════════════════════════════

class Perlin1D {
  private perm: number[];

  constructor(seed: number) {
    const p = new Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    const r = rng(seed);
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      const tmp = p[i];
      p[i] = p[j];
      p[j] = tmp;
    }
    // 重复排列数组以避免边界检查
    this.perm = p.concat(p);
  }

  /** 采样一维 Perlin 噪声，输入 x 可为任意实数，输出约 [-1, 1] */
  noise(x: number): number {
    const xi = Math.floor(x);
    const xf = x - xi;
    const xi0 = xi & 255;
    const xi1 = (xi + 1) & 255;

    const u = fade(xf);

    // 一维梯度：将 hash 映射到 [-1, 1] 的斜率
    const g0 = ((this.perm[xi0] & 0x7f) / 64) - 1;
    const g1 = ((this.perm[xi1] & 0x7f) / 64) - 1;

    // 点积：gradient * (samplePoint - gridPoint)
    const n0 = g0 * xf;
    const n1 = g1 * (xf - 1);

    return lerp(n0, n1, u);
  }
}

// ═════════════════════════════════════════════════════════════
// Part 2: 接口定义
// ═════════════════════════════════════════════════════════════

export interface HumanizationParams {
  timingVariance?: number;      // 时间偏移量（秒），默认 0.008（8ms）
  timingSeed?: number;          // 随机种子，确保可复现
  velocityVariance?: number;    // 力度变化范围 0-1，默认 0.12
  velocityCurve?: 'linear' | 'gaussian' | 'perlin'; // 力度变化曲线
  pitchDrift?: number;          // 音高微漂移（cents），默认 5
  articulationNoise?: number;   // articulation 随机化程度 0-1，默认 0.3
  swingAmount?: number;         // 摇摆感 0-1，默认 0（爵士/布鲁斯可用0.2-0.3）
  grooveTemplate?: 'straight' | 'shuffle' | 'swing' | 'latin' | 'funk'; // 律动模板
}

export interface NoteEvent {
  midi: number;
  startTime: number;
  duration: number;
  velocity: number;
}

// ═════════════════════════════════════════════════════════════
// Part 3: 律动模板数据
// 每个模板为16长度数组，对应一小节内16个16分音符位置的相对偏移比例（相对于一拍）
// ═════════════════════════════════════════════════════════════

export const GrooveTemplates: Record<string, number[]> = {
  // 平直：无偏移
  straight: [
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
  ],

  // Shuffle：三连音 feel，每拍后半部分（第2个8分音符）整体后推 1/6 拍
  shuffle: [
    0,    0,    0.167, 0.167,
    0,    0,    0.167, 0.167,
    0,    0,    0.167, 0.167,
    0,    0,    0.167, 0.167,
  ],

  // Swing：爵士摇摆，后推更强烈（1/4 拍）
  swing: [
    0,    0,    0.25, 0.25,
    0,    0,    0.25, 0.25,
    0,    0,    0.25, 0.25,
    0,    0,    0.25, 0.25,
  ],

  // Latin：基于 clave 节奏型的微小前后偏移，制造推动感
  latin: [
    -0.03, 0,     0,     0,
     0.02, 0,     0,    -0.02,
     0,     0.025, 0,     0,
    -0.02,  0,     0,     0,
  ],

  // Funk：第16分音符（每拍最后一个位置）前移，制造 ghost note 紧迫感
  funk: [
    0,     0,     0,    -0.12,
    0,     0,     0,    -0.08,
    0,     0,     0,    -0.12,
    0,     0,     0,    -0.08,
  ],
};

const defaultParams: Required<HumanizationParams> = {
  timingVariance: 0.008,
  timingSeed: 12345,
  velocityVariance: 0.12,
  velocityCurve: 'gaussian',
  pitchDrift: 5,
  articulationNoise: 0.3,
  swingAmount: 0,
  grooveTemplate: 'straight',
};

// ═════════════════════════════════════════════════════════════
// Part 4: 人性化演奏引擎
// ═════════════════════════════════════════════════════════════

export class HumanizationEngine {
  private _seed: number;
  private _rand: () => number;

  constructor(seed?: number) {
    this._seed = seed ?? defaultParams.timingSeed;
    this._rand = rng(this._seed);
  }

  private rng(): number {
    return this._rand();
  }

  /** 从音符序列推断每拍时长（秒），默认回退到 0.5s = 120 BPM */
  private _inferBeatDuration(notes: NoteEvent[]): number {
    if (notes.length < 2) return 0.5;

    const diffs: number[] = [];
    const sorted = [...notes].sort((a, b) => a.startTime - b.startTime);

    for (let i = 1; i < sorted.length; i++) {
      const d = sorted[i].startTime - sorted[i - 1].startTime;
      if (d > 0.001) diffs.push(d);
    }

    if (diffs.length === 0) return 0.5;

    diffs.sort((a, b) => a - b);
    const minDiff = diffs[0];

    // 若最小差值较大，说明音符较稀疏
    if (minDiff > 0.3) return minDiff;          // 可能本身就是一拍
    if (minDiff > 0.15) return minDiff * 2;     // 可能是半拍（8分音符）

    return minDiff * 4;                          // 最小差值为16分音符 -> 一拍
  }

  /** 判断某时刻是否落在强拍（downbeat）上，容差 0.08 拍 */
  private _isDownbeat(startTime: number, beatDur: number): boolean {
    const beatPos = (startTime / beatDur) % 4; // 0~4，对应小节内4拍
    const distToNearestBeat = Math.abs(beatPos - Math.round(beatPos));
    return distToNearestBeat < 0.08;
  }

  // ───────────────────────────────────────────────────────────
  // 核心：给一组音符添加人性化特征
  // ───────────────────────────────────────────────────────────

  humanize(notes: NoteEvent[], params?: HumanizationParams): NoteEvent[] {
    const p = { ...defaultParams, ...params };

    // 1. 先应用宏观律动模板
    let result = this.applyGroove(notes, p.grooveTemplate, 1.0);

    // 2. 时间人性化（包含 swing）
    result = this.humanizeTiming(result, p.timingVariance, p.swingAmount);

    // 3. 力度人性化
    result = this.humanizeVelocity(result, p.velocityVariance, p.velocityCurve);

    // 4. 连奏/断奏人性化
    result = this.humanizeArticulation(result, p.articulationNoise);

    // 5. 音高人性化（返回带 pitchBend 的扩展类型）
    const pitched = this.humanizePitch(result, p.pitchDrift);

    return pitched;
  }

  // ───────────────────────────────────────────────────────────
  // 时间人性化：给音符起始时间添加微偏移
  // ───────────────────────────────────────────────────────────

  humanizeTiming(notes: NoteEvent[], varianceSec?: number, swing?: number): NoteEvent[] {
    const v = varianceSec ?? defaultParams.timingVariance;
    const sw = swing ?? defaultParams.swingAmount;
    if (v <= 0 && sw <= 0) return notes.map(n => ({ ...n }));

    const perlin = new Perlin1D(this._seed + 100);
    const result = notes.map(n => ({ ...n }));
    const beatDur = this._inferBeatDuration(notes);

    for (let i = 0; i < result.length; i++) {
      const note = result[i];

      // Perlin 噪声提供趋势连贯性（真人不会忽快忽慢，而是连续加速/减速）
      const pNoise = perlin.noise(i * 0.45 + note.startTime * 8);

      // 高斯分布提供微观随机
      const gNoise = gaussianRandom(() => this.rng());

      // 混合：Perlin 主导趋势（60%），高斯补充细节（40%）
      let offset = (pNoise * 0.6 + gNoise * 0.4) * v;

      // 强拍（downbeat）偏移较小：真人对强拍把握更准
      if (this._isDownbeat(note.startTime, beatDur)) {
        offset *= 0.45;
      } else {
        // 弱拍偏移稍微放大
        offset *= 1.15;
      }

      // Swing：偶数拍（第2、4拍，1-based）向后推
      const beatIndex = Math.floor((note.startTime / beatDur) % 4 + 0.5); // 0,1,2,3
      if (sw > 0 && (beatIndex === 1 || beatIndex === 3)) {
        // 将偶数拍整体后推，最大不超过半拍
        offset += sw * beatDur * 0.45;
      }

      note.startTime = Math.max(0, note.startTime + offset);
    }

    return result;
  }

  // ───────────────────────────────────────────────────────────
  // 力度人性化：让力度有呼吸感
  // ───────────────────────────────────────────────────────────

  humanizeVelocity(notes: NoteEvent[], variance?: number, curve?: string): NoteEvent[] {
    const v = variance ?? defaultParams.velocityVariance;
    const c = curve ?? defaultParams.velocityCurve;
    if (v <= 0) return notes.map(n => ({ ...n }));

    const perlin = new Perlin1D(this._seed + 200);
    const result = notes.map(n => ({ ...n }));
    const beatDur = this._inferBeatDuration(notes);

    // 乐句长度：每 4 小节（16拍）为一个呼吸周期
    const phraseLength = beatDur * 16;

    for (let i = 0; i < result.length; i++) {
      const note = result[i];
      let delta = 0;

      if (c === 'perlin') {
        delta = perlin.noise(i * 0.35 + note.startTime * 4) * v;
      } else if (c === 'gaussian') {
        delta = gaussianRandom(() => this.rng()) * v * 0.55;
      } else {
        // linear：均匀分布
        delta = (this.rng() * 2 - 1) * v;
      }

      // 呼吸感曲线：乐句开头稍弱（吸气），中间渐强，结尾渐弱（呼气）
      if (phraseLength > 0) {
        const phrasePos = (note.startTime % phraseLength) / phraseLength;
        // 正弦包络：0 -> 1 -> 0，中心在乐句中间
        const breath = Math.sin(phrasePos * Math.PI);
        delta += (breath - 0.5) * v * 0.35;
      }

      // 强拍自然偏重，弱拍偏轻
      const beatPos = (note.startTime / beatDur) % 1;
      if (beatPos < 0.25) {
        delta += v * 0.12; // 拍头
      } else if (beatPos > 0.75) {
        delta -= v * 0.06; // 拍尾
      }

      note.velocity = clamp(note.velocity + delta, 0.02, 1.0);
    }

    return result;
  }

  // ───────────────────────────────────────────────────────────
  // 音高人性化：模拟真人演奏的音准偏移
  // ───────────────────────────────────────────────────────────

  humanizePitch(
    notes: NoteEvent[],
    driftCents?: number,
  ): Array<NoteEvent & { pitchBend?: number }> {
    const d = driftCents ?? defaultParams.pitchDrift;
    if (d <= 0) return notes.map(n => ({ ...n }));

    const perlin = new Perlin1D(this._seed + 300);
    const result = notes.map((n, i) => {
      const copy = { ...n, pitchBend: 0 };
      const typeRand = rng(this._seed + i * 7919)(); // 独立 deterministic 序列

      let bend = 0;

      if (typeRand < 0.65) {
        // 弦乐/人声风格（65%）：音高从下方滑入，残余偏移偏负
        const noise = perlin.noise(i * 0.75 + n.startTime * 6);
        bend = -Math.abs(noise * d * 0.7) - (this.rng() * d * 0.15);
      } else if (typeRand < 0.85) {
        // 管乐风格（20%）：音高从上方滑入，残余偏移偏正
        const noise = perlin.noise(i * 0.75 + n.startTime * 6);
        bend = Math.abs(noise * d * 0.6) + (this.rng() * d * 0.12);
      } else {
        // 钢琴风格（15%）：几乎无漂移，极微小偏移 ±2 cents
        const noise = perlin.noise(i * 1.1 + n.startTime * 9);
        bend = noise * Math.min(d, 2.0) * 0.5;
      }

      // 模拟音高稳定过程：指数衰减后的残余偏移
      // 大部分音符会稳定在一个接近 0 但非 0 的偏移上
      const stableOffset = perlin.noise(i * 1.4 + 50) * d * 0.25;
      bend = bend * 0.25 + stableOffset;

      copy.pitchBend = clamp(bend, -d * 1.5, d * 1.5);
      return copy;
    });

    return result;
  }

  // ───────────────────────────────────────────────────────────
  // 连奏/断奏人性化：模拟手指离开琴键的差异
  // ───────────────────────────────────────────────────────────

  humanizeArticulation(notes: NoteEvent[], noiseLevel?: number): NoteEvent[] {
    const level = noiseLevel ?? defaultParams.articulationNoise;
    if (level <= 0) return notes.map(n => ({ ...n }));

    const result = notes.map(n => ({ ...n }));

    for (let i = 0; i < result.length - 1; i++) {
      const curr = result[i];
      const next = result[i + 1];
      const gap = next.startTime - (curr.startTime + curr.duration);

      // 仅处理接近或已重叠的相邻音符（时间距离 < 30ms）
      if (Math.abs(gap) > 0.03) continue;

      if (curr.midi === next.midi) {
        // 同音高：70% 概率连奏，30% 概率重新击键
        if (this.rng() < 0.7 * level) {
          // 连奏：当前音符延长至下一个音符起始，并轻微重叠 5-15ms
          const overlap = 0.005 + this.rng() * 0.01;
          curr.duration = next.startTime - curr.startTime + overlap;
        } else {
          // 重新击键：制造断开感，缩短当前音符 10-20%
          curr.duration *= (0.8 + this.rng() * 0.1);
        }
      } else {
        // 不同音高：20% 概率添加极短滑音（portamento，10-30ms 重叠）
        if (this.rng() < 0.2 * level) {
          const portamento = 0.01 + this.rng() * 0.02;
          curr.duration = next.startTime - curr.startTime + portamento;
        }
      }

      // 随机缩短部分音符（模拟手指提前离开琴键）
      if (this.rng() < 0.12 * level) {
        curr.duration *= (0.88 + this.rng() * 0.1); // 缩短 2-12%
      }
    }

    // 最后一个音符也可能被轻微缩短
    if (result.length > 0 && this.rng() < 0.08 * level) {
      const last = result[result.length - 1];
      last.duration *= (0.9 + this.rng() * 0.08);
    }

    return result;
  }

  // ───────────────────────────────────────────────────────────
  // 应用律动模板
  // ───────────────────────────────────────────────────────────

  applyGroove(notes: NoteEvent[], template?: string, amount?: number): NoteEvent[] {
    const t = template ?? 'straight';
    const amt = amount ?? 1.0;
    if (t === 'straight' || amt <= 0) return notes.map(n => ({ ...n }));

    const tpl = GrooveTemplates[t];
    if (!tpl || tpl.length === 0) return notes.map(n => ({ ...n }));

    const beatDur = this._inferBeatDuration(notes);
    const result = notes.map(n => ({ ...n }));

    for (const note of result) {
      // 计算音符在 beat 内的相位
      const beatPhase = (note.startTime / beatDur) % 1;
      // 映射到 16 分音符网格索引（0-15）
      const gridIndex = clamp(Math.round(beatPhase * 16), 0, 15);
      // 应用模板偏移
      const offset = tpl[gridIndex] * beatDur * amt;
      note.startTime = Math.max(0, note.startTime + offset);
    }

    return result;
  }
}

// ═════════════════════════════════════════════════════════════
// Part 5: 全局便捷函数
// ═════════════════════════════════════════════════════════════

export function humanizeNotes(
  notes: NoteEvent[],
  params?: HumanizationParams,
): NoteEvent[] {
  const engine = new HumanizationEngine(params?.timingSeed);
  return engine.humanize(notes, params);
}
