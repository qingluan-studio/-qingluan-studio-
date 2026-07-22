/**
 * ============================================================
 * 真实空间混响引擎 (Spatial Reverb Engine)
 * 基于几何声学的早期反射模拟 + 混响尾生成 + 3D 空间定位
 * 将混响从"数字效果"升级为"真实声学空间模拟"
 * TypeScript Strict Mode | 中文注释 | 采样率 44100Hz
 * ============================================================
 */

import { DEFAULT_SAMPLE_RATE } from './audioEffects.js';

// ============================================================================
// 接口定义
// ============================================================================

/** 房间声学参数 */
export interface RoomAcoustics {
  volume: number;        // 房间体积 m³
  absorption: number;    // 平均吸声系数 0-1
  rt60: number;          // 混响时间（秒）
  shape: 'rectangular' | 'shoebox' | 'cathedral' | 'cylindrical' | 'dome';
  width: number;         // 房间宽度 m
  length: number;        // 房间长度 m
  height: number;        // 房间高度 m
}

/** 声源位置（房间比例 0-1） */
export interface SourcePosition {
  x: number;  // 0-1，房间宽度比例
  y: number;  // 0-1，房间长度比例
  z: number;  // 0-1，房间高度比例
}

/** 听者位置（房间比例 0-1） */
export interface ListenerPosition {
  x: number;
  y: number;
  z: number;
  headAngle: number; // 头部朝向角度（度），0=面朝Y+方向
}

// ============================================================================
// 工具函数
// ============================================================================

/** 将分贝转换为线性增益 */
function dbToGain(db: number): number {
  return Math.pow(10.0, db / 20.0);
}

/** 将线性增益转换为分贝 */
function gainToDb(gain: number): number {
  return 20.0 * Math.log10(Math.max(gain, 1e-10));
}

/** 限制数值范围 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** 一阶低通滤波器（支持动态截止频率） */
class DynamicLowpass {
  private z1: number = 0.0;

  public process(input: number, cutoffHz: number, sampleRate: number): number {
    const alpha: number = 1.0 - Math.exp((-2.0 * Math.PI * cutoffHz) / sampleRate);
    this.z1 += alpha * (input - this.z1);
    return this.z1;
  }

  public reset(): void {
    this.z1 = 0.0;
  }
}

// ============================================================================
// 核心引擎
// ============================================================================

export class SpatialReverbEngine {
  private sampleRate: number;

  constructor(sampleRate?: number) {
    this.sampleRate = sampleRate ?? DEFAULT_SAMPLE_RATE;
  }

  /**
   * 根据房间声学参数生成真实脉冲响应（IR）
   * 综合镜像源法早期反射 + 指数衰减混响尾 + 空气吸收 + 交叉淡化
   */
  public generateIR(params: {
    room: RoomAcoustics;
    source: SourcePosition;
    listener: ListenerPosition;
    maxLength?: number; // 最大IR长度（秒），默认 rt60 * 1.5
  }): Float32Array {
    const room: RoomAcoustics = params.room;
    const source: SourcePosition = params.source;
    const listener: ListenerPosition = params.listener;
    const maxLengthSec: number = params.maxLength ?? room.rt60 * 1.5;
    const length: number = Math.ceil(maxLengthSec * this.sampleRate);
    const ir: Float32Array = new Float32Array(length);

    // 1. 早期反射（镜像源法）
    this.generateEarlyReflections(room, source, listener, ir);

    // 2. 混响尾（指数衰减噪声 + 动态低通模拟空气吸收）
    this.generateLateReverb(room, room.rt60, ir);

    // 3. 早期反射与混响尾交叉淡化（60-100ms）
    this.applyCrossfade(ir);

    // 4. 归一化
    this.normalize(ir);

    return ir;
  }

  /** 镜像源法计算早期反射（矩形房间，前 30-50 阶镜像源） */
  private generateEarlyReflections(
    room: RoomAcoustics,
    source: SourcePosition,
    listener: ListenerPosition,
    ir: Float32Array
  ): void {
    const sx: number = source.x * room.width;
    const sy: number = source.y * room.length;
    const sz: number = source.z * room.height;
    const lx: number = listener.x * room.width;
    const ly: number = listener.y * room.length;
    const lz: number = listener.z * room.height;

    const maxOrder: number = 5;
    const maxEarlyTime: number = 0.10; // 100ms
    const speedOfSound: number = 343.0;

    for (let nx: number = -maxOrder; nx <= maxOrder; nx++) {
      for (let ny: number = -maxOrder; ny <= maxOrder; ny++) {
        for (let nz: number = -maxOrder; nz <= maxOrder; nz++) {
          if (nx === 0 && ny === 0 && nz === 0) continue;

          const reflections: number = Math.abs(nx) + Math.abs(ny) + Math.abs(nz);
          const xs: number = this.getImageCoord(nx, room.width, sx);
          const ys: number = this.getImageCoord(ny, room.length, sy);
          const zs: number = this.getImageCoord(nz, room.height, sz);

          const dx: number = xs - lx;
          const dy: number = ys - ly;
          const dz: number = zs - lz;
          const distance: number = Math.sqrt(dx * dx + dy * dy + dz * dz);
          const arrivalTime: number = distance / speedOfSound;

          if (arrivalTime > maxEarlyTime) continue;

          const arrivalSample: number = Math.round(arrivalTime * this.sampleRate);
          if (arrivalSample < 0 || arrivalSample >= ir.length) continue;

          // 反射强度：1/d² × (1-absorption)^反射次数
          let amplitude: number = (1.0 / (distance * distance)) * Math.pow(1.0 - room.absorption, reflections);

          // 空气吸收整体增益衰减（5kHz 参考：每 10 米 -1dB）
          const airDb: number = (distance / 10.0) * 1.0;
          amplitude *= dbToGain(-airDb);

          // 随机相位避免相长干涉峰值
          amplitude *= (Math.random() > 0.5 ? 1.0 : -1.0);

          ir[arrivalSample] += amplitude;
        }
      }
    }
  }

  /** 计算镜像源坐标 */
  private getImageCoord(n: number, size: number, pos: number): number {
    const absN: number = Math.abs(n);
    const sign: number = n >= 0 ? 1 : -1;
    if (absN === 0) return pos;
    if (absN % 2 === 1) {
      return sign * (absN * size + (size - pos));
    } else {
      return sign * (absN * size + pos);
    }
  }

  /** 生成混响尾（指数衰减噪声 + 动态低通模拟空气吸收） */
  private generateLateReverb(room: RoomAcoustics, rt60: number, ir: Float32Array): void {
    const lateStart: number = Math.floor(0.08 * this.sampleRate);
    const length: number = ir.length;
    if (lateStart >= length) return;

    const decayPerSample: number = Math.pow(10.0, -3.0 / (rt60 * this.sampleRate));
    const densityFactor: number = Math.max(1, Math.floor(Math.sqrt(room.volume) / 5.0));
    const lowpass: DynamicLowpass = new DynamicLowpass();

    let envelope: number = 1.0;
    let noise: number = 0.0;

    for (let i: number = lateStart; i < length; i++) {
      const t: number = (i - lateStart) / this.sampleRate;
      envelope *= decayPerSample;

      // 密度控制：大房间密度低，小房间密度高
      if ((i - lateStart) % densityFactor === 0) {
        noise = Math.random() * 2.0 - 1.0;
      }

      // 空气吸收：随传播距离增加降低低通截止频率
      const distance: number = t * 343.0;
      const cutoffHz: number = Math.max(800.0, 20000.0 * Math.exp(-distance * 0.002));

      const sample: number = lowpass.process(noise * envelope, cutoffHz, this.sampleRate);
      ir[i] += sample;
    }
  }

  /** 早期反射与混响尾交叉淡化（60-100ms 区域） */
  private applyCrossfade(ir: Float32Array): void {
    const crossStart: number = Math.floor(0.06 * this.sampleRate);
    const crossEnd: number = Math.floor(0.10 * this.sampleRate);
    const length: number = ir.length;

    if (crossStart >= length) return;

    const early: Float32Array = ir.slice();
    const late: Float32Array = ir.slice();
    const earlyEnd: number = Math.floor(0.08 * this.sampleRate);

    for (let i: number = 0; i < length; i++) {
      if (i > earlyEnd) early[i] = 0.0;
      if (i < crossStart) late[i] = 0.0;
    }

    for (let i: number = 0; i < crossStart; i++) {
      ir[i] = early[i];
    }

    for (let i: number = crossStart; i < Math.min(crossEnd, length); i++) {
      const alpha: number = (i - crossStart) / (crossEnd - crossStart);
      ir[i] = early[i] * (1.0 - alpha) + late[i] * alpha;
    }
  }

  /** 归一化脉冲响应 */
  private normalize(buffer: Float32Array): void {
    let maxVal: number = 0.0;
    for (let i: number = 0; i < buffer.length; i++) {
      maxVal = Math.max(maxVal, Math.abs(buffer[i]));
    }
    if (maxVal > 1e-10) {
      const scale: number = 1.0 / maxVal;
      for (let i: number = 0; i < buffer.length; i++) {
        buffer[i] *= scale;
      }
    }
  }

  /** 快速应用预设空间 */
  public applyPreset(input: Float32Array, preset: string): Float32Array {
    const presetData = SpatialReverbEngine.Presets[preset];
    if (!presetData) {
      return input.slice();
    }

    const ir: Float32Array = this.generateIR({
      room: presetData.room,
      source: presetData.source,
      listener: presetData.listener,
    });

    return this.convolve(input, ir);
  }

  /** 时域卷积（直接计算） */
  private convolve(input: Float32Array, ir: Float32Array): Float32Array {
    const outputLen: number = input.length + ir.length - 1;
    const output: Float32Array = new Float32Array(outputLen);
    for (let k: number = 0; k < ir.length; k++) {
      const hk: number = ir[k];
      for (let n: number = 0; n < input.length; n++) {
        output[n + k] += input[n] * hk;
      }
    }
    return output;
  }

  /**
   * 3D 空间定位：根据声源和听者位置计算双耳延迟和强度差
   * 简化 HRTF 模型：ITD + ILD + 头部遮挡
   */
  public apply3DPositioning(
    input: Float32Array,
    source: SourcePosition,
    listener: ListenerPosition
  ): { left: Float32Array; right: Float32Array } {
    // 默认房间尺寸用于相对位置计算
    const roomWidth: number = 10.0;
    const roomLength: number = 10.0;
    const roomHeight: number = 3.0;

    const sx: number = source.x * roomWidth;
    const sy: number = source.y * roomLength;
    const sz: number = source.z * roomHeight;
    const lx: number = listener.x * roomWidth;
    const ly: number = listener.y * roomLength;
    const lz: number = listener.z * roomHeight;

    const dx: number = sx - lx;
    const dy: number = sy - ly;
    const dz: number = sz - lz;

    // 头部坐标系旋转
    const headRad: number = (listener.headAngle * Math.PI) / 180.0;
    const relX: number = dx * Math.cos(headRad) + dy * Math.sin(headRad);
    const relY: number = -dx * Math.sin(headRad) + dy * Math.cos(headRad);

    // 水平方位角（0 = 正前方 Y+，正值 = 左侧，负值 = 右侧）
    const azimuth: number = Math.atan2(-relX, relY);

    // ITD：双耳时间差，最大 ±0.63ms（对应90度）
    const itdSec: number = 0.00063 * Math.sin(azimuth);
    const itdSamples: number = Math.round(itdSec * this.sampleRate);
    const leftDelay: number = Math.max(0, -itdSamples);
    const rightDelay: number = Math.max(0, itdSamples);

    // ILD：双耳强度差，高频 1-5dB
    const ildDb: number = clamp(2.5 * Math.sin(azimuth), -5.0, 5.0);
    const leftGain: number = dbToGain(ildDb / 2.0);
    const rightGain: number = dbToGain(-ildDb / 2.0);

    // 头部遮挡：对侧耳朵高频衰减（>6kHz 衰减 2-6dB）
    const shadowDb: number = Math.min(6.0, 4.0 * Math.abs(Math.sin(azimuth)));
    const shadowGain: number = dbToGain(-shadowDb);
    const shadowFc: number = 6000.0;
    const shadowAlpha: number = 1.0 - Math.exp((-2.0 * Math.PI * shadowFc) / this.sampleRate);

    const left: Float32Array = new Float32Array(input.length);
    const right: Float32Array = new Float32Array(input.length);

    let leftShadowZ: number = 0.0;
    let rightShadowZ: number = 0.0;

    for (let i: number = 0; i < input.length; i++) {
      const li: number = i - leftDelay >= 0 ? input[i - leftDelay] : 0.0;
      const ri: number = i - rightDelay >= 0 ? input[i - rightDelay] : 0.0;

      if (azimuth > 0.0) {
        // 声源在左侧：右耳为对侧，应用头部遮挡低通+衰减
        left[i] = li * leftGain;
        rightShadowZ += shadowAlpha * (ri - rightShadowZ);
        right[i] = rightShadowZ * rightGain * shadowGain;
      } else {
        // 声源在右侧或正中：左耳为对侧
        leftShadowZ += shadowAlpha * (li - leftShadowZ);
        left[i] = leftShadowZ * leftGain * shadowGain;
        right[i] = ri * rightGain;
      }
    }

    return { left, right };
  }

  // ============================================================================
  // 预设空间（至少 10 种）
  // ============================================================================

  static Presets: Record<string, { room: RoomAcoustics; source: SourcePosition; listener: ListenerPosition }> = {
    intimate_room: {
      room: {
        volume: 3.0 * 4.0 * 2.5,
        absorption: 0.35,
        rt60: 0.3,
        shape: 'rectangular',
        width: 3.0,
        length: 4.0,
        height: 2.5,
      },
      source: { x: 0.3, y: 0.4, z: 0.5 },
      listener: { x: 0.6, y: 0.7, z: 0.5, headAngle: 0.0 },
    },
    living_room: {
      room: {
        volume: 5.0 * 6.0 * 2.8,
        absorption: 0.45,
        rt60: 0.6,
        shape: 'rectangular',
        width: 5.0,
        length: 6.0,
        height: 2.8,
      },
      source: { x: 0.4, y: 0.5, z: 0.5 },
      listener: { x: 0.6, y: 0.4, z: 0.5, headAngle: 0.0 },
    },
    concert_hall: {
      room: {
        volume: 30.0 * 40.0 * 15.0,
        absorption: 0.25,
        rt60: 2.2,
        shape: 'shoebox',
        width: 30.0,
        length: 40.0,
        height: 15.0,
      },
      source: { x: 0.5, y: 0.2, z: 0.3 },
      listener: { x: 0.5, y: 0.6, z: 0.3, headAngle: 0.0 },
    },
    cathedral: {
      room: {
        volume: 20.0 * 50.0 * 25.0,
        absorption: 0.15,
        rt60: 4.0,
        shape: 'cathedral',
        width: 20.0,
        length: 50.0,
        height: 25.0,
      },
      source: { x: 0.5, y: 0.3, z: 0.2 },
      listener: { x: 0.5, y: 0.7, z: 0.2, headAngle: 0.0 },
    },
    bathroom: {
      room: {
        volume: 2.0 * 2.0 * 2.5,
        absorption: 0.1,
        rt60: 1.5,
        shape: 'rectangular',
        width: 2.0,
        length: 2.0,
        height: 2.5,
      },
      source: { x: 0.3, y: 0.3, z: 0.5 },
      listener: { x: 0.7, y: 0.7, z: 0.5, headAngle: 0.0 },
    },
    arena: {
      room: {
        volume: 80.0 * 100.0 * 30.0,
        absorption: 0.3,
        rt60: 3.5,
        shape: 'cylindrical',
        width: 80.0,
        length: 100.0,
        height: 30.0,
      },
      source: { x: 0.5, y: 0.5, z: 0.2 },
      listener: { x: 0.5, y: 0.6, z: 0.2, headAngle: 0.0 },
    },
    forest: {
      room: {
        volume: 10000.0,
        absorption: 0.95,
        rt60: 0.1,
        shape: 'dome',
        width: 100.0,
        length: 100.0,
        height: 50.0,
      },
      source: { x: 0.5, y: 0.5, z: 0.5 },
      listener: { x: 0.51, y: 0.5, z: 0.5, headAngle: 0.0 },
    },
    cave: {
      room: {
        volume: 50.0 * 80.0 * 20.0,
        absorption: 0.2,
        rt60: 5.0,
        shape: 'dome',
        width: 50.0,
        length: 80.0,
        height: 20.0,
      },
      source: { x: 0.4, y: 0.4, z: 0.3 },
      listener: { x: 0.6, y: 0.6, z: 0.3, headAngle: 0.0 },
    },
    stage: {
      room: {
        volume: 15.0 * 20.0 * 10.0,
        absorption: 0.3,
        rt60: 1.2,
        shape: 'rectangular',
        width: 15.0,
        length: 20.0,
        height: 10.0,
      },
      source: { x: 0.5, y: 0.2, z: 0.5 },
      listener: { x: 0.5, y: 0.5, z: 0.5, headAngle: 0.0 },
    },
    vocal_booth: {
      room: {
        volume: 2.0 * 2.0 * 2.2,
        absorption: 0.7,
        rt60: 0.15,
        shape: 'rectangular',
        width: 2.0,
        length: 2.0,
        height: 2.2,
      },
      source: { x: 0.5, y: 0.5, z: 0.5 },
      listener: { x: 0.5, y: 0.6, z: 0.5, headAngle: 0.0 },
    },
  };
}

// ============================================================================
// 便捷函数
// ============================================================================

/** 应用大教堂混响 */
export function applyCathedralReverb(input: Float32Array, sampleRate: number): Float32Array {
  const engine: SpatialReverbEngine = new SpatialReverbEngine(sampleRate);
  return engine.applyPreset(input, 'cathedral');
}

/** 应用录音室混响 */
export function applyStudioReverb(input: Float32Array, sampleRate: number): Float32Array {
  const engine: SpatialReverbEngine = new SpatialReverbEngine(sampleRate);
  return engine.applyPreset(input, 'intimate_room');
}

/** 应用亲密小房间混响 */
export function applyIntimateRoom(input: Float32Array, sampleRate: number): Float32Array {
  const engine: SpatialReverbEngine = new SpatialReverbEngine(sampleRate);
  return engine.applyPreset(input, 'intimate_room');
}
