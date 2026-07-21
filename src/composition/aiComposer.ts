/**
 * AI作曲编曲引擎
 * 非传统方法：马尔可夫链、遗传进化、分形、混沌、量子概率、细胞自动机、智能编曲
 */

// ============================================================
// 第一部分：基础类型与公共接口
// ============================================================

/** 音符事件 */
export interface NoteEvent {
  /** MIDI音高编号（0-127） */
  pitch: number;
  /** 时值（MIDI tick，PPQ=480下四分音符=480） */
  duration: number;
  /** 力度（0-127） */
  velocity: number;
  /** 起始偏移（tick） */
  offset: number;
}

/** 旋律线（音符事件序列） */
export interface MelodyLine {
  /** 音符序列 */
  notes: NoteEvent[];
  /** 声部名称 */
  voiceName: string;
  /** 通道号 */
  channel: number;
}

/** MIDI序列（用于马尔可夫链训练） */
export interface MIDISequence {
  /** 音符事件列表 */
  events: NoteEvent[];
  /** 拍号分子 */
  beatsPerMeasure: number;
  /** 拍号分母 */
  beatUnit: number;
  /** 速度BPM */
  bpm: number;
}

/** 转移矩阵键值对 */
export interface TransitionEntry {
  /** 后继状态 */
  next: number;
  /** 转移概率 */
  probability: number;
}

/** 节奏型标记 */
export type RhythmLabel = 'whole' | 'half' | 'quarter' | 'eighth' | 'sixteenth' | 'dotted_half' | 'dotted_quarter' | 'triplet_quarter' | 'triplet_eighth';

/** 节奏时值映射（PPQ=480） */
export const RHYTHM_DURATIONS: Record<RhythmLabel, number> = {
  whole: 1920,
  half: 960,
  quarter: 480,
  eighth: 240,
  sixteenth: 120,
  dotted_half: 1440,
  dotted_quarter: 720,
  triplet_quarter: 320,
  triplet_eighth: 160,
};

/** 音乐风格预设 */
export type MusicStyle = 'pop' | 'rock' | 'jazz' | 'electronic' | 'classical' | 'folk' | 'r_and_b' | 'metal';

/** 风格预设配置 */
export interface StylePreset {
  /** 风格标识 */
  style: MusicStyle;
  /** 中文名称 */
  nameCN: string;
  /** 默认BPM范围 */
  bpmRange: [number, number];
  /** 常用音阶 */
  preferredScales: string[];
  /** 和弦偏好 */
  chordPreferences: string[];
  /** 鼓组模式标签 */
  drumPatternLabel: string;
  /** 低音风格 */
  bassStyle: 'root_note' | 'walking' | 'ostinato' | 'arpeggio' | 'power_chord';
  /** 描述 */
  description: string;
}

/** 风格预设数据库 */
export const STYLE_PRESETS: Record<MusicStyle, StylePreset> = {
  pop: {
    style: 'pop', nameCN: '流行',
    bpmRange: [90, 130],
    preferredScales: ['major', 'natural_minor', 'pentatonic'],
    chordPreferences: ['I-V-vi-IV', 'vi-IV-I-V'],
    drumPatternLabel: 'Pop Basic',
    bassStyle: 'root_note',
    description: '流行音乐：简洁旋律+四和弦循环+直拍鼓点',
  },
  rock: {
    style: 'rock', nameCN: '摇滚',
    bpmRange: [100, 160],
    preferredScales: ['major', 'natural_minor', 'blues', 'mixolydian'],
    chordPreferences: ['I-IV-V', 'I-bVII-IV'],
    drumPatternLabel: 'Rock Basic',
    bassStyle: 'power_chord',
    description: '摇滚：力量感驱动的节奏+布鲁斯元素+失真吉他',
  },
  jazz: {
    style: 'jazz', nameCN: '爵士',
    bpmRange: [100, 200],
    preferredScales: ['dorian', 'mixolydian', 'lydian', 'blues', 'major'],
    chordPreferences: ['ii-V-I', 'I-vi-ii-V'],
    drumPatternLabel: 'Jazz Ride',
    bassStyle: 'walking',
    description: '爵士：即兴精神+swing节奏+复杂和声+漫步低音',
  },
  electronic: {
    style: 'electronic', nameCN: '电子',
    bpmRange: [120, 150],
    preferredScales: ['natural_minor', 'blues', 'pentatonic', 'dorian'],
    chordPreferences: ['i-VI-VII-III', 'i-iv-VI-VII'],
    drumPatternLabel: 'EDM Four on Floor',
    bassStyle: 'ostinato',
    description: '电子音乐：四拍底鼓+合成器低音+重复律动',
  },
  classical: {
    style: 'classical', nameCN: '古典',
    bpmRange: [60, 180],
    preferredScales: ['major', 'harmonic_minor', 'natural_minor', 'melodic_minor'],
    chordPreferences: ['I-IV-V-I', 'I-vi-IV-V-I'],
    drumPatternLabel: 'Waltz',
    bassStyle: 'arpeggio',
    description: '古典：功能性和声+旋律对位+丰富织体',
  },
  folk: {
    style: 'folk', nameCN: '民谣',
    bpmRange: [80, 140],
    preferredScales: ['major', 'natural_minor', 'pentatonic'],
    chordPreferences: ['I-IV-V', 'I-V-vi-IV'],
    drumPatternLabel: 'Country Train Beat',
    bassStyle: 'root_note',
    description: '民谣：叙事性旋律+简洁和弦+自然节奏',
  },
  r_and_b: {
    style: 'r_and_b', nameCN: 'R&B',
    bpmRange: [70, 110],
    preferredScales: ['dorian', 'natural_minor', 'pentatonic', 'blues'],
    chordPreferences: ['i-iv-VII-III', 'ii-V-I-vi'],
    drumPatternLabel: 'Hip Hop',
    bassStyle: 'ostinato',
    description: 'R&B：律动感+切分节奏+丰满和声+深情旋律',
  },
  metal: {
    style: 'metal', nameCN: '金属',
    bpmRange: [120, 200],
    preferredScales: ['natural_minor', 'harmonic_minor', 'phrygian', 'blues'],
    chordPreferences: ['i-bVI-bVII-i', 'i-iv-V-i'],
    drumPatternLabel: 'Rock Double-time',
    bassStyle: 'power_chord',
    description: '金属：高速节奏+小调暗黑色彩+密集鼓点+强力低音',
  },
};

/** 编曲输出结果 */
export interface ArrangementResult {
  /** 主旋律 */
  melody: MelodyLine;
  /** 和声声部 */
  harmony: MelodyLine;
  /** 低音声部 */
  bass: MelodyLine;
  /** 鼓组 */
  drums: MelodyLine;
  /** 填充（过门） */
  fills: MelodyLine;
  /** 使用的风格 */
  style: MusicStyle;
  /** 总时长（tick） */
  totalDuration: number;
}

/** 确定性伪随机数生成器 */
export class SeededRandom {
  private state: number;

  constructor(seed: number = 42) {
    this.state = seed & 0x7fffffff;
    if (this.state === 0) this.state = 1;
  }

  /** 返回[0,1)均匀分布随机数 */
  next(): number {
    this.state = (this.state * 1103515245 + 12345) & 0x7fffffff;
    return this.state / 0x7fffffff;
  }

  /** 返回[min,max]区间整数 */
  nextInt(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** 返回均值为mu、标准差为sigma的高斯随机数（Box-Muller） */
  gaussian(mu: number = 0, sigma: number = 1): number {
    const u1 = this.next();
    const u2 = this.next();
    const z = Math.sqrt(-2 * Math.log(u1 + 1e-10)) * Math.cos(2 * Math.PI * u2);
    return mu + sigma * z;
  }

  /** 按权重随机选择索引 */
  weightedChoice(weights: number[]): number {
    const total = weights.reduce((a, b) => a + b, 0);
    if (total <= 0) return 0;
    let r = this.next() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r <= 0) return i;
    }
    return weights.length - 1;
  }

  /** 洗牌（Fisher-Yates） */
  shuffle<T>(arr: T[]): T[] {
    const result = [...arr];
    for (let i = result.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i);
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
}

// ============================================================
// 第二部分：马尔可夫链作曲
// ============================================================

/** 马尔可夫链阶数 */
export type MarkovOrder = 1 | 2 | 3;

/** 马尔可夫链配置 */
export interface MarkovConfig {
  /** 链阶数 */
  order: MarkovOrder;
  /** 生成音符数量 */
  noteCount: number;
  /** 起始MIDI音高 */
  startPitch: number;
  /** 起始时值（tick） */
  startDuration: number;
  /** 音高范围下限 */
  pitchMin: number;
  /** 音高范围上限 */
  pitchMax: number;
  /** 随机种子 */
  seed: number;
}

/** 一阶马尔可夫转移矩阵 */
export interface MarkovTransitionMatrix1 {
  /** 音高转移表：key=当前音高值(value=next→probability) */
  pitch: Map<number, TransitionEntry[]>;
  /** 时值转移表 */
  duration: Map<number, TransitionEntry[]>;
}

/** 二阶马尔可夫转移矩阵 */
export interface MarkovTransitionMatrix2 {
  /** key为"前两个音高拼接" */
  pitch: Map<string, TransitionEntry[]>;
  duration: Map<string, TransitionEntry[]>;
}

/** 三阶马尔可夫转移矩阵 */
export interface MarkovTransitionMatrix3 {
  /** key为"前三个音高拼接" */
  pitch: Map<string, TransitionEntry[]>;
  duration: Map<string, TransitionEntry[]>;
}

/** 马尔可夫链混合配置 */
export interface MarkovMixConfig {
  /** 各链的权重 */
  weights: number[];
  /** 各链的配置 */
  configs: MarkovConfig[];
}

/** 从MIDI序列中提取音高序列和时值序列 */
export function extractPitchDurationPairs(seq: MIDISequence): { pitches: number[]; durations: number[] } {
  const sorted = [...seq.events].sort((a, b) => a.offset - b.offset);
  return {
    pitches: sorted.map(e => e.pitch),
    durations: sorted.map(e => e.duration),
  };
}

/** 量化音高到音级（12半音一组，减少状态空间） */
export function quantizePitch(pitch: number, bins: number = 12): number {
  return ((pitch % bins) + bins) % bins;
}

/** 量化时值到最近的节奏型 */
export function quantizeDuration(duration: number): number {
  const candidates = Object.values(RHYTHM_DURATIONS);
  let best = candidates[0];
  let bestDist = Math.abs(duration - best);
  for (const c of candidates) {
    const d = Math.abs(duration - c);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}

/** 从音高序列构建一阶转移矩阵 */
export function buildFirstOrderMatrix(pitches: number[]): MarkovTransitionMatrix1 {
  const pitchTrans = new Map<number, Map<number, number>>();
  const durTrans = new Map<number, Map<number, number>>();

  for (let i = 0; i < pitches.length - 1; i++) {
    const curr = pitches[i];
    const next = pitches[i + 1];
    if (!pitchTrans.has(curr)) pitchTrans.set(curr, new Map());
    const inner = pitchTrans.get(curr)!;
    inner.set(next, (inner.get(next) ?? 0) + 1);
    // 时值用音高差作为代理键
    const currDur = quantizeDuration(pitches[i]);
    const nextDur = quantizeDuration(pitches[i + 1]);
    if (!durTrans.has(currDur)) durTrans.set(currDur, new Map());
    const dInner = durTrans.get(currDur)!;
    dInner.set(nextDur, (dInner.get(nextDur) ?? 0) + 1);
  }

  const normalizeMap = (m: Map<number, Map<number, number>>): Map<number, TransitionEntry[]> => {
    const result = new Map<number, TransitionEntry[]>();
    for (const [key, inner] of m) {
      let total = 0;
      for (const count of inner.values()) total += count;
      const entries: TransitionEntry[] = [];
      for (const [next, count] of inner) {
        entries.push({ next, probability: count / total });
      }
      entries.sort((a, b) => b.probability - a.probability);
      result.set(key, entries);
    }
    return result;
  };

  return {
    pitch: normalizeMap(pitchTrans),
    duration: normalizeMap(durTrans),
  };
}

/** 从音高序列构建二阶转移矩阵 */
export function buildSecondOrderMatrix(pitches: number[]): MarkovTransitionMatrix2 {
  const pitchTrans = new Map<string, Map<number, number>>();

  for (let i = 0; i < pitches.length - 2; i++) {
    const key = `${pitches[i]},${pitches[i + 1]}`;
    const next = pitches[i + 2];
    if (!pitchTrans.has(key)) pitchTrans.set(key, new Map());
    const inner = pitchTrans.get(key)!;
    inner.set(next, (inner.get(next) ?? 0) + 1);
  }

  const normalizeStrMap = (m: Map<string, Map<number, number>>): Map<string, TransitionEntry[]> => {
    const result = new Map<string, TransitionEntry[]>();
    for (const [key, inner] of m) {
      let total = 0;
      for (const count of inner.values()) total += count;
      const entries: TransitionEntry[] = [];
      for (const [next, count] of inner) {
        entries.push({ next, probability: count / total });
      }
      entries.sort((a, b) => b.probability - a.probability);
      result.set(key, entries);
    }
    return result;
  };

  return {
    pitch: normalizeStrMap(pitchTrans),
    duration: new Map<string, TransitionEntry[]>(),
  };
}

/** 从音高序列构建三阶转移矩阵 */
export function buildThirdOrderMatrix(pitches: number[]): MarkovTransitionMatrix3 {
  const pitchTrans = new Map<string, Map<number, number>>();

  for (let i = 0; i < pitches.length - 3; i++) {
    const key = `${pitches[i]},${pitches[i + 1]},${pitches[i + 2]}`;
    const next = pitches[i + 3];
    if (!pitchTrans.has(key)) pitchTrans.set(key, new Map());
    const inner = pitchTrans.get(key)!;
    inner.set(next, (inner.get(next) ?? 0) + 1);
  }

  const normalizeStrMap = (m: Map<string, Map<number, number>>): Map<string, TransitionEntry[]> => {
    const result = new Map<string, TransitionEntry[]>();
    for (const [key, inner] of m) {
      let total = 0;
      for (const count of inner.values()) total += count;
      const entries: TransitionEntry[] = [];
      for (const [next, count] of inner) {
        entries.push({ next, probability: count / total });
      }
      entries.sort((a, b) => b.probability - a.probability);
      result.set(key, entries);
    }
    return result;
  };

  return {
    pitch: normalizeStrMap(pitchTrans),
    duration: new Map<string, TransitionEntry[]>(),
  };
}

/** 根据转移表采样下一个状态 */
export function sampleFromTransitions(entries: TransitionEntry[], rng: SeededRandom): number {
  if (entries.length === 0) return 60; // 默认中央C
  const r = rng.next();
  let cumulative = 0;
  for (const entry of entries) {
    cumulative += entry.probability;
    if (r <= cumulative) return entry.next;
  }
  return entries[entries.length - 1].next;
}

/** 使用一阶马尔可夫链生成旋律 */
export function generateMarkov1(
  matrix: MarkovTransitionMatrix1,
  config: MarkovConfig
): NoteEvent[] {
  const rng = new SeededRandom(config.seed);
  const notes: NoteEvent[] = [];
  let currentPitch = config.startPitch;
  let currentDuration = config.startDuration;
  let offset = 0;

  for (let i = 0; i < config.noteCount; i++) {
    const velocity = Math.min(127, Math.max(1, Math.round(rng.gaussian(80, 15))));

    notes.push({
      pitch: Math.min(config.pitchMax, Math.max(config.pitchMin, currentPitch)),
      duration: currentDuration,
      velocity,
      offset,
    });

    // 音高转移
    const pitchEntries = matrix.pitch.get(currentPitch);
    if (pitchEntries) {
      currentPitch = sampleFromTransitions(pitchEntries, rng);
    } else {
      // 未知状态：随机游走
      currentPitch += rng.nextInt(-2, 2);
    }
    currentPitch = Math.min(config.pitchMax, Math.max(config.pitchMin, currentPitch));

    // 时值转移
    const durEntries = matrix.duration.get(currentDuration);
    if (durEntries) {
      currentDuration = sampleFromTransitions(durEntries, rng);
    }
    currentDuration = Math.max(60, currentDuration);

    offset += currentDuration;
  }

  return notes;
}

/** 使用二阶马尔可夫链生成旋律 */
export function generateMarkov2(
  matrix: MarkovTransitionMatrix2,
  config: MarkovConfig,
  prevPitches: [number, number]
): NoteEvent[] {
  const rng = new SeededRandom(config.seed);
  const notes: NoteEvent[] = [];
  let p1 = prevPitches[0];
  let p2 = prevPitches[1];
  let offset = 0;

  for (let i = 0; i < config.noteCount; i++) {
    const velocity = Math.min(127, Math.max(1, Math.round(rng.gaussian(80, 15))));
    notes.push({
      pitch: Math.min(config.pitchMax, Math.max(config.pitchMin, p2)),
      duration: RHYTHM_DURATIONS.quarter,
      velocity,
      offset,
    });

    const key = `${p1},${p2}`;
    const entries = matrix.pitch.get(key);
    if (entries) {
      const next = sampleFromTransitions(entries, rng);
      p1 = p2;
      p2 = next;
    } else {
      p1 = p2;
      p2 += rng.nextInt(-2, 2);
    }
    p2 = Math.min(config.pitchMax, Math.max(config.pitchMin, p2));
    offset += RHYTHM_DURATIONS.quarter;
  }

  return notes;
}

/** 使用三阶马尔可夫链生成旋律 */
export function generateMarkov3(
  matrix: MarkovTransitionMatrix3,
  config: MarkovConfig,
  prevPitches: [number, number, number]
): NoteEvent[] {
  const rng = new SeededRandom(config.seed);
  const notes: NoteEvent[] = [];
  let p1 = prevPitches[0];
  let p2 = prevPitches[1];
  let p3 = prevPitches[2];
  let offset = 0;

  for (let i = 0; i < config.noteCount; i++) {
    const velocity = Math.min(127, Math.max(1, Math.round(rng.gaussian(80, 15))));
    notes.push({
      pitch: Math.min(config.pitchMax, Math.max(config.pitchMin, p3)),
      duration: RHYTHM_DURATIONS.quarter,
      velocity,
      offset,
    });

    const key = `${p1},${p2},${p3}`;
    const entries = matrix.pitch.get(key);
    if (entries) {
      const next = sampleFromTransitions(entries, rng);
      p1 = p2;
      p2 = p3;
      p3 = next;
    } else {
      p1 = p2;
      p2 = p3;
      p3 += rng.nextInt(-2, 2);
    }
    p3 = Math.min(config.pitchMax, Math.max(config.pitchMin, p3));
    offset += RHYTHM_DURATIONS.quarter;
  }

  return notes;
}

/** 链混合：多个马尔可夫链加权融合 */
export function markovChainBlend(
  sequences: NoteEvent[][],
  weights: number[],
  config: MarkovConfig
): NoteEvent[] {
  if (sequences.length === 0 || sequences.length !== weights.length) return [];
  const rng = new SeededRandom(config.seed);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const normalizedWeights = weights.map(w => w / totalWeight);

  const noteCount = config.noteCount;
  const result: NoteEvent[] = [];
  let offset = 0;

  // 计算每个序列的累积权重
  const cumWeights: number[] = [];
  let cum = 0;
  for (const w of normalizedWeights) {
    cum += w;
    cumWeights.push(cum);
  }

  for (let i = 0; i < noteCount; i++) {
    // 按权重选择来源序列
    const r = rng.next();
    let seqIdx = 0;
    for (let j = 0; j < cumWeights.length; j++) {
      if (r <= cumWeights[j]) {
        seqIdx = j;
        break;
      }
    }

    const seq = sequences[seqIdx];
    const noteIdx = i % seq.length;
    const srcNote = seq[noteIdx];

    // 加入随机扰动
    const pitchJitter = Math.round(rng.gaussian(0, 1));
    const velJitter = Math.round(rng.gaussian(0, 5));

    result.push({
      pitch: Math.min(config.pitchMax, Math.max(config.pitchMin, srcNote.pitch + pitchJitter)),
      duration: srcNote.duration,
      velocity: Math.min(127, Math.max(1, srcNote.velocity + velJitter)),
      offset,
    });

    offset += srcNote.duration;
  }

  return result;
}

/** 从MIDI序列训练并生成旋律（完整流程） */
export function trainAndGenerate(
  trainingData: MIDISequence[],
  config: MarkovConfig
): NoteEvent[] {
  const allPitches: number[] = [];
  for (const seq of trainingData) {
    const { pitches } = extractPitchDurationPairs(seq);
    allPitches.push(...pitches);
  }

  const matrix = buildFirstOrderMatrix(allPitches);
  return generateMarkov1(matrix, config);
}

// ============================================================
// 第三部分：遗传进化作曲
// ============================================================

/** 遗传算法染色体：一组音符基因 */
export interface Chromosome {
  /** 基因序列（音高+时值+力度） */
  genes: Gene[];
  /** 适应度值 */
  fitness: number;
  /** 多目标适应度向量 */
  objectives: FitnessObjectives;
  /** 拥挤距离（NSGA-II用） */
  crowdingDistance: number;
  /** 支配等级（NSGA-II用） */
  rank: number;
}

/** 单个基因（一个音符的编码） */
export interface Gene {
  /** MIDI音高 */
  pitch: number;
  /** 时值（tick） */
  duration: number;
  /** 力度 */
  velocity: number;
}

/** 多目标适应度 */
export interface FitnessObjectives {
  /** 旋律流畅度（越大越好） */
  smoothness: number;
  /** 和声协和度（越大越好） */
  harmony: number;
  /** 节奏多样性（越大越好） */
  rhythmDiversity: number;
  /** 音域合理性（越大越好） */
  rangeReasonability: number;
}

/** 遗传算法配置 */
export interface GAConfig {
  /** 种群大小 */
  populationSize: number;
  /** 最大代数 */
  maxGenerations: number;
  /** 交叉概率 */
  crossoverRate: number;
  /** 变异概率 */
  mutationRate: number;
  /** 精英保留数量 */
  eliteCount: number;
  /** 锦标赛大小 */
  tournamentSize: number;
  /** 音高范围下限 */
  pitchMin: number;
  /** 音高范围上限 */
  pitchMax: number;
  /** 染色体长度（音符数） */
  chromosomeLength: number;
  /** 参考和弦根音（MIDI） */
  chordRoots: number[];
  /** 随机种子 */
  seed: number;
}

/** 默认遗传算法配置 */
export const DEFAULT_GA_CONFIG: GAConfig = {
  populationSize: 100,
  maxGenerations: 200,
  crossoverRate: 0.8,
  mutationRate: 0.1,
  eliteCount: 5,
  tournamentSize: 5,
  pitchMin: 48,
  pitchMax: 84,
  chromosomeLength: 16,
  chordRoots: [60, 64, 67], // C大三和弦
  seed: 42,
};

/** 计算旋律流畅度（相邻音高变化越小越流畅） */
export function fitnessSmoothness(genes: Gene[]): number {
  if (genes.length < 2) return 1;
  let totalInterval = 0;
  for (let i = 1; i < genes.length; i++) {
    totalInterval += Math.abs(genes[i].pitch - genes[i - 1].pitch);
  }
  const avgInterval = totalInterval / (genes.length - 1);
  // 平均音程3-4半音最流畅，惩罚大跳
  return 1 / (1 + Math.abs(avgInterval - 3));
}

/** 计算和声协和度（相对参考和弦） */
export function fitnessHarmony(genes: Gene[], chordRoots: number[]): number {
  const chordPCs = new Set(chordRoots.map(r => r % 12));
  let consonantCount = 0;
  for (const gene of genes) {
    if (chordPCs.has(gene.pitch % 12)) {
      consonantCount++;
    }
  }
  return consonantCount / genes.length;
}

/** 计算节奏多样性（时值种类数/总时值种类） */
export function fitnessRhythmDiversity(genes: Gene[]): number {
  const uniqueDurations = new Set(genes.map(g => g.duration));
  const allDurations = Object.values(RHYTHM_DURATIONS).length;
  return uniqueDurations.size / allDurations;
}

/** 计算音域合理性 */
export function fitnessRangeReasonability(genes: Gene[], min: number, max: number): number {
  if (genes.length === 0) return 0;
  const pitches = genes.map(g => g.pitch);
  const lo = Math.min(...pitches);
  const hi = Math.max(...pitches);
  const span = hi - lo;
  // 2个八度(24半音)内最合理
  const idealSpan = 24;
  const rangePenalty = Math.abs(span - idealSpan) / idealSpan;
  // 检查是否在允许范围内
  const outOfRange = pitches.filter(p => p < min || p > max).length;
  const rangeViolation = outOfRange / pitches.length;
  return Math.max(0, 1 - rangePenalty - rangeViolation);
}

/** 计算综合适应度 */
export function evaluateFitness(chromosome: Chromosome, config: GAConfig): FitnessObjectives {
  const genes = chromosome.genes;
  return {
    smoothness: fitnessSmoothness(genes),
    harmony: fitnessHarmony(genes, config.chordRoots),
    rhythmDiversity: fitnessRhythmDiversity(genes),
    rangeReasonability: fitnessRangeReasonability(genes, config.pitchMin, config.pitchMax),
  };
}

/** 随机生成一条染色体 */
export function randomChromosome(config: GAConfig, rng: SeededRandom): Chromosome {
  const genes: Gene[] = [];
  const durations = Object.values(RHYTHM_DURATIONS);

  for (let i = 0; i < config.chromosomeLength; i++) {
    genes.push({
      pitch: rng.nextInt(config.pitchMin, config.pitchMax),
      duration: durations[rng.nextInt(0, durations.length - 1)],
      velocity: rng.nextInt(60, 110),
    });
  }

  return {
    genes,
    fitness: 0,
    objectives: { smoothness: 0, harmony: 0, rhythmDiversity: 0, rangeReasonability: 0 },
    crowdingDistance: 0,
    rank: 0,
  };
}

/** 初始化种群 */
export function initializePopulation(config: GAConfig): Chromosome[] {
  const rng = new SeededRandom(config.seed);
  const population: Chromosome[] = [];
  for (let i = 0; i < config.populationSize; i++) {
    population.push(randomChromosome(config, rng));
  }
  return population;
}

/** 锦标赛选择 */
export function tournamentSelection(population: Chromosome[], tournamentSize: number, rng: SeededRandom): Chromosome {
  let best: Chromosome | null = null;
  for (let i = 0; i < tournamentSize; i++) {
    const idx = rng.nextInt(0, population.length - 1);
    const candidate = population[idx];
    if (!best || candidate.fitness > best.fitness) {
      best = candidate;
    }
  }
  return best!;
}

/** 轮盘赌选择 */
export function rouletteSelection(population: Chromosome[], rng: SeededRandom): Chromosome {
  const totalFitness = population.reduce((s, c) => s + Math.max(c.fitness, 0.001), 0);
  let r = rng.next() * totalFitness;
  for (const chrom of population) {
    r -= Math.max(chrom.fitness, 0.001);
    if (r <= 0) return chrom;
  }
  return population[population.length - 1];
}

/** 单点交叉 */
export function singlePointCrossover(parent1: Chromosome, parent2: Chromosome, rng: SeededRandom): [Chromosome, Chromosome] {
  const point = rng.nextInt(1, parent1.genes.length - 1);
  const child1Genes = [...parent1.genes.slice(0, point), ...parent2.genes.slice(point)];
  const child2Genes = [...parent2.genes.slice(0, point), ...parent1.genes.slice(point)];

  const makeChild = (genes: Gene[]): Chromosome => ({
    genes,
    fitness: 0,
    objectives: { smoothness: 0, harmony: 0, rhythmDiversity: 0, rangeReasonability: 0 },
    crowdingDistance: 0,
    rank: 0,
  });

  return [makeChild(child1Genes), makeChild(child2Genes)];
}

/** 均匀交叉 */
export function uniformCrossover(parent1: Chromosome, parent2: Chromosome, rng: SeededRandom): [Chromosome, Chromosome] {
  const child1Genes: Gene[] = [];
  const child2Genes: Gene[] = [];

  for (let i = 0; i < parent1.genes.length; i++) {
    if (rng.next() < 0.5) {
      child1Genes.push({ ...parent1.genes[i] });
      child2Genes.push({ ...parent2.genes[i] });
    } else {
      child1Genes.push({ ...parent2.genes[i] });
      child2Genes.push({ ...parent1.genes[i] });
    }
  }

  const makeChild = (genes: Gene[]): Chromosome => ({
    genes,
    fitness: 0,
    objectives: { smoothness: 0, harmony: 0, rhythmDiversity: 0, rangeReasonability: 0 },
    crowdingDistance: 0,
    rank: 0,
  });

  return [makeChild(child1Genes), makeChild(child2Genes)];
}

/** 音高变异 */
export function mutatePitch(gene: Gene, rng: SeededRandom, range: [number, number]): Gene {
  const shift = Math.round(rng.gaussian(0, 3));
  return {
    ...gene,
    pitch: Math.min(range[1], Math.max(range[0], gene.pitch + shift)),
  };
}

/** 时值变异 */
export function mutateDuration(gene: Gene, rng: SeededRandom): Gene {
  const durations = Object.values(RHYTHM_DURATIONS);
  const idx = rng.nextInt(0, durations.length - 1);
  return { ...gene, duration: durations[idx] };
}

/** 倒置变异（音高反转） */
export function mutateInversion(genes: Gene[], center: number): Gene[] {
  return genes.map(g => ({
    ...g,
    pitch: 2 * center - g.pitch,
  }));
}

/** 应用变异操作 */
export function applyMutation(chromosome: Chromosome, config: GAConfig, rng: SeededRandom): Chromosome {
  const mutatedGenes = chromosome.genes.map(gene => {
    let g = { ...gene };
    if (rng.next() < config.mutationRate) {
      g = mutatePitch(g, rng, [config.pitchMin, config.pitchMax]);
    }
    if (rng.next() < config.mutationRate) {
      g = mutateDuration(g, rng);
    }
    return g;
  });

  // 低概率倒置变异
  if (rng.next() < config.mutationRate * 0.3) {
    const center = Math.round((config.pitchMin + config.pitchMax) / 2);
    return {
      genes: mutateInversion(mutatedGenes, center),
      fitness: 0,
      objectives: { smoothness: 0, harmony: 0, rhythmDiversity: 0, rangeReasonability: 0 },
      crowdingDistance: 0,
      rank: 0,
    };
  }

  return {
    genes: mutatedGenes,
    fitness: 0,
    objectives: { smoothness: 0, harmony: 0, rhythmDiversity: 0, rangeReasonability: 0 },
    crowdingDistance: 0,
    rank: 0,
  };
}

/** NSGA-II 非支配排序 */
export function fastNonDominatedSort(population: Chromosome[]): Chromosome[][] {
  const fronts: Chromosome[][] = [[]];
  const dominatedBy = new Map<Chromosome, Chromosome[]>();
  const dominateCount = new Map<Chromosome, number>();

  for (const p of population) {
    dominatedBy.set(p, []);
    dominateCount.set(p, 0);
  }

  for (let i = 0; i < population.length; i++) {
    for (let j = i + 1; j < population.length; j++) {
      const p = population[i];
      const q = population[j];
      if (dominates(p, q)) {
        dominatedBy.get(p)!.push(q);
        dominateCount.set(q, (dominateCount.get(q) ?? 0) + 1);
      } else if (dominates(q, p)) {
        dominatedBy.get(q)!.push(p);
        dominateCount.set(p, (dominateCount.get(p) ?? 0) + 1);
      }
    }
  }

  for (const p of population) {
    if ((dominateCount.get(p) ?? 0) === 0) {
      p.rank = 0;
      fronts[0].push(p);
    }
  }

  let i = 0;
  while (fronts[i].length > 0) {
    const nextFront: Chromosome[] = [];
    for (const p of fronts[i]) {
      for (const q of dominatedBy.get(p) ?? []) {
        const newCount = (dominateCount.get(q) ?? 1) - 1;
        dominateCount.set(q, newCount);
        if (newCount === 0) {
          q.rank = i + 1;
          nextFront.push(q);
        }
      }
    }
    i++;
    fronts.push(nextFront);
  }

  return fronts.slice(0, fronts.length - 1); // 去掉最后的空front
}

/** 判断p是否支配q（多目标） */
export function dominates(p: Chromosome, q: Chromosome): boolean {
  const objP = p.objectives;
  const objQ = q.objectives;
  const keys = ['smoothness', 'harmony', 'rhythmDiversity', 'rangeReasonability'] as const;
  let atLeastOneBetter = false;
  for (const key of keys) {
    if (objP[key] < objQ[key]) return false;
    if (objP[key] > objQ[key]) atLeastOneBetter = true;
  }
  return atLeastOneBetter;
}

/** NSGA-II 拥挤距离计算 */
export function crowdingDistanceAssignment(front: Chromosome[]): void {
  if (front.length <= 2) {
    front.forEach(c => { c.crowdingDistance = Infinity; });
    return;
  }

  const keys = ['smoothness', 'harmony', 'rhythmDiversity', 'rangeReasonability'] as const;

  for (const c of front) {
    c.crowdingDistance = 0;
  }

  for (const key of keys) {
    front.sort((a, b) => a.objectives[key] - b.objectives[key]);
    const minVal = front[0].objectives[key];
    const maxVal = front[front.length - 1].objectives[key];
    const range = maxVal - minVal;
    if (range === 0) continue;

    front[0].crowdingDistance = Infinity;
    front[front.length - 1].crowdingDistance = Infinity;

    for (let i = 1; i < front.length - 1; i++) {
      front[i].crowdingDistance +=
        (front[i + 1].objectives[key] - front[i - 1].objectives[key]) / range;
    }
  }
}

/** NSGA-II 拥挤比较算子 */
export function crowdingCompare(a: Chromosome, b: Chromosome): number {
  if (a.rank !== b.rank) return a.rank - b.rank;
  return b.crowdingDistance - a.crowdingDistance;
}

/** 遗传进化作曲主循环 */
export function evolutionaryCompose(config: GAConfig = DEFAULT_GA_CONFIG): Chromosome {
  const rng = new SeededRandom(config.seed);
  let population = initializePopulation(config);

  // 评估初始种群
  for (const chrom of population) {
    chrom.objectives = evaluateFitness(chrom, config);
    chrom.fitness =
      chrom.objectives.smoothness * 0.3 +
      chrom.objectives.harmony * 0.3 +
      chrom.objectives.rhythmDiversity * 0.2 +
      chrom.objectives.rangeReasonability * 0.2;
  }

  for (let gen = 0; gen < config.maxGenerations; gen++) {
    // NSGA-II排序
    const fronts = fastNonDominatedSort(population);
    for (const front of fronts) {
      crowdingDistanceAssignment(front);
    }

    // 生成子代
    const offspring: Chromosome[] = [];
    while (offspring.length < config.populationSize) {
      const parent1 = tournamentSelection(population, config.tournamentSize, rng);
      const parent2 = tournamentSelection(population, config.tournamentSize, rng);

      let [child1, child2] = rng.next() < config.crossoverRate
        ? singlePointCrossover(parent1, parent2, rng)
        : [parent1, parent2].map(p => ({ ...p, genes: p.genes.map(g => ({ ...g })) })) as [Chromosome, Chromosome];

      child1 = applyMutation(child1, config, rng);
      child2 = applyMutation(child2, config, rng);

      child1.objectives = evaluateFitness(child1, config);
      child1.fitness =
        child1.objectives.smoothness * 0.3 +
        child1.objectives.harmony * 0.3 +
        child1.objectives.rhythmDiversity * 0.2 +
        child1.objectives.rangeReasonability * 0.2;

      child2.objectives = evaluateFitness(child2, config);
      child2.fitness =
        child2.objectives.smoothness * 0.3 +
        child2.objectives.harmony * 0.3 +
        child2.objectives.rhythmDiversity * 0.2 +
        child2.objectives.rangeReasonability * 0.2;

      offspring.push(child1, child2);
    }

    // 合并父代和子代
    const combined = [...population, ...offspring];

    // 重新排序选择
    const combinedFronts = fastNonDominatedSort(combined);
    for (const front of combinedFronts) {
      crowdingDistanceAssignment(front);
    }

    const newPopulation: Chromosome[] = [];
    for (const front of combinedFronts) {
      if (newPopulation.length + front.length <= config.populationSize) {
        newPopulation.push(...front);
      } else {
        front.sort((a, b) => crowdingCompare(a, b));
        const remaining = config.populationSize - newPopulation.length;
        newPopulation.push(...front.slice(0, remaining));
        break;
      }
    }

    population = newPopulation;

    // 精英保留：确保最优个体不丢失
    population.sort((a, b) => b.fitness - a.fitness);
  }

  return population[0];
}

/** 将染色体转为音符事件序列 */
export function chromosomeToNotes(chromosome: Chromosome): NoteEvent[] {
  const notes: NoteEvent[] = [];
  let offset = 0;
  for (const gene of chromosome.genes) {
    notes.push({
      pitch: gene.pitch,
      duration: gene.duration,
      velocity: gene.velocity,
      offset,
    });
    offset += gene.duration;
  }
  return notes;
}

// ============================================================
// 第四部分：分形旋律生成
// ============================================================

/** 分形生成配置 */
export interface FractalConfig {
  /** 迭代深度 */
  iterations: number;
  /** 音高范围 */
  pitchRange: [number, number];
  /** 分形维度控制（1.0-3.0） */
  dimension: number;
  /** 随机种子 */
  seed: number;
  /** 生成音符数 */
  noteCount: number;
  /** 时值基准（tick） */
  baseDuration: number;
}

/** Mandelbrot集迭代计算 */
export function mandelbrotIterate(cx: number, cy: number, maxIter: number = 100): number {
  let zx = 0;
  let zy = 0;
  let iter = 0;
  while (zx * zx + zy * zy <= 4 && iter < maxIter) {
    const tmp = zx * zx - zy * zy + cx;
    zy = 2 * zx * zy + cy;
    zx = tmp;
    iter++;
  }
  return iter;
}

/** Mandelbrot集映射到音高 */
export function mandelbrotToPitch(
  cx: number,
  cy: number,
  pitchMin: number,
  pitchMax: number,
  maxIter: number = 100
): number {
  const iter = mandelbrotIterate(cx, cy, maxIter);
  // 对数缩放使分布更均匀
  const normalized = Math.log(iter + 1) / Math.log(maxIter + 1);
  return Math.round(pitchMin + normalized * (pitchMax - pitchMin));
}

/** Julia集迭代计算 */
export function juliaIterate(
  zx: number,
  zy: number,
  cx: number,
  cy: number,
  maxIter: number = 100
): number {
  let x = zx;
  let y = zy;
  let iter = 0;
  while (x * x + y * y <= 4 && iter < maxIter) {
    const tmp = x * x - y * y + cx;
    y = 2 * x * y + cy;
    x = tmp;
    iter++;
  }
  return iter;
}

/** Julia集映射到音高 */
export function juliaToPitch(
  zx: number,
  zy: number,
  cx: number,
  cy: number,
  pitchMin: number,
  pitchMax: number,
  maxIter: number = 100
): number {
  const iter = juliaIterate(zx, zy, cx, cy, maxIter);
  const normalized = iter / maxIter;
  return Math.round(pitchMin + normalized * (pitchMax - pitchMin));
}

/** 使用Mandelbrot集生成旋律 */
export function mandelbrotMelody(config: FractalConfig): NoteEvent[] {
  const rng = new SeededRandom(config.seed);
  const notes: NoteEvent[] = [];
  let offset = 0;

  // 在Mandelbrot集的有趣区域采样
  const cxCenter = -0.75;
  const cyCenter = 0;
  const scale = 1.5 / config.dimension;

  for (let i = 0; i < config.noteCount; i++) {
    const t = i / config.noteCount;
    const cx = cxCenter + scale * Math.cos(t * 2 * Math.PI * config.iterations);
    const cy = cyCenter + scale * Math.sin(t * 2 * Math.PI * config.iterations);

    const pitch = mandelbrotToPitch(cx, cy, config.pitchRange[0], config.pitchRange[1]);

    // 时值也映射自Mandelbrot值
    const durationScale = mandelbrotIterate(cx, cy, 50) / 50;
    const duration = Math.round(config.baseDuration * (0.5 + durationScale));

    notes.push({
      pitch,
      duration: Math.max(60, duration),
      velocity: Math.min(127, Math.max(1, Math.round(60 + durationScale * 60))),
      offset,
    });
    offset += duration;
  }

  return notes;
}

/** 使用Julia集生成旋律变体 */
export function juliaMelody(
  cx: number,
  cy: number,
  config: FractalConfig
): NoteEvent[] {
  const notes: NoteEvent[] = [];
  let offset = 0;

  // Julia集参数cx,cy确定集的形态
  for (let i = 0; i < config.noteCount; i++) {
    const t = i / config.noteCount;
    const zx = 1.5 * Math.cos(t * 2 * Math.PI * config.iterations);
    const zy = 1.5 * Math.sin(t * 2 * Math.PI * config.iterations);

    const pitch = juliaToPitch(zx, zy, cx, cy, config.pitchRange[0], config.pitchRange[1]);
    const duration = Math.round(config.baseDuration * (0.5 + (i % 3) * 0.25));

    notes.push({
      pitch,
      duration: Math.max(60, duration),
      velocity: 80,
      offset,
    });
    offset += duration;
  }

  return notes;
}

/** 分形自相似性：不同尺度的旋律结构重复 */
export function fractalSelfSimilarity(
  motif: NoteEvent[],
  scales: number[],
  config: FractalConfig
): NoteEvent[] {
  const result: NoteEvent[] = [];
  let offset = 0;

  for (const scale of scales) {
    for (const note of motif) {
      // 在不同尺度上重复动机：缩放音高和时值
      const scaledPitch = Math.round(motif[0].pitch + (note.pitch - motif[0].pitch) * scale);
      const scaledDuration = Math.round(note.duration * scale);
      const clampedPitch = Math.min(config.pitchRange[1], Math.max(config.pitchRange[0], scaledPitch));

      result.push({
        pitch: clampedPitch,
        duration: Math.max(30, scaledDuration),
        velocity: note.velocity,
        offset,
      });
      offset += Math.max(30, scaledDuration);
    }
  }

  return result;
}

/** L-System规则 */
export interface LSystemRule {
  /** 前驱符号 */
  predecessor: string;
  /** 后继符号串 */
  successor: string;
}

/** L-System配置 */
export interface LSystemConfig {
  /** 公理（起始串） */
  axiom: string;
  /** 产生式规则 */
  rules: LSystemRule[];
  /** 迭代次数 */
  iterations: number;
  /** 符号到音程的映射 */
  symbolToInterval: Map<string, number>;
  /** 符号到时值的映射 */
  symbolToDuration: Map<string, number>;
  /** 起始音高 */
  startPitch: number;
  /** 音高范围 */
  pitchRange: [number, number];
  /** 力度 */
  velocity: number;
}

/** 执行L-System推导 */
export function lsystemDerive(config: LSystemConfig): string {
  let current = config.axiom;
  for (let i = 0; i < config.iterations; i++) {
    let next = '';
    for (const ch of current) {
      const rule = config.rules.find(r => r.predecessor === ch);
      next += rule ? rule.successor : ch;
    }
    current = next;
    // 防止字符串爆炸
    if (current.length > 5000) break;
  }
  return current;
}

/** 从L-System串生成旋律 */
export function lsystemMelody(config: LSystemConfig): NoteEvent[] {
  const derived = lsystemDerive(config);
  const notes: NoteEvent[] = [];
  let currentPitch = config.startPitch;
  let offset = 0;

  for (const ch of derived) {
    const interval = config.symbolToInterval.get(ch);
    const duration = config.symbolToDuration.get(ch);

    if (interval !== undefined) {
      currentPitch += interval;
      currentPitch = Math.min(config.pitchRange[1], Math.max(config.pitchRange[0], currentPitch));

      notes.push({
        pitch: currentPitch,
        duration: duration ?? RHYTHM_DURATIONS.quarter,
        velocity: config.velocity,
        offset,
      });
      offset += duration ?? RHYTHM_DURATIONS.quarter;
    }
  }

  return notes;
}

/** 预设L-System：旋律增长规则 */
export const LSYS_MELODIC_GROWTH: LSystemConfig = {
  axiom: 'A',
  rules: [
    { predecessor: 'A', successor: 'AB' },
    { predecessor: 'B', successor: 'CA' },
    { predecessor: 'C', successor: 'BA' },
  ],
  iterations: 6,
  symbolToInterval: new Map([
    ['A', 2], ['B', -1], ['C', 3],
  ]),
  symbolToDuration: new Map([
    ['A', RHYTHM_DURATIONS.quarter],
    ['B', RHYTHM_DURATIONS.eighth],
    ['C', RHYTHM_DURATIONS.half],
  ]),
  startPitch: 60,
  pitchRange: [48, 84],
  velocity: 80,
};

/** 预设L-System：分形树形规则 */
export const LSYS_FRACTAL_TREE: LSystemConfig = {
  axiom: 'X',
  rules: [
    { predecessor: 'X', successor: 'AYAXA' },
    { predecessor: 'Y', successor: 'BXBYB' },
  ],
  iterations: 4,
  symbolToInterval: new Map([
    ['X', 0], ['Y', 4], ['A', 2], ['B', -2],
  ]),
  symbolToDuration: new Map([
    ['X', RHYTHM_DURATIONS.eighth],
    ['Y', RHYTHM_DURATIONS.quarter],
    ['A', RHYTHM_DURATIONS.sixteenth],
    ['B', RHYTHM_DURATIONS.half],
  ]),
  startPitch: 60,
  pitchRange: [36, 96],
  velocity: 75,
};

/** 计算分形维度（盒计数法近似） */
export function estimateFractalDimension(pitches: number[], boxSizes: number[] = [2, 4, 8, 16]): number {
  if (pitches.length < 4) return 1;

  const minPitch = Math.min(...pitches);
  const maxPitch = Math.max(...pitches);
  const pitchRange = maxPitch - minPitch + 1;

  const logCounts: number[] = [];
  const logSizes: number[] = [];

  for (const boxSize of boxSizes) {
    const pitchBoxes = Math.ceil(pitchRange / boxSize);
    const timeBoxes = Math.ceil(pitches.length / boxSize);
    const occupied = new Set<string>();

    for (let i = 0; i < pitches.length; i++) {
      const pitchBox = Math.floor((pitches[i] - minPitch) / boxSize);
      const timeBox = Math.floor(i / boxSize);
      occupied.add(`${timeBox},${pitchBox}`);
    }

    logCounts.push(Math.log(occupied.size));
    logSizes.push(Math.log(1 / boxSize));
  }

  // 线性回归求斜率
  const n = logSizes.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += logSizes[i];
    sumY += logCounts[i];
    sumXY += logSizes[i] * logCounts[i];
    sumX2 += logSizes[i] * logSizes[i];
  }
  const denominator = n * sumX2 - sumX * sumX;
  if (Math.abs(denominator) < 1e-10) return 1;

  return Math.max(1, Math.min(2, (n * sumXY - sumX * sumY) / denominator));
}

/** 用分形维度控制旋律复杂度 */
export function fractalDimensionControl(
  baseMelody: NoteEvent[],
  targetDimension: number,
  config: FractalConfig
): NoteEvent[] {
  const rng = new SeededRandom(config.seed);
  let melody = [...baseMelody];
  let currentDim = estimateFractalDimension(melody.map(n => n.pitch));

  // 迭代调整：若维度过高则平滑，过低则添加变化
  for (let iter = 0; iter < 20; iter++) {
    if (Math.abs(currentDim - targetDimension) < 0.1) break;

    if (currentDim > targetDimension) {
      // 平滑：相邻音平均化
      for (let i = 1; i < melody.length - 1; i++) {
        melody[i] = {
          ...melody[i],
          pitch: Math.round((melody[i - 1].pitch + melody[i].pitch + melody[i + 1].pitch) / 3),
        };
      }
    } else {
      // 增加变化：随机微调部分音高
      for (let i = 0; i < melody.length; i++) {
        if (rng.next() < 0.3) {
          melody[i] = {
            ...melody[i],
            pitch: melody[i].pitch + rng.nextInt(-3, 3),
          };
        }
      }
    }

    currentDim = estimateFractalDimension(melody.map(n => n.pitch));
  }

  return melody;
}

// ============================================================
// 第五部分：混沌节奏引擎
// ============================================================

/** 混沌引擎配置 */
export interface ChaosConfig {
  /** Lorenz参数sigma */
  sigma: number;
  /** Lorenz参数rho */
  rho: number;
  /** Lorenz参数beta */
  beta: number;
  /** Rössler参数a */
  rosslerA: number;
  /** Rössler参数b */
  rosslerB: number;
  /** Rössler参数c */
  rosslerC: number;
  /** 积分步长 */
  dt: number;
  /** 总步数 */
  steps: number;
  /** 节奏密度阈值（0-1） */
  densityThreshold: number;
  /** 随机种子 */
  seed: number;
}

/** 默认混沌配置 */
export const DEFAULT_CHAOS_CONFIG: ChaosConfig = {
  sigma: 10,
  rho: 28,
  beta: 8 / 3,
  rosslerA: 0.2,
  rosslerB: 0.2,
  rosslerC: 5.7,
  dt: 0.01,
  steps: 1000,
  densityThreshold: 0.5,
  seed: 42,
};

/** Lorenz吸引子迭代一步 */
export function lorenzStep(
  x: number, y: number, z: number,
  sigma: number, rho: number, beta: number, dt: number
): [number, number, number] {
  const dx = sigma * (y - x) * dt;
  const dy = (x * (rho - z) - y) * dt;
  const dz = (x * y - beta * z) * dt;
  return [x + dx, y + dy, z + dz];
}

/** 计算Lorenz吸引子轨迹 */
export function lorenzTrajectory(config: ChaosConfig): [number, number, number][] {
  const points: [number, number, number][] = [];
  let x = 1, y = 1, z = 1;

  for (let i = 0; i < config.steps; i++) {
    [x, y, z] = lorenzStep(x, y, z, config.sigma, config.rho, config.beta, config.dt);
    points.push([x, y, z]);
  }

  return points;
}

/** Lorenz吸引子映射节奏模式 */
export function lorenzRhythm(config: ChaosConfig, ticksPerBeat: number = 480): NoteEvent[] {
  const trajectory = lorenzTrajectory(config);
  const notes: NoteEvent[] = [];

  // 归一化x坐标到[0,1]，z坐标映射到力度
  const xValues = trajectory.map(p => p[0]);
  const zValues = trajectory.map(p => p[2]);
  const xMin = Math.min(...xValues);
  const xMax = Math.max(...xValues);
  const zMin = Math.min(...zValues);
  const zMax = Math.max(...zValues);
  const xRange = xMax - xMin || 1;
  const zRange = zMax - zMin || 1;

  for (let i = 0; i < trajectory.length; i++) {
    const normalizedX = (trajectory[i][0] - xMin) / xRange;

    // 用密度阈值过滤触发点
    if (normalizedX > config.densityThreshold) {
      const velocity = Math.round(40 + 80 * ((trajectory[i][2] - zMin) / zRange));
      notes.push({
        pitch: 36, // 底鼓
        duration: ticksPerBeat,
        velocity: Math.min(127, Math.max(1, velocity)),
        offset: i * Math.round(ticksPerBeat * config.dt * 10),
      });
    }
  }

  return notes;
}

/** Rössler吸引子迭代一步 */
export function rosslerStep(
  x: number, y: number, z: number,
  a: number, b: number, c: number, dt: number
): [number, number, number] {
  const dx = (-y - z) * dt;
  const dy = (x + a * y) * dt;
  const dz = (b + z * (x - c)) * dt;
  return [x + dx, y + dy, z + dz];
}

/** 计算Rössler吸引子轨迹 */
export function rosslerTrajectory(config: ChaosConfig): [number, number, number][] {
  const points: [number, number, number][] = [];
  let x = 1, y = 1, z = 0;

  for (let i = 0; i < config.steps; i++) {
    [x, y, z] = rosslerStep(x, y, z, config.rosslerA, config.rosslerB, config.rosslerC, config.dt);
    points.push([x, y, z]);
  }

  return points;
}

/** Rössler吸引子驱动节拍变化 */
export function rosslerRhythm(config: ChaosConfig, ticksPerBeat: number = 480): NoteEvent[] {
  const trajectory = rosslerTrajectory(config);
  const notes: NoteEvent[] = [];

  const zValues = trajectory.map(p => p[2]);
  const zMax = Math.max(...zValues);

  let offset = 0;
  for (let i = 0; i < trajectory.length; i++) {
    // z的尖峰对应节拍重音
    const isPeak = i > 0 && i < trajectory.length - 1 &&
      trajectory[i][2] > trajectory[i - 1][2] &&
      trajectory[i][2] > trajectory[i + 1][2];

    if (isPeak) {
      const intensity = trajectory[i][2] / zMax;
      notes.push({
        pitch: intensity > 0.5 ? 38 : 42, // 强=军鼓，弱=踩镲
        duration: ticksPerBeat,
        velocity: Math.min(127, Math.max(1, Math.round(60 + intensity * 67))),
        offset,
      });
    }

    offset += Math.round(ticksPerBeat * config.dt * 5);
  }

  return notes;
}

/** Logistic映射 */
export function logisticMap(x: number, r: number): number {
  return r * x * (1 - x);
}

/** Logistic映射控制节奏密度 */
export function logisticRhythm(
  r: number = 3.8,
  steps: number = 64,
  ticksPerStep: number = 120,
  densityThreshold: number = 0.5,
  seed: number = 42
): NoteEvent[] {
  const rng = new SeededRandom(seed);
  const notes: NoteEvent[] = [];
  let x = rng.next();

  for (let i = 0; i < steps; i++) {
    x = logisticMap(x, r);

    if (x > densityThreshold) {
      notes.push({
        pitch: x > 0.8 ? 38 : (x > 0.6 ? 42 : 36), // 军鼓/踩镲/底鼓
        duration: ticksPerStep,
        velocity: Math.min(127, Math.max(1, Math.round(50 + x * 77))),
        offset: i * ticksPerStep,
      });
    }
  }

  return notes;
}

/** 庞加莱截面采样 */
export function poincareSection(
  trajectory: [number, number, number][],
  planeAxis: 'x' | 'y' | 'z',
  planeValue: number,
  direction: 'up' | 'down' = 'up'
): [number, number][] {
  const section: [number, number][] = [];
  const axisIdx = planeAxis === 'x' ? 0 : planeAxis === 'y' ? 1 : 2;
  const otherAxes: [number, number] = planeAxis === 'x' ? [1, 2] : planeAxis === 'y' ? [0, 2] : [0, 1];

  for (let i = 1; i < trajectory.length; i++) {
    const prev = trajectory[i - 1][axisIdx];
    const curr = trajectory[i][axisIdx];

    const crossing = direction === 'up'
      ? prev < planeValue && curr >= planeValue
      : prev > planeValue && curr <= planeValue;

    if (crossing) {
      section.push([trajectory[i][otherAxes[0]], trajectory[i][otherAxes[1]]]);
    }
  }

  return section;
}

/** 庞加莱截面采样节奏触发点 */
export function poincareRhythm(
  config: ChaosConfig,
  planeValue: number = 20,
  ticksPerBeat: number = 480
): NoteEvent[] {
  const trajectory = lorenzTrajectory(config);
  const section = poincareSection(trajectory, 'z', planeValue, 'up');

  const notes: NoteEvent[] = [];
  for (let i = 0; i < section.length; i++) {
    const [x, y] = section[i];
    // 将截面点映射到鼓组
    const normalizedX = (x + 30) / 60; // 近似归一化
    const pitch = normalizedX > 0.5 ? 38 : 36; // 军鼓或底鼓
    const velocity = Math.min(127, Math.max(1, Math.round(Math.abs(y) * 5 + 40)));

    notes.push({
      pitch,
      duration: ticksPerBeat,
      velocity,
      offset: i * ticksPerBeat,
    });
  }

  return notes;
}

/** 奇异吸引子到节奏图案的通用映射 */
export function attractorToRhythm(
  trajectory: [number, number, number][],
  axis: 'x' | 'y' | 'z',
  threshold: number,
  ticksPerStep: number = 120
): NoteEvent[] {
  const axisIdx = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
  const values = trajectory.map(p => p[axisIdx]);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;

  const notes: NoteEvent[] = [];
  for (let i = 0; i < values.length; i++) {
    if (Math.abs(values[i] - mean) > threshold) {
      notes.push({
        pitch: values[i] > mean ? 42 : 36,
        duration: ticksPerStep,
        velocity: Math.min(127, Math.max(1, Math.round(60 + Math.abs(values[i] - mean) * 2))),
        offset: i * ticksPerStep,
      });
    }
  }

  return notes;
}

// ============================================================
// 第六部分：量子概率作曲
// ============================================================

/** 量子态（复数振幅向量） */
export interface QuantumState {
  /** 振幅（复数数组：[实部, 虚部] 交替存储） */
  amplitudes: number[];
  /** 基态数量 */
  dimension: number;
}

/** 创建零态 */
export function createZeroState(dimension: number): QuantumState {
  const amplitudes = new Array(dimension * 2).fill(0);
  amplitudes[0] = 1; // 第一个基态振幅为1
  return { amplitudes, dimension };
}

/** 创建等概率叠加态 */
export function createSuperposition(dimension: number): QuantumState {
  const amp = 1 / Math.sqrt(dimension);
  const amplitudes = new Array(dimension * 2).fill(0);
  for (let i = 0; i < dimension; i++) {
    amplitudes[i * 2] = amp; // 实部
    amplitudes[i * 2 + 1] = 0; // 虚部
  }
  return { amplitudes, dimension };
}

/** 计算量子态各基态概率 */
export function quantumProbabilities(state: QuantumState): number[] {
  const probs: number[] = [];
  for (let i = 0; i < state.dimension; i++) {
    const real = state.amplitudes[i * 2];
    const imag = state.amplitudes[i * 2 + 1];
    probs.push(real * real + imag * imag);
  }
  return probs;
}

/** 波函数坍缩：从叠加态选择具体基态 */
export function wavefunctionCollapse(state: QuantumState, rng: SeededRandom): number {
  const probs = quantumProbabilities(state);
  return rng.weightedChoice(probs);
}

/** Hadamard门（2维） */
export function hadamardGate(state: QuantumState, qubit: number = 0): QuantumState {
  if (state.dimension < 2) return state;
  const factor = 1 / Math.sqrt(2);
  const newAmps = new Array(state.dimension * 2).fill(0);

  for (let i = 0; i < state.dimension; i += 2) {
    const r0 = state.amplitudes[i * 2];
    const i0 = state.amplitudes[i * 2 + 1];
    const r1 = state.amplitudes[(i + 1) * 2];
    const i1 = state.amplitudes[(i + 1) * 2 + 1];

    // |0⟩ → (|0⟩+|1⟩)/√2
    newAmps[i * 2] = factor * (r0 + r1);
    newAmps[i * 2 + 1] = factor * (i0 + i1);
    // |1⟩ → (|0⟩-|1⟩)/√2
    newAmps[(i + 1) * 2] = factor * (r0 - r1);
    newAmps[(i + 1) * 2 + 1] = factor * (i0 - i1);
  }

  return { amplitudes: newAmps, dimension: state.dimension };
}

/** 保罗X门（NOT门） */
export function pauliXGate(state: QuantumState, qubit: number = 0): QuantumState {
  const newAmps = new Array(state.dimension * 2).fill(0);

  for (let i = 0; i < state.dimension; i += 2) {
    // 交换|0⟩和|1⟩
    newAmps[(i + 1) * 2] = state.amplitudes[i * 2];
    newAmps[(i + 1) * 2 + 1] = state.amplitudes[i * 2 + 1];
    newAmps[i * 2] = state.amplitudes[(i + 1) * 2];
    newAmps[i * 2 + 1] = state.amplitudes[(i + 1) * 2 + 1];
  }

  return { amplitudes: newAmps, dimension: state.dimension };
}

/** 保罗Z门 */
export function pauliZGate(state: QuantumState, qubit: number = 0): QuantumState {
  const newAmps = [...state.amplitudes];

  for (let i = 0; i < state.dimension; i += 2) {
    // |1⟩的振幅取反
    newAmps[(i + 1) * 2] = -newAmps[(i + 1) * 2];
    newAmps[(i + 1) * 2 + 1] = -newAmps[(i + 1) * 2 + 1];
  }

  return { amplitudes: newAmps, dimension: state.dimension };
}

/** 量子叠加作曲：多个旋律线叠加态 */
export function quantumSuperpositionMelody(
  melodies: NoteEvent[][],
  config: { seed: number; noteCount: number }
): NoteEvent[] {
  const rng = new SeededRandom(config.seed);
  const n = melodies.length;
  if (n === 0) return [];

  // 创建叠加态
  let state = createSuperposition(n);

  // 应用Hadamard增加不确定性
  state = hadamardGate(state);

  const result: NoteEvent[] = [];
  let offset = 0;

  for (let i = 0; i < config.noteCount; i++) {
    // 波函数坍缩到某条旋律
    const melodyIdx = wavefunctionCollapse(state, rng);
    const melody = melodies[melodyIdx % melodies.length];
    const noteIdx = i % melody.length;

    result.push({
      ...melody[noteIdx],
      offset,
    });

    offset += melody[noteIdx].duration;

    // 每隔一段时间重新坍缩，增加变化
    if (i % 8 === 7) {
      state = hadamardGate(state);
    }
  }

  return result;
}

/** 量子纠缠：声部间关联 */
export interface EntangledVoices {
  /** 主旋律 */
  lead: NoteEvent[];
  /** 和声跟随 */
  harmony: NoteEvent[];
  /** 纠缠强度（0-1） */
  entanglementStrength: number;
}

/** 量子纠缠作曲：主旋律变化→和声自动跟随 */
export function quantumEntangledComposition(
  leadMelody: NoteEvent[],
  entanglementStrength: number = 0.8,
  seed: number = 42
): EntangledVoices {
  const rng = new SeededRandom(seed);
  const harmony: NoteEvent[] = [];

  for (let i = 0; i < leadMelody.length; i++) {
    const lead = leadMelody[i];

    // 根据纠缠强度决定和声跟随程度
    if (rng.next() < entanglementStrength) {
      // 强纠缠：和声严格按三度/五度跟随
      const interval = rng.next() < 0.5 ? 4 : 7; // 大三度或纯五度
      harmony.push({
        pitch: lead.pitch + interval,
        duration: lead.duration,
        velocity: Math.round(lead.velocity * 0.7),
        offset: lead.offset,
      });
    } else {
      // 弱纠缠：和声自由运动
      const freeInterval = rng.nextInt(2, 12);
      harmony.push({
        pitch: lead.pitch + freeInterval,
        duration: lead.duration,
        velocity: Math.round(lead.velocity * 0.6),
        offset: lead.offset,
      });
    }
  }

  return { lead: leadMelody, harmony, entanglementStrength };
}

/** 量子门变换旋律 */
export function quantumGateMelody(
  melody: NoteEvent[],
  gate: 'hadamard' | 'pauli_x' | 'pauli_z',
  seed: number = 42
): NoteEvent[] {
  const rng = new SeededRandom(seed);
  const pitchClasses = 12; // 12个半音

  // 构建音高分布的量子态
  let state = createZeroState(pitchClasses);
  // 用旋律的音高分布初始化
  for (const note of melody) {
    const pc = note.pitch % pitchClasses;
    state.amplitudes[pc * 2] += 0.1;
  }
  // 归一化
  let norm = 0;
  for (let i = 0; i < pitchClasses; i++) {
    norm += state.amplitudes[i * 2] ** 2;
  }
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < pitchClasses; i++) {
    state.amplitudes[i * 2] /= norm;
  }

  // 应用量子门
  switch (gate) {
    case 'hadamard': state = hadamardGate(state); break;
    case 'pauli_x': state = pauliXGate(state); break;
    case 'pauli_z': state = pauliZGate(state); break;
  }

  // 坍缩并生成新旋律
  const result: NoteEvent[] = [];
  for (let i = 0; i < melody.length; i++) {
    const newPC = wavefunctionCollapse(state, rng);
    const octaveShift = Math.floor(melody[i].pitch / 12);
    result.push({
      pitch: octaveShift * 12 + newPC,
      duration: melody[i].duration,
      velocity: melody[i].velocity,
      offset: melody[i].offset,
    });
  }

  return result;
}

// ============================================================
// 第七部分：细胞自动机节奏
// ============================================================

/** 一维细胞自动机配置 */
export interface CA1DConfig {
  /** 规则编号（0-255） */
  rule: number;
  /** 网格宽度 */
  width: number;
  /** 迭代步数 */
  steps: number;
  /** 初始状态（'single'中心单点 或 'random'） */
  initMode: 'single' | 'random';
  /** 随机种子 */
  seed: number;
}

/** 执行一维细胞自动机 */
export function runCA1D(config: CA1DConfig): number[][] {
  const rng = new SeededRandom(config.seed);
  const grid: number[][] = [];

  // 初始化第一行
  const firstRow = new Array(config.width).fill(0);
  if (config.initMode === 'single') {
    firstRow[Math.floor(config.width / 2)] = 1;
  } else {
    for (let i = 0; i < config.width; i++) {
      firstRow[i] = rng.nextInt(0, 1);
    }
  }
  grid.push(firstRow);

  // 演化
  for (let step = 1; step < config.steps; step++) {
    const prevRow = grid[step - 1];
    const newRow = new Array(config.width).fill(0);

    for (let i = 0; i < config.width; i++) {
      const left = prevRow[(i - 1 + config.width) % config.width];
      const center = prevRow[i];
      const right = prevRow[(i + 1) % config.width];
      const pattern = (left << 2) | (center << 1) | right;
      newRow[i] = (config.rule >> pattern) & 1;
    }

    grid.push(newRow);
  }

  return grid;
}

/** 一维CA映射到节奏模式 */
export function ca1dToRhythm(
  config: CA1DConfig,
  ticksPerStep: number = 120
): NoteEvent[] {
  const grid = runCA1D(config);
  const notes: NoteEvent[] = [];

  // 每行对应一个时间步，每列对应一种鼓
  for (let step = 0; step < grid.length; step++) {
    for (let col = 0; col < grid[step].length; col++) {
      if (grid[step][col] === 1) {
        // 列位置映射到不同鼓
        const drumMap = [36, 38, 42, 46, 49, 51, 39, 44]; // 底鼓/军鼓/踩镲/开镲/镲/牛铃/拍手/踩镲
        const pitch = drumMap[col % drumMap.length];

        notes.push({
          pitch,
          duration: ticksPerStep,
          velocity: 80,
          offset: step * ticksPerStep,
        });
      }
    }
  }

  return notes;
}

/** 二维细胞自动机配置 */
export interface CA2DConfig {
  /** 网格宽度 */
  width: number;
  /** 网格高度 */
  height: number;
  /** 迭代步数 */
  steps: number;
  /** 存活规则（邻居数在此集合中则存活） */
  surviveRules: number[];
  /** 诞生规则（邻居数在此集合中则诞生） */
  birthRules: number[];
  /** 初始密度（0-1） */
  initDensity: number;
  /** 随机种子 */
  seed: number;
}

/** 执行二维细胞自动机 */
export function runCA2D(config: CA2DConfig): number[][][] {
  const rng = new SeededRandom(config.seed);
  const history: number[][][] = [];

  // 初始化网格
  let grid: number[][] = [];
  for (let y = 0; y < config.height; y++) {
    const row: number[] = [];
    for (let x = 0; x < config.width; x++) {
      row.push(rng.next() < config.initDensity ? 1 : 0);
    }
    grid.push(row);
  }
  history.push(grid);

  // 演化
  for (let step = 1; step < config.steps; step++) {
    const newGrid: number[][] = [];
    for (let y = 0; y < config.height; y++) {
      const newRow: number[] = [];
      for (let x = 0; x < config.width; x++) {
        // 计算Moore邻域存活数
        let neighbors = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dy === 0 && dx === 0) continue;
            const ny = (y + dy + config.height) % config.height;
            const nx = (x + dx + config.width) % config.width;
            neighbors += grid[ny][nx];
          }
        }

        const current = grid[y][x];
        if (current === 1) {
          newRow.push(config.surviveRules.includes(neighbors) ? 1 : 0);
        } else {
          newRow.push(config.birthRules.includes(neighbors) ? 1 : 0);
        }
      }
      newGrid.push(newRow);
    }
    grid = newGrid;
    history.push(grid);
  }

  return history;
}

/** 二维CA映射到多声部节奏 */
export function ca2dToRhythm(
  config: CA2DConfig,
  ticksPerStep: number = 480
): MelodyLine[] {
  const history = runCA2D(config);
  const voices: MelodyLine[] = [];
  const drumMap = [36, 38, 42, 46, 49, 51, 39, 44];

  // 每行对应一个声部
  for (let row = 0; row < config.height; row++) {
    const notes: NoteEvent[] = [];
    for (let step = 0; step < history.length; step++) {
      // 每步取该行所有列的"或"结果
      let active = 0;
      for (let col = 0; col < config.width; col++) {
        active |= history[step][row][col];
      }
      if (active) {
        notes.push({
          pitch: drumMap[row % drumMap.length],
          duration: ticksPerStep,
          velocity: 80,
          offset: step * ticksPerStep,
        });
      }
    }
    voices.push({
      notes,
      voiceName: `CA_voice_${row}`,
      channel: row % 16,
    });
  }

  return voices;
}

/** 生命游戏配置（Conway's Game of Life） */
export const LIFE_GAME_CONFIG: CA2DConfig = {
  width: 16,
  height: 8,
  steps: 32,
  surviveRules: [2, 3],
  birthRules: [3],
  initDensity: 0.3,
  seed: 42,
};

/** HighLife变体 */
export const HIGHLIFE_CONFIG: CA2DConfig = {
  width: 16,
  height: 8,
  steps: 32,
  surviveRules: [2, 3],
  birthRules: [3, 6],
  initDensity: 0.3,
  seed: 42,
};

/** 规则进化：自动寻找有趣的节奏规则 */
export function evolveCARules(
  evaluationFn: (grid: number[][]) => number,
  config: CA2DConfig,
  generations: number = 50,
  populationSize: number = 30,
  seed: number = 42
): { bestSurvive: number[]; bestBirth: number[]; bestScore: number } {
  const rng = new SeededRandom(seed);

  // 初始化规则种群
  type RuleSet = { survive: number[]; birth: number[]; score: number };
  const population: RuleSet[] = [];

  for (let i = 0; i < populationSize; i++) {
    const survive: number[] = [];
    const birth: number[] = [];
    for (let n = 0; n <= 8; n++) {
      if (rng.next() < 0.4) survive.push(n);
      if (rng.next() < 0.3) birth.push(n);
    }
    population.push({ survive, birth, score: 0 });
  }

  let bestScore = -Infinity;
  let bestSurvive: number[] = [2, 3];
  let bestBirth: number[] = [3];

  for (let gen = 0; gen < generations; gen++) {
    // 评估每个规则集
    for (const ruleSet of population) {
      const testConfig: CA2DConfig = {
        ...config,
        surviveRules: ruleSet.survive,
        birthRules: ruleSet.birth,
      };
      const history = runCA2D(testConfig);
      // 用最后一帧评估
      ruleSet.score = evaluationFn(history[history.length - 1]);
    }

    // 记录最优
    population.sort((a, b) => b.score - a.score);
    if (population[0].score > bestScore) {
      bestScore = population[0].score;
      bestSurvive = [...population[0].survive];
      bestBirth = [...population[0].birth];
    }

    // 选择+变异
    const newPop: RuleSet[] = [population[0]]; // 精英保留
    while (newPop.length < populationSize) {
      const parent = population[rng.nextInt(0, populationSize / 2)];
      const survive = parent.survive.filter(() => rng.next() > 0.2);
      const birth = parent.birth.filter(() => rng.next() > 0.2);
      // 随机添加新规则
      for (let n = 0; n <= 8; n++) {
        if (rng.next() < 0.15 && !survive.includes(n)) survive.push(n);
        if (rng.next() < 0.1 && !birth.includes(n)) birth.push(n);
      }
      newPop.push({ survive, birth, score: 0 });
    }

    population.length = 0;
    population.push(...newPop);
  }

  return { bestSurvive, bestBirth, bestScore };
}

/** 节奏趣味性评估函数 */
export function rhythmInterestEvaluation(grid: number[][]): number {
  let score = 0;
  const height = grid.length;
  const width = grid[0]?.length ?? 0;

  // 1. 密度适中（不太稀疏也不太密集）
  let active = 0;
  for (const row of grid) for (const cell of row) active += cell;
  const density = active / (height * width);
  score += 1 - Math.abs(density - 0.3) * 2;

  // 2. 空间多样性（行间差异）
  const rowSums = grid.map(row => row.reduce((a, b) => a + b, 0));
  const rowVariance = rowSums.reduce((s, r) => s + (r - rowSums.reduce((a, b) => a + b, 0) / height) ** 2, 0) / height;
  score += Math.min(rowVariance / 5, 1);

  // 3. 非均匀性（不要全0或全1）
  if (density > 0.05 && density < 0.95) score += 1;

  return score;
}

// ============================================================
// 第八部分：编曲器
// ============================================================

/** 和弦音（用于配和声） */
export interface HarmonyNote {
  /** MIDI音高 */
  pitch: number;
  /** 和弦级数（0=根音） */
  degree: number;
}

/** 和声配置 */
export interface HarmonyConfig {
  /** 调性根音（MIDI） */
  rootPitch: number;
  /** 大调/小调 */
  isMajor: boolean;
  /** 和弦进行（级数列表，1-7） */
  chordDegrees: number[];
  /** 每和弦持续拍数 */
  beatsPerChord: number;
  /** 和弦类型覆盖 */
  chordTypes: string[];
  /** 七和弦偏好 */
  useSeventhChords: boolean;
}

/** 根据级数获取顺阶和弦的音高 */
export function getChordPitches(
  rootPitch: number,
  degree: number,
  isMajor: boolean,
  useSeventh: boolean = false
): number[] {
  // 大调音阶间隔
  const majorIntervals = [0, 2, 4, 5, 7, 9, 11];
  // 小调（自然小调）间隔
  const minorIntervals = [0, 2, 3, 5, 7, 8, 10];

  const intervals = isMajor ? majorIntervals : minorIntervals;
  const degreeIndex = (degree - 1) % 7;
  const chordRoot = rootPitch + intervals[degreeIndex];

  // 顺阶和弦类型
  const majorChordIntervals = [
    [0, 4, 7],       // I: 大三
    [0, 3, 7],       // ii: 小三
    [0, 3, 7],       // iii: 小三
    [0, 4, 7],       // IV: 大三
    [0, 4, 7],       // V: 大三
    [0, 3, 7],       // vi: 小三
    [0, 3, 6],       // vii: 减三
  ];
  const minorChordIntervals = [
    [0, 3, 7],       // i: 小三
    [0, 3, 6],       // ii: 减三
    [0, 4, 7],       // III: 大三
    [0, 3, 7],       // iv: 小三
    [0, 4, 7],       // V: 大三
    [0, 4, 7],       // VI: 大三
    [0, 3, 6],       // vii: 减三
  ];

  const chordIntervals = isMajor ? majorChordIntervals : minorChordIntervals;
  let pitches = chordIntervals[degreeIndex].map(i => chordRoot + i);

  if (useSeventh) {
    // 添加七度
    const seventhIntervals = isMajor
      ? [11, 10, 10, 11, 10, 10, 10] // 大七/小七
      : [10, 10, 10, 10, 10, 11, 10];
    pitches = [...pitches, chordRoot + seventhIntervals[degreeIndex]];
  }

  return pitches;
}

/** 自动配和声 */
export function autoHarmonize(
  melody: NoteEvent[],
  config: HarmonyConfig,
  ticksPerBeat: number = 480
): MelodyLine {
  const notes: NoteEvent[] = [];
  const chordPitches = config.chordDegrees.map((deg, i) =>
    getChordPitches(config.rootPitch, deg, config.isMajor, config.useSeventhChords)
  );

  let offset = 0;
  const chordDuration = config.beatsPerChord * ticksPerBeat;
  const totalChords = chordPitches.length;
  let chordIdx = 0;

  for (const melodyNote of melody) {
    // 确定当前和弦
    while (offset >= (chordIdx + 1) * chordDuration && chordIdx < totalChords - 1) {
      chordIdx++;
    }

    const currentChord = chordPitches[chordIdx % totalChords];

    // 为旋律音找最近的和声音
    for (const chordPitch of currentChord) {
      // 保持和声在旋律下方
      let harmonyPitch = chordPitch;
      while (harmonyPitch >= melodyNote.pitch) harmonyPitch -= 12;
      while (harmonyPitch < melodyNote.pitch - 24) harmonyPitch += 12;

      notes.push({
        pitch: harmonyPitch,
        duration: melodyNote.duration,
        velocity: Math.round(melodyNote.velocity * 0.6),
        offset: melodyNote.offset,
      });
    }
    offset = melodyNote.offset + melodyNote.duration;
  }

  return {
    notes,
    voiceName: 'harmony',
    channel: 1,
  };
}

/** 低音线生成模式 */
export type BassPattern = 'root' | 'walking' | 'ostinato' | 'arpeggio' | 'power';

/** 生成低音线 */
export function generateBassLine(
  config: HarmonyConfig,
  pattern: BassPattern,
  totalMeasures: number,
  beatsPerMeasure: number = 4,
  ticksPerBeat: number = 480,
  seed: number = 42
): MelodyLine {
  const rng = new SeededRandom(seed);
  const notes: NoteEvent[] = [];
  const measureDuration = beatsPerMeasure * ticksPerBeat;
  const totalDuration = totalMeasures * measureDuration;

  // 获取和弦根音序列
  const majorIntervals = [0, 2, 4, 5, 7, 9, 11];
  const minorIntervals = [0, 2, 3, 5, 7, 8, 10];
  const intervals = config.isMajor ? majorIntervals : minorIntervals;

  const chordRoots = config.chordDegrees.map(deg => {
    const idx = (deg - 1) % 7;
    return config.rootPitch - 12 + intervals[idx]; // 低两个八度
  });

  let offset = 0;
  let chordIdx = 0;
  const chordDuration = config.beatsPerChord * ticksPerBeat;

  while (offset < totalDuration) {
    const root = chordRoots[chordIdx % chordRoots.length];
    const chord = getChordPitches(config.rootPitch, config.chordDegrees[chordIdx % config.chordDegrees.length], config.isMajor, false);

    switch (pattern) {
      case 'root': {
        // 每拍根音
        for (let beat = 0; beat < beatsPerMeasure; beat++) {
          notes.push({
            pitch: root,
            duration: ticksPerBeat,
            velocity: beat === 0 ? 100 : 80,
            offset,
          });
          offset += ticksPerBeat;
        }
        break;
      }
      case 'walking': {
        // 漫步低音：根音→经过音→五度→经过音
        const passingTones = [root + 2, root + 5, root + 7, root + 10];
        for (let beat = 0; beat < beatsPerMeasure; beat++) {
          const pitch = beat === 0 ? root : (beat === 2 ? root + 7 : passingTones[rng.nextInt(0, passingTones.length - 1)]);
          notes.push({
            pitch,
            duration: ticksPerBeat,
            velocity: beat === 0 ? 100 : 75,
            offset,
          });
          offset += ticksPerBeat;
        }
        break;
      }
      case 'ostinato': {
        // 固定音型重复
        const ostinatoPattern = [root, root, root + 7, root];
        for (let beat = 0; beat < beatsPerMeasure; beat++) {
          notes.push({
            pitch: ostinatoPattern[beat % ostinatoPattern.length],
            duration: ticksPerBeat,
            velocity: 90,
            offset,
          });
          offset += ticksPerBeat;
        }
        break;
      }
      case 'arpeggio': {
        // 琶音模式
        for (let beat = 0; beat < beatsPerMeasure; beat++) {
          const chordNote = chord[beat % chord.length];
          notes.push({
            pitch: chordNote - 12,
            duration: ticksPerBeat * 0.8,
            velocity: 85,
            offset,
          });
          offset += ticksPerBeat;
        }
        break;
      }
      case 'power': {
        // 力量和弦（根音+五度，每拍双音）
        for (let beat = 0; beat < beatsPerMeasure; beat++) {
          notes.push({
            pitch: root,
            duration: ticksPerBeat * 0.9,
            velocity: 110,
            offset,
          });
          if (beat % 2 === 0) {
            notes.push({
              pitch: root + 7,
              duration: ticksPerBeat * 0.9,
              velocity: 100,
              offset,
            });
          }
          offset += ticksPerBeat;
        }
        break;
      }
    }

    if (offset >= (chordIdx + 1) * chordDuration) {
      chordIdx++;
    }
  }

  return {
    notes,
    voiceName: 'bass',
    channel: 2,
  };
}

/** 鼓组MIDI音高映射（GM标准） */
export const DRUM_MAP = {
  kick: 36,
  snare: 38,
  hiHat: 42,
  openHiHat: 46,
  crash: 49,
  ride: 51,
  tom1: 48,
  tom2: 45,
  floorTom: 41,
  clap: 39,
  cowbell: 56,
} as const;

/** 鼓组模式定义 */
export interface DrumPatternDef {
  /** 模式名称 */
  name: string;
  /** 一小节内的鼓点（16步量化） */
  steps: { pitch: number; velocity: number; step: number }[];
}

/** 根据风格匹配鼓组模式 */
export function matchDrumPattern(style: MusicStyle, rng: SeededRandom): DrumPatternDef {
  const patterns: Record<MusicStyle, DrumPatternDef[]> = {
    pop: [
      {
        name: '流行基础',
        steps: [
          { pitch: DRUM_MAP.kick, velocity: 100, step: 0 },
          { pitch: DRUM_MAP.hiHat, velocity: 60, step: 0 },
          { pitch: DRUM_MAP.hiHat, velocity: 60, step: 2 },
          { pitch: DRUM_MAP.kick, velocity: 100, step: 4 },
          { pitch: DRUM_MAP.hiHat, velocity: 60, step: 4 },
          { pitch: DRUM_MAP.snare, velocity: 100, step: 4 },
          { pitch: DRUM_MAP.hiHat, velocity: 60, step: 6 },
          { pitch: DRUM_MAP.kick, velocity: 100, step: 8 },
          { pitch: DRUM_MAP.hiHat, velocity: 60, step: 8 },
          { pitch: DRUM_MAP.hiHat, velocity: 60, step: 10 },
          { pitch: DRUM_MAP.kick, velocity: 100, step: 12 },
          { pitch: DRUM_MAP.hiHat, velocity: 60, step: 12 },
          { pitch: DRUM_MAP.snare, velocity: 100, step: 12 },
          { pitch: DRUM_MAP.hiHat, velocity: 60, step: 14 },
        ],
      },
    ],
    rock: [
      {
        name: '摇滚基础',
        steps: [
          { pitch: DRUM_MAP.kick, velocity: 110, step: 0 },
          { pitch: DRUM_MAP.hiHat, velocity: 70, step: 0 },
          { pitch: DRUM_MAP.hiHat, velocity: 70, step: 2 },
          { pitch: DRUM_MAP.hiHat, velocity: 70, step: 4 },
          { pitch: DRUM_MAP.snare, velocity: 110, step: 4 },
          { pitch: DRUM_MAP.hiHat, velocity: 70, step: 6 },
          { pitch: DRUM_MAP.kick, velocity: 110, step: 8 },
          { pitch: DRUM_MAP.hiHat, velocity: 70, step: 8 },
          { pitch: DRUM_MAP.hiHat, velocity: 70, step: 10 },
          { pitch: DRUM_MAP.hiHat, velocity: 70, step: 12 },
          { pitch: DRUM_MAP.snare, velocity: 110, step: 12 },
          { pitch: DRUM_MAP.hiHat, velocity: 70, step: 14 },
        ],
      },
    ],
    jazz: [
      {
        name: '爵士骑镲',
        steps: [
          { pitch: DRUM_MAP.ride, velocity: 70, step: 0 },
          { pitch: DRUM_MAP.kick, velocity: 60, step: 0 },
          { pitch: DRUM_MAP.ride, velocity: 70, step: 2 },
          { pitch: DRUM_MAP.ride, velocity: 70, step: 3 },
          { pitch: DRUM_MAP.ride, velocity: 70, step: 4 },
          { pitch: DRUM_MAP.ride, velocity: 70, step: 6 },
          { pitch: DRUM_MAP.ride, velocity: 70, step: 7 },
          { pitch: DRUM_MAP.hiHat, velocity: 80, step: 8 },
          { pitch: DRUM_MAP.ride, velocity: 70, step: 8 },
          { pitch: DRUM_MAP.ride, velocity: 70, step: 10 },
          { pitch: DRUM_MAP.ride, velocity: 70, step: 11 },
          { pitch: DRUM_MAP.ride, velocity: 70, step: 12 },
          { pitch: DRUM_MAP.ride, velocity: 70, step: 14 },
          { pitch: DRUM_MAP.ride, velocity: 70, step: 15 },
        ],
      },
    ],
    electronic: [
      {
        name: '电子四拍',
        steps: [
          { pitch: DRUM_MAP.kick, velocity: 120, step: 0 },
          { pitch: DRUM_MAP.hiHat, velocity: 80, step: 2 },
          { pitch: DRUM_MAP.kick, velocity: 120, step: 4 },
          { pitch: DRUM_MAP.hiHat, velocity: 80, step: 6 },
          { pitch: DRUM_MAP.kick, velocity: 120, step: 8 },
          { pitch: DRUM_MAP.hiHat, velocity: 80, step: 10 },
          { pitch: DRUM_MAP.kick, velocity: 120, step: 12 },
          { pitch: DRUM_MAP.hiHat, velocity: 80, step: 14 },
          { pitch: DRUM_MAP.clap, velocity: 100, step: 4 },
          { pitch: DRUM_MAP.clap, velocity: 100, step: 12 },
        ],
      },
    ],
    classical: [
      {
        name: '古典轻击',
        steps: [
          { pitch: DRUM_MAP.kick, velocity: 60, step: 0 },
          { pitch: DRUM_MAP.snare, velocity: 40, step: 4 },
          { pitch: DRUM_MAP.kick, velocity: 60, step: 8 },
          { pitch: DRUM_MAP.snare, velocity: 40, step: 12 },
        ],
      },
    ],
    folk: [
      {
        name: '民谣轻拍',
        steps: [
          { pitch: DRUM_MAP.kick, velocity: 80, step: 0 },
          { pitch: DRUM_MAP.hiHat, velocity: 50, step: 2 },
          { pitch: DRUM_MAP.hiHat, velocity: 50, step: 4 },
          { pitch: DRUM_MAP.snare, velocity: 70, step: 6 },
          { pitch: DRUM_MAP.kick, velocity: 80, step: 8 },
          { pitch: DRUM_MAP.hiHat, velocity: 50, step: 10 },
          { pitch: DRUM_MAP.hiHat, velocity: 50, step: 12 },
          { pitch: DRUM_MAP.snare, velocity: 70, step: 14 },
        ],
      },
    ],
    r_and_b: [
      {
        name: 'R&B律动',
        steps: [
          { pitch: DRUM_MAP.kick, velocity: 90, step: 0 },
          { pitch: DRUM_MAP.hiHat, velocity: 60, step: 1 },
          { pitch: DRUM_MAP.hiHat, velocity: 60, step: 2 },
          { pitch: DRUM_MAP.hiHat, velocity: 60, step: 3 },
          { pitch: DRUM_MAP.snare, velocity: 90, step: 4 },
          { pitch: DRUM_MAP.hiHat, velocity: 60, step: 5 },
          { pitch: DRUM_MAP.kick, velocity: 90, step: 6 },
          { pitch: DRUM_MAP.hiHat, velocity: 60, step: 7 },
          { pitch: DRUM_MAP.hiHat, velocity: 60, step: 8 },
          { pitch: DRUM_MAP.hiHat, velocity: 60, step: 9 },
          { pitch: DRUM_MAP.snare, velocity: 90, step: 10 },
          { pitch: DRUM_MAP.hiHat, velocity: 60, step: 11 },
          { pitch: DRUM_MAP.hiHat, velocity: 60, step: 12 },
          { pitch: DRUM_MAP.kick, velocity: 90, step: 13 },
          { pitch: DRUM_MAP.hiHat, velocity: 60, step: 14 },
          { pitch: DRUM_MAP.hiHat, velocity: 60, step: 15 },
        ],
      },
    ],
    metal: [
      {
        name: '金属双踩',
        steps: [
          { pitch: DRUM_MAP.kick, velocity: 120, step: 0 },
          { pitch: DRUM_MAP.crash, velocity: 100, step: 0 },
          { pitch: DRUM_MAP.kick, velocity: 120, step: 2 },
          { pitch: DRUM_MAP.kick, velocity: 120, step: 4 },
          { pitch: DRUM_MAP.snare, velocity: 120, step: 4 },
          { pitch: DRUM_MAP.kick, velocity: 120, step: 6 },
          { pitch: DRUM_MAP.kick, velocity: 120, step: 8 },
          { pitch: DRUM_MAP.kick, velocity: 120, step: 10 },
          { pitch: DRUM_MAP.snare, velocity: 120, step: 10 },
          { pitch: DRUM_MAP.kick, velocity: 120, step: 12 },
          { pitch: DRUM_MAP.kick, velocity: 120, step: 14 },
        ],
      },
    ],
  };

  const stylePatterns = patterns[style];
  return stylePatterns[rng.nextInt(0, stylePatterns.length - 1)];
}

/** 生成鼓组声部 */
export function generateDrums(
  style: MusicStyle,
  totalMeasures: number,
  beatsPerMeasure: number = 4,
  ticksPerBeat: number = 480,
  seed: number = 42
): MelodyLine {
  const rng = new SeededRandom(seed);
  const pattern = matchDrumPattern(style, rng);
  const stepDuration = ticksPerBeat / 4; // 16步
  const measureDuration = beatsPerMeasure * ticksPerBeat;
  const notes: NoteEvent[] = [];

  for (let measure = 0; measure < totalMeasures; measure++) {
    const measureOffset = measure * measureDuration;

    for (const step of pattern.steps) {
      notes.push({
        pitch: step.pitch,
        duration: stepDuration,
        velocity: Math.min(127, Math.max(1, step.velocity + rng.nextInt(-5, 5))),
        offset: measureOffset + step.step * stepDuration,
      });
    }
  }

  return {
    notes,
    voiceName: 'drums',
    channel: 9, // GM鼓通道
  };
}

/** 生成过门填充 */
export function generateFill(
  style: MusicStyle,
  beatsPerMeasure: number = 4,
  ticksPerBeat: number = 480,
  seed: number = 42
): MelodyLine {
  const rng = new SeededRandom(seed);
  const notes: NoteEvent[] = [];
  const stepDuration = ticksPerBeat / 4;
  const fillLength = beatsPerMeasure * ticksPerBeat;

  // 过门通常在最后2拍
  const startStep = (beatsPerMeasure - 2) * 4;

  switch (style) {
    case 'rock':
    case 'metal': {
      // 摇滚/金属：鼓卷入
      for (let step = startStep; step < startStep + 8; step++) {
        notes.push({
          pitch: step % 2 === 0 ? DRUM_MAP.snare : DRUM_MAP.tom1,
          duration: stepDuration,
          velocity: Math.min(127, 80 + (step - startStep) * 6),
          offset: step * stepDuration,
        });
      }
      // 最后的底鼓重击
      notes.push({
        pitch: DRUM_MAP.kick,
        duration: stepDuration,
        velocity: 127,
        offset: (startStep + 8) * stepDuration - stepDuration,
      });
      break;
    }
    case 'jazz': {
      // 爵士：骑镲+轻击
      for (let step = startStep; step < startStep + 8; step++) {
        if (rng.next() < 0.6) {
          notes.push({
            pitch: DRUM_MAP.ride,
            duration: stepDuration,
            velocity: 60 + rng.nextInt(0, 20),
            offset: step * stepDuration,
          });
        }
        if (step % 3 === 0) {
          notes.push({
            pitch: DRUM_MAP.snare,
            duration: stepDuration,
            velocity: 50 + rng.nextInt(0, 30),
            offset: step * stepDuration,
          });
        }
      }
      break;
    }
    case 'electronic': {
      // 电子：上升滤波效果模拟
      for (let step = startStep; step < startStep + 8; step++) {
        notes.push({
          pitch: DRUM_MAP.snare,
          duration: stepDuration * 0.5,
          velocity: Math.min(127, 60 + (step - startStep) * 8),
          offset: step * stepDuration,
        });
        if (step % 2 === 0) {
          notes.push({
            pitch: DRUM_MAP.hiHat,
            duration: stepDuration * 0.25,
            velocity: 80,
            offset: step * stepDuration,
          });
        }
      }
      break;
    }
    default: {
      // 通用：简短的军鼓填充
      for (let step = startStep; step < startStep + 8; step++) {
        notes.push({
          pitch: step % 2 === 0 ? DRUM_MAP.snare : DRUM_MAP.kick,
          duration: stepDuration,
          velocity: 80,
          offset: step * stepDuration,
        });
      }
      break;
    }
  }

  return {
    notes,
    voiceName: 'fill',
    channel: 9,
  };
}

/** 多轨编排：完整编曲 */
export function arrange(
  melodyNotes: NoteEvent[],
  style: MusicStyle = 'pop',
  totalMeasures: number = 16,
  beatsPerMeasure: number = 4,
  ticksPerBeat: number = 480,
  rootPitch: number = 60,
  isMajor: boolean = true,
  chordDegrees: number[] = [1, 5, 6, 4],
  beatsPerChord: number = 4,
  seed: number = 42
): ArrangementResult {
  const rng = new SeededRandom(seed);
  const preset = STYLE_PRESETS[style];

  // 主旋律
  const melody: MelodyLine = {
    notes: melodyNotes,
    voiceName: 'melody',
    channel: 0,
  };

  // 和声配置
  const harmonyConfig: HarmonyConfig = {
    rootPitch,
    isMajor,
    chordDegrees,
    beatsPerChord,
    chordTypes: [],
    useSeventhChords: style === 'jazz',
  };

  // 自动配和声
  const harmony = autoHarmonize(melodyNotes, harmonyConfig, ticksPerBeat);

  // 低音线
  const bassPatternMap: Record<string, BassPattern> = {
    root_note: 'root',
    walking: 'walking',
    ostinato: 'ostinato',
    arpeggio: 'arpeggio',
    power_chord: 'power',
  };
  const bass = generateBassLine(
    harmonyConfig,
    bassPatternMap[preset.bassStyle] as BassPattern,
    totalMeasures,
    beatsPerMeasure,
    ticksPerBeat,
    seed
  );

  // 鼓组
  const drums = generateDrums(style, totalMeasures, beatsPerMeasure, ticksPerBeat, seed);

  // 过门（每4小节一个）
  const fills: MelodyLine = {
    notes: [],
    voiceName: 'fills',
    channel: 9,
  };

  for (let m = 3; m < totalMeasures; m += 4) {
    const fill = generateFill(style, beatsPerMeasure, ticksPerBeat, seed + m);
    // 偏移到对应小节
    for (const note of fill.notes) {
      fills.notes.push({
        ...note,
        offset: note.offset + m * beatsPerMeasure * ticksPerBeat,
      });
    }
  }

  const totalDuration = totalMeasures * beatsPerMeasure * ticksPerBeat;

  return {
    melody,
    harmony,
    bass,
    drums,
    fills,
    style,
    totalDuration,
  };
}

/** 将编曲结果展平为MIDI事件序列 */
export function arrangementToMIDIEvents(result: ArrangementResult): NoteEvent[] {
  const allNotes: NoteEvent[] = [
    ...result.melody.notes.map(n => ({ ...n })),
    ...result.harmony.notes.map(n => ({ ...n })),
    ...result.bass.notes.map(n => ({ ...n })),
    ...result.drums.notes.map(n => ({ ...n })),
    ...result.fills.notes.map(n => ({ ...n })),
  ];

  allNotes.sort((a, b) => a.offset - b.offset);
  return allNotes;
}

// ============================================================
// 第九部分：综合生成入口
// ============================================================

/** AI作曲引擎配置 */
export interface AIComposerConfig {
  /** 使用哪种引擎 */
  engine: 'markov' | 'evolutionary' | 'fractal' | 'chaos' | 'quantum' | 'cellular_automata' | 'hybrid';
  /** 风格 */
  style: MusicStyle;
  /** 调性根音（MIDI） */
  rootPitch: number;
  /** 大调 */
  isMajor: boolean;
  /** BPM */
  bpm: number;
  /** 总小节数 */
  measures: number;
  /** 拍号分子 */
  beatsPerMeasure: number;
  /** 和弦进行级数 */
  chordDegrees: number[];
  /** 每和弦拍数 */
  beatsPerChord: number;
  /** 随机种子 */
  seed: number;
  /** 引擎特定参数 */
  engineParams: Record<string, number>;
}

/** 默认AI作曲配置 */
export const DEFAULT_AI_COMPOSER_CONFIG: AIComposerConfig = {
  engine: 'markov',
  style: 'pop',
  rootPitch: 60,
  isMajor: true,
  bpm: 120,
  measures: 16,
  beatsPerMeasure: 4,
  chordDegrees: [1, 5, 6, 4],
  beatsPerChord: 4,
  seed: 42,
  engineParams: {},
};

/** 使用指定引擎生成旋律 */
export function composeMelody(config: AIComposerConfig): NoteEvent[] {
  const ticksPerBeat = 480;
  const rng = new SeededRandom(config.seed);
  const totalBeats = config.measures * config.beatsPerMeasure;
  const noteCount = Math.round(totalBeats * 2); // 大约每拍两个音

  switch (config.engine) {
    case 'markov': {
      // 用预设音阶训练马尔可夫链
      const majorIntervals = [0, 2, 4, 5, 7, 9, 11];
      const minorIntervals = [0, 2, 3, 5, 7, 8, 10];
      const intervals = config.isMajor ? majorIntervals : minorIntervals;
      const scalePitches = intervals.map(i => config.rootPitch + i);
      // 扩展到两个八度
      const expandedPitches = [...scalePitches, ...scalePitches.map(p => p + 12)];

      const matrix = buildFirstOrderMatrix(expandedPitches);
      const markovConfig: MarkovConfig = {
        order: 1,
        noteCount,
        startPitch: config.rootPitch,
        startDuration: ticksPerBeat,
        pitchMin: config.rootPitch - 12,
        pitchMax: config.rootPitch + 24,
        seed: config.seed,
      };
      return generateMarkov1(matrix, markovConfig);
    }

    case 'evolutionary': {
      const gaConfig: GAConfig = {
        ...DEFAULT_GA_CONFIG,
        chromosomeLength: noteCount,
        pitchMin: config.rootPitch - 12,
        pitchMax: config.rootPitch + 24,
        chordRoots: config.chordDegrees.map(deg => {
          const majorIntervals = [0, 2, 4, 5, 7, 9, 11];
          const minorIntervals = [0, 2, 3, 5, 7, 8, 10];
          const intervals = config.isMajor ? majorIntervals : minorIntervals;
          return config.rootPitch + intervals[(deg - 1) % 7];
        }),
        seed: config.seed,
      };
      const best = evolutionaryCompose(gaConfig);
      return chromosomeToNotes(best);
    }

    case 'fractal': {
      const fractalConfig: FractalConfig = {
        iterations: Math.round(config.engineParams['iterations'] ?? 3),
        pitchRange: [config.rootPitch - 12, config.rootPitch + 24],
        dimension: config.engineParams['dimension'] ?? 1.5,
        seed: config.seed,
        noteCount,
        baseDuration: ticksPerBeat,
      };
      return mandelbrotMelody(fractalConfig);
    }

    case 'chaos': {
      const chaosConfig: ChaosConfig = {
        ...DEFAULT_CHAOS_CONFIG,
        steps: noteCount,
        seed: config.seed,
      };
      // 用混沌引擎生成节奏，再映射到旋律
      const rhythmNotes = lorenzRhythm(chaosConfig, ticksPerBeat / 2);
      // 将鼓音高替换为旋律音高
      const majorIntervals = [0, 2, 4, 5, 7, 9, 11];
      const minorIntervals = [0, 2, 3, 5, 7, 8, 10];
      const intervals = config.isMajor ? majorIntervals : minorIntervals;
      return rhythmNotes.map((n, i) => ({
        ...n,
        pitch: config.rootPitch + intervals[i % intervals.length],
        velocity: 80,
      }));
    }

    case 'quantum': {
      // 量子叠加多个简单旋律
      const melodies: NoteEvent[][] = [];
      for (let v = 0; v < 4; v++) {
        const melody: NoteEvent[] = [];
        let offset = 0;
        for (let i = 0; i < noteCount; i++) {
          const majorIntervals = [0, 2, 4, 5, 7, 9, 11];
          const minorIntervals = [0, 2, 3, 5, 7, 8, 10];
          const intervals = config.isMajor ? majorIntervals : minorIntervals;
          const pitch = config.rootPitch + intervals[rng.nextInt(0, intervals.length - 1)] + (v * 4 - 8);
          const duration = [RHYTHM_DURATIONS.eighth, RHYTHM_DURATIONS.quarter, RHYTHM_DURATIONS.half][rng.nextInt(0, 2)];
          melody.push({ pitch, duration, velocity: 80, offset });
          offset += duration;
        }
        melodies.push(melody);
      }
      return quantumSuperpositionMelody(melodies, { seed: config.seed, noteCount });
    }

    case 'cellular_automata': {
      const caConfig: CA1DConfig = {
        rule: Math.round(config.engineParams['rule'] ?? 30),
        width: 8,
        steps: noteCount,
        initMode: 'single',
        seed: config.seed,
      };
      const caNotes = ca1dToRhythm(caConfig, ticksPerBeat / 2);
      // 将鼓音高替换为旋律音高
      const majorIntervals = [0, 2, 4, 5, 7, 9, 11];
      const minorIntervals = [0, 2, 3, 5, 7, 8, 10];
      const intervals = config.isMajor ? majorIntervals : minorIntervals;
      return caNotes.map((n, i) => ({
        ...n,
        pitch: config.rootPitch + intervals[i % intervals.length],
        velocity: 80,
      }));
    }

    case 'hybrid': {
      // 混合引擎：各引擎生成片段后融合
      const markovMelody = composeMelody({ ...config, engine: 'markov', seed: config.seed });
      const fractalMelody = composeMelody({ ...config, engine: 'fractal', seed: config.seed + 1 });
      const quantumMelody = composeMelody({ ...config, engine: 'quantum', seed: config.seed + 2 });

      // 按权重混合
      const mixedNotes: NoteEvent[] = [];
      const sectionLength = Math.floor(noteCount / 3);
      let offset = 0;

      // 第一段：马尔可夫
      for (let i = 0; i < sectionLength && i < markovMelody.length; i++) {
        mixedNotes.push({ ...markovMelody[i], offset });
        offset += markovMelody[i].duration;
      }

      // 第二段：分形
      for (let i = 0; i < sectionLength && i < fractalMelody.length; i++) {
        mixedNotes.push({ ...fractalMelody[i], offset });
        offset += fractalMelody[i].duration;
      }

      // 第三段：量子
      for (let i = 0; i < sectionLength && i < quantumMelody.length; i++) {
        mixedNotes.push({ ...quantumMelody[i], offset });
        offset += quantumMelody[i].duration;
      }

      return mixedNotes;
    }
  }
}

/** 一键编曲：从配置到完整多轨输出 */
export function fullArrange(config: AIComposerConfig = DEFAULT_AI_COMPOSER_CONFIG): ArrangementResult {
  const melodyNotes = composeMelody(config);
  return arrange(
    melodyNotes,
    config.style,
    config.measures,
    config.beatsPerMeasure,
    480,
    config.rootPitch,
    config.isMajor,
    config.chordDegrees,
    config.beatsPerChord,
    config.seed
  );
}

// ============================================================
// 第十部分：导出汇总
// ============================================================

/** 马尔可夫链作曲引擎 */
export const MarkovComposer = {
  buildFirstOrderMatrix,
  buildSecondOrderMatrix,
  buildThirdOrderMatrix,
  generateMarkov1,
  generateMarkov2,
  generateMarkov3,
  markovChainBlend,
  trainAndGenerate,
  extractPitchDurationPairs,
  quantizePitch,
  quantizeDuration,
  sampleFromTransitions,
};

/** 遗传进化作曲引擎 */
export const EvolutionaryComposer = {
  initializePopulation,
  evaluateFitness,
  fitnessSmoothness,
  fitnessHarmony,
  fitnessRhythmDiversity,
  fitnessRangeReasonability,
  tournamentSelection,
  rouletteSelection,
  singlePointCrossover,
  uniformCrossover,
  mutatePitch,
  mutateDuration,
  mutateInversion,
  applyMutation,
  evolutionaryCompose,
  chromosomeToNotes,
  fastNonDominatedSort,
  crowdingDistanceAssignment,
  crowdingCompare,
  dominates,
};

/** 分形旋律生成引擎 */
export const FractalComposer = {
  mandelbrotIterate,
  mandelbrotToPitch,
  juliaIterate,
  juliaToPitch,
  mandelbrotMelody,
  juliaMelody,
  fractalSelfSimilarity,
  lsystemDerive,
  lsystemMelody,
  estimateFractalDimension,
  fractalDimensionControl,
};

/** 混沌节奏引擎 */
export const ChaosComposer = {
  lorenzStep,
  lorenzTrajectory,
  lorenzRhythm,
  rosslerStep,
  rosslerTrajectory,
  rosslerRhythm,
  logisticMap,
  logisticRhythm,
  poincareSection,
  poincareRhythm,
  attractorToRhythm,
};

/** 量子概率作曲引擎 */
export const QuantumComposer = {
  createZeroState,
  createSuperposition,
  quantumProbabilities,
  wavefunctionCollapse,
  hadamardGate,
  pauliXGate,
  pauliZGate,
  quantumSuperpositionMelody,
  quantumEntangledComposition,
  quantumGateMelody,
};

/** 细胞自动机节奏引擎 */
export const CAComposer = {
  runCA1D,
  ca1dToRhythm,
  runCA2D,
  ca2dToRhythm,
  evolveCARules,
  rhythmInterestEvaluation,
};

/** 编曲器 */
export const Arranger = {
  getChordPitches,
  autoHarmonize,
  generateBassLine,
  matchDrumPattern,
  generateDrums,
  generateFill,
  arrange,
  arrangementToMIDIEvents,
};

/** AI作曲总引擎 */
export const AIComposerEngine = {
  composeMelody,
  fullArrange,
  markov: MarkovComposer,
  evolutionary: EvolutionaryComposer,
  fractal: FractalComposer,
  chaos: ChaosComposer,
  quantum: QuantumComposer,
  cellularAutomata: CAComposer,
  arranger: Arranger,
  stylePresets: STYLE_PRESETS,
  defaultConfig: DEFAULT_AI_COMPOSER_CONFIG,
  rng: SeededRandom,
} as const;

export default AIComposerEngine;
