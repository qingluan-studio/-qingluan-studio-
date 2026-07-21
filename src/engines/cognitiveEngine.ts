// ============================================================
// 青鸾 DAW - 认知涌现引擎 (CEE Adaptation)
// 源自: github.com/qingluan-studio/-cognitive-phase-space-
// 146万行Python代码中提取核心算法，转译为TypeScript
// 适配音乐创作场景
// ============================================================

// ═════════════════════════════════════════════════════════════
// Part 1: 核心类型定义
// ═════════════════════════════════════════════════════════════

export interface InvariantScores {
  itc: number;   // Information Topological Compactness
  scs: number;   // Surface Curvature Smoothness
  iec: number;   // Information Entropy Criticality
  pfft: number;  // Projection Fidelity-Flexibility Tradeoff
  overall: number;
}

export interface QualityTier {
  tier: 'excellent' | 'good' | 'acceptable' | 'poor';
  threshold: number;
}

export interface MusicAnalysisResult {
  scores: InvariantScores;
  tier: QualityTier;
  breakdown: Record<string, number>;
  suggestions: string[];
}

// ═════════════════════════════════════════════════════════════
// Part 2: T6 — 认知几何不变量引擎 (工程版)
// 四大不变量评估音乐/歌词/创作的认知质量
// ═════════════════════════════════════════════════════════════

export class CognitiveInvariantEngine {
  itcWeight: number;
  scsWeight: number;
  iecWeight: number;
  pfftWeight: number;
  entropyIdeal: number | null;

  constructor(opts?: {
    itcWeight?: number;
    scsWeight?: number;
    iecWeight?: number;
    pfftWeight?: number;
    entropyIdeal?: number | null;
  }) {
    this.itcWeight = opts?.itcWeight ?? 0.25;
    this.scsWeight = opts?.scsWeight ?? 0.25;
    this.iecWeight = opts?.iecWeight ?? 0.25;
    this.pfftWeight = opts?.pfftWeight ?? 0.25;
    this.entropyIdeal = opts?.entropyIdeal ?? null;
  }

  // 分词
  private _tokenize(text: string, n = 1): string[] {
    const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 0);
    if (n === 1) return words;
    const ngrams: string[] = [];
    for (let i = 0; i <= words.length - n; i++) {
      ngrams.push(words.slice(i, i + n).join(' '));
    }
    return ngrams;
  }

  // 句子长度统计
  private _sentenceSizes(text: string): number[] {
    const sentences = text.replace(/[!?]/g, '.').split('.').map(s => s.trim()).filter(s => s.length > 0);
    return sentences.map(s => s.split(/\s+/).filter(w => w.length > 0).length);
  }

  // 段落句子长度统计
  private _paragraphSizes(text: string): number[][] {
    const paragraphs = text.split('\n\n').map(p => p.trim()).filter(p => p.length > 0);
    return paragraphs.map(p => this._sentenceSizes(p));
  }

  // 香农熵
  private _shannonEntropy(counter: Map<string, number>): number {
    const total = Array.from(counter.values()).reduce((a, b) => a + b, 0);
    if (total === 0) return 0;
    let entropy = 0;
    for (const count of counter.values()) {
      const p = count / total;
      if (p > 0) entropy -= p * Math.log2(p + 1e-12);
    }
    return entropy;
  }

  // 基尼系数
  private _giniCoefficient(values: number[]): number {
    if (!values.length || values.reduce((a, b) => a + b, 0) === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const n = sorted.length;
    let sumIndex = 0;
    for (let i = 0; i < n; i++) sumIndex += (i + 1) * sorted[i];
    const sum = sorted.reduce((a, b) => a + b, 0);
    return (2 * sumIndex - (n + 1) * sum) / (n * sum + 1e-12);
  }

  // TF-IDF矩阵（简化版）
  private _tfidfMatrix(text: string): number[][] {
    const paragraphs = text.split('\n\n').map(p => p.trim()).filter(p => p.length > 0);
    if (paragraphs.length < 2) return [[0]];

    const wordsPerPara = paragraphs.map(p => p.toLowerCase().split(/\s+/).filter(w => w.length > 0));
    const allWordsSet = new Set<string>();
    for (const words of wordsPerPara) for (const w of words) allWordsSet.add(w);
    const allWords = Array.from(allWordsSet).sort();
    if (!allWords.length) return new Array(paragraphs.length).fill([0]);

    const V = allWords.length;
    const D = paragraphs.length;
    const word2idx = new Map(allWords.map((w, i) => [w, i]));

    const tf: number[][] = Array.from({ length: D }, () => new Array(V).fill(0));
    for (let d = 0; d < D; d++) {
      for (const w of wordsPerPara[d]) {
        const idx = word2idx.get(w);
        if (idx !== undefined) tf[d][idx]++;
      }
      const rowSum = tf[d].reduce((a, b) => a + b, 0);
      if (rowSum > 0) for (let i = 0; i < V; i++) tf[d][i] /= rowSum;
    }

    const df = new Array(V).fill(0);
    for (let v = 0; v < V; v++) {
      for (let d = 0; d < D; d++) if (tf[d][v] > 0) df[v]++;
    }

    const idf = df.map(d => Math.log((D + 1) / (d + 1)) + 1);
    for (let d = 0; d < D; d++) {
      for (let v = 0; v < V; v++) tf[d][v] *= idf[v];
    }
    return tf;
  }

  // 余弦相似度
  private _cosineSimilarity(a: number[], b: number[]): number {
    const normA = Math.sqrt(a.reduce((s, x) => s + x * x, 0));
    const normB = Math.sqrt(b.reduce((s, x) => s + x * x, 0));
    if (normA === 0 || normB === 0) return 0;
    const dot = a.reduce((s, x, i) => s + x * b[i], 0);
    return dot / (normA * normB);
  }

  // ITC: 信息拓扑紧致度
  computeITC(text: string): number {
    const tokens = this._tokenize(text);
    if (!tokens.length) return 0;
    const counter = new Map<string, number>();
    for (const t of tokens) counter.set(t, (counter.get(t) || 0) + 1);
    const uniqueRatio = counter.size / tokens.length;
    const redundancy = 1.0 - uniqueRatio;
    const dispersion = this._giniCoefficient(Array.from(counter.values()));
    const itc = 1.0 - redundancy * dispersion;
    return Math.max(0, Math.min(1, itc));
  }

  // SCS: 表面曲率平滑度
  computeSCS(text: string): number {
    const paragraphs = text.split('\n\n').map(p => p.trim()).filter(p => p.length > 0);
    if (paragraphs.length < 2) return 0.8;
    const tfidf = this._tfidfMatrix(text);
    if (tfidf.length < 2) return 0.8;
    const similarities: number[] = [];
    for (let i = 0; i < tfidf.length - 1; i++) {
      similarities.push(this._cosineSimilarity(tfidf[i], tfidf[i + 1]));
    }
    const avgSim = similarities.reduce((a, b) => a + b, 0) / similarities.length;
    const stdSim = similarities.length > 1
      ? Math.sqrt(similarities.reduce((s, x) => s + (x - avgSim) ** 2, 0) / similarities.length)
      : 0;
    const scs = avgSim * (1.0 - Math.min(stdSim, 0.5));
    return Math.max(0, Math.min(1, scs));
  }

  // IEC: 信息熵临界度
  computeIEC(text: string): number {
    const tokens = this._tokenize(text);
    if (!tokens.length) return 0;
    const wordCounter = new Map<string, number>();
    for (const t of tokens) wordCounter.set(t, (wordCounter.get(t) || 0) + 1);
    const wordEntropy = this._shannonEntropy(wordCounter);

    const sentSizes = this._sentenceSizes(text);
    let sentEntropy = 0;
    if (sentSizes.length) {
      const sentCounter = new Map<number, number>();
      for (const s of sentSizes) sentCounter.set(s, (sentCounter.get(s) || 0) + 1);
      sentEntropy = this._shannonEntropy(sentCounter as any);
    }

    const bigrams = this._tokenize(text, 2);
    let bigramEntropy = 0;
    if (bigrams.length) {
      const biCounter = new Map<string, number>();
      for (const b of bigrams) biCounter.set(b, (biCounter.get(b) || 0) + 1);
      bigramEntropy = this._shannonEntropy(biCounter);
    }

    const compositeEntropy = 0.4 * wordEntropy + 0.3 * sentEntropy + 0.3 * bigramEntropy;
    let idealLow = 3.5, idealHigh = 6.5;
    if (this.entropyIdeal !== null) {
      idealLow = this.entropyIdeal - 1.5;
      idealHigh = this.entropyIdeal + 1.5;
    }

    let iec: number;
    if (idealLow <= compositeEntropy && compositeEntropy <= idealHigh) iec = 1.0;
    else if (compositeEntropy < idealLow) iec = compositeEntropy / idealLow;
    else iec = Math.max(0, 1.0 - (compositeEntropy - idealHigh) / idealHigh);
    return Math.max(0, Math.min(1, iec));
  }

  // PFFT: 投影保真-灵活权衡
  computePFFT(text: string): number {
    const tokens = this._tokenize(text);
    if (!tokens.length) return 0;

    const stopWords = new Set([
      'the','a','an','is','are','was','were','be','been','being','have','has','had','do','does','did',
      'will','would','could','should','may','might','shall','can','to','of','in','for','on','with',
      'at','by','from','as','into','through','during','before','after','above','below','between',
      'and','but','or','nor','not','so','yet','both','either','neither','each','every','all','any',
      'few','more','most','other','some','such','no','only','own','same','than','too','very','just',
      'about','also','if','then','else','when','where','why','how','it','its','this','that','these',
      'those','i','we','you','he','she','they','me','him','her','us','them','my','your','his','our',
      'their','what','which','who','whom','whose','的','了','在','是','我','有','和','就','不','人',
      '都','一','一个','上','也','很','到','说','要','去','你','会','着','没有','看','好','自己','这',
    ]);

    const contentWords = tokens.filter(t => !stopWords.has(t));
    const precision = tokens.length ? contentWords.length / tokens.length : 0;

    const sentSizes = this._sentenceSizes(text);
    let diversity = 0.5;
    if (sentSizes.length >= 2) {
      const meanS = sentSizes.reduce((a, b) => a + b, 0) / sentSizes.length;
      const stdS = Math.sqrt(sentSizes.reduce((s, x) => s + (x - meanS) ** 2, 0) / sentSizes.length);
      const cv = meanS > 0 ? stdS / meanS : 0;
      diversity = Math.min(cv / 0.8, 1.0);
    }

    if (precision + diversity === 0) return 0;
    const pfft = 2 * precision * diversity / (precision + diversity);
    return Math.max(0, Math.min(1, pfft));
  }

  // 综合评估
  evaluate(text: string): InvariantScores {
    const itc = this.computeITC(text);
    const scs = this.computeSCS(text);
    const iec = this.computeIEC(text);
    const pfft = this.computePFFT(text);
    const overall = itc * this.itcWeight + scs * this.scsWeight + iec * this.iecWeight + pfft * this.pfftWeight;
    return { itc, scs, iec, pfft, overall };
  }

  // 评估音乐歌词
  evaluateLyrics(lyrics: string): MusicAnalysisResult {
    const scores = this.evaluate(lyrics);
    const tier = this._determineTier(scores.overall);
    const breakdown = {
      '信息密度(ITC)': scores.itc,
      '结构平滑(SCS)': scores.scs,
      '熵临界度(IEC)': scores.iec,
      '保真灵活(PFFT)': scores.pfft,
    };
    const suggestions = this._generateSuggestions(scores);
    return { scores, tier, breakdown, suggestions };
  }

  // 评估旋律结构（使用音符序列）
  evaluateMelody(notes: string[], durations: number[]): MusicAnalysisResult {
    const noteText = notes.join(' ');
    const durText = durations.map(d => String(Math.round(d * 100) / 100)).join(' ');
    const combined = noteText + ' ' + durText;
    const scores = this.evaluate(combined);
    const tier = this._determineTier(scores.overall);
    const breakdown = {
      '音高多样性(ITC)': scores.itc,
      '乐句连贯(SCS)': scores.scs,
      '节奏复杂度(IEC)': scores.iec,
      '风格一致(PFFT)': scores.pfft,
    };
    const suggestions = this._generateSuggestions(scores);
    return { scores, tier, breakdown, suggestions };
  }

  private _determineTier(score: number): QualityTier {
    if (score >= 0.85) return { tier: 'excellent', threshold: 0.85 };
    if (score >= 0.65) return { tier: 'good', threshold: 0.65 };
    if (score >= 0.45) return { tier: 'acceptable', threshold: 0.45 };
    return { tier: 'poor', threshold: 0 };
  }

  private _generateSuggestions(scores: InvariantScores): string[] {
    const suggestions: string[] = [];
    if (scores.itc < 0.5) suggestions.push('信息密度偏低，建议增加词汇/音高多样性');
    if (scores.scs < 0.5) suggestions.push('结构过渡不够平滑，建议调整段落衔接');
    if (scores.iec < 0.5) suggestions.push('复杂度偏离理想区间，建议平衡简单与复杂元素');
    if (scores.pfft < 0.5) suggestions.push('保真度与灵活性失衡，建议在风格一致与变化间找平衡');
    if (scores.overall >= 0.85) suggestions.push('整体质量优秀！');
    else if (scores.overall >= 0.65) suggestions.push('整体质量良好，可进一步优化细节');
    return suggestions.length ? suggestions : ['各项指标平衡，无明显改进建议'];
  }
}

// ═════════════════════════════════════════════════════════════
// Part 3: T1 — 认知同构引擎 (Mirror Engine)
// 音乐风格路标提取 + 镜像生成
// ═════════════════════════════════════════════════════════════

export interface Waypoint {
  entity: string;
  logicType: string;
  position: number;
  importance: number;
}

export class CognitiveMirrorEngine {
  signpostDensity: number;
  purifyNgram: number;
  private stopWords: Set<string>;
  private logicPatterns: Record<string, string[]>;

  constructor(signpostDensity = 0.3, purifyNgram = 7) {
    this.signpostDensity = signpostDensity;
    this.purifyNgram = purifyNgram;
    this.stopWords = new Set([
      'the','a','an','is','are','was','were','be','been','being','have','has','had','do','does','did',
      'will','would','could','should','may','might','shall','to','of','in','for','on','with','at',
      'by','from','as','and','but','or','nor','not','so','yet','if','then','it','its','this','that',
      'these','those','i','we','you','he','she','they','me','him','her','us','them','的','了','在',
      '是','我','有','和','就','不','人','都','一','上','也','很','到','说','要','去','你','会',
    ]);
    this.logicPatterns = {
      cause: ['because','since','due to','as a result','therefore','thus','hence','consequently','因为','由于','所以','因此'],
      contrast: ['however','but','although','yet','while','whereas','despite','nevertheless','但是','然而','虽然','尽管'],
      addition: ['moreover','furthermore','additionally','also','besides','likewise','similarly','而且','此外','另外','同时'],
      statement: ['is','are','was','were','defines','refers to','means','represents','consists of','是','即','指'],
      example: ['for example','for instance','such as','namely','illustrated by','例如','比如','譬如'],
      conclusion: ['in conclusion','finally','ultimately','in summary','to summarize','总之','综上所述','最后'],
    };
  }

  // 提取路标
  extractSignposts(text: string): string[] {
    const sentences = text.split(/[.!?。！？]+/).map(s => s.trim()).filter(s => s.length > 0);
    if (!sentences.length) return [];

    const sentTokens: string[][] = [];
    const allTokens: string[] = [];
    for (const sent of sentences) {
      const tokens = (sent.match(/\w+/g) || [])
        .map(t => t.toLowerCase())
        .filter(t => !this.stopWords.has(t) && t.length > 1);
      sentTokens.push(tokens);
      allTokens.push(...tokens);
    }
    if (!allTokens.length) return [];

    const counter = new Map<string, number>();
    for (const t of allTokens) counter.set(t, (counter.get(t) || 0) + 1);
    const total = allTokens.length;

    const tfidfScores = new Map<string, number>();
    for (const [word, freq] of counter) {
      const tf = freq / total;
      const docFreq = sentTokens.filter(tokens => tokens.includes(word)).length;
      const idf = Math.log((sentences.length + 1) / (docFreq + 1)) + 1;
      tfidfScores.set(word, tf * idf);
    }

    const sorted = Array.from(tfidfScores.entries()).sort((a, b) => b[1] - a[1]);
    const nSignposts = Math.max(3, Math.floor(sorted.length * this.signpostDensity));
    return sorted.slice(0, nSignposts).map(([w]) => w);
  }

  // 提取路标节点
  extractWaypoints(text: string): Waypoint[] {
    const waypoints: Waypoint[] = [];
    const sentences = text.split(/[.!?。！？]+/).map(s => s.trim()).filter(s => s.length > 0);
    for (let i = 0; i < sentences.length; i++) {
      const tokens = (sentences[i].match(/\w+/g) || [])
        .map(t => t.toLowerCase())
        .filter(t => !this.stopWords.has(t) && t.length > 1);
      if (!tokens.length) continue;

      const entity = this._extractCenterEntity(sentences[i], tokens);
      const logicType = this._classifyLogicFunction(sentences[i]);
      const uniqueRatio = new Set(tokens).size / tokens.length;
      const importance = 0.3 + 0.7 * uniqueRatio;

      waypoints.push({ entity, logicType, position: i, importance });
    }
    return waypoints;
  }

  private _extractCenterEntity(sentence: string, tokens: string[]): string {
    if (!tokens.length) return 'unknown';
    const counter = new Map<string, number>();
    for (const t of tokens) counter.set(t, (counter.get(t) || 0) + 1);
    const sorted = Array.from(counter.entries()).sort((a, b) => b[1] - a[1]);
    return sorted[0]?.[0] || 'unknown';
  }

  private _classifyLogicFunction(sentence: string): string {
    const lower = sentence.toLowerCase();
    for (const [logicType, patterns] of Object.entries(this.logicPatterns)) {
      for (const pattern of patterns) {
        if (lower.includes(pattern)) return logicType;
      }
    }
    return 'statement';
  }

  // 命题覆盖率
  computePropositionCoverage(signpostsA: string[], signpostsB: string[]): number {
    if (!signpostsA.length) return 0;
    const setA = new Set(signpostsA);
    const setB = new Set(signpostsB);
    const intersection = new Set([...setA].filter(x => setB.has(x)));
    return intersection.size / setA.size;
  }

  // 双向同构验证
  verifyIsomorphism(textA: string, textB: string, threshold = 0.9): { isIsomorphic: boolean; mutualCoverage: number } {
    const spA = this.extractSignposts(textA);
    const spB = this.extractSignposts(textB);
    const covAB = this.computePropositionCoverage(spA, spB);
    const covBA = this.computePropositionCoverage(spB, spA);
    const mutual = (covAB + covBA) / 2.0;
    return { isIsomorphic: mutual >= threshold, mutualCoverage: mutual };
  }

  // 结构指纹
  computeStructuralFingerprint(text: string): string {
    const signposts = this.extractSignposts(text);
    if (signposts.length < 2) {
      return this._simpleHash(signposts.sort().join(','));
    }
    const pairs: string[] = [];
    const sorted = signposts.sort();
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        pairs.push(`${sorted[i]}>${sorted[j]}`);
      }
    }
    return this._simpleHash(pairs.slice(0, 50).join(';'));
  }

  private _simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(16, '0').slice(0, 16);
  }

  // 生成路标图
  generateWaypointMap(text: string): { waypoints: Waypoint[]; structure: any } {
    const waypoints = this.extractWaypoints(text);
    return {
      waypoints,
      structure: this._summarizeLogicStructure(waypoints),
    };
  }

  private _summarizeLogicStructure(waypoints: Waypoint[]): any {
    const logicCounts = new Map<string, number>();
    for (const wp of waypoints) logicCounts.set(wp.logicType, (logicCounts.get(wp.logicType) || 0) + 1);

    const transitions: string[] = [];
    for (let i = 0; i < waypoints.length - 1; i++) {
      transitions.push(`${waypoints[i].logicType}->${waypoints[i + 1].logicType}`);
    }
    const transitionCounter = new Map<string, number>();
    for (const t of transitions) transitionCounter.set(t, (transitionCounter.get(t) || 0) + 1);
    const sortedTransitions = Array.from(transitionCounter.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);

    return {
      logicDistribution: Object.fromEntries(logicCounts),
      transitionPattern: sortedTransitions,
      totalWaypoints: waypoints.length,
    };
  }

  // 镜像生成：基于路标生成等价表达
  mirrorGenerate(text: string, styleHint = 'academic', minFidelity = 0.5): string {
    const signposts = this.extractSignposts(text);
    if (!signposts.length) return text;
    const waypoints = this.extractWaypoints(text);

    const parts: string[] = [];
    for (let i = 0; i < waypoints.length; i++) {
      const wp = waypoints[i];
      const connector = this._getConnector(wp.logicType);
      if (i > 0) parts.push(` ${connector} `);
      parts.push(this._generateEntityDescription(wp.entity, styleHint));
    }
    return parts.join('');
  }

  private _getConnector(logicType: string): string {
    const map: Record<string, string[]> = {
      cause: ['因此', '所以', '于是', '从而'],
      contrast: ['然而', '但是', '不过', '尽管如此'],
      addition: ['此外', '而且', '同时', '另外'],
      statement: ['', '即', '也就是说'],
      example: ['例如', '比如', '譬如'],
      conclusion: ['总之', '综上所述', '最终'],
    };
    const arr = map[logicType] || map.statement;
    return arr[Math.floor(Math.random() * arr.length)];
  }

  private _generateEntityDescription(entity: string, styleHint: string): string {
    const templates: Record<string, string[]> = {
      academic: [`关于${entity}的研究表明`, `${entity}的核心概念在于`, `从${entity}的角度分析`],
      poetic: [`${entity}如风吹过`, `${entity}在梦中低语`, `与${entity}共舞的时光`],
      narrative: [`说起${entity}的故事`, `记得那个关于${entity}的日子`, `${entity}就这样走进了生活`],
    };
    const arr = templates[styleHint] || templates.narrative;
    return arr[Math.floor(Math.random() * arr.length)];
  }
}

// ═════════════════════════════════════════════════════════════
// Part 4: 自学习引擎 (AutoLearner + FeedbackStore)
// 反馈收集、模式识别、超参数自动调优
// ═════════════════════════════════════════════════════════════

export type FeedbackType = 'explicit' | 'implicit' | 'a_b_test' | 'automatic';
export type FeedbackSentiment = 'positive' | 'negative' | 'neutral';

export interface FeedbackRecord {
  recordId: string;
  feedbackType: FeedbackType;
  sentiment: FeedbackSentiment;
  score: number;
  context: Record<string, any>;
  message: string;
  timestamp: string;
  weight: number;
  tags: string[];
}

export interface LearningInsight {
  insightId: string;
  name: string;
  description: string;
  confidence: number;
  evidenceCount: number;
  recommendation: string;
  category: string;
  timestamp: string;
}

export interface ModelSnapshot {
  snapshotId: string;
  name: string;
  params: Record<string, any>;
  score: number;
  timestamp: string;
  metadata: Record<string, any>;
}

export class FeedbackStore {
  private _records: FeedbackRecord[] = [];
  private _maxRecords: number;
  private _positiveCount = 0;
  private _negativeCount = 0;
  private _neutralCount = 0;

  constructor(maxRecords = 10000) {
    this._maxRecords = maxRecords;
  }

  private _genId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  addFeedback(record: FeedbackRecord): void {
    this._records.push(record);
    if (record.sentiment === 'positive') this._positiveCount++;
    else if (record.sentiment === 'negative') this._negativeCount++;
    else this._neutralCount++;

    if (this._records.length > this._maxRecords) {
      const removed = this._records.shift()!;
      this._adjustCounts(removed, -1);
    }
  }

  add(score: number, feedbackType: FeedbackType = 'explicit', message = '',
      context: Record<string, any> = {}, tags: string[] = []): FeedbackRecord {
    let sentiment: FeedbackSentiment = 'neutral';
    if (score >= 0.7) sentiment = 'positive';
    else if (score <= 0.3) sentiment = 'negative';

    const record: FeedbackRecord = {
      recordId: this._genId(),
      feedbackType,
      sentiment,
      score,
      context,
      message,
      timestamp: new Date().toISOString(),
      weight: 1.0,
      tags,
    };
    this.addFeedback(record);
    return record;
  }

  private _adjustCounts(record: FeedbackRecord, delta: number): void {
    if (record.sentiment === 'positive') this._positiveCount += delta;
    else if (record.sentiment === 'negative') this._negativeCount += delta;
    else this._neutralCount += delta;
  }

  getRecent(limit = 50): FeedbackRecord[] {
    return this._records.slice(-limit);
  }

  getPositiveRatio(window?: number): number {
    const records = window ? this._records.slice(-window) : this._records;
    if (!records.length) return 0.5;
    return records.filter(r => r.sentiment === 'positive').length / records.length;
  }

  getAverageScore(window?: number): number {
    const records = window ? this._records.slice(-window) : this._records;
    if (!records.length) return 0.5;
    const weightedSum = records.reduce((s, r) => s + r.score * r.weight, 0);
    const weightSum = records.reduce((s, r) => s + r.weight, 0);
    return weightedSum / weightSum;
  }

  getByTags(tags: string[]): FeedbackRecord[] {
    return this._records.filter(r => r.tags.some(t => tags.includes(t)));
  }

  getStats(): Record<string, any> {
    const total = this._records.length;
    return {
      total,
      positive: this._positiveCount,
      negative: this._negativeCount,
      neutral: this._neutralCount,
      positiveRatio: this._positiveCount / Math.max(1, total),
      averageScore: this.getAverageScore(),
      recentPositiveRatio: this.getPositiveRatio(100),
    };
  }

  reset(): void {
    this._records = [];
    this._positiveCount = 0;
    this._negativeCount = 0;
    this._neutralCount = 0;
  }

  export(): FeedbackRecord[] {
    return [...this._records];
  }

  import(records: FeedbackRecord[]): void {
    this._records = [...records];
    this._positiveCount = records.filter(r => r.sentiment === 'positive').length;
    this._negativeCount = records.filter(r => r.sentiment === 'negative').length;
    this._neutralCount = records.filter(r => r.sentiment === 'neutral').length;
  }
}

export class AutoLearner {
  feedback: FeedbackStore;
  private _insights: LearningInsight[] = [];
  private _paramHistory: ModelSnapshot[] = [];
  private _bestSnapshot: ModelSnapshot | null = null;

  constructor(feedbackStore?: FeedbackStore) {
    this.feedback = feedbackStore || new FeedbackStore();
  }

  get insights(): LearningInsight[] {
    return [...this._insights];
  }

  get bestSnapshot(): ModelSnapshot | null {
    return this._bestSnapshot;
  }

  recordPerformance(name: string, params: Record<string, any>, score: number, metadata: Record<string, any> = {}): ModelSnapshot {
    const snapshot: ModelSnapshot = {
      snapshotId: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      name,
      params,
      score,
      timestamp: new Date().toISOString(),
      metadata,
    };
    this._paramHistory.push(snapshot);
    if (this._paramHistory.length > 100) this._paramHistory.shift();
    if (!this._bestSnapshot || score > this._bestSnapshot.score) {
      this._bestSnapshot = snapshot;
    }
    return snapshot;
  }

  analyze(): LearningInsight[] {
    const newInsights: LearningInsight[] = [];
    const feedbackInsight = this._analyzeFeedback();
    if (feedbackInsight) newInsights.push(feedbackInsight);
    const paramInsight = this._analyzeParams();
    if (paramInsight) newInsights.push(paramInsight);
    const trendInsight = this._analyzeTrends();
    if (trendInsight) newInsights.push(trendInsight);
    this._insights.push(...newInsights);
    if (this._insights.length > 200) this._insights = this._insights.slice(-200);
    return newInsights;
  }

  private _analyzeFeedback(): LearningInsight | null {
    const stats = this.feedback.getStats();
    if (stats.total < 5) return null;
    const posRatio = stats.positiveRatio;
    if (posRatio < 0.3) {
      return {
        insightId: this._genId(),
        name: 'low_satisfaction_alert',
        description: `用户满意度严重偏低 (${(posRatio * 100).toFixed(1)}% 正面)`,
        confidence: 1.0 - posRatio,
        evidenceCount: stats.total,
        recommendation: '建议降低质量阈值，检查近期输出并调整参数',
        category: 'quality',
        timestamp: new Date().toISOString(),
      };
    }
    if (posRatio > 0.85) {
      return {
        insightId: this._genId(),
        name: 'high_satisfaction',
        description: `用户满意度很高 (${(posRatio * 100).toFixed(1)}% 正面)`,
        confidence: posRatio,
        evidenceCount: stats.total,
        recommendation: '可尝试提高复杂度上限，探索更激进的创作风格',
        category: 'quality',
        timestamp: new Date().toISOString(),
      };
    }
    return null;
  }

  private _analyzeParams(): LearningInsight | null {
    if (this._paramHistory.length < 10) return null;
    const recent = this._paramHistory.slice(-20);
    const scores = recent.map(s => s.score);
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    const bestIdx = scores.indexOf(Math.max(...scores));
    const worstIdx = scores.indexOf(Math.min(...scores));
    const best = recent[bestIdx];
    const worst = recent[worstIdx];

    if (best.score - worst.score < 0.1) return null;

    const diffs: Record<string, number> = {};
    for (const key of Object.keys(best.params)) {
      const b = best.params[key];
      const w = worst.params[key];
      if (typeof b === 'number' && typeof w === 'number') {
        diffs[key] = b - w;
      }
    }
    const topDiff = Object.entries(diffs).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0];
    if (!topDiff) return null;

    return {
      insightId: this._genId(),
      name: 'param_correlation',
      description: `参数 "${topDiff[0]}" 与得分强相关 (最佳=${best.score.toFixed(3)}, 最差=${worst.score.toFixed(3)})`,
      confidence: Math.min(Math.abs(best.score - worst.score) * 2, 0.95),
      evidenceCount: recent.length,
      recommendation: `建议将 "${topDiff[0]}" 向 ${topDiff[1] > 0 ? '增大' : '减小'} 方向调整`,
      category: 'parameter',
      timestamp: new Date().toISOString(),
    };
  }

  private _analyzeTrends(): LearningInsight | null {
    if (this._paramHistory.length < 15) return null;
    const recent = this._paramHistory.slice(-15);
    const scores = recent.map(s => s.score);
    const firstHalf = scores.slice(0, 7).reduce((a, b) => a + b, 0) / 7;
    const secondHalf = scores.slice(7).reduce((a, b) => a + b, 0) / Math.max(1, scores.length - 7);
    const diff = secondHalf - firstHalf;

    if (Math.abs(diff) < 0.05) return null;

    return {
      insightId: this._genId(),
      name: diff > 0 ? 'improving_trend' : 'declining_trend',
      description: diff > 0
        ? `近期得分呈上升趋势 (+${(diff * 100).toFixed(1)}%)`
        : `近期得分呈下降趋势 (${(diff * 100).toFixed(1)}%)`,
      confidence: Math.min(Math.abs(diff) * 3, 0.9),
      evidenceCount: recent.length,
      recommendation: diff > 0
        ? '当前策略有效，继续保持并记录成功配置'
        : '检测到性能下滑，建议回滚到最近的最佳快照',
      category: 'trend',
      timestamp: new Date().toISOString(),
    };
  }

  recommendParams(currentParams: Record<string, number>): Record<string, number> {
    if (!this._bestSnapshot) return currentParams;
    const recommended: Record<string, number> = { ...currentParams };
    for (const [key, val] of Object.entries(this._bestSnapshot.params)) {
      if (typeof val === 'number' && typeof currentParams[key] === 'number') {
        recommended[key] = currentParams[key] * 0.7 + val * 0.3;
      }
    }
    return recommended;
  }

  private _genId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  exportState(): any {
    return {
      insights: this._insights,
      paramHistory: this._paramHistory,
      bestSnapshot: this._bestSnapshot,
      feedback: this.feedback.export(),
    };
  }

  importState(state: any): void {
    this._insights = state.insights || [];
    this._paramHistory = state.paramHistory || [];
    this._bestSnapshot = state.bestSnapshot || null;
    if (state.feedback) this.feedback.import(state.feedback);
  }
}

// ═════════════════════════════════════════════════════════════
// Part 5: 多智能体编排器 (Multi-Agent Orchestrator)
// plan → delegate → execute → review → synthesize
// ═════════════════════════════════════════════════════════════

export interface AgentTask {
  taskId: string;
  name: string;
  description: string;
  agentType: string;
  params: Record<string, any>;
  dependencies: string[];
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: any;
  error?: string;
}

export interface Agent {
  id: string;
  name: string;
  type: string;
  capabilities: string[];
  execute(task: AgentTask): Promise<any>;
}

export class SimpleAgent implements Agent {
  id: string;
  name: string;
  type: string;
  capabilities: string[];
  private _handler: (task: AgentTask) => Promise<any>;

  constructor(name: string, type: string, capabilities: string[], handler: (task: AgentTask) => Promise<any>) {
    this.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    this.name = name;
    this.type = type;
    this.capabilities = capabilities;
    this._handler = handler;
  }

  async execute(task: AgentTask): Promise<any> {
    return this._handler(task);
  }
}

export class AgentOrchestrator {
  private _agents: Map<string, Agent> = new Map();
  private _taskHistory: AgentTask[] = [];

  registerAgent(agent: Agent): void {
    this._agents.set(agent.id, agent);
  }

  getAgentsByCapability(capability: string): Agent[] {
    return Array.from(this._agents.values()).filter(a => a.capabilities.includes(capability));
  }

  // Plan: 分解任务
  plan(goal: string, params: Record<string, any> = {}): AgentTask[] {
    const tasks: AgentTask[] = [];
    const taskId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

    if (goal.includes('作曲') || goal.includes('旋律')) {
      const t1: AgentTask = { taskId: taskId(), name: '旋律生成', description: '生成主旋律', agentType: 'composer', params, dependencies: [], status: 'pending' };
      const t2: AgentTask = { taskId: taskId(), name: '和声编排', description: '为主旋律配和声', agentType: 'arranger', params, dependencies: [t1.taskId], status: 'pending' };
      const t3: AgentTask = { taskId: taskId(), name: '歌词创作', description: '根据旋律创作歌词', agentType: 'lyricist', params, dependencies: [t1.taskId], status: 'pending' };
      tasks.push(t1, t2, t3);
    } else if (goal.includes('人声') || goal.includes('歌声')) {
      const t1: AgentTask = { taskId: taskId(), name: '歌词解析', description: '解析歌词为音符', agentType: 'parser', params, dependencies: [], status: 'pending' };
      const t2: AgentTask = { taskId: taskId(), name: '人声合成', description: '合成真人声', agentType: 'vocalist', params, dependencies: [t1.taskId], status: 'pending' };
      tasks.push(t1, t2);
    } else if (goal.includes('伴奏') || goal.includes('编曲')) {
      const t1: AgentTask = { taskId: taskId(), name: '风格分析', description: '分析目标风格', agentType: 'analyzer', params, dependencies: [], status: 'pending' };
      const t2: AgentTask = { taskId: taskId(), name: '乐器编排', description: '多轨乐器编排', agentType: 'arranger', params, dependencies: [t1.taskId], status: 'pending' };
      const t3: AgentTask = { taskId: taskId(), name: '混音处理', description: '多轨混音', agentType: 'mixer', params, dependencies: [t2.taskId], status: 'pending' };
      tasks.push(t1, t2, t3);
    } else {
      const t1: AgentTask = { taskId: taskId(), name: '任务执行', description: goal, agentType: 'general', params, dependencies: [], status: 'pending' };
      tasks.push(t1);
    }
    return tasks;
  }

  // Delegate + Execute
  async executePlan(tasks: AgentTask[]): Promise<AgentTask[]> {
    const completed = new Set<string>();
    const running = new Set<string>();

    while (completed.size < tasks.length) {
      const ready = tasks.filter(t =>
        t.status === 'pending' &&
        t.dependencies.every(d => completed.has(d)) &&
        !running.has(t.taskId)
      );

      if (!ready.length) {
        const stuck = tasks.filter(t => t.status === 'pending');
        if (stuck.length) {
          for (const t of stuck) {
            t.status = 'failed';
            t.error = '依赖任务未完成或失败';
          }
        }
        break;
      }

      const batch = ready.slice(0, 3);
      const promises = batch.map(async task => {
        running.add(task.taskId);
        task.status = 'running';
        try {
          const agents = this.getAgentsByCapability(task.agentType);
          const agent = agents[0];
          if (!agent) throw new Error(`无可用agent类型: ${task.agentType}`);
          task.result = await agent.execute(task);
          task.status = 'completed';
          completed.add(task.taskId);
        } catch (e: any) {
          task.status = 'failed';
          task.error = e.message;
          completed.add(task.taskId);
        }
        running.delete(task.taskId);
      });

      await Promise.all(promises);
    }

    this._taskHistory.push(...tasks);
    return tasks;
  }

  // Review + Synthesize
  synthesize(tasks: AgentTask[]): any {
    const successful = tasks.filter(t => t.status === 'completed');
    const failed = tasks.filter(t => t.status === 'failed');

    const outputs: Record<string, any> = {};
    for (const t of successful) outputs[t.name] = t.result;

    return {
      goal: tasks.map(t => t.name).join(' + '),
      completed: successful.length,
      failed: failed.length,
      outputs,
      errors: failed.map(t => ({ task: t.name, error: t.error })),
      successRate: tasks.length ? successful.length / tasks.length : 0,
    };
  }

  // 完整工作流
  async run(goal: string, params: Record<string, any> = {}): Promise<any> {
    const tasks = this.plan(goal, params);
    const executed = await this.executePlan(tasks);
    return this.synthesize(executed);
  }

  getHistory(): AgentTask[] {
    return [...this._taskHistory];
  }
}

// ═════════════════════════════════════════════════════════════
// Part 6: 记忆银行 (Memory Bank)
// 跨会话记忆持久化 + 知识图谱
// ═════════════════════════════════════════════════════════════

export interface MemoryEntry {
  id: string;
  type: 'composition' | 'lyrics' | 'vocal' | 'arrangement' | 'feedback' | 'preference';
  content: any;
  tags: string[];
  timestamp: string;
  importance: number;
  accessCount: number;
  lastAccessed: string;
}

export interface KnowledgeEdge {
  from: string;
  to: string;
  relation: string;
  weight: number;
}

export class MemoryBank {
  private _memories: Map<string, MemoryEntry> = new Map();
  private _edges: KnowledgeEdge[] = [];
  private _maxMemories: number;

  constructor(maxMemories = 5000) {
    this._maxMemories = maxMemories;
  }

  store(entry: Omit<MemoryEntry, 'id' | 'timestamp' | 'accessCount' | 'lastAccessed'>): string {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const fullEntry: MemoryEntry = {
      ...entry,
      id,
      timestamp: new Date().toISOString(),
      accessCount: 0,
      lastAccessed: new Date().toISOString(),
    };
    this._memories.set(id, fullEntry);
    this._prune();
    return id;
  }

  private _prune(): void {
    if (this._memories.size <= this._maxMemories) return;
    const sorted = Array.from(this._memories.values())
      .sort((a, b) => {
        const scoreA = a.importance * (a.accessCount + 1);
        const scoreB = b.importance * (b.accessCount + 1);
        return scoreA - scoreB;
      });
    const toRemove = sorted.slice(0, this._memories.size - this._maxMemories);
    for (const entry of toRemove) this._memories.delete(entry.id);
  }

  retrieve(id: string): MemoryEntry | undefined {
    const entry = this._memories.get(id);
    if (entry) {
      entry.accessCount++;
      entry.lastAccessed = new Date().toISOString();
    }
    return entry;
  }

  search(query: string, type?: string): MemoryEntry[] {
    const q = query.toLowerCase();
    const results: MemoryEntry[] = [];
    for (const entry of this._memories.values()) {
      if (type && entry.type !== type) continue;
      const contentStr = JSON.stringify(entry.content).toLowerCase();
      const tagsStr = entry.tags.join(' ').toLowerCase();
      if (contentStr.includes(q) || tagsStr.includes(q)) {
        results.push(entry);
      }
    }
    return results.sort((a, b) => b.importance - a.importance).slice(0, 20);
  }

  searchByTags(tags: string[]): MemoryEntry[] {
    const results: MemoryEntry[] = [];
    for (const entry of this._memories.values()) {
      if (tags.some(t => entry.tags.includes(t))) results.push(entry);
    }
    return results.sort((a, b) => b.importance - a.importance);
  }

  addEdge(from: string, to: string, relation: string, weight = 1.0): void {
    this._edges.push({ from, to, relation, weight });
  }

  getRelated(entryId: string): { memory: MemoryEntry; relation: string; weight: number }[] {
    const related: { memory: MemoryEntry; relation: string; weight: number }[] = [];
    for (const edge of this._edges) {
      if (edge.from === entryId) {
        const mem = this._memories.get(edge.to);
        if (mem) related.push({ memory: mem, relation: edge.relation, weight: edge.weight });
      } else if (edge.to === entryId) {
        const mem = this._memories.get(edge.from);
        if (mem) related.push({ memory: mem, relation: edge.relation, weight: edge.weight });
      }
    }
    return related.sort((a, b) => b.weight - a.weight);
  }

  getStats(): any {
    const types = new Map<string, number>();
    for (const m of this._memories.values()) {
      types.set(m.type, (types.get(m.type) || 0) + 1);
    }
    return {
      totalMemories: this._memories.size,
      totalEdges: this._edges.length,
      typeDistribution: Object.fromEntries(types),
    };
  }

  export(): { memories: MemoryEntry[]; edges: KnowledgeEdge[] } {
    return {
      memories: Array.from(this._memories.values()),
      edges: [...this._edges],
    };
  }

  import(data: { memories: MemoryEntry[]; edges: KnowledgeEdge[] }): void {
    this._memories = new Map(data.memories.map(m => [m.id, m]));
    this._edges = [...data.edges];
  }
}

// ═════════════════════════════════════════════════════════════
// Part 7: 认知闭环控制器 (Closed-Loop Controller)
// T6评估 → 不达标 → T1引擎优化 → 返回最优
// ═════════════════════════════════════════════════════════════

export class CognitiveClosedLoop {
  invariantEngine: CognitiveInvariantEngine;
  mirrorEngine: CognitiveMirrorEngine;
  autoLearner: AutoLearner;
  threshold: number;

  constructor(threshold = 0.65) {
    this.invariantEngine = new CognitiveInvariantEngine();
    this.mirrorEngine = new CognitiveMirrorEngine();
    this.autoLearner = new AutoLearner();
    this.threshold = threshold;
  }

  // 评估并优化歌词
  async evaluateAndOptimizeLyrics(lyrics: string, maxIterations = 3): Promise<{ lyrics: string; scores: InvariantScores; iterations: number; improvements: string[] }> {
    let currentLyrics = lyrics;
    const improvements: string[] = [];

    for (let i = 0; i < maxIterations; i++) {
      const scores = this.invariantEngine.evaluate(currentLyrics);
      this.autoLearner.recordPerformance('lyric_eval', { iteration: i }, scores.overall, { lyrics: currentLyrics.slice(0, 50) });

      if (scores.overall >= this.threshold) {
        return { lyrics: currentLyrics, scores, iterations: i, improvements };
      }

      let improved = false;

      if (scores.itc < 0.5) {
        currentLyrics = this.mirrorEngine.mirrorGenerate(currentLyrics, 'poetic');
        improvements.push(`迭代${i + 1}: ITC偏低 → 镜像生成增强词汇多样性`);
        improved = true;
      }
      if (scores.scs < 0.5 && !improved) {
        currentLyrics = this._smoothTransitions(currentLyrics);
        improvements.push(`迭代${i + 1}: SCS偏低 → 平滑过渡处理`);
        improved = true;
      }
      if (scores.iec < 0.5 && !improved) {
        currentLyrics = this._balanceComplexity(currentLyrics);
        improvements.push(`迭代${i + 1}: IEC偏低 → 复杂度平衡`);
        improved = true;
      }
      if (scores.pfft < 0.5 && !improved) {
        currentLyrics = this._adjustStyle(currentLyrics);
        improvements.push(`迭代${i + 1}: PFFT偏低 → 风格调整`);
        improved = true;
      }

      if (!improved) break;
    }

    const finalScores = this.invariantEngine.evaluate(currentLyrics);
    return { lyrics: currentLyrics, scores: finalScores, iterations: maxIterations, improvements };
  }

  private _smoothTransitions(text: string): string {
    const connectors = ['然而', '与此同时', '接着', '随后', '于是', '因此', '不过'];
    const sentences = text.split(/[。！？\n]+/).filter(s => s.trim());
    if (sentences.length < 2) return text;
    const result: string[] = [];
    for (let i = 0; i < sentences.length; i++) {
      result.push(sentences[i]);
      if (i < sentences.length - 1 && Math.random() > 0.5) {
        result.push(connectors[Math.floor(Math.random() * connectors.length)]);
      }
    }
    return result.join('，') + '。';
  }

  private _balanceComplexity(text: string): string {
    if (text.length > 100) return text.slice(0, Math.floor(text.length * 0.8));
    return text + '，在这无尽的思绪中，寻找着那一丝光明。';
  }

  private _adjustStyle(text: string): string {
    return text.replace(/，/g, ' ').replace(/。/g, '\n');
  }
}

// ═════════════════════════════════════════════════════════════
// 默认导出
// ═════════════════════════════════════════════════════════════
export default {
  CognitiveInvariantEngine,
  CognitiveMirrorEngine,
  FeedbackStore,
  AutoLearner,
  AgentOrchestrator,
  SimpleAgent,
  MemoryBank,
  CognitiveClosedLoop,
};

