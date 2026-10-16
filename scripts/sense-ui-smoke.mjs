// 先 npm run build:test；仅用浏览器会话内的开关、绑定和 Sense 夹具，不改正式数据。
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { preview } from 'vite';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const shotDir = path.resolve(process.env.SENSE_UI_SHOT_DIR ?? path.join(root, 'dist/sense-ui-shots'));
let browser, server, assertions = 0;
const eq = (actual, expected, message) => { assert.deepEqual(actual, expected, message); assertions++; };
const ok = (value, message) => { assert.ok(value, message); assertions++; };
const seed = { name: '神识界面自测', level: 30, hp: 5000, mp: 5000, exp: 0, stones: 123,
  allocatedStats: { rootBone: 29, agility: 29, spirit: 29, insight: 29 }, unspentStatPoints: 0,
  questRewardVersion: 1, moralVersion: 1, ageUpdatedAt: Date.now() };

async function chromium() {
  for (const candidate of [process.env.PLAYWRIGHT_MODULE, 'playwright', 'playwright-core', '/tmp/pwt/node_modules/playwright-core/index.mjs'].filter(Boolean)) {
    try { return (await import(path.isAbsolute(candidate) ? pathToFileURL(candidate).href : candidate)).chromium; } catch { /* 下一个 */ }
  }
  throw new Error('未找到 Playwright；请设置 PLAYWRIGHT_MODULE');
}
async function executable(api) {
  for (const candidate of [process.env.CHROMIUM_EXECUTABLE_PATH, api.executablePath(), '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean)) {
    try { await fs.access(candidate); return candidate; } catch { /* 下一个 */ }
  }
  throw new Error('未找到 Chromium');
}
async function clickNamed(page, name, panel = false) {
  const bounds = await page.evaluate(({ name, panel }) => {
    const s = window.__scene, object = panel ? s.children.getByName('attr-panel')?.getByName(name) : s.children.getByName(name);
    const b = object?.getBounds();
    return object?.input?.enabled && b ? { x: b.centerX, y: b.centerY } : null;
  }, { name, panel });
  ok(bounds, `缺少可点击的 ${name}`);
  await page.mouse.click(bounds.x, bounds.y);
  await page.waitForTimeout(100);
}

try {
  await fs.mkdir(shotDir, { recursive: true });
  const baseURL = process.env.XT_SMOKE_BASE_URL ?? await (async () => {
    server = await preview({ root, preview: { host: '127.0.0.1', port: 0, open: false } });
    return server.resolvedUrls.local[0];
  })();
  const api = await chromium();
  browser = await api.launch({ executablePath: await executable(api), headless: true,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });

  async function session() {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, timezoneId: 'Asia/Shanghai' });
    await context.addInitScript(seed => { localStorage.setItem('xiantu_save_v1', JSON.stringify(seed)); }, seed);
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', event => { if (event.type() === 'error') errors.push(event.text()); });
    await page.goto(new URL('?map=qingyun_village', baseURL).href, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__scene?.senseUi && window.__xt?.senseFixture);
    await page.waitForTimeout(350);
    return { page, async done() { try { eq(errors, [], '浏览器无异常'); } finally { await context.close(); } } };
  }

  // 关态无入口、无展开、无教学写档；仍订阅的事件处理器必须静默。
  {
    const { page, done } = await session();
    const off = await page.evaluate(() => {
      window.__xt.setFlag('spiritScan', false);
      const s = window.__scene, before = localStorage.getItem('xiantu_save_v1'), logs = [...(window.__logs ?? [])];
      s.events.emit('sense:blocked', { ok: false, blockKey: 'sense.block.mp', source: 'button' });
      s.events.emit('sense:scan', { ok: true, resultKey: 'sense.result.empty', hits: [], count: 0, faint: false });
      s.events.emit('sense:intel-expired', { instanceId: s.map.id, id: 'not-viewing' });
      s.senseUi.requestScan('button'); s.attrPanel.open();
      return { button: !!s.children.getByName('sense-scan-button'), toggle: !!s.children.getByName('attr-panel')?.getByName('attr-sense-toggle'),
        before, after: localStorage.getItem('xiantu_save_v1'), state: s.prog.senseState ?? null,
        logs, afterLogs: window.__logs ?? [], binding: s.inputBindings.keyCode('spirit_scan') ?? null };
    });
    eq(off.button, false, '关态不创建扫描按钮'); eq(off.toggle, false, '关态不显示神识展开');
    eq(off.before, off.after, '关态 UI 不写盘'); eq(off.state, null, '关态 UI 不补 senseState');
    eq(off.logs, off.afterLogs, '关态事件静默'); eq(off.binding, null, '默认不绑任何键');
    await page.screenshot({ path: path.join(shotDir, 'disabled.png') });
    await done();
  }

  {
    const { page, done } = await session();
    await page.evaluate(async () => { window.__xt.setFlag('spiritScan', true); await window.__xt.senseFixture({ cooldownMs: 300, inspectDurationMs: 300 }); });
    await page.waitForTimeout(350);
    const start = await page.evaluate(() => {
      const s = window.__scene, original = s.sense.requestScan.bind(s.sense);
      // 固定回蓝这个外部变量，才能精确断言每次扫描/只读浏览的灵力差额。
      s.regenMp = () => {};
      window.__uiRequests = [];
      s.sense.requestScan = (source, scanId) => { const result = original(source, scanId); window.__uiRequests.push({ source, scanId, result }); return result; };
      window.__xt.events.drain();
      return { mp: s.prog.mp, cost: s.sense.preview().mpCost, hint: s.children.getByName('sense-scan-key-hint').text };
    });
    ok(start.hint.includes('未绑定'), '键帽读真实未绑定状态');
    await page.mouse.move(480, 622); await page.mouse.down(); await page.waitForTimeout(80);
    const first = await page.evaluate(() => {
      const s = window.__scene, requests = window.__uiRequests, result = requests[0]?.result;
      const wave = s.children.getByName('fx_spirit_scan_wave');
      const reveals = s.children.list.filter(o => o.name === 'fx_spirit_scan_reveal');
      const outlines = s.children.list.filter(o => o.name.startsWith('sense-highlight:'));
      const chest = s.children.getByName('chest:xt_sense_chest').getBounds();
      return { requests, result, wave: wave && { x: wave.x, y: wave.y, scale: wave.scaleX, origin: [wave.originX, wave.originY] },
        reveals: reveals.map(o => ({ x: o.x, y: o.y })), chestCenter: { x: chest.centerX, y: chest.centerY },
        outlines: outlines.map(o => ({ alpha: o.alpha,
          // Graphics 构造时还含默认的黑色 1px 线型，检查实际绘制前追加的 LINE_STYLE 命令。
          styled: o.commandBuffer.some((command, i, buffer) => command === 6 && buffer[i + 1] === 2 && buffer[i + 2] === 0x6EC6FF) })),
        mp: s.prog.mp, seen: s.prog.senseState?.tutorialSeen, logs: window.__logs };
    });
    eq(first.requests.length, 1, '真实按钮按下只发一个请求'); eq(first.result.ok, true, '按钮扫描成功');
    eq(first.mp, start.mp - start.cost, '按钮恰好扣一次灵力');
    eq([first.wave.x, first.wave.y], [first.result.center.x, first.result.center.y], 'wave 使用冻结中心');
    eq(first.wave.scale, first.result.radius / 120, 'wave 半径按第八帧 120px 标定'); eq(first.wave.origin, [0.5, 0.5], 'wave 原点');
    eq(first.reveals.length, 2, '只给两个首次显形点播放 reveal');
    ok(first.reveals.some(point => point.x === first.chestCenter.x && point.y === first.chestCenter.y), '脚底原点宝箱使用可见中心');
    eq(first.outlines.length, 2, '显形高亮外框');
    ok(first.outlines.every(o => o.alpha >= 0.599 && o.alpha <= 1 && o.styled), `2px 天青呼吸高亮：${JSON.stringify(first.outlines)}`);
    eq(first.seen, true, '实际展示教学后标记已读'); ok(first.logs.some(line => line.includes('领悟神识扫描')), '教学确实展示');
    const retry = await page.evaluate(() => window.__scene.senseUi.requestScan('button'));
    eq(retry.scanId, first.result.scanId, '按下期间重试复用 operationId'); eq(retry.replayed, true, '重试认领已提交事务');
    await page.mouse.down({ button: 'right' }); await page.mouse.up({ button: 'right' });
    eq(await page.evaluate(() => window.__uiRequests.length), 2, '主键按住时右键不制造新操作');
    await page.waitForTimeout(650);
    eq(await page.evaluate(() => window.__uiRequests.length), 2, '按钮长按跨冷却仍不连发');
    await page.mouse.move(1300, 750); await page.mouse.up();
    await clickNamed(page, 'sense-scan-button');
    const second = await page.evaluate(() => window.__uiRequests.at(-1));
    ok(second.scanId !== first.result.scanId, '新按下使用新 operationId'); eq(second.result.ok, true, '新按下重新扫描');

    const attrBefore = await page.evaluate(() => ({ mp: window.__scene.prog.mp, save: localStorage.getItem('xiantu_save_v1') }));
    await page.keyboard.press('p', { delay: 80 }); await page.waitForTimeout(180);
    await clickNamed(page, 'attr-sense-toggle', true);
    const details = await page.evaluate(() => ({ text: window.__scene.children.getByName('attr-panel').getByName('attr-sense-details').text,
      mp: window.__scene.prog.mp, save: localStorage.getItem('xiantu_save_v1') }));
    for (const text of ['神识强度', '探查范围', '消耗灵力', '冷却', '神识来源', '角色加点', '已生效心法', '未绑定']) ok(details.text.includes(text), `属性展开包含${text}`);
    ok(!details.text.includes('NaN'), '属性预览无 NaN'); eq(details.mp, attrBefore.mp, '浏览神识不扣蓝'); eq(details.save, attrBefore.save, '浏览神识不写盘');
    await page.screenshot({ path: path.join(shotDir, 'expanded.png') });
    const invalidPreview = await page.evaluate(() => {
      const s = window.__scene, preview = s.sense.preview.bind(s.sense);
      s.sense.preview = () => ({ ...preview(), strength: NaN, radius: undefined, mpCost: NaN, cooldownMs: NaN,
        ready: true, sources: [{ label: '无效来源', value: NaN }, {}, null] });
      s.attrPanel.update();
      const text = s.children.getByName('attr-panel').getByName('attr-sense-details').text;
      s.sense.preview = preview; s.attrPanel.update();
      return text;
    });
    ok(!invalidPreview.includes('NaN') && !invalidPreview.includes('无效来源'), '缺失和非法数值跳过展示');
    ok(invalidPreview.includes('神识已平复'), 'ready 文案取自只读预览');
    // 模态里按住配置键，关闭面板后不会回放旧边沿。
    await page.evaluate(() => window.__scene.inputBindings.bind('spirit_scan', 113));
    await page.waitForTimeout(80); const count = await page.evaluate(() => window.__uiRequests.length);
    await page.keyboard.down('F2'); await page.waitForTimeout(160);
    await page.keyboard.press('Escape', { delay: 80 }); await page.waitForTimeout(180);
    eq(await page.evaluate(() => window.__uiRequests.length), count, '模态按键关闭后不补发');
    await page.keyboard.up('F2'); await page.waitForTimeout(80);
    await page.keyboard.down('F2'); await page.waitForTimeout(750);
    eq(await page.evaluate(() => window.__uiRequests.length), count + 1, '绑定键长按跨冷却只触发一次');
    eq(await page.evaluate(() => window.__uiRequests.at(-1).source), 'key', '真实键盘走 key 来源');
    ok((await page.evaluate(() => window.__scene.children.getByName('sense-scan-key-hint').text)).includes('F2'), '键帽读取实际 F2 绑定');
    await page.keyboard.up('F2');
    await page.evaluate(() => window.__scene.inputBindings.bind('spirit_scan', 114)); await page.waitForTimeout(80);
    await page.keyboard.press('F2', { delay: 80 }); await page.waitForTimeout(80);
    eq(await page.evaluate(() => window.__uiRequests.length), count + 1, '重绑后旧键不扫描');
    await page.keyboard.press('F3', { delay: 80 }); await page.waitForTimeout(80);
    eq(await page.evaluate(() => window.__uiRequests.length), count + 2, '重绑后新键生效');
    // 已有 busy provider 与对话都不能绕过；按钮即使收到过期事件也不能提交。
    const busy = await page.evaluate(() => {
      const s = window.__scene, before = window.__uiRequests.length, unregister = s.registerSenseBusy(() => true);
      s.senseUi.refresh();
      const button = s.children.getByName('sense-scan-button'), disabled = !button.input.enabled;
      button.emit('pointerdown', { id: 0, button: 0, leftButtonDown: () => true });
      s.input.emit('pointerup'); unregister();
      s.dialog.show([{ speaker: null, text: '神识界面对话门控' }], null);
      button.emit('pointerdown', { id: 0, button: 0, leftButtonDown: () => true }); s.input.emit('pointerup');
      s.dialog.close();
      return { disabled, before, after: window.__uiRequests.length };
    });
    eq(busy.disabled, true, 'busy 禁用按钮'); eq(busy.after, busy.before, '过期按钮事件不能绕过 busy/对话');
    const expiredLogs = await page.evaluate(() => (window.__logs ?? []).filter(line => line.includes('探查情报已失效')).length);
    eq(expiredLogs, 0, '未打开情报窗不刷到期消息');
    await page.waitForTimeout(6200);
    const ended = await page.evaluate(() => ({ fx: window.__scene.children.list.filter(o => o.name.startsWith('sense-highlight:') || o.name.startsWith('fx_spirit_scan_')).length,
      snapshot: window.__xt.senseFixtureSnapshot() }));
    eq(ended.fx, 0, '动画和 highlightMs 到期后销毁表现'); eq(ended.snapshot.platform.enabled, true, '高亮结束保留平台碰撞');
    eq(ended.snapshot.chestVisible, true, '高亮结束保留显形');
    await page.screenshot({ path: path.join(shotDir, 'hud.png') });

    // 运行期关态立即撤下按钮；显式销毁逐一注销监听。
    const cleaned = await page.evaluate(() => {
      const s = window.__scene, baseline = ['sense:scan', 'sense:blocked', 'sense:intel-expired'].map(e => s.events.listenerCount(e));
      window.__xt.setFlag('spiritScan', false);
      const hidden = !s.children.getByName('sense-scan-button');
      s.senseUi.destroy();
      return { hidden, baseline, after: ['sense:scan', 'sense:blocked', 'sense:intel-expired'].map(e => s.events.listenerCount(e)) };
    });
    eq(cleaned.hidden, true, '运行时关态撤下按钮');
    eq(cleaned.after, cleaned.baseline.map(n => n - 1), '销毁逐一注销三个 sense 事件');
    await done();
  }

  // 必须首次显形，才能真实覆盖缺 reveal 纹理的分支；关闭真实 Scene 验证 SHUTDOWN。
  {
    const { page, done } = await session();
    await page.evaluate(async () => { window.__xt.setFlag('spiritScan', true); await window.__xt.senseFixture(); });
    await page.waitForTimeout(350);
    const before = await page.evaluate(() => {
      const s = window.__scene;
      s.regenMp = () => {};
      s.anims.remove('fx_spirit_scan_wave_play'); s.textures.remove('fx_spirit_scan_reveal');
      window.__xt.events.drain();
      return { mp: s.prog.mp, cost: s.sense.preview().mpCost };
    });
    await clickNamed(page, 'sense-scan-button');
    const degraded = await page.evaluate(() => ({ mp: window.__scene.prog.mp, events: window.__xt.events.drain(),
      fx: window.__scene.children.list.filter(o => o.name.startsWith('fx_spirit_scan_')).length,
      outlines: window.__scene.children.list.filter(o => o.name.startsWith('sense-highlight:')).length }));
    const scans = degraded.events.filter(event => event.type === 'sense:scan');
    eq(scans.length, 1, '缺素材只提交一次，不重提扫描'); eq(scans[0].data.count, 2, '缺素材仍完成首次显形');
    eq(degraded.mp, before.mp - before.cost, '缺素材不退费'); eq(degraded.fx, 0, '缺动画/纹理静默跳过 sprite');
    eq(degraded.outlines, 2, '缺精灵仍可绘制独立高亮');
    const shutdown = await page.evaluate(() => {
      const s = window.__scene, ui = s.senseUi;
      const oldFx = [...ui.fx];
      // scene.stop 排队到下一次场景管理循环，保存真实关闭后的引用以检查清理。
      window.__uiShutdown = { s, ui, oldFx };
      s.scene.stop();
      return true;
    });
    ok(shutdown, '请求真实 Scene stop');
    await page.waitForFunction(() => !window.__uiShutdown.s.scene.isActive());
    const stopped = await page.evaluate(() => {
      const { s, ui, oldFx } = window.__uiShutdown;
      return { fx: ui.fx.size, activeFx: oldFx.filter(o => o.active).length,
        listeners: ['sense:scan', 'sense:blocked', 'sense:intel-expired'].map(event => s.events.listeners(event).includes(
          event === 'sense:scan' ? ui.onScan : event === 'sense:blocked' ? ui.onBlocked : ui.onIntelExpired)) };
    });
    eq(stopped.fx, 0, 'SHUTDOWN 清空高亮及动画引用'); eq(stopped.activeFx, 0, 'SHUTDOWN 销毁实际高亮对象');
    eq(stopped.listeners, [false, false, false], 'SHUTDOWN 注销三个实际订阅');
    await done();
  }
  console.log(`sense-ui-smoke: ${assertions} assertions passed; screenshots: ${shotDir}`);
} finally {
  await browser?.close();
  await server?.close();
}
