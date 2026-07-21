/**
 * 标准 MIDI 文件 (SMF) 导出器
 * Format 1, 1 track, 480 ticks per quarter note
 */

export interface NoteEvent {
  /** MIDI 音符编号 (0-127) */
  midi: number;
  /** 起始时间（秒） */
  startTime: number;
  /** 持续时间（秒） */
  duration: number;
  /** 力度 (0-1) */
  velocity: number;
}

/** 将可变长度数值编码为 VLQ 字节序列 */
function encodeVLQ(value: number): number[] {
  const bytes: number[] = [];
  let v = value;
  do {
    bytes.unshift((v & 0x7f) | 0x80);
    v >>>= 7;
  } while (v > 0);
  bytes[bytes.length - 1] &= 0x7f;
  return bytes;
}

/** 将字符串转为字节数组 */
function strToBytes(str: string): number[] {
  return Array.from(str).map((c) => c.charCodeAt(0) & 0xff);
}

/** 将 32 位无符号整数写为大端 4 字节 */
function u32be(v: number): number[] {
  return [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];
}

/** 将 16 位无符号整数写为大端 2 字节 */
function u16be(v: number): number[] {
  return [(v >>> 8) & 0xff, v & 0xff];
}

/** 调性字符串解析为 MIDI Key Signature 参数 */
function parseKeySignature(key?: string): { sf: number; mi: number } {
  if (!key) return { sf: 0, mi: 0 };
  const normalized = key.trim();
  const lower = normalized.toLowerCase();
  const isMinor = lower.endsWith('m') || lower.includes('minor');
  const root = normalized
    .replace(/m(inor)?$/i, '')
    .replace(/\s*major$/i, '')
    .trim();

  const majorMap: Record<string, number> = {
    C: 0,
    G: 1,
    D: 2,
    A: 3,
    E: 4,
    B: 5,
    'F#': 6,
    Gb: 6,
    'C#': 7,
    Db: -5,
    F: -1,
    Bb: -2,
    'A#': -2,
    Eb: -3,
    'D#': -3,
    Ab: -4,
    'G#': -4,
    Cb: -7,
  };

  const minorMap: Record<string, number> = {
    A: 0,
    E: 1,
    B: 2,
    'F#': 3,
    'C#': 4,
    'G#': 5,
    'D#': 6,
    'A#': 7,
    D: -1,
    G: -2,
    C: -3,
    F: -4,
    Bb: -5,
    Eb: -6,
    Ab: -7,
  };

  const sf = isMinor ? (minorMap[root] ?? 0) : (majorMap[root] ?? 0);
  return { sf, mi: isMinor ? 1 : 0 };
}

/** 构建 Meta Event 字节序列（不含 delta time） */
function metaEvent(metaType: number, data: number[]): number[] {
  return [0xff, metaType, ...encodeVLQ(data.length), ...data];
}

/** 构建 MIDI Channel Event 字节序列（不含 delta time） */
function channelEvent(status: number, data1: number, data2: number): number[] {
  return [status, data1 & 0x7f, data2 & 0x7f];
}

/**
 * 将 NoteEvent 数组转为标准 MIDI 文件 (SMF Format 1) 的 Uint8Array
 */
export function noteEventsToMidi(
  noteEvents: NoteEvent[],
  bpm: number,
  key?: string
): Uint8Array {
  const division = 480;
  const ticksPerSecond = (bpm * division) / 60;

  // 构建所有事件（Note On / Note Off）
  interface MidiEvent {
    tick: number;
    bytes: number[];
  }

  const events: MidiEvent[] = [];

  for (const ne of noteEvents) {
    const note = Math.max(0, Math.min(127, Math.round(ne.midi)));
    const velocity = Math.max(0, Math.min(127, Math.round(ne.velocity * 127)));
    const startTick = Math.max(0, Math.round(ne.startTime * ticksPerSecond));
    const durationTick = Math.max(0, Math.round(ne.duration * ticksPerSecond));
    const endTick = startTick + durationTick;

    events.push({
      tick: startTick,
      bytes: channelEvent(0x90, note, velocity),
    });
    events.push({
      tick: endTick,
      bytes: channelEvent(0x80, note, velocity),
    });
  }

  // 按时间排序，同一时间 Note On 在 Note Off 之前
  events.sort((a, b) => {
    if (a.tick !== b.tick) return a.tick - b.tick;
    // Note On (0x90...) 排在 Note Off (0x80...) 前面
    const aIsOn = a.bytes[0] === 0x90;
    const bIsOn = b.bytes[0] === 0x90;
    if (aIsOn && !bIsOn) return -1;
    if (!aIsOn && bIsOn) return 1;
    return 0;
  });

  // 构建 Track 数据
  const trackData: number[] = [];

  // 拍号 4/4
  trackData.push(...encodeVLQ(0));
  trackData.push(...metaEvent(0x58, [0x04, 0x02, 0x18, 0x08]));

  // 速度
  const usPerQuarter = Math.round(60_000_000 / bpm);
  trackData.push(...encodeVLQ(0));
  trackData.push(...metaEvent(0x51, [(usPerQuarter >>> 16) & 0xff, (usPerQuarter >>> 8) & 0xff, usPerQuarter & 0xff]));

  // 调号
  const { sf, mi } = parseKeySignature(key);
  trackData.push(...encodeVLQ(0));
  trackData.push(...metaEvent(0x59, [sf & 0xff, mi & 0xff]));

  // 音符事件
  let lastTick = 0;
  for (const ev of events) {
    const delta = ev.tick - lastTick;
    trackData.push(...encodeVLQ(delta));
    trackData.push(...ev.bytes);
    lastTick = ev.tick;
  }

  // End of Track
  const finalDelta = events.length > 0 ? 0 : 0;
  trackData.push(...encodeVLQ(finalDelta));
  trackData.push(...metaEvent(0x2f, []));

  // Header chunk
  const header: number[] = [
    ...strToBytes('MThd'),
    ...u32be(6),
    ...u16be(1),
    ...u16be(1),
    ...u16be(division),
  ];

  // Track chunk
  const trackChunk: number[] = [
    ...strToBytes('MTrk'),
    ...u32be(trackData.length),
    ...trackData,
  ];

  return new Uint8Array([...header, ...trackChunk]);
}
