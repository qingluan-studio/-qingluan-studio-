/**
 * @fileoverview counterpointEngine.ts
 * 青鸾数字音频工作站 - 对位法引擎模块
 *
 * 本模块实现古典对位法（Species Counterpoint）的完整规则引擎，支持：
 * - 第一类对位（一音对一音）
 * - 第二类对位（二音对一音）
 * - 第三类对位（三音对一音）
 * - 第四类对位（切分音对位）
 * - 第五类对位（华丽对位 / 混合对位）
 *
 * 内置完整的对位法规则检查系统，涵盖平行五度、平行八度、反向五度、
 * 声部越界、三全音进行、大六度跳进到八度等禁例。
 *
 * @module composition/counterpointEngine
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
 * 对位法调式音阶半音结构（以 C 为 finalis）
 */
export const MODES: Record<string, number[]> = {
  dorian: [0, 2, 3, 5, 7, 9, 10],       // 多利亚
  phrygian: [0, 1, 3, 5, 7, 8, 10],     // 弗里几亚
  lydian: [0, 2, 4, 6, 7, 9, 11],       // 利底亚
  mixolydian: [0, 2, 4, 5, 7, 9, 10],   // 混合利底亚
  aeolian: [0, 2, 3, 5, 7, 8, 10],      // 爱奥利亚（自然小调）
  ionian: [0, 2, 4, 5, 7, 9, 11],       // 伊奥尼亚（自然大调）
  locrian: [0, 1, 3, 5, 6, 8, 10],      // 洛克里亚
};

/**
 * 对位法允许的音程（以 cantus firmus 音为基准）
 * 单位：半音数
 */
export const ALLOWED_INTERVALS = {
  // 完全协和音程
  perfect: [0, 7, 12],        // 同度/八度、纯五度、纯八度
  // 不完全协和音程
  imperfect: [3, 4, 8, 9],    // 小三度、大三度、小六度、大六度
  // 不协和音程
  dissonant: [1, 2, 6, 10, 11], // 小二度、大二度、三全音、小七度、大七度
};

/**
 * 各 species 的配置参数
 */
export const SPECIES_CONFIG = {
  first: { notesPerCF: 1, allowDissonance: false, allowSyncopation: false },
  second: { notesPerCF: 2, allowDissonance: true, allowSyncopation: false },
  third: { notesPerCF: 3, allowDissonance: true, allowSyncopation: false },
  fourth: { notesPerCF: 2, allowDissonance: true, allowSyncopation: true },
  fifth: { notesPerCF: 'mixed', allowDissonance: true, allowSyncopation: true },
};

// =============================================================================
// 类型定义
// =============================================================================

/**
 * 单一对位音符
 */
export interface CounterpointNote {
  /** MIDI 音高 */
  pitch: number;
  /** 起始时间（采样点） */
  onset: number;
  /** 持续时间（采样点） */
  duration: number;
  /** 相对于 cantus firmus 的音程 */
  interval: number;
  /** 音程分类 */
  intervalClass: 'perfect' | 'imperfect' | 'dissonant';
  /** 与前一音的关系 */
  motion: 'parallel' | 'similar' | 'contrary' | 'oblique' | 'static';
}

/**
 * 对位结果
 */
export interface CounterpointResult {
  /** 生成的对位旋律 */
  counterpoint: CounterpointNote[];
  /** 原始 cantus firmus */
  cantusFirmus: number[];
  /** 使用的调式 */
  mode: string;
  /** 规则违规记录 */
  violations: CounterpointViolation[];
  /** 整体评分 0-100 */
  score: number;
  /** 统计信息 */
  stats: CounterpointStats;
}

/**
 * 对位法违规记录
 */
export interface CounterpointViolation {
  /** 违规类型 */
  type: string;
  /** 描述 */
  description: string;
  /** 涉及的位置索引 */
  position: number;
  /** 严重程度 1-10 */
  severity: number;
}

/**
 * 对位统计信息
 */
export interface CounterpointStats {
  /** 总音符数 */
  totalNotes: number;
  /** 完全协和音程数量 */
  perfectIntervals: number;
  /** 不完全协和音程数量 */
  imperfectIntervals: number;
  /** 不协和音程数量 */
  dissonantIntervals: number;
  /** 跳进次数 */
  leaps: number;
  /** 级进次数 */
  steps: number;
  /** 同向进行次数 */
  similarMotions: number;
  /** 反向进行次数 */
  contraryMotions: number;
}

/**
 * 音程评估结果
 */
export interface IntervalEvaluation {
  /** 半音数 */
  semitones: number;
  /** 音程名称 */
  name: string;
  /** 协和度 */
  consonance: 'perfect' | 'imperfect' | 'dissonant';
  /** 是否允许使用 */
  allowed: boolean;
}

// =============================================================================
// CounterpointEngine 主类
// =============================================================================

/**
 * 对位法引擎
 *
 * `CounterpointEngine` 实现从严格第一类到华丽第五类的完整对位法写作与
 * 规则验证系统。它遵循 Fux《Gradus ad Parnassum》的对位法传统，
 * 支持多种教会调式，并提供详尽的规则检查与评分机制。
 *
 * @example
 * ```typescript
 * const cp = new CounterpointEngine();
 * const result = cp.firstSpecies([60, 62, 64, 65, 67, 65, 64, 62, 60], 'dorian');
 * console.log(result.score, result.violations);
 * ```
 */
export class CounterpointEngine {
  /**
   * 当前调式音阶
   * @private
   */
  private currentScale: number[];

  /**
   * 当前 finalis（调式主音）
   * @private
   */
  private finalis: number;

  /**
   * 违规日志
   * @private
   */
  private violationLog: CounterpointViolation[];

  /**
   * 构造对位法引擎
   */
  constructor() {
    this.currentScale = MODES.dorian;
    this.finalis = 60; // C4
    this.violationLog = [];
  }

  // ==========================================================================
  // 公共 API - 五类对位法
  // ==========================================================================

  /**
   * 第一类对位：一音对一音（Note against Note）
   *
   * 最严格的对位形式，对位声部的每个音符与 cantus firmus 的每个音符
   * 一一对应，时值完全相同。
   *
   * 规则要点：
   * - 只允许使用完全协和与不完全协和音程
   * - 禁止平行五度/八度
   * - 禁止反向五度（外声部反向进入五度）
   * - 起止音必须用完全协和音程（通常用同度或八度）
   * - 避免连续使用超过三个三度或六度
   *
   * @param cantusFirmus - 定旋律 MIDI 音高数组
   * @param mode - 教会调式名称，如 'dorian', 'phrygian', 'lydian', 'mixolydian', 'aeolian', 'ionian'
   * @returns 对位结果
   */
  public firstSpecies(cantusFirmus: number[], mode: string): CounterpointResult {
    this.setupMode(mode, cantusFirmus);
    this.violationLog = [];

    const counterpoint: CounterpointNote[] = [];
    const cfDuration = SAMPLE_RATE * 2; // 假设每个 CF 音持续 2 秒

    for (let i = 0; i < cantusFirmus.length; i++) {
      const cfPitch = cantusFirmus[i];
      const isFirst = i === 0;
      const isLast = i === cantusFirmus.length - 1;

      // 生成对位音候选
      const candidates = this.generateFirstSpeciesCandidates(cfPitch, isFirst, isLast);

      // 选择最符合规则的前一个连接
      let bestCandidate = candidates[0];
      let bestScore = -Infinity;

      for (const cand of candidates) {
        let score = this.evaluateCandidate(cand, counterpoint, i, 'first');
        if (score > bestScore) {
          bestScore = score;
          bestCandidate = cand;
        }
      }

      counterpoint.push({
        ...bestCandidate,
        onset: i * cfDuration,
        duration: cfDuration,
      });
    }

    // 后处理规则检查
    this.postCheckFirstSpecies(counterpoint, cantusFirmus);

    const stats = this.calculateStats(counterpoint);
    const score = this.calculateOverallScore(counterpoint, this.violationLog);

    return {
      counterpoint,
      cantusFirmus,
      mode,
      violations: [...this.violationLog],
      score,
      stats,
    };
  }

  /**
   * 第二类对位：二音对一音（Two Notes against One）
   *
   * 对位声部每两个音符对应 cantus firmus 的一个音符。
   * 强拍上的音必须与 CF 形成协和音程；弱拍上允许使用经过性的不协和音（如经过音）。
   *
   * 规则要点：
   * - 强拍：协和音程（完全或不完全）
   * - 弱拍：允许不协和音，但必须是级进进行（经过音、辅助音）
   * - 避免在强拍使用不协和音
   * - 第一个音和最后一个 CF 音对应的强拍音必须用协和音程
   *
   * @param cantusFirmus - 定旋律 MIDI 音高数组
   * @param mode - 教会调式
   * @returns 对位结果
   */
  public secondSpecies(cantusFirmus: number[], mode: string): CounterpointResult {
    this.setupMode(mode, cantusFirmus);
    this.violationLog = [];

    const counterpoint: CounterpointNote[] = [];
    const cfDuration = SAMPLE_RATE * 2;
    const halfDuration = Math.floor(cfDuration / 2);

    for (let i = 0; i < cantusFirmus.length; i++) {
      const cfPitch = cantusFirmus[i];
      const isFirst = i === 0;
      const isLast = i === cantusFirmus.length - 1;

      if (isLast) {
        // 最后一拍通常使用一个长音对应（第一类处理）
        const candidates = this.generateFirstSpeciesCandidates(cfPitch, false, true);
        const best = this.selectBestCandidate(candidates, counterpoint, i, 'second');
        counterpoint.push({
          ...best,
          onset: i * cfDuration,
          duration: cfDuration,
        });
      } else {
        // 强拍音符
        const strongCandidates = this.generateFirstSpeciesCandidates(cfPitch, isFirst, false);
        const strongBest = this.selectBestCandidate(strongCandidates, counterpoint, i * 2, 'second');
        counterpoint.push({
          ...strongBest,
          onset: i * cfDuration,
          duration: halfDuration,
        });

        // 弱拍音符：允许不协和，但必须级进连接
        const lastCpPitch = counterpoint[counterpoint.length - 1].pitch;
        const weakCandidates = this.generateWeakBeatPassingTones(lastCpPitch, cfPitch, halfDuration);
        const weakBest = this.selectBestCandidate(weakCandidates, counterpoint, i * 2 + 1, 'second');
        counterpoint.push({
          ...weakBest,
          onset: i * cfDuration + halfDuration,
          duration: halfDuration,
        });
      }
    }

    this.postCheckSecondSpecies(counterpoint, cantusFirmus);

    const stats = this.calculateStats(counterpoint);
    const score = this.calculateOverallScore(counterpoint, this.violationLog);

    return {
      counterpoint,
      cantusFirmus,
      mode,
      violations: [...this.violationLog],
      score,
      stats,
    };
  }

  /**
   * 第三类对位：三音对一音（Three Notes against One）
   *
   * 对位声部每三个音符对应 cantus firmus 的一个音符。
   * 除强拍外，其他两拍允许更丰富的节奏型和装饰性不协和音。
   *
   * 规则要点：
   * - 强拍：协和音程
   * - 第二、三拍：允许不协和音，但需满足级进解决条件
   * - 鼓励使用邻音、经过音、双邻音等装饰音型
   * - 避免连续使用相同节奏型导致的单调感
   *
   * @param cantusFirmus - 定旋律 MIDI 音高数组
   * @param mode - 教会调式
   * @returns 对位结果
   */
  public thirdSpecies(cantusFirmus: number[], mode: string): CounterpointResult {
    this.setupMode(mode, cantusFirmus);
    this.violationLog = [];

    const counterpoint: CounterpointNote[] = [];
    const cfDuration = SAMPLE_RATE * 2;
    const thirdDuration = Math.floor(cfDuration / 3);

    for (let i = 0; i < cantusFirmus.length; i++) {
      const cfPitch = cantusFirmus[i];
      const isFirst = i === 0;
      const isLast = i === cantusFirmus.length - 1;

      if (isLast) {
        // 结尾使用长音
        const candidates = this.generateFirstSpeciesCandidates(cfPitch, false, true);
        const best = this.selectBestCandidate(candidates, counterpoint, i, 'third');
        counterpoint.push({
          ...best,
          onset: i * cfDuration,
          duration: cfDuration,
        });
      } else {
        // 三拍分解
        const beat1Candidates = this.generateFirstSpeciesCandidates(cfPitch, isFirst, false);
        const beat1 = this.selectBestCandidate(beat1Candidates, counterpoint, i * 3, 'third');
        counterpoint.push({
          ...beat1,
          onset: i * cfDuration,
          duration: thirdDuration,
        });

        const beat2Candidates = this.generatePassingOrNeighborTones(
          counterpoint[counterpoint.length - 1].pitch,
          cfPitch,
          'weak'
        );
        const beat2 = this.selectBestCandidate(beat2Candidates, counterpoint, i * 3 + 1, 'third');
        counterpoint.push({
          ...beat2,
          onset: i * cfDuration + thirdDuration,
          duration: thirdDuration,
        });

        const beat3Candidates = this.generatePassingOrNeighborTones(
          counterpoint[counterpoint.length - 1].pitch,
          cfPitch,
          'weak'
        );
        const beat3 = this.selectBestCandidate(beat3Candidates, counterpoint, i * 3 + 2, 'third');
        counterpoint.push({
          ...beat3,
          onset: i * cfDuration + thirdDuration * 2,
          duration: thirdDuration,
        });
      }
    }

    this.postCheckThirdSpecies(counterpoint, cantusFirmus);

    const stats = this.calculateStats(counterpoint);
    const score = this.calculateOverallScore(counterpoint, this.violationLog);

    return {
      counterpoint,
      cantusFirmus,
      mode,
      violations: [...this.violationLog],
      score,
      stats,
    };
  }

  /**
   * 第四类对位：切分音对位（Syncopation / Ligature）
   *
   * 对位声部使用切分节奏，不协和音出现在强拍，但在弱拍准备，
   * 强拍上出现（悬浮），然后在下一个弱拍解决。
   *
   * 规则要点：
   * - 不协和音在弱拍准备（与 CF 协和）
   * - 不协和音在强拍悬浮（与 CF 不协和）
   * - 不协和音在下一个弱拍级进解决（通常下行）
   * - 第一个音和最后一个音仍用协和音程
   *
   * @param cantusFirmus - 定旋律 MIDI 音高数组
   * @param mode - 教会调式
   * @returns 对位结果
   */
  public fourthSpecies(cantusFirmus: number[], mode: string): CounterpointResult {
    this.setupMode(mode, cantusFirmus);
    this.violationLog = [];

    const counterpoint: CounterpointNote[] = [];
    const cfDuration = SAMPLE_RATE * 2;
    const halfDuration = Math.floor(cfDuration / 2);

    for (let i = 0; i < cantusFirmus.length; i++) {
      const cfPitch = cantusFirmus[i];
      const isFirst = i === 0;
      const isLast = i === cantusFirmus.length - 1;

      if (isFirst || isLast) {
        // 首尾使用协和音程，可简化处理为第一类
        const candidates = this.generateFirstSpeciesCandidates(cfPitch, isFirst, isLast);
        const best = this.selectBestCandidate(candidates, counterpoint, i, 'fourth');
        counterpoint.push({
          ...best,
          onset: i * cfDuration,
          duration: isLast ? cfDuration : halfDuration,
        });
        if (isFirst) {
          // 第一个弱拍也需要一个音符以开始切分
          const nextCfPitch = cantusFirmus[i + 1] || cfPitch;
          const suspensionCandidates = this.generateSuspensionResolution(
            best.pitch,
            cfPitch,
            nextCfPitch,
            true
          );
          const suspBest = this.selectBestCandidate(suspensionCandidates, counterpoint, i + 1, 'fourth');
          counterpoint.push({
            ...suspBest,
            onset: i * cfDuration + halfDuration,
            duration: halfDuration,
          });
        }
      } else {
        // 弱拍准备音（协和）
        const prepareCandidates = this.generateFirstSpeciesCandidates(cfPitch, false, false);
        const prepare = this.selectBestCandidate(prepareCandidates, counterpoint, i * 2, 'fourth');
        counterpoint.push({
          ...prepare,
          onset: i * cfDuration,
          duration: halfDuration,
        });

        // 强拍悬浮音（不协和）—— 与下一个 CF 音形成不协和
        const nextCfPitch = cantusFirmus[i + 1] || cfPitch;
        const suspensionPitch = prepare.pitch; // 保持同一音
        const susInterval = Math.abs(suspensionPitch - nextCfPitch) % 12;
        const isDissonant = ALLOWED_INTERVALS.dissonant.includes(susInterval);

        counterpoint.push({
          pitch: suspensionPitch,
          interval: susInterval,
          intervalClass: isDissonant ? 'dissonant' : 'perfect',
          motion: 'static',
          onset: i * cfDuration + halfDuration,
          duration: halfDuration,
        });

        // 检查悬浮-解决连接（下一个弱拍由下一个循环处理，这里记录违规）
        if (!isDissonant) {
          this.violationLog.push({
            type: '悬浮音不协和度不足',
            description: `位置 ${i} 的悬浮音 ${suspensionPitch} 与 CF ${nextCfPitch} 形成协和音程 ${susInterval}`,
            position: i,
            severity: 4,
          });
        }
      }
    }

    this.postCheckFourthSpecies(counterpoint, cantusFirmus);

    const stats = this.calculateStats(counterpoint);
    const score = this.calculateOverallScore(counterpoint, this.violationLog);

    return {
      counterpoint,
      cantusFirmus,
      mode,
      violations: [...this.violationLog],
      score,
      stats,
    };
  }

  /**
   * 第五类对位：华丽对位（Florid Counterpoint / Mixed Species）
   *
   * 综合前四类的所有技术，在对位声部中使用混合节奏型，
   * 包括全音符、二分音符、四分音符、八分音符等，形成灵活华丽的对位线条。
   *
   * 规则要点：
   * - 强拍原则上使用协和音程
   * - 不协和音必须有合理的准备与解决
   * - 节奏型需多样化，避免机械重复
   * - 保持对位声部自身的旋律性（起伏、高潮、终止感）
   *
   * @param cantusFirmus - 定旋律 MIDI 音高数组
   * @param mode - 教会调式
   * @returns 对位结果
   */
  public fifthSpecies(cantusFirmus: number[], mode: string): CounterpointResult {
    this.setupMode(mode, cantusFirmus);
    this.violationLog = [];

    const counterpoint: CounterpointNote[] = [];
    const cfDuration = SAMPLE_RATE * 2;

    for (let i = 0; i < cantusFirmus.length; i++) {
      const cfPitch = cantusFirmus[i];
      const isFirst = i === 0;
      const isLast = i === cantusFirmus.length - 1;
      const isPenultimate = i === cantusFirmus.length - 2;

      if (isFirst) {
        // 开头：用协和音程
        const candidates = this.generateFirstSpeciesCandidates(cfPitch, true, false);
        const best = this.selectBestCandidate(candidates, counterpoint, i, 'fifth');
        counterpoint.push({
          ...best,
          onset: i * cfDuration,
          duration: cfDuration,
        });
      } else if (isPenultimate) {
        // 倒数第二拍：导音-主音准备
        const penultimateCandidates = this.generatePenultimateCandidates(cfPitch, mode);
        const best = this.selectBestCandidate(penultimateCandidates, counterpoint, i, 'fifth');
        counterpoint.push({
          ...best,
          onset: i * cfDuration,
          duration: Math.floor(cfDuration / 2),
        });
        // 导音解决到主音
        const resolutionPitch = this.getLeadingToneResolution(best.pitch, mode);
        counterpoint.push({
          pitch: resolutionPitch,
          interval: Math.abs(resolutionPitch - cantusFirmus[i + 1]) % 12,
          intervalClass: 'perfect',
          motion: 'oblique',
          onset: i * cfDuration + Math.floor(cfDuration / 2),
          duration: Math.floor(cfDuration / 2),
        });
      } else if (isLast) {
        // 结尾：完全协和
        const candidates = this.generateFirstSpeciesCandidates(cfPitch, false, true);
        const best = this.selectBestCandidate(candidates, counterpoint, i, 'fifth');
        counterpoint.push({
          ...best,
          onset: i * cfDuration,
          duration: cfDuration,
        });
      } else {
        // 中间：混合节奏型
        const pattern = this.selectMixedRhythmPattern(i, cantusFirmus.length);
        let currentTime = i * cfDuration;
        let lastPitch = counterpoint.length > 0 ? counterpoint[counterpoint.length - 1].pitch : cfPitch + 4;

        for (const duration of pattern) {
          const isStrong = currentTime % cfDuration === 0;
          let candidates: CounterpointNote[];

          if (isStrong) {
            candidates = this.generateFirstSpeciesCandidates(cfPitch, false, false);
          } else {
            candidates = this.generatePassingOrNeighborTones(lastPitch, cfPitch, 'weak');
          }

          const best = this.selectBestCandidate(candidates, counterpoint, Math.floor(currentTime / (cfDuration / 4)), 'fifth');
          counterpoint.push({
            ...best,
            onset: currentTime,
            duration,
          });

          lastPitch = best.pitch;
          currentTime += duration;
        }
      }
    }

    this.postCheckFifthSpecies(counterpoint, cantusFirmus);

    const stats = this.calculateStats(counterpoint);
    const score = this.calculateOverallScore(counterpoint, this.violationLog);

    return {
      counterpoint,
      cantusFirmus,
      mode,
      violations: [...this.violationLog],
      score,
      stats,
    };
  }

  // ==========================================================================
  // 候选音生成
  // ==========================================================================

  /**
   * 生成第一类对位的候选音
   *
   * @param cfPitch - cantus firmus 音高
   * @param isFirst - 是否第一个音
   * @param isLast - 是否最后一个音
   * @returns 候选音数组
   * @private
   */
  private generateFirstSpeciesCandidates(
    cfPitch: number,
    isFirst: boolean,
    isLast: boolean
  ): CounterpointNote[] {
    const candidates: CounterpointNote[] = [];
    const cfOctave = getOctave(cfPitch);

    // 在 CF 上下方各一个八度内生成候选
    for (let octaveOffset = -1; octaveOffset <= 1; octaveOffset++) {
      for (const scaleDegree of this.currentScale) {
        const candidatePitch = this.finalis + scaleDegree + (cfOctave + octaveOffset) * 12;
        if (candidatePitch < 40 || candidatePitch > 90) continue;

        const interval = Math.abs(candidatePitch - cfPitch) % 12;
        const intervalClass = this.classifyInterval(interval);

        // 第一类只接受协和音程
        if (intervalClass === 'dissonant') continue;

        // 首尾必须完全协和（同度/八度/五度）
        if ((isFirst || isLast) && intervalClass !== 'perfect') continue;

        // 避免超出一个八度加六度以上的音程（声部距离过宽）
        const absoluteInterval = Math.abs(candidatePitch - cfPitch);
        if (absoluteInterval > 18) continue;

        candidates.push({
          pitch: candidatePitch,
          interval,
          intervalClass,
          motion: 'static',
          onset: 0,
          duration: 0,
        });
      }
    }

    // 去重
    const uniqueMap = new Map<number, CounterpointNote>();
    for (const c of candidates) {
      if (!uniqueMap.has(c.pitch)) uniqueMap.set(c.pitch, c);
    }

    return Array.from(uniqueMap.values());
  }

  /**
   * 生成弱拍经过音候选
   *
   * @param lastPitch - 前一个对位音
   * @param cfPitch - 当前 CF 音
   * @param duration - 音符时值
   * @returns 候选音数组
   * @private
   */
  private generateWeakBeatPassingTones(
    lastPitch: number,
    cfPitch: number,
    duration: number
  ): CounterpointNote[] {
    const candidates: CounterpointNote[] = [];

    // 级进上行或下行
    for (const direction of [-1, 1]) {
      const passingPitch = lastPitch + direction;
      const interval = Math.abs(passingPitch - cfPitch) % 12;
      const intervalClass = this.classifyInterval(interval);

      candidates.push({
        pitch: passingPitch,
        interval,
        intervalClass,
        motion: 'similar',
        onset: 0,
        duration,
      });
    }

    // 也允许返回同一音（辅助音）
    const interval = Math.abs(lastPitch - cfPitch) % 12;
    candidates.push({
      pitch: lastPitch,
      interval,
      intervalClass: this.classifyInterval(interval),
      motion: 'oblique',
      onset: 0,
      duration,
    });

    return candidates;
  }

  /**
   * 生成经过音或邻音候选
   *
   * @param lastPitch - 前一个音
   * @param cfPitch - CF 音
   * @param beatStrength - 拍子强度
   * @returns 候选音数组
   * @private
   */
  private generatePassingOrNeighborTones(
    lastPitch: number,
    cfPitch: number,
    beatStrength: 'strong' | 'weak'
  ): CounterpointNote[] {
    const candidates: CounterpointNote[] = [];

    // 级进上行/下行
    for (const step of [-2, -1, 1, 2]) {
      const pitch = lastPitch + step;
      const interval = Math.abs(pitch - cfPitch) % 12;
      const intervalClass = this.classifyInterval(interval);

      // 强拍避免不协和
      if (beatStrength === 'strong' && intervalClass === 'dissonant') continue;

      candidates.push({
        pitch,
        interval,
        intervalClass,
        motion: step > 0 ? 'similar' : 'contrary',
        onset: 0,
        duration: 0,
      });
    }

    // 邻音（返回原音的邻音）
    for (const step of [-1, 1]) {
      const neighbor = lastPitch + step;
      const backToOrigin = lastPitch;
      const interval1 = Math.abs(neighbor - cfPitch) % 12;
      const interval2 = Math.abs(backToOrigin - cfPitch) % 12;

      candidates.push({
        pitch: neighbor,
        interval: interval1,
        intervalClass: this.classifyInterval(interval1),
        motion: 'oblique',
        onset: 0,
        duration: 0,
      });
    }

    return candidates;
  }

  /**
   * 生成悬浮-解决候选
   *
   * @param preparePitch - 准备音
   * @param cfPitch - CF 音
   * @param nextCfPitch - 下一个 CF 音
   * @param isFirst - 是否第一个音
   * @returns 候选音数组
   * @private
   */
  private generateSuspensionResolution(
    preparePitch: number,
    cfPitch: number,
    nextCfPitch: number,
    isFirst: boolean
  ): CounterpointNote[] {
    const candidates: CounterpointNote[] = [];

    // 下行级进解决是标准方式
    const resolutionPitch = preparePitch - 1;
    const interval = Math.abs(resolutionPitch - nextCfPitch) % 12;

    candidates.push({
      pitch: resolutionPitch,
      interval,
      intervalClass: this.classifyInterval(interval),
      motion: 'contrary',
      onset: 0,
      duration: 0,
    });

    // 上行解决（较少见，但允许在特定情况）
    const upResolution = preparePitch + 1;
    const upInterval = Math.abs(upResolution - nextCfPitch) % 12;
    candidates.push({
      pitch: upResolution,
      interval: upInterval,
      intervalClass: this.classifyInterval(upInterval),
      motion: 'similar',
      onset: 0,
      duration: 0,
    });

    return candidates;
  }

  /**
   * 生成倒数第二音候选（导音准备）
   *
   * @param cfPitch - CF 音
   * @param mode - 调式
   * @returns 候选音数组
   * @private
   */
  private generatePenultimateCandidates(cfPitch: number, mode: string): CounterpointNote[] {
    const candidates: CounterpointNote[] = [];

    // 导音通常位于主音下方小二度或大二度
    const leadingTone = this.finalis - 1;
    const supertonic = this.finalis + 2;

    for (const pitch of [leadingTone, supertonic]) {
      const interval = Math.abs(pitch - cfPitch) % 12;
      candidates.push({
        pitch,
        interval,
        intervalClass: this.classifyInterval(interval),
        motion: 'similar',
        onset: 0,
        duration: 0,
      });
    }

    return candidates;
  }

  /**
   * 导音解决到主音
   *
   * @param leadingTone - 导音
   * @param mode - 调式
   * @returns 主音
   * @private
   */
  private getLeadingToneResolution(leadingTone: number, mode: string): number {
    // 通常导音上行级进到主音
    if (Math.abs((leadingTone + 1) % 12 - this.finalis % 12) <= 1) {
      return leadingTone + 1;
    }
    return this.finalis;
  }

  // ==========================================================================
  // 候选评估与选择
  // ==========================================================================

  /**
   * 从候选中选择最佳音
   *
   * @param candidates - 候选数组
   * @param counterpointSoFar - 已生成的对位音
   * @param position - 当前位置
   * @param species - 对位类别
   * @returns 最佳候选
   * @private
   */
  private selectBestCandidate(
    candidates: CounterpointNote[],
    counterpointSoFar: CounterpointNote[],
    position: number,
    species: string
  ): CounterpointNote {
    let best = candidates[0];
    let bestScore = -Infinity;

    for (const cand of candidates) {
      const score = this.evaluateCandidate(cand, counterpointSoFar, position, species);
      if (score > bestScore) {
        bestScore = score;
        best = cand;
      }
    }

    return best;
  }

  /**
   * 评估单个候选音的质量
   *
   * @param candidate - 候选音
   * @param counterpointSoFar - 已生成的对位音
   * @param position - 位置
   * @param species - 对位类别
   * @returns 评分
   * @private
   */
  private evaluateCandidate(
    candidate: CounterpointNote,
    counterpointSoFar: CounterpointNote[],
    position: number,
    species: string
  ): number {
    let score = 50;

    // 协和度奖励
    if (candidate.intervalClass === 'perfect') score += 15;
    else if (candidate.intervalClass === 'imperfect') score += 20;
    else score -= 10;

    // 旋律性：偏好级进
    if (counterpointSoFar.length > 0) {
      const lastPitch = counterpointSoFar[counterpointSoFar.length - 1].pitch;
      const melodicInterval = Math.abs(candidate.pitch - lastPitch);
      if (melodicInterval <= 2) score += 10; // 级进
      else if (melodicInterval <= 4) score += 5; // 三度
      else if (melodicInterval <= 7) score += 2; // 五度内
      else if (melodicInterval <= 12) score -= 5; // 八度内大跳
      else score -= 15; // 超过八度大跳（不推荐）

      // 避免同音反复过多
      if (melodicInterval === 0) score -= 5;
    }

    // 与倒数第二个音的旋律方向变化奖励（避免单调）
    if (counterpointSoFar.length >= 2) {
      const prev1 = counterpointSoFar[counterpointSoFar.length - 1].pitch;
      const prev2 = counterpointSoFar[counterpointSoFar.length - 2].pitch;
      const dir1 = Math.sign(prev1 - prev2);
      const dir2 = Math.sign(candidate.pitch - prev1);
      if (dir1 !== 0 && dir2 !== 0 && dir1 !== dir2) {
        score += 8; // 方向变化奖励
      }
    }

    return score;
  }

  // ==========================================================================
  // 后处理规则检查
  // ==========================================================================

  /**
   * 第一类对位后处理检查
   *
   * @param counterpoint - 对位旋律
   * @param cantusFirmus - 定旋律
   * @private
   */
  private postCheckFirstSpecies(counterpoint: CounterpointNote[], cantusFirmus: number[]): void {
    for (let i = 1; i < counterpoint.length; i++) {
      const prevCp = counterpoint[i - 1];
      const currCp = counterpoint[i];
      const prevCf = cantusFirmus[i - 1];
      const currCf = cantusFirmus[i];

      // 平行五度
      const prevInterval = Math.abs(prevCp.pitch - prevCf) % 12;
      const currInterval = Math.abs(currCp.pitch - currCf) % 12;
      if (prevInterval === 7 && currInterval === 7) {
        this.violationLog.push({
          type: '平行五度',
          description: `位置 ${i - 1} 到 ${i} 对位与 CF 之间出现平行纯五度`,
          position: i,
          severity: 10,
        });
      }

      // 平行八度
      if (prevInterval === 0 && currInterval === 0) {
        this.violationLog.push({
          type: '平行八度',
          description: `位置 ${i - 1} 到 ${i} 对位与 CF 之间出现平行八度`,
          position: i,
          severity: 10,
        });
      }

      // 反向五度（外声部反向进入五度）
      const cpDir = Math.sign(currCp.pitch - prevCp.pitch);
      const cfDir = Math.sign(currCf - prevCf);
      if (cpDir !== 0 && cfDir !== 0 && cpDir !== cfDir && currInterval === 7) {
        this.violationLog.push({
          type: '反向五度',
          description: `位置 ${i} 对位与 CF 反向进入纯五度`,
          position: i,
          severity: 7,
        });
      }

      // 大六度跳进到八度（外声部同向，soprano 跳进）
      if (prevInterval === 9 && currInterval === 0 && cpDir === cfDir && cpDir !== 0) {
        this.violationLog.push({
          type: '大六度跳进到八度',
          description: `位置 ${i} 大六度同向跳进到八度`,
          position: i,
          severity: 8,
        });
      }

      // 三全音进行（旋律中避免增四度/减五度跳进）
      const melodicInt = Math.abs(currCp.pitch - prevCp.pitch) % 12;
      if (melodicInt === 6) {
        this.violationLog.push({
          type: '三全音跳进',
          description: `位置 ${i} 对位声部出现三全音旋律跳进`,
          position: i,
          severity: 6,
        });
      }

      // 声部越界（对位不应低于 CF 太多，除非是低音对位）
      const verticalDistance = Math.abs(currCp.pitch - currCf);
      if (verticalDistance > 16) {
        this.violationLog.push({
          type: '声部距离过宽',
          description: `位置 ${i} 对位与 CF 距离 ${verticalDistance} 半音，超过十二度`,
          position: i,
          severity: 4,
        });
      }
    }

    // 检查连续三度/六度不超过三个
    let consecutiveImperfect = 0;
    for (let i = 0; i < counterpoint.length; i++) {
      const interval = counterpoint[i].intervalClass;
      if (interval === 'imperfect') {
        consecutiveImperfect++;
        if (consecutiveImperfect > 3) {
          this.violationLog.push({
            type: '连续三度/六度过多',
            description: `位置 ${i} 连续出现超过三个三度或六度`,
            position: i,
            severity: 5,
          });
        }
      } else {
        consecutiveImperfect = 0;
      }
    }
  }

  /**
   * 第二类对位后处理检查
   *
   * @param counterpoint - 对位旋律
   * @param cantusFirmus - 定旋律
   * @private
   */
  private postCheckSecondSpecies(counterpoint: CounterpointNote[], cantusFirmus: number[]): void {
    // 继承第一类的基础检查（仅检查强拍位置）
    const strongBeatIndices: number[] = [];
    for (let i = 0; i < counterpoint.length; i += 2) {
      strongBeatIndices.push(i);
    }

    for (let idx = 1; idx < strongBeatIndices.length; idx++) {
      const i = strongBeatIndices[idx];
      const prevI = strongBeatIndices[idx - 1];
      const cp = counterpoint[i];
      const prevCp = counterpoint[prevI];
      const cfIndex = Math.floor(i / 2);
      const prevCfIndex = Math.floor(prevI / 2);
      const cf = cantusFirmus[cfIndex];
      const prevCf = cantusFirmus[prevCfIndex];

      const prevInterval = Math.abs(prevCp.pitch - prevCf) % 12;
      const currInterval = Math.abs(cp.pitch - cf) % 12;

      if (prevInterval === 7 && currInterval === 7) {
        this.violationLog.push({
          type: '平行五度',
          description: `强拍位置 ${prevCfIndex} 到 ${cfIndex} 出现平行五度`,
          position: cfIndex,
          severity: 10,
        });
      }
      if (prevInterval === 0 && currInterval === 0) {
        this.violationLog.push({
          type: '平行八度',
          description: `强拍位置 ${prevCfIndex} 到 ${cfIndex} 出现平行八度`,
          position: cfIndex,
          severity: 10,
        });
      }
    }

    // 弱拍不协和音检查：必须级进解决
    for (let i = 1; i < counterpoint.length; i += 2) {
      const weakBeat = counterpoint[i];
      const nextStrong = counterpoint[i + 1];
      if (weakBeat.intervalClass === 'dissonant' && nextStrong) {
        const resolutionStep = Math.abs(nextStrong.pitch - weakBeat.pitch);
        if (resolutionStep > 2) {
          this.violationLog.push({
            type: '不协和音解决不当',
            description: `弱拍不协和音未级进解决，跳进 ${resolutionStep} 半音`,
            position: Math.floor(i / 2),
            severity: 8,
          });
        }
      }
    }
  }

  /**
   * 第三类对位后处理检查
   *
   * @param counterpoint - 对位旋律
   * @param cantusFirmus - 定旋律
   * @private
   */
  private postCheckThirdSpecies(counterpoint: CounterpointNote[], cantusFirmus: number[]): void {
    // 类似第二类，但检查每组的第一个音（强拍）
    for (let i = 3; i < counterpoint.length; i += 3) {
      const cp = counterpoint[i];
      const prevCp = counterpoint[i - 3];
      const cfIndex = Math.floor(i / 3);
      const prevCfIndex = cfIndex - 1;
      if (prevCfIndex < 0) continue;

      const cf = cantusFirmus[cfIndex];
      const prevCf = cantusFirmus[prevCfIndex];
      const prevInterval = Math.abs(prevCp.pitch - prevCf) % 12;
      const currInterval = Math.abs(cp.pitch - cf) % 12;

      if (prevInterval === 7 && currInterval === 7) {
        this.violationLog.push({
          type: '平行五度',
          description: `强拍位置 ${prevCfIndex} 到 ${cfIndex} 出现平行五度`,
          position: cfIndex,
          severity: 10,
        });
      }
      if (prevInterval === 0 && currInterval === 0) {
        this.violationLog.push({
          type: '平行八度',
          description: `强拍位置 ${prevCfIndex} 到 ${cfIndex} 出现平行八度`,
          position: cfIndex,
          severity: 10,
        });
      }
    }

    // 检查四音音型中是否出现琶音式三和弦（三个组成音级进）
    for (let i = 0; i < counterpoint.length - 3; i++) {
      const p1 = counterpoint[i].pitch;
      const p2 = counterpoint[i + 1].pitch;
      const p3 = counterpoint[i + 2].pitch;
      const p4 = counterpoint[i + 3].pitch;
      if (Math.abs(p2 - p1) <= 2 && Math.abs(p3 - p2) <= 2 && Math.abs(p4 - p3) <= 2) {
        // 四个连续级进音，检查是否构成三和弦琶音
        const pcs = [p1, p2, p3, p4].map((p) => getPitchClass(p));
        const uniquePcs = Array.from(new Set(pcs));
        if (uniquePcs.length === 3) {
          // 可能是三和弦琶音，这是允许的
        }
      }
    }
  }

  /**
   * 第四类对位后处理检查
   *
   * @param counterpoint - 对位旋律
   * @param cantusFirmus - 定旋律
   * @private
   */
  private postCheckFourthSpecies(counterpoint: CounterpointNote[], cantusFirmus: number[]): void {
    for (let i = 2; i < counterpoint.length - 1; i += 2) {
      const suspension = counterpoint[i];
      const resolution = counterpoint[i + 1];
      if (!resolution) continue;

      // 悬浮音必须下行级进解决
      const resolutionStep = suspension.pitch - resolution.pitch;
      if (resolutionStep !== 1) {
        this.violationLog.push({
          type: '悬浮音解决不当',
          description: `悬浮音应下行级进解决，实际解决距离 ${resolutionStep} 半音`,
          position: Math.floor(i / 2),
          severity: 9,
        });
      }

      // 解决音必须与 CF 协和
      const cfIndex = Math.floor((i + 1) / 2);
      const cfPitch = cantusFirmus[cfIndex];
      const resInterval = Math.abs(resolution.pitch - cfPitch) % 12;
      if (this.classifyInterval(resInterval) === 'dissonant') {
        this.violationLog.push({
          type: '解决音不协和',
          description: `悬浮音解决后的音与 CF 不协和`,
          position: cfIndex,
          severity: 8,
        });
      }
    }
  }

  /**
   * 第五类对位后处理检查
   *
   * @param counterpoint - 对位旋律
   * @param cantusFirmus - 定旋律
   * @private
   */
  private postCheckFifthSpecies(counterpoint: CounterpointNote[], cantusFirmus: number[]): void {
    // 综合检查：强拍协和、不协和音有准备和解决
    const cfDuration = SAMPLE_RATE * 2;

    for (let i = 0; i < counterpoint.length; i++) {
      const cp = counterpoint[i];
      const cfIndex = Math.floor(cp.onset / cfDuration);
      const cfPitch = cantusFirmus[Math.min(cfIndex, cantusFirmus.length - 1)];
      const isStrongBeat = cp.onset % cfDuration === 0;

      if (isStrongBeat && cp.intervalClass === 'dissonant') {
        // 强拍不协和需要是第四类的悬浮音
        if (i > 0 && counterpoint[i - 1].pitch === cp.pitch) {
          // 可能是悬浮，检查解决
          if (i + 1 < counterpoint.length && counterpoint[i + 1].pitch >= cp.pitch) {
            this.violationLog.push({
              type: '强拍不协和未解决',
              description: `强拍悬浮音 ${cp.pitch} 未下行解决`,
              position: cfIndex,
              severity: 8,
            });
          }
        } else {
          this.violationLog.push({
            type: '强拍不协和',
            description: `强拍位置出现未准备的不协和音`,
            position: cfIndex,
            severity: 9,
          });
        }
      }
    }

    // 检查旋律的节奏型多样性
    const durations = counterpoint.map((n) => n.duration);
    const uniqueDurations = new Set(durations).size;
    if (uniqueDurations < 2) {
      this.violationLog.push({
        type: '节奏单调',
        description: '第五类对位应使用混合节奏型',
        position: 0,
        severity: 3,
      });
    }
  }

  // ==========================================================================
  // 辅助方法
  // ==========================================================================

  /**
   * 设置当前调式
   *
   * @param mode - 调式名称
   * @param cantusFirmus - 定旋律（用于推断 finalis）
   * @private
   */
  private setupMode(mode: string, cantusFirmus: number[]): void {
    this.currentScale = MODES[mode] || MODES.dorian;
    // 推断 finalis：通常使用 CF 的最后一个音或最低音
    const lastNote = cantusFirmus[cantusFirmus.length - 1];
    this.finalis = lastNote;
  }

  /**
   * 音程分类
   *
   * @param semitones - 半音数（取模 12）
   * @returns 协和度分类
   * @private
   */
  private classifyInterval(semitones: number): 'perfect' | 'imperfect' | 'dissonant' {
    const normalized = ((semitones % 12) + 12) % 12;
    if (ALLOWED_INTERVALS.perfect.includes(normalized)) return 'perfect';
    if (ALLOWED_INTERVALS.imperfect.includes(normalized)) return 'imperfect';
    return 'dissonant';
  }

  /**
   * 选择混合节奏型
   *
   * @param index - CF 位置索引
   * @param totalLength - CF 总长度
   * @returns 节奏型数组（每个值为采样点数）
   * @private
   */
  private selectMixedRhythmPattern(index: number, totalLength: number): number[] {
    const cfDuration = SAMPLE_RATE * 2;
    const patterns: number[][] = [
      [cfDuration], // 全音符
      [Math.floor(cfDuration / 2), Math.floor(cfDuration / 2)], // 两个二分音符
      [Math.floor(cfDuration / 2), Math.floor(cfDuration / 4), Math.floor(cfDuration / 4)], // 二分 + 两个四分
      [Math.floor(cfDuration / 4), Math.floor(cfDuration / 4), Math.floor(cfDuration / 2)], // 两个四分 + 二分
      [Math.floor(cfDuration / 4), Math.floor(cfDuration / 2), Math.floor(cfDuration / 4)], // 四分 + 二分 + 四分
      [Math.floor(cfDuration / 4), Math.floor(cfDuration / 4), Math.floor(cfDuration / 4), Math.floor(cfDuration / 4)], // 四个四分
    ];

    // 根据位置选择不同节奏型，避免单调
    const patternIndex = index % patterns.length;
    return patterns[patternIndex];
  }

  /**
   * 计算对位统计信息
   *
   * @param counterpoint - 对位旋律
   * @returns 统计对象
   * @private
   */
  private calculateStats(counterpoint: CounterpointNote[]): CounterpointStats {
    let perfect = 0;
    let imperfect = 0;
    let dissonant = 0;
    let leaps = 0;
    let steps = 0;
    let similar = 0;
    let contrary = 0;

    for (let i = 0; i < counterpoint.length; i++) {
      const note = counterpoint[i];
      if (note.intervalClass === 'perfect') perfect++;
      else if (note.intervalClass === 'imperfect') imperfect++;
      else dissonant++;

      if (i > 0) {
        const melodicInt = Math.abs(note.pitch - counterpoint[i - 1].pitch);
        if (melodicInt <= 2) steps++;
        else leaps++;
      }

      if (note.motion === 'similar') similar++;
      if (note.motion === 'contrary') contrary++;
    }

    return {
      totalNotes: counterpoint.length,
      perfectIntervals: perfect,
      imperfectIntervals: imperfect,
      dissonantIntervals: dissonant,
      leaps,
      steps,
      similarMotions: similar,
      contraryMotions: contrary,
    };
  }

  /**
   * 计算整体评分
   *
   * @param counterpoint - 对位旋律
   * @param violations - 违规记录
   * @returns 分数 0-100
   * @private
   */
  private calculateOverallScore(
    counterpoint: CounterpointNote[],
    violations: CounterpointViolation[]
  ): number {
    let score = 100;

    // 按严重程度扣分
    for (const v of violations) {
      score -= v.severity * 1.5;
    }

    // 旋律性奖励
    const stats = this.calculateStats(counterpoint);
    if (stats.steps > stats.leaps) score += 5;
    if (stats.contraryMotions > stats.similarMotions) score += 5;

    return Math.max(0, Math.min(100, score));
  }

  // ==========================================================================
  // 音程评估公共方法
  // ==========================================================================

  /**
   * 评估两个音之间的音程
   *
   * @param pitchA - 音 A
   * @param pitchB - 音 B
   * @returns 音程评估结果
   */
  public evaluateInterval(pitchA: number, pitchB: number): IntervalEvaluation {
    const semitones = Math.abs(pitchA - pitchB) % 12;
    const name = CounterpointEngine.intervalName(semitones);
    const consonance = this.classifyInterval(semitones);

    // 是否允许：第一、二类严格对位中不协和不允许
    const allowed = consonance !== 'dissonant';

    return {
      semitones,
      name,
      consonance,
      allowed,
    };
  }

  /**
   * 获取音程名称
   *
   * @param semitones - 半音数
   * @returns 音程名称
   */
  public static intervalName(semitones: number): string {
    const names: Record<number, string> = {
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
    return names[((semitones % 12) + 12) % 12] || '未知音程';
  }

  /**
   * 检查一段旋律是否包含违规进行
   *
   * @param melody - 旋律 MIDI 数组
   * @returns 违规数组
   */
  public checkMelodyForViolations(melody: number[]): CounterpointViolation[] {
    const violations: CounterpointViolation[] = [];

    for (let i = 1; i < melody.length; i++) {
      const interval = Math.abs(melody[i] - melody[i - 1]);
      const normalized = interval % 12;

      // 三全音跳进
      if (normalized === 6 && interval < 12) {
        violations.push({
          type: '旋律三全音',
          description: `位置 ${i} 出现旋律三全音跳进`,
          position: i,
          severity: 5,
        });
      }

      // 大七度跳进
      if (normalized === 11) {
        violations.push({
          type: '旋律大七度',
          description: `位置 ${i} 出现大七度跳进，难以演唱`,
          position: i,
          severity: 6,
        });
      }

      // 连续同向五度/八度跳进的暗示
      if (i >= 2) {
        const dir1 = Math.sign(melody[i - 1] - melody[i - 2]);
        const dir2 = Math.sign(melody[i] - melody[i - 1]);
        const int1 = Math.abs(melody[i - 1] - melody[i - 2]) % 12;
        const int2 = Math.abs(melody[i] - melody[i - 1]) % 12;
        if (dir1 === dir2 && dir1 !== 0 && ((int1 === 7 && int2 === 7) || (int1 === 0 && int2 === 0))) {
          violations.push({
            type: '连续同向跳进',
            description: `位置 ${i - 1} 到 ${i} 连续同向跳进五度或八度`,
            position: i,
            severity: 7,
          });
        }
      }
    }

    return violations;
  }

  /**
   * 生成 cantus firmus（定旋律）
   *
   * 根据调式生成一段符合对位法规范的简单旋律，可用于练习对位。
   *
   * @param mode - 调式
   * @param length - 音符数量
   * @param startOctave - 起始八度
   * @returns 定旋律 MIDI 数组
   */
  public generateCantusFirmus(mode: string, length: number, startOctave = 4): number[] {
    const scale = MODES[mode] || MODES.dorian;
    const finalis = startOctave * 12 + scale[0];
    const cantus: number[] = [finalis];

    // 简单随机游走，保证结尾回到主音
    for (let i = 1; i < length - 1; i++) {
      const current = cantus[cantus.length - 1];
      const currentPc = getPitchClass(current);
      const scalePcs = scale.map((s) => (finalis + s) % 12);
      const currentScaleIndex = scalePcs.indexOf(currentPc);

      // 级进为主，偶尔三度
      const stepOptions = [-1, 0, 1];
      if (Math.random() > 0.7) stepOptions.push(-2, 2);

      const step = stepOptions[Math.floor(Math.random() * stepOptions.length)];
      const nextIndex = Math.max(0, Math.min(scale.length - 1, currentScaleIndex + step));
      const nextPitch = finalis + scale[nextIndex] + (Math.floor(i / scale.length) * 12);

      // 限制音域
      if (nextPitch >= finalis - 12 && nextPitch <= finalis + 12) {
        cantus.push(nextPitch);
      } else {
        cantus.push(current);
      }
    }

    // 结尾：主音上方或下方调内音，最后回到主音
    const penultimateOptions = [scale[scale.length - 2], scale[1]]; // 导音或上主音
    const penultimatePc = penultimateOptions[Math.floor(Math.random() * penultimateOptions.length)];
    cantus.push(finalis + penultimatePc);
    cantus.push(finalis);

    return cantus;
  }

  /**
   * 比较两段对位旋律的相似度
   *
   * @param counterpointA - 对位 A
   * @param counterpointB - 对位 B
   * @returns 相似度 0-1
   */
  public compareCounterpoints(
    counterpointA: CounterpointNote[],
    counterpointB: CounterpointNote[]
  ): number {
    const minLen = Math.min(counterpointA.length, counterpointB.length);
    if (minLen === 0) return 0;

    let matching = 0;
    for (let i = 0; i < minLen; i++) {
      if (counterpointA[i].pitch === counterpointB[i].pitch) matching++;
    }

    return matching / minLen;
  }
}

// =============================================================================
// 额外导出
// =============================================================================

/**
 * 便捷函数：快速生成第一类对位
 * @param cantusFirmus - 定旋律
 * @param mode - 调式
 * @returns 对位结果
 */
export function quickFirstSpecies(cantusFirmus: number[], mode: string): CounterpointResult {
  const engine = new CounterpointEngine();
  return engine.firstSpecies(cantusFirmus, mode);
}

/**
 * 便捷函数：评估音程
 * @param pitchA - 音 A
 * @param pitchB - 音 B
 * @returns 评估结果
 */
export function quickEvaluateInterval(pitchA: number, pitchB: number): IntervalEvaluation {
  const engine = new CounterpointEngine();
  return engine.evaluateInterval(pitchA, pitchB);
}

export default CounterpointEngine;
