import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(path.join(process.cwd(), 'package.json'));
const { chromium } = require('playwright-core');
const outDir = process.env.GSB_SMOKE_OUT ?? path.dirname(fileURLToPath(import.meta.url));
const baseUrl = process.env.GSB_SMOKE_URL ?? 'http://127.0.0.1:5183';
const fixtures = [
  { mapId: 'tianjian_sect', sceneId: 'tianjian_sect_gsb_v1', revision: 'tianjian-sect-final-003',
    width: 3072, height: 960, spawnY: 832,
    solids: 6, oneWays: 4,
    climbs: [
      { kind: 'rope', x: 240, bottom: 832, top: 704 },
      { kind: 'ladder', x: 1680, bottom: 704, top: 544 },
      { kind: 'rope', x: 1904, bottom: 544, top: 448 },
      { kind: 'ladder', x: 2576, bottom: 768, top: 608 },
    ],
    stand: { x: 241, top: 704 },
    oneWay: { x: 241, bottom: 832, top: 704 } },
  { mapId: 'taixu_temple', sceneId: 'taixu_temple_gsb_v1', revision: 'taixu-final-001',
    width: 1280, height: 640, spawnY: 512,
    solids: 3, oneWays: 3,
    climbs: [
      { kind: 'ladder', x: 176, bottom: 512, top: 384 },
      { kind: 'rope', x: 816, bottom: 512, top: 352 },
      { kind: 'ladder', x: 1008, bottom: 352, top: 224 },
    ],
    stand: { x: 177, top: 384 },
    oneWay: { x: 177, bottom: 512, top: 384 } },
];
const report = {
  passed: false, baseUrl, startedAt: new Date().toISOString(),
  positioning: 'Each map starts via ?map URL and lands naturally. All climbs use __scene.player.body.reset onto climb x/bottom, then real ArrowUp and Arcade physics (state2 stays rope for ladders). Collision probes use odd-x drop + one-way ascent. Transitions use __xt.teleport. Covers sect↔tomb↔taixu GSB↔GSB and GSB↔non-GSB lingfu_pavilion (灵符／幽影／万寿未令不接，仅对照).',
  checks: [], maps: {}, transitions: [], screenshots: [], browserErrors: [], failedRequests: [], gsbRequests: [],
};
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true,
  args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
let page;
const record = (name, detail = {}) => {
  report.checks.push({ name, ...detail });
  console.log(`PASS ${name}`);
};
try {
  page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', error => report.browserErrors.push({ type: 'pageerror', message: error.message }));
  page.on('console', message => {
    if (message.type() === 'error') report.browserErrors.push({ type: 'console.error', message: message.text() });
  });
  page.on('requestfailed', request => report.failedRequests.push({ url: request.url(), failure: request.failure() }));
  page.on('request', request => {
    if (request.url().includes('/art/scenes/')) report.gsbRequests.push(request.url());
  });
  const wait = (fn, arg = null, timeout = 10000) => page.waitForFunction(fn, arg, { timeout });
  const state = () => page.evaluate(() => {
    const s = window.__scene, p = s?.player;
    return { mapId: s?.map?.id, gsbScene: s?.map?.gsbScene ?? null, width: s?.map?.width, height: s?.map?.height,
      player: p ? { x: p.x, feet: p.body.bottom, grounded: p.onGround, state: p.state2, vy: p.body.velocity.y } : null,
      solids: s?.map?.solids?.getChildren().length, oneWays: s?.map?.oneWays?.getChildren().length,
      ropes: s?.map?.ropes, props: !!s?.propLayout, background: !!s?.backgroundArt, parallax: s?.parallax?.length ?? 0,
      art: s?.children.list.filter(o => o.texture?.key?.startsWith('gsb_')).map(o => ({ key: o.texture.key, x: o.x, y: o.y, width: o.displayWidth, height: o.displayHeight, visible: o.visible })),
      tiles: s?.children.list.filter(o => o.type === 'TilemapLayer' || o.texture?.key?.startsWith('tiles_')).length };
  });
  const protect = () => page.evaluate(() => {
    const s = window.__scene;
    s.player.invulnUntil = Number.MAX_SAFE_INTEGER;
    s.prog?.markTutorialSeen?.('skill_points');
    if (s.dialog?.open) s.dialog.close();
    for (const mob of s.mobs ?? []) {
      if (!mob?.body) continue;
      mob.body.checkCollision.none = true;
      mob.body.enable = false;
    }
  });
  const ready = mapId => wait(mapId => window.__scene?.map?.id === mapId && window.__scene?.player?.active && window.__xt?.teleport, mapId, 45000);
  const landed = top => wait(top => Math.abs(window.__scene.player.body.bottom - top) < 0.001 && window.__scene.player.onGround, top, 15000);
  const reset = (x, feet) => page.evaluate(({ x, feet }) => {
    const s = window.__scene, p = s.player;
    p.leaveRope(s.time.now); p.body.reset(x, feet); p.body.setVelocity(0, 0);
    p.dropUntil = -9999; p.invulnUntil = Number.MAX_SAFE_INTEGER; p.ropeRegrabAt = 0;
  }, { x, feet });
  const assertGsb = async (mapId, sceneId) => {
    const actual = await state();
    assert.equal(actual.mapId, mapId); assert.equal(actual.gsbScene, sceneId);
    assert.equal(actual.props, false); assert.equal(actual.background, false);
    assert.equal(actual.tiles, 0); assert.equal(actual.art.length, 2);
    assert.ok(actual.art.every(art => art.visible && art.width === actual.width && art.height === actual.height));
    return actual;
  };

  for (const fixture of fixtures) {
    await page.goto(`${baseUrl}/?map=${fixture.mapId}`, { waitUntil: 'load' });
    await ready(fixture.mapId);
    await protect();
    await landed(fixture.spawnY);
    const actual = await assertGsb(fixture.mapId, fixture.sceneId);
    assert.equal(actual.width, fixture.width); assert.equal(actual.height, fixture.height);
    assert.equal(actual.solids, fixture.solids); assert.equal(actual.oneWays, fixture.oneWays);
    const revision = await page.evaluate(id => window.__scene.cache.json.get(`gsb_${id}_data`).geometryRevision, fixture.sceneId);
    assert.equal(revision, fixture.revision);
    report.maps[fixture.mapId] = { ...actual, geometryRevision: revision };
    record(`${fixture.mapId}: GSB background/playable render and natural spawn lands`, { feet: actual.player.feet, geometryRevision: revision });

    for (const [index, climb] of fixture.climbs.entries()) {
      const found = (await state()).ropes.find(candidate => candidate.x === climb.x && candidate.kind === climb.kind);
      assert.ok(found, `runtime ${climb.kind} at x=${climb.x}`);
      assert.equal(found.top, climb.top); assert.equal(found.bottom, climb.bottom);
      await reset(climb.x, climb.bottom);
      await page.keyboard.down('ArrowUp');
      await wait(x => window.__scene.player.state2 === 'rope' && window.__scene.player.rope?.x === x, climb.x, 15000);
      await wait(top => window.__scene.player.body.bottom <= top + 1, climb.top, 15000);
      await page.keyboard.up('ArrowUp');
      await landed(climb.top);
      const after = await state();
      assert.notEqual(after.player.state, 'rope');
      record(`${fixture.mapId}: ${climb.kind} ${index + 1} climbs with ArrowUp and lands`, { climb, actual: after.player });
    }

    await reset(fixture.stand.x, fixture.stand.top - 70);
    await landed(fixture.stand.top);
    const stand = await state();
    assert.ok(Math.abs(stand.player.x - fixture.stand.x) < 0.001);
    record(`${fixture.mapId}: pixel collision supports an odd-x drop at exact scene-data surface height`, { expected: fixture.stand, actual: stand.player });
    const ascent = await page.evaluate(probe => new Promise((resolve, reject) => {
      const s = window.__scene, p = s.player, b = p.body;
      p.leaveRope(s.time.now); b.reset(probe.x, probe.top + 80); b.setVelocity(0, 0);
      p.dropUntil = -9999; p.invulnUntil = Number.MAX_SAFE_INTEGER;
      const trace = { startFeet: null, startBodyTop: null, startVy: null,
        bodyHeight: b.height, playerScale: p.scaleY, bodyOffsetY: b.offset.y,
        minFeet: Infinity, upwardFrames: 0, frames: 0, landedFeet: null };
      const listener = () => {
        trace.frames++; trace.minFeet = Math.min(trace.minFeet, b.bottom);
        if (b.velocity.y < 0) trace.upwardFrames++;
        if (trace.minFeet < probe.top - 2 && Math.abs(b.bottom - probe.top) < 0.001 && p.onGround) {
          trace.landedFeet = b.bottom; s.events.off('postupdate', listener); resolve(trace);
        } else if (trace.frames >= 180) {
          s.events.off('postupdate', listener); reject(new Error(`one-way probe failed: ${JSON.stringify(trace)}`));
        }
      };
      s.events.once('postupdate', () => {
        b.setVelocity(0, -670);
        trace.startFeet = b.bottom; trace.startBodyTop = b.top; trace.startVy = b.velocity.y;
        trace.minFeet = b.bottom;
        s.events.on('postupdate', listener);
      });
    }), fixture.oneWay);
    report.maps[fixture.mapId].oneWayProbe = ascent;
    assert.ok(ascent.startBodyTop > fixture.oneWay.top);
    assert.ok(ascent.upwardFrames > 0); assert.ok(ascent.minFeet < fixture.oneWay.top - 2);
    assert.equal(ascent.landedFeet, fixture.oneWay.top);
    record(`${fixture.mapId}: one-way permits ascent from below and supports descent`, { ...fixture.oneWay, ascent });
    const screenshot = `${fixture.mapId}-gsb.png`;
    await page.screenshot({ path: path.join(outDir, screenshot) });
    report.screenshots.push(screenshot);
  }

  for (const [mapId, sceneId] of [
    ['tianjian_sect', 'tianjian_sect_gsb_v1'],
    ['tianjian_sword_tomb', 'tianjian_sword_tomb_gsb_v1'],
    ['taixu_temple', 'taixu_temple_gsb_v1'],
    ['tianjian_sect', 'tianjian_sect_gsb_v1'],
    ['qingyun_village', 'qingyun_village_gsb_v2'],
    ['taixu_temple', 'taixu_temple_gsb_v1'],
  ]) {
    await page.evaluate(mapId => window.__xt.teleport(mapId), mapId);
    await ready(mapId); await protect();
    const actual = await assertGsb(mapId, sceneId);
    report.transitions.push({ destination: mapId, ...actual });
    record(`transition to ${mapId}: GSB art and geometry, no legacy terrain/props`);
  }
  await page.evaluate(() => window.__xt.teleport('lingfu_pavilion'));
  await ready('lingfu_pavilion'); await protect();
  const legacy = await state();
  assert.equal(legacy.gsbScene, null); assert.ok(legacy.solids > 0);
  assert.ok(legacy.props || legacy.background || legacy.parallax > 0 || legacy.tiles > 0);
  assert.equal(legacy.art.length, 0);
  report.transitions.push({ destination: 'lingfu_pavilion', ...legacy });
  record('transition to lingfu_pavilion: tile/legacy restored (non-GSB control; 灵符未接入)');
  const legacyScreenshot = 'lingfu_pavilion-legacy-restored.png';
  await page.screenshot({ path: path.join(outDir, legacyScreenshot) }); report.screenshots.push(legacyScreenshot);
  await page.evaluate(() => window.__xt.teleport('tianjian_sect'));
  await ready('tianjian_sect'); await protect();
  const returned = await assertGsb('tianjian_sect', 'tianjian_sect_gsb_v1');
  report.transitions.push({ destination: 'tianjian_sect', ...returned });
  record('return from non-GSB lingfu_pavilion to sect: GSB art restored');
  assert.deepEqual(report.browserErrors, []); assert.deepEqual(report.failedRequests, []);
  for (const fixture of fixtures) for (const filename of ['background.png', 'playable.png', 'scene-data.json']) {
    assert.ok(report.gsbRequests.some(url => url.endsWith(`/${fixture.sceneId}/${filename}`)), `${fixture.sceneId}/${filename} requested`);
  }
  report.passed = true;
  record('no pageerror, console.error or failed network requests');
} catch (error) {
  report.error = { message: error.message, stack: error.stack };
  if (page) {
    report.failureState = await page.evaluate(() => {
      const s = window.__scene, p = s?.player;
      return { mapId: s?.map?.id, gsbScene: s?.map?.gsbScene, x: p?.x, feet: p?.body?.bottom,
        state: p?.state2, onGround: p?.onGround, rope: p?.rope, vx: p?.body?.velocity.x, vy: p?.body?.velocity.y };
    }).catch(() => null);
    await page.screenshot({ path: path.join(outDir, 'failure.png') }).catch(() => {});
  }
  console.error(error);
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  report.gsbRequests = [...new Set(report.gsbRequests)];
  await fs.writeFile(path.join(outDir, 'browser_smoke.json'), `${JSON.stringify(report, null, 2)}\n`);
  await browser.close();
  console.log(report.passed ? 'BROWSER_SMOKE_PASS' : 'BROWSER_SMOKE_FAIL', 'checks=' + report.checks.length);
}
