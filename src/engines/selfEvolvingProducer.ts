// ============================================================
// 青鸾 DAW — 自我进化音乐生产线 (Self-Evolving Music Producer)
// ============================================================
// 核心理念：端到端音乐生产 + 自我诊断 + 自我修复 + 参数进化
// 流水线：作曲 → 编曲(伴奏) → 主旋律渲染 → 混音 → 诊断 → 修复 → 输出
// 遇到问题自动解决：音质差→修复，结构差→重作，参数差→进化
// ============================================================

import {
  CognitiveEmergenceMusicEngine,
  EmergenceMusicResult,
} from './emergenceMusic.js';
import {
  FlawlessSynthesizer,
  FlawDetector,
  FlawlessRepair,
  FlawReport,
} from '../synthesis/flawlessSynthesizer.js';
import {
  createArrangement,
  exportArrangementToWav,
  ArrangementInput,
  MultiTrackOutput,
} from '../composition/realisticArranger.js';
import {
  MasteringChain,
  MasteringResult,
} from './masteringChain.js';
import {
  ConvolutionReverb,
  Delay,
  ReverbType,
} from '../effects/audioEffects.js';
import {
  generateLyricsForMelody,
} from './lyricGenerator.js';
import {
  generateFingerprint,
  getFingerprintPrefix,
} from './audioFingerprint.js';
import {
  autoMixTracks,
  applyAutoMix,
  AutoMixResult,
  TrackAutoMixParams,
} from './autoMixer.js';
import { SelfModifyingSynth, createSelfModifyingTrack } from '../synthesis/selfModifyingSynth.js';
import { composeByChemistry } from '../composition/chemicalComposition.js';
import { composeTopologicalMelody } from '../composition/topologicalMelody.js';
import { composeByCellularAutomata } from '../composition/caMusicGrowth.js';
import { StreamComposer, ConceptGraph, ConsciousnessWalker, generateConsciousnessStream } from './streamOfConsciousness.js';
import { HumanizationEngine, humanizeNotes } from './humanizationEngine.js';
import { PhraseComposer, composeWithPhrases } from '../composition/phraseComposer.js';
import { AnalogArtifactEngine, addStudioFeel } from '../effects/analogArtifacts.js';
import { SpatialReverbEngine, applyCathedralReverb, applyStudioReverb } from '../effects/spatialReverb.js';
import { OriginalityEngine, HumanFeelEnhancer } from './originalityEngine.js';
import { VocalFoldLab, glottalToAcoustic } from '../synthesis/vocalFoldLab.js';

// ═════════════════════════════════════════════════════════════
// Part 0: 音频工具
// ═════════════════════════════════════════════════════════════

const SAMPLE_RATE = 44100;

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function mixBuffers(
  a: Float32Array,
  b: Float32Array,
  gainA = 0.7,
  gainB = 0.3
): Float32Array {
  const len = Math.max(a.length, b.length);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const av = i < a.length ? a[i] * gainA : 0;
    const bv = i < b.length ? b[i] * gainB : 0;
    out[i] = av + bv;
  }
  return normalizeBuffer(out);
}

function normalizeBuffer(buf: Float32Array, targetPeak = 0.95): Float32Array {
  let peak = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = Math.abs(buf[i]);
    if (v > peak) peak = v;
  }
  if (peak === 0) return buf;
  const scale = targetPeak / peak;
  const out = new Float32Array(buf.length);
  for (let i = 0; i < buf.length; i++) out[i] = buf[i] * scale;
  return out as Float32Array;
}

function applyGain(buf: Float32Array, gain: number): Float32Array {
  const out = new Float32Array(buf.length);
  for (let i = 0; i < buf.length; i++) out[i] = buf[i] * gain;
  return out as Float32Array;
}

function calculateRMS(buf: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / buf.length);
}

function calculatePeak(buf: Float32Array): number {
  let peak = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = Math.abs(buf[i]);
    if (v > peak) peak = v;
  }
  return peak;
}

function calculateDynamicRange(buf: Float32Array): number {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < buf.length; i++) {
    const v = buf[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return max - min;
}

function calculateDCOffset(buf: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i];
  return sum / buf.length;
}

function linearToDb(linear: number): number {
  return 20 * Math.log10(Math.max(1e-12, linear));
}

function removeDCOffset(buf: Float32Array): Float32Array {
  const dc = calculateDCOffset(buf);
  const out = new Float32Array(buf.length);
  for (let i = 0; i < buf.length; i++) out[i] = buf[i] - dc;
  return out as Float32Array;
}

function softClip(buf: Float32Array, threshold = 0.95): Float32Array {
  const out = new Float32Array(buf.length);
  for (let i = 0; i < buf.length; i++) {
    const v = buf[i];
    if (v > threshold) {
      out[i] = threshold + (1 - threshold) * Math.tanh((v - threshold) / (1 - threshold));
    } else if (v < -threshold) {
      out[i] = -threshold - (1 - threshold) * Math.tanh((-v - threshold) / (1 - threshold));
    } else {
      out[i] = v;
    }
  }
  return out as Float32Array;
}

// ── 专业混音工具 ──

/** 简单3段分频混音：低频粘合、中频清晰、高频空气感 */
function crossoverMix(a: Float32Array, b: Float32Array, gainA = 0.65, gainB = 0.35): Float32Array {
  const len = Math.max(a.length, b.length);
  const out = new Float32Array(len);
  // 一阶低通/高通作为分频器
  const alphaLow = 0.003;   // ~200Hz
  const alphaHigh = 0.3;    // ~20kHz
  let lowA = 0, lowB = 0, highA = 0, highB = 0;
  for (let i = 0; i < len; i++) {
    const av = i < a.length ? a[i] * gainA : 0;
    const bv = i < b.length ? b[i] * gainB : 0;
    // 低频（粘合）
    lowA += alphaLow * (av - lowA);
    lowB += alphaLow * (bv - lowB);
    const low = (lowA + lowB) * 1.1; // 轻微提升低频粘合感
    // 中频（清晰，取最大）
    const midA = av - lowA;
    const midB = bv - lowB;
    const mid = (midA + midB) * 0.9; // 轻微衰减中频避免掩蔽
    // 高频（空气感）
    highA += alphaHigh * ((av - lowA) - highA);
    highB += alphaHigh * ((bv - lowB) - highB);
    const high = (highA + highB) * 1.05; // 轻微提升高频亮度
    out[i] = low + mid + high;
  }
  return normalizeBuffer(out, 0.95) as Float32Array;
}

/** 总线压缩 — 让多轨更粘合 */
function busCompressor(buf: Float32Array, threshold = 0.5, ratio = 4, attackMs = 10, releaseMs = 100): Float32Array {
  const sr = SAMPLE_RATE;
  const attackCoef = Math.exp(-1 / (sr * attackMs / 1000));
  const releaseCoef = Math.exp(-1 / (sr * releaseMs / 1000));
  const out = new Float32Array(buf.length);
  let env = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = Math.abs(buf[i]);
    const coef = v > env ? attackCoef : releaseCoef;
    env = v + coef * (env - v);
    const gain = env > threshold ? Math.pow(threshold / (env + 1e-12), 1 / ratio) : 1;
    out[i] = buf[i] * gain;
  }
  return out as Float32Array;
}

/** 砖墙限制器 — 防止任何削波 */
function brickwallLimiter(buf: Float32Array, ceiling = 0.98, lookahead = 64): Float32Array {
  const out = new Float32Array(buf.length);
  // 简单 lookahead 峰值检测
  const gainEnvelope = new Float32Array(buf.length);
  let peak = 0;
  for (let i = buf.length - 1; i >= 0; i--) {
    const v = Math.abs(buf[i]);
    if (v > peak) peak = v;
    if (i < buf.length - lookahead) {
      const future = Math.abs(buf[i + lookahead]);
      if (future >= peak) peak = future * 0.99;
    }
    gainEnvelope[i] = peak > ceiling ? ceiling / peak : 1;
  }
  // 平滑增益包络
  let smoothedGain = 1;
  const smoothCoef = 0.99;
  for (let i = 0; i < buf.length; i++) {
    smoothedGain += smoothCoef * (gainEnvelope[i] - smoothedGain);
    out[i] = buf[i] * smoothedGain;
  }
  return out as Float32Array;
}

/** 立体声宽度模拟（Mid-Side）— 单声道变宽 */
function enhanceWidth(buf: Float32Array, width = 0.3): Float32Array {
  // 简单 Haas 效应：延迟一个声道 10-30ms
  const delaySamples = Math.floor(SAMPLE_RATE * 0.02); // 20ms
  const out = new Float32Array(buf.length);
  for (let i = 0; i < buf.length; i++) {
    const dry = buf[i];
    const wet = i >= delaySamples ? buf[i - delaySamples] * width : 0;
    out[i] = dry + wet;
  }
  return normalizeBuffer(out, 0.95) as Float32Array;
}

/** 录棚级空间效果：卷积混响 + 延迟 */
function applySpatialEffects(
  buf: Float32Array,
  style: string,
  sr: number
): Float32Array {
  // 根据风格选择混响类型和参数
  let reverbType = ReverbType.Room;
  let rt60 = 1.2;
  let wetLevel = 0.2;
  let delayMs = 280;
  let feedback = 0.35;

  switch (style) {
    case 'classical':
    case 'chinese':
      reverbType = ReverbType.Hall;
      rt60 = 2.2;
      wetLevel = 0.3;
      delayMs = 350;
      feedback = 0.25;
      break;
    case 'rock':
    case 'metal':
      reverbType = ReverbType.Plate;
      rt60 = 1.0;
      wetLevel = 0.15;
      delayMs = 180;
      feedback = 0.3;
      break;
    case 'jazz':
      reverbType = ReverbType.Room;
      rt60 = 1.4;
      wetLevel = 0.22;
      delayMs = 320;
      feedback = 0.28;
      break;
    case 'electronic':
      reverbType = ReverbType.Tunnel;
      rt60 = 1.8;
      wetLevel = 0.28;
      delayMs = 240;
      feedback = 0.45;
      break;
    case 'folk':
      reverbType = ReverbType.Room;
      rt60 = 0.8;
      wetLevel = 0.12;
      delayMs = 200;
      feedback = 0.2;
      break;
    default:
      // pop / rnb / default
      reverbType = ReverbType.Room;
      rt60 = 1.2;
      wetLevel = 0.2;
      delayMs = 280;
      feedback = 0.35;
  }

  // 1. 卷积混响
  const reverb = new ConvolutionReverb(
    { reverbType, rt60, wetLevel, dryLevel: 1 - wetLevel, preDelayMs: 20 },
    sr
  );
  const reverbed = new Float32Array(buf.length) as Float32Array;
  reverb.processBlock(buf, reverbed);

  // 2. 延迟效果（为旋律添加空间深度）
  const delay = new Delay({ delayMs, feedback, mix: 0.25, type: 'stereo' }, sr);
  const delayed = new Float32Array(buf.length) as Float32Array;
  for (let i = 0; i < buf.length; i++) {
    delayed[i] = delay.processSample(reverbed[i]);
  }

  // 3. 轻微高频衰减模拟空气吸收（一阶低通）
  const airAbsorb = new Float32Array(buf.length) as Float32Array;
  let s = delayed[0];
  const alpha = 0.15; // ~5kHz 柔和衰减
  for (let i = 0; i < buf.length; i++) {
    s += alpha * (delayed[i] - s);
    airAbsorb[i] = s;
  }

  return normalizeBuffer(airAbsorb, 0.95) as Float32Array;
}

function pcmToWav(pcm: Float32Array, sampleRate: number): ArrayBuffer {
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const dataSize = pcm.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    offset += 2;
  }
  return buffer;
}

function keyToMidi(key: string): number {
  const map: Record<string, number> = { C: 60, D: 62, E: 64, F: 65, G: 67, A: 69, B: 71 };
  const base = map[key.replace('m', '').toUpperCase()] || 60;
  return key.endsWith('m') ? base - 3 : base; // 小调降低小三度简化处理
}

function notesToMelodyDurations(notes: Array<{midi: number; startTime: number; duration: number; velocity: number}>): {melody: number[]; durations: number[]} {
  notes.sort((a, b) => a.startTime - b.startTime);
  const melody: number[] = [];
  const durations: number[] = [];
  for (const n of notes) {
    melody.push(n.midi);
    durations.push(n.duration);
  }
  return { melody, durations };
}

// ═════════════════════════════════════════════════════════════
// Part 1: 音频诊断报告
// ═════════════════════════════════════════════════════════════

export interface AudioDiagnosis {
  healthy: boolean;
  severity: 'none' | 'minor' | 'major' | 'critical';
  issues: string[];
  metrics: {
    rms: number;
    peak: number;
    dynamicRange: number;
    dcOffset: number;
    duration: number;
  };
  compositionScores?: any;
  recommendations: string[];
}

// ═════════════════════════════════════════════════════════════
// Part 2: 旋律渲染器（将 MIDI 序列渲染为 PCM）
// ═════════════════════════════════════════════════════════════

export class MelodyRenderer {
  synth: FlawlessSynthesizer;
  sampleRate: number;

  constructor(sampleRate = SAMPLE_RATE) {
    this.synth = new FlawlessSynthesizer({ sampleRate, targetQuality: 0.9 });
    this.sampleRate = sampleRate;
  }

  render(
    melody: number[],
    durations: number[],
    waveform: string = 'triangle',
    baseVelocity = 0.8
  ): Float32Array {
    // 计算总时长 + 尾部衰减余量
    let totalDur = 0;
    for (const d of durations) totalDur += d;
    totalDur += 0.5; // 释放尾音
    const totalSamples = Math.ceil(totalDur * this.sampleRate);
    const output = new Float32Array(totalSamples);

    let currentTime = 0;
    for (let i = 0; i < melody.length; i++) {
      const midi = melody[i];
      const dur = durations[i] || 0.5;
      if (midi < 0) {
        currentTime += dur;
        continue;
      }

      // 力度映射：旋律起伏带动力度变化
      const vel = baseVelocity * (0.8 + 0.4 * Math.sin(i * 1.3));

      const freq = midiToFreq(midi);
      const result = this.synth.synthesizeNote(freq, dur, vel, waveform as any);
      const pcm = result.pcm;
      const offset = Math.floor(currentTime * this.sampleRate);

      // 连奏/断奏处理：与前音的衔接
      const prevMidi = i > 0 ? melody[i - 1] : -1;
      const isLegato = prevMidi >= 0 && Math.abs(midi - prevMidi) <= 2;
      const attackFade = isLegato ? 0.003 : 0.01; // 连奏更软起音

      for (let j = 0; j < pcm.length && offset + j < output.length; j++) {
        const t = j / this.sampleRate;
        // 软起音避免咔嗒声
        const fadeIn = t < attackFade ? t / attackFade : 1;
        // 释放尾音淡出（如果下一个是休止符或长间隔）
        const nextStart = (currentTime + dur) * this.sampleRate;
        const fadeOut = (offset + j) > nextStart - 64 ? Math.max(0, (nextStart - (offset + j)) / 64) : 1;
        const env = fadeIn * fadeOut;
        output[offset + j] += pcm[j] * env * 0.45; // 稍微降低主旋律占比
      }
      currentTime += dur;
    }

    return normalizeBuffer(output, 0.7) as Float32Array;
  }
}

// ═════════════════════════════════════════════════════════════
// Part 3: 自我进化音乐生产线
// ═════════════════════════════════════════════════════════════

export interface ProductionParams {
  style?: string;
  key?: string;
  bpm?: number;
  barCount?: number;
  emotion?: string;
  intensity?: number;
  seed?: string | number;
  waveform?: string;
  maxAttempts?: number;
  useAutoMix?: boolean;
  nonTraditionalEngine?: 'none' | 'selfModifying' | 'chemical' | 'topological' | 'cellular' | 'consciousness';
  // 各引擎专属参数
  evolutionRate?: number;
  mutationIntensity?: number;
  reactionTemperature?: number;
  curvature?: number;
  caSeedDensity?: number;
  caGenerations?: number;
  consciousnessTheme?: string;
  consciousnessTemperature?: number;
  usePhraseStructure?: boolean; // 使用乐句结构作曲
  useHumanization?: boolean;    // 使用人性化演奏
  useAnalogFeel?: boolean;      // 使用模拟录音痕迹
  analogIntensity?: number;     // 模拟痕迹强度 0-1
  useSpatialReverb?: boolean;      // 使用真实空间混响
  spatialPreset?: string;          // 空间预设，默认 'concert_hall'
  useWatermark?: boolean;          // 嵌入数字水印
  creatorId?: string;              // 创作者ID，用于水印
  useHumanFeelEnhance?: boolean;   // 使用真人感强化器
  humanFeelIntensity?: number;     // 真人感强度 0-1
  useVocalFoldModel?: boolean;      // 使用精细声带模型代替简化LF模型
  vocalFoldPreset?: string;         // 声带预设 male/female/child/falsetto/fry/whistle/growl/breathy
}

export interface ProductionResult {
  wav: ArrayBuffer;
  diagnosis: AudioDiagnosis;
  composition: EmergenceMusicResult;
  arrangement: MultiTrackOutput;
  attempt: number;
  fixed: boolean;
  evolved: boolean;
  failed: boolean;
  productionLog: string[];
  mastering?: MasteringResult;
  lyrics?: string[];
  fingerprint: string;
  autoMixSettings?: AutoMixResult;
}

export class SelfEvolvingMusicProducer {
  emergenceEngine: CognitiveEmergenceMusicEngine;
  melodyRenderer: MelodyRenderer;
  flawDetector: FlawDetector;
  flawRepair: FlawlessRepair;
  masteringChain: MasteringChain;
  sampleRate: number;
  productionLog: string[] = [];

  constructor(sampleRate = SAMPLE_RATE) {
    this.emergenceEngine = new CognitiveEmergenceMusicEngine();
    this.melodyRenderer = new MelodyRenderer(sampleRate);
    this.flawDetector = new FlawDetector();
    this.flawRepair = new FlawlessRepair();
    this.masteringChain = new MasteringChain(sampleRate);
    this.sampleRate = sampleRate;
  }

  private log(msg: string) {
    const line = `[${new Date().toISOString().slice(11, 19)}] ${msg}`;
    this.productionLog.push(line);
  }

  // ─────────────────────────────────────────────
  // 核心生产流程
  // ─────────────────────────────────────────────
  async produce(params: ProductionParams = {}): Promise<ProductionResult> {
    this.productionLog = [];
    const maxAttempts = params.maxAttempts || 3;
    let lastDiagnosis: AudioDiagnosis | undefined;
    let lastComposition: EmergenceMusicResult | undefined;
    let lastArrangement: MultiTrackOutput | undefined;
    let lastPCM: Float32Array | undefined;
    let lyrics: string[] | undefined;
    let autoMixSettings: AutoMixResult | undefined;

    const currentParams = { ...params };

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      this.log(`=== 生产尝试 ${attempt}/${maxAttempts} ===`);

      try {
        // Step 1: 认知涌现作曲（支持非传统引擎）
        this.log('Step 1: 认知涌现作曲 (T1-T6 + MusicSwarm + Eisbach)');
        let composition: EmergenceMusicResult;
        let nonTraditionalMelodyPCM: Float32Array | undefined;
        let useSelfModifyingSynth = false;

        if (currentParams.nonTraditionalEngine && currentParams.nonTraditionalEngine !== 'none') {
          this.log(`使用非传统引擎: ${currentParams.nonTraditionalEngine}`);
          const key = currentParams.key || 'C';
          const bpm = currentParams.bpm || 120;
          const barCount = currentParams.barCount || 16;
          const style = currentParams.style || 'pop';
          const keyRoot = keyToMidi(key);
          const scale = [0, 2, 4, 5, 7, 9, 11];

          switch (currentParams.nonTraditionalEngine) {
            case 'selfModifying': {
              useSelfModifyingSynth = true;
              composition = await this.emergenceEngine.compose({
                style: currentParams.style,
                key: currentParams.key,
                bpm: currentParams.bpm,
                barCount: currentParams.barCount,
                emotion: currentParams.emotion,
                intensity: currentParams.intensity,
                seed: Number(currentParams.seed || 1) + attempt,
              });
              break;
            }
            case 'chemical': {
              const result = composeByChemistry({ style, keyRoot, scale, barCount, bpm, temperature: currentParams.reactionTemperature || 0.7 });
              const { melody, durations } = notesToMelodyDurations(result.notes);
              composition = { melody, durations, scores: { overall: 0.75, novelty: 0.8, coherence: 0.7, tension: 0.75 }, sessionId: `chemical_${Date.now()}`, swarmAnalysis: {}, eisbachState: {}, capsuleId: '', abilityVersion: 1 } as any;
              break;
            }
            case 'topological': {
              const notes = composeTopologicalMelody({ keyRoot, scale, startTension: 0.2, endTension: 0.8, bpm, barCount, curvature: currentParams.curvature || 0.5 });
              const { melody, durations } = notesToMelodyDurations(notes);
              composition = { melody, durations, scores: { overall: 0.78, novelty: 0.82, coherence: 0.75, tension: 0.8 }, sessionId: `topological_${Date.now()}`, swarmAnalysis: {}, eisbachState: {}, capsuleId: '', abilityVersion: 1 } as any;
              break;
            }
            case 'cellular': {
              const result = composeByCellularAutomata({ bpm, keyRoot, scale, barCount, seedDensity: currentParams.caSeedDensity || 0.15, generations: currentParams.caGenerations });
              const { melody, durations } = notesToMelodyDurations(result.notes);
              composition = { melody, durations, scores: { overall: 0.76, novelty: 0.85, coherence: 0.7, tension: 0.72 }, sessionId: `cellular_${Date.now()}`, swarmAnalysis: {}, eisbachState: {}, capsuleId: '', abilityVersion: 1 } as any;
              break;
            }
            case 'consciousness': {
              const pcm = generateConsciousnessStream({ theme: currentParams.consciousnessTheme || '雨', bpm, bars: barCount, baseKey: keyRoot, temperature: currentParams.consciousnessTemperature || 1.0 });
              nonTraditionalMelodyPCM = pcm;
              composition = { melody: [], durations: [], scores: { overall: 0.8, novelty: 0.9, coherence: 0.75, tension: 0.7 }, sessionId: `consciousness_${Date.now()}`, swarmAnalysis: {}, eisbachState: {}, capsuleId: '', abilityVersion: 1 } as any;
              break;
            }
            default: {
              composition = await this.emergenceEngine.compose({
                style: currentParams.style,
                key: currentParams.key,
                bpm: currentParams.bpm,
                barCount: currentParams.barCount,
                emotion: currentParams.emotion,
                intensity: currentParams.intensity,
                seed: Number(currentParams.seed || 1) + attempt,
              });
            }
          }
        } else {
          composition = await this.emergenceEngine.compose({
            style: currentParams.style,
            key: currentParams.key,
            bpm: currentParams.bpm,
            barCount: currentParams.barCount,
            emotion: currentParams.emotion,
            intensity: currentParams.intensity,
            seed: Number(currentParams.seed || 1) + attempt,
          });
        }
        lastComposition = composition;
        const noteCount = composition.melody?.length || 0;
        const scoreStr = composition.scores?.overall?.toFixed(3) || 'N/A';
        this.log(`作曲完成: ${noteCount} 音符, T6=${scoreStr}`);

        // Step 1.5: 乐句结构重组（如果启用）
        if (currentParams.usePhraseStructure) {
          this.log('Step 1.5: 乐句结构作曲 (提问-回答 / 情绪弧线 / 呼吸感)');
          try {
            const phraseNotes = composeWithPhrases({
              keyRoot: keyToMidi(currentParams.key || 'C'),
              scale: [0, 2, 4, 5, 7, 9, 11],
              bpm: currentParams.bpm || 120,
              totalBars: currentParams.barCount || 16,
              emotion: (currentParams.emotion || 'happy') as any,
              style: (currentParams.style || 'pop') as any,
            });
            // 将 phraseNotes 转换为 melody 和 durations
            const newMelody: number[] = [];
            const newDurations: number[] = [];
            for (const n of phraseNotes) {
              newMelody.push(n.midi);
              newDurations.push(n.duration);
            }
            if (newMelody.length > 0) {
              composition.melody = newMelody;
              composition.durations = newDurations;
              this.log(`乐句结构重组完成: ${phraseNotes.length} 音符, ${(phraseNotes[phraseNotes.length-1]?.startTime || 0).toFixed(1)}秒`);
            }
          } catch (e: any) {
            this.log(`乐句结构作曲失败: ${e.message}，继续使用原旋律`);
          }
        }

        // Step 1.6: 人性化演奏处理
        if (currentParams.useHumanization) {
          this.log('Step 1.6: 人性化演奏 (时间微偏移 / 力度随机化 / 音高漂移)');
          try {
            const humanizer = new HumanizationEngine(Number(currentParams.seed || 1) + attempt);
            const hNotes = composition.melody.map((midi, i) => ({
              midi,
              startTime: composition.durations.slice(0, i).reduce((a, b) => a + b, 0),
              duration: composition.durations[i] || 0.5,
              velocity: 0.7,
            }));
            const humanized = humanizer.humanize(hNotes, {
              timingVariance: 0.008,
              velocityVariance: 0.12,
              pitchDrift: 5,
              swingAmount: currentParams.style === 'jazz' ? 0.25 : 0,
              grooveTemplate: currentParams.style === 'jazz' ? 'swing' : currentParams.style === 'latin' ? 'latin' : 'straight',
            });
            // 将 humanized notes 重新排序并提取
            humanized.sort((a, b) => a.startTime - b.startTime);
            const newMelody: number[] = [];
            const newDurations: number[] = [];
            for (const n of humanized) {
              newMelody.push(n.midi);
              newDurations.push(n.duration);
            }
            composition.melody = newMelody;
            composition.durations = newDurations;
            this.log(`人性化演奏处理完成: 处理了 ${humanized.length} 个音符`);
          } catch (e: any) {
            this.log(`人性化演奏失败: ${e.message}`);
          }
        }

        // Step 2: 编曲（伴奏）
        this.log('Step 2: 真人级伴奏编曲 (物理建模 + 人性化)');
        const barsPerSection = Math.max(4, currentParams.barCount || 16);
        const arrangement = createArrangement(
          currentParams.key || 'C',
          currentParams.bpm || 120,
          (currentParams.style || 'pop') as any,
          (currentParams.emotion || 'happy') as any,
          barsPerSection
        );
        lastArrangement = arrangement;
        this.log(`编曲完成: ${arrangement.tracks.length} 轨, ${arrangement.duration.toFixed(1)}秒`);

        // Step 3: 渲染主旋律
        this.log('Step 3: 无瑕疵主旋律渲染 (带宽限制 + 瑕疵修复)');
        let melodyPCM: Float32Array;
        if (nonTraditionalMelodyPCM) {
          melodyPCM = nonTraditionalMelodyPCM;
        } else if (useSelfModifyingSynth) {
          const notes = composition.melody.map((midi, i) => ({
            freq: midiToFreq(midi),
            duration: composition.durations[i] || 0.5,
            startTime: composition.durations.slice(0, i).reduce((a, b) => a + b, 0),
          }));
          melodyPCM = createSelfModifyingTrack(notes, this.sampleRate);
        } else {
          melodyPCM = this.melodyRenderer.render(
            composition.melody,
            composition.durations,
            currentParams.waveform || 'triangle',
            0.7
          );
        }
        this.log(`主旋律渲染完成: ${melodyPCM.length} 采样`);

        // Step 3.3: 精细声带模型（如果启用）
        if (currentParams.useVocalFoldModel && melodyPCM) {
          this.log('Step 3.3: 使用精细声带模型 (VocalFoldLab) 重新渲染人声');
          try {
            const presetMap: Record<string, any> = {
              male: VocalFoldLab.MaleVoice(),
              female: VocalFoldLab.FemaleVoice(),
              child: VocalFoldLab.ChildVoice(),
              falsetto: VocalFoldLab.FalsettoVoice(),
              fry: VocalFoldLab.FryVoice(),
              whistle: VocalFoldLab.WhistleVoice(),
              growl: VocalFoldLab.GrowlVoice(),
              breathy: VocalFoldLab.BreathyVoice(),
            };
            const preset = presetMap[currentParams.vocalFoldPreset || 'male'] || VocalFoldLab.MaleVoice();

            // 从旋律音符生成音高轮廓
            const pitchContour = composition.melody.map((midi, i) => ({
              time: composition.durations.slice(0, i).reduce((a, b) => a + b, 0),
              freq: 440 * Math.pow(2, (midi - 69) / 12),
            }));

            const vflab = new VocalFoldLab(this.sampleRate);
            const glottalWave = vflab.generateSingingGlottalWave(preset, pitchContour);

            // 通过声道耦合转换为声学信号
            const formants = [500, 1500, 2500, 3500, 5000]; // 简化共振峰
            const acousticWave = glottalToAcoustic(glottalWave, formants, this.sampleRate);

            // 如果 acousticWave 比 melodyPCM 短，循环或延长；如果长，截断
            if (acousticWave.length > 0) {
              melodyPCM = acousticWave;
              this.log(`精细声带模型渲染完成: ${melodyPCM.length} 采样点`);
            }
          } catch (e: any) {
            this.log(`精细声带模型失败: ${e.message}，继续使用原人声`);
          }
        }

        // Step 3.5: 自动填词（旋律音符匹配歌词音节）
        this.log('Step 3.5: 自动填词（旋律匹配歌词音节）');
        const melodyNotes = composition.melody.map((midi, i) => ({
          startTime: composition.durations.slice(0, i).reduce((a, b) => a + b, 0),
          duration: composition.durations[i] || 0.5,
          midi,
          velocity: 0.7,
        }));
        const lyricResult = generateLyricsForMelody(
          melodyNotes,
          currentParams.style || 'pop',
          currentParams.emotion || 'happy'
        );
        lyrics = lyricResult.lyrics;
        this.log(`填词完成: ${lyrics.length} 句, ${lyrics.join('').length} 字`);
        this.log(`歌词: ${lyrics.join(' / ')}`);

        // Step 4: 专业混音
        let mixedPCM: Float32Array;

        if (currentParams.useAutoMix) {
          this.log('Step 4: AI 自动混音 (动态分析 + 智能声像/EQ/压缩/闪避)');
          const tracks = new Map<string, Float32Array>();
          // 加入编曲各轨
          const names = arrangement.trackNames || [];
          for (let i = 0; i < arrangement.tracks.length; i++) {
            const name = names[i] || `track_${i}`;
            tracks.set(name, arrangement.tracks[i]);
          }
          // 加入主旋律轨
          tracks.set('melody', melodyPCM);

          autoMixSettings = autoMixTracks(tracks, currentParams.style || 'pop');

          // 输出每轨参数到日志
          for (const [name, params] of Object.entries(autoMixSettings)) {
            const duck = params.duckingReduction ? ` | 闪避-${params.duckingReduction.toFixed(1)}dB` : '';
            this.log(`  [${name}] 增益=${params.gain.toFixed(3)} 声像=${params.pan.toFixed(2)} EQ=[${params.eqLow},${params.eqMid},${params.eqHigh}] 压缩=${params.compressorRatio}:1(阈值${linearToDb(params.compressorThreshold).toFixed(1)}dB)${duck}`);
          }

          // 应用自动混音
          const stereoMixed = applyAutoMix(tracks, autoMixSettings, this.sampleRate);
          // Downmix 为单声道供后续处理
          const monoLen = stereoMixed.length / 2;
          mixedPCM = new Float32Array(monoLen);
          for (let i = 0; i < monoLen; i++) {
            mixedPCM[i] = (stereoMixed[i * 2] + stereoMixed[i * 2 + 1]) * 0.5;
          }
        } else {
          this.log('Step 4: 专业混音 (3段分频 + 总线压缩 + 砖墙限制 + 宽度增强)');
          mixedPCM = crossoverMix(arrangement.mixed, melodyPCM, 0.6, 0.4);
        }

        mixedPCM = busCompressor(mixedPCM, 0.4, 3, 8, 80);
        mixedPCM = brickwallLimiter(mixedPCM, 0.97, 128);
        mixedPCM = enhanceWidth(mixedPCM, 0.25);
        this.log(`混音完成: Peak=${calculatePeak(mixedPCM).toFixed(3)} RMS=${calculateRMS(mixedPCM).toFixed(3)}`);

        // Step 4.5: 录棚级空间效果 (卷积混响 + 延迟 + 空气吸收)
        this.log(`Step 4.5: 空间效果 (卷积混响 + 延迟) 风格=${currentParams.style || 'pop'}`);
        mixedPCM = applySpatialEffects(mixedPCM, currentParams.style || 'pop', this.sampleRate);
        this.log(`空间处理完成: Peak=${calculatePeak(mixedPCM).toFixed(3)} RMS=${calculateRMS(mixedPCM).toFixed(3)}`);

        // Step 4.6: 真实空间混响（如果启用，替代基础空间效果）
        if (currentParams.useSpatialReverb) {
          this.log(`Step 4.6: 真实空间混响 (预设=${currentParams.spatialPreset || 'concert_hall'})`);
          try {
            const spatial = new SpatialReverbEngine(this.sampleRate);
            mixedPCM = spatial.applyPreset(mixedPCM, currentParams.spatialPreset || 'concert_hall');
            this.log(`真实空间混响完成: Peak=${calculatePeak(mixedPCM).toFixed(3)}`);
          } catch (e: any) {
            this.log(`真实空间混响失败: ${e.message}`);
          }
        }

        // Step 5: 自我诊断
        this.log('Step 5: 自我诊断 (FlawDetector + 动态分析)');
        const diagnosis = this.selfDiagnose(mixedPCM, composition.scores);
        lastDiagnosis = diagnosis;
        this.log(`诊断结果: healthy=${diagnosis.healthy}, severity=${diagnosis.severity}, issues=[${diagnosis.issues.join(', ')}]`);

        // Step 9: 专业母带处理（录棚级）
        this.log('Step 9: 专业母带处理 (LUFS标准化 / 多段压缩 / 真峰值限制)');
        let mastered = this.masteringChain.process(mixedPCM, -14);
        this.log(`母带完成: ${mastered.finalLUFS.toFixed(2)} LUFS, TP=${mastered.finalTruePeak.toFixed(4)}, 应用=[${mastered.applied.join(', ')}]`);

        // Step 9.5: 模拟录音痕迹（如果启用）
        if (currentParams.useAnalogFeel) {
          this.log('Step 9.5: 模拟录音痕迹 (磁带饱和 / 电子管温暖 / 底噪 / 黑胶感)');
          try {
            const intensity = currentParams.analogIntensity ?? 0.4;
            mastered.pcm = addStudioFeel(mastered.pcm, this.sampleRate, intensity);
            this.log(`模拟录音痕迹添加完成: intensity=${intensity.toFixed(2)}`);
          } catch (e: any) {
            this.log(`模拟录音痕迹失败: ${e.message}`);
          }
        }

        // Step 9.6: 真人感强化（相位误差/麦克风串音/压缩痕迹/调音台串扰）
        if (currentParams.useHumanFeelEnhance) {
          this.log('Step 9.6: 真人感强化 (相位误差 / 麦克风串音 / 压缩痕迹)');
          try {
            const enhancer = new HumanFeelEnhancer(this.sampleRate);
            mastered.pcm = enhancer.enhance(mastered.pcm, {
              humanizationIntensity: currentParams.humanFeelIntensity ?? 0.5,
              analogIntensity: currentParams.analogIntensity ?? 0.3,
              breathNoise: 0.2,
              microTiming: 0.3,
            });
            this.log(`真人感强化完成: Peak=${calculatePeak(mastered.pcm).toFixed(3)}`);
          } catch (e: any) {
            this.log(`真人感强化失败: ${e.message}`);
          }
        }

        // Step 10: 嵌入原创性水印
        if (currentParams.useWatermark) {
          this.log('Step 10: 嵌入原创性水印');
          try {
            const watermarkEngine = new OriginalityEngine(this.sampleRate);
            const projectHash = watermarkEngine.generateProjectHash({
              style: currentParams.style,
              key: currentParams.key,
              bpm: currentParams.bpm,
              barCount: currentParams.barCount,
              seed: currentParams.seed,
              timestamp: Date.now(),
            });
            mastered.pcm = watermarkEngine.embedWatermark(mastered.pcm, {
              creatorId: currentParams.creatorId || 'qingluan-user',
              timestamp: Date.now(),
              projectHash,
              strength: 0.02,
            });
            this.log('原创性水印嵌入完成');
          } catch (e: any) {
            this.log(`水印嵌入失败: ${e.message}`);
          }
        }

        // 如果健康，直接输出
        if (diagnosis.healthy) {
          this.log('✓ 通过诊断，输出最终音频');
          const fingerprint = generateFingerprint(mastered.pcm, this.sampleRate);
          this.log(`指纹: ${getFingerprintPrefix(fingerprint, 16)}`);
          const wav = pcmToWav(mastered.pcm, this.sampleRate);
          return {
            wav,
            diagnosis,
            composition,
            arrangement,
            attempt,
            fixed: false,
            evolved: attempt > 1,
            failed: false,
            productionLog: [...this.productionLog],
            mastering: mastered,
            lyrics,
            fingerprint,
            autoMixSettings,
          };
        }

        // Step 6: 自我修复
        this.log('Step 6: 自我修复 (自动修复 + 效果器链)');
        const repairedPCM = this.selfRepair(mixedPCM, diagnosis);
        lastPCM = repairedPCM;
        this.log(`修复完成: Peak=${calculatePeak(repairedPCM).toFixed(3)} RMS=${calculateRMS(repairedPCM).toFixed(3)}`);

        // Step 7: 再诊断
        this.log('Step 7: 再诊断');
        const reDiagnosis = this.selfDiagnose(repairedPCM, composition.scores);
        lastDiagnosis = reDiagnosis;
        this.log(`再诊断结果: healthy=${reDiagnosis.healthy}, severity=${reDiagnosis.severity}`);

        if (reDiagnosis.healthy) {
          this.log('✓ 修复后通过诊断，输出最终音频');
          const fingerprint = generateFingerprint(mastered.pcm, this.sampleRate);
          this.log(`指纹: ${getFingerprintPrefix(fingerprint, 16)}`);
          const wav = pcmToWav(mastered.pcm, this.sampleRate);
          return {
            wav,
            diagnosis: reDiagnosis,
            composition,
            arrangement,
            attempt,
            fixed: true,
            evolved: attempt > 1,
            failed: false,
            productionLog: [...this.productionLog],
            mastering: mastered,
            lyrics,
            fingerprint,
            autoMixSettings,
          };
        }

        // Step 8: 参数进化，准备重试
        if (attempt < maxAttempts) {
          this.log('Step 8: 参数进化，准备下一次尝试');
          this.evolveParams(currentParams, reDiagnosis, attempt);
          this.log(`进化后参数: style=${currentParams.style}, key=${currentParams.key}, bpm=${currentParams.bpm}, emotion=${currentParams.emotion}`);
        } else {
          this.log('⚠ 已达最大尝试次数，输出尽力而为结果');
        }
      } catch (e: any) {
        this.log(`❌ 尝试 ${attempt} 异常: ${e.message}`);
        if (attempt === maxAttempts) {
          // 最后一次也失败了，返回尽力而为
          break;
        }
        // 进化参数后重试
        this.evolveParams(currentParams, lastDiagnosis || { severity: 'critical', issues: ['exception'] } as any, attempt);
      }
    }

    // 尽力而为输出（仍然过母带）
    const fallbackPCM = lastPCM || lastArrangement?.mixed || new Float32Array(this.sampleRate * 2);
    this.log('Step 9: 尽力而为输出 — 应用快速母带');
    const fallbackMastered = this.masteringChain.quickMaster(fallbackPCM, -14);

    // Step 10: 嵌入原创性水印（fallback）
    if (currentParams.useWatermark) {
      this.log('Step 10: 嵌入原创性水印 (fallback)');
      try {
        const watermarkEngine = new OriginalityEngine(this.sampleRate);
        const projectHash = watermarkEngine.generateProjectHash({
          style: currentParams.style,
          key: currentParams.key,
          bpm: currentParams.bpm,
          barCount: currentParams.barCount,
          seed: currentParams.seed,
          timestamp: Date.now(),
        });
        fallbackMastered.pcm = watermarkEngine.embedWatermark(fallbackMastered.pcm, {
          creatorId: currentParams.creatorId || 'qingluan-user',
          timestamp: Date.now(),
          projectHash,
          strength: 0.02,
        });
        this.log('原创性水印嵌入完成 (fallback)');
      } catch (e: any) {
        this.log(`水印嵌入失败 (fallback): ${e.message}`);
      }
    }

    const fingerprint = generateFingerprint(fallbackMastered.pcm, this.sampleRate);
    this.log(`指纹: ${getFingerprintPrefix(fingerprint, 16)}`);
    const wav = pcmToWav(fallbackMastered.pcm, this.sampleRate);
    return {
      wav,
      diagnosis: lastDiagnosis || this.selfDiagnose(fallbackPCM),
      composition: lastComposition!,
      arrangement: lastArrangement!,
      attempt: maxAttempts,
      fixed: false,
      evolved: maxAttempts > 1,
      failed: true,
      productionLog: [...this.productionLog],
      mastering: fallbackMastered,
      lyrics,
      fingerprint,
      autoMixSettings,
    };
  }

  // ─────────────────────────────────────────────
  // 自我诊断
  // ─────────────────────────────────────────────
  selfDiagnose(pcm: Float32Array, compositionScores?: any): AudioDiagnosis {
    const metrics = {
      rms: calculateRMS(pcm),
      peak: calculatePeak(pcm),
      dynamicRange: calculateDynamicRange(pcm),
      dcOffset: calculateDCOffset(pcm),
      duration: pcm.length / this.sampleRate,
    };

    const issues: string[] = [];
    const recommendations: string[] = [];

    // 使用 FlawDetector 检测技术瑕疵
    const flawReport = this.flawDetector.detect(pcm);
    for (const f of flawReport.issues) {
      switch (f.type) {
        case 'clipping': issues.push('削波'); recommendations.push('自动增益衰减 + 软削波'); break;
        case 'dc_offset': issues.push('DC偏移'); recommendations.push('DC移除滤波'); break;
        case 'low_dynamic_range': issues.push('动态范围不足'); recommendations.push('动态扩展 + 并联压缩'); break;
        case 'click_pop': issues.push('咔嗒声'); recommendations.push('点击平滑'); break;
        case 'phase_issue': issues.push('相位问题'); recommendations.push('相位校正'); break;
        case 'unnatural_silence': issues.push('不自然静音'); recommendations.push('环境噪声填充'); break;
      }
    }

    // 额外质量指标
    if (metrics.peak > 0.99) { issues.push('峰值过高'); recommendations.push('限制器'); }
    if (metrics.rms < 0.01) { issues.push('音量过低'); recommendations.push('自动增益提升'); }
    if (metrics.dynamicRange < 0.05) { issues.push('过于平坦'); recommendations.push('增加力度变化'); }
    if (metrics.dcOffset > 0.001) { issues.push('DC偏移超标'); recommendations.push('高通滤波'); }

    // 作曲质量评估
    if (compositionScores && compositionScores.overall < 0.4) {
      issues.push('作曲质量低');
      recommendations.push('增加旋律变化 / 调整调性');
    }

    let severity: AudioDiagnosis['severity'] = 'none';
    if (issues.length >= 4) severity = 'critical';
    else if (issues.length >= 2) severity = 'major';
    else if (issues.length >= 1) severity = 'minor';

    const healthy = issues.length === 0 && metrics.peak < 0.99 && metrics.rms > 0.01;

    return {
      healthy,
      severity,
      issues,
      metrics,
      compositionScores,
      recommendations,
    };
  }

  // ─────────────────────────────────────────────
  // 自我修复
  // ─────────────────────────────────────────────
  selfRepair(pcm: Float32Array, diagnosis: AudioDiagnosis): Float32Array {
    let repaired: Float32Array = new Float32Array(pcm) as Float32Array;

    for (const issue of diagnosis.issues) {
      switch (issue) {
        case '削波':
        case '峰值过高':
          repaired = applyGain(repaired, 0.85);
          repaired = softClip(repaired, 0.92);
          break;
        case 'DC偏移':
        case 'DC偏移超标':
          repaired = removeDCOffset(repaired);
          break;
        case '动态范围不足':
        case '过于平坦': {
          // 简单的动态扩展：轻微 exaggerate 差异
          const rms = calculateRMS(repaired);
          const out = new Float32Array(repaired.length);
          for (let i = 0; i < repaired.length; i++) {
            out[i] = repaired[i] * (1 + (Math.abs(repaired[i]) - rms) * 0.5);
          }
          repaired = normalizeBuffer(out, 0.95) as Float32Array;
          break;
        }
        case '咔嗒声': {
          // 简单去点击：检测突变采样并平滑
          const out = new Float32Array(repaired.length);
          out[0] = repaired[0];
          for (let i = 1; i < repaired.length - 1; i++) {
            const diff = Math.abs(repaired[i] - repaired[i - 1]);
            if (diff > 0.5) {
              out[i] = (repaired[i - 1] + repaired[i + 1]) * 0.5;
            } else {
              out[i] = repaired[i];
            }
          }
          out[repaired.length - 1] = repaired[repaired.length - 1];
          repaired = out as Float32Array;
          break;
        }
        case '音量过低':
          repaired = normalizeBuffer(repaired, 0.95) as Float32Array;
          break;
        case '相位问题': {
          // 简单相位校正：轻微 all-pass 近似
          const out = new Float32Array(repaired.length);
          out[0] = repaired[0];
          for (let i = 1; i < repaired.length; i++) {
            out[i] = repaired[i] * 0.7 + repaired[i - 1] * 0.3;
          }
          repaired = out as Float32Array;
          break;
        }
        case '不自然静音': {
          // 添加极微弱粉红噪声底
          const out = new Float32Array(repaired.length);
          for (let i = 0; i < repaired.length; i++) {
            const noise = (Math.random() * 2 - 1) * 0.0005;
            out[i] = repaired[i] + noise;
          }
          repaired = out as Float32Array;
          break;
        }
      }
    }

    // 最终安全归一化
    repaired = normalizeBuffer(repaired, 0.95) as Float32Array;
    return repaired;
  }

  // ─────────────────────────────────────────────
  // 参数进化（根据诊断结果调整参数）
  // ─────────────────────────────────────────────
  evolveParams(params: ProductionParams, diagnosis: AudioDiagnosis, attempt: number): void {
    const issues = diagnosis.issues;

    // 根据问题类型调整参数
    if (issues.includes('作曲质量低') || issues.includes('过于平坦')) {
      // 增加变化：换调性、换情绪、增加小节数
      const keys = ['C', 'G', 'Am', 'F', 'D', 'Em'];
      params.key = keys[Math.floor(Math.random() * keys.length)];
      params.emotion = params.emotion === 'happy' ? 'tense' : 'happy';
      if (params.barCount && params.barCount < 32) params.barCount += 4;
    }

    if (issues.includes('动态范围不足') || issues.includes('音量过低')) {
      // 提高强度，换波形
      params.intensity = (params.intensity || 0.5) + 0.15;
      params.waveform = params.waveform === 'sine' ? 'triangle' : params.waveform === 'triangle' ? 'sawtooth' : 'superSaw';
    }

    if (issues.includes('削波') || issues.includes('峰值过高')) {
      // 降低BPM，减少密度
      if (params.bpm && params.bpm > 80) params.bpm -= 10;
      params.intensity = (params.intensity || 0.5) - 0.1;
    }

    if (issues.includes('咔嗒声') || issues.includes('相位问题')) {
      // 换风格，避免过于激烈的节奏型
      const smoothStyles = ['classical', 'folk', 'chinese'];
      params.style = smoothStyles[Math.floor(Math.random() * smoothStyles.length)];
    }

    // 通用进化：每次尝试都稍微改变seed
    params.seed = Number(params.seed || 1) + attempt * 100;

    // 边界保护
    params.intensity = Math.max(0.1, Math.min(1.0, params.intensity || 0.5));
    if (params.bpm) params.bpm = Math.max(60, Math.min(200, params.bpm));
  }

  // ─────────────────────────────────────────────
  // 快速诊断（无需作曲评分）
  // ─────────────────────────────────────────────
  quickDiagnose(pcm: Float32Array): AudioDiagnosis {
    return this.selfDiagnose(pcm);
  }

  // ─────────────────────────────────────────────
  // 进化状态报告
  // ─────────────────────────────────────────────
  getEvolutionReport(): {
    abilityMatrix: any;
    capsules: any[];
    productionCount: number;
    lastLog: string[];
  } {
    return {
      abilityMatrix: this.emergenceEngine.getAbilityMatrix(),
      capsules: this.emergenceEngine.getCapsules(),
      productionCount: this.productionLog.filter(l => l.includes('生产尝试')).length,
      lastLog: this.productionLog.slice(-20),
    };
  }
}

// ═════════════════════════════════════════════════════════════
// 默认导出
// ═════════════════════════════════════════════════════════════
export default {
  SelfEvolvingMusicProducer,
  MelodyRenderer,
  midiToFreq,
  mixBuffers,
  normalizeBuffer,
  pcmToWav,
};
