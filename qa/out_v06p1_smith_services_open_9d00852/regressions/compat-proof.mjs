// Test-only historical byte proofs. Vite product modules always read current disk data.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
const config = JSON.parse(fs.readFileSync(new URL('./pinned-inputs.json', import.meta.url)));
const append = JSON.parse(fs.readFileSync(new URL('../strings-append-proof.json', import.meta.url)));
const hash = value => createHash('sha256').update(value).digest('hex');
export function stripSmithKeys(raw) {
  if (hash(raw) !== config.strings1013) return raw;
  assert.equal(Object.keys(JSON.parse(raw)).length, 1013);
  const suffix = ',\n' + append.appendedKeys.map(({key,text}, i) =>
    `  ${JSON.stringify(key)}: ${JSON.stringify(text)}${i === 42 ? '' : ','}`).join('\n') + '\n}\n';
  assert.ok(raw.endsWith(suffix), 'exact authorized 43-key suffix');
  const previous = raw.slice(0, -suffix.length) + '\n}\n';
  assert.equal(hash(previous), config.strings970, 'only 43 keys removed restores original970 bytes');
  return previous;
}
export function stripAllLaterKeys(raw) {
  raw = stripSmithKeys(raw);
  if (hash(raw) !== config.strings970) return raw;
  const names = ['enhance_level','enchant_element','element_damage','same_root_bonus','no_enhance',
    'no_enchant','no_instance','foreign','unknown','unavailable'].map(n => 'ui.equip.inst.' + n);
  const strings = JSON.parse(raw);
  const suffix = ',\n' + names.map((key, i) => `  ${JSON.stringify(key)}: ${JSON.stringify(strings[key])}${i===9?'':','}`).join('\n') + '\n}\n';
  assert.ok(raw.endsWith(suffix), 'exact earlier authorized attr-ui ten-key suffix');
  const previous = raw.slice(0,-suffix.length) + '\n}\n';
  assert.equal(hash(previous), config.strings960, 'only attr-ui10 plus smith43 restore historical960 bytes');
  return previous;
}
export function restorePreAttrUi(source) {
  const current = config.restore['Progress.ts'];
  if (hash(source) !== current.currentSha) return source;
  assert.equal(hash(current.historical), current.historicalSha);
  return current.historical;
}
export function historicalExpected(name, expected) {
  if (path.basename(name) === 'GameScene.ts') {
    assert.equal(hash(fs.readFileSync(config.mergedScene.file)), config.mergedScene.sha256, 'merged GameScene full source pin');
    return config.mergedScene.strippedSha256;
  }
  if (path.basename(name) === 'v06p1-forge-open.test.ts') return config.pins['src/v06p1-forge-open.test.ts'];
  const known = config.restore[path.basename(name)];
  return known && path.basename(name) !== 'Progress.ts' ? known.currentSha : expected;
}
