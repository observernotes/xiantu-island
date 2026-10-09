import Phaser from 'phaser';
import { FEEL, SPEC } from '../config/feel';

export interface Rope { x: number; top: number; bottom: number; }
export interface BuiltMap {
  width: number; height: number;
  solids: Phaser.Physics.Arcade.StaticGroup;
  oneWays: Phaser.Physics.Arcade.StaticGroup;
  ropes: Rope[];
  spawn: { x: number; y: number };
  monsterSpawns: { x: number; y: number }[];
}

/** 把字符地图转成碰撞体。同一行连续的地块合并成一个碰撞体，避免接缝卡脚。 */
export function buildMap(scene: Phaser.Scene, rows: string[]): BuiltMap {
  const T = FEEL.tile;
  const cols = Math.max(...rows.map(r => r.length));
  const grid = rows.map(r => r.padEnd(cols, '.'));
  const solids = scene.physics.add.staticGroup();
  const oneWays = scene.physics.add.staticGroup();
  const gfx = scene.add.graphics().setDepth(-1);
  let spawn = { x: 64, y: 64 };
  const monsterSpawns: { x: number; y: number }[] = [];

  const addRun = (row: number, c0: number, c1: number, ch: string) => {
    const x = c0 * T, w = (c1 - c0 + 1) * T, y = row * T;
    if (ch === '#') {
      const below = grid[row - 1]?.slice(c0, c1 + 1) ?? '';
      gfx.fillStyle(0x8a5a3c).fillRect(x, y, w, T);
      if (row === 0 || [...below].some(c => c !== '#')) gfx.fillStyle(0x5cbf4a).fillRect(x, y, w, 8);
      const z = scene.add.zone(x + w / 2, y + T / 2, w, T);
      solids.add(z);
    } else {
      gfx.fillStyle(0xc9a56b).fillRect(x, y, w, 14);
      gfx.fillStyle(0x6fd25a).fillRect(x, y, w, SPEC.oneWayEdge);
      const z = scene.add.zone(x + w / 2, y + SPEC.oneWayEdge / 2, w, SPEC.oneWayEdge);
      oneWays.add(z);
      const b = z.body as Phaser.Physics.Arcade.StaticBody;
      b.checkCollision.down = false; b.checkCollision.left = false; b.checkCollision.right = false;
    }
  };

  grid.forEach((line, r) => {
    let c = 0;
    while (c < cols) {
      const ch = line[c];
      if (ch === '#' || ch === '=') {
        let e = c; while (e + 1 < cols && line[e + 1] === ch) e++;
        addRun(r, c, e, ch); c = e + 1; continue;
      }
      if (ch === 'P') spawn = { x: c * T + T / 2, y: (r + 1) * T };
      if (ch === 'M') monsterSpawns.push({ x: c * T + T / 2, y: (r + 1) * T });
      c++;
    }
  });

  // 绳子：同一列连续的 |，顶端挂在上方平台的表面
  const ropes: Rope[] = [];
  for (let c = 0; c < cols; c++) {
    let r = 0;
    while (r < grid.length) {
      if (grid[r][c] !== '|') { r++; continue; }
      let e = r; while (e + 1 < grid.length && grid[e + 1][c] === '|') e++;
      const above = grid[r - 1]?.[c];
      if (above !== '=' && above !== '#') console.warn(`[map] 第${c}列第${r}行的绳子上方没有平台`);
      const rope = { x: c * T + T / 2, top: (above === '=' || above === '#') ? (r - 1) * T : r * T, bottom: (e + 1) * T };
      ropes.push(rope);
      gfx.lineStyle(4, 0x8b5e2b).lineBetween(rope.x, rope.top, rope.x, rope.bottom);
      for (let y = rope.top + 10; y < rope.bottom; y += 14) gfx.lineStyle(2, 0xd9b27a).lineBetween(rope.x - 4, y, rope.x + 4, y + 4);
      r = e + 1;
    }
  }

  return { width: cols * T, height: grid.length * T, solids, oneWays, ropes, spawn, monsterSpawns };
}
