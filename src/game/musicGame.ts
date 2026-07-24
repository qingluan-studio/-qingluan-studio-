/**
 * ============================================================================
 * 青鸾数字音频工作站 - 音乐游戏引擎 (Music Game Engine)
 * ============================================================================
 * 本模块提供多种音乐训练游戏模式，包括节奏匹配、音高识别、和弦听辨、
 * 音阶填空、音程识别、视奏与综合练耳。支持难度分级、分数/连击/评级系统、
 * 关卡推进、成就解锁与本地排行榜。
 *
 * 核心导出：
 *   - MusicGameEngine : 游戏引擎主类，管理模式切换与全局状态
 *   - GameLevel       : 关卡定义类
 *   - GameScore       : 分数与评级统计类
 *   - Achievement     : 成就徽章类
 *   - Leaderboard     : 排行榜管理类
 * ============================================================================
 */

import {
  midiToFrequency,
  midiToNoteName,
  noteToMidi,
  getPitchClass,
  getOctave,
  semitoneToRatio,
  clamp,
  lerp,
  calculateNoteDuration,
  frequencyToMidi,
  mapRange,
} from '../utils/audioUtils.js';

// ============================================================================
// 类型定义与枚举
// ============================================================================

/** 游戏模式枚举 */
export enum GameMode {
  RHYTHM = 'rhythm',
  PITCH = 'pitch',
  CHORD = 'chord',
  SCALE = 'scale',
  INTERVAL = 'interval',
  SIGHT_READING = 'sight',
  EAR_TRAINING = 'ear',
}

/** 难度等级枚举 */
export enum Difficulty {
  BEGINNER = 'beginner',
  INTERMEDIATE = 'intermediate',
  ADVANCED = 'advanced',
  EXPERT = 'expert',
  MASTER = 'master',
}

/** 判定等级 */
export enum Judgment {
  PERFECT = 'perfect',
  GREAT = 'great',
  GOOD = 'good',
  BAD = 'bad',
  MISS = 'miss',
}

/** 评级等级 */
export enum Rank {
  SSS = 'SSS',
  SS = 'SS',
  S = 'S',
  A = 'A',
  B = 'B',
  C = 'C',
  D = 'D',
  F = 'F',
}

/** 成就数据接口 */
export interface AchievementData {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlockedAt: number | null;
  condition: (stats: GameStats) => boolean;
}

/** 游戏统计接口 */
export interface GameStats {
  totalScore: number;
  maxCombo: number;
  perfectCount: number;
  greatCount: number;
  goodCount: number;
  badCount: number;
  missCount: number;
  totalNotes: number;
  playTime: number;
  mode: GameMode;
  difficulty: Difficulty;
  levelsCleared: number;
  gamesPlayed: number;
}

/** MIDI 输入事件接口 */
export interface MidiInputEvent {
  note: number;
  velocity: number;
  on: boolean;
  timestamp: number;
}

/** 虚拟键盘映射 */
export interface KeyMapping {
  key: string;
  note: number;
  label: string;
}

/** 游戏音符（下落式或序列） */
export interface GameNote {
  id: string;
  pitch: number;
  time: number;
  duration: number;
  lane: number;
  hit: boolean;
  judgment: Judgment | null;
}

/** 排行榜条目 */
export interface LeaderboardEntry {
  playerName: string;
  score: number;
  rank: Rank;
  combo: number;
  accuracy: number;
  date: number;
  mode: GameMode;
  difficulty: Difficulty;
}

/** 游戏配置 */
export interface GameConfig {
  audioContext: AudioContext;
  masterGain: GainNode;
  sampleRate: number;
  bufferSize: number;
  lookahead: number;
}

/** 判定结果 */
export interface JudgmentResult {
  judgment: Judgment;
  score: number;
  combo: number;
  accuracy: number;
  deviation: number;
}

/** 关卡进度 */
export interface LevelProgress {
  currentLevel: number;
  maxLevels: number;
  unlockedDifficulties: Difficulty[];
  stars: number;
}

// ============================================================================
// GameLevel 类 - 关卡定义
// ============================================================================

/** GameLevel 定义音乐游戏中的一个关卡，包含音符序列、速度、判定窗口等参数。 */
export class GameLevel {
  id: string;
  name: string;
  mode: GameMode;
  difficulty: Difficulty;
  bpm: number;
  beatsPerBar: number;
  notes: GameNote[];
  judgmentWindows: [number, number, number, number];
  clearScore: number;
  clearRank: Rank;
  description: string;
  duration: number;
  lives: number;
  timeLimit: number;

  constructor(options: {
    id: string;
    name: string;
    mode: GameMode;
    difficulty: Difficulty;
    bpm: number;
    beatsPerBar?: number;
    notes: GameNote[];
    judgmentWindows?: [number, number, number, number];
    clearScore?: number;
    clearRank?: Rank;
    description?: string;
    duration?: number;
    lives?: number;
    timeLimit?: number;
  }) {
    this.id = options.id;
    this.name = options.name;
    this.mode = options.mode;
    this.difficulty = options.difficulty;
    this.bpm = options.bpm;
    this.beatsPerBar = options.beatsPerBar ?? 4;
    this.notes = options.notes;
    this.judgmentWindows = options.judgmentWindows ?? [30, 60, 100, 150];
    this.clearScore = options.clearScore ?? 60000;
    this.clearRank = options.clearRank ?? Rank.C;
    this.description = options.description ?? '';
    this.duration = options.duration ?? 60;
    this.lives = options.lives ?? 5;
    this.timeLimit = options.timeLimit ?? 0;
  }

  /** 根据难度等级生成默认判定窗口（毫秒），难度越高越严格 */
  static getDefaultWindows(difficulty: Difficulty): [number, number, number, number] {
    switch (difficulty) {
      case Difficulty.BEGINNER: return [50, 100, 160, 220];
      case Difficulty.INTERMEDIATE: return [35, 70, 120, 180];
      case Difficulty.ADVANCED: return [25, 50, 90, 140];
      case Difficulty.EXPERT: return [18, 35, 65, 100];
      case Difficulty.MASTER: return [12, 25, 45, 70];
      default: return [30, 60, 100, 150];
    }
  }

  /** 生成关卡音符序列（根据模式与难度自动生成基础谱面） */
  static generateNotes(mode: GameMode, difficulty: Difficulty, bpm: number, bars: number): GameNote[] {
    const notes: GameNote[] = [];
    const beatDuration = 60 / bpm;
    const totalBeats = bars * 4;
    let idCounter = 0;
    if (mode === GameMode.RHYTHM) {
      const densityMap: Record<Difficulty, number> = {
        [Difficulty.BEGINNER]: 0.4,
        [Difficulty.INTERMEDIATE]: 0.6,
        [Difficulty.ADVANCED]: 0.75,
        [Difficulty.EXPERT]: 0.88,
        [Difficulty.MASTER]: 0.95,
      };
      const density = densityMap[difficulty] ?? 0.6;
      const lanes = difficulty === Difficulty.BEGINNER ? 3 : difficulty === Difficulty.MASTER ? 6 : 4;
      for (let beat = 0; beat < totalBeats; beat++) {
        if (Math.random() < density) {
          notes.push({ id: `note_${idCounter++}`, pitch: 60 + Math.floor(Math.random() * 12), time: beat * beatDuration, duration: beatDuration * (0.5 + Math.random() * 0.5), lane: Math.floor(Math.random() * lanes), hit: false, judgment: null });
        }
        if ((difficulty === Difficulty.EXPERT || difficulty === Difficulty.MASTER) && Math.random() < density * 0.5) {
          notes.push({ id: `note_${idCounter++}`, pitch: 60 + Math.floor(Math.random() * 12), time: (beat + 0.5) * beatDuration, duration: beatDuration * 0.5, lane: Math.floor(Math.random() * lanes), hit: false, judgment: null });
        }
      }
    } else if (mode === GameMode.PITCH || mode === GameMode.SIGHT_READING) {
      const scale = [60, 62, 64, 65, 67, 69, 71, 72];
      for (let i = 0; i < totalBeats / 2; i++) {
        const pitch = scale[Math.floor(Math.random() * scale.length)];
        notes.push({ id: `note_${idCounter++}`, pitch, time: i * beatDuration * 2, duration: beatDuration * 2, lane: 0, hit: false, judgment: null });
      }
    }
    return notes.sort((a, b) => a.time - b.time);
  }

  /** 获取每难度等级的关卡总数：初级10/中级15/高级20/专家25/大师无限 */
  static getLevelCount(difficulty: Difficulty): number {
    switch (difficulty) {
      case Difficulty.BEGINNER: return 10;
      case Difficulty.INTERMEDIATE: return 15;
      case Difficulty.ADVANCED: return 20;
      case Difficulty.EXPERT: return 25;
      case Difficulty.MASTER: return Infinity;
      default: return 10;
    }
  }
}

// ============================================================================
// GameScore 类 - 分数与评级统计
// ============================================================================

/** GameScore 管理单局游戏的分数计算、连击、评级与生命值。 */
export class GameScore {
  private _score: number = 0;
  private _combo: number = 0;
  private _maxCombo: number = 0;
  private _judgmentCounts: Record<Judgment, number> = { [Judgment.PERFECT]: 0, [Judgment.GREAT]: 0, [Judgment.GOOD]: 0, [Judgment.BAD]: 0, [Judgment.MISS]: 0 };
  private _totalNotes: number = 0;
  private _health: number = 100;
  private _weights: Record<Judgment, number> = { [Judgment.PERFECT]: 1.0, [Judgment.GREAT]: 0.8, [Judgment.GOOD]: 0.5, [Judgment.BAD]: 0.2, [Judgment.MISS]: 0 };
  private _healthDelta: Record<Judgment, number> = { [Judgment.PERFECT]: 1, [Judgment.GREAT]: 0.5, [Judgment.GOOD]: 0, [Judgment.BAD]: -2, [Judgment.MISS]: -5 };
  baseNoteScore: number = 100;
  comboMultiplier: number = 0.01;

  constructor(totalNotes: number = 0) { this._totalNotes = totalNotes; }
  get score(): number { return Math.floor(this._score); }
  get combo(): number { return this._combo; }
  get maxCombo(): number { return this._maxCombo; }
  get health(): number { return this._health; }
  get totalNotes(): number { return this._totalNotes; }
  getJudgmentCounts(): Record<Judgment, number> { return { ...this._judgmentCounts }; }

  /** 计算准确率 (0-1) */
  getAccuracy(): number {
    const total = Object.values(this._judgmentCounts).reduce((a, b) => a + b, 0);
    if (total === 0) return 0;
    const weighted = this._judgmentCounts[Judgment.PERFECT] * 1.0 + this._judgmentCounts[Judgment.GREAT] * 0.8 + this._judgmentCounts[Judgment.GOOD] * 0.5 + this._judgmentCounts[Judgment.BAD] * 0.2 + this._judgmentCounts[Judgment.MISS] * 0;
    return weighted / total;
  }

  /** 根据判定结果更新分数 */
  addJudgment(judgment: Judgment): JudgmentResult {
    this._judgmentCounts[judgment]++;
    if (judgment === Judgment.MISS) { this._combo = 0; } else { this._combo++; if (this._combo > this._maxCombo) this._maxCombo = this._combo; }
    const weight = this._weights[judgment];
    const comboBonus = 1 + this._combo * this.comboMultiplier;
    const noteScore = this.baseNoteScore * weight * comboBonus;
    this._score += noteScore;
    this._health = clamp(this._health + (this._healthDelta[judgment] ?? 0), 0, 100);
    return { judgment, score: Math.floor(noteScore), combo: this._combo, accuracy: this.getAccuracy(), deviation: 0 };
  }

  /** 计算最终评级 SSS/SS/S/A/B/C/D/F */
  getRank(): Rank {
    const accuracy = this.getAccuracy();
    if (accuracy >= 0.98 && this._judgmentCounts[Judgment.MISS] === 0) return Rank.SSS;
    if (accuracy >= 0.95 && this._judgmentCounts[Judgment.MISS] <= 1) return Rank.SS;
    if (accuracy >= 0.90) return Rank.S;
    if (accuracy >= 0.80) return Rank.A;
    if (accuracy >= 0.70) return Rank.B;
    if (accuracy >= 0.60) return Rank.C;
    if (accuracy >= 0.50) return Rank.D;
    return Rank.F;
  }

  /** 判断是否过关 */
  isCleared(clearScore: number, clearRank: Rank): boolean {
    const rankOrder = [Rank.F, Rank.D, Rank.C, Rank.B, Rank.A, Rank.S, Rank.SS, Rank.SSS];
    return this.score >= clearScore && rankOrder.indexOf(this.getRank()) >= rankOrder.indexOf(clearRank);
  }

  /** 重置分数状态 */
  reset(): void {
    this._score = 0; this._combo = 0; this._maxCombo = 0; this._health = 100;
    this._judgmentCounts = { [Judgment.PERFECT]: 0, [Judgment.GREAT]: 0, [Judgment.GOOD]: 0, [Judgment.BAD]: 0, [Judgment.MISS]: 0 };
  }

  /** 获取游戏统计 */
  toStats(mode: GameMode, difficulty: Difficulty, playTime: number): GameStats {
    return { totalScore: this.score, maxCombo: this.maxCombo, perfectCount: this._judgmentCounts[Judgment.PERFECT], greatCount: this._judgmentCounts[Judgment.GREAT], goodCount: this._judgmentCounts[Judgment.GOOD], badCount: this._judgmentCounts[Judgment.BAD], missCount: this._judgmentCounts[Judgment.MISS], totalNotes: this._totalNotes, playTime, mode, difficulty, levelsCleared: 0, gamesPlayed: 1 };
  }
}

// ============================================================================
// Achievement 类 - 成就徽章系统
// ============================================================================

/** Achievement 管理30+成就徽章的解锁逻辑与持久化存储。 */
export class Achievement {
  private _achievements: AchievementData[] = [];
  private static STORAGE_KEY = 'qingluan_achievements';

  constructor() { this._initAchievements(); this._loadFromStorage(); }

  /** 初始化34个成就定义 */
  private _initAchievements(): void {
    this._achievements = [
      // 基础成就
      { id: 'first_step', name: '初出茅庐', description: '完成第一局游戏', icon: '🎵', unlockedAt: null, condition: (s) => s.gamesPlayed >= 1 },
      { id: 'ten_games', name: '坚持不懈', description: '累计完成10局游戏', icon: '🎶', unlockedAt: null, condition: (s) => s.gamesPlayed >= 10 },
      { id: 'hundred_games', name: '资深玩家', description: '累计完成100局游戏', icon: '🎼', unlockedAt: null, condition: (s) => s.gamesPlayed >= 100 },
      // 节奏相关
      { id: 'rhythm_beginner', name: '节奏新手', description: '节奏模式达到初级S评级', icon: '🥁', unlockedAt: null, condition: (s) => s.mode === GameMode.RHYTHM && s.totalScore >= 80000 },
      { id: 'rhythm_master', name: '节奏大师', description: '节奏模式达成SSS评级', icon: '🥇', unlockedAt: null, condition: (s) => s.mode === GameMode.RHYTHM && s.perfectCount >= s.totalNotes * 0.99 && s.missCount === 0 },
      { id: 'full_combo', name: '全连击', description: '任意模式达成全连击', icon: '🔥', unlockedAt: null, condition: (s) => s.maxCombo >= s.totalNotes && s.totalNotes > 0 },
      { id: 'combo_100', name: '百连斩', description: '达成100连击', icon: '⚡', unlockedAt: null, condition: (s) => s.maxCombo >= 100 },
      { id: 'combo_500', name: '五百连斩', description: '达成500连击', icon: '💥', unlockedAt: null, condition: (s) => s.maxCombo >= 500 },
      // 音高相关
      { id: 'pitch_beginner', name: '音高新手', description: '音高识别模式达到初级S评级', icon: '🎤', unlockedAt: null, condition: (s) => s.mode === GameMode.PITCH && s.totalScore >= 80000 },
      { id: 'absolute_pitch', name: '绝对音感', description: '音高识别模式准确率超过95%', icon: '👂', unlockedAt: null, condition: (s) => s.mode === GameMode.PITCH && s.perfectCount + s.greatCount >= s.totalNotes * 0.95 },
      // 和弦相关
      { id: 'chord_beginner', name: '和弦新手', description: '和弦听辨模式达到初级S评级', icon: '🎸', unlockedAt: null, condition: (s) => s.mode === GameMode.CHORD && s.totalScore >= 80000 },
      { id: 'chord_master', name: '和弦大师', description: '和弦听辨模式准确率超过90%', icon: '🎹', unlockedAt: null, condition: (s) => s.mode === GameMode.CHORD && s.perfectCount + s.greatCount >= s.totalNotes * 0.90 },
      // 音阶相关
      { id: 'scale_beginner', name: '音阶新手', description: '音阶填空模式达到初级S评级', icon: '📈', unlockedAt: null, condition: (s) => s.mode === GameMode.SCALE && s.totalScore >= 80000 },
      { id: 'scale_master', name: '音阶大师', description: '音阶填空模式全对通关', icon: '🏔️', unlockedAt: null, condition: (s) => s.mode === GameMode.SCALE && s.missCount === 0 && s.badCount === 0 },
      // 音程相关
      { id: 'interval_beginner', name: '音程新手', description: '音程识别模式达到初级S评级', icon: '📏', unlockedAt: null, condition: (s) => s.mode === GameMode.INTERVAL && s.totalScore >= 80000 },
      { id: 'interval_master', name: '音程大师', description: '音程识别模式准确率超过92%', icon: '🎯', unlockedAt: null, condition: (s) => s.mode === GameMode.INTERVAL && s.perfectCount + s.greatCount >= s.totalNotes * 0.92 },
      // 视奏相关
      { id: 'sight_beginner', name: '视奏新手', description: '视奏模式达到初级S评级', icon: '👁️', unlockedAt: null, condition: (s) => s.mode === GameMode.SIGHT_READING && s.totalScore >= 80000 },
      { id: 'sight_master', name: '视奏大师', description: '视奏模式准确率超过90%', icon: '🎼', unlockedAt: null, condition: (s) => s.mode === GameMode.SIGHT_READING && s.perfectCount + s.greatCount >= s.totalNotes * 0.90 },
      // 练耳综合
      { id: 'ear_beginner', name: '练耳新手', description: '综合练耳模式达到初级S评级', icon: '🧠', unlockedAt: null, condition: (s) => s.mode === GameMode.EAR_TRAINING && s.totalScore >= 80000 },
      { id: 'ear_master', name: '金耳朵', description: '综合练耳模式准确率超过90%', icon: '🏆', unlockedAt: null, condition: (s) => s.mode === GameMode.EAR_TRAINING && s.perfectCount + s.greatCount >= s.totalNotes * 0.90 },
      // 难度突破
      { id: 'clear_beginner', name: '初级毕业', description: '通关初级难度所有关卡', icon: '🥉', unlockedAt: null, condition: (s) => s.levelsCleared >= 10 },
      { id: 'clear_intermediate', name: '中级毕业', description: '通关中级难度所有关卡', icon: '🥈', unlockedAt: null, condition: (s) => s.levelsCleared >= 25 },
      { id: 'clear_advanced', name: '高级毕业', description: '通关高级难度所有关卡', icon: '🥇', unlockedAt: null, condition: (s) => s.levelsCleared >= 45 },
      { id: 'clear_expert', name: '专家认证', description: '通关专家难度所有关卡', icon: '💎', unlockedAt: null, condition: (s) => s.levelsCleared >= 70 },
      { id: 'clear_master', name: '大师认证', description: '通关大师难度第10关', icon: '👑', unlockedAt: null, condition: (s) => s.levelsCleared >= 80 },
      // 分数成就
      { id: 'score_50k', name: '五万大关', description: '单局分数突破50000', icon: '💰', unlockedAt: null, condition: (s) => s.totalScore >= 50000 },
      { id: 'score_100k', name: '十万大关', description: '单局分数突破100000', icon: '💎', unlockedAt: null, condition: (s) => s.totalScore >= 100000 },
      { id: 'score_200k', name: '二十万大关', description: '单局分数突破200000', icon: '🌟', unlockedAt: null, condition: (s) => s.totalScore >= 200000 },
      // 完美主义
      { id: 'perfect_10', name: '十连完美', description: '连续10个Perfect判定', icon: '✨', unlockedAt: null, condition: (s) => s.perfectCount >= 10 },
      { id: 'perfect_50', name: '五十连完美', description: '连续50个Perfect判定', icon: '🌈', unlockedAt: null, condition: (s) => s.perfectCount >= 50 },
      { id: 'all_perfect', name: '理论值', description: '单局全部Perfect判定', icon: '💯', unlockedAt: null, condition: (s) => s.perfectCount === s.totalNotes && s.totalNotes > 0 },
      // 时间/耐力
      { id: 'play_1h', name: '一小时练习生', description: '累计游戏时间达到1小时', icon: '⏰', unlockedAt: null, condition: (s) => s.playTime >= 3600 },
      { id: 'play_10h', name: '十小时练习生', description: '累计游戏时间达到10小时', icon: '⏳', unlockedAt: null, condition: (s) => s.playTime >= 36000 },
      { id: 'survivor', name: '生存者', description: '生命值低于10%时完成关卡', icon: '❤️', unlockedAt: null, condition: (s) => s.playTime > 30 },
    ];
  }

  private _loadFromStorage(): void {
    try {
      const raw = localStorage.getItem(Achievement.STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw) as Record<string, number>;
        for (const ach of this._achievements) { if (data[ach.id]) ach.unlockedAt = data[ach.id]; }
      }
    } catch { /* 忽略 */ }
  }

  private _saveToStorage(): void {
    try {
      const data: Record<string, number> = {};
      for (const ach of this._achievements) { if (ach.unlockedAt) data[ach.id] = ach.unlockedAt; }
      localStorage.setItem(Achievement.STORAGE_KEY, JSON.stringify(data));
    } catch { /* 忽略 */ }
  }

  /** 检查并解锁成就，返回本次新解锁的成就列表 */
  checkAndUnlock(stats: GameStats): AchievementData[] {
    const newlyUnlocked: AchievementData[] = [];
    for (const ach of this._achievements) {
      if (ach.unlockedAt === null && ach.condition(stats)) { ach.unlockedAt = Date.now(); newlyUnlocked.push(ach); }
    }
    if (newlyUnlocked.length > 0) this._saveToStorage();
    return newlyUnlocked;
  }

  getAll(): AchievementData[] { return this._achievements.map(a => ({ ...a })); }
  getUnlocked(): AchievementData[] { return this._achievements.filter(a => a.unlockedAt !== null).map(a => ({ ...a })); }
  getProgress(): { unlocked: number; total: number } { return { unlocked: this._achievements.filter(a => a.unlockedAt !== null).length, total: this._achievements.length }; }
}

// ============================================================================
// Leaderboard 类 - 本地排行榜
// ============================================================================

/** Leaderboard 管理本地最高分存储，按模式与难度分类保存前50名记录。 */
export class Leaderboard {
  private static STORAGE_KEY = 'qingluan_leaderboard';
  maxEntries: number = 50;
  private _data: Map<string, LeaderboardEntry[]> = new Map();
  constructor() { this._loadFromStorage(); }
  private _makeKey(mode: GameMode, difficulty: Difficulty): string { return `${mode}_${difficulty}`; }

  private _loadFromStorage(): void {
    try {
      const raw = localStorage.getItem(Leaderboard.STORAGE_KEY);
      if (raw) { const obj = JSON.parse(raw) as Record<string, LeaderboardEntry[]>; for (const key of Object.keys(obj)) this._data.set(key, obj[key]); }
    } catch { /* 忽略 */ }
  }

  private _saveToStorage(): void {
    try { const obj: Record<string, LeaderboardEntry[]> = {}; for (const [key, entries] of this._data.entries()) obj[key] = entries; localStorage.setItem(Leaderboard.STORAGE_KEY, JSON.stringify(obj)); } catch { /* 忽略 */ }
  }

  /** 提交分数到排行榜，返回是否进入前50名 */
  submit(entry: LeaderboardEntry): boolean {
    const key = this._makeKey(entry.mode, entry.difficulty);
    let entries = this._data.get(key) ?? [];
    entries.push(entry);
    entries.sort((a, b) => b.score - a.score);
    entries = entries.slice(0, this.maxEntries);
    this._data.set(key, entries);
    this._saveToStorage();
    return entries.some(e => e.playerName === entry.playerName && e.score === entry.score && e.date === entry.date);
  }

  getEntries(mode: GameMode, difficulty: Difficulty): LeaderboardEntry[] { return [...(this._data.get(this._makeKey(mode, difficulty)) ?? [])]; }
  getPersonalBest(playerName: string, mode: GameMode, difficulty: Difficulty): LeaderboardEntry | null { return this.getEntries(mode, difficulty).find(e => e.playerName === playerName) ?? null; }
  clear(mode: GameMode, difficulty: Difficulty): void { this._data.delete(this._makeKey(mode, difficulty)); this._saveToStorage(); }
  clearAll(): void { this._data.clear(); this._saveToStorage(); }
}

// ============================================================================
// 子游戏模式基类
// ============================================================================

/** BaseGameMode 是所有游戏模式的抽象基类，定义通用生命周期接口。 */
export abstract class BaseGameMode {
  protected _level: GameLevel;
  protected _score: GameScore;
  protected _config: GameConfig;
  protected _startTime: number = 0;
  protected _isRunning: boolean = false;
  protected _currentTime: number = 0;

  constructor(level: GameLevel, config: GameConfig) { this._level = level; this._config = config; this._score = new GameScore(level.notes.length); }
  get score(): GameScore { return this._score; }
  get isRunning(): boolean { return this._isRunning; }
  get currentTime(): number { return this._currentTime; }

  start(): void { this._startTime = this._config.audioContext.currentTime; this._isRunning = true; this._score.reset(); }
  stop(): void { this._isRunning = false; }
  abstract update(dt: number): void;
  abstract processInput(input: unknown): JudgmentResult | null;
  abstract generateAudio(): AudioBufferSourceNode[];
  abstract getState(): Record<string, unknown>;
}

// ============================================================================
// RhythmGame - 下落式节拍匹配
// ============================================================================

/**
 * RhythmGame 实现下落式节奏游戏逻辑：
 * 音符从屏幕上方下落至判定线，用户在恰当时机按下对应轨道按键，
 * 支持 Perfect/Great/Good/Bad/Miss 五级判定、连击系统、分数计算、生命值管理。
 */
export class RhythmGame extends BaseGameMode {
  judgmentLineY: number = 0.9;
  fallSpeed: number = 0.6;
  private _noteIndex: number = 0;
  lastJudgment: JudgmentResult | null = null;
  judgmentDisplayTimer: number = 0;
  private _keyStates: boolean[] = [];

  constructor(level: GameLevel, config: GameConfig) {
    super(level, config);
    const lanes = level.difficulty === Difficulty.MASTER ? 6 : level.difficulty === Difficulty.BEGINNER ? 3 : 4;
    this._keyStates = new Array(lanes).fill(false);
  }

  /** 获取当前活跃的音符（未击中且未错过） */
  getActiveNotes(): GameNote[] {
    const now = this._currentTime;
    const missWindow = this._level.judgmentWindows[3] / 1000;
    return this._level.notes.filter(n => { if (n.hit) return false; const timeDiff = n.time - now; return timeDiff > -missWindow - 0.5; });
  }

  /** 获取音符当前下落位置 Y（0=顶部, 1=底部） */
  getNoteY(note: GameNote): number {
    const timeDiff = note.time - this._currentTime;
    const fallDuration = this.judgmentLineY / this.fallSpeed;
    return clamp(this.judgmentLineY - (timeDiff / fallDuration) * this.judgmentLineY, -0.1, 1.1);
  }

  override update(dt: number): void {
    if (!this._isRunning) return;
    this._currentTime = this._config.audioContext.currentTime - this._startTime;
    const missWindow = this._level.judgmentWindows[3] / 1000;
    while (this._noteIndex < this._level.notes.length) {
      const note = this._level.notes[this._noteIndex];
      if (this._currentTime > note.time + missWindow && !note.hit && note.judgment === null) {
        note.judgment = Judgment.MISS;
        this.lastJudgment = this._score.addJudgment(Judgment.MISS);
        this.judgmentDisplayTimer = 0.5;
        this._noteIndex++;
      } else break;
    }
    if (this.judgmentDisplayTimer > 0) this.judgmentDisplayTimer -= dt;
    if (this._level.timeLimit > 0 && this._currentTime >= this._level.timeLimit) this._isRunning = false;
    if (this._score.health <= 0) this._isRunning = false;
  }

  override processInput(input: { lane: number; timestamp?: number }): JudgmentResult | null {
    if (!this._isRunning) return null;
    const now = input.timestamp ?? this._config.audioContext.currentTime - this._startTime;
    const candidates = this._level.notes.filter(n => n.lane === input.lane && !n.hit && n.judgment === null);
    if (candidates.length === 0) return null;
    let bestNote = candidates[0];
    let bestDiff = Math.abs(candidates[0].time - now);
    for (const note of candidates) { const diff = Math.abs(note.time - now); if (diff < bestDiff) { bestDiff = diff; bestNote = note; } }
    const diffMs = bestDiff * 1000;
    const windows = this._level.judgmentWindows;
    let judgment: Judgment;
    if (diffMs <= windows[0]) judgment = Judgment.PERFECT;
    else if (diffMs <= windows[1]) judgment = Judgment.GREAT;
    else if (diffMs <= windows[2]) judgment = Judgment.GOOD;
    else if (diffMs <= windows[3]) judgment = Judgment.BAD;
    else return null;
    bestNote.hit = true; bestNote.judgment = judgment;
    this.lastJudgment = this._score.addJudgment(judgment);
    this.lastJudgment.deviation = diffMs;
    this.judgmentDisplayTimer = 0.5;
    return this.lastJudgment;
  }

  override generateAudio(): AudioBufferSourceNode[] {
    const sources: AudioBufferSourceNode[] = [];
    const ctx = this._config.audioContext;
    const sampleRate = ctx.sampleRate;
    for (const note of this._level.notes) {
      const duration = note.duration || 0.2;
      const frameCount = Math.ceil(duration * sampleRate);
      const buffer = ctx.createBuffer(1, frameCount, sampleRate);
      const data = buffer.getChannelData(0);
      const freq = midiToFrequency(note.pitch || 60);
      for (let i = 0; i < frameCount; i++) { const t = i / sampleRate; const envelope = Math.max(0, 1 - t / duration); data[i] = Math.sin(2 * Math.PI * freq * t) * 0.3 * envelope; }
      const source = ctx.createBufferSource();
      source.buffer = buffer; source.connect(this._config.masterGain); source.start(this._startTime + note.time);
      sources.push(source);
    }
    return sources;
  }

  override getState(): Record<string, unknown> {
    return { mode: 'rhythm', activeNotes: this.getActiveNotes().map(n => ({ ...n, y: this.getNoteY(n) })), judgmentLineY: this.judgmentLineY, score: this._score.score, combo: this._score.combo, maxCombo: this._score.maxCombo, health: this._score.health, lastJudgment: this.lastJudgment, judgmentDisplayTimer: this.judgmentDisplayTimer, keyStates: [...this._keyStates] };
  }
}

// ============================================================================
// PitchGame - 音高识别游戏
// ============================================================================

/**
 * PitchGame 实现音高识别训练：
 * 播放参考音，用户通过输入音高（模拟麦克风），计算音分偏差给出判定。
 */
export class PitchGame extends BaseGameMode {
  private _targetPitch: number = 60;
  referenceDuration: number = 1.0;
  private _centsWindows: [number, number, number] = [10, 30, 50];
  private _referencePlayed: boolean = false;
  private _round: number = 0;
  private _totalRounds: number = 10;
  private _roundResults: JudgmentResult[] = [];

  constructor(level: GameLevel, config: GameConfig) { super(level, config); this._totalRounds = level.notes.length || 10; this._nextRound(); }
  private _nextRound(): void { if (this._round < this._level.notes.length) this._targetPitch = this._level.notes[this._round].pitch; else this._targetPitch = 48 + Math.floor(Math.random() * 36); this._referencePlayed = false; }
  getTargetFrequency(): number { return midiToFrequency(this._targetPitch); }
  getTargetNoteName(): string { return midiToNoteName(this._targetPitch, true); }

  override start(): void { super.start(); this._round = 0; this._roundResults = []; this._nextRound(); }
  override update(dt: number): void {
    if (!this._isRunning) return;
    this._currentTime = this._config.audioContext.currentTime - this._startTime;
    if (this._level.timeLimit > 0 && this._currentTime >= this._level.timeLimit) this._isRunning = false;
    if (this._score.health <= 0) this._isRunning = false;
  }

  override processInput(input: { pitch: number; isFreq?: boolean }): JudgmentResult | null {
    if (!this._isRunning) return null;
    const userMidi = input.isFreq ? frequencyToMidi(input.pitch) : input.pitch;
    const freqTarget = midiToFrequency(this._targetPitch);
    const freqUser = midiToFrequency(userMidi);
    const cents = Math.abs(1200 * Math.log2(freqUser / freqTarget));
    const windows = this._centsWindows;
    let judgment: Judgment;
    if (cents <= windows[0]) judgment = Judgment.PERFECT;
    else if (cents <= windows[1]) judgment = Judgment.GREAT;
    else if (cents <= windows[2]) judgment = Judgment.GOOD;
    else if (cents <= 100) judgment = Judgment.BAD;
    else judgment = Judgment.MISS;
    const result = this._score.addJudgment(judgment);
    result.deviation = cents;
    this._roundResults.push(result); this._round++;
    if (this._round >= this._totalRounds) this._isRunning = false; else this._nextRound();
    return result;
  }

  override generateAudio(): AudioBufferSourceNode[] {
    const ctx = this._config.audioContext;
    const sampleRate = ctx.sampleRate;
    const duration = this.referenceDuration;
    const frameCount = Math.ceil(duration * sampleRate);
    const buffer = ctx.createBuffer(1, frameCount, sampleRate);
    const data = buffer.getChannelData(0);
    const freq = midiToFrequency(this._targetPitch);
    for (let i = 0; i < frameCount; i++) {
      const t = i / sampleRate;
      const envelope = Math.max(0, 1 - t / duration);
      data[i] = (Math.sin(2 * Math.PI * freq * t) + 0.3 * Math.sin(2 * Math.PI * freq * 2 * t) + 0.15 * Math.sin(2 * Math.PI * freq * 3 * t)) * 0.4 * envelope;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer; source.connect(this._config.masterGain); source.start(this._startTime);
    this._referencePlayed = true;
    return [source];
  }

  override getState(): Record<string, unknown> {
    return { mode: 'pitch', targetPitch: this._targetPitch, targetNoteName: this.getTargetNoteName(), targetFrequency: this.getTargetFrequency(), round: this._round, totalRounds: this._totalRounds, referencePlayed: this._referencePlayed, score: this._score.score, combo: this._score.combo, health: this._score.health };
  }
}

// ============================================================================
// ChordGame - 和弦听辨
// ============================================================================

/**
 * ChordGame 实现和弦听辨训练：
 * 播放一个和弦（三和弦/七和弦/扩展和弦），显示多个选项供用户选择，判定对错并计算得分。
 */
export class ChordGame extends BaseGameMode {
  private _targetChord: string = '';
  private _rootNote: number = 60;
  private _chordTypes: string[] = ['major', 'minor', 'dim', 'aug', 'maj7', 'min7', 'dom7', 'dim7', 'half-dim7', 'minmaj7', 'sus2', 'sus4', 'add9'];
  private _round: number = 0;
  private _totalRounds: number = 10;
  optionsCount: number = 4;
  currentOptions: string[] = [];

  /** 和弦结构定义（相对于根音的半音偏移） */
  static CHORD_STRUCTURES: Record<string, number[]> = {
    major: [0, 4, 7], minor: [0, 3, 7], dim: [0, 3, 6], aug: [0, 4, 8], maj7: [0, 4, 7, 11], min7: [0, 3, 7, 10], dom7: [0, 4, 7, 10], dim7: [0, 3, 6, 9], 'half-dim7': [0, 3, 6, 10], minmaj7: [0, 3, 7, 11], sus2: [0, 2, 7], sus4: [0, 5, 7], add9: [0, 4, 7, 14],
  };

  /** 和弦中文名称映射 */
  static CHORD_NAMES: Record<string, string> = {
    major: '大三和弦', minor: '小三和弦', dim: '减三和弦', aug: '增三和弦', maj7: '大七和弦', min7: '小七和弦', dom7: '属七和弦', dim7: '减七和弦', 'half-dim7': '半减七和弦', minmaj7: '小大七和弦', sus2: '挂二和弦', sus4: '挂四和弦', add9: '加九和弦',
  };

  constructor(level: GameLevel, config: GameConfig) { super(level, config); this._totalRounds = level.notes.length || 10; this._setupRound(); }
  private _setupRound(): void {
    const available = this._getAvailableChords();
    this._targetChord = available[Math.floor(Math.random() * available.length)];
    this._rootNote = 48 + Math.floor(Math.random() * 24);
    const options = new Set<string>([this._targetChord]);
    while (options.size < this.optionsCount && options.size < available.length) { options.add(available[Math.floor(Math.random() * available.length)]); }
    this.currentOptions = Array.from(options).sort(() => Math.random() - 0.5);
  }
  private _getAvailableChords(): string[] {
    switch (this._level.difficulty) {
      case Difficulty.BEGINNER: return ['major', 'minor'];
      case Difficulty.INTERMEDIATE: return ['major', 'minor', 'dim', 'aug', 'sus2', 'sus4'];
      case Difficulty.ADVANCED: return ['major', 'minor', 'dim', 'aug', 'maj7', 'min7', 'dom7', 'sus2', 'sus4'];
      case Difficulty.EXPERT:
      case Difficulty.MASTER: return this._chordTypes;
      default: return ['major', 'minor'];
    }
  }
  getChordDisplayName(chordType: string): string { return ChordGame.CHORD_NAMES[chordType] ?? chordType; }

  override start(): void { super.start(); this._round = 0; this._setupRound(); }
  override update(dt: number): void {
    if (!this._isRunning) return;
    this._currentTime = this._config.audioContext.currentTime - this._startTime;
    if (this._level.timeLimit > 0 && this._currentTime >= this._level.timeLimit) this._isRunning = false;
    if (this._score.health <= 0) this._isRunning = false;
  }

  override processInput(input: { choice: string }): JudgmentResult | null {
    if (!this._isRunning) return null;
    const isCorrect = input.choice === this._targetChord;
    const judgment = isCorrect ? Judgment.PERFECT : Judgment.MISS;
    const result = this._score.addJudgment(judgment);
    this._round++;
    if (this._round >= this._totalRounds) this._isRunning = false; else this._setupRound();
    return result;
  }

  override generateAudio(): AudioBufferSourceNode[] {
    const ctx = this._config.audioContext;
    const sampleRate = ctx.sampleRate;
    const duration = 1.5;
    const frameCount = Math.ceil(duration * sampleRate);
    const buffer = ctx.createBuffer(1, frameCount, sampleRate);
    const data = buffer.getChannelData(0);
    const structure = ChordGame.CHORD_STRUCTURES[this._targetChord] ?? [0, 4, 7];
    const frequencies = structure.map(semitone => midiToFrequency(this._rootNote + semitone));
    for (let i = 0; i < frameCount; i++) {
      const t = i / sampleRate;
      const envelope = Math.max(0, 1 - t / duration);
      let sample = 0;
      for (const freq of frequencies) sample += Math.sin(2 * Math.PI * freq * t) * 0.25;
      data[i] = sample * envelope;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer; source.connect(this._config.masterGain); source.start(this._startTime);
    return [source];
  }

  override getState(): Record<string, unknown> {
    return { mode: 'chord', rootNote: this._rootNote, rootNoteName: midiToNoteName(this._rootNote, true), options: this.currentOptions.map(c => ({ value: c, label: this.getChordDisplayName(c) })), round: this._round, totalRounds: this._totalRounds, score: this._score.score, combo: this._score.combo, health: this._score.health };
  }
}

// ============================================================================
// ScaleGame - 音阶填空
// ============================================================================

/**
 * ScaleGame 实现音阶填空训练：
 * 显示一个音阶的部分音符，用户补全缺失的音，支持大调、小调、五声音阶、布鲁斯音阶等。
 */
export class ScaleGame extends BaseGameMode {
  private _scaleType: string = 'major';
  private _rootNote: number = 60;
  private _fullScale: number[] = [];
  private _missingIndices: number[] = [];
  private _userAnswers: (number | null)[] = [];
  private _round: number = 0;
  private _totalRounds: number = 10;

  static SCALE_STRUCTURES: Record<string, number[]> = {
    major: [0, 2, 4, 5, 7, 9, 11, 12], natural_minor: [0, 2, 3, 5, 7, 8, 10, 12], harmonic_minor: [0, 2, 3, 5, 7, 8, 11, 12], melodic_minor: [0, 2, 3, 5, 7, 9, 11, 12], pentatonic_major: [0, 2, 4, 7, 9, 12], pentatonic_minor: [0, 3, 5, 7, 10, 12], blues: [0, 3, 5, 6, 7, 10, 12], dorian: [0, 2, 3, 5, 7, 9, 10, 12], phrygian: [0, 1, 3, 5, 7, 8, 10, 12], lydian: [0, 2, 4, 6, 7, 9, 11, 12], mixolydian: [0, 2, 4, 5, 7, 9, 10, 12], locrian: [0, 1, 3, 5, 6, 8, 10, 12],
  };

  static SCALE_NAMES: Record<string, string> = {
    major: '大调音阶', natural_minor: '自然小调', harmonic_minor: '和声小调', melodic_minor: '旋律小调', pentatonic_major: '大调五声音阶', pentatonic_minor: '小调五声音阶', blues: '布鲁斯音阶', dorian: '多利亚调式', phrygian: '弗里几亚调式', lydian: '利底亚调式', mixolydian: '混合利底亚调式', locrian: '洛克里亚调式',
  };

  constructor(level: GameLevel, config: GameConfig) { super(level, config); this._totalRounds = level.notes.length || 10; this._setupRound(); }
  private _setupRound(): void {
    const available = this._getAvailableScales();
    this._scaleType = available[Math.floor(Math.random() * available.length)];
    this._rootNote = 48 + Math.floor(Math.random() * 24);
    const structure = ScaleGame.SCALE_STRUCTURES[this._scaleType];
    this._fullScale = structure.map(s => this._rootNote + s);
    const missingCount = this._getMissingCount();
    const shuffled = Array.from({ length: this._fullScale.length }, (_, i) => i).slice(1, -1).sort(() => Math.random() - 0.5);
    this._missingIndices = shuffled.slice(0, missingCount);
    this._userAnswers = new Array(this._fullScale.length).fill(null);
  }
  private _getAvailableScales(): string[] {
    switch (this._level.difficulty) {
      case Difficulty.BEGINNER: return ['major', 'natural_minor'];
      case Difficulty.INTERMEDIATE: return ['major', 'natural_minor', 'harmonic_minor', 'pentatonic_major', 'pentatonic_minor'];
      case Difficulty.ADVANCED: return ['major', 'natural_minor', 'harmonic_minor', 'melodic_minor', 'pentatonic_major', 'pentatonic_minor', 'blues'];
      case Difficulty.EXPERT:
      case Difficulty.MASTER: return Object.keys(ScaleGame.SCALE_STRUCTURES);
      default: return ['major'];
    }
  }
  private _getMissingCount(): number {
    switch (this._level.difficulty) { case Difficulty.BEGINNER: return 1; case Difficulty.INTERMEDIATE: return 2; case Difficulty.ADVANCED: return 3; case Difficulty.EXPERT: return 4; case Difficulty.MASTER: return 5; default: return 2; }
  }
  getDisplayScale(): (number | null)[] { return this._fullScale.map((note, i) => this._missingIndices.includes(i) ? null : note); }

  override start(): void { super.start(); this._round = 0; this._setupRound(); }
  override update(dt: number): void {
    if (!this._isRunning) return;
    this._currentTime = this._config.audioContext.currentTime - this._startTime;
    if (this._level.timeLimit > 0 && this._currentTime >= this._level.timeLimit) this._isRunning = false;
    if (this._score.health <= 0) this._isRunning = false;
  }

  override processInput(input: { index: number; pitch: number }): JudgmentResult | null {
    if (!this._isRunning) return null;
    if (!this._missingIndices.includes(input.index)) return null;
    this._userAnswers[input.index] = input.pitch;
    const allFilled = this._missingIndices.every(i => this._userAnswers[i] !== null);
    if (!allFilled) return null;
    let allPerfect = true;
    for (const idx of this._missingIndices) { if ((this._userAnswers[idx] ?? -1) !== this._fullScale[idx]) { allPerfect = false; break; } }
    const judgment = allPerfect ? Judgment.PERFECT : Judgment.MISS;
    const result = this._score.addJudgment(judgment);
    this._round++;
    if (this._round >= this._totalRounds) this._isRunning = false; else this._setupRound();
    return result;
  }

  override generateAudio(): AudioBufferSourceNode[] {
    const sources: AudioBufferSourceNode[] = [];
    const ctx = this._config.audioContext;
    const sampleRate = ctx.sampleRate;
    const noteDuration = 0.4;
    for (let i = 0; i < this._fullScale.length; i++) {
      const pitch = this._fullScale[i];
      const frameCount = Math.ceil(noteDuration * sampleRate);
      const buffer = ctx.createBuffer(1, frameCount, sampleRate);
      const data = buffer.getChannelData(0);
      const freq = midiToFrequency(pitch);
      for (let j = 0; j < frameCount; j++) { const t = j / sampleRate; const envelope = Math.max(0, 1 - t / noteDuration); data[j] = Math.sin(2 * Math.PI * freq * t) * 0.35 * envelope; }
      const source = ctx.createBufferSource();
      source.buffer = buffer; source.connect(this._config.masterGain); source.start(this._startTime + i * noteDuration * 0.8);
      sources.push(source);
    }
    return sources;
  }

  override getState(): Record<string, unknown> {
    return { mode: 'scale', scaleType: this._scaleType, scaleName: ScaleGame.SCALE_NAMES[this._scaleType], rootNote: this._rootNote, rootNoteName: midiToNoteName(this._rootNote, true), displayScale: this.getDisplayScale().map(n => n !== null ? midiToNoteName(n, true) : null), missingIndices: this._missingIndices, round: this._round, totalRounds: this._totalRounds, score: this._score.score, combo: this._score.combo, health: this._score.health };
  }
}

// ============================================================================
// IntervalGame - 音程识别
// ============================================================================

/**
 * IntervalGame 实现音程识别训练：
 * 先后播放两个音（或同时播放），用户选择音程名称（如纯五度、大三度等）。
 */
export class IntervalGame extends BaseGameMode {
  private _intervalSemitones: number = 0;
  private _note1: number = 60;
  private _note2: number = 64;
  private _playMode: 'melodic' | 'harmonic' = 'melodic';
  private _round: number = 0;
  private _totalRounds: number = 10;
  optionsCount: number = 4;
  currentOptions: string[] = [];

  static INTERVAL_NAMES: Record<number, string> = { 0: '纯一度', 1: '小二度', 2: '大二度', 3: '小三度', 4: '大三度', 5: '纯四度', 6: '增四度/减五度', 7: '纯五度', 8: '小六度', 9: '大六度', 10: '小七度', 11: '大七度', 12: '纯八度' };
  static INTERVAL_RANGE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  constructor(level: GameLevel, config: GameConfig) { super(level, config); this._totalRounds = level.notes.length || 10; this._setupRound(); }
  private _setupRound(): void {
    const available = this._getAvailableIntervals();
    this._intervalSemitones = available[Math.floor(Math.random() * available.length)];
    this._note1 = 48 + Math.floor(Math.random() * 24);
    this._note2 = this._note1 + this._intervalSemitones;
    this._playMode = Math.random() > 0.5 ? 'melodic' : 'harmonic';
    const correctName = IntervalGame.INTERVAL_NAMES[this._intervalSemitones];
    const options = new Set<string>([correctName]);
    const allNames = Object.values(IntervalGame.INTERVAL_NAMES);
    while (options.size < this.optionsCount && options.size < allNames.length) { options.add(allNames[Math.floor(Math.random() * allNames.length)]); }
    this.currentOptions = Array.from(options).sort(() => Math.random() - 0.5);
  }
  private _getAvailableIntervals(): number[] {
    switch (this._level.difficulty) {
      case Difficulty.BEGINNER: return [3, 4, 5, 7, 8, 12];
      case Difficulty.INTERMEDIATE: return [1, 2, 3, 4, 5, 7, 8, 9, 12];
      case Difficulty.ADVANCED: return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
      case Difficulty.EXPERT:
      case Difficulty.MASTER: return IntervalGame.INTERVAL_RANGE;
      default: return [3, 4, 5, 7, 12];
    }
  }

  override start(): void { super.start(); this._round = 0; this._setupRound(); }
  override update(dt: number): void {
    if (!this._isRunning) return;
    this._currentTime = this._config.audioContext.currentTime - this._startTime;
    if (this._level.timeLimit > 0 && this._currentTime >= this._level.timeLimit) this._isRunning = false;
    if (this._score.health <= 0) this._isRunning = false;
  }

  override processInput(input: { choice: string }): JudgmentResult | null {
    if (!this._isRunning) return null;
    const isCorrect = input.choice === IntervalGame.INTERVAL_NAMES[this._intervalSemitones];
    const judgment = isCorrect ? Judgment.PERFECT : Judgment.MISS;
    const result = this._score.addJudgment(judgment);
    this._round++;
    if (this._round >= this._totalRounds) this._isRunning = false; else this._setupRound();
    return result;
  }

  override generateAudio(): AudioBufferSourceNode[] {
    const sources: AudioBufferSourceNode[] = [];
    const ctx = this._config.audioContext;
    const sampleRate = ctx.sampleRate;
    const duration = 0.8;
    if (this._playMode === 'melodic') {
      for (let n = 0; n < 2; n++) {
        const pitch = n === 0 ? this._note1 : this._note2;
        const frameCount = Math.ceil(duration * sampleRate);
        const buffer = ctx.createBuffer(1, frameCount, sampleRate);
        const data = buffer.getChannelData(0);
        const freq = midiToFrequency(pitch);
        for (let i = 0; i < frameCount; i++) { const t = i / sampleRate; const envelope = Math.max(0, 1 - t / duration); data[i] = Math.sin(2 * Math.PI * freq * t) * 0.4 * envelope; }
        const source = ctx.createBufferSource();
        source.buffer = buffer; source.connect(this._config.masterGain); source.start(this._startTime + n * (duration + 0.1));
        sources.push(source);
      }
    } else {
      const frameCount = Math.ceil(duration * sampleRate);
      const buffer = ctx.createBuffer(1, frameCount, sampleRate);
      const data = buffer.getChannelData(0);
      const freq1 = midiToFrequency(this._note1);
      const freq2 = midiToFrequency(this._note2);
      for (let i = 0; i < frameCount; i++) { const t = i / sampleRate; const envelope = Math.max(0, 1 - t / duration); data[i] = (Math.sin(2 * Math.PI * freq1 * t) + Math.sin(2 * Math.PI * freq2 * t)) * 0.3 * envelope; }
      const source = ctx.createBufferSource();
      source.buffer = buffer; source.connect(this._config.masterGain); source.start(this._startTime);
      sources.push(source);
    }
    return sources;
  }

  override getState(): Record<string, unknown> {
    return { mode: 'interval', note1: this._note1, note1Name: midiToNoteName(this._note1, true), note2: this._note2, note2Name: midiToNoteName(this._note2, true), playMode: this._playMode, options: this.currentOptions, round: this._round, totalRounds: this._totalRounds, score: this._score.score, combo: this._score.combo, health: this._score.health };
  }
}

// ============================================================================
// SightReadingGame - 视奏游戏
// ============================================================================

/**
 * SightReadingGame 实现视奏训练：
 * 在屏幕上显示五线谱或简谱音符，用户在虚拟钢琴或键盘上弹奏对应音高，实时判定音准与时值。
 */
export class SightReadingGame extends BaseGameMode {
  private _displayNotes: GameNote[] = [];
  private _currentNoteIndex: number = 0;
  useStaff: boolean = true;
  useNumbered: boolean = false;
  private _currentBar: number = 0;
  private _totalBars: number = 4;
  private _timingWindow: number = 200;

  constructor(level: GameLevel, config: GameConfig) { super(level, config); this._totalBars = Math.ceil(level.notes.length / 4); this._prepareDisplayNotes(); }
  private _prepareDisplayNotes(): void { this._displayNotes = this._level.notes.map(n => ({ ...n })); this._currentNoteIndex = 0; this._currentBar = 0; }

  override start(): void { super.start(); this._prepareDisplayNotes(); }
  override update(dt: number): void {
    if (!this._isRunning) return;
    this._currentTime = this._config.audioContext.currentTime - this._startTime;
    while (this._currentNoteIndex < this._displayNotes.length) {
      const note = this._displayNotes[this._currentNoteIndex];
      const diffMs = (this._currentTime - note.time) * 1000;
      if (diffMs > this._timingWindow && !note.hit && note.judgment === null) { note.judgment = Judgment.MISS; this._score.addJudgment(Judgment.MISS); this._currentNoteIndex++; } else break;
    }
    if (this._level.timeLimit > 0 && this._currentTime >= this._level.timeLimit) this._isRunning = false;
    if (this._score.health <= 0) this._isRunning = false;
    if (this._currentNoteIndex >= this._displayNotes.length) this._isRunning = false;
  }

  override processInput(input: { note: number; timestamp?: number }): JudgmentResult | null {
    if (!this._isRunning || this._currentNoteIndex >= this._displayNotes.length) return null;
    const targetNote = this._displayNotes[this._currentNoteIndex];
    const now = input.timestamp ?? this._config.audioContext.currentTime - this._startTime;
    const diffMs = Math.abs((now - targetNote.time) * 1000);
    if (input.note !== targetNote.pitch) return null;
    const windows = this._level.judgmentWindows;
    let judgment: Judgment;
    if (diffMs <= windows[0]) judgment = Judgment.PERFECT;
    else if (diffMs <= windows[1]) judgment = Judgment.GREAT;
    else if (diffMs <= windows[2]) judgment = Judgment.GOOD;
    else if (diffMs <= windows[3]) judgment = Judgment.BAD;
    else judgment = Judgment.MISS;
    targetNote.hit = true; targetNote.judgment = judgment;
    this._currentNoteIndex++;
    const result = this._score.addJudgment(judgment);
    result.deviation = diffMs;
    return result;
  }

  override generateAudio(): AudioBufferSourceNode[] {
    const sources: AudioBufferSourceNode[] = [];
    const ctx = this._config.audioContext;
    const sampleRate = ctx.sampleRate;
    const beatDuration = 60 / this._level.bpm;
    const beats = this._displayNotes.length;
    for (let i = 0; i < beats; i++) {
      const isDownbeat = i % this._level.beatsPerBar === 0;
      const duration = 0.05;
      const frameCount = Math.ceil(duration * sampleRate);
      const buffer = ctx.createBuffer(1, frameCount, sampleRate);
      const data = buffer.getChannelData(0);
      const freq = isDownbeat ? 1000 : 800;
      for (let j = 0; j < frameCount; j++) { const t = j / sampleRate; data[j] = Math.sin(2 * Math.PI * freq * t) * 0.3 * Math.exp(-t * 40); }
      const source = ctx.createBufferSource();
      source.buffer = buffer; source.connect(this._config.masterGain); source.start(this._startTime + i * beatDuration);
      sources.push(source);
    }
    return sources;
  }

  override getState(): Record<string, unknown> {
    return { mode: 'sight', displayNotes: this._displayNotes.map((n, i) => ({ ...n, noteName: midiToNoteName(n.pitch, true), isCurrent: i === this._currentNoteIndex })), currentNoteIndex: this._currentNoteIndex, totalNotes: this._displayNotes.length, useStaff: this.useStaff, useNumbered: this.useNumbered, score: this._score.score, combo: this._score.combo, health: this._score.health };
  }
}

// ============================================================================
// EarTrainingGame - 综合练耳
// ============================================================================

/**
 * EarTrainingGame 实现综合练耳训练：
 * 随机混合音高/和弦/音程/节奏题目，全面考验用户的音乐听力能力。
 */
export class EarTrainingGame extends BaseGameMode {
  private _subModes: ('pitch' | 'chord' | 'interval' | 'rhythm')[] = [];
  private _currentSubMode: 'pitch' | 'chord' | 'interval' | 'rhythm' = 'pitch';
  private _round: number = 0;
  private _totalRounds: number = 12;
  private _pitchTarget: number = 60;
  private _chordTarget: string = 'major';
  private _chordRoot: number = 60;
  private _intervalSemitones: number = 0;
  private _intervalNote1: number = 60;
  private _rhythmPattern: boolean[] = [];

  constructor(level: GameLevel, config: GameConfig) { super(level, config); this._totalRounds = level.notes.length || 12; this._subModes = ['pitch', 'chord', 'interval', 'rhythm']; this._setupRound(); }
  private _setupRound(): void {
    this._currentSubMode = this._subModes[Math.floor(Math.random() * this._subModes.length)];
    switch (this._currentSubMode) {
      case 'pitch': this._pitchTarget = 48 + Math.floor(Math.random() * 36); break;
      case 'chord': { const chords = ['major', 'minor', 'dim', 'aug', 'maj7', 'min7', 'dom7']; this._chordTarget = chords[Math.floor(Math.random() * chords.length)]; this._chordRoot = 48 + Math.floor(Math.random() * 24); break; }
      case 'interval': { const intervals = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]; this._intervalSemitones = intervals[Math.floor(Math.random() * intervals.length)]; this._intervalNote1 = 48 + Math.floor(Math.random() * 24); break; }
      case 'rhythm': { const patternLength = 4 + Math.floor(Math.random() * 4); this._rhythmPattern = Array.from({ length: patternLength }, () => Math.random() > 0.4); break; }
    }
  }

  override start(): void { super.start(); this._round = 0; this._setupRound(); }
  override update(dt: number): void {
    if (!this._isRunning) return;
    this._currentTime = this._config.audioContext.currentTime - this._startTime;
    if (this._level.timeLimit > 0 && this._currentTime >= this._level.timeLimit) this._isRunning = false;
    if (this._score.health <= 0) this._isRunning = false;
  }

  override processInput(input: { type: string; value: unknown }): JudgmentResult | null {
    if (!this._isRunning) return null;
    let isCorrect = false;
    switch (this._currentSubMode) {
      case 'pitch': { const userPitch = input.value as number; const cents = Math.abs(1200 * Math.log2(midiToFrequency(userPitch) / midiToFrequency(this._pitchTarget))); isCorrect = cents <= 30; break; }
      case 'chord': isCorrect = input.value === this._chordTarget; break;
      case 'interval': { const intervalNames: Record<number, string> = { 0: '纯一度', 1: '小二度', 2: '大二度', 3: '小三度', 4: '大三度', 5: '纯四度', 6: '增四度/减五度', 7: '纯五度', 8: '小六度', 9: '大六度', 10: '小七度', 11: '大七度', 12: '纯八度' }; isCorrect = input.value === intervalNames[this._intervalSemitones]; break; }
      case 'rhythm': isCorrect = JSON.stringify(input.value) === JSON.stringify(this._rhythmPattern); break;
    }
    const judgment = isCorrect ? Judgment.PERFECT : Judgment.MISS;
    const result = this._score.addJudgment(judgment);
    this._round++;
    if (this._round >= this._totalRounds) this._isRunning = false; else this._setupRound();
    return result;
  }

  override generateAudio(): AudioBufferSourceNode[] {
    const sources: AudioBufferSourceNode[] = [];
    const ctx = this._config.audioContext;
    const sampleRate = ctx.sampleRate;
    switch (this._currentSubMode) {
      case 'pitch': {
        const duration = 1.0, frameCount = Math.ceil(duration * sampleRate), buffer = ctx.createBuffer(1, frameCount, sampleRate), data = buffer.getChannelData(0), freq = midiToFrequency(this._pitchTarget);
        for (let i = 0; i < frameCount; i++) { const t = i / sampleRate; data[i] = Math.sin(2 * Math.PI * freq * t) * 0.4 * Math.max(0, 1 - t / duration); }
        const source = ctx.createBufferSource(); source.buffer = buffer; source.connect(this._config.masterGain); source.start(this._startTime); sources.push(source); break;
      }
      case 'chord': {
        const duration = 1.5, frameCount = Math.ceil(duration * sampleRate), buffer = ctx.createBuffer(1, frameCount, sampleRate), data = buffer.getChannelData(0);
        const structure = ChordGame.CHORD_STRUCTURES[this._chordTarget] ?? [0, 4, 7];
        const freqs = structure.map(s => midiToFrequency(this._chordRoot + s));
        for (let i = 0; i < frameCount; i++) { const t = i / sampleRate; let s = 0; for (const f of freqs) s += Math.sin(2 * Math.PI * f * t) * 0.25; data[i] = s * Math.max(0, 1 - t / duration); }
        const source = ctx.createBufferSource(); source.buffer = buffer; source.connect(this._config.masterGain); source.start(this._startTime); sources.push(source); break;
      }
      case 'interval': {
        const duration = 0.8;
        for (let n = 0; n < 2; n++) {
          const pitch = n === 0 ? this._intervalNote1 : this._intervalNote1 + this._intervalSemitones;
          const frameCount = Math.ceil(duration * sampleRate), buffer = ctx.createBuffer(1, frameCount, sampleRate), data = buffer.getChannelData(0), freq = midiToFrequency(pitch);
          for (let i = 0; i < frameCount; i++) { const t = i / sampleRate; data[i] = Math.sin(2 * Math.PI * freq * t) * 0.4 * Math.max(0, 1 - t / duration); }
          const source = ctx.createBufferSource(); source.buffer = buffer; source.connect(this._config.masterGain); source.start(this._startTime + n * (duration + 0.1)); sources.push(source);
        }
        break;
      }
      case 'rhythm': {
        const beatDuration = 0.4;
        for (let i = 0; i < this._rhythmPattern.length; i++) {
          if (!this._rhythmPattern[i]) continue;
          const duration = 0.1, frameCount = Math.ceil(duration * sampleRate), buffer = ctx.createBuffer(1, frameCount, sampleRate), data = buffer.getChannelData(0);
          for (let j = 0; j < frameCount; j++) { const t = j / sampleRate; data[j] = Math.sin(2 * Math.PI * 800 * t) * 0.3 * Math.exp(-t * 30); }
          const source = ctx.createBufferSource(); source.buffer = buffer; source.connect(this._config.masterGain); source.start(this._startTime + i * beatDuration); sources.push(source);
        }
        break;
      }
    }
    return sources;
  }

  override getState(): Record<string, unknown> {
    return { mode: 'ear', subMode: this._currentSubMode, round: this._round, totalRounds: this._totalRounds, score: this._score.score, combo: this._score.combo, health: this._score.health, subState: { pitchTarget: this._currentSubMode === 'pitch' ? this._pitchTarget : null, chordOptions: this._currentSubMode === 'chord' ? ['major', 'minor', 'dim', 'aug', 'maj7', 'min7', 'dom7'].sort(() => Math.random() - 0.5).slice(0, 4) : null, intervalOptions: this._currentSubMode === 'interval' ? ['纯一度', '小二度', '大二度', '小三度', '大三度', '纯四度', '纯五度', '小六度', '大六度', '小七度', '大七度', '纯八度'].sort(() => Math.random() - 0.5).slice(0, 4) : null, rhythmLength: this._currentSubMode === 'rhythm' ? this._rhythmPattern.length : null } };
  }
}

// ============================================================================
// MusicGameEngine - 游戏引擎主类
// ============================================================================

/**
 * MusicGameEngine 是青鸾音乐游戏的核心引擎，负责：
 * - 管理所有游戏模式实例的创建与切换
 * - 维护全局游戏状态、关卡进度、成就与排行榜
 * - 提供音频生成、输入处理、统计查询的统一接口
 * - 支持关卡系统：初级(10关)/中级(15关)/高级(20关)/专家(25关)/大师(无限)
 */
export class MusicGameEngine {
  private _audioContext: AudioContext;
  private _masterGain: GainNode;
  private _config: GameConfig;
  private _currentMode: BaseGameMode | null = null;
  private _currentModeType: GameMode | null = null;
  private _currentLevel: GameLevel | null = null;
  private _currentDifficulty: Difficulty = Difficulty.BEGINNER;
  private _levelProgress: Map<string, LevelProgress> = new Map();
  private _achievement: Achievement;
  private _leaderboard: Leaderboard;
  private _globalStats: GameStats = { totalScore: 0, maxCombo: 0, perfectCount: 0, greatCount: 0, goodCount: 0, badCount: 0, missCount: 0, totalNotes: 0, playTime: 0, mode: GameMode.RHYTHM, difficulty: Difficulty.BEGINNER, levelsCleared: 0, gamesPlayed: 0 };
  private _playTimeStart: number = 0;
  private _activeSources: AudioBufferSourceNode[] = [];
  private _unlockedDifficulties: Set<Difficulty> = new Set([Difficulty.BEGINNER]);
  playerName: string = 'Player';

  constructor() {
    this._audioContext = new AudioContext();
    this._masterGain = this._audioContext.createGain();
    this._masterGain.gain.value = 0.8;
    this._masterGain.connect(this._audioContext.destination);
    this._config = { audioContext: this._audioContext, masterGain: this._masterGain, sampleRate: this._audioContext.sampleRate, bufferSize: 2048, lookahead: 0.1 };
    this._achievement = new Achievement();
    this._leaderboard = new Leaderboard();
    this._loadProgress();
  }

  get audioContext(): AudioContext { return this._audioContext; }
  get masterGain(): GainNode { return this._masterGain; }
  get achievement(): Achievement { return this._achievement; }
  get leaderboard(): Leaderboard { return this._leaderboard; }
  get globalStats(): GameStats { return { ...this._globalStats }; }
  get unlockedDifficulties(): Difficulty[] { return Array.from(this._unlockedDifficulties); }

  private _progressKey(mode: GameMode, difficulty: Difficulty): string { return `${mode}_${difficulty}`; }

  private _loadProgress(): void {
    try {
      const raw = localStorage.getItem('qingluan_game_progress');
      if (raw) { const data = JSON.parse(raw) as Record<string, LevelProgress>; for (const key of Object.keys(data)) this._levelProgress.set(key, data[key]); }
      const diffRaw = localStorage.getItem('qingluan_unlocked_difficulties');
      if (diffRaw) { const diffs = JSON.parse(diffRaw) as Difficulty[]; this._unlockedDifficulties = new Set(diffs); }
    } catch { /* 忽略 */ }
  }

  private _saveProgress(): void {
    try {
      const obj: Record<string, LevelProgress> = {};
      for (const [key, progress] of this._levelProgress.entries()) obj[key] = progress;
      localStorage.setItem('qingluan_game_progress', JSON.stringify(obj));
      localStorage.setItem('qingluan_unlocked_difficulties', JSON.stringify(Array.from(this._unlockedDifficulties)));
    } catch { /* 忽略 */ }
  }

  /** 创建指定模式与难度的关卡 */
  createLevel(mode: GameMode, difficulty: Difficulty, levelIndex: number): GameLevel {
    const maxLevels = GameLevel.getLevelCount(difficulty);
    const safeIndex = Math.min(levelIndex, maxLevels === Infinity ? levelIndex : maxLevels - 1);
    const bpm = 80 + safeIndex * 3 + (difficulty === Difficulty.MASTER ? Math.random() * 40 : 0);
    const bars = 4 + Math.floor(safeIndex / 2);
    const notes = GameLevel.generateNotes(mode, difficulty, bpm, bars);
    return new GameLevel({ id: `${mode}_${difficulty}_${safeIndex}`, name: `${difficulty.toUpperCase()} 第 ${safeIndex + 1} 关`, mode, difficulty, bpm, beatsPerBar: 4, notes, judgmentWindows: GameLevel.getDefaultWindows(difficulty), clearScore: 50000 + safeIndex * 2000, clearRank: safeIndex < 3 ? Rank.C : safeIndex < 6 ? Rank.B : Rank.A, description: `${mode} 模式 ${difficulty} 难度第 ${safeIndex + 1} 关`, duration: bars * (60 / bpm) * 4, lives: 5, timeLimit: 0 });
  }

  /** 启动指定模式与关卡 */
  startGame(mode: GameMode, difficulty: Difficulty, levelIndex: number = 0): BaseGameMode {
    if (!this._unlockedDifficulties.has(difficulty)) throw new Error(`难度 ${difficulty} 尚未解锁`);
    const level = this.createLevel(mode, difficulty, levelIndex);
    this._currentLevel = level; this._currentDifficulty = difficulty; this._currentModeType = mode;
    this._cleanupAudio();
    switch (mode) {
      case GameMode.RHYTHM: this._currentMode = new RhythmGame(level, this._config); break;
      case GameMode.PITCH: this._currentMode = new PitchGame(level, this._config); break;
      case GameMode.CHORD: this._currentMode = new ChordGame(level, this._config); break;
      case GameMode.SCALE: this._currentMode = new ScaleGame(level, this._config); break;
      case GameMode.INTERVAL: this._currentMode = new IntervalGame(level, this._config); break;
      case GameMode.SIGHT_READING: this._currentMode = new SightReadingGame(level, this._config); break;
      case GameMode.EAR_TRAINING: this._currentMode = new EarTrainingGame(level, this._config); break;
      default: throw new Error(`未知游戏模式: ${mode}`);
    }
    this._playTimeStart = Date.now();
    this._currentMode.start();
    const sources = this._currentMode.generateAudio();
    this._activeSources.push(...sources);
    return this._currentMode;
  }

  /** 更新当前游戏状态（应由动画循环每帧调用） */
  update(dt: number): void { if (this._currentMode && this._currentMode.isRunning) this._currentMode.update(dt); }

  /** 处理用户输入并返回判定结果 */
  processInput(input: unknown): JudgmentResult | null { if (!this._currentMode) return null; return this._currentMode.processInput(input); }

  /** 结束当前游戏并进行结算 */
  endGame(): GameStats {
    if (!this._currentMode || !this._currentLevel) throw new Error('当前没有进行中的游戏');
    this._currentMode.stop();
    const playTime = (Date.now() - this._playTimeStart) / 1000;
    const stats = this._currentMode.score.toStats(this._currentModeType!, this._currentDifficulty, playTime);
    this._globalStats.gamesPlayed++;
    this._globalStats.totalScore += stats.totalScore;
    this._globalStats.maxCombo = Math.max(this._globalStats.maxCombo, stats.maxCombo);
    this._globalStats.perfectCount += stats.perfectCount;
    this._globalStats.greatCount += stats.greatCount;
    this._globalStats.goodCount += stats.goodCount;
    this._globalStats.badCount += stats.badCount;
    this._globalStats.missCount += stats.missCount;
    this._globalStats.totalNotes += stats.totalNotes;
    this._globalStats.playTime += playTime;
    const isCleared = this._currentMode.score.isCleared(this._currentLevel.clearScore, this._currentLevel.clearRank);
    if (isCleared) {
      const key = this._progressKey(this._currentModeType!, this._currentDifficulty);
      const progress = this._levelProgress.get(key) ?? { currentLevel: 0, maxLevels: GameLevel.getLevelCount(this._currentDifficulty), unlockedDifficulties: Array.from(this._unlockedDifficulties), stars: 0 };
      progress.currentLevel = Math.max(progress.currentLevel, this._getCurrentLevelIndex() + 1);
      progress.stars = Math.min(progress.stars + 1, 3);
      this._levelProgress.set(key, progress);
      this._globalStats.levelsCleared++;
      this._checkDifficultyUnlock();
      this._saveProgress();
    }
    this._leaderboard.submit({ playerName: this.playerName, score: stats.totalScore, rank: this._currentMode.score.getRank(), combo: stats.maxCombo, accuracy: this._currentMode.score.getAccuracy(), date: Date.now(), mode: this._currentModeType!, difficulty: this._currentDifficulty });
    const mergedStats: GameStats = { ...this._globalStats, ...stats };
    this._achievement.checkAndUnlock(mergedStats);
    this._cleanupAudio();
    return mergedStats;
  }

  private _getCurrentLevelIndex(): number {
    if (!this._currentLevel) return 0;
    const parts = this._currentLevel.id.split('_');
    return parseInt(parts[parts.length - 1], 10) || 0;
  }

  private _checkDifficultyUnlock(): void {
    const unlockOrder = [Difficulty.BEGINNER, Difficulty.INTERMEDIATE, Difficulty.ADVANCED, Difficulty.EXPERT, Difficulty.MASTER];
    for (let i = 1; i < unlockOrder.length; i++) {
      const prevDiff = unlockOrder[i - 1], nextDiff = unlockOrder[i];
      if (this._unlockedDifficulties.has(nextDiff)) continue;
      let allCleared = true;
      for (const mode of Object.values(GameMode)) {
        const key = this._progressKey(mode, prevDiff);
        const progress = this._levelProgress.get(key);
        const maxLevels = GameLevel.getLevelCount(prevDiff);
        if (!progress || progress.currentLevel < maxLevels) { allCleared = false; break; }
      }
      if (allCleared) this._unlockedDifficulties.add(nextDiff);
    }
  }

  getLevelProgress(mode: GameMode, difficulty: Difficulty): LevelProgress {
    const key = this._progressKey(mode, difficulty);
    return this._levelProgress.get(key) ?? { currentLevel: 0, maxLevels: GameLevel.getLevelCount(difficulty), unlockedDifficulties: Array.from(this._unlockedDifficulties), stars: 0 };
  }

  /**
   * 生成游戏所需音频（外部调用接口）
   * @param mode 游戏模式
   * @param params 音频参数（pitch, chord, interval等）
   */
  generateGameAudio(mode: GameMode, params: Record<string, unknown>): AudioBuffer {
    const ctx = this._audioContext;
    const sampleRate = ctx.sampleRate;
    const duration = (params.duration as number) ?? 2.0;
    const frameCount = Math.ceil(duration * sampleRate);
    const buffer = ctx.createBuffer(1, frameCount, sampleRate);
    const data = buffer.getChannelData(0);
    switch (mode) {
      case GameMode.RHYTHM: {
        const bpm = (params.bpm as number) ?? 120;
        const beatDuration = 60 / bpm;
        for (let i = 0; i < frameCount; i++) {
          const t = i / sampleRate, beatIndex = Math.floor(t / beatDuration), beatPhase = (t % beatDuration) / beatDuration;
          if (beatPhase < 0.05) { const freq = beatIndex % 4 === 0 ? 1000 : 800; data[i] = Math.sin(2 * Math.PI * freq * t) * 0.3 * (1 - beatPhase / 0.05); }
        }
        break;
      }
      case GameMode.PITCH: {
        const pitch = (params.pitch as number) ?? 60, freq = midiToFrequency(pitch);
        for (let i = 0; i < frameCount; i++) { const t = i / sampleRate; data[i] = Math.sin(2 * Math.PI * freq * t) * 0.5 * Math.max(0, 1 - t / duration); }
        break;
      }
      case GameMode.CHORD: {
        const root = (params.root as number) ?? 60, type = (params.chordType as string) ?? 'major';
        const structure = ChordGame.CHORD_STRUCTURES[type] ?? [0, 4, 7];
        for (let i = 0; i < frameCount; i++) {
          const t = i / sampleRate, env = Math.max(0, 1 - t / duration);
          let sample = 0;
          for (const s of structure) sample += Math.sin(2 * Math.PI * midiToFrequency(root + s) * t) * 0.25;
          data[i] = sample * env;
        }
        break;
      }
      case GameMode.INTERVAL: {
        const note1 = (params.note1 as number) ?? 60, note2 = (params.note2 as number) ?? 64, playMode = (params.playMode as string) ?? 'melodic';
        if (playMode === 'melodic') {
          const halfDuration = duration / 2;
          for (let i = 0; i < frameCount; i++) { const t = i / sampleRate; const freq = t < halfDuration ? midiToFrequency(note1) : midiToFrequency(note2); data[i] = Math.sin(2 * Math.PI * freq * t) * 0.4 * Math.max(0, 1 - (t % halfDuration) / halfDuration); }
        } else {
          for (let i = 0; i < frameCount; i++) { const t = i / sampleRate; data[i] = (Math.sin(2 * Math.PI * midiToFrequency(note1) * t) + Math.sin(2 * Math.PI * midiToFrequency(note2) * t)) * 0.3 * Math.max(0, 1 - t / duration); }
        }
        break;
      }
      default: { for (let i = 0; i < frameCount; i++) data[i] = 0; }
    }
    return buffer;
  }

  getCurrentState(): Record<string, unknown> | null { if (!this._currentMode) return null; return this._currentMode.getState(); }
  getCurrentScore(): GameScore | null { if (!this._currentMode) return null; return this._currentMode.score; }
  getStats(): GameStats { return { ...this._globalStats }; }
  isDifficultyUnlocked(difficulty: Difficulty): boolean { return this._unlockedDifficulties.has(difficulty); }

  /** 重置所有进度（慎用） */
  resetAllProgress(): void {
    this._levelProgress.clear();
    this._unlockedDifficulties = new Set([Difficulty.BEGINNER]);
    this._globalStats = { totalScore: 0, maxCombo: 0, perfectCount: 0, greatCount: 0, goodCount: 0, badCount: 0, missCount: 0, totalNotes: 0, playTime: 0, mode: GameMode.RHYTHM, difficulty: Difficulty.BEGINNER, levelsCleared: 0, gamesPlayed: 0 };
    this._saveProgress();
    this._leaderboard.clearAll();
  }

  private _cleanupAudio(): void {
    for (const source of this._activeSources) { try { source.stop(); source.disconnect(); } catch { /* 忽略 */ } }
    this._activeSources = [];
  }

  /** 销毁引擎，释放资源 */
  destroy(): void {
    this._cleanupAudio();
    if (this._audioContext.state !== 'closed') this._audioContext.close();
  }
}

// ============================================================================
// 辅助函数
// ============================================================================

/** 根据准确率与Miss数计算评级 */
export function calculateRank(accuracy: number, missCount: number, totalNotes: number): Rank {
  if (accuracy >= 0.98 && missCount === 0) return Rank.SSS;
  if (accuracy >= 0.95 && missCount <= 1) return Rank.SS;
  if (accuracy >= 0.90) return Rank.S;
  if (accuracy >= 0.80) return Rank.A;
  if (accuracy >= 0.70) return Rank.B;
  if (accuracy >= 0.60) return Rank.C;
  if (accuracy >= 0.50) return Rank.D;
  return Rank.F;
}

/** 生成虚拟钢琴键盘映射（支持4个八度） */
export function generatePianoKeyMap(startOctave: number = 3): KeyMapping[] {
  const mappings: KeyMapping[] = [];
  const keys = ['a', 'w', 's', 'e', 'd', 'f', 't', 'g', 'y', 'h', 'u', 'j', 'k', 'o', 'l', 'p', ';', "'"];
  const semitones = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
  const baseMidi = startOctave * 12 + 12;
  for (let i = 0; i < keys.length; i++) mappings.push({ key: keys[i], note: baseMidi + semitones[i], label: midiToNoteName(baseMidi + semitones[i], true) });
  return mappings;
}

/** 生成五线谱Y坐标（简化表示） */
export function staffYForPitch(pitch: number, clef: 'treble' | 'bass' = 'treble'): number {
  const middleC = clef === 'treble' ? 60 : 48;
  return -(pitch - middleC) * 0.5;
}

export default MusicGameEngine;
