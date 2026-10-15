import Phaser from 'phaser';

export type CrashSource = 'frame' | 'error' | 'unhandledrejection' | 'recovery';
export interface CrashRecord {
  time: string;
  message: string;
  stack: string;
  mapId: string | null;
  source: CrashSource;
  version?: string;
  commit?: string;
}
export interface CrashGuard {
  readonly errors: readonly CrashRecord[];
  getState(): { visible: boolean; recovering: boolean; totalErrors: number; suppressedErrors: number };
  onError(listener: (record: CrashRecord) => void): () => void;
  destroy(): void;
}

type RecoveryScene = Phaser.Scene & {
  map?: { id: string; spawn: { x: number; y: number } };
  prog?: { position: { mapId: string; x: number; y: number } | null };
};
const guards = new WeakMap<Phaser.Game, CrashGuard>();
const STORAGE_KEY = 'xiantu_errors';
const MAX_ERRORS = 20;

/** Both entry points install this before Phaser starts its asynchronous first frame. */
export function installCrashGuard(game: Phaser.Game): CrashGuard {
  const installed = guards.get(game);
  if (installed) return installed;
  const errors: CrashRecord[] = [];
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    if (Array.isArray(saved)) errors.push(...saved.filter(item => item && typeof item.message === 'string').slice(-MAX_ERRORS));
  } catch { /* Storage can be unavailable; the in-memory diagnostics and recovery still work. */ }

  let visible = false, recovering = false, destroyed = false;
  let totalErrors = 0, suppressedErrors = 0;
  const lastSeen = new Map<string, number>();
  const listeners = new Set<(record: CrashRecord) => void>();
  const logError = console.error.bind(console);
  let overlay: HTMLDivElement | undefined;
  let recoveryScene: RecoveryScene | undefined;
  let clearCanvasStack: (() => void) | undefined;
  let restoreCanvasMethods: (() => void) | undefined;

  function currentScene(): RecoveryScene | undefined {
    return game.scene?.scenes.find(scene => scene.sys.settings.key === 'game') as RecoveryScene | undefined;
  }
  function showError() {
    visible = true;
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'xiantu-crash-guard';
      overlay.setAttribute('role', 'alert');
      overlay.textContent = '出错了，按 R 恢复';
      Object.assign(overlay.style, {
        position: 'fixed', top: '18px', left: '50%', transform: 'translateX(-50%)',
        zIndex: '2147483647', padding: '16px 24px', border: '2px solid #ffe0a3',
        borderRadius: '8px', background: '#351c24', color: '#fff4df',
        font: 'bold 20px sans-serif', textAlign: 'center', pointerEvents: 'none',
      });
      (document.body ?? document.documentElement).append(overlay);
    }
    overlay.hidden = false;
  }
  function describe(value: unknown): { message: string; stack: string } {
    try {
      const error = value as { message?: unknown; stack?: unknown } | null;
      return {
        message: String(error?.message ?? value ?? 'Unknown error').slice(0, 1000),
        stack: typeof error?.stack === 'string' ? error.stack.split('\n').slice(0, 8).join('\n').slice(0, 4000) : '',
      };
    } catch { return { message: 'Unknown error', stack: '' }; }
  }
  function report(value: unknown, source: CrashSource) {
    // Nothing in error reporting may escape back into RequestAnimationFrame.callback.
    if (destroyed) return;
    try {
      totalErrors++;
      if (recovering) {
        recovering = false;
        recoveryScene?.events.off(Phaser.Scenes.Events.CREATE, onRecovered);
        recoveryScene = undefined;
      }
      try { showError(); } catch { /* DOM failure must not kill the frame loop either. */ }
      const detail = describe(value), mapId = currentScene()?.map?.id ?? null;
      const signature = `${source}\n${mapId}\n${detail.message}\n${detail.stack}`;
      const now = Date.now(), previous = lastSeen.get(signature);
      lastSeen.set(signature, now);
      if (previous !== undefined && now - previous < 5000) { suppressedErrors++; return; }
      // Bound this cache as well as the persisted and test-observable error histories.
      if (lastSeen.size > 100) lastSeen.delete(lastSeen.keys().next().value!);
      const record: CrashRecord = { time: new Date(now).toISOString(), ...detail, mapId, source };
      const version = import.meta.env.VITE_XT_VERSION || game.config.gameVersion;
      const commit = import.meta.env.VITE_XT_COMMIT;
      if (version) record.version = version;
      if (commit) record.commit = commit;
      errors.push(record);
      if (errors.length > MAX_ERRORS) errors.splice(0, errors.length - MAX_ERRORS);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(errors)); } catch { /* Keep the memory copy. */ }
      if (source === 'frame' || source === 'recovery') {
        try { logError('[仙途岛] 帧循环异常', value); } catch { /* A replaced console may itself throw. */ }
      }
      // Subscribers use the same throttle, so a persistent frame failure cannot grow test queues forever.
      for (const listener of listeners) {
        try { listener({ ...record }); } catch { /* Diagnostics must not recurse. */ }
      }
    } catch { /* Leave the next frame scheduled even if an unexpected diagnostic operation fails. */ }
  }

  function prepareCanvas() {
    if (restoreCanvasMethods || !(game.renderer instanceof Phaser.Renderer.Canvas.CanvasRenderer)) return;
    const context = game.renderer.gameContext;
    const save = context.save, restore = context.restore;
    let depth = 0;
    const trackedSave = () => { save.call(context); depth++; };
    const trackedRestore = () => { restore.call(context); depth = Math.max(0, depth - 1); };
    context.save = trackedSave;
    context.restore = trackedRestore;
    clearCanvasStack = () => {
      // A render callback can skip several nested restores (camera clip, object, and frame).
      while (depth > 0) { restore.call(context); depth--; }
    };
    restoreCanvasMethods = () => {
      if (context.save === trackedSave) context.save = save;
      if (context.restore === trackedRestore) context.restore = restore;
    };
  }
  function repairInterruptedFrame() {
    // Phaser normally clears this only after rendering. A failed update/render must not leave
    // scene operations locked in the processing queue, including the user's recovery restart.
    unlockSceneManager();
    clearCanvasStack?.();
    const renderer = game.renderer;
    if (!(renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer) || renderer.contextLost) return;
    // Discard a partially built render batch instead of flushing the failed object again.
    for (const pipeline of [...renderer.pipelines.pipelines.values(), ...renderer.pipelines.postPipelineInstances]) {
      pipeline.vertexCount = 0;
      pipeline.batch.length = 0;
      pipeline.currentBatch = null;
      pipeline.currentTexture = null;
      pipeline.currentUnit = 0;
    }
    renderer.currentMask.mask = null;
    renderer.currentCameraMask.mask = null;
    renderer.maskStack.length = 0;
    renderer.fboStack.length = 0;
    (renderer as unknown as { drawingBufferHeight: number }).drawingBufferHeight = renderer.height;
    // Phaser's next preRender resets scissors/masks. rebind also restores GL blend/stencil state.
    renderer.setFramebuffer(null!);
    renderer.pipelines.rebind();
  }
  function unlockSceneManager() {
    // These Phaser runtime fields are writable; its public d.ts marks them readonly.
    (game.scene as unknown as { isProcessing: boolean }).isProcessing = false;
  }

  const loop = game.loop, start = loop.start;
  let originalCallback: Phaser.Types.Core.TimeStepCallback | undefined;
  let guardedCallback: Phaser.Types.Core.TimeStepCallback | undefined;
  function protect(callback: Phaser.Types.Core.TimeStepCallback) {
    originalCallback = callback;
    guardedCallback = (time, delta) => {
      try { callback(time, delta); }
      catch (error) {
        try { repairInterruptedFrame(); } catch { /* A broken renderer still must not stop rAF. */ }
        report(error, 'frame');
      }
      // No retry here: TimeStep finishes bookkeeping, and Phaser schedules exactly one next frame.
    };
    return guardedCallback;
  }
  const guardedStart: typeof loop.start = function (callback) {
    prepareCanvas();
    return start.call(loop, protect(callback));
  };
  loop.start = guardedStart;
  if (loop.started) { prepareCanvas(); loop.callback = protect(loop.callback); }

  function onRecovered() {
    recovering = false;
    recoveryScene = undefined;
  }
  function onKey(event: KeyboardEvent) {
    if (!visible || (event.code !== 'KeyR' && event.key.toLowerCase() !== 'r')) return;
    // Capture only during the error prompt; normal R bindings retain their usual behavior.
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.repeat || recovering) return;
    try {
      const scene = currentScene();
      const mapId = scene?.map?.id ?? scene?.prog?.position?.mapId;
      if (!scene || !mapId) return;
      const spawn = scene.map?.spawn;
      const saved = scene.prog?.position;
      const safe = spawn ?? (saved?.mapId === mapId ? saved : undefined);
      const pos = safe && Number.isFinite(safe.x) && Number.isFinite(safe.y) ? { x: safe.x, y: safe.y } : undefined;
      visible = false;
      if (overlay) overlay.hidden = true;
      recovering = true;
      lastSeen.clear();
      recoveryScene?.events.off(Phaser.Scenes.Events.CREATE, onRecovered);
      recoveryScene = scene;
      scene.events.once(Phaser.Scenes.Events.CREATE, onRecovered);
      // Existing create() trial interruption and save handling remain authoritative.
      unlockSceneManager();
      scene.scene.restart({ map: mapId, pos });
    } catch (error) { recovering = false; report(error, 'recovery'); }
  }
  const onError = (event: ErrorEvent) => report(event.error ?? event.message, 'error');
  const onRejection = (event: PromiseRejectionEvent) => report(event.reason, 'unhandledrejection');
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  window.addEventListener('keydown', onKey, true);

  const guard: CrashGuard = {
    errors,
    getState: () => ({ visible, recovering, totalErrors, suppressedErrors }),
    onError(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
      window.removeEventListener('keydown', onKey, true);
      recoveryScene?.events.off(Phaser.Scenes.Events.CREATE, onRecovered);
      game.events.off(Phaser.Core.Events.DESTROY, guard.destroy);
      if (loop.start === guardedStart) loop.start = start;
      if (loop.callback === guardedCallback && originalCallback) loop.callback = originalCallback;
      restoreCanvasMethods?.();
      overlay?.remove();
      listeners.clear();
      guards.delete(game);
    },
  };
  guards.set(game, guard);
  game.events.once(Phaser.Core.Events.DESTROY, guard.destroy);
  return guard;
}
