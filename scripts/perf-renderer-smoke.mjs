// 纯函数注入覆盖软件探测；浏览器覆盖 URL、真实 F1 和禁用 WebGL 的 AUTO 回退。
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import { assertPerfErrorsClean, assertPerfLoopAlive, createPerfPage, launchPerfBrowser,
  openPerfGame, root, startPerfPreview } from './perf-smoke-utils.mjs';

async function testRendererChoice() {
  const source = await fs.readFile(path.join(root, 'src/rendererChoice.ts'), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  const { chooseRenderer, detectWebGLRenderer, isSoftwareRenderer } = await import(
    `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
  const software = ['ANGLE (Google, Vulkan SwiftShader Device)', 'swiftshader',
    'llvmpipe (LLVM 15.0.6, 256 bits)', 'Software Rasterizer', 'Basic Render Driver',
    'Microsoft Basic Render Driver'];
  for (const name of software) {
    assert.equal(isSoftwareRenderer(name), true, `未识别软件渲染器：${name}`);
    assert.equal(chooseRenderer('?map=bamboo_forest&renderer=auto&reset=1', () => name).type, 1,
      `软件 WebGL 未选择 Canvas：${name}`);
  }
  for (const name of ['ANGLE (Intel, Intel UHD Graphics)', 'NVIDIA GeForce RTX 3060', null, undefined, ''])
    assert.equal(isSoftwareRenderer(name), false, `误识别软件渲染器：${name}`);
  assert.equal(chooseRenderer('?map=bamboo_forest', () => 'SwiftShader').type, 1, '缺省应为 auto');
  assert.equal(chooseRenderer('?renderer=invalid', () => 'SwiftShader').type, 1, '非法覆盖应回退 auto');
  assert.equal(chooseRenderer('?renderer=auto', () => 'ANGLE (Intel UHD)').type, 2, '硬件应选择 WebGL');
  assert.equal(chooseRenderer('?renderer=auto', () => null).type, 0, '探测不可用应回退 Phaser.AUTO');
  assert.equal(chooseRenderer('?renderer=auto', () => { throw new Error('probe unavailable'); }).type, 0,
    '探测失败应回退 Phaser.AUTO');
  for (const [preference, type] of [['canvas', 1], ['webgl', 2]]) {
    let probes = 0;
    assert.equal(chooseRenderer(`?map=bamboo_forest&renderer=${preference}`, () => {
      probes++; return 'SwiftShader';
    }).type, type, `${preference} URL 覆盖无效`);
    assert.equal(probes, 0, `${preference} 强制覆盖不应探测 WebGL`);
  }
  const previousDocument = globalThis.document;
  try {
    let releases = 0;
    const rendererParameter = 0x9246;
    const gl = {
      getExtension(name) {
        if (name === 'WEBGL_debug_renderer_info') return { UNMASKED_RENDERER_WEBGL: rendererParameter };
        if (name === 'WEBGL_lose_context') return { loseContext() { releases++; } };
        return null;
      },
      getParameter(parameter) {
        assert.equal(parameter, rendererParameter, '探测应读取 UNMASKED_RENDERER_WEBGL');
        return 'ANGLE (Google SwiftShader)';
      },
    };
    globalThis.document = { createElement: () => ({ getContext: () => gl }) };
    assert.equal(detectWebGLRenderer(), 'ANGLE (Google SwiftShader)', '临时 WebGL 探测未读出软件名');
    assert.equal(releases, 1, '临时 WebGL 上下文未主动释放');
    globalThis.document = { createElement: () => ({ getContext: () => null }) };
    assert.equal(detectWebGLRenderer(), null, '无 WebGL 时探测应返回 null');
    globalThis.document = { createElement: () => ({ getContext: () => ({ getExtension: () => null }) }) };
    assert.equal(detectWebGLRenderer(), null, '扩展不可用时探测应返回 null');
    globalThis.document = { createElement() { throw new Error('canvas unavailable'); } };
    assert.equal(detectWebGLRenderer(), null, '创建 Canvas 失败时探测应返回 null');
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
  console.log(JSON.stringify({ suite: 'perf-renderer-choice', passed: true,
    softwareNames: software.length, temporaryGLProbe: 'extension/unmasked/release/unavailable' }));
}

const rendererSnapshot = page => page.evaluate(() => window.__xt.rendererSnapshot());
async function setDebugWithF1(page, visible) {
  await page.keyboard.down('F1');
  try {
    await page.waitForFunction(expected => window.__xt.rendererSnapshot().debugVisible === expected,
      visible, { timeout: 15000 });
  } finally { await page.keyboard.up('F1'); }
}

async function checkBrowserRenderer(browser, baseURL, variant) {
  const watched = await createPerfPage(browser, `perf-renderer:${variant.label}`);
  const { context, page } = watched;
  try {
    return await watched.run(async () => {
      await openPerfGame(page, baseURL, { renderer: variant.parameter });
      await page.waitForFunction(() => typeof window.__xt.rendererSnapshot === 'function');
      const initial = await rendererSnapshot(page);
      assert.equal(initial.startup.preference, variant.preference, 'URL renderer 偏好未传入游戏');
      assert.equal(initial.debugVisible, false, 'F1 调试默认应关闭');
      assert.ok([1, 2].includes(initial.type), '实际 renderer 不是 Canvas 或 WebGL');
      if (variant.expectedType !== undefined)
        assert.equal(initial.type, variant.expectedType, `${variant.label} 实际渲染器类型不符`);
      if (variant.expectedReason) assert.equal(initial.startup.reason, variant.expectedReason);
      if (initial.startup.reason === 'software') assert.equal(initial.type, 1, '软件 WebGL 未自动降为 Canvas');
      await setDebugWithF1(page, true);
      await page.waitForFunction(() => {
        const s = window.__xt.rendererSnapshot();
        return s.debugVisible && /(?:WebGL|Canvas)/.test(s.debugText)
          && /FPS\s*[:：]?\s*\d+(?:\.\d+)?/i.test(s.debugText)
          && Number.isFinite(s.actualFps) && s.actualFps > 0;
      }, null, { timeout: 15000 });
      const shown = await rendererSnapshot(page);
      assert.ok(shown.debugText.includes(shown.name), 'F1 文本未显示实际 renderer');
      await setDebugWithF1(page, false);
      await assertPerfLoopAlive(page);
      const errors = await assertPerfErrorsClean(page, watched.errors);
      const result = { variant: variant.label, renderer: shown.name, type: shown.type,
        glRenderer: shown.glRenderer, fps: Number(shown.actualFps.toFixed(1)),
        startup: shown.startup, debugText: shown.debugText, f1: 'on/off', ...errors };
      console.log(JSON.stringify(result));
      return result;
    });
  } finally { await context.close(); }
}

await testRendererChoice();
if (!process.argv.includes('--unit-only')) {
  let server, browser, disabledBrowser;
  const results = [];
  try {
    server = await startPerfPreview('perf-renderer smoke');
    browser = await launchPerfBrowser();
    for (const variant of [
      { label: 'canvas', parameter: 'canvas', preference: 'canvas', expectedType: 1, expectedReason: 'override' },
      { label: 'auto', parameter: 'auto', preference: 'auto' },
      { label: 'default-auto', parameter: undefined, preference: 'auto' },
      { label: 'webgl', parameter: 'webgl', preference: 'webgl', expectedType: 2, expectedReason: 'override' },
    ]) results.push(await checkBrowserRenderer(browser, server.baseURL, variant));
    await browser.close(); browser = undefined;
    disabledBrowser = await launchPerfBrowser(['--disable-webgl']);
    results.push(await checkBrowserRenderer(disabledBrowser, server.baseURL,
      { label: 'disable-webgl-auto', parameter: 'auto', preference: 'auto', expectedType: 1,
        expectedReason: 'unavailable' }));
    console.log(JSON.stringify({ suite: 'perf-renderer', passed: true, variants: results.length,
      softwareAutoObserved: results.some(result => result.startup.reason === 'software'),
      limitation: '无头测试验证渲染选择和显示，不以 FPS 数值作性能门槛；真实 GPU 由设备实测。' }));
  } finally {
    await disabledBrowser?.close();
    await browser?.close();
    await server?.close();
  }
}
