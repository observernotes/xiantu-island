import type Phaser from 'phaser';

// Phaser 的公共渲染器常量；只引入类型，纯选择逻辑也能在无 DOM 的测试中运行。
const AUTO = 0, CANVAS = 1, WEBGL = 2;

export type RendererPreference = 'auto' | 'webgl' | 'canvas';
export type RendererChoice = {
  preference: RendererPreference;
  type: number;
  reason: 'override' | 'software' | 'hardware' | 'unavailable';
  glRenderer: string | null;
};
export type RendererInfo = {
  type: number;
  name: 'WebGL' | 'Canvas' | 'Unknown';
  glRenderer: string | null;
  actualFps: number;
};

export function isSoftwareRenderer(name: string | null | undefined): boolean {
  return !!name && /swiftshader|llvmpipe|software|basic\s*render|microsoft\s*basic/i.test(name);
}

function readGLRenderer(gl: WebGLRenderingContext): string | null {
  try {
    const extension = gl.getExtension('WEBGL_debug_renderer_info');
    if (!extension) return null;
    const name: unknown = gl.getParameter(extension.UNMASKED_RENDERER_WEBGL);
    return typeof name === 'string' && name.trim() ? name.trim() : null;
  } catch { return null; }
}

/** 启动前使用临时上下文探测；扩展不可用或浏览器禁用 WebGL 时交给 Phaser.AUTO。 */
export function detectWebGLRenderer(): string | null {
  let gl: WebGLRenderingContext | null = null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1; canvas.height = 1;
    gl = (canvas.getContext('webgl') ?? canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    return gl ? readGLRenderer(gl) : null;
  } catch { return null; }
  finally {
    // 不让一次性探针占用浏览器有限的 WebGL 上下文名额。
    try { gl?.getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* 部分浏览器不开放主动释放。 */ }
  }
}

/** probe 可注入渲染器名，让软件回退路径无需真实 GPU 即可回归。 */
export function chooseRenderer(search: string, probe: () => string | null = detectWebGLRenderer): RendererChoice {
  const value = new URLSearchParams(search).get('renderer')?.toLowerCase();
  const preference: RendererPreference = value === 'webgl' || value === 'canvas' ? value : 'auto';
  if (preference !== 'auto') {
    return { preference, type: preference === 'canvas' ? CANVAS : WEBGL, reason: 'override', glRenderer: null };
  }
  let glRenderer: string | null = null;
  try { glRenderer = probe(); } catch { /* 探测失败保留 Phaser 原有自动回退。 */ }
  if (!glRenderer) return { preference, type: AUTO, reason: 'unavailable', glRenderer: null };
  const software = isSoftwareRenderer(glRenderer);
  return { preference, type: software ? CANVAS : WEBGL, reason: software ? 'software' : 'hardware', glRenderer };
}

const startupChoices = new WeakMap<Phaser.Game, RendererChoice>();
const liveRendererNames = new WeakMap<Phaser.Game, string | null>();

export function recordRendererChoice(game: Phaser.Game, choice: RendererChoice): void {
  startupChoices.set(game, { ...choice });
}

/** F1 与测试桥共用；实际 GL 名只查询一次，Canvas 也保留启动时的软件渲染器名。 */
export function getRendererInfo(game: Phaser.Game): RendererInfo {
  const type = game.renderer?.type ?? AUTO;
  let glRenderer = startupChoices.get(game)?.glRenderer ?? null;
  if (type === WEBGL) {
    const gl = (game.renderer as Phaser.Renderer.WebGL.WebGLRenderer).gl;
    if (gl && !liveRendererNames.has(game)) liveRendererNames.set(game, readGLRenderer(gl));
    glRenderer = liveRendererNames.get(game) ?? glRenderer;
  }
  return {
    type,
    name: type === WEBGL ? 'WebGL' : type === CANVAS ? 'Canvas' : 'Unknown',
    glRenderer,
    actualFps: Number.isFinite(game.loop?.actualFps) ? game.loop.actualFps : 0,
  };
}
