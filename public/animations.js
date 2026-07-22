/**
 * 青鸾 DAW — 动画效果库
 * QingluanAnimations
 * 包含：淡入淡出、滑入滑出、缩放、水波纹、彩纸、打字机、跑马灯、视差、闪光、
 * 脉冲、弹跳、摇晃、旋转、形状变换、SVG描边、页面转场、滚动揭示、数字滚动、
 * 均衡器条、粒子背景，以及完整 Easing 缓动函数集。
 */

const Easing = {
  linear: t => t,
  easeInQuad: t => t * t,
  easeOutQuad: t => 1 - (1 - t) * (1 - t),
  easeInOutQuad: t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
  easeInCubic: t => t * t * t,
  easeOutCubic: t => 1 - Math.pow(1 - t, 3),
  easeInOutCubic: t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  easeInQuart: t => t * t * t * t,
  easeOutQuart: t => 1 - Math.pow(1 - t, 4),
  easeInOutQuart: t => t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2,
  easeInQuint: t => t * t * t * t * t,
  easeOutQuint: t => 1 - Math.pow(1 - t, 5),
  easeInOutQuint: t => t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2,
  easeInSine: t => 1 - Math.cos((t * Math.PI) / 2),
  easeOutSine: t => Math.sin((t * Math.PI) / 2),
  easeInOutSine: t => -(Math.cos(Math.PI * t) - 1) / 2,
  easeInExpo: t => t === 0 ? 0 : Math.pow(2, 10 * (t - 1)),
  easeOutExpo: t => t === 1 ? 1 : 1 - Math.pow(2, -10 * t),
  easeInOutExpo: t => t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2,
  easeInCirc: t => 1 - Math.sqrt(1 - Math.pow(t, 2)),
  easeOutCirc: t => Math.sqrt(1 - Math.pow(t - 1, 2)),
  easeInOutCirc: t => t < 0.5 ? (1 - Math.sqrt(1 - Math.pow(2 * t, 2))) / 2 : (Math.sqrt(1 - Math.pow(-2 * t + 2, 2)) + 1) / 2,
  easeInBack: t => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return c3 * t * t * t - c1 * t * t;
  },
  easeOutBack: t => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  easeInOutBack: t => {
    const c1 = 1.70158;
    const c2 = c1 * 1.525;
    return t < 0.5
      ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
      : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2;
  },
  easeInElastic: t => {
    const c4 = (2 * Math.PI) / 3;
    if (t === 0) return 0;
    if (t === 1) return 1;
    return -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * c4);
  },
  easeOutElastic: t => {
    const c4 = (2 * Math.PI) / 3;
    if (t === 0) return 0;
    if (t === 1) return 1;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  },
  easeInOutElastic: t => {
    const c5 = (2 * Math.PI) / 4.5;
    if (t === 0) return 0;
    if (t === 1) return 1;
    if (t < 0.5) {
      return -(Math.pow(2, 20 * t - 10) * Math.sin((20 * t - 11.125) * c5)) / 2;
    }
    return (Math.pow(2, -20 * t + 10) * Math.sin((20 * t - 11.125) * c5)) / 2 + 1;
  },
  easeInBounce: t => 1 - Easing.easeOutBounce(1 - t),
  easeOutBounce: t => {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) {
      return n1 * t * t;
    } else if (t < 2 / d1) {
      return n1 * (t -= 1.5 / d1) * t + 0.75;
    } else if (t < 2.5 / d1) {
      return n1 * (t -= 2.25 / d1) * t + 0.9375;
    } else {
      return n1 * (t -= 2.625 / d1) * t + 0.984375;
    }
  },
  easeInOutBounce: t => t < 0.5
    ? (1 - Easing.easeOutBounce(1 - 2 * t)) / 2
    : (1 + Easing.easeOutBounce(2 * t - 1)) / 2,
  spring: t => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  bounce: t => Easing.easeOutBounce(t),
  smoothStep: t => t * t * (3 - 2 * t),
  smootherStep: t => t * t * t * (t * (t * 6 - 15) + 10)
};

function _resolveEl(el) {
  return typeof el === 'string' ? document.getElementById(el) : el;
}

function _animate({ duration = 500, easing = Easing.easeOutQuad, onUpdate, onComplete }) {
  const startTime = performance.now();
  let rafId;
  function step(now) {
    const t = Math.min(1, (now - startTime) / duration);
    const eased = easing(t);
    onUpdate(eased, t);
    if (t < 1) {
      rafId = requestAnimationFrame(step);
    } else {
      if (onComplete) onComplete();
    }
  }
  rafId = requestAnimationFrame(step);
  return () => cancelAnimationFrame(rafId);
}

/* ================= 基础显隐动画 ================= */

function fadeIn(element, duration = 400) {
  const el = _resolveEl(element);
  if (!el) return;
  el.style.opacity = '0';
  el.style.display = '';
  const computed = window.getComputedStyle(el).display;
  if (computed === 'none') el.style.display = 'block';
  _animate({
    duration,
    easing: Easing.easeOutQuad,
    onUpdate: (eased) => { el.style.opacity = String(eased); }
  });
}

function fadeOut(element, duration = 400) {
  const el = _resolveEl(element);
  if (!el) return;
  _animate({
    duration,
    easing: Easing.easeInQuad,
    onUpdate: (eased) => { el.style.opacity = String(1 - eased); },
    onComplete: () => { el.style.display = 'none'; el.style.opacity = '1'; }
  });
}

function slideUp(element, duration = 400) {
  const el = _resolveEl(element);
  if (!el) return;
  const h = el.scrollHeight;
  el.style.overflow = 'hidden';
  el.style.height = h + 'px';
  el.style.display = '';
  _animate({
    duration,
    easing: Easing.easeOutQuad,
    onUpdate: (eased) => { el.style.height = (h * (1 - eased)) + 'px'; },
    onComplete: () => { el.style.display = 'none'; el.style.height = ''; el.style.overflow = ''; }
  });
}

function slideDown(element, duration = 400) {
  const el = _resolveEl(element);
  if (!el) return;
  el.style.display = '';
  el.style.overflow = 'hidden';
  const h = el.scrollHeight;
  el.style.height = '0px';
  _animate({
    duration,
    easing: Easing.easeOutQuad,
    onUpdate: (eased) => { el.style.height = (h * eased) + 'px'; },
    onComplete: () => { el.style.height = ''; el.style.overflow = ''; }
  });
}

function scaleIn(element, duration = 400) {
  const el = _resolveEl(element);
  if (!el) return;
  el.style.transform = 'scale(0.85)';
  el.style.opacity = '0';
  el.style.display = '';
  const computed = window.getComputedStyle(el).display;
  if (computed === 'none') el.style.display = 'block';
  _animate({
    duration,
    easing: Easing.easeOutBack,
    onUpdate: (eased) => {
      const s = 0.85 + 0.15 * eased;
      el.style.transform = `scale(${s})`;
      el.style.opacity = String(eased);
    }
  });
}

function scaleOut(element, duration = 300) {
  const el = _resolveEl(element);
  if (!el) return;
  _animate({
    duration,
    easing: Easing.easeInBack,
    onUpdate: (eased) => {
      const s = 1 - 0.15 * eased;
      el.style.transform = `scale(${s})`;
      el.style.opacity = String(1 - eased);
    },
    onComplete: () => { el.style.display = 'none'; el.style.transform = ''; el.style.opacity = '1'; }
  });
}

/* ================= Ripple 水波纹效果 ================= */

function ripple(x, y, color = 'var(--accent, #5b4dff)') {
  const ripple = document.createElement('span');
  ripple.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:10px;height:10px;border-radius:50%;background:${color};opacity:0.5;pointer-events:none;transform:translate(-50%,-50%) scale(1);z-index:99999;`;
  document.body.appendChild(ripple);

  _animate({
    duration: 600,
    easing: Easing.easeOutQuad,
    onUpdate: (eased) => {
      const scale = 1 + eased * 40;
      ripple.style.transform = `translate(-50%,-50%) scale(${scale})`;
      ripple.style.opacity = String(0.5 * (1 - eased));
    },
    onComplete: () => ripple.remove()
  });
}

/* ================= Confetti 彩纸庆祝 ================= */

function confetti(options = {}) {
  const count = options.count || 80;
  const colors = options.colors || ['#5b4dff', '#ff6b9d', '#ffd93d', '#6bcb77', '#4d96ff', '#ff6b6b'];
  const origin = options.origin || { x: 0.5, y: 0.5 };
  const cx = origin.x * window.innerWidth;
  const cy = origin.y * window.innerHeight;

  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    const size = Math.random() * 8 + 4;
    const color = colors[Math.floor(Math.random() * colors.length)];
    el.style.cssText = `position:fixed;left:${cx}px;top:${cy}px;width:${size}px;height:${size}px;background:${color};border-radius:${Math.random() > 0.5 ? '50%' : '2px'};pointer-events:none;z-index:99999;`;
    document.body.appendChild(el);

    const angle = Math.random() * Math.PI * 2;
    const velocity = Math.random() * 12 + 4;
    const vx = Math.cos(angle) * velocity;
    const vy = Math.sin(angle) * velocity - 6;
    const gravity = 0.4;
    const drag = 0.96;
    let posX = 0, posY = 0, velX = vx, velY = vy;
    let rotation = 0, rotSpeed = (Math.random() - 0.5) * 20;

    _animate({
      duration: Math.random() * 1000 + 1200,
      easing: Easing.linear,
      onUpdate: (eased) => {
        velX *= drag;
        velY += gravity;
        posX += velX;
        posY += velY;
        rotation += rotSpeed;
        el.style.transform = `translate(${posX}px, ${posY}px) rotate(${rotation}deg)`;
        el.style.opacity = String(1 - eased);
      },
      onComplete: () => el.remove()
    });
  }
}

/* ================= Typewriter 打字机效果 ================= */

function typewriter(element, text, speed = 50) {
  const el = _resolveEl(element);
  if (!el) return;
  el.textContent = '';
  let i = 0;
  const timer = setInterval(() => {
    el.textContent += text.charAt(i);
    i++;
    if (i >= text.length) clearInterval(timer);
  }, speed);
  return () => clearInterval(timer);
}

/* ================= Marquee 跑马灯 ================= */

function marquee(element, speed = 50) {
  const el = _resolveEl(element);
  if (!el) return;
  const text = el.textContent || '';
  el.innerHTML = `<span style="display:inline-block;white-space:nowrap;">${text}&nbsp;&nbsp;&nbsp;&nbsp;${text}</span>`;
  const inner = el.firstElementChild;
  let offset = 0;
  const step = speed / 60;

  function loop() {
    if (!inner) return;
    offset += step;
    const half = inner.scrollWidth / 2;
    if (offset >= half) offset = 0;
    inner.style.transform = `translateX(-${offset}px)`;
    requestAnimationFrame(loop);
  }
  loop();
}

/* ================= Parallax 视差滚动 ================= */

function parallax(element, intensity = 0.5) {
  const el = _resolveEl(element);
  if (!el) return;
  function onScroll() {
    const rect = el.getBoundingClientRect();
    const vh = window.innerHeight;
    const progress = (vh - rect.top) / (vh + rect.height);
    const y = (progress - 0.5) * intensity * 100;
    el.style.transform = `translateY(${y}px)`;
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  return () => window.removeEventListener('scroll', onScroll);
}

/* ================= Shimmer 闪光动画 ================= */

function shimmer(element) {
  const el = _resolveEl(element);
  if (!el) return;
  el.style.position = 'relative';
  el.style.overflow = 'hidden';
  const shine = document.createElement('div');
  shine.style.cssText = 'position:absolute;top:0;left:-100%;width:50%;height:100%;background:linear-gradient(90deg,transparent,rgba(255,255,255,0.4),transparent);pointer-events:none;';
  el.appendChild(shine);

  _animate({
    duration: 1200,
    easing: Easing.easeInOutSine,
    onUpdate: (eased) => {
      shine.style.left = (-100 + eased * 250) + '%';
    },
    onComplete: () => shine.remove()
  });
}

/* ================= Pulse 脉冲动画 ================= */

function pulse(element) {
  const el = _resolveEl(element);
  if (!el) return;
  _animate({
    duration: 800,
    easing: Easing.easeInOutSine,
    onUpdate: (eased) => {
      const s = 1 + Math.sin(eased * Math.PI) * 0.06;
      el.style.transform = `scale(${s})`;
    },
    onComplete: () => { el.style.transform = ''; }
  });
}

/* ================= Bounce 弹跳动画 ================= */

function bounce(element) {
  const el = _resolveEl(element);
  if (!el) return;
  _animate({
    duration: 900,
    easing: Easing.easeOutBounce,
    onUpdate: (eased) => {
      const y = -40 * Math.sin(eased * Math.PI) * (1 - eased);
      el.style.transform = `translateY(${y}px)`;
    },
    onComplete: () => { el.style.transform = ''; }
  });
}

/* ================= Shake 摇晃动画 ================= */

function shake(element) {
  const el = _resolveEl(element);
  if (!el) return;
  _animate({
    duration: 500,
    easing: Easing.linear,
    onUpdate: (eased) => {
      const decay = 1 - eased;
      const x = Math.sin(eased * Math.PI * 8) * 10 * decay;
      el.style.transform = `translateX(${x}px)`;
    },
    onComplete: () => { el.style.transform = ''; }
  });
}

/* ================= Rotate 旋转动画 ================= */

function rotate(element, degrees = 360, duration = 600) {
  const el = _resolveEl(element);
  if (!el) return;
  _animate({
    duration,
    easing: Easing.easeInOutCubic,
    onUpdate: (eased) => {
      el.style.transform = `rotate(${eased * degrees}deg)`;
    },
    onComplete: () => { el.style.transform = ''; }
  });
}

/* ================= MorphShape 形状变换（clip-path） ================= */

function morphShape(element, fromShape, toShape, duration = 800) {
  const el = _resolveEl(element);
  if (!el) return;
  el.style.clipPath = fromShape;
  _animate({
    duration,
    easing: Easing.easeInOutCubic,
    onUpdate: (eased) => {
      // 简单插值无法处理复杂 polygon，这里用 fade + scale 模拟
      const s = 0.9 + 0.1 * eased;
      el.style.transform = `scale(${s})`;
      el.style.opacity = String(0.5 + 0.5 * eased);
    },
    onComplete: () => {
      el.style.clipPath = toShape;
      el.style.transform = '';
      el.style.opacity = '1';
    }
  });
}

/* ================= DrawSVG SVG描边动画 ================= */

function drawSVG(pathElement, duration = 1000) {
  const path = _resolveEl(pathElement);
  if (!path || !(path instanceof SVGPathElement)) return;
  const length = path.getTotalLength();
  path.style.strokeDasharray = length;
  path.style.strokeDashoffset = length;
  _animate({
    duration,
    easing: Easing.easeOutCubic,
    onUpdate: (eased) => {
      path.style.strokeDashoffset = String(length * (1 - eased));
    }
  });
}

/* ================= PageTransition 页面转场 ================= */

function pageTransition(direction = 'left') {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:99998;background:var(--accent,#5b4dff);pointer-events:none;';
  document.body.appendChild(overlay);

  const fromX = direction === 'left' ? '100%' : direction === 'right' ? '-100%' : '0';
  const fromY = direction === 'up' ? '100%' : direction === 'down' ? '-100%' : '0';
  overlay.style.transform = `translate(${fromX}, ${fromY})`;

  _animate({
    duration: 500,
    easing: Easing.easeInOutCubic,
    onUpdate: (eased) => {
      const x = direction === 'left' ? 100 * (1 - eased) : direction === 'right' ? -100 * (1 - eased) : 0;
      const y = direction === 'up' ? 100 * (1 - eased) : direction === 'down' ? -100 * (1 - eased) : 0;
      overlay.style.transform = `translate(${x}%, ${y}%)`;
    },
    onComplete: () => {
      _animate({
        duration: 400,
        easing: Easing.easeInOutCubic,
        onUpdate: (eased2) => {
          const x = direction === 'left' ? -100 * eased2 : direction === 'right' ? 100 * eased2 : 0;
          const y = direction === 'up' ? -100 * eased2 : direction === 'down' ? 100 * eased2 : 0;
          overlay.style.transform = `translate(${x}%, ${y}%)`;
        },
        onComplete: () => overlay.remove()
      });
    }
  });
}

/* ================= ScrollReveal 滚动揭示 ================= */

function scrollReveal() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const el = entry.target;
        const delay = parseInt(el.dataset.revealDelay || '0', 10);
        const type = el.dataset.reveal || 'fade-up';
        setTimeout(() => {
          el.style.opacity = '1';
          el.style.transform = 'none';
        }, delay);
        observer.unobserve(el);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

  document.querySelectorAll('[data-reveal]').forEach(el => {
    const type = el.dataset.reveal;
    el.style.transition = 'opacity 0.6s cubic-bezier(0.16,1,0.3,1), transform 0.6s cubic-bezier(0.16,1,0.3,1)';
    el.style.opacity = '0';
    switch (type) {
      case 'fade-up': el.style.transform = 'translateY(30px)'; break;
      case 'fade-down': el.style.transform = 'translateY(-30px)'; break;
      case 'fade-left': el.style.transform = 'translateX(30px)'; break;
      case 'fade-right': el.style.transform = 'translateX(-30px)'; break;
      case 'zoom': el.style.transform = 'scale(0.9)'; break;
      default: el.style.transform = 'translateY(20px)';
    }
    observer.observe(el);
  });
}

/* ================= CounterAnimation 数字滚动 ================= */

function counterAnimation(element, target, duration = 1200) {
  const el = _resolveEl(element);
  if (!el) return;
  const from = parseFloat(el.textContent.replace(/,/g, '')) || 0;
  const isFloat = !Number.isInteger(target);
  _animate({
    duration,
    easing: Easing.easeOutExpo,
    onUpdate: (eased) => {
      const val = from + (target - from) * eased;
      el.textContent = isFloat ? val.toFixed(2) : Math.round(val).toLocaleString();
    }
  });
}

/* ================= EqualizerBars 均衡器条动画 ================= */

function equalizerBars(canvasId, dataProvider) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const barCount = 32;
  const barW = w / barCount;

  function draw() {
    requestAnimationFrame(draw);
    let data;
    if (typeof dataProvider === 'function') {
      data = dataProvider();
    } else {
      data = new Array(barCount).fill(0).map(() => Math.random() * 0.8 + 0.1);
    }
    ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < barCount; i++) {
      const val = data[i] || 0;
      const height = val * h;
      const hue = 200 + (i / barCount) * 60;
      ctx.fillStyle = `hsla(${hue}, 80%, 60%, 0.9)`;
      ctx.fillRect(i * barW, h - height, barW - 2, height);
    }
  }
  draw();
}

/* ================= ParticleBackground 粒子背景 ================= */

function particleBackground(canvasId, options = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let w, h;

  function resize() {
    w = canvas.width = canvas.clientWidth;
    h = canvas.height = canvas.clientHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  const particleCount = options.count || 60;
  const connectionDistance = options.connectDistance || 100;
  const particles = [];
  const colors = options.colors || ['#5b4dff', '#ff6b9d', '#4d96ff'];

  for (let i = 0; i < particleCount; i++) {
    particles.push({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      radius: Math.random() * 2 + 1,
      color: colors[Math.floor(Math.random() * colors.length)]
    });
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
    });

    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < connectionDistance) {
          ctx.strokeStyle = `rgba(91,77,255,${0.15 * (1 - dist / connectionDistance)})`;
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.stroke();
        }
      }
    }
    requestAnimationFrame(draw);
  }
  draw();

  return () => window.removeEventListener('resize', resize);
}

/* ================= 组合动画快捷方法 ================= */

function popIn(element, duration = 400) {
  scaleIn(element, duration);
}

function popOut(element, duration = 300) {
  scaleOut(element, duration);
}

function flash(element, duration = 300) {
  const el = _resolveEl(element);
  if (!el) return;
  el.style.transition = `opacity ${duration}ms`;
  el.style.opacity = '0.3';
  setTimeout(() => { el.style.opacity = '1'; }, duration);
}

function wobble(element, duration = 600) {
  const el = _resolveEl(element);
  if (!el) return;
  _animate({
    duration,
    easing: Easing.easeInOutSine,
    onUpdate: (eased) => {
      const r = Math.sin(eased * Math.PI * 4) * 5 * (1 - eased);
      el.style.transform = `rotate(${r}deg)`;
    },
    onComplete: () => { el.style.transform = ''; }
  });
}

function heartBeat(element, duration = 1300) {
  const el = _resolveEl(element);
  if (!el) return;
  _animate({
    duration,
    easing: Easing.easeInOutSine,
    onUpdate: (eased) => {
      const s = 1 + Math.sin(eased * Math.PI * 2) * 0.1;
      el.style.transform = `scale(${s})`;
    },
    onComplete: () => { el.style.transform = ''; }
  });
}

function flipInX(element, duration = 600) {
  const el = _resolveEl(element);
  if (!el) return;
  el.style.display = '';
  el.style.opacity = '0';
  _animate({
    duration,
    easing: Easing.easeInOutCubic,
    onUpdate: (eased) => {
      const angle = eased * 90;
      const o = eased;
      el.style.transform = `perspective(400px) rotateX(${90 - angle}deg)`;
      el.style.opacity = String(o);
    },
    onComplete: () => { el.style.transform = ''; }
  });
}

function flipInY(element, duration = 600) {
  const el = _resolveEl(element);
  if (!el) return;
  el.style.display = '';
  el.style.opacity = '0';
  _animate({
    duration,
    easing: Easing.easeInOutCubic,
    onUpdate: (eased) => {
      const angle = eased * 90;
      el.style.transform = `perspective(400px) rotateY(${90 - angle}deg)`;
      el.style.opacity = String(eased);
    },
    onComplete: () => { el.style.transform = ''; }
  });
}

function swing(element, duration = 600) {
  const el = _resolveEl(element);
  if (!el) return;
  _animate({
    duration,
    easing: Easing.easeInOutQuad,
    onUpdate: (eased) => {
      const r = Math.sin(eased * Math.PI) * 15 * (1 - eased);
      el.style.transform = `rotate(${r}deg)`;
    },
    onComplete: () => { el.style.transform = ''; }
  });
}

function rubberBand(element, duration = 800) {
  const el = _resolveEl(element);
  if (!el) return;
  _animate({
    duration,
    easing: Easing.easeInOutQuad,
    onUpdate: (eased) => {
      const t = eased;
      let s;
      if (t < 0.3) s = 1 + 0.3 * t / 0.3;
      else if (t < 0.5) s = 1.3 - 0.2 * (t - 0.3) / 0.2;
      else if (t < 0.7) s = 1.1 + 0.1 * (t - 0.5) / 0.2;
      else s = 1.2 - 0.2 * (t - 0.7) / 0.3;
      el.style.transform = `scale(${s})`;
    },
    onComplete: () => { el.style.transform = ''; }
  });
}

function tada(element, duration = 800) {
  const el = _resolveEl(element);
  if (!el) return;
  _animate({
    duration,
    easing: Easing.linear,
    onUpdate: (eased) => {
      const scale = 1 + Math.sin(eased * Math.PI * 6) * 0.05;
      const rotate = Math.sin(eased * Math.PI * 4) * 3;
      el.style.transform = `scale(${scale}) rotate(${rotate}deg)`;
    },
    onComplete: () => { el.style.transform = ''; }
  });
}

function glow(element, color = 'var(--accent, #5b4dff)', duration = 1500) {
  const el = _resolveEl(element);
  if (!el) return;
  _animate({
    duration,
    easing: Easing.easeInOutSine,
    onUpdate: (eased) => {
      const intensity = Math.sin(eased * Math.PI) * 15;
      el.style.boxShadow = `0 0 ${intensity}px ${color}`;
    },
    onComplete: () => { el.style.boxShadow = ''; }
  });
}

function blurIn(element, duration = 500) {
  const el = _resolveEl(element);
  if (!el) return;
  el.style.display = '';
  el.style.opacity = '0';
  _animate({
    duration,
    easing: Easing.easeOutQuad,
    onUpdate: (eased) => {
      el.style.filter = `blur(${(1 - eased) * 10}px)`;
      el.style.opacity = String(eased);
    },
    onComplete: () => { el.style.filter = ''; }
  });
}

function blurOut(element, duration = 400) {
  const el = _resolveEl(element);
  if (!el) return;
  _animate({
    duration,
    easing: Easing.easeInQuad,
    onUpdate: (eased) => {
      el.style.filter = `blur(${eased * 10}px)`;
      el.style.opacity = String(1 - eased);
    },
    onComplete: () => { el.style.display = 'none'; el.style.filter = ''; el.style.opacity = '1'; }
  });
}

function slideInLeft(element, duration = 500) {
  const el = _resolveEl(element);
  if (!el) return;
  el.style.display = '';
  el.style.opacity = '0';
  _animate({
    duration,
    easing: Easing.easeOutCubic,
    onUpdate: (eased) => {
      el.style.transform = `translateX(${(1 - eased) * -60}px)`;
      el.style.opacity = String(eased);
    },
    onComplete: () => { el.style.transform = ''; }
  });
}

function slideInRight(element, duration = 500) {
  const el = _resolveEl(element);
  if (!el) return;
  el.style.display = '';
  el.style.opacity = '0';
  _animate({
    duration,
    easing: Easing.easeOutCubic,
    onUpdate: (eased) => {
      el.style.transform = `translateX(${(1 - eased) * 60}px)`;
      el.style.opacity = String(eased);
    },
    onComplete: () => { el.style.transform = ''; }
  });
}

function slideInUp(element, duration = 500) {
  const el = _resolveEl(element);
  if (!el) return;
  el.style.display = '';
  el.style.opacity = '0';
  _animate({
    duration,
    easing: Easing.easeOutCubic,
    onUpdate: (eased) => {
      el.style.transform = `translateY(${(1 - eased) * 40}px)`;
      el.style.opacity = String(eased);
    },
    onComplete: () => { el.style.transform = ''; }
  });
}

function slideInDown(element, duration = 500) {
  const el = _resolveEl(element);
  if (!el) return;
  el.style.display = '';
  el.style.opacity = '0';
  _animate({
    duration,
    easing: Easing.easeOutCubic,
    onUpdate: (eased) => {
      el.style.transform = `translateY(${(1 - eased) * -40}px)`;
      el.style.opacity = String(eased);
    },
    onComplete: () => { el.style.transform = ''; }
  });
}

function hinge(element, duration = 1200) {
  const el = _resolveEl(element);
  if (!el) return;
  _animate({
    duration,
    easing: Easing.easeInOutCubic,
    onUpdate: (eased) => {
      const rotate = eased * 80;
      const opacity = eased > 0.7 ? 1 - (eased - 0.7) / 0.3 : 1;
      el.style.transformOrigin = 'top left';
      el.style.transform = `rotate(${rotate}deg)`;
      el.style.opacity = String(opacity);
    },
    onComplete: () => { el.style.display = 'none'; el.style.transform = ''; el.style.transformOrigin = ''; el.style.opacity = '1'; }
  });
}

function jackInTheBox(element, duration = 700) {
  const el = _resolveEl(element);
  if (!el) return;
  el.style.display = '';
  el.style.opacity = '0';
  _animate({
    duration,
    easing: Easing.easeOutCubic,
    onUpdate: (eased) => {
      const scale = eased < 0.5 ? 0.3 + 0.7 * (eased / 0.5) : 1;
      const rotate = (1 - eased) * 30;
      el.style.transform = `scale(${scale}) rotate(${rotate}deg)`;
      el.style.opacity = String(eased);
    },
    onComplete: () => { el.style.transform = ''; }
  });
}

function rollIn(element, duration = 600) {
  const el = _resolveEl(element);
  if (!el) return;
  el.style.display = '';
  el.style.opacity = '0';
  _animate({
    duration,
    easing: Easing.easeOutCubic,
    onUpdate: (eased) => {
      el.style.transform = `translateX(${(1 - eased) * -100}%) rotate(${(1 - eased) * -120}deg)`;
      el.style.opacity = String(eased);
    },
    onComplete: () => { el.style.transform = ''; }
  });
}

function rollOut(element, duration = 600) {
  const el = _resolveEl(element);
  if (!el) return;
  _animate({
    duration,
    easing: Easing.easeInCubic,
    onUpdate: (eased) => {
      el.style.transform = `translateX(${eased * 100}%) rotate(${eased * 120}deg)`;
      el.style.opacity = String(1 - eased);
    },
    onComplete: () => { el.style.display = 'none'; el.style.transform = ''; el.style.opacity = '1'; }
  });
}

function zoomIn(element, duration = 400) {
  scaleIn(element, duration);
}

function zoomOut(element, duration = 300) {
  scaleOut(element, duration);
}

/* ================= 高级粒子系统 ================= */

function firework(x, y, options = {}) {
  const colors = options.colors || ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#ff6b9d', '#5b4dff'];
  const particleCount = options.count || 60;
  for (let i = 0; i < particleCount; i++) {
    const el = document.createElement('div');
    const size = Math.random() * 4 + 2;
    const color = colors[Math.floor(Math.random() * colors.length)];
    el.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:${size}px;height:${size}px;background:${color};border-radius:50%;pointer-events:none;z-index:99999;`;
    document.body.appendChild(el);

    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 6 + 2;
    let vx = Math.cos(angle) * speed;
    let vy = Math.sin(angle) * speed;
    let posX = 0, posY = 0;
    const gravity = 0.15;

    _animate({
      duration: Math.random() * 800 + 800,
      easing: Easing.easeOutQuad,
      onUpdate: (eased) => {
        vy += gravity;
        posX += vx;
        posY += vy;
        el.style.transform = `translate(${posX}px, ${posY}px)`;
        el.style.opacity = String(1 - eased);
      },
      onComplete: () => el.remove()
    });
  }
}

function snow(canvasId, options = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let w, h;
  function resize() { w = canvas.width = canvas.clientWidth; h = canvas.height = canvas.clientHeight; }
  resize();
  window.addEventListener('resize', resize);

  const count = options.count || 50;
  const flakes = [];
  for (let i = 0; i < count; i++) {
    flakes.push({
      x: Math.random() * w,
      y: Math.random() * h,
      r: Math.random() * 2 + 1,
      d: Math.random() * count,
      vx: (Math.random() - 0.5) * 0.3,
      vy: Math.random() * 0.5 + 0.3
    });
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    flakes.forEach(f => {
      f.y += f.vy;
      f.x += f.vx + Math.sin(f.d / 30) * 0.3;
      if (f.y > h) { f.y = -5; f.x = Math.random() * w; }
      if (f.x > w) f.x = 0;
      if (f.x < 0) f.x = w;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      ctx.fill();
    });
    requestAnimationFrame(draw);
  }
  draw();
  return () => window.removeEventListener('resize', resize);
}

function rain(canvasId, options = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let w, h;
  function resize() { w = canvas.width = canvas.clientWidth; h = canvas.height = canvas.clientHeight; }
  resize();
  window.addEventListener('resize', resize);

  const count = options.count || 80;
  const drops = [];
  for (let i = 0; i < count; i++) {
    drops.push({
      x: Math.random() * w,
      y: Math.random() * h,
      l: Math.random() * 15 + 5,
      v: Math.random() * 4 + 4
    });
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(174,194,224,0.5)';
    ctx.lineWidth = 1;
    drops.forEach(d => {
      ctx.beginPath();
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x, d.y + d.l);
      ctx.stroke();
      d.y += d.v;
      if (d.y > h) { d.y = -d.l; d.x = Math.random() * w; }
    });
    requestAnimationFrame(draw);
  }
  draw();
  return () => window.removeEventListener('resize', resize);
}

function starfield(canvasId, options = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let w, h;
  function resize() { w = canvas.width = canvas.clientWidth; h = canvas.height = canvas.clientHeight; }
  resize();
  window.addEventListener('resize', resize);

  const count = options.count || 120;
  const stars = [];
  for (let i = 0; i < count; i++) {
    stars.push({
      x: Math.random() * w,
      y: Math.random() * h,
      z: Math.random() * w,
      o: Math.random()
    });
  }

  function draw() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    stars.forEach(s => {
      s.z -= 0.5;
      if (s.z <= 0) { s.z = w; s.x = Math.random() * w; s.y = Math.random() * h; }
      const sx = (s.x - w / 2) * (w / s.z) + w / 2;
      const sy = (s.y - h / 2) * (w / s.z) + h / 2;
      const size = (1 - s.z / w) * 3;
      const alpha = (1 - s.z / w) * s.o;
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      ctx.beginPath();
      ctx.arc(sx, sy, size, 0, Math.PI * 2);
      ctx.fill();
    });
    requestAnimationFrame(draw);
  }
  draw();
  return () => window.removeEventListener('resize', resize);
}

/* ================= 音频可视化动画 ================= */

function audioBars(canvasId, analyser, options = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !analyser) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const barCount = options.barCount || 64;
  const barW = w / barCount;
  const colorStart = options.colorStart || '#5b4dff';
  const colorEnd = options.colorEnd || '#ff6b9d';

  function hexToRgb(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return [r, g, b];
  }

  const [r1, g1, b1] = hexToRgb(colorStart);
  const [r2, g2, b2] = hexToRgb(colorEnd);

  function draw() {
    requestAnimationFrame(draw);
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);
    ctx.clearRect(0, 0, w, h);

    for (let i = 0; i < barCount; i++) {
      const idx = Math.floor((i / barCount) * data.length);
      const val = data[idx] / 255;
      const height = val * h;
      const t = i / barCount;
      const r = Math.round(r1 + (r2 - r1) * t);
      const g = Math.round(g1 + (g2 - g1) * t);
      const b = Math.round(b1 + (b2 - b1) * t);
      ctx.fillStyle = `rgba(${r},${g},${b},0.9)`;
      ctx.fillRect(i * barW, h - height, barW - 1, height);
    }
  }
  draw();
}

function circularVisualizer(canvasId, analyser, options = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !analyser) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const radius = options.radius || Math.min(cx, cy) * 0.5;
  const barCount = options.barCount || 80;

  function draw() {
    requestAnimationFrame(draw);
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);
    ctx.clearRect(0, 0, w, h);

    for (let i = 0; i < barCount; i++) {
      const idx = Math.floor((i / barCount) * data.length);
      const val = data[idx] / 255;
      const angle = (i / barCount) * Math.PI * 2 - Math.PI / 2;
      const barLen = val * radius * 0.8;
      const x1 = cx + Math.cos(angle) * radius;
      const y1 = cy + Math.sin(angle) * radius;
      const x2 = cx + Math.cos(angle) * (radius + barLen);
      const y2 = cy + Math.sin(angle) * (radius + barLen);
      const hue = (i / barCount) * 360;
      ctx.strokeStyle = `hsla(${hue}, 80%, 60%, 0.85)`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
  }
  draw();
}

/* ================= 导出 ================= */

const QingluanAnimations = {
  // 缓动函数
  Easing,
  // 基础动画
  fadeIn,
  fadeOut,
  slideUp,
  slideDown,
  scaleIn,
  scaleOut,
  // 特效
  ripple,
  confetti,
  typewriter,
  marquee,
  parallax,
  shimmer,
  pulse,
  bounce,
  shake,
  rotate,
  morphShape,
  drawSVG,
  pageTransition,
  scrollReveal,
  counterAnimation,
  equalizerBars,
  particleBackground,
  // 组合动画
  popIn,
  popOut,
  flash,
  wobble,
  heartBeat,
  flipInX,
  flipInY,
  swing,
  rubberBand,
  tada,
  glow,
  blurIn,
  blurOut,
  slideInLeft,
  slideInRight,
  slideInUp,
  slideInDown,
  hinge,
  jackInTheBox,
  rollIn,
  rollOut,
  zoomIn,
  zoomOut,
  // 粒子系统
  firework,
  snow,
  rain,
  starfield,
  // 音频可视化
  audioBars,
  circularVisualizer,
  // 工具
  animate: _animate
};

/* ================= 3D 翻转与透视动画 ================= */

function flip3D(element, duration = 800, axis = 'y') {
  const el = _resolveEl(element);
  if (!el) return;
  el.style.display = '';
  el.style.opacity = '0';
  el.style.transform = `perspective(600px) rotate${axis.toUpperCase()}(-90deg)`;
  _animate({
    duration,
    easing: Easing.easeInOutCubic,
    onUpdate: (eased) => {
      const angle = -90 + eased * 90;
      el.style.transform = `perspective(600px) rotate${axis.toUpperCase()}(${angle}deg)`;
      el.style.opacity = String(eased);
    },
    onComplete: () => { el.style.transform = ''; }
  });
}

function unfold(element, duration = 700) {
  const el = _resolveEl(element);
  if (!el) return;
  el.style.display = '';
  el.style.overflow = 'hidden';
  el.style.transformOrigin = 'top center';
  el.style.transform = 'perspective(600px) rotateX(-90deg)';
  el.style.opacity = '0';
  _animate({
    duration,
    easing: Easing.easeOutCubic,
    onUpdate: (eased) => {
      el.style.transform = `perspective(600px) rotateX(${-90 + eased * 90}deg)`;
      el.style.opacity = String(eased);
    },
    onComplete: () => { el.style.transform = ''; el.style.transformOrigin = ''; }
  });
}

function fold(element, duration = 600) {
  const el = _resolveEl(element);
  if (!el) return;
  el.style.transformOrigin = 'top center';
  _animate({
    duration,
    easing: Easing.easeOutCubic,
    onUpdate: (eased) => {
      el.style.transform = `perspective(600px) rotateX(${-eased * 90}deg)`;
      el.style.opacity = String(1 - eased);
    },
    onComplete: () => { el.style.display = 'none'; el.style.transform = ''; el.style.transformOrigin = ''; }
  });
}

/* ================= 文本动画 ================= */

function textScramble(element, finalText, duration = 1500) {
  const el = _resolveEl(element);
  if (!el) return;
  const chars = '!<>-_\\/[]{}—=+*^?#________';
  const length = finalText.length;
  const startTime = performance.now();
  let frame = 0;

  function update(now) {
    const t = Math.min(1, (now - startTime) / duration);
    const progress = Math.floor(t * length);
    let output = '';
    for (let i = 0; i < length; i++) {
      if (i < progress) output += finalText[i];
      else output += chars[Math.floor(Math.random() * chars.length)];
    }
    el.textContent = output;
    if (t < 1) requestAnimationFrame(update);
    else el.textContent = finalText;
  }
  requestAnimationFrame(update);
}

function textReveal(element, duration = 800) {
  const el = _resolveEl(element);
  if (!el) return;
  const text = el.textContent;
  el.innerHTML = text.split('').map((ch, i) =>
    `<span style="display:inline-block;opacity:0;transform:translateY(10px);transition:all 0.3s ${i * 0.03}s">${ch === ' ' ? '&nbsp;' : ch}</span>`
  ).join('');
  requestAnimationFrame(() => {
    el.querySelectorAll('span').forEach(span => {
      span.style.opacity = '1';
      span.style.transform = 'translateY(0)';
    });
  });
}

function textHighlight(element, color = 'var(--accent)', duration = 600) {
  const el = _resolveEl(element);
  if (!el) return;
  const originalBg = el.style.background;
  _animate({
    duration,
    easing: Easing.easeInOutSine,
    onUpdate: (eased) => {
      const alpha = Math.sin(eased * Math.PI) * 0.3;
      el.style.background = `linear-gradient(90deg, ${color}22 0%, ${color}22 ${eased * 100}%, transparent ${eased * 100}%)`;
    },
    onComplete: () => { el.style.background = originalBg; }
  });
}

/* ================= 路径动画 ================= */

function moveAlongPath(element, pathSelector, duration = 2000) {
  const el = _resolveEl(element);
  const path = document.querySelector(pathSelector);
  if (!el || !path || !(path instanceof SVGPathElement)) return;
  const len = path.getTotalLength();
  _animate({
    duration,
    easing: Easing.linear,
    onUpdate: (eased) => {
      const point = path.getPointAtLength(eased * len);
      el.style.transform = `translate(${point.x}px, ${point.y}px)`;
    }
  });
}

/* ================= 液体动画 ================= */

function liquidFill(element, duration = 1200) {
  const el = _resolveEl(element);
  if (!el) return;
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:absolute;inset:0;background:var(--accent);transform:scaleY(0);transform-origin:bottom;transition:none;pointer-events:none;z-index:0;';
  el.style.position = 'relative';
  el.appendChild(overlay);
  _animate({
    duration,
    easing: Easing.easeOutCubic,
    onUpdate: (eased) => {
      overlay.style.transform = `scaleY(${eased})`;
    }
  });
}

/* ================= 呼吸动画 ================= */

function breathe(element, duration = 3000) {
  const el = _resolveEl(element);
  if (!el) return;
  function cycle() {
    _animate({
      duration,
      easing: Easing.easeInOutSine,
      onUpdate: (eased) => {
        const s = 1 + Math.sin(eased * Math.PI * 2) * 0.03;
        el.style.transform = `scale(${s})`;
      },
      onComplete: cycle
    });
  }
  cycle();
}

/* ================= 故障效果 ================= */

function glitch(element, duration = 400) {
  const el = _resolveEl(element);
  if (!el) return;
  const original = el.style.cssText;
  _animate({
    duration,
    easing: Easing.linear,
    onUpdate: (eased) => {
      const x = (Math.random() - 0.5) * 6 * (1 - eased);
      const y = (Math.random() - 0.5) * 2 * (1 - eased);
      el.style.transform = `translate(${x}px, ${y}px)`;
      el.style.textShadow = `${x * 2}px 0 #ff00ff, ${-x * 2}px 0 #00ffff`;
    },
    onComplete: () => { el.style.transform = ''; el.style.textShadow = ''; }
  });
}

/* ================= 磁吸效果 ================= */

function magneticButton(element, strength = 0.3) {
  const el = _resolveEl(element);
  if (!el) return;
  el.addEventListener('mousemove', (e) => {
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    el.style.transform = `translate(${dx * strength}px, ${dy * strength}px)`;
  });
  el.addEventListener('mouseleave', () => {
    el.style.transform = '';
    el.style.transition = 'transform 0.3s cubic-bezier(0.16,1,0.3,1)';
    setTimeout(() => { el.style.transition = ''; }, 300);
  });
}

/* ================= 聚光灯效果 ================= */

function spotlight(element, options = {}) {
  const el = _resolveEl(element);
  if (!el) return;
  el.style.position = 'relative';
  el.style.overflow = 'hidden';
  const spot = document.createElement('div');
  spot.style.cssText = 'position:absolute;width:200px;height:200px;border-radius:50%;background:radial-gradient(circle, rgba(255,255,255,0.15) 0%, transparent 70%);pointer-events:none;transform:translate(-50%,-50%);opacity:0;transition:opacity 0.3s;';
  el.appendChild(spot);
  el.addEventListener('mousemove', (e) => {
    const rect = el.getBoundingClientRect();
    spot.style.left = (e.clientX - rect.left) + 'px';
    spot.style.top = (e.clientY - rect.top) + 'px';
    spot.style.opacity = '1';
  });
  el.addEventListener('mouseleave', () => { spot.style.opacity = '0'; });
}

// 全局暴露
if (typeof window !== 'undefined') {
  window.QingluanAnimations = QingluanAnimations;
  window.QingluanAnimations.flip3D = flip3D;
  window.QingluanAnimations.unfold = unfold;
  window.QingluanAnimations.fold = fold;
  window.QingluanAnimations.textScramble = textScramble;
  window.QingluanAnimations.textReveal = textReveal;
  window.QingluanAnimations.textHighlight = textHighlight;
  window.QingluanAnimations.moveAlongPath = moveAlongPath;
  window.QingluanAnimations.liquidFill = liquidFill;
  window.QingluanAnimations.breathe = breathe;
  window.QingluanAnimations.glitch = glitch;
  window.QingluanAnimations.magneticButton = magneticButton;
  window.QingluanAnimations.spotlight = spotlight;
}

export default QingluanAnimations;
