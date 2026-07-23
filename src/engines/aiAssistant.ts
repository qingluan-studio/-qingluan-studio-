/**
 * ============================================================================
 * 青鸾数字音频工作站 - AI 助手引擎 (AI Assistant Engine)
 * ============================================================================
 * 本模块为青鸾 DAW 提供内置 AI 助手功能，支持自然语言交互、意图识别、
 * 音乐理论查询、作曲建议、故障诊断与教学指南生成。
 *
 * 核心导出：
 *   - AIAssistant    : 主助手类，管理对话与命令执行
 *   - IntentParser   : 意图解析器，基于关键词与模式匹配
 *   - KnowledgeBase  : 音乐知识库，存储结构化理论 FAQ
 * ============================================================================
 */

import {
  clamp,
  lerp,
  midiToFrequency,
  midiToNoteName,
  noteToMidi,
  getPitchClass,
  getOctave,
  semitoneToRatio,
  dbToGain,
  gainToDb,
  calculateNoteDuration,
  quantizeTime,
} from '../utils/audioUtils.js';

// ============================================================================
// 类型定义 (Type Definitions)
// ============================================================================

/** 用户意图类型枚举 */
export enum IntentType {
  COMPOSE = 'compose',           // 作曲
  ARRANGE = 'arrange',           // 编曲
  VOCAL = 'vocal',               // 人声处理
  EFFECT = 'effect',             // 效果器
  EXPORT = 'export',             // 导出
  THEORY_QUERY = 'theory_query', // 理论查询
  MIX = 'mix',                   // 混音
  MASTER = 'master',             // 母带
  TROUBLESHOOT = 'troubleshoot', // 故障诊断
  TUTORIAL = 'tutorial',         // 教学
  RECOMMEND = 'recommend',       // 推荐
  ANALYZE = 'analyze',           // 分析
  CHAT = 'chat',                 // 闲聊
  UNKNOWN = 'unknown',           // 未知
}

/** 意图识别结果接口 */
export interface IntentResult {
  type: IntentType;
  confidence: number; // 置信度 0-1
  params: Record<string, any>;
  rawMessage: string;
}

/** 对话历史记录接口 */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  intent?: IntentType;
}

/** 项目状态快照接口（简化） */
export interface ProjectSnapshot {
  tracks: TrackInfo[];
  bpm: number;
  key: string;
  timeSignature: [number, number];
  duration: number;
}

/** 轨道信息接口 */
export interface TrackInfo {
  id: string;
  name: string;
  type: 'audio' | 'midi' | 'instrument';
  muted: boolean;
  solo: boolean;
  volumeDb: number;
  pan: number;
  effects: string[];
}

/** 音符数据接口 */
export interface NoteData {
  pitch: number;   // MIDI 音符编号
  velocity: number; // 力度 0-127
  startTime: number;
  duration: number;
}

/** 知识库条目接口 */
export interface KnowledgeEntry {
  id: string;
  category: string;
  question: string;
  answer: string;
  tags: string[];
  relatedIds: string[];
}

/** AI 助手响应接口 */
export interface AssistantResponse {
  text: string;
  suggestions: string[];
  actions?: AssistantAction[];
  confidence: number;
}

/** 助手动作接口 */
export interface AssistantAction {
  type: string;
  payload: any;
  description: string;
}

// ============================================================================
// KnowledgeBase 类 - 结构化音乐知识库
// ============================================================================

/**
 * KnowledgeBase 存储并管理青鸾 AI 助手的结构化音乐知识。
 * 支持按类别检索、标签过滤与模糊关键词匹配。
 */
export class KnowledgeBase {
  /** 内部知识条目存储 */
  private entries: Map<string, KnowledgeEntry> = new Map();

  /** 分类索引：category -> entryId[] */
  private categoryIndex: Map<string, string[]> = new Map();

  /** 标签索引：tag -> entryId[] */
  private tagIndex: Map<string, string[]> = new Map();

  /** 关键词反向索引（简化） */
  private keywordIndex: Map<string, string[]> = new Map();

  constructor() {
    // 初始化内置知识库
    this.initializeDefaultKnowledge();
  }

  /**
   * 加载内置默认知识库，涵盖音乐理论、制作技巧与常见问题。
   */
  private initializeDefaultKnowledge(): void {
    const defaults: Omit<KnowledgeEntry, 'id'>[] = [
      {
        category: 'theory',
        question: '什么是五度圈？',
        answer:
          '五度圈（Circle of Fifths）是将 12 个调按照纯五度关系排列成的圆环。' +
          '顺时针每步升高纯五度，逆时针每步降低纯五度。它是理解调号、和弦进行与转调的核心工具。' +
          '相邻调之间只有一个升降号的差异，因此常用于流畅转调。',
        tags: ['五度圈', '调号', '基础理论', '转调'],
        relatedIds: [],
      },
      {
        category: 'theory',
        question: '大调与小调的区别是什么？',
        answer:
          '大调（Major）音阶结构为 全-全-半-全-全-全-半，听起来明亮、开阔。' +
          '小调（Minor）自然音阶结构为 全-半-全-全-半-全-全，听起来忧郁、内敛。' +
          '两者主和弦色彩不同：大调主和弦为大三和弦，小调主和弦为小三和弦。',
        tags: ['大调', '小调', '音阶', '色彩'],
        relatedIds: [],
      },
      {
        category: 'theory',
        question: '什么是功能和声？',
        answer:
          '功能和声（Functional Harmony）将和弦按其在调性中的功能分为三类：' +
          '主功能（T，Tonic，稳定）、下属功能（S，Subdominant，趋向主）、属功能（D，Dominant，强烈趋向主）。' +
          '典型的进行如 T -> S -> D -> T，形成和声的张力与解决。',
        tags: ['和声', '功能', '主', '属', '下属'],
        relatedIds: [],
      },
      {
        category: 'theory',
        question: '挂留和弦（Sus）是什么？',
        answer:
          '挂留和弦将三和弦的三度音替换为二度（Sus2）或四度（Sus4）。' +
          '由于去掉了明确大小调色彩的三度，挂留和弦具有「悬浮」与「期待解决」的听觉效果。' +
          '常见于流行、影视配乐中制造氛围与过渡。',
        tags: ['挂留', 'sus2', 'sus4', '和弦色彩'],
        relatedIds: [],
      },
      {
        category: 'theory',
        question: '什么是多利亚调式？',
        answer:
          '多利亚（Dorian）是自然小调的基础上升高第六级音。' +
          '例如 D Dorian：D-E-F-G-A-B-C。其特征音为大六度（相对于小调），' +
          '带来一种「忧郁中带有希望」的独特色彩，在爵士、民谣与电子音乐中广泛使用。',
        tags: ['调式', '多利亚', 'dorian', '爵士'],
        relatedIds: [],
      },
      {
        category: 'production',
        question: '如何避免混音中的频率掩蔽？',
        answer:
          '频率掩蔽（Masking）发生在多个乐器占据相似频段时。解决方法包括：' +
          '1. 均衡（EQ）做减法：在次要乐器上削减重叠频段；' +
          '2. 声像（Panning）分离：将冲突乐器放置在不同立体声位置；' +
          '3. 侧链压缩：用主导乐器触发压缩器，动态腾出空间；' +
          '4. 编曲层面错开：让不同乐器在不同时间段演奏相同音高。',
        tags: ['混音', '掩蔽', 'EQ', '侧链'],
        relatedIds: [],
      },
      {
        category: 'production',
        question: '人声的压缩参数如何设置？',
        answer:
          '人声压缩的常见起点：比率 3:1 到 6:1，阈值约 -18dBFS，' +
          '攻击时间 5-15ms（保留瞬态），释放时间 40-80ms（自然衰减）。' +
          '如需更激进的电台效果，可提高比率至 10:1 并降低阈值。' +
          '使用两段压缩（先温和后激进）可获得更透明的控制。',
        tags: ['人声', '压缩', '动态', '参数'],
        relatedIds: [],
      },
      {
        category: 'production',
        question: '什么是母带处理的响度标准？',
        answer:
          '流媒体平台的典型响度目标：Spotify 约 -14 LUFS，Apple Music 约 -16 LUFS，' +
          'YouTube 约 -14 LUFS。真峰值（True Peak）通常限制在 -1.0dBTP 以下，' +
          '防止数模转换时的削波。过响的母带会被平台自动降低增益，可能损失动态。',
        tags: ['母带', '响度', 'LUFS', '真峰值'],
        relatedIds: [],
      },
      {
        category: 'troubleshoot',
        question: '导出音频出现削波（Clipping）怎么办？',
        answer:
          '削波意味着信号超过 0dBFS。排查步骤：' +
          '1. 检查主输出总线电平，降低主推子或插入限幅器；' +
          '2. 检查各轨道增益分段：输入增益 -> 插件 -> 推子 -> 发送；' +
          '3. 单独独奏可疑轨道，使用真峰值表检测过载点；' +
          '4. 在母带链路末端添加 brickwall limiter，设置上限 -0.3dBTP。',
        tags: ['削波', 'clipping', '导出', '电平'],
        relatedIds: [],
      },
      {
        category: 'troubleshoot',
        question: 'MIDI 键盘没有信号输入怎么排查？',
        answer:
          '1. 确认键盘电源与 USB/ MIDI 线连接正常；' +
          '2. 在青鸾设置 -> MIDI 设备中查看是否识别到键盘；' +
          '3. 检查当前轨道是否启用了正确的 MIDI 输入端口与通道；' +
          '4. 尝试新建一个乐器轨道并选择任意采样器/合成器；' +
          '5. 查看系统 MIDI 监视器，确认 OS 层面是否接收到信号；' +
          '6. 若使用蓝牙 MIDI，尝试重新配对并关闭其他占用 MIDI 的应用。',
        tags: ['MIDI', '键盘', '输入', '排查'],
        relatedIds: [],
      },
      {
        category: 'composition',
        question: '如何写出更有记忆点的旋律？',
        answer:
          '1. 轮廓（Contour）：设计先上行后下行或波浪形的整体走势；' +
          '2. 核心动机（Motive）：用 2-4 个音符的短动机进行重复、模进、逆行、扩展；' +
          '3. 节奏钩子：使用特色切分或重复节奏型；' +
          '4. 黄金分割点：在乐句约 0.618 处放置最高音或变化音；' +
          '5. 限制音域：多数经典流行旋律集中在 8-11 度内，便于传唱。',
        tags: ['作曲', '旋律', '动机', '记忆点'],
        relatedIds: [],
      },
      {
        category: 'composition',
        question: '常见的和弦进行有哪些？',
        answer:
          '流行乐中常见的进行：' +
          '1. I-V-vi-IV（卡农变体，大气史诗感）；' +
          '2. vi-IV-I-V（抒情流行，情感递进）；' +
          '3. ii-V-I（爵士/布鲁斯经典解决）；' +
          '4. I-V-vi-iii-IV-I-IV-V（Pachelbel 现代版）；' +
          '5. i-VII-VI-V（Andalusian Cadence，弗拉门戈/流行暗黑感）。',
        tags: ['和弦', '进行', '流行', '爵士'],
        relatedIds: [],
      },
    ];

    defaults.forEach((entry, index) => {
      const id = `kb_default_${index}`;
      this.addEntry({ ...entry, id });
    });
  }

  /**
   * 向知识库添加新条目，并更新所有索引。
   * @param entry 知识条目（需包含唯一 id）
   */
  addEntry(entry: KnowledgeEntry): void {
    this.entries.set(entry.id, entry);

    // 更新分类索引
    const catList = this.categoryIndex.get(entry.category) || [];
    if (!catList.includes(entry.id)) {
      catList.push(entry.id);
      this.categoryIndex.set(entry.category, catList);
    }

    // 更新标签索引
    entry.tags.forEach((tag) => {
      const tagList = this.tagIndex.get(tag) || [];
      if (!tagList.includes(entry.id)) {
        tagList.push(entry.id);
        this.tagIndex.set(tag, tagList);
      }
    });

    // 更新关键词索引（简单分词）
    const text = `${entry.question} ${entry.answer}`;
    const tokens = this.tokenize(text);
    tokens.forEach((token) => {
      const kwList = this.keywordIndex.get(token) || [];
      if (!kwList.includes(entry.id)) {
        kwList.push(entry.id);
        this.keywordIndex.set(token, kwList);
      }
    });
  }

  /**
   * 简单分词：提取中文字符与英文单词，过滤停用词。
   * @param text 输入文本
   */
  private tokenize(text: string): string[] {
    const stopWords = new Set([
      '的', '了', '是', '在', '我', '有', '和', '就', '不', '人', '都', '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这',
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'to', 'of', 'and', 'in', 'that', 'have', 'has', 'had', 'do', 'does', 'did', 'for', 'on', 'with', 'as', 'at',
    ]);
    const tokens: string[] = [];
    // 匹配中文字符或英文单词
    const matches = text.toLowerCase().match(/[\u4e00-\u9fa5]|[a-z]+/g);
    if (matches) {
      matches.forEach((m) => {
        if (!stopWords.has(m) && m.length > 1) tokens.push(m);
      });
    }
    return tokens;
  }

  /**
   * 根据关键词在知识库中搜索最相关的条目。
   * @param query 用户查询字符串
   * @param topK 返回条数上限
   */
  search(query: string, topK: number = 3): KnowledgeEntry[] {
    const tokens = this.tokenize(query);
    const scoreMap: Map<string, number> = new Map();

    tokens.forEach((token) => {
      const ids = this.keywordIndex.get(token) || [];
      ids.forEach((id) => {
        scoreMap.set(id, (scoreMap.get(id) || 0) + 1);
      });
    });

    // 按得分排序
    const sorted = Array.from(scoreMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, topK)
      .map(([id]) => this.entries.get(id)!)
      .filter(Boolean);

    return sorted;
  }

  /**
   * 按分类获取所有条目。
   * @param category 分类名
   */
  getByCategory(category: string): KnowledgeEntry[] {
    const ids = this.categoryIndex.get(category) || [];
    return ids.map((id) => this.entries.get(id)!).filter(Boolean);
  }

  /**
   * 按标签获取条目。
   * @param tag 标签名
   */
  getByTag(tag: string): KnowledgeEntry[] {
    const ids = this.tagIndex.get(tag) || [];
    return ids.map((id) => this.entries.get(id)!).filter(Boolean);
  }

  /**
   * 根据 ID 获取单一条目。
   * @param id 条目 ID
   */
  getById(id: string): KnowledgeEntry | undefined {
    return this.entries.get(id);
  }

  /**
   * 获取知识库总条目数。
   */
  size(): number {
    return this.entries.size;
  }
}

// ============================================================================
// IntentParser 类 - 自然语言意图解析器
// ============================================================================

/**
 * IntentParser 使用关键词 + 正则模式匹配解析用户输入的自然语言，
 * 将其映射为预定义的 IntentType，并提取关键参数。
 */
export class IntentParser {
  /** 意图匹配规则库 */
  private rules: Array<{
    intent: IntentType;
    keywords: string[];
    patterns: RegExp[];
    paramExtractors: Array<{ key: string; regex: RegExp; transform?: (m: string) => any }>;
    weight: number;
  }> = [];

  constructor() {
    this.initializeRules();
  }

  /**
   * 初始化内置解析规则。每条规则包含关键词列表、正则模式、参数提取器与权重。
   */
  private initializeRules(): void {
    // 作曲意图
    this.rules.push({
      intent: IntentType.COMPOSE,
      keywords: ['作曲', '写歌', '写旋律', '写段', '创作', 'compose', 'melody', 'write song', 'create music'],
      patterns: [
        /(?:帮我|我要|想|需要).*(?:作曲|写歌|写旋律|创作)/i,
        /compose\s+a\s+(?:melody|song|piece)/i,
      ],
      paramExtractors: [
        { key: 'style', regex: /(?:风格|style|genre)[是为]?\s*[:：]?\s*([^，,。.;；]+)/i },
        { key: 'bpm', regex: /(\d+)\s*(?:BPM|bpm|拍每分钟)/, transform: (m) => parseInt(m, 10) },
        { key: 'key', regex: /([A-G][#b]?m?(?:\s*(?:major|minor|大调|小调))?)/i },
      ],
      weight: 1.0,
    });

    // 编曲意图
    this.rules.push({
      intent: IntentType.ARRANGE,
      keywords: ['编曲', '配器', '加鼓', '加贝斯', '加钢琴', 'arrange', 'orchestrate', 'add drums'],
      patterns: [
        /(?:帮我|我要|想).*(?:编曲|配器)/i,
        /arrange\s+(?:this|the|a)/i,
      ],
      paramExtractors: [
        { key: 'instrument', regex: /(?:加|添加|使用|用)\s*([^，,。.;；]+)/i },
        { key: 'style', regex: /(?:风格|style)[是为]?\s*[:：]?\s*([^，,。.;；]+)/i },
      ],
      weight: 1.0,
    });

    // 人声处理意图
    this.rules.push({
      intent: IntentType.VOCAL,
      keywords: ['人声', '修音', '调音', 'autotune', 'vocal', 'pitch correction', '修节奏', '对齐'],
      patterns: [
        /(?:人声|vocal).*(?:处理|调|修|编辑)/i,
        /(?:tune|correct)\s+(?:the\s+)?vocal/i,
      ],
      paramExtractors: [
        { key: 'correction', regex: /(?:修音|音高|pitch).*(?:强度|程度|amount)?/i },
        { key: 'effect', regex: /(?:加|添加|使用)([^，,。.;；]+)/i },
      ],
      weight: 1.0,
    });

    // 效果器意图
    this.rules.push({
      intent: IntentType.EFFECT,
      keywords: ['效果器', '混响', '延迟', '失真', '合唱', 'eq', 'reverb', 'delay', 'distortion', 'chorus', '压缩'],
      patterns: [
        /(?:加|挂|开|添加).*(?:效果|混响|延迟|reverb|delay)/i,
        /(?:用|使用|加个)([^，,。.;；]{2,10})(?:效果|器)/i,
      ],
      paramExtractors: [
        { key: 'effectName', regex: /(?:混响|reverb|延迟|delay|失真|distortion|合唱|chorus|压缩|compressor|EQ)/i },
        { key: 'track', regex: /(?:在|到|给)\s*([^，,。.;；]+?)(?:轨道|track|上)?/i },
      ],
      weight: 1.0,
    });

    // 导出意图
    this.rules.push({
      intent: IntentType.EXPORT,
      keywords: ['导出', '保存', '输出', 'export', 'save', 'bounce', 'render', '混缩'],
      patterns: [
        /(?:导出|输出|保存|混缩).*(?:音频|文件|wav|mp3|flac)/i,
        /export\s+(?:as|to)/i,
      ],
      paramExtractors: [
        { key: 'format', regex: /(?:wav|mp3|flac|aac|ogg|m4a)/i },
        { key: 'quality', regex: /(\d+)\s*(?:k|kbps)/, transform: (m) => parseInt(m, 10) },
        { key: 'range', regex: /(?:全曲|选中|循环|全部|selection|loop|all)/i },
      ],
      weight: 1.0,
    });

    // 理论查询意图
    this.rules.push({
      intent: IntentType.THEORY_QUERY,
      keywords: ['什么是', '为什么', '怎么理解', '解释', 'theory', '什么是', 'how to understand', 'explain'],
      patterns: [
        /(?:什么是|怎么理解|解释下|告诉我).+/i,
        /(?:what is|explain|how does)\s+.+\?/i,
        /(?:和弦|音阶|调式|音程|功能|五度圈|挂留).*(?:是什么|什么意思)/i,
      ],
      paramExtractors: [
        { key: 'concept', regex: /(?:什么是|怎么理解|解释下|告诉我|what is|explain)\s*([^？?。.;；]+)/i },
      ],
      weight: 1.0,
    });

    // 混音意图
    this.rules.push({
      intent: IntentType.MIX,
      keywords: ['混音', '平衡', '音量', '声像', 'EQ', 'mix', 'balance', 'pan', 'volume'],
      patterns: [
        /(?:帮我|我要|想).*(?:混音|mix)/i,
        /(?:调整|平衡).*(?:音量|声像|eq)/i,
      ],
      paramExtractors: [
        { key: 'focus', regex: /(?:人声|鼓|bass|吉他|钢琴|主唱|kick|snare)/i },
      ],
      weight: 1.0,
    });

    // 母带意图
    this.rules.push({
      intent: IntentType.MASTER,
      keywords: ['母带', 'master', '响度', 'lufs', '限制器', 'limiter', '最终处理'],
      patterns: [
        /(?:做|处理).*(?:母带|master)/i,
        /(?:调整|设置).*(?:响度|lufs|limiter)/i,
      ],
      paramExtractors: [
        { key: 'targetLufs', regex: /(-?\d+(?:\.\d+)?)\s*LUFS/i, transform: (m) => parseFloat(m) },
      ],
      weight: 1.0,
    });

    // 故障诊断意图
    this.rules.push({
      intent: IntentType.TROUBLESHOOT,
      keywords: ['问题', '故障', ' bug', '杂音', '爆音', '没声音', '卡顿', '延迟', 'trouble', 'noise', 'pop', 'latency'],
      patterns: [
        /(?:有|出现).*(?:杂音|爆音|没声音|卡顿|延迟)/i,
        /(?:为什么|怎么回事).*(?:没有声| Export|导出失败)/i,
        /troubleshoot|fix|solve|problem|issue/i,
      ],
      paramExtractors: [
        { key: 'symptom', regex: /(?:杂音|爆音|没声音|卡顿|延迟|削波|crash|bug)/i },
      ],
      weight: 1.0,
    });

    // 教学意图
    this.rules.push({
      intent: IntentType.TUTORIAL,
      keywords: ['教程', '怎么学', '怎么使用', '新手', '入门', 'guide', 'tutorial', 'how to use', 'learn'],
      patterns: [
        /(?:怎么|如何).*(?:使用|做|学)/i,
        /(?:给|来).*(?:教程|指南|教学)/i,
        /tutorial\s+for\s+(.+)/i,
      ],
      paramExtractors: [
        { key: 'topic', regex: /(?:怎么|如何|教程|指南|tutorial)\s*(?:使用|做|学|for)?\s*([^？?。.;；]+)/i },
      ],
      weight: 1.0,
    });

    // 推荐意图
    this.rules.push({
      intent: IntentType.RECOMMEND,
      keywords: ['推荐', '适合', '用什么', '选哪个', 'recommend', 'suggest', 'what should I use'],
      patterns: [
        /(?:推荐|建议).*(?:音色|效果|插件|乐器)/i,
        /(?:适合|用什么).*(?:风格|氛围|情绪)/i,
      ],
      paramExtractors: [
        { key: 'mood', regex: /(?:氛围|情绪|mood|feeling)[是为]?\s*[:：]?\s*([^，,。.;；]+)/i },
        { key: 'genre', regex: /(?:风格|genre|风格)[是为]?\s*[:：]?\s*([^，,。.;；]+)/i },
      ],
      weight: 1.0,
    });

    // 分析意图
    this.rules.push({
      intent: IntentType.ANALYZE,
      keywords: ['分析', '检查', '评价', 'feedback', 'analyze', 'review', 'check'],
      patterns: [
        /(?:分析|检查|评价).*(?:作曲|编曲|项目|混音)/i,
        /(?:这段|这个|我的).*(?:怎么样|如何|好不好)/i,
        /analyze\s+(?:this|my|the)\s+(?:project|track|composition)/i,
      ],
      paramExtractors: [
        { key: 'target', regex: /(?:分析|检查|评价)\s*([^，,。.;；]+)/i },
      ],
      weight: 1.0,
    });

    // 闲聊兜底（低权重）
    this.rules.push({
      intent: IntentType.CHAT,
      keywords: ['你好', '在吗', '谢谢', '再见', 'hi', 'hello', 'thanks', 'bye'],
      patterns: [
        /^(?:你好|在吗|嗨|hello|hi|hey)/i,
        /(?:谢谢|感谢|thx|thanks)/i,
      ],
      paramExtractors: [],
      weight: 0.3,
    });
  }

  /**
   * 解析用户输入，返回最匹配的意图与提取参数。
   * @param message 用户原始输入
   */
  parse(message: string): IntentResult {
    const lower = message.toLowerCase();
    let bestIntent = IntentType.UNKNOWN;
    let bestScore = 0;
    let bestParams: Record<string, any> = {};

    for (const rule of this.rules) {
      let score = 0;
      const params: Record<string, any> = {};

      // 关键词匹配
      for (const kw of rule.keywords) {
        if (lower.includes(kw.toLowerCase())) {
          score += 0.3 * rule.weight;
        }
      }

      // 正则模式匹配
      for (const pat of rule.patterns) {
        if (pat.test(message)) {
          score += 0.5 * rule.weight;
        }
      }

      // 参数提取
      for (const extractor of rule.paramExtractors) {
        const match = message.match(extractor.regex);
        if (match && match[1]) {
          params[extractor.key] = extractor.transform ? extractor.transform(match[1].trim()) : match[1].trim();
          score += 0.2 * rule.weight;
        }
      }

      // 快捷命令直接提升置信度到 0.95 以上
      const commandMatch = message.match(/^\/(\w+)/);
      if (commandMatch) {
        const cmd = commandMatch[1].toLowerCase();
        const cmdMap: Record<string, IntentType> = {
          compose: IntentType.COMPOSE,
          mix: IntentType.MIX,
          master: IntentType.MASTER,
          export: IntentType.EXPORT,
          arrange: IntentType.ARRANGE,
          vocal: IntentType.VOCAL,
          effect: IntentType.EFFECT,
          theory: IntentType.THEORY_QUERY,
          help: IntentType.TUTORIAL,
          analyze: IntentType.ANALYZE,
        };
        if (cmdMap[cmd] === rule.intent) {
          score = Math.max(score, 0.98);
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestIntent = rule.intent;
        bestParams = params;
      }
    }

    // 如果没有任何匹配，检查是否包含问号，作为理论查询兜底
    if (bestIntent === IntentType.UNKNOWN && message.includes('?')) {
      bestIntent = IntentType.THEORY_QUERY;
      bestScore = 0.25;
    }

    return {
      type: bestIntent,
      confidence: clamp(bestScore, 0, 1),
      params: bestParams,
      rawMessage: message,
    };
  }
}

// ============================================================================
// AIAssistant 类 - 青鸾内置 AI 助手
// ============================================================================

/**
 * AIAssistant 是青鸾 DAW 的内置 AI 助手主类。
 * 它整合 IntentParser 与 KnowledgeBase，提供对话接口、命令执行、
 * 项目分析、音色推荐、故障诊断与教学指南生成功能，并支持多轮上下文记忆。
 */
export class AIAssistant {
  /** 意图解析器实例 */
  private parser: IntentParser;

  /** 音乐知识库实例 */
  private knowledge: KnowledgeBase;

  /** 对话历史（上下文记忆） */
  private history: ChatMessage[] = [];

  /** 历史记录最大长度（保留最近 20 轮） */
  private readonly MAX_HISTORY = 40; // user + assistant = 2 per round

  /** 快捷命令映射 */
  private slashCommands: Map<string, (args: string) => AssistantResponse> = new Map();

  /** 当前项目缓存快照 */
  private currentProject: ProjectSnapshot | null = null;

  constructor() {
    this.parser = new IntentParser();
    this.knowledge = new KnowledgeBase();
    this.initializeSlashCommands();
  }

  /**
   * 注册内置快捷命令（/command）。
   */
  private initializeSlashCommands(): void {
    this.slashCommands.set('/compose', (args) => ({
      text: `已进入作曲辅助模式。${args ? `您提到了：「${args}」。` : ''}请描述您想要的风格、调性或情绪，我将协助生成和弦进行与旋律动机。`,
      suggestions: ['生成 C 大调流行和弦进行', '给我一个忧郁的钢琴动机', '写一段爵士 ii-V-I 进行'],
      actions: [{ type: 'open_compose_mode', payload: { style: args }, description: '打开作曲辅助面板' }],
      confidence: 0.99,
    }));

    this.slashCommands.set('/mix', (args) => ({
      text: `已进入混音辅助模式。${args ? `关注点：${args}。` : ''}我可以帮您分析轨道平衡、EQ 冲突与动态问题。`,
      suggestions: ['分析当前混音频率冲突', '给人声加压缩建议', '调整鼓组平衡'],
      actions: [{ type: 'open_mix_mode', payload: {}, description: '打开混音分析面板' }],
      confidence: 0.99,
    }));

    this.slashCommands.set('/master', (args) => ({
      text: `已进入母带辅助模式。${args ? `目标：${args}。` : ''}我将协助设置限幅器、响度目标与真峰值保护。`,
      suggestions: ['设置 -14 LUFS 流媒体母带', '真峰值限制在 -1.0dBTP', '分析动态范围'],
      actions: [{ type: 'open_master_mode', payload: {}, description: '打开母带处理面板' }],
      confidence: 0.99,
    }));

    this.slashCommands.set('/export', (args) => ({
      text: `已进入导出辅助模式。请选择导出格式与质量参数。`,
      suggestions: ['导出 WAV 24bit', '导出 MP3 320kbps', '导出分轨 Stems'],
      actions: [{ type: 'open_export_dialog', payload: { args }, description: '打开导出设置对话框' }],
      confidence: 0.99,
    }));

    this.slashCommands.set('/help', (args) => {
      const topic = args || '青鸾 DAW 基础操作';
      return {
        text: this.generateTutorial(topic),
        suggestions: ['新手入门指南', '快捷键大全', 'MIDI 编辑教程'],
        actions: [{ type: 'open_help', payload: { topic }, description: '打开帮助文档' }],
        confidence: 0.99,
      };
    });

    this.slashCommands.set('/analyze', (args) => ({
      text: `正在分析当前项目... ${this.currentProject ? `检测到 ${this.currentProject.tracks.length} 条轨道。` : '请确保项目已加载。'}`,
      suggestions: ['分析频率分布', '检查相位问题', '评估动态范围'],
      actions: [{ type: 'run_analysis', payload: { focus: args }, description: '执行项目分析' }],
      confidence: 0.99,
    }));
  }

  /**
   * 主对话接口。接收用户消息，解析意图，返回助手响应。
   * @param message 用户输入文本
   */
  chat(message: string): AssistantResponse {
    // 记录用户消息
    this.pushHistory({ role: 'user', content: message, timestamp: Date.now() });

    // 检测快捷命令
    const slashMatch = message.match(/^\/(\w+)(?:\s+(.*))?$/);
    if (slashMatch) {
      const cmd = `/${slashMatch[1].toLowerCase()}`;
      const args = slashMatch[2] || '';
      const handler = this.slashCommands.get(cmd);
      if (handler) {
        const resp = handler(args);
        this.pushHistory({ role: 'assistant', content: resp.text, timestamp: Date.now(), intent: this.parser.parse(message).type });
        return resp;
      }
    }

    // 解析意图
    const intent = this.parser.parse(message);

    // 根据意图路由到对应处理器
    let response: AssistantResponse;
    switch (intent.type) {
      case IntentType.COMPOSE:
        response = this.handleCompose(intent);
        break;
      case IntentType.ARRANGE:
        response = this.handleArrange(intent);
        break;
      case IntentType.VOCAL:
        response = this.handleVocal(intent);
        break;
      case IntentType.EFFECT:
        response = this.handleEffect(intent);
        break;
      case IntentType.EXPORT:
        response = this.handleExport(intent);
        break;
      case IntentType.THEORY_QUERY:
        response = this.handleTheoryQuery(intent);
        break;
      case IntentType.MIX:
        response = this.handleMix(intent);
        break;
      case IntentType.MASTER:
        response = this.handleMaster(intent);
        break;
      case IntentType.TROUBLESHOOT:
        response = this.handleTroubleshoot(intent);
        break;
      case IntentType.TUTORIAL:
        response = this.handleTutorial(intent);
        break;
      case IntentType.RECOMMEND:
        response = this.handleRecommend(intent);
        break;
      case IntentType.ANALYZE:
        response = this.handleAnalyze(intent);
        break;
      case IntentType.CHAT:
        response = this.handleChat(intent);
        break;
      default:
        response = this.fallbackResponse(intent);
    }

    // 记录助手回复
    this.pushHistory({ role: 'assistant', content: response.text, timestamp: Date.now(), intent: intent.type });
    return response;
  }

  /**
   * 直接解析意图（供外部调用）。
   * @param message 用户输入
   */
  parseIntent(message: string): IntentResult {
    return this.parser.parse(message);
  }

  /**
   * 执行指定意图的命令（程序化调用）。
   * @param intent 意图类型
   * @param params 参数对象
   */
  executeCommand(intent: IntentType, params: Record<string, any>): AssistantResponse {
    const fakeIntent: IntentResult = {
      type: intent,
      confidence: 1.0,
      params,
      rawMessage: '',
    };

    switch (intent) {
      case IntentType.COMPOSE:
        return this.handleCompose(fakeIntent);
      case IntentType.MIX:
        return this.handleMix(fakeIntent);
      case IntentType.MASTER:
        return this.handleMaster(fakeIntent);
      case IntentType.EXPORT:
        return this.handleExport(fakeIntent);
      case IntentType.ANALYZE:
        return this.handleAnalyze(fakeIntent);
      default:
        return { text: '该意图暂不支持程序化执行。', suggestions: [], confidence: 0 };
    }
  }

  /**
   * 分析项目状态并给出改进建议。
   * @param project 项目快照
   */
  suggestImprovements(project: ProjectSnapshot): AssistantResponse {
    this.currentProject = project;
    const suggestions: string[] = [];
    const actions: AssistantAction[] = [];

    // 1. 轨道数量检查
    if (project.tracks.length > 40) {
      suggestions.push('轨道数量较多（>40），建议通过编组（Group/Bus）合并相似轨道以减轻 CPU 负担并改善混音清晰度。');
      actions.push({ type: 'suggest_groups', payload: { trackCount: project.tracks.length }, description: '建议创建编组轨道' });
    } else if (project.tracks.length < 3 && project.duration > 60) {
      suggestions.push('项目轨道较少，可能需要更多层次（如低音、和声、氛围）来丰富听感。');
    }

    // 2. 频率冲突分析
    const instrumentTypes = project.tracks.map((t) => t.type);
    const hasKick = project.tracks.some((t) => t.name.toLowerCase().includes('kick') || t.name.includes('底鼓'));
    const hasBass = project.tracks.some((t) => t.name.toLowerCase().includes('bass') || t.name.includes('贝斯'));
    if (hasKick && hasBass) {
      suggestions.push('检测到底鼓与贝斯同时存在，建议在贝斯轨道使用高通滤波（约 30-50Hz）并在底鼓与贝斯间做侧链压缩，避免低频掩蔽。');
      actions.push({ type: 'suggest_sidechain', payload: { source: 'kick', target: 'bass' }, description: '建议底鼓-贝斯侧链' });
    }

    // 3. 动态范围评估（简化）
    const avgVolume = project.tracks.reduce((sum, t) => sum + t.volumeDb, 0) / (project.tracks.length || 1);
    if (avgVolume > -6) {
      suggestions.push('整体电平偏高，平均音量超过 -6dB，可能导致混音缺乏动态余量（Headroom）。建议降低各轨道增益，保持主输出峰值在 -6dBFS 以下。');
      actions.push({ type: 'suggest_gain_staging', payload: { avgVolume }, description: '建议增益分级调整' });
    }

    // 4. 声像分布
    const allCenter = project.tracks.filter((t) => Math.abs(t.pan) < 0.1 && t.type !== 'audio').length;
    if (allCenter > 5) {
      suggestions.push('多条轨道聚集在声像中央，可能导致中频拥挤。尝试将伴奏元素（如键盘、吉他、合成器铺底）向左右展开。');
      actions.push({ type: 'suggest_panning', payload: { centeredTracks: allCenter }, description: '建议声像展开' });
    }

    // 5. 调性与速度一致性
    if (project.bpm < 60 || project.bpm > 180) {
      suggestions.push(`当前 BPM 为 ${project.bpm}，处于较极端范围。请确认是否故意追求慢速氛围或高速律动。`);
    }

    // 默认建议兜底
    if (suggestions.length === 0) {
      suggestions.push('项目结构良好。建议下一步：检查各轨道的 EQ 高通滤波是否到位，以及混响发送量是否统一。');
    }

    const text = `【项目分析报告】\n轨道数：${project.tracks.length} | BPM：${project.bpm} | 调：${project.key} | 拍号：${project.timeSignature.join('/')}\n\n改进建议：\n${suggestions.map((s, i) => `${i + 1}. ${s}`).join('\n\n')}`;

    return {
      text,
      suggestions: ['应用自动增益分级', '生成 EQ 建议图谱', '检查相位相关'],
      actions,
      confidence: 0.92,
    };
  }

  /**
   * 解释音乐理论概念。
   * @param concept 概念名称
   */
  explainTheory(concept: string): string {
    // 先在知识库搜索
    const results = this.knowledge.search(concept, 3);
    if (results.length > 0) {
      // 取最相关的一条
      return `【${results[0].question}】\n${results[0].answer}\n\n相关阅读：${results[0].tags.join('、')}`;
    }

    // 内置扩展解释
    const extendedExplanations: Record<string, string> = {
      '十二平均律':
        '十二平均律（12-TET）将八度均分为 12 个半音，每个半音频率比为 2^(1/12) ≈ 1.05946。' +
        '它允许在所有调之间自由转调，是现代音乐最主流的律制。缺点是纯五度与纯律相比略有偏差（约 2 音分）。',
      '纯律':
        '纯律（Just Intonation）基于简单的整数频率比（如 3:2、4:3、5:4），' +
        '在特定调性中听起来极为和谐。但换调时需要重新调音，限制了转调自由。常用于无伴奏合唱与早期音乐。',
      '对位法':
        '对位法（Counterpoint）是多声部写作规则体系，核心原则是各声部既有独立性又有和声协调性。' +
        '从福克斯五类基本对位到巴洛克赋格，强调反向与斜向运动，避免连续平行五八度。',
      '调性中心':
        '调性中心（Tonic Center）是音乐中「回家」的感觉所在音高。' +
        '即使音乐暂时离开主和弦，听众仍期待回归。调性中心可通过主和弦强调、导音解决、低音进行等方式确立。',
      '节奏切分':
        '切分（Syncopation）是在强拍上放置休止或弱音，将重音转移到弱拍或弱位。' +
        '它是爵士、放克、拉丁音乐律动的核心，打破规则的强弱规律，产生推动力与舞蹈感。',
    };

    if (extendedExplanations[concept]) {
      return `【${concept}】\n${extendedExplanations[concept]}`;
    }

    return `暂未找到「${concept}」的详细解释。您可以尝试询问「五度圈」、「大调与小调」或「功能和声」。`;
  }

  /**
   * 根据情绪与风格推荐音色。
   * @param mood 情绪描述
   * @param genre 风格/流派
   */
  recommendSounds(mood: string, genre?: string): AssistantResponse {
    const recs: string[] = [];
    const key = `${mood}-${genre || 'general'}`;

    // 内置推荐映射（简化但覆盖常见场景）
    const soundMap: Record<string, string[]> = {
      '忧郁-流行': ['立式钢琴（Upright Piano）', '慢弦乐铺底（Slow Strings Pad）', '木吉他指弹（Fingerstyle Guitar）', '合成器 Pluck（低截止频率）'],
      '忧郁-电子': ['合成器 Pad（低通滤波 + 长衰减）', '环境纹理（Ambient Texture）', '子低音（Sub Bass）', '电子钢琴（Electric Piano）'],
      '欢快-流行': ['原声吉他扫弦（Acoustic Guitar Strum）', '亮音钢琴（Bright Piano）', '铜管 stab（Brass Stabs）', '拍手（Claps）与响指'],
      '欢快-电子': ['Super Saw（超级锯齿波）', '侧链 Pad（Sidechained Pad）', '高昂 Lead（Bright Lead Synth）', '4-on-the-floor Kick'],
      '史诗-管弦': ['定音鼓滚奏（Timpani Roll）', '弦乐长音（String Sustain）', '铜管合奏（Brass Ensemble）', '合唱（Choir）与钟声'],
      '暗黑-电子': [' Reese Bass（失真低音）', '工业打击乐（Industrial Percussion）', '黑暗 Pad（Dark Pad）', '降调人声切片'],
      '放松-氛围': ['环境 Pad（Ambient Pad）', '长笛/尺八（Flute/Shakuhachi）', '海浪与颗粒合成纹理', '低频冥想音床（Meditation Bed）'],
    };

    // 模糊匹配
    for (const [mapKey, instruments] of Object.entries(soundMap)) {
      const [mapMood, mapGenre] = mapKey.split('-');
      if (mood.includes(mapMood) || mapMood.includes(mood)) {
        if (!genre || (mapGenre && (genre.includes(mapGenre) || mapGenre.includes(genre)))) {
          recs.push(...instruments);
        }
      }
    }

    if (recs.length === 0) {
      recs.push('通用钢琴（General Piano）', '弦乐 Ensemble', '贝斯（Bass）', '基础鼓组（Basic Drum Kit）', '合成器 Pad');
    }

    // 去重
    const uniqueRecs = Array.from(new Set(recs)).slice(0, 6);

    return {
      text: `根据情绪「${mood}」${genre ? `与风格「${genre}」` : ''}，推荐以下音色：\n${uniqueRecs.map((r, i) => `${i + 1}. ${r}`).join('\n')}`,
      suggestions: ['试听推荐音色', '加载对应采样器预设', '查看更多类似音色'],
      actions: [{ type: 'load_recommended_sounds', payload: { mood, genre, sounds: uniqueRecs }, description: '加载推荐音色到轨道' }],
      confidence: 0.85,
    };
  }

  /**
   * 音频问题诊断。
   * @param issue 问题描述
   */
  troubleshootAudio(issue: string): AssistantResponse {
    const lower = issue.toLowerCase();
    const diagnoses: string[] = [];
    const fixes: string[] = [];

    if (lower.includes('削波') || lower.includes('clipping') || lower.includes('红')) {
      diagnoses.push('主输出或某轨道电平超过 0dBFS，导致数字削波。');
      fixes.push('降低轨道增益/推子，或在主总线添加 Brickwall Limiter（上限 -0.3dB）。');
    }

    if (lower.includes('延迟') || lower.includes('latency') || lower.includes('滞后')) {
      diagnoses.push('音频缓冲区设置过大，或插件延迟补偿未开启。');
      fixes.push('在音频设置中减小缓冲区大小（如 256 samples），并确保 Plugin Delay Compensation 已启用。');
    }

    if (lower.includes('噪音') || lower.includes('noise') || lower.includes('嗡嗡')) {
      diagnoses.push('可能存在接地回路、增益 staging 不当或插件引入的噪声。');
      fixes.push('检查音频接口接地，降低输入增益，在噪声轨道上尝试降噪插件（如宽带降噪）。');
    }

    if (lower.includes('相位') || lower.includes('phase') || lower.includes('抵消')) {
      diagnoses.push('多话筒录制时，声波到达时间差导致相位抵消，低频变薄。');
      fixes.push('使用相位反转按钮（Ø）测试，或微调音频片段位置使波形对齐，必要时使用相位对齐插件。');
    }

    if (lower.includes('爆音') || lower.includes('pop') || lower.includes('click')) {
      diagnoses.push('音频片段边界不处于零交叉点，或自动化突变。');
      fixes.push('在片段头尾添加 5-10ms 淡入淡出，检查自动化节点是否有过陡跳变。');
    }

    if (diagnoses.length === 0) {
      // 尝试在知识库搜索
      const kb = this.knowledge.search(issue, 2);
      if (kb.length > 0) {
        return {
          text: `【故障诊断】\n根据知识库找到以下相关信息：\n\n${kb[0].question}\n${kb[0].answer}`,
          suggestions: ['查看详细排查步骤', '联系技术支持', '搜索社区讨论'],
          confidence: 0.7,
        };
      }
      diagnoses.push('未能自动识别具体问题。');
      fixes.push('请提供更多细节，例如：问题发生在播放/录音/导出时？是否使用了特定插件？');
    }

    const text = `【故障诊断结果】\n可能原因：\n${diagnoses.map((d, i) => `${i + 1}. ${d}`).join('\n')}\n\n建议修复：\n${fixes.map((f, i) => `${i + 1}. ${f}`).join('\n')}`;

    return {
      text,
      suggestions: ['打开工程诊断面板', '生成自动化修复建议', '查看音频接口设置'],
      actions: [{ type: 'open_troubleshoot_panel', payload: { issue }, description: '打开故障诊断面板' }],
      confidence: 0.88,
    };
  }

  /**
   * 生成指定主题的教学指南。
   * @param topic 教学主题
   */
  generateTutorial(topic: string): string {
    const tutorials: Record<string, string> = {
      '新手入门':
        '【青鸾 DAW 新手入门指南】\n' +
        '1. 创建工程：文件 -> 新建工程，设置 BPM 与拍号。\n' +
        '2. 添加轨道：右键空白处 -> 添加乐器轨道 / 音频轨道。\n' +
        '3. 录制 MIDI：选中乐器轨道，点击走带栏的红色录音按钮，使用虚拟键盘或外接 MIDI 键盘输入音符。\n' +
        '4. 编辑音符：双击 MIDI 片段进入钢琴卷帘，可移动、拉伸、量化音符。\n' +
        '5. 添加效果：在混音器插槽中点击 "+"，选择混响或 EQ。\n' +
        '6. 导出成品：文件 -> 导出 -> 音频，选择格式与范围。',
      '混音基础':
        '【混音基础教程】\n' +
        '1. 增益分级（Gain Staging）：确保每轨输入在 -18dBFS 左右，保留动态余量。\n' +
        '2. 平衡（Balance）：先关闭所有效果，仅用推子与声像建立清晰的声场布局。\n' +
        '3. EQ 减法原则：在冲突轨道上削减而非在每条轨道上过度提升。\n' +
        '4. 压缩控制动态：人声压缩比 3:1~6:1，鼓组可尝试并行压缩。\n' +
        '5. 空间（Space）：使用发送式混响统一环境感，不同元素使用不同预延迟。\n' +
        '6. 参考曲目：定期与专业发行的同风格曲目对比电平与频率。',
      'EQ 使用':
        '【EQ 均衡器使用指南】\n' +
        '1. 高通滤波：为所有非低音轨道添加高通，清除无用低频。\n' +
        '2. 切除浑浊：人声在 200-400Hz 常有浑浊，可轻微削减。\n' +
        '3. 增加清晰度：人声在 2-5kHz 提升可增加存在感；鼓组在 5kHz 提升增加敲击感。\n' +
        '4. 高频空气感：人声与弦乐在 10-15kHz  shelf 提升增加「空气」。\n' +
        '5. 避免过度：每次削减/提升不超过 3-6dB，保持自然。',
      '压缩器':
        '【压缩器入门教程】\n' +
        '压缩器通过降低超过阈值的信号增益来控制动态范围。\n' +
        '核心参数：\n' +
        '- 阈值（Threshold）：信号超过此电平开始压缩。\n' +
        '- 比率（Ratio）：输入/输出增益变化比，如 4:1 表示输入增 4dB 输出只增 1dB。\n' +
        '- 攻击（Attack）：信号超过阈值后多久开始压缩。短攻击控制瞬态，长攻击保留冲击力。\n' +
        '- 释放（Release）：信号低于阈值后多久停止压缩。太短会 pumping，太长会模糊。\n' +
        '-  Makeup Gain：补偿因压缩降低的整体电平。',
    };

    // 模糊匹配
    for (const [title, content] of Object.entries(tutorials)) {
      if (title.includes(topic) || topic.includes(title)) {
        return content;
      }
    }

    // 默认生成通用教程
    return `【${topic} 教学指南】\n` +
      `青鸾 DAW 为您准备了关于「${topic}」的学习路径：\n` +
      `1. 理论学习：查阅青鸾内置音乐理论知识库。\n` +
      `2. 实践练习：新建一个测试工程，跟随操作逐步尝试。\n` +
      `3. 参考工程：打开 Templates 文件夹中的示例工程，逆向学习制作思路。\n` +
      `4. 社区交流：在青鸾社区中搜索「${topic}」，查看其他用户的经验分享。\n\n` +
      `如需更具体的步骤，请告诉我您当前的操作场景。`;
  }

  /**
   * 分析一组音符并提供作曲反馈。
   * @param notes 音符数组
   */
  analyzeComposition(notes: NoteData[]): AssistantResponse {
    if (notes.length === 0) {
      return { text: '未检测到任何音符数据，请提供 MIDI 音符后再进行分析。', suggestions: ['录制一段旋律', '导入 MIDI 文件'], confidence: 0 };
    }

    const feedback: string[] = [];
    const pitchClasses = notes.map((n) => getPitchClass(n.pitch));
    const uniquePcs = Array.from(new Set(pitchClasses)).sort((a, b) => a - b);

    // 1. 音域分析
    const minPitch = Math.min(...notes.map((n) => n.pitch));
    const maxPitch = Math.max(...notes.map((n) => n.pitch));
    const rangeSemitones = maxPitch - minPitch;
    if (rangeSemitones > 24) {
      feedback.push(`音域较宽（${rangeSemitones} 半音，约 ${(rangeSemitones / 12).toFixed(1)} 个八度），注意声部衔接与乐器音域限制。`);
    } else if (rangeSemitones < 5) {
      feedback.push(`音域非常窄（仅 ${rangeSemitones} 半音），可尝试加入跳进或八度变化增加旋律趣味。`);
    } else {
      feedback.push(`音域适中（${rangeSemitones} 半音），适合多数乐器演奏与演唱。`);
    }

    // 2. 音阶检测（简化：检测是否为常见七声音阶子集）
    const commonScales: Record<string, number[]> = {
      'C 大调 / A 自然小调': [0, 2, 4, 5, 7, 9, 11],
      'G 大调 / E 自然小调': [0, 2, 4, 5, 7, 9, 11], // 相对关系，实际需看主音
      'D 多利亚': [0, 2, 3, 5, 7, 9, 10],
      'A 小调五声': [0, 3, 5, 7, 10],
      'C 大调五声': [0, 2, 4, 7, 9],
    };

    let detectedScale = '未明确匹配常见音阶';
    for (const [name, pcs] of Object.entries(commonScales)) {
      const isSubset = uniquePcs.every((pc) => pcs.includes(pc));
      if (isSubset) {
        detectedScale = name;
        break;
      }
    }
    feedback.push(`检测到的音高集合倾向于：${detectedScale}。`);

    // 3. 节奏密度
    const totalDuration = Math.max(...notes.map((n) => n.startTime + n.duration));
    const density = notes.length / (totalDuration || 1);
    if (density > 8) {
      feedback.push('节奏非常密集，注意避免过度拥挤，适当加入休止符可提升呼吸感。');
    } else if (density < 1) {
      feedback.push('节奏较为稀疏，可考虑加入经过音或辅助节奏层填充空间。');
    } else {
      feedback.push('节奏密度适中。');
    }

    // 4. 重复与变化
    const intervals: number[] = [];
    for (let i = 1; i < notes.length; i++) {
      intervals.push(notes[i].pitch - notes[i - 1].pitch);
    }
    const repeatedIntervals = intervals.filter((v, i, a) => a.indexOf(v) !== i);
    if (repeatedIntervals.length > intervals.length * 0.5) {
      feedback.push('检测到较多重复的音程模式，这是形成记忆点的好方法，但也要注意引入对比乐句避免单调。');
    }

    // 5. 力度变化
    const avgVel = notes.reduce((s, n) => s + n.velocity, 0) / notes.length;
    const velRange = Math.max(...notes.map((n) => n.velocity)) - Math.min(...notes.map((n) => n.velocity));
    if (velRange < 20) {
      feedback.push('力度变化较小，演奏可能显得机械。尝试加入更多强弱起伏，或使用青鸾的人性化引擎。');
    } else {
      feedback.push(`力度变化范围良好（${velRange}），平均力度 ${avgVel.toFixed(0)}。`);
    }

    const text = `【作曲分析报告】\n共分析 ${notes.length} 个音符。\n\n${feedback.map((f, i) => `${i + 1}. ${f}`).join('\n\n')}`;

    return {
      text,
      suggestions: ['应用人性化力度', '生成和声建议', '扩展为完整乐段'],
      actions: [{ type: 'show_analysis_visualization', payload: { noteCount: notes.length, range: rangeSemitones }, description: '打开分析可视化' }],
      confidence: 0.85,
    };
  }

  // --------------------------------------------------------------------------
  // 私有处理器方法
  // --------------------------------------------------------------------------

  /** 处理作曲意图 */
  private handleCompose(intent: IntentResult): AssistantResponse {
    const style = intent.params.style || '流行';
    const key = intent.params.key || 'C 大调';
    const bpm = intent.params.bpm || 120;

    // 根据风格生成建议的和弦进行
    const progressions: Record<string, string[]> = {
      '流行': ['I - V - vi - IV', 'vi - IV - I - V', 'I - V - vi - iii - IV'],
      '爵士': ['ii - V - I', 'I - vi - ii - V', 'iii - VI - ii - V'],
      '摇滚': ['I - IV - V', 'I - V - IV', 'vi - V - IV - V'],
      '电子': ['i - VII - VI - V', 'I - V - vi - IV（侧链铺底）'],
      '古典': ['I - IV - V - I', 'I - vi - IV - V', 'I - V/7 - vi - iii - IV'],
    };

    const matchedStyle = Object.keys(progressions).find((s) => style.includes(s)) || '流行';
    const progList = progressions[matchedStyle];

    return {
      text:
        `好的，为您开启「${style}」风格的作曲辅助。\n` +
        `建议调性：${key}，速度：${bpm} BPM。\n\n` +
        `推荐和弦进行：\n${progList.map((p, i) => `${i + 1}. ${p}`).join('\n')}\n\n` +
        `您可以在钢琴卷帘中输入和弦，或使用青鸾的「AI 和声生成」自动填充。`,
      suggestions: ['生成 MIDI 和弦进行', '推荐旋律动机', '加载对应风格模板'],
      actions: [{ type: 'generate_chords', payload: { style: matchedStyle, key, bpm }, description: '生成和弦进行 MIDI' }],
      confidence: intent.confidence,
    };
  }

  /** 处理编曲意图 */
  private handleArrange(intent: IntentResult): AssistantResponse {
    const instrument = intent.params.instrument || '自动配器';
    return {
      text: `编曲辅助：您可以尝试以下层次来丰富编排。\n1. 节奏组：底鼓、军鼓、Hi-Hat、打击乐。\n2. 低音：电贝斯或合成器 Bass。\n3. 和声：钢琴、吉他、弦乐 Pad。\n4. 旋律：主奏乐器或领唱。\n5. 氛围：环境 Pad、FX、上升音效。`,
      suggestions: ['自动分配乐器到轨道', '生成打击乐变奏', '添加弦乐铺底'],
      actions: [{ type: 'auto_arrange', payload: { instrument }, description: '执行自动编曲' }],
      confidence: intent.confidence,
    };
  }

  /** 处理人声意图 */
  private handleVocal(intent: IntentResult): AssistantResponse {
    return {
      text: '人声处理建议：\n1. 音高校正：使用青鸾 AutoPitch，设置 Retune Speed 约 30-50ms 保持自然。\n2. 时间对齐：打开 Vocalign 风格的时间对齐，将背景和声对齐到主唱。\n3. EQ：高通 80-100Hz，削减 200-400Hz 浑浊，提升 3-5kHz 清晰度。\n4. 压缩：两段压缩，第一段温和控制（3:1），第二段电台效果（6:1）。\n5. 空间：主唱使用短混响（<1.5s）与少量延迟（1/8 附点）。',
      suggestions: ['打开音高校正面板', '加载人声效果链', '进行时间对齐'],
      actions: [{ type: 'open_vocal_chain', payload: {}, description: '加载人声音效链' }],
      confidence: intent.confidence,
    };
  }

  /** 处理效果器意图 */
  private handleEffect(intent: IntentResult): AssistantResponse {
    const effectName = intent.params.effectName || '混响';
    const track = intent.params.track || '当前轨道';
    return {
      text: `建议在「${track}」上添加 ${effectName}。\n青鸾内置多种 ${effectName} 算法，包括 Plate、Hall、Room、Shimmer 等。\n提示：使用发送（Send）而非插入（Insert）可以统一空间环境，并节省 CPU。`,
      suggestions: [`添加 ${effectName} 到 ${track}`, '调整效果器参数', '保存为预设'],
      actions: [{ type: 'add_effect', payload: { effect: effectName, track }, description: '添加效果器' }],
      confidence: intent.confidence,
    };
  }

  /** 处理导出意图 */
  private handleExport(intent: IntentResult): AssistantResponse {
    const format = intent.params.format || 'WAV';
    return {
      text: `导出设置建议：\n格式：${format.toUpperCase()}\n` +
        `若用于存档，建议选择 WAV 24bit/48kHz。\n` +
        `若用于流媒体发布，建议导出 WAV 后使用青鸾母带工具统一响度到平台标准。\n` +
        `范围：可选择「全曲」、「循环区域」或「选中片段」。`,
      suggestions: ['导出 WAV 24bit', '导出 MP3 320kbps', '导出分轨 Stems'],
      actions: [{ type: 'show_export_dialog', payload: { format }, description: '打开导出对话框' }],
      confidence: intent.confidence,
    };
  }

  /** 处理理论查询 */
  private handleTheoryQuery(intent: IntentResult): AssistantResponse {
    const concept = intent.params.concept || intent.rawMessage.replace(/(?:什么是|怎么理解|解释下|告诉我|what is|explain)/i, '').trim();
    const explanation = this.explainTheory(concept);
    return {
      text: explanation,
      suggestions: ['查看更多相关概念', '生成示例音频', '添加到学习笔记'],
      actions: [{ type: 'show_theory_card', payload: { concept }, description: '显示理论卡片' }],
      confidence: intent.confidence,
    };
  }

  /** 处理混音意图 */
  private handleMix(intent: IntentResult): AssistantResponse {
    const focus = intent.params.focus || '整体平衡';
    return {
      text: `混音辅助：当前关注「${focus}」。\n` +
        `混音检查清单：\n` +
        `□ 所有轨道已命名与着色\n` +
        `□ 增益分级合理（峰值约 -12dBFS）\n` +
        `□ 高通滤波已清理非低音轨道\n` +
        `□ 声像布局形成清晰立体声场\n` +
        `□ 发送式混响统一空间感\n` +
        `□ 主输出留有动态余量`,
      suggestions: ['自动平衡轨道音量', '分析频率冲突', '生成混音报告'],
      actions: [{ type: 'open_mix_assistant', payload: { focus }, description: '打开混音助手' }],
      confidence: intent.confidence,
    };
  }

  /** 处理母带意图 */
  private handleMaster(intent: IntentResult): AssistantResponse {
    const targetLufs = intent.params.targetLufs ?? -14;
    return {
      text: `母带处理流程建议：\n` +
        `1. 均衡：使用线性相位 EQ 做最后的整体微调（±1dB 内）。\n` +
        `2. 压缩：温和总线压缩（比率 1.5:1 - 2:1）， Glue 感。\n` +
        `3. 响度：目标 ${targetLufs} LUFS。\n` +
        `4. 限制：Brickwall Limiter，真峰值上限 -1.0dBTP。\n` +
        `5. 抖动：若导出 16bit，在限制器后添加抖动（Dither）。`,
      suggestions: ['应用母带预设', '分析响度直方图', '对比参考曲目'],
      actions: [{ type: 'open_master_chain', payload: { targetLufs }, description: '打开母带链路' }],
      confidence: intent.confidence,
    };
  }

  /** 处理故障诊断 */
  private handleTroubleshoot(intent: IntentResult): AssistantResponse {
    const symptom = intent.params.symptom || '未指定';
    return this.troubleshootAudio(symptom);
  }

  /** 处理教学意图 */
  private handleTutorial(intent: IntentResult): AssistantResponse {
    const topic = intent.params.topic || '新手入门';
    const tutorial = this.generateTutorial(topic);
    return {
      text: tutorial,
      suggestions: ['查看更多教程', '打开示例工程', '播放教学视频'],
      actions: [{ type: 'open_tutorial', payload: { topic }, description: '打开教程面板' }],
      confidence: intent.confidence,
    };
  }

  /** 处理推荐意图 */
  private handleRecommend(intent: IntentResult): AssistantResponse {
    const mood = intent.params.mood || '通用';
    const genre = intent.params.genre;
    return this.recommendSounds(mood, genre);
  }

  /** 处理分析意图 */
  private handleAnalyze(intent: IntentResult): AssistantResponse {
    const target = intent.params.target || '当前项目';
    if (this.currentProject) {
      return this.suggestImprovements(this.currentProject);
    }
    return {
      text: `正在准备分析「${target}」。请确保项目已加载，或提供 MIDI/音频数据。`,
      suggestions: ['加载项目快照', '分析当前选区', '生成频率图谱'],
      actions: [{ type: 'request_project_snapshot', payload: {}, description: '请求项目快照' }],
      confidence: intent.confidence,
    };
  }

  /** 处理闲聊意图 */
  private handleChat(intent: IntentResult): AssistantResponse {
    const greetings = [
      '你好！我是青鸾 AI 助手，随时为您解答音乐制作问题。',
      '在的！有什么可以帮您的吗？',
      '很高兴为您服务。今天想作曲、混音还是学习理论？',
    ];
    const text = greetings[Math.floor(Math.random() * greetings.length)];
    return {
      text,
      suggestions: ['/compose 作曲辅助', '/mix 混音辅助', '/help 查看教程'],
      actions: [],
      confidence: intent.confidence,
    };
  }

  /** 兜底响应 */
  private fallbackResponse(intent: IntentResult): AssistantResponse {
    return {
      text: `抱歉，我不太确定您的具体需求。您可以尝试以下方式：\n` +
        `1. 使用快捷命令，如 /compose、/mix、/master、/export\n` +
        `2. 描述更具体的场景，例如「怎么给人声加混响」\n` +
        `3. 查询音乐理论，例如「什么是挂留和弦」`,
      suggestions: ['/compose', '/mix', '/help'],
      actions: [{ type: 'show_help', payload: {}, description: '显示帮助面板' }],
      confidence: 0.2,
    };
  }

  // --------------------------------------------------------------------------
  // 上下文记忆管理
  // --------------------------------------------------------------------------

  /** 向历史记录添加消息，超出上限时自动丢弃最早的消息。 */
  private pushHistory(msg: ChatMessage): void {
    this.history.push(msg);
    if (this.history.length > this.MAX_HISTORY) {
      this.history.shift();
    }
  }

  /**
   * 获取当前对话历史（只读副本）。
   */
  getHistory(): ReadonlyArray<ChatMessage> {
    return Object.freeze([...this.history]);
  }

  /**
   * 清空对话历史。
   */
  clearHistory(): void {
    this.history = [];
  }

  /**
   * 获取知识库引用（用于外部扩展）。
   */
  getKnowledgeBase(): KnowledgeBase {
    return this.knowledge;
  }

  /**
   * 设置当前项目快照（供分析功能使用）。
   * @param project 项目快照
   */
  setProjectSnapshot(project: ProjectSnapshot): void {
    this.currentProject = project;
  }
}

// ============================================================================
// 辅助工具函数
// ============================================================================

/**
 * 简单的字符串相似度（Levenshtein 距离归一化），用于未来扩展的模糊匹配。
 * @param a 字符串 a
 * @param b 字符串 b
 */
export function stringSimilarity(a: string, b: string): number {
  const len = Math.max(a.length, b.length);
  if (len === 0) return 1;
  const dist = levenshteinDistance(a, b);
  return 1 - dist / len;
}

/**
 * 计算 Levenshtein 编辑距离。
 * @param a 源字符串
 * @param b 目标字符串
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = b[i - 1] === a[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // 删除
        matrix[i][j - 1] + 1,      // 插入
        matrix[i - 1][j - 1] + cost // 替换
      );
    }
  }
  return matrix[b.length][a.length];
}

// ============================================================================
// 模块默认导出
// ============================================================================
export default AIAssistant;
