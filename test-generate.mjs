import { SelfEvolvingMusicProducer } from './dist/engines/selfEvolvingProducer.js';
import fs from 'fs';

async function main() {
  console.log('🎵 开始生成20秒音乐...');
  const producer = new SelfEvolvingMusicProducer(44100);

  const params = {
    style: 'pop',
    key: 'C',
    emotion: 'happy',
    barCount: 8,
    bpm: 100,
    maxAttempts: 1,
    useAutoMix: true,
  };

  console.log('参数:', params);
  const start = Date.now();

  try {
    const result = await producer.produce(params);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    console.log('\n✅ 生成完成! 耗时:', elapsed, '秒');
    console.log('尝试次数:', result.attempt);
    console.log('修复:', result.fixed ? '是' : '否');
    console.log('进化:', result.evolved ? '是' : '否');
    console.log('T6评分:', result.composition?.scores?.overall?.toFixed?.(3) ?? 'N/A');
    console.log('诊断:', result.diagnosis?.healthy ? '健康' : result.diagnosis?.severity);

    if (result.mastering) {
      console.log('\n📀 母带指标:');
      console.log('  最终LUFS:', result.mastering.finalLUFS.toFixed(2));
      console.log('  真峰值:', result.mastering.finalTruePeak.toFixed(4));
      console.log('  动态范围:', result.mastering.metrics?.dynamicRangeLU?.toFixed?.(2), 'LU');
      console.log('  处理链:', result.mastering.applied.join(', '));
    }

    if (result.autoMixSettings) {
      console.log('\n🎚️ AI自动混音参数:');
      for (const [track, settings] of Object.entries(result.autoMixSettings)) {
        if (typeof settings === 'object' && settings !== null) {
          console.log(`  ${track}: gain=${settings.gain?.toFixed?.(2) ?? '?'}, pan=${settings.pan?.toFixed?.(2) ?? '?'}, eq=[${settings.eqLow?.toFixed?.(1) ?? '?'},${settings.eqMid?.toFixed?.(1) ?? '?'},${settings.eqHigh?.toFixed?.(1) ?? '?'}]`);
        }
      }
    }

    if (result.lyrics) {
      console.log('\n📝 歌词:');
      result.lyrics.forEach((line, i) => console.log(`  ${i + 1}. ${line}`));
    }

    if (result.fingerprint) {
      console.log('\n🔐 声学指纹:', result.fingerprint.slice(0, 32) + '...');
    }

    // 保存 WAV 文件
    const wavPath = '/workspace/music/test-output.wav';
    fs.writeFileSync(wavPath, Buffer.from(result.wav));
    const wavSize = (result.wav.byteLength / 1024).toFixed(1);
    console.log('\n💾 已保存:', wavPath, `(${wavSize} KB)`);

    // 估算时长
    const duration = (result.wav.byteLength - 44) / 2 / 44100;
    console.log('⏱️ 音频时长:', duration.toFixed(1), '秒');

  } catch (err) {
    console.error('\n❌ 生成失败:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

main();
