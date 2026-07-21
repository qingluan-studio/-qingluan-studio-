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
  seed?: number;
  waveform?: string;
  maxAttempts?: number;
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
}

export class SelfEvolvingMusicProducer {
  emergenceEngine: CognitiveEmergenceMusicEngine;
  melodyRenderer: MelodyRenderer;
  flawDetector: FlawDetector;
  flawRepair: FlawlessRepair;
  sampleRate: number;
  productionLog: string[] = [];

  constructor(sampleRate = SAMPLE_RATE) {
    this.emergenceEngine = new CognitiveEmergenceMusicEngine();
    this.melodyRenderer = new MelodyRenderer(sampleRate);
    this.flawDetector = new FlawDetector();
    this.flawRepair = new FlawlessRepair();
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

    const currentParams = { ...params };

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      this.log(`=== 生产尝试 ${attempt}/${maxAttempts} ===`);

      try {
        // Step 1: 认知涌现作曲
        this.log('Step 1: 认知涌现作曲 (T1-T6 + MusicSwarm + Eisbach)');
        const composition = await this.emergenceEngine.compose({
          style: currentParams.style,
          key: currentParams.key,
          bpm: currentParams.bpm,
          barCount: currentParams.barCount,
          emotion: currentParams.emotion,
          intensity: currentParams.intensity,
          seed: (currentParams.seed || 1) + attempt,
        });
        lastComposition = composition;
        this.log(`作曲完成: ${composition.melody.length} 音符, T6=${composition.scores.overall.toFixed(3)}`);

        // Step 2: 编曲（伴奏）
        this.log('Step 2: 真人级伴奏编曲 (物理建模 + 人性化)');
        const barsPerSection = Math.max(4, Math.floor((currentParams.barCount || 8) / 2));
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
        const melodyPCM = this.melodyRenderer.render(
          composition.melody,
          composition.durations,
          currentParams.waveform || 'triangle',
          0.7
        );
        this.log(`主旋律渲染完成: ${melodyPCM.length} 采样`);

        // Step 4: 专业混音
        this.log('Step 4: 专业混音 (3段分频 + 总线压缩 + 砖墙限制 + 宽度增强)');
        let mixedPCM = crossoverMix(arrangement.mixed, melodyPCM, 0.6, 0.4);
        mixedPCM = busCompressor(mixedPCM, 0.4, 3, 8, 80);
        mixedPCM = brickwallLimiter(mixedPCM, 0.97, 128);
        mixedPCM = enhanceWidth(mixedPCM, 0.25);
        this.log(`混音完成: Peak=${calculatePeak(mixedPCM).toFixed(3)} RMS=${calculateRMS(mixedPCM).toFixed(3)}`);

        // Step 5: 自我诊断
        this.log('Step 5: 自我诊断 (FlawDetector + 动态分析)');
        const diagnosis = this.selfDiagnose(mixedPCM, composition.scores);
        lastDiagnosis = diagnosis;
        this.log(`诊断结果: healthy=${diagnosis.healthy}, severity=${diagnosis.severity}, issues=[${diagnosis.issues.join(', ')}]`);

        // 如果健康，直接输出
        if (diagnosis.healthy) {
          this.log('✓ 通过诊断，输出最终音频');
          const wav = pcmToWav(mixedPCM, this.sampleRate);
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
          const wav = pcmToWav(repairedPCM, this.sampleRate);
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

    // 尽力而为输出
    const fallbackPCM = lastPCM || lastArrangement?.mixed || new Float32Array(this.sampleRate * 2);
    const wav = pcmToWav(fallbackPCM, this.sampleRate);
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
      if (params.barCount && params.barCount < 16) params.barCount += 4;
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
    params.seed = (params.seed || 1) + attempt * 100;

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
