// ============================================================
// 青鸾 DAW - 意识流关联引擎 (Stream-of-Consciousness Association Engine)
// 构建概念图并通过意识游走者在图上做带偏置的随机游走，
// 将游走轨迹直接转化为音乐序列，模拟人类意识流动的非线性特征。
// ============================================================

const SAMPLE_RATE = 22050;

// ═════════════════════════════════════════════════════════════
// Part 1: 核心类型定义
// ═════════════════════════════════════════════════════════════

export interface EmotionVector {
  joy: number;
  sadness: number;
  anger: number;
  fear: number;
  surprise: number;
  disgust: number;
  trust: number;
  anticipation: number;
}

export interface ConceptNode {
  id: string;
  label: string;
  emotion: EmotionVector;
  musicalMapping: {
    preferredScale?: number[];
    preferredRange?: [number, number];
    rhythmicPattern?: number[];
    tempoBias?: number;
    articulation?: 'legato' | 'staccato' | 'tenuto' | 'glissando';
  };
  color?: string;
}

export interface ConceptEdge {
  from: string;
  to: string;
  weight: number;
  type: 'synesthesia' | 'semantic' | 'cultural' | 'personal' | 'contrast';
}

// ═════════════════════════════════════════════════════════════
// Part 2: 辅助函数
// ═════════════════════════════════════════════════════════════

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function blendEmotion(a: EmotionVector, b: EmotionVector, ratio: number): EmotionVector {
  const r = clamp(ratio, 0, 1);
  return {
    joy: clamp(a.joy * r + b.joy * (1 - r), 0, 1),
    sadness: clamp(a.sadness * r + b.sadness * (1 - r), 0, 1),
    anger: clamp(a.anger * r + b.anger * (1 - r), 0, 1),
    fear: clamp(a.fear * r + b.fear * (1 - r), 0, 1),
    surprise: clamp(a.surprise * r + b.surprise * (1 - r), 0, 1),
    disgust: clamp(a.disgust * r + b.disgust * (1 - r), 0, 1),
    trust: clamp(a.trust * r + b.trust * (1 - r), 0, 1),
    anticipation: clamp(a.anticipation * r + b.anticipation * (1 - r), 0, 1),
  };
}

function emotionSimilarity(a: EmotionVector, b: EmotionVector): number {
  const keys: (keyof EmotionVector)[] = ['joy', 'sadness', 'anger', 'fear', 'surprise', 'disgust', 'trust', 'anticipation'];
  let dot = 0, normA = 0, normB = 0;
  for (const k of keys) {
    const av = a[k];
    const bv = b[k];
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function emotionToMusicParams(emotion: EmotionVector): {
  scale: number[];
  tempoMultiplier: number;
  velocityRange: [number, number];
  noteDensity: number;
  articulation: string;
} {
  const sum = Object.values(emotion).reduce((a, b) => a + b, 0) + 1e-8;
  const joy = emotion.joy / sum;
  const sadness = emotion.sadness / sum;
  const anger = emotion.anger / sum;
  const fear = emotion.fear / sum;
  const trust = emotion.trust / sum;
  const anticipation = emotion.anticipation / sum;

  let scale: number[];
  if (joy > 0.3) scale = [0, 2, 4, 5, 7, 9, 11];
  else if (sadness > 0.3) scale = [0, 2, 3, 5, 7, 8, 10];
  else if (anger > 0.3) scale = [0, 2, 3, 5, 6, 8, 9, 11];
  else if (fear > 0.3) scale = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  else if (trust > 0.3) scale = [0, 2, 4, 7, 9];
  else scale = [0, 2, 4, 5, 7, 9, 11];

  const tempoMultiplier = clamp(0.7 + 0.8 * (anger * 1.5 + anticipation + joy), 0.3, 2.5);
  const vLow = clamp(30 + 50 * (anger + fear + sadness), 1, 120);
  const vHigh = clamp(60 + 60 * (joy + anger + anticipation), 20, 127);
  const noteDensity = clamp(0.25 + 1.5 * (anticipation + joy * 0.8 + anger * 0.8), 0.1, 4);
  let articulation = 'legato';
  if (anger > 0.3) articulation = 'staccato';
  else if (fear > 0.3) articulation = 'glissando';
  else if (sadness > 0.3 || trust > 0.4) articulation = 'tenuto';
  return { scale, tempoMultiplier, velocityRange: [vLow, vHigh], noteDensity, articulation };
}

// ═════════════════════════════════════════════════════════════
// Part 3: ConceptGraph - 概念知识图谱
// ═════════════════════════════════════════════════════════════

export class ConceptGraph {
  nodes: Map<string, ConceptNode>;
  adj: Map<string, Array<{ to: string; weight: number; type: ConceptEdge['type'] }>>;

  constructor() {
    this.nodes = new Map();
    this.adj = new Map();
  }

  addNode(node: ConceptNode): void {
    this.nodes.set(node.id, node);
    if (!this.adj.has(node.id)) this.adj.set(node.id, []);
  }

  addEdge(edge: ConceptEdge): void {
    if (!this.adj.has(edge.from)) this.adj.set(edge.from, []);
    this.adj.get(edge.from)!.push({ to: edge.to, weight: edge.weight, type: edge.type });
    if (!this.adj.has(edge.to)) this.adj.set(edge.to, []);
    this.adj.get(edge.to)!.push({ to: edge.from, weight: edge.weight, type: edge.type });
  }

  getNeighbors(nodeId: string): Array<{ node: ConceptNode; weight: number }> {
    const edges = this.adj.get(nodeId) ?? [];
    const result: Array<{ node: ConceptNode; weight: number }> = [];
    for (const e of edges) {
      const node = this.nodes.get(e.to);
      if (node) result.push({ node, weight: e.weight });
    }
    return result;
  }

  shortestPath(from: string, to: string): string[] {
    if (!this.nodes.has(from) || !this.nodes.has(to)) return [];
    const dist = new Map<string, number>();
    const prev = new Map<string, string | null>();
    const visited = new Set<string>();
    const pq = new Map<string, number>();

    for (const id of this.nodes.keys()) {
      dist.set(id, Infinity);
      prev.set(id, null);
    }
    dist.set(from, 0);
    pq.set(from, 0);

    while (pq.size > 0) {
      let u = '';
      let minDist = Infinity;
      for (const [id, d] of pq) {
        if (d < minDist) { minDist = d; u = id; }
      }
      if (u === '' || minDist === Infinity) break;
      pq.delete(u);
      if (u === to) break;
      visited.add(u);
      const neighbors = this.adj.get(u) ?? [];
      for (const edge of neighbors) {
        if (visited.has(edge.to)) continue;
        const alt = (dist.get(u) ?? Infinity) + (1 - edge.weight);
        if (alt < (dist.get(edge.to) ?? Infinity)) {
          dist.set(edge.to, alt);
          prev.set(edge.to, u);
          pq.set(edge.to, alt);
        }
      }
    }

    if (prev.get(to) === null && to !== from) return [];
    const path: string[] = [];
    let u: string | null = to;
    while (u !== null) { path.unshift(u); u = prev.get(u) ?? null; }
    return path;
  }

  findByEmotion(emotion: Partial<EmotionVector>, topK = 5): ConceptNode[] {
    const target: EmotionVector = { joy: 0, sadness: 0, anger: 0, fear: 0, surprise: 0, disgust: 0, trust: 0, anticipation: 0, ...emotion };
    const scored = Array.from(this.nodes.values()).map(node => ({
      node,
      sim: emotionSimilarity(node.emotion, target),
    }));
    scored.sort((a, b) => b.sim - a.sim);
    return scored.slice(0, topK).map(s => s.node);
  }

  static createDefaultGraph(): ConceptGraph {
    const g = new ConceptGraph();
    const nodes: ConceptNode[] = [
      { id: 'rain', label: '雨', emotion: { joy: 0.1, sadness: 0.8, anger: 0, fear: 0.2, surprise: 0.1, disgust: 0, trust: 0.3, anticipation: 0.2 }, musicalMapping: { preferredScale: [0, 2, 3, 5, 7, 8, 10], preferredRange: [48, 72], rhythmicPattern: [0.5, 0.5, 1, 0.5, 0.5], tempoBias: -10, articulation: 'tenuto' }, color: '#4A90D9' },
      { id: 'wind', label: '风', emotion: { joy: 0.3, sadness: 0.1, anger: 0.1, fear: 0.2, surprise: 0.3, disgust: 0, trust: 0.4, anticipation: 0.6 }, musicalMapping: { preferredScale: [0, 2, 4, 7, 9], preferredRange: [55, 79], rhythmicPattern: [1, 0.5, 1.5, 1], tempoBias: 5, articulation: 'legato' }, color: '#7FCDCD' },
      { id: 'sea', label: '大海', emotion: { joy: 0.2, sadness: 0.2, anger: 0.1, fear: 0.3, surprise: 0.2, disgust: 0, trust: 0.7, anticipation: 0.3 }, musicalMapping: { preferredScale: [0, 2, 4, 5, 7, 9, 11], preferredRange: [43, 67], rhythmicPattern: [2, 2], tempoBias: -5, articulation: 'legato' }, color: '#1E3A5F' },
      { id: 'mountain', label: '山', emotion: { joy: 0.2, sadness: 0.1, anger: 0, fear: 0.1, surprise: 0.2, disgust: 0, trust: 0.8, anticipation: 0.1 }, musicalMapping: { preferredScale: [0, 2, 4, 7, 9], preferredRange: [40, 64], rhythmicPattern: [2, 1, 1], tempoBias: -15, articulation: 'tenuto' }, color: '#6B7B8C' },
      { id: 'forest', label: '森林', emotion: { joy: 0.4, sadness: 0.1, anger: 0, fear: 0.2, surprise: 0.2, disgust: 0, trust: 0.6, anticipation: 0.3 }, musicalMapping: { preferredScale: [0, 2, 4, 7, 9], preferredRange: [50, 74], rhythmicPattern: [1, 1, 1, 1], tempoBias: -5, articulation: 'legato' }, color: '#2E8B57' },
      { id: 'starry', label: '星空', emotion: { joy: 0.3, sadness: 0.1, anger: 0, fear: 0.1, surprise: 0.6, disgust: 0, trust: 0.4, anticipation: 0.5 }, musicalMapping: { preferredScale: [0, 2, 4, 5, 7, 9, 11], preferredRange: [60, 84], rhythmicPattern: [1.5, 0.5, 2], tempoBias: 0, articulation: 'legato' }, color: '#4B0082' },
      { id: 'flame', label: '火焰', emotion: { joy: 0.3, sadness: 0, anger: 0.6, fear: 0.2, surprise: 0.4, disgust: 0.1, trust: 0.1, anticipation: 0.5 }, musicalMapping: { preferredScale: [0, 2, 3, 5, 6, 8, 9, 11], preferredRange: [55, 79], rhythmicPattern: [0.5, 0.5, 0.5, 0.5], tempoBias: 20, articulation: 'staccato' }, color: '#E25822' },
      { id: 'snow', label: '雪', emotion: { joy: 0.2, sadness: 0.4, anger: 0, fear: 0.1, surprise: 0.2, disgust: 0, trust: 0.6, anticipation: 0.1 }, musicalMapping: { preferredScale: [0, 2, 3, 5, 7, 8, 10], preferredRange: [62, 86], rhythmicPattern: [2, 2, 2], tempoBias: -20, articulation: 'tenuto' }, color: '#F0F8FF' },
      { id: 'river', label: '河流', emotion: { joy: 0.3, sadness: 0.1, anger: 0, fear: 0.1, surprise: 0.1, disgust: 0, trust: 0.5, anticipation: 0.6 }, musicalMapping: { preferredScale: [0, 2, 4, 5, 7, 9, 11], preferredRange: [48, 72], rhythmicPattern: [1, 0.5, 1, 0.5, 1], tempoBias: 5, articulation: 'legato' }, color: '#5F9EA0' },
      { id: 'fallenLeaf', label: '落叶', emotion: { joy: 0.1, sadness: 0.7, anger: 0, fear: 0.1, surprise: 0.1, disgust: 0.1, trust: 0.2, anticipation: 0.2 }, musicalMapping: { preferredScale: [0, 2, 3, 5, 7, 8, 10], preferredRange: [50, 74], rhythmicPattern: [1.5, 1.5, 1], tempoBias: -10, articulation: 'tenuto' }, color: '#D2691E' },
      { id: 'joy', label: '喜悦', emotion: { joy: 0.95, sadness: 0, anger: 0, fear: 0, surprise: 0.3, disgust: 0, trust: 0.5, anticipation: 0.4 }, musicalMapping: { preferredScale: [0, 2, 4, 5, 7, 9, 11], preferredRange: [60, 84], rhythmicPattern: [0.5, 0.5, 1, 0.5, 0.5], tempoBias: 15, articulation: 'staccato' }, color: '#FFD700' },
      { id: 'sadness', label: '悲伤', emotion: { joy: 0, sadness: 0.95, anger: 0.1, fear: 0.2, surprise: 0, disgust: 0, trust: 0.2, anticipation: 0 }, musicalMapping: { preferredScale: [0, 2, 3, 5, 7, 8, 10], preferredRange: [45, 69], rhythmicPattern: [2, 1, 1, 2], tempoBias: -20, articulation: 'tenuto' }, color: '#4169E1' },
      { id: 'anger', label: '愤怒', emotion: { joy: 0, sadness: 0.2, anger: 0.95, fear: 0.1, surprise: 0.3, disgust: 0.4, trust: 0, anticipation: 0.5 }, musicalMapping: { preferredScale: [0, 2, 3, 5, 6, 8, 9, 11], preferredRange: [52, 76], rhythmicPattern: [0.5, 0.25, 0.25, 0.5, 0.5], tempoBias: 25, articulation: 'staccato' }, color: '#DC143C' },
      { id: 'serenity', label: '宁静', emotion: { joy: 0.3, sadness: 0.1, anger: 0, fear: 0, surprise: 0, disgust: 0, trust: 0.9, anticipation: 0.1 }, musicalMapping: { preferredScale: [0, 2, 4, 7, 9], preferredRange: [48, 72], rhythmicPattern: [2, 2, 2], tempoBias: -15, articulation: 'legato' }, color: '#87CEEB' },
      { id: 'fear', label: '恐惧', emotion: { joy: 0, sadness: 0.2, anger: 0.1, fear: 0.95, surprise: 0.5, disgust: 0.2, trust: 0, anticipation: 0.6 }, musicalMapping: { preferredScale: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], preferredRange: [50, 80], rhythmicPattern: [0.25, 0.25, 0.5, 0.25, 0.25], tempoBias: 10, articulation: 'glissando' }, color: '#2F2F2F' },
      { id: 'hope', label: '希望', emotion: { joy: 0.6, sadness: 0.1, anger: 0, fear: 0.1, surprise: 0.2, disgust: 0, trust: 0.7, anticipation: 0.8 }, musicalMapping: { preferredScale: [0, 2, 4, 5, 7, 9, 11], preferredRange: [55, 79], rhythmicPattern: [1, 1, 1, 1], tempoBias: 5, articulation: 'legato' }, color: '#FFA500' },
      { id: 'loneliness', label: '孤独', emotion: { joy: 0, sadness: 0.7, anger: 0, fear: 0.4, surprise: 0, disgust: 0.1, trust: 0.1, anticipation: 0.1 }, musicalMapping: { preferredScale: [0, 2, 3, 5, 7, 8, 10], preferredRange: [43, 67], rhythmicPattern: [3, 1], tempoBias: -15, articulation: 'tenuto' }, color: '#708090' },
      { id: 'longing', label: '思念', emotion: { joy: 0.1, sadness: 0.6, anger: 0, fear: 0.1, surprise: 0, disgust: 0, trust: 0.3, anticipation: 0.5 }, musicalMapping: { preferredScale: [0, 2, 3, 5, 7, 8, 10], preferredRange: [50, 74], rhythmicPattern: [1.5, 0.5, 2], tempoBias: -10, articulation: 'legato' }, color: '#9370DB' },
      { id: 'ecstasy', label: '狂喜', emotion: { joy: 0.9, sadness: 0, anger: 0.1, fear: 0, surprise: 0.7, disgust: 0, trust: 0.3, anticipation: 0.6 }, musicalMapping: { preferredScale: [0, 2, 4, 5, 7, 9, 11], preferredRange: [65, 91], rhythmicPattern: [0.5, 0.25, 0.25, 0.5], tempoBias: 30, articulation: 'staccato' }, color: '#FFFF00' },
      { id: 'despair', label: '绝望', emotion: { joy: 0, sadness: 0.8, anger: 0.3, fear: 0.6, surprise: 0.1, disgust: 0.3, trust: 0, anticipation: 0 }, musicalMapping: { preferredScale: [0, 2, 3, 5, 6, 8, 9, 11], preferredRange: [36, 60], rhythmicPattern: [2, 2], tempoBias: -20, articulation: 'tenuto' }, color: '#36454F' },
      { id: 'blue', label: '蓝色', emotion: { joy: 0.1, sadness: 0.4, anger: 0, fear: 0.1, surprise: 0, disgust: 0, trust: 0.6, anticipation: 0.1 }, musicalMapping: { preferredScale: [0, 2, 3, 5, 7, 8, 10], preferredRange: [50, 74], rhythmicPattern: [2, 1, 1], tempoBias: -10, articulation: 'legato' }, color: '#0000FF' },
      { id: 'red', label: '红色', emotion: { joy: 0.4, sadness: 0, anger: 0.7, fear: 0.1, surprise: 0.3, disgust: 0.1, trust: 0.1, anticipation: 0.5 }, musicalMapping: { preferredScale: [0, 2, 3, 5, 6, 8, 9, 11], preferredRange: [55, 79], rhythmicPattern: [0.5, 0.5, 0.5, 0.5], tempoBias: 20, articulation: 'staccato' }, color: '#FF0000' },
      { id: 'gold', label: '金色', emotion: { joy: 0.7, sadness: 0, anger: 0, fear: 0, surprise: 0.2, disgust: 0, trust: 0.8, anticipation: 0.4 }, musicalMapping: { preferredScale: [0, 2, 4, 7, 9], preferredRange: [62, 86], rhythmicPattern: [1, 1, 1, 1], tempoBias: 0, articulation: 'legato' }, color: '#FFD700' },
      { id: 'darkness', label: '黑暗', emotion: { joy: 0, sadness: 0.4, anger: 0.1, fear: 0.7, surprise: 0.2, disgust: 0.1, trust: 0, anticipation: 0.2 }, musicalMapping: { preferredScale: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], preferredRange: [36, 60], rhythmicPattern: [2, 2, 2], tempoBias: -15, articulation: 'tenuto' }, color: '#000000' },
      { id: 'light', label: '光明', emotion: { joy: 0.7, sadness: 0, anger: 0, fear: 0, surprise: 0.3, disgust: 0, trust: 0.8, anticipation: 0.3 }, musicalMapping: { preferredScale: [0, 2, 4, 5, 7, 9, 11], preferredRange: [65, 91], rhythmicPattern: [1, 1, 2], tempoBias: 5, articulation: 'legato' }, color: '#FFFFFF' },
      { id: 'flying', label: '飞翔', emotion: { joy: 0.7, sadness: 0, anger: 0, fear: 0.2, surprise: 0.4, disgust: 0, trust: 0.5, anticipation: 0.6 }, musicalMapping: { preferredScale: [0, 2, 4, 5, 7, 9, 11], preferredRange: [60, 84], rhythmicPattern: [1, 0.5, 1.5, 1], tempoBias: 10, articulation: 'legato' }, color: '#87CEFA' },
      { id: 'falling', label: '坠落', emotion: { joy: 0, sadness: 0.3, anger: 0, fear: 0.8, surprise: 0.5, disgust: 0.1, trust: 0, anticipation: 0.2 }, musicalMapping: { preferredScale: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], preferredRange: [48, 72], rhythmicPattern: [0.5, 0.5, 1, 1], tempoBias: 5, articulation: 'glissando' }, color: '#483D8B' },
      { id: 'time', label: '时间', emotion: { joy: 0.1, sadness: 0.2, anger: 0, fear: 0.2, surprise: 0.1, disgust: 0, trust: 0.5, anticipation: 0.6 }, musicalMapping: { preferredScale: [0, 2, 4, 5, 7, 9, 11], preferredRange: [50, 74], rhythmicPattern: [1, 1, 1, 1], tempoBias: 0, articulation: 'legato' }, color: '#C0C0C0' },
      { id: 'dream', label: '梦境', emotion: { joy: 0.3, sadness: 0.1, anger: 0, fear: 0.2, surprise: 0.5, disgust: 0, trust: 0.4, anticipation: 0.3 }, musicalMapping: { preferredScale: [0, 2, 4, 6, 8, 10], preferredRange: [55, 79], rhythmicPattern: [2, 1, 1, 2], tempoBias: -5, articulation: 'legato' }, color: '#DDA0DD' },
      { id: 'distance', label: '远方', emotion: { joy: 0.1, sadness: 0.4, anger: 0, fear: 0.1, surprise: 0.2, disgust: 0, trust: 0.2, anticipation: 0.6 }, musicalMapping: { preferredScale: [0, 2, 4, 7, 9], preferredRange: [50, 74], rhythmicPattern: [2, 1, 1], tempoBias: -5, articulation: 'tenuto' }, color: '#B0C4DE' },
      { id: 'hometown', label: '故乡', emotion: { joy: 0.3, sadness: 0.4, anger: 0, fear: 0, surprise: 0.1, disgust: 0, trust: 0.8, anticipation: 0.2 }, musicalMapping: { preferredScale: [0, 2, 4, 7, 9], preferredRange: [48, 72], rhythmicPattern: [1.5, 1.5, 1], tempoBias: -10, articulation: 'legato' }, color: '#F4A460' },
      { id: 'parting', label: '离别', emotion: { joy: 0, sadness: 0.8, anger: 0.1, fear: 0.2, surprise: 0.1, disgust: 0, trust: 0.2, anticipation: 0.3 }, musicalMapping: { preferredScale: [0, 2, 3, 5, 7, 8, 10], preferredRange: [48, 72], rhythmicPattern: [2, 1, 1], tempoBias: -15, articulation: 'tenuto' }, color: '#778899' },
      { id: 'reunion', label: '重逢', emotion: { joy: 0.8, sadness: 0.1, anger: 0, fear: 0, surprise: 0.4, disgust: 0, trust: 0.7, anticipation: 0.5 }, musicalMapping: { preferredScale: [0, 2, 4, 5, 7, 9, 11], preferredRange: [55, 79], rhythmicPattern: [1, 1, 1, 1], tempoBias: 5, articulation: 'legato' }, color: '#FF69B4' },
      { id: 'war', label: '战争', emotion: { joy: 0, sadness: 0.4, anger: 0.9, fear: 0.6, surprise: 0.3, disgust: 0.5, trust: 0, anticipation: 0.4 }, musicalMapping: { preferredScale: [0, 2, 3, 5, 6, 8, 9, 11], preferredRange: [45, 72], rhythmicPattern: [0.5, 0.25, 0.25, 0.5], tempoBias: 30, articulation: 'staccato' }, color: '#8B0000' },
      { id: 'peace', label: '和平', emotion: { joy: 0.5, sadness: 0.1, anger: 0, fear: 0, surprise: 0, disgust: 0, trust: 0.9, anticipation: 0.2 }, musicalMapping: { preferredScale: [0, 2, 4, 7, 9], preferredRange: [50, 74], rhythmicPattern: [2, 2, 2], tempoBias: -10, articulation: 'legato' }, color: '#F5FFFA' },
      { id: 'love', label: '爱情', emotion: { joy: 0.7, sadness: 0.2, anger: 0, fear: 0.1, surprise: 0.3, disgust: 0, trust: 0.8, anticipation: 0.5 }, musicalMapping: { preferredScale: [0, 2, 4, 5, 7, 9, 11], preferredRange: [55, 79], rhythmicPattern: [1, 1.5, 0.5, 1], tempoBias: 0, articulation: 'legato' }, color: '#FF1493' },
      { id: 'death', label: '死亡', emotion: { joy: 0, sadness: 0.5, anger: 0.1, fear: 0.7, surprise: 0.2, disgust: 0.2, trust: 0, anticipation: 0 }, musicalMapping: { preferredScale: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], preferredRange: [36, 60], rhythmicPattern: [3, 1], tempoBias: -25, articulation: 'tenuto' }, color: '#1C1C1C' },
      { id: 'rebirth', label: '重生', emotion: { joy: 0.6, sadness: 0.1, anger: 0, fear: 0.1, surprise: 0.5, disgust: 0, trust: 0.6, anticipation: 0.7 }, musicalMapping: { preferredScale: [0, 2, 4, 5, 7, 9, 11], preferredRange: [55, 84], rhythmicPattern: [1, 1, 2], tempoBias: 10, articulation: 'legato' }, color: '#00FA9A' },
    ];
    for (const n of nodes) g.addNode(n);

    const edges: [string, string, number, ConceptEdge['type']][] = [
      ['rain', 'sadness', 0.9, 'semantic'], ['rain', 'longing', 0.6, 'semantic'], ['rain', 'loneliness', 0.5, 'semantic'],
      ['wind', 'flying', 0.8, 'semantic'], ['wind', 'starry', 0.4, 'semantic'],
      ['sea', 'serenity', 0.8, 'semantic'], ['sea', 'longing', 0.5, 'semantic'],
      ['mountain', 'time', 0.5, 'semantic'], ['mountain', 'loneliness', 0.4, 'semantic'],
      ['forest', 'serenity', 0.7, 'semantic'], ['forest', 'joy', 0.5, 'semantic'],
      ['starry', 'dream', 0.8, 'semantic'], ['starry', 'hope', 0.6, 'semantic'],
      ['flame', 'anger', 0.9, 'semantic'], ['flame', 'war', 0.5, 'semantic'],
      ['snow', 'serenity', 0.7, 'semantic'], ['snow', 'sadness', 0.5, 'semantic'], ['snow', 'death', 0.3, 'semantic'],
      ['river', 'time', 0.7, 'semantic'], ['river', 'peace', 0.5, 'semantic'],
      ['fallenLeaf', 'parting', 0.8, 'semantic'], ['fallenLeaf', 'sadness', 0.7, 'semantic'],
      ['joy', 'ecstasy', 0.8, 'semantic'], ['sadness', 'despair', 0.8, 'semantic'],
      ['anger', 'war', 0.8, 'semantic'], ['serenity', 'peace', 0.9, 'semantic'],
      ['fear', 'death', 0.7, 'semantic'], ['hope', 'rebirth', 0.8, 'semantic'],
      ['loneliness', 'parting', 0.7, 'semantic'], ['longing', 'reunion', 0.6, 'semantic'],
      ['longing', 'hometown', 0.8, 'semantic'], ['flying', 'joy', 0.8, 'semantic'],
      ['falling', 'fear', 0.9, 'semantic'], ['time', 'death', 0.5, 'semantic'],
      ['dream', 'starry', 0.7, 'semantic'], ['distance', 'longing', 0.8, 'semantic'],
      ['distance', 'hometown', 0.7, 'semantic'], ['hometown', 'parting', 0.8, 'cultural'],
      ['hometown', 'reunion', 0.6, 'cultural'], ['parting', 'death', 0.4, 'cultural'],
      ['reunion', 'love', 0.8, 'cultural'], ['war', 'death', 0.9, 'cultural'],
      ['peace', 'love', 0.7, 'cultural'], ['love', 'rebirth', 0.5, 'cultural'],
      ['death', 'rebirth', 0.7, 'cultural'], ['blue', 'serenity', 0.9, 'synesthesia'],
      ['blue', 'sadness', 0.7, 'synesthesia'], ['blue', 'rain', 0.6, 'synesthesia'],
      ['red', 'anger', 0.9, 'synesthesia'], ['red', 'flame', 0.8, 'synesthesia'],
      ['red', 'love', 0.5, 'synesthesia'], ['gold', 'hope', 0.9, 'synesthesia'],
      ['gold', 'rebirth', 0.7, 'synesthesia'], ['darkness', 'fear', 0.9, 'synesthesia'],
      ['darkness', 'death', 0.6, 'synesthesia'], ['light', 'joy', 0.9, 'synesthesia'],
      ['light', 'hope', 0.8, 'synesthesia'], ['light', 'starry', 0.7, 'synesthesia'],
      ['light', 'darkness', 0.9, 'contrast'], ['joy', 'sadness', 0.9, 'contrast'],
      ['joy', 'despair', 0.8, 'contrast'], ['anger', 'serenity', 0.8, 'contrast'],
      ['rebirth', 'death', 0.8, 'contrast'], ['hope', 'despair', 0.9, 'contrast'],
      ['flame', 'snow', 0.6, 'contrast'], ['flying', 'falling', 0.9, 'contrast'],
    ];
    for (const [from, to, weight, type] of edges) g.addEdge({ from, to, weight, type });
    return g;
  }
}

// ═════════════════════════════════════════════════════════════
// Part 4: ConsciousnessWalker - 意识游走者
// ═════════════════════════════════════════════════════════════

export class ConsciousnessWalker {
  graph: ConceptGraph;
  currentNodeId: string;
  temperature: number;
  memoryLength: number;
  emotionMomentum: number;
  private history: Array<{ node: ConceptNode; time: number; emotion: EmotionVector }>;
  currentEmotion: EmotionVector;

  constructor(graph: ConceptGraph, params?: {
    startNode?: string;
    temperature?: number;
    memoryLength?: number;
    emotionMomentum?: number;
  }) {
    this.graph = graph;
    this.temperature = params?.temperature ?? 1.0;
    this.memoryLength = params?.memoryLength ?? 4;
    this.emotionMomentum = params?.emotionMomentum ?? 0.5;
    this.history = [];
    const start = params?.startNode ?? Array.from(graph.nodes.keys())[0];
    const startNode = graph.nodes.get(start);
    if (!startNode) throw new Error(`Start node ${start} not found`);
    this.currentNodeId = start;
    this.currentEmotion = { ...startNode.emotion };
    this.history.push({ node: startNode, time: 0, emotion: this.currentEmotion });
  }

  private _stepInternal(emotionBias?: EmotionVector): ConceptNode {
    const neighbors = this.graph.getNeighbors(this.currentNodeId);
    if (neighbors.length === 0) {
      const all = Array.from(this.graph.nodes.values());
      const next = all[Math.floor(Math.random() * all.length)];
      this.currentNodeId = next.id;
      this.currentEmotion = blendEmotion(this.currentEmotion, next.emotion, 1 - this.emotionMomentum);
      this.history.push({ node: next, time: this.history.length, emotion: { ...this.currentEmotion } });
      return next;
    }

    const recentSet = new Set(this.history.slice(-this.memoryLength).map(h => h.node.id));
    let total = 0;
    const weights = neighbors.map(({ node, weight }) => {
      let w = Math.pow(Math.max(0.01, weight), this.temperature);
      if (recentSet.has(node.id)) w *= 0.15;
      if (emotionBias) {
        const sim = emotionSimilarity(node.emotion, emotionBias);
        w *= (1 + sim);
      }
      total += w;
      return w;
    });

    let r = Math.random() * total;
    let chosen = neighbors[0].node;
    for (let i = 0; i < neighbors.length; i++) {
      r -= weights[i];
      if (r <= 0) {
        chosen = neighbors[i].node;
        break;
      }
    }

    this.currentEmotion = blendEmotion(this.currentEmotion, chosen.emotion, 1 - this.emotionMomentum);
    this.currentNodeId = chosen.id;
    this.history.push({ node: chosen, time: this.history.length, emotion: { ...this.currentEmotion } });
    return chosen;
  }

  step(): ConceptNode {
    return this._stepInternal();
  }

  walk(steps: number): ConceptNode[] {
    const path: ConceptNode[] = [];
    for (let i = 0; i < steps; i++) path.push(this.step());
    return path;
  }

  walkWithEmotion(targetEmotion: Partial<EmotionVector>, steps: number): ConceptNode[] {
    const fullTarget: EmotionVector = { joy: 0, sadness: 0, anger: 0, fear: 0, surprise: 0, disgust: 0, trust: 0, anticipation: 0, ...targetEmotion };
    const path: ConceptNode[] = [];
    for (let i = 0; i < steps; i++) path.push(this._stepInternal(fullTarget));
    return path;
  }

  getCurrentEmotion(): EmotionVector {
    return { ...this.currentEmotion };
  }

  getHistory(): Array<{ node: ConceptNode; time: number }> {
    return this.history.map(h => ({ node: h.node, time: h.time }));
  }

  getEmotionTrajectory(): EmotionVector[] {
    return this.history.map(h => h.emotion);
  }
}

// ═════════════════════════════════════════════════════════════
// Part 5: StreamComposer - 意识流作曲家
// ═════════════════════════════════════════════════════════════

export class StreamComposer {
  constructor() {}

  compose(params: {
    path: ConceptNode[];
    bpm: number;
    baseKey?: number;
  }): Array<{ midi: number; startTime: number; duration: number; velocity: number; concept: string }> {
    const { path, bpm, baseKey = 60 } = params;
    const secondsPerBeat = 60 / bpm;
    const notes: Array<{ midi: number; startTime: number; duration: number; velocity: number; concept: string }> = [];
    let currentTime = 0;

    for (let i = 0; i < path.length; i++) {
      const node = path[i];
      const bars = Math.random() > 0.5 ? 2 : 1;
      const beats = bars * 4;
      const segmentEnd = currentTime + beats * secondsPerBeat;

      const emoParams = emotionToMusicParams(node.emotion);
      const scale = node.musicalMapping.preferredScale ?? emoParams.scale;
      const [low, high] = node.musicalMapping.preferredRange ?? [baseKey - 12, baseKey + 24];
      let pattern = node.musicalMapping.rhythmicPattern;
      if (!pattern) {
        pattern = emoParams.noteDensity > 0.8 ? [0.5, 0.5, 0.5, 0.5] :
                  emoParams.noteDensity > 0.5 ? [1, 0.5, 0.5, 1] :
                  emoParams.noteDensity > 0.3 ? [1, 1, 1, 1] : [2, 1, 1];
      }

      const anchorDegrees = [0, 2, 4];
      const anchorDegree = anchorDegrees[Math.floor(Math.random() * anchorDegrees.length)];
      const anchorOctave = Math.floor((low + high) / 2 / 12) * 12;
      let anchorMidi = anchorOctave + scale[anchorDegree % scale.length];
      while (anchorMidi < low) anchorMidi += 12;
      while (anchorMidi > high) anchorMidi -= 12;

      let beatOffset = 0;
      let patternIdx = 0;
      while (beatOffset < beats - 0.01) {
        const beatDuration = pattern[patternIdx % pattern.length];
        const actualBeatDur = Math.min(beatDuration, beats - beatOffset);

        let midi: number;
        if (Math.random() < 0.8) {
          const degOffset = Math.floor(Math.random() * 5) - 2;
          const deg = (anchorDegree + degOffset + scale.length * 10) % scale.length;
          const octShift = Math.floor(Math.random() * 3) - 1;
          midi = anchorMidi + scale[deg] - scale[anchorDegree % scale.length] + octShift * 12;
        } else {
          const deg = Math.floor(Math.random() * scale.length);
          const octShift = Math.floor(Math.random() * 3) - 1;
          midi = baseKey + scale[deg] + octShift * 12;
        }
        midi = Math.max(low, Math.min(high, midi));

        const vMin = emoParams.velocityRange[0];
        const vMax = emoParams.velocityRange[1];
        let velocity = vMin + Math.random() * (vMax - vMin);
        const intensity = Object.values(node.emotion).reduce((a, b) => a + b, 0) / 8;
        velocity = Math.round(Math.min(127, Math.max(1, velocity * (0.7 + 0.6 * intensity))));

        notes.push({
          midi,
          startTime: currentTime + beatOffset * secondsPerBeat,
          duration: actualBeatDur * secondsPerBeat * 0.9,
          velocity,
          concept: node.label,
        });

        beatOffset += actualBeatDur;
        patternIdx++;
      }

      currentTime = segmentEnd;
    }

    // 大跳检测与琶音过渡
    const processed: typeof notes = [];
    for (let i = 0; i < notes.length; i++) {
      processed.push(notes[i]);
      if (i < notes.length - 1) {
        const curr = notes[i];
        const next = notes[i + 1];
        if (curr.concept !== next.concept && Math.abs(next.midi - curr.midi) > 12) {
          const steps = 4;
          const lowMidi = Math.min(curr.midi, next.midi);
          const highMidi = Math.max(curr.midi, next.midi);
          const gapStart = curr.startTime + curr.duration;
          const gapEnd = next.startTime;
          if (gapEnd > gapStart) {
            const stepDur = (gapEnd - gapStart) / steps;
            for (let s = 1; s < steps; s++) {
              processed.push({
                midi: Math.round(lowMidi + ((highMidi - lowMidi) * s) / steps),
                startTime: gapStart + stepDur * s,
                duration: stepDur * 0.8,
                velocity: Math.round((curr.velocity + next.velocity) / 2 * 0.7),
                concept: 'transition',
              });
            }
          }
        }
      }
    }

    return processed;
  }

  composeFromTheme(params: {
    theme: string;
    bpm: number;
    bars?: number;
    baseKey?: number;
    temperature?: number;
    emotionTarget?: Partial<EmotionVector>;
  }): {
    notes: Array<{ midi: number; startTime: number; duration: number; velocity: number; concept: string }>;
    path: ConceptNode[];
    emotionTrajectory: EmotionVector[];
  } {
    const graph = ConceptGraph.createDefaultGraph();
    const walker = new ConsciousnessWalker(graph, {
      startNode: params.theme,
      temperature: params.temperature ?? 1.0,
      memoryLength: 4,
      emotionMomentum: 0.5,
    });
    const steps = params.bars ?? 8;
    const path = params.emotionTarget
      ? walker.walkWithEmotion(params.emotionTarget, steps)
      : walker.walk(steps);
    const emotionTrajectory = walker.getEmotionTrajectory();
    const notes = this.compose({
      path,
      bpm: params.bpm,
      baseKey: params.baseKey ?? 60,
    });
    return { notes, path, emotionTrajectory };
  }
}

// ═════════════════════════════════════════════════════════════
// Part 6: PCM 渲染与导出
// ═════════════════════════════════════════════════════════════

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function renderNotesToPCM(
  notes: Array<{ midi: number; startTime: number; duration: number; velocity: number; concept: string }>,
  totalSeconds: number
): Float32Array {
  const totalSamples = Math.ceil(totalSeconds * SAMPLE_RATE);
  const buffer = new Float32Array(totalSamples);

  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];
    const startSample = Math.floor(note.startTime * SAMPLE_RATE);
    const endSample = Math.floor((note.startTime + note.duration) * SAMPLE_RATE);
    if (startSample >= totalSamples) continue;

    const baseFreq = midiToFreq(note.midi);
    const amp = (note.velocity / 127) * 0.25;
    const attack = Math.floor(0.03 * SAMPLE_RATE);
    const decay = Math.floor(0.08 * SAMPLE_RATE);
    const release = Math.floor(0.06 * SAMPLE_RATE);

    let prevFreq: number | null = null;
    if (i > 0 && notes[i - 1].concept === 'transition') {
      prevFreq = midiToFreq(notes[i - 1].midi);
    }

    for (let s = startSample; s < Math.min(endSample, totalSamples); s++) {
      const rel = s - startSample;
      let env = 1;
      if (rel < attack) env = rel / attack;
      else if (rel < attack + decay) env = 1 - 0.3 * ((rel - attack) / decay);
      else if (s > endSample - release) env = (endSample - s) / release;
      else env = 0.7;

      let freq = baseFreq;
      if (prevFreq && rel < attack) {
        const t = rel / attack;
        freq = prevFreq + (baseFreq - prevFreq) * t;
      }

      const t = (s - startSample) / SAMPLE_RATE;
      const phase = 2 * Math.PI * freq * t;
      const sine = Math.sin(phase);
      const tri = Math.asin(Math.sin(phase)) * (2 / Math.PI);
      buffer[s] += amp * env * (0.6 * sine + 0.4 * tri);
    }
  }

  let peak = 0;
  for (let i = 0; i < buffer.length; i++) peak = Math.max(peak, Math.abs(buffer[i]));
  if (peak > 0.95) {
    const scale = 0.95 / peak;
    for (let i = 0; i < buffer.length; i++) buffer[i] *= scale;
  }
  return buffer;
}

export function generateConsciousnessStream(params: {
  theme?: string;
  bpm?: number;
  bars?: number;
  baseKey?: number;
  temperature?: number;
}): Float32Array {
  const composer = new StreamComposer();
  const result = composer.composeFromTheme({
    theme: params.theme ?? 'rain',
    bpm: params.bpm ?? 80,
    bars: params.bars ?? 8,
    baseKey: params.baseKey ?? 60,
    temperature: params.temperature ?? 1.0,
  });
  const totalSeconds = result.notes.length > 0
    ? result.notes[result.notes.length - 1].startTime + result.notes[result.notes.length - 1].duration + 1
    : 4;
  return renderNotesToPCM(result.notes, totalSeconds);
}
