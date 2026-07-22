export type VoiceAction = 'compose' | 'arrange' | 'full';

export interface VoiceCommandResult {
  style?: string;
  emotion?: string;
  key?: string;
  bpm?: number;
  includeVoice?: boolean;
  includeLyrics?: boolean;
  action: VoiceAction;
  rawParams: Record<string, string | number | boolean | undefined>;
}

const STYLE_KEYWORDS: Record<string, string[]> = {
  pop: ['流行', 'pop', ' Pop'],
  chinese: ['中国风', '古风', 'chinese'],
  rock: ['摇滚', 'rock'],
  jazz: ['爵士', 'jazz'],
  electronic: ['电子', 'electronic'],
  classical: ['古典', 'classical'],
  folk: ['民谣', 'folk'],
  pekingOpera: ['京剧', 'peking opera'],
  kunqu: ['昆曲', 'kunqu'],
  mongolian: ['蒙古', 'mongolian'],
  tibetan: ['藏族', 'tibetan'],
  kpop: ['K-Pop', 'Kpop', 'kpop', '韩流'],
  reggae: ['雷鬼', 'reggae'],
  funk: ['放克', 'funk'],
  soul: ['灵魂乐', 'soul'],
  latin: ['拉丁', 'latin'],
};

const EMOTION_KEYWORDS: Record<string, string[]> = {
  happy: ['欢快', '开心', '快乐', '高兴', '愉快'],
  sad: ['忧伤', '悲伤', '难过', '哀伤', '愁'],
  romantic: ['浪漫', '爱情', '甜蜜', '温馨'],
  tense: ['紧张', '刺激', '悬疑', '急促'],
  epic: ['史诗', '宏大', '壮丽', '磅礴'],
  angry: ['愤怒', '暴躁', '激昂', '愤慨'],
  calm: ['平静', '安静', '宁静', '祥和'],
  nostalgic: ['怀旧', '回忆', '思念', '往昔'],
};

const KEY_PATTERNS: RegExp[] = [
  /([A-G][#b]?)(大调)/,
  /([A-G][#b]?)(小调)/,
  /([A-G][#b]?)(major)/i,
  /([A-G][#b]?)(minor)/i,
];

const SPEED_KEYWORDS: Record<string, number> = {
  fast: 140,
  slow: 80,
  medium: 120,
};

function extractStyle(text: string): string | undefined {
  for (const [style, keywords] of Object.entries(STYLE_KEYWORDS)) {
    for (const kw of keywords) {
      if (text.includes(kw)) return style;
    }
  }
  return undefined;
}

function extractEmotion(text: string): string | undefined {
  for (const [emotion, keywords] of Object.entries(EMOTION_KEYWORDS)) {
    for (const kw of keywords) {
      if (text.includes(kw)) return emotion;
    }
  }
  return undefined;
}

function extractKey(text: string): string | undefined {
  for (const pattern of KEY_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const root = match[1];
      const type = match[2];
      if (type === '大调' || type.toLowerCase() === 'major') return root;
      if (type === '小调' || type.toLowerCase() === 'minor') return `${root}m`;
    }
  }
  return undefined;
}

function extractBpm(text: string): number | undefined {
  const directMatch = text.match(/(\d+)\s*(?:BPM|bpm|拍\/分钟)/);
  if (directMatch) return parseInt(directMatch[1], 10);

  if (/快(一点|速|节奏)?|加速|急促/.test(text)) return SPEED_KEYWORDS.fast;
  if (/慢(一点|速|节奏)?|减速|舒缓/.test(text)) return SPEED_KEYWORDS.slow;
  if (/中等(速度|节奏)?|适中|标准/.test(text)) return SPEED_KEYWORDS.medium;

  return undefined;
}

function determineAction(text: string): VoiceAction {
  if (/来一首|写一首|创作一首|生成一首|给我来|给我唱/.test(text)) {
    if (/伴奏|编曲|乐队|配器/.test(text)) return 'arrange';
    if (/歌词|词|歌(?!词)/.test(text) && !/纯音乐|伴奏/.test(text)) return 'full';
    return 'full';
  }
  if (/给我一段|来一段|生成一段/.test(text)) {
    if (/伴奏|编曲|乐队|配器/.test(text)) return 'arrange';
    return 'compose';
  }
  if (/伴奏|编曲|乐队|配器/.test(text)) return 'arrange';
  if (/作曲|旋律|主题/.test(text)) return 'compose';
  return 'full';
}

function determineIncludeVoice(text: string): boolean | undefined {
  if (/加上人声|真人声|真实人声|人声演唱|唱歌/.test(text)) return true;
  if (/纯音乐|器乐|无人声|不要人声|instrumental/.test(text)) return false;
  return undefined;
}

function determineIncludeLyrics(text: string): boolean | undefined {
  if (/加上歌词|写歌词|要歌词|带歌词|歌词/.test(text)) return true;
  if (/纯音乐|器乐|无人声|不要歌词|instrumental/.test(text)) return false;
  return undefined;
}

export function parseVoiceCommand(text: string): VoiceCommandResult {
  const normalized = text.trim();
  const style = extractStyle(normalized);
  const emotion = extractEmotion(normalized);
  const key = extractKey(normalized);
  const bpm = extractBpm(normalized);
  const action = determineAction(normalized);
  const includeVoice = determineIncludeVoice(normalized);
  const includeLyrics = determineIncludeLyrics(normalized);

  return {
    style,
    emotion,
    key,
    bpm,
    includeVoice,
    includeLyrics,
    action,
    rawParams: {
      input: normalized,
      detectedStyle: style,
      detectedEmotion: emotion,
      detectedKey: key,
      detectedBpm: bpm,
      detectedAction: action,
      detectedIncludeVoice: includeVoice,
      detectedIncludeLyrics: includeLyrics,
    },
  };
}

export function getSupportedCommands(): {
  styles: string[];
  emotions: string[];
  keys: string[];
  speeds: string[];
  specialCommands: string[];
} {
  return {
    styles: Object.values(STYLE_KEYWORDS).flat(),
    emotions: Object.values(EMOTION_KEYWORDS).flat(),
    keys: ['C大调', 'G大调', 'D大调', 'A大调', 'E大调', 'F大调', 'B♭大调', 'A小调', 'E小调', 'D小调', 'G小调', 'C小调'],
    speeds: ['快', '快一点', '快节奏', '慢', '慢一点', '慢节奏', '中等'],
    specialCommands: [
      '来一首...',
      '给我一段...伴奏',
      '写一首...风格的歌',
      '加上人声',
      '纯音乐',
    ],
  };
}
