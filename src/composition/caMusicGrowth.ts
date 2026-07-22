/**
 * =============================================================================
 * 细胞自动机音乐生长引擎 (CA Music Growth Engine)
 * =============================================================================
 * 将音符视为活细胞，在二维网格（音高×时间）上按规则演化。
 * 每个细胞经历 empty → growing → mature → decaying → dead → empty 的生命周期。
 * 演化规则融合音乐理论：音阶和谐、和弦进行、节奏律动、旋律连续性。
 * 纯 TypeScript 实现，零外部依赖，ESM 模块。
 * @author AI Composer Engine
 * @version 1.0.0
 * =============================================================================
 */

const SAMPLE_RATE = 44100;
const TWO_PI = Math.PI * 2;

// ==================== 核心类型定义 ====================

/** 细胞生命周期状态 */
export type CellState = 'empty' | 'growing' | 'mature' | 'decaying' | 'dead';

/** 音乐细胞 */
export interface MusicCell {
  /** 音高轴（映射到 MIDI） */
  row: number;
  /** 时间轴（映射到拍子） */
  col: number;
  /** 生命周期状态 */
  state: CellState;
  /** 在当前状态的年龄（代数） */
  age: number;
  /** 生命力 0-1 */
  energy: number;
  /** 音高 */
  midiNote: number;
  /** 力度 0-1 */
  velocity: number;
  /** 已持续时长 */
  duration: number;
}

/** 生长规则接口 */
export interface GrowthRule {
  /** 规则名称 */
  name: string;
  /**
   * 对单个细胞应用规则
   * @returns 新状态，或 null 表示状态不变
   */
  apply(cell: MusicCell, neighbors: MusicCell[], context: GridContext): CellState | null;
}

/** 网格上下文 */
export interface GridContext {
  /** 每分钟拍数 */
  bpm: number;
  /** 音阶半音偏移数组 */
  scale: number[];
  /** 调性根音 MIDI */
  keyRoot: number;
  /** 当前和弦的 MIDI 音高数组 */
  currentChord: number[];
  /** 当前小节索引（从 0 开始） */
  bar: number;
  /** 当前拍子索引（0-3） */
  beat: number;
}

/** 和弦定义 */
interface ChordDef {
  name: string;
  intervals: number[];
}

// ==================== 和弦知识库 ====================

/** 常用和弦模板（半音间隔） */
const CHORD_TEMPLATES: Record<string, ChordDef> = {
  major: { name: 'major', intervals: [0, 4, 7] },
  minor: { name: 'minor', intervals: [0, 3, 7] },
  maj7: { name: 'maj7', intervals: [0, 4, 7, 11] },
  min7: { name: 'min7', intervals: [0, 3, 7, 10] },
  dom7: { name: 'dom7', intervals: [0, 4, 7, 10] },
  dim: { name: 'dim', intervals: [0, 3, 6] },
  aug: { name: 'aug', intervals: [0, 4, 8] },
  sus2: { name: 'sus2', intervals: [0, 2, 7] },
  sus4: { name: 'sus4', intervals: [0, 5, 7] },
};

/** 经典和弦进行（调内级数对应的和弦类型） */
const PROGRESSIONS: Array<Array<{ degree: number; quality: string }>> = [
  // I – V – vi – IV（流行）
  [
    { degree: 0, quality: 'major' },
    { degree: 7, quality: 'major' },
    { degree: 9, quality: 'minor' },
    { degree: 5, quality: 'major' },
  ],
  // ii – V – I（爵士）
  [
    { degree: 2, quality: 'minor' },
    { degree: 7, quality: 'major' },
    { degree: 0, quality: 'major' },
    { degree: 5, quality: 'major' },
  ],
  // I – IV – V（布鲁斯）
  [
    { degree: 0, quality: 'major' },
    { degree: 5, quality: 'major' },
    { degree: 7, quality: 'major' },
    { degree: 0, quality: 'major' },
  ],
];

// ==================== 细胞自动机网格 ====================

export class CAMusicGrid {
  private rows: number;
  private cols: number;
  private bpm: number;
  private keyRoot: number;
  private scale: number[];
  private grid: MusicCell[][];
  private rules: GrowthRule[];
  private history: MusicCell[][][];
  private generation: number;
  /** 记录每个细胞进入 mature 的代数 */
  private matureGen: (number | null)[][];
  /** 记录每个细胞进入 dead 的代数 */
  private deadGen: (number | null)[][];

  constructor(params: {
    rows?: number;
    cols?: number;
    bpm?: number;
    keyRoot?: number;
    scale?: number[];
  } = {}) {
    this.rows = params.rows ?? 24;
    this.cols = params.cols ?? 64;
    this.bpm = params.bpm ?? 120;
    this.keyRoot = params.keyRoot ?? 60;
    this.scale = params.scale ?? [0, 2, 4, 5, 7, 9, 11];
    this.rules = [];
    this.history = [];
    this.generation = 0;
    this.matureGen = [];
    this.deadGen = [];
    this.grid = this.createEmptyGrid();
    this.initDefaultRules();
  }

  /** 创建空白网格 */
  private createEmptyGrid(): MusicCell[][] {
    const g: MusicCell[][] = [];
    this.matureGen = [];
    this.deadGen = [];
    for (let r = 0; r < this.rows; r++) {
      g[r] = [];
      this.matureGen[r] = [];
      this.deadGen[r] = [];
      for (let c = 0; c < this.cols; c++) {
        g[r][c] = this.createCell(r, c, 'empty');
        this.matureGen[r][c] = null;
        this.deadGen[r][c] = null;
      }
    }
    return g;
  }

  /** 创建单个细胞 */
  private createCell(row: number, col: number, state: CellState): MusicCell {
    const scaleIndex = row % this.scale.length;
    const octave = Math.floor(row / this.scale.length);
    const midiNote = this.keyRoot + this.scale[scaleIndex] + octave * 12;
    return {
      row,
      col,
      state,
      age: 0,
      energy: state === 'empty' ? 0 : 0.5 + Math.random() * 0.5,
      midiNote,
      velocity: 0.7,
      duration: 0,
    };
  }

  /** 深度复制网格快照 */
  private cloneGrid(): MusicCell[][] {
    return this.grid.map((row) =>
      row.map((cell) => ({ ...cell }))
    );
  }

  /** 初始化默认规则 */
  private initDefaultRules(): void {
    this.rules.push(DefaultRules.scaleAffinity);
    this.rules.push(DefaultRules.melodicContinuation);
    this.rules.push(DefaultRules.harmonicSupport);
    this.rules.push(DefaultRules.rhythmPulse);
    this.rules.push(DefaultRules.mutation);
    this.rules.push(DefaultRules.densityControl);
    this.rules.push(DefaultRules.decay);
  }

  /** 获取 Moore 邻域（8 个空间邻居） */
  private getNeighbors(row: number, col: number): MusicCell[] {
    const neighbors: MusicCell[] = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = row + dr;
        const nc = col + dc;
        if (nr >= 0 && nr < this.rows && nc >= 0 && nc < this.cols) {
          neighbors.push(this.grid[nr][nc]);
        }
      }
    }
    return neighbors;
  }

  /** 构建当前列的上下文 */
  private buildContext(col: number): GridContext {
    const beatsPerBar = 4;
    const bar = Math.floor(col / beatsPerBar);
    const beat = col % beatsPerBar;
    const chord = this.getChordAtBar(bar);
    return {
      bpm: this.bpm,
      scale: this.scale,
      keyRoot: this.keyRoot,
      currentChord: chord,
      bar,
      beat,
    };
  }

  /** 获取指定小节的和弦音 */
  private getChordAtBar(bar: number): number[] {
    const progressionIndex = 0; // 默认使用流行进行 I-V-vi-IV
    const prog = PROGRESSIONS[progressionIndex];
    const chordIndex = bar % prog.length;
    const chordDef = prog[chordIndex];
    const template = CHORD_TEMPLATES[chordDef.quality] ?? CHORD_TEMPLATES.major;
    return template.intervals.map((interval) => this.keyRoot + chordDef.degree + interval);
  }

  /** 播种种子细胞 */
  seed(cells: Array<{ row: number; col: number; energy?: number }>): void {
    for (const s of cells) {
      if (s.row >= 0 && s.row < this.rows && s.col >= 0 && s.col < this.cols) {
        const cell = this.createCell(s.row, s.col, 'growing');
        if (s.energy !== undefined) {
          cell.energy = Math.max(0, Math.min(1, s.energy));
        }
        this.grid[s.row][s.col] = cell;
      }
    }
  }

  /** 随机播种（按音阶概率分布） */
  randomSeed(count: number, bias: 'low' | 'mid' | 'high' = 'mid'): void {
    const seeds: Array<{ row: number; col: number; energy?: number }> = [];
    for (let i = 0; i < count; i++) {
      let row: number;
      // 根据 bias 选择音高范围
      if (bias === 'low') {
        row = Math.floor(Math.random() * (this.rows * 0.4));
      } else if (bias === 'high') {
        row = Math.floor(this.rows * 0.6 + Math.random() * (this.rows * 0.4));
      } else {
        row = Math.floor(this.rows * 0.3 + Math.random() * (this.rows * 0.4));
      }
      row = Math.max(0, Math.min(this.rows - 1, row));
      const col = Math.floor(Math.random() * this.cols);
      const energy = 0.5 + Math.random() * 0.5;
      seeds.push({ row, col, energy });
    }
    this.seed(seeds);
  }

  /** 单步演化 */
  private step(): void {
    const newGrid: MusicCell[][] = [];
    this.generation++;

    for (let r = 0; r < this.rows; r++) {
      newGrid[r] = [];
      for (let c = 0; c < this.cols; c++) {
        const cell = this.grid[r][c];
        const neighbors = this.getNeighbors(r, c);
        const context = this.buildContext(c);

        let newState: CellState | null = null;
        for (const rule of this.rules) {
          const result = rule.apply(cell, neighbors, context);
          if (result !== null) {
            newState = result;
            break;
          }
        }
        if (newState === null) {
          newState = cell.state;
        }

        const newCell = { ...cell };
        if (newState !== cell.state) {
          newCell.state = newState;
          newCell.age = 0;
          // 记录生命周期里程碑
          if (newState === 'mature' && cell.state !== 'mature') {
            this.matureGen[r][c] = this.generation;
          }
          if ((newState === 'dead' || newState === 'empty') && (cell.state === 'mature' || cell.state === 'decaying')) {
            this.deadGen[r][c] = this.generation;
          }
        } else {
          newCell.age = cell.age + 1;
        }
        newCell.duration = newCell.age;
        newGrid[r][c] = newCell;
      }
    }

    this.grid = newGrid;
  }

  /** 运行 N 代演化 */
  evolve(generations: number): void {
    for (let g = 0; g < generations; g++) {
      this.step();
    }
  }

  /** 逐代演化并返回每代快照 */
  evolveWithHistory(generations: number): MusicCell[][][] {
    this.history = [];
    for (let g = 0; g < generations; g++) {
      this.step();
      this.history.push(this.cloneGrid());
    }
    return this.history;
  }

  /** 从网格提取音符事件 */
  extractNotes(): Array<{
    midi: number;
    startTime: number;
    duration: number;
    velocity: number;
  }> {
    const notes: Array<{
      midi: number;
      startTime: number;
      duration: number;
      velocity: number;
    }> = [];
    const beatDuration = 60 / this.bpm;

    for (let r = 0; r < this.rows; r++) {
      let c = 0;
      while (c < this.cols) {
        const cell = this.grid[r][c];
        if (cell.state !== 'mature' && cell.state !== 'decaying') {
          c++;
          continue;
        }

        // 开始一段连续的成熟/衰变区域
        const startCol = c;
        let totalEnergy = 0;
        let cellCount = 0;

        while (c < this.cols) {
          const current = this.grid[r][c];
          if (current.state !== 'mature' && current.state !== 'decaying') {
            break;
          }

          let vel = current.energy * 127;
          if (current.state === 'decaying') {
            // 衰变阶段线性衰减，假设最大衰变寿命为 3 代
            const decayFactor = Math.max(0, 1 - current.age / 3);
            vel *= decayFactor;
          }
          totalEnergy += current.energy;
          cellCount++;
          c++;
        }

        const duration = cellCount * beatDuration;
        const startTime = startCol * beatDuration;
        const avgEnergy = totalEnergy / cellCount;
        const velocity = Math.min(127, Math.max(1, Math.round(avgEnergy * 127)));

        notes.push({
          midi: cell.midiNote,
          startTime,
          duration,
          velocity,
        });
      }
    }

    // 按时间排序
    notes.sort((a, b) => a.startTime - b.startTime || a.midi - b.midi);
    return notes;
  }

  /** 添加自定义规则（插入到默认规则之前，优先级更高） */
  addRule(rule: GrowthRule): void {
    // 默认将用户规则插入到 decay 规则之前
    const decayIndex = this.rules.findIndex((r) => r.name === 'decay');
    if (decayIndex >= 0) {
      this.rules.splice(decayIndex, 0, rule);
    } else {
      this.rules.push(rule);
    }
  }

  /** 获取当前网格状态 */
  getGrid(): MusicCell[][] {
    return this.cloneGrid();
  }

  /** 获取当前演化代数 */
  getGeneration(): number {
    return this.generation;
  }
}

// ==================== 内置规则工厂 ====================

/** 检查 MIDI 音高是否为和弦音 */
function isChordTone(midi: number, chord: number[]): boolean {
  return chord.some((tone) => {
    const diff = Math.abs(midi - tone) % 12;
    return diff === 0;
  });
}

export const DefaultRules: {
  scaleAffinity: GrowthRule;
  harmonicSupport: GrowthRule;
  densityControl: GrowthRule;
  rhythmPulse: GrowthRule;
  melodicContinuation: GrowthRule;
  mutation: GrowthRule;
  decay: GrowthRule;
} = {
  /** 音阶内细胞更容易存活 */
  scaleAffinity: {
    name: 'scaleAffinity',
    apply(cell: MusicCell, _neighbors: MusicCell[], context: GridContext): CellState | null {
      const scaleIndex = cell.row % context.scale.length;
      // 音阶主音级（根音、五音）更容易成熟；避免半音级（scaleIndex 对应不协和位置）
      const preferredIndices = [0, 4, 2, 5]; // 根、五、三、六音级优先
      const isPreferred = preferredIndices.includes(scaleIndex);

      if (cell.state === 'growing' && isPreferred && Math.random() < 0.3) {
        return 'mature';
      }
      if (cell.state === 'mature' && !isPreferred && Math.random() < 0.4) {
        return 'decaying';
      }
      return null;
    },
  },

  /** 有和弦支持的细胞成熟更快 */
  harmonicSupport: {
    name: 'harmonicSupport',
    apply(cell: MusicCell, _neighbors: MusicCell[], context: GridContext): CellState | null {
      if (cell.state === 'mature' && isChordTone(cell.midiNote, context.currentChord)) {
        // 副作用：增加力度
        cell.velocity = Math.min(1, cell.velocity + 0.12);
        cell.energy = Math.min(1, cell.energy + 0.05);
      }
      return null;
    },
  },

  /** 过密区域细胞衰变 */
  densityControl: {
    name: 'densityControl',
    apply(cell: MusicCell, neighbors: MusicCell[], _context: GridContext): CellState | null {
      const activeCount = neighbors.filter(
        (n) => n.state === 'mature' || n.state === 'growing'
      ).length;
      if (activeCount > 3 && (cell.state === 'mature' || cell.state === 'growing')) {
        return 'decaying';
      }
      return null;
    },
  },

  /** 强拍位置更容易生长 */
  rhythmPulse: {
    name: 'rhythmPulse',
    apply(cell: MusicCell, _neighbors: MusicCell[], _context: GridContext): CellState | null {
      if (cell.state !== 'empty') return null;
      const col = cell.col;
      if (col % 4 === 0 && Math.random() < 0.2) {
        return 'growing';
      }
      if (col % 2 === 0 && Math.random() < 0.1) {
        return 'growing';
      }
      return null;
    },
  },

  /** 旋律方向上的连续生长 */
  melodicContinuation: {
    name: 'melodicContinuation',
    apply(cell: MusicCell, neighbors: MusicCell[], _context: GridContext): CellState | null {
      if (cell.state !== 'growing') return null;
      // 正上方或正下方邻居 mature
      const verticalMature = neighbors.some(
        (n) => n.col === cell.col && (n.row === cell.row - 1 || n.row === cell.row + 1) && n.state === 'mature'
      );
      if (verticalMature && Math.random() < 0.25) {
        return 'mature';
      }
      return null;
    },
  },

  /** 低概率随机变异 */
  mutation: {
    name: 'mutation',
    apply(cell: MusicCell, _neighbors: MusicCell[], _context: GridContext): CellState | null {
      if (cell.state === 'empty' && Math.random() < 0.05) {
        return 'growing';
      }
      return null;
    },
  },

  /** 自然衰变 */
  decay: {
    name: 'decay',
    apply(cell: MusicCell, _neighbors: MusicCell[], _context: GridContext): CellState | null {
      if (cell.state === 'mature' && cell.age >= 2) {
        return 'decaying';
      }
      if (cell.state === 'decaying' && cell.age >= 2) {
        return 'dead';
      }
      if (cell.state === 'dead' && cell.age >= 1) {
        return 'empty';
      }
      return null;
    },
  },
};

// ==================== 高层 API ====================

/**
 * 使用细胞自动机生成音乐
 * @param params 生成参数
 * @returns 音符事件与演化历史
 */
export function composeByCellularAutomata(params: {
  bpm?: number;
  keyRoot?: number;
  scale?: number[];
  barCount?: number;
  seedDensity?: number;
  generations?: number;
} = {}): {
  notes: Array<{ midi: number; startTime: number; duration: number; velocity: number }>;
  history: MusicCell[][][];
} {
  const bpm = params.bpm ?? 120;
  const keyRoot = params.keyRoot ?? 60;
  const scale = params.scale ?? [0, 2, 4, 5, 7, 9, 11];
  const barCount = params.barCount ?? 16;
  const seedDensity = params.seedDensity ?? 0.1;
  const cols = barCount * 4;
  const generations = params.generations ?? barCount * 4;

  const grid = new CAMusicGrid({
    rows: 24,
    cols,
    bpm,
    keyRoot,
    scale,
  });

  // 随机播种
  const seedCount = Math.max(1, Math.floor(cols * seedDensity));
  grid.randomSeed(seedCount, 'mid');

  // 演化并记录历史
  const history = grid.evolveWithHistory(generations);

  // 提取音符
  const notes = grid.extractNotes();

  return { notes, history };
}

// ==================== 辅助工具 ====================

/**
 * 根据 MIDI 编号获取音符名称（调试用）
 * @param midi MIDI 编号
 * @returns 音符名称如 "C4"
 */
export function midiToNoteName(midi: number): string {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const name = names[midi % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${name}${octave}`;
}

/**
 * 将细胞状态历史转换为可视化字符串（调试用）
 * @param grid 单代网格
 * @returns 可视化字符串
 */
export function gridToVisual(grid: MusicCell[][]): string {
  const stateChar: Record<CellState, string> = {
    empty: '.',
    growing: 'o',
    mature: 'O',
    decaying: '*',
    dead: 'x',
  };
  return grid
    .map((row) => row.map((cell) => stateChar[cell.state]).join(''))
    .join('\n');
}
