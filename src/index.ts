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
import * as AudioEffects from './effects/audioEffects.js';
import * as Visualizer from './visualization/musicVisualizer.js';

const app = new Hono();

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
    modules: ['musicTheory', 'aiComposer', 'vocalSynthesis', 'realisticVoice', 'audioEffects', 'visualization'],
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
