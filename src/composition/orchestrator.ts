/**
 * @fileoverview orchestrator.ts
 * 青鸾数字音频工作站 - AI自动配器引擎
 *
 * 本模块提供基于旋律输入的智能多声部配器能力，支持交响乐、室内乐、爵士、流行、
 * 中国风等多种风格。核心类 `Orchestrator` 通过分析旋律轮廓、和声暗示、节奏特征，
 * 自动为弦乐组、木管组、铜管组、打击乐组、色彩组生成符合管弦乐法的声部分配。
 *
 * @module composition/orchestrator
 * @author 青鸾音频团队
 * @version 1.0.0
 */

// =============================================================================
// 外部基础工具导入
// =============================================================================

import {
  midiToFrequency,
  frequencyToMidi,
  noteToMidi,
  midiToNoteName,
  quantizeTime,
  getPitchClass,
  getOctave,
  calculateNoteDuration,
} from '../utils/audioUtils.js';

// =============================================================================
// 全局常量与配置
// =============================================================================

/**
 * 统一采样率，所有时间/采样计算均基于该值
 */
export const SAMPLE_RATE: number = 44100;

/**
 * 标准 MIDI 音高范围（C-1 到 G9）
 */
export const MIN_MIDI_NOTE: number = 0;
export const MAX_MIDI_NOTE: number = 127;

/**
 * 默认配器风格配置映射
 */
const STYLE_CONFIG: Record<string, OrchestrationStyleConfig> = {
  symphonic: {
    name: 'symphonic',
    label: '交响乐',
    defaultGroups: ['strings', 'woodwinds', 'brass', 'percussion', 'harp'],
    densityFactor: 1.0,
    dynamicRange: { min: 20, max: 127 },
    preferredDoubling: ['octave', 'unison', 'third'],
    sectionBalance: { strings: 0.4, woodwinds: 0.2, brass: 0.25, percussion: 0.1, harp: 0.05 },
  },
  chamber: {
    name: 'chamber',
    label: '室内乐',
    defaultGroups: ['strings', 'woodwinds'],
    densityFactor: 0.6,
    dynamicRange: { min: 30, max: 110 },
    preferredDoubling: ['unison', 'octave'],
    sectionBalance: { strings: 0.55, woodwinds: 0.35, brass: 0.05, percussion: 0.03, harp: 0.02 },
  },
  jazz: {
    name: 'jazz',
    label: '爵士',
    defaultGroups: ['brass', 'woodwinds', 'rhythm'],
    densityFactor: 0.75,
    dynamicRange: { min: 35, max: 115 },
    preferredDoubling: ['unison', 'fifth', 'third'],
    sectionBalance: { strings: 0.05, woodwinds: 0.35, brass: 0.35, percussion: 0.2, harp: 0.05 },
  },
  pop: {
    name: 'pop',
    label: '流行',
    defaultGroups: ['strings', 'synth', 'percussion'],
    densityFactor: 0.65,
    dynamicRange: { min: 25, max: 120 },
    preferredDoubling: ['unison', 'octave', 'fifth'],
    sectionBalance: { strings: 0.3, woodwinds: 0.1, brass: 0.15, percussion: 0.35, harp: 0.1 },
  },
  chinese: {
    name: 'chinese',
    label: '中国风',
    defaultGroups: ['strings', 'chineseWinds', 'chinesePercussion', 'harp'],
    densityFactor: 0.55,
    dynamicRange: { min: 30, max: 115 },
    preferredDoubling: ['unison', 'fourth', 'fifth'],
    sectionBalance: { strings: 0.35, woodwinds: 0.25, brass: 0.05, percussion: 0.25, harp: 0.1 },
  },
};

/**
 * 乐器组音色映射表
 */
const INSTRUMENT_REGISTRY: Record<string, InstrumentDefinition[]> = {
  strings: [
    { name: 'Violin I', family: 'strings', range: [55, 103], clef: 'treble', transposition: 0, typicalDynamics: { pp: 40, mp: 70, ff: 110 } },
    { name: 'Violin II', family: 'strings', range: [55, 103], clef: 'treble', transposition: 0, typicalDynamics: { pp: 38, mp: 68, ff: 108 } },
    { name: 'Viola', family: 'strings', range: [48, 91], clef: 'alto', transposition: 0, typicalDynamics: { pp: 42, mp: 72, ff: 112 } },
    { name: 'Violoncello', family: 'strings', range: [36, 84], clef: 'bass', transposition: 0, typicalDynamics: { pp: 45, mp: 75, ff: 115 } },
    { name: 'Double Bass', family: 'strings', range: [28, 67], clef: 'bass', transposition: -12, typicalDynamics: { pp: 48, mp: 78, ff: 118 } },
  ],
  woodwinds: [
    { name: 'Flute', family: 'woodwinds', range: [60, 96], clef: 'treble', transposition: 0, typicalDynamics: { pp: 35, mp: 65, ff: 100 } },
    { name: 'Piccolo', family: 'woodwinds', range: [74, 108], clef: 'treble', transposition: 0, typicalDynamics: { pp: 40, mp: 70, ff: 110 } },
    { name: 'Oboe', family: 'woodwinds', range: [58, 91], clef: 'treble', transposition: 0, typicalDynamics: { pp: 38, mp: 68, ff: 105 } },
    { name: 'English Horn', family: 'woodwinds', range: [52, 85], clef: 'treble', transposition: -7, typicalDynamics: { pp: 40, mp: 70, ff: 105 } },
    { name: 'Clarinet in Bb', family: 'woodwinds', range: [50, 94], clef: 'treble', transposition: -2, typicalDynamics: { pp: 35, mp: 65, ff: 108 } },
    { name: 'Bass Clarinet', family: 'woodwinds', range: [38, 80], clef: 'treble', transposition: -14, typicalDynamics: { pp: 42, mp: 72, ff: 110 } },
    { name: 'Bassoon', family: 'woodwinds', range: [34, 76], clef: 'bass', transposition: 0, typicalDynamics: { pp: 45, mp: 75, ff: 112 } },
    { name: 'Contrabassoon', family: 'woodwinds', range: [22, 62], clef: 'bass', transposition: 0, typicalDynamics: { pp: 50, mp: 80, ff: 115 } },
  ],
  brass: [
    { name: 'Horn in F', family: 'brass', range: [41, 89], clef: 'treble', transposition: -7, typicalDynamics: { pp: 40, mp: 72, ff: 115 } },
    { name: 'Trumpet in C', family: 'brass', range: [54, 86], clef: 'treble', transposition: 0, typicalDynamics: { pp: 45, mp: 75, ff: 118 } },
    { name: 'Trombone', family: 'brass', range: [40, 77], clef: 'bass', transposition: 0, typicalDynamics: { pp: 48, mp: 78, ff: 120 } },
    { name: 'Bass Trombone', family: 'brass', range: [36, 72], clef: 'bass', transposition: 0, typicalDynamics: { pp: 50, mp: 80, ff: 122 } },
    { name: 'Tuba', family: 'brass', range: [28, 65], clef: 'bass', transposition: 0, typicalDynamics: { pp: 52, mp: 82, ff: 125 } },
  ],
  percussion: [
    { name: 'Timpani', family: 'percussion', range: [36, 60], clef: 'bass', transposition: 0, typicalDynamics: { pp: 50, mp: 80, ff: 127 } },
    { name: 'Snare Drum', family: 'percussion', range: [0, 0], clef: 'percussion', transposition: 0, typicalDynamics: { pp: 30, mp: 70, ff: 120 } },
    { name: 'Bass Drum', family: 'percussion', range: [0, 0], clef: 'percussion', transposition: 0, typicalDynamics: { pp: 40, mp: 80, ff: 127 } },
    { name: 'Cymbals', family: 'percussion', range: [0, 0], clef: 'percussion', transposition: 0, typicalDynamics: { pp: 35, mp: 75, ff: 127 } },
    { name: 'Triangle', family: 'percussion', range: [0, 0], clef: 'percussion', transposition: 0, typicalDynamics: { pp: 25, mp: 60, ff: 100 } },
    { name: 'Glockenspiel', family: 'percussion', range: [79, 108], clef: 'treble', transposition: 0, typicalDynamics: { pp: 30, mp: 60, ff: 95 } },
    { name: 'Xylophone', family: 'percussion', range: [65, 96], clef: 'treble', transposition: 0, typicalDynamics: { pp: 35, mp: 65, ff: 105 } },
    { name: 'Vibraphone', family: 'percussion', range: [53, 89], clef: 'treble', transposition: 0, typicalDynamics: { pp: 30, mp: 65, ff: 100 } },
    { name: 'Marimba', family: 'percussion', range: [48, 96], clef: 'treble', transposition: 0, typicalDynamics: { pp: 32, mp: 68, ff: 105 } },
  ],
  harp: [
    { name: 'Harp', family: 'harp', range: [23, 103], clef: 'both', transposition: 0, typicalDynamics: { pp: 28, mp: 60, ff: 95 } },
  ],
  chineseWinds: [
    { name: 'Dizi', family: 'chineseWinds', range: [60, 95], clef: 'treble', transposition: 0, typicalDynamics: { pp: 30, mp: 65, ff: 105 } },
    { name: 'Xiao', family: 'chineseWinds', range: [55, 88], clef: 'treble', transposition: 0, typicalDynamics: { pp: 28, mp: 62, ff: 100 } },
    { name: 'Suona', family: 'chineseWinds', range: [56, 92], clef: 'treble', transposition: 0, typicalDynamics: { pp: 45, mp: 80, ff: 120 } },
    { name: 'Sheng', family: 'chineseWinds', range: [48, 89], clef: 'treble', transposition: 0, typicalDynamics: { pp: 32, mp: 65, ff: 105 } },
  ],
  chinesePercussion: [
    { name: 'Gong', family: 'chinesePercussion', range: [0, 0], clef: 'percussion', transposition: 0, typicalDynamics: { pp: 45, mp: 85, ff: 127 } },
    { name: 'Bangu', family: 'chinesePercussion', range: [0, 0], clef: 'percussion', transposition: 0, typicalDynamics: { pp: 35, mp: 75, ff: 115 } },
    { name: 'Luo', family: 'chinesePercussion', range: [0, 0], clef: 'percussion', transposition: 0, typicalDynamics: { pp: 40, mp: 80, ff: 120 } },
    { name: 'Muyu', family: 'chinesePercussion', range: [0, 0], clef: 'percussion', transposition: 0, typicalDynamics: { pp: 25, mp: 60, ff: 100 } },
  ],
  rhythm: [
    { name: 'Piano', family: 'rhythm', range: [21, 108], clef: 'both', transposition: 0, typicalDynamics: { pp: 25, mp: 60, ff: 100 } },
    { name: 'Electric Bass', family: 'rhythm', range: [28, 67], clef: 'bass', transposition: 0, typicalDynamics: { pp: 40, mp: 75, ff: 115 } },
    { name: 'Drum Kit', family: 'rhythm', range: [0, 0], clef: 'percussion', transposition: 0, typicalDynamics: { pp: 30, mp: 70, ff: 120 } },
  ],
  synth: [
    { name: 'Pad Synth', family: 'synth', range: [24, 108], clef: 'both', transposition: 0, typicalDynamics: { pp: 20, mp: 55, ff: 95 } },
    { name: 'Lead Synth', family: 'synth', range: [36, 108], clef: 'treble', transposition: 0, typicalDynamics: { pp: 25, mp: 60, ff: 100 } },
    { name: 'Bass Synth', family: 'synth', range: [24, 72], clef: 'bass', transposition: 0, typicalDynamics: { pp: 30, mp: 65, ff: 110 } },
  ],
};

// =============================================================================
// 类型与接口定义
// =============================================================================

/**
 * 单个音符的数据结构
 */
export interface Note {
  /** MIDI 音高值，0-127 */
  pitch: number;
  /** 起始时间，以采样点计（基于 SAMPLE_RATE） */
  onset: number;
  /** 持续时间，以采样点计 */
  duration: number;
  /** 力度值，0-127 */
  velocity: number;
  /** 可选的音名字符串表示，如 "C4" */
  name?: string;
  /** 可选的连音/断音标记 */
  articulation?: 'staccato' | 'legato' | 'marcato' | 'tenuto' | 'pizzicato' | 'arco';
  /** 可选的表情/技法标记 */
  expression?: string;
}

/**
 * 乐器声部数据结构
 */
export interface Part {
  /** 声部唯一标识符 */
  id: string;
  /** 声部名称 */
  name: string;
  /** 所属乐器组 */
  group: InstrumentGroup;
  /** 该声部包含的音符序列 */
  notes: Note[];
  /** 该声部使用的乐器定义 */
  instrument: InstrumentDefinition;
  /** 全局力度偏移，用于微调该声部的整体音量 */
  dynamicOffset: number;
  /** 声部是否静音 */
  muted: boolean;
  /** 声部独奏状态 */
  solo: boolean;
  /** 声部声像定位，-64 到 +64（左到右） */
  pan: number;
  /** 可选的演奏技法集合 */
  techniques?: string[];
}

/**
 * 乐器组类型
 */
export type InstrumentGroup =
  | 'strings'
  | 'woodwinds'
  | 'brass'
  | 'percussion'
  | 'harp'
  | 'chineseWinds'
  | 'chinesePercussion'
  | 'rhythm'
  | 'synth';

/**
 * 乐器定义接口
 */
export interface InstrumentDefinition {
  /** 乐器名称 */
  name: string;
  /** 所属家族/组 */
  family: InstrumentGroup;
  /** 有效音域 [最低MIDI, 最高MIDI] */
  range: [number, number];
  /** 谱号类型 */
  clef: 'treble' | 'bass' | 'alto' | 'tenor' | 'both' | 'percussion';
  /** 移调（半音数），正值为上移，负值为下移 */
  transposition: number;
  /** 典型力度映射 */
  typicalDynamics: {
    pp: number;
    mp: number;
    ff: number;
  };
}

/**
 * 配器风格配置
 */
interface OrchestrationStyleConfig {
  name: string;
  label: string;
  defaultGroups: string[];
  densityFactor: number;
  dynamicRange: { min: number; max: number };
  preferredDoubling: string[];
  sectionBalance: Record<string, number>;
}

/**
 * 旋律分析结果
 */
interface MelodyAnalysis {
  pitches: number[];
  intervals: number[];
  range: { min: number; max: number };
  averagePitch: number;
  contour: ('up' | 'down' | 'same')[];
  rhythmPattern: number[];
  impliedKey: string;
  impliedChords: string[];
  climaxIndex: number;
  register: 'low' | 'mid' | 'high' | 'veryHigh';
  density: number;
}

/**
 * 和声填充建议
 */
interface HarmonyFillSuggestion {
  targetNotes: number[];
  voicingType: 'closed' | 'open' | 'drop2' | 'drop3';
  spread: number;
}

/**
 * 配器决策记录
 */
interface OrchestrationDecision {
  timestamp: number;
  decisionType: string;
  description: string;
  affectedParts: string[];
  confidence: number;
}

// =============================================================================
// Orchestrator 主类
// =============================================================================

/**
 * AI自动配器引擎
 *
 * `Orchestrator` 类是青鸾 DAW 的核心智能配器模块，负责将单旋律线扩展为
 * 完整的、多乐器组的多声部配器方案。它内置了丰富的管弦乐法规则、
 * 乐器音色知识库、以及多种风格特化的配器逻辑。
 *
 * @example
 * ```typescript
 * const orch = new Orchestrator();
 * const parts = orch.orchestrateMelody(melodyNotes, 'symphonic');
 * const balanced = orch.balanceDynamics(parts);
 * ```
 */
export class Orchestrator {
  /**
   * 当前配器风格配置
   * @private
   */
  private currentStyle: OrchestrationStyleConfig;

  /**
   * 配器决策日志，用于回溯与调试
   * @private
   */
  private decisionLog: OrchestrationDecision[];

  /**
   * 上一次分析的旋律结果缓存
   * @private
   */
  private lastMelodyAnalysis: MelodyAnalysis | null;

  /**
   * 乐器注册表引用
   * @private
   */
  private instrumentRegistry: Record<string, InstrumentDefinition[]>;

  /**
   * 采样率引用
   * @private
   */
  private sampleRate: number;

  /**
   * 构造一个新的 Orchestrator 实例
   */
  constructor() {
    this.currentStyle = STYLE_CONFIG.symphonic;
    this.decisionLog = [];
    this.lastMelodyAnalysis = null;
    this.instrumentRegistry = INSTRUMENT_REGISTRY;
    this.sampleRate = SAMPLE_RATE;
  }

  // ==========================================================================
  // 公共 API
  // ==========================================================================

  /**
   * 根据输入旋律自动生成多声部配器方案
   *
   * 这是本模块的核心入口方法。它接受一组旋律音符和一个风格标识，
   * 返回一组完整的 `Part` 声部，每个声部包含分配给对应乐器的音符。
   *
   * 处理流程：
   * 1. 旋律分析（轮廓、音域、密度、高潮点）
   * 2. 选择和声填充策略
   * 3. 为各乐器组分配声部功能（旋律、和声、低音、色彩）
   * 4. 应用八度/同度重复策略
   * 5. 生成打击乐与色彩声部
   * 6. 动态平衡与声像定位
   *
   * @param melody - 输入的旋律音符数组，按时间排序
   * @param style - 配器风格：'symphonic' | 'chamber' | 'jazz' | 'pop' | 'chinese'
   * @returns 生成的多声部数组
   */
  public orchestrateMelody(
    melody: Note[],
    style: 'symphonic' | 'chamber' | 'jazz' | 'pop' | 'chinese'
  ): Part[] {
    if (!melody || melody.length === 0) {
      throw new Error('输入旋律不能为空');
    }

    // 设置当前风格
    this.currentStyle = STYLE_CONFIG[style] || STYLE_CONFIG.symphonic;
    this.decisionLog = [];

    // 步骤一：深入分析旋律特征
    const analysis = this.analyzeMelody(melody);
    this.lastMelodyAnalysis = analysis;

    this.logDecision('风格选择', `已选择风格: ${style} (${this.currentStyle.label})`, [], 1.0);
    this.logDecision('旋律分析', `旋律音域: ${analysis.range.min}-${analysis.range.max}, 平均音高: ${analysis.averagePitch.toFixed(1)}, 高潮位置: ${analysis.climaxIndex}`, [], 0.95);

    // 步骤二：确定乐器组分配
    const activeGroups = this.selectInstrumentGroups(style, analysis);
    this.logDecision('乐器组选择', `激活乐器组: ${activeGroups.join(', ')}`, activeGroups, 0.9);

    // 步骤三：创建基础声部容器
    let parts: Part[] = this.createPartsForGroups(activeGroups, style);

    // 步骤四：旋律声部分配
    parts = this.assignMelodyToParts(parts, melody, analysis, style);

    // 步骤五：和声填充
    parts = this.fillHarmonyParts(parts, melody, analysis);

    // 步骤六：低音声部生成
    parts = this.generateBassLine(parts, melody, analysis);

    // 步骤七：应用八度/同度重复策略
    parts = this.applyDoublingToParts(parts, melody, analysis);

    // 步骤八：色彩与打击乐声部
    parts = this.generateColorAndPercussion(parts, melody, analysis, style);

    // 步骤九：动态平衡
    parts = this.balanceDynamics(parts);

    // 步骤十：声像定位
    parts = this.assignPanPositions(parts, style);

    return parts;
  }

  /**
   * 动态平衡各声部的力度与能量分布
   *
   * 根据配器学的平衡原则，自动调整各声部的力度偏移，确保：
   * - 弦乐组提供稳定的和声基底
   * - 木管组在音色的融合度与清晰度之间取得平衡
   * - 铜管组不过度掩盖其他声部
   * - 打击乐组精准地支撑节奏与高潮
   *
   * @param parts - 待平衡的声部数组
   * @returns 平衡后的声部数组
   */
  public balanceDynamics(parts: Part[]): Part[] {
    if (!parts || parts.length === 0) {
      return [];
    }

    // 按乐器组聚合
    const groupMap = new Map<InstrumentGroup, Part[]>();
    for (const part of parts) {
      if (!groupMap.has(part.group)) {
        groupMap.set(part.group, []);
      }
      groupMap.get(part.group)!.push(part);
    }

    // 计算各组的当前平均力度
    const groupAvgVelocities = new Map<InstrumentGroup, number>();
    for (const [group, groupParts] of groupMap.entries()) {
      let totalVel = 0;
      let noteCount = 0;
      for (const part of groupParts) {
        for (const note of part.notes) {
          totalVel += note.velocity;
          noteCount++;
        }
      }
      groupAvgVelocities.set(group, noteCount > 0 ? totalVel / noteCount : 64);
    }

    // 根据风格配置的目标比例进行平衡调整
    const targetRatios = this.currentStyle.sectionBalance;
    const resultParts: Part[] = [];

    for (const part of parts) {
      const group = part.group;
      const targetRatio = targetRatios[group] || 0.1;
      const currentAvg = groupAvgVelocities.get(group) || 64;

      // 计算该组应有的目标平均力度
      const globalTarget = 70; // 基准力度
      const targetVelocity = Math.max(20, Math.min(127, globalTarget * targetRatio * 5));

      // 偏移量
      const offset = targetVelocity - currentAvg;

      // 应用非线性压缩，避免极端值
      const clampedOffset = Math.max(-30, Math.min(30, offset));

      const newPart: Part = {
        ...part,
        dynamicOffset: part.dynamicOffset + clampedOffset,
        notes: part.notes.map((note) => ({
          ...note,
          velocity: Math.max(1, Math.min(127, Math.round(note.velocity + clampedOffset))),
        })),
      };

      resultParts.push(newPart);
    }

    this.logDecision('动态平衡', `已平衡 ${parts.length} 个声部的力度分布`, parts.map((p) => p.id), 0.92);

    return resultParts;
  }

  /**
   * 八度/同度重复策略
   *
   * 根据旋律特征和指定的音区（register），智能地为旋律添加八度重复、
   * 同度叠加、或附加音层（如三度、五度），以增强音色的厚度与色彩。
   *
   * 策略选择逻辑：
   * - `high` 音区：倾向于八度下移重复，避免过度尖锐
   * - `low` 音区：倾向于八度上移重复，避免浑浊
   * - 强拍位置：使用同度或八度重复加强支撑
   * - 旋律高点：减少重复，保留清晰度
   *
   * @param melody - 原始旋律
   * @param register - 目标音区描述：'high' | 'mid' | 'low' | 'full'
   * @returns 生成的重复音符层，可用于叠加到对应声部
   */
  public doublingStrategy(melody: Note[], register: string): Note[] {
    if (!melody || melody.length === 0) {
      return [];
    }

    const doubledNotes: Note[] = [];
    const analysis = this.analyzeMelody(melody);

    for (let i = 0; i < melody.length; i++) {
      const note = melody[i];
      const isStrongBeat = this.isStrongBeat(note.onset, analysis);
      const isClimax = i === analysis.climaxIndex;
      const pitch = note.pitch;

      let intervals: number[] = [];

      // 根据音区和上下文选择重复策略
      if (register === 'high') {
        if (isStrongBeat && !isClimax) {
          intervals = [-12]; // 八度下移
        } else if (isClimax) {
          intervals = []; // 高潮点保持清晰
        } else {
          intervals = [-12, -24]; // 双八度下移增加厚度
        }
      } else if (register === 'low') {
        if (isStrongBeat) {
          intervals = [12]; // 八度上移
        } else {
          intervals = [12, 7]; // 八度+五度
        }
      } else if (register === 'mid') {
        if (isStrongBeat) {
          intervals = [12, 0]; // 同度+八度
        } else {
          intervals = [12, -12]; // 上下八度
        }
      } else {
        // full
        if (isStrongBeat) {
          intervals = [12, -12, 0]; // 强力支撑
        } else {
          intervals = [12, 7, -12]; // 开放式排列
        }
      }

      for (const interval of intervals) {
        const newPitch = pitch + interval;
        if (newPitch >= MIN_MIDI_NOTE && newPitch <= MAX_MIDI_NOTE) {
          doubledNotes.push({
            pitch: newPitch,
            onset: note.onset,
            duration: note.duration,
            velocity: Math.max(1, Math.round(note.velocity * 0.75)),
            name: midiToNoteName ? midiToNoteName(newPitch) : undefined,
            articulation: note.articulation,
          });
        }
      }
    }

    this.logDecision('重复策略', `在 ${register} 音区为 ${melody.length} 个音符生成重复层`, [], 0.88);

    return doubledNotes;
  }

  // ==========================================================================
  // 旋律分析
  // ==========================================================================

  /**
   * 对输入旋律进行全面分析
   *
   * 分析维度包括：音高轮廓、音程结构、节奏密度、隐式和声、音域定位、高潮点识别。
   *
   * @param melody - 旋律音符数组
   * @returns 分析结果对象
   * @private
   */
  private analyzeMelody(melody: Note[]): MelodyAnalysis {
    const pitches = melody.map((n) => n.pitch);
    const intervals: number[] = [];
    const contour: ('up' | 'down' | 'same')[] = [];

    for (let i = 1; i < pitches.length; i++) {
      const diff = pitches[i] - pitches[i - 1];
      intervals.push(diff);
      if (diff > 0) contour.push('up');
      else if (diff < 0) contour.push('down');
      else contour.push('same');
    }

    const minPitch = Math.min(...pitches);
    const maxPitch = Math.max(...pitches);
    const avgPitch = pitches.reduce((a, b) => a + b, 0) / pitches.length;

    // 高潮点识别：最高点且处于相对长时值的音符
    let climaxIndex = 0;
    let maxClimaxScore = -Infinity;
    for (let i = 0; i < melody.length; i++) {
      const pitchScore = (melody[i].pitch - minPitch) / (maxPitch - minPitch + 1);
      const durationScore = melody[i].duration / this.sampleRate; // 秒
      const positionScore = 1 - Math.abs(i / melody.length - 0.618); // 黄金分割偏好
      const score = pitchScore * 0.5 + durationScore * 0.2 + positionScore * 0.3;
      if (score > maxClimaxScore) {
        maxClimaxScore = score;
        climaxIndex = i;
      }
    }

    // 音区判断
    let register: 'low' | 'mid' | 'high' | 'veryHigh';
    if (avgPitch < 48) register = 'low';
    else if (avgPitch < 64) register = 'mid';
    else if (avgPitch < 84) register = 'high';
    else register = 'veryHigh';

    // 节奏模式提取
    const rhythmPattern = melody.map((n) => n.duration);

    // 密度 = 每秒音符数
    const totalDuration = melody[melody.length - 1].onset + melody[melody.length - 1].duration - melody[0].onset;
    const density = totalDuration > 0 ? (melody.length / totalDuration) * this.sampleRate : 0;

    // 隐式和声推断（简化版：按每小节或每拍分组取音级）
    const impliedChords = this.inferImpliedChords(melody);
    const impliedKey = this.inferKey(melody);

    return {
      pitches,
      intervals,
      range: { min: minPitch, max: maxPitch },
      averagePitch: avgPitch,
      contour,
      rhythmPattern,
      impliedKey,
      impliedChords,
      climaxIndex,
      register,
      density,
    };
  }

  /**
   * 推断旋律隐含调性
   *
   * 使用音级分布统计，判断最可能的调性。
   *
   * @param melody - 旋律音符
   * @returns 推断的调性名称，如 "C major" 或 "A minor"
   * @private
   */
  private inferKey(melody: Note[]): string {
    const pitchClasses = melody.map((n) => getPitchClass(n.pitch));
    const counts = new Array(12).fill(0);
    for (const pc of pitchClasses) {
      counts[pc]++;
    }

    // 简单大调判定：检查音级分布是否符合大调音阶模式
    const majorProfile = [0, 2, 4, 5, 7, 9, 11]; // C major pitch classes
    let bestKey = 'C major';
    let bestScore = -1;

    const keyNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    for (let i = 0; i < 12; i++) {
      let score = 0;
      for (const degree of majorProfile) {
        score += counts[(i + degree) % 12];
      }
      // 惩罚非调内音
      for (let pc = 0; pc < 12; pc++) {
        if (!majorProfile.includes((pc - i + 12) % 12)) {
          score -= counts[pc] * 0.5;
        }
      }
      if (score > bestScore) {
        bestScore = score;
        bestKey = `${keyNames[i]} major`;
      }
    }

    return bestKey;
  }

  /**
   * 推断旋律隐含和弦进行
   *
   * @param melody - 旋律音符
   * @returns 和弦标记数组
   * @private
   */
  private inferImpliedChords(melody: Note[]): string[] {
    const chords: string[] = [];
    const windowSize = 4; // 每4个音符为一组和声推断窗口

    for (let i = 0; i < melody.length; i += windowSize) {
      const window = melody.slice(i, i + windowSize);
      const pitchClasses = Array.from(new Set(window.map((n) => getPitchClass(n.pitch)))).sort((a, b) => a - b);

      // 简单三和弦匹配
      if (pitchClasses.length >= 3) {
        const root = pitchClasses[0];
        const intervalsFromRoot = pitchClasses.map((pc) => (pc - root + 12) % 12);
        if (intervalsFromRoot.includes(4) && intervalsFromRoot.includes(7)) {
          chords.push('major');
        } else if (intervalsFromRoot.includes(3) && intervalsFromRoot.includes(7)) {
          chords.push('minor');
        } else if (intervalsFromRoot.includes(3) && intervalsFromRoot.includes(6)) {
          chords.push('dim');
        } else {
          chords.push('unknown');
        }
      } else {
        chords.push('unknown');
      }
    }

    return chords;
  }

  /**
   * 判断音符是否处于强拍位置
   *
   * 假设 4/4 拍，每小节 4 拍，每拍对应一定采样点数。
   * 采用常见的每拍 44100 采样点 / 1秒 = 约 120BPM 简化模型。
   *
   * @param onset - 音符起始采样点
   * @param analysis - 旋律分析结果
   * @returns 是否为强拍
   * @private
   */
  private isStrongBeat(onset: number, analysis: MelodyAnalysis): boolean {
    const beatDuration = this.sampleRate; // 1秒一拍，简化模型
    const beatIndex = Math.round(onset / beatDuration);
    return beatIndex % 4 === 0 || beatIndex % 4 === 2; // 第1、3拍为强拍
  }

  // ==========================================================================
  // 乐器组与声部创建
  // ==========================================================================

  /**
   * 根据风格选择激活的乐器组
   *
   * @param style - 风格名称
   * @param analysis - 旋律分析
   * @returns 激活的乐器组标识数组
   * @private
   */
  private selectInstrumentGroups(style: string, analysis: MelodyAnalysis): InstrumentGroup[] {
    const config = STYLE_CONFIG[style] || STYLE_CONFIG.symphonic;
    const groups = config.defaultGroups as InstrumentGroup[];

    // 根据旋律密度微调
    if (analysis.density > 4) {
      // 高密度旋律减少厚重组
      return groups.filter((g) => g !== 'brass' && g !== 'percussion');
    } else if (analysis.density < 1) {
      // 低密度旋律增加色彩组
      if (!groups.includes('harp')) {
        groups.push('harp');
      }
    }

    return groups;
  }

  /**
   * 为激活的乐器组创建基础声部容器
   *
   * @param groups - 激活的乐器组
   * @param style - 风格
   * @returns 初始化的声部数组
   * @private
   */
  private createPartsForGroups(groups: InstrumentGroup[], style: string): Part[] {
    const parts: Part[] = [];
    let partId = 0;

    for (const group of groups) {
      const instruments = this.instrumentRegistry[group];
      if (!instruments) continue;

      for (const inst of instruments) {
        const id = `part_${partId++}`;
        parts.push({
          id,
          name: `${inst.name}`,
          group,
          notes: [],
          instrument: inst,
          dynamicOffset: 0,
          muted: false,
          solo: false,
          pan: 0,
          techniques: [],
        });
      }
    }

    return parts;
  }

  // ==========================================================================
  // 旋律分配
  // ==========================================================================

  /**
   * 将旋律分配给合适的声部
   *
   * 配器规则：
   * - 交响乐：小提琴 I 担任主旋律
   * - 室内乐：长笛或第一小提琴
   * - 爵士：小号或萨克斯（这里用木管替代）
   * - 流行：Lead Synth 或小提琴
   * - 中国风：竹笛或笙
   *
   * @param parts - 声部数组
   * @param melody - 旋律
   * @param analysis - 分析结果
   * @param style - 风格
   * @returns 更新后的声部数组
   * @private
   */
  private assignMelodyToParts(
    parts: Part[],
    melody: Note[],
    analysis: MelodyAnalysis,
    style: string
  ): Part[] {
    const result = [...parts];

    // 确定主奏乐器
    let primaryInstrumentName = '';
    switch (style) {
      case 'symphonic':
        primaryInstrumentName = 'Violin I';
        break;
      case 'chamber':
        primaryInstrumentName = analysis.averagePitch > 70 ? 'Flute' : 'Violin I';
        break;
      case 'jazz':
        primaryInstrumentName = 'Trumpet in C';
        break;
      case 'pop':
        primaryInstrumentName = 'Lead Synth';
        break;
      case 'chinese':
        primaryInstrumentName = 'Dizi';
        break;
      default:
        primaryInstrumentName = 'Violin I';
    }

    // 找到对应声部
    const primaryPartIndex = result.findIndex((p) => p.instrument.name === primaryInstrumentName);
    if (primaryPartIndex >= 0) {
      result[primaryPartIndex] = {
        ...result[primaryPartIndex],
        notes: melody.map((n) => ({
          ...n,
          velocity: Math.min(127, n.velocity + 5),
        })),
        pan: 5, // 略偏右
      };
    }

    // 辅助旋律声部（如 Violin II 或 Oboe）
    const secondaryCandidates = result.filter(
      (p) =>
        p.notes.length === 0 &&
        (p.instrument.name === 'Violin II' ||
          p.instrument.name === 'Oboe' ||
          p.instrument.name === 'Clarinet in Bb')
    );

    if (secondaryCandidates.length > 0 && style !== 'pop') {
      // 辅助旋律可略微延迟或简化
      const secondary = secondaryCandidates[0];
      const secondaryNotes = melody.map((n) => ({
        ...n,
        onset: n.onset + Math.floor(this.sampleRate * 0.02), // 轻微延迟 20ms
        velocity: Math.round(n.velocity * 0.65),
        pitch: this.constrainPitchToInstrument(n.pitch, secondary.instrument),
      }));
      const secIndex = result.findIndex((p) => p.id === secondary.id);
      if (secIndex >= 0) {
        result[secIndex] = { ...result[secIndex], notes: secondaryNotes, pan: -5 };
      }
    }

    this.logDecision('旋律分配', `主奏: ${primaryInstrumentName}, 辅助: ${secondaryCandidates.length > 0 ? secondaryCandidates[0].instrument.name : '无'}`, result.map((p) => p.id), 0.9);

    return result;
  }

  // ==========================================================================
  // 和声填充
  // ==========================================================================

  /**
   * 为中低声部填充和声
   *
   * 配器规则：
   * - 中提琴负责中音区和声填充
   * - 大提琴负责低音和声支撑
   * - 木管组在长音处提供和声色彩
   * - 避免声部交叉（检查每个时间片的音高排序）
   *
   * @param parts - 声部数组
   * @param melody - 旋律
   * @param analysis - 分析结果
   * @returns 更新后的声部数组
   * @private
   */
  private fillHarmonyParts(parts: Part[], melody: Note[], analysis: MelodyAnalysis): Part[] {
    const result = [...parts];
    const chordTones = this.generateChordTonesForMelody(melody, analysis);

    // 中提琴和声填充
    const violaIndex = result.findIndex((p) => p.instrument.name === 'Viola');
    if (violaIndex >= 0) {
      const violaNotes: Note[] = [];
      for (let i = 0; i < melody.length; i++) {
        const note = melody[i];
        const tones = chordTones[i] || [];
        const targetPitch = tones.length > 1 ? tones[1] : note.pitch - 7; // 默认五度下方
        const constrained = this.constrainPitchToInstrument(targetPitch, result[violaIndex].instrument);
        violaNotes.push({
          pitch: constrained,
          onset: note.onset,
          duration: note.duration,
          velocity: Math.round(note.velocity * 0.6),
          articulation: 'legato',
        });
      }
      result[violaIndex] = { ...result[violaIndex], notes: violaNotes };
    }

    // 木管和声层（长音垫）
    const woodwindCandidates = result.filter(
      (p) => p.group === 'woodwinds' && p.notes.length === 0
    );
    for (let w = 0; w < woodwindCandidates.length && w < 2; w++) {
      const ww = woodwindCandidates[w];
      const wwIndex = result.findIndex((p) => p.id === ww.id);
      if (wwIndex < 0) continue;

      const wwNotes: Note[] = [];
      for (let i = 0; i < melody.length; i++) {
        const note = melody[i];
        const tones = chordTones[i] || [];
        const targetPitch = tones.length > 2 ? tones[2] : note.pitch - 12;
        const constrained = this.constrainPitchToInstrument(targetPitch, ww.instrument);
        // 木管使用更长时值，提供和声垫效果
        const duration = note.duration * 1.5;
        wwNotes.push({
          pitch: constrained,
          onset: note.onset,
          duration: Math.min(duration, note.duration * 2),
          velocity: Math.round(note.velocity * 0.45),
          articulation: 'legato',
        });
      }
      result[wwIndex] = { ...result[wwIndex], notes: wwNotes };
    }

    this.logDecision('和声填充', `为中提琴与木管组生成和声支撑`, parts.map((p) => p.id), 0.85);

    return result;
  }

  /**
   * 为旋律每个位置生成和弦音建议
   *
   * 基于隐式和声推断，生成每个旋律音对应的和弦内音。
   *
   * @param melody - 旋律
   * @param analysis - 分析结果
   * @returns 每个旋律位置对应的和弦音数组
   * @private
   */
  private generateChordTonesForMelody(melody: Note[], analysis: MelodyAnalysis): number[][] {
    const result: number[][] = [];
    const key = analysis.impliedKey;
    const rootPc = this.parseKeyRoot(key);

    // 大调三和弦音级
    const majorScale = [0, 2, 4, 5, 7, 9, 11];
    const chordQualities: number[][] = [
      [0, 4, 7], // I
      [2, 5, 9], // ii
      [4, 7, 11], // iii
      [5, 9, 0], // IV
      [7, 11, 2], // V
      [9, 0, 4], // vi
      [11, 2, 5], // vii°
    ];

    for (let i = 0; i < melody.length; i++) {
      const pitch = melody[i].pitch;
      const pitchClass = getPitchClass(pitch);

      // 找到包含该音级的和弦
      let bestChord: number[] = [];
      let bestScore = -1;
      for (let d = 0; d < 7; d++) {
        const chordPcs = chordQualities[d].map((pc) => (rootPc + pc) % 12);
        if (chordPcs.includes(pitchClass)) {
          // 计算该和弦在这个位置的适合度
          const bassPc = chordPcs[0];
          const thirdPc = chordPcs[1];
          const fifthPc = chordPcs[2];
          // 转位使旋律音在最高声部
          const voicing = [bassPc, thirdPc, fifthPc].map((pc) => {
            const base = pc + 48; // 基准八度
            const diff = ((pc - pitchClass + 12) % 12);
            return pitch - diff;
          });
          // 确保正确排序
          voicing.sort((a, b) => a - b);
          const score = voicing.reduce((sum, p) => sum + (this.isInInstrumentRange(p, { range: [36, 84] } as InstrumentDefinition) ? 1 : 0), 0);
          if (score > bestScore) {
            bestScore = score;
            bestChord = voicing;
          }
        }
      }

      if (bestChord.length === 0) {
        // 默认大三和弦以该音为根音
        bestChord = [pitch, pitch + 4, pitch + 7];
      }

      result.push(bestChord);
    }

    return result;
  }

  /**
   * 解析调性根音的音级
   *
   * @param key - 如 "C major"
   * @returns 根音 pitch class (0-11)
   * @private
   */
  private parseKeyRoot(key: string): number {
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const parts = key.split(' ');
    if (parts.length > 0) {
      const name = parts[0].toUpperCase();
      const idx = noteNames.indexOf(name);
      return idx >= 0 ? idx : 0;
    }
    return 0;
  }

  // ==========================================================================
  // 低音声部
  // ==========================================================================

  /**
   * 生成低音声部线条
   *
   * 配器规则：
   * - 低音提琴/大提琴/巴松/大号负责低音
   * - 低音线条应与旋律形成良好的对位关系
   * - 强拍上使用根音或五度音
   * - 避免与旋律同向八度跳进
   *
   * @param parts - 声部数组
   * @param melody - 旋律
   * @param analysis - 分析结果
   * @returns 更新后的声部数组
   * @private
   */
  private generateBassLine(parts: Part[], melody: Note[], analysis: MelodyAnalysis): Part[] {
    const result = [...parts];

    // 选择合适的低音乐器
    const bassCandidates = result.filter(
      (p) =>
        p.notes.length === 0 &&
        (p.instrument.name === 'Double Bass' ||
          p.instrument.name === 'Violoncello' ||
          p.instrument.name === 'Bassoon' ||
          p.instrument.name === 'Tuba' ||
          p.instrument.name === 'Electric Bass' ||
          p.instrument.name === 'Bass Synth')
    );

    if (bassCandidates.length === 0) {
      return result;
    }

    const bassPart = bassCandidates[0];
    const bassIndex = result.findIndex((p) => p.id === bassPart.id);
    if (bassIndex < 0) return result;

    const bassNotes: Note[] = [];
    const chordTones = this.generateChordTonesForMelody(melody, analysis);

    for (let i = 0; i < melody.length; i++) {
      const note = melody[i];
      const tones = chordTones[i];
      // 低音优先使用根音
      let bassPitch = tones && tones.length > 0 ? tones[0] - 12 : note.pitch - 24;

      // 强拍用根音，弱拍可五度或三度
      if (!this.isStrongBeat(note.onset, analysis)) {
        if (tones && tones.length > 2) {
          bassPitch = tones[2] - 12; // 五度
        }
      }

      bassPitch = this.constrainPitchToInstrument(bassPitch, bassPart.instrument);

      // 检查反向五度/八度
      if (i > 0) {
        const prevMelodyPitch = melody[i - 1].pitch;
        const currMelodyPitch = note.pitch;
        const prevBassPitch = bassNotes[bassNotes.length - 1].pitch;

        // 如果旋律和低音都向同一方向跳进五度或八度，调整低音方向
        const melodyJump = currMelodyPitch - prevMelodyPitch;
        const bassJump = bassPitch - prevBassPitch;
        if (Math.abs(melodyJump) >= 7 && Math.abs(bassJump) >= 7 && Math.sign(melodyJump) === Math.sign(bassJump)) {
          // 反向调整
          bassPitch = prevBassPitch - Math.sign(bassJump) * 2;
          bassPitch = this.constrainPitchToInstrument(bassPitch, bassPart.instrument);
        }
      }

      bassNotes.push({
        pitch: bassPitch,
        onset: note.onset,
        duration: note.duration,
        velocity: Math.round(note.velocity * 0.8),
        articulation: 'tenuto',
      });
    }

    result[bassIndex] = { ...result[bassIndex], notes: bassNotes };

    this.logDecision('低音生成', `使用 ${bassPart.instrument.name} 生成低音线条`, [bassPart.id], 0.87);

    return result;
  }

  // ==========================================================================
  // 八度/同度重复应用
  // ==========================================================================

  /**
   * 将重复策略应用到对应的声部
   *
   * @param parts - 声部数组
   * @param melody - 旋律
   * @param analysis - 分析结果
   * @returns 更新后的声部数组
   * @private
   */
  private applyDoublingToParts(parts: Part[], melody: Note[], analysis: MelodyAnalysis): Part[] {
    const result = [...parts];

    // 确定需要重复的音区
    const register = analysis.register === 'veryHigh' ? 'high' : analysis.register;

    // 获取重复音符
    const doubled = this.doublingStrategy(melody, register);

    // 分配给合适的空声部
    const emptyParts = result.filter((p) => p.notes.length === 0);
    if (emptyParts.length === 0) {
      return result;
    }

    // 将重复音符按音高分组
    const lowNotes = doubled.filter((n) => n.pitch < 55);
    const midNotes = doubled.filter((n) => n.pitch >= 55 && n.pitch < 78);
    const highNotes = doubled.filter((n) => n.pitch >= 78);

    // 分配低八度给大提琴/巴松/长号
    const lowPart = emptyParts.find(
      (p) => p.instrument.name === 'Violoncello' || p.instrument.name === 'Bassoon' || p.instrument.name === 'Trombone'
    );
    if (lowPart && lowNotes.length > 0) {
      const idx = result.findIndex((p) => p.id === lowPart.id);
      const constrained = lowNotes.map((n) => ({
        ...n,
        pitch: this.constrainPitchToInstrument(n.pitch, lowPart.instrument),
        velocity: Math.round(n.velocity * 0.55),
      }));
      result[idx] = { ...result[idx], notes: constrained };
    }

    // 分配高八度给长笛/双簧管/小提琴 II
    const highPart = emptyParts.find(
      (p) => p.instrument.name === 'Flute' || p.instrument.name === 'Oboe' || p.instrument.name === 'Violin II'
    );
    if (highPart && highNotes.length > 0) {
      const idx = result.findIndex((p) => p.id === highPart.id);
      const constrained = highNotes.map((n) => ({
        ...n,
        pitch: this.constrainPitchToInstrument(n.pitch, highPart.instrument),
        velocity: Math.round(n.velocity * 0.5),
      }));
      result[idx] = { ...result[idx], notes: constrained };
    }

    // 中音区分配
    const midPart = emptyParts.find(
      (p) => p.instrument.name === 'Viola' || p.instrument.name === 'Clarinet in Bb'
    );
    if (midPart && midNotes.length > 0) {
      const idx = result.findIndex((p) => p.id === midPart.id);
      const constrained = midNotes.map((n) => ({
        ...n,
        pitch: this.constrainPitchToInstrument(n.pitch, midPart.instrument),
        velocity: Math.round(n.velocity * 0.5),
      }));
      result[idx] = { ...result[idx], notes: constrained };
    }

    this.logDecision('重复应用', `已将重复音符分配到低/中/高声部`, result.map((p) => p.id), 0.86);

    return result;
  }

  // ==========================================================================
  // 色彩与打击乐
  // ==========================================================================

  /**
   * 生成色彩声部与打击乐声部
   *
   * 配器规则：
   * - 竖琴：琶音式分解和弦，增加流动感
   * - 钢片琴/木琴：在高音区点缀旋律高点
   * - 定音鼓：强调节奏骨架与调性中心
   * - 中国风格：加入锣、板鼓节奏型
   * - 爵士：加入铜管短时值 "stabs"
   *
   * @param parts - 声部数组
   * @param melody - 旋律
   * @param analysis - 分析结果
   * @param style - 风格
   * @returns 更新后的声部数组
   * @private
   */
  private generateColorAndPercussion(
    parts: Part[],
    melody: Note[],
    analysis: MelodyAnalysis,
    style: string
  ): Part[] {
    const result = [...parts];

    // 竖琴琶音
    const harpPart = result.find((p) => p.instrument.name === 'Harp');
    if (harpPart) {
      const harpIndex = result.findIndex((p) => p.id === harpPart.id);
      const chordTones = this.generateChordTonesForMelody(melody, analysis);
      const harpNotes: Note[] = [];

      for (let i = 0; i < melody.length; i++) {
        const note = melody[i];
        const tones = chordTones[i];
        if (tones && tones.length >= 3) {
          // 生成简单的琶音分解
          const arpPattern = [tones[0] - 12, tones[1] - 12, tones[2] - 12, tones[0]];
          const stepDuration = Math.floor(note.duration / arpPattern.length);
          for (let s = 0; s < arpPattern.length; s++) {
            const p = this.constrainPitchToInstrument(arpPattern[s], harpPart.instrument);
            harpNotes.push({
              pitch: p,
              onset: note.onset + s * stepDuration,
              duration: stepDuration,
              velocity: Math.round(note.velocity * 0.35),
              articulation: 'staccato',
            });
          }
        }
      }

      result[harpIndex] = { ...result[harpIndex], notes: harpNotes };
    }

    // 打击乐节奏型
    const percussionParts = result.filter((p) => p.group === 'percussion' && p.notes.length === 0);
    for (const perc of percussionParts) {
      const percIndex = result.findIndex((p) => p.id === perc.id);
      if (percIndex < 0) continue;

      const percNotes: Note[] = [];

      if (perc.instrument.name === 'Timpani') {
        // 定音鼓在强拍敲击根音
        for (const note of melody) {
          if (this.isStrongBeat(note.onset, analysis)) {
            const rootPitch = this.getBassPitchForTime(note.onset, melody, analysis);
            const constrained = this.constrainPitchToInstrument(rootPitch, perc.instrument);
            percNotes.push({
              pitch: constrained,
              onset: note.onset,
              duration: Math.floor(this.sampleRate * 0.5),
              velocity: Math.round(note.velocity * 0.9),
            });
          }
        }
      } else if (perc.instrument.name === 'Snare Drum' && (style === 'symphonic' || style === 'jazz')) {
        // 小军鼓节奏型
        const beatDuration = this.sampleRate;
        const totalDuration = melody[melody.length - 1].onset + melody[melody.length - 1].duration;
        let t = 0;
        while (t < totalDuration) {
          const isMeasureStart = Math.round(t / (beatDuration * 4)) % 1 === 0;
          percNotes.push({
            pitch: 60, // 打击乐映射音高
            onset: t,
            duration: Math.floor(this.sampleRate * 0.1),
            velocity: isMeasureStart ? 90 : 60,
          });
          t += Math.floor(beatDuration / 2); // 八分音符节奏
        }
      } else if (perc.instrument.name === 'Cymbals' || perc.instrument.name === 'Gong') {
        // 钹/锣在高潮点或乐句开始处
        for (let i = 0; i < melody.length; i++) {
          if (i === analysis.climaxIndex || i === 0) {
            percNotes.push({
              pitch: 60,
              onset: melody[i].onset,
              duration: Math.floor(this.sampleRate * 2),
              velocity: 110,
            });
          }
        }
      } else if (perc.instrument.name === 'Bass Drum') {
        // 大鼓在重拍
        for (const note of melody) {
          if (this.isStrongBeat(note.onset, analysis)) {
            percNotes.push({
              pitch: 60,
              onset: note.onset,
              duration: Math.floor(this.sampleRate * 0.3),
              velocity: 85,
            });
          }
        }
      }

      result[percIndex] = { ...result[percIndex], notes: percNotes };
    }

    // 中国风格特殊处理
    if (style === 'chinese') {
      const chinesePerc = result.filter((p) => p.group === 'chinesePercussion' && p.notes.length === 0);
      for (const cp of chinesePerc) {
        const idx = result.findIndex((p) => p.id === cp.id);
        if (idx < 0) continue;
        const notes: Note[] = [];
        if (cp.instrument.name === 'Bangu') {
          // 板鼓在句读处
          for (let i = 0; i < melody.length; i += 4) {
            if (i < melody.length) {
              notes.push({
                pitch: 60,
                onset: melody[i].onset,
                duration: Math.floor(this.sampleRate * 0.15),
                velocity: 80,
              });
            }
          }
        } else if (cp.instrument.name === 'Luo') {
          // 锣在乐句结尾
          const lastNote = melody[melody.length - 1];
          notes.push({
            pitch: 60,
            onset: lastNote.onset,
            duration: Math.floor(this.sampleRate * 3),
            velocity: 100,
          });
        }
        result[idx] = { ...result[idx], notes: notes };
      }
    }

    this.logDecision('色彩打击', `已生成竖琴琶音与打击乐节奏型`, result.map((p) => p.id), 0.84);

    return result;
  }

  /**
   * 获取指定时间点的低音建议音高
   *
   * @param onset - 时间点
   * @param melody - 旋律
   * @param analysis - 分析结果
   * @returns 建议的根音 MIDI 值
   * @private
   */
  private getBassPitchForTime(onset: number, melody: Note[], analysis: MelodyAnalysis): number {
    // 找到最近的旋律音
    let closestNote = melody[0];
    let minDiff = Infinity;
    for (const note of melody) {
      const diff = Math.abs(note.onset - onset);
      if (diff < minDiff) {
        minDiff = diff;
        closestNote = note;
      }
    }

    const chordTones = this.generateChordTonesForMelody([closestNote], analysis);
    if (chordTones.length > 0 && chordTones[0].length > 0) {
      return chordTones[0][0];
    }
    return closestNote.pitch - 12;
  }

  // ==========================================================================
  // 声像定位
  // ==========================================================================

  /**
   * 为各声部分配声像位置
   *
   * 配器规则（交响乐团典型摆位）：
   * - 第一小提琴：左前方
   * - 第二小提琴：左中
   * - 中提琴：中间偏左
   * - 大提琴：中间偏右
   * - 低音提琴：右后方
   * - 木管组：中前方
   * - 铜管组：中后方
   * - 打击乐：后方扩散
   * - 竖琴：左后方
   *
   * @param parts - 声部数组
   * @param style - 风格
   * @returns 更新后的声部数组
   * @private
   */
  private assignPanPositions(parts: Part[], style: string): Part[] {
    const panMap: Record<string, number> = {
      'Violin I': -30,
      'Violin II': -15,
      'Viola': -5,
      'Violoncello': 10,
      'Double Bass': 25,
      'Flute': -10,
      'Piccolo': -8,
      'Oboe': 5,
      'English Horn': 8,
      'Clarinet in Bb': -5,
      'Bass Clarinet': 0,
      'Bassoon': 12,
      'Contrabassoon': 18,
      'Horn in F': -20,
      'Trumpet in C': 15,
      'Trombone': 20,
      'Bass Trombone': 22,
      'Tuba': 28,
      'Harp': -35,
      'Timpani': 0,
      'Snare Drum': -25,
      'Bass Drum': 20,
      'Cymbals': 15,
      'Triangle': -10,
      'Glockenspiel': -12,
      'Xylophone': 12,
      'Vibraphone': -8,
      'Marimba': 5,
      'Dizi': -15,
      'Xiao': -10,
      'Suona': 20,
      'Sheng': 0,
      'Gong': 30,
      'Bangu': -5,
      'Luo': 25,
      'Muyu': -20,
      'Piano': 0,
      'Electric Bass': 5,
      'Drum Kit': 0,
      'Pad Synth': 0,
      'Lead Synth': 0,
      'Bass Synth': 0,
    };

    return parts.map((part) => {
      const pan = panMap[part.instrument.name] ?? 0;
      return { ...part, pan };
    });
  }

  // ==========================================================================
  // 工具方法
  // ==========================================================================

  /**
   * 将音高限制在乐器的有效音域内
   *
   * @param pitch - 目标 MIDI 音高
   * @param instrument - 乐器定义
   * @returns 限制后的音高
   * @private
   */
  private constrainPitchToInstrument(pitch: number, instrument: InstrumentDefinition): number {
    const [min, max] = instrument.range;
    if (pitch < min) {
      // 尝试上移八度
      let adjusted = pitch;
      while (adjusted < min) adjusted += 12;
      if (adjusted > max) return min;
      return adjusted;
    }
    if (pitch > max) {
      // 尝试下移八度
      let adjusted = pitch;
      while (adjusted > max) adjusted -= 12;
      if (adjusted < min) return max;
      return adjusted;
    }
    return pitch;
  }

  /**
   * 检查音高是否在乐器音域内
   *
   * @param pitch - MIDI 音高
   * @param instrument - 乐器定义
   * @returns 是否在音域内
   * @private
   */
  private isInInstrumentRange(pitch: number, instrument: InstrumentDefinition): boolean {
    const [min, max] = instrument.range;
    return pitch >= min && pitch <= max;
  }

  /**
   * 记录配器决策
   *
   * @param decisionType - 决策类型
   * @param description - 描述
   * @param affectedParts - 受影响的声部ID
   * @param confidence - 置信度 0-1
   * @private
   */
  private logDecision(
    decisionType: string,
    description: string,
    affectedParts: string[],
    confidence: number
  ): void {
    this.decisionLog.push({
      timestamp: Date.now(),
      decisionType,
      description,
      affectedParts,
      confidence,
    });
  }

  /**
   * 获取配器决策日志
   *
   * @returns 决策日志数组
   */
  public getDecisionLog(): OrchestrationDecision[] {
    return [...this.decisionLog];
  }

  /**
   * 获取最后一次旋律分析结果
   *
   * @returns 分析结果或 null
   */
  public getLastMelodyAnalysis(): MelodyAnalysis | null {
    return this.lastMelodyAnalysis;
  }

  // ==========================================================================
  // 高级配器规则引擎
  // ==========================================================================

  /**
   * 检查并修正声部交叉问题
   *
   * 在管弦乐配器中，通常应避免不同乐器组之间的声部交叉，
   * 尤其是低音声部不应高于中音声部。
   *
   * @param parts - 声部数组
   * @returns 修正后的声部数组
   */
  public fixVoiceCrossing(parts: Part[]): Part[] {
    const result = parts.map((p) => ({ ...p, notes: [...p.notes] }));

    // 按声部功能排序：低音 -> 和声 -> 旋律
    const sortedIndices = result
      .map((_, i) => i)
      .sort((a, b) => {
        const avgA = this.getAveragePitch(result[a]);
        const avgB = this.getAveragePitch(result[b]);
        return avgA - avgB;
      });

    // 检查相邻声部
    for (let i = 0; i < sortedIndices.length - 1; i++) {
      const lowerIdx = sortedIndices[i];
      const upperIdx = sortedIndices[i + 1];
      const lowerPart = result[lowerIdx];
      const upperPart = result[upperIdx];

      for (let n = 0; n < Math.min(lowerPart.notes.length, upperPart.notes.length); n++) {
        const lowerNote = lowerPart.notes[n];
        const upperNote = upperPart.notes[n];

        if (lowerNote && upperNote && lowerNote.pitch > upperNote.pitch) {
          // 发现交叉，降低低音或升高上音
          const diff = lowerNote.pitch - upperNote.pitch;
          const newLowerPitch = Math.max(
            lowerPart.instrument.range[0],
            lowerNote.pitch - diff - 2
          );
          result[lowerIdx] = {
            ...result[lowerIdx],
            notes: result[lowerIdx].notes.map((note, idx) =>
              idx === n ? { ...note, pitch: newLowerPitch } : note
            ),
          };
        }
      }
    }

    this.logDecision('声部交叉修正', `已检查并修正 ${parts.length} 个声部的交叉问题`, parts.map((p) => p.id), 0.91);

    return result;
  }

  /**
   * 计算声部的平均音高
   *
   * @param part - 声部
   * @returns 平均 MIDI 音高
   * @private
   */
  private getAveragePitch(part: Part): number {
    if (!part.notes || part.notes.length === 0) return 60;
    const sum = part.notes.reduce((acc, n) => acc + n.pitch, 0);
    return sum / part.notes.length;
  }

  /**
   * 根据旋律密度自动调整配器厚度
   *
   * 高密度旋律应减少乐器叠加，避免浑浊；
   * 低密度旋律可增加色彩乐器，丰富音响。
   *
   * @param parts - 声部数组
   * @param melody - 旋律
   * @returns 调整后的声部数组
   */
  public autoThinByDensity(parts: Part[], melody: Note[]): Part[] {
    const analysis = this.analyzeMelody(melody);
    const density = analysis.density; // 每秒音符数

    let result = [...parts];

    if (density > 6) {
      // 高密度：移除部分和声层与色彩层
      result = result.filter(
        (p) =>
          p.group === 'strings' ||
          p.group === 'brass' ||
          (p.group === 'woodwinds' && p.instrument.name === 'Flute')
      );
      this.logDecision('密度减薄', `旋律密度 ${density.toFixed(1)} 过高，已减薄配器`, result.map((p) => p.id), 0.88);
    } else if (density < 1.5) {
      // 低密度：保留全部色彩层
      this.logDecision('密度保留', `旋律密度 ${density.toFixed(1)} 较低，保留全部色彩声部`, result.map((p) => p.id), 0.88);
    }

    return result;
  }

  /**
   * 为特定段落生成铜管 "stabs" 短促和弦（常用于爵士与流行）
   *
   * @param parts - 声部数组
   * @param chordPitches - 和弦音数组
   * @param onset - 起始时间
   * @param duration - 时值
   * @returns 更新后的声部数组
   */
  public addBrassStabs(
    parts: Part[],
    chordPitches: number[],
    onset: number,
    duration: number
  ): Part[] {
    const result = [...parts];
    const brassParts = result.filter((p) => p.group === 'brass');

    if (brassParts.length === 0) return result;

    // 将和弦音分配给铜管声部
    for (let i = 0; i < brassParts.length && i < chordPitches.length; i++) {
      const bp = brassParts[i];
      const idx = result.findIndex((p) => p.id === bp.id);
      if (idx < 0) continue;

      const constrained = this.constrainPitchToInstrument(chordPitches[i], bp.instrument);
      const stabNote: Note = {
        pitch: constrained,
        onset,
        duration,
        velocity: 110,
        articulation: 'marcato',
      };

      result[idx] = {
        ...result[idx],
        notes: [...result[idx].notes, stabNote],
      };
    }

    this.logDecision('铜管Stabs', `已在 ${onset} 处添加铜管短促和弦`, brassParts.map((p) => p.id), 0.85);

    return result;
  }

  /**
   * 生成弦乐震音（Tremolo）效果声部
   *
   * @param parts - 声部数组
   * @param melody - 旋律参考
   * @param startTime - 起始采样点
   * @param endTime - 结束采样点
   * @returns 更新后的声部数组
   */
  public addStringTremolo(
    parts: Part[],
    melody: Note[],
    startTime: number,
    endTime: number
  ): Part[] {
    const result = [...parts];
    const stringParts = result.filter((p) => p.group === 'strings');

    for (const sp of stringParts) {
      const idx = result.findIndex((p) => p.id === sp.id);
      if (idx < 0) continue;

      // 找到该时间段内的参考音高
      const refNote = melody.find((n) => n.onset >= startTime && n.onset < endTime);
      const basePitch = refNote ? refNote.pitch : 60;
      const constrained = this.constrainPitchToInstrument(basePitch, sp.instrument);

      // 震音由密集交替音符模拟
      const tremoloNotes: Note[] = [];
      const step = Math.floor(this.sampleRate * 0.05); // 50ms 交替
      let t = startTime;
      let toggle = false;
      while (t < endTime) {
        tremoloNotes.push({
          pitch: toggle ? constrained : constrained + 1, // 微小音高交替模拟震音
          onset: t,
          duration: step,
          velocity: 70,
          articulation: 'legato',
        });
        t += step;
        toggle = !toggle;
      }

      result[idx] = {
        ...result[idx],
        notes: [...result[idx].notes, ...tremoloNotes],
      };
    }

    this.logDecision('弦乐震音', `已在 ${startTime}-${endTime} 添加弦乐震音`, stringParts.map((p) => p.id), 0.82);

    return result;
  }

  /**
   * 生成木管独奏段落（如长笛独奏华彩）
   *
   * @param parts - 声部数组
   * @param soloNotes - 独奏音符
   * @param instrumentName - 独奏乐器名称
   * @returns 更新后的声部数组
   */
  public addWoodwindSolo(
    parts: Part[],
    soloNotes: Note[],
    instrumentName: string
  ): Part[] {
    const result = [...parts];
    const targetIdx = result.findIndex((p) => p.instrument.name === instrumentName);

    if (targetIdx < 0) {
      this.logDecision('木管独奏', `未找到乐器 ${instrumentName}`, [], 0.0);
      return result;
    }

    // 将其他声部标记为伴奏，降低力度
    const updatedParts = result.map((p, i) => {
      if (i === targetIdx) {
        return {
          ...p,
          notes: soloNotes.map((n) => ({
            ...n,
            velocity: Math.min(127, n.velocity + 10),
          })),
          dynamicOffset: 10,
        };
      }
      // 伴奏声部降低并简化
      return {
        ...p,
        notes: p.notes.map((n) => ({
          ...n,
          velocity: Math.round(n.velocity * 0.5),
          duration: n.duration * 2, // 更长时值，减少运动
        })),
        dynamicOffset: -10,
      };
    });

    this.logDecision('木管独奏', `已为 ${instrumentName} 添加独奏华彩，其余声部弱化伴奏`, [instrumentName], 0.9);

    return updatedParts;
  }

  // ==========================================================================
  // 风格特化规则
  // ==========================================================================

  /**
   * 应用交响乐特化规则
   *
   * - 弦乐组承担主要和声与旋律功能
   * - 木管组提供独奏性乐句与色彩点缀
   * - 铜管组在高潮与强拍提供和声支撑
   * - 打击乐组精准标记节奏与结构
   *
   * @param parts - 声部数组
   * @param melody - 旋律
   * @returns 应用规则后的声部数组
   */
  public applySymphonicRules(parts: Part[], melody: Note[]): Part[] {
    let result = [...parts];

    // 铜管只在旋律高点或强拍出现
    const analysis = this.analyzeMelody(melody);
    const brassParts = result.filter((p) => p.group === 'brass');
    for (const bp of brassParts) {
      const idx = result.findIndex((p) => p.id === bp.id);
      if (idx < 0) continue;
      const filteredNotes = bp.notes.filter((n) => {
        const isHigh = n.pitch > 70;
        const isStrong = this.isStrongBeat(n.onset, analysis);
        return isHigh || isStrong;
      });
      result[idx] = { ...result[idx], notes: filteredNotes };
    }

    // 弦乐组旋律声部增加连音弓法
    const stringMelodyParts = result.filter(
      (p) => p.group === 'strings' && (p.instrument.name === 'Violin I' || p.instrument.name === 'Violin II')
    );
    for (const sp of stringMelodyParts) {
      const idx = result.findIndex((p) => p.id === sp.id);
      if (idx < 0) continue;
      result[idx] = {
        ...result[idx],
        notes: result[idx].notes.map((n) => ({ ...n, articulation: 'legato' as const })),
        techniques: [...(result[idx].techniques || []), 'con sordino'],
      };
    }

    this.logDecision('交响乐规则', '已应用交响乐特化配器规则', result.map((p) => p.id), 0.92);

    return result;
  }

  /**
   * 应用室内乐特化规则
   *
   * - 每件乐器都有独立的功能与重要性
   * - 避免过度叠加，追求透明织体
   * - 频繁的乐器对话与接替
   *
   * @param parts - 声部数组
   * @param melody - 旋律
   * @returns 应用规则后的声部数组
   */
  public applyChamberRules(parts: Part[], melody: Note[]): Part[] {
    let result = [...parts];

    // 减少每段同时发声的乐器数量
    const maxSimultaneous = 4;
    const timeSlices = this.slicePartsByTime(result);

    for (const slice of timeSlices) {
      if (slice.parts.length > maxSimultaneous) {
        // 按重要性排序，保留旋律+和声+低音
        const sorted = slice.parts.sort((a, b) => {
          const impA = this.getPartImportance(a);
          const impB = this.getPartImportance(b);
          return impB - impA;
        });
        const toMute = sorted.slice(maxSimultaneous);
        for (const mutePart of toMute) {
          const idx = result.findIndex((p) => p.id === mutePart.id);
          if (idx >= 0) {
            result[idx] = { ...result[idx], muted: true };
          }
        }
      }
    }

    this.logDecision('室内乐规则', '已应用室内乐透明织体规则', result.map((p) => p.id), 0.9);

    return result;
  }

  /**
   * 应用爵士特化规则
   *
   * - 铜管组负责 "stabs" 与旋律变奏
   * - 节奏组（钢琴、贝斯、鼓）提供稳定的 Swing 基础
   * - 木管组进行即兴式对位
   *
   * @param parts - 声部数组
   * @param melody - 旋律
   * @returns 应用规则后的声部数组
   */
  public applyJazzRules(parts: Part[], melody: Note[]): Part[] {
    let result = [...parts];

    // 节奏组钢琴加入行走的左手低音
    const pianoPart = result.find((p) => p.instrument.name === 'Piano');
    if (pianoPart) {
      const idx = result.findIndex((p) => p.id === pianoPart.id);
      const bassLine = this.generateWalkingBassFromMelody(melody);
      result[idx] = { ...result[idx], notes: [...result[idx].notes, ...bassLine] };
    }

    // 贝斯生成 Walking Bass Line
    const bassPart = result.find((p) => p.instrument.name === 'Electric Bass' || p.instrument.name === 'Double Bass');
    if (bassPart) {
      const idx = result.findIndex((p) => p.id === bassPart.id);
      const walkingBass = this.generateWalkingBassFromMelody(melody, true);
      result[idx] = { ...result[idx], notes: walkingBass };
    }

    this.logDecision('爵士规则', '已应用爵士 Walking Bass 与铜管 Stabs 规则', result.map((p) => p.id), 0.9);

    return result;
  }

  /**
   * 应用流行特化规则
   *
   * - 合成器铺底（Pad）提供和声背景
   * - 鼓组与贝斯形成强烈节奏驱动
   * - 弦乐组用于情感高潮的铺陈
   *
   * @param parts - 声部数组
   * @param melody - 旋律
   * @returns 应用规则后的声部数组
   */
  public applyPopRules(parts: Part[], melody: Note[]): Part[] {
    let result = [...parts];

    // 合成器铺底长音
    const padPart = result.find((p) => p.instrument.name === 'Pad Synth');
    if (padPart) {
      const idx = result.findIndex((p) => p.id === padPart.id);
      const padNotes = this.generateSynthPadNotes(melody);
      result[idx] = { ...result[idx], notes: padNotes };
    }

    // 鼓组生成稳定的流行节拍
    const drumPart = result.find((p) => p.instrument.name === 'Drum Kit');
    if (drumPart) {
      const idx = result.findIndex((p) => p.id === drumPart.id);
      const drumPattern = this.generatePopDrumPattern(melody);
      result[idx] = { ...result[idx], notes: drumPattern };
    }

    this.logDecision('流行规则', '已应用流行电子音色与节拍规则', result.map((p) => p.id), 0.88);

    return result;
  }

  /**
   * 应用中国风特化规则
   *
   * - 五声音阶旋律线条优先
   * - 竹笛、箫担任旋律与装饰
   * - 笙提供和声垫
   * - 板鼓、锣标记句式结构
   * - 避免不协和的半音进行
   *
   * @param parts - 声部数组
   * @param melody - 旋律
   * @returns 应用规则后的声部数组
   */
  public applyChineseRules(parts: Part[], melody: Note[]): Part[] {
    let result = [...parts];

    // 将旋律限制在五声音阶内
    const pentatonicScale = [0, 2, 4, 7, 9]; // C 宫调式
    const rootPc = this.parseKeyRoot(this.inferKey(melody));

    for (const part of result) {
      if (part.group === 'chineseWinds' || part.group === 'strings') {
        const idx = result.findIndex((p) => p.id === part.id);
        const quantizedNotes = part.notes.map((n) => {
          const pc = getPitchClass(n.pitch);
          const octave = getOctave(n.pitch);
          // 找到最近的五声音级
          let closest = pc;
          let minDist = Infinity;
          for (const degree of pentatonicScale) {
            const target = (rootPc + degree) % 12;
            const dist = Math.min(Math.abs(pc - target), 12 - Math.abs(pc - target));
            if (dist < minDist) {
              minDist = dist;
              closest = target;
            }
          }
          const newPitch = closest + octave * 12;
          return { ...n, pitch: newPitch };
        });
        result[idx] = { ...result[idx], notes: quantizedNotes };
      }
    }

    // 唢呐在高潮点加入强力支撑
    const suonaPart = result.find((p) => p.instrument.name === 'Suona');
    if (suonaPart) {
      const analysis = this.analyzeMelody(melody);
      const climaxNote = melody[analysis.climaxIndex];
      if (climaxNote) {
        const idx = result.findIndex((p) => p.id === suonaPart.id);
        const suonaNotes: Note[] = [
          {
            ...climaxNote,
            velocity: Math.min(127, climaxNote.velocity + 15),
            articulation: 'marcato',
          },
        ];
        result[idx] = { ...result[idx], notes: suonaNotes };
      }
    }

    this.logDecision('中国风规则', '已应用五声量化与民族打击乐结构规则', result.map((p) => p.id), 0.9);

    return result;
  }

  // ==========================================================================
  // 辅助生成方法
  // ==========================================================================

  /**
   * 生成 Walking Bass Line
   *
   * @param melody - 旋律
   * @param isSwing - 是否 Swing 感觉
   * @returns 贝斯音符数组
   * @private
   */
  private generateWalkingBassFromMelody(melody: Note[], isSwing = false): Note[] {
    const bassNotes: Note[] = [];
    const beatDuration = this.sampleRate; // 1秒 = 1拍简化
    const totalEnd = melody[melody.length - 1].onset + melody[melody.length - 1].duration;
    let t = melody[0].onset;

    const chordTones = this.generateChordTonesForMelody(melody, this.analyzeMelody(melody));
    let chordIndex = 0;

    while (t < totalEnd) {
      // 找到当前时间对应的和弦
      while (chordIndex < melody.length - 1 && melody[chordIndex + 1].onset <= t) {
        chordIndex++;
      }
      const tones = chordTones[chordIndex] || [48, 52, 55];
      const root = tones[0];
      const third = tones[1] || root + 4;
      const fifth = tones[2] || root + 7;

      // Walking bass: 根音 -> 五度 -> 经过音 -> 三度
      const pattern = [root, fifth, root + 2, third];
      const step = Math.floor(beatDuration / 4);

      for (let i = 0; i < 4; i++) {
        const pitch = this.constrainPitchToInstrument(pattern[i % pattern.length] - 12, {
          range: [28, 67],
        } as InstrumentDefinition);
        const duration = isSwing && i % 2 === 0 ? Math.floor(step * 1.3) : step;
        bassNotes.push({
          pitch,
          onset: t + i * step,
          duration,
          velocity: 85,
          articulation: 'tenuto',
        });
      }

      t += beatDuration;
    }

    return bassNotes;
  }

  /**
   * 生成合成器铺底音符
   *
   * @param melody - 旋律
   * @returns 铺底音符数组
   * @private
   */
  private generateSynthPadNotes(melody: Note[]): Note[] {
    const padNotes: Note[] = [];
    const analysis = this.analyzeMelody(melody);
    const chordTones = this.generateChordTonesForMelody(melody, analysis);

    // 每小节（4拍）生成一个长音和弦
    const beatDuration = this.sampleRate;
    const measureDuration = beatDuration * 4;
    const totalEnd = melody[melody.length - 1].onset + melody[melody.length - 1].duration;
    let t = melody[0].onset;
    let chordIdx = 0;

    while (t < totalEnd) {
      const tones = chordTones[chordIdx % chordTones.length];
      if (tones) {
        for (const pitch of tones) {
          padNotes.push({
            pitch: pitch - 12, // 低八度铺底
            onset: t,
            duration: measureDuration,
            velocity: 45,
            articulation: 'legato',
          });
        }
      }
      t += measureDuration;
      chordIdx += 4;
    }

    return padNotes;
  }

  /**
   * 生成流行鼓组节奏型
   *
   * @param melody - 旋律
   * @returns 鼓组音符数组
   * @private
   */
  private generatePopDrumPattern(melody: Note[]): Note[] {
    const drumNotes: Note[] = [];
    const beatDuration = this.sampleRate;
    const totalEnd = melody[melody.length - 1].onset + melody[melody.length - 1].duration;
    let t = melody[0].onset;

    // 基本 4/4 流行鼓型: BD(1,3), SD(2,4), HH(每拍)
    while (t < totalEnd) {
      // 第1拍: Bass Drum + Hi-Hat
      drumNotes.push({ pitch: 36, onset: t, duration: 100, velocity: 110 }); // BD
      drumNotes.push({ pitch: 42, onset: t, duration: 50, velocity: 70 }); // Closed HH

      // 第2拍: Snare + Hi-Hat
      drumNotes.push({
        pitch: 38,
        onset: t + beatDuration,
        duration: 100,
        velocity: 100,
      }); // SD
      drumNotes.push({
        pitch: 42,
        onset: t + beatDuration,
        duration: 50,
        velocity: 70,
      }); // HH

      // 第3拍: Bass Drum + Hi-Hat
      drumNotes.push({
        pitch: 36,
        onset: t + beatDuration * 2,
        duration: 100,
        velocity: 105,
      }); // BD
      drumNotes.push({
        pitch: 42,
        onset: t + beatDuration * 2,
        duration: 50,
        velocity: 70,
      }); // HH

      // 第4拍: Snare + Hi-Hat + 踩镲开镲
      drumNotes.push({
        pitch: 38,
        onset: t + beatDuration * 3,
        duration: 120,
        velocity: 100,
      }); // SD
      drumNotes.push({
        pitch: 46,
        onset: t + beatDuration * 3,
        duration: 200,
        velocity: 75,
      }); // Open HH

      t += beatDuration * 4;
    }

    return drumNotes;
  }

  /**
   * 将声部按时间切片，分析每个时间片同时发声的乐器
   *
   * @param parts - 声部数组
   * @returns 时间片数组
   * @private
   */
  private slicePartsByTime(parts: Part[]): { time: number; parts: Part[] }[] {
    const slices: { time: number; parts: Part[] }[] = [];
    const events = new Set<number>();

    for (const part of parts) {
      for (const note of part.notes) {
        events.add(note.onset);
        events.add(note.onset + note.duration);
      }
    }

    const sortedEvents = Array.from(events).sort((a, b) => a - b);

    for (let i = 0; i < sortedEvents.length - 1; i++) {
      const start = sortedEvents[i];
      const end = sortedEvents[i + 1];
      const activeParts = parts.filter((p) =>
        p.notes.some((n) => n.onset <= start && n.onset + n.duration > start)
      );
      if (activeParts.length > 0) {
        slices.push({ time: start, parts: activeParts });
      }
    }

    return slices;
  }

  /**
   * 评估声部的重要性评分
   *
   * @param part - 声部
   * @returns 重要性分数
   * @private
   */
  private getPartImportance(part: Part): number {
    let score = 0;
    if (part.instrument.name === 'Violin I' || part.instrument.name === 'Flute') score += 10;
    if (part.group === 'strings') score += 5;
    if (part.group === 'woodwinds') score += 4;
    if (part.group === 'brass') score += 3;
    if (part.notes.length > 0) score += 2;
    return score;
  }

  // ==========================================================================
  // 静态工具方法
  // ==========================================================================

  /**
   * 静态方法：计算两个声部之间的音程距离矩阵
   *
   * @param partA - 声部 A
   * @param partB - 声部 B
   * @returns 音程矩阵（半音数）
   */
  public static calculateIntervalMatrix(partA: Part, partB: Part): number[][] {
    const matrix: number[][] = [];
    for (const noteA of partA.notes) {
      const row: number[] = [];
      for (const noteB of partB.notes) {
        row.push(Math.abs(noteA.pitch - noteB.pitch));
      }
      matrix.push(row);
    }
    return matrix;
  }

  /**
   * 静态方法：合并多个声部为总谱
   *
   * @param parts - 声部数组
   * @returns 按时间排序的所有音符
   */
  public static mergeToScore(parts: Part[]): Note[] {
    const allNotes: Note[] = [];
    for (const part of parts) {
      for (const note of part.notes) {
        allNotes.push({ ...note, name: part.name });
      }
    }
    return allNotes.sort((a, b) => a.onset - b.onset);
  }

  /**
   * 静态方法：估算总谱的频谱能量分布
   *
   * @param parts - 声部数组
   * @returns 各频段能量估计
   */
  public static estimateSpectralEnergy(parts: Part[]): {
    low: number;
    mid: number;
    high: number;
  } {
    let low = 0;
    let mid = 0;
    let high = 0;

    for (const part of parts) {
      for (const note of part.notes) {
        const freq = midiToFrequency ? midiToFrequency(note.pitch) : 440 * Math.pow(2, (note.pitch - 69) / 12);
        const energy = note.velocity * note.velocity; // 能量近似与力度平方成正比
        if (freq < 250) low += energy;
        else if (freq < 2000) mid += energy;
        else high += energy;
      }
    }

    const total = low + mid + high || 1;
    return {
      low: low / total,
      mid: mid / total,
      high: high / total,
    };
  }
}

// =============================================================================
// 额外导出：类型别名与工具常量
// =============================================================================

/**
 * 配器风格联合类型
 */
export type OrchestrationStyle = 'symphonic' | 'chamber' | 'jazz' | 'pop' | 'chinese';

/**
 * 重复类型
 */
export type DoublingType = 'unison' | 'octave' | 'third' | 'fifth' | 'fourth';

/**
 * 默认导出
 */
export default Orchestrator;
