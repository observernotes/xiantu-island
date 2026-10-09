import Phaser from 'phaser';
import { FEEL, SPEC } from '../config/feel';

export interface Rope { kind: 'rope' | 'ladder'; x: number; top: number; bottom: number; halfW: number; }
export interface Spawn { x: number; y: number; w: number; monster: string; count: number; }
export interface Zone { name: string; x: number; y: number; w: number; h: number; props: Record<string, any>; }
export interface MapObj { type: string; name: string; x: number; y: number; props: Record<string, any>; }
export interface BuiltMap {
  id: string; name: string; safeZone: boolean;
  width: number; height: number;
  solids: Phaser.Physics.Arcade.StaticGroup;
  oneWays: Phaser.Physics.Arcade.StaticGroup;
  ropes: Rope[];
  spawn: { x: number; y: number };
  spawns: Spawn[];
  objects: MapObj[];   // npc / portal / chest
  zones: Zone[];
}

type Grid = string[];  // '#' 实心  '=' 单向  '.' 空

function emptyMap(scene: Phaser.Scene, id: string, name: string, safe: boolean, cols: number, rows: number): BuiltMap {
  return {
    id, name, safeZone: safe, width: cols * FEEL.tile, height: rows * FEEL.tile,
    solids: scene.physics.add.staticGroup(), oneWays: scene.physics.add.staticGroup(),
    ropes: [], spawn: { x: 64, y: 64 }, spawns: [], objects: [], zones: [],
  };
}

/** 按邻格自动选图块（规则见 art/tiles/README.md） */
function autoTile(grid: Grid, r: number, c: number): number {
  const ch = grid[r][c], at = (rr: number, cc: number) => grid[rr]?.[cc] ?? '.';
  if (ch === '=') {
    const L = at(r, c - 1) === '=', R = at(r, c + 1) === '=';
    return L && R ? 9 : L ? 10 : R ? 8 : 11;
  }
  const top = at(r - 1, c) !== '#';
  const L = at(r, c - 1) === '#' || c === 0, R = at(r, c + 1) === '#' || c === grid[r].length - 1;
  const base = top ? 0 : 4;
  return L && R ? base + 1 : L ? base + 2 : R ? base : base + 3;
}

/** 碰撞体：同一行连续的地块合并成一个，避免接缝卡脚；有图块素材就铺图块，没有就画色块 */
function buildTerrain(scene: Phaser.Scene, map: BuiltMap, grid: Grid, tileset?: string) {
  const T = FEEL.tile;
  const useTiles = !!tileset && scene.textures.exists(tileset);
  const gfx = scene.add.graphics().setDepth(-1);
  if (useTiles) {
    const data = grid.map((line, r) => [...line].map((ch, c) => (ch === '#' || ch === '=' ? autoTile(grid, r, c) : -1)));
    // 装饰草：地面顶上一格，按位置伪随机点缀
    grid.forEach((line, r) => [...line].forEach((ch, c) => {
      if (ch !== '#' || r === 0 || grid[r - 1][c] !== '.' || (c * 7 + r * 13) % 5 !== 0) return;
      data[r - 1][c] = 15;
    }));
    const tm = scene.make.tilemap({ data, tileWidth: T, tileHeight: T });
    const ts = tm.addTilesetImage(tileset!, tileset!, T, T, 0, 0)!;
    tm.createLayer(0, ts, 0, 0)!.setDepth(-1);
  }
  grid.forEach((line, row) => {
    let c = 0;
    while (c < line.length) {
      const ch = line[c];
      if (ch !== '#' && ch !== '=') { c++; continue; }
      let e = c; while (e + 1 < line.length && line[e + 1] === ch) e++;
      const x = c * T, w = (e - c + 1) * T, y = row * T;
      if (ch === '#') {
        if (!useTiles) {
          gfx.fillStyle(0x8a5a3c).fillRect(x, y, w, T);
          for (let k = c; k <= e; k++) if (grid[row - 1]?.[k] !== '#') gfx.fillStyle(0x5cbf4a).fillRect(k * T, y, T, 8);
        }
        map.solids.add(scene.add.zone(x + w / 2, y + T / 2, w, T));
      } else {
        if (!useTiles) { gfx.fillStyle(0xc9a56b).fillRect(x, y, w, 14); gfx.fillStyle(0x6fd25a).fillRect(x, y, w, SPEC.oneWayEdge); }
        const z = scene.add.zone(x + w / 2, y + SPEC.oneWayEdge / 2, w, SPEC.oneWayEdge);
        map.oneWays.add(z);
        const b = z.body as Phaser.Physics.Arcade.StaticBody;
        b.checkCollision.down = b.checkCollision.left = b.checkCollision.right = false;
      }
      c = e + 1;
    }
  });
}

function drawClimbable(scene: Phaser.Scene, r: Rope, tileset?: string) {
  const ss = tileset ? tileset + '_ss' : '';
  if (ss && scene.textures.exists(ss)) {
    const h = r.bottom - r.top;
    if (r.kind === 'rope') scene.add.tileSprite(r.x, r.top, 32, h, ss, 12).setOrigin(0.5, 0).setDepth(-1);
    else {
      scene.add.image(r.x, r.top, ss, 14).setOrigin(0.5, 0).setDepth(-1);
      if (h > 32) scene.add.tileSprite(r.x, r.top + 32, 32, h - 32, ss, 13).setOrigin(0.5, 0).setDepth(-1);
    }
    return;
  }
  const g = scene.add.graphics().setDepth(-1);
  if (r.kind === 'rope') {
    g.lineStyle(4, 0x8b5e2b).lineBetween(r.x, r.top, r.x, r.bottom);
    for (let y = r.top + 10; y < r.bottom; y += 14) g.lineStyle(2, 0xd9b27a).lineBetween(r.x - 4, y, r.x + 4, y + 4);
  } else {
    g.lineStyle(4, 0x9a6a3a).lineBetween(r.x - r.halfW + 4, r.top, r.x - r.halfW + 4, r.bottom).lineBetween(r.x + r.halfW - 4, r.top, r.x + r.halfW - 4, r.bottom);
    for (let y = r.top + 8; y < r.bottom; y += 16) g.lineStyle(3, 0xc58f55).lineBetween(r.x - r.halfW + 4, y, r.x + r.halfW - 4, y);
  }
}

/** Tiled JSON（图层约定见 design/01_配置表规范.md） */
export function buildTiledMap(scene: Phaser.Scene, tj: any, tileset?: string): BuiltMap {
  const prop = (arr: any[] | undefined) => Object.fromEntries((arr ?? []).map((p: any) => [p.name, p.value]));
  const mp = prop(tj.properties);
  const map = emptyMap(scene, mp.id ?? 'map', mp.name ?? '', !!mp.safeZone, tj.width, tj.height);
  const grid: string[][] = Array.from({ length: tj.height }, () => Array(tj.width).fill('.'));
  for (const l of tj.layers) {
    if (l.type !== 'tilelayer') continue;
    const ch = l.name === 'oneway' ? '=' : l.name === 'ground' ? '#' : null;
    if (!ch) continue;
    l.data.forEach((gid: number, i: number) => { if (gid) grid[Math.floor(i / tj.width)][i % tj.width] = ch; });
  }
  buildTerrain(scene, map, grid.map(r => r.join('')), tileset);
  for (const l of tj.layers) {
    if (l.type !== 'objectgroup') continue;
    for (const o of l.objects) {
      const p = prop(o.properties);
      switch (o.type) {
        case 'playerStart': map.spawn = { x: o.x, y: o.y }; break;
        case 'rope': case 'ladder': {
          const r: Rope = { kind: o.type, x: o.type === 'ladder' ? o.x + o.width / 2 : o.x, top: o.y, bottom: o.y + o.height,
            halfW: o.type === 'ladder' ? Math.max(12, o.width / 2) : FEEL.ropeGrabRangeX };
          map.ropes.push(r); drawClimbable(scene, r, tileset); break;
        }
        case 'spawn': map.spawns.push({ x: o.x, y: o.y, w: o.width ?? 0, monster: p.monster, count: p.count ?? 1 }); break;
        case 'zone': map.zones.push({ name: o.name, x: o.x, y: o.y, w: o.width, h: o.height, props: p }); break;
        default: map.objects.push({ type: o.type, name: o.name, x: o.x, y: o.y, props: p });
      }
    }
  }
  return map;
}

/** 字符地图（临时测试图用）：# 实心 = 单向 | 绳 H 梯 P 出生点 r 灵兔 s 青蛇 m 山魈 d 木人桩 < > 传送门 */
export function buildCharMap(scene: Phaser.Scene, id: string, name: string, rows: string[], portals: Record<string, Record<string, any>> = {}, tileset?: string): BuiltMap {
  const T = FEEL.tile, cols = Math.max(...rows.map(r => r.length));
  const grid = rows.map(r => r.padEnd(cols, '.'));
  const map = emptyMap(scene, id, name, false, cols, grid.length);
  buildTerrain(scene, map, grid.map(l => l.replace(/[^#=]/g, '.')), tileset);
  const mons: Record<string, string> = { r: 'spirit_rabbit', s: 'bamboo_snake', m: 'mountain_mandrill', d: 'training_dummy' };
  grid.forEach((line, r) => [...line].forEach((ch, c) => {
    const x = c * T + T / 2, y = (r + 1) * T;
    if (ch === 'P') map.spawn = { x, y };
    if (mons[ch]) map.spawns.push({ x, y, w: 0, monster: mons[ch], count: 1 });
    if (portals[ch]) map.objects.push({ type: 'portal', name: portals[ch].name, x, y, props: portals[ch] });
  }));
  for (let c = 0; c < cols; c++) {
    let r = 0;
    while (r < grid.length) {
      const ch = grid[r][c];
      if (ch !== '|' && ch !== 'H') { r++; continue; }
      let e = r; while (e + 1 < grid.length && grid[e + 1][c] === ch) e++;
      const above = grid[r - 1]?.[c];
      const anchored = above === '=' || above === '#';
      if (!anchored) console.warn(`[map] 第${c}列第${r}行的绳梯上方没有平台`);
      const rope: Rope = { kind: ch === 'H' ? 'ladder' : 'rope', x: c * T + T / 2, top: anchored ? (r - 1) * T : r * T, bottom: (e + 1) * T, halfW: ch === 'H' ? 16 : FEEL.ropeGrabRangeX };
      map.ropes.push(rope); drawClimbable(scene, rope, tileset);
      r = e + 1;
    }
  }
  return map;
}
