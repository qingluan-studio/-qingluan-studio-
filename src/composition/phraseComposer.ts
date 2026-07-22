/**
 * 乐句结构与呼吸感作曲引擎
 * 让AI旋律具有"提问-回答"乐句结构、情绪弧线与呼吸感
 */

const SAMPLE_RATE = 44100;

// -------------------- 类型定义 --------------------

/** 乐句功能类型 */
export type PhraseFunction = 'question' | 'answer' | 'transition' | 'climax' | 'cadence' | 'intro' | 'outro';

/** 情绪弧线类型 */
export type ArcType = 'ascend' | 'descend' | 'arch' | 'valley' | 'wave' | 'flat';

/** 单条音符 */
export interface PhraseNote {
  midi: number;
  startTime: number;
  duration: number;
  velocity: number;
}

/** 乐句 */
export interface Phrase {
  id: number;
  function: PhraseFunction;
  bars: number;
  notes: PhraseNote[];
  breathGap: number; // 乐句结束后的休止时间（秒）
  arcType: ArcType;
}

/** 乐句作曲配置 */
export interface PhraseConfig {
  keyRoot: number;
  scale: number[];
  bpm: number;
  barsPerPhrase?: number; // 默认 4
  totalBars: number;
  emotion?: 'joy' | 'sadness' | 'anger' | 'serenity' | 'tension' | 'nostalgia';
  style?: 'pop' | 'classical' | 'jazz' | 'folk' | 'chinese';
}

/** generatePhrase 参数 */
export interface GeneratePhraseParams {
  function: PhraseFunction;
  keyRoot: number;
  scale: number[];
  bpm: number;
  bars: number;
  arcType?: string;
  previousPhraseLastNote?: number;
  style?: string;
  emotion?: string;
}

// -------------------- 内部工具 --------------------

/** 简单确定性随机数生成器 */
class SimpleRng {
  private state: number;

  constructor(seed: number = 42) {
    this.state = seed & 0x7fffffff;
    if (this.state === 0) this.state = 1;
  }

  next(): number {
    this.state = (this.state * 1103515245 + 12345) & 0x7fffffff;
    return this.state / 0x7fffffff;
  }

  nextInt(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  gaussian(mu: number = 0, sigma: number = 1): number {
    const u1 = this.next();
    const u2 = this.next();
    const z = Math.sqrt(-2 * Math.log(u1 + 1e-10)) * Math.cos(2 * Math.PI * u2);
    return mu + sigma * z;
  }

  choice<T>(arr: T[]): T {
    return arr[this.nextInt(0, arr.length - 1)];
  }
}

/** 秒数转采样点数 */
function secondsToSamples(seconds: number): number {
  return Math.round(seconds * SAMPLE_RATE);
}

/** 获取拍长（秒） */
function beatDurationSeconds(bpm: number): number {
  return 60 / bpm;
}

/** 将MIDI音高量化到给定音阶 */
function quantizeToScale(pitch: number, keyRoot: number, scale: number[]): number {
  const pc = ((pitch - keyRoot) % 12 + 12) % 12;
  let bestDelta = 12;
  let bestPitch = pitch;
  for (const interval of scale) {
    const delta = Math.abs(pc - interval);
    const altDelta = Math.abs(pc - (interval + 12));
    const minDelta = Math.min(delta, altDelta, Math.abs(pc - (interval - 12)));
    if (minDelta < bestDelta) {
      bestDelta = minDelta;
      const octave = Math.round((pitch - keyRoot - interval) / 12);
      bestPitch = keyRoot + interval + octave * 12;
    }
  }
  return bestPitch;
}

/** 获取指定级数的音高 */
function degreeToPitch(keyRoot: number, scale: number[], degreeIndex: number, octaveOffset: number = 0): number {
  const idx = ((degreeIndex % scale.length) + scale.length) % scale.length;
  const octaves = Math.floor(degreeIndex / scale.length) + octaveOffset;
  return keyRoot + scale[idx] + octaves * 12;
}

/** 弧线映射：将进度t∈[0,1]映射到音高偏移 */
function arcPitchOffset(t: number, arcType: ArcType): number {
  switch (arcType) {
    case 'ascend':
      return t * 7; // 上升约七度
    case 'descend':
      return (1 - t) * 7;
    case 'arch':
      return Math.sin(t * Math.PI) * 5;
    case 'valley':
      return -Math.sin(t * Math.PI) * 5;
    case 'wave':
      return Math.sin(t * Math.PI * 2) * 3;
    case 'flat':
    default:
      return 0;
  }
}

/** 弧线力度映射 */
function arcVelocity(t: number, arcType: ArcType, baseVel: number): number {
  switch (arcType) {
    case 'ascend':
      return baseVel + t * 25;
    case 'descend':
      return baseVel + (1 - t) * 20;
    case 'arch':
      return baseVel + Math.sin(t * Math.PI) * 30;
    case 'valley':
      return baseVel - Math.sin(t * Math.PI) * 15;
    case 'wave':
      return baseVel + Math.sin(t * Math.PI * 2) * 10;
    case 'flat':
    default:
      return baseVel;
  }
}

/** 根据情绪选择默认弧线 */
function emotionToArcs(emotion: PhraseConfig['emotion']): ArcType[] {
  switch (emotion) {
    case 'joy':
      return ['ascend', 'wave', 'ascend', 'arch'];
    case 'sadness':
      return ['descend', 'valley', 'descend', 'flat'];
    case 'anger':
      return ['ascend', 'ascend', 'arch', 'descend'];
    case 'serenity':
      return ['flat', 'arch', 'flat', 'wave'];
    case 'tension':
      return ['valley', 'ascend', 'ascend', 'arch'];
    case 'nostalgia':
      return ['arch', 'descend', 'wave', 'flat'];
    default:
      return ['wave', 'arch', 'ascend', 'descend'];
  }
}

/** 分配乐句功能序列 */
function allocatePhraseFunctions(totalBars: number, barsPerPhrase: number): { func: PhraseFunction; bars: number }[] {
  const maxPhrases = Math.max(1, Math.floor(totalBars / barsPerPhrase));
  const allocation: { func: PhraseFunction; bars: number }[] = [];

  if (maxPhrases >= 8) {
    // 经典长结构
    allocation.push({ func: 'intro', bars: barsPerPhrase });
    allocation.push({ func: 'question', bars: barsPerPhrase });
    allocation.push({ func: 'answer', bars: barsPerPhrase });
    allocation.push({ func: 'transition', bars: barsPerPhrase });
    allocation.push({ func: 'question', bars: barsPerPhrase });
    allocation.push({ func: 'answer', bars: barsPerPhrase });
    allocation.push({ func: 'climax', bars: barsPerPhrase });
    allocation.push({ func: 'cadence', bars: barsPerPhrase });
    allocation.push({ func: 'outro', bars: barsPerPhrase });
  } else if (maxPhrases >= 5) {
    // 中等结构
    allocation.push({ func: 'intro', bars: Math.min(2, barsPerPhrase) });
    allocation.push({ func: 'question', bars: barsPerPhrase });
    allocation.push({ func: 'answer', bars: barsPerPhrase });
    allocation.push({ func: 'transition', bars: barsPerPhrase });
    allocation.push({ func: 'climax', bars: barsPerPhrase });
    allocation.push({ func: 'cadence', bars: barsPerPhrase });
  } else {
    // 短旋律简化结构
    allocation.push({ func: 'question', bars: barsPerPhrase });
    if (maxPhrases >= 2) allocation.push({ func: 'answer', bars: barsPerPhrase });
    if (maxPhrases >= 3) allocation.push({ func: 'question', bars: barsPerPhrase });
    if (maxPhrases >= 4) allocation.push({ func: 'answer', bars: barsPerPhrase });
    if (maxPhrases >= 5) allocation.push({ func: 'cadence', bars: barsPerPhrase });
  }

  // 根据总小节数截断或扩展
  let usedBars = 0;
  const result: { func: PhraseFunction; bars: number }[] = [];
  for (const item of allocation) {
    if (usedBars + item.bars > totalBars) {
      const remaining = totalBars - usedBars;
      if (remaining > 0) {
        result.push({ func: item.func, bars: remaining });
      }
      break;
    }
    result.push(item);
    usedBars += item.bars;
  }

  // 如果还有剩余，加一个尾声
  if (usedBars < totalBars) {
    result.push({ func: 'outro', bars: totalBars - usedBars });
  }

  return result;
}

// -------------------- 旋律生成内核 --------------------

/** 生成单个乐句的音符序列 */
function generatePhraseNotes(
  params: {
    phraseFunc: PhraseFunction;
    keyRoot: number;
    scale: number[];
    bpm: number;
    bars: number;
    arcType: ArcType;
    prevLastNote?: number;
    style?: string;
    emotion?: string;
  },
  rng: SimpleRng
): PhraseNote[] {
  const { phraseFunc, keyRoot, scale, bpm, bars, arcType, prevLastNote, style } = params;
  const beatDur = beatDurationSeconds(bpm);
  const beatsPerBar = 4;
  const totalBeats = bars * beatsPerBar;
  const totalDuration = totalBeats * beatDur;

  let density = 2;
  if (style === 'classical') density = rng.nextInt(2, 4);
  if (style === 'jazz') density = rng.nextInt(2, 3);
  if (params.emotion === 'serenity') density = 1;

  const noteCount = Math.max(4, totalBeats * density);
  const notes: PhraseNote[] = [];

  let currentPitch: number;
  if (prevLastNote !== undefined) {
    const pivotCandidates = [
      prevLastNote,
      prevLastNote + scale[rng.nextInt(0, scale.length - 1)],
      prevLastNote + rng.nextInt(-3, 3),
    ];
    currentPitch = quantizeToScale(pivotCandidates[rng.nextInt(0, pivotCandidates.length - 1)], keyRoot, scale);
  } else {
    currentPitch = keyRoot + scale[0] + 12;
  }

  const basePitch = currentPitch;
  let consecutiveDirection = 0;
  let lastDirection = 0;
  const timeStep = totalDuration / noteCount;

  for (let i = 0; i < noteCount; i++) {
    const t = i / (noteCount - 1 || 1);
    const arcOffset = arcPitchOffset(t, arcType);
    const targetPitch = basePitch + arcOffset + rng.gaussian(0, 1.5);
    let nextPitch = quantizeToScale(Math.round(targetPitch), keyRoot, scale);

    const interval = nextPitch - currentPitch;
    if (Math.abs(interval) > 12) {
      nextPitch = currentPitch + Math.sign(interval) * 7;
      nextPitch = quantizeToScale(nextPitch, keyRoot, scale);
    }

    const direction = Math.sign(nextPitch - currentPitch);
    if (direction === lastDirection && direction !== 0) {
      consecutiveDirection++;
      if (consecutiveDirection >= 3) {
        nextPitch = currentPitch - direction * rng.nextInt(1, 3);
        nextPitch = quantizeToScale(nextPitch, keyRoot, scale);
        consecutiveDirection = 0;
        lastDirection = -direction;
      } else {
        lastDirection = direction;
      }
    } else {
      consecutiveDirection = direction === 0 ? 0 : 1;
      lastDirection = direction;
    }

    if (i === noteCount - 1) {
      if (phraseFunc === 'question') {
        const unstableDegrees = [1, 3, 5, 6];
        const deg = unstableDegrees[rng.nextInt(0, unstableDegrees.length - 1)];
        nextPitch = degreeToPitch(keyRoot, scale, deg, 1);
      } else if (phraseFunc === 'answer' || phraseFunc === 'cadence' || phraseFunc === 'outro') {
        const stableDegrees = [0, 2, 4];
        const deg = stableDegrees[rng.nextInt(0, stableDegrees.length - 1)];
        nextPitch = degreeToPitch(keyRoot, scale, deg, 1);
      } else if (phraseFunc === 'climax') {
        nextPitch = degreeToPitch(keyRoot, scale, 4, 1);
      }
    }

    if (phraseFunc === 'answer' && i < noteCount / 2) {
      nextPitch = quantizeToScale(currentPitch + rng.nextInt(-2, 2), keyRoot, scale);
    }

    if (phraseFunc === 'transition') {
      nextPitch = quantizeToScale(basePitch + arcOffset * 1.5 + rng.nextInt(-2, 2), keyRoot, scale);
    }

    if (style === 'chinese' && i >= noteCount - 2 && (phraseFunc === 'cadence' || phraseFunc === 'outro')) {
      nextPitch = quantizeToScale(nextPitch - rng.nextInt(1, 3), keyRoot, scale);
    }

    let noteDur = timeStep * (0.8 + rng.next() * 0.4);
    if (style === 'jazz') {
      noteDur = i % 2 === 0 ? timeStep * 1.2 : timeStep * 0.6;
    }

    let baseVel = 80;
    if (i === 0) baseVel = 65;
    if (phraseFunc === 'climax') baseVel = 95;
    if (phraseFunc === 'intro') baseVel = 55;
    if (phraseFunc === 'outro') baseVel = 50;

    let velocity = arcVelocity(t, arcType, baseVel) + rng.gaussian(0, 5);
    velocity = Math.min(127, Math.max(1, Math.round(velocity)));

    notes.push({
      midi: Math.round(nextPitch),
      startTime: i * timeStep,
      duration: Math.max(0.05, noteDur),
      velocity,
    });

    currentPitch = nextPitch;
  }

  for (let i = 1; i < notes.length - 1; i++) {
    const prev = notes[i - 1].midi;
    const curr = notes[i].midi;
    const next = notes[i + 1].midi;
    if (Math.abs(curr - prev) > 4) {
      const expectedNext = curr + Math.sign(prev - curr) * rng.nextInt(1, 2);
      notes[i + 1].midi = quantizeToScale(expectedNext, keyRoot, scale);
    }
  }

  return notes;
}

// -------------------- PhraseComposer 类 --------------------

export class PhraseComposer {
  private rng: SimpleRng;
  private phraseIdCounter: number;

  constructor(seed: number = 42) {
    this.rng = new SimpleRng(seed);
    this.phraseIdCounter = 0;
  }

  compose(config: PhraseConfig): { phrases: Phrase[]; allNotes: PhraseNote[] } {
    const barsPerPhrase = config.barsPerPhrase ?? 4;
    const style = config.style ?? 'pop';
    const emotion = config.emotion ?? 'joy';
    const funcAlloc = allocatePhraseFunctions(config.totalBars, barsPerPhrase);
    const arcPool = emotionToArcs(emotion);

    const phrases: Phrase[] = [];
    let previousLastNote: number | undefined;

    for (let i = 0; i < funcAlloc.length; i++) {
      const alloc = funcAlloc[i];
      let bars = alloc.bars;
      if (style === 'pop') bars = Math.min(bars, this.rng.nextInt(2, 4));
      if (style === 'classical') bars = Math.max(bars, 4);
      if (style === 'jazz') bars = this.rng.nextInt(3, 5);

      const arcType: ArcType = arcPool[i % arcPool.length];
      const phrase = this.generatePhrase({
        function: alloc.func,
        keyRoot: config.keyRoot,
        scale: config.scale,
        bpm: config.bpm,
        bars,
        arcType,
        previousPhraseLastNote: previousLastNote,
        style,
        emotion,
      });
      phrase.arcType = arcType;
      phrases.push(phrase);
      if (phrase.notes.length > 0) {
        previousLastNote = phrase.notes[phrase.notes.length - 1].midi;
      }
    }

    this.connectPhrases(phrases);
    this.addBreathing(phrases);

    const allNotes: PhraseNote[] = [];
    let globalOffset = 0;
    for (const phrase of phrases) {
      for (const note of phrase.notes) {
        allNotes.push({ ...note, startTime: globalOffset + note.startTime });
      }
      const phraseDuration = phrase.bars * 4 * beatDurationSeconds(config.bpm);
      globalOffset += phraseDuration + phrase.breathGap;
    }

    return { phrases, allNotes };
  }

  generatePhrase(params: GeneratePhraseParams): Phrase {
    const {
      function: phraseFunc,
      keyRoot,
      scale,
      bpm,
      bars,
      arcType: rawArc,
      previousPhraseLastNote,
      style,
      emotion,
    } = params;

    const arcType: ArcType = (rawArc as ArcType) ?? 'wave';
    const notes = generatePhraseNotes(
      { phraseFunc, keyRoot, scale, bpm, bars, arcType, prevLastNote: previousPhraseLastNote, style, emotion },
      this.rng
    );

    const id = this.phraseIdCounter++;
    const breathGap = 0.1 + this.rng.next() * 0.4;

    return { id, function: phraseFunc, bars, notes, breathGap, arcType };
  }

  connectPhrases(phrases: Phrase[]): Phrase[] {
    for (let i = 1; i < phrases.length; i++) {
      const prev = phrases[i - 1];
      const curr = phrases[i];
      if (prev.notes.length === 0 || curr.notes.length === 0) continue;

      const lastNote = prev.notes[prev.notes.length - 1];
      const firstNote = curr.notes[0];
      const jump = firstNote.midi - lastNote.midi;
      if (Math.abs(jump) > 12) {
        firstNote.midi = lastNote.midi + Math.sign(jump) * this.rng.nextInt(3, 7);
      }

      const pivotOptions = [lastNote.midi, lastNote.midi + 2, lastNote.midi - 2, lastNote.midi + 3, lastNote.midi - 3];
      firstNote.midi = pivotOptions[this.rng.nextInt(0, pivotOptions.length - 1)];

      const finalJump = Math.abs(firstNote.midi - lastNote.midi);
      if (finalJump > 12) {
        firstNote.midi = lastNote.midi + Math.sign(firstNote.midi - lastNote.midi) * 7;
      }
    }
    return phrases;
  }

  addBreathing(phrases: Phrase[]): Phrase[] {
    for (const phrase of phrases) {
      if (phrase.notes.length === 0) continue;

      const lastNote = phrase.notes[phrase.notes.length - 1];
      lastNote.duration *= (0.8 + this.rng.next() * 0.1);
      lastNote.velocity = Math.max(30, lastNote.velocity - 10 - this.rng.nextInt(0, 15));

      const firstNote = phrase.notes[0];
      if (phrase.function !== 'climax') {
        firstNote.velocity = Math.max(40, firstNote.velocity - 10);
      }

      if (phrase.function === 'outro' || phrase.function === 'cadence') {
        for (let i = 0; i < phrase.notes.length; i++) {
          const t = i / (phrase.notes.length - 1 || 1);
          phrase.notes[i].velocity = Math.max(20, phrase.notes[i].velocity - t * 40);
        }
      }
    }
    return phrases;
  }
}

// -------------------- 高层便捷函数 --------------------

/** 快速生成带乐句结构的旋律 */
export function composeWithPhrases(params: {
  keyRoot?: number;
  scale?: number[];
  bpm?: number;
  totalBars?: number;
  emotion?: string;
  style?: string;
}): PhraseNote[] {
  const keyRoot = params.keyRoot ?? 60; // C4
  const scale = params.scale ?? [0, 2, 4, 5, 7, 9, 11]; // 大调
  const bpm = params.bpm ?? 120;
  const totalBars = params.totalBars ?? 16;
  const emotion = (params.emotion as PhraseConfig['emotion']) ?? 'joy';
  const style = (params.style as PhraseConfig['style']) ?? 'pop';

  const composer = new PhraseComposer(42);
  const result = composer.compose({
    keyRoot,
    scale,
    bpm,
    totalBars,
    emotion,
    style,
  });

  return result.allNotes;
}

// -------------------- 命名导出 --------------------

export { secondsToSamples, beatDurationSeconds };
