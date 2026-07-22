/**
 * 青鸾 DAW — 主题管理器
 * ThemeManager
 * 支持8套内置主题：default、dark、geek、paper、midnight、sakura、forest、cyberpunk
 */

const BuiltInThemes = {
  default: {
    name: '默认米白',
    description: '清新明亮的默认主题',
    author: 'Qingluan',
    version: '1.0',
    variables: {
      '--phone-bg': '#f5f5f0',
      '--text': '#1a1a1a',
      '--text2': '#555',
      '--text3': '#888',
      '--accent': '#5b4dff',
      '--accent2': '#ff6b9d',
      '--accent3': '#7b6fff',
      '--bubble-user': '#5b4dff',
      '--bubble-ai': '#f0f0f5',
      '--card-bg': '#fff',
      '--card-bg-hover': '#fafafa',
      '--border': 'rgba(0,0,0,0.06)',
      '--border-strong': 'rgba(0,0,0,0.12)',
      '--pink-bg': '#f5f5f0',
      '--black-card': '#1a1a1a',
      '--shadow-sm': '0 1px 3px rgba(0,0,0,0.04)',
      '--shadow-md': '0 4px 12px rgba(0,0,0,0.06)',
      '--shadow-lg': '0 12px 40px rgba(0,0,0,0.08)',
      '--radius-sm': '6px',
      '--radius-md': '12px',
      '--radius-lg': '20px',
      '--radius-xl': '32px',
      '--font-sans': "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', 'Noto Sans SC', sans-serif",
      '--font-mono': "'SF Mono', 'Fira Code', 'Consolas', monospace",
      '--success': '#2ecc71',
      '--warning': '#f39c12',
      '--error': '#e74c3c',
      '--info': '#3498db',
      '--overlay': 'rgba(0,0,0,0.35)',
      '--input-bg': '#fff',
      '--input-border': 'rgba(0,0,0,0.1)',
      '--input-focus': 'rgba(91,77,255,0.2)',
      '--slider-track': 'rgba(0,0,0,0.1)',
      '--slider-thumb': '#5b4dff',
      '--switch-on': '#5b4dff',
      '--switch-off': 'rgba(0,0,0,0.15)',
      '--progress-bg': 'rgba(0,0,0,0.06)',
      '--progress-fill': '#5b4dff',
      '--scroll-track': 'rgba(0,0,0,0.04)',
      '--scroll-thumb': 'rgba(0,0,0,0.15)',
      '--scroll-thumb-hover': 'rgba(0,0,0,0.25)',
      '--tooltip-bg': 'rgba(30,30,30,0.9)',
      '--tooltip-text': '#fff',
      '--menu-bg': '#fff',
      '--menu-hover': 'rgba(91,77,255,0.06)',
      '--modal-backdrop': 'rgba(0,0,0,0.45)',
      '--code-bg': '#f4f4f8',
      '--code-text': '#2d2d2d',
      '--tag-bg': 'rgba(91,77,255,0.08)',
      '--tag-text': '#5b4dff'
    }
  },

  dark: {
    name: '深色模式',
    description: '护眼黑底白字',
    author: 'Qingluan',
    version: '1.0',
    variables: {
      '--phone-bg': '#0f0f13',
      '--text': '#e8e8ec',
      '--text2': '#a0a0a8',
      '--text3': '#707078',
      '--accent': '#8b7dff',
      '--accent2': '#ff8bb5',
      '--accent3': '#a599ff',
      '--bubble-user': '#8b7dff',
      '--bubble-ai': '#1e1e28',
      '--card-bg': '#1a1a22',
      '--card-bg-hover': '#22222c',
      '--border': 'rgba(255,255,255,0.08)',
      '--border-strong': 'rgba(255,255,255,0.14)',
      '--pink-bg': '#12121a',
      '--black-card': '#252530',
      '--shadow-sm': '0 1px 3px rgba(0,0,0,0.2)',
      '--shadow-md': '0 4px 12px rgba(0,0,0,0.3)',
      '--shadow-lg': '0 12px 40px rgba(0,0,0,0.4)',
      '--radius-sm': '6px',
      '--radius-md': '12px',
      '--radius-lg': '20px',
      '--radius-xl': '32px',
      '--font-sans': "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', 'Noto Sans SC', sans-serif",
      '--font-mono': "'SF Mono', 'Fira Code', 'Consolas', monospace",
      '--success': '#2ecc71',
      '--warning': '#f39c12',
      '--error': '#e74c3c',
      '--info': '#3498db',
      '--overlay': 'rgba(0,0,0,0.55)',
      '--input-bg': '#1e1e28',
      '--input-border': 'rgba(255,255,255,0.08)',
      '--input-focus': 'rgba(139,125,255,0.25)',
      '--slider-track': 'rgba(255,255,255,0.1)',
      '--slider-thumb': '#8b7dff',
      '--switch-on': '#8b7dff',
      '--switch-off': 'rgba(255,255,255,0.15)',
      '--progress-bg': 'rgba(255,255,255,0.06)',
      '--progress-fill': '#8b7dff',
      '--scroll-track': 'rgba(255,255,255,0.04)',
      '--scroll-thumb': 'rgba(255,255,255,0.12)',
      '--scroll-thumb-hover': 'rgba(255,255,255,0.22)',
      '--tooltip-bg': 'rgba(40,40,50,0.95)',
      '--tooltip-text': '#e8e8ec',
      '--menu-bg': '#1a1a22',
      '--menu-hover': 'rgba(139,125,255,0.1)',
      '--modal-backdrop': 'rgba(0,0,0,0.6)',
      '--code-bg': '#16161e',
      '--code-text': '#c8c8d0',
      '--tag-bg': 'rgba(139,125,255,0.12)',
      '--tag-text': '#8b7dff'
    }
  },

  geek: {
    name: '极客绿',
    description: '黑底绿字终端风格',
    author: 'Qingluan',
    version: '1.0',
    variables: {
      '--phone-bg': '#0a0a0a',
      '--text': '#00ff41',
      '--text2': '#00cc33',
      '--text3': '#009922',
      '--accent': '#00ff41',
      '--accent2': '#00ff88',
      '--accent3': '#33ff66',
      '--bubble-user': '#00ff41',
      '--bubble-ai': '#0f1f0f',
      '--card-bg': '#0f0f0f',
      '--card-bg-hover': '#131313',
      '--border': 'rgba(0,255,65,0.15)',
      '--border-strong': 'rgba(0,255,65,0.25)',
      '--pink-bg': '#080808',
      '--black-card': '#111111',
      '--shadow-sm': '0 0 4px rgba(0,255,65,0.1)',
      '--shadow-md': '0 0 12px rgba(0,255,65,0.15)',
      '--shadow-lg': '0 0 30px rgba(0,255,65,0.2)',
      '--radius-sm': '2px',
      '--radius-md': '4px',
      '--radius-lg': '6px',
      '--radius-xl': '8px',
      '--font-sans': "'Fira Code', 'Consolas', 'Courier New', monospace",
      '--font-mono': "'Fira Code', 'Consolas', 'Courier New', monospace",
      '--success': '#00ff41',
      '--warning': '#ffcc00',
      '--error': '#ff3333',
      '--info': '#00ccff',
      '--overlay': 'rgba(0,0,0,0.7)',
      '--input-bg': '#0a0a0a',
      '--input-border': 'rgba(0,255,65,0.2)',
      '--input-focus': 'rgba(0,255,65,0.3)',
      '--slider-track': 'rgba(0,255,65,0.15)',
      '--slider-thumb': '#00ff41',
      '--switch-on': '#00ff41',
      '--switch-off': 'rgba(0,255,65,0.15)',
      '--progress-bg': 'rgba(0,255,65,0.08)',
      '--progress-fill': '#00ff41',
      '--scroll-track': 'rgba(0,255,65,0.04)',
      '--scroll-thumb': 'rgba(0,255,65,0.2)',
      '--scroll-thumb-hover': 'rgba(0,255,65,0.35)',
      '--tooltip-bg': '#0a0a0a',
      '--tooltip-text': '#00ff41',
      '--menu-bg': '#0f0f0f',
      '--menu-hover': 'rgba(0,255,65,0.08)',
      '--modal-backdrop': 'rgba(0,0,0,0.7)',
      '--code-bg': '#050505',
      '--code-text': '#00ff41',
      '--tag-bg': 'rgba(0,255,65,0.1)',
      '--tag-text': '#00ff41'
    }
  },

  paper: {
    name: '纸张质感',
    description: '米黄底仿纸质风格',
    author: 'Qingluan',
    version: '1.0',
    variables: {
      '--phone-bg': '#f0e8d8',
      '--text': '#3a3020',
      '--text2': '#6a6050',
      '--text3': '#9a9080',
      '--accent': '#8b4513',
      '--accent2': '#cd853f',
      '--accent3': '#a0522d',
      '--bubble-user': '#8b4513',
      '--bubble-ai': '#e8e0d0',
      '--card-bg': '#faf6f0',
      '--card-bg-hover': '#f5f0e8',
      '--border': 'rgba(60,40,20,0.08)',
      '--border-strong': 'rgba(60,40,20,0.15)',
      '--pink-bg': '#f0e8d8',
      '--black-card': '#3a3020',
      '--shadow-sm': '0 1px 3px rgba(60,40,20,0.04)',
      '--shadow-md': '0 4px 12px rgba(60,40,20,0.06)',
      '--shadow-lg': '0 12px 40px rgba(60,40,20,0.08)',
      '--radius-sm': '4px',
      '--radius-md': '8px',
      '--radius-lg': '12px',
      '--radius-xl': '20px',
      '--font-sans': "'Noto Serif SC', 'Songti SC', 'STSong', serif",
      '--font-mono': "'Fira Code', 'Consolas', monospace",
      '--success': '#5d8c5d',
      '--warning': '#c4a35a',
      '--error': '#b05a5a',
      '--info': '#5a7a9a',
      '--overlay': 'rgba(60,40,20,0.3)',
      '--input-bg': '#faf6f0',
      '--input-border': 'rgba(60,40,20,0.12)',
      '--input-focus': 'rgba(139,69,19,0.2)',
      '--slider-track': 'rgba(60,40,20,0.1)',
      '--slider-thumb': '#8b4513',
      '--switch-on': '#8b4513',
      '--switch-off': 'rgba(60,40,20,0.15)',
      '--progress-bg': 'rgba(60,40,20,0.06)',
      '--progress-fill': '#8b4513',
      '--scroll-track': 'rgba(60,40,20,0.04)',
      '--scroll-thumb': 'rgba(60,40,20,0.15)',
      '--scroll-thumb-hover': 'rgba(60,40,20,0.25)',
      '--tooltip-bg': '#3a3020',
      '--tooltip-text': '#f0e8d8',
      '--menu-bg': '#faf6f0',
      '--menu-hover': 'rgba(139,69,19,0.06)',
      '--modal-backdrop': 'rgba(60,40,20,0.4)',
      '--code-bg': '#e8e0d0',
      '--code-text': '#3a3020',
      '--tag-bg': 'rgba(139,69,19,0.08)',
      '--tag-text': '#8b4513'
    }
  },

  midnight: {
    name: '午夜蓝',
    description: '深邃的蓝色调',
    author: 'Qingluan',
    version: '1.0',
    variables: {
      '--phone-bg': '#0a0e1a',
      '--text': '#c8d4e8',
      '--text2': '#8a9bb8',
      '--text3': '#5a6b88',
      '--accent': '#4d8aff',
      '--accent2': '#7eb8ff',
      '--accent3': '#66a3ff',
      '--bubble-user': '#4d8aff',
      '--bubble-ai': '#111827',
      '--card-bg': '#111827',
      '--card-bg-hover': '#1a2332',
      '--border': 'rgba(77,138,255,0.1)',
      '--border-strong': 'rgba(77,138,255,0.18)',
      '--pink-bg': '#080c18',
      '--black-card': '#1a2332',
      '--shadow-sm': '0 1px 4px rgba(0,0,0,0.25)',
      '--shadow-md': '0 4px 16px rgba(0,0,0,0.35)',
      '--shadow-lg': '0 12px 48px rgba(0,0,0,0.45)',
      '--radius-sm': '8px',
      '--radius-md': '14px',
      '--radius-lg': '22px',
      '--radius-xl': '36px',
      '--font-sans': "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      '--font-mono': "'SF Mono', 'Fira Code', monospace",
      '--success': '#34d399',
      '--warning': '#fbbf24',
      '--error': '#f87171',
      '--info': '#60a5fa',
      '--overlay': 'rgba(5,10,25,0.6)',
      '--input-bg': '#111827',
      '--input-border': 'rgba(77,138,255,0.12)',
      '--input-focus': 'rgba(77,138,255,0.25)',
      '--slider-track': 'rgba(77,138,255,0.12)',
      '--slider-thumb': '#4d8aff',
      '--switch-on': '#4d8aff',
      '--switch-off': 'rgba(77,138,255,0.15)',
      '--progress-bg': 'rgba(77,138,255,0.06)',
      '--progress-fill': '#4d8aff',
      '--scroll-track': 'rgba(77,138,255,0.04)',
      '--scroll-thumb': 'rgba(77,138,255,0.15)',
      '--scroll-thumb-hover': 'rgba(77,138,255,0.28)',
      '--tooltip-bg': 'rgba(17,24,39,0.95)',
      '--tooltip-text': '#c8d4e8',
      '--menu-bg': '#111827',
      '--menu-hover': 'rgba(77,138,255,0.1)',
      '--modal-backdrop': 'rgba(5,10,25,0.65)',
      '--code-bg': '#0d1320',
      '--code-text': '#a0b4d8',
      '--tag-bg': 'rgba(77,138,255,0.1)',
      '--tag-text': '#4d8aff'
    }
  },

  sakura: {
    name: '樱花粉',
    description: '柔和的粉白配色',
    author: 'Qingluan',
    version: '1.0',
    variables: {
      '--phone-bg': '#fdf2f4',
      '--text': '#4a3040',
      '--text2': '#7a5a6a',
      '--text3': '#aa8a9a',
      '--accent': '#e86a92',
      '--accent2': '#ff8fb3',
      '--accent3': '#f07a9f',
      '--bubble-user': '#e86a92',
      '--bubble-ai': '#fce8ee',
      '--card-bg': '#fff',
      '--card-bg-hover': '#fef6f8',
      '--border': 'rgba(232,106,146,0.08)',
      '--border-strong': 'rgba(232,106,146,0.15)',
      '--pink-bg': '#fdf2f4',
      '--black-card': '#4a3040',
      '--shadow-sm': '0 1px 4px rgba(232,106,146,0.06)',
      '--shadow-md': '0 4px 16px rgba(232,106,146,0.08)',
      '--shadow-lg': '0 12px 48px rgba(232,106,146,0.1)',
      '--radius-sm': '10px',
      '--radius-md': '16px',
      '--radius-lg': '24px',
      '--radius-xl': '40px',
      '--font-sans': "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      '--font-mono': "'SF Mono', 'Fira Code', monospace",
      '--success': '#6bcb77',
      '--warning': '#f5c542',
      '--error': '#ff6b6b',
      '--info': '#6fa8dc',
      '--overlay': 'rgba(74,48,64,0.3)',
      '--input-bg': '#fff',
      '--input-border': 'rgba(232,106,146,0.12)',
      '--input-focus': 'rgba(232,106,146,0.2)',
      '--slider-track': 'rgba(232,106,146,0.1)',
      '--slider-thumb': '#e86a92',
      '--switch-on': '#e86a92',
      '--switch-off': 'rgba(232,106,146,0.15)',
      '--progress-bg': 'rgba(232,106,146,0.06)',
      '--progress-fill': '#e86a92',
      '--scroll-track': 'rgba(232,106,146,0.04)',
      '--scroll-thumb': 'rgba(232,106,146,0.15)',
      '--scroll-thumb-hover': 'rgba(232,106,146,0.28)',
      '--tooltip-bg': 'rgba(74,48,64,0.9)',
      '--tooltip-text': '#fdf2f4',
      '--menu-bg': '#fff',
      '--menu-hover': 'rgba(232,106,146,0.06)',
      '--modal-backdrop': 'rgba(74,48,64,0.4)',
      '--code-bg': '#fce8ee',
      '--code-text': '#5a4050',
      '--tag-bg': 'rgba(232,106,146,0.08)',
      '--tag-text': '#e86a92'
    }
  },

  forest: {
    name: '森林绿',
    description: '自然深绿配色',
    author: 'Qingluan',
    version: '1.0',
    variables: {
      '--phone-bg': '#0f1f17',
      '--text': '#c8dcc8',
      '--text2': '#8aaa8a',
      '--text3': '#5a7a5a',
      '--accent': '#5cb85c',
      '--accent2': '#7dd87d',
      '--accent3': '#6ac86a',
      '--bubble-user': '#5cb85c',
      '--bubble-ai': '#162a1e',
      '--card-bg': '#162a1e',
      '--card-bg-hover': '#1e3828',
      '--border': 'rgba(92,184,92,0.1)',
      '--border-strong': 'rgba(92,184,92,0.18)',
      '--pink-bg': '#0c1a12',
      '--black-card': '#1e3828',
      '--shadow-sm': '0 1px 4px rgba(0,0,0,0.2)',
      '--shadow-md': '0 4px 16px rgba(0,0,0,0.3)',
      '--shadow-lg': '0 12px 48px rgba(0,0,0,0.4)',
      '--radius-sm': '8px',
      '--radius-md': '14px',
      '--radius-lg': '22px',
      '--radius-xl': '36px',
      '--font-sans': "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      '--font-mono': "'SF Mono', 'Fira Code', monospace",
      '--success': '#5cb85c',
      '--warning': '#d4a03a',
      '--error': '#d46a6a',
      '--info': '#6a9ad4',
      '--overlay': 'rgba(10,25,15,0.55)',
      '--input-bg': '#162a1e',
      '--input-border': 'rgba(92,184,92,0.12)',
      '--input-focus': 'rgba(92,184,92,0.25)',
      '--slider-track': 'rgba(92,184,92,0.1)',
      '--slider-thumb': '#5cb85c',
      '--switch-on': '#5cb85c',
      '--switch-off': 'rgba(92,184,92,0.15)',
      '--progress-bg': 'rgba(92,184,92,0.06)',
      '--progress-fill': '#5cb85c',
      '--scroll-track': 'rgba(92,184,92,0.04)',
      '--scroll-thumb': 'rgba(92,184,92,0.15)',
      '--scroll-thumb-hover': 'rgba(92,184,92,0.28)',
      '--tooltip-bg': 'rgba(22,42,30,0.95)',
      '--tooltip-text': '#c8dcc8',
      '--menu-bg': '#162a1e',
      '--menu-hover': 'rgba(92,184,92,0.08)',
      '--modal-backdrop': 'rgba(10,25,15,0.6)',
      '--code-bg': '#122418',
      '--code-text': '#a0c0a0',
      '--tag-bg': 'rgba(92,184,92,0.1)',
      '--tag-text': '#5cb85c'
    }
  },

  cyberpunk: {
    name: '赛博朋克',
    description: '霓虹紫粉未来感',
    author: 'Qingluan',
    version: '1.0',
    variables: {
      '--phone-bg': '#0a0014',
      '--text': '#e0c8ff',
      '--text2': '#b080ff',
      '--text3': '#7a40cc',
      '--accent': '#ff00ff',
      '--accent2': '#00ffff',
      '--accent3': '#ff66ff',
      '--bubble-user': '#ff00ff',
      '--bubble-ai': '#1a0033',
      '--card-bg': '#140029',
      '--card-bg-hover': '#1e003d',
      '--border': 'rgba(255,0,255,0.15)',
      '--border-strong': 'rgba(255,0,255,0.25)',
      '--pink-bg': '#05000a',
      '--black-card': '#1e003d',
      '--shadow-sm': '0 0 6px rgba(255,0,255,0.15)',
      '--shadow-md': '0 0 16px rgba(255,0,255,0.2)',
      '--shadow-lg': '0 0 40px rgba(255,0,255,0.3)',
      '--radius-sm': '2px',
      '--radius-md': '4px',
      '--radius-lg': '8px',
      '--radius-xl': '12px',
      '--font-sans': "'Orbitron', 'Rajdhani', 'Segoe UI', sans-serif",
      '--font-mono': "'Fira Code', 'Consolas', monospace",
      '--success': '#00ff9f',
      '--warning': '#ffcc00',
      '--error': '#ff3366',
      '--info': '#00ccff',
      '--overlay': 'rgba(10,0,20,0.7)',
      '--input-bg': '#0a0014',
      '--input-border': 'rgba(255,0,255,0.2)',
      '--input-focus': 'rgba(255,0,255,0.35)',
      '--slider-track': 'rgba(255,0,255,0.15)',
      '--slider-thumb': '#ff00ff',
      '--switch-on': '#ff00ff',
      '--switch-off': 'rgba(255,0,255,0.15)',
      '--progress-bg': 'rgba(255,0,255,0.06)',
      '--progress-fill': '#ff00ff',
      '--scroll-track': 'rgba(255,0,255,0.04)',
      '--scroll-thumb': 'rgba(255,0,255,0.2)',
      '--scroll-thumb-hover': 'rgba(255,0,255,0.4)',
      '--tooltip-bg': '#140029',
      '--tooltip-text': '#ff00ff',
      '--menu-bg': '#140029',
      '--menu-hover': 'rgba(255,0,255,0.08)',
      '--modal-backdrop': 'rgba(10,0,20,0.75)',
      '--code-bg': '#0a0014',
      '--code-text': '#ff66ff',
      '--tag-bg': 'rgba(255,0,255,0.1)',
      '--tag-text': '#ff00ff'
    }
  }
};

/* ================= ThemeManager 类 ================= */

class ThemeManager {
  constructor() {
    this.themes = new Map();
    this.currentTheme = 'default';
    this.scheduledTimers = new Map();
    this.listeners = [];
    this._loadBuiltinThemes();
    this._initFromStorage();
  }

  _loadBuiltinThemes() {
    Object.entries(BuiltInThemes).forEach(([name, config]) => {
      this.themes.set(name, config);
    });
  }

  _initFromStorage() {
    const saved = localStorage.getItem('qingluan_theme_manager_current');
    if (saved && this.themes.has(saved)) {
      this.applyTheme(saved, false);
    }
  }

  registerTheme(name, cssVariables, meta = {}) {
    const theme = {
      name: meta.name || name,
      description: meta.description || '',
      author: meta.author || 'User',
      version: meta.version || '1.0',
      variables: { ...cssVariables }
    };
    this.themes.set(name, theme);
    return this;
  }

  applyTheme(name, animate = true) {
    const theme = this.themes.get(name);
    if (!theme) {
      console.warn(`[ThemeManager] 未找到主题: ${name}`);
      return false;
    }

    const root = document.documentElement;
    Object.entries(theme.variables).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });

    this.currentTheme = name;
    localStorage.setItem('qingluan_theme_manager_current', name);

    if (animate) {
      this._animateTransition();
    }

    this._notifyListeners(name, theme);
    return true;
  }

  _animateTransition() {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;pointer-events:none;background:var(--accent);opacity:0;transition:opacity 0.25s ease;';
    document.body.appendChild(overlay);

    requestAnimationFrame(() => {
      overlay.style.opacity = '0.12';
    });

    setTimeout(() => {
      overlay.style.opacity = '0';
      setTimeout(() => overlay.remove(), 300);
    }, 180);
  }

  getCurrentTheme() {
    return {
      name: this.currentTheme,
      config: this.themes.get(this.currentTheme)
    };
  }

  listThemes() {
    const list = [];
    this.themes.forEach((config, name) => {
      list.push({
        id: name,
        name: config.name,
        description: config.description,
        author: config.author,
        version: config.version
      });
    });
    return list;
  }

  exportTheme(name) {
    const theme = this.themes.get(name);
    if (!theme) return null;
    return JSON.stringify({
      name,
      config: theme,
      exportedAt: new Date().toISOString(),
      app: 'qingluan-daw'
    }, null, 2);
  }

  importTheme(configString) {
    try {
      const data = JSON.parse(configString);
      if (!data.name || !data.config || !data.config.variables) {
        throw new Error('无效的主题配置');
      }
      this.registerTheme(data.name, data.config.variables, {
        name: data.config.name,
        description: data.config.description,
        author: data.config.author,
        version: data.config.version
      });
      return { success: true, name: data.name };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  autoDetectTheme() {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      this.applyTheme('dark');
      return 'dark';
    }
    this.applyTheme('default');
    return 'default';
  }

  scheduleThemeChange(name, time) {
    const now = Date.now();
    const target = time instanceof Date ? time.getTime() : new Date(time).getTime();
    const delay = target - now;
    if (delay <= 0) {
      this.applyTheme(name);
      return { success: true, immediate: true };
    }

    if (this.scheduledTimers.has(name)) {
      clearTimeout(this.scheduledTimers.get(name));
    }

    const timer = setTimeout(() => {
      this.applyTheme(name);
      this.scheduledTimers.delete(name);
    }, delay);

    this.scheduledTimers.set(name, timer);
    return { success: true, delay };
  }

  cancelScheduledChange(name) {
    if (this.scheduledTimers.has(name)) {
      clearTimeout(this.scheduledTimers.get(name));
      this.scheduledTimers.delete(name);
      return true;
    }
    return false;
  }

  onThemeChange(callback) {
    this.listeners.push(callback);
    return () => {
      const idx = this.listeners.indexOf(callback);
      if (idx >= 0) this.listeners.splice(idx, 1);
    };
  }

  _notifyListeners(name, config) {
    this.listeners.forEach(cb => {
      try { cb(name, config); } catch (e) {}
    });
  }

  removeTheme(name) {
    if (BuiltInThemes[name]) {
      console.warn('[ThemeManager] 不能删除内置主题');
      return false;
    }
    return this.themes.delete(name);
  }

  getThemeCSS(name) {
    const theme = this.themes.get(name);
    if (!theme) return '';
    return Object.entries(theme.variables)
      .map(([k, v]) => `${k}: ${v};`)
      .join('\n');
  }

  previewTheme(name, duration = 3000) {
    const previous = this.currentTheme;
    this.applyTheme(name);
    setTimeout(() => {
      this.applyTheme(previous);
    }, duration);
  }

  cloneTheme(sourceName, newName, overrides = {}) {
    const source = this.themes.get(sourceName);
    if (!source) return false;
    this.registerTheme(newName, { ...source.variables, ...overrides }, {
      name: overrides.name || source.name + ' (副本)',
      description: source.description,
      author: source.author,
      version: source.version
    });
    return true;
  }

  resetToDefault() {
    this.applyTheme('default');
    localStorage.removeItem('qingluan_theme_manager_current');
  }

  generateRandomTheme(name = 'random') {
    const hue = Math.floor(Math.random() * 360);
    const hue2 = (hue + 30) % 360;
    const vars = {
      '--phone-bg': `hsl(${hue}, 20%, 8%)`,
      '--text': `hsl(${hue}, 30%, 90%)`,
      '--text2': `hsl(${hue}, 25%, 70%)`,
      '--text3': `hsl(${hue}, 20%, 50%)`,
      '--accent': `hsl(${hue}, 80%, 60%)`,
      '--accent2': `hsl(${hue2}, 80%, 60%)`,
      '--card-bg': `hsl(${hue}, 20%, 12%)`,
      '--border': `hsla(${hue}, 80%, 60%, 0.1)`,
      '--shadow-md': `0 4px 16px hsla(${hue},80%,60%,0.15)`
    };
    this.registerTheme(name, vars, { name: '随机主题', description: '自动生成的主题' });
    return name;
  }
}

// 全局单例
const themeManager = new ThemeManager();

// 监听系统主题变化
if (window.matchMedia) {
  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  mql.addEventListener?.('change', () => {
    if (!localStorage.getItem('qingluan_theme_manager_current')) {
      themeManager.autoDetectTheme();
    }
  });
}

// 全局暴露
if (typeof window !== 'undefined') {
  window.ThemeManager = ThemeManager;
  window.themeManager = themeManager;
}

/* ================= 主题工具函数 ================= */

function injectThemeCSS(css, id = 'qingluan-theme-inject') {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('style');
    el.id = id;
    document.head.appendChild(el);
  }
  el.textContent = css;
}

function removeThemeCSS(id = 'qingluan-theme-inject') {
  const el = document.getElementById(id);
  if (el) el.remove();
}

function createThemePreview(themeConfig, size = 120) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const vars = themeConfig.variables || themeConfig;

  // 背景
  ctx.fillStyle = vars['--phone-bg'] || '#fff';
  ctx.fillRect(0, 0, size, size);

  // 卡片
  ctx.fillStyle = vars['--card-bg'] || '#fafafa';
  roundRectPath(ctx, 10, 10, size - 20, size - 20, 8);
  ctx.fill();

  // 强调色块
  ctx.fillStyle = vars['--accent'] || '#5b4dff';
  roundRectPath(ctx, 20, 20, size - 40, 20, 4);
  ctx.fill();

  // 文字行
  ctx.fillStyle = vars['--text2'] || '#888';
  roundRectPath(ctx, 20, 52, size - 50, 8, 2);
  ctx.fill();
  roundRectPath(ctx, 20, 68, size - 60, 8, 2);
  ctx.fill();

  // 点缀
  ctx.fillStyle = vars['--accent2'] || '#ff6b9d';
  ctx.beginPath();
  ctx.arc(size - 30, size - 30, 10, 0, Math.PI * 2);
  ctx.fill();

  return canvas;
}

function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

function createThemeSwitcherPanel(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  container.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill, minmax(120px, 1fr));gap:12px;padding:12px;';

  themeManager.listThemes().forEach(theme => {
    const item = document.createElement('div');
    item.style.cssText = 'cursor:pointer;border-radius:12px;padding:8px;background:var(--card-bg);border:2px solid transparent;transition:all 0.2s;';
    item.dataset.theme = theme.id;

    const preview = createThemePreview(themeManager.themes.get(theme.id), 100);
    preview.style.width = '100%';
    preview.style.height = 'auto';
    preview.style.borderRadius = '8px';
    preview.style.display = 'block';

    const label = document.createElement('div');
    label.textContent = theme.name;
    label.style.cssText = 'text-align:center;font-size:12px;margin-top:6px;color:var(--text);';

    item.appendChild(preview);
    item.appendChild(label);

    item.addEventListener('click', () => {
      themeManager.applyTheme(theme.id);
      container.querySelectorAll('[data-theme]').forEach(el => el.style.borderColor = 'transparent');
      item.style.borderColor = 'var(--accent)';
    });

    if (themeManager.getCurrentTheme().name === theme.id) {
      item.style.borderColor = 'var(--accent)';
    }

    container.appendChild(item);
  });
}

function getCSSVariable(name, fallback = '') {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function setCSSVariable(name, value) {
  document.documentElement.style.setProperty(name, value);
}

/* ================= 主题过渡动画增强 ================= */

function animateColorTransition(duration = 400) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;pointer-events:none;background:var(--accent);opacity:0;transition:opacity 0.15s ease;';
  document.body.appendChild(overlay);
  requestAnimationFrame(() => { overlay.style.opacity = '0.08'; });
  setTimeout(() => {
    overlay.style.opacity = '0';
    setTimeout(() => overlay.remove(), 300);
  }, duration / 2);
}

/* ================= 导出增强 ================= */

/* ================= 动态主题 CSS 构建器 ================= */

function buildThemeCSS(themeName, selector = ':root') {
  const theme = themeManager.themes.get(themeName);
  if (!theme) return '';
  const vars = Object.entries(theme.variables).map(([k, v]) => `  ${k}: ${v};`).join('\n');
  return `${selector} {\n${vars}\n}`;
}

function applyThemeToIFrame(iframe, themeName) {
  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) return false;
  let style = doc.getElementById('qingluan-theme');
  if (!style) {
    style = doc.createElement('style');
    style.id = 'qingluan-theme';
    doc.head.appendChild(style);
  }
  style.textContent = buildThemeCSS(themeName, ':root');
  return true;
}

/* ================= 主题对比工具 ================= */

function diffThemes(themeA, themeB) {
  const a = themeManager.themes.get(themeA);
  const b = themeManager.themes.get(themeB);
  if (!a || !b) return null;
  const diffs = [];
  const allKeys = new Set([...Object.keys(a.variables), ...Object.keys(b.variables)]);
  allKeys.forEach(key => {
    const va = a.variables[key];
    const vb = b.variables[key];
    if (va !== vb) diffs.push({ key, a: va, b: vb });
  });
  return diffs;
}

/* ================= 自适应主题 ================= */

class AdaptiveTheme {
  constructor() {
    this.hourlyThemes = new Map();
    this.enabled = false;
    this.timer = null;
  }

  setHourTheme(hour, themeName) {
    this.hourlyThemes.set(hour, themeName);
  }

  start() {
    this.enabled = true;
    this._check();
    this.timer = setInterval(() => this._check(), 60000);
  }

  stop() {
    this.enabled = false;
    if (this.timer) clearInterval(this.timer);
  }

  _check() {
    if (!this.enabled) return;
    const hour = new Date().getHours();
    const theme = this.hourlyThemes.get(hour);
    if (theme && themeManager.getCurrentTheme().name !== theme) {
      themeManager.applyTheme(theme);
    }
  }
}

const adaptiveTheme = new AdaptiveTheme();

/* ================= 导出增强 ================= */

/* ================= 主题热重载 ================= */

function watchThemeChanges(callback) {
  const observer = new MutationObserver((mutations) => {
    mutations.forEach(m => {
      if (m.type === 'attributes' && m.attributeName === 'style') {
        callback(m.target.style.cssText);
      }
    });
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
  return () => observer.disconnect();
}

/* ================= 主题对比报告 ================= */

function generateThemeReport() {
  const current = themeManager.getCurrentTheme();
  const all = themeManager.listThemes();
  return {
    current: current.name,
    available: all.length,
    themes: all.map(t => ({ id: t.id, name: t.name, author: t.author })),
    timestamp: new Date().toISOString()
  };
}

/* ================= 导出增强 ================= */

export { ThemeManager, themeManager, BuiltInThemes, injectThemeCSS, removeThemeCSS, createThemePreview, createThemeSwitcherPanel, getCSSVariable, setCSSVariable, animateColorTransition, buildThemeCSS, applyThemeToIFrame, diffThemes, AdaptiveTheme, adaptiveTheme, watchThemeChanges, generateThemeReport };
export default ThemeManager;
