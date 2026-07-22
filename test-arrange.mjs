import { ArrangementEngine } from './dist/composition/realisticArranger.js';

console.log('测试 arrangeSections...');
const start = Date.now();

try {
  const engine = new ArrangementEngine('pop', 120, 'happy');
  const sections = [
    { type: 'intro', bars: 2, chordProgression: [{ startBar: 0, durationBars: 2, root: 60, quality: 'major' }] },
  ];
  const result = engine.arrangeSections(sections);
  console.log('✅ 编曲规划完成!', Date.now() - start, 'ms');
  console.log('轨道数:', result.size);
  for (const [inst, notes] of result.entries()) {
    console.log(`  ${inst}: ${notes.length} 个音符`);
  }
} catch (e) {
  console.error('❌ 失败:', e.message);
  console.error(e.stack);
}
