/**
 * 青鸾 DAW — 项目保存与加载系统
 * Project Save/Load System
 */

// ═════════════════════════════════════════════════════════════
// Part 0: 类型定义
// ═════════════════════════════════════════════════════════════

/** 通用音符事件（兼容 Composer 与 Arranger 两种格式） */
export interface ProjectNoteEvent {
  pitch?: number;
  midi?: number;
  duration: number;
  velocity: number;
  offset?: number;
  startTime?: number;
  slideTo?: number;
  ornaments?: number[];
}

/** 序列化后的音轨 */
export interface SerializedTrack {
  name: string;
  notes: ProjectNoteEvent[];
}

/** 编曲序列化形式（tracks 名 + NoteEvent[]） */
export interface SerializedArrangement {
  tracks: SerializedTrack[];
  mixed?: number[] | Float32Array;
  sampleRate: number;
  duration: number;
}

/** 作曲参数 */
export interface CompositionParams {
  key: string;
  bpm: number;
  style: string;
  emotion: string;
  barCount: number;
  algorithm?: string;
  length?: number;
  sections?: number;
}

/** 母带参数 */
export interface MasteringSettings {
  targetLUFS: number;
  applied: string[];
}

/** 认知引擎状态 */
export interface CognitiveState {
  memoryBank?: { memories: unknown[]; edges: unknown[] };
  knowledgeGraph?: unknown[];
  t6History: unknown[];
}

/** 自学习状态 */
export interface LearningState {
  feedbackRecords: unknown[];
  hyperparameters: Record<string, unknown>;
  abilityMatrix: unknown;
}

/** 青鸾项目 */
export interface QingluanProject {
  version: string;
  name: string;
  createdAt: string;
  compositionParams: CompositionParams;
  melody: ProjectNoteEvent[];
  arrangement: SerializedArrangement;
  lyrics?: string[];
  masteringSettings: MasteringSettings;
  cognitiveState: CognitiveState;
  learningState: LearningState;
}

const CURRENT_VERSION = '1.0.0';

// ═════════════════════════════════════════════════════════════
// Part 1: 序列化 / 反序列化
// ═════════════════════════════════════════════════════════════

/**
 * 将项目序列化为 Base64 JSON 字符串
 * Float32Array 会被标记为 { __type: 'Float32Array', data: number[] }
 */
export function serializeProject(project: QingluanProject): string {
  const json = JSON.stringify(project, (_key: string, value: unknown) => {
    if (value instanceof Float32Array) {
      return { __type: 'Float32Array', data: Array.from(value) };
    }
    return value;
  });
  return Buffer.from(json).toString('base64');
}

/**
 * 从 Base64 JSON 字符串反序列化项目
 * 带有 Float32Array 恢复和版本兼容性检查
 */
export function deserializeProject(data: string): QingluanProject {
  let json: string;
  try {
    json = Buffer.from(data, 'base64').toString('utf-8');
  } catch {
    throw new Error('Invalid project file: Base64 decode failed');
  }

  const parsed: unknown = JSON.parse(json, (_key: string, value: unknown) => {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      (value as Record<string, unknown>).__type === 'Float32Array' &&
      Array.isArray((value as Record<string, unknown>).data)
    ) {
      return new Float32Array((value as Record<string, number[]>).data);
    }
    return value;
  });

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid project file: not a JSON object');
  }

  const proj = parsed as QingluanProject;

  if (!proj.version) {
    throw new Error('Invalid project file: missing version');
  }

  // 版本兼容性检查：主版本号必须一致
  const major = String(proj.version).split('.')[0];
  const currentMajor = CURRENT_VERSION.split('.')[0];
  if (major !== currentMajor) {
    throw new Error(
      `Project version incompatible: ${proj.version} (expected ${CURRENT_VERSION})`
    );
  }

  // 确保关键字段存在，提供默认值以兼容未来小版本变更
  if (!proj.compositionParams) {
    proj.compositionParams = {
      key: 'C',
      bpm: 120,
      style: 'pop',
      emotion: 'happy',
      barCount: 8,
    };
  }
  if (!proj.melody) {
    proj.melody = [];
  }
  if (!proj.arrangement) {
    proj.arrangement = { tracks: [], sampleRate: 44100, duration: 0 };
  }
  if (!proj.masteringSettings) {
    proj.masteringSettings = { targetLUFS: -14, applied: [] };
  }
  if (!proj.cognitiveState) {
    proj.cognitiveState = { t6History: [] };
  }
  if (!proj.learningState) {
    proj.learningState = { feedbackRecords: [], hyperparameters: {}, abilityMatrix: {} };
  }

  return proj;
}
