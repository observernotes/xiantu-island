import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';

// Exercise the real E-4 implementation with Phaser's texture/frame lookup contract.
const atlas = JSON.parse(await fs.readFile(new URL('./fixtures/scene-art/environment.atlas.json', import.meta.url), 'utf8'));
assert.ok(atlas.frames.glow_soft, 'the independent atmosphere fixture contains glow_soft');
const generated = '__environment_art_light';
const phaserKey = '__environmentFramePhaser';
globalThis[phaserKey] = { Scenes: { Events: { SHUTDOWN: 'shutdown' } }, BlendModes: { NORMAL: 0, ADD: 1 } };

try {
  const source = await fs.readFile(new URL('../src/scenes/EnvironmentArt.ts', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source.replace("import Phaser from 'phaser';", `const Phaser = globalThis.${phaserKey};`),
    { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  const { EnvironmentArt, ENVIRONMENT_DEPTH } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

  const create = (definitions, available = { environment_fixture: Object.keys(atlas.frames), standalone: [] }, particles = []) => {
    const textures = new Map(Object.entries(available).map(([key, frames]) => [key,
      { key, has: frame => frame === '__BASE' || frames.some(name => String(name) === String(frame)) }]));
    const images = [], warnings = [], canvases = [];
    const gradient = { addColorStop() {} };
    const scene = {
      events: { once() {}, off() {} },
      cameras: { main: { worldView: { left: 0, right: 1280, top: 0, bottom: 720 } } },
      textures: {
        exists: key => textures.has(key),
        get: key => { assert.ok(textures.has(key), `unknown texture lookup: ${key}`); return textures.get(key); },
        createCanvas(key, width, height) {
          canvases.push({ key, width, height });
          textures.set(key, { key, has: frame => frame === '__BASE' });
          return { context: { createRadialGradient: () => gradient, fillRect() {} }, refresh() {} };
        },
      },
      add: { image(x, y, key, frame) {
        assert.ok(textures.has(key), `image must use a loaded texture: ${key}`);
        if (frame !== undefined && !textures.get(key).has(frame)) warnings.push({ key, frame });
        const frameName = frame ?? (key === 'environment_fixture' ? Object.keys(atlas.frames)[0] : '__BASE');
        const pivot = key === 'environment_fixture' ? atlas.frames[frameName]?.pivot : undefined;
        const image = {
          x, y, texture: { key }, frame: { name: frameName }, requestedFrame: frame, visible: true,
          originX: pivot?.x ?? 0.5, originY: pivot?.y ?? 0.5, tintCalls: 0,
          setName(name) { this.name = name; return this; },
          setDepth(depth) { this.depth = depth; return this; },
          setDisplaySize(width, height) { this.displayWidth = width; this.displayHeight = height; return this; },
          setOrigin(x, y) { this.originX = x; this.originY = y; return this; },
          setTint(color) { this.tintTopLeft = color; this.tintCalls++; return this; },
          setAlpha(alpha) { this.alpha = alpha; return this; },
          setBlendMode(mode) { this.blendMode = mode; return this; },
          setVisible(visible) { this.visible = visible; return this; },
          destroy() { this.destroyed = true; },
        };
        images.push(image);
        return image;
      } },
    };
    const art = new EnvironmentArt(scene, 'qingyun', 3200, 720, { lights: definitions, particles });
    return { art, images, warnings, canvases };
  };

  const definition = { x: 400, y: 280, texture: 'environment_fixture', frame: 'glow_soft',
    radius: 56, color: '#ffd090', alpha: 0.4, flicker: 0.06 };
  const real = create([definition]);
  const image = real.images[0];
  assert.equal(image.texture.key, 'environment_fixture');
  assert.equal(image.requestedFrame, 'glow_soft', 'pass the named frame to Phaser.add.image');
  assert.equal(image.tintTopLeft, 0xffd090, 'retain the delivered warm color');
  assert.equal(image.displayWidth, 112, 'radius sets the rendered diameter');
  assert.equal(image.displayHeight, 112);
  assert.equal(atlas.frames.glow_soft.pivot.y, 1, 'fixture exercises the delivered bottom pivot');
  assert.equal(image.originX, 0.5, 'atlas light coordinates mark the horizontal center');
  assert.equal(image.originY, 0.5, 'atlas light coordinates mark the vertical center despite the frame pivot');
  assert.equal(image.alpha, 0.4);
  assert.equal(image.depth, ENVIRONMENT_DEPTH.light);
  assert.equal(image.blendMode, globalThis[phaserKey].BlendModes.ADD);
  assert.equal(real.canvases.length, 0, 'a real atlas frame never generates an in-memory glow');
  assert.deepEqual(real.art.snapshot().lightDetails, [{ texture: 'environment_fixture', frame: 'glow_soft',
    tint: 0xffd090, alpha: 0.4, baseAlpha: 0.4, radius: 56, blendMode: globalThis[phaserKey].BlendModes.ADD }]);
  real.art.update(100);
  assert.ok(image.alpha >= 0.4 * (1 - 0.06) && image.alpha <= 0.4, 'flicker keeps the configured alpha ceiling');
  assert.notEqual(image.alpha, 0.4, 'flicker still changes atlas light opacity');
  assert.equal(real.art.snapshot().lightDetails[0].alpha, image.alpha, 'snapshot reports current opacity');
  assert.equal(real.art.snapshot().lightDetails[0].baseAlpha, 0.4, 'snapshot retains configured opacity');
  real.art.setEnabled(false);
  assert.equal(image.visible, false);
  real.art.setEnabled(true);
  assert.equal(image.visible, true);
  assert.equal(real.images.length, 1, 'enabling reuses the light');
  real.art.destroy();
  assert.equal(image.destroyed, true);

  const legacy = create([{ ...definition, texture: 'standalone', frame: undefined, flicker: 0 }]);
  assert.equal(legacy.images[0].texture.key, 'standalone', 'independent texture behavior stays unchanged');
  assert.equal(legacy.images[0].requestedFrame, undefined);
  assert.equal(legacy.images[0].originY, 0.5, 'independent texture keeps its default center');
  assert.equal(legacy.images[0].blendMode, globalThis[phaserKey].BlendModes.ADD, 'default independent texture keeps ADD');
  legacy.art.update(100);
  assert.equal(legacy.images[0].alpha, 0.4, 'zero flicker leaves alpha unchanged');
  assert.equal(legacy.canvases.length, 0);
  const legacyAtlas = create([{ ...definition, frame: undefined }]);
  assert.equal(legacyAtlas.images[0].originY, 1, 'without an explicit frame preserve the previous inherited pivot');

  const numeric = create([{ ...definition, texture: 'sheet', frame: 0 }], { sheet: [0] });
  assert.equal(numeric.images[0].requestedFrame, 0, 'numeric sprite-sheet frames also remain valid');

  const normal = create([{ ...definition, blend: 'NORMAL' }]);
  assert.equal(normal.images[0].texture.key, 'environment_fixture');
  assert.equal(normal.images[0].requestedFrame, 'glow_soft');
  assert.equal(normal.images[0].blendMode, globalThis[phaserKey].BlendModes.NORMAL, 'explicit NORMAL uses normal compositing');
  assert.equal(normal.art.snapshot().lightDetails[0].blendMode, globalThis[phaserKey].BlendModes.NORMAL);
  const invalidBlend = create([{ ...definition, blend: 'invalid' }]);
  assert.equal(invalidBlend.images[0].blendMode, globalThis[phaserKey].BlendModes.ADD, 'unknown blending values fall back to ADD');

  const firefly = { kind: 'firefly', x: 0, y: 0, width: 1280, height: 720, count: 1, texture: 'standalone' };
  const defaultFirefly = create([], { standalone: [] }, [firefly]);
  const coloredFirefly = { ...firefly, color: '#FFE8A0', alpha: 0.85 };
  const noTail = create([], { standalone: [] }, [coloredFirefly]);
  const withTail = create([], { standalone: [] }, [{ ...coloredFirefly, colorEnd: '#FFF6D8' }]);
  assert.equal(defaultFirefly.images[0].tintTopLeft, 0xd8ff8e, 'default firefly tint stays unchanged');
  assert.equal(defaultFirefly.images[0].alpha, 0.7, 'default firefly alpha stays unchanged');
  assert.equal(defaultFirefly.images[0].blendMode, globalThis[phaserKey].BlendModes.ADD, 'default firefly blend stays ADD');
  assert.equal(withTail.images[0].tintTopLeft, 0xffe8a0, 'tail color starts at the configured base tint');
  let dimmest, brightest, intermediate;
  for (let frame = 0; frame < 200; frame++) {
    for (const fixture of [defaultFirefly, noTail, withTail]) fixture.art.update(20);
    const plain = noTail.images[0], tail = withTail.images[0];
    assert.equal(defaultFirefly.images[0].tintTopLeft, 0xd8ff8e, 'no tail preserves default tint throughout flicker');
    assert.equal(plain.tintTopLeft, 0xffe8a0, 'no tail preserves a custom tint throughout flicker');
    assert.equal(tail.alpha, plain.alpha, 'tail color leaves the existing alpha phase unchanged');
    assert.equal(tail.blendMode, globalThis[phaserKey].BlendModes.ADD, 'tail color leaves ADD blending unchanged');
    assert.ok(defaultFirefly.images[0].alpha >= 0.7 * 0.6 && defaultFirefly.images[0].alpha <= 0.7,
      'default flicker retains its original opacity range');
    const sample = { tint: tail.tintTopLeft, alpha: tail.alpha };
    if (!dimmest || sample.alpha < dimmest.alpha) dimmest = sample;
    if (!brightest || sample.alpha > brightest.alpha) brightest = sample;
    if (sample.tint !== 0xffe8a0 && sample.tint !== 0xfff6d8) intermediate = sample;
  }
  assert.equal(brightest.tint, 0xffe8a0, 'bright phase uses the base tint');
  assert.equal(dimmest.tint, 0xfff6d8, 'dim phase reaches the tail tint');
  assert.equal(defaultFirefly.images[0].tintCalls, 1, 'no tail never adds per-frame tint updates');
  assert.equal(noTail.images[0].tintCalls, 1, 'a custom color without a tail also keeps its original tint calls');
  assert.ok(intermediate, 'flicker interpolates through an intermediate tint');
  const tailWeight = (1 - intermediate.alpha / 0.85) / 0.4;
  assert.equal(intermediate.tint >>> 16, 0xff);
  assert.equal(intermediate.tint >>> 8 & 0xff, Math.round(0xe8 + (0xf6 - 0xe8) * tailWeight),
    'green interpolates in sync with opacity');
  assert.equal(intermediate.tint & 0xff, Math.round(0xa0 + (0xd8 - 0xa0) * tailWeight),
    'blue interpolates in sync with opacity');
  for (const fixture of [defaultFirefly, noTail, withTail]) fixture.art.destroy();

  for (const available of [{}, { environment_fixture: ['glow_window'] }]) {
    const missing = create([definition, { ...definition, x: 460 }], available);
    assert.equal(missing.images.length, 2);
    for (const fallback of missing.images) {
      assert.equal(fallback.texture.key, generated, 'missing atlas or frame uses the generated light');
      assert.equal(fallback.requestedFrame, undefined, 'never pass a missing atlas frame to the fallback texture');
      assert.equal(fallback.tintTopLeft, 0xffd090);
      assert.equal(fallback.alpha, 0.4);
      assert.equal(fallback.displayWidth, 112);
      assert.equal(fallback.originY, 0.5, 'generated fallback stays centered');
    }
    assert.deepEqual(missing.canvases, [{ key: generated, width: 64, height: 64 }], 'fallback canvas is reused');
    assert.deepEqual(missing.warnings, [], 'missing optional art does not cause a texture/frame warning');
    assert.equal(missing.art.snapshot().lightDetails[0].frame, '__BASE', 'evidence reports the actual fallback frame');
    missing.art.destroy();

    const normalFallback = create([{ ...definition, blend: 'NORMAL' }], available);
    assert.equal(normalFallback.images[0].texture.key, generated);
    assert.equal(normalFallback.images[0].requestedFrame, undefined);
    assert.equal(normalFallback.images[0].blendMode, globalThis[phaserKey].BlendModes.NORMAL,
      'missing atlas or frame preserves explicit NORMAL blending');
    assert.equal(normalFallback.art.snapshot().lightDetails[0].blendMode, globalThis[phaserKey].BlendModes.NORMAL);
    assert.deepEqual(normalFallback.warnings, []);
    normalFallback.art.destroy();
  }
  const reserved = create([{ ...definition, texture: generated }], { [generated]: [] });
  assert.equal(reserved.images[0].requestedFrame, undefined, 'a missing frame on a generated key also falls back safely');
  assert.deepEqual(reserved.warnings, []);
  assert.deepEqual(real.warnings, []);
  console.log(JSON.stringify({ suite: 'environment-frame', passed: true, texture: 'environment_fixture', frame: 'glow_soft' }));
} finally {
  delete globalThis[phaserKey];
}
