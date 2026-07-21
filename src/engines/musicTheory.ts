/**
 * 音乐理论引擎
 * 涵盖音阶、和弦、节奏、旋律生成辅助和调性分析等完整音乐理论体系
 */

// ============================================================
// 第一部分：基础类型定义
// ============================================================

/** 音名（升号体系，12个半音） */
export type NoteNameSharp = 'C' | 'C#' | 'D' | 'D#' | 'E' | 'F' | 'F#' | 'G' | 'G#' | 'A' | 'A#' | 'B';

/** 音名（降号体系，12个半音） */
export type NoteNameFlat = 'C' | 'Db' | 'D' | 'Eb' | 'E' | 'F' | 'Gb' | 'G' | 'Ab' | 'A' | 'Bb' | 'B';

/** 音名（升号或降号均可，含理论音名如Cb） */
export type NoteName = NoteNameSharp | NoteNameFlat | 'Cb';

/** 八度范围（0-8，MIDI标准） */
export type Octave = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/** 完整音高，如 C4、A#3 */
export interface Pitch {
  note: NoteName;
  octave: Octave;
}

/** 音程名称 */
export type IntervalName =
  | 'P1' | 'm2' | 'M2' | 'm3' | 'M3' | 'P4' | 'TT' | 'P5'
  | 'm6' | 'M6' | 'm7' | 'M7' | 'P8'
  | 'm9' | 'M9' | 'm10' | 'M10' | 'P11' | 'A11' | 'P12'
  | 'm13' | 'M13' | 'm14' | 'M14' | 'P15';

/** 音程半音数映射 */
export const INTERVAL_SEMITONES: Record<IntervalName, number> = {
  'P1': 0, 'm2': 1, 'M2': 2, 'm3': 3, 'M3': 4, 'P4': 5, 'TT': 6, 'P5': 7,
  'm6': 8, 'M6': 9, 'm7': 10, 'M7': 11, 'P8': 12,
  'm9': 13, 'M9': 14, 'm10': 15, 'M10': 16, 'P11': 17, 'A11': 18, 'P12': 19,
  'm13': 20, 'M13': 21, 'm14': 22, 'M14': 23, 'P15': 24,
};

/** 12个半音对应的音名（升号体系） */
export const NOTE_NAMES_SHARP: NoteName[] = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** 12个半音对应的音名（降号体系） */
export const NOTE_NAMES_FLAT: NoteNameFlat[] = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

/** 升号音名到降号音名的映射 */
export const SHARP_TO_FLAT: Record<string, NoteNameFlat> = {
  'C': 'C', 'C#': 'Db', 'D': 'D', 'D#': 'Eb', 'E': 'E', 'F': 'F',
  'F#': 'Gb', 'G': 'G', 'G#': 'Ab', 'A': 'A', 'A#': 'Bb', 'B': 'B',
};

/** 降号音名到升号音名的映射 */
export const FLAT_TO_SHARP: Record<string, NoteName> = {
  'C': 'C', 'Db': 'C#', 'D': 'D', 'Eb': 'D#', 'E': 'E', 'F': 'F',
  'Gb': 'F#', 'G': 'G', 'Ab': 'G#', 'A': 'A', 'Bb': 'A#', 'B': 'B',
};

// ============================================================
// 第二部分：音阶系统
// ============================================================

/** 西方音阶类型 */
export type WesternScaleType =
  | 'major' | 'natural_minor' | 'harmonic_minor' | 'melodic_minor'
  | 'dorian' | 'phrygian' | 'lydian' | 'mixolydian' | 'locrian'
  | 'blues' | 'whole_tone' | 'pentatonic';

/** 中国五声音阶类型 */
export type ChineseScaleType = 'gong' | 'shang' | 'jiao' | 'zhi' | 'yu';

/** 日本音阶类型 */
export type JapaneseScaleType = 'miyako_bushi' | 'in_scale' | 'yo_scale';

/** 世界音阶类型 */
export type WorldScaleType = 'arabic' | 'indian_raga';

/** 所有音阶类型联合 */
export type ScaleType = WesternScaleType | ChineseScaleType | JapaneseScaleType | WorldScaleType;

/** 音阶定义 */
export interface ScaleDefinition {
  name: string;           // 音阶名称
  nameCN: string;         // 中文名称
  intervals: number[];    // 半音间隔序列（从根音开始）
  category: 'western' | 'chinese' | 'japanese' | 'world'; // 分类
  description: string;    // 描述
}

/** 西方12种音阶定义 */
export const WESTERN_SCALES: Record<WesternScaleType, ScaleDefinition> = {
  major: {
    name: 'Major', nameCN: '大调',
    intervals: [0, 2, 4, 5, 7, 9, 11],
    category: 'western',
    description: '最基础的七声音阶，明亮开朗的色彩',
  },
  natural_minor: {
    name: 'Natural Minor', nameCN: '自然小调',
    intervals: [0, 2, 3, 5, 7, 8, 10],
    category: 'western',
    description: '大调的关系小调，忧郁暗淡的色彩',
  },
  harmonic_minor: {
    name: 'Harmonic Minor', nameCN: '和声小调',
    intervals: [0, 2, 3, 5, 7, 8, 11],
    category: 'western',
    description: '自然小调升高第七级，产生导音到主音的半音倾向',
  },
  melodic_minor: {
    name: 'Melodic Minor', nameCN: '旋律小调',
    intervals: [0, 2, 3, 5, 7, 9, 11],
    category: 'western',
    description: '上行升高六七级，使旋律更流畅',
  },
  dorian: {
    name: 'Dorian', nameCN: '多利亚调式',
    intervals: [0, 2, 3, 5, 7, 9, 10],
    category: 'western',
    description: '小调色彩但大六度，爵士即兴常用',
  },
  phrygian: {
    name: 'Phrygian', nameCN: '弗里几亚调式',
    intervals: [0, 1, 3, 5, 7, 8, 10],
    category: 'western',
    description: '小二度下行色彩，弗拉门戈风格',
  },
  lydian: {
    name: 'Lydian', nameCN: '利底亚调式',
    intervals: [0, 2, 4, 6, 7, 9, 11],
    category: 'western',
    description: '增四度漂浮感，电影配乐常用',
  },
  mixolydian: {
    name: 'Mixolydian', nameCN: '混合利底亚调式',
    intervals: [0, 2, 4, 5, 7, 9, 10],
    category: 'western',
    description: '大调但小七度，布鲁斯和摇滚常用',
  },
  locrian: {
    name: 'Locrian', nameCN: '洛克里亚调式',
    intervals: [0, 1, 3, 5, 6, 8, 10],
    category: 'western',
    description: '减五度极度不稳定，极少独立使用',
  },
  blues: {
    name: 'Blues', nameCN: '布鲁斯音阶',
    intervals: [0, 3, 5, 6, 7, 10],
    category: 'western',
    description: '小调五声加蓝音（减五度），布鲁斯灵魂',
  },
  whole_tone: {
    name: 'Whole Tone', nameCN: '全音音阶',
    intervals: [0, 2, 4, 6, 8, 10],
    category: 'western',
    description: '全部全音间隔，德彪西印象派特征',
  },
  pentatonic: {
    name: 'Major Pentatonic', nameCN: '大调五声音阶',
    intervals: [0, 2, 4, 7, 9],
    category: 'western',
    description: '去掉半音的五声，旋律简洁明朗',
  },
};

/** 中国五声音阶定义（宫商角徵羽） */
export const CHINESE_SCALES: Record<ChineseScaleType, ScaleDefinition> = {
  gong: {
    name: 'Gong', nameCN: '宫调式',
    intervals: [0, 2, 4, 7, 9],
    category: 'chinese',
    description: '以宫为主音，庄严宏大，类似大调色彩',
  },
  shang: {
    name: 'Shang', nameCN: '商调式',
    intervals: [0, 2, 5, 7, 10],
    category: 'chinese',
    description: '以商为主音，哀婉含蓄，类似多利亚色彩',
  },
  jiao: {
    name: 'Jiao', nameCN: '角调式',
    intervals: [0, 3, 5, 8, 10],
    category: 'chinese',
    description: '以角为主音，清丽淡雅，类似弗里几亚色彩',
  },
  zhi: {
    name: 'Zhi', nameCN: '徵调式',
    intervals: [0, 2, 5, 7, 9],
    category: 'chinese',
    description: '以徵为主音，激昂明亮，类似混合利底亚色彩',
  },
  yu: {
    name: 'Yu', nameCN: '羽调式',
    intervals: [0, 3, 5, 7, 10],
    category: 'chinese',
    description: '以羽为主音，柔美幽远，类似自然小调色彩',
  },
};

/** 日本音阶定义 */
export const JAPANESE_SCALES: Record<JapaneseScaleType, ScaleDefinition> = {
  miyako_bushi: {
    name: 'Miyako-bushi', nameCN: '都节音阶',
    intervals: [0, 1, 5, 7, 11],
    category: 'japanese',
    description: '小二度+大六度的独特色彩，日本传统音乐代表',
  },
  in_scale: {
    name: 'In Scale', nameCN: '阴音阶',
    intervals: [0, 1, 5, 7, 8],
    category: 'japanese',
    description: '都节的变体，含半音和小三度，幽暗神秘',
  },
  yo_scale: {
    name: 'Yo Scale', nameCN: '阳音阶',
    intervals: [0, 2, 5, 7, 9],
    category: 'japanese',
    description: '无半音的五声，明亮开放，与徵调式相同',
  },
};

/** 世界音阶定义 */
export const WORLD_SCALES: Record<WorldScaleType, ScaleDefinition> = {
  arabic: {
    name: 'Arabic', nameCN: '阿拉伯音阶',
    intervals: [0, 1, 4, 5, 7, 8, 11],
    category: 'world',
    description: '含增二度的马卡姆特征，异域风情',
  },
  indian_raga: {
    name: 'Indian Raga (Bhairavi)', nameCN: '印度拉格（拜拉维）',
    intervals: [0, 1, 3, 5, 7, 8, 10],
    category: 'world',
    description: '拜拉维塔特，近似弗里几亚调式，北印度古典基础',
  },
};

/** 获取所有音阶定义 */
export function getAllScales(): ScaleDefinition[] {
  return [
    ...Object.values(WESTERN_SCALES),
    ...Object.values(CHINESE_SCALES),
    ...Object.values(JAPANESE_SCALES),
    ...Object.values(WORLD_SCALES),
  ];
}

/** 根据类型获取音阶定义 */
export function getScaleDefinition(type: ScaleType): ScaleDefinition {
  const all = { ...WESTERN_SCALES, ...CHINESE_SCALES, ...JAPANESE_SCALES, ...WORLD_SCALES };
  return all[type];
}

// ============================================================
// 24种调式（各大小调）
// ============================================================

/** 调性 */
export type KeyName =
  | 'C' | 'G' | 'D' | 'A' | 'E' | 'B' | 'F#' | 'C#'
  | 'F' | 'Bb' | 'Eb' | 'Ab' | 'Db' | 'Gb';

/** 调性模式 */
export type KeyMode = 'major' | 'minor';

/** 调号定义 */
export interface KeyDefinition {
  key: KeyName;
  mode: KeyMode;
  nameCN: string;         // 中文调名
  sharps: number;         // 升号数量（负数表示降号）
  scaleNotes: NoteName[]; // 音阶音符
}

/** 各调对应的升号数（圈五度顺序） */
export const KEY_SHARPS: Record<KeyName, number> = {
  'C': 0, 'G': 1, 'D': 2, 'A': 3, 'E': 4, 'B': 5, 'F#': 6, 'C#': 7,
  'F': -1, 'Bb': -2, 'Eb': -3, 'Ab': -4, 'Db': -5, 'Gb': -6,
};

/** 各调在大调音阶中的音符 */
export const KEY_SCALE_NOTES: Record<KeyName, NoteName[]> = {
  'C':  ['C', 'D', 'E', 'F', 'G', 'A', 'B'],
  'G':  ['G', 'A', 'B', 'C', 'D', 'E', 'F#'],
  'D':  ['D', 'E', 'F#', 'G', 'A', 'B', 'C#'],
  'A':  ['A', 'B', 'C#', 'D', 'E', 'F#', 'G#'],
  'E':  ['E', 'F#', 'G#', 'A', 'B', 'C#', 'D#'],
  'B':  ['B', 'C#', 'D#', 'E', 'F#', 'G#', 'A#'],
  'F#': ['F#', 'G#', 'A#', 'B', 'C#', 'D#', 'E'],
  'C#': ['C#', 'D#', 'E', 'F#', 'G#', 'A#', 'B'],
  'F':  ['F', 'G', 'A', 'Bb', 'C', 'D', 'E'],
  'Bb': ['Bb', 'C', 'D', 'Eb', 'F', 'G', 'A'],
  'Eb': ['Eb', 'F', 'G', 'Ab', 'Bb', 'C', 'D'],
  'Ab': ['Ab', 'Bb', 'C', 'Db', 'Eb', 'F', 'G'],
  'Db': ['Db', 'Eb', 'F', 'Gb', 'Ab', 'Bb', 'C'],
  'Gb': ['Gb', 'Ab', 'Bb', 'Cb', 'Db', 'Eb', 'F'],
};

/** 调的中文名称 */
export const KEY_NAMES_CN: Record<KeyName, { major: string; minor: string }> = {
  'C': { major: 'C大调', minor: 'c小调' },
  'G': { major: 'G大调', minor: 'g小调' },
  'D': { major: 'D大调', minor: 'd小调' },
  'A': { major: 'A大调', minor: 'a小调' },
  'E': { major: 'E大调', minor: 'e小调' },
  'B': { major: 'B大调', minor: 'b小调' },
  'F#': { major: 'F#大调', minor: 'f#小调' },
  'C#': { major: 'C#大调', minor: 'c#小调' },
  'F': { major: 'F大调', minor: 'f小调' },
  'Bb': { major: 'Bb大调', minor: 'bb小调' },
  'Eb': { major: 'Eb大调', minor: 'eb小调' },
  'Ab': { major: 'Ab大调', minor: 'ab小调' },
  'Db': { major: 'Db大调', minor: 'db小调' },
  'Gb': { major: 'Gb大调', minor: 'gb小调' },
};

/** 生成24个调性定义 */
export function generate24Keys(): KeyDefinition[] {
  const keys: KeyDefinition[] = [];
  const keyNames: KeyName[] = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb'];

  for (const key of keyNames) {
    // 大调
    keys.push({
      key,
      mode: 'major',
      nameCN: KEY_NAMES_CN[key].major,
      sharps: KEY_SHARPS[key],
      scaleNotes: KEY_SCALE_NOTES[key],
    });
    // 小调（关系小调从大调第6级开始）
    const minorRootIndex = 5; // 大调第6级（0索引为5）
    const minorRoot = KEY_SCALE_NOTES[key][minorRootIndex];
    const minorNotes = [
      KEY_SCALE_NOTES[key][5], KEY_SCALE_NOTES[key][6],
      KEY_SCALE_NOTES[key][0], KEY_SCALE_NOTES[key][1],
      KEY_SCALE_NOTES[key][2], KEY_SCALE_NOTES[key][3],
      KEY_SCALE_NOTES[key][4],
    ];
    keys.push({
      key: minorRoot as KeyName,
      mode: 'minor',
      nameCN: KEY_NAMES_CN[key].minor,
      sharps: KEY_SHARPS[key],
      scaleNotes: minorNotes,
    });
  }

  return keys;
}

/** 24个调性常量 */
export const ALL_24_KEYS: KeyDefinition[] = generate24Keys();

// ============================================================
// 音阶计算函数
// ============================================================

/** 将音名转换为半音编号（0-11） */
export function noteToSemitone(note: string): number {
  const sharpMap: Record<string, number> = {
    'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'Fb': 4,
    'F': 5, 'E#': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8, 'A': 9,
    'A#': 10, 'Bb': 10, 'B': 11, 'Cb': 11,
  };
  return sharpMap[note] ?? 0;
}

/** 将半音编号转换为音名 */
export function semitoneToNote(semitone: number, useFlat: boolean = false): NoteName | NoteNameFlat {
  const normalized = ((semitone % 12) + 12) % 12;
  return useFlat ? NOTE_NAMES_FLAT[normalized] : NOTE_NAMES_SHARP[normalized];
}

/** 根据根音和音阶类型生成音阶音符 */
export function generateScale(root: string, scaleType: ScaleType, octave: Octave = 4): Pitch[] {
  const scaleDef = getScaleDefinition(scaleType);
  const rootSemitone = noteToSemitone(root);
  const pitches: Pitch[] = [];

  for (const interval of scaleDef.intervals) {
    const semitone = rootSemitone + interval;
    const noteOctave = octave + Math.floor(semitone / 12);
    const noteIndex = semitone % 12;
    pitches.push({
      note: NOTE_NAMES_SHARP[noteIndex],
      octave: Math.min(Math.max(noteOctave, 0), 8) as Octave,
    });
  }

  return pitches;
}

/** 生成音阶的MIDI编号 */
export function scaleToMIDI(root: string, scaleType: ScaleType, octave: Octave = 4): number[] {
  const scaleDef = getScaleDefinition(scaleType);
  const rootMIDI = noteToSemitone(root) + (octave + 1) * 12;
  return scaleDef.intervals.map(i => rootMIDI + i);
}

/** 获取音阶中的度数（1-based） */
export function getScaleDegree(root: string, note: string, scaleType: ScaleType = 'major'): number {
  const scaleDef = getScaleDefinition(scaleType);
  const rootSemitone = noteToSemitone(root);
  const noteSemitone = noteToSemitone(note);
  const interval = ((noteSemitone - rootSemitone) % 12 + 12) % 12;
  const degree = scaleDef.intervals.indexOf(interval);
  return degree >= 0 ? degree + 1 : -1;
}

/** 关系调转换（大调→小调，小调→大调） */
export function getRelativeKey(key: KeyName, mode: KeyMode): { key: KeyName; mode: KeyMode } {
  if (mode === 'major') {
    // 关系小调：往下数3个半音（大调第6级）
    const majorNotes = KEY_SCALE_NOTES[key];
    return { key: majorNotes[5] as KeyName, mode: 'minor' };
  } else {
    // 关系大调：往上数3个半音（小调第3级）
    const keyDef = ALL_24_KEYS.find(k => k.key === key && k.mode === 'minor');
    if (keyDef) {
      const parentMajor = ALL_24_KEYS.find(k => k.mode === 'major' && k.sharps === keyDef.sharps);
      if (parentMajor) return { key: parentMajor.key, mode: 'major' };
    }
    return { key: 'C' as KeyName, mode: 'major' };
  }
}

/** 同主音调转换 */
export function getParallelKey(key: KeyName, mode: KeyMode): { key: KeyName; mode: KeyMode } {
  return { key, mode: mode === 'major' ? 'minor' : 'major' };
}

// ============================================================
// 第三部分：和弦系统
// ============================================================

/** 和弦类型 */
export type ChordType =
  // 三和弦
  | 'major' | 'minor' | 'augmented' | 'diminished' | 'sus4' | 'sus2'
  // 七和弦
  | 'major7' | 'minor7' | 'dominant7' | 'diminished7' | 'half_diminished7' | 'augmented7' | 'minor_major7'
  // 九和弦
  | 'major9' | 'minor9' | 'dominant9'
  // 十一和弦
  | 'major11' | 'minor11' | 'dominant11'
  // 十三和弦
  | 'major13' | 'minor13' | 'dominant13';

/** 和弦定义 */
export interface ChordDefinition {
  name: string;           // 和弦名称
  nameCN: string;         // 中文名称
  symbol: string;         // 和弦符号
  intervals: number[];    // 半音间隔
  category: 'triad' | 'seventh' | 'ninth' | 'eleventh' | 'thirteenth';
}

/** 和弦类型定义数据库 */
export const CHORD_DEFINITIONS: Record<ChordType, ChordDefinition> = {
  // 三和弦
  major: {
    name: 'Major Triad', nameCN: '大三和弦', symbol: '',
    intervals: [0, 4, 7], category: 'triad',
  },
  minor: {
    name: 'Minor Triad', nameCN: '小三和弦', symbol: 'm',
    intervals: [0, 3, 7], category: 'triad',
  },
  augmented: {
    name: 'Augmented Triad', nameCN: '增三和弦', symbol: 'aug',
    intervals: [0, 4, 8], category: 'triad',
  },
  diminished: {
    name: 'Diminished Triad', nameCN: '减三和弦', symbol: 'dim',
    intervals: [0, 3, 6], category: 'triad',
  },
  sus4: {
    name: 'Suspended 4th', nameCN: '挂4和弦', symbol: 'sus4',
    intervals: [0, 5, 7], category: 'triad',
  },
  sus2: {
    name: 'Suspended 2nd', nameCN: '挂2和弦', symbol: 'sus2',
    intervals: [0, 2, 7], category: 'triad',
  },
  // 七和弦
  major7: {
    name: 'Major 7th', nameCN: '大七和弦', symbol: 'maj7',
    intervals: [0, 4, 7, 11], category: 'seventh',
  },
  minor7: {
    name: 'Minor 7th', nameCN: '小七和弦', symbol: 'm7',
    intervals: [0, 3, 7, 10], category: 'seventh',
  },
  dominant7: {
    name: 'Dominant 7th', nameCN: '属七和弦', symbol: '7',
    intervals: [0, 4, 7, 10], category: 'seventh',
  },
  diminished7: {
    name: 'Diminished 7th', nameCN: '减七和弦', symbol: 'dim7',
    intervals: [0, 3, 6, 9], category: 'seventh',
  },
  half_diminished7: {
    name: 'Half-diminished 7th', nameCN: '半减七和弦', symbol: 'm7b5',
    intervals: [0, 3, 6, 10], category: 'seventh',
  },
  augmented7: {
    name: 'Augmented 7th', nameCN: '增七和弦', symbol: 'aug7',
    intervals: [0, 4, 8, 10], category: 'seventh',
  },
  minor_major7: {
    name: 'Minor-major 7th', nameCN: '小大七和弦', symbol: 'mmaj7',
    intervals: [0, 3, 7, 11], category: 'seventh',
  },
  // 九和弦
  major9: {
    name: 'Major 9th', nameCN: '大九和弦', symbol: 'maj9',
    intervals: [0, 4, 7, 11, 14], category: 'ninth',
  },
  minor9: {
    name: 'Minor 9th', nameCN: '小九和弦', symbol: 'm9',
    intervals: [0, 3, 7, 10, 14], category: 'ninth',
  },
  dominant9: {
    name: 'Dominant 9th', nameCN: '属九和弦', symbol: '9',
    intervals: [0, 4, 7, 10, 14], category: 'ninth',
  },
  // 十一和弦
  major11: {
    name: 'Major 11th', nameCN: '大十一和弦', symbol: 'maj11',
    intervals: [0, 4, 7, 11, 14, 17], category: 'eleventh',
  },
  minor11: {
    name: 'Minor 11th', nameCN: '小十一和弦', symbol: 'm11',
    intervals: [0, 3, 7, 10, 14, 17], category: 'eleventh',
  },
  dominant11: {
    name: 'Dominant 11th', nameCN: '属十一和弦', symbol: '11',
    intervals: [0, 4, 7, 10, 14, 17], category: 'eleventh',
  },
  // 十三和弦
  major13: {
    name: 'Major 13th', nameCN: '大十三和弦', symbol: 'maj13',
    intervals: [0, 4, 7, 11, 14, 17, 21], category: 'thirteenth',
  },
  minor13: {
    name: 'Minor 13th', nameCN: '小十三和弦', symbol: 'm13',
    intervals: [0, 3, 7, 10, 14, 17, 21], category: 'thirteenth',
  },
  dominant13: {
    name: 'Dominant 13th', nameCN: '属十三和弦', symbol: '13',
    intervals: [0, 4, 7, 10, 14, 17, 21], category: 'thirteenth',
  },
};

/** 和弦实例 */
export interface Chord {
  root: string;              // 根音
  type: ChordType;           // 和弦类型
  notes: Pitch[];            // 和弦音符
  inversion: number;         // 转位（0=原位，1=第一转位，2=第二转位）
  bass: string;              // 低音（转位后）
}

/** 生成和弦 */
export function generateChord(
  root: string,
  type: ChordType,
  octave: Octave = 4,
  inversion: number = 0
): Chord {
  const def = CHORD_DEFINITIONS[type];
  const rootSemitone = noteToSemitone(root);
  const notes: Pitch[] = [];

  for (let i = 0; i < def.intervals.length; i++) {
    let semitone = rootSemitone + def.intervals[i];
    // 处理转位：将前inversion个音移高八度
    if (i < inversion) semitone += 12;
    const noteOctave = octave + Math.floor(semitone / 12);
    const noteIndex = semitone % 12;
    notes.push({
      note: NOTE_NAMES_SHARP[noteIndex],
      octave: Math.min(Math.max(noteOctave, 0), 8) as Octave,
    });
  }

  const bass = inversion > 0 && inversion < def.intervals.length
    ? notes[0].note
    : root;

  return { root, type, notes, inversion, bass };
}

/** 和弦转位 */
export function chordInversion(chord: Chord, inversion: number): Chord {
  return generateChord(chord.root, chord.type, chord.notes[0].octave, inversion);
}

/** 获取和弦的MIDI编号 */
export function chordToMIDI(root: string, type: ChordType, octave: Octave = 4): number[] {
  const def = CHORD_DEFINITIONS[type];
  const rootMIDI = noteToSemitone(root) + (octave + 1) * 12;
  return def.intervals.map(i => rootMIDI + i);
}

/** 和弦符号（如 Cm7, Fmaj9） */
export function chordSymbol(root: string, type: ChordType): string {
  const def = CHORD_DEFINITIONS[type];
  return `${root}${def.symbol}`;
}

/** 识别和弦类型（从半音间隔推断） */
export function identifyChordType(intervals: number[]): ChordType | null {
  // 归一化到0起始
  const normalized = intervals.map(i => i - intervals[0]);
  const intervalStr = normalized.join(',');

  for (const [type, def] of Object.entries(CHORD_DEFINITIONS)) {
    if (def.intervals.join(',') === intervalStr) {
      return type as ChordType;
    }
  }
  return null;
}

// ============================================================
// 和弦进行数据库（50+进行）
// ============================================================

/** 和弦进行风格 */
export type ProgressionStyle =
  | 'pop' | 'rock' | 'jazz' | 'blues' | 'classical' | 'folk' | 'r_and_b' | 'electronic' | 'latin';

/** 和弦进行定义 */
export interface ChordProgression {
  name: string;                // 名称
  nameCN: string;              // 中文名称
  style: ProgressionStyle;     // 风格
  degreePattern: string[];     // 级数模式（如 ['I', 'V', 'vi', 'IV']）
  chords: ChordType[];         // 和弦类型序列
  description: string;         // 描述
}

/** 和弦进行数据库 */
export const CHORD_PROGRESSIONS: ChordProgression[] = [
  // ---- 流行 ----
  { name: 'Pop Classic', nameCN: '流行经典', style: 'pop', degreePattern: ['I', 'V', 'vi', 'IV'], chords: ['major', 'major', 'minor', 'major'], description: '最流行的四和弦进行，无数流行金曲' },
  { name: 'Pop vi-IV-I-V', nameCN: '流行下行', style: 'pop', degreePattern: ['vi', 'IV', 'I', 'V'], chords: ['minor', 'major', 'major', 'major'], description: '从vi开始的流行进行，略带忧伤' },
  { name: 'Pop I-IV-vi-V', nameCN: '流行变体A', style: 'pop', degreePattern: ['I', 'IV', 'vi', 'V'], chords: ['major', 'major', 'minor', 'major'], description: 'I-IV开头的流行进行' },
  { name: 'Pop I-vi-IV-V', style: 'pop', nameCN: '流行变体B', degreePattern: ['I', 'vi', 'IV', 'V'], chords: ['major', 'minor', 'major', 'major'], description: '50年代流行进行' },
  { name: 'Pop vi-V-IV-III', nameCN: '流行降序', style: 'pop', degreePattern: ['vi', 'V', 'IV', 'III'], chords: ['minor', 'major', 'major', 'major'], description: '降序五度循环变体' },
  { name: 'Pachelbel Canon', nameCN: '帕赫贝尔卡农', style: 'pop', degreePattern: ['I', 'V', 'vi', 'iii', 'IV', 'I', 'IV', 'V'], chords: ['major', 'major', 'minor', 'minor', 'major', 'major', 'major', 'major'], description: '卡农进行，婚礼音乐经典' },
  { name: 'Pop I-V-vi-IV (Loop)', nameCN: '流行循环', style: 'pop', degreePattern: ['I', 'V', 'vi', 'IV', 'V', 'vi', 'IV', 'I'], chords: ['major', 'major', 'minor', 'major', 'major', 'minor', 'major', 'major'], description: '扩展循环的流行进行' },
  { name: 'Sensitive Female', nameCN: '感性女声', style: 'pop', degreePattern: ['vi', 'IV', 'I', 'V'], chords: ['minor', 'major', 'major', 'major'], description: '常见于感性女声流行歌' },

  // ---- 摇滚 ----
  { name: 'Rock I-IV-V', nameCN: '摇滚基础', style: 'rock', degreePattern: ['I', 'IV', 'V'], chords: ['major', 'major', 'major'], description: '最基础的摇滚三和弦' },
  { name: 'Rock I-bVII-IV', nameCN: '混合利底亚摇滚', style: 'rock', degreePattern: ['I', 'bVII', 'IV'], chords: ['major', 'major', 'major'], description: '降七级特征，硬摇滚常用' },
  { name: 'Rock I-V-IV', nameCN: '摇滚变体', style: 'rock', degreePattern: ['I', 'V', 'IV'], chords: ['major', 'major', 'major'], description: 'V在前的中速摇滚' },
  { name: 'Rock Ballad', nameCN: '摇滚抒情', style: 'rock', degreePattern: ['vi', 'I', 'V', 'IV'], chords: ['minor', 'major', 'major', 'major'], description: '摇滚抒情曲' },
  { name: 'Rock I-bIII-bVII-IV', nameCN: '小调摇滚', style: 'rock', degreePattern: ['I', 'bIII', 'bVII', 'IV'], chords: ['major', 'major', 'major', 'major'], description: '小调色彩摇滚，Nirvana风格' },
  { name: 'Rock IV-I-V-vi', nameCN: '摇滚起IV', style: 'rock', degreePattern: ['IV', 'I', 'V', 'vi'], chords: ['major', 'major', 'major', 'minor'], description: '从下属开始的摇滚进行' },

  // ---- 爵士 ----
  { name: 'Jazz ii-V-I', nameCN: '爵士ii-V-I', style: 'jazz', degreePattern: ['ii', 'V', 'I'], chords: ['minor7', 'dominant7', 'major7'], description: '爵士最核心的三和弦进行' },
  { name: 'Jazz ii-V-I (Minor)', nameCN: '小调ii-V-i', style: 'jazz', degreePattern: ['ii', 'V', 'i'], chords: ['half_diminished7', 'dominant7', 'minor7'], description: '小调版ii-V-i' },
  { name: 'Jazz I-vi-ii-V', nameCN: '爵士Turnaround', style: 'jazz', degreePattern: ['I', 'vi', 'ii', 'V'], chords: ['major7', 'minor7', 'minor7', 'dominant7'], description: '标准回转进行' },
  { name: 'Jazz iii-VI-ii-V', nameCN: '爵士替代回转', style: 'jazz', degreePattern: ['iii', 'VI', 'ii', 'V'], chords: ['minor7', 'dominant7', 'minor7', 'dominant7'], description: '替代回转' },
  { name: 'Jazz I-IV-vii-iii-vi-ii-V-I', nameCN: '爵士圈五度', style: 'jazz', degreePattern: ['I', 'IV', 'vii', 'iii', 'vi', 'ii', 'V', 'I'], chords: ['major7', 'major7', 'half_diminished7', 'minor7', 'minor7', 'minor7', 'dominant7', 'major7'], description: '全圈五度下行' },
  { name: 'Jazz Tritone Sub', nameCN: '三全音替代', style: 'jazz', degreePattern: ['ii', 'bII7', 'I'], chords: ['minor7', 'dominant7', 'major7'], description: 'V7替换为bII7的三全音替代' },
  { name: 'Jazz Coltrane Changes', nameCN: '柯尔特兰变化', style: 'jazz', degreePattern: ['I', 'bIII7', 'bVI7', 'I'], chords: ['major7', 'dominant7', 'dominant7', 'major7'], description: '柯尔特兰大三度循环' },
  { name: 'Jazz Rhythm Changes A', nameCN: '节奏变化A段', style: 'jazz', degreePattern: ['I', 'vi', 'ii', 'V'], chords: ['major7', 'minor7', 'minor7', 'dominant7'], description: 'I Got Rhythm A段进行' },
  { name: 'Jazz Rhythm Changes B', nameCN: '节奏变化B段', style: 'jazz', degreePattern: ['iii', 'VI', 'ii', 'V'], chords: ['minor7', 'dominant7', 'minor7', 'dominant7'], description: 'I Got Rhythm B段桥接' },

  // ---- 布鲁斯 ----
  { name: 'Blues 12-bar', nameCN: '12小节布鲁斯', style: 'blues', degreePattern: ['I7', 'I7', 'I7', 'I7', 'IV7', 'IV7', 'I7', 'I7', 'V7', 'IV7', 'I7', 'V7'], chords: ['dominant7', 'dominant7', 'dominant7', 'dominant7', 'dominant7', 'dominant7', 'dominant7', 'dominant7', 'dominant7', 'dominant7', 'dominant7', 'dominant7'], description: '标准12小节布鲁斯进行' },
  { name: 'Blues Quick Change', nameCN: '快速变化布鲁斯', style: 'blues', degreePattern: ['I7', 'IV7', 'I7', 'I7', 'IV7', 'IV7', 'I7', 'I7', 'V7', 'IV7', 'I7', 'V7'], chords: ['dominant7', 'dominant7', 'dominant7', 'dominant7', 'dominant7', 'dominant7', 'dominant7', 'dominant7', 'dominant7', 'dominant7', 'dominant7', 'dominant7'], description: '第2小节提前到IV7的变体' },
  { name: 'Blues Minor', nameCN: '小调布鲁斯', style: 'blues', degreePattern: ['i7', 'i7', 'i7', 'i7', 'iv7', 'iv7', 'i7', 'i7', 'V7', 'iv7', 'i7', 'V7'], chords: ['minor7', 'minor7', 'minor7', 'minor7', 'minor7', 'minor7', 'minor7', 'minor7', 'dominant7', 'minor7', 'minor7', 'dominant7'], description: '小调布鲁斯进行' },
  { name: 'Blues I7-IV7-V7', nameCN: '布鲁斯三和弦', style: 'blues', degreePattern: ['I7', 'IV7', 'V7'], chords: ['dominant7', 'dominant7', 'dominant7'], description: '简化布鲁斯三和弦' },
  { name: 'Blues Turnaround', nameCN: '布鲁斯回转', style: 'blues', degreePattern: ['I7', 'V7', 'IV7', 'I7'], chords: ['dominant7', 'dominant7', 'dominant7', 'dominant7'], description: '布鲁斯回转结尾' },

  // ---- 古典 ----
  { name: 'Classical I-IV-V-I', nameCN: '古典正格终止', style: 'classical', degreePattern: ['I', 'IV', 'V', 'I'], chords: ['major', 'major', 'major', 'major'], description: '标准正格终止' },
  { name: 'Classical I-vi-IV-V-I', nameCN: '古典变格终止', style: 'classical', degreePattern: ['I', 'vi', 'IV', 'V', 'I'], chords: ['major', 'minor', 'major', 'major', 'major'], description: '含vi的变格终止' },
  { name: 'Classical i-iv-V-i', nameCN: '小调古典终止', style: 'classical', degreePattern: ['i', 'iv', 'V', 'i'], chords: ['minor', 'minor', 'major', 'minor'], description: '小调正格终止' },
  { name: 'Classical Circle of 5ths', nameCN: '圈五度下行', style: 'classical', degreePattern: ['I', 'IV', 'vii', 'iii', 'vi', 'ii', 'V', 'I'], chords: ['major', 'major', 'diminished', 'minor', 'minor', 'minor', 'major', 'major'], description: '巴洛克圈五度模进' },
  { name: 'Classical Deceptive Cadence', nameCN: '阻碍终止', style: 'classical', degreePattern: ['V', 'vi'], chords: ['major', 'minor'], description: 'V→vi而非V→I的阻碍终止' },

  // ---- 民谣 ----
  { name: 'Folk I-IV-V', nameCN: '民谣基础', style: 'folk', degreePattern: ['I', 'IV', 'V'], chords: ['major', 'major', 'major'], description: '最简单的民谣三和弦' },
  { name: 'Folk I-V-vi-IV', nameCN: '民谣流行', style: 'folk', degreePattern: ['I', 'V', 'vi', 'IV'], chords: ['major', 'major', 'minor', 'major'], description: '流行民谣四和弦' },
  { name: 'Folk i-VII-VI-V', nameCN: '小调民谣', style: 'folk', degreePattern: ['i', 'VII', 'VI', 'V'], chords: ['minor', 'major', 'major', 'major'], description: '安达卢进行变体' },
  { name: 'Folk I-iii-IV-V', nameCN: '民谣抒情', style: 'folk', degreePattern: ['I', 'iii', 'IV', 'V'], chords: ['major', 'minor', 'major', 'major'], description: '含iii的柔美进行' },

  // ---- R&B ----
  { name: 'R&B i-iv-VII-III', nameCN: 'R&B小调', style: 'r_and_b', degreePattern: ['i', 'iv', 'VII', 'III'], chords: ['minor7', 'minor7', 'major7', 'major7'], description: 'R&B小调常用进行' },
  { name: 'R&B Neo-Soul', nameCN: '新灵魂乐', style: 'r_and_b', degreePattern: ['IV7', 'iii7', 'vi7', 'ii7'], chords: ['dominant7', 'minor7', 'minor7', 'minor7'], description: '新灵魂乐标志进行' },
  { name: 'R&B ii-V-I-vi', nameCN: 'R&B爵士融合', style: 'r_and_b', degreePattern: ['ii', 'V', 'I', 'vi'], chords: ['minor7', 'dominant7', 'major7', 'minor7'], description: '爵士与R&B的融合' },
  { name: 'R&B i-bVI-bVII-V', nameCN: 'R&B下行', style: 'r_and_b', degreePattern: ['i', 'bVI', 'bVII', 'V'], chords: ['minor7', 'major7', 'major7', 'dominant7'], description: '小调下行特征' },

  // ---- 电子 ----
  { name: 'EDM i-VI-VII-III', nameCN: 'EDM小调', style: 'electronic', degreePattern: ['i', 'VI', 'VII', 'III'], chords: ['minor', 'major', 'major', 'major'], description: '电子舞曲最常用小调进行' },
  { name: 'EDM i-iv-VI-VII', nameCN: 'EDM情感', style: 'electronic', degreePattern: ['i', 'iv', 'VI', 'VII'], chords: ['minor', 'minor', 'major', 'major'], description: '电子情感铺垫' },
  { name: 'EDM Progressive', nameCN: '前卫电子', style: 'electronic', degreePattern: ['vi', 'IV', 'I', 'V'], chords: ['minor', 'major', 'major', 'major'], description: '前卫电子渐进' },
  { name: 'EDM i-bVI-III-VII', nameCN: '电子大调桥', style: 'electronic', degreePattern: ['i', 'bVI', 'III', 'VII'], chords: ['minor', 'major', 'major', 'major'], description: '小调转大调桥段' },

  // ---- 拉丁 ----
  { name: 'Latin Montuno', nameCN: '拉丁蒙图诺', style: 'latin', degreePattern: ['I', 'IV', 'V', 'I'], chords: ['major', 'major', 'major', 'major'], description: '拉丁蒙图诺基础' },
  { name: 'Latin ii-V-I (Minor)', nameCN: '拉丁小调', style: 'latin', degreePattern: ['ii', 'V', 'i'], chords: ['minor7', 'dominant7', 'minor7'], description: '波萨诺瓦小调ii-V-i' },
  { name: 'Latin Andalusian', nameCN: '安达卢进行', style: 'latin', degreePattern: ['i', 'VII', 'VI', 'V'], chords: ['minor', 'major', 'major', 'major'], description: '弗拉门戈安达卢进行' },
  { name: 'Latin Bolero', nameCN: '波莱罗', style: 'latin', degreePattern: ['I', 'vi', 'ii', 'V'], chords: ['major', 'minor', 'minor7', 'dominant7'], description: '拉丁波莱罗浪漫进行' },
  { name: 'Latin Salsa', nameCN: '萨尔萨', style: 'latin', degreePattern: ['I', 'V', 'I', 'IV', 'IV', 'I', 'V', 'I'], chords: ['major7', 'dominant7', 'major7', 'major7', 'major7', 'major7', 'dominant7', 'major7'], description: '萨尔萨8小节进行' },
  { name: 'Latin Bossa Nova', nameCN: '波萨诺瓦', style: 'latin', degreePattern: ['I', 'ii', 'V', 'I'], chords: ['major7', 'minor7', 'dominant7', 'major7'], description: '波萨诺瓦四小节' },
];

/** 按风格筛选和弦进行 */
export function getProgressionsByStyle(style: ProgressionStyle): ChordProgression[] {
  return CHORD_PROGRESSIONS.filter(p => p.style === style);
}

/** 在指定调上解析和弦进行 */
export function resolveProgression(
  key: KeyName,
  mode: KeyMode,
  progression: ChordProgression
): string[] {
  const keyNotes = KEY_SCALE_NOTES[key];
  const degreeMap: Record<string, number> = {
    'I': 0, 'II': 1, 'III': 2, 'IV': 3, 'V': 4, 'VI': 5, 'VII': 6,
    'i': 0, 'ii': 1, 'iii': 2, 'iv': 3, 'v': 4, 'vi': 5, 'vii': 6,
  };
  // 降级映射
  const flatDegreeMap: Record<string, number> = {
    'bII': 1, 'bIII': 2, 'bVII': 6, 'bVI': 5,
  };

  return progression.degreePattern.map(degree => {
    const cleanDegree = degree.replace('7', ''); // 去掉7标记
    let index = degreeMap[cleanDegree];
    if (index === undefined) index = flatDegreeMap[cleanDegree];
    if (index === undefined) index = 0;
    return keyNotes[index % 7];
  });
}

// ============================================================
// 第四部分：节奏系统
// ============================================================

/** 拍号 */
export interface TimeSignature {
  beatsPerMeasure: number;    // 每小节拍数
  beatUnit: number;           // 拍的单位（4=四分音符, 8=八分音符）
  nameCN: string;             // 中文名称
  feel: 'simple' | 'compound' | 'odd';  // 感觉类型
}

/** 常见拍号数据库 */
export const TIME_SIGNATURES: TimeSignature[] = [
  { beatsPerMeasure: 4, beatUnit: 4, nameCN: '四四拍', feel: 'simple' },
  { beatsPerMeasure: 3, beatUnit: 4, nameCN: '三四拍（圆舞曲）', feel: 'simple' },
  { beatsPerMeasure: 2, beatUnit: 4, nameCN: '二四拍', feel: 'simple' },
  { beatsPerMeasure: 6, beatUnit: 8, nameCN: '六八拍', feel: 'compound' },
  { beatsPerMeasure: 9, beatUnit: 8, nameCN: '九八拍', feel: 'compound' },
  { beatsPerMeasure: 12, beatUnit: 8, nameCN: '十二八拍', feel: 'compound' },
  { beatsPerMeasure: 5, beatUnit: 4, nameCN: '五四拍', feel: 'odd' },
  { beatsPerMeasure: 7, beatUnit: 8, nameCN: '七八拍', feel: 'odd' },
  { beatsPerMeasure: 7, beatUnit: 4, nameCN: '七四拍', feel: 'odd' },
  { beatsPerMeasure: 11, beatUnit: 8, nameCN: '十一八拍', feel: 'odd' },
  { beatsPerMeasure: 3, beatUnit: 8, nameCN: '三八拍', feel: 'simple' },
  { beatsPerMeasure: 2, beatUnit: 2, nameCN: '二二拍（阿拉贝斯克）', feel: 'simple' },
];

/** 律动模式 */
export type GrooveMode = 'straight' | 'swing' | 'shuffle';

/** 律动定义 */
export interface GrooveDefinition {
  mode: GrooveMode;
  nameCN: string;
  /** 八分音符时值比例（1.0=直，0.67=swing三分法，0.75=shuffle） */
  eighthNoteRatio: number;
  description: string;
}

/** 律动模式定义 */
export const GROOVE_MODES: Record<GrooveMode, GrooveDefinition> = {
  straight: {
    mode: 'straight', nameCN: '直拍',
    eighthNoteRatio: 1.0,
    description: '等分时值，流行和摇滚标准',
  },
  swing: {
    mode: 'swing', nameCN: '摇摆',
    eighthNoteRatio: 0.67,
    description: '三分法摇摆感，爵士标准',
  },
  shuffle: {
    mode: 'shuffle', nameCN: '拖曳',
    eighthNoteRatio: 0.75,
    description: '介于直拍和摇摆之间，布鲁斯特征',
  },
};

/** 节奏型 */
export interface RhythmPattern {
  name: string;              // 名称
  nameCN: string;            // 中文名称
  style: string;             // 风格
  timeSignature: TimeSignature;
  groove: GrooveMode;
  /** 每拍细分为16个位置（0-15），1=有音，0=无音 */
  pattern: number[][];
  bpmRange: [number, number]; // 速度范围
  description: string;
}

/** 节奏型数据库（30+节奏型） */
export const RHYTHM_PATTERNS: RhythmPattern[] = [
  // ---- 摇滚 ----
  {
    name: 'Rock Basic', nameCN: '摇滚基础', style: 'rock',
    timeSignature: TIME_SIGNATURES[0], groove: 'straight',
    pattern: [
      [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],  // 底鼓
      [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0],  // 军鼓
      [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],  // 踩镲
    ],
    bpmRange: [100, 140], description: '四拍全踩底鼓，2/4拍军鼓',
  },
  {
    name: 'Rock Half-time', nameCN: '摇滚半拍', style: 'rock',
    timeSignature: TIME_SIGNATURES[0], groove: 'straight',
    pattern: [
      [1,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      [0,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
      [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
    ],
    bpmRange: [60, 100], description: '第三拍军鼓，沉重感',
  },
  {
    name: 'Rock Double-time', nameCN: '摇滚双拍', style: 'rock',
    timeSignature: TIME_SIGNATURES[0], groove: 'straight',
    pattern: [
      [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
      [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0],
      [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1],
    ],
    bpmRange: [140, 180], description: '快速密集底鼓，朋克摇滚',
  },
  {
    name: 'Power Ballad', nameCN: '力量抒情', style: 'rock',
    timeSignature: TIME_SIGNATURES[0], groove: 'straight',
    pattern: [
      [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
      [0,0,0,0, 0,0,1,0, 0,0,0,0, 0,0,1,0],
      [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
    ],
    bpmRange: [60, 90], description: '抒情摇滚鼓点',
  },

  // ---- 爵士 ----
  {
    name: 'Jazz Ride', nameCN: '爵士骑镲', style: 'jazz',
    timeSignature: TIME_SIGNATURES[0], groove: 'swing',
    pattern: [
      [1,0,0,0, 0,0,1,0, 0,0,1,0, 0,0,0,0],  // 底鼓轻
      [0,0,0,0, 0,0,0,0, 0,0,0,0, 1,0,0,0],  // 交叉击
      [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],  // 骑镲
    ],
    bpmRange: [100, 200], description: '标准爵士骑镲律动',
  },
  {
    name: 'Jazz Waltz', nameCN: '爵士圆舞曲', style: 'jazz',
    timeSignature: TIME_SIGNATURES[1], groove: 'swing',
    pattern: [
      [1,0,0,0, 0,0,0,0, 0,0,1,0],
      [0,0,0,0, 1,0,0,0, 0,0,0,0],
      [1,0,1,0, 1,0,1,0, 1,0,1,0],
    ],
    bpmRange: [120, 180], description: '3/4拍爵士骑镲',
  },
  {
    name: 'Jazz Brushes', nameCN: '爵士鼓刷', style: 'jazz',
    timeSignature: TIME_SIGNATURES[0], groove: 'swing',
    pattern: [
      [1,0,0,1, 0,0,1,0, 0,1,0,0, 1,0,0,0],
      [0,0,0,0, 0,0,0,0, 0,0,0,0, 1,0,0,0],
      [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1],
    ],
    bpmRange: [60, 120], description: '鼓刷柔和律动',
  },

  // ---- 放克 ----
  {
    name: 'Funk Basic', nameCN: '放克基础', style: 'funk',
    timeSignature: TIME_SIGNATURES[0], groove: 'straight',
    pattern: [
      [1,0,0,1, 0,0,1,0, 0,1,0,0, 1,0,0,0],
      [0,0,0,0, 0,0,1,0, 0,0,0,0, 0,0,1,0],
      [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1],
    ],
    bpmRange: [90, 120], description: '放克十六分踩镲',
  },
  {
    name: 'Funk Syncopated', nameCN: '放克切分', style: 'funk',
    timeSignature: TIME_SIGNATURES[0], groove: 'straight',
    pattern: [
      [1,0,0,0, 0,0,1,0, 0,0,0,1, 0,0,0,0],
      [0,0,0,0, 0,0,1,0, 0,0,0,0, 0,0,1,0],
      [1,0,1,1, 1,0,1,1, 1,0,1,1, 1,0,1,1],
    ],
    bpmRange: [90, 120], description: '切分底鼓放克',
  },
  {
    name: 'Funk Disco', nameCN: '迪斯科', style: 'funk',
    timeSignature: TIME_SIGNATURES[0], groove: 'straight',
    pattern: [
      [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
      [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
      [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1],
    ],
    bpmRange: [110, 140], description: '四拍底鼓的迪斯科律动',
  },
  {
    name: 'Funk James Brown', nameCN: '詹姆斯·布朗', style: 'funk',
    timeSignature: TIME_SIGNATURES[0], groove: 'straight',
    pattern: [
      [1,0,0,1, 0,0,0,0, 1,0,1,0, 0,0,0,0],
      [0,0,0,0, 0,0,1,0, 0,0,0,0, 0,0,1,0],
      [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1],
    ],
    bpmRange: [80, 110], description: '詹姆斯·布朗经典放克',
  },

  // ---- 拉丁 ----
  {
    name: 'Bossa Nova', nameCN: '波萨诺瓦', style: 'latin',
    timeSignature: TIME_SIGNATURES[0], groove: 'straight',
    pattern: [
      [1,0,0,1, 0,0,1,0, 0,1,0,0, 1,0,0,0],
      [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      [1,0,1,0, 0,0,1,0, 1,0,0,0, 0,1,0,0],
    ],
    bpmRange: [120, 160], description: '波萨诺瓦踩镲节奏',
  },
  {
    name: 'Samba', nameCN: '桑巴', style: 'latin',
    timeSignature: TIME_SIGNATURES[0], groove: 'straight',
    pattern: [
      [1,0,0,1, 0,1,0,0, 1,0,0,1, 0,1,0,0],
      [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
    ],
    bpmRange: [180, 220], description: '桑巴快速律动',
  },
  {
    name: 'Rumba', nameCN: '伦巴', style: 'latin',
    timeSignature: TIME_SIGNATURES[0], groove: 'straight',
    pattern: [
      [0,0,0,0, 1,0,0,0, 0,0,1,0, 0,0,0,0],
      [0,0,0,0, 0,0,0,0, 0,0,0,0, 1,0,0,0],
      [1,0,0,1, 0,0,1,0, 0,0,0,1, 0,1,0,0],
    ],
    bpmRange: [100, 130], description: '伦巴 clave节奏',
  },
  {
    name: 'Salsa', nameCN: '萨尔萨', style: 'latin',
    timeSignature: TIME_SIGNATURES[0], groove: 'straight',
    pattern: [
      [1,0,0,0, 0,0,1,0, 0,0,0,0, 1,0,0,0],
      [0,0,0,0, 0,0,0,0, 0,0,1,0, 0,0,0,0],
      [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
    ],
    bpmRange: [150, 200], description: '萨尔萨节奏 clave',
  },
  {
    name: 'Reggaeton', nameCN: '雷鬼顿', style: 'latin',
    timeSignature: TIME_SIGNATURES[0], groove: 'straight',
    pattern: [
      [1,0,0,1, 0,0,1,0, 1,0,0,1, 0,0,1,0],
      [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      [1,0,0,1, 0,0,1,0, 1,0,0,1, 0,0,1,0],
    ],
    bpmRange: [80, 100], description: 'Dembow节奏雷鬼顿',
  },

  // ---- 电子 ----
  {
    name: 'EDM Four on Floor', nameCN: '四拍底鼓', style: 'electronic',
    timeSignature: TIME_SIGNATURES[0], groove: 'straight',
    pattern: [
      [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
      [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    ],
    bpmRange: [120, 140], description: '电子舞曲标准四拍',
  },
  {
    name: 'House', nameCN: '浩室', style: 'electronic',
    timeSignature: TIME_SIGNATURES[0], groove: 'straight',
    pattern: [
      [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
      [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0],
    ],
    bpmRange: [118, 135], description: '浩室音乐踩镲反拍',
  },
  {
    name: 'Techno', nameCN: '铁克诺', style: 'electronic',
    timeSignature: TIME_SIGNATURES[0], groove: 'straight',
    pattern: [
      [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
      [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1],
    ],
    bpmRange: [125, 150], description: '铁克诺密集十六分',
  },
  {
    name: 'DNB', nameCN: '鼓打贝斯', style: 'electronic',
    timeSignature: TIME_SIGNATURES[0], groove: 'straight',
    pattern: [
      [0,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,1,0],
      [1,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
    ],
    bpmRange: [160, 180], description: 'DnB 2-step底鼓',
  },
  {
    name: 'Trance', nameCN: '迷幻舞曲', style: 'electronic',
    timeSignature: TIME_SIGNATURES[0], groove: 'straight',
    pattern: [
      [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
      [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0],
    ],
    bpmRange: [125, 150], description: 'Trance反拍踩镲',
  },
  {
    name: 'Dubstep', nameCN: '回响步', style: 'electronic',
    timeSignature: TIME_SIGNATURES[0], groove: 'straight',
    pattern: [
      [1,0,0,0, 0,0,0,0, 1,0,0,1, 0,0,0,0],
      [0,0,0,0, 0,0,1,0, 0,0,0,0, 0,0,1,0],
      [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
    ],
    bpmRange: [130, 150], description: 'Dubstep半拍底鼓+切分',
  },

  // ---- 其他 ----
  {
    name: 'Waltz', nameCN: '圆舞曲', style: 'classical',
    timeSignature: TIME_SIGNATURES[1], groove: 'straight',
    pattern: [
      [1,0,0,0, 0,0,0,0, 0,0,0,0],
      [0,0,0,0, 0,0,1,0, 0,0,0,0],
      [1,0,1,0, 1,0,1,0, 1,0,1,0],
    ],
    bpmRange: [80, 160], description: '3/4拍古典圆舞曲',
  },
  {
    name: 'Country Train Beat', nameCN: '乡村火车拍', style: 'folk',
    timeSignature: TIME_SIGNATURES[0], groove: 'straight',
    pattern: [
      [1,0,0,0, 0,0,1,0, 1,0,0,0, 0,0,1,0],
      [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,1,0],
      [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1],
    ],
    bpmRange: [100, 140], description: '乡村音乐火车律动',
  },
  {
    name: 'Reggae One Drop', nameCN: '雷鬼一拍', style: 'folk',
    timeSignature: TIME_SIGNATURES[0], groove: 'straight',
    pattern: [
      [0,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
      [0,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
      [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0],
    ],
    bpmRange: [70, 90], description: '雷鬼第三拍重音',
  },
  {
    name: 'Hip Hop', nameCN: '嘻哈', style: 'r_and_b',
    timeSignature: TIME_SIGNATURES[0], groove: 'straight',
    pattern: [
      [1,0,0,1, 0,0,0,0, 1,0,1,0, 0,0,0,0],
      [0,0,0,0, 0,0,1,0, 0,0,0,0, 0,0,1,0],
      [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
    ],
    bpmRange: [80, 110], description: '嘻哈Boom Bap鼓点',
  },
  {
    name: 'Trap', nameCN: '陷阱音乐', style: 'r_and_b',
    timeSignature: TIME_SIGNATURES[0], groove: 'straight',
    pattern: [
      [1,0,0,0, 0,0,0,0, 0,0,1,0, 0,0,0,0],
      [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0],
      [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1],
    ],
    bpmRange: [130, 170], description: '陷阱密集踩镲+稀疏底鼓',
  },
  {
    name: 'Afrobeat', nameCN: '非洲节拍', style: 'latin',
    timeSignature: TIME_SIGNATURES[0], groove: 'straight',
    pattern: [
      [1,0,0,1, 0,0,0,0, 1,0,0,0, 0,1,0,0],
      [0,0,0,0, 0,0,1,0, 0,0,0,0, 0,0,1,0],
      [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
    ],
    bpmRange: [110, 130], description: '非洲节拍交叉律动',
  },
  {
    name: 'Polka', nameCN: '波尔卡', style: 'folk',
    timeSignature: TIME_SIGNATURES[2], groove: 'straight',
    pattern: [
      [1,0,0,0, 0,0,1,0],
      [0,0,1,0, 0,0,0,0],
      [1,0,1,0, 1,0,1,0],
    ],
    bpmRange: [120, 160], description: '2/4拍波尔卡',
  },
];

/** 按风格筛选节奏型 */
export function getRhythmPatternsByStyle(style: string): RhythmPattern[] {
  return RHYTHM_PATTERNS.filter(p => p.style === style);
}

/** 计算律动后的时值 */
export function applyGroove(tickPositions: number[], groove: GrooveMode): number[] {
  const ratio = GROOVE_MODES[groove].eighthNoteRatio;
  return tickPositions.map(tick => {
    // 对八分音符位置应用摇摆
    const beat = Math.floor(tick / 8);
    const pos = tick % 8;
    if (pos === 0) return beat * 8;
    return beat * 8 + pos * ratio;
  });
}

// ============================================================
// 第五部分：旋律生成辅助
// ============================================================

/** 音程类型 */
export type IntervalType =
  | 'unison' | 'minor2nd' | 'major2nd' | 'minor3rd' | 'major3rd'
  | 'perfect4th' | 'tritone' | 'perfect5th' | 'minor6th' | 'major6th'
  | 'minor7th' | 'major7th' | 'octave';

/** 音程信息 */
export interface IntervalInfo {
  type: IntervalType;
  nameCN: string;
  semitones: number;
  consonance: number;  // 协和度 0-1（1=完全协和）
}

/** 音程数据库 */
export const INTERVALS: IntervalInfo[] = [
  { type: 'unison',     nameCN: '纯一度',   semitones: 0,  consonance: 1.0 },
  { type: 'minor2nd',   nameCN: '小二度',   semitones: 1,  consonance: 0.1 },
  { type: 'major2nd',   nameCN: '大二度',   semitones: 2,  consonance: 0.3 },
  { type: 'minor3rd',   nameCN: '小三度',   semitones: 3,  consonance: 0.7 },
  { type: 'major3rd',   nameCN: '大三度',   semitones: 4,  consonance: 0.8 },
  { type: 'perfect4th', nameCN: '纯四度',   semitones: 5,  consonance: 0.9 },
  { type: 'tritone',    nameCN: '三全音',   semitones: 6,  consonance: 0.2 },
  { type: 'perfect5th', nameCN: '纯五度',   semitones: 7,  consonance: 0.95 },
  { type: 'minor6th',   nameCN: '小六度',   semitones: 8,  consonance: 0.6 },
  { type: 'major6th',   nameCN: '大六度',   semitones: 9,  consonance: 0.7 },
  { type: 'minor7th',   nameCN: '小七度',   semitones: 10, consonance: 0.5 },
  { type: 'major7th',   nameCN: '大七度',   semitones: 11, consonance: 0.3 },
  { type: 'octave',     nameCN: '纯八度',   semitones: 12, consonance: 1.0 },
];

/** 计算两个音之间的音程 */
export function calculateInterval(note1: string, note2: string): IntervalInfo {
  const semitone1 = noteToSemitone(note1);
  const semitone2 = noteToSemitone(note2);
  const diff = ((semitone2 - semitone1) % 12 + 12) % 12;
  return INTERVALS.find(i => i.semitones === diff) ?? INTERVALS[0];
}

/** 计算两个MIDI编号之间的音程半音数 */
export function midiInterval(midi1: number, midi2: number): number {
  return Math.abs(midi2 - midi1);
}

/** 旋律轮廓类型 */
export type MelodicContourType = 'ascending' | 'descending' | 'arch' | 'inverted_arch' | 'wave' | 'static';

/** 旋律轮廓分析结果 */
export interface MelodicContour {
  type: MelodicContourType;
  nameCN: string;
  /** 轮廓向量（每步的方向：+1上，-1下，0平） */
  vector: number[];
  /** 整体音程跨度（半音） */
  span: number;
  /** 最高点位置（0-based索引） */
  peakIndex: number;
  /** 最低点位置 */
  valleyIndex: number;
}

/** 分析旋律轮廓 */
export function analyzeMelodicContour(pitches: number[]): MelodicContour {
  const vector: number[] = [];
  let peakValue = -Infinity;
  let valleyValue = Infinity;
  let peakIndex = 0;
  let valleyIndex = 0;

  for (let i = 0; i < pitches.length; i++) {
    if (pitches[i] > peakValue) { peakValue = pitches[i]; peakIndex = i; }
    if (pitches[i] < valleyValue) { valleyValue = pitches[i]; valleyIndex = i; }
    if (i > 0) {
      const diff = pitches[i] - pitches[i - 1];
      vector.push(diff > 0 ? 1 : diff < 0 ? -1 : 0);
    }
  }

  const span = peakValue - valleyValue;
  const ascents = vector.filter(v => v > 0).length;
  const descents = vector.filter(v => v < 0).length;
  const directionChanges = vector.filter((v, i) => i > 0 && v !== vector[i - 1] && v !== 0 && vector[i - 1] !== 0).length;

  let type: MelodicContourType;
  if (span === 0) {
    type = 'static';
  } else if (descents === 0) {
    type = 'ascending';
  } else if (ascents === 0) {
    type = 'descending';
  } else if (peakIndex > 0 && peakIndex === pitches.length - 1 - valleyIndex && directionChanges <= 2) {
    type = peakIndex < valleyIndex ? 'inverted_arch' : 'arch';
  } else {
    type = 'wave';
  }

  const contourNames: Record<MelodicContourType, string> = {
    ascending: '上升', descending: '下降', arch: '拱形',
    inverted_arch: '倒拱形', wave: '波浪', static: '静止',
  };

  return { type, nameCN: contourNames[type], vector, span, peakIndex, valleyIndex };
}

/** 乐句结构类型 */
export type PhraseStructure = 'AABA' | 'ABAC' | 'AB' | 'AAA' | 'ABCA' | 'through_composed';

/** 乐句结构定义 */
export interface PhraseStructureDefinition {
  structure: PhraseStructure;
  nameCN: string;
  sections: string[];
  description: string;
}

/** 乐句结构数据库 */
export const PHRASE_STRUCTURES: Record<PhraseStructure, PhraseStructureDefinition> = {
  AABA: {
    structure: 'AABA', nameCN: 'AABA曲式',
    sections: ['A', 'A', 'B', 'A'],
    description: '标准32小节歌曲形式，爵士标准曲主流',
  },
  ABAC: {
    structure: 'ABAC', nameCN: 'ABAC曲式',
    sections: ['A', 'B', 'A', 'C'],
    description: '变化再现式，流行和百老汇常用',
  },
  AB: {
    structure: 'AB', nameCN: 'AB二段式',
    sections: ['A', 'B'],
    description: '主歌-副歌形式，流行音乐最基本结构',
  },
  AAA: {
    structure: 'AAA', nameCN: 'AAA三段式',
    sections: ['A', 'A', 'A'],
    description: '持续重复的十二小节布鲁斯形式',
  },
  ABCA: {
    structure: 'ABCA', nameCN: 'ABCA曲式',
    sections: ['A', 'B', 'C', 'A'],
    description: '三段对比后回归，艺术歌曲常用',
  },
  through_composed: {
    structure: 'through_composed', nameCN: '通谱体',
    sections: ['A', 'B', 'C', 'D'],
    description: '每段全新素材，艺术歌曲和现代音乐',
  },
};

/** 乐句段落 */
export interface PhraseSection {
  label: string;           // A/B/C/D
  startMeasure: number;    // 起始小节
  endMeasure: number;      // 结束小节
  motif: number[];         // 主题动机（MIDI编号）
}

/** 根据乐句结构生成小节分配 */
export function assignPhraseMeasures(
  structure: PhraseStructure,
  totalMeasures: number
): PhraseSection[] {
  const def = PHRASE_STRUCTURES[structure];
  const sectionCount = def.sections.length;
  const measuresPerSection = Math.floor(totalMeasures / sectionCount);
  const sections: PhraseSection[] = [];
  let currentMeasure = 0;

  for (let i = 0; i < sectionCount; i++) {
    const label = def.sections[i];
    const endMeasure = currentMeasure + measuresPerSection - 1;
    sections.push({
      label,
      startMeasure: currentMeasure,
      endMeasure,
      motif: [],
    });
    currentMeasure = endMeasure + 1;
  }

  return sections;
}

/** 旋律生成参数 */
export interface MelodyGenParams {
  key: KeyName;
  mode: KeyMode;
  scaleType: ScaleType;
  octave: Octave;
  phraseStructure: PhraseStructure;
  contour: MelodicContourType;
  noteCount: number;
  maxLeap: number;        // 最大跳跃半音数
  consonanceThreshold: number; // 协和度阈值
}

/** 生成简单旋律（基于约束的随机生成） */
export function generateMelody(params: MelodyGenParams, seed: number = 42): number[] {
  const { scaleType, octave, noteCount, maxLeap, consonanceThreshold } = params;
  const scaleMIDI = scaleToMIDI(params.key, scaleType, octave);

  // 简易伪随机数生成器
  let s = seed;
  const rand = (): number => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };

  const melody: number[] = [];
  // 从音阶中间开始
  const startIdx = Math.floor(scaleMIDI.length / 2);
  melody.push(scaleMIDI[startIdx]);

  for (let i = 1; i < noteCount; i++) {
    const lastNote = melody[i - 1];
    // 寻找音阶中在跳跃范围内的候选音
    const candidates = scaleMIDI.filter(note => {
      const leap = Math.abs(note - lastNote);
      if (leap > maxLeap) return false;
      const intervalSemitones = Math.min(leap, 12);
      const intervalInfo = INTERVALS.find(iv => iv.semitones === intervalSemitones);
      if (!intervalInfo) return false;
      return intervalInfo.consonance >= consonanceThreshold;
    });

    if (candidates.length === 0) {
      // 无候选则重复上一音
      melody.push(lastNote);
    } else {
      // 加权随机选择
      const weights = candidates.map(c => 1 / (1 + Math.abs(c - lastNote)));
      const totalWeight = weights.reduce((a, b) => a + b, 0);
      let r = rand() * totalWeight;
      let chosen = candidates[0];
      for (let j = 0; j < candidates.length; j++) {
        r -= weights[j];
        if (r <= 0) { chosen = candidates[j]; break; }
      }
      melody.push(chosen);
    }
  }

  // 根据轮廓微调旋律
  const contour = params.contour;
  if (contour === 'ascending') {
    melody.sort((a, b) => a - b);
  } else if (contour === 'descending') {
    melody.sort((a, b) => b - a);
  } else if (contour === 'arch') {
    const half = Math.floor(melody.length / 2);
    const firstHalf = melody.slice(0, half).sort((a, b) => a - b);
    const secondHalf = melody.slice(half).sort((a, b) => b - a);
    melody.splice(0, melody.length, ...firstHalf, ...secondHalf);
  }

  return melody;
}

// ============================================================
// 第六部分：调性分析
// ============================================================

/** Krumhansl-Schmuckler 调性检测算法 */
/** 大调音程分布（Krumhansl-Kessler 1982） */
export const KK_MAJOR_PROFILE: number[] = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];

/** 小调音程分布（Krumhansl-Kessler 1982） */
export const KK_MINOR_PROFILE: number[] = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

/** 调性分析结果 */
export interface KeyAnalysisResult {
  key: KeyName;
  mode: KeyMode;
  nameCN: string;
  correlation: number;    // 相关系数（越高越匹配）
  confidence: number;     // 置信度 0-1
}

/** 从音符序列构建音程分布向量 */
export function buildPitchDistribution(midiNotes: number[]): number[] {
  const distribution = new Array(12).fill(0);
  for (const note of midiNotes) {
    const pitchClass = ((note % 12) + 12) % 12;
    distribution[pitchClass] += 1;
  }
  return distribution;
}

/** 皮尔逊相关系数 */
function pearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
    sumXY += x[i] * y[i];
    sumX2 += x[i] * x[i];
    sumY2 += y[i] * y[i];
  }
  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  return denominator === 0 ? 0 : numerator / denominator;
}

/** 旋转数组（循环移位） */
function rotateArray(arr: number[], shift: number): number[] {
  const n = arr.length;
  const result = new Array(n);
  for (let i = 0; i < n; i++) {
    result[i] = arr[((i - shift) % n + n) % n];
  }
  return result;
}

/**
 * Krumhansl-Schmuckler 调性检测算法
 * 输入MIDI音符序列，输出各调性的匹配度排名
 */
export function detectKey(midiNotes: number[]): KeyAnalysisResult[] {
  const distribution = buildPitchDistribution(midiNotes);
  const results: KeyAnalysisResult[] = [];

  for (let shift = 0; shift < 12; shift++) {
    // 大调检测
    const rotatedMajor = rotateArray(KK_MAJOR_PROFILE, shift);
    const corrMajor = pearsonCorrelation(distribution, rotatedMajor);
    results.push({
      key: NOTE_NAMES_SHARP[shift] as KeyName,
      mode: 'major',
      nameCN: `${NOTE_NAMES_SHARP[shift]}大调`,
      correlation: corrMajor,
      confidence: 0,
    });

    // 小调检测
    const rotatedMinor = rotateArray(KK_MINOR_PROFILE, shift);
    const corrMinor = pearsonCorrelation(distribution, rotatedMinor);
    results.push({
      key: NOTE_NAMES_SHARP[shift] as KeyName,
      mode: 'minor',
      nameCN: `${NOTE_NAMES_SHARP[shift]}小调`,
      correlation: corrMinor,
      confidence: 0,
    });
  }

  // 按相关系数降序排列
  results.sort((a, b) => b.correlation - a.correlation);

  // 计算置信度（归一化到0-1）
  const maxCorr = results[0]?.correlation ?? 1;
  const minCorr = results[results.length - 1]?.correlation ?? 0;
  const range = maxCorr - minCorr;

  for (const r of results) {
    r.confidence = range === 0 ? 0 : (r.correlation - minCorr) / range;
  }

  return results;
}

/** 获取最可能的调性 */
export function detectBestKey(midiNotes: number[]): KeyAnalysisResult {
  const results = detectKey(midiNotes);
  return results[0];
}

/** 从音名序列检测调性 */
export function detectKeyFromNoteNames(notes: string[]): KeyAnalysisResult {
  const midiNotes = notes.map(n => noteToSemitone(n) + 60); // 统一到C4八度
  return detectBestKey(midiNotes);
}

// ============================================================
// 第七部分：工具函数
// ============================================================

/** MIDI编号转音高 */
export function midiToPitch(midi: number): Pitch {
  const octave = Math.floor(midi / 12) - 1;
  const noteIndex = ((midi % 12) + 12) % 12;
  return {
    note: NOTE_NAMES_SHARP[noteIndex],
    octave: Math.min(Math.max(octave, 0), 8) as Octave,
  };
}

/** 音高转MIDI编号 */
export function pitchToMidi(pitch: Pitch): number {
  return noteToSemitone(pitch.note) + (pitch.octave + 1) * 12;
}

/** 音高转频率（A4=440Hz） */
export function pitchToFrequency(pitch: Pitch): number {
  const midi = pitchToMidi(pitch);
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** MIDI编号转频率 */
export function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** 频率转MIDI编号 */
export function frequencyToMidi(freq: number): number {
  return Math.round(12 * Math.log2(freq / 440) + 69);
}

/** 频率转音高 */
export function frequencyToPitch(freq: number): Pitch {
  return midiToPitch(frequencyToMidi(freq));
}

/** 音程半音数转音名 */
export function intervalToName(semitones: number): string {
  const absSemi = ((semitones % 12) + 12) % 12;
  const names = ['P1', 'm2', 'M2', 'm3', 'M3', 'P4', 'TT', 'P5', 'm6', 'M6', 'm7', 'M7'];
  return names[absSemi];
}

/** 计算两个音高之间的半音距离 */
export function semitoneDistance(pitch1: Pitch, pitch2: Pitch): number {
  return pitchToMidi(pitch2) - pitchToMidi(pitch1);
}

/** 移调（半音数） */
export function transposePitch(pitch: Pitch, semitones: number): Pitch {
  const midi = pitchToMidi(pitch) + semitones;
  return midiToPitch(midi);
}

/** 移调一组音符 */
export function transposePitches(pitches: Pitch[], semitones: number): Pitch[] {
  return pitches.map(p => transposePitch(p, semitones));
}

/** 移调MIDI序列 */
export function transposeMIDI(notes: number[], semitones: number): number[] {
  return notes.map(n => n + semitones);
}

// ============================================================
// 第八部分：五度圈工具
// ============================================================

/** 五度圈顺序（从C开始顺时针） */
export const CIRCLE_OF_FIFTHS: KeyName[] = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'Ab', 'Eb', 'Bb', 'F'];

/** 五度圈上的距离（顺时针方向） */
export function circleOfFifthsDistance(from: KeyName, to: KeyName): number {
  const fromIdx = CIRCLE_OF_FIFTHS.indexOf(from);
  const toIdx = CIRCLE_OF_FIFTHS.indexOf(to);
  if (fromIdx === -1 || toIdx === -1) return 0;
  return ((toIdx - fromIdx) % 12 + 12) % 12;
}

/** 在五度圈上移动 */
export function circleOfFifthsMove(from: KeyName, steps: number): KeyName {
  const fromIdx = CIRCLE_OF_FIFTHS.indexOf(from);
  const toIdx = ((fromIdx + steps) % 12 + 12) % 12;
  return CIRCLE_OF_FIFTHS[toIdx];
}

/** 获取调的近关系调（五度圈上±1及关系小调） */
export function getRelatedKeys(key: KeyName, mode: KeyMode): KeyDefinition[] {
  const related: KeyDefinition[] = [];
  const idx = CIRCLE_OF_FIFTHS.indexOf(key);

  // 五度圈上的邻居
  const prev = CIRCLE_OF_FIFTHS[((idx - 1) % 12 + 12) % 12];
  const next = CIRCLE_OF_FIFTHS[((idx + 1) % 12 + 12) % 12];

  const findKeyDef = (k: KeyName, m: KeyMode): KeyDefinition | undefined => {
    return ALL_24_KEYS.find(kd => kd.key === k && kd.mode === m);
  };

  // 当前调
  const current = findKeyDef(key, mode);
  if (current) related.push(current);

  // 属调（五度上方）
  const dominant = findKeyDef(next, mode);
  if (dominant) related.push(dominant);

  // 下属调（五度下方）
  const subdominant = findKeyDef(prev, mode);
  if (subdominant) related.push(subdominant);

  // 关系调
  const relKey = getRelativeKey(key, mode);
  const relative = findKeyDef(relKey.key, relKey.mode);
  if (relative) related.push(relative);

  // 同主音调
  const parKey = getParallelKey(key, mode);
  const parallel = findKeyDef(parKey.key, parKey.mode);
  if (parallel) related.push(parallel);

  return related;
}

// ============================================================
// 第九部分：和弦功能与级数
// ============================================================

/** 和弦功能 */
export type ChordFunction = 'tonic' | 'dominant' | 'predominant' | 'subdominant' | 'mediant';

/** 和弦级数信息 */
export interface ScaleDegreeChord {
  degree: number;            // 级数（1-7）
  roman: string;             // 罗马数字
  chordType: ChordType;      // 和弦类型
  function: ChordFunction;   // 功能
  nameCN: string;            // 中文功能名
}

/** 大调和弦级数 */
export const MAJOR_SCALE_CHORDS: ScaleDegreeChord[] = [
  { degree: 1, roman: 'I',   chordType: 'major',        function: 'tonic',       nameCN: '主和弦' },
  { degree: 2, roman: 'ii',  chordType: 'minor',        function: 'predominant', nameCN: '上主和弦' },
  { degree: 3, roman: 'iii', chordType: 'minor',        function: 'mediant',     nameCN: '中和弦' },
  { degree: 4, roman: 'IV',  chordType: 'major',        function: 'subdominant', nameCN: '下属和弦' },
  { degree: 5, roman: 'V',   chordType: 'major',        function: 'dominant',    nameCN: '属和弦' },
  { degree: 6, roman: 'vi',  chordType: 'minor',        function: 'predominant', nameCN: '下中和弦' },
  { degree: 7, roman: 'vii', chordType: 'diminished',   function: 'dominant',    nameCN: '导和弦' },
];

/** 小调和弦级数（和声小调） */
export const MINOR_SCALE_CHORDS: ScaleDegreeChord[] = [
  { degree: 1, roman: 'i',   chordType: 'minor',        function: 'tonic',       nameCN: '主和弦' },
  { degree: 2, roman: 'ii',  chordType: 'diminished',   function: 'predominant', nameCN: '上主和弦' },
  { degree: 3, roman: 'III', chordType: 'major',        function: 'mediant',     nameCN: '中和弦' },
  { degree: 4, roman: 'iv',  chordType: 'minor',        function: 'subdominant', nameCN: '下属和弦' },
  { degree: 5, roman: 'V',   chordType: 'major',        function: 'dominant',    nameCN: '属和弦' },
  { degree: 6, roman: 'VI',  chordType: 'major',        function: 'predominant', nameCN: '下中和弦' },
  { degree: 7, roman: 'vii', chordType: 'diminished',   function: 'dominant',    nameCN: '导和弦' },
];

/** 获取调式和弦级数 */
export function getScaleChords(mode: KeyMode): ScaleDegreeChord[] {
  return mode === 'major' ? MAJOR_SCALE_CHORDS : MINOR_SCALE_CHORDS;
}

/** 在指定调上生成所有顺阶和弦 */
export function generateDiatonicChords(key: KeyName, mode: KeyMode, octave: Octave = 4): Chord[] {
  const scaleChords = getScaleChords(mode);
  const keyNotes = KEY_SCALE_NOTES[key];

  return scaleChords.map((sc, idx) => {
    const root = keyNotes[idx];
    return generateChord(root, sc.chordType, octave);
  });
}

/** 判断和弦是否为顺阶和弦 */
export function isDiatonicChord(key: KeyName, mode: KeyMode, root: string, type: ChordType): boolean {
  const keyNotes = KEY_SCALE_NOTES[key];
  const scaleChords = getScaleChords(mode);
  const rootIdx = keyNotes.indexOf(root as NoteName);
  if (rootIdx === -1) return false;
  return scaleChords[rootIdx]?.chordType === type;
}

// ============================================================
// 第十部分：音阶模式匹配与音程向量
// ============================================================

/** 音阶音程向量（步长模式，如大调为WWHWWWH） */
export function getScaleStepPattern(scaleType: ScaleType): string[] {
  const def = getScaleDefinition(scaleType);
  const steps: string[] = [];
  const intervals = def.intervals;

  for (let i = 0; i < intervals.length; i++) {
    const next = i < intervals.length - 1 ? intervals[i + 1] : 12;
    const diff = next - intervals[i];
    if (diff === 1) steps.push('H');   // 半音
    else if (diff === 2) steps.push('W');  // 全音
    else if (diff === 3) steps.push('W+H'); // 全音+半音
    else steps.push(`${diff}`);  // 其他
  }

  return steps;
}

/** 音阶对称性检测 */
export function isScaleSymmetric(scaleType: ScaleType): boolean {
  const def = getScaleDefinition(scaleType);
  const intervals = def.intervals;
  const n = intervals.length;

  // 检查是否为有限移位音阶（mesotonic）
  for (let shift = 1; shift < n; shift++) {
    let isSymmetric = true;
    for (let i = 0; i < n; i++) {
      const original = intervals[i];
      const shifted = (intervals[(i + shift) % n] + intervals[shift]) % 12;
      if (original !== shifted) { isSymmetric = false; break; }
    }
    if (isSymmetric) return true;
  }

  return false;
}

/** 计算音阶的音程类向量（ICV） */
export function getIntervalClassVector(scaleType: ScaleType): number[] {
  const def = getScaleDefinition(scaleType);
  const intervals = def.intervals;
  const icv = new Array(6).fill(0);

  for (let i = 0; i < intervals.length; i++) {
    for (let j = i + 1; j < intervals.length; j++) {
      let diff = Math.abs(intervals[j] - intervals[i]);
      diff = Math.min(diff, 12 - diff); // 音程类
      if (diff > 0 && diff <= 6) icv[diff - 1]++;
    }
  }

  return icv;
}

/** 音阶模式匹配（从音符集合找最匹配的音阶） */
export function matchScale(
  pitchClasses: number[],
  root: string
): { scaleType: ScaleType; matchRatio: number }[] {
  const rootSemitone = noteToSemitone(root);
  const inputSet = new Set(pitchClasses.map(p => ((p - rootSemitone) % 12 + 12) % 12));

  const allScaleTypes: ScaleType[] = [
    ...Object.keys(WESTERN_SCALES) as WesternScaleType[],
    ...Object.keys(CHINESE_SCALES) as ChineseScaleType[],
    ...Object.keys(JAPANESE_SCALES) as JapaneseScaleType[],
    ...Object.keys(WORLD_SCALES) as WorldScaleType[],
  ];

  return allScaleTypes.map(scaleType => {
    const def = getScaleDefinition(scaleType);
    const scaleSet = new Set(def.intervals);

    let matchCount = 0;
    for (const pc of inputSet) {
      if (scaleSet.has(pc)) matchCount++;
    }

    const matchRatio = matchCount / Math.max(inputSet.size, scaleSet.size);
    return { scaleType, matchRatio };
  }).sort((a, b) => b.matchRatio - a.matchRatio);
}

// ============================================================
// 第十一部分：和弦延伸与变化
// ============================================================

/** 和弦变化类型 */
export type ChordAlteration = 'b5' | '#5' | 'b9' | '#9' | 'b13' | '#11' | 'add9' | 'add11' | 'add13' | 'no5' | 'no3';

/** 应用和弦变化 */
export function alterChordIntervals(baseType: ChordType, alterations: ChordAlteration[]): number[] {
  const base = [...CHORD_DEFINITIONS[baseType].intervals];
  const result = new Set(base);

  for (const alt of alterations) {
    switch (alt) {
      case 'b5':  result.delete(7); result.add(6); break;
      case '#5':  result.delete(7); result.add(8); break;
      case 'b9':  result.add(13); break;
      case '#9':  result.add(15); break;
      case 'b13': result.add(20); break;
      case '#11': result.add(18); break;
      case 'add9':  result.add(14); break;
      case 'add11': result.add(17); break;
      case 'add13': result.add(21); break;
      case 'no5': result.delete(7); break;
      case 'no3': result.delete(4); result.delete(3); break;
    }
  }

  return Array.from(result).sort((a, b) => a - b);
}

/** 生成变化和弦的MIDI编号 */
export function alteredChordToMIDI(
  root: string,
  baseType: ChordType,
  alterations: ChordAlteration[],
  octave: Octave = 4
): number[] {
  const intervals = alterChordIntervals(baseType, alterations);
  const rootMIDI = noteToSemitone(root) + (octave + 1) * 12;
  return intervals.map(i => rootMIDI + i);
}

/** 常见和弦变化组合 */
export interface ChordVoicing {
  name: string;
  nameCN: string;
  baseType: ChordType;
  alterations: ChordAlteration[];
  description: string;
}

/** 常见和弦变化/排列法 */
export const COMMON_VOICINGS: ChordVoicing[] = [
  { name: '7b9', nameCN: '属七降九', baseType: 'dominant7', alterations: ['b9'], description: '属七和弦降九度，变化属和弦' },
  { name: '7#9', nameCN: '属七升九', baseType: 'dominant7', alterations: ['#9'], description: '亨德里克斯和弦' },
  { name: '7b5', nameCN: '属七降五', baseType: 'dominant7', alterations: ['b5'], description: '减五度属七' },
  { name: '7#5', nameCN: '属七增五', baseType: 'dominant7', alterations: ['#5'], description: '增五度属七' },
  { name: '7b9b5', nameCN: '变化属和弦', baseType: 'dominant7', alterations: ['b9', 'b5'], description: 'Alt和弦，全面变化' },
  { name: '7#9#5', nameCN: '增强变化属', baseType: 'dominant7', alterations: ['#9', '#5'], description: '正向变化属和弦' },
  { name: 'maj7#11', nameCN: '大七增十一', baseType: 'major7', alterations: ['#11'], description: '利底亚大七' },
  { name: 'm7b5', nameCN: '半减七', baseType: 'minor7', alterations: ['b5'], description: '即半减七和弦' },
  { name: 'add9', nameCN: '加九和弦', baseType: 'major', alterations: ['add9'], description: '大三加九，明亮开放' },
  { name: 'madd9', nameCN: '小加九和弦', baseType: 'minor', alterations: ['add9'], description: '小三加九，柔美色彩' },
  { name: '6/9', nameCN: '六九和弦', baseType: 'major', alterations: ['add9'], description: '大六加九，爵士常用排列' },
  { name: 'sus4b9', nameCN: '挂四降九', baseType: 'sus4', alterations: ['b9'], description: 'Phrygian主导和弦' },
];

// ============================================================
// 第十二部分：音程训练与理论辅助
// ============================================================

/** 两个音高之间的音程详细信息 */
export interface IntervalBetweenPitches {
  from: Pitch;
  to: Pitch;
  semitones: number;
  intervalName: string;
  intervalNameCN: string;
  direction: 'up' | 'down' | 'same';
  isCompound: boolean;       // 是否为复音程（超过八度）
  simpleInterval: string;    // 简单音程名
}

/** 计算两个音高之间的详细音程 */
export function detailedInterval(pitch1: Pitch, pitch2: Pitch): IntervalBetweenPitches {
  const midi1 = pitchToMidi(pitch1);
  const midi2 = pitchToMidi(pitch2);
  const diff = midi2 - midi1;
  const absDiff = Math.abs(diff);

  const direction = diff > 0 ? 'up' : diff < 0 ? 'down' : 'same';
  const isCompound = absDiff > 12;
  const simpleSemi = ((absDiff % 12) + 12) % 12 || (absDiff === 0 ? 0 : 12);
  const simpleInterval = intervalToName(simpleSemi);

  const intervalNameCN = INTERVALS.find(i => i.semitones === simpleSemi)?.nameCN ?? '未知';

  // 复音程命名
  let intervalName: string;
  if (isCompound) {
    const octaves = Math.floor(absDiff / 12);
    const remainder = absDiff % 12;
    intervalName = remainder === 0
      ? `P${octaves * 8 + 1}`
      : `${intervalToName(remainder)}+${octaves}oct`;
  } else {
    intervalName = intervalToName(absDiff);
  }

  return {
    from: pitch1,
    to: pitch2,
    semitones: absDiff,
    intervalName,
    intervalNameCN,
    direction,
    isCompound,
    simpleInterval,
  };
}

/** 音阶音符与级数的对应 */
export interface ScaleNoteInfo {
  pitch: Pitch;
  midi: number;
  degree: number;          // 1-based级数
  degreeNameCN: string;    // 级数中文名
  intervalFromRoot: string; // 与根音的音程
}

/** 获取音阶各音的详细信息 */
export function getScaleNoteDetails(root: string, scaleType: ScaleType, octave: Octave = 4): ScaleNoteInfo[] {
  const pitches = generateScale(root, scaleType, octave);
  const midis = scaleToMIDI(root, scaleType, octave);
  const degreeNames = ['主音', '上主音', '中音', '下属音', '属音', '下中音', '下主音', '八度主音', '九度', '十度', '十一度', '十二度', '十三度'];

  return pitches.map((pitch, i) => ({
    pitch,
    midi: midis[i],
    degree: i + 1,
    degreeNameCN: degreeNames[i] ?? `${i + 1}级`,
    intervalFromRoot: intervalToName(midis[i] - midis[0]),
  }));
}

// ============================================================
// 第十三部分：节拍细分与律动量化
// ============================================================

/** 节拍细分类型 */
export type SubdivisionType = 'quarter' | 'eighth' | 'sixteenth' | 'triplet_quarter' | 'triplet_eighth' | 'dotted_quarter' | 'dotted_eighth';

/** 节拍细分对应的MIDI tick数（假设PPQ=480） */
export const SUBDIVISION_TICKS: Record<SubdivisionType, number> = {
  quarter: 480,
  eighth: 240,
  sixteenth: 120,
  triplet_quarter: 320,
  triplet_eighth: 160,
  dotted_quarter: 720,
  dotted_eighth: 360,
};

/** 量化位置到最近的细分 */
export function quantizePosition(tick: number, subdivision: SubdivisionType): number {
  const grid = SUBDIVISION_TICKS[subdivision];
  return Math.round(tick / grid) * grid;
}

/** 量化一组位置 */
export function quantizePositions(ticks: number[], subdivision: SubdivisionType): number[] {
  return ticks.map(t => quantizePosition(t, subdivision));
}

/** 计算律动偏差（人性化微调） */
export function applyHumanization(
  ticks: number[],
  amount: number = 5,  // 偏差范围（ticks）
  seed: number = 123
): number[] {
  let s = seed;
  const rand = (): number => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return (s / 0x7fffffff) * 2 - 1; // -1到1
  };

  return ticks.map(t => t + Math.round(rand() * amount));
}

/** 计算BPM对应的毫秒/拍 */
export function bpmToMsPerBeat(bpm: number): number {
  return 60000 / bpm;
}

/** 计算BPM对应的微秒/拍（MIDI标准） */
export function bpmToMicrosecondsPerBeat(bpm: number): number {
  return Math.round(60000000 / bpm);
}

/** 毫秒/拍转BPM */
export function msPerBeatToBpm(ms: number): number {
  return 60000 / ms;
}

// ============================================================
// 第十四部分：综合分析工具
// ============================================================

/** 乐曲分析摘要 */
export interface PieceAnalysis {
  key: KeyAnalysisResult;                  // 调性
  scale: ScaleDefinition;                  // 匹配的音阶
  scaleMatch: number;                      // 音阶匹配度
  chordProgression: ChordProgression | null; // 匹配的和弦进行
  contour: MelodicContour;                 // 旋律轮廓
  noteRange: { min: Pitch; max: Pitch; span: number }; // 音域
  averageInterval: number;                 // 平均音程
  dissonanceRatio: number;                 // 不协和音程比例
}

/** 综合分析一段音乐 */
export function analyzePiece(midiNotes: number[]): PieceAnalysis {
  if (midiNotes.length === 0) {
    const defaultKey: KeyAnalysisResult = { key: 'C', mode: 'major', nameCN: 'C大调', correlation: 0, confidence: 0 };
    return {
      key: defaultKey,
      scale: WESTERN_SCALES.major,
      scaleMatch: 0,
      chordProgression: null,
      contour: { type: 'static', nameCN: '静止', vector: [], span: 0, peakIndex: 0, valleyIndex: 0 },
      noteRange: { min: { note: 'C', octave: 4 }, max: { note: 'C', octave: 4 }, span: 0 },
      averageInterval: 0,
      dissonanceRatio: 0,
    };
  }

  // 调性检测
  const keyResult = detectBestKey(midiNotes);

  // 音阶匹配
  const root = keyResult.key;
  const scaleMatches = matchScale(
    midiNotes.map(n => ((n % 12) + 12) % 12),
    root
  );
  const bestScaleMatch = scaleMatches[0];
  const scaleDef = bestScaleMatch ? getScaleDefinition(bestScaleMatch.scaleType) : WESTERN_SCALES.major;

  // 旋律轮廓
  const contour = analyzeMelodicContour(midiNotes);

  // 音域
  const minMidi = Math.min(...midiNotes);
  const maxMidi = Math.max(...midiNotes);
  const minPitch = midiToPitch(minMidi);
  const maxPitch = midiToPitch(maxMidi);

  // 平均音程
  let totalInterval = 0;
  let dissonantCount = 0;
  for (let i = 1; i < midiNotes.length; i++) {
    const interval = Math.abs(midiNotes[i] - midiNotes[i - 1]);
    totalInterval += interval;
    const simpleInterval = Math.min(interval, 12 - interval);
    // 三全音和小二度为不协和
    if (simpleInterval === 1 || simpleInterval === 6) dissonantCount++;
  }
  const averageInterval = midiNotes.length > 1 ? totalInterval / (midiNotes.length - 1) : 0;
  const dissonanceRatio = midiNotes.length > 1 ? dissonantCount / (midiNotes.length - 1) : 0;

  return {
    key: keyResult,
    scale: scaleDef,
    scaleMatch: bestScaleMatch?.matchRatio ?? 0,
    chordProgression: null, // 需要和弦信息才能匹配
    contour,
    noteRange: { min: minPitch, max: maxPitch, span: maxMidi - minMidi },
    averageInterval,
    dissonanceRatio,
  };
}

// ============================================================
// 第十五部分：调式间转换
// ============================================================

/** 调式间转换映射（共享相同音集的调式） */
export const MODE_RELATIONS: Record<WesternScaleType, { relativeModes: { mode: WesternScaleType; rootShift: number; nameCN: string }[] }> = {
  major: {
    relativeModes: [
      { mode: 'dorian', rootShift: 2, nameCN: '多利亚（大二度下方）' },
      { mode: 'phrygian', rootShift: 4, nameCN: '弗里几亚（大三度下方）' },
      { mode: 'lydian', rootShift: -5, nameCN: '利底亚（纯四度上方）' },
      { mode: 'mixolydian', rootShift: -7, nameCN: '混合利底亚（纯五度上方）' },
      { mode: 'natural_minor', rootShift: -3, nameCN: '自然小调（小三度下方）' },
      { mode: 'locrian', rootShift: -10, nameCN: '洛克里亚（小七度下方）' },
    ],
  },
  natural_minor: {
    relativeModes: [
      { mode: 'major', rootShift: 3, nameCN: '关系大调（小三度上方）' },
      { mode: 'dorian', rootShift: 5, nameCN: '多利亚（纯四度上方）' },
      { mode: 'phrygian', rootShift: 7, nameCN: '弗里几亚（纯五度上方）' },
    ],
  },
  harmonic_minor: { relativeModes: [] },
  melodic_minor: { relativeModes: [] },
  dorian: {
    relativeModes: [
      { mode: 'major', rootShift: -2, nameCN: '关系大调' },
      { mode: 'natural_minor', rootShift: -5, nameCN: '关系小调' },
    ],
  },
  phrygian: {
    relativeModes: [
      { mode: 'major', rootShift: -4, nameCN: '关系大调' },
      { mode: 'natural_minor', rootShift: -7, nameCN: '关系小调' },
    ],
  },
  lydian: {
    relativeModes: [
      { mode: 'major', rootShift: 5, nameCN: '关系大调' },
    ],
  },
  mixolydian: {
    relativeModes: [
      { mode: 'major', rootShift: 7, nameCN: '关系大调' },
    ],
  },
  locrian: {
    relativeModes: [
      { mode: 'major', rootShift: 10, nameCN: '关系大调' },
    ],
  },
  blues: { relativeModes: [] },
  whole_tone: { relativeModes: [] },
  pentatonic: { relativeModes: [] },
};

/** 在调式间转换根音 */
export function convertModeRoot(
  currentRoot: string,
  fromMode: WesternScaleType,
  toMode: WesternScaleType
): string | null {
  const relations = MODE_RELATIONS[fromMode]?.relativeModes;
  if (!relations) return null;

  const relation = relations.find(r => r.mode === toMode);
  if (!relation) return null;

  const currentSemitone = noteToSemitone(currentRoot);
  const newSemitone = ((currentSemitone + relation.rootShift) % 12 + 12) % 12;
  return NOTE_NAMES_SHARP[newSemitone];
}

// ============================================================
// 第十六部分：和声规则检查
// ============================================================

/** 和声错误类型 */
export type HarmonicError = 'parallel_fifths' | 'parallel_octaves' | 'voice_crossing' | 'augmented_second' | 'hidden_fifths' | 'hidden_octaves';

/** 和声检查结果 */
export interface HarmonicCheckResult {
  isValid: boolean;
  errors: { type: HarmonicError; nameCN: string; voices: number[]; description: string }[];
}

/** 检查平行五度/八度 */
export function checkParallelMotion(
  chord1MIDI: number[],
  chord2MIDI: number[]
): HarmonicCheckResult {
  const errors: HarmonicCheckResult['errors'] = [];

  if (chord1MIDI.length !== chord2MIDI.length) {
    return { isValid: true, errors: [] };
  }

  for (let i = 0; i < chord1MIDI.length; i++) {
    for (let j = i + 1; j < chord1MIDI.length; j++) {
      const interval1 = Math.abs(chord1MIDI[j] - chord1MIDI[i]);
      const interval2 = Math.abs(chord2MIDI[j] - chord2MIDI[i]);
      const motion1 = chord2MIDI[i] - chord1MIDI[i];
      const motion2 = chord2MIDI[j] - chord1MIDI[j];

      // 同向运动
      const sameDirection = (motion1 > 0 && motion2 > 0) || (motion1 < 0 && motion2 < 0);

      if (sameDirection) {
        // 平行五度
        if (interval1 === 7 && interval2 === 7) {
          errors.push({
            type: 'parallel_fifths', nameCN: '平行五度',
            voices: [i, j],
            description: `声部${i + 1}和${j + 1}之间出现平行五度`,
          });
        }
        // 平行八度
        if (interval1 === 12 && interval2 === 12) {
          errors.push({
            type: 'parallel_octaves', nameCN: '平行八度',
            voices: [i, j],
            description: `声部${i + 1}和${j + 1}之间出现平行八度`,
          });
        }
        // 隐伏五度
        if ((interval1 === 7 || interval2 === 7) && interval1 !== interval2) {
          errors.push({
            type: 'hidden_fifths', nameCN: '隐伏五度',
            voices: [i, j],
            description: `声部${i + 1}和${j + 1}之间可能存在隐伏五度`,
          });
        }
      }
    }
  }

  return { isValid: errors.length === 0, errors };
}

// ============================================================
// 导出汇总
// ============================================================

/** 音乐理论引擎主接口 */
export const MusicTheoryEngine = {
  // 音阶
  scales: {
    western: WESTERN_SCALES,
    chinese: CHINESE_SCALES,
    japanese: JAPANESE_SCALES,
    world: WORLD_SCALES,
    getAll: getAllScales,
    getDefinition: getScaleDefinition,
    generate: generateScale,
    toMIDI: scaleToMIDI,
    getDegree: getScaleDegree,
    getStepPattern: getScaleStepPattern,
    isSymmetric: isScaleSymmetric,
    getIntervalClassVector,
    match: matchScale,
    getNoteDetails: getScaleNoteDetails,
  },

  // 调性
  keys: {
    all24: ALL_24_KEYS,
    generate24: generate24Keys,
    getRelative: getRelativeKey,
    getParallel: getParallelKey,
    getRelated: getRelatedKeys,
  },

  // 五度圈
  circle: {
    sequence: CIRCLE_OF_FIFTHS,
    distance: circleOfFifthsDistance,
    move: circleOfFifthsMove,
  },

  // 和弦
  chords: {
    definitions: CHORD_DEFINITIONS,
    generate: generateChord,
    inversion: chordInversion,
    toMIDI: chordToMIDI,
    symbol: chordSymbol,
    identify: identifyChordType,
    alter: alterChordIntervals,
    alteredToMIDI: alteredChordToMIDI,
    voicings: COMMON_VOICINGS,
    scaleChords: getScaleChords,
    diatonicChords: generateDiatonicChords,
    isDiatonic: isDiatonicChord,
  },

  // 和弦进行
  progressions: {
    all: CHORD_PROGRESSIONS,
    getByStyle: getProgressionsByStyle,
    resolve: resolveProgression,
  },

  // 节奏
  rhythm: {
    timeSignatures: TIME_SIGNATURES,
    patterns: RHYTHM_PATTERNS,
    grooves: GROOVE_MODES,
    getByStyle: getRhythmPatternsByStyle,
    applyGroove,
    quantize: quantizePosition,
    quantizeAll: quantizePositions,
    humanize: applyHumanization,
    bpmToMs: bpmToMsPerBeat,
    bpmToMicroseconds: bpmToMicrosecondsPerBeat,
    msToBpm: msPerBeatToBpm,
  },

  // 旋律
  melody: {
    intervals: INTERVALS,
    calculateInterval,
    analyzeContour: analyzeMelodicContour,
    phraseStructures: PHRASE_STRUCTURES,
    assignMeasures: assignPhraseMeasures,
    generate: generateMelody,
    detailedInterval,
  },

  // 调性分析
  analysis: {
    detectKey,
    detectBestKey,
    detectKeyFromNoteNames,
    buildDistribution: buildPitchDistribution,
    analyzePiece,
    checkParallelMotion,
  },

  // 调式转换
  modes: {
    relations: MODE_RELATIONS,
    convertRoot: convertModeRoot,
  },

  // 工具函数
  utils: {
    noteToSemitone,
    semitoneToNote,
    midiToPitch,
    pitchToMidi,
    pitchToFrequency,
    midiToFrequency,
    frequencyToMidi,
    frequencyToPitch,
    intervalToName,
    semitoneDistance,
    transposePitch,
    transposePitches,
    transposeMIDI,
  },
} as const;

export default MusicTheoryEngine;
