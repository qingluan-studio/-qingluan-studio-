import RealisticArrangerEngine from './dist/composition/realisticArranger.js';

console.log('测试合成器...');
const start = Date.now();

try {
  const engine = new RealisticArrangerEngine();
  const synth = engine['getSynthesizer']('piano');
  console.log('合成器类型:', synth.type);

  const note = { midi: 60, startTime: 0, duration: 1, velocity: 0.8 };
  console.log('开始渲染音符...');
  const buf = synth.renderNote(note, 'happy');
  console.log('✅ 完成!', Date.now() - start, 'ms');
  console.log('缓冲区长度:', buf.length, `(约 ${(buf.length / 44100).toFixed(2)} 秒)`);
} catch (e) {
  console.error('❌ 失败:', e.message);
  console.error(e.stack);
}
