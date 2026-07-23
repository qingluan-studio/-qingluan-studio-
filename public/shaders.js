/**
 * ============================================================================
 * 青鸾数字音频工作站 - WebGL 着色器集合 (QingluanShaders)
 * ============================================================================
 * 本模块提供多种音频驱动的可视化着色器效果，全部使用原生 WebGL API，
 * 不依赖 Three.js 等第三方库。包含频谱瀑布、波形流体、粒子系统、
 * 3D分形、音频地形、神经网络、星系螺旋、流体动力学、矩阵雨、
 * 音频火焰、极光、水面波纹与全息投影等效果。
 *
 * 核心导出：
 *   - QingluanShaders   : 着色器工厂对象
 *   - ShaderProgram     : 着色器程序管理类
 *   - AudioToShaderBridge : 音频数据到着色器 uniform 的桥接类
 * ============================================================================
 */

// ============================================================================
// ShaderProgram 类 - 着色器程序管理
// ============================================================================

/**
 * ShaderProgram 封装了 WebGL 着色器的编译、链接、使用、uniform 传递与资源清理。
 * 每个可视化效果对应一个 ShaderProgram 实例。
 */
export class ShaderProgram {
  /** WebGL 上下文 */
  gl;
  /** 链接后的程序对象 */
  program;
  /** uniform 位置缓存 */
  uniforms = new Map();
  /** attribute 位置缓存 */
  attributes = new Map();

  /**
   * @param {WebGLRenderingContext | WebGL2RenderingContext} gl - WebGL 上下文
   * @param {string} vsSource - 顶点着色器源码
   * @param {string} fsSource - 片元着色器源码
   */
  constructor(gl, vsSource, fsSource) {
    this.gl = gl;
    const vs = this._compileShader(gl.VERTEX_SHADER, vsSource);
    const fs = this._compileShader(gl.FRAGMENT_SHADER, fsSource);
    this.program = gl.createProgram();
    gl.attachShader(this.program, vs);
    gl.attachShader(this.program, fs);
    gl.linkProgram(this.program);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      console.error('ShaderProgram 链接失败:', gl.getProgramInfoLog(this.program));
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
  }

  /** 编译单个着色器 */
  _compileShader(type, source) {
    const shader = this.gl.createShader(type);
    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);
    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      console.error('Shader 编译失败:', this.gl.getShaderInfoLog(shader));
      console.error('源码:\n', source);
    }
    return shader;
  }

  /** 激活当前程序 */
  use() {
    this.gl.useProgram(this.program);
  }

  /** 获取并缓存 uniform 位置 */
  getUniformLocation(name) {
    if (!this.uniforms.has(name)) {
      this.uniforms.set(name, this.gl.getUniformLocation(this.program, name));
    }
    return this.uniforms.get(name);
  }

  /** 获取并缓存 attribute 位置 */
  getAttribLocation(name) {
    if (!this.attributes.has(name)) {
      this.attributes.set(name, this.gl.getAttribLocation(this.program, name));
    }
    return this.attributes.get(name);
  }

  /** 设置 float uniform */
  setFloat(name, value) {
    const loc = this.getUniformLocation(name);
    if (loc !== null) this.gl.uniform1f(loc, value);
  }

  /** 设置 int uniform */
  setInt(name, value) {
    const loc = this.getUniformLocation(name);
    if (loc !== null) this.gl.uniform1i(loc, value);
  }

  /** 设置 vec2 uniform */
  setVec2(name, x, y) {
    const loc = this.getUniformLocation(name);
    if (loc !== null) this.gl.uniform2f(loc, x, y);
  }

  /** 设置 vec3 uniform */
  setVec3(name, x, y, z) {
    const loc = this.getUniformLocation(name);
    if (loc !== null) this.gl.uniform3f(loc, x, y, z);
  }

  /** 设置 vec4 uniform */
  setVec4(name, x, y, z, w) {
    const loc = this.getUniformLocation(name);
    if (loc !== null) this.gl.uniform4f(loc, x, y, z, w);
  }

  /** 设置 mat4 uniform */
  setMat4(name, matrix) {
    const loc = this.getUniformLocation(name);
    if (loc !== null) this.gl.uniformMatrix4fv(loc, false, matrix);
  }

  /** 设置 float 数组 uniform */
  setFloatArray(name, arr) {
    const loc = this.getUniformLocation(name);
    if (loc !== null) {
      if (arr.length <= 4) this.gl['uniform' + arr.length + 'fv'](loc, arr);
      else this.gl.uniform1fv(loc, arr);
    }
  }

  /** 清理资源 */
  destroy() {
    this.gl.deleteProgram(this.program);
    this.uniforms.clear();
    this.attributes.clear();
  }
}

// ============================================================================
// AudioToShaderBridge 类 - 音频数据桥接
// ============================================================================

/**
 * AudioToShaderBridge 负责将 Web Audio API 分析器节点的数据
 * （FFT频谱、波形、BPM等）转换为着色器可用的 uniform 数据。
 */
export class AudioToShaderBridge {
  /** FFT 频谱数据（dB 转线性增益后归一化） */
  fftData = new Float32Array(128);
  /** 时域波形数据 */
  waveformData = new Float32Array(128);
  /** 低频能量 */
  bassEnergy = 0;
  /** 中频能量 */
  midEnergy = 0;
  /** 高频能量 */
  trebleEnergy = 0;
  /** 整体响度 */
  loudness = 0;
  /** 检测到的 BPM */
  bpm = 120;
  /** 节拍相位 0-1 */
  beatPhase = 0;

  /**
   * 从 AnalyserNode 更新数据
   * @param {AnalyserNode} analyser - Web Audio 分析器节点
   * @param {number} dt - 时间增量（秒）
   */
  update(analyser, dt) {
    const fftSize = analyser.frequencyBinCount;
    if (this.fftData.length !== fftSize) {
      this.fftData = new Float32Array(fftSize);
      this.waveformData = new Float32Array(fftSize);
    }
    analyser.getFloatFrequencyData(this.fftData);
    analyser.getFloatTimeDomainData(this.waveformData);

    // 将 FFT dB 数据转为 0-1 范围
    for (let i = 0; i < fftSize; i++) {
      this.fftData[i] = Math.max(0, (this.fftData[i] + 100) / 100);
    }

    // 计算频段能量
    const bassEnd = Math.floor(fftSize * 0.1);
    const midEnd = Math.floor(fftSize * 0.5);
    this.bassEnergy = 0; this.midEnergy = 0; this.trebleEnergy = 0;
    for (let i = 0; i < bassEnd; i++) this.bassEnergy += this.fftData[i];
    for (let i = bassEnd; i < midEnd; i++) this.midEnergy += this.fftData[i];
    for (let i = midEnd; i < fftSize; i++) this.trebleEnergy += this.fftData[i];
    this.bassEnergy /= bassEnd; this.midEnergy /= (midEnd - bassEnd); this.trebleEnergy /= (fftSize - midEnd);
    this.loudness = (this.bassEnergy + this.midEnergy + this.trebleEnergy) / 3;

    // 简单 BPM 相位模拟
    this.beatPhase += this.bpm / 60 * dt;
    this.beatPhase -= Math.floor(this.beatPhase);
  }

  /** 将数据传递给 ShaderProgram 的 uniform */
  bindToShader(shaderProgram, prefix = 'u_audio') {
    shaderProgram.setFloat(`${prefix}_bass`, this.bassEnergy);
    shaderProgram.setFloat(`${prefix}_mid`, this.midEnergy);
    shaderProgram.setFloat(`${prefix}_treble`, this.trebleEnergy);
    shaderProgram.setFloat(`${prefix}_loudness`, this.loudness);
    shaderProgram.setFloat(`${prefix}_bpm`, this.bpm);
    shaderProgram.setFloat(`${prefix}_beatPhase`, this.beatPhase);
  }
}

// ============================================================================
// QingluanShaders - 着色器工厂对象
// ============================================================================

/**
 * QingluanShaders 提供所有可视化效果的着色器创建函数。
 * 每个函数返回一个配置好的 ShaderProgram 实例。
 */
export const QingluanShaders = {
  /**
   * 初始化 WebGL 上下文，优先使用 WebGL2，回退到 WebGL1
   * @param {HTMLCanvasElement} canvas - 画布元素
   * @returns {WebGLRenderingContext | WebGL2RenderingContext | null}
   */
  initWebGL(canvas) {
    let gl = canvas.getContext('webgl2', { alpha: false, antialias: false, premultipliedAlpha: false });
    if (!gl) {
      gl = canvas.getContext('webgl', { alpha: false, antialias: false, premultipliedAlpha: false }) ||
           canvas.getContext('experimental-webgl', { alpha: false, antialias: false, premultipliedAlpha: false });
    }
    if (!gl) {
      console.error('WebGL 不受支持');
      return null;
    }
    return gl;
  },

  /**
   * 通用全屏四边形顶点着色器（大部分效果共用）
   * 直接输出覆盖整个屏幕的三角形带，v_uv 为 0-1 的纹理坐标
   */
  getCommonVertexShader() {
    return `
      attribute vec2 a_position;
      varying vec2 v_uv;
      void main() {
        v_uv = a_position * 0.5 + 0.5;
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `;
  },

  /**
   * 创建 3D 频谱瀑布着色器
   * 将 FFT 数据映射为柱状频谱，加入深度与历史轨迹形成瀑布效果
   */
  createSpectrumShader(gl, fftData) {
    const vs = `
      attribute vec2 a_position;
      varying vec2 v_uv;
      void main() {
        v_uv = a_position * 0.5 + 0.5;
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `;
    const fs = `
      precision highp float;
      varying vec2 v_uv;
      uniform float u_time;
      uniform vec2 u_resolution;
      uniform float u_fft[128];
      uniform float u_audio_loudness;
      uniform float u_audio_bass;

      // 获取插值后的频谱值
      float getFFT(float x) {
        float idx = x * 127.0;
        int i = int(idx);
        int j = min(i + 1, 127);
        float f = fract(idx);
        return mix(u_fft[i], u_fft[j], f);
      }

      // 色相旋转
      vec3 hsv2rgb(vec3 c) {
        vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
        vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
        return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
      }

      void main() {
        vec2 uv = v_uv;
        // 反转 Y 使频谱从底部生长
        float y = 1.0 - uv.y;
        // X 轴对数缩放，更适合人耳听感
        float logX = log(1.0 + uv.x * 9.0) / log(10.0);
        float fftVal = getFFT(logX);
        // 添加历史层效果：Y 越高，时间越早
        float history = sin(uv.y * 20.0 + u_time * 2.0) * 0.02;
        fftVal += history * (1.0 - uv.y);
        // 柱状边界
        float barWidth = 0.008;
        float barX = fract(logX * 40.0);
        float barMask = smoothstep(barWidth, barWidth * 0.3, abs(barX - 0.5) * 2.0);
        // 高度判定
        float heightMask = smoothstep(fftVal + 0.01, fftVal - 0.01, y);
        // 颜色：低频红，高频紫
        vec3 color = hsv2rgb(vec3(logX * 0.8 + u_time * 0.05, 0.8, 1.0));
        // 音频响应亮度
        color *= 0.5 + u_audio_loudness * 1.5;
        // 底部低音增强光晕
        float glow = exp(-abs(y - u_audio_bass) * 8.0) * u_audio_bass;
        color += vec3(0.2, 0.4, 0.8) * glow;
        // 背景星空
        float stars = step(0.998, sin(uv.x * 137.0 + uv.y * 241.0 + u_time));
        color += vec3(stars) * 0.3;
        float alpha = heightMask * barMask + glow * 0.3;
        gl_FragColor = vec4(color * alpha, 1.0);
      }
    `;
    const prog = new ShaderProgram(gl, vs, fs);
    // 初始化全屏四边形顶点缓冲
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = prog.getAttribLocation('a_position');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    return prog;
  },

  /**
   * 创建波形流体着色器
   * 将时域波形数据映射为流体扭曲效果，模拟液体表面波动
   */
  createWaveformShader(gl, waveformData) {
    const vs = QingluanShaders.getCommonVertexShader();
    const fs = `
      precision highp float;
      varying vec2 v_uv;
      uniform float u_time;
      uniform vec2 u_resolution;
      uniform float u_waveform[128];
      uniform float u_audio_bass;
      uniform float u_audio_mid;

      float getWaveform(float x) {
        float idx = x * 127.0;
        int i = int(idx);
        int j = min(i + 1, 127);
        float f = fract(idx);
        float arrI = 0.0; float arrJ = 0.0;
        // 手动数组访问（WebGL1 兼容）
        for (int k = 0; k < 128; k++) {
          if (k == i) arrI = u_waveform[k];
          if (k == j) arrJ = u_waveform[k];
        }
        return mix(arrI, arrJ, f);
      }

      void main() {
        vec2 uv = v_uv;
        // 流体扭曲：用波形数据扰动 UV
        float wave = getWaveform(uv.x);
        vec2 distortedUV = uv + vec2(
          wave * 0.05 * (1.0 + u_audio_bass),
          sin(uv.x * 10.0 + u_time + wave * 5.0) * 0.02 * (1.0 + u_audio_mid)
        );
        // 绘制网格背景
        vec2 grid = abs(fract(distortedUV * 20.0) - 0.5);
        float line = smoothstep(0.02, 0.0, min(grid.x, grid.y));
        // 流体颜色：蓝青渐变
        vec3 baseColor = mix(vec3(0.0, 0.1, 0.3), vec3(0.0, 0.6, 0.8), distortedUV.y);
        // 波形高亮线
        float waveLine = smoothstep(0.015, 0.0, abs(distortedUV.y - 0.5 - wave * 0.3));
        vec3 waveColor = vec3(0.4, 0.9, 1.0) * waveLine * (1.0 + u_audio_bass * 2.0);
        // 边缘发光
        float edgeGlow = exp(-abs(distortedUV.y - 0.5) * 4.0) * u_audio_mid;
        vec3 color = baseColor * (0.3 + line * 0.2) + waveColor + vec3(0.2, 0.5, 0.9) * edgeGlow;
        gl_FragColor = vec4(color, 1.0);
      }
    `;
    const prog = new ShaderProgram(gl, vs, fs);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = prog.getAttribLocation('a_position');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    return prog;
  },

  /**
   * 创建音频驱动粒子系统着色器
   * 使用噪声函数生成大量粒子位置，音频能量控制粒子爆发与颜色
   */
  createParticleShader(gl, audioData) {
    const vs = `
      attribute vec2 a_position;
      varying vec2 v_uv;
      void main() {
        v_uv = a_position * 0.5 + 0.5;
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `;
    const fs = `
      precision highp float;
      varying vec2 v_uv;
      uniform float u_time;
      uniform vec2 u_resolution;
      uniform float u_audio_loudness;
      uniform float u_audio_bass;
      uniform float u_audio_treble;

      // 2D 旋转矩阵
      mat2 rot(float a) {
        float s = sin(a), c = cos(a);
        return mat2(c, -s, s, c);
      }

      // 伪随机
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }

      void main() {
        vec2 uv = (v_uv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0);
        vec3 color = vec3(0.0);
        // 多层粒子
        for (int i = 0; i < 5; i++) {
          float fi = float(i);
          vec2 p = uv * (2.0 + fi * 0.5);
          // 音频驱动旋转
          p = rot(u_time * (0.2 + fi * 0.1) + u_audio_bass * fi) * p;
          // 粒子格点
          vec2 id = floor(p);
          vec2 fr = fract(p) - 0.5;
          float h = hash(id + fi * 10.0);
          // 粒子大小随高音变化
          float radius = 0.03 + h * 0.04 * (1.0 + u_audio_treble);
          float d = length(fr - vec2(sin(u_time + h * 6.28), cos(u_time + h * 6.28)) * 0.3);
          float particle = smoothstep(radius, radius * 0.3, d);
          // 粒子颜色：低音偏红，高音偏青
          vec3 pColor = mix(vec3(1.0, 0.2, 0.1), vec3(0.2, 0.9, 1.0), h + u_audio_treble);
          color += pColor * particle * (0.5 + u_audio_loudness);
        }
        // 中心能量核
        float core = exp(-length(uv) * 3.0) * u_audio_loudness;
        color += vec3(1.0, 0.8, 0.4) * core;
        gl_FragColor = vec4(color, 1.0);
      }
    `;
    const prog = new ShaderProgram(gl, vs, fs);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = prog.getAttribLocation('a_position');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    return prog;
  },

  /**
   * 创建实时 3D 分形（Mandelbulb）着色器
   * 使用射线步进（Ray Marching）渲染 3D Mandelbulb 分形，时间驱动旋转与形变
   */
  createFractalShader(gl, time) {
    const vs = QingluanShaders.getCommonVertexShader();
    const fs = `
      precision highp float;
      varying vec2 v_uv;
      uniform float u_time;
      uniform vec2 u_resolution;
      uniform float u_audio_loudness;
      uniform float u_audio_bass;

      // 3D 旋转矩阵
      mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, -s, 0.0, s, c); }
      mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, s, 0.0, 1.0, 0.0, -s, 0.0, c); }

      // Mandelbulb 距离估算
      float mandelbulb(vec3 p) {
        vec3 z = p;
        float dr = 1.0;
        float r = 0.0;
        float power = 8.0 + u_audio_bass * 4.0;
        for (int i = 0; i < 6; i++) {
          r = length(z);
          if (r > 2.0) break;
          float theta = acos(z.z / r) * power;
          float phi = atan(z.y, z.x) * power;
          float zr = pow(r, power);
          dr = pow(r, power - 1.0) * power * dr + 1.0;
          z = zr * vec3(sin(theta) * cos(phi), sin(phi) * sin(theta), cos(theta));
          z += p;
        }
        return 0.5 * log(r) * r / dr;
      }

      // 射线步进
      float rayMarch(vec3 ro, vec3 rd) {
        float t = 0.0;
        for (int i = 0; i < 64; i++) {
          vec3 p = ro + rd * t;
          float d = mandelbulb(p);
          if (d < 0.001 || t > 5.0) break;
          t += d;
        }
        return t;
      }

      // 计算法线
      vec3 getNormal(vec3 p) {
        float d = mandelbulb(p);
        vec2 e = vec2(0.001, 0.0);
        return normalize(vec3(
          mandelbulb(p + e.xyy) - d,
          mandelbulb(p + e.yxy) - d,
          mandelbulb(p + e.yyx) - d
        ));
      }

      void main() {
        vec2 uv = (v_uv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0);
        vec3 ro = vec3(0.0, 0.0, -2.0);
        vec3 rd = normalize(vec3(uv, 1.0));
        // 音频驱动旋转
        ro *= rotY(u_time * 0.3) * rotX(u_time * 0.2 + u_audio_loudness);
        rd *= rotY(u_time * 0.3) * rotX(u_time * 0.2 + u_audio_loudness);
        float t = rayMarch(ro, rd);
        vec3 color = vec3(0.05, 0.02, 0.08);
        if (t < 5.0) {
          vec3 p = ro + rd * t;
          vec3 n = getNormal(p);
          vec3 light = normalize(vec3(1.0, 2.0, -1.0));
          float diff = max(dot(n, light), 0.0);
          float spec = pow(max(dot(reflect(-light, n), -rd), 0.0), 32.0);
          // 分形颜色：基于位置与法线
          vec3 baseColor = 0.5 + 0.5 * cos(vec3(0.0, 0.5, 1.0) + length(p) * 2.0 + u_time * 0.5);
          color = baseColor * diff + vec3(1.0) * spec * 0.5 + vec3(0.1, 0.05, 0.2);
          // 环境光
          color += vec3(0.05, 0.0, 0.1);
          // 雾效
          float fog = exp(-t * 0.3);
          color = mix(vec3(0.02, 0.0, 0.04), color, fog);
        }
        // 背景星云
        color += vec3(0.1, 0.05, 0.2) * (0.5 + 0.5 * sin(uv.x * 3.0 + u_time) * cos(uv.y * 2.0 - u_time));
        gl_FragColor = vec4(color, 1.0);
      }
    `;
    const prog = new ShaderProgram(gl, vs, fs);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = prog.getAttribLocation('a_position');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    return prog;
  },

  /**
   * 创建音频地形着色器
   * 使用 Simplex 噪声生成地形高度图，音频能量控制地形起伏与颜色
   */
  createNoiseTerrainShader(gl, audioData) {
    const vs = QingluanShaders.getCommonVertexShader();
    const fs = `
      precision highp float;
      varying vec2 v_uv;
      uniform float u_time;
      uniform vec2 u_resolution;
      uniform float u_audio_bass;
      uniform float u_audio_mid;
      uniform float u_audio_loudness;

      // 2D 旋转
      mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

      // 值噪声
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
      }

      // FBM 分形布朗运动
      float fbm(vec2 p) {
        float v = 0.0, a = 0.5;
        for (int i = 0; i < 5; i++) {
          v += a * noise(p);
          p = rot(0.4) * p * 2.0;
          a *= 0.5;
        }
        return v;
      }

      void main() {
        vec2 uv = v_uv;
        // 地形坐标
        vec2 p = uv * 4.0;
        // 音频驱动地形高度
        float height = fbm(p + u_time * 0.1);
        height += u_audio_bass * fbm(p * 2.0 + u_time * 0.3) * 0.5;
        height += u_audio_mid * fbm(p * 4.0 - u_time * 0.2) * 0.25;
        // 等高线
        float contour = smoothstep(0.02, 0.0, abs(fract(height * 8.0) - 0.5));
        // 颜色映射：低地蓝绿，高地白雪
        vec3 lowColor = vec3(0.0, 0.15, 0.25);
        vec3 midColor = vec3(0.1, 0.4, 0.2);
        vec3 highColor = vec3(0.8, 0.85, 0.9);
        vec3 color = mix(lowColor, midColor, smoothstep(0.2, 0.5, height));
        color = mix(color, highColor, smoothstep(0.5, 0.8, height));
        // 等高线高亮
        color += vec3(0.3, 0.5, 0.4) * contour * (0.5 + u_audio_loudness);
        // 天空渐变
        float sky = 1.0 - uv.y;
        color += vec3(0.05, 0.08, 0.15) * sky * (1.0 + u_audio_bass);
        gl_FragColor = vec4(color, 1.0);
      }
    `;
    const prog = new ShaderProgram(gl, vs, fs);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = prog.getAttribLocation('a_position');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    return prog;
  },

  /**
   * 创建神经网络可视化着色器
   * 模拟神经元节点与连接脉冲，时间驱动信号传播
   */
  createNeuralShader(gl, time) {
    const vs = QingluanShaders.getCommonVertexShader();
    const fs = `
      precision highp float;
      varying vec2 v_uv;
      uniform float u_time;
      uniform vec2 u_resolution;
      uniform float u_audio_loudness;
      uniform float u_audio_mid;

      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

      void main() {
        vec2 uv = (v_uv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0);
        vec3 color = vec3(0.02, 0.02, 0.05);
        // 神经网络节点层
        for (int layer = 0; layer < 4; layer++) {
          float fl = float(layer);
          float x = -0.6 + fl * 0.4;
          int nodeCount = 3 + layer * 2;
          for (int n = 0; n < 9; n++) {
            if (n >= nodeCount) break;
            float fn = float(n);
            float y = -0.4 + fn * 0.25 - float(nodeCount) * 0.125 + 0.125;
            vec2 nodePos = vec2(x, y);
            float d = length(uv - nodePos);
            // 节点脉冲
            float pulse = sin(u_time * 3.0 + fl * 2.0 + fn * 1.5) * 0.5 + 0.5;
            pulse *= (0.5 + u_audio_loudness * 1.5);
            float node = smoothstep(0.04 + pulse * 0.01, 0.01, d);
            color += vec3(0.0, 0.6, 1.0) * node * (0.3 + pulse);
            // 连接线
            if (layer < 3) {
              float nextX = x + 0.4;
              int nextCount = 3 + (layer + 1) * 2;
              for (int m = 0; m < 9; m++) {
                if (m >= nextCount) break;
                float fm = float(m);
                float ny = -0.4 + fm * 0.25 - float(nextCount) * 0.125 + 0.125;
                vec2 np = vec2(nextX, ny);
                vec2 lineDir = np - nodePos;
                float lineLen = length(lineDir);
                vec2 lineUV = uv - nodePos;
                float proj = clamp(dot(lineUV, lineDir) / (lineLen * lineLen), 0.0, 1.0);
                vec2 closest = nodePos + lineDir * proj;
                float lineD = length(uv - closest);
                // 信号沿连接传播
                float signal = sin(u_time * 4.0 + fl * 3.0 + fn * 2.0 + fm - proj * 6.28);
                float lineMask = smoothstep(0.003, 0.0, lineD) * (0.2 + u_audio_mid * 0.5);
                color += vec3(0.0, 0.8, 0.6) * lineMask * (0.3 + signal * 0.7) * (0.4 + u_audio_loudness);
              }
            }
          }
        }
        gl_FragColor = vec4(color, 1.0);
      }
    `;
    const prog = new ShaderProgram(gl, vs, fs);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = prog.getAttribLocation('a_position');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    return prog;
  },

  /**
   * 创建星系螺旋着色器
   * 模拟螺旋星系，时间驱动旋转，音频能量控制恒星亮度与旋臂扭曲
   */
  createGalaxyShader(gl, time) {
    const vs = QingluanShaders.getCommonVertexShader();
    const fs = `
      precision highp float;
      varying vec2 v_uv;
      uniform float u_time;
      uniform vec2 u_resolution;
      uniform float u_audio_loudness;
      uniform float u_audio_bass;
      uniform float u_audio_treble;

      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

      void main() {
        vec2 uv = (v_uv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0);
        float angle = atan(uv.y, uv.x);
        float radius = length(uv);
        // 螺旋臂
        float arms = 3.0;
        float spiral = sin(angle * arms + log(radius + 0.1) * 3.0 - u_time * 0.5);
        float armMask = smoothstep(0.3, 0.8, spiral) * smoothstep(1.0, 0.1, radius);
        // 恒星粒子
        vec2 grid = fract(uv * 80.0);
        float star = step(0.97, hash(floor(uv * 80.0))) * smoothstep(0.05, 0.0, length(grid - 0.5));
        star += step(0.98, hash(floor(uv * 40.0 + 100.0))) * smoothstep(0.08, 0.0, length(grid - 0.5));
        // 中心黑洞/核球
        float core = exp(-radius * 8.0) * (1.0 + u_audio_bass * 3.0);
        // 颜色
        vec3 armColor = mix(vec3(0.6, 0.2, 0.1), vec3(0.2, 0.5, 0.9), u_audio_treble);
        vec3 color = armColor * armMask * (0.5 + u_audio_loudness);
        color += vec3(1.0, 0.9, 0.7) * star * (0.5 + u_audio_loudness * 2.0);
        color += vec3(1.0, 0.8, 0.4) * core;
        // 背景星云
        float nebula = smoothstep(0.4, 0.6, hash(floor(uv * 20.0) + vec2(50.0)));
        color += vec3(0.1, 0.05, 0.2) * nebula * (0.2 + u_audio_bass);
        gl_FragColor = vec4(color, 1.0);
      }
    `;
    const prog = new ShaderProgram(gl, vs, fs);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = prog.getAttribLocation('a_position');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    return prog;
  },

  /**
   * 创建流体动力学着色器
   * 模拟流体涡旋与扩散，音频驱动流速与颜色混合
   */
  createFluidShader(gl, audioData) {
    const vs = QingluanShaders.getCommonVertexShader();
    const fs = `
      precision highp float;
      varying vec2 v_uv;
      uniform float u_time;
      uniform vec2 u_resolution;
      uniform float u_audio_bass;
      uniform float u_audio_mid;
      uniform float u_audio_loudness;

      // 旋转矩阵
      mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

      void main() {
        vec2 uv = (v_uv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0);
        // 流体扭曲场
        vec2 p = uv * 3.0;
        float flow = 0.0;
        for (int i = 0; i < 4; i++) {
          float fi = float(i);
          p = rot(0.7 + u_time * 0.1 * (1.0 + u_audio_bass) + fi) * p;
          flow += sin(p.x * 2.0 + u_time + fi) * cos(p.y * 2.0 - u_time * 0.7);
        }
        flow *= 0.25;
        // 涡旋中心
        float d1 = length(uv - vec2(0.3, 0.2));
        float d2 = length(uv + vec2(0.3, 0.2));
        float vortex1 = sin(flow * 3.0 + u_time * 2.0 - d1 * 8.0) * exp(-d1 * 3.0);
        float vortex2 = sin(flow * 3.0 - u_time * 1.5 - d2 * 8.0) * exp(-d2 * 3.0);
        // 颜色混合：墨水扩散效果
        vec3 ink1 = vec3(0.9, 0.2, 0.3) * (0.5 + u_audio_bass);
        vec3 ink2 = vec3(0.1, 0.5, 0.9) * (0.5 + u_audio_mid);
        vec3 ink3 = vec3(0.2, 0.9, 0.6) * u_audio_loudness;
        vec3 color = vec3(0.02, 0.02, 0.05);
        color += ink1 * vortex1;
        color += ink2 * vortex2;
        color += ink3 * sin(flow * 2.0) * 0.3;
        // 流体纹理细节
        float detail = hash(floor(uv * 200.0) + floor(u_time * 10.0));
        color += vec3(detail) * 0.03 * (1.0 + u_audio_loudness);
        gl_FragColor = vec4(color, 1.0);
      }
    `;
    const prog = new ShaderProgram(gl, vs, fs);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = prog.getAttribLocation('a_position');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    return prog;
  },

  /**
   * 创建矩阵雨（音频响应）着色器
   * 经典数字雨效果，音频能量控制下落速度与亮度，颜色响应频段
   */
  createMatrixShader(gl, audioData) {
    const vs = QingluanShaders.getCommonVertexShader();
    const fs = `
      precision highp float;
      varying vec2 v_uv;
      uniform float u_time;
      uniform vec2 u_resolution;
      uniform float u_audio_bass;
      uniform float u_audio_mid;
      uniform float u_audio_treble;
      uniform float u_audio_loudness;

      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

      void main() {
        vec2 uv = v_uv;
        // 字符格点
        vec2 gridUV = vec2(uv.x * 40.0, uv.y * 30.0);
        vec2 id = floor(gridUV);
        vec2 fr = fract(gridUV);
        // 每列独立下落速度，受音频影响
        float speed = 1.0 + hash(vec2(id.x, 0.0)) * 2.0 + u_audio_loudness * 3.0;
        float yOffset = id.y + u_time * speed + id.x * 3.7;
        float cell = fract(yOffset);
        // 字符随机闪烁
        float charVal = hash(vec2(id.x, floor(yOffset)));
        float charOn = step(0.3, charVal);
        // 头部高亮
        float head = smoothstep(0.15, 0.0, cell) * charOn;
        // 尾部渐变
        float tail = smoothstep(1.0, 0.3, cell) * charOn * (0.3 + hash(id) * 0.3);
        // 颜色：低音偏绿，中音偏青，高音偏白
        vec3 headColor = mix(vec3(0.5, 1.0, 0.2), vec3(0.2, 1.0, 0.8), u_audio_mid);
        headColor = mix(headColor, vec3(1.0), u_audio_treble);
        vec3 tailColor = vec3(0.0, 0.3, 0.1) * (0.5 + u_audio_bass);
        vec3 color = headColor * head + tailColor * tail;
        // 字符形状（简单方块模拟）
        float shape = smoothstep(0.15, 0.1, abs(fr.x - 0.5)) * smoothstep(0.15, 0.1, abs(fr.y - 0.5));
        color *= shape;
        // 背景扫描线
        float scanline = sin(uv.y * 200.0) * 0.03;
        color += vec3(0.0, scanline, 0.0);
        gl_FragColor = vec4(color, 1.0);
      }
    `;
    const prog = new ShaderProgram(gl, vs, fs);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = prog.getAttribLocation('a_position');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    return prog;
  },

  /**
   * 创建音频火焰着色器
   * 基于噪声的火焰模拟，音频能量控制火焰高度与剧烈程度
   */
  createFireShader(gl, audioData) {
    const vs = QingluanShaders.getCommonVertexShader();
    const fs = `
      precision highp float;
      varying vec2 v_uv;
      uniform float u_time;
      uniform vec2 u_resolution;
      uniform float u_audio_bass;
      uniform float u_audio_mid;
      uniform float u_audio_loudness;

      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
      }

      void main() {
        vec2 uv = v_uv;
        // 火焰从底部向上
        vec2 p = vec2(uv.x * 3.0, uv.y * 4.0);
        float n = 0.0;
        float amp = 1.0;
        // 多层湍流噪声
        for (int i = 0; i < 5; i++) {
          n += noise(p * amp + vec2(0.0, -u_time * (1.0 + u_audio_loudness) * amp)) / amp;
          amp *= 2.0;
        }
        n = n * 0.5 + 0.5;
        // 火焰高度受低音驱动
        float fireHeight = 0.3 + u_audio_bass * 0.5;
        float flame = smoothstep(fireHeight + n * 0.3, fireHeight - 0.1, uv.y);
        flame *= smoothstep(0.0, 0.2, uv.y); // 底部更亮
        // 火焰颜色：底部白黄，中部橙红，顶部暗红
        vec3 color = mix(vec3(0.8, 0.1, 0.0), vec3(1.0, 0.5, 0.0), flame * 0.7);
        color = mix(color, vec3(1.0, 0.9, 0.5), smoothstep(0.3, 0.8, flame));
        color = mix(color, vec3(0.1, 0.02, 0.0), 1.0 - flame);
        // 火星粒子
        vec2 sparkUV = uv * vec2(20.0, 15.0);
        vec2 sparkId = floor(sparkUV);
        float spark = step(0.97, hash(sparkId + floor(u_time * 10.0)));
        float sparkY = fract(sparkUV.y + u_time * (0.5 + hash(sparkId) * 2.0));
        spark *= smoothstep(1.0, 0.7, sparkY) * smoothstep(0.0, 0.1, sparkY);
        color += vec3(1.0, 0.7, 0.3) * spark * u_audio_mid;
        gl_FragColor = vec4(color * flame, 1.0);
      }
    `;
    const prog = new ShaderProgram(gl, vs, fs);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = prog.getAttribLocation('a_position');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    return prog;
  },

  /**
   * 创建极光效果着色器
   * 使用多层正弦波模拟极光带，时间驱动飘动，音频调制亮度
   */
  createAuroraShader(gl, time) {
    const vs = QingluanShaders.getCommonVertexShader();
    const fs = `
      precision highp float;
      varying vec2 v_uv;
      uniform float u_time;
      uniform vec2 u_resolution;
      uniform float u_audio_bass;
      uniform float u_audio_mid;
      uniform float u_audio_treble;

      void main() {
        vec2 uv = v_uv;
        float aurora = 0.0;
        // 多层极光带
        for (int i = 0; i < 4; i++) {
          float fi = float(i);
          float wave = sin(uv.x * (3.0 + fi) + u_time * (0.3 + fi * 0.1) + fi * 2.0) * 0.1;
          wave += sin(uv.x * (5.0 + fi * 2.0) - u_time * 0.5 + fi) * 0.05;
          float band = smoothstep(0.03, 0.0, abs(uv.y - (0.6 + wave - fi * 0.08)));
          aurora += band * (0.3 + fi * 0.15);
        }
        // 颜色：绿为主，高音偏紫
        vec3 green = vec3(0.2, 0.9, 0.4) * (0.5 + u_audio_bass);
        vec3 purple = vec3(0.6, 0.2, 0.9) * u_audio_treble;
        vec3 blue = vec3(0.1, 0.4, 0.9) * u_audio_mid;
        vec3 color = (green + purple + blue) * aurora;
        // 星空背景
        float stars = step(0.995, fract(sin(dot(floor(uv * 300.0), vec2(127.1, 311.7))) * 43758.5453));
        color += vec3(0.8, 0.9, 1.0) * stars * 0.5;
        // 夜空渐变
        color += vec3(0.0, 0.02, 0.08) * (1.0 - uv.y);
        gl_FragColor = vec4(color, 1.0);
      }
    `;
    const prog = new ShaderProgram(gl, vs, fs);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = prog.getAttribLocation('a_position');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    return prog;
  },

  /**
   * 创建水面波纹着色器
   * 模拟水面涟漪与反射，音频能量产生波纹源
   */
  createWaterShader(gl, time) {
    const vs = QingluanShaders.getCommonVertexShader();
    const fs = `
      precision highp float;
      varying vec2 v_uv;
      uniform float u_time;
      uniform vec2 u_resolution;
      uniform float u_audio_bass;
      uniform float u_audio_mid;
      uniform float u_audio_loudness;

      void main() {
        vec2 uv = v_uv;
        // 多个波纹源
        float ripple = 0.0;
        vec2 centers[4];
        centers[0] = vec2(0.3, 0.4);
        centers[1] = vec2(0.7, 0.6);
        centers[2] = vec2(0.5, 0.5);
        centers[3] = vec2(0.2, 0.8);
        for (int i = 0; i < 4; i++) {
          float fi = float(i);
          float d = length(uv - centers[i]);
          float wave = sin(d * 30.0 - u_time * 3.0 * (1.0 + fi * 0.2)) * exp(-d * 2.0);
          ripple += wave * (0.2 + (i == 0 ? u_audio_bass : i == 1 ? u_audio_mid : u_audio_loudness) * 0.5);
        }
        // 扭曲 UV 模拟折射
        vec2 refractedUV = uv + ripple * 0.03;
        // 水面颜色
        vec3 waterColor = mix(vec3(0.0, 0.15, 0.25), vec3(0.0, 0.35, 0.5), refractedUV.y);
        // 高光
        float spec = pow(max(ripple, 0.0), 3.0) * (0.5 + u_audio_loudness);
        vec3 color = waterColor + vec3(0.6, 0.8, 1.0) * spec;
        // 边缘泡沫
        float foam = smoothstep(0.45, 0.55, abs(refractedUV.y - 0.5) + ripple * 0.1);
        color += vec3(0.8, 0.9, 1.0) * foam * 0.1;
        gl_FragColor = vec4(color, 1.0);
      }
    `;
    const prog = new ShaderProgram(gl, vs, fs);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = prog.getAttribLocation('a_position');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    return prog;
  },

  /**
   * 创建全息投影着色器
   * 模拟科幻风格全息图，扫描线、闪烁与网格变形
   */
  createHologramShader(gl, time) {
    const vs = QingluanShaders.getCommonVertexShader();
    const fs = `
      precision highp float;
      varying vec2 v_uv;
      uniform float u_time;
      uniform vec2 u_resolution;
      uniform float u_audio_loudness;
      uniform float u_audio_mid;

      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

      void main() {
        vec2 uv = (v_uv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0);
        // 全息主体：旋转立方体轮廓（简化）
        float cube = 0.0;
        for (int i = 0; i < 3; i++) {
          float fi = float(i);
          float angle = u_time * 0.5 + fi * 1.0;
          vec2 rotated = vec2(
            uv.x * cos(angle) - uv.y * sin(angle),
            uv.x * sin(angle) + uv.y * cos(angle)
          );
          float size = 0.3 + fi * 0.05;
          float xEdge = smoothstep(0.005, 0.0, abs(abs(rotated.x) - size));
          float yEdge = smoothstep(0.005, 0.0, abs(abs(rotated.y) - size));
          cube += max(xEdge, yEdge) * (0.5 - fi * 0.15);
        }
        // 内部网格
        float gridX = smoothstep(0.005, 0.0, abs(fract(uv.x * 15.0) - 0.5) * 2.0 - 0.9);
        float gridY = smoothstep(0.005, 0.0, abs(fract(uv.y * 15.0) - 0.5) * 2.0 - 0.9);
        float grid = max(gridX, gridY) * cube;
        // 扫描线
        float scanline = smoothstep(0.02, 0.0, abs(fract(uv.y * 2.0 + u_time * 0.8) - 0.5) * 2.0 - 0.95);
        // 故障闪烁
        float glitch = step(0.97, hash(vec2(floor(u_time * 20.0), floor(uv.y * 20.0))));
        // 音频响应亮度脉冲
        float pulse = 0.7 + sin(u_time * 4.0) * 0.2 + u_audio_loudness * 0.5;
        // 全息颜色：青绿色
        vec3 holoColor = vec3(0.0, 0.9, 0.7) * pulse;
        vec3 color = holoColor * (cube + grid * 0.5);
        color += vec3(0.5, 1.0, 0.8) * scanline * 0.3;
        color += vec3(1.0, 0.2, 0.2) * glitch * 0.3;
        // 背景暗色
        color += vec3(0.01, 0.03, 0.02);
        // 底部发光底座
        float base = exp(-abs(uv.y + 0.35) * 8.0) * smoothstep(0.3, 0.0, abs(uv.x));
        color += vec3(0.0, 0.6, 0.5) * base * (0.5 + u_audio_mid);
        gl_FragColor = vec4(color, 1.0);
      }
    `;
    const prog = new ShaderProgram(gl, vs, fs);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = prog.getAttribLocation('a_position');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    return prog;
  },

  /**
   * 创建量子泡沫着色器（额外赠送效果）
   * 模拟微观量子涨落，音频能量激发虚粒子对产生与湮灭
   */
  createQuantumFoamShader(gl, audioData) {
    const vs = QingluanShaders.getCommonVertexShader();
    const fs = `
      precision highp float;
      varying vec2 v_uv;
      uniform float u_time;
      uniform vec2 u_resolution;
      uniform float u_audio_loudness;
      uniform float u_audio_treble;

      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
      }

      void main() {
        vec2 uv = (v_uv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0);
        float t = u_time * 0.5;
        // 量子泡沫格点
        float scale = 15.0 + u_audio_treble * 10.0;
        vec2 p = uv * scale;
        vec2 id = floor(p);
        vec2 fr = fract(p) - 0.5;
        float h = hash(id);
        // 虚粒子对产生
        float pair = sin(t * (1.0 + h * 3.0) + h * 6.28) * 0.5 + 0.5;
        pair *= u_audio_loudness;
        float d = length(fr);
        float particle = smoothstep(0.15 * pair, 0.0, d);
        // 连接桥（湮灭前状态）
        float bridge = smoothstep(0.02, 0.0, abs(fr.x)) * smoothstep(0.3, 0.0, abs(fr.y)) * pair;
        // 颜色：正能量蓝，负能量红
        vec3 posColor = vec3(0.2, 0.5, 1.0) * particle;
        vec3 bridgeColor = vec3(0.8, 0.2, 0.9) * bridge;
        vec3 color = posColor + bridgeColor;
        // 背景量子场
        float field = noise(uv * 8.0 + t) * 0.1 * (1.0 + u_audio_loudness);
        color += vec3(0.05, 0.0, 0.1) * field;
        gl_FragColor = vec4(color, 1.0);
      }
    `;
    const prog = new ShaderProgram(gl, vs, fs);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = prog.getAttribLocation('a_position');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    return prog;
  },

  /**
   * 创建音频频谱圆环着色器（额外赠送效果）
   * 将 FFT 数据映射为极坐标下的圆形频谱条，带有镜像对称与发光效果
   */
  createCircularSpectrumShader(gl, fftData) {
    const vs = QingluanShaders.getCommonVertexShader();
    const fs = `
      precision highp float;
      varying vec2 v_uv;
      uniform float u_time;
      uniform vec2 u_resolution;
      uniform float u_fft[128];
      uniform float u_audio_loudness;
      uniform float u_audio_bass;
      uniform float u_audio_beatPhase;

      float getFFT(float x) {
        float idx = x * 127.0;
        int i = int(idx);
        int j = min(i + 1, 127);
        float f = fract(idx);
        float vi = 0.0, vj = 0.0;
        for (int k = 0; k < 128; k++) {
          if (k == i) vi = u_fft[k];
          if (k == j) vj = u_fft[k];
        }
        return mix(vi, vj, f);
      }

      void main() {
        vec2 uv = (v_uv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0);
        float radius = length(uv);
        float angle = atan(uv.y, uv.x) / 6.28318 + 0.5;
        // 圆形频谱
        float fftVal = getFFT(angle);
        float barRadius = 0.25 + fftVal * 0.25 * (1.0 + u_audio_bass);
        float barWidth = 0.008;
        float bar = smoothstep(barWidth, barWidth * 0.3, abs(radius - barRadius));
        // 镜像对称内环
        float innerBar = smoothstep(barWidth, barWidth * 0.3, abs(radius - (0.25 - fftVal * 0.15)));
        // 颜色：色相随角度变化，亮度随音频
        vec3 color = 0.5 + 0.5 * cos(vec3(0.0, 0.5, 1.0) + angle * 6.28 + u_time * 0.5);
        color *= bar + innerBar * 0.5;
        color *= 0.5 + u_audio_loudness * 1.5;
        // 中心节拍脉冲
        float pulse = exp(-radius * 4.0) * sin(u_audio_beatPhase * 6.28) * u_audio_bass;
        color += vec3(1.0, 0.8, 0.3) * pulse;
        // 外圈光晕
        float glow = exp(-abs(radius - barRadius) * 10.0) * fftVal;
        color += vec3(0.3, 0.6, 1.0) * glow;
        gl_FragColor = vec4(color, 1.0);
      }
    `;
    const prog = new ShaderProgram(gl, vs, fs);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = prog.getAttribLocation('a_position');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    return prog;
  },
};

// ============================================================================
// 渲染辅助函数
// ============================================================================

/**
 * 调整 canvas 尺寸以匹配设备像素比，避免模糊
 * @param {HTMLCanvasElement} canvas - 目标画布
 * @param {number} dpr - 设备像素比（默认 window.devicePixelRatio）
 */
export function resizeCanvasToDisplaySize(canvas, dpr = window.devicePixelRatio || 1) {
  const displayWidth = Math.floor(canvas.clientWidth * dpr);
  const displayHeight = Math.floor(canvas.clientHeight * dpr);
  if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
    canvas.width = displayWidth;
    canvas.height = displayHeight;
    return true;
  }
  return false;
}

/**
 * 创建 WebGL 纹理并上传音频数据（用于部分高级效果）
 * @param {WebGLRenderingContext} gl - WebGL 上下文
 * @param {Float32Array} data - 一维数据数组
 * @param {number} width - 纹理宽度
 * @returns {WebGLTexture}
 */
export function createAudioTexture(gl, data, width = 128) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  // 将一维数据转为 1像素高的图像
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, width, 1, 0, gl.LUMINANCE, gl.FLOAT, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}

/**
 * 更新音频纹理内容
 * @param {WebGLRenderingContext} gl - WebGL 上下文
 * @param {WebGLTexture} texture - 目标纹理
 * @param {Float32Array} data - 新数据
 * @param {number} width - 纹理宽度
 */
export function updateAudioTexture(gl, texture, data, width = 128) {
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, 1, gl.LUMINANCE, gl.FLOAT, data);
}

/**
 * 绘制全屏四边形（使用已绑定的顶点缓冲）
 * @param {WebGLRenderingContext} gl - WebGL 上下文
 */
export function drawFullscreenQuad(gl) {
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

// ============================================================================
// 后处理管线类（PostProcessor）
// ============================================================================

/**
 * PostProcessor 提供简单的帧缓冲后处理支持，
 * 可为着色器效果添加泛光（Bloom）、色调映射等后处理。
 * 使用原生 WebGL 帧缓冲对象（FBO）。
 */
export class PostProcessor {
  gl;
  width;
  height;
  framebuffer;
  texture;
  renderbuffer;

  /**
   * @param {WebGLRenderingContext} gl - WebGL 上下文
   * @param {number} width - 帧缓冲宽度
   * @param {number} height - 帧缓冲高度
   */
  constructor(gl, width, height) {
    this.gl = gl;
    this.width = width;
    this.height = height;
    this._createFBO();
  }

  /** 创建帧缓冲对象及其附件 */
  _createFBO() {
    const gl = this.gl;
    this.framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    // 颜色纹理附件
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.width, this.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texture, 0);
    // 深度/模板渲染缓冲附件
    this.renderbuffer = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, this.renderbuffer);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_STENCIL, this.width, this.height);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.RENDERBUFFER, this.renderbuffer);
    // 检查完整性
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      console.error('帧缓冲不完整');
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /** 调整帧缓冲尺寸 */
  resize(width, height) {
    this.width = width;
    this.height = height;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, this.renderbuffer);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_STENCIL, width, height);
  }

  /** 绑定帧缓冲为渲染目标 */
  bind() {
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.framebuffer);
    this.gl.viewport(0, 0, this.width, this.height);
  }

  /** 解绑帧缓冲，恢复默认屏幕渲染 */
  unbind() {
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
  }

  /** 获取颜色纹理，用于后续着色器采样 */
  getTexture() {
    return this.texture;
  }

  /** 清理资源 */
  destroy() {
    const gl = this.gl;
    gl.deleteFramebuffer(this.framebuffer);
    gl.deleteTexture(this.texture);
    gl.deleteRenderbuffer(this.renderbuffer);
  }
}

// ============================================================================
// 统一渲染循环辅助类（ShaderRenderer）
// ============================================================================

/**
 * ShaderRenderer 封装了一个简单的渲染循环，
 * 将 QingluanShaders 效果与 AudioToShaderBridge 结合，
 * 自动处理 canvas 尺寸、时间uniform与音频数据更新。
 */
export class ShaderRenderer {
  canvas;
  gl;
  shader;
  bridge;
  startTime;
  animationId;
  analyser;
  onBeforeRender;
  onAfterRender;

  /**
   * @param {HTMLCanvasElement} canvas - 画布
   * @param {ShaderProgram} shader - 要渲染的着色器程序
   * @param {AudioToShaderBridge} bridge - 音频数据桥接器（可选）
   */
  constructor(canvas, shader, bridge = null) {
    this.canvas = canvas;
    this.gl = QingluanShaders.initWebGL(canvas);
    if (!this.gl) throw new Error('WebGL 初始化失败');
    this.shader = shader;
    this.bridge = bridge;
    this.startTime = performance.now();
    this.analyser = null;
    this.onBeforeRender = null;
    this.onAfterRender = null;
  }

  /** 连接 Web Audio 分析器 */
  connectAnalyser(analyser) {
    this.analyser = analyser;
    if (this.bridge) {
      // 确保数组大小匹配
      const fftSize = analyser.frequencyBinCount;
      this.bridge.fftData = new Float32Array(fftSize);
      this.bridge.waveformData = new Float32Array(fftSize);
    }
  }

  /** 启动渲染循环 */
  start() {
    const loop = (now) => {
      this.render(now);
      this.animationId = requestAnimationFrame(loop);
    };
    this.animationId = requestAnimationFrame(loop);
  }

  /** 停止渲染循环 */
  stop() {
    if (this.animationId) cancelAnimationFrame(this.animationId);
    this.animationId = null;
  }

  /** 执行单帧渲染 */
  render(now) {
    const gl = this.gl;
    // 自动调整画布尺寸
    if (resizeCanvasToDisplaySize(this.canvas)) {
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      this.shader.setVec2('u_resolution', this.canvas.width, this.canvas.height);
    }
    // 更新时间
    const timeSec = (now - this.startTime) / 1000;
    this.shader.setFloat('u_time', timeSec);
    // 更新音频数据
    if (this.analyser && this.bridge) {
      this.bridge.update(this.analyser, 1 / 60); // 假设 60fps
      this.bridge.bindToShader(this.shader);
      // 绑定 FFT 数组
      const fftSize = Math.min(this.bridge.fftData.length, 128);
      for (let i = 0; i < fftSize; i++) {
        this.shader.setFloat(`u_fft[${i}]`, this.bridge.fftData[i]);
      }
      // 绑定波形数组
      const waveSize = Math.min(this.bridge.waveformData.length, 128);
      for (let i = 0; i < waveSize; i++) {
        this.shader.setFloat(`u_waveform[${i}]`, this.bridge.waveformData[i]);
      }
    }
    if (this.onBeforeRender) this.onBeforeRender(gl, this.shader, timeSec);
    this.shader.use();
    drawFullscreenQuad(gl);
    if (this.onAfterRender) this.onAfterRender(gl, this.shader, timeSec);
  }

  /** 销毁渲染器 */
  destroy() {
    this.stop();
    this.shader.destroy();
  }
}

// ============================================================================
// 默认导出
// ============================================================================

export default QingluanShaders;
