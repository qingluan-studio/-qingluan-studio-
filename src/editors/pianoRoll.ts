/**
 * @file pianoRoll.ts
 * @description 青鸾数字音频工作站 - 钢琴卷帘编辑器核心模块
 * 提供音符事件管理、MIDI 导入导出、量化、人性化、移调、镜像等高级编辑功能，
 * 同时内置钢琴键盘映射与多选/框选逻辑，支持前端渲染数据生成。
 * @module qingluan-daw/editors/pianoRoll
 * @version 2.0.0
 */

import { clamp, lerp, midiToFrequency } from '../utils/audioUtils.js';

// =============================================================================
// 常量定义
// =============================================================================

/** 统一采样率：44100 Hz */
export const SAMPLE_RATE = 44100;

/** 默认每拍 Tick 数（标准 MIDI 四分音符分辨率） */
export const DEFAULT_TICKS_PER_BEAT = 960;

/** 最小音符持续时间（Tick） */
export const MIN_NOTE_DURATION_TICKS = 1;

/** 最大 MIDI 音符编号 */
export const MAX_MIDI_NOTE = 127;

/** 最小 MIDI 音符编号 */
export const MIN_MIDI_NOTE = 0;

/** 最大 MIDI 通道编号 */
export const MAX_MIDI_CHANNEL = 15;

/** 最小 MIDI 通道编号 */
export const MIN_MIDI_CHANNEL = 0;

/** 默认音符力度 */
export const DEFAULT_VELOCITY = 100;

/** 量化强度默认值（0~1，1 表示完全量化） */
export const DEFAULT_QUANTIZE_STRENGTH = 1.0;

/** 人性化最大时间偏移（Tick） */
export const DEFAULT_HUMANIZE_TIME_TICKS = 30;

/** 人性化最大力度偏移 */
export const DEFAULT_HUMANIZE_VELOCITY = 15;

// =============================================================================
// 类型定义
// =============================================================================

/**
 * 音符事件数据结构
 * @interface NoteEvent
 */
export interface NoteEvent {
  /** 唯一标识符 */
  id: string;
  /** MIDI 音高（0~127） */
  pitch: number;
  /** 演奏力度（0~127） */
  velocity: number;
  /** 起始 Tick */
  startTick: number;
  /** 持续 Tick 数 */
  durationTicks: number;
  /** MIDI 通道（0~15） */
  channel: number;
  /** 可选：音符名称缓存 */
  name?: string;
  /** 可选：是否选中 */
  selected?: boolean;
}

/**
 * MIDI 事件类型枚举
 */
export type MidiEventType = 'noteOn' | 'noteOff' | 'controlChange' | 'pitchBend' | 'afterTouch' | 'programChange';

/**
 * MIDI 事件数据结构（用于导入导出）
 * @interface MidiEvent
 */
export interface MidiEvent {
  /** 事件类型 */
  type: MidiEventType;
  /** 时间戳（Tick） */
  tick: number;
  /** MIDI 通道（0~15） */
  channel: number;
  /** 音符编号或控制器编号 */
  note?: number;
  /** 力度或控制器值 */
  velocity?: number;
  /** 其他参数值 */
  value?: number;
  /** 关联的音符 ID（内部使用） */
  noteId?: string;
}

/**
 * 钢琴卷帘网格单元格
 * @interface PianoRollCell
 */
export interface PianoRollCell {
  /** 行索引（对应音高） */
  row: number;
  /** 列索引（对应 Tick） */
  col: number;
  /** 单元格类型 */
  cellType: 'whiteKey' | 'blackKey' | 'note' | 'gridLine' | 'beatLine' | 'barLine';
  /** 关联音符 ID */
  noteId?: string;
  /** 显示文本 */
  text?: string;
}

/**
 * 钢琴卷帘渲染数据
 * @interface PianoRollGridData
 */
export interface PianoRollGridData {
  /** 可见行范围 */
  visibleRows: { start: number; end: number };
  /** 可见列范围 */
  visibleCols: { start: number; end: number };
  /** 单元格数组 */
  cells: PianoRollCell[];
  /** 音符渲染信息 */
  noteRects: NoteRect[];
  /** 拍号线位置 */
  beatLines: number[];
  /** 小节线位置 */
  barLines: number[];
}

/**
 * 音符矩形（供前端 Canvas/SVG 渲染）
 * @interface NoteRect
 */
export interface NoteRect {
  /** 关联音符 ID */
  id: string;
  /** 左上角 X（Tick 坐标） */
  x: number;
  /** 左上角 Y（行坐标） */
  y: number;
  /** 宽度（Tick） */
  width: number;
  /** 高度（像素或行高） */
  height: number;
  /** 音高 */
  pitch: number;
  /** 力度（用于颜色深浅） */
  velocity: number;
  /** 是否选中 */
  selected: boolean;
  /** 通道号（用于颜色区分） */
  channel: number;
  /** 音名 */
  name: string;
}

/**
 * 选区矩形（框选）
 * @interface SelectionRect
 */
export interface SelectionRect {
  /** 起始 Tick */
  startTick: number;
  /** 结束 Tick */
  endTick: number;
  /** 起始音高 */
  startPitch: number;
  /** 结束音高 */
  endPitch: number;
}

/**
 * 量化选项
 * @interface QuantizeOptions
 */
export interface QuantizeOptions {
  /** 网格大小（Tick） */
  grid: number;
  /** 量化强度（0~1） */
  strength?: number;
  /** 是否量化时值 */
  quantizeDuration?: boolean;
  /** 是否量化力度（Swing 等） */
  quantizeVelocity?: boolean;
}

/**
 * 人性化选项
 * @interface HumanizeOptions
 */
export interface HumanizeOptions {
  /** 时间偏移量（Tick） */
  timeAmount?: number;
  /** 力度偏移量 */
  velocityAmount?: number;
  /** 随机种子（可选，用于可重复结果） */
  seed?: number;
  /** 是否仅影响选中音符 */
  onlySelected?: boolean;
}

// =============================================================================
// 钢琴键盘映射
// =============================================================================

/** 基本音名数组（十二平均律） */
const PITCH_CLASSES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** 音名中文映射（用于本地化显示） */
const PITCH_CLASS_NAMES_CN: Record<string, string> = {
  'C': 'do',
  'C#': 'do#',
  'D': 're',
  'D#': 're#',
  'E': 'mi',
  'F': 'fa',
  'F#': 'fa#',
  'G': 'sol',
  'G#': 'sol#',
  'A': 'la',
  'A#': 'la#',
  'B': 'si',
};

/**
 * 判断指定 MIDI 音符是否为黑键
 * @param pitch - MIDI 音符编号（0~127）
 * @returns 是否为黑键
 */
export function isBlackKey(pitch: number): boolean {
  if (pitch < MIN_MIDI_NOTE || pitch > MAX_MIDI_NOTE) return false;
  const pc = pitch % 12;
  // C#(1), D#(3), F#(6), G#(8), A#(10)
  return [1, 3, 6, 8, 10].includes(pc);
}

/**
 * 判断指定 MIDI 音符是否为白键
 * @param pitch - MIDI 音符编号（0~127）
 * @returns 是否为白键
 */
export function isWhiteKey(pitch: number): boolean {
  return pitch >= MIN_MIDI_NOTE && pitch <= MAX_MIDI_NOTE && !isBlackKey(pitch);
}

/**
 * 将 MIDI 音符编号转换为音名字符串（如 "C4", "F#5"）
 * @param pitch - MIDI 音符编号（0~127）
 * @param useSharps - 是否使用升号（true 使用 #，false 使用 b）
 * @returns 音名字符串
 */
export function midiToNoteName(pitch: number, useSharps: boolean = true): string {
  if (pitch < MIN_MIDI_NOTE || pitch > MAX_MIDI_NOTE) return '---';
  const pc = pitch % 12;
  const octave = Math.floor(pitch / 12) - 1;
  let name = PITCH_CLASSES[pc];
  if (!useSharps && name.includes('#')) {
    // 转换为降号表示
    const flatMap: Record<string, string> = {
      'C#': 'Db',
      'D#': 'Eb',
      'F#': 'Gb',
      'G#': 'Ab',
      'A#': 'Bb',
    };
    name = flatMap[name] || name;
  }
  return `${name}${octave}`;
}

/**
 * 将音名字符串转换为 MIDI 音符编号
 * @param noteName - 音名字符串，如 "C4", "F#5", "Bb3"
 * @returns MIDI 音符编号，解析失败返回 -1
 */
export function noteNameToMidi(noteName: string): number {
  const trimmed = noteName.trim();
  const match = trimmed.match(/^([A-Ga-g])(#|b|♯|♭)?(-?\d+)$/);
  if (!match) return -1;
  const base = match[1].toUpperCase();
  const accidental = match[2] || '';
  const octave = parseInt(match[3], 10);

  const baseMap: Record<string, number> = {
    'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11,
  };
  let pc = baseMap[base];
  if (pc === undefined) return -1;

  if (accidental === '#' || accidental === '♯') pc += 1;
  else if (accidental === 'b' || accidental === '♭') pc -= 1;

  const midi = (octave + 1) * 12 + pc;
  return clamp(midi, MIN_MIDI_NOTE, MAX_MIDI_NOTE);
}

/**
 * 获取音高的中文唱名
 * @param pitch - MIDI 音符编号
 * @returns 中文唱名
 */
export function getPitchNameCN(pitch: number): string {
  const name = midiToNoteName(pitch, true);
  const pc = name.replace(/-?\d+$/, '');
  return PITCH_CLASS_NAMES_CN[pc] || pc;
}

/**
 * 获取完整的键盘键标签（包含音名、频率、唱名）
 * @param pitch - MIDI 音符编号
 * @returns 标签对象
 */
export function getKeyLabel(pitch: number): { noteName: string; frequency: number; cnName: string } {
  return {
    noteName: midiToNoteName(pitch),
    frequency: midiToFrequency(pitch),
    cnName: getPitchNameCN(pitch),
  };
}

/** 预生成全部 128 个 MIDI 音符的映射表 */
export const MIDI_NOTE_MAP: ReadonlyArray<{
  pitch: number;
  noteName: string;
  octave: number;
  isBlack: boolean;
  frequency: number;
  cnName: string;
}> = Object.freeze(
  Array.from({ length: 128 }, (_, i) => ({
    pitch: i,
    noteName: midiToNoteName(i),
    octave: Math.floor(i / 12) - 1,
    isBlack: isBlackKey(i),
    frequency: midiToFrequency(i),
    cnName: getPitchNameCN(i),
  }))
);

// =============================================================================
// 音符选择管理器
// =============================================================================

/**
 * 音符选择管理器，负责处理单选、多选、框选、全选等交互逻辑
 * @class SelectionManager
 */
class SelectionManager {
  /** 当前选中的音符 ID 集合 */
  private selectedIds: Set<string> = new Set();

  /** 上次选中的音符 ID（用于 shift 连选） */
  private lastSelectedId: string | null = null;

  /** 框选矩形 */
  private selectionRect: SelectionRect | null = null;

  /** 音符引用缓存（用于快速查询） */
  private noteMap: Map<string, NoteEvent> = new Map();

  /**
   * 注册音符到选择管理器
   * @param note - 音符事件
   */
  registerNote(note: NoteEvent): void {
    this.noteMap.set(note.id, note);
  }

  /**
   * 注销音符
   * @param noteId - 音符 ID
   */
  unregisterNote(noteId: string): void {
    this.noteMap.delete(noteId);
    this.selectedIds.delete(noteId);
    if (this.lastSelectedId === noteId) {
      this.lastSelectedId = null;
    }
  }

  /**
   * 单选音符（清除其他选中）
   * @param noteId - 音符 ID
   * @returns 是否成功选中
   */
  selectSingle(noteId: string): boolean {
    if (!this.noteMap.has(noteId)) return false;
    this.clearSelection();
    this.selectedIds.add(noteId);
    this.lastSelectedId = noteId;
    this.syncNoteFlags();
    return true;
  }

  /**
   * 切换音符选中状态（Ctrl/Cmd + 点击）
   * @param noteId - 音符 ID
   * @returns 切换后的选中状态
   */
  toggleSelect(noteId: string): boolean {
    if (!this.noteMap.has(noteId)) return false;
    const isSelected = this.selectedIds.has(noteId);
    if (isSelected) {
      this.selectedIds.delete(noteId);
      if (this.lastSelectedId === noteId) {
        this.lastSelectedId = Array.from(this.selectedIds).pop() || null;
      }
    } else {
      this.selectedIds.add(noteId);
      this.lastSelectedId = noteId;
    }
    this.syncNoteFlags();
    return !isSelected;
  }

  /**
   * Shift 连选（范围选择）
   * @param noteId - 目标音符 ID
   * @returns 是否成功
   */
  selectRangeTo(noteId: string): boolean {
    if (!this.noteMap.has(noteId)) return false;
    if (!this.lastSelectedId || this.lastSelectedId === noteId) {
      return this.toggleSelect(noteId);
    }

    const lastNote = this.noteMap.get(this.lastSelectedId);
    const targetNote = this.noteMap.get(noteId);
    if (!lastNote || !targetNote) return false;

    // 按 startTick 排序后选择区间内所有音符
    const allNotes = Array.from(this.noteMap.values()).sort((a, b) => a.startTick - b.startTick);
    const startIdx = allNotes.findIndex((n) => n.id === this.lastSelectedId);
    const endIdx = allNotes.findIndex((n) => n.id === noteId);
    if (startIdx === -1 || endIdx === -1) return false;

    const [minIdx, maxIdx] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
    for (let i = minIdx; i <= maxIdx; i++) {
      this.selectedIds.add(allNotes[i].id);
    }
    this.lastSelectedId = noteId;
    this.syncNoteFlags();
    return true;
  }

  /**
   * 框选：选中矩形范围内的音符
   * @param rect - 选区矩形
   * @param addToExisting - 是否追加到现有选区
   */
  boxSelect(rect: SelectionRect, addToExisting: boolean = false): void {
    if (!addToExisting) {
      this.selectedIds.clear();
    }
    const { startTick, endTick, startPitch, endPitch } = rect;
    const minTick = Math.min(startTick, endTick);
    const maxTick = Math.max(startTick, endTick);
    const minPitch = Math.min(startPitch, endPitch);
    const maxPitch = Math.max(startPitch, endPitch);

    for (const note of this.noteMap.values()) {
      const noteEnd = note.startTick + note.durationTicks;
      const overlaps = note.startTick < maxTick && noteEnd > minTick;
      const inPitchRange = note.pitch >= minPitch && note.pitch <= maxPitch;
      if (overlaps && inPitchRange) {
        this.selectedIds.add(note.id);
      }
    }
    this.selectionRect = rect;
    this.syncNoteFlags();
  }

  /**
   * 全选
   */
  selectAll(): void {
    for (const id of this.noteMap.keys()) {
      this.selectedIds.add(id);
    }
    this.syncNoteFlags();
  }

  /**
   * 反选
   */
  invertSelection(): void {
    const allIds = new Set(this.noteMap.keys());
    const newSelected = new Set<string>();
    for (const id of allIds) {
      if (!this.selectedIds.has(id)) {
        newSelected.add(id);
      }
    }
    this.selectedIds = newSelected;
    this.lastSelectedId = Array.from(newSelected).pop() || null;
    this.syncNoteFlags();
  }

  /**
   * 清除选择
   */
  clearSelection(): void {
    this.selectedIds.clear();
    this.lastSelectedId = null;
    this.selectionRect = null;
    this.syncNoteFlags();
  }

  /**
   * 获取当前选中的音符数组
   * @returns 选中的音符事件数组
   */
  getSelectedNotes(): NoteEvent[] {
    const result: NoteEvent[] = [];
    for (const id of this.selectedIds) {
      const note = this.noteMap.get(id);
      if (note) result.push(note);
    }
    return result.sort((a, b) => a.startTick - b.startTick);
  }

  /**
   * 获取选中的音符 ID 集合
   * @returns ID 集合
   */
  getSelectedIds(): Set<string> {
    return new Set(this.selectedIds);
  }

  /**
   * 判断是否选中
   * @param noteId - 音符 ID
   * @returns 是否选中
   */
  isSelected(noteId: string): boolean {
    return this.selectedIds.has(noteId);
  }

  /**
   * 获取选区矩形
   * @returns 选区矩形或 null
   */
  getSelectionRect(): SelectionRect | null {
    return this.selectionRect;
  }

  /**
   * 同步音符的 selected 标志位
   * @private
   */
  private syncNoteFlags(): void {
    for (const note of this.noteMap.values()) {
      note.selected = this.selectedIds.has(note.id);
    }
  }

  /**
   * 重建 noteMap（通常在大量导入后调用）
   * @param notes - 音符数组
   */
  rebuild(notes: NoteEvent[]): void {
    this.noteMap.clear();
    for (const note of notes) {
      this.noteMap.set(note.id, note);
    }
    // 移除已不存在的选中 ID
    for (const id of this.selectedIds) {
      if (!this.noteMap.has(id)) {
        this.selectedIds.delete(id);
      }
    }
    this.syncNoteFlags();
  }
}

// =============================================================================
// 钢琴卷帘编辑器主类
// =============================================================================

/**
 * 钢琴卷帘编辑器核心类，管理音符生命周期、MIDI 转换与高级编辑操作
 * @class PianoRollEditor
 */
export class PianoRollEditor {
  /** 内部音符存储数组 */
  private notes: NoteEvent[] = [];

  /** 音符 ID 到索引的快速映射 */
  private idToIndex: Map<string, number> = new Map();

  /** 选择管理器实例 */
  private selection: SelectionManager = new SelectionManager();

  /** 全局 Tick 分辨率（每拍 Tick 数） */
  private ticksPerBeat: number = DEFAULT_TICKS_PER_BEAT;

  /** 当前编辑的 MIDI 通道 */
  private currentChannel: number = 0;

  /** 撤销栈 */
  private undoStack: NoteEvent[][] = [];

  /** 重做栈 */
  private redoStack: NoteEvent[][] = [];

  /** 最大撤销深度 */
  private maxUndoDepth: number = 100;

  /** 内部 ID 计数器 */
  private idCounter: number = 0;

  /**
   * 创建钢琴卷帘编辑器实例
   * @param ticksPerBeat - 每拍 Tick 数，默认 960
   * @param initialChannel - 初始 MIDI 通道，默认 0
   */
  constructor(ticksPerBeat: number = DEFAULT_TICKS_PER_BEAT, initialChannel: number = 0) {
    this.ticksPerBeat = clamp(ticksPerBeat, 1, 65535);
    this.currentChannel = clamp(initialChannel, MIN_MIDI_CHANNEL, MAX_MIDI_CHANNEL);
  }

  // ---------------------------------------------------------------------------
  // 内部工具方法
  // ---------------------------------------------------------------------------

  /**
   * 生成唯一音符 ID
   * @returns 唯一 ID 字符串
   * @private
   */
  private generateId(): string {
    this.idCounter += 1;
    return `note_${Date.now()}_${this.idCounter}`;
  }

  /**
   * 保存当前状态到撤销栈
   * @private
   */
  private saveState(): void {
    // 深拷贝当前音符数组
    const snapshot = this.notes.map((n) => ({ ...n }));
    this.undoStack.push(snapshot);
    if (this.undoStack.length > this.maxUndoDepth) {
      this.undoStack.shift();
    }
    this.redoStack = []; // 新操作后清空重做栈
  }

  /**
   * 重建 ID 到索引的映射
   * @private
   */
  private rebuildIndex(): void {
    this.idToIndex.clear();
    for (let i = 0; i < this.notes.length; i++) {
      this.idToIndex.set(this.notes[i].id, i);
    }
    this.selection.rebuild(this.notes);
  }

  /**
   * 验证音符参数合法性
   * @param note - 音符事件
   * @returns 是否合法
   * @private
   */
  private validateNote(note: Partial<NoteEvent>): boolean {
    if (note.pitch !== undefined && (note.pitch < MIN_MIDI_NOTE || note.pitch > MAX_MIDI_NOTE)) {
      return false;
    }
    if (note.channel !== undefined && (note.channel < MIN_MIDI_CHANNEL || note.channel > MAX_MIDI_CHANNEL)) {
      return false;
    }
    if (note.velocity !== undefined && (note.velocity < 0 || note.velocity > 127)) {
      return false;
    }
    if (note.durationTicks !== undefined && note.durationTicks < MIN_NOTE_DURATION_TICKS) {
      return false;
    }
    if (note.startTick !== undefined && note.startTick < 0) {
      return false;
    }
    return true;
  }

  /**
   * 排序音符（按 startTick 升序，相同则按 pitch 降序）
   * @private
   */
  private sortNotes(): void {
    this.notes.sort((a, b) => {
      if (a.startTick !== b.startTick) return a.startTick - b.startTick;
      return b.pitch - a.pitch;
    });
    this.rebuildIndex();
  }

  // ---------------------------------------------------------------------------
  // 基础 CRUD
  // ---------------------------------------------------------------------------

  /**
   * 添加音符
   * @param note - 音符事件（id 可选，如未提供则自动生成）
   * @returns 添加后的完整 NoteEvent
   */
  addNote(note: Omit<NoteEvent, 'id'> & { id?: string }): NoteEvent {
    const newNote: NoteEvent = {
      id: note.id || this.generateId(),
      pitch: clamp(note.pitch, MIN_MIDI_NOTE, MAX_MIDI_NOTE),
      velocity: clamp(note.velocity ?? DEFAULT_VELOCITY, 0, 127),
      startTick: Math.max(0, note.startTick),
      durationTicks: Math.max(MIN_NOTE_DURATION_TICKS, note.durationTicks),
      channel: clamp(note.channel ?? this.currentChannel, MIN_MIDI_CHANNEL, MAX_MIDI_CHANNEL),
      name: midiToNoteName(note.pitch),
      selected: false,
    };

    if (!this.validateNote(newNote)) {
      throw new Error(`非法的音符参数: ${JSON.stringify(note)}`);
    }

    this.saveState();
    this.notes.push(newNote);
    this.sortNotes();
    this.selection.registerNote(newNote);

    return { ...newNote };
  }

  /**
   * 移除音符
   * @param id - 音符 ID
   * @returns 是否成功移除
   */
  removeNote(id: string): boolean {
    const idx = this.idToIndex.get(id);
    if (idx === undefined) return false;

    this.saveState();
    this.notes.splice(idx, 1);
    this.selection.unregisterNote(id);
    this.rebuildIndex();
    return true;
  }

  /**
   * 移动音符（修改起始时间与音高）
   * @param id - 音符 ID
   * @param startTick - 新的起始 Tick
   * @param pitch - 新的音高
   * @returns 是否成功移动
   */
  moveNote(id: string, startTick: number, pitch: number): boolean {
    const idx = this.idToIndex.get(id);
    if (idx === undefined) return false;

    const note = this.notes[idx];
    const newStart = Math.max(0, startTick);
    const newPitch = clamp(pitch, MIN_MIDI_NOTE, MAX_MIDI_NOTE);

    if (note.startTick === newStart && note.pitch === newPitch) return true;

    this.saveState();
    note.startTick = newStart;
    note.pitch = newPitch;
    note.name = midiToNoteName(newPitch);
    this.sortNotes();
    return true;
  }

  /**
   * 调整音符时值
   * @param id - 音符 ID
   * @param durationTicks - 新的时值（Tick）
   * @returns 是否成功调整
   */
  resizeNote(id: string, durationTicks: number): boolean {
    const idx = this.idToIndex.get(id);
    if (idx === undefined) return false;

    const newDuration = Math.max(MIN_NOTE_DURATION_TICKS, durationTicks);
    if (this.notes[idx].durationTicks === newDuration) return true;

    this.saveState();
    this.notes[idx].durationTicks = newDuration;
    return true;
  }

  /**
   * 设置音符力度
   * @param id - 音符 ID
   * @param velocity - 力度值（0~127）
   * @returns 是否成功
   */
  setNoteVelocity(id: string, velocity: number): boolean {
    const idx = this.idToIndex.get(id);
    if (idx === undefined) return false;
    this.saveState();
    this.notes[idx].velocity = clamp(velocity, 0, 127);
    return true;
  }

  /**
   * 设置音符通道
   * @param id - 音符 ID
   * @param channel - 通道号（0~15）
   * @returns 是否成功
   */
  setNoteChannel(id: string, channel: number): boolean {
    const idx = this.idToIndex.get(id);
    if (idx === undefined) return false;
    this.saveState();
    this.notes[idx].channel = clamp(channel, MIN_MIDI_CHANNEL, MAX_MIDI_CHANNEL);
    return true;
  }

  // ---------------------------------------------------------------------------
  // 高级编辑操作
  // ---------------------------------------------------------------------------

  /**
   * 量化音符
   * 将选中音符的起始时间与时值对齐到指定网格，可控制量化强度实现"软量化"
   * @param selection - 要量化的音符数组（为空则量化全部）
   * @param options - 量化选项
   * @returns 被修改的音符数量
   */
  quantizeNotes(selection: NoteEvent[], options: QuantizeOptions): number {
    const targets = selection.length > 0 ? selection : [...this.notes];
    const { grid, strength = DEFAULT_QUANTIZE_STRENGTH, quantizeDuration = false } = options;
    if (grid <= 0 || targets.length === 0) return 0;

    this.saveState();
    let modifiedCount = 0;

    for (const note of targets) {
      const idx = this.idToIndex.get(note.id);
      if (idx === undefined) continue;
      const actualNote = this.notes[idx];

      // 软量化：按强度在原始值与网格值之间插值
      const quantizedStart = Math.round(actualNote.startTick / grid) * grid;
      const newStart = Math.round(lerp(actualNote.startTick, quantizedStart, strength));

      if (newStart !== actualNote.startTick) {
        actualNote.startTick = Math.max(0, newStart);
        modifiedCount++;
      }

      if (quantizeDuration) {
        const quantizedDuration = Math.round(actualNote.durationTicks / grid) * grid;
        const newDuration = Math.round(lerp(actualNote.durationTicks, quantizedDuration, strength));
        if (newDuration !== actualNote.durationTicks && newDuration >= MIN_NOTE_DURATION_TICKS) {
          actualNote.durationTicks = newDuration;
          modifiedCount++;
        }
      }
    }

    if (modifiedCount > 0) this.sortNotes();
    return modifiedCount;
  }

  /**
   * 人性化（Humanize）处理
   * 对选中音符添加微小的时间与力度随机偏移，使演奏更自然
   * @param selection - 要处理的音符数组（为空则处理全部）
   * @param options - 人性化选项
   * @returns 被修改的音符数量
   */
  humanizeNotes(selection: NoteEvent[], options: HumanizeOptions): number {
    const targets = selection.length > 0 ? selection : [...this.notes];
    const {
      timeAmount = DEFAULT_HUMANIZE_TIME_TICKS,
      velocityAmount = DEFAULT_HUMANIZE_VELOCITY,
      seed,
    } = options;
    if (targets.length === 0) return 0;

    this.saveState();
    let modifiedCount = 0;

    // 简单的线性同余随机数生成器（支持种子）
    let rngState = seed ?? Math.floor(Math.random() * 2147483647);
    const lcg = (): number => {
      rngState = (rngState * 16807 + 0) % 2147483647;
      return (rngState - 1) / 2147483646;
    };
    // 生成 -1 ~ 1 的随机数
    const randSym = (): number => lcg() * 2 - 1;

    for (const note of targets) {
      const idx = this.idToIndex.get(note.id);
      if (idx === undefined) continue;
      const actualNote = this.notes[idx];

      // 时间偏移：使用三角分布近似，减少极端值概率
      const t1 = randSym();
      const t2 = randSym();
      const timeOffset = Math.round(((t1 + t2) / 2) * timeAmount);
      const newStart = Math.max(0, actualNote.startTick + timeOffset);

      // 力度偏移
      const velOffset = Math.round(randSym() * velocityAmount);
      const newVelocity = clamp(actualNote.velocity + velOffset, 1, 127);

      if (newStart !== actualNote.startTick || newVelocity !== actualNote.velocity) {
        actualNote.startTick = newStart;
        actualNote.velocity = newVelocity;
        modifiedCount++;
      }
    }

    if (modifiedCount > 0) this.sortNotes();
    return modifiedCount;
  }

  /**
   * 移调
   * 将选中音符整体偏移指定半音数
   * @param selection - 要移调的音符数组
   * @param semitones - 半音偏移量（正数升高，负数降低）
   * @returns 被修改的音符数量
   */
  transposeNotes(selection: NoteEvent[], semitones: number): number {
    if (semitones === 0 || selection.length === 0) return 0;
    this.saveState();

    let modifiedCount = 0;
    for (const note of selection) {
      const idx = this.idToIndex.get(note.id);
      if (idx === undefined) continue;
      const actualNote = this.notes[idx];
      const newPitch = clamp(actualNote.pitch + semitones, MIN_MIDI_NOTE, MAX_MIDI_NOTE);
      if (newPitch !== actualNote.pitch) {
        actualNote.pitch = newPitch;
        actualNote.name = midiToNoteName(newPitch);
        modifiedCount++;
      }
    }

    if (modifiedCount > 0) this.sortNotes();
    return modifiedCount;
  }

  /**
   * 复制音符
   * 在指定 Tick 偏移处创建选中音符的副本
   * @param selection - 要复制的音符数组
   * @param offsetTicks - 时间偏移量（Tick）
   * @returns 新创建的音符数组
   */
  duplicateNotes(selection: NoteEvent[], offsetTicks: number): NoteEvent[] {
    if (selection.length === 0 || offsetTicks === 0) return [];
    this.saveState();

    const newNotes: NoteEvent[] = [];
    for (const note of selection) {
      const idx = this.idToIndex.get(note.id);
      if (idx === undefined) continue;
      const source = this.notes[idx];
      const newNote: NoteEvent = {
        id: this.generateId(),
        pitch: source.pitch,
        velocity: source.velocity,
        startTick: Math.max(0, source.startTick + offsetTicks),
        durationTicks: source.durationTicks,
        channel: source.channel,
        name: source.name,
        selected: false,
      };
      this.notes.push(newNote);
      this.selection.registerNote(newNote);
      newNotes.push({ ...newNote });
    }

    this.sortNotes();
    return newNotes;
  }

  /**
   * 反转（Reverse）
   * 将选中音符按时间轴镜像反转，即最后一个音符放到最前面
   * @param selection - 要反转的音符数组
   * @returns 是否成功
   */
  reverseNotes(selection: NoteEvent[]): boolean {
    if (selection.length < 2) return false;
    this.saveState();

    // 计算选中区域的总时间范围
    const sorted = selection.slice().sort((a, b) => a.startTick - b.startTick);
    const regionStart = sorted[0].startTick;
    const regionEnd = sorted[sorted.length - 1].startTick + sorted[sorted.length - 1].durationTicks;
    const regionCenter = (regionStart + regionEnd) / 2;

    for (const note of selection) {
      const idx = this.idToIndex.get(note.id);
      if (idx === undefined) continue;
      const actualNote = this.notes[idx];
      const noteCenter = actualNote.startTick + actualNote.durationTicks / 2;
      const mirroredCenter = regionCenter * 2 - noteCenter;
      actualNote.startTick = Math.max(0, Math.round(mirroredCenter - actualNote.durationTicks / 2));
    }

    this.sortNotes();
    return true;
  }

  /**
   * 镜像（Mirror）
   * 以指定音高为轴，对选中音符进行音高镜像
   * @param selection - 要镜像的音符数组
   * @param axisPitch - 镜像轴音高（MIDI 编号）
   * @returns 被修改的音符数量
   */
  mirrorNotes(selection: NoteEvent[], axisPitch: number): number {
    if (selection.length === 0) return 0;
    const axis = clamp(axisPitch, MIN_MIDI_NOTE, MAX_MIDI_NOTE);
    this.saveState();

    let modifiedCount = 0;
    for (const note of selection) {
      const idx = this.idToIndex.get(note.id);
      if (idx === undefined) continue;
      const actualNote = this.notes[idx];
      const newPitch = clamp(axis * 2 - actualNote.pitch, MIN_MIDI_NOTE, MAX_MIDI_NOTE);
      if (newPitch !== actualNote.pitch) {
        actualNote.pitch = newPitch;
        actualNote.name = midiToNoteName(newPitch);
        modifiedCount++;
      }
    }

    if (modifiedCount > 0) this.sortNotes();
    return modifiedCount;
  }

  // ---------------------------------------------------------------------------
  // 范围查询与批量操作
  // ---------------------------------------------------------------------------

  /**
   * 获取指定时间范围内的所有音符
   * @param startTick - 起始 Tick（包含）
   * @param endTick - 结束 Tick（不包含）
   * @returns 范围内的音符数组
   */
  getNotesInRange(startTick: number, endTick: number): NoteEvent[] {
    const minTick = Math.min(startTick, endTick);
    const maxTick = Math.max(startTick, endTick);
    const result: NoteEvent[] = [];
    for (const note of this.notes) {
      const noteEnd = note.startTick + note.durationTicks;
      if (note.startTick < maxTick && noteEnd > minTick) {
        result.push({ ...note });
      }
    }
    return result;
  }

  /**
   * 获取指定音高范围内的所有音符
   * @param minPitch - 最低音高（包含）
   * @param maxPitch - 最高音高（包含）
   * @returns 范围内的音符数组
   */
  getNotesInPitchRange(minPitch: number, maxPitch: number): NoteEvent[] {
    const minP = clamp(Math.min(minPitch, maxPitch), MIN_MIDI_NOTE, MAX_MIDI_NOTE);
    const maxP = clamp(Math.max(minPitch, maxPitch), MIN_MIDI_NOTE, MAX_MIDI_NOTE);
    return this.notes
      .filter((n) => n.pitch >= minP && n.pitch <= maxP)
      .map((n) => ({ ...n }));
  }

  /**
   * 获取所有音符（深拷贝）
   * @returns 全部音符数组
   */
  getAllNotes(): NoteEvent[] {
    return this.notes.map((n) => ({ ...n }));
  }

  /**
   * 按 ID 获取单个音符
   * @param id - 音符 ID
   * @returns 音符深拷贝或 undefined
   */
  getNoteById(id: string): NoteEvent | undefined {
    const idx = this.idToIndex.get(id);
    if (idx === undefined) return undefined;
    return { ...this.notes[idx] };
  }

  /**
   * 获取音符总数
   * @returns 音符数量
   */
  getNoteCount(): number {
    return this.notes.length;
  }

  /**
   * 获取最后一个音符的结束 Tick（用于判断总长度）
   * @returns 最后结束 Tick，无音符返回 0
   */
  getTotalDurationTicks(): number {
    if (this.notes.length === 0) return 0;
    const last = this.notes[this.notes.length - 1];
    return last.startTick + last.durationTicks;
  }

  // ---------------------------------------------------------------------------
  // 选择交互代理
  // ---------------------------------------------------------------------------

  /**
   * 单选音符
   * @param noteId - 音符 ID
   */
  selectNote(noteId: string): boolean {
    return this.selection.selectSingle(noteId);
  }

  /**
   * 切换选中状态
   * @param noteId - 音符 ID
   */
  toggleNoteSelection(noteId: string): boolean {
    return this.selection.toggleSelect(noteId);
  }

  /**
   * 范围选择（Shift 连选）
   * @param noteId - 目标音符 ID
   */
  selectNoteRange(noteId: string): boolean {
    return this.selection.selectRangeTo(noteId);
  }

  /**
   * 框选
   * @param rect - 选区矩形
   * @param addToExisting - 是否追加
   */
  boxSelectNotes(rect: SelectionRect, addToExisting: boolean = false): void {
    this.selection.boxSelect(rect, addToExisting);
  }

  /**
   * 全选
   */
  selectAllNotes(): void {
    this.selection.selectAll();
  }

  /**
   * 反选
   */
  invertNoteSelection(): void {
    this.selection.invertSelection();
  }

  /**
   * 清除选择
   */
  clearNoteSelection(): void {
    this.selection.clearSelection();
  }

  /**
   * 获取选中的音符
   * @returns 选中的音符数组
   */
  getSelectedNotes(): NoteEvent[] {
    return this.selection.getSelectedNotes();
  }

  /**
   * 获取选中的音符 ID
   * @returns ID 集合
   */
  getSelectedNoteIds(): Set<string> {
    return this.selection.getSelectedIds();
  }

  /**
   * 判断音符是否被选中
   * @param noteId - 音符 ID
   */
  isNoteSelected(noteId: string): boolean {
    return this.selection.isSelected(noteId);
  }

  /**
   * 获取选区矩形
   */
  getNoteSelectionRect(): SelectionRect | null {
    return this.selection.getSelectionRect();
  }

  // ---------------------------------------------------------------------------
  // MIDI 导入导出
  // ---------------------------------------------------------------------------

  /**
   * 导出为 MIDI 事件序列
   * 将内部音符转换为标准 MIDI noteOn/noteOff 事件列表，按时间排序
   * @returns MIDI 事件数组
   */
  exportToMidiFormat(): MidiEvent[] {
    const events: MidiEvent[] = [];
    for (const note of this.notes) {
      events.push({
        type: 'noteOn',
        tick: note.startTick,
        channel: note.channel,
        note: note.pitch,
        velocity: note.velocity,
        noteId: note.id,
      });
      events.push({
        type: 'noteOff',
        tick: note.startTick + note.durationTicks,
        channel: note.channel,
        note: note.pitch,
        velocity: 0,
        noteId: note.id,
      });
    }
    events.sort((a, b) => {
      if (a.tick !== b.tick) return a.tick - b.tick;
      // 同一 Tick 先 noteOff 后 noteOn（避免声音重叠时产生异常）
      if (a.type === 'noteOff' && b.type === 'noteOn') return -1;
      if (a.type === 'noteOn' && b.type === 'noteOff') return 1;
      return 0;
    });
    return events;
  }

  /**
   * 从 MIDI 事件序列导入音符
   * 解析 noteOn/noteOff 配对，生成内部 NoteEvent
   * @param events - MIDI 事件数组
   * @returns 导入的音符数量
   */
  importFromMidiFormat(events: MidiEvent[]): number {
    if (!events || events.length === 0) return 0;
    this.saveState();

    // 使用 Map 暂存未关闭的 noteOn 事件
    const pendingOn = new Map<string, MidiEvent>();
    const imported: NoteEvent[] = [];

    for (const ev of events) {
      if (ev.type === 'noteOn' && ev.note !== undefined && ev.velocity !== undefined && ev.velocity > 0) {
        const key = `${ev.channel}_${ev.note}`;
        // 如果同一通道同一音高已有未关闭的音符，先自动关闭
        if (pendingOn.has(key)) {
          const oldOn = pendingOn.get(key)!;
          const duration = Math.max(MIN_NOTE_DURATION_TICKS, ev.tick - oldOn.tick);
          imported.push({
            id: this.generateId(),
            pitch: oldOn.note!,
            velocity: oldOn.velocity!,
            startTick: oldOn.tick,
            durationTicks: duration,
            channel: oldOn.channel,
            name: midiToNoteName(oldOn.note!),
            selected: false,
          });
        }
        pendingOn.set(key, ev);
      } else if (
        (ev.type === 'noteOff' || (ev.type === 'noteOn' && ev.velocity === 0)) &&
        ev.note !== undefined
      ) {
        const key = `${ev.channel}_${ev.note}`;
        const onEv = pendingOn.get(key);
        if (onEv) {
          const duration = Math.max(MIN_NOTE_DURATION_TICKS, ev.tick - onEv.tick);
          imported.push({
            id: this.generateId(),
            pitch: onEv.note!,
            velocity: onEv.velocity!,
            startTick: onEv.tick,
            durationTicks: duration,
            channel: onEv.channel,
            name: midiToNoteName(onEv.note!),
            selected: false,
          });
          pendingOn.delete(key);
        }
      }
    }

    // 处理未关闭的音符（默认持续 1 拍）
    for (const onEv of pendingOn.values()) {
      imported.push({
        id: this.generateId(),
        pitch: onEv.note!,
        velocity: onEv.velocity!,
        startTick: onEv.tick,
        durationTicks: this.ticksPerBeat,
        channel: onEv.channel,
        name: midiToNoteName(onEv.note!),
        selected: false,
      });
    }

    for (const note of imported) {
      this.notes.push(note);
      this.selection.registerNote(note);
    }
    this.sortNotes();
    return imported.length;
  }

  // ---------------------------------------------------------------------------
  // 前端渲染数据生成
  // ---------------------------------------------------------------------------

  /**
   * 获取钢琴卷帘网格渲染数据
   * 生成供前端 Canvas/WebGL 渲染的单元格、音符矩形与拍线/小节线位置
   * @param viewStartTick - 可见区域起始 Tick
   * @param viewEndTick - 可见区域结束 Tick
   * @param viewStartPitch - 可见区域最低音高
   * @param viewEndPitch - 可见区域最高音高
   * @param rowHeight - 每行高度（像素），默认 16
   * @param tickWidth - 每 Tick 宽度（像素），默认 0.1
   * @returns 渲染数据对象
   */
  getPianoRollGrid(
    viewStartTick: number,
    viewEndTick: number,
    viewStartPitch: number = MIN_MIDI_NOTE,
    viewEndPitch: number = MAX_MIDI_NOTE,
    rowHeight: number = 16,
    tickWidth: number = 0.1
  ): PianoRollGridData {
    const minTick = Math.max(0, Math.min(viewStartTick, viewEndTick));
    const maxTick = Math.max(viewStartTick, viewEndTick);
    const minPitch = clamp(Math.min(viewStartPitch, viewEndPitch), MIN_MIDI_NOTE, MAX_MIDI_NOTE);
    const maxPitch = clamp(Math.max(viewStartPitch, viewEndPitch), MIN_MIDI_NOTE, MAX_MIDI_NOTE);

    const cells: PianoRollCell[] = [];
    const noteRects: NoteRect[] = [];
    const beatLines: number[] = [];
    const barLines: number[] = [];

    // 生成背景键盘行（白键/黑键底色）
    for (let p = minPitch; p <= maxPitch; p++) {
      const isBlack = isBlackKey(p);
      cells.push({
        row: p,
        col: -1,
        cellType: isBlack ? 'blackKey' : 'whiteKey',
      });
    }

    // 计算拍线与小节线位置（假设 4/4 拍）
    const ticksPerBar = this.ticksPerBeat * 4;
    const firstBar = Math.floor(minTick / ticksPerBar);
    const lastBar = Math.ceil(maxTick / ticksPerBar);

    for (let bar = firstBar; bar <= lastBar; bar++) {
      const barStart = bar * ticksPerBar;
      if (barStart >= minTick && barStart <= maxTick) {
        barLines.push(barStart);
      }
      for (let beat = 1; beat < 4; beat++) {
        const beatTick = barStart + beat * this.ticksPerBeat;
        if (beatTick >= minTick && beatTick <= maxTick) {
          beatLines.push(beatTick);
        }
      }
    }

    // 生成可见范围内的音符矩形
    for (const note of this.notes) {
      const noteEnd = note.startTick + note.durationTicks;
      if (note.pitch < minPitch || note.pitch > maxPitch) continue;
      if (noteEnd < minTick || note.startTick > maxTick) continue;

      const x = Math.max(minTick, note.startTick) * tickWidth;
      const width = (Math.min(maxTick, noteEnd) - Math.max(minTick, note.startTick)) * tickWidth;
      const y = (maxPitch - note.pitch) * rowHeight;

      noteRects.push({
        id: note.id,
        x,
        y,
        width,
        height: rowHeight,
        pitch: note.pitch,
        velocity: note.velocity,
        selected: note.selected ?? false,
        channel: note.channel,
        name: note.name || midiToNoteName(note.pitch),
      });
    }

    return {
      visibleRows: { start: minPitch, end: maxPitch },
      visibleCols: { start: minTick, end: maxTick },
      cells,
      noteRects,
      beatLines,
      barLines,
    };
  }

  // ---------------------------------------------------------------------------
  // 撤销与重做
  // ---------------------------------------------------------------------------

  /**
   * 撤销上一次操作
   * @returns 是否成功撤销
   */
  undo(): boolean {
    if (this.undoStack.length === 0) return false;
    const current = this.notes.map((n) => ({ ...n }));
    this.redoStack.push(current);
    const previous = this.undoStack.pop()!;
    this.notes = previous;
    this.rebuildIndex();
    return true;
  }

  /**
   * 重做上一次撤销的操作
   * @returns 是否成功重做
   */
  redo(): boolean {
    if (this.redoStack.length === 0) return false;
    const current = this.notes.map((n) => ({ ...n }));
    this.undoStack.push(current);
    const next = this.redoStack.pop()!;
    this.notes = next;
    this.rebuildIndex();
    return true;
  }

  /**
   * 清空撤销/重做栈
   */
  clearHistory(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  // ---------------------------------------------------------------------------
  // 属性访问器
  // ---------------------------------------------------------------------------

  /**
   * 获取当前 Tick 分辨率
   */
  getTicksPerBeat(): number {
    return this.ticksPerBeat;
  }

  /**
   * 设置 Tick 分辨率
   * @param tpb - 每拍 Tick 数
   */
  setTicksPerBeat(tpb: number): void {
    this.ticksPerBeat = clamp(tpb, 1, 65535);
  }

  /**
   * 获取当前 MIDI 通道
   */
  getCurrentChannel(): number {
    return this.currentChannel;
  }

  /**
   * 设置当前 MIDI 通道
   * @param channel - 通道号（0~15）
   */
  setCurrentChannel(channel: number): void {
    this.currentChannel = clamp(channel, MIN_MIDI_CHANNEL, MAX_MIDI_CHANNEL);
  }

  /**
   * 清空所有音符
   */
  clearAllNotes(): void {
    if (this.notes.length === 0) return;
    this.saveState();
    this.notes = [];
    this.rebuildIndex();
  }
}

// =============================================================================
// 独立辅助函数
// =============================================================================

/**
 * 计算 Swing 量化偏移量
 * 用于将偶数拍音符向后拖动，产生摇摆感
 * @param tick - 原始 Tick
 * @param ticksPerBeat - 每拍 Tick 数
 * @param swingRatio - Swing 比例（0~1，0.5 为平直，0.67 典型三连音 Swing）
 * @returns 偏移后的 Tick
 */
export function applySwing(tick: number, ticksPerBeat: number, swingRatio: number): number {
  const beatPos = tick / (ticksPerBeat / 2); // 以八分音符为单位
  const intPart = Math.floor(beatPos);
  const fracPart = beatPos - intPart;
  if (intPart % 2 === 0) {
    // 奇数位（第 1、3...个八分音符）不变
    return tick;
  }
  // 偶数位（第 2、4...个八分音符）后移
  const offset = (swingRatio - 0.5) * (ticksPerBeat / 2);
  return Math.round(tick + offset * fracPart);
}

/**
 * 计算两个音符之间的音程（半音数）
 * @param noteA - 音符 A
 * @param noteB - 音符 B
 * @returns 半音数差值
 */
export function intervalBetween(noteA: NoteEvent, noteB: NoteEvent): number {
  return noteB.pitch - noteA.pitch;
}

/**
 * 判断音符是否重叠（同一时间、同一音高/通道）
 * @param a - 音符 A
 * @param b - 音符 B
 * @returns 是否重叠
 */
export function notesOverlap(a: NoteEvent, b: NoteEvent): boolean {
  if (a.pitch !== b.pitch || a.channel !== b.channel) return false;
  const aEnd = a.startTick + a.durationTicks;
  const bEnd = b.startTick + b.durationTicks;
  return a.startTick < bEnd && b.startTick < aEnd;
}

/**
 * 合并重叠的连续音符（Legato 合并）
 * 将同一音高、同一通道、前后相接的音符合并为一个长音符
 * @param notes - 音符数组
 * @param toleranceTicks - 合并容差（Tick）
 * @returns 合并后的音符数组
 */
export function mergeLegatoNotes(notes: NoteEvent[], toleranceTicks: number = 1): NoteEvent[] {
  if (notes.length === 0) return [];
  const sorted = notes.slice().sort((a, b) => {
    if (a.pitch !== b.pitch) return a.pitch - b.pitch;
    if (a.channel !== b.channel) return a.channel - b.channel;
    return a.startTick - b.startTick;
  });

  const merged: NoteEvent[] = [];
  let current = { ...sorted[0] };

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i];
    const currentEnd = current.startTick + current.durationTicks;
    if (next.pitch === current.pitch && next.channel === current.channel && next.startTick <= currentEnd + toleranceTicks) {
      current.durationTicks = Math.max(current.durationTicks, next.startTick + next.durationTicks - current.startTick);
    } else {
      merged.push(current);
      current = { ...next };
    }
  }
  merged.push(current);
  return merged;
}

/**
 * 将 Tick 转换为秒（基于 BPM 和 Tick 分辨率）
 * @param tick - Tick 数
 * @param ticksPerBeat - 每拍 Tick 数
 * @param bpm - 每分钟拍数
 * @returns 秒数
 */
export function tickToSeconds(tick: number, ticksPerBeat: number, bpm: number): number {
  const beats = tick / ticksPerBeat;
  return (beats * 60) / bpm;
}

/**
 * 将秒转换为 Tick
 * @param seconds - 秒数
 * @param ticksPerBeat - 每拍 Tick 数
 * @param bpm - 每分钟拍数
 * @returns Tick 数
 */
export function secondsToTick(seconds: number, ticksPerBeat: number, bpm: number): number {
  const beats = (seconds * bpm) / 60;
  return Math.round(beats * ticksPerBeat);
}

/**
 * 生成音阶内的音符（用于快速输入）
 * @param rootPitch - 根音 MIDI 编号
 * @param scaleIntervals - 音程半音数组（如大调 [0,2,4,5,7,9,11]）
 * @param octaves - 生成的八度数量
 * @param startTick - 起始 Tick
 * @param durationTicks - 每个音符时值
 * @param velocity - 力度
 * @param channel - 通道
 * @returns 生成的音符数组（无 ID）
 */
export function generateScaleNotes(
  rootPitch: number,
  scaleIntervals: number[],
  octaves: number,
  startTick: number,
  durationTicks: number,
  velocity: number = DEFAULT_VELOCITY,
  channel: number = 0
): Omit<NoteEvent, 'id'>[] {
  const notes: Omit<NoteEvent, 'id'>[] = [];
  let currentTick = startTick;
  for (let oct = 0; oct < octaves; oct++) {
    for (const interval of scaleIntervals) {
      const pitch = rootPitch + oct * 12 + interval;
      if (pitch > MAX_MIDI_NOTE) break;
      notes.push({
        pitch,
        velocity,
        startTick: currentTick,
        durationTicks,
        channel,
      });
      currentTick += durationTicks;
    }
  }
  return notes;
}

/** 大调音程 */
export const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
/** 自然小调音程 */
export const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];
/** 和声小调音程 */
export const HARMONIC_MINOR_SCALE = [0, 2, 3, 5, 7, 8, 11];
/** 五声音阶 */
export const PENTATONIC_SCALE = [0, 2, 4, 7, 9];
/** 布鲁斯音阶 */
export const BLUES_SCALE = [0, 3, 5, 6, 7, 10];

// =============================================================================
// 更多音阶与和弦定义
// =============================================================================

/** 多利亚调式音程 */
export const DORIAN_SCALE = [0, 2, 3, 5, 7, 9, 10];
/** 弗里几亚调式音程 */
export const PHRYGIAN_SCALE = [0, 1, 3, 5, 7, 8, 10];
/** 利底亚调式音程 */
export const LYDIAN_SCALE = [0, 2, 4, 6, 7, 9, 11];
/** 混合利底亚调式音程 */
export const MIXOLYDIAN_SCALE = [0, 2, 4, 5, 7, 9, 10];
/** 洛克里亚调式音程 */
export const LOCRIAN_SCALE = [0, 1, 3, 5, 6, 8, 10];
/** 全音阶音程 */
export const WHOLE_TONE_SCALE = [0, 2, 4, 6, 8, 10];
/** 减音阶音程 */
export const DIMINISHED_SCALE = [0, 2, 3, 5, 6, 8, 9, 11];
/** 增音阶音程 */
export const AUGMENTED_SCALE = [0, 3, 4, 7, 8, 11];
/** 日本都节音阶 */
export const IN_SCALE = [0, 1, 5, 7, 8];
/** 日本律音阶 */
export const RYUKYU_SCALE = [0, 4, 6, 7, 11];

/**
 * 三和弦音程映射
 * 大调三和弦 [0,4,7]，小调三和弦 [0,3,7]，减三和弦 [0,3,6]，增三和弦 [0,4,8]
 */
export const TRIAD_MAJOR = [0, 4, 7];
export const TRIAD_MINOR = [0, 3, 7];
export const TRIAD_DIMINISHED = [0, 3, 6];
export const TRIAD_AUGMENTED = [0, 4, 8];
export const TRIAD_SUSPENDED_2 = [0, 2, 7];
export const TRIAD_SUSPENDED_4 = [0, 5, 7];

/**
 * 七和弦音程映射
 */
export const SEVENTH_DOMINANT = [0, 4, 7, 10];
export const SEVENTH_MAJOR = [0, 4, 7, 11];
export const SEVENTH_MINOR = [0, 3, 7, 10];
export const SEVENTH_HALF_DIMINISHED = [0, 3, 6, 10];
export const SEVENTH_DIMINISHED = [0, 3, 6, 9];

/**
 * 根据根音与和弦类型生成和弦内音符
 * @param rootPitch - 根音 MIDI 编号
 * @param intervals - 和弦音程数组
 * @param startTick - 起始 Tick
 * @param durationTicks - 时值
 * @param velocity - 力度
 * @param channel - 通道
 * @returns 和弦音符数组（无 ID）
 */
export function generateChordNotes(
  rootPitch: number,
  intervals: number[],
  startTick: number,
  durationTicks: number,
  velocity: number = DEFAULT_VELOCITY,
  channel: number = 0
): Omit<NoteEvent, 'id'>[] {
  const notes: Omit<NoteEvent, 'id'>[] = [];
  for (const interval of intervals) {
    const pitch = rootPitch + interval;
    if (pitch > MAX_MIDI_NOTE || pitch < MIN_MIDI_NOTE) continue;
    notes.push({
      pitch,
      velocity,
      startTick,
      durationTicks,
      channel,
    });
  }
  return notes;
}

/**
 * 将音符数组按音高排序并去重（保留最长时值）
 * @param notes - 音符数组
 * @returns 处理后的音符数组
 */
export function mergeDuplicatePitches(notes: NoteEvent[]): NoteEvent[] {
  const map = new Map<number, NoteEvent>();
  for (const note of notes) {
    const existing = map.get(note.pitch);
    if (!existing || note.durationTicks > existing.durationTicks) {
      map.set(note.pitch, note);
    }
  }
  return Array.from(map.values()).sort((a, b) => a.pitch - b.pitch);
}

/**
 * 检测音符碰撞（同一时间同一音高同一通道）
 * @param notes - 音符数组
 * @returns 碰撞组数组（每组为相互碰撞的音符 ID 列表）
 */
export function detectCollisions(notes: NoteEvent[]): string[][] {
  const sorted = notes.slice().sort((a, b) => {
    if (a.pitch !== b.pitch) return a.pitch - b.pitch;
    return a.startTick - b.startTick;
  });
  const groups: string[][] = [];
  let currentGroup: string[] = [];
  let lastEnd = -Infinity;
  let lastPitch = -1;

  for (const note of sorted) {
    const noteEnd = note.startTick + note.durationTicks;
    if (note.pitch === lastPitch && note.startTick < lastEnd) {
      currentGroup.push(note.id);
      if (noteEnd > lastEnd) lastEnd = noteEnd;
    } else {
      if (currentGroup.length > 1) groups.push(currentGroup);
      currentGroup = [note.id];
      lastEnd = noteEnd;
      lastPitch = note.pitch;
    }
  }
  if (currentGroup.length > 1) groups.push(currentGroup);
  return groups;
}

/**
 * 解决音符碰撞：缩短重叠音符的时值，使前一个音符在后一个开始前结束
 * @param notes - 音符数组（会被修改）
 * @param gapTicks - 碰撞解决后的间隔 Tick（默认 1）
 * @returns 被修改的音符数量
 */
export function resolveCollisions(notes: NoteEvent[], gapTicks: number = 1): number {
  const sorted = notes.slice().sort((a, b) => {
    if (a.pitch !== b.pitch) return a.pitch - b.pitch;
    if (a.channel !== b.channel) return a.channel - b.channel;
    return a.startTick - b.startTick;
  });

  let modifiedCount = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    const curr = sorted[i];
    const next = sorted[i + 1];
    if (curr.pitch !== next.pitch || curr.channel !== next.channel) continue;
    const currEnd = curr.startTick + curr.durationTicks;
    if (currEnd > next.startTick) {
      curr.durationTicks = Math.max(MIN_NOTE_DURATION_TICKS, next.startTick - curr.startTick - gapTicks);
      modifiedCount++;
    }
  }
  return modifiedCount;
}

// =============================================================================
// 网格计算工具
// =============================================================================

/**
 * 计算 Tick 对应的拍号位置信息
 * @param tick - Tick 数
 * @param ticksPerBeat - 每拍 Tick 数
 * @param beatsPerBar - 每小节拍数（默认 4）
 * @returns 位置信息对象
 */
export function getTickPosition(
  tick: number,
  ticksPerBeat: number,
  beatsPerBar: number = 4
): { bar: number; beat: number; tickInBeat: number; totalBeats: number } {
  const tpb = Math.max(1, ticksPerBeat);
  const bpb = Math.max(1, beatsPerBar);
  const totalBeats = tick / tpb;
  const bar = Math.floor(totalBeats / bpb);
  const beat = Math.floor(totalBeats % bpb);
  const tickInBeat = tick % tpb;
  return { bar, beat, tickInBeat, totalBeats };
}

/**
 * 从拍号位置计算 Tick
 * @param bar - 小节（0-based）
 * @param beat - 拍（0-based）
 * @param tickInBeat - 拍内 Tick
 * @param ticksPerBeat - 每拍 Tick 数
 * @param beatsPerBar - 每小节拍数
 * @returns Tick 数
 */
export function positionToTick(
  bar: number,
  beat: number,
  tickInBeat: number,
  ticksPerBeat: number,
  beatsPerBar: number = 4
): number {
  const tpb = Math.max(1, ticksPerBeat);
  const bpb = Math.max(1, beatsPerBar);
  return bar * bpb * tpb + beat * tpb + tickInBeat;
}

/**
 * 网格吸附计算
 * @param tick - 原始 Tick
 * @param gridTicks - 网格大小（Tick）
 * @param strength - 吸附强度（0~1）
 * @returns 吸附后的 Tick
 */
export function snapToGrid(tick: number, gridTicks: number, strength: number = 1.0): number {
  if (gridTicks <= 0) return tick;
  const snapped = Math.round(tick / gridTicks) * gridTicks;
  return Math.round(lerp(tick, snapped, clamp(strength, 0, 1)));
}

/**
 * 计算网格线位置（供前端绘制）
 * @param startTick - 起始 Tick
 * @param endTick - 结束 Tick
 * @param gridTicks - 网格大小
 * @returns 网格线 Tick 位置数组
 */
export function computeGridLines(startTick: number, endTick: number, gridTicks: number): number[] {
  if (gridTicks <= 0) return [];
  const lines: number[] = [];
  const first = Math.ceil(startTick / gridTicks) * gridTicks;
  for (let t = first; t <= endTick; t += gridTicks) {
    lines.push(t);
  }
  return lines;
}

/**
 * 计算拍号线与小节线位置
 * @param startTick - 起始 Tick
 * @param endTick - 结束 Tick
 * @param ticksPerBeat - 每拍 Tick 数
 * @param beatsPerBar - 每小节拍数
 * @returns { beatLines: number[], barLines: number[] }
 */
export function computeBarBeatLines(
  startTick: number,
  endTick: number,
  ticksPerBeat: number,
  beatsPerBar: number = 4
): { beatLines: number[]; barLines: number[] } {
  const tpb = Math.max(1, ticksPerBeat);
  const bpb = Math.max(1, beatsPerBar);
  const beatLines: number[] = [];
  const barLines: number[] = [];

  const firstBeat = Math.ceil(startTick / tpb) * tpb;
  for (let t = firstBeat; t <= endTick; t += tpb) {
    const beatIndex = Math.round(t / tpb);
    if (beatIndex % bpb === 0) {
      barLines.push(t);
    } else {
      beatLines.push(t);
    }
  }
  return { beatLines, barLines };
}

/**
 * 音符力度映射（将 MIDI 力度转换为 dB 增益）
 * @param velocity - MIDI 力度（0~127）
 * @returns 线性增益（0~1 范围近似）
 */
export function velocityToGain(velocity: number): number {
  const v = clamp(velocity, 0, 127);
  // 使用指数映射模拟 MIDI 力度曲线
  return Math.pow(v / 127, 2);
}

/**
 * 增益映射回 MIDI 力度
 * @param gain - 线性增益（0~1）
 * @returns MIDI 力度（0~127）
 */
export function gainToVelocity(gain: number): number {
  const g = clamp(gain, 0, 1);
  return Math.round(Math.sqrt(g) * 127);
}

/**
 * 计算选中音符的边界框（最小包围矩形）
 * @param notes - 音符数组
 * @returns 边界框 { minTick, maxTick, minPitch, maxPitch }
 */
export function getNotesBoundingBox(notes: NoteEvent[]): { minTick: number; maxTick: number; minPitch: number; maxPitch: number } | null {
  if (notes.length === 0) return null;
  let minTick = Infinity;
  let maxTick = -Infinity;
  let minPitch = Infinity;
  let maxPitch = -Infinity;
  for (const note of notes) {
    if (note.startTick < minTick) minTick = note.startTick;
    const end = note.startTick + note.durationTicks;
    if (end > maxTick) maxTick = end;
    if (note.pitch < minPitch) minPitch = note.pitch;
    if (note.pitch > maxPitch) maxPitch = note.pitch;
  }
  return { minTick, maxTick, minPitch, maxPitch };
}

/**
 * 计算相邻音符的平均间隔（用于分析节奏密度）
 * @param notes - 音符数组
 * @returns 平均间隔 Tick，少于两个音符返回 0
 */
export function averageNoteSpacing(notes: NoteEvent[]): number {
  if (notes.length < 2) return 0;
  const sorted = notes.slice().sort((a, b) => a.startTick - b.startTick);
  let totalSpacing = 0;
  for (let i = 1; i < sorted.length; i++) {
    totalSpacing += sorted[i].startTick - sorted[i - 1].startTick;
  }
  return totalSpacing / (sorted.length - 1);
}

/**
 * 创建音符的深拷贝
 * @param note - 原始音符
 * @returns 深拷贝
 */
export function cloneNote(note: NoteEvent): NoteEvent {
  return { ...note };
}

/**
 * 批量创建音符深拷贝
 * @param notes - 音符数组
 * @returns 深拷贝数组
 */
export function cloneNotes(notes: NoteEvent[]): NoteEvent[] {
  return notes.map((n) => ({ ...n }));
}

// =============================================================================
// 模块默认导出
// =============================================================================

export default PianoRollEditor;
