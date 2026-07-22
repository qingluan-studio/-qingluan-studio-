import { createArrangement } from './dist/composition/realisticArranger.js';

console.log('快速测试: 2小节编曲...');
const start = Date.now();

try {
  const arr = createArrangement('C', 120, 'pop', 'happy', 2);
  console.log('✅ 完成!', Date.now() - start, 'ms');
  console.log('轨道:', arr.tracks?.length);
  console.log('总采样:', arr.mixed?.length);
  console.log('估算时长:', (arr.mixed?.length / 44100)?.toFixed(1), '秒');
} catch (e) {
  console.error('❌ 失败:', e.message);
  console.error(e.stack);
}
