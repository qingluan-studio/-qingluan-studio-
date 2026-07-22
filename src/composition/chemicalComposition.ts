/**
 * =============================================================================
 * 化学反应式编曲引擎 (Chemical Reaction Composition Engine)
 * =============================================================================
 * 将音符视为"分子"（NoteMolecule），在虚拟反应容器中通过碰撞反应生成音乐。
 * 纯 TypeScript 实现，零外部依赖，ESM 模块。
 * @author AI Composer Engine
 * @version 1.0.0
 * =============================================================================
 */

const SAMPLE_RATE = 44100;

// ==================== 核心类型定义 ====================

export type MoleculeType = 'melody' | 'harmony' | 'rhythm' | 'timbre' | 'dissonance' | 'resonance';

export interface NoteMolecule {
  id: string;
  type: MoleculeType;
  midiNote: number;
  duration: number;
  energy: number;
  charge: number;
  mass: number;
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  birthTime: number;
}

export interface ReactionRule {
  id: string;
  reactants: [MoleculeType, MoleculeType];
  products: MoleculeType[];
  probability: number;
  energyThreshold: number;
  transform: (a: NoteMolecule, b: NoteMolecule) => Partial<NoteMolecule>[];
}

interface ReactionLogEntry {
  time: number;
  event: string;
  molecules: number;
}

// ==================== 工具函数 ====================

function randomId(prefix = 'mol'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36).slice(-4)}`;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function dist3d(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function vecLen(v: { x: number; y: number; z: number }): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

function vecSub(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function vecAdd(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function vecScale(v: { x: number; y: number; z: number }, s: number) {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function gaussianRandom(mean = 0, std = 1): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return mean + std * Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

// ==================== 内置反应规则 ====================

const DEFAULT_RULES: ReactionRule[] = [
  // 1. 和声丰富旋律
  {
    id: 'rule_melody_harmony',
    reactants: ['melody', 'harmony'],
    products: ['melody', 'resonance'],
    probability: 0.7,
    energyThreshold: 0.05,
    transform: (a, b) => [
      {
        midiNote: clamp(Math.round((a.midiNote + b.midiNote) / 2) + Math.round(gaussianRandom(0, 1)), 0, 127),
        energy: clamp((a.energy + b.energy) * 0.6, 0, 1),
        charge: clamp((a.charge + b.charge) * 0.5, -1, 1),
        mass: clamp((a.mass + b.mass) * 0.5, 1, 10),
        duration: randomRange(0.25, 1.0),
      },
      {
        midiNote: clamp(b.midiNote + Math.round(gaussianRandom(0, 2)), 0, 127),
        energy: clamp(b.energy * 0.8, 0, 1),
        charge: clamp(b.charge * 0.9, -1, 1),
        mass: clamp(b.mass, 1, 10),
        duration: randomRange(1.0, 2.0),
      },
    ],
  },
  // 2. 节奏驱动旋律变形
  {
    id: 'rule_melody_rhythm',
    reactants: ['melody', 'rhythm'],
    products: ['rhythm', 'melody'],
    probability: 0.65,
    energyThreshold: 0.08,
    transform: (a, b) => [
      {
        midiNote: clamp(a.midiNote + (Math.random() > 0.5 ? 1 : -1) * 2, 0, 127),
        energy: clamp(a.energy * 1.1, 0, 1),
        charge: clamp(a.charge + 0.1, -1, 1),
        mass: clamp(a.mass, 1, 10),
        duration: randomRange(0.1, 0.25),
      },
      {
        midiNote: clamp(a.midiNote + Math.round(gaussianRandom(0, 3)), 0, 127),
        energy: clamp(b.energy * 0.9, 0, 1),
        charge: clamp(b.charge - 0.05, -1, 1),
        mass: clamp(b.mass, 1, 10),
        duration: randomRange(0.25, 0.75),
      },
    ],
  },
  // 3. 不协和音被消解
  {
    id: 'rule_harmony_dissonance',
    reactants: ['harmony', 'dissonance'],
    products: ['harmony', 'harmony'],
    probability: 0.8,
    energyThreshold: 0.1,
    transform: (a, b) => [
      {
        midiNote: clamp(a.midiNote + Math.round(gaussianRandom(0, 1)), 0, 127),
        energy: clamp((a.energy + b.energy) * 0.55, 0, 1),
        charge: clamp(a.charge * 0.8 + 0.1, -1, 1),
        mass: clamp(a.mass, 1, 10),
        duration: randomRange(1.0, 2.0),
      },
      {
        midiNote: clamp(a.midiNote + 4, 0, 127),
        energy: clamp((a.energy + b.energy) * 0.45, 0, 1),
        charge: clamp(a.charge * 0.8 + 0.1, -1, 1),
        mass: clamp(b.mass, 1, 10),
        duration: randomRange(0.5, 1.5),
      },
    ],
  },
  // 4. 冲突产生音色
  {
    id: 'rule_dissonance_resonance',
    reactants: ['dissonance', 'resonance'],
    products: ['timbre'],
    probability: 0.6,
    energyThreshold: 0.12,
    transform: (a, b) => [
      {
        midiNote: clamp(Math.round((a.midiNote + b.midiNote) / 2), 0, 127),
        energy: clamp((a.energy + b.energy) * 0.7, 0, 1),
        charge: clamp((a.charge + b.charge) * 0.3, -1, 1),
        mass: clamp((a.mass + b.mass) * 0.6, 1, 10),
        duration: randomRange(0.3, 1.2),
      },
    ],
  },
  // 5. 节奏叠加产生旋律动机
  {
    id: 'rule_rhythm_rhythm',
    reactants: ['rhythm', 'rhythm'],
    products: ['rhythm', 'melody'],
    probability: 0.55,
    energyThreshold: 0.06,
    transform: (a, b) => [
      {
        midiNote: clamp(a.midiNote, 0, 127),
        energy: clamp((a.energy + b.energy) * 0.5, 0, 1),
        charge: clamp(a.charge, -1, 1),
        mass: clamp(a.mass, 1, 10),
        duration: randomRange(0.1, 0.25),
      },
      {
        midiNote: clamp(Math.round((a.midiNote + b.midiNote) / 2) + 7, 0, 127),
        energy: clamp((a.energy + b.energy) * 0.55, 0, 1),
        charge: clamp((a.charge + b.charge) * 0.5 + 0.1, -1, 1),
        mass: clamp((a.mass + b.mass) * 0.5, 1, 10),
        duration: randomRange(0.25, 1.0),
      },
    ],
  },
  // 6. 旋律融合为和声
  {
    id: 'rule_melody_melody',
    reactants: ['melody', 'melody'],
    products: ['harmony'],
    probability: 0.5,
    energyThreshold: 0.04,
    transform: (a, b) => [
      {
        midiNote: clamp(Math.round((a.midiNote + b.midiNote) / 2), 0, 127),
        energy: clamp((a.energy + b.energy) * 0.6, 0, 1),
        charge: clamp((a.charge + b.charge) * 0.5, -1, 1),
        mass: clamp(a.mass + b.mass, 1, 10),
        duration: randomRange(1.0, 2.0),
      },
    ],
  },
  // 7. 音色+和声 → 共鸣+旋律
  {
    id: 'rule_timbre_harmony',
    reactants: ['timbre', 'harmony'],
    products: ['resonance', 'melody'],
    probability: 0.6,
    energyThreshold: 0.07,
    transform: (a, b) => [
      {
        midiNote: clamp(b.midiNote + Math.round(gaussianRandom(0, 2)), 0, 127),
        energy: clamp((a.energy + b.energy) * 0.5, 0, 1),
        charge: clamp((a.charge + b.charge) * 0.5, -1, 1),
        mass: clamp((a.mass + b.mass) * 0.5, 1, 10),
        duration: randomRange(0.5, 1.5),
      },
      {
        midiNote: clamp(a.midiNote + Math.round(gaussianRandom(0, 3)), 0, 127),
        energy: clamp((a.energy + b.energy) * 0.55, 0, 1),
        charge: clamp(a.charge + 0.1, -1, 1),
        mass: clamp(a.mass, 1, 10),
        duration: randomRange(0.25, 1.0),
      },
    ],
  },
  // 8. 低概率随机产生不协和
  {
    id: 'rule_any_any_dissonance',
    reactants: ['melody', 'harmony'], // 占位，由代码动态匹配任意类型
    products: ['dissonance'],
    probability: 0.08,
    energyThreshold: 0.0,
    transform: (a, b) => [
      {
        midiNote: clamp(Math.round((a.midiNote + b.midiNote) / 2) + 1, 0, 127),
        energy: clamp((a.energy + b.energy) * 0.4, 0, 1),
        charge: clamp((a.charge - b.charge) * 0.5, -1, 1),
        mass: clamp((a.mass + b.mass) * 0.3, 1, 10),
        duration: randomRange(0.1, 0.5),
      },
    ],
  },
];

// ==================== 反应容器 ====================

export class ChemicalReactor {
  private molecules: NoteMolecule[] = [];
  private rules: ReactionRule[] = [];
  private reactionLog: ReactionLogEntry[] = [];
  private containerSize: number;
  private temperature: number;
  private maxMolecules: number;
  private time = 0;
  private collisionThreshold: number;
  private dt = 0.05; // 时间步长（秒）

  constructor(params?: {
    containerSize?: number;
    temperature?: number;
    maxMolecules?: number;
  }) {
    this.containerSize = params?.containerSize ?? 100;
    this.temperature = clamp(params?.temperature ?? 0.5, 0.01, 2.0);
    this.maxMolecules = params?.maxMolecules ?? 100;
    this.collisionThreshold = this.containerSize * 0.12;
    this.rules = [...DEFAULT_RULES];
  }

  inject(molecules: NoteMolecule[]): void {
    for (const m of molecules) {
      if (this.molecules.length >= this.maxMolecules) break;
      // 根据温度校准速度
      const targetSpeed = Math.sqrt(this.temperature / m.mass) * 2;
      const currentSpeed = vecLen(m.velocity);
      if (currentSpeed === 0 || currentSpeed < targetSpeed * 0.3) {
        const scale = targetSpeed / (currentSpeed || 1);
        m.velocity = vecScale(m.velocity, scale);
        if (vecLen(m.velocity) === 0) {
          m.velocity = {
            x: gaussianRandom(0, targetSpeed * 0.5),
            y: gaussianRandom(0, targetSpeed * 0.5),
            z: gaussianRandom(0, targetSpeed * 0.5),
          };
        }
      }
      this.molecules.push({ ...m, id: m.id || randomId() });
    }
  }

  addRule(rule: ReactionRule): void {
    this.rules.push(rule);
  }

  getReactionLog(): ReactionLogEntry[] {
    return [...this.reactionLog];
  }

  private logEvent(event: string): void {
    this.reactionLog.push({
      time: this.time,
      event,
      molecules: this.molecules.length,
    });
  }

  private bounce(m: NoteMolecule): void {
    const half = this.containerSize / 2;
    if (m.position.x < -half) { m.position.x = -half; m.velocity.x *= -1; }
    if (m.position.x > half) { m.position.x = half; m.velocity.x *= -1; }
    if (m.position.y < -half) { m.position.y = -half; m.velocity.y *= -1; }
    if (m.position.y > half) { m.position.y = half; m.velocity.y *= -1; }
    if (m.position.z < -half) { m.position.z = -half; m.velocity.z *= -1; }
    if (m.position.z > half) { m.position.z = half; m.velocity.z *= -1; }
  }

  private totalEnergy(): number {
    let e = 0;
    for (const m of this.molecules) {
      const v2 = vecLen(m.velocity) ** 2;
      e += 0.5 * m.mass * v2 + m.energy;
    }
    return e;
  }

  private reducedMass(a: NoteMolecule, b: NoteMolecule): number {
    return (a.mass * b.mass) / (a.mass + b.mass);
  }

  private relativeKineticEnergy(a: NoteMolecule, b: NoteMolecule): number {
    const relVel = vecSub(a.velocity, b.velocity);
    const v2 = vecLen(relVel) ** 2;
    return 0.5 * this.reducedMass(a, b) * v2;
  }

  private elasticBounce(a: NoteMolecule, b: NoteMolecule): void {
    // 简化的弹性碰撞：交换沿连心线方向的速度分量
    const dx = a.position.x - b.position.x;
    const dy = a.position.y - b.position.y;
    const dz = a.position.z - b.position.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 === 0) return;
    const d = Math.sqrt(d2);
    const nx = dx / d, ny = dy / d, nz = dz / d;

    const van = a.velocity.x * nx + a.velocity.y * ny + a.velocity.z * nz;
    const vbn = b.velocity.x * nx + b.velocity.y * ny + b.velocity.z * nz;

    const ma = a.mass, mb = b.mass;
    const van2 = van * (ma - mb) / (ma + mb) + vbn * (2 * mb) / (ma + mb);
    const vbn2 = vbn * (mb - ma) / (ma + mb) + van * (2 * ma) / (ma + mb);

    a.velocity.x += (van2 - van) * nx;
    a.velocity.y += (van2 - van) * ny;
    a.velocity.z += (van2 - van) * nz;
    b.velocity.x += (vbn2 - vbn) * nx;
    b.velocity.y += (vbn2 - vbn) * ny;
    b.velocity.z += (vbn2 - vbn) * nz;
  }

  private matchRule(a: NoteMolecule, b: NoteMolecule): ReactionRule | null {
    const candidates: ReactionRule[] = [];
    for (const rule of this.rules) {
      if (rule.id === 'rule_any_any_dissonance') {
        // 任意两种不同类型分子碰撞都可能产生不协和
        if (a.type !== b.type && Math.random() < rule.probability) {
          candidates.push(rule);
        }
        continue;
      }
      const [r1, r2] = rule.reactants;
      if ((a.type === r1 && b.type === r2) || (a.type === r2 && b.type === r1)) {
        candidates.push(rule);
      }
    }
    if (candidates.length === 0) return null;
    // 按概率排序，选概率最高的一个
    candidates.sort((x, y) => y.probability - x.probability);
    return candidates[0];
  }

  private applyReaction(a: NoteMolecule, b: NoteMolecule, rule: ReactionRule): NoteMolecule[] {
    const products: NoteMolecule[] = [];
    const transforms = rule.transform(a, b);
    const basePos = {
      x: (a.position.x + b.position.x) / 2,
      y: (a.position.y + b.position.y) / 2,
      z: (a.position.z + b.position.z) / 2,
    };

    // 能量守恒校验
    const preEnergy = 0.5 * a.mass * vecLen(a.velocity) ** 2 + a.energy +
                      0.5 * b.mass * vecLen(b.velocity) ** 2 + b.energy;

    for (let i = 0; i < transforms.length; i++) {
      const t = transforms[i];
      const pType = rule.products[i] ?? rule.products[rule.products.length - 1];
      const speed = Math.sqrt(this.temperature / (t.mass ?? 5)) * (0.8 + Math.random() * 0.4);
      const angle1 = Math.random() * Math.PI * 2;
      const angle2 = Math.acos(2 * Math.random() - 1);
      const vel = {
        x: speed * Math.sin(angle2) * Math.cos(angle1),
        y: speed * Math.sin(angle2) * Math.sin(angle1),
        z: speed * Math.cos(angle2),
      };
      products.push({
        id: randomId('prod'),
        type: pType,
        midiNote: clamp(t.midiNote ?? a.midiNote, 0, 127),
        duration: clamp(t.duration ?? 0.5, 0.05, 5),
        energy: clamp(t.energy ?? 0.5, 0, 1),
        charge: clamp(t.charge ?? 0, -1, 1),
        mass: clamp(t.mass ?? 5, 1, 10),
        position: { ...basePos },
        velocity: vel,
        birthTime: this.time,
      });
    }

    // 粗略能量守恒修正：让产物总能量接近反应前
    const postKinetic = products.reduce((s, p) => s + 0.5 * p.mass * vecLen(p.velocity) ** 2, 0);
    const postInternal = products.reduce((s, p) => s + p.energy, 0);
    const postEnergy = postKinetic + postInternal;
    if (postEnergy > 0 && preEnergy > 0) {
      const ratio = Math.sqrt(preEnergy / postEnergy);
      for (const p of products) {
        p.velocity = vecScale(p.velocity, ratio * (0.95 + Math.random() * 0.1));
      }
    }

    return products;
  }

  react(duration: number): NoteMolecule[] {
    const steps = Math.max(1, Math.floor(duration / this.dt));
    this.time = 0;
    this.reactionLog = [];
    this.logEvent('reaction_start');

    for (let s = 0; s < steps; s++) {
      this.time = s * this.dt;
      const n = this.molecules.length;
      if (n === 0) break;

      // 1. 更新位置
      for (const m of this.molecules) {
        m.position = vecAdd(m.position, vecScale(m.velocity, this.dt));
        this.bounce(m);
      }

      // 2. 碰撞检测与反应
      const reacted = new Set<number>();
      const newMolecules: NoteMolecule[] = [];

      for (let i = 0; i < n; i++) {
        if (reacted.has(i)) continue;
        for (let j = i + 1; j < n; j++) {
          if (reacted.has(j)) continue;
          const a = this.molecules[i];
          const b = this.molecules[j];
          const d = dist3d(a.position, b.position);
          if (d < this.collisionThreshold) {
            const relKe = this.relativeKineticEnergy(a, b);
            const rule = this.matchRule(a, b);
            if (rule && relKe >= rule.energyThreshold && Math.random() < rule.probability) {
              // 发生反应
              const products = this.applyReaction(a, b, rule);
              newMolecules.push(...products);
              reacted.add(i);
              reacted.add(j);
              this.logEvent(`${rule.id}: ${a.type}+${b.type} → ${rule.products.join('+')}`);
              break;
            } else {
              // 弹性碰撞
              this.elasticBounce(a, b);
            }
          }
        }
      }

      // 保留未反应的分子
      const survivors: NoteMolecule[] = [];
      for (let i = 0; i < n; i++) {
        if (!reacted.has(i)) {
          survivors.push(this.molecules[i]);
        }
      }

      this.molecules = [...survivors, ...newMolecules];

      // 数量上限裁切：保留能量最高的分子
      if (this.molecules.length > this.maxMolecules) {
        this.molecules.sort((x, y) => {
          const ex = 0.5 * x.mass * vecLen(x.velocity) ** 2 + x.energy;
          const ey = 0.5 * y.mass * vecLen(y.velocity) ** 2 + y.energy;
          return ey - ex;
        });
        this.molecules = this.molecules.slice(0, this.maxMolecules);
      }
    }

    this.logEvent('reaction_end');
    return [...this.molecules];
  }

  extractNotes(): Array<{
    midi: number;
    startTime: number;
    duration: number;
    velocity: number;
    type: MoleculeType;
  }> {
    const notes: Array<{
      midi: number;
      startTime: number;
      duration: number;
      velocity: number;
      type: MoleculeType;
    }> = [];

    for (const m of this.molecules) {
      let duration = m.duration;
      let velocity = clamp(m.energy * 127, 1, 127);

      switch (m.type) {
        case 'melody':
          duration = clamp(duration, 0.25, 1.0);
          break;
        case 'harmony':
          duration = clamp(duration, 1.0, 2.0);
          velocity = clamp(velocity * 0.7, 1, 127);
          break;
        case 'rhythm':
          duration = clamp(duration, 0.1, 0.25);
          velocity = clamp(velocity * 1.1, 1, 127);
          break;
        case 'timbre':
          duration = clamp(duration, 0.3, 1.2);
          velocity = clamp(velocity * 0.9, 1, 127);
          break;
        case 'resonance':
          duration = clamp(duration, 0.5, 1.5);
          velocity = clamp(velocity * 0.85, 1, 127);
          break;
        case 'dissonance':
          duration = clamp(duration, 0.1, 0.5);
          velocity = clamp(velocity * 0.6, 1, 127);
          break;
      }

      notes.push({
        midi: m.midiNote,
        startTime: m.birthTime,
        duration,
        velocity: Math.round(velocity),
        type: m.type,
      });
    }

    notes.sort((a, b) => a.startTime - b.startTime);
    return notes;
  }
}

// ==================== 高层 API ====================

export function composeByChemistry(params: {
  style?: string;
  keyRoot?: number;
  scale?: number[];
  barCount?: number;
  bpm?: number;
  temperature?: number;
}): {
  notes: Array<{ midi: number; startTime: number; duration: number; velocity: number }>;
  reactionLog: Array<{ time: number; event: string; molecules: number }>;
} {
  const keyRoot = clamp(params.keyRoot ?? 60, 0, 127);
  const scale = params.scale ?? [0, 2, 4, 5, 7, 9, 11];
  const barCount = clamp(params.barCount ?? 4, 1, 32);
  const bpm = clamp(params.bpm ?? 120, 30, 240);
  const temperature = clamp(params.temperature ?? 0.5, 0.01, 2.0);

  const secondsPerBeat = 60 / bpm;
  const beatsPerBar = 4;
  const totalDuration = barCount * beatsPerBar * secondsPerBeat;

  // 根据 style 决定初始分子分布
  const style = (params.style ?? 'pop').toLowerCase();
  const initialMolecules: NoteMolecule[] = [];

  const scaleNote = (degree: number, octaveOffset = 0): number => {
    const idx = ((degree % scale.length) + scale.length) % scale.length;
    const oct = Math.floor(degree / scale.length) + octaveOffset;
    return clamp(keyRoot + oct * 12 + scale[idx], 0, 127);
  };

  const addMolecule = (
    type: MoleculeType,
    degree: number,
    octaveOffset: number,
    energy: number,
    mass: number,
    timeOffset = 0
  ) => {
    const speed = Math.sqrt(temperature / mass) * 2;
    initialMolecules.push({
      id: randomId(),
      type,
      midiNote: scaleNote(degree, octaveOffset),
      duration: 0.5,
      energy: clamp(energy, 0, 1),
      charge: randomRange(-0.5, 0.5),
      mass: clamp(mass, 1, 10),
      position: {
        x: randomRange(-40, 40),
        y: randomRange(-40, 40),
        z: randomRange(-40, 40),
      },
      velocity: {
        x: gaussianRandom(0, speed),
        y: gaussianRandom(0, speed),
        z: gaussianRandom(0, speed),
      },
      birthTime: timeOffset,
    });
  };

  // 根据风格注入初始分子
  if (style === 'classical' || style === 'orchestral') {
    for (let bar = 0; bar < barCount; bar++) {
      for (let beat = 0; beat < beatsPerBar; beat++) {
        const t = (bar * beatsPerBar + beat) * secondsPerBeat;
        addMolecule('melody', (bar * 3 + beat) % 7, 0, 0.7, 5, t);
        if (beat % 2 === 0) addMolecule('harmony', (bar * 2) % 7, -1, 0.6, 6, t);
        if (beat === 0) addMolecule('rhythm', 0, -2, 0.5, 4, t);
      }
    }
  } else if (style === 'jazz' || style === 'blues') {
    for (let bar = 0; bar < barCount; bar++) {
      for (let beat = 0; beat < beatsPerBar; beat++) {
        const t = (bar * beatsPerBar + beat) * secondsPerBeat;
        addMolecule('melody', (bar * 2 + beat) % 7, 0, 0.6, 4, t);
        addMolecule('harmony', (bar + beat) % 7, -1, 0.55, 5, t);
        if (beat % 2 === 0) addMolecule('rhythm', (beat / 2) % 4, -2, 0.6, 3, t);
        if (Math.random() < 0.2) addMolecule('dissonance', (bar + 3) % 7, 0, 0.4, 2, t);
      }
    }
  } else if (style === 'electronic' || style === 'edm') {
    for (let bar = 0; bar < barCount; bar++) {
      for (let beat = 0; beat < beatsPerBar; beat++) {
        const t = (bar * beatsPerBar + beat) * secondsPerBeat;
        addMolecule('rhythm', beat % 4, -1, 0.8, 3, t);
        if (beat % 2 === 0) addMolecule('timbre', (bar * 2) % 7, 0, 0.6, 4, t);
        if (beat === 0) addMolecule('melody', bar % 7, 1, 0.7, 5, t);
      }
    }
  } else {
    // 默认 pop / 通用风格
    for (let bar = 0; bar < barCount; bar++) {
      for (let beat = 0; beat < beatsPerBar; beat++) {
        const t = (bar * beatsPerBar + beat) * secondsPerBeat;
        addMolecule('melody', (bar + beat * 2) % 7, 0, 0.65, 5, t);
        if (beat === 0 || beat === 2) addMolecule('harmony', bar % 7, -1, 0.6, 6, t);
        addMolecule('rhythm', beat % 4, -2, 0.55, 4, t);
      }
    }
  }

  // 额外注入一些共鸣/不协和分子以增加变化
  for (let i = 0; i < Math.floor(barCount / 2); i++) {
    addMolecule('resonance', (i * 3) % 7, 0, 0.4, 3, i * 2 * beatsPerBar * secondsPerBeat);
    if (Math.random() < 0.3) {
      addMolecule('dissonance', (i * 5 + 1) % 7, 0, 0.35, 2, i * 2 * beatsPerBar * secondsPerBeat);
    }
  }

  const reactor = new ChemicalReactor({
    containerSize: 100,
    temperature,
    maxMolecules: 100,
  });

  reactor.inject(initialMolecules);
  reactor.react(totalDuration);

  const extracted = reactor.extractNotes();
  const notes = extracted.map((n) => ({
    midi: n.midi,
    startTime: n.startTime,
    duration: n.duration,
    velocity: n.velocity,
  }));

  return {
    notes,
    reactionLog: reactor.getReactionLog(),
  };
}
