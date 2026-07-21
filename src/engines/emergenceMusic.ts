// ============================================================
// 青鸾 DAW — 认知涌现音乐引擎 (Cognitive Emergence Music Engine)
// ============================================================
// 核心哲学：全部非传统技术，零神经网络，零外部付费API
// 驱动力：
//   • T1-T6 认知几何不变量 (CEE)
//   • MusicSwarm 去中心化群体智能 (MIT 2026 生物启发)
//   • Eisbach 对数屏障自我审视 (中山大学 2026)
//   • 菌丝网络知识传播 / 联觉跨模态 / 熵创造力 / 混沌吸引子
//   • 自我学习 → 知识胶囊 → 能力矩阵 → 废弃会话
// ============================================================

import {
  CognitiveInvariantEngine,
  CognitiveMirrorEngine,
  AutoLearner,
  FeedbackStore,
  MemoryBank,
  AgentOrchestrator,
  SimpleAgent,
  InvariantScores,
} from './cognitiveEngine';

// ═════════════════════════════════════════════════════════════
// Part 0: 公共工具
// ═════════════════════════════════════════════════════════════

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(v: number, min: number, max: number) {
  return v < min ? min : v > max ? max : v;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function shannonEntropy(probs: number[]): number {
  let e = 0;
  for (const p of probs) {
    if (p > 1e-12) e -= p * Math.log2(p);
  }
  return e;
}

function gini(values: number[]): number {
  if (!values.length || values.reduce((a, b) => a + b, 0) === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const n = s.length;
  let si = 0;
  for (let i = 0; i < n; i++) si += (i + 1) * s[i];
  const sum = s.reduce((a, b) => a + b, 0);
  return (2 * si - (n + 1) * sum) / (n * sum + 1e-12);
}

// ═════════════════════════════════════════════════════════════
// Part 1: Eisbach 对数屏障自我审视引擎
// 中山大学 2026: AI用输出熵值作为"自信度"调节学习权重
// ═════════════════════════════════════════════════════════════

export interface EisbachState {
  entropyHistory: number[];
  weightHistory: number[];
  confidence: number;
}

export class EisbachLogBarrier {
  intensity: number;   // 0~1，屏障强度
  idealEntropy: number; // 理想熵区间中心
  windowSize: number;

  constructor(intensity = 0.5, idealEntropy = 5.0, windowSize = 20) {
    this.intensity = intensity;
    this.idealEntropy = idealEntropy;
    this.windowSize = windowSize;
  }

  // 从时间-能量曲线计算熵（自信度代理）
  computeConfidence(energyCurve: number[]): number {
    if (!energyCurve.length) return 0.5;
    const sum = energyCurve.reduce((a, b) => a + b, 0);
    if (sum === 0) return 0.5;
    const probs = energyCurve.map(v => v / sum);
    const entropy = shannonEntropy(probs);
    // 归一化到 [0,1]，越尖锐（低熵）越自信
    const maxEnt = Math.log2(probs.length || 1);
    const norm = maxEnt > 0 ? 1 - entropy / maxEnt : 0.5;
    return clamp(norm, 0.01, 1);
  }

  // 对数屏障权重: w = -ln(1 - confidence) 或基于理想熵的钟形
  computeWeight(confidence: number): number {
    // 理想状态: confidence 适中 (~0.5-0.7) 时权重最高
    // 过于平坦（confidence→0）或过于尖锐（confidence→1）都降低权重
    const dist = Math.abs(confidence - 0.6);
    const bell = Math.exp(-dist * dist * 8); // 高斯钟形
    const barrier = -Math.log(Math.max(0.001, 1 - bell));
    return clamp(barrier / 5, 0.01, 1);
  }

  // 应用到损失/评分上
  applyBarrier(rawScore: number, confidence: number): number {
    const w = this.computeWeight(confidence);
    // 插值: intensity=0 时原始分; intensity=1 时加权分
    return lerp(rawScore, rawScore * w * 1.5, this.intensity);
  }

  // 分析一段旋律的自信度
  analyzeMelodyConfidence(notes: number[], durations: number[]): EisbachState {
    // 将音符+时长转为能量曲线
    const curve: number[] = [];
    for (let i = 0; i < notes.length; i++) {
      const energy = (notes[i] % 12 + 1) * (durations[i] || 0.5) * 10;
      curve.push(energy);
    }
    const confidence = this.computeConfidence(curve);
    const weight = this.computeWeight(confidence);
    return {
      entropyHistory: [shannonEntropy(curve.map(v => v / (curve.reduce((a, b) => a + b, 0) || 1)))],
      weightHistory: [weight],
      confidence,
    };
  }
}

// ═════════════════════════════════════════════════════════════
// Part 2: MusicSwarm 去中心化群体智能
// MIT 2026 MusicSwarm 改编: 无需权重更新，stigmergic信号协调
// ═════════════════════════════════════════════════════════════

export type SwarmAgentRole = 'melody' | 'harmony' | 'rhythm' | 'timbre' | 'structure';

export interface StigmergicSignal {
  barIndex: number;
  harmonicCue: number[];    // 和弦线索 (0-11 音级)
  rhythmicCue: number[];    // 节奏线索 (力度序列)
  structuralCue: number;    // 结构线索 (0=intro, 1=verse...)
  memory: number[];         // 短期记忆向量
  consensusWeight: number;  // 共识权重
}

export interface SwarmAgent {
  id: string;
  role: SwarmAgentRole;
  position: number;         // 小节位置
  shortMemory: StigmergicSignal[];
  roleSpecialization: number; // 角色专精度 (动态演化)
}

export class MusicSwarm {
  agents: SwarmAgent[];
  signals: StigmergicSignal[];
  consensusMatrix: number[][]; // 代理间共识度
  rng: () => number;

  constructor(seed = Date.now()) {
    this.rng = rng(seed);
    this.agents = [];
    this.signals = [];
    this.consensusMatrix = [];
  }

  // 初始化群体: N个代理，均匀分布在小节上
  initSwarm(barCount: number, agentsPerBar = 2) {
    this.agents = [];
    const roles: SwarmAgentRole[] = ['melody', 'harmony', 'rhythm', 'timbre', 'structure'];
    let idCounter = 0;
    for (let bar = 0; bar < barCount; bar++) {
      for (let a = 0; a < agentsPerBar; a++) {
        const role = roles[Math.floor(this.rng() * roles.length)];
        this.agents.push({
          id: `agent_${idCounter++}`,
          role,
          position: bar,
          shortMemory: [],
          roleSpecialization: 0.2 + this.rng() * 0.3,
        });
      }
    }
    this.consensusMatrix = Array.from({ length: this.agents.length }, () =>
      new Array(this.agents.length).fill(0.5)
    );
  }

  // 感知并沉积信号 (stigmergy)
  senseAndDeposit(agentId: string, localSignal: StigmergicSignal) {
    const agent = this.agents.find(a => a.id === agentId);
    if (!agent) return;
    agent.shortMemory.push(localSignal);
    if (agent.shortMemory.length > 8) agent.shortMemory.shift();
    this.signals.push({ ...localSignal, consensusWeight: agent.roleSpecialization });
    if (this.signals.length > 200) this.signals.shift();
  }

  // 局部感知: 代理读取附近信号
  readLocalSignals(barIndex: number, radius = 2): StigmergicSignal[] {
    return this.signals.filter(s => Math.abs(s.barIndex - barIndex) <= radius);
  }

  // 动态共识: 更新代理间共识度 (small-world 演化)
  updateConsensus() {
    const n = this.agents.length;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = this.agents[i];
        const b = this.agents[j];
        // 距离越近、角色越互补，共识度越高
        const dist = Math.abs(a.position - b.position);
        const roleComp = a.role === b.role ? 0.3 : 0.9;
        const newConsensus = roleComp * Math.exp(-dist * 0.3);
        this.consensusMatrix[i][j] = lerp(this.consensusMatrix[i][j], newConsensus, 0.1);
        this.consensusMatrix[j][i] = this.consensusMatrix[i][j];
      }
    }
  }

  // 角色专精演化: 共识收敛后代理自发形成互补角色
  evolveRoles() {
    for (let i = 0; i < this.agents.length; i++) {
      const a = this.agents[i];
      // 读取邻居信号，如果某类信号稀缺，该代理趋向于填补该角色
      const local = this.readLocalSignals(a.position, 1);
      const roleCounts = new Map<SwarmAgentRole, number>();
      for (const s of local) {
        // 通过信号推断附近代理角色
      }
      // 简化: 专精度随时间缓慢增加，多样性由角色分布保证
      a.roleSpecialization = clamp(a.roleSpecialization + 0.01, 0.1, 1.0);
    }
  }

  // 群体作曲: 所有代理协作生成旋律决策
  swarmCompose(barCount: number, keyRoot = 0, scale = [0, 2, 4, 5, 7, 9, 11]): number[][] {
    this.initSwarm(barCount);
    const barNotes: number[][] = [];

    for (let bar = 0; bar < barCount; bar++) {
      // 该小节的本地代理
      const localAgents = this.agents.filter(a => a.position === bar);
      // 读取附近历史信号
      const localSignals = this.readLocalSignals(bar, 2);

      // 各角色提案
      const proposals: Map<SwarmAgentRole, number[]> = new Map();

      for (const agent of localAgents) {
        const notes = this._agentPropose(agent, localSignals, keyRoot, scale);
        proposals.set(agent.role, notes);
      }

      // 共识融合: 加权平均各角色提案
      const fused = this._fuseProposals(proposals, localAgents);
      barNotes.push(fused);

      // 沉积信号
      const harmonicCue = this._extractHarmony(fused, keyRoot);
      const rhythmicCue = fused.map(() => 0.5 + this.rng() * 0.5);
      this.senseAndDeposit(localAgents[0]?.id || 'null', {
        barIndex: bar,
        harmonicCue,
        rhythmicCue,
        structuralCue: bar / barCount,
        memory: fused.slice(0, 4),
        consensusWeight: 0.5,
      });
    }

    this.updateConsensus();
    this.evolveRoles();
    return barNotes;
  }

  private _agentPropose(agent: SwarmAgent, signals: StigmergicSignal[], keyRoot: number, scale: number[]): number[] {
    const notes: number[] = [];
    const baseOctave = 60; // C4 MIDI
    const beatCount = 4;

    for (let beat = 0; beat < beatCount; beat++) {
      let note: number;
      if (agent.role === 'melody') {
        // 旋律代理: 偏好级进+偶尔跳进
        const scaleIdx = Math.floor(this.rng() * scale.length);
        note = baseOctave + keyRoot + scale[scaleIdx];
        if (this.rng() < 0.3) note += 12; // 八度跳进
      } else if (agent.role === 'harmony') {
        // 和声代理: 偏好三度、五度
        const root = baseOctave + keyRoot;
        const intervals = [0, 4, 7, 12];
        note = root + intervals[Math.floor(this.rng() * intervals.length)];
      } else if (agent.role === 'rhythm') {
        // 节奏代理: 生成休止符或短音
        note = this.rng() < 0.2 ? -1 : baseOctave + keyRoot + scale[Math.floor(this.rng() * scale.length)];
      } else if (agent.role === 'timbre') {
        // 音色代理: 影响音高装饰
        note = baseOctave + keyRoot + scale[Math.floor(this.rng() * scale.length)];
        if (this.rng() < 0.2) note += Math.floor(this.rng() * 3) - 1; // 微分音装饰
      } else {
        // 结构代理: 控制段落感
        const tension = beat / beatCount;
        const scaleIdx = Math.floor(tension * scale.length);
        note = baseOctave + keyRoot + scale[clamp(scaleIdx, 0, scale.length - 1)];
      }
      notes.push(note);
    }
    return notes;
  }

  private _fuseProposals(proposals: Map<SwarmAgentRole, number[]>, agents: SwarmAgent[]): number[] {
    const fused: number[] = [];
    const beatCount = 4;
    for (let beat = 0; beat < beatCount; beat++) {
      let sum = 0;
      let weight = 0;
      for (const [role, notes] of proposals) {
        const agent = agents.find(a => a.role === role);
        const w = agent ? agent.roleSpecialization : 0.2;
        if (beat < notes.length) {
          sum += notes[beat] * w;
          weight += w;
        }
      }
      fused.push(weight > 0 ? Math.round(sum / weight) : 60);
    }
    return fused;
  }

  private _extractHarmony(notes: number[], keyRoot: number): number[] {
    const pcs = new Set(notes.filter(n => n >= 0).map(n => (n - keyRoot) % 12));
    return Array.from(pcs).sort((a, b) => a - b);
  }

  // 小世界网络分析: 计算平均路径长度与聚类系数
  analyzeSmallWorld(): { avgPathLength: number; clusteringCoeff: number } {
    const n = this.agents.length;
    if (n < 3) return { avgPathLength: 0, clusteringCoeff: 0 };

    // Floyd-Warshall 近似: 只算短路径
    let totalPath = 0;
    let pathCount = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < Math.min(n, i + 10); j++) {
        totalPath += 1 / (this.consensusMatrix[i][j] + 0.01);
        pathCount++;
      }
    }

    let totalCluster = 0;
    for (let i = 0; i < n; i++) {
      const neighbors: number[] = [];
      for (let j = 0; j < n; j++) {
        if (i !== j && this.consensusMatrix[i][j] > 0.5) neighbors.push(j);
      }
      if (neighbors.length < 2) continue;
      let edges = 0;
      for (let a = 0; a < neighbors.length; a++) {
        for (let b = a + 1; b < neighbors.length; b++) {
          if (this.consensusMatrix[neighbors[a]][neighbors[b]] > 0.3) edges++;
        }
      }
      const possible = (neighbors.length * (neighbors.length - 1)) / 2;
      totalCluster += possible > 0 ? edges / possible : 0;
    }

    return {
      avgPathLength: pathCount > 0 ? totalPath / pathCount : 0,
      clusteringCoeff: n > 0 ? totalCluster / n : 0,
    };
  }
}

// ═════════════════════════════════════════════════════════════
// Part 3: 知识胶囊 & 能力矩阵
// "学习完直接废弃，只有知识和能力"
// ═════════════════════════════════════════════════════════════

export interface KnowledgeCapsule {
  capsuleId: string;
  extractedAt: string;
  // 认知精华
  cognitiveEssence: {
    effectivePatterns: string[];       // 有效模式 ID
    parameterCorrelations: Record<string, number>; // 参数相关性
    discoveredWaypoints: string[];     // 新发现的路标
    entropySignature: number;          // 熵特征签名
  };
  // 音乐知识
  musicKnowledge: {
    preferredProgressions: string[][]; // 偏好的和弦进行
    effectiveScales: string[];         // 有效的音阶
    rhythmicTemplates: number[][];     // 节奏模板
    timbreMappings: Record<string, number[]>; // 音色映射
  };
  // 元数据
  sessionStats: {
    iterations: number;
    bestScore: number;
    avgScore: number;
    swarmDiversity: number;
  };
}

export interface AbilityMatrix {
  version: number;
  lastUpdated: string;
  // 作曲能力
  composition: {
    melodicInnovation: number;   // 旋律创新度
    harmonicRichness: number;    // 和声丰富度
    rhythmicComplexity: number;  // 节奏复杂度
    structuralMastery: number;   // 结构掌控力
  };
  // 音色能力
  timbre: {
    vocalRealism: number;        // 人声真实度
    instrumentDepth: number;     // 乐器深度
    spatialAwareness: number;    // 空间感知
  };
  // 认知能力
  cognition: {
    patternRecognition: number;  // 模式识别
    crossModalMapping: number;   // 跨模态映射
    selfReflection: number;      // 自我反思 (Eisbach)
    swarmCoordination: number;   // 群体协调
  };
  // 累积知识胶囊引用
  capsules: string[];
}

export class AbilityMatrixManager {
  matrix: AbilityMatrix;

  constructor() {
    this.matrix = this._createDefault();
  }

  private _createDefault(): AbilityMatrix {
    return {
      version: 1,
      lastUpdated: new Date().toISOString(),
      composition: { melodicInnovation: 0.3, harmonicRichness: 0.3, rhythmicComplexity: 0.3, structuralMastery: 0.3 },
      timbre: { vocalRealism: 0.3, instrumentDepth: 0.3, spatialAwareness: 0.3 },
      cognition: { patternRecognition: 0.3, crossModalMapping: 0.3, selfReflection: 0.3, swarmCoordination: 0.3 },
      capsules: [],
    };
  }

  // 从知识胶囊更新能力矩阵
  ingestCapsule(capsule: KnowledgeCapsule): void {
    const stats = capsule.sessionStats;
    const boost = stats.bestScore * 0.1; // 最高分解锁能力提升

    this.matrix.composition.melodicInnovation = clamp(this.matrix.composition.melodicInnovation + boost * 0.25, 0, 1);
    this.matrix.composition.harmonicRichness = clamp(this.matrix.composition.harmonicRichness + boost * 0.25, 0, 1);
    this.matrix.composition.rhythmicComplexity = clamp(this.matrix.composition.rhythmicComplexity + boost * 0.25, 0, 1);
    this.matrix.composition.structuralMastery = clamp(this.matrix.composition.structuralMastery + boost * 0.25, 0, 1);

    this.matrix.cognition.patternRecognition = clamp(this.matrix.cognition.patternRecognition + boost * 0.3, 0, 1);
    this.matrix.cognition.selfReflection = clamp(this.matrix.cognition.selfReflection + boost * 0.2, 0, 1);
    this.matrix.cognition.swarmCoordination = clamp(this.matrix.cognition.swarmCoordination + boost * 0.2, 0, 1);

    this.matrix.capsules.push(capsule.capsuleId);
    this.matrix.lastUpdated = new Date().toISOString();
  }

  // 能力影响创作参数
  applyToParams(baseParams: Record<string, any>): Record<string, any> {
    const m = this.matrix;
    return {
      ...baseParams,
      melodyRange: lerp(4, 12, m.composition.melodicInnovation),
      chordDensity: lerp(2, 6, m.composition.harmonicRichness),
      rhythmLayers: lerp(1, 4, m.composition.rhythmicComplexity),
      sectionCount: lerp(2, 6, m.composition.structuralMastery),
      eisbachIntensity: m.cognition.selfReflection,
      swarmAgents: Math.floor(lerp(4, 20, m.cognition.swarmCoordination)),
    };
  }

  export(): AbilityMatrix {
    return JSON.parse(JSON.stringify(this.matrix));
  }

  import(data: AbilityMatrix): void {
    this.matrix = data;
  }
}

// ═════════════════════════════════════════════════════════════
// Part 4: 涌现会话 (EmergenceSession)
// 临时容器，学完后废弃
// ═════════════════════════════════════════════════════════════

export interface SessionArtifact {
  type: 'melody' | 'harmony' | 'rhythm' | 'timbre' | 'full';
  data: any;
  scores: InvariantScores;
  eisbachState: EisbachState;
}

export class EmergenceSession {
  sessionId: string;
  createdAt: string;
  // 认知引擎实例（临时）
  invariantEngine: CognitiveInvariantEngine;
  mirrorEngine: CognitiveMirrorEngine;
  autoLearner: AutoLearner;
  memoryBank: MemoryBank;
  // 非传统引擎（临时）
  eisbach: EisbachLogBarrier;
  swarm: MusicSwarm;
  // 会话产物
  artifacts: SessionArtifact[];
  // 运行日志
  logs: string[];

  constructor(sessionId?: string) {
    this.sessionId = sessionId || `sess_${Date.now().toString(36)}`;
    this.createdAt = new Date().toISOString();
    this.invariantEngine = new CognitiveInvariantEngine();
    this.mirrorEngine = new CognitiveMirrorEngine();
    this.autoLearner = new AutoLearner();
    this.memoryBank = new MemoryBank(1000);
    this.eisbach = new EisbachLogBarrier(0.6);
    this.swarm = new MusicSwarm();
    this.artifacts = [];
    this.logs = [];
  }

  log(msg: string) {
    this.logs.push(`[${new Date().toISOString()}] ${msg}`);
  }

  // 添加产物并评估
  addArtifact(type: SessionArtifact['type'], data: any, notes?: number[], durations?: number[]): SessionArtifact {
    let scores: InvariantScores;
    let eisbachState: EisbachState = { entropyHistory: [], weightHistory: [], confidence: 0.5 };

    if (type === 'melody' && notes) {
      const noteNames = notes.map(n => this._midiToName(n)).join(' ');
      scores = this.invariantEngine.evaluate(noteNames);
      if (durations) {
        eisbachState = this.eisbach.analyzeMelodyConfidence(notes, durations);
      }
    } else {
      scores = this.invariantEngine.evaluate(JSON.stringify(data));
    }

    const artifact: SessionArtifact = { type, data, scores, eisbachState };
    this.artifacts.push(artifact);

    // 自动学习
    this.autoLearner.recordPerformance(`artifact_${type}`, { data }, scores.overall, { sessionId: this.sessionId });
    this.autoLearner.feedback.add(scores.overall, 'automatic', `${type} generated`, { sessionId: this.sessionId }, [type]);

    return artifact;
  }

  // 提取知识胶囊
  extractCapsule(): KnowledgeCapsule {
    const insights = this.autoLearner.analyze();
    const best = this.autoLearner.bestSnapshot;

    // 提取有效模式
    const effectivePatterns = this.artifacts
      .filter(a => a.scores.overall >= 0.6)
      .map((a, i) => `pattern_${a.type}_${i}`);

    // 提取参数相关性
    const paramCorr: Record<string, number> = {};
    for (const insight of insights) {
      if (insight.name === 'param_correlation') {
        const match = insight.description.match(/"([^"]+)"/);
        if (match) paramCorr[match[1]] = insight.confidence;
      }
    }

    // 提取路标
    const discoveredWaypoints = this.artifacts
      .map(a => this.mirrorEngine.extractSignposts(JSON.stringify(a.data)))
      .flat();

    // 计算平均熵签名
    const entropySig = this.artifacts.length
      ? this.artifacts.reduce((s, a) => s + (a.eisbachState.confidence || 0.5), 0) / this.artifacts.length
      : 0.5;

    // 提取音乐知识
    const progSet = new Set<string>();
    const scaleSet = new Set<string>();
    const rhythms: number[][] = [];
    for (const a of this.artifacts) {
      if (a.type === 'melody' && Array.isArray(a.data)) {
        rhythms.push(a.data.filter((n: number) => n >= 0).map((n: number) => n % 12));
      }
    }

    const scores = this.artifacts.map(a => a.scores.overall);
    const avgScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    const bestScore = scores.length ? Math.max(...scores) : 0;

    const capsule: KnowledgeCapsule = {
      capsuleId: `cap_${Date.now().toString(36)}`,
      extractedAt: new Date().toISOString(),
      cognitiveEssence: {
        effectivePatterns,
        parameterCorrelations: paramCorr,
        discoveredWaypoints: [...new Set(discoveredWaypoints)],
        entropySignature: entropySig,
      },
      musicKnowledge: {
        preferredProgressions: Array.from(progSet).map(s => s.split(',')).filter(a => a.length >= 2),
        effectiveScales: Array.from(scaleSet),
        rhythmicTemplates: rhythms.slice(0, 10),
        timbreMappings: {},
      },
      sessionStats: {
        iterations: this.artifacts.length,
        bestScore,
        avgScore,
        swarmDiversity: this.swarm.analyzeSmallWorld().clusteringCoeff,
      },
    };

    return capsule;
  }

  // 废弃会话: 清空所有临时状态
  dispose(): void {
    this.artifacts = [];
    this.logs = [];
    // TypeScript 中无法真正销毁对象，但清空引用允许 GC
    (this as any).invariantEngine = null;
    (this as any).mirrorEngine = null;
    (this as any).autoLearner = null;
    (this as any).memoryBank = null;
    (this as any).eisbach = null;
    (this as any).swarm = null;
  }

  private _midiToName(midi: number): string {
    const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    if (midi < 0) return 'rest';
    return names[midi % 12] + (Math.floor(midi / 12) - 1);
  }
}

// ═════════════════════════════════════════════════════════════
// Part 5: 认知涌现音乐引擎主类
// ═════════════════════════════════════════════════════════════

export interface EmergenceMusicParams {
  style?: string;
  key?: string;
  bpm?: number;
  barCount?: number;
  emotion?: string;
  intensity?: number;
  seed?: number;
}

export interface EmergenceMusicResult {
  sessionId: string;
  melody: number[];
  durations: number[];
  chords: number[][];
  scores: InvariantScores;
  swarmAnalysis: { avgPathLength: number; clusteringCoeff: number };
  eisbachState: EisbachState;
  capsuleId: string;
  abilityVersion: number;
}

export class CognitiveEmergenceMusicEngine {
  abilityManager: AbilityMatrixManager;
  orchestrator: AgentOrchestrator;
  private _capsules: KnowledgeCapsule[] = [];
  private _sessionCounter = 0;

  constructor() {
    this.abilityManager = new AbilityMatrixManager();
    this.orchestrator = new AgentOrchestrator();
    this._registerAgents();
  }

  private _registerAgents() {
    // 作曲代理
    this.orchestrator.registerAgent(new SimpleAgent('旋律Swarm', 'composer', ['composer'], async (task) => {
      const params = task.params as EmergenceMusicParams;
      const seed = params.seed ?? Date.now();
      const swarm = new MusicSwarm(seed);
      const keyMap: Record<string, number> = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
      const root = keyMap[params.key || 'C'] ?? 0;
      const scale = [0, 2, 4, 5, 7, 9, 11];
      const bars = swarm.swarmCompose(params.barCount || 8, root, scale);
      const melody = bars.flat();
      return { melody, swarm };
    }));

    // 和声代理
    this.orchestrator.registerAgent(new SimpleAgent('和声生成器', 'arranger', ['arranger'], async (task) => {
      const params = task.params as EmergenceMusicParams;
      const r = rng(params.seed ?? Date.now());
      const root = { C: 0, G: 7, D: 2, A: 9, E: 4, F: 5 }[params.key || 'C'] ?? 0;
      const progressions = [
        [0, 5, 3, 4], [0, 4, 5, 3], [0, 3, 4, 0], [0, 5, 1, 4],
      ];
      const prog = progressions[Math.floor(r() * progressions.length)];
      const chords = prog.map(deg => [root + deg, root + deg + 4, root + deg + 7]);
      return { chords };
    }));

    // 评估代理
    this.orchestrator.registerAgent(new SimpleAgent('T6评估器', 'evaluator', ['evaluator'], async (task) => {
      const melody = task.params.melody as number[];
      const names = melody.map(n => {
        const nm = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        return n < 0 ? 'rest' : nm[n % 12];
      }).join(' ');
      const engine = new CognitiveInvariantEngine();
      return engine.evaluate(names);
    }));
  }

  // 主入口: 创作一首完整的涌现音乐
  async compose(params: EmergenceMusicParams = {}): Promise<EmergenceMusicResult> {
    this._sessionCounter++;
    const session = new EmergenceSession(`emerge_${this._sessionCounter}`);
    session.log(`Session started: style=${params.style}, key=${params.key}`);

    // 1. 应用能力矩阵到参数
    const abilityParams = this.abilityManager.applyToParams({
      barCount: params.barCount || 8,
      seed: params.seed || Date.now(),
      key: params.key || 'C',
    });
    session.log(`Ability-injected params: ${JSON.stringify(abilityParams)}`);

    // 2. MusicSwarm 群体作曲
    session.swarm.initSwarm(abilityParams.barCount, Math.floor(abilityParams.swarmAgents / abilityParams.barCount) || 2);
    const keyMap: Record<string, number> = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
    const root = keyMap[params.key || 'C'] ?? 0;
    const scale = [0, 2, 4, 5, 7, 9, 11];
    const barNotes = session.swarm.swarmCompose(abilityParams.barCount, root, scale);
    const melody = barNotes.flat();
    const durations = melody.map(() => 0.5);

    session.addArtifact('melody', melody, melody, durations);
    session.log(`Swarm composed ${melody.length} notes`);

    // 3. 多智能体编排: 和声+评估
    const tasks = this.orchestrator.plan('作曲旋律', { ...params, melody, seed: abilityParams.seed });
    const executed = await this.orchestrator.executePlan(tasks);
    const synth = this.orchestrator.synthesize(executed);
    session.log(`Orchestrator completed: ${synth.completed} tasks`);

    // 4. Eisbach 自我审视
    const eisbachState = session.eisbach.analyzeMelodyConfidence(melody, durations);
    session.log(`Eisbach confidence: ${eisbachState.confidence.toFixed(3)}`);

    // 5. T6 不变量评估
    const noteNames = melody.map(n => {
      const nm = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
      return n < 0 ? 'rest' : nm[n % 12];
    }).join(' ');
    const scores = session.invariantEngine.evaluate(noteNames);
    session.log(`T6 overall: ${scores.overall.toFixed(3)}`);

    // 6. 提取知识胶囊
    const capsule = session.extractCapsule();
    this._capsules.push(capsule);
    this.abilityManager.ingestCapsule(capsule);
    session.log(`Capsule extracted: ${capsule.capsuleId}`);

    // 7. 群体网络分析
    const swarmAnalysis = session.swarm.analyzeSmallWorld();

    // 8. 废弃会话（只留结果和胶囊）
    const result: EmergenceMusicResult = {
      sessionId: session.sessionId,
      melody,
      durations,
      chords: synth.outputs['乐器编排']?.chords || [],
      scores,
      swarmAnalysis,
      eisbachState,
      capsuleId: capsule.capsuleId,
      abilityVersion: this.abilityManager.matrix.version,
    };

    session.dispose();
    session.log('Session disposed.');

    return result;
  }

  // 认知闭环优化: 迭代改进直到达标
  async composeWithClosedLoop(params: EmergenceMusicParams = {}, maxIterations = 5, threshold = 0.65): Promise<EmergenceMusicResult[]> {
    const results: EmergenceMusicResult[] = [];
    for (let i = 0; i < maxIterations; i++) {
      const r = await this.compose({ ...params, seed: (params.seed || 1) + i });
      results.push(r);
      if (r.scores.overall >= threshold) break;
      // 反馈学习驱动下一次迭代
      this.abilityManager.matrix.cognition.selfReflection = clamp(
        this.abilityManager.matrix.cognition.selfReflection + 0.02, 0, 1
      );
    }
    return results;
  }

  // 获取当前能力矩阵
  getAbilityMatrix(): AbilityMatrix {
    return this.abilityManager.export();
  }

  // 获取知识胶囊列表
  getCapsules(): KnowledgeCapsule[] {
    return this._capsules.map(c => ({ ...c }));
  }

  // 导入持久化状态
  importState(state: { abilityMatrix: AbilityMatrix; capsules: KnowledgeCapsule[] }): void {
    this.abilityManager.import(state.abilityMatrix);
    this._capsules = state.capsules;
  }

  exportState(): { abilityMatrix: AbilityMatrix; capsules: KnowledgeCapsule[] } {
    return {
      abilityMatrix: this.abilityManager.export(),
      capsules: this._capsules.map(c => ({ ...c })),
    };
  }
}

// ═════════════════════════════════════════════════════════════
// Part 6: 与已有音频引擎的桥接
// 将涌现旋律转为可播放音符 + 触发无瑕疵合成器 / 真人声
// ═════════════════════════════════════════════════════════════

export interface PlayableTrack {
  notes: string[];      // 如 ['C4', 'E4', 'G4']
  durations: number[];  // 秒
  velocities: number[]; // 0-1
  lyrics?: string[];
}

export function emergenceToPlayable(result: EmergenceMusicResult, octaveOffset = 0): PlayableTrack {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const notes: string[] = [];
  const velocities: number[] = [];

  for (const midi of result.melody) {
    if (midi < 0) {
      notes.push('rest');
      velocities.push(0);
    } else {
      const oct = Math.floor(midi / 12) - 1 + octaveOffset;
      notes.push(names[midi % 12] + oct);
      velocities.push(0.6 + (result.eisbachState.confidence || 0.5) * 0.3);
    }
  }

  return {
    notes,
    durations: result.durations,
    velocities,
  };
}

// ═════════════════════════════════════════════════════════════
// 默认导出
// ═════════════════════════════════════════════════════════════
export default {
  EisbachLogBarrier,
  MusicSwarm,
  AbilityMatrixManager,
  EmergenceSession,
  CognitiveEmergenceMusicEngine,
  emergenceToPlayable,
};
