/**
 * @file arrangementEngine.ts
 * @description 青鸾数字音频工作站 - 编曲引擎
 * 提供完整歌曲结构生成、段落变奏、过渡效果、Build-up/Drop/Breakdown
 * 自动生成对位旋律、配器建议与能量曲线映射等高级编曲功能。
 *
 * @module qingluan-daw/composition/arrangementEngine
 * @version 1.0.0
 */

import {
  clamp,
  lerp,
  smoothstep,
  mapRange,
  midiToFrequency,
  noteToMidi,
  midiToNoteName,
  getPitchClass,
  getOctave,
  calculateNoteDuration,
} from '../utils/audioUtils.js';

// =============================================================================
// 常量定义
// =============================================================================

/** 统一采样率 */
export const SAMPLE_RATE = 44100;

/** 默认 BPM */
export const DEFAULT_BPM = 128;

/** 默认每小节拍数 */
export const BEATS_PER_BAR = 4;

/** 支持的音乐风格列表 */
export const SUPPORTED_GENRES = [
  'house', 'techno', 'trance', 'dubstep', 'drumAndBass',
  'hipHop', 'pop', 'rock', 'jazz', 'ambient', 'orchestral', 'synthwave',
] as const;

/** 支持的能量曲线类型 */
export const ENERGY_CURVE_TYPES = [
  'linear', 'exponential', 'sigmoid', 'sine', 'plateau', 'valley',
] as const;

/** 支持的段落类型 */
export const SECTION_TYPES = [
  'Intro', 'Verse', 'Chorus', 'Bridge', 'PreChorus', 'Outro',
  'Breakdown', 'Drop', 'Build', 'Filler',
] as const;

/** 支持的过渡类型 */
export const TRANSITION_TYPES = [
  'filterSweepUp', 'filterSweepDown', 'riser', 'drumFill',
  'reverseReverb', 'noiseRise', 'snareRoll', 'impact',
] as const;

// =============================================================================
// 类型定义
// =============================================================================

/**
 * 音乐风格类型
 * @typedef Genre
 */
export type Genre = typeof SUPPORTED_GENRES[number];

/**
 * 能量曲线类型
 * @typedef EnergyCurveType
 */
export type EnergyCurveType = typeof ENERGY_CURVE_TYPES[number];

/**
 * 段落类型
 * @typedef SectionType
 */
export type SectionType = typeof SECTION_TYPES[number];

/**
 * 过渡效果类型
 * @typedef TransitionType
 */
export type TransitionType = typeof TRANSITION_TYPES[number];

/**
 * 歌曲段落接口
 * @interface Section
 */
export interface Section {
  /** 段落类型 */
  type: SectionType;
  /** 段落名称（可自定义） */
  name: string;
  /** 起始小节 */
  startBar: number;
  /** 持续小节数 */
  durationBars: number;
  /** 能量级别 (0.0 ~ 1.0) */
  energy: number;
  /** 紧张度 (0.0 ~ 1.0) */
  tension: number;
  /** 情绪标签数组 */
  mood: string[];
  /** 配器建议列表 */
  instrumentation: string[];
  /** 调式/音阶建议 */
  scaleSuggestion?: string;
  /** 速度变化建议 (BPM 偏移) */
  tempoShift?: number;
  /** 变奏强度 (0.0 ~ 1.0) */
  variationIntensity?: number;
}

/**
 * 过渡效果定义
 * @interface Transition
 */
export interface Transition {
  /** 起始段落索引 */
  fromSectionIndex: number;
  /** 目标段落索引 */
  toSectionIndex: number;
  /** 过渡类型 */
  type: TransitionType;
  /** 过渡持续小节数 */
  durationBars: number;
  /** 起始小节 */
  startBar: number;
  /** 强度 (0.0 ~ 1.0) */
  intensity: number;
  /** 额外参数 */
  params?: Record<string, number>;
}

/**
 * 歌曲结构类
 * @class SongStructure
 */
export class SongStructure {
  /** 歌曲总小节数 */
  public totalBars: number;
  /** BPM */
  public bpm: number;
  /** 调式（如 'C major', 'A minor'） */
  public key: string;
  /** 风格 */
  public genre: Genre;
  /** 段落列表 */
  public sections: Section[];
  /** 过渡效果列表 */
  public transitions: Transition[];
  /** 能量曲线采样点（每小节一个值） */
  public energyCurve: number[];
  /** 紧张度曲线 */
  public tensionCurve: number[];
  /** 全局配器列表 */
  public globalInstrumentation: string[];
  /** 创建时间戳 */
  public createdAt: number;

  constructor(genre: Genre = 'house', bpm: number = DEFAULT_BPM, key: string = 'C major') {
    this.totalBars = 0;
    this.bpm = bpm;
    this.key = key;
    this.genre = genre;
    this.sections = [];
    this.transitions = [];
    this.energyCurve = [];
    this.tensionCurve = [];
    this.globalInstrumentation = [];
    this.createdAt = Date.now();
  }

  /**
   * 添加段落
   * @param section - 段落对象
   */
  public addSection(section: Section): void {
    this.sections.push(section);
    this.recalculateTotalBars();
  }

  /**
   * 在指定索引处插入段落
   * @param index - 插入位置
   * @param section - 段落对象
   */
  public insertSection(index: number, section: Section): void {
    this.sections.splice(index, 0, section);
    this.recalculateTotalBars();
  }

  /**
   * 移除段落
   * @param index - 段落索引
   */
  public removeSection(index: number): Section | undefined {
    const removed = this.sections.splice(index, 1)[0];
    this.recalculateTotalBars();
    return removed;
  }

  /**
   * 获取指定小节所在的段落
   * @param bar - 小节数（0 起始）
   * @returns 段落对象或 undefined
   */
  public getSectionAtBar(bar: number): Section | undefined {
    for (const sec of this.sections) {
      if (bar >= sec.startBar && bar < sec.startBar + sec.durationBars) {
        return sec;
      }
    }
    return undefined;
  }

  /**
   * 重新计算总小节数与段落起始位置
   */
  public recalculateTotalBars(): void {
    let bar = 0;
    for (const sec of this.sections) {
      sec.startBar = bar;
      bar += sec.durationBars;
    }
    this.totalBars = bar;
    this.updateCurves();
  }

  /**
   * 更新能量与紧张度曲线
   */
  public updateCurves(): void {
    this.energyCurve = new Array(this.totalBars).fill(0);
    this.tensionCurve = new Array(this.totalBars).fill(0);

    for (const sec of this.sections) {
      for (let i = 0; i < sec.durationBars; i++) {
        const bar = sec.startBar + i;
        if (bar < this.totalBars) {
          // 段内能量渐变：从起始能量过渡到目标能量
          const progress = sec.durationBars > 1 ? i / (sec.durationBars - 1) : 0;
          this.energyCurve[bar] = lerp(sec.energy, sec.energy * 0.95 + 0.05, progress);
          this.tensionCurve[bar] = lerp(sec.tension, sec.tension * 0.9, progress);
        }
      }
    }
  }

  /**
   * 导出为 JSON 结构
   * @returns 纯对象
   */
  public toJSON(): object {
    return {
      totalBars: this.totalBars,
      bpm: this.bpm,
      key: this.key,
      genre: this.genre,
      sections: this.sections,
      transitions: this.transitions,
      energyCurve: this.energyCurve,
      tensionCurve: this.tensionCurve,
      globalInstrumentation: this.globalInstrumentation,
    };
  }
}

/**
 * 旋律片段
 * @interface MelodyPhrase
 */
export interface MelodyPhrase {
  /** 音符数组（MIDI 编号） */
  notes: number[];
  /** 对应时间（秒） */
  times: number[];
  /** 持续时间（秒） */
  durations: number[];
  /** 力度数组 */
  velocities: number[];
}

/**
 * 配器建议结果
 * @interface InstrumentationSuggestion
 */
export interface InstrumentationSuggestion {
  /** 乐器名称 */
  instrument: string;
  /** 适用段落类型 */
  sections: SectionType[];
  /** 能量范围 */
  energyRange: [number, number];
  /** 角色描述 */
  role: string;
  /** 优先级 (1-10) */
  priority: number;
}

/**
 * 变奏参数
 * @interface VariationParams
 */
export interface VariationParams {
  /** 节奏变化强度 */
  rhythmicVariation: number;
  /** 音高变化强度 */
  pitchVariation: number;
  /** 力度变化强度 */
  velocityVariation: number;
  /** 装饰音密度 */
  ornamentationDensity: number;
  /** 是否反向 */
  retrograde: boolean;
  /** 是否倒影 */
  inversion: boolean;
}

// =============================================================================
// ArrangementEngine 类
// =============================================================================

/**
 * 编曲引擎
 *
 * 提供完整歌曲结构自动生成、段落变奏、过渡效果、Build-up/Drop/Breakdown 生成、
 * 自动旋律分配、对位旋律生成、配器建议与能量曲线映射。
 *
 * @class ArrangementEngine
 * @example
 * ```ts
 * const engine = new ArrangementEngine();
 * const song = engine.createStructure('house', 64, 'sigmoid');
 * engine.addTransition(0, 1, 'filterSweepUp');
 * const variation = engine.generateVariation(song.sections[1], 0.5);
 * ```
 */
export class ArrangementEngine {
  /** 当前歌曲结构 */
  public currentSong: SongStructure | null;
  /** 随机种子 */
  private rngSeed: number;
  /** 变奏缓存 */
  private variationCache: Map<string, MelodyPhrase>;

  constructor() {
    this.currentSong = null;
    this.rngSeed = Date.now() % 2147483647;
    this.variationCache = new Map();
  }

  /**
   * 创建完整歌曲结构
   *
   * 根据风格、目标时长与能量曲线自动生成合理的段落排布。
   *
   * @param style - 音乐风格
   * @param durationBars - 目标总小节数（建议 32 ~ 128）
   * @param energyCurve - 能量曲线类型或自定义数值数组
   * @returns 生成的歌曲结构
   */
  public createStructure(
    style: Genre,
    durationBars: number,
    energyCurve: EnergyCurveType | number[] = 'sigmoid'
  ): SongStructure {
    const song = new SongStructure(style, DEFAULT_BPM, 'C major');
    this.currentSong = song;

    // 根据风格选择典型结构模板
    const template = this.selectTemplateForGenre(style, durationBars);
    for (const sec of template) {
      song.addSection(sec);
    }

    // 生成能量曲线
    if (Array.isArray(energyCurve)) {
      song.energyCurve = energyCurve.slice(0, song.totalBars);
      while (song.energyCurve.length < song.totalBars) {
        song.energyCurve.push(energyCurve[energyCurve.length - 1] ?? 0.5);
      }
    } else {
      song.energyCurve = this.generateEnergyCurve(energyCurve, song.totalBars);
    }

    // 生成紧张度曲线（通常领先能量曲线 2-4 小节）
    song.tensionCurve = this.generateTensionCurve(song.energyCurve);

    // 根据曲线更新各段能量/紧张度
    for (const sec of song.sections) {
      const midBar = sec.startBar + Math.floor(sec.durationBars / 2);
      sec.energy = song.energyCurve[clamp(midBar, 0, song.totalBars - 1)];
      sec.tension = song.tensionCurve[clamp(midBar, 0, song.totalBars - 1)];
    }

    // 生成全局配器建议
    song.globalInstrumentation = this.generateGlobalInstrumentation(style, song);

    return song;
  }

  /**
   * 添加过渡效果
   * @param from - 起始段落索引
   * @param to - 目标段落索引
   * @param type - 过渡类型
   * @param intensity - 强度 (0.0 ~ 1.0)
   * @param durationBars - 持续小节数，默认 2
   * @returns 创建的过渡对象
   */
  public addTransition(
    from: number,
    to: number,
    type: TransitionType,
    intensity: number = 0.7,
    durationBars: number = 2
  ): Transition {
    if (!this.currentSong) {
      throw new Error('请先调用 createStructure 创建歌曲结构');
    }
    const fromSec = this.currentSong.sections[from];
    const toSec = this.currentSong.sections[to];
    if (!fromSec || !toSec) {
      throw new Error('段落索引无效');
    }

    const startBar = fromSec.startBar + fromSec.durationBars - durationBars;
    const transition: Transition = {
      fromSectionIndex: from,
      toSectionIndex: to,
      type,
      durationBars: clamp(durationBars, 1, 4),
      startBar: clamp(startBar, 0, this.currentSong.totalBars - 1),
      intensity: clamp(intensity, 0, 1),
      params: this.getDefaultTransitionParams(type),
    };
    this.currentSong.transitions.push(transition);
    return transition;
  }

  /**
   * 生成段落变奏
   *
   * 对给定段落的旋律进行节奏/音高/力度变化，生成新的旋律片段。
   *
   * @param section - 目标段落
   * @param intensity - 变奏强度 (0.0 ~ 1.0)
   * @param baseMelody - 可选的基础旋律
   * @returns 变奏后的旋律片段
   */
  public generateVariation(section: Section, intensity: number, baseMelody?: MelodyPhrase): MelodyPhrase {
    const params: VariationParams = {
      rhythmicVariation: intensity * 0.8,
      pitchVariation: intensity * 0.5,
      velocityVariation: intensity * 0.6,
      ornamentationDensity: intensity * 0.4,
      retrograde: this.randomFloat() < intensity * 0.2,
      inversion: this.randomFloat() < intensity * 0.2,
    };

    if (!baseMelody) {
      // 生成默认基础旋律
      baseMelody = this.generateDefaultMelody(section);
    }

    const cacheKey = `${section.type}-${section.startBar}-${intensity}-${JSON.stringify(baseMelody.notes)}`;
    if (this.variationCache.has(cacheKey)) {
      return this.variationCache.get(cacheKey)!;
    }

    let notes = [...baseMelody.notes];
    let times = [...baseMelody.times];
    let durations = [...baseMelody.durations];
    let velocities = [...baseMelody.velocities];

    // 节奏变奏：随机细分或合并音符
    if (params.rhythmicVariation > 0) {
      const newNotes: number[] = [];
      const newTimes: number[] = [];
      const newDurations: number[] = [];
      const newVelocities: number[] = [];

      for (let i = 0; i < notes.length; i++) {
        if (this.randomFloat() < params.rhythmicVariation * 0.3 && durations[i] > 0.25) {
          // 细分音符
          const splitCount = 2;
          const subDur = durations[i] / splitCount;
          for (let s = 0; s < splitCount; s++) {
            newNotes.push(notes[i] + (this.randomFloat() < 0.3 ? Math.floor(this.randomFloat() * 5) - 2 : 0));
            newTimes.push(times[i] + s * subDur);
            newDurations.push(subDur * 0.9);
            newVelocities.push(velocities[i] * (0.9 + this.randomFloat() * 0.2));
          }
        } else {
          newNotes.push(notes[i]);
          newTimes.push(times[i]);
          newDurations.push(durations[i]);
          newVelocities.push(velocities[i]);
        }
      }
      notes = newNotes;
      times = newTimes;
      durations = newDurations;
      velocities = newVelocities;
    }

    // 音高变奏
    if (params.pitchVariation > 0) {
      for (let i = 0; i < notes.length; i++) {
        if (this.randomFloat() < params.pitchVariation) {
          const offset = Math.floor(this.randomFloat() * 5) - 2;
          notes[i] = clamp(notes[i] + offset, 24, 96);
        }
      }
    }

    // 力度变奏
    if (params.velocityVariation > 0) {
      for (let i = 0; i < velocities.length; i++) {
        const delta = (this.randomFloat() * 2 - 1) * params.velocityVariation * 0.3;
        velocities[i] = clamp(velocities[i] + delta, 0.1, 1.0);
      }
    }

    // 装饰音
    if (params.ornamentationDensity > 0) {
      const ornamented: MelodyPhrase = {
        notes: [],
        times: [],
        durations: [],
        velocities: [],
      };
      for (let i = 0; i < notes.length; i++) {
        ornamented.notes.push(notes[i]);
        ornamented.times.push(times[i]);
        ornamented.durations.push(durations[i]);
        ornamented.velocities.push(velocities[i]);
        if (this.randomFloat() < params.ornamentationDensity * 0.2 && i < notes.length - 1) {
          // 添加经过音
          const passing = Math.round((notes[i] + notes[i + 1]) / 2);
          ornamented.notes.push(passing);
          ornamented.times.push(times[i] + durations[i] * 0.5);
          ornamented.durations.push(durations[i] * 0.3);
          ornamented.velocities.push(velocities[i] * 0.7);
        }
      }
      notes = ornamented.notes;
      times = ornamented.times;
      durations = ornamented.durations;
      velocities = ornamented.velocities;
    }

    // 反向
    if (params.retrograde) {
      notes.reverse();
      times.reverse();
      durations.reverse();
      velocities.reverse();
    }

    // 倒影
    if (params.inversion && notes.length > 0) {
      const center = notes[0];
      notes = notes.map((n) => center * 2 - n);
      notes = notes.map((n) => clamp(n, 24, 96));
    }

    const result: MelodyPhrase = { notes, times, durations, velocities };
    this.variationCache.set(cacheKey, result);
    return result;
  }

  /**
   * 自动将旋律分配到歌曲结构各段落
   *
   * 根据段落类型与能量自动裁剪/重复/变奏旋律。
   *
   * @param melody - 输入旋律
   * @param structure - 歌曲结构
   * @returns 每个段落对应的旋律映射
   */
  public autoArrangeMelody(melody: MelodyPhrase, structure: SongStructure): Map<number, MelodyPhrase> {
    const map = new Map<number, MelodyPhrase>();
    let melodyIndex = 0;

    for (let i = 0; i < structure.sections.length; i++) {
      const sec = structure.sections[i];
      const secDurationBars = sec.durationBars;
      const secDurationSeconds = secDurationBars * (240 / structure.bpm);

      // 计算该段落应分配的音符数
      const notesPerBar = 4;
      const targetNotes = secDurationBars * notesPerBar;

      const sliced: MelodyPhrase = {
        notes: [],
        times: [],
        durations: [],
        velocities: [],
      };

      let localTime = 0;
      for (let n = 0; n < targetNotes; n++) {
        const srcIdx = (melodyIndex + n) % melody.notes.length;
        sliced.notes.push(melody.notes[srcIdx]);
        sliced.times.push(localTime);
        sliced.durations.push(melody.durations[srcIdx] ?? 0.25);
        sliced.velocities.push((melody.velocities[srcIdx] ?? 0.8) * sec.energy);
        localTime += sliced.durations[n];
      }

      // 对特定段落自动应用变奏
      if (sec.type === 'Chorus' || sec.type === 'Drop') {
        const variation = this.generateVariation(sec, 0.3, sliced);
        map.set(i, variation);
      } else if (sec.type === 'Bridge') {
        const variation = this.generateVariation(sec, 0.6, sliced);
        map.set(i, variation);
      } else {
        map.set(i, sliced);
      }

      melodyIndex += targetNotes;
    }

    return map;
  }

  /**
   * 自动生成对位旋律
   *
   * 基于输入旋律与和声规则生成二声部对位旋律。
   *
   * @param melody - 主声部旋律
   * @param section - 所属段落（用于确定调式与能量）
   * @returns 对位旋律片段
   */
  public autoAddCounterMelody(melody: MelodyPhrase, section: Section): MelodyPhrase {
    const counter: MelodyPhrase = {
      notes: [],
      times: [],
      durations: [],
      velocities: [],
    };

    // 简化的对位规则：三度/六度平行，避免平行五八度
    const intervals = [3, 4, 8, 9]; // 小三度、大三度、小六度、大六度
    let lastInterval = intervals[Math.floor(this.randomFloat() * intervals.length)];

    for (let i = 0; i < melody.notes.length; i++) {
      const basePitch = melody.notes[i];
      const time = melody.times[i];
      const duration = melody.durations[i];

      // 随机选择协和音程，避免连续相同音程
      let interval = intervals[Math.floor(this.randomFloat() * intervals.length)];
      if (interval === lastInterval && this.randomFloat() < 0.6) {
        interval = intervals[Math.floor(this.randomFloat() * intervals.length)];
      }
      lastInterval = interval;

      const counterPitch = basePitch + interval;
      counter.notes.push(clamp(counterPitch, 24, 96));
      counter.times.push(time);
      counter.durations.push(duration);
      // 对位声部通常略弱于主声部
      counter.velocities.push(clamp((melody.velocities[i] ?? 0.7) * 0.75, 0.2, 0.8));
    }

    return counter;
  }

  /**
   * 根据结构和风格建议配器
   *
   * @param structure - 歌曲结构
   * @param genre - 音乐风格
   * @returns 配器建议列表
   */
  public suggestInstrumentation(structure: SongStructure, genre: Genre): InstrumentationSuggestion[] {
    const suggestions: InstrumentationSuggestion[] = [];
    const presets: Record<Genre, InstrumentationSuggestion[]> = {
      house: [
        { instrument: 'kick', sections: ['Intro', 'Verse', 'Chorus', 'Build', 'Drop'], energyRange: [0.3, 1.0], role: '节奏基底', priority: 10 },
        { instrument: 'bass', sections: ['Verse', 'Chorus', 'Drop'], energyRange: [0.4, 1.0], role: '低频支撑', priority: 9 },
        { instrument: 'hihat', sections: ['Verse', 'Chorus', 'Build', 'Drop'], energyRange: [0.3, 1.0], role: '高频节奏', priority: 7 },
        { instrument: 'pad', sections: ['Intro', 'Breakdown', 'Build'], energyRange: [0.2, 0.8], role: '和声铺垫', priority: 6 },
        { instrument: 'leadSynth', sections: ['Chorus', 'Drop'], energyRange: [0.6, 1.0], role: '主旋律', priority: 9 },
        { instrument: 'pluck', sections: ['Verse', 'PreChorus'], energyRange: [0.4, 0.8], role: '节奏点缀', priority: 5 },
        { instrument: 'fxRise', sections: ['Build'], energyRange: [0.5, 1.0], role: '过渡上升', priority: 8 },
        { instrument: 'snare', sections: ['Chorus', 'Drop', 'Build'], energyRange: [0.5, 1.0], role: '反拍强调', priority: 7 },
      ],
      techno: [
        { instrument: 'kick', sections: ['Intro', 'Verse', 'Chorus', 'Build', 'Drop'], energyRange: [0.3, 1.0], role: '四四拍基底', priority: 10 },
        { instrument: 'bass', sections: ['Verse', 'Chorus', 'Drop'], energyRange: [0.4, 1.0], role: '酸性低音', priority: 9 },
        { instrument: 'percussion', sections: ['Verse', 'Chorus', 'Build'], energyRange: [0.3, 1.0], role: '打击层次', priority: 7 },
        { instrument: 'pad', sections: ['Intro', 'Breakdown'], energyRange: [0.2, 0.7], role: '氛围铺垫', priority: 6 },
        { instrument: 'lead', sections: ['Chorus', 'Drop'], energyRange: [0.6, 1.0], role: '旋律线', priority: 8 },
        { instrument: 'ride', sections: ['Build', 'Chorus'], energyRange: [0.5, 1.0], role: '持续推动', priority: 6 },
      ],
      trance: [
        { instrument: 'kick', sections: ['Intro', 'Verse', 'Chorus', 'Build', 'Drop'], energyRange: [0.3, 1.0], role: '驱动基底', priority: 10 },
        { instrument: 'bass', sections: ['Verse', 'Chorus', 'Drop'], energyRange: [0.4, 1.0], role: '滚动低音', priority: 9 },
        { instrument: 'pad', sections: ['Intro', 'Verse', 'Breakdown', 'Build'], energyRange: [0.2, 0.8], role: '宏大和声', priority: 8 },
        { instrument: 'leadSynth', sections: ['Chorus', 'Drop'], energyRange: [0.7, 1.0], role: ' uplifting 主音', priority: 10 },
        { instrument: 'pluck', sections: ['Verse', 'PreChorus'], energyRange: [0.4, 0.8], role: '琶音分解', priority: 7 },
        { instrument: 'fxRise', sections: ['Build'], energyRange: [0.5, 1.0], role: '上升音效', priority: 9 },
        { instrument: 'hihat', sections: ['Verse', 'Chorus', 'Drop'], energyRange: [0.4, 1.0], role: '开镲节奏', priority: 7 },
      ],
      dubstep: [
        { instrument: 'kick', sections: ['Intro', 'Verse', 'Chorus', 'Drop'], energyRange: [0.3, 1.0], role: '重击底鼓', priority: 10 },
        { instrument: 'snare', sections: ['Verse', 'Chorus', 'Drop'], energyRange: [0.4, 1.0], role: '军鼓爆发', priority: 9 },
        { instrument: 'bass', sections: ['Verse', 'Chorus', 'Drop'], energyRange: [0.5, 1.0], role: 'wobble 低音', priority: 10 },
        { instrument: 'growl', sections: ['Drop'], energyRange: [0.7, 1.0], role: '咆哮音色', priority: 8 },
        { instrument: 'lead', sections: ['Chorus', 'Drop'], energyRange: [0.6, 1.0], role: '旋律线', priority: 7 },
        { instrument: 'fxImpact', sections: ['Drop'], energyRange: [0.8, 1.0], role: '冲击效果', priority: 8 },
      ],
      drumAndBass: [
        { instrument: 'kick', sections: ['Intro', 'Verse', 'Chorus', 'Drop'], energyRange: [0.3, 1.0], role: '碎拍底鼓', priority: 10 },
        { instrument: 'snare', sections: ['Verse', 'Chorus', 'Drop'], energyRange: [0.4, 1.0], role: '快步军鼓', priority: 9 },
        { instrument: 'bass', sections: ['Verse', 'Chorus', 'Drop'], energyRange: [0.5, 1.0], role: 'reese 低音', priority: 10 },
        { instrument: 'pad', sections: ['Intro', 'Breakdown'], energyRange: [0.2, 0.7], role: '氛围铺垫', priority: 6 },
        { instrument: 'amenBreak', sections: ['Verse', 'Chorus'], energyRange: [0.5, 1.0], role: '碎拍采样', priority: 8 },
        { instrument: 'hihat', sections: ['Verse', 'Chorus', 'Drop'], energyRange: [0.4, 1.0], role: '高速踩镲', priority: 7 },
      ],
      hipHop: [
        { instrument: 'kick', sections: ['Intro', 'Verse', 'Chorus'], energyRange: [0.3, 1.0], role: '重击底鼓', priority: 10 },
        { instrument: 'snare', sections: ['Verse', 'Chorus'], energyRange: [0.3, 1.0], role: '反拍军鼓', priority: 9 },
        { instrument: 'hihat', sections: ['Verse', 'Chorus'], energyRange: [0.3, 1.0], role: '踩镲节奏', priority: 7 },
        { instrument: 'bass', sections: ['Verse', 'Chorus'], energyRange: [0.4, 1.0], role: '低频贝斯', priority: 8 },
        { instrument: 'sample', sections: ['Intro', 'Verse', 'Chorus'], energyRange: [0.3, 0.9], role: '采样切片', priority: 6 },
        { instrument: 'synthLead', sections: ['Chorus'], energyRange: [0.6, 1.0], role: '旋律钩子', priority: 7 },
        { instrument: 'fxScratch', sections: ['Verse', 'Chorus'], energyRange: [0.4, 0.9], role: '搓盘效果', priority: 4 },
      ],
      pop: [
        { instrument: 'kick', sections: ['Intro', 'Verse', 'Chorus', 'Bridge'], energyRange: [0.3, 1.0], role: '流行底鼓', priority: 10 },
        { instrument: 'snare', sections: ['Verse', 'Chorus', 'Bridge'], energyRange: [0.3, 1.0], role: '反拍军鼓', priority: 9 },
        { instrument: 'bass', sections: ['Verse', 'Chorus', 'Bridge'], energyRange: [0.4, 1.0], role: '电贝斯', priority: 8 },
        { instrument: 'piano', sections: ['Intro', 'Verse', 'Bridge'], energyRange: [0.3, 0.8], role: '和声进行', priority: 7 },
        { instrument: 'synthPad', sections: ['Intro', 'Chorus', 'Bridge'], energyRange: [0.3, 0.9], role: '铺底音色', priority: 6 },
        { instrument: 'leadVocal', sections: ['Verse', 'Chorus', 'Bridge'], energyRange: [0.4, 1.0], role: '主唱旋律', priority: 10 },
        { instrument: 'strings', sections: ['Chorus', 'Bridge'], energyRange: [0.5, 1.0], role: '弦乐提升', priority: 7 },
      ],
      rock: [
        { instrument: 'drums', sections: ['Intro', 'Verse', 'Chorus', 'Bridge'], energyRange: [0.4, 1.0], role: '真鼓组', priority: 10 },
        { instrument: 'bass', sections: ['Verse', 'Chorus', 'Bridge'], energyRange: [0.4, 1.0], role: '电贝斯', priority: 9 },
        { instrument: 'rhythmGuitar', sections: ['Verse', 'Chorus'], energyRange: [0.4, 1.0], role: '节奏吉他', priority: 8 },
        { instrument: 'leadGuitar', sections: ['Chorus', 'Bridge'], energyRange: [0.6, 1.0], role: '主音吉他', priority: 8 },
        { instrument: 'vocal', sections: ['Verse', 'Chorus', 'Bridge'], energyRange: [0.4, 1.0], role: '人声', priority: 10 },
        { instrument: 'piano', sections: ['Intro', 'Bridge'], energyRange: [0.3, 0.8], role: '键盘点缀', priority: 5 },
      ],
      jazz: [
        { instrument: 'drums', sections: ['Intro', 'Verse', 'Chorus', 'Bridge'], energyRange: [0.3, 1.0], role: '爵士鼓', priority: 10 },
        { instrument: 'doubleBass', sections: ['Verse', 'Chorus', 'Bridge'], energyRange: [0.3, 0.9], role: '低音提琴', priority: 9 },
        { instrument: 'piano', sections: ['Intro', 'Verse', 'Chorus', 'Bridge'], energyRange: [0.3, 1.0], role: '钢琴comping', priority: 9 },
        { instrument: 'saxophone', sections: ['Verse', 'Chorus', 'Bridge'], energyRange: [0.4, 1.0], role: '萨克斯主音', priority: 8 },
        { instrument: 'trumpet', sections: ['Chorus', 'Bridge'], energyRange: [0.5, 1.0], role: '小号点缀', priority: 7 },
        { instrument: 'guitar', sections: ['Verse', 'Chorus'], energyRange: [0.3, 0.8], role: '爵士吉他', priority: 6 },
      ],
      ambient: [
        { instrument: 'pad', sections: ['Intro', 'Verse', 'Chorus', 'Outro'], energyRange: [0.2, 0.9], role: '长音铺垫', priority: 10 },
        { instrument: 'texture', sections: ['Intro', 'Verse', 'Chorus'], energyRange: [0.2, 0.8], role: '环境纹理', priority: 8 },
        { instrument: 'bells', sections: ['Verse', 'Chorus'], energyRange: [0.2, 0.7], role: '钟声点缀', priority: 6 },
        { instrument: 'bassDrone', sections: ['Intro', 'Verse', 'Outro'], energyRange: [0.2, 0.6], role: '低音 drone', priority: 7 },
        { instrument: 'fieldRecording', sections: ['Intro', 'Outro'], energyRange: [0.1, 0.5], role: '田野录音', priority: 5 },
      ],
      orchestral: [
        { instrument: 'strings', sections: ['Intro', 'Verse', 'Chorus', 'Bridge'], energyRange: [0.3, 1.0], role: '弦乐群', priority: 10 },
        { instrument: 'woodwinds', sections: ['Verse', 'Chorus', 'Bridge'], energyRange: [0.3, 0.9], role: '木管旋律', priority: 7 },
        { instrument: 'brass', sections: ['Chorus', 'Bridge'], energyRange: [0.6, 1.0], role: '铜管爆发', priority: 9 },
        { instrument: 'percussion', sections: ['Chorus', 'Bridge'], energyRange: [0.5, 1.0], role: '定音鼓/打击', priority: 8 },
        { instrument: 'harp', sections: ['Intro', 'Verse', 'Bridge'], energyRange: [0.2, 0.7], role: '竖琴琶音', priority: 6 },
        { instrument: 'choir', sections: ['Chorus', 'Bridge'], energyRange: [0.5, 1.0], role: '合唱', priority: 8 },
      ],
      synthwave: [
        { instrument: 'kick', sections: ['Intro', 'Verse', 'Chorus', 'Drop'], energyRange: [0.3, 1.0], role: '模拟底鼓', priority: 10 },
        { instrument: 'snare', sections: ['Verse', 'Chorus', 'Drop'], energyRange: [0.4, 1.0], role: '门限军鼓', priority: 9 },
        { instrument: 'bass', sections: ['Verse', 'Chorus', 'Drop'], energyRange: [0.4, 1.0], role: '模拟低音', priority: 9 },
        { instrument: 'leadSynth', sections: ['Chorus', 'Drop'], energyRange: [0.6, 1.0], role: '锯齿主音', priority: 10 },
        { instrument: 'arp', sections: ['Verse', 'Chorus'], energyRange: [0.4, 0.9], role: '琶音分解', priority: 7 },
        { instrument: 'brassStab', sections: ['Chorus', 'Drop'], energyRange: [0.6, 1.0], role: '铜管 stab', priority: 7 },
        { instrument: 'tomFill', sections: ['Build', 'Drop'], energyRange: [0.5, 1.0], role: '通鼓填充', priority: 6 },
      ],
    };

    const genrePresets = presets[genre] ?? presets.house;
    for (const preset of genrePresets) {
      suggestions.push({ ...preset });
    }

    return suggestions;
  }

  /**
   * 生成 Build-up 段落音频事件描述
   *
   * 生成持续上升的能量、滤波器开启、鼓点加速、上升音效等。
   *
   * @param intensity - 强度 (0.0 ~ 1.0)
   * @param durationBars - 持续小节数
   * @returns Build-up 事件描述数组
   */
  public generateBuildUp(intensity: number, durationBars: number): Array<{
    time: number;
    type: string;
    params: Record<string, number>;
  }> {
    const beatDuration = 60.0 / (this.currentSong?.bpm ?? DEFAULT_BPM);
    const barDuration = beatDuration * 4;
    const totalDuration = durationBars * barDuration;
    const events: Array<{ time: number; type: string; params: Record<string, number> }> = [];

    // 滤波器 sweep up
    events.push({
      time: 0,
      type: 'filterSweepUp',
      params: { startFreq: 200, endFreq: 12000, duration: totalDuration, intensity },
    });

    // 上升噪声
    events.push({
      time: 0,
      type: 'noiseRise',
      params: { startAmp: 0.0, endAmp: intensity * 0.8, duration: totalDuration },
    });

    // 每小节添加一次 snare roll 加速
    for (let bar = 0; bar < durationBars; bar++) {
      const progress = bar / Math.max(1, durationBars - 1);
      const rollDensity = 2 + Math.floor(progress * 6); // 从每小节2次增加到8次
      for (let r = 0; r < rollDensity; r++) {
        events.push({
          time: bar * barDuration + (r / rollDensity) * barDuration,
          type: 'snareHit',
          params: { velocity: lerp(0.4, 1.0, progress), pitch: 38 },
        });
      }
    }

    // riser 音效
    events.push({
      time: 0,
      type: 'riser',
      params: { startPitch: 60, endPitch: 84, duration: totalDuration, intensity },
    });

    return events.sort((a, b) => a.time - b.time);
  }

  /**
   * 生成 Drop 段落音频事件描述
   *
   * 高能量爆发、全频开放、重低音与主音同步进入。
   *
   * @param energy - 能量级别 (0.0 ~ 1.0)
   * @param durationBars - 持续小节数
   * @returns Drop 事件描述数组
   */
  public generateDrop(energy: number, durationBars: number): Array<{
    time: number;
    type: string;
    params: Record<string, number>;
  }> {
    const beatDuration = 60.0 / (this.currentSong?.bpm ?? DEFAULT_BPM);
    const barDuration = beatDuration * 4;
    const totalDuration = durationBars * barDuration;
    const events: Array<{ time: number; type: string; params: Record<string, number> }> = [];

    // Drop 起始冲击
    events.push({
      time: 0,
      type: 'impact',
      params: { frequency: 60, velocity: energy, duration: 0.5 },
    });

    // 全开滤波器
    events.push({
      time: 0,
      type: 'filterOpen',
      params: { cutoff: 15000, resonance: 0.5 },
    });

    // 持续 kick
    for (let bar = 0; bar < durationBars; bar++) {
      for (let beat = 0; beat < 4; beat++) {
        events.push({
          time: bar * barDuration + beat * beatDuration,
          type: 'kick',
          params: { velocity: energy, pitch: 36 },
        });
      }
    }

    // bass 同步
    events.push({
      time: 0,
      type: 'bass',
      params: { velocity: energy * 0.9, pitch: 36, duration: totalDuration },
    });

    // lead 切入
    events.push({
      time: 0,
      type: 'leadSynth',
      params: { velocity: energy * 0.85, pitch: 72 },
    });

    return events.sort((a, b) => a.time - b.time);
  }

  /**
   * 生成 Breakdown 段落音频事件描述
   *
   * 去除鼓组与低音，保留和声与旋律，制造情绪落差。
   *
   * @param durationBars - 持续小节数
   * @returns Breakdown 事件描述数组
   */
  public addBreakdown(durationBars: number): Array<{
    time: number;
    type: string;
    params: Record<string, number>;
  }> {
    const beatDuration = 60.0 / (this.currentSong?.bpm ?? DEFAULT_BPM);
    const barDuration = beatDuration * 4;
    const totalDuration = durationBars * barDuration;
    const events: Array<{ time: number; type: string; params: Record<string, number> }> = [];

    // 和声 pad
    events.push({
      time: 0,
      type: 'pad',
      params: { velocity: 0.5, duration: totalDuration, filterCutoff: 2000 },
    });

    // 稀疏旋律
    for (let bar = 0; bar < durationBars; bar++) {
      events.push({
        time: bar * barDuration + beatDuration,
        type: 'melody',
        params: { velocity: 0.6, pitch: 60 + (bar % 4) * 2 },
      });
    }

    // 环境纹理
    events.push({
      time: 0,
      type: 'texture',
      params: { velocity: 0.3, duration: totalDuration },
    });

    // 轻柔打击（如 conga / tambourine）
    for (let bar = 0; bar < durationBars; bar++) {
      events.push({
        time: bar * barDuration + beatDuration * 2,
        type: 'percussionSoft',
        params: { velocity: 0.4, pitch: 54 },
      });
    }

    return events.sort((a, b) => a.time - b.time);
  }

  // =============================================================================
  // 内部辅助方法
  // =============================================================================

  /**
   * 为指定风格选择段落模板
   */
  private selectTemplateForGenre(genre: Genre, durationBars: number): Section[] {
    const templates: Record<string, Section[]> = {
      house: [
        { type: 'Intro', name: 'Intro', startBar: 0, durationBars: 8, energy: 0.2, tension: 0.1, mood: ['空旷'], instrumentation: ['kick', 'hihat'] },
        { type: 'Verse', name: 'Verse 1', startBar: 8, durationBars: 16, energy: 0.5, tension: 0.3, mood: ['律动'], instrumentation: ['kick', 'bass', 'hihat', 'pad'] },
        { type: 'Build', name: 'Build-up', startBar: 24, durationBars: 4, energy: 0.8, tension: 0.9, mood: ['紧张', '上升'], instrumentation: ['riser', 'snare'] },
        { type: 'Drop', name: 'Drop 1', startBar: 28, durationBars: 16, energy: 1.0, tension: 0.5, mood: ['爆发', '高潮'], instrumentation: ['kick', 'bass', 'leadSynth', 'snare'] },
        { type: 'Breakdown', name: 'Breakdown', startBar: 44, durationBars: 8, energy: 0.3, tension: 0.2, mood: ['回落', '情绪'], instrumentation: ['pad', 'pluck'] },
        { type: 'Build', name: 'Build-up 2', startBar: 52, durationBars: 4, energy: 0.8, tension: 0.9, mood: ['紧张'], instrumentation: ['riser', 'snare'] },
        { type: 'Drop', name: 'Drop 2', startBar: 56, durationBars: 16, energy: 1.0, tension: 0.5, mood: ['爆发'], instrumentation: ['kick', 'bass', 'leadSynth'] },
        { type: 'Outro', name: 'Outro', startBar: 72, durationBars: 8, energy: 0.2, tension: 0.1, mood: ['消散'], instrumentation: ['pad'] },
      ],
      pop: [
        { type: 'Intro', name: 'Intro', startBar: 0, durationBars: 4, energy: 0.2, tension: 0.1, mood: ['引入'], instrumentation: ['piano'] },
        { type: 'Verse', name: 'Verse 1', startBar: 4, durationBars: 8, energy: 0.4, tension: 0.2, mood: ['叙事'], instrumentation: ['kick', 'bass', 'piano', 'leadVocal'] },
        { type: 'PreChorus', name: 'Pre-Chorus', startBar: 12, durationBars: 4, energy: 0.6, tension: 0.5, mood: ['推进'], instrumentation: ['snare', 'synthPad'] },
        { type: 'Chorus', name: 'Chorus 1', startBar: 16, durationBars: 8, energy: 0.85, tension: 0.4, mood: ['释放'], instrumentation: ['kick', 'bass', 'strings', 'leadVocal'] },
        { type: 'Verse', name: 'Verse 2', startBar: 24, durationBars: 8, energy: 0.45, tension: 0.25, mood: ['叙事'], instrumentation: ['kick', 'bass', 'piano', 'leadVocal'] },
        { type: 'PreChorus', name: 'Pre-Chorus 2', startBar: 32, durationBars: 4, energy: 0.65, tension: 0.55, mood: ['推进'], instrumentation: ['snare', 'synthPad'] },
        { type: 'Chorus', name: 'Chorus 2', startBar: 36, durationBars: 8, energy: 0.9, tension: 0.45, mood: ['释放'], instrumentation: ['kick', 'bass', 'strings', 'leadVocal'] },
        { type: 'Bridge', name: 'Bridge', startBar: 44, durationBars: 8, energy: 0.5, tension: 0.6, mood: ['转折'], instrumentation: ['piano', 'strings'] },
        { type: 'Chorus', name: 'Final Chorus', startBar: 52, durationBars: 8, energy: 1.0, tension: 0.5, mood: ['高潮'], instrumentation: ['kick', 'bass', 'strings', 'leadVocal'] },
        { type: 'Outro', name: 'Outro', startBar: 60, durationBars: 4, energy: 0.2, tension: 0.1, mood: ['结束'], instrumentation: ['piano'] },
      ],
    };

    let template = templates[genre];
    if (!template) {
      // 通用模板
      template = [
        { type: 'Intro', name: 'Intro', startBar: 0, durationBars: 4, energy: 0.2, tension: 0.1, mood: ['引入'], instrumentation: [] },
        { type: 'Verse', name: 'Verse', startBar: 4, durationBars: 8, energy: 0.5, tension: 0.3, mood: ['发展'], instrumentation: [] },
        { type: 'Chorus', name: 'Chorus', startBar: 12, durationBars: 8, energy: 0.8, tension: 0.4, mood: ['高潮'], instrumentation: [] },
        { type: 'Verse', name: 'Verse 2', startBar: 20, durationBars: 8, energy: 0.5, tension: 0.3, mood: ['发展'], instrumentation: [] },
        { type: 'Chorus', name: 'Chorus 2', startBar: 28, durationBars: 8, energy: 0.85, tension: 0.45, mood: ['高潮'], instrumentation: [] },
        { type: 'Outro', name: 'Outro', startBar: 36, durationBars: 4, energy: 0.2, tension: 0.1, mood: ['结束'], instrumentation: [] },
      ];
    }

    // 调整模板时长以匹配目标 durationBars
    const currentTotal = template.reduce((sum, s) => sum + s.durationBars, 0);
    if (currentTotal !== durationBars) {
      const ratio = durationBars / currentTotal;
      for (const sec of template) {
        sec.durationBars = Math.max(2, Math.round(sec.durationBars * ratio));
      }
      // 重新校准，确保精确匹配
      let accumulated = template.reduce((sum, s) => sum + s.durationBars, 0);
      let diff = durationBars - accumulated;
      let idx = 0;
      while (diff !== 0 && idx < template.length) {
        const adjust = diff > 0 ? 1 : -1;
        if (template[idx].durationBars + adjust >= 2) {
          template[idx].durationBars += adjust;
          diff -= adjust;
        }
        idx = (idx + 1) % template.length;
      }
    }

    return template;
  }

  /**
   * 生成能量曲线数值数组
   */
  private generateEnergyCurve(type: EnergyCurveType, bars: number): number[] {
    const curve: number[] = [];
    for (let i = 0; i < bars; i++) {
      const t = bars > 1 ? i / (bars - 1) : 0;
      let value = 0.5;
      switch (type) {
        case 'linear':
          value = t;
          break;
        case 'exponential':
          value = t * t;
          break;
        case 'sigmoid':
          value = 1 / (1 + Math.exp(-10 * (t - 0.5)));
          break;
        case 'sine':
          value = (Math.sin(t * Math.PI * 2 - Math.PI / 2) + 1) / 2;
          break;
        case 'plateau':
          value = t < 0.3 ? t / 0.3 : t > 0.7 ? (1 - t) / 0.3 : 1.0;
          break;
        case 'valley':
          value = 1 - ((Math.sin(t * Math.PI * 2 - Math.PI / 2) + 1) / 2);
          break;
        default:
          value = smoothstep(0, 1, t);
      }
      curve.push(clamp(value, 0, 1));
    }
    return curve;
  }

  /**
   * 根据能量曲线生成紧张度曲线（通常领先能量曲线）
   */
  private generateTensionCurve(energyCurve: number[]): number[] {
    const tension: number[] = [];
    for (let i = 0; i < energyCurve.length; i++) {
      const leadIndex = Math.min(i + 2, energyCurve.length - 1);
      const t = energyCurve[leadIndex] * 1.1;
      tension.push(clamp(t, 0, 1));
    }
    return tension;
  }

  /**
   * 生成全局配器
   */
  private generateGlobalInstrumentation(genre: Genre, song: SongStructure): string[] {
    const suggestions = this.suggestInstrumentation(song, genre);
    const set = new Set<string>();
    for (const s of suggestions) {
      set.add(s.instrument);
    }
    return Array.from(set);
  }

  /**
   * 获取过渡效果的默认参数
   */
  private getDefaultTransitionParams(type: TransitionType): Record<string, number> {
    const params: Record<TransitionType, Record<string, number>> = {
      filterSweepUp: { startFreq: 200, endFreq: 12000, resonance: 0.5 },
      filterSweepDown: { startFreq: 12000, endFreq: 200, resonance: 0.5 },
      riser: { startPitch: 60, endPitch: 84, duration: 2 },
      drumFill: { density: 0.8, complexity: 0.6 },
      reverseReverb: { duration: 1.5, wet: 0.7 },
      noiseRise: { startAmp: 0, endAmp: 0.8, filterFreq: 8000 },
      snareRoll: { startVelocity: 0.3, endVelocity: 1.0, acceleration: 1.5 },
      impact: { frequency: 80, decay: 0.5, wet: 0.6 },
    };
    return params[type] ?? {};
  }

  /**
   * 生成默认旋律
   */
  private generateDefaultMelody(section: Section): MelodyPhrase {
    const bpm = this.currentSong?.bpm ?? DEFAULT_BPM;
    const beatDur = 60.0 / bpm;
    const notes: number[] = [];
    const times: number[] = [];
    const durations: number[] = [];
    const velocities: number[] = [];

    const scale = [60, 62, 64, 65, 67, 69, 71]; // C major
    let time = 0;
    for (let i = 0; i < section.durationBars * 4; i++) {
      const pitch = scale[i % scale.length] + (Math.floor(i / scale.length) % 2) * 12;
      notes.push(pitch);
      times.push(time);
      durations.push(beatDur);
      velocities.push(section.energy);
      time += beatDur;
    }

    return { notes, times, durations, velocities };
  }

  /**
   * 伪随机数生成
   */
  private randomFloat(): number {
    this.rngSeed = (16807 * this.rngSeed) % 2147483647;
    return (this.rngSeed - 1) / 2147483646;
  }
}

// =============================================================================
// 能量曲线工具函数
// =============================================================================

/**
 * 将能量曲线映射到音量增益（dB）
 * @param energy - 能量值 (0.0 ~ 1.0)
 * @param minDb - 最小 dB，默认 -60
 * @param maxDb - 最大 dB，默认 0
 * @returns 增益值 (dB)
 */
export function energyToDb(energy: number, minDb: number = -60, maxDb: number = 0): number {
  const t = clamp(energy, 0, 1);
  return lerp(minDb, maxDb, t);
}

/**
 * 将能量曲线映射到滤波器截止频率
 * @param energy - 能量值
 * @param minFreq - 最低频率 (Hz)
 * @param maxFreq - 最高频率 (Hz)
 * @returns 截止频率 (Hz)
 */
export function energyToFilterFreq(energy: number, minFreq: number = 100, maxFreq: number = 16000): number {
  const t = clamp(energy, 0, 1);
  return lerp(minFreq, maxFreq, t);
}

/**
 * 计算两个段落之间的能量差
 * @param from - 起始段落
 * @param to - 目标段落
 * @returns 能量差值
 */
export function calculateEnergyJump(from: Section, to: Section): number {
  return to.energy - from.energy;
}

/**
 * 判断是否需要过渡效果
 * @param from - 起始段落
 * @param to - 目标段落
 * @param threshold - 能量差阈值
 * @returns 是否需要过渡
 */
export function needsTransition(from: Section, to: Section, threshold: number = 0.3): boolean {
  return Math.abs(calculateEnergyJump(from, to)) >= threshold;
}

/**
 * 生成能量曲线平滑版本（移动平均）
 * @param curve - 原始曲线
 * @param windowSize - 平滑窗口大小
 * @returns 平滑后曲线
 */
export function smoothEnergyCurve(curve: number[], windowSize: number = 3): number[] {
  const result: number[] = [];
  const half = Math.floor(windowSize / 2);
  for (let i = 0; i < curve.length; i++) {
    let sum = 0;
    let count = 0;
    for (let j = -half; j <= half; j++) {
      const idx = i + j;
      if (idx >= 0 && idx < curve.length) {
        sum += curve[idx];
        count++;
      }
    }
    result.push(count > 0 ? sum / count : curve[i]);
  }
  return result;
}

/**
 * 将歌曲结构转换为时间轴事件列表
 * @param structure - 歌曲结构
 * @returns 时间轴事件数组
 */
export function structureToTimeline(structure: SongStructure): Array<{
  timeSeconds: number;
  bar: number;
  event: string;
  sectionType: SectionType;
}> {
  const bpm = structure.bpm;
  const beatDuration = 60.0 / bpm;
  const barDuration = beatDuration * 4;
  const events: Array<{ timeSeconds: number; bar: number; event: string; sectionType: SectionType }> = [];

  for (const sec of structure.sections) {
    events.push({
      timeSeconds: sec.startBar * barDuration,
      bar: sec.startBar,
      event: `${sec.name} 开始`,
      sectionType: sec.type,
    });
    events.push({
      timeSeconds: (sec.startBar + sec.durationBars) * barDuration,
      bar: sec.startBar + sec.durationBars,
      event: `${sec.name} 结束`,
      sectionType: sec.type,
    });
  }

  for (const trans of structure.transitions) {
    events.push({
      timeSeconds: trans.startBar * barDuration,
      bar: trans.startBar,
      event: `过渡: ${trans.type}`,
      sectionType: structure.sections[trans.fromSectionIndex]?.type ?? 'Intro',
    });
  }

  events.sort((a, b) => a.timeSeconds - b.timeSeconds);
  return events;
}

// =============================================================================
// 和弦进行与调式辅助
// =============================================================================

/**
 * 常见和弦进行库
 */
export const CHORD_PROGRESSIONS: Record<string, number[][]> = {
  'pop-1': [[60, 64, 67], [62, 65, 69], [64, 67, 71], [65, 69, 72]],
  'pop-2': [[60, 64, 67], [57, 60, 64], [62, 65, 69], [65, 69, 72]],
  'jazz-2-5-1': [[62, 65, 69, 72], [65, 69, 72, 76], [60, 64, 67, 71]],
  'edm-1': [[60, 64, 67], [60, 64, 67], [67, 71, 74], [65, 69, 72]],
  'minor-1': [[60, 63, 67], [65, 68, 72], [62, 65, 69], [67, 70, 74]],
  'trap-1': [[60, 63, 67], [60, 63, 67], [58, 62, 65], [58, 62, 65]],
};

/**
 * 根据风格获取推荐和弦进行
 * @param genre - 音乐风格
 * @returns 和弦进行名称数组
 */
export function getRecommendedProgressions(genre: Genre): string[] {
  const map: Record<string, string[]> = {
    house: ['edm-1', 'pop-1'],
    techno: ['edm-1', 'minor-1'],
    trance: ['edm-1', 'pop-2'],
    dubstep: ['minor-1', 'trap-1'],
    drumAndBass: ['minor-1', 'jazz-2-5-1'],
    hipHop: ['trap-1', 'minor-1', 'pop-2'],
    pop: ['pop-1', 'pop-2', 'jazz-2-5-1'],
    rock: ['pop-2', 'minor-1'],
    jazz: ['jazz-2-5-1', 'pop-2'],
    ambient: ['minor-1', 'pop-1'],
    orchestral: ['pop-2', 'jazz-2-5-1'],
    synthwave: ['edm-1', 'pop-1'],
  };
  return map[genre] ?? ['pop-1'];
}

/**
 * 将段落类型映射到典型能量级别
 * @param type - 段落类型
 * @returns 典型能量值 (0.0 ~ 1.0)
 */
export function sectionTypeToEnergy(type: SectionType): number {
  const map: Record<SectionType, number> = {
    Intro: 0.2,
    Verse: 0.45,
    Chorus: 0.85,
    Bridge: 0.55,
    PreChorus: 0.65,
    Outro: 0.2,
    Breakdown: 0.3,
    Drop: 1.0,
    Build: 0.8,
    Filler: 0.4,
  };
  return map[type] ?? 0.5;
}

/**
 * 将段落类型映射到典型紧张度
 * @param type - 段落类型
 * @returns 典型紧张度 (0.0 ~ 1.0)
 */
export function sectionTypeToTension(type: SectionType): number {
  const map: Record<SectionType, number> = {
    Intro: 0.1,
    Verse: 0.25,
    Chorus: 0.4,
    Bridge: 0.6,
    PreChorus: 0.55,
    Outro: 0.1,
    Breakdown: 0.2,
    Drop: 0.5,
    Build: 0.9,
    Filler: 0.3,
  };
  return map[type] ?? 0.3;
}

/**
 * 获取段落的推荐时长（小节数）
 * @param type - 段落类型
 * @param genre - 音乐风格
 * @returns 推荐小节数
 */
export function getRecommendedDuration(type: SectionType, genre: Genre): number {
  const defaults: Record<SectionType, number> = {
    Intro: 4,
    Verse: 8,
    Chorus: 8,
    Bridge: 8,
    PreChorus: 4,
    Outro: 4,
    Breakdown: 8,
    Drop: 16,
    Build: 2,
    Filler: 2,
  };
  let base = defaults[type] ?? 8;
  // 风格微调
  if (genre === 'trance' && type === 'Build') base = 4;
  if (genre === 'dubstep' && type === 'Drop') base = 8;
  if (genre === 'hipHop' && type === 'Verse') base = 16;
  return base;
}

/**
 * 验证歌曲结构的完整性
 * @param structure - 歌曲结构
 * @returns 问题描述数组（空数组表示无问题）
 */
export function validateStructure(structure: SongStructure): string[] {
  const issues: string[] = [];
  if (structure.sections.length === 0) {
    issues.push('歌曲结构为空，没有任何段落');
    return issues;
  }
  if (structure.sections[0].type !== 'Intro') {
    issues.push('建议以 Intro 开头');
  }
  if (structure.sections[structure.sections.length - 1].type !== 'Outro') {
    issues.push('建议以 Outro 结尾');
  }
  const hasChorus = structure.sections.some((s) => s.type === 'Chorus' || s.type === 'Drop');
  if (!hasChorus) {
    issues.push('缺少 Chorus 或 Drop 段落，歌曲可能缺乏高潮');
  }
  // 检查过渡是否冲突
  for (const trans of structure.transitions) {
    if (trans.fromSectionIndex >= structure.sections.length || trans.toSectionIndex >= structure.sections.length) {
      issues.push('过渡效果引用了不存在的段落索引');
    }
  }
  return issues;
}

/**
 * 分析歌曲结构的动态范围
 * @param structure - 歌曲结构
 * @returns 动态范围信息
 */
export function analyzeDynamicRange(structure: SongStructure): {
  minEnergy: number;
  maxEnergy: number;
  range: number;
  averageEnergy: number;
} {
  if (structure.sections.length === 0) {
    return { minEnergy: 0, maxEnergy: 0, range: 0, averageEnergy: 0 };
  }
  const energies = structure.sections.map((s) => s.energy);
  const minEnergy = Math.min(...energies);
  const maxEnergy = Math.max(...energies);
  const averageEnergy = energies.reduce((a, b) => a + b, 0) / energies.length;
  return {
    minEnergy,
    maxEnergy,
    range: maxEnergy - minEnergy,
    averageEnergy,
  };
}

/**
 * 根据能量曲线推荐过渡类型
 * @param from - 起始段落
 * @param to - 目标段落
 * @returns 推荐的过渡类型数组（按优先级排序）
 */
export function suggestTransitions(from: Section, to: Section): TransitionType[] {
  const jump = calculateEnergyJump(from, to);
  if (jump > 0.5) {
    return ['riser', 'filterSweepUp', 'snareRoll', 'drumFill'];
  }
  if (jump > 0.2) {
    return ['filterSweepUp', 'drumFill', 'riser'];
  }
  if (jump < -0.3) {
    return ['filterSweepDown', 'reverseReverb', 'impact'];
  }
  return ['drumFill', 'noiseRise'];
}

/**
 * 生成节奏密度建议（每小节音符数）
 * @param section - 段落
 * @returns 建议密度 (1 ~ 16)
 */
export function suggestRhythmicDensity(section: Section): number {
  const base = Math.floor(section.energy * 12) + 2;
  if (section.type === 'Breakdown') return Math.max(2, base - 6);
  if (section.type === 'Build') return Math.min(16, base + 4);
  if (section.type === 'Drop') return Math.min(16, base + 2);
  return clamp(base, 2, 12);
}

/**
 * 将段落信息导出为 Markdown 格式文本（用于报告）
 * @param structure - 歌曲结构
 * @returns Markdown 字符串
 */
export function exportStructureToMarkdown(structure: SongStructure): string {
  const lines: string[] = [];
  lines.push(`# 歌曲结构分析报告`);
  lines.push(`- **风格**: ${structure.genre}`);
  lines.push(`- **BPM**: ${structure.bpm}`);
  lines.push(`- **调式**: ${structure.key}`);
  lines.push(`- **总小节数**: ${structure.totalBars}`);
  lines.push('');
  lines.push('## 段落列表');
  lines.push('| 序号 | 类型 | 名称 | 起始小节 | 长度 | 能量 | 紧张度 |');
  lines.push('|------|------|------|----------|------|------|--------|');
  for (let i = 0; i < structure.sections.length; i++) {
    const s = structure.sections[i];
    lines.push(
      `| ${i + 1} | ${s.type} | ${s.name} | ${s.startBar} | ${s.durationBars} | ${s.energy.toFixed(2)} | ${s.tension.toFixed(2)} |`
    );
  }
  lines.push('');
  lines.push('## 过渡效果');
  if (structure.transitions.length === 0) {
    lines.push('无过渡效果。');
  } else {
    lines.push('| 起始段 | 目标段 | 类型 | 起始小节 | 强度 |');
    lines.push('|--------|--------|------|----------|------|');
    for (const t of structure.transitions) {
      lines.push(
        `| ${t.fromSectionIndex} | ${t.toSectionIndex} | ${t.type} | ${t.startBar} | ${t.intensity.toFixed(2)} |`
      );
    }
  }
  lines.push('');
  lines.push('## 配器建议');
  for (const inst of structure.globalInstrumentation) {
    lines.push(`- ${inst}`);
  }
  return lines.join('\n');
}

// =============================================================================
// 默认导出
// =============================================================================

export default {
  ArrangementEngine,
  SongStructure,
  energyToDb,
  energyToFilterFreq,
  calculateEnergyJump,
  needsTransition,
  smoothEnergyCurve,
  structureToTimeline,
  CHORD_PROGRESSIONS,
  getRecommendedProgressions,
  sectionTypeToEnergy,
  sectionTypeToTension,
  getRecommendedDuration,
  validateStructure,
  analyzeDynamicRange,
  suggestTransitions,
  suggestRhythmicDensity,
  exportStructureToMarkdown,
};
