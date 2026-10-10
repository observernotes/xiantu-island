// 先 npm run build，再 npm run test:smoke:v05（外层 timeout 120s，无头 Chromium）。
// 可用 PLAYWRIGHT_MODULE / CHROMIUM_EXECUTABLE_PATH 指定本机工具，XT_SMOKE_BASE_URL 测已有服务。
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { preview } from 'vite';
import { sharedRoot } from './root.mjs';

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const maps = [
  ['luoxia_town', 'luoxia'],
  ['wanyao_outer_1', 'wanyao'],
  ['tianjian_sect', 'tianjian'],
  ['trial_taixu_stage', 'taixu'],
  ['trial_lingfu_range', 'lingfu'],
  ['trial_youying_vault', 'youying'],
  ['trial_wanshou_pen', 'wanshou'],
];
const screenshot = path.join(sharedRoot(projectRoot), 'qa/shots/dev_luoxia_town.png');
const dataRoot = sharedRoot(projectRoot);
const strings = JSON.parse(await fs.readFile(path.join(dataRoot, 'balance/strings_zh.json'), 'utf8'));
const sectSeclusion = JSON.parse(await fs.readFile(path.join(dataRoot, 'balance/solo_pacing.json'), 'utf8')).sectSeclusion;
const realms = JSON.parse(await fs.readFile(path.join(dataRoot, 'balance/realms.json'), 'utf8'));
const text = (key, args = {}) => strings[key].replace(/\{(\w+)\}/g, (_, name) => String(args[name] ?? ''));

function collectErrors(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
  page.on('requestfailed', request => errors.push(`requestfailed: ${request.url()} ${request.failure()?.errorText}`));
  return errors;
}

async function waitForMap(page, mapId, pause = false) {
  await page.waitForFunction(({ id, pause }) => {
    const scene = window.__scene;
    if (scene?.map?.id !== id || !scene.player || !scene.dialog || scene.game.loop.frame <= 3) return false;
    if (pause) scene.physics.pause();
    return true;
  }, { id: mapId, pause }, { timeout: 15000 });
}

async function extraInteractions(context, baseURL) {
  const page = await context.newPage();
  const errors = collectErrors(page);
  const checks = [];
  const go = async mapId => {
    const url = new URL(baseURL);
    url.searchParams.set('map', mapId); url.searchParams.set('reset', '1');
    await page.goto(url.href, { waitUntil: 'networkidle', timeout: 30000 });
    await waitForMap(page, mapId);
  };
  const landing = async (mapId, targetPortal) => {
    await waitForMap(page, mapId, true);
    const state = await page.evaluate(portal => {
      const scene = window.__scene;
      const expected = portal ? scene.map.objects.find(o => o.type === 'portal' && o.name === portal) : scene.map.spawn;
      return { actual: { x: scene.player.x, y: scene.player.y }, expected: { x: expected.x, y: expected.y } };
    }, targetPortal ?? null);
    assert.ok(Math.abs(state.actual.x - state.expected.x) <= 2 && Math.abs(state.actual.y - state.expected.y) <= 8,
      `${mapId}: ${targetPortal ?? 'playerStart'} 落点错误 ${JSON.stringify(state)}`);
  };
  try {
    await go('qingyun_village');
    assert.equal(await page.evaluate(() => window.__scene.map.objects.some(o => o.type === 'npc' && o.props.npc === 'tianjian_elder')), false);
    checks.push('phase5: 青云村传功长老移除');

    await go('luoxia_town');
    const priority = await page.evaluate(() => {
      const scene = window.__scene, original = scene.map.objects, level = scene.prog.level;
      scene.map.objects = [{ type: 'portal', name: 'smoke_req_level', x: scene.player.x, y: scene.player.y, w: 0, h: 0,
        props: { reqLevel: level + 1, unlockQuest: 'smoke_not_done', target: 'tianjian_sect' } }];
      scene.tryInteract(); const lowLevel = scene.logs.at(-1)?.text;
      scene.prog.level = level + 1; scene.tryInteract(); const questLocked = scene.logs.at(-1)?.text;
      scene.prog.level = level; scene.map.objects = original;
      return { lowLevel, questLocked, map: scene.map.id, level };
    });
    assert.equal(priority.lowLevel, text('sys.portal_level', { lv: priority.level + 1 }));
    assert.equal(priority.questLocked, text('sys.portal_locked'));
    assert.equal(priority.map, 'luoxia_town');
    checks.push('portal: 等级先于未解锁任务');

    await page.evaluate(() => window.__scene.talkTo('ferry_master'));
    assert.deepEqual(await page.evaluate(() => window.__scene.dialog.choices.map(choice => choice.label).slice(0, 2)), ['万妖林', '天剑宗']);
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    assert.deepEqual(await page.evaluate(() => ({ open: window.__scene.dialog.open, map: window.__scene.map.id })), { open: false, map: 'luoxia_town' });
    checks.push('航线: Esc 告辞留在落霞镇');
    for (const [index, target] of [[1, 'wanyao_outer_1'], [2, 'tianjian_sect']]) {
      await go('luoxia_town');
      await page.evaluate(() => window.__scene.talkTo('ferry_master'));
      await page.keyboard.press(String(index));
      await landing(target);
      checks.push(`航线: ${target} 按数字上船，落在 playerStart`);
    }

    for (const [mapId, targetPortal] of [['wanyao_outer_1', null], ['tianjian_sect', 'portal_to_outskirts']]) {
      await go(mapId);
      await page.evaluate(portal => {
        const scene = window.__scene, ferry = scene.map.objects.find(o => o.type === 'ferry');
        // 地图目前没填 targetPortal；运行时补一个已有目标门，覆盖指定落点分支。
        if (portal) ferry.props.targetPortal = portal;
        scene.player.body.reset(ferry.x + ferry.w / 2, ferry.y);
        scene.dialog.close(); scene.tryInteract();
      }, targetPortal);
      await landing('luoxia_town', targetPortal);
      checks.push(`ferry: ${mapId} returnTo，落在 ${targetPortal ?? 'playerStart'}`);
    }

    await go('tianjian_sect');
    assert.equal(await page.evaluate(() => window.__scene.map.objects.some(o => o.type === 'npc' && o.props.npc === 'tianjian_elder')), true);
    checks.push('phase5: 山门传功长老出现');
    const seclusion = await page.evaluate(({ level, contribution }) => {
      const scene = window.__scene, room = scene.map.objects.find(o => o.type === 'seclusion');
      scene.physics.pause(); scene.player.body.reset(room.x, room.y);
      scene.prog.level = 1; scene.tryInteract(); const locked = scene.dialog.lines.map(line => line.text);
      scene.dialog.close(); scene.prog.level = level; scene.prog.sectContribution = contribution;
      const before = { exp: scene.prog.exp, contribution: scene.prog.sectContribution };
      scene.tryInteract(); const cost = scene.dialog.lines.map(line => line.text);
      scene.dialog.close();
      return { locked, cost, before, after: { exp: scene.prog.exp, contribution: scene.prog.sectContribution } };
    }, { level: realms.find(realm => realm.id === sectSeclusion.unlockRealm).levelMin, contribution: 7 });
    assert.deepEqual(seclusion.locked, [text('sys.seclusion_locked')]);
    assert.deepEqual(seclusion.cost, sectSeclusion.options.map(years => text('sys.seclusion_cost', {
      years, cost: sectSeclusion.contributionCost[String(years)], have: 7,
    })));
    assert.deepEqual(seclusion.after, seclusion.before);
    checks.push('seclusion: 境界提示、读表费用，骨架不扣贡献或加修为');

    await page.evaluate(() => {
      const scene = window.__scene;
      scene.prog.level = 29; scene.prog.inventory.foundation_pill = 1;
      scene.offerTrial('tianjian_elder', { id: 'trial_foundation_altar', map: 'trial_foundation_altar', durationMs: 60000 });
    });
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    assert.deepEqual(await page.evaluate(() => ({ map: window.__scene.map.id, open: window.__scene.dialog.open,
      pending: window.__scene.registry.get('trialPending') ?? null, pill: window.__scene.prog.inventory.foundation_pill })),
    { map: 'tianjian_sect', open: true, pending: null, pill: 1 });
    checks.push('普通 offerTrial: Esc 不入阵、不扣丹');

    await go('tianjian_sword_tomb');
    const enterTutorial = async () => page.evaluate(() => {
      const scene = window.__scene, zone = scene.map.zones.find(zone => zone.props.tutorial);
      scene.physics.pause(); scene.dialog.close(); scene.player.body.reset(zone.x + zone.w / 2, zone.y + zone.h / 2);
      return zone.props.tutorial;
    });
    const tutorial = await enterTutorial();
    await page.waitForFunction(id => window.__scene.prog.tutorialsSeen.includes(id) && window.__scene.dialog.open, tutorial);
    assert.equal(await page.evaluate(() => window.__scene.dialog.lines[0].text), text(`tip.${tutorial}`));
    await page.evaluate(() => window.__scene.dialog.close()); await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => window.__scene.dialog.open), false);
    await page.evaluate(() => { const url = new URL(location.href); url.searchParams.delete('reset'); history.replaceState(null, '', url.href); });
    await page.reload({ waitUntil: 'networkidle', timeout: 30000 }); await waitForMap(page, 'tianjian_sword_tomb');
    await enterTutorial(); await page.waitForTimeout(200);
    assert.deepEqual(await page.evaluate(id => ({ open: window.__scene.dialog.open,
      count: window.__scene.prog.tutorialsSeen.filter(seen => seen === id).length,
      saved: JSON.parse(localStorage.getItem('xiantu_save_v1')).tutorialsSeen.includes(id) }), tutorial),
    { open: false, count: 1, saved: true });
    checks.push('tutorial: 首次进入提示，持续站区与刷新都不重复');
    assert.deepEqual(errors, [], '交互验证出现浏览器报错');
    console.log(JSON.stringify({ interactionChecks: checks, errors: 0 }));
    return checks.length;
  } catch (error) {
    console.error(JSON.stringify({ interactionChecks: checks, errors, failure: error.message }));
    throw error;
  } finally { await page.close(); }
}

async function loadPlaywright() {
  const candidates = process.env.PLAYWRIGHT_MODULE
    ? [process.env.PLAYWRIGHT_MODULE]
    : ['playwright', 'playwright-core', '/tmp/pwt/node_modules/playwright-core/index.mjs'];
  for (const candidate of candidates) {
    try {
      const api = await import(path.isAbsolute(candidate) ? pathToFileURL(candidate).href : candidate);
      return { api, module: candidate };
    } catch (error) {
      if (process.env.PLAYWRIGHT_MODULE) throw error;
    }
  }
  throw new Error('未找到 Playwright；请用 PLAYWRIGHT_MODULE 指定外部安装的 playwright-core/index.mjs');
}

async function browserPath(chromium) {
  const candidates = process.env.CHROMIUM_EXECUTABLE_PATH
    ? [process.env.CHROMIUM_EXECUTABLE_PATH]
    : [chromium.executablePath(), '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  for (const candidate of candidates) {
    try { await fs.access(candidate); return candidate; } catch { /* 尝试下一条本机路径 */ }
  }
  throw new Error('未找到 Chromium；请用 CHROMIUM_EXECUTABLE_PATH 指定浏览器');
}

let server;
let browser;
const results = [];
try {
  const { api, module } = await loadPlaywright();
  const executablePath = await browserPath(api.chromium);
  let baseURL = process.env.XT_SMOKE_BASE_URL;
  if (!baseURL) {
    await fs.access(path.join(projectRoot, 'dist/index.html'));
    server = await preview({ root: projectRoot, preview: { host: '127.0.0.1', port: 4185 }, logLevel: 'error' });
    baseURL = server.resolvedUrls.local[0];
  }
  browser = await api.chromium.launch({
    executablePath, headless: true, timeout: 20000,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await fs.mkdir(path.dirname(screenshot), { recursive: true });
  console.log(JSON.stringify({ baseURL, playwright: module, browser: executablePath, headless: true }));

  for (const [mapId, area] of maps) {
    const page = await context.newPage();
    const errors = collectErrors(page);
    const url = new URL(baseURL);
    url.searchParams.set('map', mapId);
    url.searchParams.set('reset', '1');
    try {
      await page.goto(url.href, { waitUntil: 'networkidle', timeout: 30000 });
      await waitForMap(page, mapId);
      // 多观察一些渲染帧，覆盖 create 之后 update / 怪物行为的异步异常。
      await page.waitForTimeout(750);
      const state = await page.evaluate(({ area }) => {
        const scene = window.__scene;
        const keys = [`tiles_${area}`, `tiles_${area}_ss`, `bg_${area}_far`, `bg_${area}_mid`];
        const textures = Object.fromEntries(keys.map(key => {
          if (!scene.textures.exists(key)) return [key, false];
          const source = scene.textures.get(key).getSourceImage();
          return [key, source.width > 0 && source.height > 0];
        }));
        const terrainUsesArea = scene.children.list.some(child =>
          child.type === 'TilemapLayer' && child.tileset?.some(tileset => tileset.name === `tiles_${area}`));
        const ferries = scene.map.objects.filter(o => o.type === 'ferry').map(o => {
          const boat = scene.children.getByName(`ferry:${o.name}`);
          return { name: o.name, rendered: !!boat, x: boat?.x, y: boat?.y, expectedX: o.x + o.w / 2,
            expectedY: o.y + (scene.map.id === 'luoxia_town' ? 96 : 0), noCollision: !boat?.body, depthBelowPlayer: boat?.depth < scene.player.depth };
        });
        const spawnGates = scene.map.spawnGates.map(gate => ({ name: gate.name, side: gate.props.side }));
        const phaseValid = scene.map.objects.filter(o => o.type === 'npc').every(o =>
          (o.props.phaseMin == null || Number(o.props.phaseMin) <= 5) && (o.props.phaseMax == null || Number(o.props.phaseMax) >= 5));
        return { map: scene.map.id, textures, terrainUsesArea, ferries, spawnGates, phaseValid, fps: Math.round(scene.game.loop.actualFps) };
      }, { area });
      assert.equal(state.map, mapId);
      for (const [key, loaded] of Object.entries(state.textures)) assert.ok(loaded, `${mapId}: 缺少纹理 ${key}`);
      assert.ok(state.terrainUsesArea, `${mapId}: 地形未使用 ${area} 图块`);
      assert.ok(state.phaseValid, `${mapId}: NPC 阶段过滤错误`);
      for (const ferry of state.ferries) {
        assert.ok(ferry.rendered && ferry.noCollision && ferry.depthBelowPlayer, `${mapId}: 飞舟渲染、碰撞或 depth 错误`);
        assert.equal(ferry.x, ferry.expectedX); assert.equal(ferry.y, ferry.expectedY);
      }
      if (['trial_taixu_stage', 'trial_wanshou_pen'].includes(mapId))
        assert.deepEqual(state.spawnGates.map(gate => gate.side).sort(), ['left', 'right']);
      if (mapId === 'luoxia_town') await page.screenshot({ path: screenshot });
      assert.deepEqual(errors, [], `${mapId}: 浏览器出现报错`);
      results.push({ ...state, errors: 0 });
      console.log(JSON.stringify(results.at(-1)));
    } catch (error) {
      console.error(JSON.stringify({ map: mapId, errors, failure: error.message }));
      throw error;
    } finally {
      await page.close();
    }
  }
  const interactionChecks = await extraInteractions(context, baseURL);
  console.log(JSON.stringify({ passed: results.length, interactionChecks, consoleErrors: 0, screenshot }));
} finally {
  if (browser) await browser.close();
  if (server) await new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve()));
}
