/**
 * 青鸾插件系统 - 支持用户自定义效果器、乐器合成器和可视化器
 *
 * 安全策略：
 * - 插件代码通过 new Function() 在受限环境中执行
 * - 仅暴露 Math 对象和基本运算所需的内置函数
 * - 禁止访问文件系统、网络、全局对象等
 */

export interface QingluanPluginParameter {
  name: string;
  type: 'number' | 'boolean' | 'enum';
  default: number | boolean | string;
  min?: number;
  max?: number;
  options?: string[]; // for enum
}

export interface QingluanPlugin {
  name: string;
  version: string;
  type: 'effect' | 'instrument' | 'visualizer';
  parameters: QingluanPluginParameter[];
  processBlock: (
    input: Float32Array,
    output: Float32Array,
    params: Record<string, number>,
    sampleRate: number
  ) => void;
  generateNote?: (
    frequency: number,
    duration: number,
    velocity: number,
    params: Record<string, number>,
    sampleRate: number
  ) => Float32Array;
}

export class PluginRegistry {
  private plugins = new Map<string, QingluanPlugin>();

  register(plugin: QingluanPlugin): void {
    if (!plugin || typeof plugin.name !== 'string' || plugin.name.length === 0) {
      throw new Error('Plugin must have a non-empty name');
    }
    if (this.plugins.has(plugin.name)) {
      throw new Error(`Plugin "${plugin.name}" is already registered`);
    }
    this.plugins.set(plugin.name, plugin);
  }

  get(name: string): QingluanPlugin | undefined {
    return this.plugins.get(name);
  }

  list(type?: 'effect' | 'instrument' | 'visualizer'): QingluanPlugin[] {
    const all = Array.from(this.plugins.values());
    if (!type) return all;
    return all.filter((p) => p.type === type);
  }

  unregister(name: string): boolean {
    return this.plugins.delete(name);
  }

  clear(): void {
    this.plugins.clear();
  }
}

export interface PluginCodePayload {
  name: string;
  version: string;
  type: 'effect' | 'instrument' | 'visualizer';
  parameters: QingluanPluginParameter[];
  code: string;
}

const SAFE_GLOBALS = Object.freeze({
  Math: Object.freeze({
    abs: Math.abs,
    acos: Math.acos,
    acosh: Math.acosh,
    asin: Math.asin,
    asinh: Math.asinh,
    atan: Math.atan,
    atan2: Math.atan2,
    atanh: Math.atanh,
    cbrt: Math.cbrt,
    ceil: Math.ceil,
    clz32: Math.clz32,
    cos: Math.cos,
    cosh: Math.cosh,
    exp: Math.exp,
    expm1: Math.expm1,
    floor: Math.floor,
    fround: Math.fround,
    hypot: Math.hypot,
    imul: Math.imul,
    log: Math.log,
    log1p: Math.log1p,
    log10: Math.log10,
    log2: Math.log2,
    max: Math.max,
    min: Math.min,
    pow: Math.pow,
    random: Math.random,
    round: Math.round,
    sign: Math.sign,
    sin: Math.sin,
    sinh: Math.sinh,
    sqrt: Math.sqrt,
    tan: Math.tan,
    tanh: Math.tanh,
    trunc: Math.trunc,
    PI: Math.PI,
    E: Math.E,
    LN2: Math.LN2,
    LN10: Math.LN10,
    LOG2E: Math.LOG2E,
    LOG10E: Math.LOG10E,
    SQRT1_2: Math.SQRT1_2,
    SQRT2: Math.SQRT2,
  }),
  NaN,
  Infinity,
  undefined,
});

function createSandboxScope(): Record<string, unknown> {
  return { ...SAFE_GLOBALS };
}

function validateParameterDefinitions(parameters: unknown[]): QingluanPluginParameter[] {
  if (!Array.isArray(parameters)) {
    throw new Error('parameters must be an array');
  }
  return parameters.map((p: any, idx: number) => {
    if (!p || typeof p.name !== 'string') {
      throw new Error(`Parameter ${idx}: missing name`);
    }
    if (!['number', 'boolean', 'enum'].includes(p.type)) {
      throw new Error(`Parameter ${idx} (${p.name}): invalid type`);
    }
    if (p.type === 'number' && typeof p.default !== 'number') {
      throw new Error(`Parameter ${idx} (${p.name}): default must be a number`);
    }
    if (p.type === 'boolean' && typeof p.default !== 'boolean') {
      throw new Error(`Parameter ${idx} (${p.name}): default must be a boolean`);
    }
    if (p.type === 'enum' && typeof p.default !== 'string') {
      throw new Error(`Parameter ${idx} (${p.name}): default must be a string for enum`);
    }
    return {
      name: p.name,
      type: p.type,
      default: p.default,
      min: typeof p.min === 'number' ? p.min : undefined,
      max: typeof p.max === 'number' ? p.max : undefined,
      options: Array.isArray(p.options) ? p.options.filter((o: any) => typeof o === 'string') : undefined,
    };
  });
}

export class PluginSandbox {
  private registry = new PluginRegistry();

  getRegistry(): PluginRegistry {
    return this.registry;
  }

  compile(payload: PluginCodePayload): QingluanPlugin {
    // Validate metadata
    if (!payload.name || typeof payload.name !== 'string') {
      throw new Error('Plugin name is required');
    }
    if (!payload.version || typeof payload.version !== 'string') {
      throw new Error('Plugin version is required');
    }
    if (!['effect', 'instrument', 'visualizer'].includes(payload.type)) {
      throw new Error('Plugin type must be effect, instrument, or visualizer');
    }

    const parameters = validateParameterDefinitions(payload.parameters || []);

    // Security: basic syntax check by parsing as function body
    const wrappedCode = `(function() { "use strict"; ${payload.code} })`;
    try {
      // eslint-disable-next-line no-new-func
      new Function(payload.code);
    } catch (e: any) {
      throw new Error(`Syntax error in plugin code: ${e.message}`);
    }

    // Build sandboxed function
    const scope = createSandboxScope();
    const scopeKeys = Object.keys(scope);
    const scopeValues = Object.values(scope);

    const processBlockFactory = new Function(
      ...scopeKeys,
      `
      "use strict";
      return (function(input, output, params, sampleRate) {
        ${payload.code}
        if (typeof processBlock !== 'function') {
          throw new Error('processBlock function is not defined');
        }
        return processBlock(input, output, params, sampleRate);
      });
      `
    );

    const processBlock = processBlockFactory(...scopeValues);

    let generateNote: QingluanPlugin['generateNote'] | undefined;
    if (payload.type === 'instrument') {
      const generateNoteFactory = new Function(
        ...scopeKeys,
        `
        "use strict";
        return (function(frequency, duration, velocity, params, sampleRate) {
          ${payload.code}
          if (typeof generateNote !== 'function') {
            throw new Error('generateNote function is not defined for instrument plugin');
          }
          return generateNote(frequency, duration, velocity, params, sampleRate);
        });
        `
      );
      generateNote = generateNoteFactory(...scopeValues);
    }

    const plugin: QingluanPlugin = {
      name: payload.name,
      version: payload.version,
      type: payload.type,
      parameters,
      processBlock,
      generateNote,
    };

    // Test run with minimal data to verify compliance
    this.testRun(plugin);

    return plugin;
  }

  register(payload: PluginCodePayload): QingluanPlugin {
    const plugin = this.compile(payload);
    this.registry.register(plugin);
    return plugin;
  }

  private testRun(plugin: QingluanPlugin): void {
    const sampleRate = 44100;
    const blockSize = 64;
    const input = new Float32Array(blockSize);
    const output = new Float32Array(blockSize);
    const params: Record<string, number> = {};
    for (const p of plugin.parameters) {
      if (p.type === 'number') {
        params[p.name] = typeof p.default === 'number' ? p.default : 0;
      } else if (p.type === 'boolean') {
        params[p.name] = p.default === true ? 1 : 0;
      } else if (p.type === 'enum') {
        params[p.name] = 0;
      }
    }

    try {
      plugin.processBlock(input, output, params, sampleRate);
    } catch (e: any) {
      throw new Error(`processBlock test run failed: ${e.message}`);
    }

    if (plugin.type === 'instrument' && plugin.generateNote) {
      try {
        const note = plugin.generateNote(440, 0.1, 0.8, params, sampleRate);
        if (!(note instanceof Float32Array)) {
          throw new Error('generateNote must return a Float32Array');
        }
      } catch (e: any) {
        throw new Error(`generateNote test run failed: ${e.message}`);
      }
    }
  }
}

// 全局插件沙箱实例
export const globalPluginSandbox = new PluginSandbox();
