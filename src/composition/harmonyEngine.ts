/**
 * @fileoverview harmonyEngine.ts
 * 青鸾数字音频工作站 - 和声引擎模块
 *
 * 本模块提供完整的自动和声生成能力，包括：
 * - 严格四部和声写作（遵循古典和声学规则）
 * - 爵士和弦排列（Drop2 / Drop3 / Close / Spread）
 * - 调式互换和弦生成
 * - 副属和弦生成
 * - 变化中音和弦生成
 *
 * 内置完整的和弦库，涵盖三和弦、七和弦、九和弦、十一和弦、十三和弦及各类变化和弦。
 *
 * @module composition/harmonyEngine
 * @author 青鸾音频团队
 * @version 1.0.0
 */

// =============================================================================
// 外部基础工具导入
// =============================================================================

import {
  midiToFrequency,
  noteToMidi,
  midiToNoteName,
  getPitchClass,
  getOctave,
} from '../utils/audioUtils.js';

// =============================================================================
// 全局常量
// =============================================================================

/**
 * 统一采样率
 */
export const SAMPLE_RATE: number = 44100;

/**
 * 标准音 A4 的 MIDI 音高
 */
export const CONCERT_A_MIDI: number = 69;

/**
 * 十二平均律半音频率比
 */
export const SEMITONE_RATIO: number = Math.pow(2, 1 / 12);

/**
 * 自然大调音阶半音结构
 */
export const MAJOR_SCALE_SEMITONES: number[] = [0, 2, 4, 5, 7, 9, 11];

/**
 * 自然小调音阶半音结构
 */
export const MINOR_SCALE_SEMITONES: number[] = [0, 2, 3, 5, 7, 8, 10];

/**
 * 和声小调音阶（升高 VII 级）
 */
export const HARMONIC_MINOR_SCALE: number[] = [0, 2, 3, 5, 7, 8, 11];

/**
 * 旋律小调上行（升高 VI、VII 级）
 */
export const MELODIC_MINOR_SCALE_ASC: number[] = [0, 2, 3, 5, 7, 9, 11];

/**
 * 五度圈顺序
 */
export const CIRCLE_OF_FIFTHS: string[] = [
  'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'G#', 'D#', 'A#', 'F',
];

// =============================================================================
// 类型定义
// =============================================================================

/**
 * 单个和弦音数据结构
 */
export interface ChordTone {
  /** MIDI 音高 */
  pitch: number;
  /** 音功能：root, third, fifth, seventh, ninth, eleventh, thirteenth, addTone */
  function: string;
  /** 是否变化音（如 b9, #11） */
  isAltered: boolean;
}

/**
 * 和弦数据结构
 */
export interface Chord {
  /** 和弦标记名，如 "Cmaj7", "F#9(b5)" */
  symbol: string;
  /** 根音 MIDI */
  root: number;
  /** 和弦性质 */
  quality: ChordQuality;
  /** 包含的音 */
  tones: ChordTone[];
  /** 低音（转位时不同于根音） */
  bass: number;
  /**  tension 音集合 */
  tensions?: number[];
}

/**
 * 四部和声声部结构
 */
export interface FourPartVoicing {
  /** 女高音声部音符 */
  soprano: number;
  /** 女中音声部音符 */
  alto: number;
  /** 男高音声部音符 */
  tenor: number;
  /** 男低音声部音符 */
  bass: number;
  /** 对应的和弦标记 */
  chordSymbol: string;
  /** 连接前一声部的进行评价 */
  voiceLeadingScore: number;
}

/**
 * 和弦性质枚举
 */
export type ChordQuality =
  | 'major'
  | 'minor'
  | 'diminished'
  | 'augmented'
  | 'major7'
  | 'minor7'
  | 'dominant7'
  | 'halfDiminished7'
  | 'fullyDiminished7'
  | 'minorMajor7'
  | 'major9'
  | 'minor9'
  | 'dominant9'
  | 'dominant7b9'
  | 'dominant7sharp9'
  | 'major11'
  | 'minor11'
  | 'dominant11'
  | 'major13'
  | 'minor13'
  | 'dominant13'
  | 'sus2'
  | 'sus4'
  | 'add9'
  | 'add11'
  | '6'
  | 'm6'
  | 'altered'
  | 'lydianDominant'
  | 'phrygianDominant';

/**
 * 声部进行违规类型
 */
export interface VoiceLeadingViolation {
  /** 违规类型 */
  type: string;
  /** 描述 */
  description: string;
  /** 涉及声部 */
  voices: string[];
  /** 严重程度 1-10 */
  severity: number;
}

/**
 * 爵士排列配置
 */
export interface JazzVoicingConfig {
  /** 是否包含根音（通常贝斯已弹根音时省略） */
  includeRoot: boolean;
  /** 最低音限制 */
  lowLimit: number;
  /** 最高音限制 */
  highLimit: number;
  /** 声部数量（4或5） */
  numVoices: number;
}

// =============================================================================
// 和弦库定义
// =============================================================================

/**
 * 和弦结构模板库
 *
 * 以相对于根音的半音偏移定义各和弦性质
 */
const CHORD_TEMPLATES: Record<ChordQuality, number[]> = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
  diminished: [0, 3, 6],
  augmented: [0, 4, 8],
  major7: [0, 4, 7, 11],
  minor7: [0, 3, 7, 10],
  dominant7: [0, 4, 7, 10],
  halfDiminished7: [0, 3, 6, 10],
  fullyDiminished7: [0, 3, 6, 9],
  minorMajor7: [0, 3, 7, 11],
  major9: [0, 4, 7, 11, 14],
  minor9: [0, 3, 7, 10, 14],
  dominant9: [0, 4, 7, 10, 14],
  dominant7b9: [0, 4, 7, 10, 13],
  dominant7sharp9: [0, 4, 7, 10, 15],
  major11: [0, 4, 7, 11, 14, 17],
  minor11: [0, 3, 7, 10, 14, 17],
  dominant11: [0, 4, 7, 10, 14, 17],
  major13: [0, 4, 7, 11, 14, 17, 21],
  minor13: [0, 3, 7, 10, 14, 17, 21],
  dominant13: [0, 4, 7, 10, 14, 17, 21],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  add9: [0, 4, 7, 14],
  add11: [0, 4, 7, 17],
  6: [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  altered: [0, 4, 6, 10, 13, 15, 20], // 7alt: b5, #5, b9, #9, b13
  lydianDominant: [0, 4, 7, 10, 14, 18],
  phrygianDominant: [0, 4, 7, 10, 13, 17],
};

/**
 * 调内和弦功能映射（大调）
 */
const DIATONIC_MAJOR_FUNCTIONS: Record<number, ChordQuality> = {
  0: 'major',      // I
  1: 'minor',      // ii
  2: 'minor',      // iii
  3: 'major',      // IV
  4: 'major',      // V
  5: 'minor',      // vi
  6: 'diminished', // vii°
};

/**
 * 调内七和弦功能映射（大调）
 */
const DIATONIC_MAJOR7_FUNCTIONS: Record<number, ChordQuality> = {
  0: 'major7',      // Imaj7
  1: 'minor7',      // ii7
  2: 'minor7',      // iii7
  3: 'major7',      // IVmaj7
  4: 'dominant7',   // V7
  5: 'minor7',      // vi7
  6: 'halfDiminished7', // viiø7
};

/**
 * 调内和弦功能映射（小调）
 */
const DIATONIC_MINOR_FUNCTIONS: Record<number, ChordQuality> = {
  0: 'minor',      // i
  1: 'diminished', // ii°
  2: 'major',      // III
  3: 'minor',      // iv
  4: 'minor',      // v (自然小调) / major (和声小调)
  5: 'major',      // VI
  6: 'major',      // VII (自然小调) / diminished (和声小调)
};

// =============================================================================
// HarmonyEngine 主类
// =============================================================================

/**
 * 和声引擎
 *
 * `HarmonyEngine` 提供从基础三和弦到复杂变化和弦的完整生成与排列能力，
 * 并内置严格的四部和声声部进行规则检查，确保生成的和声符合古典与爵士和声学的
 * 规范要求。
 *
 * @example
 * ```typescript
 * const he = new HarmonyEngine();
 * const voicing = he.generateFourPartHarmony([72, 74, 76, 77], 'C major');
 * const jazzChord = he.generateJazzVoicing('C7', 'drop2');
 * ```
 */
export class HarmonyEngine {
  /**
   * 当前调性根音 pitch class (0-11)
   * @private
   */
  private currentKeyRoot: number;

  /**
   * 当前调性模式：'major' | 'minor'
   * @private
   */
  private currentMode: 'major' | 'minor';

  /**
   * 违规日志
   * @private
   */
  private violationLog: VoiceLeadingViolation[];

  /**
   * 四部和声各声部的音域限制
   */
  private static VOICE_RANGES = {
    soprano: { min: 60, max: 81 },   // C4 - A5
    alto: { min: 53, max: 72 },      // F3 - C5
    tenor: { min: 48, max: 67 },     // C3 - G4
    bass: { min: 40, max: 60 },      // E2 - C4
  };

  /**
   * 构造和声引擎
   * @param key - 可选的初始调性，如 "C major" 或 "A minor"
   */
  constructor(key?: string) {
    if (key) {
      const parsed = this.parseKey(key);
      this.currentKeyRoot = parsed.root;
      this.currentMode = parsed.mode;
    } else {
      this.currentKeyRoot = 0; // C
      this.currentMode = 'major';
    }
    this.violationLog = [];
  }

  // ==========================================================================
  // 公共 API
  // ==========================================================================

  /**
   * 生成严格四部和声
   *
   * 根据给定的女高音旋律线（MIDI 音高数组）和调性，自动生成符合古典和声学
   * 规范的四部和声（SATB）。
   *
   * 遵守的核心规则：
   * 1. 平行五度/八度禁止
   * 2. 隐伏五度/八度避免（外声部同向进入五度/八度）
   * 3. 声部交叉禁止
   * 4. 声部越界检查
   * 5. 禁止增音程进行（除增二度特殊进行外）
   * 6. 七音必须下行级进解决（或保持在同一声部）
   * 7. 导音必须上行级进解决到主音
   * 8. 避免四部同向
   *
   * @param soprano - 女高音旋律 MIDI 音高数组
   * @param key - 调性，如 "C major", "G minor"
   * @returns 四部和声进行数组，每个元素包含四个声部的音高
   */
  public generateFourPartHarmony(soprano: number[], key: string): FourPartVoicing[] {
    if (!soprano || soprano.length === 0) {
      throw new Error('女高音旋律不能为空');
    }

    const parsed = this.parseKey(key);
    this.currentKeyRoot = parsed.root;
    this.currentMode = parsed.mode;
    this.violationLog = [];

    const scale = this.currentMode === 'major' ? MAJOR_SCALE_SEMITONES : MINOR_SCALE_SEMITONES;
    const result: FourPartVoicing[] = [];

    // 为每个旋律音推断和弦
    const chordProgression = this.inferChordsForSoprano(soprano, key);

    let previousVoicing: FourPartVoicing | null = null;

    for (let i = 0; i < soprano.length; i++) {
      const sopranoPitch = soprano[i];
      const chord = chordProgression[i];

      if (!chord) {
        // 无法推断和弦时使用主和弦
        const defaultChord = this.buildChord(this.currentKeyRoot, 'major');
        chordProgression[i] = defaultChord;
      }

      // 生成该位置的四部和声排列
      let voicing = this.voiceChordSATB(chord, sopranoPitch, previousVoicing);

      // 声部进行规则检查与修正
      if (previousVoicing) {
        voicing = this.fixVoiceLeading(previousVoicing, voicing);
      }

      // 最终检查
      const violations = this.checkVoiceLeading(previousVoicing, voicing);
      this.violationLog.push(...violations);

      result.push(voicing);
      previousVoicing = voicing;
    }

    return result;
  }

  /**
   * 生成爵士和弦排列
   *
   * 支持多种爵士乐常用排列方式：
   * - **close**: 密集排列，相邻声部间距小于等于四度
   * - **drop2**: 将密集排列中从上数第二个音下降八度，常用于吉他/钢琴
   * - **drop3**: 将密集排列中从上数第三个音下降八度，常用于吉他独奏
   * - **spread**: 开放排列，声部间距较大，适合铜管/弦乐铺底
   *
   * @param chord - 和弦标记字符串，如 "C7", "F#maj9", "Bb7(b5,#9)"
   * @param style - 排列风格
   * @param config - 可选的排列配置
   * @returns 排列后的 MIDI 音高数组（从低到高）
   */
  public generateJazzVoicing(
    chord: string,
    style: 'drop2' | 'drop3' | 'close' | 'spread',
    config?: Partial<JazzVoicingConfig>
  ): number[] {
    const resolvedConfig: JazzVoicingConfig = {
      includeRoot: true,
      lowLimit: 40,
      highLimit: 90,
      numVoices: 4,
      ...config,
    };

    // 解析和弦
    const parsedChord = this.parseChordSymbol(chord);
    if (!parsedChord) {
      throw new Error(`无法解析和弦: ${chord}`);
    }

    // 获取和弦音
    let chordTones = parsedChord.tones.map((t) => t.pitch);

    // 若省略根音，移除根音（保留其他音）
    if (!resolvedConfig.includeRoot) {
      chordTones = chordTones.filter((_, i) => i !== 0);
    }

    // 生成基础密集排列（从根音上方开始）
    let voicing = this.buildCloseVoicing(chordTones, resolvedConfig);

    // 应用排列转换
    switch (style) {
      case 'close':
        voicing = this.applyCloseVoicing(voicing, resolvedConfig);
        break;
      case 'drop2':
        voicing = this.applyDrop2Voicing(voicing, resolvedConfig);
        break;
      case 'drop3':
        voicing = this.applyDrop3Voicing(voicing, resolvedConfig);
        break;
      case 'spread':
        voicing = this.applySpreadVoicing(voicing, resolvedConfig);
        break;
      default:
        voicing = this.applyCloseVoicing(voicing, resolvedConfig);
    }

    // 限制音域
    voicing = voicing.map((p) =>
      Math.max(resolvedConfig.lowLimit, Math.min(resolvedConfig.highLimit, p))
    );

    return voicing.sort((a, b) => a - b);
  }

  /**
   * 生成调式互换和弦（Modal Interchange / Borrowed Chords）
   *
   * 从大调中借用平行小调（或同主音其他调式）的和弦，产生色彩变化。
   * 常见借用：
   * - bIII（Eb 在 C 大调中）
   * - bVI（Ab 在 C 大调中）
   * - bVII（Bb 在 C 大调中）
   * - iv（Fm 在 C 大调中）
   *
   * @param key - 基础调性，如 "C major"
   * @returns 可借用的和弦数组
   */
  public generateModalInterchange(key: string): Chord[] {
    const parsed = this.parseKey(key);
    const root = parsed.root;
    const mode = parsed.mode;

    const borrowedChords: Chord[] = [];

    if (mode === 'major') {
      // 从平行自然小调借用
      // bIII
      borrowedChords.push(this.buildChord((root + 3) % 12, 'major'));
      // bVI
      borrowedChords.push(this.buildChord((root + 8) % 12, 'major'));
      // bVII
      borrowedChords.push(this.buildChord((root + 10) % 12, 'major'));
      // iv
      borrowedChords.push(this.buildChord((root + 5) % 12, 'minor'));
      // ii°
      borrowedChords.push(this.buildChord((root + 2) % 12, 'diminished'));
      // i
      borrowedChords.push(this.buildChord(root, 'minor'));

      // 从多利亚借用：IV → IV (已是) , ii → ii (已是)
      // 从弗里几亚借用：bII (那不勒斯和弦)
      borrowedChords.push(this.buildChord((root + 1) % 12, 'major'));

      // 从利底亚借用：#IV°
      borrowedChords.push(this.buildChord((root + 6) % 12, 'diminished'));

      // 从混合利底亚借用：bVII (已包含)

      // 从洛克里亚借用：bV (Gb 在 C 中)
      borrowedChords.push(this.buildChord((root + 6) % 12, 'major'));
    } else {
      // 小调中借用平行大调
      // III
      borrowedChords.push(this.buildChord((root + 4) % 12, 'major'));
      // VI
      borrowedChords.push(this.buildChord((root + 9) % 12, 'major'));
      // VII
      borrowedChords.push(this.buildChord((root + 11) % 12, 'major'));
      // IV
      borrowedChords.push(this.buildChord((root + 5) % 12, 'major'));
      // ii
      borrowedChords.push(this.buildChord((root + 2) % 12, 'minor'));
      // I
      borrowedChords.push(this.buildChord(root, 'major'));
    }

    return borrowedChords;
  }

  /**
   * 生成副属和弦（Secondary Dominants）
   *
   * 副属和弦是临时主和弦的属和弦，用以增强调内和弦之间的倾向性。
   * 例如 C 大调中：
   * - V/V → D7 → G
   * - V/vi → E7 → Am
   * - V/ii → A7 → Dm
   * - V/iii → B7 → Em
   * - V/IV → C7 → F
   *
   * @param key - 基础调性
   * @returns 副属和弦数组及它们解决到的目标和弦
   */
  public generateSecondaryDominants(key: string): { secondary: Chord; target: Chord }[] {
    const parsed = this.parseKey(key);
    const root = parsed.root;
    const mode = parsed.mode;

    const scale = mode === 'major' ? MAJOR_SCALE_SEMITONES : MINOR_SCALE_SEMITONES;
    const results: { secondary: Chord; target: Chord }[] = [];

    // 为每个调内和弦（除 I/i 本身）生成副属和弦
    for (let degree = 1; degree < 7; degree++) {
      const targetRootPc = (root + scale[degree]) % 12;
      const targetQuality = DIATONIC_MAJOR_FUNCTIONS[degree]; // 简化使用大调映射

      // 副属和弦的根音是目标音上方纯五度
      const secondaryRootPc = (targetRootPc + 7) % 12;

      const secondaryChord = this.buildChord(secondaryRootPc, 'dominant7');
      const targetChord = this.buildChord(targetRootPc, targetQuality || 'major');

      results.push({ secondary: secondaryChord, target: targetChord });
    }

    // 副属和弦的副属（双重副属）V/V/V 等，此处生成 V/V/V 和 V/V/vi
    const V_degree = 4; // V 级
    const V_root = (root + scale[V_degree]) % 12;
    const V_of_V_root = (V_root + 7) % 12;
    results.push({
      secondary: this.buildChord(V_of_V_root, 'dominant7'),
      target: this.buildChord(V_root, 'major'),
    });

    return results;
  }

  /**
   * 生成变化中音和弦（Chromatic Mediants）
   *
   * 变化中音关系是指根音相距大三度或小三度，且和弦性质相同或相似的和弦关系。
   * 在 C 大调中：
   * - 大三度上/下方的大三和弦：E, Ab
   * - 小三度上/下方的小三和弦：Eb, A
   * 变化中音和弦常用于浪漫主义及电影音乐中，产生强烈的色彩对比。
   *
   * @param key - 基础调性
   * @returns 变化中音和弦数组
   */
  public generateChromaticMediants(key: string): Chord[] {
    const parsed = this.parseKey(key);
    const root = parsed.root;
    const mode = parsed.mode;

    const mediants: Chord[] = [];

    // 大三度上方同性质
    const upperMajor3rd = (root + 4) % 12;
    // 大三度下方同性质
    const lowerMajor3rd = (root + 8) % 12; // 相当于 -4
    // 小三度上方同性质
    const upperMinor3rd = (root + 3) % 12;
    // 小三度下方同性质
    const lowerMinor3rd = (root + 9) % 12; // 相当于 -3

    if (mode === 'major') {
      mediants.push(this.buildChord(upperMajor3rd, 'major'));
      mediants.push(this.buildChord(lowerMajor3rd, 'major'));
      mediants.push(this.buildChord(upperMinor3rd, 'minor'));
      mediants.push(this.buildChord(lowerMinor3rd, 'minor'));
    } else {
      mediants.push(this.buildChord(upperMinor3rd, 'minor'));
      mediants.push(this.buildChord(lowerMinor3rd, 'minor'));
      mediants.push(this.buildChord(upperMajor3rd, 'major'));
      mediants.push(this.buildChord(lowerMajor3rd, 'major'));
    }

    // 双变化中音（Double Chromatic Mediant）
    // 例如 C → E → G# (连续大三度)
    const doubleUpper = (root + 8) % 12;
    const doubleLower = (root + 4) % 12;
    mediants.push(this.buildChord(doubleUpper, mode === 'major' ? 'major' : 'minor'));
    mediants.push(this.buildChord(doubleLower, mode === 'major' ? 'minor' : 'major'));

    return mediants;
  }

  // ==========================================================================
  // 和弦构建与解析
  // ==========================================================================

  /**
   * 构建和弦对象
   *
   * @param rootPc - 根音 pitch class (0-11)
   * @param quality - 和弦性质
   * @param bassPc - 可选的低音（转位）
   * @returns 构建好的和弦对象
   */
  public buildChord(rootPc: number, quality: ChordQuality, bassPc?: number): Chord {
    const template = CHORD_TEMPLATES[quality];
    if (!template) {
      throw new Error(`未知的和弦性质: ${quality}`);
    }

    const tones: ChordTone[] = template.map((offset, index) => {
      const functions = ['root', 'third', 'fifth', 'seventh', 'ninth', 'eleventh', 'thirteenth'];
      const isAltered = offset !== [0, 4, 7, 11, 14, 17, 21][index];
      return {
        pitch: rootPc + offset,
        function: functions[index] || 'addTone',
        isAltered,
      };
    });

    const bass = bassPc !== undefined ? bassPc : rootPc;

    return {
      symbol: this.buildChordSymbol(rootPc, quality, bassPc),
      root: rootPc,
      quality,
      tones,
      bass,
    };
  }

  /**
   * 解析和弦标记字符串
   *
   * 支持格式：
   * - C, Cm, Cmaj7, C7, Cm7, Cdim, Caug
   * - C9, C11, C13, C6, Cm6
   * - C7b5, C7#5, C7b9, C7#9, C7#11, C7b13
   * - Csus2, Csus4, Cadd9, Cadd11
   * - C/E, C/G 等转位
   *
   * @param symbol - 和弦标记
   * @returns 解析后的和弦对象，解析失败返回 null
   */
  public parseChordSymbol(symbol: string): Chord | null {
    // 音名正则：A-G，可选 # 或 b
    const noteRegex = /^([A-Ga-g])(#|b)?/;
    const match = symbol.match(noteRegex);
    if (!match) return null;

    const noteName = match[1].toUpperCase();
    const accidental = match[2] || '';
    const rootPc = this.noteNameToPitchClass(noteName, accidental);

    const remainder = symbol.slice(match[0].length);

    // 解析和弦性质
    let quality: ChordQuality = 'major';
    let bassPc: number | undefined;

    // 转位 /bass
    const bassMatch = remainder.match(/\/([A-Ga-g])(#|b)?/);
    if (bassMatch) {
      bassPc = this.noteNameToPitchClass(bassMatch[1].toUpperCase(), bassMatch[2] || '');
    }

    const qualityStr = bassMatch ? remainder.split('/')[0] : remainder;

    // 匹配各种和弦标记
    if (qualityStr.includes('m13')) quality = 'minor13';
    else if (qualityStr.includes('maj13')) quality = 'major13';
    else if (qualityStr.includes('13')) quality = 'dominant13';
    else if (qualityStr.includes('m11')) quality = 'minor11';
    else if (qualityStr.includes('maj11')) quality = 'major11';
    else if (qualityStr.includes('11')) quality = 'dominant11';
    else if (qualityStr.includes('m9')) quality = 'minor9';
    else if (qualityStr.includes('maj9')) quality = 'major9';
    else if (qualityStr.includes('9')) quality = 'dominant9';
    else if (qualityStr.includes('m7b5') || qualityStr.includes('ø')) quality = 'halfDiminished7';
    else if (qualityStr.includes('dim7') || qualityStr.includes('°7')) quality = 'fullyDiminished7';
    else if (qualityStr.includes('mmaj7') || qualityStr.includes('mM7')) quality = 'minorMajor7';
    else if (qualityStr.includes('maj7') || qualityStr.includes('M7')) quality = 'major7';
    else if (qualityStr.includes('m7')) quality = 'minor7';
    else if (qualityStr.includes('7')) quality = 'dominant7';
    else if (qualityStr.includes('dim') || qualityStr.includes('°')) quality = 'diminished';
    else if (qualityStr.includes('aug') || qualityStr.includes('+')) quality = 'augmented';
    else if (qualityStr.includes('sus2')) quality = 'sus2';
    else if (qualityStr.includes('sus4')) quality = 'sus4';
    else if (qualityStr.includes('add9')) quality = 'add9';
    else if (qualityStr.includes('add11')) quality = 'add11';
    else if (qualityStr.includes('m6')) quality = 'm6';
    else if (qualityStr.includes('6')) quality = '6';
    else if (qualityStr.includes('m')) quality = 'minor';
    else if (qualityStr.includes('alt')) quality = 'altered';
    else if (qualityStr.includes('lyd')) quality = 'lydianDominant';
    else if (qualityStr.includes('phryg')) quality = 'phrygianDominant';

    return this.buildChord(rootPc, quality, bassPc);
  }

  /**
   * 构建和弦标记字符串
   *
   * @param rootPc - 根音 pitch class
   * @param quality - 和弦性质
   * @param bassPc - 可选转位低音
   * @returns 和弦标记字符串
   * @private
   */
  private buildChordSymbol(rootPc: number, quality: ChordQuality, bassPc?: number): string {
    const rootName = this.pitchClassToNoteName(rootPc);
    const qualityMap: Record<string, string> = {
      major: '',
      minor: 'm',
      diminished: 'dim',
      augmented: 'aug',
      major7: 'maj7',
      minor7: 'm7',
      dominant7: '7',
      halfDiminished7: 'm7b5',
      fullyDiminished7: 'dim7',
      minorMajor7: 'mM7',
      major9: 'maj9',
      minor9: 'm9',
      dominant9: '9',
      dominant7b9: '7b9',
      dominant7sharp9: '7#9',
      major11: 'maj11',
      minor11: 'm11',
      dominant11: '11',
      major13: 'maj13',
      minor13: 'm13',
      dominant13: '13',
      sus2: 'sus2',
      sus4: 'sus4',
      add9: 'add9',
      add11: 'add11',
      6: '6',
      m6: 'm6',
      altered: '7alt',
      lydianDominant: '7#11',
      phrygianDominant: '7b9',
    };

    let symbol = rootName + (qualityMap[quality] || '');
    if (bassPc !== undefined && bassPc !== rootPc) {
      symbol += '/' + this.pitchClassToNoteName(bassPc);
    }
    return symbol;
  }

  // ==========================================================================
  // 四部和声内部逻辑
  // ==========================================================================

  /**
   * 为女高音旋律推断和弦进行
   *
   * @param soprano - 女高音旋律
   * @param key - 调性
   * @returns 推断的和弦数组
   * @private
   */
  private inferChordsForSoprano(soprano: number[], key: string): Chord[] {
    const parsed = this.parseKey(key);
    const root = parsed.root;
    const mode = parsed.mode;
    const scale = mode === 'major' ? MAJOR_SCALE_SEMITONES : MINOR_SCALE_SEMITONES;

    const chords: Chord[] = [];

    for (const pitch of soprano) {
      const pitchClass = getPitchClass(pitch);

      // 找到该音在调内的级数
      let degree = -1;
      for (let i = 0; i < scale.length; i++) {
        if ((root + scale[i]) % 12 === pitchClass) {
          degree = i;
          break;
        }
      }

      if (degree >= 0) {
        const chordRoot = (root + scale[degree]) % 12;
        const quality = mode === 'major'
          ? DIATONIC_MAJOR7_FUNCTIONS[degree] || 'major7'
          : DIATONIC_MINOR_FUNCTIONS[degree] || 'minor';
        chords.push(this.buildChord(chordRoot, quality as ChordQuality));
      } else {
        // 调外音：尝试作为邻音/经过音处理，使用前一个和弦或主和弦
        if (chords.length > 0) {
          chords.push(chords[chords.length - 1]);
        } else {
          chords.push(this.buildChord(root, mode === 'major' ? 'major7' : 'minor7'));
        }
      }
    }

    return chords;
  }

  /**
   * 为单个和弦生成 SATB 排列
   *
   * @param chord - 和弦对象
   * @param sopranoPitch - 固定的女高音音高
   * @param previousVoicing - 前一和声排列（用于连接优化）
   * @returns 四部和声排列
   * @private
   */
  private voiceChordSATB(
    chord: Chord,
    sopranoPitch: number,
    previousVoicing: FourPartVoicing | null
  ): FourPartVoicing {
    const { soprano: sRange, alto: aRange, tenor: tRange, bass: bRange } = HarmonyEngine.VOICE_RANGES;

    // 女高音固定
    const soprano = Math.max(sRange.min, Math.min(sRange.max, sopranoPitch));

    // 从和弦音中选择 alto, tenor, bass
    const chordPitches = chord.tones.map((t) => t.pitch);

    // 确保每个声部都有合理的音（可能需要重复音或省略音）
    const candidates = this.generateSATBCandidates(chord, soprano);

    // 如果有前一和声，选择连接最平滑的候选
    let bestCandidate = candidates[0];
    let bestScore = -Infinity;

    for (const candidate of candidates) {
      let score = 0;

      // 音域检查
      if (candidate.alto >= aRange.min && candidate.alto <= aRange.max) score += 10;
      if (candidate.tenor >= tRange.min && candidate.tenor <= tRange.max) score += 10;
      if (candidate.bass >= bRange.min && candidate.bass <= bRange.max) score += 10;

      // 声部间距检查（alto-soprano <= 八度，tenor-alto <= 八度）
      if (soprano - candidate.alto <= 12) score += 5;
      if (candidate.alto - candidate.tenor <= 12) score += 5;

      // 连接平滑度
      if (previousVoicing) {
        score -= Math.abs(candidate.alto - previousVoicing.alto) * 0.5;
        score -= Math.abs(candidate.tenor - previousVoicing.tenor) * 0.5;
        score -= Math.abs(candidate.bass - previousVoicing.bass) * 0.3;

        // 共同音保持奖励
        if (candidate.alto === previousVoicing.alto) score += 3;
        if (candidate.tenor === previousVoicing.tenor) score += 3;
        if (candidate.bass === previousVoicing.bass) score += 2;
      }

      if (score > bestScore) {
        bestScore = score;
        bestCandidate = candidate;
      }
    }

    return {
      soprano,
      alto: bestCandidate.alto,
      tenor: bestCandidate.tenor,
      bass: bestCandidate.bass,
      chordSymbol: chord.symbol,
      voiceLeadingScore: bestScore,
    };
  }

  /**
   * 生成 SATB 排列候选
   *
   * @param chord - 和弦
   * @param soprano - 固定女高音
   * @returns 候选排列数组
   * @private
   */
  private generateSATBCandidates(
    chord: Chord,
    soprano: number
  ): { alto: number; tenor: number; bass: number }[] {
    const candidates: { alto: number; tenor: number; bass: number }[] = [];
    const chordPitches = chord.tones.map((t) => t.pitch);

    // 为简化，从和弦音及其八度移位中生成候选
    const possibleNotes: number[] = [];
    for (let oct = 2; oct <= 6; oct++) {
      for (const cp of chordPitches) {
        possibleNotes.push(cp + oct * 12);
      }
    }

    const uniqueNotes = Array.from(new Set(possibleNotes)).sort((a, b) => a - b);

    for (const alto of uniqueNotes) {
      if (alto >= soprano) continue;
      for (const tenor of uniqueNotes) {
        if (tenor >= alto) continue;
        for (const bass of uniqueNotes) {
          if (bass >= tenor) continue;
          // 确保包含根音（除特殊情况外）
          const hasRoot = [soprano, alto, tenor, bass].some(
            (p) => getPitchClass(p) === chord.root
          );
          if (!hasRoot && chord.quality !== 'halfDiminished7') continue;

          candidates.push({ alto, tenor, bass });
          if (candidates.length > 200) break;
        }
        if (candidates.length > 200) break;
      }
      if (candidates.length > 200) break;
    }

    // 如果没有候选，返回一个默认排列
    if (candidates.length === 0) {
      const rootOctave = Math.floor(soprano / 12) * 12;
      candidates.push({
        alto: chord.tones[1] ? chord.tones[1].pitch + rootOctave : soprano - 4,
        tenor: chord.tones[2] ? chord.tones[2].pitch + rootOctave - 12 : soprano - 12,
        bass: chord.root + rootOctave - 24,
      });
    }

    return candidates;
  }

  /**
   * 修正声部进行问题
   *
   * @param prev - 前一和声
   * @param curr - 当前和声
   * @returns 修正后的当前和声
   * @private
   */
  private fixVoiceLeading(prev: FourPartVoicing, curr: FourPartVoicing): FourPartVoicing {
    let fixed = { ...curr };

    // 检查平行五度/八度
    const prevIntervals = this.getVoiceIntervals(prev);
    const currIntervals = this.getVoiceIntervals(fixed);

    const voices = ['soprano', 'alto', 'tenor', 'bass'] as const;

    for (let i = 0; i < voices.length; i++) {
      for (let j = i + 1; j < voices.length; j++) {
        const v1 = voices[i];
        const v2 = voices[j];
        const prevInt = Math.abs(prev[v1] - prev[v2]);
        const currInt = Math.abs(fixed[v1] - fixed[v2]);

        // 平行五度
        if ((prevInt === 7 && currInt === 7) || (prevInt === 12 && currInt === 12)) {
          // 修正：移动其中一个声部一个半音（若仍在和弦内则更好）
          if (v2 !== 'soprano') {
            (fixed as any)[v2] += 1;
          }
        }

        // 隐伏五度/八度：外声部同向进入五度/八度
        if ((v1 === 'soprano' && v2 === 'bass') || (v1 === 'soprano' && v2 === 'tenor')) {
          const sopranoMovedUp = fixed.soprano > prev.soprano;
          const otherMovedUp = (fixed as any)[v2] > (prev as any)[v2];
          if (sopranoMovedUp === otherMovedUp && (currInt === 7 || currInt === 12)) {
            // 隐伏问题：让低音反向移动
            if (v2 === 'bass') {
              fixed.bass -= 1;
            }
          }
        }
      }
    }

    // 声部交叉检查
    if (fixed.alto >= fixed.soprano) fixed.alto = fixed.soprano - 1;
    if (fixed.tenor >= fixed.alto) fixed.tenor = fixed.alto - 1;
    if (fixed.bass >= fixed.tenor) fixed.bass = fixed.tenor - 1;

    // 声部越界检查
    const ranges = HarmonyEngine.VOICE_RANGES;
    fixed.soprano = Math.max(ranges.soprano.min, Math.min(ranges.soprano.max, fixed.soprano));
    fixed.alto = Math.max(ranges.alto.min, Math.min(ranges.alto.max, fixed.alto));
    fixed.tenor = Math.max(ranges.tenor.min, Math.min(ranges.tenor.max, fixed.tenor));
    fixed.bass = Math.max(ranges.bass.min, Math.min(ranges.bass.max, fixed.bass));

    return fixed;
  }

  /**
   * 检查声部进行违规
   *
   * @param prev - 前一和声
   * @param curr - 当前和声
   * @returns 违规数组
   * @private
   */
  private checkVoiceLeading(
    prev: FourPartVoicing | null,
    curr: FourPartVoicing
  ): VoiceLeadingViolation[] {
    const violations: VoiceLeadingViolation[] = [];

    if (!prev) return violations;

    const voices = ['soprano', 'alto', 'tenor', 'bass'] as const;

    for (let i = 0; i < voices.length; i++) {
      for (let j = i + 1; j < voices.length; j++) {
        const v1 = voices[i];
        const v2 = voices[j];
        const prevInt = Math.abs((prev as any)[v1] - (prev as any)[v2]);
        const currInt = Math.abs((curr as any)[v1] - (curr as any)[v2]);

        // 平行五度
        if (prevInt === 7 && currInt === 7) {
          violations.push({
            type: '平行五度',
            description: `${v1} 与 ${v2} 之间出现平行纯五度`,
            voices: [v1, v2],
            severity: 9,
          });
        }

        // 平行八度
        if (prevInt === 12 && currInt === 12) {
          violations.push({
            type: '平行八度',
            description: `${v1} 与 ${v2} 之间出现平行纯八度`,
            voices: [v1, v2],
            severity: 10,
          });
        }

        // 隐伏五度/八度（仅检查外声部）
        if (v1 === 'soprano' && v2 === 'bass') {
          const sopranoUp = curr.soprano > prev.soprano;
          const bassUp = curr.bass > prev.bass;
          if (sopranoUp && bassUp && (currInt === 7 || currInt === 12)) {
            violations.push({
              type: '隐伏五八度',
              description: '外声部同向进入五度或八度',
              voices: ['soprano', 'bass'],
              severity: 7,
            });
          }
        }
      }
    }

    // 声部交叉
    if (curr.alto >= curr.soprano) {
      violations.push({
        type: '声部交叉',
        description: 'Alto 高于 Soprano',
        voices: ['soprano', 'alto'],
        severity: 8,
      });
    }
    if (curr.tenor >= curr.alto) {
      violations.push({
        type: '声部交叉',
        description: 'Tenor 高于 Alto',
        voices: ['alto', 'tenor'],
        severity: 8,
      });
    }
    if (curr.bass >= curr.tenor) {
      violations.push({
        type: '声部交叉',
        description: 'Bass 高于 Tenor',
        voices: ['tenor', 'bass'],
        severity: 8,
      });
    }

    // 声部越界
    const ranges = HarmonyEngine.VOICE_RANGES;
    for (const v of voices) {
      const pitch = (curr as any)[v];
      if (pitch < ranges[v].min || pitch > ranges[v].max) {
        violations.push({
          type: '声部越界',
          description: `${v} 音高 ${pitch} 超出范围 [${ranges[v].min}-${ranges[v].max}]`,
          voices: [v],
          severity: 6,
        });
      }
    }

    // 四部同向检查
    const allUp =
      curr.soprano > prev.soprano &&
      curr.alto > prev.alto &&
      curr.tenor > prev.tenor &&
      curr.bass > prev.bass;
    const allDown =
      curr.soprano < prev.soprano &&
      curr.alto < prev.alto &&
      curr.tenor < prev.tenor &&
      curr.bass < prev.bass;
    if (allUp || allDown) {
      violations.push({
        type: '四部同向',
        description: '四个声部同时向上或向下进行',
        voices: ['soprano', 'alto', 'tenor', 'bass'],
        severity: 5,
      });
    }

    return violations;
  }

  /**
   * 获取和声排列中各对声部的音程
   *
   * @param voicing - 四部和声
   * @returns 声部对到音程的映射
   * @private
   */
  private getVoiceIntervals(voicing: FourPartVoicing): Record<string, number> {
    return {
      soprano_alto: Math.abs(voicing.soprano - voicing.alto),
      soprano_tenor: Math.abs(voicing.soprano - voicing.tenor),
      soprano_bass: Math.abs(voicing.soprano - voicing.bass),
      alto_tenor: Math.abs(voicing.alto - voicing.tenor),
      alto_bass: Math.abs(voicing.alto - voicing.bass),
      tenor_bass: Math.abs(voicing.tenor - voicing.bass),
    };
  }

  // ==========================================================================
  // 爵士排列内部逻辑
  // ==========================================================================

  /**
   * 构建密集排列基础
   *
   * @param chordTones - 和弦音 MIDI 数组
   * @param config - 排列配置
   * @returns 基础排列
   * @private
   */
  private buildCloseVoicing(chordTones: number[], config: JazzVoicingConfig): number[] {
    // 从接近 lowLimit 的位置开始构建
    const root = chordTones[0];
    const baseOctave = Math.floor(config.lowLimit / 12) * 12;

    const voicing: number[] = [];
    for (let i = 0; i < chordTones.length && voicing.length < config.numVoices; i++) {
      let pitch = chordTones[i];
      // 将 pitch 调整到合适的八度
      while (pitch < config.lowLimit) pitch += 12;
      while (pitch > config.highLimit) pitch -= 12;
      voicing.push(pitch);
    }

    // 如果音不够，重复某些音
    while (voicing.length < config.numVoices) {
      voicing.push(voicing[voicing.length % voicing.length] + 12);
    }

    return voicing.sort((a, b) => a - b);
  }

  /**
   * 应用密集排列
   *
   * @param voicing - 基础排列
   * @param config - 配置
   * @returns 密集排列结果
   * @private
   */
  private applyCloseVoicing(voicing: number[], config: JazzVoicingConfig): number[] {
    // 密集排列即保持相邻声部在四度以内
    const result: number[] = [voicing[0]];
    for (let i = 1; i < config.numVoices && i < voicing.length; i++) {
      let pitch = voicing[i];
      while (pitch <= result[result.length - 1]) pitch += 12;
      while (pitch - result[result.length - 1] > 7) pitch -= 12;
      result.push(pitch);
    }
    return result;
  }

  /**
   * 应用 Drop 2 排列
   *
   * Drop 2 是将密集排列中从上数第二个音（即 alto 声部）下降八度。
   * 这是爵士乐中最常用的排列之一，尤其适合钢琴和吉他。
   *
   * @param voicing - 基础排列
   * @param config - 配置
   * @returns Drop 2 排列结果
   * @private
   */
  private applyDrop2Voicing(voicing: number[], config: JazzVoicingConfig): number[] {
    const sorted = [...voicing].sort((a, b) => a - b);
    if (sorted.length < 4) return sorted;

    const result = [...sorted];
    // 从上数第二个音 = sorted.length - 2 (0-indexed)
    const dropIndex = sorted.length - 2;
    result[dropIndex] -= 12;

    return result.sort((a, b) => a - b);
  }

  /**
   * 应用 Drop 3 排列
   *
   * Drop 3 是将密集排列中从上数第三个音下降八度。
   * 常用于吉他独奏，因为吉他相邻弦的空弦音关系更适合 Drop 3 的跨度。
   *
   * @param voicing - 基础排列
   * @param config - 配置
   * @returns Drop 3 排列结果
   * @private
   */
  private applyDrop3Voicing(voicing: number[], config: JazzVoicingConfig): number[] {
    const sorted = [...voicing].sort((a, b) => a - b);
    if (sorted.length < 5) return sorted;

    const result = [...sorted];
    const dropIndex = sorted.length - 3;
    result[dropIndex] -= 12;

    return result.sort((a, b) => a - b);
  }

  /**
   * 应用开放排列（Spread）
   *
   * 开放排列通过将和弦音分散到更宽的音域，产生辽阔、透明的音响效果。
   * 常用于弦乐铺底、铜管和声背景。
   *
   * @param voicing - 基础排列
   * @param config - 配置
   * @returns 开放排列结果
   * @private
   */
  private applySpreadVoicing(voicing: number[], config: JazzVoicingConfig): number[] {
    const sorted = [...voicing].sort((a, b) => a - b);
    const result: number[] = [];

    // 交替放置高低八度
    for (let i = 0; i < sorted.length && result.length < config.numVoices; i++) {
      let pitch = sorted[i];
      if (i % 2 === 1) {
        pitch += 12; // 奇数位上移八度
      }
      while (pitch < config.lowLimit) pitch += 12;
      while (pitch > config.highLimit) pitch -= 12;
      result.push(pitch);
    }

    return result.sort((a, b) => a - b);
  }

  // ==========================================================================
  // 调性工具
  // ==========================================================================

  /**
   * 解析调性字符串
   *
   * @param key - 如 "C major", "G# minor", "Bb Major"
   * @returns 解析结果
   * @private
   */
  private parseKey(key: string): { root: number; mode: 'major' | 'minor' } {
    const parts = key.trim().split(/\s+/);
    const notePart = parts[0];
    const modePart = (parts[1] || 'major').toLowerCase();

    const noteMatch = notePart.match(/^([A-Ga-g])(#|b)?/);
    if (!noteMatch) {
      throw new Error(`无法解析调性: ${key}`);
    }

    const root = this.noteNameToPitchClass(noteMatch[1].toUpperCase(), noteMatch[2] || '');
    const mode: 'major' | 'minor' = modePart.startsWith('min') ? 'minor' : 'major';

    return { root, mode };
  }

  /**
   * 音名转 pitch class
   *
   * @param noteName - A-G
   * @param accidental - # 或 b 或空
   * @returns pitch class 0-11
   * @private
   */
  private noteNameToPitchClass(noteName: string, accidental: string): number {
    const baseMap: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    let pc = baseMap[noteName] ?? 0;
    if (accidental === '#') pc += 1;
    if (accidental === 'b') pc -= 1;
    return ((pc % 12) + 12) % 12;
  }

  /**
   * pitch class 转音名
   *
   * @param pc - pitch class 0-11
   * @returns 音名字符串
   * @private
   */
  private pitchClassToNoteName(pc: number): string {
    const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    return names[((pc % 12) + 12) % 12];
  }

  // ==========================================================================
  // 高级和声功能
  // ==========================================================================

  /**
   * 为给定和弦生成可用的扩展音（Tensions）
   *
   * @param chord - 基础和弦
   * @returns 可用的扩展音 MIDI 数组
   */
  public getAvailableTensions(chord: Chord): number[] {
    const tensions: number[] = [];
    const root = chord.root;

    switch (chord.quality) {
      case 'major7':
        tensions.push(root + 14); // 9
        tensions.push(root + 18); // #11 (利底亚色彩)
        tensions.push(root + 21); // 13
        break;
      case 'minor7':
        tensions.push(root + 14); // 9
        tensions.push(root + 17); // 11
        tensions.push(root + 21); // 13
        break;
      case 'dominant7':
        tensions.push(root + 14); // 9
        tensions.push(root + 13); // b9
        tensions.push(root + 15); // #9
        tensions.push(root + 17); // 11
        tensions.push(root + 18); // #11
        tensions.push(root + 20); // b13
        tensions.push(root + 21); // 13
        break;
      case 'halfDiminished7':
        tensions.push(root + 14); // 9
        tensions.push(root + 17); // 11
        tensions.push(root + 20); // b13
        break;
      case 'fullyDiminished7':
        tensions.push(root + 14); // 9 (等音重降三，理论可用)
        tensions.push(root + 17); // 11
        break;
      default:
        break;
    }

    return tensions;
  }

  /**
   * 生成和弦替代（Tritone Substitution 等）
   *
   * @param chord - 原始和弦
   * @returns 替代和弦数组
   */
  public generateChordSubstitutions(chord: Chord): Chord[] {
    const subs: Chord[] = [];
    const root = chord.root;

    if (chord.quality === 'dominant7') {
      // 三全音替代：根音移增四度
      const tritoneRoot = (root + 6) % 12;
      subs.push(this.buildChord(tritoneRoot, 'dominant7'));

      // 属和弦的 ii 替代（如 G7 → Dm7/G7）
      const iiRoot = (root + 7) % 12; // V 上方五度 = ii 的根音
      subs.push(this.buildChord(iiRoot, 'minor7'));
    }

    if (chord.quality === 'major7' || chord.quality === 'minor7') {
      // 相对调替代：Imaj7 → vi7 等
      if (chord.quality === 'major7') {
        const relativeMinorRoot = (root + 9) % 12;
        subs.push(this.buildChord(relativeMinorRoot, 'minor7'));
      }
    }

    return subs;
  }

  /**
   * 计算两个和弦之间的共同音数量
   *
   * @param chordA - 和弦 A
   * @param chordB - 和弦 B
   * @returns 共同音数量（按 pitch class 计算）
   */
  public countCommonTones(chordA: Chord, chordB: Chord): number {
    const pcsA = new Set(chordA.tones.map((t) => getPitchClass(t.pitch)));
    const pcsB = new Set(chordB.tones.map((t) => getPitchClass(t.pitch)));
    let count = 0;
    for (const pc of pcsA) {
      if (pcsB.has(pc)) count++;
    }
    return count;
  }

  /**
   * 为四部和声进行进行整体优化
   *
   * 使用动态规划或贪婪算法，在多个可能的和弦连接中选择声部进行最平滑的方案。
   *
   * @param sopranoLine - 女高音旋律
   * @param possibleChords - 每个位置可能的和弦数组
   * @returns 优化后的和声进行
   */
  public optimizeChordProgression(
    sopranoLine: number[],
    possibleChords: Chord[][]
  ): FourPartVoicing[] {
    if (sopranoLine.length !== possibleChords.length) {
      throw new Error('旋律长度与和弦选项长度不匹配');
    }

    const result: FourPartVoicing[] = [];
    let previous: FourPartVoicing | null = null;

    for (let i = 0; i < sopranoLine.length; i++) {
      const options = possibleChords[i];
      let bestVoicing: FourPartVoicing | null = null;
      let bestScore = -Infinity;

      for (const chord of options) {
        const voicing = this.voiceChordSATB(chord, sopranoLine[i], previous);
        let score = voicing.voiceLeadingScore;

        if (previous) {
          const violations = this.checkVoiceLeading(previous, voicing);
          score -= violations.reduce((sum, v) => sum + v.severity, 0) * 2;
        }

        if (score > bestScore) {
          bestScore = score;
          bestVoicing = voicing;
        }
      }

      if (bestVoicing) {
        result.push(bestVoicing);
        previous = bestVoicing;
      }
    }

    return result;
  }

  /**
   * 获取最后一次的违规日志
   *
   * @returns 违规数组
   */
  public getViolationLog(): VoiceLeadingViolation[] {
    return [...this.violationLog];
  }

  // ==========================================================================
  // 静态工具方法
  // ==========================================================================

  /**
   * 计算两个 pitch class 之间的音程（半音数）
   *
   * @param pc1 - pitch class 1
   * @param pc2 - pitch class 2
   * @returns 最小半音距离 0-6
   */
  public static intervalDistance(pc1: number, pc2: number): number {
    const diff = Math.abs(pc1 - pc2) % 12;
    return Math.min(diff, 12 - diff);
  }

  /**
   * 判断音程性质
   *
   * @param semitones - 半音数
   * @returns 音程性质描述
   */
  public static intervalQuality(semitones: number): string {
    const normalized = ((semitones % 12) + 12) % 12;
    const map: Record<number, string> = {
      0: '纯一度/纯八度',
      1: '小二度',
      2: '大二度',
      3: '小三度',
      4: '大三度',
      5: '纯四度',
      6: '增四度/减五度（三全音）',
      7: '纯五度',
      8: '小六度',
      9: '大六度',
      10: '小七度',
      11: '大七度',
    };
    return map[normalized] || '未知音程';
  }

  /**
   * 从 MIDI 音高数组生成和弦标记猜测
   *
   * @param pitches - MIDI 音高数组
   * @returns 猜测的和弦标记
   */
  public static guessChordFromPitches(pitches: number[]): string {
    if (pitches.length < 3) return '未知';
    const uniquePcs = Array.from(new Set(pitches.map((p) => getPitchClass(p)))).sort((a, b) => a - b);

    // 尝试每个音作为根音
    for (const root of uniquePcs) {
      const intervals = uniquePcs.map((pc) => (pc - root + 12) % 12);
      for (const [quality, template] of Object.entries(CHORD_TEMPLATES)) {
        if (template.every((t) => intervals.includes(t))) {
          const rootName = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][root];
          const qualityMap: Record<string, string> = {
            major: '', minor: 'm', diminished: 'dim', augmented: 'aug',
            major7: 'maj7', minor7: 'm7', dominant7: '7',
            halfDiminished7: 'm7b5', fullyDiminished7: 'dim7',
          };
          return rootName + (qualityMap[quality] || quality);
        }
      }
    }

    return '未知和弦';
  }

  /**
   * 生成指定调性的 II-V-I 进行
   *
   * @param key - 调性
   * @returns II, V, I 三个和弦
   */
  public generateTwoFiveOne(key: string): Chord[] {
    const parsed = this.parseKey(key);
    const root = parsed.root;
    const mode = parsed.mode;
    const scale = mode === 'major' ? MAJOR_SCALE_SEMITONES : MINOR_SCALE_SEMITONES;

    const iiRoot = (root + scale[1]) % 12;
    const VRoot = (root + scale[4]) % 12;
    const IRoot = root;

    const iiQuality = mode === 'major' ? 'minor7' : 'halfDiminished7';
    const VQuality = mode === 'major' ? 'dominant7' : 'dominant7';
    const IQuality = mode === 'major' ? 'major7' : 'minor7';

    return [
      this.buildChord(iiRoot, iiQuality),
      this.buildChord(VRoot, VQuality),
      this.buildChord(IRoot, IQuality),
    ];
  }

  /**
   * 生成调内顺阶和弦进行
   *
   * @param key - 调性
   * @param useSeventh - 是否使用七和弦
   * @returns 顺阶和弦数组
   */
  public generateDiatonicChords(key: string, useSeventh = false): Chord[] {
    const parsed = this.parseKey(key);
    const root = parsed.root;
    const mode = parsed.mode;
    const scale = mode === 'major' ? MAJOR_SCALE_SEMITONES : MINOR_SCALE_SEMITONES;

    const chords: Chord[] = [];
    for (let degree = 0; degree < 7; degree++) {
      const chordRoot = (root + scale[degree]) % 12;
      let quality: ChordQuality;
      if (useSeventh) {
        quality = mode === 'major'
          ? (DIATONIC_MAJOR7_FUNCTIONS[degree] as ChordQuality)
          : (DIATONIC_MINOR_FUNCTIONS[degree] as ChordQuality) || 'minor';
      } else {
        quality = mode === 'major'
          ? (DIATONIC_MAJOR_FUNCTIONS[degree] as ChordQuality)
          : (DIATONIC_MINOR_FUNCTIONS[degree] as ChordQuality) || 'minor';
      }
      chords.push(this.buildChord(chordRoot, quality));
    }

    return chords;
  }
}

// =============================================================================
// 额外导出
// =============================================================================

/**
 * 便捷函数：快速构建和弦
 * @param symbol - 和弦标记
 * @returns 和弦对象
 */
export function quickChord(symbol: string): Chord {
  const engine = new HarmonyEngine();
  const chord = engine.parseChordSymbol(symbol);
  if (!chord) throw new Error(`无法解析和弦: ${symbol}`);
  return chord;
}

/**
 * 便捷函数：快速生成 II-V-I
 * @param key - 调性
 * @returns 和弦数组
 */
export function quickTwoFiveOne(key: string): Chord[] {
  const engine = new HarmonyEngine();
  return engine.generateTwoFiveOne(key);
}

export default HarmonyEngine;
