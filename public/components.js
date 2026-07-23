/* ================= 青鸾 UI 组件系统 v3.0 ================= */

const QingluanUI = (function() {
  'use strict';

  // 内部工具
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function formatValue(v, decimals = 1) { return v.toFixed(decimals); }
  function createEl(tag, cls, parent) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (parent) parent.appendChild(el);
    return el;
  }
  function addEvent(el, type, fn, opts) { el.addEventListener(type, fn, opts); }
  function removeEvent(el, type, fn) { el.removeEventListener(type, fn); }
  function setStyles(el, styles) { Object.assign(el.style, styles); }
  function px(n) { return n + 'px'; }
  function deg(n) { return n + 'deg'; }
  function isTouch() { return 'ontouchstart' in window; }

  const themes = {
    default: { accent: '#5b4dff', bg: '#fff', text: '#1a1a1a', border: 'rgba(0,0,0,0.06)' },
    dark: { accent: '#7b6dff', bg: '#1a1a1a', text: '#f0f0f0', border: 'rgba(255,255,255,0.08)' },
    cyberpunk: { accent: '#ff2a6d', bg: '#050014', text: '#d1f7ff', border: 'rgba(255,42,109,0.2)' }
  };

  let currentTheme = 'default';

  function applyThemeTo(el, themeName) {
    const t = themes[themeName] || themes.default;
    if (el.dataset.accentTarget) el.style.color = t.accent;
    if (el.dataset.bgTarget) el.style.background = t.bg;
  }

  /* ========== 事件发射器基类 ========== */
  class EventEmitter {
    constructor() { this._events = {}; }
    on(e, fn) { (this._events[e] = this._events[e] || []).push(fn); return () => this.off(e, fn); }
    off(e, fn) { if (!this._events[e]) return; this._events[e] = this._events[e].filter(f => f !== fn); }
    emit(e, data) { (this._events[e] || []).forEach(fn => { try { fn(data); } catch (err) {} }); }
    once(e, fn) { const wrap = (d) => { this.off(e, wrap); fn(d); }; this.on(e, wrap); }
  }

  /* ========== 旋钮 Knob ========== */
  class Knob extends EventEmitter {
    constructor(element, options = {}) {
      super();
      this.el = typeof element === 'string' ? document.getElementById(element) : element;
      if (!this.el) throw new Error('Knob: element not found');
      this.opts = Object.assign({
        min: 0, max: 100, value: 50, step: 1,
        size: 48, startAngle: -135, endAngle: 135,
        showValue: true, decimals: 1, suffix: '',
        color: null, bgColor: null
      }, options);
      this._value = clamp(this.opts.value, this.opts.min, this.opts.max);
      this._isDragging = false;
      this._startY = 0;
      this._startValue = 0;
      this._init();
    }

    _init() {
      this.el.classList.add('ql-knob');
      setStyles(this.el, {
        display: 'inline-flex', flexDirection: 'column', alignItems: 'center',
        gap: '4px', cursor: 'ns-resize', userSelect: 'none', touchAction: 'none'
      });
      this._canvas = createEl('canvas', null, this.el);
      this._canvas.width = this.opts.size;
      this._canvas.height = this.opts.size;
      setStyles(this._canvas, { width: px(this.opts.size), height: px(this.opts.size) });

      if (this.opts.showValue) {
        this._label = createEl('span', 'ql-knob-label', this.el);
        setStyles(this._label, { fontSize: '11px', color: 'var(--text2)', fontWeight: '600' });
      }

      this._bindEvents();
      this._draw();
      this._updateLabel();
    }

    _bindEvents() {
      const start = (e) => {
        this._isDragging = true;
        this._startY = e.clientY || e.touches[0].clientY;
        this._startValue = this._value;
        document.body.style.cursor = 'ns-resize';
      };
      const move = (e) => {
        if (!this._isDragging) return;
        const y = e.clientY || (e.touches ? e.touches[0].clientY : 0);
        const range = this.opts.max - this.opts.min;
        const delta = (this._startY - y) / 200 * range;
        this.setValue(Math.round((this._startValue + delta) / this.opts.step) * this.opts.step);
      };
      const end = () => {
        this._isDragging = false;
        document.body.style.cursor = '';
      };

      addEvent(this._canvas, 'mousedown', start);
      addEvent(this._canvas, 'touchstart', start, { passive: false });
      addEvent(document, 'mousemove', move);
      addEvent(document, 'touchmove', move, { passive: false });
      addEvent(document, 'mouseup', end);
      addEvent(document, 'touchend', end);
    }

    _draw() {
      const ctx = this._canvas.getContext('2d');
      const s = this.opts.size;
      const cx = s / 2, cy = s / 2;
      const r = (s - 8) / 2;
      const range = this.opts.endAngle - this.opts.startAngle;
      const pct = (this._value - this.opts.min) / (this.opts.max - this.opts.min);
      const angle = this.opts.startAngle + pct * range;
      const accent = this.opts.color || getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#5b4dff';
      const bg = this.opts.bgColor || 'rgba(0,0,0,0.06)';

      ctx.clearRect(0, 0, s, s);

      // 背景弧
      ctx.beginPath();
      ctx.arc(cx, cy, r, (this.opts.startAngle - 90) * Math.PI / 180, (this.opts.endAngle - 90) * Math.PI / 180);
      ctx.strokeStyle = bg;
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.stroke();

      // 值弧
      ctx.beginPath();
      ctx.arc(cx, cy, r, (this.opts.startAngle - 90) * Math.PI / 180, (angle - 90) * Math.PI / 180);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.stroke();

      // 指示点
      const px2 = cx + Math.cos((angle - 90) * Math.PI / 180) * (r - 2);
      const py2 = cy + Math.sin((angle - 90) * Math.PI / 180) * (r - 2);
      ctx.beginPath();
      ctx.arc(px2, py2, 4, 0, Math.PI * 2);
      ctx.fillStyle = accent;
      ctx.fill();
    }

    _updateLabel() {
      if (this._label) {
        this._label.textContent = this._value.toFixed(this.opts.decimals) + this.opts.suffix;
      }
    }

    setValue(v) {
      const nv = clamp(v, this.opts.min, this.opts.max);
      if (nv === this._value) return;
      this._value = nv;
      this._draw();
      this._updateLabel();
      this.emit('change', this._value);
    }

    getValue() { return this._value; }
    getElement() { return this.el; }

    destroy() {
      this.el.innerHTML = '';
      this.el.classList.remove('ql-knob');
    }
  }

  /* ========== 推子 Fader ========== */
  class Fader extends EventEmitter {
    constructor(element, options = {}) {
      super();
      this.el = typeof element === 'string' ? document.getElementById(element) : element;
      if (!this.el) throw new Error('Fader: element not found');
      this.opts = Object.assign({
        min: 0, max: 100, value: 70, step: 1,
        width: 40, height: 160, orientation: 'vertical',
        showScale: true, scaleSteps: 5,
        color: null, trackColor: null
      }, options);
      this._value = clamp(this.opts.value, this.opts.min, this.opts.max);
      this._init();
    }

    _init() {
      this.el.classList.add('ql-fader');
      setStyles(this.el, {
        width: px(this.opts.width), height: px(this.opts.height),
        position: 'relative', userSelect: 'none', touchAction: 'none'
      });

      // 轨道
      this._track = createEl('div', 'ql-fader-track', this.el);
      setStyles(this._track, {
        position: 'absolute',
        left: px(this.opts.orientation === 'vertical' ? this.opts.width / 2 - 2 : 0),
        top: px(this.opts.orientation === 'vertical' ? 0 : this.opts.height / 2 - 2),
        width: px(this.opts.orientation === 'vertical' ? 4 : this.opts.width),
        height: px(this.opts.orientation === 'vertical' ? this.opts.height : 4),
        background: this.opts.trackColor || 'rgba(0,0,0,0.06)',
        borderRadius: '2px'
      });

      // 填充
      this._fill = createEl('div', 'ql-fader-fill', this._track);
      setStyles(this._fill, {
        position: 'absolute', bottom: '0', left: '0',
        width: '100%', background: this.opts.color || 'var(--accent, #5b4dff)',
        borderRadius: '2px', pointerEvents: 'none'
      });

      // 滑块
      this._thumb = createEl('div', 'ql-fader-thumb', this.el);
      setStyles(this._thumb, {
        position: 'absolute', width: px(this.opts.width), height: '16px',
        background: '#fff', border: '2px solid var(--accent, #5b4dff)',
        borderRadius: '4px', boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
        cursor: 'pointer', zIndex: '2'
      });

      // 刻度
      if (this.opts.showScale) {
        this._scale = createEl('div', 'ql-fader-scale', this.el);
        setStyles(this._scale, {
          position: 'absolute', right: '0', top: '0', height: '100%',
          display: 'flex', flexDirection: 'column-reverse',
          justifyContent: 'space-between', fontSize: '9px', color: 'var(--text3)',
          paddingRight: '2px', pointerEvents: 'none'
        });
        for (let i = 0; i <= this.opts.scaleSteps; i++) {
          const v = this.opts.min + (this.opts.max - this.opts.min) * (i / this.opts.scaleSteps);
          const mark = createEl('span', null, this._scale);
          mark.textContent = Math.round(v);
        }
      }

      this._bindEvents();
      this._updateUI();
    }

    _bindEvents() {
      let dragging = false;
      const onStart = (e) => {
        dragging = true;
        this._onMove(e);
      };
      const onMove = (e) => { if (dragging) this._onMove(e); };
      const onEnd = () => { dragging = false; };

      addEvent(this.el, 'mousedown', onStart);
      addEvent(this.el, 'touchstart', onStart, { passive: false });
      addEvent(document, 'mousemove', onMove);
      addEvent(document, 'touchmove', onMove, { passive: false });
      addEvent(document, 'mouseup', onEnd);
      addEvent(document, 'touchend', onEnd);
    }

    _onMove(e) {
      const rect = this.el.getBoundingClientRect();
      const clientY = e.clientY || (e.touches ? e.touches[0].clientY : 0);
      const pct = clamp(1 - (clientY - rect.top) / rect.height, 0, 1);
      const range = this.opts.max - this.opts.min;
      const raw = this.opts.min + pct * range;
      this.setValue(Math.round(raw / this.opts.step) * this.opts.step);
    }

    _updateUI() {
      const pct = (this._value - this.opts.min) / (this.opts.max - this.opts.min);
      this._fill.style.height = (pct * 100) + '%';
      this._thumb.style.bottom = `calc(${pct * 100}% - 8px)`;
    }

    setValue(v) {
      const nv = clamp(v, this.opts.min, this.opts.max);
      if (nv === this._value) return;
      this._value = nv;
      this._updateUI();
      this.emit('change', this._value);
    }

    getValue() { return this._value; }
    getElement() { return this.el; }

    destroy() {
      this.el.innerHTML = '';
      this.el.classList.remove('ql-fader');
    }
  }

  /* ========== 电平表 Meter ========== */
  class Meter extends EventEmitter {
    constructor(element, options = {}) {
      super();
      this.el = typeof element === 'string' ? document.getElementById(element) : element;
      if (!this.el) throw new Error('Meter: element not found');
      this.opts = Object.assign({
        width: 16, height: 120, orientation: 'vertical',
        type: 'peak', // peak / rms / vu
        holdTime: 1000,
        segments: 20,
        colorLow: '#4ade80', colorMid: '#facc15', colorHigh: '#ef4444',
        showPeak: true
      }, options);
      this._value = 0;
      this._peak = 0;
      this._peakTimer = null;
      this._init();
    }

    _init() {
      this.el.classList.add('ql-meter');
      setStyles(this.el, {
        width: px(this.opts.width), height: px(this.opts.height),
        position: 'relative', background: 'rgba(0,0,0,0.06)',
        borderRadius: '4px', overflow: 'hidden'
      });

      this._fill = createEl('div', 'ql-meter-fill', this.el);
      setStyles(this._fill, {
        position: 'absolute', bottom: '0', left: '0', width: '100%',
        height: '0%', background: this.opts.colorLow,
        borderRadius: '0 0 4px 4px', transition: 'height 0.05s linear'
      });

      if (this.opts.showPeak) {
        this._peakLine = createEl('div', 'ql-meter-peak', this.el);
        setStyles(this._peakLine, {
          position: 'absolute', left: '0', width: '100%', height: '2px',
          background: '#fff', opacity: '0', transition: 'opacity 0.2s'
        });
      }

      // 分段LED风格
      if (this.opts.segments > 0) {
        this._segments = createEl('div', 'ql-meter-segments', this.el);
        setStyles(this._segments, {
          position: 'absolute', top: '0', left: '0', width: '100%', height: '100%',
          display: 'flex', flexDirection: 'column-reverse', gap: '1px', pointerEvents: 'none'
        });
        for (let i = 0; i < this.opts.segments; i++) {
          const seg = createEl('div', null, this._segments);
          setStyles(seg, {
            flex: '1', background: 'rgba(0,0,0,0.08)', borderRadius: '1px'
          });
        }
      }
    }

    setValue(v) {
      this._value = clamp(v, 0, 1);
      if (this._value > this._peak) {
        this._peak = this._value;
        if (this._peakLine) {
          this._peakLine.style.bottom = (this._peak * 100) + '%';
          this._peakLine.style.opacity = '1';
        }
        if (this._peakTimer) clearTimeout(this._peakTimer);
        this._peakTimer = setTimeout(() => {
          this._peak = 0;
          if (this._peakLine) this._peakLine.style.opacity = '0';
        }, this.opts.holdTime);
      }
      this._updateUI();
      this.emit('change', this._value);
    }

    _updateUI() {
      const pct = this._value * 100;
      this._fill.style.height = pct + '%';
      let color = this.opts.colorLow;
      if (this._value > 0.7) color = this.opts.colorMid;
      if (this._value > 0.9) color = this.opts.colorHigh;
      this._fill.style.background = color;

      // 更新LED段
      if (this._segments) {
        const segs = this._segments.children;
        const active = Math.floor(this._value * this.opts.segments);
        for (let i = 0; i < segs.length; i++) {
          const lit = i < active;
          let segColor = this.opts.colorLow;
          const pctSeg = i / this.opts.segments;
          if (pctSeg > 0.7) segColor = this.opts.colorMid;
          if (pctSeg > 0.9) segColor = this.opts.colorHigh;
          segs[i].style.background = lit ? segColor : 'rgba(0,0,0,0.08)';
          segs[i].style.boxShadow = lit ? `0 0 4px ${segColor}` : 'none';
        }
      }
    }

    getValue() { return this._value; }
    getElement() { return this.el; }

    destroy() {
      if (this._peakTimer) clearTimeout(this._peakTimer);
      this.el.innerHTML = '';
      this.el.classList.remove('ql-meter');
    }
  }

  /* ========== 示波器 Scope ========== */
  class Scope extends EventEmitter {
    constructor(element, options = {}) {
      super();
      this.el = typeof element === 'string' ? document.getElementById(element) : element;
      if (!this.el) throw new Error('Scope: element not found');
      this.opts = Object.assign({
        width: 300, height: 120, color: null, lineWidth: 2,
        trigger: true, fade: false
      }, options);
      this._data = new Float32Array(0);
      this._running = false;
      this._init();
    }

    _init() {
      this.el.classList.add('ql-scope');
      setStyles(this.el, {
        display: 'block', position: 'relative',
        width: px(this.opts.width), height: px(this.opts.height)
      });
      this._canvas = createEl('canvas', null, this.el);
      this._canvas.width = this.opts.width;
      this._canvas.height = this.opts.height;
      setStyles(this._canvas, { width: '100%', height: '100%', borderRadius: '8px', background: 'rgba(0,0,0,0.02)' });
      this._ctx = this._canvas.getContext('2d');
    }

    setData(data) {
      this._data = data instanceof Float32Array ? data : new Float32Array(data);
      if (!this._running) this._draw();
    }

    start() { this._running = true; this._drawLoop(); }
    stop() { this._running = false; }

    _drawLoop() {
      if (!this._running) return;
      this._draw();
      requestAnimationFrame(() => this._drawLoop());
    }

    _draw() {
      const ctx = this._ctx;
      const w = this._canvas.width;
      const h = this._canvas.height;
      const accent = this.opts.color || getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#5b4dff';

      if (this.opts.fade) {
        ctx.fillStyle = 'rgba(0,0,0,0.05)';
        ctx.fillRect(0, 0, w, h);
      } else {
        ctx.clearRect(0, 0, w, h);
      }

      if (!this._data.length) return;

      ctx.strokeStyle = accent;
      ctx.lineWidth = this.opts.lineWidth;
      ctx.beginPath();
      const step = this._data.length / w;
      for (let x = 0; x < w; x++) {
        const idx = Math.floor(x * step);
        const v = this._data[idx] || 0;
        const y = (0.5 - v * 0.45) * h;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    getElement() { return this.el; }
    destroy() {
      this.stop();
      this.el.innerHTML = '';
      this.el.classList.remove('ql-scope');
    }
  }

  /* ========== 频谱仪 Spectrum ========== */
  class Spectrum extends EventEmitter {
    constructor(element, options = {}) {
      super();
      this.el = typeof element === 'string' ? document.getElementById(element) : element;
      if (!this.el) throw new Error('Spectrum: element not found');
      this.opts = Object.assign({
        width: 300, height: 120, barCount: 64, smoothing: 0.8,
        colorStart: null, colorEnd: null, barGap: 1
      }, options);
      this._data = new Uint8Array(0);
      this._running = false;
      this._init();
    }

    _init() {
      this.el.classList.add('ql-spectrum');
      setStyles(this.el, {
        display: 'block', position: 'relative',
        width: px(this.opts.width), height: px(this.opts.height)
      });
      this._canvas = createEl('canvas', null, this.el);
      this._canvas.width = this.opts.width;
      this._canvas.height = this.opts.height;
      setStyles(this._canvas, { width: '100%', height: '100%', borderRadius: '8px', background: 'rgba(0,0,0,0.02)' });
      this._ctx = this._canvas.getContext('2d');
    }

    setData(data) {
      this._data = data instanceof Uint8Array ? data : new Uint8Array(data);
      if (!this._running) this._draw();
    }

    start() { this._running = true; this._drawLoop(); }
    stop() { this._running = false; }

    _drawLoop() {
      if (!this._running) return;
      this._draw();
      requestAnimationFrame(() => this._drawLoop());
    }

    _draw() {
      const ctx = this._ctx;
      const w = this._canvas.width;
      const h = this._canvas.height;
      ctx.clearRect(0, 0, w, h);
      if (!this._data.length) return;

      const barW = (w - (this.opts.barCount - 1) * this.opts.barGap) / this.opts.barCount;
      for (let i = 0; i < this.opts.barCount; i++) {
        const idx = Math.floor((i / this.opts.barCount) * this._data.length);
        const val = (this._data[idx] || 0) / 255;
        const bh = val * h;
        const hue = 200 + (i / this.opts.barCount) * 60;
        ctx.fillStyle = `hsla(${hue}, 80%, 60%, 0.9)`;
        ctx.fillRect(i * (barW + this.opts.barGap), h - bh, barW, bh);
      }
    }

    getElement() { return this.el; }
    destroy() {
      this.stop();
      this.el.innerHTML = '';
      this.el.classList.remove('ql-spectrum');
    }
  }

  /* ========== 虚拟钢琴键盘 PianoKeyboard ========== */
  class PianoKeyboard extends EventEmitter {
    constructor(element, options = {}) {
      super();
      this.el = typeof element === 'string' ? document.getElementById(element) : element;
      if (!this.el) throw new Error('PianoKeyboard: element not found');
      this.opts = Object.assign({
        startNote: 36, endNote: 84, height: 120,
        whiteKeyColor: '#fff', blackKeyColor: '#1a1a1a',
        activeColor: 'var(--accent, #5b4dff)',
        showLabels: false
      }, options);
      this._activeNotes = new Set();
      this._init();
    }

    _init() {
      this.el.classList.add('ql-piano-keyboard');
      setStyles(this.el, {
        display: 'block', position: 'relative',
        width: '100%', height: px(this.opts.height),
        overflow: 'hidden', userSelect: 'none'
      });
      this._buildKeys();
      this._bindEvents();
    }

    _buildKeys() {
      const blackKeys = new Set([1, 3, 6, 8, 10]);
      const whiteCount = [];
      for (let n = this.opts.startNote; n <= this.opts.endNote; n++) {
        if (!blackKeys.has(n % 12)) whiteCount.push(n);
      }
      const keyW = this.el.clientWidth / whiteCount.length || 20;

      // 白键
      whiteCount.forEach((note, i) => {
        const key = createEl('div', 'ql-piano-white-key', this.el);
        key.dataset.note = note;
        setStyles(key, {
          position: 'absolute', left: px(i * keyW), top: '0',
          width: px(keyW), height: '100%', background: this.opts.whiteKeyColor,
          border: '1px solid rgba(0,0,0,0.1)', borderRadius: '0 0 4px 4px',
          cursor: 'pointer', zIndex: '1'
        });
        if (this.opts.showLabels) {
          const label = createEl('span', null, key);
          label.textContent = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'][note % 12];
          setStyles(label, { position: 'absolute', bottom: '4px', left: '50%', transform: 'translateX(-50%)', fontSize: '10px', color: '#999' });
        }
      });

      // 黑键
      let whiteIdx = 0;
      for (let n = this.opts.startNote; n <= this.opts.endNote; n++) {
        if (!blackKeys.has(n % 12)) { whiteIdx++; continue; }
        const key = createEl('div', 'ql-piano-black-key', this.el);
        key.dataset.note = n;
        setStyles(key, {
          position: 'absolute', left: px((whiteIdx - 1) * keyW + keyW * 0.7), top: '0',
          width: px(keyW * 0.6), height: '60%', background: this.opts.blackKeyColor,
          borderRadius: '0 0 4px 4px', cursor: 'pointer', zIndex: '2'
        });
      }
    }

    _bindEvents() {
      const onDown = (e) => {
        const key = e.target.closest('[data-note]');
        if (!key) return;
        const note = parseInt(key.dataset.note);
        this.noteOn(note);
      };
      const onUp = (e) => {
        const key = e.target.closest('[data-note]');
        if (!key) return;
        const note = parseInt(key.dataset.note);
        this.noteOff(note);
      };
      const onOver = (e) => {
        if (e.buttons !== 1) return;
        const key = e.target.closest('[data-note]');
        if (!key) return;
        const note = parseInt(key.dataset.note);
        this.noteOn(note);
      };
      const onOut = (e) => {
        if (e.buttons !== 1) return;
        const key = e.target.closest('[data-note]');
        if (!key) return;
        const note = parseInt(key.dataset.note);
        this.noteOff(note);
      };

      addEvent(this.el, 'mousedown', onDown);
      addEvent(this.el, 'mouseup', onUp);
      addEvent(this.el, 'mouseover', onOver);
      addEvent(this.el, 'mouseout', onOut);
      addEvent(this.el, 'touchstart', (e) => { onDown(e); e.preventDefault(); }, { passive: false });
      addEvent(this.el, 'touchend', onUp);
    }

    noteOn(note) {
      if (this._activeNotes.has(note)) return;
      this._activeNotes.add(note);
      const key = this.el.querySelector(`[data-note="${note}"]`);
      if (key) key.style.background = this.opts.activeColor;
      this.emit('noteOn', note);
    }

    noteOff(note) {
      if (!this._activeNotes.has(note)) return;
      this._activeNotes.delete(note);
      const key = this.el.querySelector(`[data-note="${note}"]`);
      if (key) {
        const isBlack = [1,3,6,8,10].includes(note % 12);
        key.style.background = isBlack ? this.opts.blackKeyColor : this.opts.whiteKeyColor;
      }
      this.emit('noteOff', note);
    }

    allNotesOff() {
      this._activeNotes.forEach(n => this.noteOff(n));
    }

    getElement() { return this.el; }
    destroy() {
      this.el.innerHTML = '';
      this.el.classList.remove('ql-piano-keyboard');
    }
  }

  /* ========== 播放控制条 TransportBar ========== */
  class TransportBar extends EventEmitter {
    constructor(element, options = {}) {
      super();
      this.el = typeof element === 'string' ? document.getElementById(element) : element;
      if (!this.el) throw new Error('TransportBar: element not found');
      this.opts = Object.assign({
        showPlay: true, showStop: true, showRecord: true, showLoop: true,
        showMetronome: true, bpm: 120, timeSig: [4, 4]
      }, options);
      this._state = { playing: false, recording: false, looping: false, metronome: false };
      this._init();
    }

    _init() {
      this.el.classList.add('ql-transport-bar');
      setStyles(this.el, {
        display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px',
        background: 'var(--card-bg)', borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border)'
      });

      // 播放
      if (this.opts.showPlay) {
        this._playBtn = this._createBtn('▶', '播放', () => {
          this._state.playing = !this._state.playing;
          this._playBtn.textContent = this._state.playing ? '⏸' : '▶';
          this._playBtn.classList.toggle('active', this._state.playing);
          this.emit(this._state.playing ? 'play' : 'pause');
        });
      }

      // 停止
      if (this.opts.showStop) {
        this._stopBtn = this._createBtn('⏹', '停止', () => {
          this._state.playing = false;
          if (this._playBtn) { this._playBtn.textContent = '▶'; this._playBtn.classList.remove('active'); }
          this.emit('stop');
        });
      }

      // 录音
      if (this.opts.showRecord) {
        this._recBtn = this._createBtn('⏺', '录音', () => {
          this._state.recording = !this._state.recording;
          this._recBtn.classList.toggle('active', this._state.recording);
          this._recBtn.style.color = this._state.recording ? '#ef4444' : '';
          this.emit(this._state.recording ? 'recordStart' : 'recordStop');
        });
      }

      // 循环
      if (this.opts.showLoop) {
        this._loopBtn = this._createBtn('🔁', '循环', () => {
          this._state.looping = !this._state.looping;
          this._loopBtn.classList.toggle('active', this._state.looping);
          this.emit('loop', this._state.looping);
        });
      }

      // 节拍器
      if (this.opts.showMetronome) {
        this._metroBtn = this._createBtn('🔔', '节拍器', () => {
          this._state.metronome = !this._state.metronome;
          this._metroBtn.classList.toggle('active', this._state.metronome);
          this.emit('metronome', this._state.metronome);
        });
      }

      // BPM 显示
      this._bpmDisplay = createEl('div', 'ql-transport-bpm', this.el);
      setStyles(this._bpmDisplay, {
        marginLeft: 'auto', fontSize: '14px', fontWeight: '700', color: 'var(--text)',
        fontFamily: 'monospace', minWidth: '60px', textAlign: 'right'
      });
      this._bpmDisplay.textContent = this.opts.bpm + ' BPM';
    }

    _createBtn(icon, title, onClick) {
      const btn = createEl('button', 'ql-transport-btn', this.el);
      btn.textContent = icon;
      btn.title = title;
      setStyles(btn, {
        width: '32px', height: '32px', borderRadius: '8px', border: '1px solid var(--border)',
        background: 'var(--input-bg)', color: 'var(--text2)', fontSize: '14px',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
      });
      addEvent(btn, 'click', onClick);
      return btn;
    }

    setBPM(bpm) {
      this.opts.bpm = bpm;
      if (this._bpmDisplay) this._bpmDisplay.textContent = bpm + ' BPM';
    }

    setState(state) {
      Object.assign(this._state, state);
      if (this._playBtn) {
        this._playBtn.textContent = this._state.playing ? '⏸' : '▶';
        this._playBtn.classList.toggle('active', this._state.playing);
      }
      if (this._recBtn) {
        this._recBtn.classList.toggle('active', this._state.recording);
        this._recBtn.style.color = this._state.recording ? '#ef4444' : '';
      }
      if (this._loopBtn) this._loopBtn.classList.toggle('active', this._state.looping);
      if (this._metroBtn) this._metroBtn.classList.toggle('active', this._state.metronome);
    }

    getElement() { return this.el; }
    destroy() {
      this.el.innerHTML = '';
      this.el.classList.remove('ql-transport-bar');
    }
  }

  /* ========== 时间轴 Timeline ========== */
  class Timeline extends EventEmitter {
    constructor(element, options = {}) {
      super();
      this.el = typeof element === 'string' ? document.getElementById(element) : element;
      if (!this.el) throw new Error('Timeline: element not found');
      this.opts = Object.assign({
        width: 600, height: 28, pixelsPerBeat: 40, beatsPerBar: 4,
        zoomX: 1, scrollX: 0, playhead: 0
      }, options);
      this._init();
    }

    _init() {
      this.el.classList.add('ql-timeline');
      setStyles(this.el, {
        display: 'block', position: 'relative',
        width: px(this.opts.width), height: px(this.opts.height)
      });
      this._canvas = createEl('canvas', null, this.el);
      this._canvas.width = this.opts.width;
      this._canvas.height = this.opts.height;
      setStyles(this._canvas, { width: '100%', height: '100%' });
      this._ctx = this._canvas.getContext('2d');
      this._draw();
    }

    setPlayhead(beat) {
      this.opts.playhead = beat;
      this._draw();
      this.emit('change', beat);
    }

    setZoom(zoom) {
      this.opts.zoomX = zoom;
      this._draw();
    }

    _draw() {
      const ctx = this._ctx;
      const w = this._canvas.width;
      const h = this._canvas.height;
      const beatW = this.opts.pixelsPerBeat * this.opts.zoomX;

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = 'var(--card-bg, #fff)';
      ctx.fillRect(0, 0, w, h);

      const startBeat = Math.floor(-this.opts.scrollX / beatW);
      const endBeat = startBeat + Math.ceil(w / beatW) + 1;

      for (let b = startBeat; b <= endBeat; b++) {
        const x = b * beatW + this.opts.scrollX;
        if (x < 0 || x > w) continue;
        const isBar = b % this.opts.beatsPerBar === 0;
        ctx.strokeStyle = isBar ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.1)';
        ctx.lineWidth = isBar ? 1.5 : 0.5;
        ctx.beginPath();
        ctx.moveTo(x, isBar ? 0 : h / 2);
        ctx.lineTo(x, h);
        ctx.stroke();

        if (isBar) {
          ctx.fillStyle = 'var(--text2)';
          ctx.font = '10px sans-serif';
          ctx.fillText(String(Math.floor(b / this.opts.beatsPerBar) + 1), x + 2, h / 2 - 2);
        }
      }

      // 播放头
      const px2 = this.opts.playhead * beatW + this.opts.scrollX;
      ctx.strokeStyle = '#ff6b9d';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px2, 0);
      ctx.lineTo(px2, h);
      ctx.stroke();
    }

    getElement() { return this.el; }
    destroy() {
      this.el.innerHTML = '';
      this.el.classList.remove('ql-timeline');
    }
  }

  /* ========== 音频片段 Clip ========== */
  class Clip extends EventEmitter {
    constructor(element, options = {}) {
      super();
      this.el = typeof element === 'string' ? document.getElementById(element) : element;
      if (!this.el) throw new Error('Clip: element not found');
      this.opts = Object.assign({
        name: 'Clip', color: 'var(--accent, #5b4dff)',
        start: 0, duration: 4, selected: false,
        editable: true
      }, options);
      this._init();
    }

    _init() {
      this.el.classList.add('ql-clip');
      setStyles(this.el, {
        display: 'inline-block', position: 'relative',
        background: this.opts.color, borderRadius: '6px',
        padding: '4px 8px', fontSize: '11px', color: '#fff',
        fontWeight: '600', cursor: 'pointer', userSelect: 'none',
        whiteSpace: 'nowrap', overflow: 'hidden', minWidth: '40px'
      });
      this.el.textContent = this.opts.name;
      if (this.opts.selected) this.el.classList.add('selected');

      this._bindEvents();
    }

    _bindEvents() {
      let startX = 0, startW = 0;
      const onDown = (e) => {
        if (!this.opts.editable) return;
        startX = e.clientX;
        startW = this.el.offsetWidth;
        this.emit('select', this);
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      };
      const onMove = (e) => {
        const dx = e.clientX - startX;
        this.opts.duration = Math.max(0.5, (startW + dx) / 40);
        this.el.style.width = (this.opts.duration * 40) + 'px';
        this.emit('resize', this.opts.duration);
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        this.emit('resizeEnd', this.opts.duration);
      };

      addEvent(this.el, 'mousedown', onDown);
      addEvent(this.el, 'dblclick', () => this.emit('split', this));
    }

    setSelected(v) {
      this.opts.selected = v;
      this.el.classList.toggle('selected', v);
      this.el.style.boxShadow = v ? '0 0 0 2px #fff, 0 0 0 4px ' + this.opts.color : 'none';
    }

    setName(name) {
      this.opts.name = name;
      this.el.textContent = name;
    }

    getElement() { return this.el; }
    destroy() {
      this.el.innerHTML = '';
      this.el.classList.remove('ql-clip');
    }
  }

  /* ========== 轨道头 TrackHeader ========== */
  class TrackHeader extends EventEmitter {
    constructor(element, options = {}) {
      super();
      this.el = typeof element === 'string' ? document.getElementById(element) : element;
      if (!this.el) throw new Error('TrackHeader: element not found');
      this.opts = Object.assign({
        name: 'Track', color: '#5b4dff',
        muted: false, solo: false, armed: false,
        width: 160, height: 60
      }, options);
      this._init();
    }

    _init() {
      this.el.classList.add('ql-track-header');
      setStyles(this.el, {
        display: 'flex', alignItems: 'center', gap: '6px',
        width: px(this.opts.width), height: px(this.opts.height),
        padding: '0 10px', background: 'var(--card-bg)',
        borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)'
      });

      // 颜色指示
      const colorInd = createEl('div', 'ql-track-color', this.el);
      setStyles(colorInd, {
        width: '4px', height: '100%', background: this.opts.color, borderRadius: '2px'
      });

      // 名称
      this._nameEl = createEl('div', 'ql-track-name', this.el);
      this._nameEl.textContent = this.opts.name;
      setStyles(this._nameEl, { flex: '1', fontSize: '12px', fontWeight: '600', color: 'var(--text)' });

      // 按钮组
      const btns = createEl('div', 'ql-track-btns', this.el);
      setStyles(btns, { display: 'flex', gap: '4px' });

      this._muteBtn = this._createToggleBtn(btns, 'M', this.opts.muted, (v) => {
        this.opts.muted = v;
        this.emit('mute', v);
      });
      this._soloBtn = this._createToggleBtn(btns, 'S', this.opts.solo, (v) => {
        this.opts.solo = v;
        this.emit('solo', v);
      });
      this._armBtn = this._createToggleBtn(btns, 'R', this.opts.armed, (v) => {
        this.opts.armed = v;
        this.emit('arm', v);
      });
    }

    _createToggleBtn(parent, label, active, onChange) {
      const btn = createEl('button', 'ql-track-btn', parent);
      btn.textContent = label;
      setStyles(btn, {
        width: '22px', height: '22px', borderRadius: '4px', border: 'none',
        fontSize: '9px', fontWeight: '700', cursor: 'pointer'
      });
      const update = () => {
        btn.style.background = active ? (label === 'M' ? '#ef4444' : label === 'S' ? '#f59e0b' : '#ef4444') : 'rgba(0,0,0,0.06)';
        btn.style.color = active ? '#fff' : 'var(--text2)';
      };
      update();
      addEvent(btn, 'click', () => { active = !active; update(); onChange(active); });
      return btn;
    }

    setName(name) { this.opts.name = name; this._nameEl.textContent = name; }
    setColor(color) { this.opts.color = color; this.el.querySelector('.ql-track-color').style.background = color; }

    getElement() { return this.el; }
    destroy() {
      this.el.innerHTML = '';
      this.el.classList.remove('ql-track-header');
    }
  }

  /* ========== 混音台通道条 MixerChannel ========== */
  class MixerChannel extends EventEmitter {
    constructor(element, options = {}) {
      super();
      this.el = typeof element === 'string' ? document.getElementById(element) : element;
      if (!this.el) throw new Error('MixerChannel: element not found');
      this.opts = Object.assign({
        name: 'Channel', color: '#5b4dff',
        width: 60, height: 280
      }, options);
      this._init();
    }

    _init() {
      this.el.classList.add('ql-mixer-channel');
      setStyles(this.el, {
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: '6px', width: px(this.opts.width), height: px(this.opts.height),
        padding: '8px 4px', background: 'var(--card-bg)',
        borderRadius: '10px', border: '1px solid var(--border)'
      });

      // 名称
      const nameEl = createEl('div', 'ql-mixer-name', this.el);
      nameEl.textContent = this.opts.name;
      setStyles(nameEl, { fontSize: '10px', fontWeight: '600', color: 'var(--text)', textAlign: 'center', width: '100%' });

      // 声像旋钮占位
      const panWrap = createEl('div', 'ql-mixer-pan', this.el);
      setStyles(panWrap, { width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(0,0,0,0.04)' });
      panWrap.title = '声像';

      // 电平表
      const meterWrap = createEl('div', 'ql-mixer-meter-wrap', this.el);
      setStyles(meterWrap, { flex: '1', display: 'flex', justifyContent: 'center', width: '100%' });
      this._meterEl = createEl('div', 'ql-mixer-meter', meterWrap);
      this._meterEl.style.cssText = 'width:8px;height:100%;background:rgba(0,0,0,0.06);border-radius:4px;position:relative;overflow:hidden;';
      this._meterFill = createEl('div', 'ql-mixer-meter-fill', this._meterEl);
      setStyles(this._meterFill, {
        position: 'absolute', bottom: '0', left: '0', width: '100%', height: '0%',
        background: this.opts.color, borderRadius: '4px', transition: 'height 0.05s'
      });

      // 推子
      this._faderEl = createEl('div', 'ql-mixer-fader', this.el);
      setStyles(this._faderEl, { width: '40px', height: '4px', background: 'rgba(0,0,0,0.06)', borderRadius: '2px', position: 'relative' });
      this._faderThumb = createEl('div', 'ql-mixer-fader-thumb', this._faderEl);
      setStyles(this._faderThumb, {
        position: 'absolute', top: '-6px', left: '50%',
        width: '12px', height: '16px', background: '#fff',
        border: '2px solid var(--accent)', borderRadius: '4px',
        transform: 'translateX(-50%)', cursor: 'pointer'
      });
    }

    setMeter(value) {
      const pct = clamp(value, 0, 1) * 100;
      this._meterFill.style.height = pct + '%';
      let color = '#4ade80';
      if (value > 0.7) color = '#facc15';
      if (value > 0.9) color = '#ef4444';
      this._meterFill.style.background = color;
    }

    setFader(value) {
      const pct = clamp(value, 0, 1) * 100;
      this._faderThumb.style.left = pct + '%';
    }

    getElement() { return this.el; }
    destroy() {
      this.el.innerHTML = '';
      this.el.classList.remove('ql-mixer-channel');
    }
  }

  /* ========== EQ 曲线显示 EQDisplay ========== */
  class EQDisplay extends EventEmitter {
    constructor(element, options = {}) {
      super();
      this.el = typeof element === 'string' ? document.getElementById(element) : element;
      if (!this.el) throw new Error('EQDisplay: element not found');
      this.opts = Object.assign({
        width: 300, height: 150, bands: [
          { freq: 100, gain: 0, q: 1.0, type: 'lowshelf' },
          { freq: 1000, gain: 0, q: 1.0, type: 'peaking' },
          { freq: 10000, gain: 0, q: 1.0, type: 'highshelf' }
        ]
      }, options);
      this._dragBand = null;
      this._init();
    }

    _init() {
      this.el.classList.add('ql-eq-display');
      setStyles(this.el, {
        display: 'block', position: 'relative',
        width: px(this.opts.width), height: px(this.opts.height)
      });
      this._canvas = createEl('canvas', null, this.el);
      this._canvas.width = this.opts.width * 2;
      this._canvas.height = this.opts.height * 2;
      setStyles(this._canvas, { width: px(this.opts.width), height: px(this.opts.height), borderRadius: '8px', background: 'rgba(0,0,0,0.02)' });
      this._ctx = this._canvas.getContext('2d');
      this._bindEvents();
      this._draw();
    }

    _bindEvents() {
      let dragging = null;
      const getPos = (e) => {
        const rect = this._canvas.getBoundingClientRect();
        return { x: (e.clientX - rect.left) * 2, y: (e.clientY - rect.top) * 2 };
      };
      const onDown = (e) => {
        const p = getPos(e);
        // 找最近的节点
        let minDist = Infinity;
        this.opts.bands.forEach((band, i) => {
          const bx = this._freqToX(band.freq);
          const by = this._gainToY(band.gain);
          const d = Math.hypot(p.x - bx, p.y - by);
          if (d < 20 && d < minDist) { minDist = d; dragging = i; }
        });
      };
      const onMove = (e) => {
        if (dragging === null) return;
        const p = getPos(e);
        const band = this.opts.bands[dragging];
        band.freq = clamp(this._xToFreq(p.x), 20, 20000);
        band.gain = clamp(this._yToGain(p.y), -18, 18);
        this._draw();
        this.emit('change', { index: dragging, band });
      };
      const onUp = () => { dragging = null; };

      addEvent(this._canvas, 'mousedown', onDown);
      addEvent(document, 'mousemove', onMove);
      addEvent(document, 'mouseup', onUp);
      addEvent(this._canvas, 'touchstart', (e) => { onDown(e.touches[0]); e.preventDefault(); }, { passive: false });
      addEvent(document, 'touchmove', (e) => { if (dragging !== null) { onMove(e.touches[0]); e.preventDefault(); } }, { passive: false });
      addEvent(document, 'touchend', onUp);
    }

    _freqToX(f) { return (Math.log10(f / 20) / Math.log10(1000)) * this._canvas.width; }
    _xToFreq(x) { return 20 * Math.pow(10, (x / this._canvas.width) * Math.log10(1000)); }
    _gainToY(g) { return this._canvas.height / 2 - (g / 18) * (this._canvas.height / 2); }
    _yToGain(y) { return (this._canvas.height / 2 - y) / (this._canvas.height / 2) * 18; }

    _draw() {
      const ctx = this._ctx;
      const w = this._canvas.width;
      const h = this._canvas.height;
      ctx.clearRect(0, 0, w, h);

      // 网格
      ctx.strokeStyle = 'rgba(0,0,0,0.05)';
      ctx.lineWidth = 1;
      [100, 1000, 10000].forEach(f => {
        const x = this._freqToX(f);
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      });
      [-12, -6, 0, 6, 12].forEach(g => {
        const y = this._gainToY(g);
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      });

      // 曲线
      ctx.strokeStyle = 'var(--accent, #5b4dff)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 2) {
        const f = this._xToFreq(x);
        let gain = 0;
        this.opts.bands.forEach(band => {
          const bw = band.freq / band.q;
          const db = 10 * Math.log10(1 + Math.pow((f - band.freq) / (bw / 2), 2));
          gain += band.gain / (1 + Math.pow((f - band.freq) / (bw / 2), 2));
        });
        const y = this._gainToY(gain);
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // 节点
      this.opts.bands.forEach((band, i) => {
        const x = this._freqToX(band.freq);
        const y = this._gainToY(band.gain);
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'var(--accent, #5b4dff)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = 'var(--accent, #5b4dff)';
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText((i + 1).toString(), x, y + 5);
      });
    }

    setBands(bands) {
      this.opts.bands = bands;
      this._draw();
    }

    getElement() { return this.el; }
    destroy() {
      this.el.innerHTML = '';
      this.el.classList.remove('ql-eq-display');
    }
  }

  /* ========== 压缩器特性曲线 CompressorGraph ========== */
  class CompressorGraph extends EventEmitter {
    constructor(element, options = {}) {
      super();
      this.el = typeof element === 'string' ? document.getElementById(element) : element;
      if (!this.el) throw new Error('CompressorGraph: element not found');
      this.opts = Object.assign({
        width: 200, height: 200,
        threshold: -24, ratio: 4, knee: 6, makeup: 0
      }, options);
      this._init();
    }

    _init() {
      this.el.classList.add('ql-compressor-graph');
      setStyles(this.el, {
        display: 'block', position: 'relative',
        width: px(this.opts.width), height: px(this.opts.height)
      });
      this._canvas = createEl('canvas', null, this.el);
      this._canvas.width = this.opts.width * 2;
      this._canvas.height = this.opts.height * 2;
      setStyles(this._canvas, { width: px(this.opts.width), height: px(this.opts.height), borderRadius: '8px', background: 'rgba(0,0,0,0.02)' });
      this._ctx = this._canvas.getContext('2d');
      this._draw();
    }

    setParams(params) {
      Object.assign(this.opts, params);
      this._draw();
    }

    _draw() {
      const ctx = this._ctx;
      const w = this._canvas.width;
      const h = this._canvas.height;
      ctx.clearRect(0, 0, w, h);

      // 网格
      ctx.strokeStyle = 'rgba(0,0,0,0.05)';
      ctx.lineWidth = 1;
      for (let i = 0; i <= 10; i++) {
        const pos = (i / 10) * w;
        ctx.beginPath(); ctx.moveTo(pos, 0); ctx.lineTo(pos, h); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, pos); ctx.lineTo(w, pos); ctx.stroke();
      }

      // 曲线
      ctx.strokeStyle = 'var(--accent, #5b4dff)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      const dbToY = (db) => h - ((db + 60) / 60) * h;
      const dbToX = (db) => ((db + 60) / 60) * w;

      for (let dbIn = -60; dbIn <= 0; dbIn += 0.5) {
        let dbOut;
        if (dbIn < this.opts.threshold - this.opts.knee / 2) {
          dbOut = dbIn;
        } else if (dbIn > this.opts.threshold + this.opts.knee / 2) {
          dbOut = this.opts.threshold + (dbIn - this.opts.threshold) / this.opts.ratio;
        } else {
          const t = (dbIn - (this.opts.threshold - this.opts.knee / 2)) / this.opts.knee;
          dbOut = dbIn + (this.opts.threshold + (dbIn - this.opts.threshold) / this.opts.ratio - dbIn) * t * t * (3 - 2 * t);
        }
        dbOut += this.opts.makeup;
        const x = dbToX(dbIn);
        const y = dbToY(dbOut);
        if (dbIn === -60) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // 阈值线
      const ty = dbToY(this.opts.threshold);
      ctx.strokeStyle = 'rgba(239,68,68,0.5)';
      ctx.setLineDash([8, 4]);
      ctx.beginPath(); ctx.moveTo(0, ty); ctx.lineTo(w, ty); ctx.stroke();
      ctx.setLineDash([]);
    }

    getElement() { return this.el; }
    destroy() {
      this.el.innerHTML = '';
      this.el.classList.remove('ql-compressor-graph');
    }
  }

  /* ========== 波形显示 WaveformDisplay ========== */
  class WaveformDisplay extends EventEmitter {
    constructor(element, options = {}) {
      super();
      this.el = typeof element === 'string' ? document.getElementById(element) : element;
      if (!this.el) throw new Error('WaveformDisplay: element not found');
      this.opts = Object.assign({
        width: 600, height: 120, color: null, bgColor: null
      }, options);
      this._buffer = null;
      this._init();
    }

    _init() {
      this.el.classList.add('ql-waveform-display');
      setStyles(this.el, {
        display: 'block', position: 'relative',
        width: px(this.opts.width), height: px(this.opts.height)
      });
      this._canvas = createEl('canvas', null, this.el);
      this._canvas.width = this.opts.width * 2;
      this._canvas.height = this.opts.height * 2;
      setStyles(this._canvas, { width: px(this.opts.width), height: px(this.opts.height), borderRadius: '8px', background: this.opts.bgColor || 'rgba(0,0,0,0.02)' });
      this._ctx = this._canvas.getContext('2d');
    }

    setBuffer(buffer) {
      this._buffer = buffer;
      this._draw();
    }

    _draw() {
      const ctx = this._ctx;
      const w = this._canvas.width;
      const h = this._canvas.height;
      ctx.clearRect(0, 0, w, h);
      if (!this._buffer || !this._buffer.length) return;

      const accent = this.opts.color || getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#5b4dff';
      const step = Math.ceil(this._buffer.length / w);

      ctx.fillStyle = accent;
      for (let x = 0; x < w; x++) {
        let min = 1, max = -1;
        for (let i = 0; i < step; i++) {
          const idx = x * step + i;
          if (idx >= this._buffer.length) break;
          const v = this._buffer[idx];
          if (v < min) min = v;
          if (v > max) max = v;
        }
        const y1 = (0.5 - max * 0.45) * h;
        const y2 = (0.5 - min * 0.45) * h;
        ctx.fillRect(x, y1, 1, Math.max(1, y2 - y1));
      }
    }

    getElement() { return this.el; }
    destroy() {
      this.el.innerHTML = '';
      this.el.classList.remove('ql-waveform-display');
    }
  }

  /* ========== 实时频谱分析 SpectrumAnalyzer ========== */
  class SpectrumAnalyzer extends EventEmitter {
    constructor(element, options = {}) {
      super();
      this.el = typeof element === 'string' ? document.getElementById(element) : element;
      if (!this.el) throw new Error('SpectrumAnalyzer: element not found');
      this.opts = Object.assign({
        width: 600, height: 200, fftSize: 2048,
        smoothing: 0.8, barCount: 128, mode: 'bars' // bars / line / area
      }, options);
      this._analyser = null;
      this._running = false;
      this._data = new Uint8Array(0);
      this._init();
    }

    _init() {
      this.el.classList.add('ql-spectrum-analyzer');
      setStyles(this.el, {
        display: 'block', position: 'relative',
        width: px(this.opts.width), height: px(this.opts.height)
      });
      this._canvas = createEl('canvas', null, this.el);
      this._canvas.width = this.opts.width * 2;
      this._canvas.height = this.opts.height * 2;
      setStyles(this._canvas, { width: px(this.opts.width), height: px(this.opts.height), borderRadius: '8px', background: 'rgba(0,0,0,0.02)' });
      this._ctx = this._canvas.getContext('2d');
    }

    connect(analyser) {
      this._analyser = analyser;
      if (analyser) {
        this._data = new Uint8Array(analyser.frequencyBinCount);
        this.start();
      }
    }

    start() { this._running = true; this._drawLoop(); }
    stop() { this._running = false; }

    _drawLoop() {
      if (!this._running) return;
      if (this._analyser) this._analyser.getByteFrequencyData(this._data);
      this._draw();
      requestAnimationFrame(() => this._drawLoop());
    }

    _draw() {
      const ctx = this._ctx;
      const w = this._canvas.width;
      const h = this._canvas.height;
      ctx.clearRect(0, 0, w, h);
      if (!this._data.length) return;

      const barW = w / this.opts.barCount;
      const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#5b4dff';

      if (this.opts.mode === 'bars') {
        for (let i = 0; i < this.opts.barCount; i++) {
          const idx = Math.floor((i / this.opts.barCount) * this._data.length);
          const val = (this._data[idx] || 0) / 255;
          const bh = val * h;
          const hue = 200 + (i / this.opts.barCount) * 60;
          ctx.fillStyle = `hsla(${hue}, 80%, 60%, 0.9)`;
          ctx.fillRect(i * barW, h - bh, barW - 1, bh);
        }
      } else if (this.opts.mode === 'line') {
        ctx.strokeStyle = accent;
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let i = 0; i < this.opts.barCount; i++) {
          const idx = Math.floor((i / this.opts.barCount) * this._data.length);
          const val = (this._data[idx] || 0) / 255;
          const x = i * barW;
          const y = h - val * h;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      } else if (this.opts.mode === 'area') {
        ctx.fillStyle = accent + '40';
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let i = 0; i < this.opts.barCount; i++) {
          const idx = Math.floor((i / this.opts.barCount) * this._data.length);
          const val = (this._data[idx] || 0) / 255;
          ctx.lineTo(i * barW, h - val * h);
        }
        ctx.lineTo(w, h);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = accent;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < this.opts.barCount; i++) {
          const idx = Math.floor((i / this.opts.barCount) * this._data.length);
          const val = (this._data[idx] || 0) / 255;
          const x = i * barW;
          const y = h - val * h;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }

    getElement() { return this.el; }
    destroy() {
      this.stop();
      this.el.innerHTML = '';
      this.el.classList.remove('ql-spectrum-analyzer');
    }
  }

  /* ========== LFO 波形预览 LFOVisualizer ========== */
  class LFOVisualizer extends EventEmitter {
    constructor(element, options = {}) {
      super();
      this.el = typeof element === 'string' ? document.getElementById(element) : element;
      if (!this.el) throw new Error('LFOVisualizer: element not found');
      this.opts = Object.assign({
        width: 200, height: 80, wave: 'sine', // sine / square / saw / triangle / random
        rate: 1, depth: 1, phase: 0
      }, options);
      this._init();
    }

    _init() {
      this.el.classList.add('ql-lfo-visualizer');
      setStyles(this.el, {
        display: 'block', position: 'relative',
        width: px(this.opts.width), height: px(this.opts.height)
      });
      this._canvas = createEl('canvas', null, this.el);
      this._canvas.width = this.opts.width * 2;
      this._canvas.height = this.opts.height * 2;
      setStyles(this._canvas, { width: px(this.opts.width), height: px(this.opts.height), borderRadius: '8px', background: 'rgba(0,0,0,0.02)' });
      this._ctx = this._canvas.getContext('2d');
      this._draw();
    }

    setParams(params) {
      Object.assign(this.opts, params);
      this._draw();
    }

    _draw() {
      const ctx = this._ctx;
      const w = this._canvas.width;
      const h = this._canvas.height;
      ctx.clearRect(0, 0, w, h);

      const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#5b4dff';
      ctx.strokeStyle = accent;
      ctx.lineWidth = 3;
      ctx.beginPath();

      for (let x = 0; x <= w; x++) {
        const t = (x / w) * Math.PI * 2 * this.opts.rate + this.opts.phase;
        let y;
        switch (this.opts.wave) {
          case 'sine': y = Math.sin(t); break;
          case 'square': y = Math.sin(t) > 0 ? 1 : -1; break;
          case 'saw': y = ((t % (Math.PI * 2)) / (Math.PI * 2)) * 2 - 1; break;
          case 'triangle': y = Math.abs(((t % (Math.PI * 2)) / (Math.PI * 2)) * 2 - 1) * 2 - 1; break;
          default: y = Math.sin(t);
        }
        y = (0.5 - y * 0.4 * this.opts.depth) * h;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    getElement() { return this.el; }
    destroy() {
      this.el.innerHTML = '';
      this.el.classList.remove('ql-lfo-visualizer');
    }
  }

  /* ========== ADSR 包络可视化 ADSRVisualizer ========== */
  class ADSRVisualizer extends EventEmitter {
    constructor(element, options = {}) {
      super();
      this.el = typeof element === 'string' ? document.getElementById(element) : element;
      if (!this.el) throw new Error('ADSRVisualizer: element not found');
      this.opts = Object.assign({
        width: 200, height: 100,
        attack: 0.2, decay: 0.3, sustain: 0.6, release: 0.5
      }, options);
      this._init();
    }

    _init() {
      this.el.classList.add('ql-adsr-visualizer');
      setStyles(this.el, {
        display: 'block', position: 'relative',
        width: px(this.opts.width), height: px(this.opts.height)
      });
      this._canvas = createEl('canvas', null, this.el);
      this._canvas.width = this.opts.width * 2;
      this._canvas.height = this.opts.height * 2;
      setStyles(this._canvas, { width: px(this.opts.width), height: px(this.opts.height), borderRadius: '8px', background: 'rgba(0,0,0,0.02)' });
      this._ctx = this._canvas.getContext('2d');
      this._draw();
    }

    setParams(params) {
      Object.assign(this.opts, params);
      this._draw();
    }

    _draw() {
      const ctx = this._ctx;
      const w = this._canvas.width;
      const h = this._canvas.height;
      ctx.clearRect(0, 0, w, h);

      const total = this.opts.attack + this.opts.decay + 1 + this.opts.release;
      const xA = (this.opts.attack / total) * w;
      const xD = xA + (this.opts.decay / total) * w;
      const xS = xD + (1 / total) * w;
      const yS = h - this.opts.sustain * h * 0.8;

      const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#5b4dff';
      ctx.fillStyle = accent + '20';
      ctx.strokeStyle = accent;
      ctx.lineWidth = 3;

      ctx.beginPath();
      ctx.moveTo(0, h);
      ctx.lineTo(0, h * 0.1);
      ctx.lineTo(xA, h * 0.1);
      ctx.lineTo(xD, yS);
      ctx.lineTo(xS, yS);
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // 节点
      const nodes = [[0, h * 0.1], [xA, h * 0.1], [xD, yS], [xS, yS]];
      nodes.forEach(([nx, ny]) => {
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(nx, ny, 6, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = accent;
        ctx.lineWidth = 2;
        ctx.stroke();
      });
    }

    getElement() { return this.el; }
    destroy() {
      this.el.innerHTML = '';
      this.el.classList.remove('ql-adsr-visualizer');
    }
  }

  /* ========== 模态对话框 ModalDialog ========== */
  class ModalDialog extends EventEmitter {
    constructor(element, options = {}) {
      super();
      this.el = typeof element === 'string' ? document.getElementById(element) : element;
      this.opts = Object.assign({
        title: '提示', content: '', closable: true, overlay: true,
        buttons: [{ label: '确定', primary: true }]
      }, options);
      this._visible = false;
      if (this.el) this._init();
    }

    _init() {
      this.el.classList.add('ql-modal');
      setStyles(this.el, {
        position: 'fixed', inset: '0', zIndex: '20000',
        display: 'none', alignItems: 'center', justifyContent: 'center'
      });
      if (this.opts.overlay) {
        this._overlay = createEl('div', 'ql-modal-overlay', this.el);
        setStyles(this._overlay, { position: 'absolute', inset: '0', background: 'rgba(0,0,0,0.4)' });
        addEvent(this._overlay, 'click', () => { if (this.opts.closable) this.close(); });
      }
      this._content = createEl('div', 'ql-modal-content', this.el);
      setStyles(this._content, {
        position: 'relative', background: 'var(--card-bg)',
        borderRadius: 'var(--radius-lg)', padding: '24px',
        minWidth: '300px', maxWidth: '90vw', maxHeight: '80vh',
        overflow: 'auto', boxShadow: 'var(--shadow-lg)'
      });
      this._render();
    }

    _render() {
      this._content.innerHTML = '';
      const header = createEl('div', 'ql-modal-header', this._content);
      setStyles(header, { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' });
      const title = createEl('h3', null, header);
      title.textContent = this.opts.title;
      setStyles(title, { margin: '0', fontSize: '16px', color: 'var(--text)' });

      if (this.opts.closable) {
        const closeBtn = createEl('button', null, header);
        closeBtn.textContent = '×';
        setStyles(closeBtn, { background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--text2)' });
        addEvent(closeBtn, 'click', () => this.close());
      }

      const body = createEl('div', 'ql-modal-body', this._content);
      setStyles(body, { fontSize: '14px', color: 'var(--text2)', lineHeight: '1.6', marginBottom: '16px' });
      if (typeof this.opts.content === 'string') body.innerHTML = this.opts.content;
      else if (this.opts.content) body.appendChild(this.opts.content);

      const footer = createEl('div', 'ql-modal-footer', this._content);
      setStyles(footer, { display: 'flex', justifyContent: 'flex-end', gap: '8px' });
      (this.opts.buttons || []).forEach(btn => {
        const b = createEl('button', null, footer);
        b.textContent = btn.label;
        setStyles(b, {
          padding: '8px 16px', borderRadius: '8px', border: 'none',
          fontSize: '13px', cursor: 'pointer',
          background: btn.primary ? 'var(--accent)' : 'rgba(0,0,0,0.06)',
          color: btn.primary ? '#fff' : 'var(--text2)'
        });
        addEvent(b, 'click', () => {
          this.emit('button', btn);
          if (btn.onClick) btn.onClick();
          if (btn.primary || btn.close !== false) this.close();
        });
      });
    }

    show() {
      if (!this.el) {
        this.el = document.createElement('div');
        document.body.appendChild(this.el);
        this._init();
      }
      this.el.style.display = 'flex';
      this._visible = true;
      this.emit('show');
    }

    close() {
      if (this.el) this.el.style.display = 'none';
      this._visible = false;
      this.emit('close');
    }

    setContent(content) { this.opts.content = content; this._render(); }
    setTitle(title) { this.opts.title = title; this._render(); }

    getElement() { return this.el; }
    destroy() {
      if (this.el && this.el.parentNode) this.el.parentNode.removeChild(this.el);
    }
  }

  /* ========== Toast 通知 ToastNotification ========== */
  class ToastNotification extends EventEmitter {
    constructor(element, options = {}) {
      super();
      this.el = typeof element === 'string' ? document.getElementById(element) : element;
      if (!this.el) {
        this.el = document.createElement('div');
        document.body.appendChild(this.el);
      }
      this.opts = Object.assign({
        position: 'top-right', duration: 3000, maxCount: 5
      }, options);
      this._toasts = [];
      this._init();
    }

    _init() {
      this.el.classList.add('ql-toast-container');
      setStyles(this.el, {
        position: 'fixed', zIndex: '25000',
        top: this.opts.position.includes('top') ? '16px' : 'auto',
        bottom: this.opts.position.includes('bottom') ? '16px' : 'auto',
        left: this.opts.position.includes('left') ? '16px' : 'auto',
        right: this.opts.position.includes('right') ? '16px' : 'auto',
        display: 'flex', flexDirection: 'column', gap: '8px',
        pointerEvents: 'none'
      });
    }

    show(message, type = 'info') {
      const toast = createEl('div', 'ql-toast', this.el);
      const colors = {
        success: '#4ade80', error: '#ef4444', warning: '#f59e0b', info: 'var(--accent, #5b4dff)'
      };
      setStyles(toast, {
        background: 'var(--card-bg)', color: 'var(--text)',
        padding: '10px 16px', borderRadius: '10px',
        boxShadow: 'var(--shadow-md)', fontSize: '13px',
        borderLeft: `3px solid ${colors[type] || colors.info}`,
        display: 'flex', alignItems: 'center', gap: '8px',
        pointerEvents: 'auto', minWidth: '200px', maxWidth: '360px',
        animation: 'ql-toast-in 0.3s ease'
      });

      const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : type === 'warning' ? '!' : 'ℹ';
      toast.innerHTML = `<span style="font-weight:700;color:${colors[type] || colors.info}">${icon}</span><span>${message}</span>`;

      this._toasts.push(toast);
      if (this._toasts.length > this.opts.maxCount) {
        const old = this._toasts.shift();
        if (old && old.parentNode) old.parentNode.removeChild(old);
      }

      setTimeout(() => {
        toast.style.animation = 'ql-toast-out 0.3s ease forwards';
        setTimeout(() => {
          if (toast.parentNode) toast.parentNode.removeChild(toast);
          this._toasts = this._toasts.filter(t => t !== toast);
        }, 300);
      }, this.opts.duration);

      this.emit('show', { message, type });
    }

    getElement() { return this.el; }
    destroy() {
      this.el.innerHTML = '';
      this.el.classList.remove('ql-toast-container');
    }
  }

  /* ========== 右键菜单 ContextMenu ========== */
  class ContextMenu extends EventEmitter {
    constructor(element, options = {}) {
      super();
      this.el = typeof element === 'string' ? document.getElementById(element) : element;
      this.opts = Object.assign({ items: [] }, options);
      this._visible = false;
      this._target = null;
      this._init();
    }

    _init() {
      if (this.el) {
        addEvent(this.el, 'contextmenu', (e) => {
          e.preventDefault();
          this.show(e.clientX, e.clientY, e.target);
        });
      }
      addEvent(document, 'click', () => this.hide());
      addEvent(document, 'scroll', () => this.hide(), true);
    }

    show(x, y, target) {
      this._target = target;
      if (!this._menu) {
        this._menu = createEl('div', 'ql-context-menu', document.body);
        setStyles(this._menu, {
          position: 'fixed', zIndex: '30000',
          background: 'var(--card-bg)', borderRadius: '10px',
          boxShadow: 'var(--shadow-lg)', border: '1px solid var(--border)',
          padding: '6px 0', minWidth: '160px', display: 'none',
          fontSize: '13px'
        });
      }
      this._menu.innerHTML = '';
      this._menu.style.display = 'block';
      this._menu.style.left = px(x);
      this._menu.style.top = px(y);

      (this.opts.items || []).forEach(item => {
        if (item === '-') {
          const sep = createEl('div', null, this._menu);
          setStyles(sep, { height: '1px', background: 'var(--border)', margin: '4px 0' });
          return;
        }
        const row = createEl('div', 'ql-context-item', this._menu);
        row.textContent = item.label;
        setStyles(row, {
          padding: '8px 16px', cursor: 'pointer', color: 'var(--text)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between'
        });
        row.addEventListener('mouseenter', () => { row.style.background = 'rgba(0,0,0,0.04)'; });
        row.addEventListener('mouseleave', () => { row.style.background = 'transparent'; });
        addEvent(row, 'click', (e) => {
          e.stopPropagation();
          this.hide();
          if (item.action) item.action(this._target);
          this.emit('select', item);
        });
        if (item.shortcut) {
          const sc = createEl('span', null, row);
          sc.textContent = item.shortcut;
          setStyles(sc, { fontSize: '11px', color: 'var(--text3)', marginLeft: '16px' });
        }
      });

      // 边界检测
      const rect = this._menu.getBoundingClientRect();
      if (rect.right > window.innerWidth) this._menu.style.left = px(window.innerWidth - rect.width - 8);
      if (rect.bottom > window.innerHeight) this._menu.style.top = px(window.innerHeight - rect.height - 8);

      this._visible = true;
      this.emit('show');
    }

    hide() {
      if (this._menu) this._menu.style.display = 'none';
      this._visible = false;
      this.emit('hide');
    }

    getElement() { return this.el; }
    destroy() {
      if (this._menu && this._menu.parentNode) this._menu.parentNode.removeChild(this._menu);
    }
  }

  /* ========== 工具提示 Tooltip ========== */
  class Tooltip extends EventEmitter {
    constructor(element, options = {}) {
      super();
      this.el = typeof element === 'string' ? document.getElementById(element) : element;
      this.opts = Object.assign({
        text: '', position: 'top', delay: 300, offset: 8
      }, options);
      this._timer = null;
      this._tip = null;
      this._init();
    }

    _init() {
      if (!this.el) return;
      addEvent(this.el, 'mouseenter', () => {
        this._timer = setTimeout(() => this._show(), this.opts.delay);
      });
      addEvent(this.el, 'mouseleave', () => this._hide());
      addEvent(this.el, 'focus', () => this._show());
      addEvent(this.el, 'blur', () => this._hide());
    }

    _show() {
      if (!this._tip) {
        this._tip = createEl('div', 'ql-tooltip', document.body);
        setStyles(this._tip, {
          position: 'fixed', zIndex: '35000',
          background: 'rgba(0,0,0,0.85)', color: '#fff',
          padding: '6px 10px', borderRadius: '6px',
          fontSize: '12px', pointerEvents: 'none',
          whiteSpace: 'nowrap', opacity: '0', transition: 'opacity 0.15s'
        });
      }
      this._tip.textContent = this.opts.text;
      this._tip.style.opacity = '1';

      const rect = this.el.getBoundingClientRect();
      const tipRect = this._tip.getBoundingClientRect();
      let x, y;
      switch (this.opts.position) {
        case 'top': x = rect.left + rect.width / 2 - tipRect.width / 2; y = rect.top - tipRect.height - this.opts.offset; break;
        case 'bottom': x = rect.left + rect.width / 2 - tipRect.width / 2; y = rect.bottom + this.opts.offset; break;
        case 'left': x = rect.left - tipRect.width - this.opts.offset; y = rect.top + rect.height / 2 - tipRect.height / 2; break;
        case 'right': x = rect.right + this.opts.offset; y = rect.top + rect.height / 2 - tipRect.height / 2; break;
      }
      this._tip.style.left = px(x);
      this._tip.style.top = px(y);
    }

    _hide() {
      if (this._timer) { clearTimeout(this._timer); this._timer = null; }
      if (this._tip) this._tip.style.opacity = '0';
    }

    setText(text) { this.opts.text = text; }
    getElement() { return this.el; }
    destroy() {
      if (this._tip && this._tip.parentNode) this._tip.parentNode.removeChild(this._tip);
    }
  }

  /* ========== 下拉菜单 Dropdown ========== */
  class Dropdown extends EventEmitter {
    constructor(element, options = {}) {
      super();
      this.el = typeof element === 'string' ? document.getElementById(element) : element;
      if (!this.el) throw new Error('Dropdown: element not found');
      this.opts = Object.assign({
        items: [], placeholder: '请选择', value: null
      }, options);
      this._open = false;
      this._init();
    }

    _init() {
      this.el.classList.add('ql-dropdown');
      setStyles(this.el, { position: 'relative', display: 'inline-block' });

      this._trigger = createEl('button', 'ql-dropdown-trigger', this.el);
      setStyles(this._trigger, {
        padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)',
        background: 'var(--input-bg)', color: 'var(--text)', fontSize: '13px',
        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px'
      });
      this._updateTrigger();

      this._list = createEl('div', 'ql-dropdown-list', this.el);
      setStyles(this._list, {
        position: 'absolute', top: 'calc(100% + 4px)', left: '0',
        background: 'var(--card-bg)', borderRadius: '10px',
        boxShadow: 'var(--shadow-lg)', border: '1px solid var(--border)',
        minWidth: '100%', display: 'none', zIndex: '20000', overflow: 'hidden'
      });

      this._renderItems();
      this._bindEvents();
    }

    _renderItems() {
      this._list.innerHTML = '';
      this.opts.items.forEach(item => {
        const row = createEl('div', 'ql-dropdown-item', this._list);
        row.textContent = typeof item === 'object' ? item.label : item;
        row.dataset.value = typeof item === 'object' ? item.value : item;
        setStyles(row, {
          padding: '8px 12px', cursor: 'pointer', fontSize: '13px', color: 'var(--text)'
        });
        row.addEventListener('mouseenter', () => { row.style.background = 'rgba(0,0,0,0.04)'; });
        row.addEventListener('mouseleave', () => { row.style.background = 'transparent'; });
        addEvent(row, 'click', () => {
          this.setValue(row.dataset.value);
          this.close();
          this.emit('select', row.dataset.value);
        });
      });
    }

    _bindEvents() {
      addEvent(this._trigger, 'click', (e) => {
        e.stopPropagation();
        this._open ? this.close() : this.open();
      });
      addEvent(document, 'click', () => this.close());
    }

    _updateTrigger() {
      const item = this.opts.items.find(i => (typeof i === 'object' ? i.value : i) === this.opts.value);
      this._trigger.textContent = item ? (typeof item === 'object' ? item.label : item) : this.opts.placeholder;
      this._trigger.innerHTML += '<span style="margin-left:auto;font-size:10px;">▼</span>';
    }

    open() { this._open = true; this._list.style.display = 'block'; this.emit('open'); }
    close() { this._open = false; this._list.style.display = 'none'; this.emit('close'); }
    setValue(v) { this.opts.value = v; this._updateTrigger(); this.emit('change', v); }
    getValue() { return this.opts.value; }

    getElement() { return this.el; }
    destroy() {
      this.el.innerHTML = '';
      this.el.classList.remove('ql-dropdown');
    }
  }

  /* ========== 滑块 Slider ========== */
  class Slider extends EventEmitter {
    constructor(element, options = {}) {
      super();
      this.el = typeof element === 'string' ? document.getElementById(element) : element;
      if (!this.el) throw new Error('Slider: element not found');
      this.opts = Object.assign({
        min: 0, max: 100, value: 50, step: 1,
        orientation: 'horizontal', showValue: true
      }, options);
      this._value = clamp(this.opts.value, this.opts.min, this.opts.max);
      this._init();
    }

    _init() {
      this.el.classList.add('ql-slider');
      const isH = this.opts.orientation === 'horizontal';
      setStyles(this.el, {
        display: 'flex', alignItems: 'center', gap: '8px',
        flexDirection: isH ? 'row' : 'column'
      });

      this._track = createEl('div', 'ql-slider-track', this.el);
      setStyles(this._track, {
        position: 'relative',
        width: isH ? '100%' : '4px', height: isH ? '4px' : '120px',
        background: 'rgba(0,0,0,0.06)', borderRadius: '2px',
        cursor: 'pointer', flex: isH ? '1' : 'none'
      });

      this._fill = createEl('div', 'ql-slider-fill', this._track);
      setStyles(this._fill, {
        position: 'absolute', background: 'var(--accent, #5b4dff)', borderRadius: '2px',
        [isH ? 'left' : 'bottom']: '0',
        [isH ? 'top' : 'left']: '0',
        [isH ? 'height' : 'width']: '100%',
        [isH ? 'width' : 'height']: '0%'
      });

      this._thumb = createEl('div', 'ql-slider-thumb', this._track);
      setStyles(this._thumb, {
        position: 'absolute', width: '14px', height: '14px',
        background: '#fff', border: '2px solid var(--accent, #5b4dff)',
        borderRadius: '50%', cursor: 'grab'
      });

      if (this.opts.showValue) {
        this._label = createEl('span', 'ql-slider-value', this.el);
        setStyles(this._label, { fontSize: '12px', color: 'var(--text2)', minWidth: '30px', textAlign: 'center' });
      }

      this._updateUI();
      this._bindEvents();
    }

    _bindEvents() {
      let dragging = false;
      const isH = this.opts.orientation === 'horizontal';
      const onMove = (e) => {
        if (!dragging) return;
        const rect = this._track.getBoundingClientRect();
        const client = isH ? e.clientX : e.clientY;
        const pos = isH
          ? (client - rect.left) / rect.width
          : 1 - (client - rect.top) / rect.height;
        const raw = this.opts.min + clamp(pos, 0, 1) * (this.opts.max - this.opts.min);
        this.setValue(Math.round(raw / this.opts.step) * this.opts.step);
      };
      addEvent(this._track, 'mousedown', () => { dragging = true; });
      addEvent(document, 'mousemove', onMove);
      addEvent(document, 'mouseup', () => { dragging = false; });
    }

    _updateUI() {
      const pct = (this._value - this.opts.min) / (this.opts.max - this.opts.min) * 100;
      const isH = this.opts.orientation === 'horizontal';
      this._fill.style[isH ? 'width' : 'height'] = pct + '%';
      this._thumb.style[isH ? 'left' : 'bottom'] = `calc(${pct}% - 7px)`;
      if (this._label) this._label.textContent = this._value;
    }

    setValue(v) {
      const nv = clamp(v, this.opts.min, this.opts.max);
      if (nv === this._value) return;
      this._value = nv;
      this._updateUI();
      this.emit('change', this._value);
    }

    getValue() { return this._value; }
    getElement() { return this.el; }
    destroy() {
      this.el.innerHTML = '';
      this.el.classList.remove('ql-slider');
    }
  }

  /* ========== 按钮组 ButtonGroup ========== */
  class ButtonGroup extends EventEmitter {
    constructor(element, options = {}) {
      super();
      this.el = typeof element === 'string' ? document.getElementById(element) : element;
      if (!this.el) throw new Error('ButtonGroup: element not found');
      this.opts = Object.assign({
        buttons: [], multi: false, value: null
      }, options);
      this._value = this.opts.value;
      this._init();
    }

    _init() {
      this.el.classList.add('ql-button-group');
      setStyles(this.el, {
        display: 'inline-flex', gap: '0', borderRadius: '8px',
        overflow: 'hidden', border: '1px solid var(--border)'
      });
      this._render();
    }

    _render() {
      this.el.innerHTML = '';
      this.opts.buttons.forEach((btn, i) => {
        const b = createEl('button', 'ql-group-btn', this.el);
        b.textContent = typeof btn === 'object' ? btn.label : btn;
        const val = typeof btn === 'object' ? btn.value : btn;
        b.dataset.value = val;
        const active = this.opts.multi
          ? (Array.isArray(this._value) && this._value.includes(val))
          : this._value === val;
        setStyles(b, {
          padding: '6px 12px', border: 'none', background: active ? 'var(--accent)' : 'var(--input-bg)',
          color: active ? '#fff' : 'var(--text2)', fontSize: '12px', cursor: 'pointer',
          borderRight: i < this.opts.buttons.length - 1 ? '1px solid var(--border)' : 'none'
        });
        addEvent(b, 'click', () => {
          if (this.opts.multi) {
            const arr = Array.isArray(this._value) ? [...this._value] : [];
            const idx = arr.indexOf(val);
            if (idx >= 0) arr.splice(idx, 1); else arr.push(val);
            this.setValue(arr);
          } else {
            this.setValue(val);
          }
          this.emit('change', this._value);
        });
      });
    }

    setValue(v) {
      this._value = v;
      this._render();
    }

    getValue() { return this._value; }
    getElement() { return this.el; }
    destroy() {
      this.el.innerHTML = '';
      this.el.classList.remove('ql-button-group');
    }
  }

  /* ========== 标签面板 TabPanel ========== */
  class TabPanel extends EventEmitter {
    constructor(element, options = {}) {
      super();
      this.el = typeof element === 'string' ? document.getElementById(element) : element;
      if (!this.el) throw new Error('TabPanel: element not found');
      this.opts = Object.assign({ tabs: [], active: 0 }, options);
      this._active = this.opts.active;
      this._init();
    }

    _init() {
      this.el.classList.add('ql-tab-panel');
      setStyles(this.el, { display: 'flex', flexDirection: 'column' });
      this._header = createEl('div', 'ql-tab-header', this.el);
      setStyles(this._header, {
        display: 'flex', gap: '0', borderBottom: '1px solid var(--border)'
      });
      this._body = createEl('div', 'ql-tab-body', this.el);
      setStyles(this._body, { padding: '12px', flex: '1' });
      this._render();
    }

    _render() {
      this._header.innerHTML = '';
      this.opts.tabs.forEach((tab, i) => {
        const btn = createEl('button', 'ql-tab-btn', this._header);
        btn.textContent = typeof tab === 'object' ? tab.label : tab;
        const active = i === this._active;
        setStyles(btn, {
          padding: '10px 16px', border: 'none', background: 'transparent',
          color: active ? 'var(--accent)' : 'var(--text2)',
          borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
          fontSize: '13px', fontWeight: active ? '600' : '400', cursor: 'pointer'
        });
        addEvent(btn, 'click', () => { this.setActive(i); });
      });
      this._body.innerHTML = '';
      const tab = this.opts.tabs[this._active];
      if (tab && tab.content) {
        if (typeof tab.content === 'string') this._body.innerHTML = tab.content;
        else this._body.appendChild(tab.content);
      }
    }

    setActive(i) {
      this._active = i;
      this._render();
      this.emit('change', i);
    }

    getActive() { return this._active; }
    getElement() { return this.el; }
    destroy() {
      this.el.innerHTML = '';
      this.el.classList.remove('ql-tab-panel');
    }
  }

  /* ========== 树形视图 TreeView ========== */
  class TreeView extends EventEmitter {
    constructor(element, options = {}) {
      super();
      this.el = typeof element === 'string' ? document.getElementById(element) : element;
      if (!this.el) throw new Error('TreeView: element not found');
      this.opts = Object.assign({
        data: [], selectable: true, multiSelect: false
      }, options);
      this._selected = new Set();
      this._init();
    }

    _init() {
      this.el.classList.add('ql-tree-view');
      setStyles(this.el, {
        fontSize: '13px', color: 'var(--text)', overflow: 'auto'
      });
      this._render();
    }

    _render() {
      this.el.innerHTML = '';
      this.opts.data.forEach(node => this._renderNode(node, this.el, 0));
    }

    _renderNode(node, parent, depth) {
      const row = createEl('div', 'ql-tree-node', parent);
      setStyles(row, {
        display: 'flex', alignItems: 'center', gap: '4px',
        padding: '4px 8px', paddingLeft: px(8 + depth * 16),
        cursor: 'pointer', borderRadius: '6px'
      });
      const hasChildren = node.children && node.children.length;
      const expander = createEl('span', 'ql-tree-expander', row);
      expander.textContent = hasChildren ? (node.expanded ? '▼' : '▶') : ' ';
      setStyles(expander, { width: '14px', fontSize: '10px', color: 'var(--text3)', textAlign: 'center' });

      const icon = createEl('span', 'ql-tree-icon', row);
      icon.textContent = node.icon || (hasChildren ? '📁' : '📄');
      setStyles(icon, { fontSize: '14px' });

      const label = createEl('span', 'ql-tree-label', row);
      label.textContent = node.label;
      setStyles(label, { flex: '1' });

      if (this._selected.has(node.id)) {
        row.style.background = 'rgba(91,77,255,0.08)';
        row.style.color = 'var(--accent)';
      }

      addEvent(row, 'click', (e) => {
        e.stopPropagation();
        if (hasChildren && e.target === expander) {
          node.expanded = !node.expanded;
          this._render();
        } else {
          this._select(node.id);
          this.emit('select', node);
        }
      });

      if (hasChildren && node.expanded) {
        node.children.forEach(child => this._renderNode(child, parent, depth + 1));
      }
    }

    _select(id) {
      if (!this.opts.selectable) return;
      if (!this.opts.multiSelect) this._selected.clear();
      if (this._selected.has(id)) this._selected.delete(id);
      else this._selected.add(id);
      this._render();
    }

    setData(data) { this.opts.data = data; this._render(); }
    getSelected() { return Array.from(this._selected); }

    getElement() { return this.el; }
    destroy() {
      this.el.innerHTML = '';
      this.el.classList.remove('ql-tree-view');
    }
  }

  /* ========== 颜色选择器 ColorPicker ========== */
  class ColorPicker extends EventEmitter {
    constructor(element, options = {}) {
      super();
      this.el = typeof element === 'string' ? document.getElementById(element) : element;
      if (!this.el) throw new Error('ColorPicker: element not found');
      this.opts = Object.assign({
        value: '#5b4dff', showInput: true, showPalette: true
      }, options);
      this._init();
    }

    _init() {
      this.el.classList.add('ql-color-picker');
      setStyles(this.el, { display: 'flex', alignItems: 'center', gap: '8px' });

      this._preview = createEl('div', 'ql-color-preview', this.el);
      setStyles(this._preview, {
        width: '28px', height: '28px', borderRadius: '6px',
        background: this.opts.value, cursor: 'pointer',
        border: '1px solid var(--border)'
      });

      if (this.opts.showInput) {
        this._input = createEl('input', 'ql-color-input', this.el);
        this._input.type = 'text';
        this._input.value = this.opts.value;
        setStyles(this._input, {
          width: '80px', padding: '4px 8px', borderRadius: '6px',
          border: '1px solid var(--border)', background: 'var(--input-bg)',
          color: 'var(--text)', fontSize: '12px'
        });
        addEvent(this._input, 'change', () => this.setValue(this._input.value));
      }

      if (this.opts.showPalette) {
        this._palette = createEl('div', 'ql-color-palette', this.el);
        setStyles(this._palette, { display: 'flex', gap: '4px', flexWrap: 'wrap', maxWidth: '120px' });
        ['#ef4444','#f59e0b','#4ade80','#3b82f6','#8b5cf6','#ec4899','#1a1a1a','#fff'].forEach(c => {
          const swatch = createEl('div', null, this._palette);
          setStyles(swatch, {
            width: '16px', height: '16px', borderRadius: '4px',
            background: c, cursor: 'pointer', border: '1px solid var(--border)'
          });
          addEvent(swatch, 'click', () => this.setValue(c));
        });
      }

      addEvent(this._preview, 'click', () => {
        const input = document.createElement('input');
        input.type = 'color';
        input.value = this.opts.value;
        input.addEventListener('input', (e) => this.setValue(e.target.value));
        input.click();
      });
    }

    setValue(v) {
      this.opts.value = v;
      this._preview.style.background = v;
      if (this._input) this._input.value = v;
      this.emit('change', v);
    }

    getValue() { return this.opts.value; }
    getElement() { return this.el; }
    destroy() {
      this.el.innerHTML = '';
      this.el.classList.remove('ql-color-picker');
    }
  }

  /* ========== 进度条 ProgressBar ========== */
  class ProgressBar extends EventEmitter {
    constructor(element, options = {}) {
      super();
      this.el = typeof element === 'string' ? document.getElementById(element) : element;
      if (!this.el) throw new Error('ProgressBar: element not found');
      this.opts = Object.assign({
        value: 0, max: 100, height: 6, color: null, animated: false
      }, options);
      this._init();
    }

    _init() {
      this.el.classList.add('ql-progress-bar');
      setStyles(this.el, {
        width: '100%', height: px(this.opts.height),
        background: 'rgba(0,0,0,0.06)', borderRadius: px(this.opts.height / 2),
        overflow: 'hidden'
      });
      this._fill = createEl('div', 'ql-progress-fill', this.el);
      setStyles(this._fill, {
        height: '100%', width: '0%',
        background: this.opts.color || 'var(--accent, #5b4dff)',
        borderRadius: px(this.opts.height / 2),
        transition: this.opts.animated ? 'width 0.3s ease' : 'none'
      });
      this.setValue(this.opts.value);
    }

    setValue(v) {
      const pct = clamp(v / this.opts.max * 100, 0, 100);
      this._fill.style.width = pct + '%';
      this.emit('change', v);
    }

    setColor(c) { this._fill.style.background = c; }
    getElement() { return this.el; }
    destroy() {
      this.el.innerHTML = '';
      this.el.classList.remove('ql-progress-bar');
    }
  }

  /* ========== 加载动画 LoadingSpinner ========== */
  class LoadingSpinner extends EventEmitter {
    constructor(element, options = {}) {
      super();
      this.el = typeof element === 'string' ? document.getElementById(element) : element;
      if (!this.el) {
        this.el = document.createElement('div');
        document.body.appendChild(this.el);
      }
      this.opts = Object.assign({
        size: 40, color: null, thickness: 3, text: ''
      }, options);
      this._init();
    }

    _init() {
      this.el.classList.add('ql-loading-spinner');
      setStyles(this.el, {
        display: 'none', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: '8px'
      });
      this._svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      this._svg.setAttribute('width', this.opts.size);
      this._svg.setAttribute('height', this.opts.size);
      this._svg.setAttribute('viewBox', '0 0 50 50');
      this._circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      this._circle.setAttribute('cx', '25');
      this._circle.setAttribute('cy', '25');
      this._circle.setAttribute('r', '20');
      this._circle.setAttribute('fill', 'none');
      this._circle.setAttribute('stroke', this.opts.color || 'var(--accent, #5b4dff)');
      this._circle.setAttribute('stroke-width', this.opts.thickness);
      this._circle.setAttribute('stroke-linecap', 'round');
      this._circle.setAttribute('stroke-dasharray', '80');
      this._circle.setAttribute('stroke-dashoffset', '0');
      this._circle.style.animation = 'ql-spin 1s linear infinite';
      this._svg.appendChild(this._circle);
      this.el.appendChild(this._svg);

      if (this.opts.text) {
        this._text = createEl('span', null, this.el);
        this._text.textContent = this.opts.text;
        setStyles(this._text, { fontSize: '12px', color: 'var(--text2)' });
      }
    }

    show() { this.el.style.display = 'flex'; this.emit('show'); }
    hide() { this.el.style.display = 'none'; this.emit('hide'); }

    getElement() { return this.el; }
    destroy() {
      this.el.innerHTML = '';
      this.el.classList.remove('ql-loading-spinner');
    }
  }

  // 导出所有组件
  return {
    EventEmitter,
    Knob, Fader, Meter, Scope, Spectrum,
    PianoKeyboard, TransportBar, Timeline, Clip, TrackHeader,
    MixerChannel, EQDisplay, CompressorGraph,
    WaveformDisplay, SpectrumAnalyzer, LFOVisualizer, ADSRVisualizer,
    ModalDialog, ToastNotification, ContextMenu, Tooltip,
    Dropdown, Slider, ButtonGroup, TabPanel, TreeView,
    ColorPicker, ProgressBar, LoadingSpinner,
    themes, setTheme(name) { currentTheme = name; document.documentElement.dataset.qlTheme = name; }
  };
})();

/* ================= CSS 动画关键帧 ================= */
(function injectStyles() {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes ql-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    @keyframes ql-toast-in { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes ql-toast-out { from { opacity: 1; transform: translateY(0); } to { opacity: 0; transform: translateY(-8px); } }
    .ql-knob:active .ql-knob-label { color: var(--accent); }
    .ql-fader-thumb:active { transform: scale(1.1); }
    .ql-meter-segments > div { transition: background 0.05s; }
    .ql-piano-white-key:active, .ql-piano-black-key:active { transform: translateY(2px); }
    .ql-transport-btn.active { background: var(--accent) !important; color: #fff !important; border-color: var(--accent) !important; }
    .ql-clip.selected { box-shadow: 0 0 0 2px #fff, 0 0 0 4px var(--accent); }
    .ql-modal-content { animation: ql-toast-in 0.2s ease; }
    .ql-dropdown-list { animation: ql-toast-in 0.15s ease; }
    .ql-context-menu { animation: ql-toast-in 0.1s ease; }
    .ql-slider-thumb:active { cursor: grabbing; transform: scale(1.1); }
    .ql-group-btn:hover { background: rgba(0,0,0,0.04); }
    .ql-tree-node:hover { background: rgba(0,0,0,0.03); }
    .ql-tab-btn:hover { color: var(--accent); }
  `;
  document.head.appendChild(style);
})();

console.log('[青鸾 UI] 组件系统已加载 v3.0');
