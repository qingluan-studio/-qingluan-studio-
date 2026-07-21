/**
 * 真人级别人声合成引擎 (Realistic Voice Synthesis Engine)
 * 精细物理建模 + 非传统算法 + 粒子云合成 + LPC分析
 * TypeScript Strict Mode | 零外部依赖
 *
 * 声学数据来源：
 * - Yusynth 共振峰数据库
 * - Hillenbrand et al. (1995) 美国人英语元音声学分析
 * - 中国民族调式理论
 */

// ==================== 基础类型定义 ====================

/** 采样率类型 */
export type SampleRate = 44100 | 48000 | 96000;

/** 性别分类 */
export type Gender = 'male' | 'female' | 'child';

/** 音色分类 */
export type TimbreColor = 'bright' | 'warm' | 'hoarse' | 'ethereal';

/** 中国民族调式 */
export type ChineseMode = 'gong' | 'shang' | 'jue' | 'zhi' | 'yu';

/** 演唱技巧 */
export type SingingTechnique =
  | 'breathy'      // 气声
  | 'head'         // 头声
  | 'chest'        // 胸声
  | 'falsetto'     // 假声
  | 'fry'          // 气泡音
  | 'plosive'      // 爆破音
  | 'fricative'    // 摩擦音
  | 'portamento'   // 滑音
  | 'vibrato'      // 颤音
  | 'mordent'      // 波音
  | 'pp' | 'p' | 'mp' | 'mf' | 'f' | 'ff'; // 力度

/** 共振峰精细参数 */
export interface FormantParam {
  /** 中心频率 (Hz) */
  Fc: number;
  /** 带宽 (Hz) */
  BW: number;
  /** 品质因数 Q = Fc / BW */
  Q: number;
  /** 增益 (dB) */
  gainDb: number;
  /** 归一化振幅 (0-1) */
  amplitude: number;
}

/** 元音共振峰集合 (5个共振峰) */
export interface VowelFormants {
  /** 元音符号 */
  symbol: string;
  /** 五个共振峰 */
  formants: [FormantParam, FormantParam, FormantParam, FormantParam, FormantParam];
  /** 基频偏移建议 (半音) */
  f0Shift: number;
  /** 气流噪声比例 (0-1) */
  breathiness: number;
  /** 鼻音耦合系数 (0-1) */
  nasalCoupling: number;
}

/** 精细共振峰数据库条目 */
export interface FormantDatabaseEntry {
  /** 性别 */
  gender: Gender;
  /** 音色 */
  timbre: TimbreColor;
  /** 元音集合 */
  vowels: Record<string, VowelFormants>;
  /** 基频范围 */
  f0Range: [number, number];
  /** 全局共振峰缩放 */
  globalScale: number;
}

/** 简谱音符事件 */
export interface JianpuNote {
  /** 数字 (0表示休止符) */
  digit: number;
  /** 八度偏移 (+1高八度, -1低八度) */
  octaveShift: number;
  /** 升降号: '' | '#' | 'b' */
  accidental: string;
  /** 时值倍数 (1=四分音符, 0.5=八分, 0.25=十六分, 1.5=附点四分) */
  durationMultiplier: number;
  /** 是否附点 */
  dotted: boolean;
  /** 歌词 */
  lyric?: string;
}

/** 五线谱音符 */
export interface StaffNote {
  /** 音名 */
  name: string;
  /** 八度 */
  octave: number;
  /** 频率 */
  frequency: number;
  /** MIDI编号 */
  midiNote: number;
  /** 时值 (秒) */
  duration: number;
}

/** 人声描述参数 */
export interface VoiceDescriptor {
  /** 演唱技巧数组 */
  techniques: SingingTechnique[];
  /** 基频 (Hz) */
  f0: number;
  /** 目标基频 (用于滑音) */
  targetF0?: number;
  /** 颤音深度 (Hz) */
  vibratoDepth: number;
  /** 颤音速率 (Hz) */
  vibratoRate: number;
  /** 力度 (0-1) */
  velocity: number;
  /** 明亮度 (0-1) */
  brightness: number;
  /** 气声比例 (0-1) */
  breathiness: number;
  /** 性别转换比例 (1.0=原声, 1.17=男转女) */
  genderShift: number;
}

/** 粒子参数 */
export interface GrainParam {
  /** 起始时间 (秒) */
  startTime: number;
  /** 时长 (秒) */
  duration: number;
  /** 音高 (Hz) */
  pitch: number;
  /** 包络类型 */
  envelope: 'hanning' | 'gaussian' | 'tukey' | 'expodec';
  /** 声像 (-1左 ~ 1右) */
  pan: number;
  /** 密度 (0-1) */
  density: number;
  /** 振幅 */
  amplitude: number;
}

/** 合成策略 */
export type SynthesisStrategy = 'physical' | 'granular' | 'formant' | 'hybrid';

/** 渲染配置 */
export interface RenderConfig {
  /** 采样率 */
  sampleRate: SampleRate;
  /** 策略 */
  strategy: SynthesisStrategy;
  /** 全局性别 */
  gender: Gender;
  /** 全局音色 */
  timbre: TimbreColor;
  /** 默认力度 */
  defaultVelocity: number;
  /** 默认颤音深度 */
  defaultVibratoDepth: number;
  /** 默认颤音速率 */
  defaultVibratoRate: number;
  /** 滑音速率 (半音/秒) */
  portamentoRate: number;
  /** 尾音时长 (秒) */
  tailLength: number;
}

/** 音符事件 */
export interface NoteEvent {
  /** 开始时间 (秒) */
  startTime: number;
  /** 时长 (秒) */
  duration: number;
  /** 频率 (Hz) */
  frequency: number;
  /** MIDI编号 */
  midiNote: number;
  /** 歌词 */
  lyric: string;
  /** 人声描述 */
  voice: VoiceDescriptor;
}

/** LPC分析结果 */
export interface LPCResult {
  /** LPC系数 */
  coefficients: Float64Array;
  /** 预测误差 */
  error: number;
  /** 增益 */
  gain: number;
  /** 阶数 */
  order: number;
}

/** 混沌吸引子状态 */
interface AttractorState {
  x: number;
  y: number;
  z: number;
}

// ==================== 精细共振峰数据库 ====================

/**
 * 根据Fc和BW计算Q值与增益
 * @param Fc 中心频率
 * @param BW 带宽
 * @param gainDb 增益dB
 * @returns 完整共振峰参数
 */
export function calculateFormantParam(Fc: number, BW: number, gainDb: number): FormantParam {
  const Q = Fc / BW;
  const amplitude = Math.pow(10, gainDb / 20);
  return { Fc, BW, Q, gainDb, amplitude };
}

/** 男声元音A (Yusynth/Hillenbrand) */
export const MALE_VOWEL_A: VowelFormants = {
  symbol: 'a',
  formants: [
    calculateFormantParam(609, 78, 0),
    calculateFormantParam(1000, 88, -2),
    calculateFormantParam(2450, 123, -4),
    calculateFormantParam(2700, 119, -8),
    calculateFormantParam(3240, 138, -14),
  ],
  f0Shift: 0,
  breathiness: 0.04,
  nasalCoupling: 0.0,
};

/** 女声元音A */
export const FEMALE_VOWEL_A: VowelFormants = {
  symbol: 'a',
  formants: [
    calculateFormantParam(650, 69, 0),
    calculateFormantParam(1100, 95, -1.5),
    calculateFormantParam(2860, 95, -3.5),
    calculateFormantParam(3300, 102, -7),
    calculateFormantParam(4500, 120, -12),
  ],
  f0Shift: 0,
  breathiness: 0.05,
  nasalCoupling: 0.0,
};

/** 男声元音E */
export const MALE_VOWEL_E: VowelFormants = {
  symbol: 'e',
  formants: [
    calculateFormantParam(400, 64, 0),
    calculateFormantParam(1700, 81, -1),
    calculateFormantParam(2300, 101, -4),
    calculateFormantParam(2900, 119, -8),
    calculateFormantParam(3400, 134, -13),
  ],
  f0Shift: -0.5,
  breathiness: 0.04,
  nasalCoupling: 0.0,
};

/** 女声元音E */
export const FEMALE_VOWEL_E: VowelFormants = {
  symbol: 'e',
  formants: [
    calculateFormantParam(500, 75, 0),
    calculateFormantParam(1750, 104, -1),
    calculateFormantParam(2800, 87, -3.5),
    calculateFormantParam(3350, 140, -7),
    calculateFormantParam(5000, 165, -11),
  ],
  f0Shift: -0.5,
  breathiness: 0.05,
  nasalCoupling: 0.0,
};

/** 男声元音I */
export const MALE_VOWEL_I: VowelFormants = {
  symbol: 'i',
  formants: [
    calculateFormantParam(238, 73, 0),
    calculateFormantParam(1741, 108, -2),
    calculateFormantParam(2450, 123, -4),
    calculateFormantParam(2900, 132, -9),
    calculateFormantParam(4000, 150, -15),
  ],
  f0Shift: 1,
  breathiness: 0.03,
  nasalCoupling: 0.0,
};

/** 女声元音I */
export const FEMALE_VOWEL_I: VowelFormants = {
  symbol: 'i',
  formants: [
    calculateFormantParam(330, 89, 0),
    calculateFormantParam(2000, 114, -1.5),
    calculateFormantParam(2800, 132, -4),
    calculateFormantParam(3650, 145, -8),
    calculateFormantParam(5000, 162, -13),
  ],
  f0Shift: 1,
  breathiness: 0.04,
  nasalCoupling: 0.0,
};

/** 男声元音O */
export const MALE_VOWEL_O: VowelFormants = {
  symbol: 'o',
  formants: [
    calculateFormantParam(325, 73, 0),
    calculateFormantParam(700, 80, -1.5),
    calculateFormantParam(2550, 125, -4.5),
    calculateFormantParam(2850, 131, -9),
    calculateFormantParam(3100, 135, -14),
  ],
  f0Shift: -1,
  breathiness: 0.04,
  nasalCoupling: 0.0,
};

/** 女声元音O */
export const FEMALE_VOWEL_O: VowelFormants = {
  symbol: 'o',
  formants: [
    calculateFormantParam(400, 86, 0),
    calculateFormantParam(840, 109, -1.5),
    calculateFormantParam(2800, 120, -4),
    calculateFormantParam(3400, 145, -8),
    calculateFormantParam(5000, 165, -12),
  ],
  f0Shift: -1,
  breathiness: 0.05,
  nasalCoupling: 0.0,
};

/** 男声元音U */
export const MALE_VOWEL_U: VowelFormants = {
  symbol: 'u',
  formants: [
    calculateFormantParam(280, 70, 0),
    calculateFormantParam(800, 85, -2),
    calculateFormantParam(2200, 110, -5),
    calculateFormantParam(2800, 125, -9),
    calculateFormantParam(3300, 140, -14),
  ],
  f0Shift: -1.5,
  breathiness: 0.03,
  nasalCoupling: 0.0,
};

/** 女声元音U */
export const FEMALE_VOWEL_U: VowelFormants = {
  symbol: 'u',
  formants: [
    calculateFormantParam(350, 80, 0),
    calculateFormantParam(950, 100, -2),
    calculateFormantParam(2700, 115, -4.5),
    calculateFormantParam(3400, 140, -8),
    calculateFormantParam(4800, 160, -12),
  ],
  f0Shift: -1.5,
  breathiness: 0.04,
  nasalCoupling: 0.0,
};

/** Hillenbrand /i/ 男 */
export const HILLENBRAND_I_MALE: VowelFormants = {
  symbol: 'ih',
  formants: [
    calculateFormantParam(342, 60, 0),
    calculateFormantParam(2322, 100, -1),
    calculateFormantParam(3000, 120, -4),
    calculateFormantParam(3600, 140, -9),
    calculateFormantParam(4200, 160, -15),
  ],
  f0Shift: 0.5,
  breathiness: 0.03,
  nasalCoupling: 0.0,
};

/** Hillenbrand /i/ 女 */
export const HILLENBRAND_I_FEMALE: VowelFormants = {
  symbol: 'ih',
  formants: [
    calculateFormantParam(437, 70, 0),
    calculateFormantParam(2761, 110, -1),
    calculateFormantParam(3372, 130, -3.5),
    calculateFormantParam(4000, 150, -8),
    calculateFormantParam(4800, 170, -13),
  ],
  f0Shift: 0.5,
  breathiness: 0.04,
  nasalCoupling: 0.0,
};

/** Hillenbrand /æ/ 男 */
export const HILLENBRAND_AE_MALE: VowelFormants = {
  symbol: 'ae',
  formants: [
    calculateFormantParam(588, 75, 0),
    calculateFormantParam(1952, 95, -1.5),
    calculateFormantParam(2601, 115, -4),
    calculateFormantParam(3400, 135, -9),
    calculateFormantParam(4000, 155, -14),
  ],
  f0Shift: 0,
  breathiness: 0.05,
  nasalCoupling: 0.0,
};

/** Hillenbrand /æ/ 女 */
export const HILLENBRAND_AE_FEMALE: VowelFormants = {
  symbol: 'ae',
  formants: [
    calculateFormantParam(669, 80, 0),
    calculateFormantParam(2349, 105, -1.5),
    calculateFormantParam(2972, 125, -3.5),
    calculateFormantParam(3800, 145, -8),
    calculateFormantParam(4600, 165, -12),
  ],
  f0Shift: 0,
  breathiness: 0.06,
  nasalCoupling: 0.0,
};

/** Hillenbrand /ɑ/ 男 */
export const HILLENBRAND_AA_MALE: VowelFormants = {
  symbol: 'aa',
  formants: [
    calculateFormantParam(768, 85, 0),
    calculateFormantParam(1333, 90, -2),
    calculateFormantParam(2522, 120, -4.5),
    calculateFormantParam(3300, 140, -9),
    calculateFormantParam(3900, 160, -14),
  ],
  f0Shift: -0.5,
  breathiness: 0.04,
  nasalCoupling: 0.0,
};

/** Hillenbrand /ɑ/ 女 */
export const HILLENBRAND_AA_FEMALE: VowelFormants = {
  symbol: 'aa',
  formants: [
    calculateFormantParam(936, 95, 0),
    calculateFormantParam(1551, 100, -2),
    calculateFormantParam(2815, 130, -4),
    calculateFormantParam(3600, 150, -8),
    calculateFormantParam(4500, 170, -12),
  ],
  f0Shift: -0.5,
  breathiness: 0.05,
  nasalCoupling: 0.0,
};

/** Hillenbrand /u/ 男 */
export const HILLENBRAND_U_MALE: VowelFormants = {
  symbol: 'uh',
  formants: [
    calculateFormantParam(378, 65, 0),
    calculateFormantParam(997, 85, -2.5),
    calculateFormantParam(2343, 110, -5),
    calculateFormantParam(3000, 130, -9),
    calculateFormantParam(3600, 150, -14),
  ],
  f0Shift: -1,
  breathiness: 0.03,
  nasalCoupling: 0.0,
};

/** Hillenbrand /u/ 女 */
export const HILLENBRAND_U_FEMALE: VowelFormants = {
  symbol: 'uh',
  formants: [
    calculateFormantParam(459, 75, 0),
    calculateFormantParam(1105, 95, -2.5),
    calculateFormantParam(2735, 120, -4.5),
    calculateFormantParam(3400, 140, -8),
    calculateFormantParam(4200, 160, -12),
  ],
  f0Shift: -1,
  breathiness: 0.04,
  nasalCoupling: 0.0,
};

/** 童声元音A (共振峰更高，带宽更宽) */
export const CHILD_VOWEL_A: VowelFormants = {
  symbol: 'a',
  formants: [
    calculateFormantParam(700, 90, 0),
    calculateFormantParam(1300, 110, -1),
    calculateFormantParam(3200, 140, -3.5),
    calculateFormantParam(3800, 160, -7),
    calculateFormantParam(5000, 180, -11),
  ],
  f0Shift: 2,
  breathiness: 0.08,
  nasalCoupling: 0.0,
};

/** 童声元音I */
export const CHILD_VOWEL_I: VowelFormants = {
  symbol: 'i',
  formants: [
    calculateFormantParam(350, 85, 0),
    calculateFormantParam(2400, 125, -1.5),
    calculateFormantParam(3400, 145, -4),
    calculateFormantParam(4200, 165, -8),
    calculateFormantParam(5500, 185, -12),
  ],
  f0Shift: 3,
  breathiness: 0.07,
  nasalCoupling: 0.0,
};

/** 童声元音U */
export const CHILD_VOWEL_U: VowelFormants = {
  symbol: 'u',
  formants: [
    calculateFormantParam(380, 90, 0),
    calculateFormantParam(1100, 110, -2),
    calculateFormantParam(3000, 135, -4.5),
    calculateFormantParam(3800, 155, -8),
    calculateFormantParam(5200, 175, -12),
  ],
  f0Shift: 1.5,
  breathiness: 0.07,
  nasalCoupling: 0.0,
};

/** 音色变体计算：明亮 */
export function makeBrightVariant(vowel: VowelFormants): VowelFormants {
  const formants = vowel.formants.map((f, idx) => {
    const boost = idx < 2 ? 1.15 : 1.05;
    const bwNarrow = idx < 2 ? 0.85 : 0.95;
    return calculateFormantParam(f.Fc * boost, f.BW * bwNarrow, f.gainDb + (idx < 2 ? 1.5 : 0));
  }) as [FormantParam, FormantParam, FormantParam, FormantParam, FormantParam];
  return { ...vowel, formants, breathiness: vowel.breathiness * 0.9 };
}

/** 音色变体计算：温暖 */
export function makeWarmVariant(vowel: VowelFormants): VowelFormants {
  const formants = vowel.formants.map((f, idx) => {
    const soften = idx < 2 ? 0.92 : 1.0;
    const bwWiden = idx < 2 ? 1.2 : 1.05;
    return calculateFormantParam(f.Fc * soften, f.BW * bwWiden, f.gainDb - (idx < 2 ? 1 : 0));
  }) as [FormantParam, FormantParam, FormantParam, FormantParam, FormantParam];
  return { ...vowel, formants, breathiness: vowel.breathiness * 1.2 };
}

/** 音色变体计算：沙哑 */
export function makeHoarseVariant(vowel: VowelFormants): VowelFormants {
  const formants = vowel.formants.map((f) => {
    return calculateFormantParam(f.Fc * 0.95, f.BW * 1.4, f.gainDb - 2);
  }) as [FormantParam, FormantParam, FormantParam, FormantParam, FormantParam];
  return { ...vowel, formants, breathiness: Math.min(1, vowel.breathiness * 2.5) };
}

/** 音色变体计算：空灵 */
export function makeEtherealVariant(vowel: VowelFormants): VowelFormants {
  const formants = vowel.formants.map((f, idx) => {
    const lift = idx < 2 ? 1.08 : 1.2;
    return calculateFormantParam(f.Fc * lift, f.BW * 1.3, f.gainDb + (idx >= 2 ? 2 : 0));
  }) as [FormantParam, FormantParam, FormantParam, FormantParam, FormantParam];
  return { ...vowel, formants, breathiness: vowel.breathiness * 1.5 };
}

/** 性别转换：共振峰shift ratio默认1.17（男转女） */
export function shiftGender(vowel: VowelFormants, ratio: number): VowelFormants {
  const formants = vowel.formants.map((f) => {
    return calculateFormantParam(f.Fc * ratio, f.BW * Math.sqrt(ratio), f.gainDb);
  }) as [FormantParam, FormantParam, FormantParam, FormantParam, FormantParam];
  return { ...vowel, formants };
}

/** 共振峰插值：元音间平滑过渡 */
export function interpolateFormants(
  v1: VowelFormants,
  v2: VowelFormants,
  t: number
): VowelFormants {
  const smoothT = t * t * (3 - 2 * t); // smoothstep
  const formants: FormantParam[] = [];
  for (let i = 0; i < 5; i++) {
    const f1 = v1.formants[i];
    const f2 = v2.formants[i];
    const Fc = f1.Fc + (f2.Fc - f1.Fc) * smoothT;
    const BW = f1.BW + (f2.BW - f1.BW) * smoothT;
    const gainDb = f1.gainDb + (f2.gainDb - f1.gainDb) * smoothT;
    formants.push(calculateFormantParam(Fc, BW, gainDb));
  }
  return {
    symbol: `${v1.symbol}->${v2.symbol}`,
    formants: formants as [FormantParam, FormantParam, FormantParam, FormantParam, FormantParam],
    f0Shift: v1.f0Shift + (v2.f0Shift - v1.f0Shift) * smoothT,
    breathiness: v1.breathiness + (v2.breathiness - v1.breathiness) * smoothT,
    nasalCoupling: v1.nasalCoupling + (v2.nasalCoupling - v1.nasalCoupling) * smoothT,
  };
}

/** 构建完整精细共振峰数据库 */
export function buildFormantDatabase(): FormantDatabaseEntry[] {
  const entries: FormantDatabaseEntry[] = [];

  // 男声基础
  const maleBaseVowels: Record<string, VowelFormants> = {
    a: MALE_VOWEL_A,
    e: MALE_VOWEL_E,
    i: MALE_VOWEL_I,
    o: MALE_VOWEL_O,
    u: MALE_VOWEL_U,
    ih: HILLENBRAND_I_MALE,
    ae: HILLENBRAND_AE_MALE,
    aa: HILLENBRAND_AA_MALE,
    uh: HILLENBRAND_U_MALE,
  };

  // 女声基础
  const femaleBaseVowels: Record<string, VowelFormants> = {
    a: FEMALE_VOWEL_A,
    e: FEMALE_VOWEL_E,
    i: FEMALE_VOWEL_I,
    o: FEMALE_VOWEL_O,
    u: FEMALE_VOWEL_U,
    ih: HILLENBRAND_I_FEMALE,
    ae: HILLENBRAND_AE_FEMALE,
    aa: HILLENBRAND_AA_FEMALE,
    uh: HILLENBRAND_U_FEMALE,
  };

  // 童声基础
  const childBaseVowels: Record<string, VowelFormants> = {
    a: CHILD_VOWEL_A,
    e: CHILD_VOWEL_A, // 近似
    i: CHILD_VOWEL_I,
    o: CHILD_VOWEL_A, // 近似
    u: CHILD_VOWEL_U,
  };

  const timbreColors: TimbreColor[] = ['bright', 'warm', 'hoarse', 'ethereal'];

  for (const gender of ['male', 'female', 'child'] as Gender[]) {
    const base = gender === 'male' ? maleBaseVowels : gender === 'female' ? femaleBaseVowels : childBaseVowels;
    for (const timbre of timbreColors) {
      const vowels: Record<string, VowelFormants> = {};
      for (const [sym, vowel] of Object.entries(base)) {
        let variant: VowelFormants;
        switch (timbre) {
          case 'bright': variant = makeBrightVariant(vowel); break;
          case 'warm': variant = makeWarmVariant(vowel); break;
          case 'hoarse': variant = makeHoarseVariant(vowel); break;
          case 'ethereal': variant = makeEtherealVariant(vowel); break;
          default: variant = vowel;
        }
        vowels[sym] = variant;
      }
      entries.push({
        gender,
        timbre,
        vowels,
        f0Range: gender === 'male' ? [65, 400] : gender === 'female' ? [150, 700] : [220, 600],
        globalScale: gender === 'male' ? 1.0 : gender === 'female' ? 1.17 : 1.35,
      });
    }
  }

  return entries;
}

/** 全局精细共振峰数据库 */
export const FORMANT_DATABASE: FormantDatabaseEntry[] = buildFormantDatabase();

/** 查询共振峰数据库 */
export function queryFormantDatabase(
  gender: Gender,
  timbre: TimbreColor,
  vowelSymbol: string
): VowelFormants | null {
  const entry = FORMANT_DATABASE.find((e) => e.gender === gender && e.timbre === timbre);
  if (!entry) return null;
  return entry.vowels[vowelSymbol] || null;
}

// ==================== 中国乐谱系统 ====================

/** C大调简谱数字到音名映射 (1=C) */
export const JIANPU_NOTE_MAP: Readonly<Record<number, string>> = {
  1: 'C',
  2: 'D',
  3: 'E',
  4: 'F',
  5: 'G',
  6: 'A',
  7: 'B',
};

/** 音名到半音偏移 */
export const NOTE_SEMITONE_MAP: Readonly<Record<string, number>> = {
  C: 0, 'C#': 1, Db: 1,
  D: 2, 'D#': 3, Eb: 3,
  E: 4,
  F: 5, 'F#': 6, Gb: 6,
  G: 7, 'G#': 8, Ab: 8,
  A: 9, 'A#': 10, Bb: 10,
  B: 11,
};

/** 中国民族调式音阶偏移 (以宫为起点) */
export const CHINESE_MODE_INTERVALS: Readonly<Record<ChineseMode, number[]>> = {
  gong: [0, 2, 4, 5, 7, 9, 11],   // 宫调式 (大调风格)
  shang: [0, 2, 3, 5, 7, 9, 10],  // 商调式
  jue: [0, 1, 3, 5, 7, 8, 10],    // 角调式
  zhi: [0, 2, 4, 6, 7, 9, 11],    // 徵调式
  yu: [0, 2, 4, 5, 7, 9, 10],     // 羽调式 (小调风格)
};

/** 民族调式名称 */
export const CHINESE_MODE_NAMES: Readonly<Record<ChineseMode, string>> = {
  gong: '宫',
  shang: '商',
  jue: '角',
  zhi: '徵',
  yu: '羽',
};

/** 标准音A4频率 */
export const A4_FREQUENCY = 440.0;

/** 半音频率比 */
export const SEMITONE_RATIO = Math.pow(2, 1 / 12);

/**
 * 简谱数字转换为频率
 * @param digit 数字1-7
 * @param octaveShift 八度偏移
 * @param accidental 升降号 '' | '#' | 'b'
 * @param keyOffset 调性偏移 (半音, 默认0=C大调)
 * @returns 频率 (Hz)
 */
export function jianpuToFrequency(
  digit: number,
  octaveShift: number,
  accidental: string,
  keyOffset = 0
): number {
  if (digit < 1 || digit > 7) return 0;
  const noteName = JIANPU_NOTE_MAP[digit];
  let semitone = NOTE_SEMITONE_MAP[noteName] ?? 0;
  if (accidental === '#') semitone += 1;
  if (accidental === 'b') semitone -= 1;
  const midiNote = (octaveShift + 4) * 12 + semitone + keyOffset;
  return A4_FREQUENCY * Math.pow(SEMITONE_RATIO, midiNote - 69);
}

/**
 * 五线谱音符名转换为频率
 * @param noteName 如 "C4", "A#5", "Bb3"
 * @returns 频率 (Hz)
 */
export function staffNoteToFrequency(noteName: string): number {
  const match = noteName.match(/^([A-Ga-g])([#b]?)(-?\d+)$/);
  if (!match) throw new Error(`Invalid note name: ${noteName}`);
  const letter = match[1].toUpperCase();
  const accidental = match[2];
  const octave = parseInt(match[3], 10);
  let semitone = NOTE_SEMITONE_MAP[letter] ?? 0;
  if (accidental === '#') semitone += 1;
  if (accidental === 'b') semitone -= 1;
  const midiNote = (octave + 1) * 12 + semitone;
  return A4_FREQUENCY * Math.pow(SEMITONE_RATIO, midiNote - 69);
}

/**
 * MIDI音符编号转频率
 * @param midiNote MIDI编号 (0-127)
 * @returns 频率 (Hz)
 */
export function midiToFrequency(midiNote: number): number {
  if (midiNote < 0 || midiNote > 127) throw new RangeError('MIDI note out of range');
  return A4_FREQUENCY * Math.pow(SEMITONE_RATIO, midiNote - 69);
}

/**
 * 频率转MIDI音符编号
 * @param frequency 频率 (Hz)
 * @returns MIDI编号
 */
export function frequencyToMidi(frequency: number): number {
  if (frequency <= 0) throw new RangeError('Frequency must be positive');
  return 69 + 12 * Math.log2(frequency / A4_FREQUENCY);
}

/** 节奏时值映射 (以四分音符=1拍为基准, BPM=120时1拍=0.5秒) */
export const RHYTHM_VALUES: Readonly<Record<string, number>> = {
  'whole': 4,          // 全音符
  'half': 2,           // 二分音符
  'quarter': 1,        // 四分音符
  'eighth': 0.5,       // 八分音符
  'sixteenth': 0.25,   // 十六分音符
  'thirtysecond': 0.125, // 三十二分音符
};

/**
 * 附点音符时值计算
 * @param baseValue 基础时值
 * @param dotCount 附点数量
 * @returns 总时值
 */
export function dottedDuration(baseValue: number, dotCount: number): number {
  let total = baseValue;
  let increment = baseValue * 0.5;
  for (let i = 0; i < dotCount; i++) {
    total += increment;
    increment *= 0.5;
  }
  return total;
}

/**
 * 简谱字符串解析器
 * 支持格式: "1 2 3 1 | 5 6 5 - | 3 5 3 2 | 1 - - - ||"
 * - 数字 1-7 表示音高
 * - 0 表示休止符
 * - 下划线 _ 表示低音 (每多一个低八度)
 * - 上标 ' 表示高音 (每多一个高八度)
 * - # 升号, b 降号 (紧跟数字)
 * - / 或 // 表示节奏细分 (如 1/ = 八分音符)
 * - . 附点 (如 1. = 附点四分)
 * - - 延音线 (延续前一音)
 * - | 小节线
 * - || 终止线
 * @param jianpuStr 简谱字符串
 * @returns 解析后的简谱音符数组
 */
export function parseJianpuString(jianpuStr: string): JianpuNote[] {
  const notes: JianpuNote[] = [];
  const tokens = jianpuStr
    .replace(/\|{2,}/g, '||')
    .replace(/\|/g, ' | ')
    .split(/\s+/)
    .filter((t) => t.length > 0);

  let lastNote: JianpuNote | null = null;

  for (const token of tokens) {
    if (token === '|' || token === '||') continue;

    // 解析单个token
    const match = token.match(/^([_']*)([0-7])([#b]?)(\.?)(\/*)$/);
    if (!match) {
      // 检查是否为延音线
      if (token === '-' && lastNote) {
        notes.push({
          digit: lastNote.digit,
          octaveShift: lastNote.octaveShift,
          accidental: lastNote.accidental,
          durationMultiplier: lastNote.durationMultiplier,
          dotted: lastNote.dotted,
        });
        continue;
      }
      continue;
    }

    const octaveMarks = match[1];
    const digit = parseInt(match[2], 10);
    const accidental = match[3] || '';
    const dotted = match[4] === '.';
    const slashMarks = match[5];

    let octaveShift = 0;
    for (const ch of octaveMarks) {
      if (ch === '_') octaveShift -= 1;
      if (ch === "'") octaveShift += 1;
    }

    let durationMultiplier = 1;
    if (slashMarks.length === 1) durationMultiplier = 0.5;
    if (slashMarks.length === 2) durationMultiplier = 0.25;

    if (dotted) {
      durationMultiplier = dottedDuration(durationMultiplier, 1);
    }

    const note: JianpuNote = {
      digit,
      octaveShift,
      accidental,
      durationMultiplier,
      dotted,
    };

    notes.push(note);
    lastNote = note;
  }

  return notes;
}

/**
 * 简谱音符数组转换为五线谱音符数组
 * @param jianpuNotes 简谱音符
 * @param bpm 速度 (拍/分钟)
 * @param keyOffset 调性偏移 (半音)
 * @returns 五线谱音符
 */
export function jianpuToStaffNotes(
  jianpuNotes: JianpuNote[],
  bpm = 120,
  keyOffset = 0
): StaffNote[] {
  const beatDuration = 60 / bpm; // 四分音符时长 (秒)
  const staffNotes: StaffNote[] = [];

  for (const jn of jianpuNotes) {
    const freq = jianpuToFrequency(jn.digit, jn.octaveShift, jn.accidental, keyOffset);
    const midi = frequencyToMidi(freq);
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const name = noteNames[Math.round(midi) % 12];
    const octave = Math.floor(Math.round(midi) / 12) - 1;

    staffNotes.push({
      name,
      octave,
      frequency: freq,
      midiNote: Math.round(midi),
      duration: jn.durationMultiplier * beatDuration,
    });
  }

  return staffNotes;
}

/**
 * 中国民族调式音符生成
 * @param rootMidi 宫音MIDI编号
 * @param mode 调式
 * @param octaves 生成几组八度
 * @returns MIDI音符数组
 */
export function generateChineseModeScale(
  rootMidi: number,
  mode: ChineseMode,
  octaves = 1
): number[] {
  const intervals = CHINESE_MODE_INTERVALS[mode];
  const notes: number[] = [];
  for (let o = 0; o < octaves; o++) {
    for (const interval of intervals) {
      notes.push(rootMidi + interval + o * 12);
    }
  }
  return notes;
}

/**
 * 调式音符转换为频率数组
 * @param rootNote 宫音名称 (如 "C4")
 * @param mode 调式
 * @param octaves 八度组数
 * @returns 频率数组
 */
export function chineseModeFrequencies(
  rootNote: string,
  mode: ChineseMode,
  octaves = 1
): number[] {
  const rootFreq = staffNoteToFrequency(rootNote);
  const rootMidi = Math.round(frequencyToMidi(rootFreq));
  const midis = generateChineseModeScale(rootMidi, mode, octaves);
  return midis.map((m) => midiToFrequency(m));
}

// ==================== 人声描述系统 ====================

/** 力度映射表 (pp/p/mp/mf/f/ff -> 振幅系数) */
export const DYNAMICS_MAP: Readonly<Record<string, number>> = {
  pp: 0.15,
  p: 0.3,
  mp: 0.5,
  mf: 0.65,
  f: 0.82,
  ff: 1.0,
};

/** 力度映射为ADSR参数 */
export interface ADSRParams {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
}

/**
 * 力度转换为ADSR包络参数
 * @param dynamic 力度标记
 * @returns ADSR参数
 */
export function dynamicToADSR(dynamic: string): ADSRParams {
  const map: Record<string, ADSRParams> = {
    pp: { attack: 0.08, decay: 0.15, sustain: 0.2, release: 0.4 },
    p: { attack: 0.06, decay: 0.12, sustain: 0.35, release: 0.3 },
    mp: { attack: 0.04, decay: 0.08, sustain: 0.55, release: 0.2 },
    mf: { attack: 0.03, decay: 0.06, sustain: 0.7, release: 0.15 },
    f: { attack: 0.02, decay: 0.05, sustain: 0.85, release: 0.12 },
    ff: { attack: 0.01, decay: 0.03, sustain: 0.95, release: 0.08 },
  };
  return map[dynamic] || map['mf'];
}

/**
 * 应用气声效果
 * 增加噪声比例，减弱声门闭合
 * @param source 原始声源信号
 * @param breathiness 气声强度 (0-1)
 * @returns 处理后的信号
 */
export function applyBreathyEffect(source: Float32Array, breathiness: number): Float32Array {
  const result = new Float32Array(source.length);
  for (let i = 0; i < source.length; i++) {
    const noise = (Math.random() * 2 - 1) * breathiness;
    // 减弱周期性脉冲，增加噪声
    result[i] = source[i] * (1 - breathiness * 0.6) + noise * 0.4;
  }
  return result;
}

/**
 * 应用头声效果
 * 提高基频感知，减少低频能量
 * @param buffer 输入音频
 * @param intensity 强度 (0-1)
 * @param sampleRate 采样率
 * @returns 处理后的信号
 */
export function applyHeadVoiceEffect(
  buffer: Float32Array,
  intensity: number,
  sampleRate: number
): Float32Array {
  // 使用高通滤波模拟头声减少低频
  const cutoff = 300 + intensity * 500;
  return onePoleHighPass(buffer, cutoff, sampleRate);
}

/**
 * 应用胸声效果
 * 增加低频共振，基频更稳
 * @param buffer 输入音频
 * @param intensity 强度 (0-1)
 * @param sampleRate 采样率
 * @returns 处理后的信号
 */
export function applyChestVoiceEffect(
  buffer: Float32Array,
  intensity: number,
  sampleRate: number
): Float32Array {
  // 低通增强 + 轻微压缩
  const cutoff = 800 + (1 - intensity) * 1200;
  const filtered = onePoleLowPass(buffer, cutoff, sampleRate);
  const enhanced = new Float32Array(buffer.length);
  for (let i = 0; i < buffer.length; i++) {
    // 增加低频谐波感
    enhanced[i] = filtered[i] + buffer[i] * intensity * 0.3;
  }
  return enhanced;
}

/**
 * 应用假声效果
 * 高声区，声带边缘振动，气息比例高
 * @param buffer 输入音频
 * @param intensity 强度 (0-1)
 * @returns 处理后的信号
 */
export function applyFalsettoEffect(buffer: Float32Array, intensity: number): Float32Array {
  const result = new Float32Array(buffer.length);
  for (let i = 0; i < buffer.length; i++) {
    // 增加高频噪声，降低振幅稳定性
    const noise = (Math.random() * 2 - 1) * intensity * 0.25;
    const instability = 1 + (Math.random() - 0.5) * intensity * 0.1;
    result[i] = buffer[i] * instability * 0.85 + noise;
  }
  return result;
}

/**
 * 应用气泡音效果
 * 极低基频，不规则脉冲
 * @param length 采样点数
 * @param f0 目标基频 (通常40-80Hz)
 * @param sampleRate 采样率
 * @returns 气泡音信号
 */
export function generateVocalFry(length: number, f0: number, sampleRate: number): Float32Array {
  const buffer = new Float32Array(length);
  const period = sampleRate / f0;
  let phase = 0;
  for (let i = 0; i < length; i++) {
    // 极不规则的脉冲
    const jitter = 1 + (Math.random() - 0.5) * 0.3;
    const currentPeriod = period * jitter;
    phase += 1;
    if (phase >= currentPeriod) phase -= currentPeriod;
    // 短促的双脉冲模拟气泡破裂
    const normPhase = phase / currentPeriod;
    let pulse = 0;
    if (normPhase < 0.03) pulse = 1.0;
    else if (normPhase > 0.06 && normPhase < 0.09) pulse = 0.6;
    else pulse = -0.15;
    buffer[i] = pulse * 0.5;
  }
  return buffer;
}

/**
 * 生成爆破音 (p/b/t/d/k/g)
 * 瞬态冲击 + 无声段
 * @param phoneme 爆破音标识
 * @param sampleRate 采样率
 * @returns 爆破音信号
 */
export function generatePlosive(phoneme: string, sampleRate: number): Float32Array {
  const duration = Math.floor(0.08 * sampleRate);
  const buffer = new Float32Array(duration);
  // 前20%为无声段 (闭塞期)
  const silenceEnd = Math.floor(duration * 0.2);
  // 后80%为瞬态释放
  const transientLen = duration - silenceEnd;
  for (let i = silenceEnd; i < duration; i++) {
    const t = (i - silenceEnd) / transientLen;
    const env = Math.exp(-t * 8);
    const noise = (Math.random() * 2 - 1);
    // 不同爆破音有不同频谱特性
    let emphasis = 1.0;
    if (['p', 'b'].includes(phoneme)) emphasis = 0.5; // 双唇，低频
    if (['t', 'd'].includes(phoneme)) emphasis = 1.2; // 齿龈，中频
    if (['k', 'g'].includes(phoneme)) emphasis = 1.5; // 软腭，高频
    buffer[i] = noise * env * emphasis * 0.6;
  }
  return buffer;
}

/**
 * 生成摩擦音 (s/z/f/v/sh/th)
 * 高频噪声
 * @param phoneme 摩擦音标识
 * @param length 采样点数
 * @param sampleRate 采样率
 * @returns 摩擦音信号
 */
export function generateFricative(
  phoneme: string,
  length: number,
  sampleRate: number
): Float32Array {
  const buffer = new Float32Array(length);
  let lowCut = 2000;
  let highCut = 8000;

  switch (phoneme) {
    case 'f': case 'v': lowCut = 800; highCut = 6000; break;
    case 's': case 'z': lowCut = 3500; highCut = 12000; break;
    case 'sh': lowCut = 2000; highCut = 9000; break;
    case 'th': lowCut = 1500; highCut = 7000; break;
  }

  for (let i = 0; i < length; i++) {
    buffer[i] = Math.random() * 2 - 1;
  }
  return bandPassFilter(buffer, lowCut, highCut, sampleRate);
}

/**
 * 生成滑音基频曲线 (Portamento / Glissando)
 * @param length 采样点数
 * @param sampleRate 采样率
 * @param fromF0 起始基频
 * @param toF0 目标基频
 * @param curveType 曲线类型
 * @returns 基频曲线
 */
export function generateGlissandoCurve(
  length: number,
  sampleRate: number,
  fromF0: number,
  toF0: number,
  curveType: 'linear' | 'exp' | 'log' | 'sigmoid' = 'sigmoid'
): Float32Array {
  const curve = new Float32Array(length);
  const logFrom = Math.log2(fromF0);
  const logTo = Math.log2(toF0);

  for (let i = 0; i < length; i++) {
    const t = i / length;
    let eased: number;
    switch (curveType) {
      case 'linear':
        eased = t;
        break;
      case 'exp':
        eased = t * t;
        break;
      case 'log':
        eased = Math.sqrt(t);
        break;
      case 'sigmoid':
      default:
        eased = t * t * (3 - 2 * t);
        break;
    }
    const logFreq = logFrom + (logTo - logFrom) * eased;
    curve[i] = Math.pow(2, logFreq);
  }
  return curve;
}

/**
 * 生成颤音调制曲线
 * @param length 采样点数
 * @param sampleRate 采样率
 * @param depthHz 颤音深度 (Hz)
 * @param rateHz 颤音速率 (Hz)
 * @param phaseOffset 初始相位
 * @returns 频率偏移数组 (Hz)
 */
export function generateVibratoCurve(
  length: number,
  sampleRate: number,
  depthHz: number,
  rateHz: number,
  phaseOffset = 0
): Float32Array {
  const curve = new Float32Array(length);
  const phaseInc = (2 * Math.PI * rateHz) / sampleRate;
  let phase = phaseOffset;
  for (let i = 0; i < length; i++) {
    curve[i] = depthHz * Math.sin(phase);
    phase += phaseInc;
  }
  return curve;
}

/**
 * 生成波音 (Mordent / Turn) 调制曲线
 * @param length 采样点数
 * @param sampleRate 采样率
 * @param depthSemitone 深度 (半音)
 * @param rateHz 速率 (Hz)
 * @param type 类型
 * @returns 频率倍率曲线
 */
export function generateMordentCurve(
  length: number,
  sampleRate: number,
  depthSemitone: number,
  rateHz: number,
  type: 'upper' | 'lower' | 'turn' = 'upper'
): Float32Array {
  const curve = new Float32Array(length);
  const phaseInc = (2 * Math.PI * rateHz) / sampleRate;
  let phase = 0;
  const ratio = Math.pow(SEMITONE_RATIO, depthSemitone);

  for (let i = 0; i < length; i++) {
    const sinVal = Math.sin(phase);
    if (type === 'upper') {
      curve[i] = sinVal > 0 ? ratio : 1.0;
    } else if (type === 'lower') {
      curve[i] = sinVal > 0 ? 1.0 / ratio : 1.0;
    } else {
      // turn: 上下交替
      curve[i] = sinVal > 0 ? ratio : 1.0 / ratio;
    }
    phase += phaseInc;
  }
  return curve;
}

/**
 * 综合人声效果处理器
 * @param buffer 输入音频
 * @param descriptor 人声描述
 * @param sampleRate 采样率
 * @returns 处理后的音频
 */
export function applyVoiceDescriptor(
  buffer: Float32Array,
  descriptor: VoiceDescriptor,
  sampleRate: number
): Float32Array {
  let result: Float32Array = new Float32Array(buffer);

  for (const tech of descriptor.techniques) {
    switch (tech) {
      case 'breathy':
        result = applyBreathyEffect(result, descriptor.breathiness);
        break;
      case 'head':
        result = applyHeadVoiceEffect(result, 0.7, sampleRate);
        break;
      case 'chest':
        result = applyChestVoiceEffect(result, 0.7, sampleRate);
        break;
      case 'falsetto':
        result = applyFalsettoEffect(result, 0.8);
        break;
      case 'fry': {
        const fry = generateVocalFry(result.length, descriptor.f0 * 0.5, sampleRate);
        for (let i = 0; i < result.length; i++) {
          result[i] = result[i] * 0.3 + fry[i] * 0.7;
        }
        break;
      }
      case 'plosive': {
        const plosive = generatePlosive('p', sampleRate);
        for (let i = 0; i < Math.min(plosive.length, result.length); i++) {
          result[i] += plosive[i];
        }
        break;
      }
      case 'fricative': {
        const fric = generateFricative('s', result.length, sampleRate);
        for (let i = 0; i < result.length; i++) {
          result[i] += fric[i] * 0.3;
        }
        break;
      }
      case 'pp': case 'p': case 'mp': case 'mf': case 'f': case 'ff': {
        const scale = DYNAMICS_MAP[tech] ?? 0.7;
        for (let i = 0; i < result.length; i++) {
          result[i] *= scale;
        }
        break;
      }
    }
  }

  // 应用性别转换
  if (descriptor.genderShift !== 1.0) {
    // 共振峰转换已在合成阶段处理，此处做音高补偿
    // 实际音高调整在渲染器中处理
  }

  return result;
}

// ==================== 非传统合成算法 ====================

/**
 * Lorenz吸引子迭代
 * 用于生成混沌基频抖动
 * @param state 当前状态
 * @param sigma 参数σ
 * @param rho 参数ρ
 * @param beta 参数β
 * @param dt 时间步长
 * @returns 新状态
 */
export function lorenzStep(
  state: AttractorState,
  sigma = 10,
  rho = 28,
  beta = 8 / 3,
  dt = 0.01
): AttractorState {
  const dx = sigma * (state.y - state.x);
  const dy = state.x * (rho - state.z) - state.y;
  const dz = state.x * state.y - beta * state.z;
  return {
    x: state.x + dx * dt,
    y: state.y + dy * dt,
    z: state.z + dz * dt,
  };
}

/**
 * Rössler吸引子迭代
 * @param state 当前状态
 * @param a 参数a
 * @param b 参数b
 * @param c 参数c
 * @param dt 时间步长
 * @returns 新状态
 */
export function rosslerStep(
  state: AttractorState,
  a = 0.2,
  b = 0.2,
  c = 5.7,
  dt = 0.01
): AttractorState {
  const dx = -state.y - state.z;
  const dy = state.x + a * state.y;
  const dz = b + state.z * (state.x - c);
  return {
    x: state.x + dx * dt,
    y: state.y + dy * dt,
    z: state.z + dz * dt,
  };
}

/**
 * 混沌基频抖动生成器
 * 使用Lorenz/Rössler吸引子控制微小基频扰动，模拟真人声带非周期振动
 * @param length 采样点数
 * @param sampleRate 采样率
 * @param baseF0 基础基频
 * @param jitterAmount 抖动强度 (Hz, 通常1-5)
 * @param attractorType 吸引子类型
 * @returns 带抖动的基频曲线
 */
export function generateChaoticF0Jitter(
  length: number,
  sampleRate: number,
  baseF0: number,
  jitterAmount: number,
  attractorType: 'lorenz' | 'rossler' = 'lorenz'
): Float32Array {
  const curve = new Float32Array(length);
  let state: AttractorState = { x: 0.1, y: 0.1, z: 0.1 };
  const dt = 0.01;
  const stepFn = attractorType === 'lorenz' ? lorenzStep : rosslerStep;

  for (let i = 0; i < length; i++) {
    state = stepFn(state, undefined, undefined, undefined, dt);
    // 将混沌输出映射到基频扰动 (归一化到[-1,1])
    const chaosValue = Math.tanh(state.x * 0.1);
    curve[i] = baseF0 + chaosValue * jitterAmount;
  }
  return curve;
}

/**
 * 分形布朗运动 (Fractional Brownian Motion) 噪声生成
 * 使用带累积记忆的随机游走，比白噪声更自然
 * @param length 采样点数
 * @param amplitude 振幅
 * @param hurstExponent Hurst指数 (0-1, 0.5为普通布朗运动, >0.5为持续性)
 * @returns fBm噪声
 */
export function generateFractionalBrownianNoise(
  length: number,
  amplitude: number,
  hurstExponent = 0.75
): Float32Array {
  const buffer = new Float32Array(length);
  let value = 0;
  // 简单近似：使用加权历史累积
  const memoryFactor = Math.pow(0.5, 2 - 2 * hurstExponent);
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    value = value * memoryFactor + white * (1 - memoryFactor);
    buffer[i] = value * amplitude;
  }
  return buffer;
}

/**
 * 细胞自动机 (Cellular Automata) 声道过渡控制器
 * 使用一维CA规则控制元音间共振峰变化路径
 * @param ruleNumber Wolfram规则号 (0-255)
 * @param steps 迭代步数
 * @param width 细胞数组宽度
 * @returns CA演化历史 (每行代表一步)
 */
export function cellularAutomataTransition(
  ruleNumber: number,
  steps: number,
  width: number
): number[][] {
  const history: number[][] = [];
  let current: number[] = new Array(width).fill(0);
  // 初始条件：中间一个细胞为1
  current[Math.floor(width / 2)] = 1;

  for (let s = 0; s < steps; s++) {
    history.push([...current]);
    const next: number[] = new Array(width).fill(0);
    for (let i = 0; i < width; i++) {
      const left = current[(i - 1 + width) % width];
      const center = current[i];
      const right = current[(i + 1) % width];
      const pattern = (left << 2) | (center << 1) | right;
      next[i] = (ruleNumber >> pattern) & 1;
    }
    current = next;
  }
  return history;
}

/**
 * 从CA历史生成共振峰过渡权重曲线
 * 将CA模式映射为元音A到元音B的过渡权重
 * @param history CA历史
 * @param sampleRate 采样率
 * @param duration 总时长 (秒)
 * @returns 权重曲线 (0-1)
 */
export function caToTransitionWeights(
  history: number[][],
  sampleRate: number,
  duration: number
): Float32Array {
  const length = Math.floor(duration * sampleRate);
  const weights = new Float32Array(length);
  const totalSteps = history.length;
  const cells = history[0]?.length || 1;

  for (let i = 0; i < length; i++) {
    const stepIdx = Math.floor((i / length) * totalSteps);
    const step = history[Math.min(stepIdx, totalSteps - 1)];
    // 计算当前步的活细胞密度作为过渡权重
    let sum = 0;
    for (const cell of step) sum += cell;
    weights[i] = sum / cells;
  }
  return weights;
}

/**
 * 量子叠加态音色合成
 * 多个共振峰参数集叠加，模拟不同共鸣腔混合
 * @param source 声源信号
 * @param vowelSets 多个元音参数集
 * @param weights 叠加权重
 * @param sampleRate 采样率
 * @returns 叠加后的音频
 */
export function quantumSuperpositionTimbre(
  source: Float32Array,
  vowelSets: VowelFormants[],
  weights: number[],
  sampleRate: number
): Float32Array {
  if (vowelSets.length === 0) return source;
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const normalizedWeights = weights.map((w) => w / (totalWeight || 1));

  let result = new Float32Array(source.length);
  for (let v = 0; v < vowelSets.length; v++) {
    const vowel = vowelSets[v];
    const w = normalizedWeights[v] ?? 0;
    const filtered = applyFormantFilter(source, vowel.formants, sampleRate);
    for (let i = 0; i < result.length; i++) {
      result[i] += filtered[i] * w;
    }
  }
  return result;
}

// ==================== 高级物理模型 ====================

/**
 * 双质点声带模型 (Two-Mass Model)
 * 模拟声带开放相(open phase)和闭合相(closed phase)
 * 简化实现：基于Ishizaka-Flanagan模型思想
 * @param length 采样点数
 * @param sampleRate 采样率
 * @param f0 基频
 * @param breathPressure 呼吸气压 (0-1)
 * @param tension 声带张力 (0-1)
 * @returns 声门波信号
 */
export function twoMassVocalFoldModel(
  length: number,
  sampleRate: number,
  f0: number,
  breathPressure: number,
  tension: number
): Float32Array {
  const buffer = new Float32Array(length);
  const period = sampleRate / f0;
  // 开放商 (Open Quotient) 随张力变化
  const oq = 0.4 + (1 - tension) * 0.3;
  // 闭合速度系数
  const closingSpeed = 1 + tension;

  let phase = 0;
  for (let i = 0; i < length; i++) {
    phase += 1;
    if (phase >= period) phase -= period;
    const normPhase = phase / period;

    let glottalFlow = 0;
    if (normPhase < oq) {
      // 开放相：上升沿慢，下降沿快 (非对称)
      const openPhase = normPhase / oq;
      // 使用多项式模拟LF模型近似
      glottalFlow = Math.pow(openPhase, 2) * (3 - 2 * openPhase);
      // 下降沿修正
      if (openPhase > 0.7) {
        const decay = (openPhase - 0.7) / 0.3;
        glottalFlow *= (1 - Math.pow(decay, closingSpeed));
      }
    } else {
      // 闭合相
      glottalFlow = 0;
    }

    // 添加微小泄漏和噪声
    const leakage = breathPressure * 0.02;
    const noise = (Math.random() * 2 - 1) * breathPressure * 0.01;
    buffer[i] = (glottalFlow + leakage) * breathPressure + noise;
  }
  return buffer;
}

/**
 * 一维声道波导模型 (Kelly-Lochbaum)
 * 将声道离散为若干段圆柱管，每段有反射系数
 * @param source 声源信号 (声门波)
 * @param tubeAreas 各段声道截面积数组
 * @param sampleRate 采样率
 * @returns 辐射后的音频
 */
export function kellyLochbaumWaveguide(
  source: Float32Array,
  tubeAreas: number[],
  sampleRate: number
): Float32Array {
  const numSections = tubeAreas.length;
  if (numSections < 2) return source;

  // 计算反射系数
  const reflections: number[] = [];
  for (let i = 0; i < numSections - 1; i++) {
    const r = (tubeAreas[i] - tubeAreas[i + 1]) / (tubeAreas[i] + tubeAreas[i + 1]);
    reflections.push(Math.max(-0.99, Math.min(0.99, r)));
  }

  // 波导延迟线 (简化为每段1个采样延迟)
  const forward: number[] = new Array(numSections).fill(0);
  const backward: number[] = new Array(numSections).fill(0);
  const output = new Float32Array(source.length);

  for (let n = 0; n < source.length; n++) {
    // 注入声源到第一段
    forward[0] = source[n];

    // 前向传播
    for (let i = 0; i < numSections - 1; i++) {
      const r = reflections[i];
      const nextForward = (1 + r) * forward[i] - r * backward[i + 1];
      const nextBackward = (1 - r) * backward[i + 1] + r * forward[i];
      forward[i + 1] = nextForward;
      backward[i] = nextBackward;
    }

    // 唇端边界条件 (开放端，反射系数≈-1)
    const lipReflection = -0.95;
    backward[numSections - 1] = lipReflection * forward[numSections - 1];

    // 输出取唇端前向波
    output[n] = forward[numSections - 1];
  }

  return output;
}

/**
 * 鼻腔耦合滤波器
 * 鼻音/m/n/ŋ的特殊处理：增加 nasal formant (约250-300Hz) 和零极点
 * @param source 输入信号
 * @param coupling 耦合系数 (0-1)
 * @param sampleRate 采样率
 * @returns 处理后的信号
 */
export function nasalCouplingFilter(
  source: Float32Array,
  coupling: number,
  sampleRate: number
): Float32Array {
  // 使用简单的二阶带通模拟鼻音共振峰 (~250Hz)
  const nasalFormant = biquadBandPass(source, 280, 120, sampleRate);
  const result = new Float32Array(source.length);
  for (let i = 0; i < source.length; i++) {
    result[i] = source[i] * (1 - coupling * 0.5) + nasalFormant[i] * coupling;
  }
  return result;
}

/**
 * 唇辐射滤波器 (6dB/octave 高通)
 * 模拟嘴唇辐射特性，对低频衰减
 * @param source 输入信号
 * @param sampleRate 采样率
 * @returns 辐射后的信号
 */
export function lipRadiationFilter(source: Float32Array, sampleRate: number): Float32Array {
  // 一阶差分近似 6dB/oct 高通: y[n] = x[n] - x[n-1]
  const result = new Float32Array(source.length);
  let prev = 0;
  for (let i = 0; i < source.length; i++) {
    result[i] = source[i] - prev * 0.98;
    prev = source[i];
  }
  return result;
}

/**
 * LF模型近似声门气流模型
 * Liljencrants-Fant (LF) 模型的简化实现
 * @param length 采样点数
 * @param sampleRate 采样率
 * @param f0 基频
 * @param Oq 开放商 (0-1)
 * @param am 返回相不对称度
 * @returns 声门波导数信号
 */
export function lfGlottalFlowModel(
  length: number,
  sampleRate: number,
  f0: number,
  Oq = 0.6,
  am = 0.6
): Float32Array {
  const buffer = new Float32Array(length);
  const period = sampleRate / f0;
  const Te = Oq * period; // 开放相结束点
  const Tp = am * Te; // 峰值位置

  for (let i = 0; i < length; i++) {
    const phase = i % period;
    if (phase < Te) {
      // 上升相
      if (phase < Tp) {
        const t = phase / Tp;
        buffer[i] = Math.sin((Math.PI / 2) * t);
      } else {
        // 下降相 (指数衰减近似)
        const t = (phase - Tp) / (Te - Tp);
        buffer[i] = Math.cos((Math.PI / 2) * t) * Math.exp(-t * 2);
      }
    } else {
      // 闭合相 (返回相)
      const t = (phase - Te) / (period - Te);
      buffer[i] = -0.3 * Math.sin(Math.PI * t) * Math.exp(-t * 3);
    }
  }
  return buffer;
}

/**
 * 综合物理模型合成器
 * 整合双质点声带、波导、鼻腔、唇辐射
 * @param length 采样点数
 * @param sampleRate 采样率
 * @param f0 基频
 * @param vowel 元音参数
 * @param breathPressure 气压
 * @returns 合成音频
 */
export function physicalModelSynthesis(
  length: number,
  sampleRate: number,
  f0: number,
  vowel: VowelFormants,
  breathPressure: number
): Float32Array {
  // 1. 声门波生成 (双质点模型)
  const glottalWave = twoMassVocalFoldModel(length, sampleRate, f0, breathPressure, 0.5);

  // 2. 声道波导 (从共振峰反推 tube areas 近似)
  const tubeAreas = formantsToTubeAreas(vowel.formants);
  const tractOutput = kellyLochbaumWaveguide(glottalWave, tubeAreas, sampleRate);

  // 3. 鼻腔耦合
  const nasalOutput = nasalCouplingFilter(tractOutput, vowel.nasalCoupling, sampleRate);

  // 4. 唇辐射
  const radiated = lipRadiationFilter(nasalOutput, sampleRate);

  return radiated;
}

/**
 * 从共振峰估算声道截面积 (简单近似)
 * 使用均一 tube 模型，每段对应一个共振峰区间
 * @param formants 五个共振峰
 * @returns 截面积数组
 */
export function formantsToTubeAreas(formants: [FormantParam, FormantParam, FormantParam, FormantParam, FormantParam]): number[] {
  // 简化：将共振峰频率反推为 tube area function
  // 实际需解非线性方程，此处使用经验近似
  const areas: number[] = [];
  for (let i = 0; i < 8; i++) {
    // 8段 tube
    let area = 1.0;
    for (const f of formants) {
      // 共振峰越高，对应部位截面积越小 (简化关系)
      area += 0.5 * Math.cos((i / 8) * Math.PI * f.Fc / 3000);
    }
    areas.push(Math.max(0.1, Math.abs(area)));
  }
  return areas;
}

// ==================== 粒子云合成 ====================

/**
 * 微观粒子包络生成
 * @param length 采样点数
 * @param type 包络类型
 * @returns 包络数组
 */
export function grainEnvelope(length: number, type: GrainParam['envelope']): Float32Array {
  const env = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const t = i / length;
    switch (type) {
      case 'hanning':
        env[i] = 0.5 * (1 - Math.cos(2 * Math.PI * t));
        break;
      case 'gaussian': {
        const g = Math.exp(-Math.pow((t - 0.5) * 6, 2));
        env[i] = g;
        break;
      }
      case 'tukey': {
        const r = 0.5;
        if (t < r / 2) env[i] = 0.5 * (1 + Math.cos((2 * Math.PI / r) * (t - r / 2)));
        else if (t > 1 - r / 2) env[i] = 0.5 * (1 + Math.cos((2 * Math.PI / r) * (t - 1 + r / 2)));
        else env[i] = 1.0;
        break;
      }
      case 'expodec':
        env[i] = Math.exp(-t * 5);
        break;
      default:
        env[i] = 1.0;
    }
  }
  return env;
}

/**
 * 生成单个粒子
 * @param param 粒子参数
 * @param sampleRate 采样率
 * @returns 粒子音频
 */
export function generateGrain(param: GrainParam, sampleRate: number): Float32Array {
  const length = Math.floor(param.duration * sampleRate);
  const buffer = new Float32Array(length);

  // 正弦 + 谐波作为粒子声源
  const phaseInc = (2 * Math.PI * param.pitch) / sampleRate;
  let phase = 0;
  for (let i = 0; i < length; i++) {
    let sample = Math.sin(phase);
    // 添加少量谐波
    sample += 0.3 * Math.sin(phase * 2);
    sample += 0.15 * Math.sin(phase * 3);
    sample += 0.08 * Math.sin(phase * 4);
    buffer[i] = sample * param.amplitude;
    phase += phaseInc;
  }

  // 应用包络
  const env = grainEnvelope(length, param.envelope);
  for (let i = 0; i < length; i++) {
    buffer[i] *= env[i];
  }

  return buffer;
}

/**
 * Logistic混沌映射
 * @param x 当前值 (0-1)
 * @param r 参数 (通常3.5-4.0)
 * @returns 下一个值
 */
export function logisticMap(x: number, r = 3.9): number {
  return r * x * (1 - x);
}

/**
 * 粒子云密度控制 (基于混沌映射)
 * @param duration 总时长 (秒)
 * @param sampleRate 采样率
 * @param baseDensity 基础密度 (粒子/秒)
 * @param chaosAmount 混沌程度 (0-1)
 * @returns 每个采样点的粒子密度权重
 */
export function granularCloudDensity(
  duration: number,
  sampleRate: number,
  baseDensity: number,
  chaosAmount: number
): Float32Array {
  const length = Math.floor(duration * sampleRate);
  const weights = new Float32Array(length);
  let chaosState = 0.5;
  const samplesPerGrain = Math.floor(sampleRate / baseDensity);

  for (let i = 0; i < length; i++) {
    if (i % samplesPerGrain === 0) {
      chaosState = logisticMap(chaosState, 3.8 + chaosAmount * 0.19);
    }
    weights[i] = chaosState;
  }
  return weights;
}

/**
 * 粒子云合成
 * 从参数生成粒子云，不需要外部样本
 * @param duration 总时长 (秒)
 * @param sampleRate 采样率
 * @param basePitch 基础音高 (Hz)
 * @param density 粒子密度 (粒子/秒)
 * @param grainDuration 粒子时长 (秒, 0.01-0.05)
 * @param chaosAmount 混沌程度
 * @returns 合成音频
 */
export function granularCloudSynthesis(
  duration: number,
  sampleRate: number,
  basePitch: number,
  density: number,
  grainDuration: number,
  chaosAmount: number
): Float32Array {
  const totalSamples = Math.floor(duration * sampleRate);
  const output = new Float32Array(totalSamples);
  const densityWeights = granularCloudDensity(duration, sampleRate, density, chaosAmount);

  const numGrains = Math.floor(duration * density * 2); // 预分配足够粒子
  let chaosX = 0.3;
  let chaosY = 0.7;

  for (let g = 0; g < numGrains; g++) {
    // 混沌决定粒子出现位置
    chaosX = logisticMap(chaosX, 3.9);
    chaosY = logisticMap(chaosY, 3.85);
    const startTime = chaosX * duration;
    const startSample = Math.floor(startTime * sampleRate);

    if (startSample >= totalSamples) continue;

    // 混沌决定音高微扰
    const pitchJitter = (chaosY - 0.5) * 20; // ±10Hz
    const pitch = basePitch + pitchJitter;

    // 混沌决定时长微扰
    const durJitter = grainDuration * (0.8 + chaosX * 0.4);

    // 混沌决定振幅
    const amp = densityWeights[Math.min(startSample, totalSamples - 1)] * 0.3;

    const grainParam: GrainParam = {
      startTime,
      duration: durJitter,
      pitch,
      envelope: 'gaussian',
      pan: (chaosY - 0.5) * 2,
      density: densityWeights[startSample] ?? 0.5,
      amplitude: amp,
    };

    const grain = generateGrain(grainParam, sampleRate);
    for (let i = 0; i < grain.length && startSample + i < totalSamples; i++) {
      output[startSample + i] += grain[i];
    }
  }

  // 粒子间干涉导致的自然幅度变化
  normalizeBuffer(output);
  return output;
}

/**
 * 粒子间干涉模拟
 * 简单模拟相邻粒子的相位干涉效果
 * @param buffer 粒子云音频
 * @param sampleRate 采样率
 * @param grainDuration 粒子时长
 * @returns 处理后的音频
 */
export function simulateGrainInterference(
  buffer: Float32Array,
  sampleRate: number,
  grainDuration: number
): Float32Array {
  const grainSamples = Math.floor(grainDuration * sampleRate);
  const result = new Float32Array(buffer.length);
  for (let i = 0; i < buffer.length; i++) {
    // 用移动平均模拟局部干涉平滑
    let sum = 0;
    const half = Math.floor(grainSamples / 4);
    let count = 0;
    for (let j = -half; j <= half; j++) {
      const idx = i + j;
      if (idx >= 0 && idx < buffer.length) {
        sum += buffer[idx];
        count++;
      }
    }
    result[i] = buffer[i] * 0.7 + (sum / count) * 0.3;
  }
  return result;
}

// ==================== LPC分析工具 ====================

/**
 * Levinson-Durbin递推计算LPC系数
 * @param signal 输入信号
 * @param order LPC阶数
 * @returns LPC分析结果
 */
export function levinsonDurbin(signal: Float32Array, order: number): LPCResult {
  const n = signal.length;
  // 计算自相关函数
  const r = new Float64Array(order + 1);
  for (let k = 0; k <= order; k++) {
    let sum = 0;
    for (let i = 0; i < n - k; i++) {
      sum += signal[i] * signal[i + k];
    }
    r[k] = sum;
  }

  const a = new Float64Array(order + 1);
  const e = new Float64Array(order + 1);
  a[0] = 1;
  e[0] = r[0];

  for (let m = 1; m <= order; m++) {
    let lambda = 0;
    for (let i = 0; i < m; i++) {
      lambda += a[i] * r[m - i];
    }
    lambda = -lambda / e[m - 1];

    const aTemp = new Float64Array(a);
    for (let i = 1; i < m; i++) {
      a[i] = aTemp[i] + lambda * aTemp[m - i];
    }
    a[m] = lambda;
    e[m] = e[m - 1] * (1 - lambda * lambda);
  }

  return {
    coefficients: a.slice(0, order + 1),
    error: e[order],
    gain: Math.sqrt(e[order]),
    order,
  };
}

/**
 * 从LPC系数提取共振峰
 * 通过求解预测误差滤波器多项式的根
 * @param lpc LPC分析结果
 * @param sampleRate 采样率
 * @returns 检测到的共振峰频率和带宽数组
 */
export function extractFormantsFromLPC(
  lpc: LPCResult,
  sampleRate: number
): Array<{ frequency: number; bandwidth: number }> {
  // 简化为从LPC系数估算峰值频率
  // 实际实现需要复数根求解，此处使用近似方法
  const a = lpc.coefficients;
  const formants: Array<{ frequency: number; bandwidth: number }> = [];

  // 使用简化的谱峰检测
  const fftSize = 512;
  const spectrum = new Float64Array(fftSize / 2);
  for (let k = 0; k < fftSize / 2; k++) {
    const omega = (2 * Math.PI * k) / fftSize;
    let real = 1;
    let imag = 0;
    for (let i = 1; i < a.length; i++) {
      real += a[i] * Math.cos(omega * i);
      imag -= a[i] * Math.sin(omega * i);
    }
    const mag = 1 / Math.sqrt(real * real + imag * imag);
    spectrum[k] = mag;
  }

  // 峰值检测
  for (let i = 2; i < spectrum.length - 2; i++) {
    if (
      spectrum[i] > spectrum[i - 1] &&
      spectrum[i] > spectrum[i - 2] &&
      spectrum[i] > spectrum[i + 1] &&
      spectrum[i] > spectrum[i + 2]
    ) {
      const freq = (i * sampleRate) / fftSize;
      const bw = 100; // 简化带宽估计
      if (freq > 150 && freq < sampleRate / 2) {
        formants.push({ frequency: freq, bandwidth: bw });
      }
    }
  }

  return formants.slice(0, 5);
}

/**
 * 计算预测误差
 * @param signal 原始信号
 * @param lpc LPC结果
 * @returns 预测误差信号
 */
export function computePredictionError(signal: Float32Array, lpc: LPCResult): Float32Array {
  const error = new Float32Array(signal.length);
  const a = lpc.coefficients;
  for (let n = lpc.order; n < signal.length; n++) {
    let prediction = 0;
    for (let i = 1; i <= lpc.order; i++) {
      prediction += a[i] * signal[n - i];
    }
    error[n] = signal[n] - prediction;
  }
  return error;
}

/**
 * 逆滤波器 (提取声源信号)
 * 将信号通过逆滤波器，得到近似声门激励
 * @param signal 输入信号
 * @param lpc LPC结果
 * @returns 声源信号
 */
export function inverseFilter(signal: Float32Array, lpc: LPCResult): Float32Array {
  return computePredictionError(signal, lpc);
}

/**
 * LPC综合滤波器 (从声源和LPC系数重建信号)
 * @param excitation 激励信号
 * @param lpc LPC结果
 * @returns 重建信号
 */
export function lpcSynthesize(excitation: Float32Array, lpc: LPCResult): Float32Array {
  const output = new Float32Array(excitation.length);
  const a = lpc.coefficients;
  for (let n = 0; n < excitation.length; n++) {
    let sum = excitation[n];
    for (let i = 1; i <= lpc.order && n - i >= 0; i++) {
      sum -= a[i] * output[n - i];
    }
    output[n] = sum;
  }
  return output;
}

// ==================== 综合渲染器 ====================

/**
 * 自动选择最优合成策略
 * @param f0 基频
 * @param technique 演唱技巧
 * @returns 推荐策略
 */
export function selectOptimalStrategy(f0: number, technique: SingingTechnique[]): SynthesisStrategy {
  if (technique.includes('fry') || technique.includes('breathy')) {
    return 'physical';
  }
  if (technique.includes('falsetto') || f0 > 600) {
    return 'granular';
  }
  if (technique.includes('plosive') || technique.includes('fricative')) {
    return 'hybrid';
  }
  if (f0 > 400) {
    return 'granular';
  }
  return 'physical';
}

/**
 * 渲染单个音符事件
 * @param note 音符事件
 * @param config 渲染配置
 * @returns 音频缓冲区
 */
export function renderNoteEvent(note: NoteEvent, config: RenderConfig): Float32Array {
  const sampleRate = config.sampleRate;
  const length = Math.floor((note.duration + config.tailLength) * sampleRate);
  const f0 = note.frequency;
  const voice = note.voice;

  // 选择合成策略
  const strategy = selectOptimalStrategy(f0, voice.techniques);

  // 生成基频曲线 (含颤音和混沌抖动)
  const vibrato = generateVibratoCurve(length, sampleRate, voice.vibratoDepth, voice.vibratoRate);
  const jitter = generateChaoticF0Jitter(length, sampleRate, f0, 1.5, 'lorenz');
  const f0Curve = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    f0Curve[i] = f0 + vibrato[i] + (jitter[i] - f0) * 0.3;
  }

  // 获取元音参数
  const vowelSymbol = pinyinToVowel(note.lyric) || 'a';
  let vowel = queryFormantDatabase(config.gender, config.timbre, vowelSymbol) || MALE_VOWEL_A;

  // 应用性别转换
  if (voice.genderShift !== 1.0) {
    vowel = shiftGender(vowel, voice.genderShift);
  }

  let output: Float32Array;

  switch (strategy) {
    case 'physical': {
      output = physicalModelSynthesis(length, sampleRate, f0Curve[0], vowel, voice.breathiness);
      // 物理模型不支持逐采样变基频，这里用重采样近似
      break;
    }
    case 'granular': {
      output = granularCloudSynthesis(
        (note.duration + config.tailLength) / 2,
        sampleRate,
        f0,
        200,
        0.03,
        0.4
      );
      // 扩展为正确长度
      const stretched = new Float32Array(length);
      for (let i = 0; i < length; i++) {
        const srcIdx = Math.floor((i / length) * output.length);
        stretched[i] = output[srcIdx] ?? 0;
      }
      output = stretched;
      break;
    }
    case 'formant':
    case 'hybrid':
    default: {
      // 格式合成 + 噪声源
      output = new Float32Array(length);
      const source = new Float32Array(length);
      for (let i = 0; i < length; i++) {
        const period = sampleRate / Math.max(50, f0Curve[i]);
        const phase = (i % period) / period;
        let pulse = 0;
        if (phase < 0.04) pulse = 1.0 - phase / 0.04;
        else pulse = -0.1;
        const noise = (Math.random() * 2 - 1) * voice.breathiness;
        source[i] = pulse * (1 - voice.breathiness) + noise;
      }
      output = applyFormantFilter(source, vowel.formants, sampleRate);
      break;
    }
  }

  // 应用人声描述效果
  output = applyVoiceDescriptor(output, voice, sampleRate);

  // 应用力度包络
  const dynamic = voice.techniques.find((t) => DYNAMICS_MAP[t] !== undefined) || 'mf';
  const adsr = dynamicToADSR(dynamic);
  const envelope = generateADSREnvelope(length, sampleRate, adsr);
  for (let i = 0; i < length; i++) {
    output[i] *= envelope[i] * voice.velocity;
  }

  // 标准化
  normalizeBuffer(output);
  return output;
}

/**
 * 渲染整段音乐
 * @param notes 音符事件数组
 * @param config 渲染配置
 * @returns 完整音频Buffer
 */
export function renderPhrase(notes: NoteEvent[], config: RenderConfig): Float32Array {
  if (notes.length === 0) return new Float32Array(0);

  // 计算总时长
  let maxEnd = 0;
  for (const note of notes) {
    maxEnd = Math.max(maxEnd, note.startTime + note.duration + config.tailLength);
  }
  const totalSamples = Math.floor(maxEnd * config.sampleRate);
  const output = new Float32Array(totalSamples);

  for (const note of notes) {
    const noteBuffer = renderNoteEvent(note, config);
    const offset = Math.floor(note.startTime * config.sampleRate);
    for (let i = 0; i < noteBuffer.length && offset + i < totalSamples; i++) {
      output[offset + i] += noteBuffer[i];
    }
  }

  normalizeBuffer(output);
  return output;
}

/**
 * 简谱 + 歌词 综合渲染接口
 * @param jianpuStr 简谱字符串
 * @param lyrics 歌词数组 (每个元素对应一个音符)
 * @param config 渲染配置
 * @returns 音频Buffer
 */
export function renderFromJianpuAndLyrics(
  jianpuStr: string,
  lyrics: string[],
  config: RenderConfig
): Float32Array {
  const jianpuNotes = parseJianpuString(jianpuStr);
  const staffNotes = jianpuToStaffNotes(jianpuNotes, 120, 0);

  const notes: NoteEvent[] = [];
  let currentTime = 0;

  for (let i = 0; i < staffNotes.length; i++) {
    const sn = staffNotes[i];
    const lyric = lyrics[i] || 'a';
    notes.push({
      startTime: currentTime,
      duration: sn.duration,
      frequency: sn.frequency,
      midiNote: sn.midiNote,
      lyric,
      voice: {
        techniques: ['mf'],
        f0: sn.frequency,
        vibratoDepth: config.defaultVibratoDepth,
        vibratoRate: config.defaultVibratoRate,
        velocity: config.defaultVelocity,
        brightness: 0.5,
        breathiness: 0.05,
        genderShift: config.gender === 'female' ? 1.17 : config.gender === 'child' ? 1.35 : 1.0,
      },
    });
    currentTime += sn.duration;
  }

  return renderPhrase(notes, config);
}

/**
 * 默认渲染配置
 */
export function createDefaultRenderConfig(): RenderConfig {
  return {
    sampleRate: 44100,
    strategy: 'hybrid',
    gender: 'female',
    timbre: 'warm',
    defaultVelocity: 0.7,
    defaultVibratoDepth: 4.0,
    defaultVibratoRate: 5.5,
    portamentoRate: 8.0,
    tailLength: 0.15,
  };
}

// ==================== 工具函数与滤波器实现 ====================

/**
 * 一阶低通滤波器
 * @param buffer 输入
 * @param cutoff 截止频率
 * @param sampleRate 采样率
 * @returns 滤波后信号
 */
export function onePoleLowPass(buffer: Float32Array, cutoff: number, sampleRate: number): Float32Array {
  const result = new Float32Array(buffer.length);
  const rc = 1.0 / (2 * Math.PI * cutoff);
  const dt = 1.0 / sampleRate;
  const alpha = dt / (rc + dt);
  let y = buffer[0];
  for (let i = 0; i < buffer.length; i++) {
    y += alpha * (buffer[i] - y);
    result[i] = y;
  }
  return result;
}

/**
 * 一阶高通滤波器
 * @param buffer 输入
 * @param cutoff 截止频率
 * @param sampleRate 采样率
 * @returns 滤波后信号
 */
export function onePoleHighPass(buffer: Float32Array, cutoff: number, sampleRate: number): Float32Array {
  const result = new Float32Array(buffer.length);
  const rc = 1.0 / (2 * Math.PI * cutoff);
  const dt = 1.0 / sampleRate;
  const alpha = rc / (rc + dt);
  let y = 0;
  for (let i = 0; i < buffer.length; i++) {
    const x = buffer[i];
    y = alpha * (y + x - (i > 0 ? buffer[i - 1] : x));
    result[i] = y;
  }
  return result;
}

/**
 * 双二阶带通滤波器
 * @param buffer 输入
 * @param freq 中心频率
 * @param bw 带宽
 * @param sampleRate 采样率
 * @returns 滤波后信号
 */
export function biquadBandPass(
  buffer: Float32Array,
  freq: number,
  bw: number,
  sampleRate: number
): Float32Array {
  const result = new Float32Array(buffer.length);
  const omega = (2 * Math.PI * freq) / sampleRate;
  const sinOmega = Math.sin(omega);
  const cosOmega = Math.cos(omega);
  const alpha = sinOmega / (2 * (freq / bw));

  const b0 = alpha;
  const b1 = 0;
  const b2 = -alpha;
  const a0 = 1 + alpha;
  const a1 = -2 * cosOmega;
  const a2 = 1 - alpha;

  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < buffer.length; i++) {
    const x = buffer[i];
    const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x;
    y2 = y1; y1 = y;
    result[i] = y;
  }
  return result;
}

/**
 * 带通滤波器 (级联高低通)
 * @param buffer 输入
 * @param lowCut 低截止频率
 * @param highCut 高截止频率
 * @param sampleRate 采样率
 * @returns 滤波后信号
 */
export function bandPassFilter(
  buffer: Float32Array,
  lowCut: number,
  highCut: number,
  sampleRate: number
): Float32Array {
  const lp = onePoleLowPass(buffer, highCut, sampleRate);
  return onePoleHighPass(lp, lowCut, sampleRate);
}

/**
 * 应用共振峰滤波器 (5个级联带通)
 * @param source 声源信号
 * @param formants 5个共振峰参数
 * @param sampleRate 采样率
 * @returns 滤波后信号
 */
export function applyFormantFilter(
  source: Float32Array,
  formants: [FormantParam, FormantParam, FormantParam, FormantParam, FormantParam],
  sampleRate: number
): Float32Array {
  let result = new Float32Array(source);
  for (const f of formants) {
    const filtered = biquadBandPass(result, f.Fc, f.BW, sampleRate);
    for (let i = 0; i < result.length; i++) {
      result[i] = filtered[i] * f.amplitude;
    }
  }
  return result;
}

/**
 * 生成ADSR包络
 * @param length 采样点数
 * @param sampleRate 采样率
 * @param adsr ADSR参数
 * @returns 包络数组
 */
export function generateADSREnvelope(
  length: number,
  sampleRate: number,
  adsr: ADSRParams
): Float32Array {
  const env = new Float32Array(length);
  const attackSamples = Math.max(1, Math.floor(adsr.attack * sampleRate));
  const decaySamples = Math.max(1, Math.floor(adsr.decay * sampleRate));
  const releaseSamples = Math.max(1, Math.floor(adsr.release * sampleRate));
  const sustainStart = attackSamples + decaySamples;
  const releaseStart = Math.max(sustainStart, length - releaseSamples);

  for (let i = 0; i < length; i++) {
    if (i < attackSamples) {
      env[i] = i / attackSamples;
    } else if (i < sustainStart) {
      const t = (i - attackSamples) / decaySamples;
      env[i] = 1 - t * (1 - adsr.sustain);
    } else if (i < releaseStart) {
      env[i] = adsr.sustain;
    } else {
      const t = (i - releaseStart) / releaseSamples;
      env[i] = adsr.sustain * (1 - t);
    }
  }
  return env;
}

/**
 * 简单拼音到元音映射 (取第一个元音字符)
 * @param pinyin 拼音字符串
 * @returns 元音符号
 */
export function pinyinToVowel(pinyin: string): string {
  const vowels = ['a', 'o', 'e', 'i', 'u', 'ü', 'ih', 'ae', 'aa', 'uh'];
  const lower = pinyin.toLowerCase();
  for (const v of vowels) {
    if (lower.includes(v)) return v;
  }
  return 'a';
}

/**
 * 标准化音频缓冲区到[-1, 1]
 * @param buffer 音频缓冲区
 * @returns 峰值振幅
 */
export function normalizeBuffer(buffer: Float32Array): number {
  let maxAmp = 0;
  for (let i = 0; i < buffer.length; i++) {
    const abs = Math.abs(buffer[i]);
    if (abs > maxAmp) maxAmp = abs;
  }
  if (maxAmp > 1e-10 && maxAmp > 1.0) {
    const scale = 1.0 / maxAmp;
    for (let i = 0; i < buffer.length; i++) {
      buffer[i] *= scale;
    }
  }
  return maxAmp;
}

/**
 * 音频缓冲区叠加
 * @param target 目标缓冲区
 * @param source 源缓冲区
 * @param offset 偏移量
 */
export function addToBuffer(target: Float32Array, source: Float32Array, offset: number): void {
  const start = Math.max(0, offset);
  const end = Math.min(target.length, offset + source.length);
  for (let i = start; i < end; i++) {
    target[i] += source[i - offset];
  }
}

/**
 * 线性插值
 * @param a 起始值
 * @param b 结束值
 * @param t 插值系数
 * @returns 插值结果
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * 平滑步插值
 * @param a 起始值
 * @param b 结束值
 * @param t 插值系数
 * @returns 平滑插值结果
 */
export function smoothstep(a: number, b: number, t: number): number {
  const x = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
}

/**
 * 半音转频率比
 * @param semitones 半音数
 * @returns 频率倍率
 */
export function semitoneToRatio(semitones: number): number {
  return Math.pow(SEMITONE_RATIO, semitones);
}

// ==================== 主合成引擎类 ====================

/**
 * 真人级别人声合成主引擎
 * 整合所有模块，提供高层API
 */
export class RealisticVoiceEngine {
  private config: RenderConfig;
  private sampleRate: number;

  constructor(config?: Partial<RenderConfig>) {
    this.config = { ...createDefaultRenderConfig(), ...config };
    this.sampleRate = this.config.sampleRate;
  }

  /**
   * 更新配置
   * @param partial 部分配置
   */
  updateConfig(partial: Partial<RenderConfig>): void {
    this.config = { ...this.config, ...partial };
    this.sampleRate = this.config.sampleRate;
  }

  /**
   * 获取当前配置
   */
  getConfig(): RenderConfig {
    return { ...this.config };
  }

  /**
   * 合成单音符
   * @param freq 频率 (Hz)
   * @param duration 时长 (秒)
   * @param lyric 歌词/元音
   * @param voice 人声描述 (可选)
   * @returns 音频缓冲区
   */
  synthesizeNote(
    freq: number,
    duration: number,
    lyric: string,
    voice?: Partial<VoiceDescriptor>
  ): Float32Array {
    const fullVoice: VoiceDescriptor = {
      techniques: ['mf'],
      f0: freq,
      vibratoDepth: this.config.defaultVibratoDepth,
      vibratoRate: this.config.defaultVibratoRate,
      velocity: this.config.defaultVelocity,
      brightness: 0.5,
      breathiness: 0.05,
      genderShift: this.config.gender === 'female' ? 1.17 : this.config.gender === 'child' ? 1.35 : 1.0,
      ...voice,
    };

    const note: NoteEvent = {
      startTime: 0,
      duration,
      frequency: freq,
      midiNote: Math.round(frequencyToMidi(freq)),
      lyric,
      voice: fullVoice,
    };

    return renderNoteEvent(note, this.config);
  }

  /**
   * 合成整句
   * @param notes 音符事件数组
   * @returns 音频缓冲区
   */
  synthesizePhrase(notes: NoteEvent[]): Float32Array {
    return renderPhrase(notes, this.config);
  }

  /**
   * 从简谱和歌词合成
   * @param jianpu 简谱字符串
   * @param lyrics 歌词数组
   * @returns 音频缓冲区
   */
  synthesizeFromJianpu(jianpu: string, lyrics: string[]): Float32Array {
    return renderFromJianpuAndLyrics(jianpu, lyrics, this.config);
  }

  /**
   * 从五线谱音符合成
   * @param noteNames 音符名数组 (如 ["C4", "D4", "E4"])
   * @param durations 时长数组 (秒)
   * @param lyrics 歌词数组
   * @returns 音频缓冲区
   */
  synthesizeFromStaff(
    noteNames: string[],
    durations: number[],
    lyrics: string[]
  ): Float32Array {
    const notes: NoteEvent[] = [];
    let currentTime = 0;
    for (let i = 0; i < noteNames.length; i++) {
      const freq = staffNoteToFrequency(noteNames[i]);
      const midi = Math.round(frequencyToMidi(freq));
      notes.push({
        startTime: currentTime,
        duration: durations[i] || 1,
        frequency: freq,
        midiNote: midi,
        lyric: lyrics[i] || 'a',
        voice: {
          techniques: ['mf'],
          f0: freq,
          vibratoDepth: this.config.defaultVibratoDepth,
          vibratoRate: this.config.defaultVibratoRate,
          velocity: this.config.defaultVelocity,
          brightness: 0.5,
          breathiness: 0.05,
          genderShift: this.config.gender === 'female' ? 1.17 : this.config.gender === 'child' ? 1.35 : 1.0,
        },
      });
      currentTime += durations[i] || 1;
    }
    return renderPhrase(notes, this.config);
  }

  /**
   * 中国民族调式旋律合成
   * @param rootNote 宫音 (如 "C4")
   * @param mode 调式
   * @param rhythm 节奏型 (简谱数字串)
   * @param lyrics 歌词
   * @returns 音频缓冲区
   */
  synthesizeChineseMode(
    rootNote: string,
    mode: ChineseMode,
    rhythm: string,
    lyrics: string[]
  ): Float32Array {
    const freqs = chineseModeFrequencies(rootNote, mode, 2);
    const jianpuNotes = parseJianpuString(rhythm);
    const durations = jianpuNotes.map((jn) => jianpuToStaffNotes([jn], 120, 0)[0]?.duration || 0.5);

    const notes: NoteEvent[] = [];
    let currentTime = 0;
    for (let i = 0; i < jianpuNotes.length && i < lyrics.length; i++) {
      const digit = jianpuNotes[i].digit;
      if (digit === 0) {
        currentTime += durations[i];
        continue;
      }
      const freqIdx = (digit - 1) % freqs.length;
      const freq = freqs[freqIdx];
      notes.push({
        startTime: currentTime,
        duration: durations[i],
        frequency: freq,
        midiNote: Math.round(frequencyToMidi(freq)),
        lyric: lyrics[i] || 'a',
        voice: {
          techniques: ['mf'],
          f0: freq,
          vibratoDepth: this.config.defaultVibratoDepth,
          vibratoRate: this.config.defaultVibratoRate,
          velocity: this.config.defaultVelocity,
          brightness: 0.5,
          breathiness: 0.05,
          genderShift: this.config.gender === 'female' ? 1.17 : this.config.gender === 'child' ? 1.35 : 1.0,
        },
      });
      currentTime += durations[i];
    }
    return renderPhrase(notes, this.config);
  }

  /**
   * 粒子云合成接口
   * @param duration 时长 (秒)
   * @param basePitch 基础音高
   * @param density 粒子密度
   * @param grainDuration 粒子时长
   * @returns 音频缓冲区
   */
  synthesizeGrainCloud(
    duration: number,
    basePitch: number,
    density = 200,
    grainDuration = 0.03
  ): Float32Array {
    return granularCloudSynthesis(duration, this.sampleRate, basePitch, density, grainDuration, 0.4);
  }

  /**
   * LPC分析接口
   * @param signal 输入信号
   * @param order 阶数
   * @returns LPC分析结果
   */
  analyzeLPC(signal: Float32Array, order = 12): LPCResult {
    return levinsonDurbin(signal, order);
  }

  /**
   * 从信号提取共振峰
   * @param signal 输入信号
   * @returns 共振峰列表
   */
  extractFormants(signal: Float32Array): Array<{ frequency: number; bandwidth: number }> {
    const lpc = this.analyzeLPC(signal, 14);
    return extractFormantsFromLPC(lpc, this.sampleRate);
  }

  /**
   * 获取共振峰数据库条目
   * @param gender 性别
   * @param timbre 音色
   * @returns 数据库条目
   */
  getFormantEntry(gender: Gender, timbre: TimbreColor): FormantDatabaseEntry | null {
    return FORMANT_DATABASE.find((e) => e.gender === gender && e.timbre === timbre) || null;
  }

  /**
   * 重置引擎状态
   */
  reset(): void {
    // 当前为无状态设计，保留接口用于未来扩展
  }
}

// ==================== 便捷函数与扩展 ====================

/**
 * 快速合成单音 (便捷函数)
 * @param freq 频率
 * @param duration 时长
 * @param vowel 元音
 * @param config 可选配置
 * @returns 音频缓冲区
 */
export function quickSynthesize(
  freq: number,
  duration: number,
  vowel = 'a',
  config?: Partial<RenderConfig>
): Float32Array {
  const engine = new RealisticVoiceEngine(config);
  return engine.synthesizeNote(freq, duration, vowel);
}

/**
 * 快速分析LPC (便捷函数)
 * @param signal 输入信号
 * @param sampleRate 采样率
 * @param order 阶数
 * @returns LPC结果
 */
export function quickLPC(signal: Float32Array, sampleRate: number, order = 12): LPCResult {
  return levinsonDurbin(signal, order);
}

/**
 * 生成粉红噪声 (Voss-McCartney算法近似)
 * @param length 长度
 * @param amplitude 振幅
 * @returns 粉红噪声
 */
export function generatePinkNoise(length: number, amplitude: number): Float32Array {
  const buffer = new Float32Array(length);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.96900 * b2 + white * 0.1538520;
    b3 = 0.86650 * b3 + white * 0.3104856;
    b4 = 0.55000 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.0168980;
    const pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
    b6 = white * 0.115926;
    buffer[i] = pink * amplitude;
  }
  return buffer;
}

/**
 * 白噪声生成
 * @param length 长度
 * @param amplitude 振幅
 * @returns 白噪声
 */
export function generateWhiteNoise(length: number, amplitude: number): Float32Array {
  const buffer = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    buffer[i] = (Math.random() * 2 - 1) * amplitude;
  }
  return buffer;
}

/**
 * 快速傅里叶变换 (Cooley-Tukey)
 * @param real 实部
 * @param imag 虚部
 * @param invert 是否逆变换
 */
export function fft(real: Float32Array, imag: Float32Array, invert: boolean): void {
  const n = real.length;
  if (n !== imag.length) throw new Error('Length mismatch');
  if ((n & (n - 1)) !== 0) throw new Error('FFT size must be power of 2');

  let j = 0;
  for (let i = 1; i < n; i++) {
    let bit = n >> 1;
    while (j >= bit) {
      j -= bit;
      bit >>= 1;
    }
    j += bit;
    if (i < j) {
      let temp = real[i]; real[i] = real[j]; real[j] = temp;
      temp = imag[i]; imag[i] = imag[j]; imag[j] = temp;
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const ang = (2 * Math.PI) / len * (invert ? -1 : 1);
    const wlenR = Math.cos(ang);
    const wlenI = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wR = 1, wI = 0;
      for (let k = 0; k < len / 2; k++) {
        const uR = real[i + k];
        const uI = imag[i + k];
        const vR = real[i + k + len / 2] * wR - imag[i + k + len / 2] * wI;
        const vI = real[i + k + len / 2] * wI + imag[i + k + len / 2] * wR;
        real[i + k] = uR + vR;
        imag[i + k] = uI + vI;
        real[i + k + len / 2] = uR - vR;
        imag[i + k + len / 2] = uI - vI;
        const nextWR = wR * wlenR - wI * wlenI;
        wI = wR * wlenI + wI * wlenR;
        wR = nextWR;
      }
    }
  }

  if (invert) {
    for (let i = 0; i < n; i++) {
      real[i] /= n;
      imag[i] /= n;
    }
  }
}

/**
 * 计算频谱幅度
 * @param signal 输入信号
 * @param fftSize FFT大小
 * @returns 幅度谱
 */
export function computeMagnitudeSpectrum(signal: Float32Array, fftSize: number): Float32Array {
  const real = new Float32Array(fftSize);
  const imag = new Float32Array(fftSize);
  real.set(signal.subarray(0, Math.min(signal.length, fftSize)));
  fft(real, imag, false);
  const half = fftSize / 2 + 1;
  const mag = new Float32Array(half);
  for (let i = 0; i < half; i++) {
    mag[i] = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
  }
  return mag;
}

/**
 * WAV导出选项
 */
export interface WavExportOptions {
  sampleRate: number;
  channels: number;
  bitDepth: 16 | 24 | 32;
}

/**
 * Float32Array转Int16Array
 * @param floatBuffer 浮点缓冲
 * @returns Int16Array
 */
export function floatToInt16(floatBuffer: Float32Array): Int16Array {
  const intBuffer = new Int16Array(floatBuffer.length);
  for (let i = 0; i < floatBuffer.length; i++) {
    const val = Math.max(-1, Math.min(1, floatBuffer[i]));
    intBuffer[i] = val < 0 ? val * 0x8000 : val * 0x7FFF;
  }
  return intBuffer;
}

/**
 * WAV文件生成器
 */
export class WavExporter {
  /**
   * 生成标准RIFF WAV
   * @param audioData 音频数据
   * @param options 选项
   * @returns WAV Uint8Array
   */
  static export(audioData: Float32Array, options: WavExportOptions): Uint8Array {
    const { sampleRate, channels, bitDepth } = options;
    let pcmData: ArrayBufferLike;
    let dataLength: number;

    if (bitDepth === 16) {
      const int16 = floatToInt16(audioData);
      pcmData = int16.buffer;
      dataLength = int16.length * 2;
    } else {
      pcmData = audioData.buffer.slice(audioData.byteOffset, audioData.byteOffset + audioData.byteLength);
      dataLength = audioData.length * 4;
    }

    const headerSize = bitDepth === 32 ? 46 : 44;
    const totalSize = headerSize + dataLength;
    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);

    const writeString = (offset: number, str: string): void => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, totalSize - 8, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, bitDepth === 32 ? 18 : 16, true);
    view.setUint16(20, bitDepth === 32 ? 3 : 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * channels * (bitDepth / 8), true);
    view.setUint16(32, channels * (bitDepth / 8), true);
    view.setUint16(34, bitDepth, true);

    if (bitDepth === 32) {
      view.setUint16(36, 0, true);
      writeString(38, 'data');
      view.setUint32(42, dataLength, true);
      const pcmView = new Uint8Array(pcmData);
      const outView = new Uint8Array(buffer, 46, dataLength);
      outView.set(pcmView);
    } else {
      writeString(36, 'data');
      view.setUint32(40, dataLength, true);
      const pcmView = new Uint8Array(pcmData);
      const outView = new Uint8Array(buffer, 44, dataLength);
      outView.set(pcmView);
    }

    return new Uint8Array(buffer);
  }

  /**
   * 生成Blob
   * @param audioData 音频数据
   * @param options 选项
   * @returns Blob
   */
  static exportBlob(audioData: Float32Array, options: WavExportOptions): Blob {
    const wavArray = WavExporter.export(audioData, options);
    return new Blob([wavArray as unknown as ArrayBuffer], { type: 'audio/wav' });
  }
}

// ==================== 扩展功能与补充实现 ====================

/**
 * 多段压缩器 (用于人声动态控制)
 * @param buffer 输入信号
 * @param threshold 阈值 (dB)
 * @param ratio 压缩比
 * @param attack 起音时间 (秒)
 * @param release 释音时间 (秒)
 * @param sampleRate 采样率
 * @returns 压缩后的信号
 */
export function compressor(
  buffer: Float32Array,
  threshold: number,
  ratio: number,
  attack: number,
  release: number,
  sampleRate: number
): Float32Array {
  const result = new Float32Array(buffer.length);
  const attackCoeff = Math.exp(-1 / (attack * sampleRate));
  const releaseCoeff = Math.exp(-1 / (release * sampleRate));
  let envelope = 0;
  const thresholdLinear = Math.pow(10, threshold / 20);

  for (let i = 0; i < buffer.length; i++) {
    const input = Math.abs(buffer[i]);
    // 包络检测
    if (input > envelope) {
      envelope = attackCoeff * envelope + (1 - attackCoeff) * input;
    } else {
      envelope = releaseCoeff * envelope + (1 - releaseCoeff) * input;
    }

    // 增益计算
    let gain = 1.0;
    if (envelope > thresholdLinear) {
      const dbOver = Math.log10(envelope / thresholdLinear) * 20;
      const dbGain = -dbOver * (1 - 1 / ratio);
      gain = Math.pow(10, dbGain / 20);
    }
    result[i] = buffer[i] * gain;
  }
  return result;
}

/**
 * 均衡器：提升或削减特定频段
 * @param buffer 输入信号
 * @param freq 中心频率
 * @param gainDb 增益 (dB)
 * @param q Q值
 * @param sampleRate 采样率
 * @returns 均衡后的信号
 */
export function peakingEQ(
  buffer: Float32Array,
  freq: number,
  gainDb: number,
  q: number,
  sampleRate: number
): Float32Array {
  const result = new Float32Array(buffer.length);
  const A = Math.pow(10, gainDb / 40);
  const omega = (2 * Math.PI * freq) / sampleRate;
  const sinOmega = Math.sin(omega);
  const cosOmega = Math.cos(omega);
  const alpha = sinOmega / (2 * q);

  const b0 = 1 + alpha * A;
  const b1 = -2 * cosOmega;
  const b2 = 1 - alpha * A;
  const a0 = 1 + alpha / A;
  const a1 = -2 * cosOmega;
  const a2 = 1 - alpha / A;

  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < buffer.length; i++) {
    const x = buffer[i];
    const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x;
    y2 = y1; y1 = y;
    result[i] = y;
  }
  return result;
}

/**
 * 混响效果 (简化 Schroeder 模型)
 * @param buffer 输入信号
 * @param decay 衰减时间 (秒)
 * @param sampleRate 采样率
 * @returns 带混响的信号
 */
export function simpleReverb(
  buffer: Float32Array,
  decay: number,
  sampleRate: number
): Float32Array {
  const combDelay1 = Math.floor(0.0297 * sampleRate);
  const combDelay2 = Math.floor(0.0371 * sampleRate);
  const allPassDelay = Math.floor(0.005 * sampleRate);
  const g = Math.pow(0.001, 1 / (decay * sampleRate));

  const comb1 = new Float32Array(buffer.length);
  const comb2 = new Float32Array(buffer.length);

  // 梳状滤波器
  for (let i = 0; i < buffer.length; i++) {
    const input = buffer[i];
    comb1[i] = input + (i >= combDelay1 ? comb1[i - combDelay1] * g : 0);
    comb2[i] = input + (i >= combDelay2 ? comb2[i - combDelay2] * g : 0);
  }

  // 全通滤波器
  const result = new Float32Array(buffer.length);
  let apBuffer = 0;
  for (let i = 0; i < buffer.length; i++) {
    const combSum = (comb1[i] + comb2[i]) * 0.5;
    const feedforward = combSum;
    const feedback = apBuffer * 0.7;
    result[i] = feedback + feedforward;
    apBuffer = feedforward - feedback;
  }

  // 混合干湿信号
  for (let i = 0; i < buffer.length; i++) {
    result[i] = buffer[i] * 0.6 + result[i] * 0.4;
  }
  return result;
}

/**
 * 齿音消除器 (De-esser)
 * @param buffer 输入信号
 * @param threshold 阈值
 * @param sampleRate 采样率
 * @returns 处理后的信号
 */
export function deesser(buffer: Float32Array, threshold: number, sampleRate: number): Float32Array {
  // 检测5kHz-10kHz频段能量
  const highPass = onePoleHighPass(buffer, 5000, sampleRate);
  const result = new Float32Array(buffer.length);
  for (let i = 0; i < buffer.length; i++) {
    const sibilant = Math.abs(highPass[i]);
    const reduction = sibilant > threshold ? threshold / sibilant : 1.0;
    result[i] = buffer[i] * (0.5 + reduction * 0.5);
  }
  return result;
}

/**
 * 立体声展宽 (伪立体声)
 * @param mono 单声道输入
 * @param width 宽度 (0-1)
 * @returns 左右声道 [L, R]
 */
export function pseudoStereo(mono: Float32Array, width: number): [Float32Array, Float32Array] {
  const left = new Float32Array(mono.length);
  const right = new Float32Array(mono.length);
  const delaySamples = 15;
  for (let i = 0; i < mono.length; i++) {
    const delayed = i >= delaySamples ? mono[i - delaySamples] : 0;
    left[i] = mono[i] + delayed * width * 0.5;
    right[i] = mono[i] - delayed * width * 0.5;
  }
  return [left, right];
}

/**
 * 基频平滑处理 (中值滤波)
 * @param f0Sequence 基频序列
 * @param windowSize 窗口大小
 * @returns 平滑后的基频序列
 */
export function medianSmoothF0(f0Sequence: Float32Array, windowSize: number): Float32Array {
  const result = new Float32Array(f0Sequence.length);
  const half = Math.floor(windowSize / 2);
  for (let i = 0; i < f0Sequence.length; i++) {
    const window: number[] = [];
    for (let j = -half; j <= half; j++) {
      const idx = i + j;
      if (idx >= 0 && idx < f0Sequence.length && f0Sequence[idx] > 0) {
        window.push(f0Sequence[idx]);
      }
    }
    if (window.length > 0) {
      window.sort((a, b) => a - b);
      result[i] = window[Math.floor(window.length / 2)];
    } else {
      result[i] = f0Sequence[i];
    }
  }
  return result;
}

/**
 * 共振峰跟踪 (简化版)
 * 随时间变化的共振峰插值
 * @param fromVowel 起始元音
 * @param toVowel 目标元音
 * @param duration 时长 (秒)
 * @param sampleRate 采样率
 * @returns 每采样点的共振峰参数
 */
export function trackFormantTransition(
  fromVowel: VowelFormants,
  toVowel: VowelFormants,
  duration: number,
  sampleRate: number
): VowelFormants[] {
  const samples = Math.floor(duration * sampleRate);
  const frames: VowelFormants[] = [];
  const frameInterval = Math.floor(sampleRate / 100); // 100fps
  const numFrames = Math.ceil(samples / frameInterval);

  for (let f = 0; f < numFrames; f++) {
    const t = f / numFrames;
    frames.push(interpolateFormants(fromVowel, toVowel, t));
  }
  return frames;
}

/**
 * 生成和声
 * @param fundamental 基频
 * @param harmonics 谐波数量
 * @param amplitudes 谐波振幅数组
 * @param duration 时长
 * @param sampleRate 采样率
 * @returns 和声音频
 */
export function generateHarmonics(
  fundamental: number,
  harmonics: number,
  amplitudes: number[],
  duration: number,
  sampleRate: number
): Float32Array {
  const length = Math.floor(duration * sampleRate);
  const buffer = new Float32Array(length);
  for (let h = 1; h <= harmonics; h++) {
    const freq = fundamental * h;
    if (freq > sampleRate / 2) break;
    const amp = amplitudes[h - 1] ?? (1 / h);
    const phaseInc = (2 * Math.PI * freq) / sampleRate;
    let phase = 0;
    for (let i = 0; i < length; i++) {
      buffer[i] += Math.sin(phase) * amp;
      phase += phaseInc;
    }
  }
  return buffer;
}

/**
 * 声码器效果 (简化版)
 * @param modulator 调制信号 (人声)
 * @param carrier 载波信号 (合成器)
 * @param bands 频段数量
 * @param sampleRate 采样率
 * @returns 声码器输出
 */
export function vocoder(
  modulator: Float32Array,
  carrier: Float32Array,
  bands: number,
  sampleRate: number
): Float32Array {
  const result = new Float32Array(modulator.length);
  const minFreq = 100;
  const maxFreq = 8000;
  const logMin = Math.log2(minFreq);
  const logMax = Math.log2(maxFreq);

  for (let b = 0; b < bands; b++) {
    const t0 = b / bands;
    const t1 = (b + 1) / bands;
    const f0 = Math.pow(2, logMin + (logMax - logMin) * t0);
    const f1 = Math.pow(2, logMin + (logMax - logMin) * t1);

    // 提取调制包络
    const modBand = bandPassFilter(modulator, f0, f1, sampleRate);
    const env = new Float32Array(modulator.length);
    let e = 0;
    for (let i = 0; i < modulator.length; i++) {
      e = 0.95 * e + 0.05 * Math.abs(modBand[i]);
      env[i] = e;
    }

    // 载波通过同一频段
    const carBand = bandPassFilter(carrier, f0, f1, sampleRate);
    for (let i = 0; i < modulator.length; i++) {
      result[i] += carBand[i] * env[i] * 4;
    }
  }

  normalizeBuffer(result);
  return result;
}

/**
 * 时间拉伸 (相位声码器简化版)
 * @param input 输入信号
 * @param factor 拉伸倍数 (>1变慢)
 * @param sampleRate 采样率
 * @returns 拉伸后的信号
 */
export function timeStretch(input: Float32Array, factor: number, sampleRate: number): Float32Array {
  const windowSize = 2048;
  const hopSize = 512;
  const outputHop = Math.floor(hopSize * factor);
  const outputLength = Math.floor(input.length * factor);
  const output = new Float32Array(outputLength);
  const windowSum = new Float32Array(outputLength);
  const window = new Float32Array(windowSize);

  for (let i = 0; i < windowSize; i++) {
    window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (windowSize - 1)));
  }

  const numFrames = Math.floor((input.length - windowSize) / hopSize) + 1;
  for (let f = 0; f < numFrames; f++) {
    const inStart = f * hopSize;
    const outStart = f * outputHop;
    for (let i = 0; i < windowSize && outStart + i < outputLength; i++) {
      output[outStart + i] += input[inStart + i] * window[i];
      windowSum[outStart + i] += window[i];
    }
  }

  for (let i = 0; i < outputLength; i++) {
    if (windowSum[i] > 0.001) output[i] /= windowSum[i];
  }
  return output;
}

/**
 * 音高偏移 (不改变时长)
 * @param input 输入信号
 * @param semitones 半音偏移
 * @param sampleRate 采样率
 * @returns 音高偏移后的信号
 */
export function pitchShift(input: Float32Array, semitones: number, sampleRate: number): Float32Array {
  const ratio = semitoneToRatio(semitones);
  const resampled = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < resampled.length; i++) {
    const pos = i * ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const s0 = input[idx] || 0;
    const s1 = input[idx + 1] || 0;
    resampled[i] = s0 + frac * (s1 - s0);
  }
  return timeStretch(resampled, 1 / ratio, sampleRate);
}

/**
 * 自动调音 (Auto-Tune简化版)
 * @param buffer 输入信号
 * @param f0Sequence 基频序列
 * @param sampleRate 采样率
 * @param strength 调音强度 (0-1)
 * @returns 调音后的信号
 */
export function autoTune(
  buffer: Float32Array,
  f0Sequence: Float32Array,
  sampleRate: number,
  strength: number
): Float32Array {
  // 简化为基于重采样的音高校正
  const result = new Float32Array(buffer.length);
  const noteNames = [261.63, 277.18, 293.66, 311.13, 329.63, 349.23, 369.99, 392.00, 415.30, 440.00, 466.16, 493.88];
  let idx = 0;
  const hopSize = 256;

  for (let i = 0; i < buffer.length; i++) {
    if (i % hopSize === 0) {
      const frameIdx = Math.floor(i / hopSize);
      if (frameIdx < f0Sequence.length) {
        const f0 = f0Sequence[frameIdx];
        if (f0 > 0) {
          // 找到最近的音符
          let closest = noteNames[0];
          let minDiff = Infinity;
          for (const n of noteNames) {
            // 八度归一化比较
            const ratio = f0 / n;
            const octaves = Math.log2(ratio);
            const normalizedDiff = Math.abs(octaves - Math.round(octaves));
            if (normalizedDiff < minDiff) {
              minDiff = normalizedDiff;
              closest = n * Math.pow(2, Math.round(octaves));
            }
          }
          const targetRatio = closest / f0;
          const currentRatio = 1 + (targetRatio - 1) * strength;
          // 应用微小重采样偏移 (简化)
          idx += currentRatio;
        } else {
          idx += 1;
        }
      }
    }
    const srcIdx = Math.floor(idx) % buffer.length;
    result[i] = buffer[srcIdx] || 0;
  }
  return result;
}

/**
 * 批量共振峰查询
 * @param gender 性别
 * @param timbre 音色
 * @returns 所有元音参数
 */
export function getAllVowelsForVoice(
  gender: Gender,
  timbre: TimbreColor
): Record<string, VowelFormants> | null {
  const entry = FORMANT_DATABASE.find((e) => e.gender === gender && e.timbre === timbre);
  return entry ? entry.vowels : null;
}

/**
 * 比较两个元音的声学距离
 * @param v1 元音1
 * @param v2 元音2
 * @returns 欧氏距离 (标准化)
 */
export function vowelAcousticDistance(v1: VowelFormants, v2: VowelFormants): number {
  let sum = 0;
  for (let i = 0; i < 5; i++) {
    const f1 = v1.formants[i].Fc;
    const f2 = v2.formants[i].Fc;
    const logDiff = Math.log2(f1 / f2);
    sum += logDiff * logDiff;
  }
  return Math.sqrt(sum);
}

/**
 * 共振峰可视化数据生成
 * @param vowel 元音参数
 * @param sampleRate 采样率
 * @param fftSize FFT大小
 * @returns 频谱包络数组 (dB)
 */
export function formantSpectrumEnvelope(
  vowel: VowelFormants,
  sampleRate: number,
  fftSize = 512
): Float32Array {
  const half = fftSize / 2 + 1;
  const envelope = new Float32Array(half);
  for (let k = 0; k < half; k++) {
    const freq = (k * sampleRate) / fftSize;
    let mag = 1e-10;
    for (const f of vowel.formants) {
      // 每个共振峰贡献一个洛伦兹形状
      const bw = f.BW;
      const peak = f.amplitude * (bw / 2) / (Math.pow(freq - f.Fc, 2) + Math.pow(bw / 2, 2));
      mag += peak;
    }
    envelope[k] = 20 * Math.log10(mag);
  }
  return envelope;
}

/**
 * 生成测试扫频信号
 * @param duration 时长
 * @param startFreq 起始频率
 * @param endFreq 结束频率
 * @param sampleRate 采样率
 * @returns 扫频信号
 */
export function generateSweep(
  duration: number,
  startFreq: number,
  endFreq: number,
  sampleRate: number
): Float32Array {
  const length = Math.floor(duration * sampleRate);
  const buffer = new Float32Array(length);
  let phase = 0;
  for (let i = 0; i < length; i++) {
    const t = i / length;
    const logFreq = Math.log2(startFreq) + (Math.log2(endFreq) - Math.log2(startFreq)) * t;
    const freq = Math.pow(2, logFreq);
    phase += (2 * Math.PI * freq) / sampleRate;
    buffer[i] = Math.sin(phase);
  }
  return buffer;
}

/**
 * 音频特征提取：过零率
 * @param buffer 音频信号
 * @returns 过零率
 */
export function zeroCrossingRate(buffer: Float32Array): number {
  let crossings = 0;
  for (let i = 1; i < buffer.length; i++) {
    if ((buffer[i] >= 0) !== (buffer[i - 1] >= 0)) crossings++;
  }
  return crossings / buffer.length;
}

/**
 * 音频特征提取：RMS能量
 * @param buffer 音频信号
 * @returns RMS值
 */
export function rmsEnergy(buffer: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) {
    sum += buffer[i] * buffer[i];
  }
  return Math.sqrt(sum / buffer.length);
}

/**
 * 音频特征提取：频谱质心
 * @param magnitude 幅度谱
 * @param sampleRate 采样率
 * @returns 频谱质心 (Hz)
 */
export function spectralCentroid(magnitude: Float32Array, sampleRate: number): number {
  let weightedSum = 0;
  let sum = 0;
  for (let i = 0; i < magnitude.length; i++) {
    const freq = (i * sampleRate) / (magnitude.length * 2);
    weightedSum += freq * magnitude[i];
    sum += magnitude[i];
  }
  return sum > 0 ? weightedSum / sum : 0;
}

/**
 * 创建汉宁窗
 * @param size 窗大小
 * @returns 窗函数
 */
export function createHannWindow(size: number): Float32Array {
  const window = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
  }
  return window;
}

/**
 * 创建汉明窗
 * @param size 窗大小
 * @returns 窗函数
 */
export function createHammingWindow(size: number): Float32Array {
  const window = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    window[i] = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (size - 1));
  }
  return window;
}

/**
 * 音频切片与重组 (用于实验性效果)
 * @param buffer 输入信号
 * @param sliceSize 切片大小
 * @param rearrangeFn 重排函数
 * @returns 重组后的信号
 */
export function sliceAndRearrange(
  buffer: Float32Array,
  sliceSize: number,
  rearrangeFn: (indices: number[]) => number[]
): Float32Array {
  const numSlices = Math.ceil(buffer.length / sliceSize);
  const indices: number[] = [];
  for (let i = 0; i < numSlices; i++) indices.push(i);
  const newIndices = rearrangeFn(indices);
  const result = new Float32Array(buffer.length);

  for (let i = 0; i < newIndices.length; i++) {
    const srcIdx = newIndices[i] * sliceSize;
    const dstIdx = i * sliceSize;
    for (let j = 0; j < sliceSize && srcIdx + j < buffer.length && dstIdx + j < result.length; j++) {
      result[dstIdx + j] = buffer[srcIdx + j];
    }
  }
  return result;
}

// ==================== 默认导出 ====================

export default RealisticVoiceEngine;
