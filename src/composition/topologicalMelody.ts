/**
 * =============================================================================
 * 拓扑旋律流形引擎 (Topological Melody Manifold Engine)
 * =============================================================================
 * 将旋律视为在抽象音乐流形 MelodyManifold 上的测地线运动。
 * 流形上的每个点是 (pitch, time, tension, brightness) 四维坐标。
 * 作曲 = 在流形上寻找从起点到终点的测地线路径（能量最小路径）。
 * 转调 = 坐标变换（微分同胚）。
 * 纯 TypeScript 实现，零外部依赖，采样率 44100 Hz。
 * =============================================================================
 */

const SAMPLE_RATE = 44100;

// ============================================================
// 第一部分：核心接口
// ============================================================

export interface ManifoldPoint {
  /** MIDI note 或连续音高 */
  pitch: number;
  /** 时间坐标 */
  time: number;
  /** 和声张力 0-1 */
  tension: number;
  /** 亮度/泛音丰富度 0-1 */
  brightness: number;
}

export interface MetricTensor {
  /** 4x4 度量张量，定义流形上的距离 */
  g: number[][];
  /** 在给定点计算局部度量 */
  at(point: ManifoldPoint): number[][];
}

// ============================================================
// 第二部分：矩阵与数学工具
// ============================================================

/** 4x4 单位矩阵 */
function mat4Identity(): number[][] {
  return [
    [1, 0, 0, 0],
    [0, 1, 0, 0],
    [0, 0, 1, 0],
    [0, 0, 0, 1],
  ];
}

/** 深拷贝 4x4 矩阵 */
function cloneMat4(m: number[][]): number[][] {
  return m.map(row => [...row]);
}

/** 4x4 矩阵求逆（高斯-约旦消元法） */
function invertMat4(m: number[][]): number[][] {
  const n = 4;
  const a: number[][] = [];
  for (let i = 0; i < n; i++) {
    const identityRow = i === 0 ? [1, 0, 0, 0] : i === 1 ? [0, 1, 0, 0] : i === 2 ? [0, 0, 1, 0] : [0, 0, 0, 1];
    a[i] = [...m[i], ...identityRow];
  }

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) {
        pivot = row;
      }
    }
    if (Math.abs(a[pivot][col]) < 1e-12) {
      throw new Error('Singular metric tensor: cannot invert');
    }
    [a[col], a[pivot]] = [a[pivot], a[col]];

    const div = a[col][col];
    for (let j = 0; j < 2 * n; j++) {
      a[col][j] /= div;
    }

    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = a[row][col];
      if (Math.abs(factor) > 1e-12) {
        for (let j = 0; j < 2 * n; j++) {
          a[row][j] -= factor * a[col][j];
        }
      }
    }
  }

  return a.map(row => row.slice(n));
}

/** 4x4 矩阵乘以 4 维向量 */
function mat4VecMul(m: number[][], v: number[]): number[] {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2] + m[0][3] * v[3],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2] + m[1][3] * v[3],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2] + m[2][3] * v[3],
    m[3][0] * v[0] + m[3][1] * v[1] + m[3][2] * v[2] + m[3][3] * v[3],
  ];
}

/** 数值裁剪到 [0,1] */
function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** 数值裁剪到合法 MIDI 范围并四舍五入 */
function clampMidi(v: number): number {
  return Math.max(0, Math.min(127, Math.round(v)));
}

// ============================================================
// 第三部分：音阶与音高工具
// ============================================================

/** 自然大调音阶（半音偏移） */
const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];

/** 自然小调音阶（半音偏移） */
const NATURAL_MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];

/** 大调五声音阶（半音偏移） */
const PENTATONIC_SCALE = [0, 2, 4, 7, 9];

/** 归一化 pitch class 到 0-11 */
function normalizePitchClass(p: number): number {
  let pc = p % 12;
  if (pc < 0) pc += 12;
  return pc;
}

/** 判断音高是否在当前音阶内 */
function isPitchInScale(pitch: number, scale: number[]): boolean {
  return scale.includes(normalizePitchClass(pitch));
}

/** 找到最近的音阶音（保持八度） */
function nearestScaleTone(pitch: number, scale: number[]): number {
  const octave = Math.floor(pitch / 12);
  const pc = normalizePitchClass(pitch);
  let best = scale[0];
  let bestDist = Infinity;

  for (const s of scale) {
    for (const candidate of [s - 12, s, s + 12]) {
      const dist = Math.abs(candidate - pc);
      if (dist < bestDist) {
        bestDist = dist;
        best = candidate;
      }
    }
  }

  return octave * 12 + best;
}

// ============================================================
// 第四部分：度量张量实现
// ============================================================

class ScaleAwareMetricTensor implements MetricTensor {
  g: number[][];
  private baseScale: number[];
  private metricType: 'major' | 'minor' | 'pentatonic';

  constructor(
    baseG: number[][],
    scale: number[],
    type: 'major' | 'minor' | 'pentatonic'
  ) {
    this.g = cloneMat4(baseG);
    this.baseScale = [...scale];
    this.metricType = type;
  }

  at(point: ManifoldPoint): number[][] {
    const result = cloneMat4(this.g);
    const pc = normalizePitchClass(point.pitch);
    const inScale = this.baseScale.includes(pc);

    // 音高惩罚：音阶外音高距离更远（g_11 惩罚项）
    if (!inScale) {
      result[0][0] *= 3.0;
    }

    // 小调特性：小三度（3）、小六度（8）更"近"
    if (this.metricType === 'minor') {
      if (pc === 3 || pc === 8) {
        result[0][0] *= 0.7;
      }
    }

    // 五声特性：非五声音惩罚更重
    if (this.metricType === 'pentatonic' && !inScale) {
      result[0][0] *= 1.5;
    }

    // 局部耦合：pitch 与 tension 的微弱关联，增加流形"形状"
    const coupling = 0.05 * Math.sin(point.pitch * 0.1 + point.time * 0.5);
    result[0][2] += coupling;
    result[2][0] = result[0][2];

    return result;
  }
}

/** 生成大调度量：音阶内音高距离 1，音阶外 3 */
export function createMajorMetric(): MetricTensor {
  const g = mat4Identity();
  g[0][0] = 1.0; // pitch: 标准权重
  g[1][1] = 0.5; // time: 时间权重较低（旋律主要关注音高进行）
  g[2][2] = 2.0; // tension: 张力变化较"贵"
  g[3][3] = 1.5; // brightness: 亮度中等权重
  return new ScaleAwareMetricTensor(g, MAJOR_SCALE, 'major');
}

/** 生成小调度量：小三度更"近" */
export function createMinorMetric(): MetricTensor {
  const g = mat4Identity();
  g[0][0] = 1.0;
  g[1][1] = 0.5;
  g[2][2] = 2.0;
  g[3][3] = 1.5;
  return new ScaleAwareMetricTensor(g, NATURAL_MINOR_SCALE, 'minor');
}

/** 生成五声度量：只有 5 个音是"近"的 */
export function createPentatonicMetric(): MetricTensor {
  const g = mat4Identity();
  g[0][0] = 1.0;
  g[1][1] = 0.5;
  g[2][2] = 2.0;
  g[3][3] = 1.5;
  return new ScaleAwareMetricTensor(g, PENTATONIC_SCALE, 'pentatonic');
}

// ============================================================
// 第五部分：MelodyManifold 流形
// ============================================================

export class MelodyManifold {
  keyRoot: number;
  scale: number[];
  curvature: number;
  metric: MetricTensor;

  constructor(params?: {
    keyRoot?: number;
    scale?: number[];
    curvature?: number;
  }) {
    this.keyRoot = params?.keyRoot ?? 60; // 默认 C4
    this.scale = params?.scale ? [...params.scale] : [...MAJOR_SCALE];
    this.curvature = params?.curvature ?? 0.5;
    this.metric = createMajorMetric();
  }

  /** 计算局部距离平方 ds² = g_ij dx^i dx^j */
  private _localDistanceSq(a: ManifoldPoint, b: ManifoldPoint): number {
    const dp = [
      b.pitch - a.pitch,
      b.time - a.time,
      b.tension - a.tension,
      b.brightness - a.brightness,
    ];
    const g = this.metric.at(a);
    let ds2 = 0;
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        ds2 += g[i][j] * dp[i] * dp[j];
      }
    }
    return Math.max(0, ds2);
  }

  /** 计算两个点之间的测地线距离 */
  geodesicDistance(a: ManifoldPoint, b: ManifoldPoint): number {
    const path = this.computeGeodesic(a, b, 8);
    let dist = 0;
    for (let i = 1; i < path.length; i++) {
      dist += Math.sqrt(this._localDistanceSq(path[i - 1], path[i]));
    }
    return dist;
  }

  /**
   * 计算从 a 到 b 的测地线路径（能量最小路径）
   * 使用离散变分法 + 梯度下降优化
   * Christoffel 符号效应通过度量差分的有限差分近似隐式体现
   */
  computeGeodesic(a: ManifoldPoint, b: ManifoldPoint, steps: number = 16): ManifoldPoint[] {
    const path: ManifoldPoint[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      path.push({
        pitch: a.pitch + t * (b.pitch - a.pitch),
        time: a.time + t * (b.time - a.time),
        tension: a.tension + t * (b.tension - a.tension),
        brightness: a.brightness + t * (b.brightness - a.brightness),
      });
    }

    // 曲率影响：高曲率引入初始正弦弯曲，使旋律更迂回、意外跳跃多
    if (this.curvature > 0.01) {
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        const bend = this.curvature * Math.sin(t * Math.PI) * 3.0;
        path[i].pitch += bend;
        path[i].tension += this.curvature * Math.sin(t * Math.PI * 2) * 0.05;
        path[i].brightness += this.curvature * Math.cos(t * Math.PI * 1.5) * 0.05;
      }
    }

    // 梯度下降优化：最小化路径能量
    const lr = 0.06;
    const smoothWeight = 0.03; // 固定小权重，保证路径数值稳定

    for (let iter = 0; iter < 80; iter++) {
      for (let i = 1; i < steps; i++) {
        const grad = this._computePathGradient(path, i, smoothWeight);
        path[i].pitch -= lr * grad[0];
        path[i].time -= lr * grad[1];
        path[i].tension -= lr * grad[2];
        path[i].brightness -= lr * grad[3];
      }
    }

    return path;
  }

  /** 计算能量泛函对 path[i] 的梯度 */
  private _computePathGradient(
    path: ManifoldPoint[],
    i: number,
    smoothWeight: number
  ): number[] {
    const prev = path[i - 1];
    const curr = path[i];
    const next = path[i + 1];

    const gPrev = this.metric.at(prev);
    const gCurr = this.metric.at(curr);

    const grad = [0, 0, 0, 0];

    // 第一段能量梯度：d/dcurr [gPrev(dp1, dp1)] = 2 * gPrev * dp1
    const dp1 = [
      curr.pitch - prev.pitch,
      curr.time - prev.time,
      curr.tension - prev.tension,
      curr.brightness - prev.brightness,
    ];
    for (let l = 0; l < 4; l++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        sum += gPrev[l][k] * dp1[k];
      }
      grad[l] += 2 * sum;
    }

    // 第二段能量梯度：d/dcurr [gCurr(dp2, dp2)] ≈ -2 * gCurr * dp2
    const dp2 = [
      next.pitch - curr.pitch,
      next.time - curr.time,
      next.tension - curr.tension,
      next.brightness - curr.brightness,
    ];
    for (let l = 0; l < 4; l++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        sum += gCurr[l][k] * dp2[k];
      }
      grad[l] -= 2 * sum;
    }

    // 平滑正则化（离散曲率惩罚），保证数值稳定
    grad[0] += smoothWeight * 4 * (2 * curr.pitch - prev.pitch - next.pitch);
    grad[1] += smoothWeight * 4 * (2 * curr.time - prev.time - next.time);
    grad[2] += smoothWeight * 4 * (2 * curr.tension - prev.tension - next.tension);
    grad[3] += smoothWeight * 4 * (2 * curr.brightness - prev.brightness - next.brightness);

    return grad;
  }

  /**
   * 坐标变换（转调）：将点映射到新的调性坐标系
   * 支持微分同胚：可加入非线性扭曲函数（sin/cos 映射）
   */
  transpose(point: ManifoldPoint, newRoot: number, newScale?: number[]): ManifoldPoint {
    const oldRoot = this.keyRoot;
    const interval = newRoot - oldRoot;

    // 线性平移 + 非线性微分同胚扭曲
    const warp = 0.2 * Math.sin((point.pitch - oldRoot) * Math.PI / 6);
    const transposed: ManifoldPoint = {
      pitch: point.pitch + interval + warp,
      time: point.time,
      tension: point.tension,
      brightness: point.brightness,
    };

    // 更新流形调性
    if (newScale) {
      this.scale = [...newScale];
    }
    this.keyRoot = newRoot;

    return transposed;
  }

  /** 在局部邻域内寻找"最音乐"的点（符合音阶/和弦约束） */
  projectToMusical(point: ManifoldPoint): ManifoldPoint {
    const projPitch = clampMidi(nearestScaleTone(point.pitch, this.scale));
    return {
      pitch: projPitch,
      time: point.time,
      tension: clamp01(point.tension),
      brightness: clamp01(point.brightness),
    };
  }

  /** 计算流形的 Ricci 曲率标量（简化为局部密度度量） */
  computeCurvature(point: ManifoldPoint): number {
    const pc = normalizePitchClass(point.pitch);
    let scaleDensity = 0;
    for (const s of this.scale) {
      const circularDist = Math.abs(((s - pc + 6) % 12 + 12) % 12 - 6);
      if (circularDist <= 2) scaleDensity += 1;
    }
    const tensionFactor = 1 + 2 * clamp01(point.tension);
    return this.curvature * scaleDensity * tensionFactor;
  }
}

// ============================================================
// 第六部分：GeodesicComposer 作曲引擎
// ============================================================

export class GeodesicComposer {
  private manifold: MelodyManifold;

  constructor(manifold: MelodyManifold) {
    this.manifold = manifold;
  }

  /**
   * 核心作曲方法：给定起点和终点，生成旋律
   * 将测地线路径点转换为音符事件
   */
  compose(params: {
    start: ManifoldPoint;
    end: ManifoldPoint;
    bpm: number;
    steps?: number;
    phraseCount?: number;
  }): Array<{
    midi: number;
    startTime: number;
    duration: number;
    velocity: number;
  }> {
    const steps = params.steps ?? 16;
    const phraseCount = Math.max(1, params.phraseCount ?? 1);
    const stepDuration = (60 / params.bpm) / 4; // 每步一个十六分音符

    const path = this.manifold.computeGeodesic(params.start, params.end, steps);
    const notesPerPhrase = Math.floor(steps / phraseCount);

    const notes: Array<{
      midi: number;
      startTime: number;
      duration: number;
      velocity: number;
    }> = [];

    for (let p = 0; p < phraseCount; p++) {
      const startIdx = p * notesPerPhrase;
      const endIdx = p === phraseCount - 1 ? steps : (p + 1) * notesPerPhrase;

      for (let i = startIdx; i < endIdx; i++) {
        const point = path[i];
        const proj = this.manifold.projectToMusical(point);

        // brightness -> 音符密度/时长（亮度高 → 短促音符多）
        const duration = stepDuration * (0.2 + 0.8 * (1 - proj.brightness));
        // tension -> 力度（张力高 → 力度大）
        const velocity = clampMidi(30 + proj.tension * 97);

        notes.push({
          midi: clampMidi(proj.pitch),
          startTime: i * stepDuration,
          duration,
          velocity,
        });
      }
    }

    return notes;
  }

  /**
   * 多段作曲：经过多个途经点（如 主歌→副歌→桥段→尾声）
   * 每段之间用测地线连接，在连接处平滑过渡（tension/brightness 渐变）
   */
  composeThroughWaypoints(params: {
    waypoints: ManifoldPoint[];
    bpm: number;
    stepsPerSegment?: number;
  }): Array<{
    midi: number;
    startTime: number;
    duration: number;
    velocity: number;
  }> {
    const waypoints = params.waypoints;
    if (waypoints.length < 2) {
      return [];
    }

    const stepsPerSegment = params.stepsPerSegment ?? 16;
    const stepDuration = (60 / params.bpm) / 4;
    const allNotes: Array<{
      midi: number;
      startTime: number;
      duration: number;
      velocity: number;
    }> = [];

    let currentTime = 0;

    for (let seg = 0; seg < waypoints.length - 1; seg++) {
      const a = waypoints[seg];
      const b = waypoints[seg + 1];

      // 连接处平滑过渡：对非首段的起始 tension/brightness 做渐变
      let start = a;
      if (seg > 0) {
        const prev = waypoints[seg - 1];
        start = {
          pitch: a.pitch,
          time: a.time,
          tension: (prev.tension + a.tension) * 0.5,
          brightness: (prev.brightness + a.brightness) * 0.5,
        };
      }

      const path = this.manifold.computeGeodesic(start, b, stepsPerSegment);

      for (let i = 0; i < stepsPerSegment; i++) {
        const point = path[i];
        const proj = this.manifold.projectToMusical(point);

        const duration = stepDuration * (0.2 + 0.8 * (1 - proj.brightness));
        const velocity = clampMidi(30 + proj.tension * 97);

        allNotes.push({
          midi: clampMidi(proj.pitch),
          startTime: currentTime + i * stepDuration,
          duration,
          velocity,
        });
      }

      currentTime += stepsPerSegment * stepDuration;
    }

    return allNotes;
  }
}

// ============================================================
// 第七部分：高层 API
// ============================================================

export function composeTopologicalMelody(params: {
  keyRoot?: number;
  scale?: number[];
  startTension?: number;
  endTension?: number;
  startBrightness?: number;
  endBrightness?: number;
  bpm?: number;
  barCount?: number;
  curvature?: number;
}): Array<{
  midi: number;
  startTime: number;
  duration: number;
  velocity: number;
}> {
  const keyRoot = params.keyRoot ?? 60;
  const scale = params.scale ?? [...MAJOR_SCALE];
  const startTension = clamp01(params.startTension ?? 0.3);
  const endTension = clamp01(params.endTension ?? 0.7);
  const startBrightness = clamp01(params.startBrightness ?? 0.5);
  const endBrightness = clamp01(params.endBrightness ?? 0.5);
  const bpm = params.bpm ?? 120;
  const barCount = Math.max(1, params.barCount ?? 2);
  const curvature = params.curvature ?? 0.5;

  const manifold = new MelodyManifold({ keyRoot, scale, curvature });
  const composer = new GeodesicComposer(manifold);

  const start: ManifoldPoint = {
    pitch: keyRoot,
    time: 0,
    tension: startTension,
    brightness: startBrightness,
  };

  const end: ManifoldPoint = {
    pitch: keyRoot + 7, // 上行五度作为旋律走向
    time: barCount * 4,
    tension: endTension,
    brightness: endBrightness,
  };

  return composer.compose({
    start,
    end,
    bpm,
    steps: barCount * 16,
    phraseCount: barCount,
  });
}
