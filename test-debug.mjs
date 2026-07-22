import { CognitiveEmergenceMusicEngine } from './dist/engines/emergenceMusic.js';
import { createArrangement } from './dist/composition/realisticArranger.js';

console.log('Test 1: 作曲引擎...');
const composeStart = Date.now();
try {
  const engine = new CognitiveEmergenceMusicEngine();
  const result = engine.swarmCompose('C', 100, 'happy', 4);
  console.log('✅ 作曲完成', Date.now() - composeStart, 'ms');
  console.log('  旋律长度:', result.melody?.length);
  console.log('  Session ID:', result.sessionId);
} catch (e) {
  console.error('❌ 作曲失败:', e.message);
  console.error(e.stack);
}

console.log('\nTest 2: 编曲引擎...');
const arrangeStart = Date.now();
try {
  const arr = createArrangement('C', 100, 'pop', 'happy', 4);
  console.log('✅ 编曲完成', Date.now() - arrangeStart, 'ms');
  console.log('  轨道数:', arr.tracks?.length);
  console.log('  总采样数:', arr.mixed?.length);
} catch (e) {
  console.error('❌ 编曲失败:', e.message);
  console.error(e.stack);
}
