/**
 * 青鸾数字音频工作站 - 后端服务
 * 
 * 四大模块：
 * 1. AI作曲编曲（马尔可夫链+遗传算法+分形+混沌+量子+CA）
 * 2. AI歌声合成（格式合成器+基频追踪+相位声码器）
 * 3. 音频效果器（混响/均衡/压缩/失真/延迟/合唱/声码器）
 * 4. 音乐可视化（频谱/波形/粒子/分形/综合场景）
 */

import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ======== 引擎导入 ========
import MusicTheoryEngine from './engines/musicTheory.js';
import AIComposerEngine from './composition/aiComposer.js';
import * as VocalSynthesis from './synthesis/vocalSynthesis.js';
import RealisticVoiceEngine, { WavExporter, getAllVowelsForVoice, createDefaultRenderConfig } from './synthesis/realisticVoice.js';
import RealisticArrangerEngine, { exportArrangementToWav, StyleTemplates } from './composition/realisticArranger.js';
import { generateLyrics, generateFoodLyrics, generateEmotionLyrics, generateCharacterLyrics, formatLyrics } from './composition/lyricGenerator.js';
import {
  CognitiveInvariantEngine,
  CognitiveMirrorEngine,
  FeedbackStore,
  AutoLearner,
  AgentOrchestrator,
  SimpleAgent,
  MemoryBank,
  CognitiveClosedLoop,
} from './engines/cognitiveEngine.js';
import {
  FlawlessSynthesizer,
  FlawDetector,
  FlawlessRepair,
  FLAWLESS_PRESETS,
} from './synthesis/flawlessSynthesizer.js';
import * as AudioEffects from './effects/audioEffects.js';
import * as Visualizer from './visualization/musicVisualizer.js';
import {
  CognitiveEmergenceMusicEngine,
  emergenceToPlayable,
} from './engines/emergenceMusic.js';
import {
  SelfEvolvingMusicProducer,
  ProductionParams,
} from './engines/selfEvolvingProducer.js';
import {
  generateFingerprint,
  compareFingerprints,
  findSimilarFingerprints,
  getGlobalHashHex,
} from './engines/audioFingerprint.js';
import {
  parseVoiceCommand,
  getSupportedCommands,
} from './engines/voiceCommand.js';
import { noteEventsToMidi } from './export/midiExporter.js';
import { encodeMp3 } from './export/mp3Encoder.js';
import { encodeFlac } from './export/flacEncoder.js';
import {
  QingluanProject,
  serializeProject,
  deserializeProject,
} from './project/projectManager.js';
import {
  globalPluginSandbox,
  PluginCodePayload,
} from './plugin/pluginSystem.js';
import type { ScaleType, ChordType } from './engines/musicTheory.js';
import { SelfModifyingSynth, createSelfModifyingTrack } from './synthesis/selfModifyingSynth.js';
import { composeByChemistry } from './composition/chemicalComposition.js';
import { composeTopologicalMelody } from './composition/topologicalMelody.js';
import { composeByCellularAutomata } from './composition/caMusicGrowth.js';
import { StreamComposer, ConceptGraph, ConsciousnessWalker, generateConsciousnessStream } from './engines/streamOfConsciousness.js';
import { HumanizationEngine } from './engines/humanizationEngine.js';
import { PhraseComposer, composeWithPhrases } from './composition/phraseComposer.js';
import { AnalogArtifactEngine, addStudioFeel } from './effects/analogArtifacts.js';
import { SpatialReverbEngine } from './effects/spatialReverb.js';
import { OriginalityEngine, HumanFeelEnhancer, checkSelfSimilarity } from './engines/originalityEngine.js';

const app = new Hono();
const projectStore = new Map<string, QingluanProject>();

// CORS
app.use('/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
}));

// ======== 静态文件 ========
app.get('/', async (c) => {
  try {
    const html = readFileSync(join(process.cwd(), 'public', 'index.html'), 'utf-8');
    return c.html(html);
  } catch {
    return c.text('青鸾数字音频工作站 - 手机版音乐创作平台');
  }
});

// ======== 健康检查 ========
app.get('/api/health', (c) => {
  return c.json({
    status: 'ok',
    name: '青鸾数字音频工作站',
    version: '2.0.0',
    modules: ['musicTheory', 'aiComposer', 'vocalSynthesis', 'realisticVoice', 'audioEffects', 'visualization', 'cognitiveEmergenceMusic', 'selfEvolvingProducer', 'audioFingerprint', 'selfModifyingSynth', 'chemicalComposition', 'topologicalMelody', 'caMusicGrowth', 'streamOfConsciousness', 'humanizationEngine', 'phraseComposer', 'analogArtifacts', 'spatialReverb', 'originalityEngine'],
  });
});

// ======== 模块1: 音乐理论 API ========
app.get('/api/theory/scales', (c) => {
  return c.json({
    western: Object.keys((MusicTheoryEngine as any).scales.western),
    chinese: Object.keys((MusicTheoryEngine as any).scales.chinese),
    japanese: Object.keys((MusicTheoryEngine as any).scales.japanese),
    world: Object.keys((MusicTheoryEngine as any).scales.world),
  });
});

app.get('/api/theory/scale/:name', (c) => {
  const name = c.req.param('name');
  const root = c.req.query('root') || 'C';
  try {
    const scale = (MusicTheoryEngine as any).scales.generate(root, name);
    return c.json({ name, root, notes: scale });
  } catch {
    return c.json({ error: '未知音阶' }, 400);
  }
});

app.get('/api/theory/chords', (c) => {
  return c.json({
    definitions: (MusicTheoryEngine as any).chords.definitions,
    voicings: (MusicTheoryEngine as any).chords.voicings,
  });
});

app.get('/api/theory/progressions', (c) => {
  const style = c.req.query('style') || 'all';
  const all = (MusicTheoryEngine as any).progressions.all;
  if (style === 'all') return c.json(all);
  return c.json({ [style]: all[style as keyof typeof all] || [] });
});

app.get('/api/theory/rhythms', (c) => {
  return c.json({
    timeSignatures: (MusicTheoryEngine as any).rhythm.timeSignatures,
    patterns: (MusicTheoryEngine as any).rhythm.patterns,
    grooves: (MusicTheoryEngine as any).rhythm.grooves,
  });
});

app.post('/api/theory/analyze', async (c) => {
  const body = await c.req.json<{ notes: number[] }>();
  const analysis = (MusicTheoryEngine as any).analysis.analyzePiece(body.notes);
  return c.json(analysis);
});

// ======== 模块2: AI作曲 API ========
app.post('/api/composer/create', async (c) => {
  const body = await c.req.json<{
    algorithm?: string;
    length?: number;
    style?: string;
    key?: string;
    bpm?: number;
  }>();

  const algorithm = body.algorithm || 'genetic';
  const length = body.length || 32;
  const style = body.style || 'pop';
  const key = body.key || 'C';

  let melody: any;

  try {
    switch (algorithm) {
      case 'markov': {
        const seed = ['C4', 'E4', 'G4', 'C5'];
        const pairs = (AIComposerEngine as any).markov.extractPitchDurationPairs(seed);
        const matrix = (AIComposerEngine as any).markov.buildSecondOrderMatrix(pairs);
        const gen = (AIComposerEngine as any).markov.generateMarkov2(matrix, length, pairs[0], pairs[1] || pairs[0]);
        melody = { notes: gen.map((p: any) => p.pitch), durations: gen.map((p: any) => p.duration) };
        break;
      }
      case 'fractal': {
        const notes = (AIComposerEngine as any).fractal.mandelbrotMelody(length, 1, 1, 0.5);
        melody = { notes: notes.map((n: any) => n.note), durations: notes.map((n: any) => n.duration || 0.5) };
        break;
      }
      case 'chaos': {
        const rhythm = (AIComposerEngine as any).chaos.lorenzRhythm(length, 120, 4);
        melody = { notes: rhythm.map((r: any) => r.note || 'C4'), durations: rhythm.map((r: any) => r.duration) };
        break;
      }
      case 'quantum': {
        const comp = (AIComposerEngine as any).quantum.quantumSuperpositionMelody(length, 3);
        melody = { notes: comp.map((n: any) => n.note), durations: comp.map((n: any) => n.duration || 0.5) };
        break;
      }
      case 'ca': {
        const pattern = (AIComposerEngine as any).cellularAutomata.runCA1D(110, length, Math.random() > 0.5 ? 1 : 0);
        const caRhythm = (AIComposerEngine as any).cellularAutomata.ca1dToRhythm(pattern, 4);
        melody = { notes: caRhythm.map((r: any) => r.note || 'C4'), durations: caRhythm.map((r: any) => r.duration) };
        break;
      }
      default: {
        const result = (AIComposerEngine as any).evolutionary.evolutionaryCompose(length, style, 50, 100);
        melody = { notes: result.map((n: any) => n.note), durations: result.map((n: any) => n.duration) };
        break;
      }
    }
  } catch (e: any) {
    return c.json({ error: e.message, algorithm }, 500);
  }

  return c.json({
    algorithm,
    length,
    style,
    key,
    melody: melody.notes,
    rhythm: melody.durations,
  });
});

app.post('/api/composer/arrange', async (c) => {
  const body = await c.req.json<{ melody: string[]; durations?: number[]; style?: string; key?: string }>();
  try {
    const result = (AIComposerEngine as any).fullArrange({
      melody: body.melody,
      durations: body.durations,
      style: body.style || 'pop',
      key: body.key || 'C',
    });
    return c.json({
      arrangement: result,
      tracks: Object.keys(result.tracks || {}),
    });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.get('/api/composer/styles', (c) => {
  return c.json((AIComposerEngine as any).stylePresets || {});
});

// ======== 模块2b: 真人级伴奏 API ========
app.get('/api/arranger/instruments', (c) => {
  return c.json({
    western: ['piano', 'acousticGuitar', 'electricGuitar', 'bass', 'drumKit', 'violin', 'cello', 'flute', 'saxophone', 'synth'],
    chinese: ['guzheng', 'erhu', 'pipa', 'dizi', 'xiao', 'luoGu', 'yangQin', 'suoNa'],
  });
});

app.get('/api/arranger/styles', (c) => {
  return c.json({
    styles: ['pop', 'rock', 'jazz', 'electronic', 'classical', 'folk', 'chinese', 'rnb', 'metal', 'blues'],
    emotions: ['happy', 'sad', 'tense', 'relaxed', 'epic', 'romantic'],
  });
});

app.post('/api/arranger/generate', async (c) => {
  const body = await c.req.json<{
    key?: string;
    bpm?: number;
    style?: string;
    emotion?: string;
    sections?: number;
    sampleRate?: number;
  }>();
  try {
    const engine = new RealisticArrangerEngine();
    const style = (body.style || 'pop') as any;
    const emotion = (body.emotion || 'happy') as any;
    const bpm = body.bpm || 120;
    const sections = body.sections || 4;

    // 自动生成段落结构
    const sectionTypes = ['intro', 'verse', 'chorus', 'outro'];
    const sectionBars = [4, 8, 8, 4];
    const arrangementSections = [];
    for (let i = 0; i < Math.min(sections, 4); i++) {
      arrangementSections.push({
        type: sectionTypes[i],
        bars: sectionBars[i],
        chordProgression: [],
      });
    }

    const input = {
      key: body.key || 'C',
      bpm,
      style,
      emotion,
      sections: arrangementSections as any,
      totalDuration: arrangementSections.reduce((s, sec) => s + sec.bars * (60 / bpm) * 4, 0),
    };

    const output = engine.generate(input as any);
    const wav = exportArrangementToWav(output);

    return c.body(new Uint8Array(wav), 200, {
      'Content-Type': 'audio/wav',
      'Content-Disposition': `attachment; filename="${style}_${emotion}.wav"`,
    });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// ======== 模块2b: 智能歌词生成 API ========
app.get('/api/lyrics/themes', (c) => {
  return c.json({
    themes: ['food','nature','city','season','love','farewell','dream'],
    emotions: ['joy','sorrow','anger','fear','longing','loneliness','hope','nostalgia'],
    perspectives: ['first','second','third'],
    styles: ['modern','classical','poetic','narrative'],
  });
});

app.post('/api/lyrics/generate', async (c) => {
  const body = await c.req.json<{
    theme?: string;
    emotion?: string;
    perspective?: string;
    object?: string;
    length?: number;
    style?: string;
    temperature?: number;
  }>();
  try {
    const output = generateLyrics({
      theme: body.theme,
      emotion: body.emotion,
      perspective: body.perspective,
      object: body.object,
      length: body.length || 4,
      style: body.style || 'modern',
      temperature: body.temperature ?? 0.7,
    });
    return c.json({
      title: output.title,
      sections: output.sections,
      emotionFlow: output.emotionFlow,
      formatted: formatLyrics(output),
      stats: output.stats,
    });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post('/api/lyrics/food', async (c) => {
  const body = await c.req.json<{ food: string; emotion?: string; perspective?: string }>();
  try {
    const output = generateFoodLyrics(body.food, body.emotion, body.perspective);
    return c.json({
      title: output.title,
      sections: output.sections,
      formatted: formatLyrics(output),
      stats: output.stats,
    });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post('/api/lyrics/emotion', async (c) => {
  const body = await c.req.json<{ emotion: string; perspective?: string }>();
  try {
    const output = generateEmotionLyrics(body.emotion, body.perspective);
    return c.json({
      title: output.title,
      sections: output.sections,
      formatted: formatLyrics(output),
      stats: output.stats,
    });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post('/api/lyrics/character', async (c) => {
  const body = await c.req.json<{
    character: string;
    emotion: string;
    perspective?: string;
  }>();
  try {
    const output = generateCharacterLyrics(body.character, body.emotion, body.perspective || 'first');
    return c.json({
      title: output.title,
      sections: output.sections,
      formatted: formatLyrics(output),
      stats: output.stats,
    });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// ======== 模块2c: 认知涌现引擎 API ========
const ceeFeedbackStore = new FeedbackStore();
const ceeAutoLearner = new AutoLearner(ceeFeedbackStore);
const ceeMemoryBank = new MemoryBank();
const ceeOrchestrator = new AgentOrchestrator();
const ceeClosedLoop = new CognitiveClosedLoop();

// 注册虚拟Agent
ceeOrchestrator.registerAgent(new SimpleAgent('作曲家', 'composer', ['composer'], async () => ({ status: 'composed', melody: 'C4 D4 E4 F4' })));
ceeOrchestrator.registerAgent(new SimpleAgent('编曲师', 'arranger', ['arranger'], async () => ({ status: 'arranged', tracks: 4 })));
ceeOrchestrator.registerAgent(new SimpleAgent('作词家', 'lyricist', ['lyricist'], async () => ({ status: 'written', lines: 8 })));

app.get('/api/cee/status', (c) => {
  return c.json({
    feedback: ceeFeedbackStore.getStats(),
    memory: ceeMemoryBank.getStats(),
    insights: ceeAutoLearner.insights.slice(-5),
    bestSnapshot: ceeAutoLearner.bestSnapshot,
  });
});

app.post('/api/cee/evaluate', async (c) => {
  const body = await c.req.json<{ text: string; type?: 'lyrics' | 'melody' }>();
  try {
    const engine = new CognitiveInvariantEngine();
    let result: any;
    if (body.type === 'melody') {
      const notes = body.text.split(/\s+/);
      const durs = new Array(notes.length).fill(0.25);
      result = engine.evaluateMelody(notes, durs);
    } else {
      result = engine.evaluateLyrics(body.text);
    }
    ceeAutoLearner.recordPerformance('cee_eval', { type: body.type }, result.scores.overall, { text: body.text.slice(0, 50) });
    return c.json(result);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post('/api/cee/feedback', async (c) => {
  const body = await c.req.json<{ score: number; message?: string; tags?: string[] }>();
  try {
    const record = ceeFeedbackStore.add(body.score, 'explicit', body.message || '', {}, body.tags || []);
    const insights = ceeAutoLearner.analyze();
    return c.json({ record, insights, stats: ceeFeedbackStore.getStats() });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post('/api/cee/memory', async (c) => {
  const body = await c.req.json<{ type: string; content: any; tags: string[]; importance: number }>();
  try {
    const id = ceeMemoryBank.store({
      type: body.type as any,
      content: body.content,
      tags: body.tags,
      importance: body.importance,
    });
    return c.json({ id, stats: ceeMemoryBank.getStats() });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.get('/api/cee/memory/search', (c) => {
  const query = c.req.query('q') || '';
  const type = c.req.query('type') || undefined;
  return c.json({ results: ceeMemoryBank.search(query, type) });
});

app.post('/api/cee/orchestrate', async (c) => {
  const body = await c.req.json<{ goal: string; params?: Record<string, any> }>();
  try {
    const result = await ceeOrchestrator.run(body.goal, body.params || {});
    return c.json(result);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post('/api/cee/optimize', async (c) => {
  const body = await c.req.json<{ lyrics: string; maxIterations?: number }>();
  try {
    const result = await ceeClosedLoop.evaluateAndOptimizeLyrics(body.lyrics, body.maxIterations || 3);
    return c.json(result);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// ======== 模块2d: 无瑕疵音乐合成器 API ========
const flawlessSynth = new FlawlessSynthesizer({ sampleRate: 44100, targetQuality: 0.92 });

app.get('/api/flawless/presets', (c) => {
  return c.json({ presets: Object.keys(FLAWLESS_PRESETS) });
});

app.post('/api/flawless/note', async (c) => {
  const body = await c.req.json<{
    freq: number;
    duration: number;
    waveform?: string;
    velocity?: number;
    fm?: boolean;
  }>();
  try {
    const result = flawlessSynth.synthesizeNote(
      body.freq,
      body.duration,
      body.velocity || 1.0,
      (body.waveform as any) || 'sine',
      body.fm ? { fm: true, fmModRatio: 2, fmIndex: 3 } : undefined
    );
    return c.body(new Uint8Array(result.wav), 200, { 'Content-Type': 'audio/wav' });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post('/api/flawless/chord', async (c) => {
  const body = await c.req.json<{ freqs: number[]; duration: number; waveform?: string }>();
  try {
    const result = flawlessSynth.synthesizeChord(body.freqs, body.duration, (body.waveform as any) || 'triangle');
    return c.body(new Uint8Array(result.wav), 200, { 'Content-Type': 'audio/wav' });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post('/api/flawless/arpeggio', async (c) => {
  const body = await c.req.json<{ freqs: number[]; noteDuration: number; waveform?: string }>();
  try {
    const result = flawlessSynth.synthesizeArpeggio(body.freqs, body.noteDuration, (body.waveform as any) || 'sine');
    return c.body(new Uint8Array(result.wav), 200, { 'Content-Type': 'audio/wav' });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post('/api/flawless/drum', async (c) => {
  const body = await c.req.json<{ type: 'kick' | 'snare' | 'hihat' | 'tom'; duration?: number }>();
  try {
    const result = flawlessSynth.synthesizeDrum(body.type, body.duration || 0.5);
    return c.body(new Uint8Array(result.wav), 200, { 'Content-Type': 'audio/wav' });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post('/api/flawless/preset', async (c) => {
  const body = await c.req.json<{ preset: string; freq: number; duration: number }>();
  try {
    const presetFn = FLAWLESS_PRESETS[body.preset];
    if (!presetFn) return c.json({ error: '未知预设' }, 400);
    const result = presetFn(flawlessSynth, body.freq, body.duration);
    return c.body(new Uint8Array(result.wav), 200, { 'Content-Type': 'audio/wav' });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post('/api/flawless/detect', async (c) => {
  const body = await c.req.json<{ samples: number[] }>();
  try {
    const detector = new FlawDetector();
    const pcm = new Float32Array(body.samples);
    const report = detector.detect(pcm);
    return c.json(report);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post('/api/flawless/repair', async (c) => {
  const body = await c.req.json<{ samples: number[]; issues: any }>();
  try {
    const repair = new FlawlessRepair();
    const pcm = new Float32Array(body.samples);
    const repaired = repair.repair(pcm, body.issues);
    const wav = flawlessSynth['_pcmToWav'](repaired, 44100, 2);
    return c.body(new Uint8Array(wav), 200, { 'Content-Type': 'audio/wav' });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// ======== 模块3: 歌声合成 API ========
app.post('/api/synth/vocal', async (c) => {
  const body = await c.req.json<{
    lyrics: string;
    notes: string[];
    durations: number[];
    timbre?: string;
    vibrato?: boolean;
    sampleRate?: number;
  }>();
  try {
    const renderer = new (VocalSynthesis as any).SingingVoiceRenderer(body.sampleRate || 44100);
    const buffer = renderer.render({
      lyrics: body.lyrics,
      notes: body.notes,
      durations: body.durations,
      timbre: body.timbre || 'soprano',
      vibrato: body.vibrato !== false,
    });
    const exporter = new (VocalSynthesis as any).WavExporter(body.sampleRate || 44100);
    const wav = exporter.export(buffer);
    return c.body(new Uint8Array(wav), 200, {
      'Content-Type': 'audio/wav',
      'Content-Disposition': 'attachment; filename="vocal.wav"',
    });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post('/api/synth/tone', async (c) => {
  const body = await c.req.json<{
    note: string;
    duration: number;
    timbre?: string;
    vibrato?: boolean;
    sampleRate?: number;
  }>();
  try {
    const mapper = new (VocalSynthesis as any).NoteFrequencyMapper();
    const freq = mapper.noteToFrequency(body.note);
    const buffer = (VocalSynthesis as any).quickSynthesizeTone(freq, body.duration, 'a', body.sampleRate || 44100);
    const exporter = new (VocalSynthesis as any).WavExporter(body.sampleRate || 44100);
    const wav = exporter.export(buffer);
    return c.body(new Uint8Array(wav), 200, {
      'Content-Type': 'audio/wav',
    });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post('/api/synth/pitch-detect', async (c) => {
  const body = await c.req.json<{ samples: number[]; sampleRate?: number }>();
  const detector = new (VocalSynthesis as any).YinPitchDetector({
    sampleRate: body.sampleRate || 44100,
    bufferSize: body.samples.length,
  });
  const pitch = detector.detect(body.samples);
  return c.json({ pitch, frequency: pitch > 0 ? pitch : null });
});

// ======== 模块3b: 真人级人声合成 API ========
app.get('/api/synth/formants', (c) => {
  const gender = c.req.query('gender') || 'female';
  const vowels = getAllVowelsForVoice(gender as any, 'warm' as any);
  return c.json({ gender, vowels });
});

app.post('/api/synth/realistic', async (c) => {
  const body = await c.req.json<{
    text?: string;
    notes?: string[];
    durations?: number[];
    gender?: string;
    timbre?: string;
    sampleRate?: number;
  }>();
  try {
    const config: any = createDefaultRenderConfig();
    config.sampleRate = body.sampleRate || 44100;
    config.gender = body.gender || 'female';
    config.timbre = body.timbre || 'warm';

    const engine = new RealisticVoiceEngine(config);
    const notes = (body.notes || ['C4', 'E4', 'G4']).map((n, i) => {
      const freq = noteToFreq(n);
      return {
        startTime: i * 0.5,
        duration: body.durations?.[i] || 0.5,
        frequency: freq,
        midiNote: freqToMidi(freq),
        lyric: (body.text?.[i] || 'a'),
        voice: { techniques: [], f0: freq, vibratoDepth: 4, vibratoRate: 5.5, velocity: 0.7, brightness: 0.5, breathiness: 0.2 },
      };
    });
    const buffer = engine.synthesizePhrase(notes as any);
    const wav = WavExporter.export(buffer, {
      sampleRate: config.sampleRate,
      channels: 1,
      bitDepth: 16,
    });
    return c.body(new Uint8Array(wav), 200, {
      'Content-Type': 'audio/wav',
      'Content-Disposition': 'attachment; filename="realistic.wav"',
    });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

function noteToFreq(note: string): number {
  const map: Record<string, number> = { 'C4': 261.63, 'D4': 293.66, 'E4': 329.63, 'F4': 349.23, 'G4': 392.00, 'A4': 440.00, 'B4': 493.88, 'C5': 523.25 };
  return map[note] || 261.63;
}
function freqToMidi(freq: number): number {
  return Math.round(69 + 12 * Math.log2(freq / 440));
}

app.post('/api/synth/jianpu', async (c) => {
  const body = await c.req.json<{
    jianpu: string;
    lyrics: string[];
    gender?: string;
    timbre?: string;
    sampleRate?: number;
  }>();
  try {
    const config: any = createDefaultRenderConfig();
    config.sampleRate = body.sampleRate || 44100;
    config.gender = body.gender || 'female';
    config.timbre = body.timbre || 'warm';

    const engine = new RealisticVoiceEngine(config);
    const buffer = engine.synthesizeFromJianpu(body.jianpu, body.lyrics);
    const wav = WavExporter.export(buffer, {
      sampleRate: config.sampleRate,
      channels: 1,
      bitDepth: 16,
    });
    return c.body(new Uint8Array(wav), 200, {
      'Content-Type': 'audio/wav',
      'Content-Disposition': 'attachment; filename="jianpu.wav"',
    });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// ======== 模块4: 音频效果器 API ========
app.post('/api/effects/reverb', async (c) => {
  const body = await c.req.json<{ samples: number[]; roomType?: string; rt60?: number; wetDry?: number; sampleRate?: number }>();
  try {
    const reverb = new (AudioEffects as any).ConvolutionReverb({
      sampleRate: body.sampleRate || 44100,
    });
    const output = reverb.process(new Float32Array(body.samples));
    return c.json({ output: Array.from(output) });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post('/api/effects/eq', async (c) => {
  const body = await c.req.json<{ samples: number[]; preset?: string; bands?: any[]; sampleRate?: number }>();
  try {
    const eq = new (AudioEffects as any).ParametricEQ(body.sampleRate || 44100);
    const output = eq.process(new Float32Array(body.samples));
    return c.json({ output: Array.from(output), preset: body.preset || 'custom' });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post('/api/effects/compress', async (c) => {
  const body = await c.req.json<{ samples: number[]; threshold?: number; ratio?: number; attack?: number; release?: number; sampleRate?: number }>();
  try {
    const comp = new (AudioEffects as any).Compressor({
      sampleRate: body.sampleRate || 44100,
    });
    const output = comp.process(new Float32Array(body.samples));
    return c.json({ output: Array.from(output) });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post('/api/effects/distort', async (c) => {
  const body = await c.req.json<{ samples: number[]; type?: string; amount?: number; sampleRate?: number }>();
  try {
    const dist = new (AudioEffects as any).Distortion({
      sampleRate: body.sampleRate || 44100,
    });
    const output = dist.process(new Float32Array(body.samples));
    return c.json({ output: Array.from(output) });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post('/api/effects/delay', async (c) => {
  const body = await c.req.json<{ samples: number[]; time?: number; feedback?: number; type?: string; sampleRate?: number }>();
  try {
    const delay = new (AudioEffects as any).Delay({
      sampleRate: body.sampleRate || 44100,
    });
    const output = delay.process(new Float32Array(body.samples));
    return c.json({ output: Array.from(output) });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post('/api/effects/chorus', async (c) => {
  const body = await c.req.json<{ samples: number[]; rate?: number; depth?: number; voices?: number; sampleRate?: number }>();
  try {
    const chorus = new (AudioEffects as any).Chorus({
      sampleRate: body.sampleRate || 44100,
    });
    const output = chorus.process(new Float32Array(body.samples));
    return c.json({ output: Array.from(output) });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post('/api/effects/vocoder', async (c) => {
  const body = await c.req.json<{ carrier: number[]; modulator: number[]; bands?: number; sampleRate?: number }>();
  try {
    const vocoder = new (AudioEffects as any).Vocoder({
      sampleRate: body.sampleRate || 44100,
    });
    const output = vocoder.process(
      new Float32Array(body.carrier),
      new Float32Array(body.modulator)
    );
    return c.json({ output: Array.from(output) });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post('/api/effects/chain', async (c) => {
  const body = await c.req.json<{ samples: number[]; preset?: string; effects?: string[]; sampleRate?: number }>();
  try {
    const chain = new (AudioEffects as any).EffectChainManager({
      sampleRate: body.sampleRate || 44100,
    });
    const output = chain.process(new Float32Array(body.samples));
    return c.json({
      output: Array.from(output),
      preset: body.preset || 'custom',
      cpuEstimate: chain.estimateCpuLoad ? chain.estimateCpuLoad() : 0,
    });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// ======== 模块5: 可视化 API ========
app.post('/api/visual/analyze', async (c) => {
  const body = await c.req.json<{ samples: number[]; sampleRate?: number }>();
  const sr = body.sampleRate || 44100;
  const fftSize = 256;
  const fftResult = (Visualizer as any).fft(body.samples.slice(0, fftSize));
  const spectrum = fftResult.map((c: any) => Math.sqrt(c[0] * c[0] + c[1] * c[1]));
  const beat = new (Visualizer as any).BeatDetector({ threshold: 1.5 }).detect(body.samples);
  const bpm = new (Visualizer as any).BpmEstimator().estimate(body.samples, sr);
  const pitch = (Visualizer as any).detectPitch(new Float32Array(body.samples), sr);
  const loudness = new (Visualizer as any).LoudnessMeter().measure(body.samples, sr);
  return c.json({
    spectrum: spectrum.slice(0, 128),
    beat,
    bpm,
    pitch,
    loudness,
  });
});

app.get('/api/visual/shaders/:type', (c) => {
  const type = c.req.param('type');
  const shaders: Record<string, any> = {
    spectrum: {
      vertex: (Visualizer as any).spectrumBarVertexShader(),
      fragment: (Visualizer as any).spectrumBarFragmentShader(),
    },
    fractal: {
      vertex: (Visualizer as any).fractalVertexShader(),
      fragment: (Visualizer as any).fractalFragmentShader(),
    },
  };
  const shader = shaders[type];
  if (!shader) return c.json({ error: '未知shader类型' }, 400);
  return c.json({ type, vertex: shader.vertex, fragment: shader.fragment });
});

// ======== 综合创作 API ========
app.post('/api/create/full-song', async (c) => {
  const body = await c.req.json<{
    style?: string;
    key?: string;
    bpm?: number;
    length?: number;
    algorithm?: string;
  }>();
  const style = body.style || 'pop';
  const key = body.key || 'C';
  const bpm = body.bpm || 120;
  const length = body.length || 32;
  const algorithm = body.algorithm || 'genetic';

  let melody: any;
  try {
    switch (algorithm) {
      case 'markov': {
        const seed = ['C4', 'E4', 'G4', 'C5'];
        const pairs = (AIComposerEngine as any).markov.extractPitchDurationPairs(seed);
        const matrix = (AIComposerEngine as any).markov.buildSecondOrderMatrix(pairs);
        const gen = (AIComposerEngine as any).markov.generateMarkov2(matrix, length, pairs[0], pairs[1] || pairs[0]);
        melody = { notes: gen.map((p: any) => p.pitch), durations: gen.map((p: any) => p.duration) };
        break;
      }
      case 'fractal': {
        const notes = (AIComposerEngine as any).fractal.mandelbrotMelody(length, 1, 1, 0.5);
        melody = { notes: notes.map((n: any) => n.note), durations: notes.map((n: any) => n.duration || 0.5) };
        break;
      }
      default: {
        const result = (AIComposerEngine as any).evolutionary.evolutionaryCompose(length, style, 50, 100);
        melody = { notes: result.map((n: any) => n.note), durations: result.map((n: any) => n.duration) };
        break;
      }
    }

    const arrangement = (AIComposerEngine as any).fullArrange({
      melody: melody.notes,
      durations: melody.durations,
      style,
      key,
    });

    const lyrics = generatePlaceholderLyrics(melody.notes.length);

    return c.json({
      style,
      key,
      bpm,
      algorithm,
      melody: melody.notes,
      rhythm: melody.durations,
      arrangement,
      lyrics,
    });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

function generatePlaceholderLyrics(count: number): string[] {
  const pool = ['啦', '啊', '哦', '嗯', '咪', '呜', '咿', '呀', '哈', '嘿'];
  return Array.from({ length: count }, () => pool[Math.floor(Math.random() * pool.length)]);
}

// ======== 模块6: 认知涌现音乐引擎 API ========
const emergenceEngine = new CognitiveEmergenceMusicEngine();

app.post('/api/emergence/compose', async (c) => {
  const body = await c.req.json<{
    style?: string;
    key?: string;
    bpm?: number;
    barCount?: number;
    emotion?: string;
    intensity?: number;
    seed?: number;
  }>();
  try {
    const result = await emergenceEngine.compose({
      style: body.style,
      key: body.key,
      bpm: body.bpm,
      barCount: body.barCount,
      emotion: body.emotion,
      intensity: body.intensity,
      seed: body.seed,
    });
    return c.json({
      sessionId: result.sessionId,
      melody: result.melody,
      durations: result.durations,
      scores: result.scores,
      swarmAnalysis: result.swarmAnalysis,
      eisbach: result.eisbachState,
      capsuleId: result.capsuleId,
      abilityVersion: result.abilityVersion,
      playable: emergenceToPlayable(result),
    });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post('/api/emergence/loop', async (c) => {
  const body = await c.req.json<{
    style?: string;
    key?: string;
    bpm?: number;
    barCount?: number;
    maxIterations?: number;
    threshold?: number;
  }>();
  try {
    const results = await emergenceEngine.composeWithClosedLoop(
      { style: body.style, key: body.key, bpm: body.bpm, barCount: body.barCount },
      body.maxIterations || 5,
      body.threshold || 0.65
    );
    return c.json({
      iterations: results.length,
      bestScore: Math.max(...results.map(r => r.scores.overall)),
      finalResult: results[results.length - 1],
      allResults: results.map(r => ({
        sessionId: r.sessionId,
        scores: r.scores,
        swarmAnalysis: r.swarmAnalysis,
        capsuleId: r.capsuleId,
      })),
    });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.get('/api/emergence/ability', (c) => {
  return c.json(emergenceEngine.getAbilityMatrix());
});

app.get('/api/emergence/capsules', (c) => {
  return c.json({ capsules: emergenceEngine.getCapsules() });
});

// ======== 模块7: 自我进化音乐生产线 API ========
const producer = new SelfEvolvingMusicProducer();

app.post('/api/produce', async (c) => {
  const body = await c.req.json<{
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
  }>();
  try {
    const result = await producer.produce({
      style: body.style,
      key: body.key,
      bpm: body.bpm,
      barCount: body.barCount,
      emotion: body.emotion,
      intensity: body.intensity,
      seed: body.seed,
      waveform: body.waveform,
      maxAttempts: body.maxAttempts || 3,
      useAutoMix: body.useAutoMix,
    });

    const wavBlob = new Blob([result.wav], { type: 'audio/wav' });

    return c.json({
      wavSize: wavBlob.size,
      diagnosis: result.diagnosis,
      composition: {
        sessionId: result.composition.sessionId,
        melody: result.composition.melody,
        durations: result.composition.durations,
        key: body.key || 'C',
        bpm: body.bpm || 120,
        scores: result.composition.scores,
      },
      attempt: result.attempt,
      fixed: result.fixed,
      evolved: result.evolved,
      failed: result.failed,
      productionLog: result.productionLog,
      wavBase64: Buffer.from(result.wav).toString('base64'),
      mastering: result.mastering ? {
        finalLUFS: result.mastering.finalLUFS,
        finalTruePeak: result.mastering.finalTruePeak,
        applied: result.mastering.applied,
        metrics: {
          integratedLUFS: result.mastering.metrics.integratedLUFS,
          dynamicRangeLU: result.mastering.metrics.dynamicRangeLU,
          loudnessRange: result.mastering.metrics.loudnessRange,
        },
      } : null,
      lyrics: result.lyrics || [],
      fingerprint: result.fingerprint,
      autoMixSettings: result.autoMixSettings || null,
    });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.get('/api/produce/status', (c) => {
  return c.json(producer.getEvolutionReport());
});

// ======== 新引擎独立 API ========

app.post('/api/humanize', async (c) => {
  const body = await c.req.json<{notes?: Array<{midi: number; startTime: number; duration: number; velocity: number}>; seed?: number; style?: string}>();
  try {
    const engine = new HumanizationEngine(body.seed || 1);
    const result = engine.humanize(body.notes || [], {
      timingVariance: 0.008,
      velocityVariance: 0.12,
      grooveTemplate: body.style === 'jazz' ? 'swing' : 'straight',
    });
    return c.json({ notes: result });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post('/api/phrase/compose', async (c) => {
  const body = await c.req.json<{keyRoot?: number; scale?: number[]; bpm?: number; totalBars?: number; emotion?: string; style?: string}>();
  try {
    const notes = composeWithPhrases({ keyRoot: body.keyRoot || 60, scale: body.scale || [0,2,4,5,7,9,11], bpm: body.bpm || 120, totalBars: body.totalBars || 16, emotion: body.emotion as any, style: body.style as any });
    return c.json({ notes });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post('/api/analog/process', async (c) => {
  const body = await c.req.json<{wavBase64: string; intensity?: number}>();
  try {
    const pcm = Buffer.from(body.wavBase64, 'base64');
    // 简化为直接返回，实际应该从 WAV 提取 PCM
    return c.json({ message: '请直接在前端使用 AnalogArtifactEngine' });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// ======== 空间混响 API ========

app.post('/api/spatial/apply', async (c) => {
  const body = await c.req.json<{wavBase64: string; preset?: string}>();
  try {
    // 简化：由于从 base64 WAV 提取 PCM 较复杂，返回错误提示或简化实现
    return c.json({ message: '请使用完整生产线 /api/produce 并设置 useSpatialReverb=true' });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.get('/api/spatial/presets', (c) => {
  return c.json({ presets: Object.keys(SpatialReverbEngine.Presets || {}) });
});

// ======== 原创性保护 API ========

app.post('/api/originality/embed', async (c) => {
  const body = await c.req.json<{wavBase64: string; creatorId?: string}>();
  try {
    return c.json({ message: '请使用完整生产线 /api/produce 并设置 useWatermark=true' });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post('/api/originality/extract', async (c) => {
  const body = await c.req.json<{wavBase64: string}>();
  try {
    return c.json({ message: '请使用完整生产线生成带水印的音频' });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post('/api/originality/check', async (c) => {
  const body = await c.req.json<{notes?: Array<{midi: number; startTime: number}>}>();
  try {
    const score = checkSelfSimilarity(body.notes || []);
    return c.json({ similarityScore: score, isOriginal: score < 0.6 });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// ======== 非传统引擎独立 API ========

function pcmToWav(pcm: Float32Array, sampleRate: number): ArrayBuffer {
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const dataSize = pcm.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeString = (offset: number, str: string) => { for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i)); };
  writeString(0, 'RIFF'); view.setUint32(4, 36 + dataSize, true); writeString(8, 'WAVE'); writeString(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * bytesPerSample, true); view.setUint16(32, bytesPerSample, true); view.setUint16(34, bitsPerSample, true); writeString(36, 'data'); view.setUint32(40, dataSize, true);
  let offset = 44;
  for (let i = 0; i < pcm.length; i++) { const s = Math.max(-1, Math.min(1, pcm[i])); view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true); offset += 2; }
  return buffer;
}

app.post('/api/engine/selfmodifying', async (c) => {
  const body = await c.req.json<{freq?: number; duration?: number; evolutionRate?: number; mutationIntensity?: number; notes?: Array<{freq: number; duration: number; startTime: number}>}>();
  try {
    if (body.notes && body.notes.length > 0) {
      const pcm = createSelfModifyingTrack(body.notes, 44100);
      const wav = pcmToWav(pcm, 44100);
      return c.json({ wavBase64: Buffer.from(wav).toString('base64'), duration: pcm.length / 44100 });
    } else {
      const synth = new SelfModifyingSynth(44100);
      const pcm = synth.generate({ baseFreq: body.freq || 440, duration: body.duration || 2, evolutionRate: body.evolutionRate, mutationIntensity: body.mutationIntensity });
      const wav = pcmToWav(pcm, 44100);
      return c.json({ wavBase64: Buffer.from(wav).toString('base64'), history: synth.getEvolutionHistory(), duration: pcm.length / 44100 });
    }
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post('/api/engine/chemical', async (c) => {
  const body = await c.req.json<{style?: string; keyRoot?: number; scale?: number[]; barCount?: number; bpm?: number; temperature?: number}>();
  try {
    const result = composeByChemistry({ style: body.style || 'pop', keyRoot: body.keyRoot || 60, scale: body.scale || [0,2,4,5,7,9,11], barCount: body.barCount || 16, bpm: body.bpm || 120, temperature: body.temperature ?? 0.7 });
    return c.json({ notes: result.notes, reactionLog: result.reactionLog });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post('/api/engine/topological', async (c) => {
  const body = await c.req.json<{keyRoot?: number; scale?: number[]; barCount?: number; bpm?: number; curvature?: number}>();
  try {
    const notes = composeTopologicalMelody({ keyRoot: body.keyRoot || 60, scale: body.scale || [0,2,4,5,7,9,11], barCount: body.barCount || 16, bpm: body.bpm || 120, curvature: body.curvature ?? 0.5 });
    return c.json({ notes });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post('/api/engine/cellular', async (c) => {
  const body = await c.req.json<{bpm?: number; keyRoot?: number; scale?: number[]; barCount?: number; seedDensity?: number; generations?: number}>();
  try {
    const result = composeByCellularAutomata({ bpm: body.bpm || 120, keyRoot: body.keyRoot || 60, scale: body.scale || [0,2,4,5,7,9,11], barCount: body.barCount || 16, seedDensity: body.seedDensity ?? 0.15, generations: body.generations });
    return c.json({ notes: result.notes, historyLength: result.history.length });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post('/api/engine/consciousness', async (c) => {
  const body = await c.req.json<{theme?: string; bpm?: number; bars?: number; baseKey?: number; temperature?: number}>();
  try {
    const pcm = generateConsciousnessStream({ theme: body.theme || '雨', bpm: body.bpm || 90, bars: body.bars || 8, baseKey: body.baseKey || 60, temperature: body.temperature ?? 1.0 });
    const wav = pcmToWav(pcm, 44100);
    return c.json({ wavBase64: Buffer.from(wav).toString('base64'), duration: pcm.length / 44100 });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// ======== 视频配乐 API ========
app.post('/api/video/score', async (c) => {
  const body = await c.req.json<{
    emotionSequence: Array<{ time: number; emotion: { happy: number; sad: number; tense: number; calm: number; excited: number }; intensity?: number }>;
  }>();
  try {
    const seq = body.emotionSequence || [];
    if (seq.length === 0) return c.json({ error: '情绪序列为空' }, 400);

    const totals = seq.reduce(
      (acc, cur) => {
        const e = cur.emotion;
        acc.happy += e.happy || 0;
        acc.sad += e.sad || 0;
        acc.tense += e.tense || 0;
        acc.calm += e.calm || 0;
        acc.excited += e.excited || 0;
        return acc;
      },
      { happy: 0, sad: 0, tense: 0, calm: 0, excited: 0 }
    );
    const n = seq.length;
    const avg = {
      happy: totals.happy / n,
      sad: totals.sad / n,
      tense: totals.tense / n,
      calm: totals.calm / n,
      excited: totals.excited / n,
    };

    const dominant = (Object.keys(avg) as Array<keyof typeof avg>).reduce((a, b) =>
      avg[a] > avg[b] ? a : b
    );

    const emotionToStyle: Record<string, string> = {
      happy: 'pop',
      sad: 'chinese',
      tense: 'rock',
      calm: 'classical',
      excited: 'funk',
    };
    const emotionToEmotion: Record<string, string> = {
      happy: 'happy',
      sad: 'sad',
      tense: 'tense',
      calm: 'relaxed',
      excited: 'epic',
    };

    // 计算情绪变化剧烈程度
    let changeScore = 0;
    for (let i = 1; i < seq.length; i++) {
      const prev = seq[i - 1].emotion;
      const cur = seq[i].emotion;
      changeScore +=
        Math.abs((cur.happy || 0) - (prev.happy || 0)) +
        Math.abs((cur.sad || 0) - (prev.sad || 0)) +
        Math.abs((cur.tense || 0) - (prev.tense || 0)) +
        Math.abs((cur.calm || 0) - (prev.calm || 0)) +
        Math.abs((cur.excited || 0) - (prev.excited || 0));
    }
    const avgChange = changeScore / (seq.length - 1 || 1);

    // 根据情绪变化决定 bpm
    const baseBpm = { happy: 128, sad: 80, tense: 140, calm: 72, excited: 135 };
    let bpm = baseBpm[dominant] || 120;
    if (avgChange > 0.3) bpm = Math.min(180, Math.round(bpm * 1.15));
    else if (avgChange < 0.1) bpm = Math.round(bpm * 0.95);

    // 根据视频时长决定小节数
    const lastTime = seq[seq.length - 1]?.time || 0;
    const barCount = Math.max(4, Math.min(32, Math.round((lastTime / 60) * (bpm / 4))));

    // 构建段落结构
    const sections: Array<{ type: string; bars: number; intensity: number }> = [];
    const sectionTypes = ['intro', 'verse', 'chorus', 'outro'];
    const sectionBars = [4, 8, 8, 4];
    let sectionCount = Math.min(4, Math.max(2, Math.round(barCount / 6)));
    for (let i = 0; i < sectionCount; i++) {
      sections.push({
        type: sectionTypes[i] || 'verse',
        bars: Math.min(sectionBars[i] || 4, barCount),
        intensity: avgChange > 0.2 ? 0.8 : 0.5,
      });
    }

    const style = emotionToStyle[dominant] || 'pop';
    const emotion = emotionToEmotion[dominant] || 'happy';
    const keys = ['C', 'G', 'Am', 'F', 'D', 'Em'];
    const key = keys[Math.floor(seq.length % keys.length)];

    return c.json({
      style,
      key,
      emotion,
      bpm,
      barCount,
      sections,
      dominantEmotion: dominant,
      emotionAverages: avg,
      changeIntensity: Math.round(avgChange * 100) / 100,
    });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// ======== MIDI 导出 API ========
app.post('/api/export/midi', async (c) => {
  const body = await c.req.json<{
    noteEvents: { midi: number; startTime: number; duration: number; velocity: number }[];
    bpm: number;
    key?: string;
  }>();
  try {
    const midi = noteEventsToMidi(body.noteEvents, body.bpm, body.key);
    return c.json({ midiBase64: Buffer.from(midi).toString('base64') });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// ======== 音频导出 API ========
function decodeWavPcm(wavBase64: string): { pcm: Float32Array; sampleRate: number } {
  const buffer = Buffer.from(wavBase64, 'base64');
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const readString = (offset: number, len: number) => {
    let s = '';
    for (let i = 0; i < len; i++) s += String.fromCharCode(view.getUint8(offset + i));
    return s;
  };

  if (readString(0, 4) !== 'RIFF' || readString(8, 4) !== 'WAVE') {
    throw new Error('Invalid WAV file');
  }

  let fmtOffset = 12;
  let dataOffset = 0;
  let dataSize = 0;
  let sampleRate = 44100;
  let channels = 1;
  let bitsPerSample = 16;

  while (fmtOffset < buffer.byteLength - 8) {
    const chunkId = readString(fmtOffset, 4);
    const chunkSize = view.getUint32(fmtOffset + 4, true);
    if (chunkId === 'fmt ') {
      const audioFormat = view.getUint16(fmtOffset + 8, true);
      channels = view.getUint16(fmtOffset + 10, true);
      sampleRate = view.getUint32(fmtOffset + 12, true);
      bitsPerSample = view.getUint16(fmtOffset + 22, true);
      if (audioFormat !== 1) throw new Error('Only PCM WAV supported');
    } else if (chunkId === 'data') {
      dataOffset = fmtOffset + 8;
      dataSize = chunkSize;
      break;
    }
    fmtOffset += 8 + chunkSize + (chunkSize % 2);
  }

  if (dataOffset === 0) throw new Error('WAV data chunk not found');

  const numSamples = Math.floor(dataSize / (channels * (bitsPerSample / 8)));
  const pcm = new Float32Array(numSamples);

  if (bitsPerSample === 16) {
    for (let i = 0; i < numSamples; i++) {
      let sum = 0;
      for (let ch = 0; ch < channels; ch++) {
        sum += view.getInt16(dataOffset + (i * channels + ch) * 2, true);
      }
      pcm[i] = (sum / channels) / 32768;
    }
  } else if (bitsPerSample === 24) {
    for (let i = 0; i < numSamples; i++) {
      let sum = 0;
      for (let ch = 0; ch < channels; ch++) {
        const off = dataOffset + (i * channels + ch) * 3;
        const lo = view.getUint8(off);
        const mid = view.getUint8(off + 1);
        const hi = view.getUint8(off + 2);
        let val = (hi << 16) | (mid << 8) | lo;
        if (val & 0x800000) val |= ~0xFFFFFF;
        sum += val;
      }
      pcm[i] = (sum / channels) / 8388608;
    }
  } else if (bitsPerSample === 32) {
    for (let i = 0; i < numSamples; i++) {
      let sum = 0;
      for (let ch = 0; ch < channels; ch++) {
        sum += view.getInt32(dataOffset + (i * channels + ch) * 4, true);
      }
      pcm[i] = (sum / channels) / 2147483648;
    }
  } else {
    throw new Error(`Unsupported bits per sample: ${bitsPerSample}`);
  }

  return { pcm: pcm as Float32Array, sampleRate };
}

app.post('/api/export/audio', async (c) => {
  const body = await c.req.json<{
    wavBase64: string;
    format: 'mp3' | 'flac';
    bitrate?: number;
  }>();
  try {
    const { pcm, sampleRate } = decodeWavPcm(body.wavBase64);
    let audioBuffer: ArrayBuffer;
    let format = body.format;
    if (format === 'mp3') {
      const bitrate = body.bitrate || 128;
      audioBuffer = encodeMp3(pcm as Float32Array, sampleRate, bitrate);
    } else {
      const compressionLevel = 5;
      audioBuffer = encodeFlac(pcm as Float32Array, sampleRate, compressionLevel);
    }
    const audioBase64 = Buffer.from(audioBuffer).toString('base64');
    return c.json({ audioBase64, format });
  } catch (e: any) {
    return c.json({ error: e.message || 'Export failed' }, 500);
  }
});

// ======== 模块8: AI 专辑封面生成 API ========

const STYLE_KEYWORDS: Record<string, string> = {
  pop: 'vibrant, modern, neon lights, bold typography, glossy finish, trendy aesthetic',
  rock: 'gritty, dark, electric guitar silhouette, smoke, leather texture, stage lights',
  chinese: 'ink wash, traditional, watercolor, mountain mist, calligraphy brush strokes, serene landscape',
  jazz: 'warm tones, vinyl record, smoky club, golden hour, vintage microphone, soft spotlight',
  electronic: 'cyberpunk, holographic, circuit patterns, futuristic, neon grids, digital glitch',
  classical: 'baroque, oil painting, orchestra hall, gold frame, velvet curtain, candlelight',
  kpop: 'pastel gradients, kawaii aesthetic, holographic sparkles, dreamy bubbles, starry eyes',
  folk: 'acoustic guitar, rustic wood, wildflowers, sunset field, warm earth tones, hand-drawn',
  rnb: 'silk fabric, midnight blue, city skyline, smooth curves, soft focus, romantic glow',
  metal: 'flames, iron chains, dark cathedral, thunderstorm, blood moon, aggressive texture',
};

const EMOTION_KEYWORDS: Record<string, string> = {
  happy: 'joyful atmosphere, bright colors, sunburst, floating confetti, uplifting energy, warm sunshine',
  sad: 'melancholic mood, muted blue-gray tones, rain drops, dim twilight, solitary shadow, fading light',
  tense: 'dramatic contrast, sharp angles, storm clouds, crackling energy, dark reds, impending danger',
  relaxed: 'soft pastel, gentle waves, fluffy clouds, calm horizon, meditative, breezy meadow',
  epic: 'grand scale, soaring cathedral, golden rays, mountain peaks, heroic stance, cinematic lighting',
  romantic: 'rose petals, soft pink glow, moonlight reflection, intimate candlelight, dreamy haze',
  angry: 'fiery explosion, shattered glass, dark crimson, lightning strike, raw power, chaotic motion',
  hopeful: 'dawn breaking, fresh green sprouts, clear sky, warm sunrise, open road, new beginnings',
  lonely: 'empty street lamp, foggy window, single chair, long shadows, cold moonlight, distant city',
  nostalgic: 'vintage polaroid, sepia tones, old vinyl, soft vignette, childhood memory, warm amber',
};

function buildCoverPrompt(params: { emotion: string; style: string; theme?: string; lyricSnippet?: string; seedVariant?: string }): string {
  const styleKw = STYLE_KEYWORDS[params.style] || STYLE_KEYWORDS.pop;
  const emotionKw = EMOTION_KEYWORDS[params.emotion] || EMOTION_KEYWORDS.happy;
  const parts: string[] = [
    'Album cover art, high quality digital art, square format, centered composition',
    styleKw,
    emotionKw,
  ];
  if (params.theme && params.theme.trim()) {
    parts.push(`thematic elements: ${params.theme.trim()}`);
  }
  if (params.lyricSnippet && params.lyricSnippet.trim()) {
    parts.push(`inspired by lyrics: "${params.lyricSnippet.trim().slice(0, 80)}"`);
  }
  if (params.seedVariant && params.seedVariant.trim()) {
    parts.push(params.seedVariant.trim());
  }
  parts.push('professional graphic design, 4k, detailed, realistic visual, cinematic lighting, no text, no watermark');
  return parts.join(', ');
}

app.post('/api/cover/generate', async (c) => {
  const body = await c.req.json<{
    emotion: string;
    style: string;
    theme?: string;
    lyricSnippet?: string;
    seedVariant?: string;
  }>();
  try {
    const emotion = body.emotion || 'happy';
    const style = body.style || 'pop';
    const prompt = buildCoverPrompt({
      emotion,
      style,
      theme: body.theme,
      lyricSnippet: body.lyricSnippet,
      seedVariant: body.seedVariant,
    });
    const encodedPrompt = encodeURIComponent(prompt);
    const coverUrl = `https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=${encodedPrompt}&image_size=square`;
    return c.json({ coverUrl, prompt });
  } catch (e: any) {
    return c.json({ error: e.message || 'Cover generation failed' }, 500);
  }
});

// ======== 语音控制 API ========
app.post('/api/voice/parse', async (c) => {
  const body = await c.req.json<{ text: string }>();
  if (!body.text || typeof body.text !== 'string') {
    return c.json({ error: '缺少 text 字段' }, 400);
  }
  try {
    const result = parseVoiceCommand(body.text);
    return c.json(result);
  } catch (e: any) {
    return c.json({ error: e.message || '解析失败' }, 500);
  }
});

app.get('/api/voice/supportedCommands', (c) => {
  return c.json(getSupportedCommands());
});

// ======== 项目管理 API ========
app.post('/api/project/save', async (c) => {
  try {
    const body = await c.req.json<QingluanProject>();
    const projectId =
      'proj_' +
      Date.now().toString(36) +
      '_' +
      Math.random().toString(36).slice(2, 6);
    projectStore.set(projectId, body);
    const baseUrl = new URL(c.req.url).origin;
    const downloadUrl = `${baseUrl}/api/project/download?id=${projectId}`;
    return c.json({ projectId, downloadUrl });
  } catch (e: any) {
    return c.json({ error: e.message || 'Save failed' }, 500);
  }
});

app.get('/api/project/load', (c) => {
  const id = c.req.query('id');
  if (!id || !projectStore.has(id)) {
    return c.json({ error: 'Project not found' }, 404);
  }
  return c.json(projectStore.get(id)!);
});

app.get('/api/project/list', (c) => {
  const projects = Array.from(projectStore.entries()).map(
    ([projectId, proj]) => ({
      projectId,
      name: proj.name,
      createdAt: proj.createdAt,
      style: proj.compositionParams.style,
      key: proj.compositionParams.key,
    })
  );
  return c.json({ projects });
});

app.get('/api/project/download', (c) => {
  const id = c.req.query('id');
  if (!id || !projectStore.has(id)) {
    return c.json({ error: 'Project not found' }, 404);
  }
  const proj = projectStore.get(id)!;
  const serialized = serializeProject(proj);
  return c.body(serialized, 200, {
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': `attachment; filename="${encodeURIComponent(
      proj.name
    )}.qingluan"`,
  });
});

app.post('/api/project/import', async (c) => {
  try {
    const body = await c.req.json<{ data: string }>();
    const proj = deserializeProject(body.data);
    const projectId =
      'proj_' +
      Date.now().toString(36) +
      '_' +
      Math.random().toString(36).slice(2, 6);
    projectStore.set(projectId, proj);
    return c.json({ projectId, project: proj });
  } catch (e: any) {
    return c.json({ error: e.message || 'Import failed' }, 400);
  }
});

// ======== 云端同步 API ========
interface CloudProjectEntry {
  projectId: string;
  project: QingluanProject;
  syncToken: string;
  deviceId: string;
  lastModified: number;
  lastSyncTime: number;
}

const cloudStore = new Map<string, CloudProjectEntry>();

function generateSyncToken(): string {
  return 'sync_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

app.post('/api/cloud/upload', async (c) => {
  try {
    const body = await c.req.json<{ project: QingluanProject; deviceId: string }>();
    const project = body.project;
    const deviceId = body.deviceId || 'unknown';

    if (!project) {
      return c.json({ error: 'Missing project data' }, 400);
    }

    const projectId =
      (project as any).projectId ||
      'cloud_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
    const syncToken = generateSyncToken();
    const now = Date.now();

    const entry: CloudProjectEntry = {
      projectId,
      project,
      syncToken,
      deviceId,
      lastModified: now,
      lastSyncTime: now,
    };

    cloudStore.set(projectId, entry);

    const baseUrl = new URL(c.req.url).origin;
    const url = `${baseUrl}/api/cloud/download?projectId=${projectId}&syncToken=${syncToken}`;

    return c.json({ projectId, syncToken, url });
  } catch (e: any) {
    return c.json({ error: e.message || 'Upload failed' }, 500);
  }
});

app.get('/api/cloud/download', (c) => {
  const projectId = c.req.query('projectId');
  const syncToken = c.req.query('syncToken');

  if (!projectId || !syncToken) {
    return c.json({ error: 'Missing projectId or syncToken' }, 400);
  }

  const entry = cloudStore.get(projectId);
  if (!entry || entry.syncToken !== syncToken) {
    return c.json({ error: 'Project not found or invalid syncToken' }, 404);
  }

  return c.json({ project: entry.project, lastModified: entry.lastModified, deviceId: entry.deviceId });
});

app.get('/api/cloud/list', (c) => {
  const deviceId = c.req.query('deviceId') || '';
  const allProjects = Array.from(cloudStore.values()).map((entry) => ({
    projectId: entry.projectId,
    name: entry.project.name,
    style: entry.project.compositionParams.style,
    key: entry.project.compositionParams.key,
    lastSyncTime: entry.lastSyncTime,
    deviceId: entry.deviceId,
    isOwner: entry.deviceId === deviceId,
  }));

  // 优先返回当前设备的项目，但也返回其他设备的项目以支持多设备同步
  const ownerProjects = allProjects.filter((p) => p.isOwner);
  const otherProjects = allProjects.filter((p) => !p.isOwner);

  return c.json({ projects: allProjects, ownerProjects, otherProjects, deviceId });
});

app.post('/api/cloud/sync', async (c) => {
  try {
    const body = await c.req.json<{
      projectId: string;
      syncToken: string;
      deviceId: string;
      timestamp: number;
      project?: QingluanProject;
    }>();

    const { projectId, syncToken, deviceId, timestamp } = body;

    if (!projectId || !syncToken || !deviceId || typeof timestamp !== 'number') {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    const entry = cloudStore.get(projectId);
    if (!entry || entry.syncToken !== syncToken) {
      return c.json({ error: 'Project not found or invalid syncToken' }, 404);
    }

    const cloudTime = entry.lastModified;
    const localTime = timestamp;
    const timeDiff = Math.abs(cloudTime - localTime);

    // 冲突检测：时间差 < 60秒视为并发更新
    if (timeDiff < 60000) {
      return c.json({
        status: 'conflict',
        message: '本地与云端同时有更新，请选择一个版本保留',
        cloudVersion: entry.project,
        cloudTimestamp: cloudTime,
        localTimestamp: localTime,
      });
    }

    if (localTime > cloudTime) {
      // 本地更新，覆盖云端
      if (body.project) {
        const now = Date.now();
        entry.project = body.project;
        entry.lastModified = now;
        entry.lastSyncTime = now;
        entry.deviceId = deviceId;
        cloudStore.set(projectId, entry);
        return c.json({ status: 'updated', message: '云端已更新为本地版本', lastModified: now });
      }
      return c.json({ status: 'local_newer', message: '本地版本较新，请调用 upload 上传', cloudTimestamp: cloudTime, localTimestamp: localTime });
    }

    // 云端更新
    return c.json({
      status: 'cloud_newer',
      message: '云端版本较新',
      cloudVersion: entry.project,
      cloudTimestamp: cloudTime,
      localTimestamp: localTime,
    });
  } catch (e: any) {
    return c.json({ error: e.message || 'Sync failed' }, 500);
  }
});

app.post('/api/cloud/delete', async (c) => {
  try {
    const body = await c.req.json<{ projectId: string; syncToken: string }>();
    const { projectId, syncToken } = body;

    if (!projectId || !syncToken) {
      return c.json({ error: 'Missing projectId or syncToken' }, 400);
    }

    const entry = cloudStore.get(projectId);
    if (!entry || entry.syncToken !== syncToken) {
      return c.json({ error: 'Project not found or invalid syncToken' }, 404);
    }

    cloudStore.delete(projectId);
    return c.json({ status: 'deleted', projectId });
  } catch (e: any) {
    return c.json({ error: e.message || 'Delete failed' }, 500);
  }
});

// ======== 协作 SSE API ========

interface CollabUser {
  userId: string;
  nickname: string;
  color: string;
  controller: ReadableStreamDefaultController<string>;
}

interface CollabRoom {
  roomId: string;
  ownerId: string;
  locked: boolean;
  users: Map<string, CollabUser>;
  createdAt: number;
}

interface CollabEvent {
  type: 'noteAdded' | 'noteDeleted' | 'paramChanged' | 'cursorMoved' | 'chatMessage' | 'userJoined' | 'userLeft' | 'roomLocked' | 'roomUnlocked' | 'syncRequest' | 'syncResponse';
  data: any;
  from: string;
  time: number;
}

const collabRooms = new Map<string, CollabRoom>();
const COLLAB_COLORS = ['#5b4dff', '#ff6b9d', '#00c9a7', '#ff9f43', '#ee5a52', '#2bcbba', '#a55eea', '#fd9644'];

function getCollabColor(index: number): string {
  return COLLAB_COLORS[index % COLLAB_COLORS.length];
}

function getRoom(roomId: string): CollabRoom | undefined {
  return collabRooms.get(roomId);
}

function ensureRoom(roomId: string, ownerId: string): CollabRoom {
  let room = collabRooms.get(roomId);
  if (!room) {
    room = {
      roomId,
      ownerId,
      locked: false,
      users: new Map(),
      createdAt: Date.now(),
    };
    collabRooms.set(roomId, room);
  }
  return room;
}

function broadcastToRoom(room: CollabRoom, event: CollabEvent, excludeUserId?: string) {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  room.users.forEach((user, uid) => {
    if (uid === excludeUserId) return;
    try {
      user.controller.enqueue(payload);
    } catch {
      // connection closed
    }
  });
}

function makeUserList(room: CollabRoom): { userId: string; nickname: string; color: string }[] {
  return Array.from(room.users.values()).map(u => ({
    userId: u.userId,
    nickname: u.nickname,
    color: u.color,
  }));
}

// SSE 流连接
app.get('/api/collab/stream', (c) => {
  const roomId = c.req.query('roomId');
  const userId = c.req.query('userId');
  const nickname = c.req.query('nickname') || userId || '匿名';

  if (!roomId || !userId) {
    return c.json({ error: '缺少 roomId 或 userId' }, 400);
  }

  const stream = new ReadableStream<string>({
    start(controller) {
      const room = ensureRoom(roomId, userId);
      // 如果房间为空，当前用户成为房主
      if (room.users.size === 0) {
        room.ownerId = userId;
      }

      const color = getCollabColor(room.users.size);
      const user: CollabUser = { userId, nickname, color, controller };
      room.users.set(userId, user);

      // 发送连接确认
      controller.enqueue(`data: ${JSON.stringify({ type: 'connected', data: { roomId, userId, ownerId: room.ownerId, locked: room.locked }, from: 'system', time: Date.now() })}\n\n`);

      // 广播用户加入
      broadcastToRoom(room, {
        type: 'userJoined',
        data: { userId, nickname, color, users: makeUserList(room) },
        from: 'system',
        time: Date.now(),
      }, userId);

      // 发送当前用户列表给新用户
      controller.enqueue(`data: ${JSON.stringify({ type: 'userList', data: makeUserList(room), from: 'system', time: Date.now() })}\n\n`);
    },
    cancel() {
      const room = getRoom(roomId);
      if (!room) return;
      const existed = room.users.has(userId);
      room.users.delete(userId);
      if (existed) {
        broadcastToRoom(room, {
          type: 'userLeft',
          data: { userId, users: makeUserList(room) },
          from: 'system',
          time: Date.now(),
        });
      }
      if (room.users.size === 0) {
        collabRooms.delete(roomId);
      } else if (room.ownerId === userId) {
        // 房主离开，转让房主给第一个在线用户
        const nextOwner = room.users.values().next().value as CollabUser | undefined;
        if (nextOwner) {
          room.ownerId = nextOwner.userId;
          broadcastToRoom(room, {
            type: 'userJoined',
            data: { userId: nextOwner.userId, nickname: nextOwner.nickname, color: nextOwner.color, users: makeUserList(room), ownerChanged: true },
            from: 'system',
            time: Date.now(),
          });
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
});

// 广播事件
app.post('/api/collab/broadcast', async (c) => {
  const body = await c.req.json<{ roomId: string; userId: string; type: string; data: any }>();
  const { roomId, userId, type, data } = body;

  if (!roomId || !userId || !type) {
    return c.json({ error: '缺少参数' }, 400);
  }

  const room = getRoom(roomId);
  if (!room) {
    return c.json({ error: '房间不存在' }, 404);
  }

  // 权限检查
  if (room.locked && room.ownerId !== userId) {
    // 锁定状态下只允许 chatMessage 和 cursorMoved
    if (type !== 'chatMessage' && type !== 'cursorMoved' && type !== 'syncRequest') {
      return c.json({ error: '房间已锁定，只有房主可以编辑' }, 403);
    }
  }

  const event: CollabEvent = {
    type: type as CollabEvent['type'],
    data,
    from: userId,
    time: Date.now(),
  };

  broadcastToRoom(room, event, userId);
  return c.json({ ok: true });
});

// 获取房间信息
app.get('/api/collab/room', (c) => {
  const roomId = c.req.query('roomId');
  if (!roomId) return c.json({ error: '缺少 roomId' }, 400);
  const room = getRoom(roomId);
  if (!room) return c.json({ error: '房间不存在' }, 404);
  return c.json({
    roomId: room.roomId,
    ownerId: room.ownerId,
    locked: room.locked,
    userCount: room.users.size,
    users: makeUserList(room),
  });
});

// 房主锁定房间
app.post('/api/collab/lock', async (c) => {
  const body = await c.req.json<{ roomId: string; userId: string }>();
  const { roomId, userId } = body;
  const room = getRoom(roomId);
  if (!room) return c.json({ error: '房间不存在' }, 404);
  if (room.ownerId !== userId) return c.json({ error: '只有房主可以锁定房间' }, 403);
  room.locked = true;
  broadcastToRoom(room, { type: 'roomLocked', data: { lockedBy: userId }, from: 'system', time: Date.now() });
  return c.json({ ok: true, locked: true });
});

// 房主解锁房间
app.post('/api/collab/unlock', async (c) => {
  const body = await c.req.json<{ roomId: string; userId: string }>();
  const { roomId, userId } = body;
  const room = getRoom(roomId);
  if (!room) return c.json({ error: '房间不存在' }, 404);
  if (room.ownerId !== userId) return c.json({ error: '只有房主可以解锁房间' }, 403);
  room.locked = false;
  broadcastToRoom(room, { type: 'roomUnlocked', data: { unlockedBy: userId }, from: 'system', time: Date.now() });
  return c.json({ ok: true, locked: false });
});

// 房主踢人
app.post('/api/collab/kick', async (c) => {
  const body = await c.req.json<{ roomId: string; userId: string; targetUserId: string }>();
  const { roomId, userId, targetUserId } = body;
  const room = getRoom(roomId);
  if (!room) return c.json({ error: '房间不存在' }, 404);
  if (room.ownerId !== userId) return c.json({ error: '只有房主可以踢人' }, 403);
  const target = room.users.get(targetUserId);
  if (target) {
    try {
      target.controller.enqueue(`data: ${JSON.stringify({ type: 'kicked', data: {}, from: 'system', time: Date.now() })}\n\n`);
    } catch {
      // ignore
    }
    room.users.delete(targetUserId);
    broadcastToRoom(room, {
      type: 'userLeft',
      data: { userId: targetUserId, users: makeUserList(room) },
      from: 'system',
      time: Date.now(),
    });
  }
  return c.json({ ok: true });
});

// ======== 模块9: 插件系统 API ========
const pluginCodeStore = new Map<string, { payload: PluginCodePayload; registeredAt: number }>();

app.post('/api/plugin/register', async (c) => {
  try {
    const body = await c.req.json<PluginCodePayload>();
    const plugin = globalPluginSandbox.register(body);
    pluginCodeStore.set(body.name, { payload: body, registeredAt: Date.now() });
    return c.json({ success: true, message: `插件 "${plugin.name}" v${plugin.version} 注册成功` });
  } catch (e: any) {
    return c.json({ success: false, message: e.message || '注册失败' }, 400);
  }
});

app.get('/api/plugin/list', (c) => {
  const type = c.req.query('type') as 'effect' | 'instrument' | 'visualizer' | undefined;
  const plugins = globalPluginSandbox.getRegistry().list(type).map((p) => ({
    name: p.name,
    version: p.version,
    type: p.type,
    parameters: p.parameters,
  }));
  return c.json({ plugins });
});

app.post('/api/plugin/test', async (c) => {
  try {
    const body = await c.req.json<{
      name: string;
      input: number[];
      params: Record<string, number>;
      sampleRate: number;
      frequency?: number;
      duration?: number;
      velocity?: number;
    }>();
    const plugin = globalPluginSandbox.getRegistry().get(body.name);
    if (!plugin) {
      return c.json({ error: `插件 "${body.name}" 未找到` }, 404);
    }
    const sampleRate = body.sampleRate || 44100;
    if (plugin.type === 'instrument' && plugin.generateNote) {
      const note = plugin.generateNote(
        body.frequency || 440,
        body.duration || 0.5,
        body.velocity || 0.8,
        body.params || {},
        sampleRate
      );
      return c.json({ output: Array.from(note) });
    } else {
      const input = new Float32Array(body.input || []);
      const output = new Float32Array(input.length);
      plugin.processBlock(input, output, body.params || {}, sampleRate);
      return c.json({ output: Array.from(output) });
    }
  } catch (e: any) {
    return c.json({ error: e.message || '测试失败' }, 500);
  }
});

app.post('/api/plugin/unregister', async (c) => {
  try {
    const body = await c.req.json<{ name: string }>();
    const removed = globalPluginSandbox.getRegistry().unregister(body.name);
    pluginCodeStore.delete(body.name);
    return c.json({ success: removed, message: removed ? `插件 "${body.name}" 已删除` : '插件不存在' });
  } catch (e: any) {
    return c.json({ success: false, message: e.message || '删除失败' }, 500);
  }
});

// ======== 模块10: 音乐教育 API ========
interface EduScoreEntry {
  game: string;
  score: number;
  level: string;
  timestamp: number;
}
const eduLeaderboard: EduScoreEntry[] = [];

const EDU_INTERVALS: { name: string; semitones: number; nameCN: string }[] = [
  { name: 'P1', semitones: 0, nameCN: '纯一度' },
  { name: 'm2', semitones: 1, nameCN: '小二度' },
  { name: 'M2', semitones: 2, nameCN: '大二度' },
  { name: 'm3', semitones: 3, nameCN: '小三度' },
  { name: 'M3', semitones: 4, nameCN: '大三度' },
  { name: 'P4', semitones: 5, nameCN: '纯四度' },
  { name: 'TT', semitones: 6, nameCN: '三全音' },
  { name: 'P5', semitones: 7, nameCN: '纯五度' },
  { name: 'm6', semitones: 8, nameCN: '小六度' },
  { name: 'M6', semitones: 9, nameCN: '大六度' },
  { name: 'm7', semitones: 10, nameCN: '小七度' },
  { name: 'M7', semitones: 11, nameCN: '大七度' },
  { name: 'P8', semitones: 12, nameCN: '纯八度' },
];

const EDU_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickOptions<T>(correct: T, pool: T[], count: number): T[] {
  const filtered = pool.filter((x) => x !== correct);
  const shuffled = shuffleArray(filtered);
  return shuffleArray([correct, ...shuffled.slice(0, count - 1)]);
}

app.get('/api/edu/interval', (c) => {
  const rootNote = EDU_NOTES[Math.floor(Math.random() * EDU_NOTES.length)];
  const interval = EDU_INTERVALS[Math.floor(Math.random() * EDU_INTERVALS.length)];
  const rootSemitone = MusicTheoryEngine.utils.noteToSemitone(rootNote);
  const targetSemitone = (rootSemitone + interval.semitones) % 12;
  const targetNote = MusicTheoryEngine.utils.semitoneToNote(targetSemitone);
  const octave = interval.semitones > 5 ? 4 : 4;
  const note2Octave = rootSemitone + interval.semitones > 11 ? octave + 1 : octave;
  const note1 = `${rootNote}${octave}`;
  const note2 = `${targetNote}${note2Octave}`;
  const options = pickOptions(interval.nameCN, EDU_INTERVALS.map((i) => i.nameCN), 4);
  return c.json({ note1, note2, correctAnswer: interval.nameCN, options });
});

app.get('/api/edu/scale', (c) => {
  const allScales = MusicTheoryEngine.scales.getAll();
  const scaleDef = allScales[Math.floor(Math.random() * allScales.length)];
  const rootNote = EDU_NOTES[Math.floor(Math.random() * EDU_NOTES.length)];
  const scaleType = (Object.keys({ ...MusicTheoryEngine.scales.western, ...MusicTheoryEngine.scales.chinese, ...MusicTheoryEngine.scales.japanese, ...MusicTheoryEngine.scales.world }) as ScaleType[]).find(
    (k) => MusicTheoryEngine.scales.getDefinition(k).name === scaleDef.name
  ) ?? 'major';
  const pitches = MusicTheoryEngine.scales.generate(rootNote, scaleType, 4);
  const notes = pitches.map((p) => `${p.note}${p.octave}`);
  const allNames = allScales.map((s) => s.nameCN);
  const options = pickOptions(scaleDef.nameCN, allNames, 4);
  return c.json({ notes, correctAnswer: scaleDef.nameCN, options });
});

app.get('/api/edu/chord', (c) => {
  const chordDefs = MusicTheoryEngine.chords.definitions;
  const chordTypes = Object.keys(chordDefs) as ChordType[];
  const chordType = chordTypes[Math.floor(Math.random() * chordTypes.length)];
  const rootNote = EDU_NOTES[Math.floor(Math.random() * EDU_NOTES.length)];
  const chord = MusicTheoryEngine.chords.generate(rootNote, chordType, 4, 0);
  const notes = chord.notes.map((n) => `${n.note}${n.octave}`);
  const allNames = chordTypes.map((t) => chordDefs[t].nameCN);
  const options = pickOptions(chordDefs[chordType].nameCN, allNames, 4);
  return c.json({ notes, correctAnswer: chordDefs[chordType].nameCN, options });
});

app.post('/api/edu/score', async (c) => {
  const body = await c.req.json<{ game: string; score: number; level: string }>();
  const entry: EduScoreEntry = {
    game: body.game || 'unknown',
    score: Number(body.score) || 0,
    level: body.level || '',
    timestamp: Date.now(),
  };
  eduLeaderboard.push(entry);
  // 只保留最近1000条
  if (eduLeaderboard.length > 1000) {
    eduLeaderboard.splice(0, eduLeaderboard.length - 1000);
  }
  return c.json({ ok: true });
});

app.get('/api/edu/leaderboard', (c) => {
  const game = c.req.query('game') || 'all';
  let list = eduLeaderboard;
  if (game !== 'all') {
    list = eduLeaderboard.filter((e) => e.game === game);
  }
  const sorted = [...list].sort((a, b) => b.score - a.score).slice(0, 10);
  return c.json({ game, leaderboard: sorted });
});

// ======== 模块10: 版权指纹系统 API ========
interface FingerprintEntry {
  fingerprint: string;
  globalHash: string;
  metadata: {
    title: string;
    style: string;
    createdAt: string;
  };
}

const fingerprintDatabase = new Map<string, FingerprintEntry>();

app.post('/api/fingerprint/generate', async (c) => {
  const body = await c.req.json<{ wavBase64: string }>();
  try {
    const { pcm, sampleRate } = decodeWavPcm(body.wavBase64);
    const fingerprint = generateFingerprint(pcm, sampleRate);
    const globalHash = getGlobalHashHex(fingerprint);
    return c.json({ fingerprint, globalHash });
  } catch (e: any) {
    return c.json({ error: e.message || 'Fingerprint generation failed' }, 500);
  }
});

app.post('/api/fingerprint/compare', async (c) => {
  const body = await c.req.json<{ fp1: string; fp2: string }>();
  try {
    const similarity = compareFingerprints(body.fp1, body.fp2);
    const p1 = body.fp1.split(':')[0];
    const p2 = body.fp2.split(':')[0];
    const minLen = Math.min(p1.length, p2.length);
    const maxLen = Math.max(p1.length, p2.length);
    const hammingDistance = Math.round((1 - similarity) * maxLen * 8);
    return c.json({ similarity, hammingDistance });
  } catch (e: any) {
    return c.json({ error: e.message || 'Comparison failed' }, 500);
  }
});

app.get('/api/fingerprint/database', (c) => {
  const entries = Array.from(fingerprintDatabase.values());
  return c.json({ entries });
});

app.post('/api/fingerprint/store', async (c) => {
  const body = await c.req.json<{ fingerprint: string; metadata: { title: string; style: string; createdAt: string } }>();
  try {
    const { fingerprint, metadata } = body;
    const globalHash = getGlobalHashHex(fingerprint);
    fingerprintDatabase.set(fingerprint, { fingerprint, globalHash, metadata });
    return c.json({ success: true, stored: fingerprintDatabase.size });
  } catch (e: any) {
    return c.json({ error: e.message || 'Store failed' }, 500);
  }
});

app.post('/api/fingerprint/search', async (c) => {
  const body = await c.req.json<{ fingerprint: string }>();
  try {
    const dbFingerprints = Array.from(fingerprintDatabase.keys());
    const results = findSimilarFingerprints(body.fingerprint, dbFingerprints, 5);
    const enriched = results.map((r) => {
      const entry = fingerprintDatabase.get(r.fp);
      return {
        fingerprint: r.fp,
        similarity: r.similarity,
        metadata: entry?.metadata || null,
      };
    });
    return c.json({ results: enriched });
  } catch (e: any) {
    return c.json({ error: e.message || 'Search failed' }, 500);
  }
});

// ======== 启动服务 ========
const PORT = Number(process.env.PORT) || 3220;

serve({
  fetch: app.fetch,
  port: PORT,
});

console.log(`\n🎵 青鸾数字音频工作站运行中: http://localhost:${PORT}`);
console.log('   四大模块：AI作曲编曲 | AI歌声合成 | 音频效果器 | 音乐可视化');
console.log('   非传统方法：马尔可夫链+遗传算法+分形+混沌+量子+细胞自动机');
console.log('   手机版 · 免费路线 · 纯代码实现\n');
