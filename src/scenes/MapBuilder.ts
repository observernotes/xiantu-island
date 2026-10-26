import type Phaser from 'phaser';
import { FEEL, SPEC } from '../config/feel';
import { pickTileVariant, tileVariantGroups, type TileVariantFrame, type TileVariantGroups } from '../TileVariants';
import { isGsbSceneData, surfacesToBodies, type GsbSceneData } from './GsbGeometry';

export { surfacesToBodies } from './GsbGeometry';

export interface Rope { kind: 'rope' | 'ladder'; x: number; top: number; bottom: number; halfW: number; }
export interface Spawn { x: number; y: number; w: number; monster: string; count: number; }
export interface Zone { name: string; x: number; y: number; w: number; h: number; props: Record<string, any>; }
export interface MapObj { type: string; name: string; x: number; y: number; w: number; h: number; props: Record<string, any>; points?: { x: number; y: number }[]; hiddenGeometryValid?: boolean; }
/** G16 静态地图实例为 map.id；hidden 只控制原生对象，不建立第二套宝箱或入口。 */
export interface HiddenMapObject {
  object: MapObj; kind: 'chest' | 'platform' | 'entrance'; reqSpirit: number;
  x: number; y: number; target?: MapObj; encounter?: string; valid: boolean;
}
export interface BuiltMap {
  id: string; name: string; safeZone: boolean;
  trial?: string; night: boolean;
  width: number; height: number;
  /** 已加载 scene-data 的 GSB 地图；图层与碰撞共用逻辑像素坐标。 */
  gsbScene?: string;
  /** 记录实际构图模式；显形平台复用同一地砖与缺图回退。 */
  tileset?: string; useTiles: boolean;
  solids: Phaser.Physics.Arcade.StaticGroup;
  oneWays: Phaser.Physics.Arcade.StaticGroup;
  ropes: Rope[];
  spawn: { x: number; y: number };
  spawns: Spawn[];
  spawnGates: MapObj[];  // 命名刷怪口，保留 side / flying 等属性供召唤与试炼使用
  objects: MapObj[];   // npc / portal / chest
  hidden: HiddenMapObject[];
  zones: Zone[];
}

type Grid = string[];  // '#' 实心  '=' 单向  '.' 空

function emptyMap(scene: Phaser.Scene, id: string, name: string, safe: boolean, cols: number, rows: number): BuiltMap {
  return {
    id, name, safeZone: safe, night: false, width: cols * FEEL.tile, height: rows * FEEL.tile, useTiles: false,
    solids: scene.physics.add.staticGroup(), oneWays: scene.physics.add.staticGroup(),
    ropes: [], spawn: { x: 64, y: 64 }, spawns: [], spawnGates: [], objects: [], hidden: [], zones: [],
  };
}

/** 不把缺失/null 数值变成默认门槛；非法绑定仍交给适配器封锁原生目标。 */
export function parseHiddenObjects(objects: MapObj[]): HiddenMapObject[] {
  const names = new Map<string, MapObj[]>();
  for (const object of objects) names.set(object.name, [...(names.get(object.name) ?? []), object]);
  const controllers = objects.filter(object => object.type === 'hidden');
  const bindingCount = new Map<string, number>();
  for (const object of controllers) {
    const target = object.props.targetObject;
    if (typeof target === 'string') bindingCount.set(target, (bindingCount.get(target) ?? 0) + 1);
  }
  const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
  return controllers.map(object => {
    const p = object.props, kind = p.reveal;
    const hasTarget = Object.prototype.hasOwnProperty.call(p, 'targetObject');
    const hasEncounter = Object.prototype.hasOwnProperty.call(p, 'encounter');
    const target = typeof p.targetObject === 'string' ? names.get(p.targetObject)?.[0] : undefined;
    let valid = typeof object.name === 'string' && !!object.name && !object.name.includes('|') && names.get(object.name)?.length === 1
      && finite(object.x) && finite(object.y) && finite(object.w) && object.w >= 0
      && finite(object.h) && object.h >= 0 && finite(p.reqSpirit) && p.reqSpirit >= 0
      && (object.w === 0 && object.h === 0 || object.w > 0 && object.h > 0)
      && object.hiddenGeometryValid !== false && !object.points
      && (kind === 'chest' || kind === 'platform' || kind === 'entrance') && !(hasTarget && hasEncounter);
    if (kind === 'platform') valid &&= object.w > 0 && object.h > 0 && !hasTarget && !hasEncounter;
    else if (kind === 'chest' || kind === 'entrance' && !hasEncounter) {
      valid &&= hasTarget && typeof p.targetObject === 'string' && p.targetObject.length > 0
        && names.get(p.targetObject)?.length === 1 && bindingCount.get(p.targetObject) === 1
        && target?.type === (kind === 'chest' ? 'chest' : 'portal') && !hasEncounter;
      if (kind === 'chest') valid &&= typeof target?.props.loot === 'string' && target.props.loot.length > 0;
      if (kind === 'entrance') valid &&= typeof target?.props.target === 'string' && target.props.target.length > 0;
    } else if (kind === 'entrance') valid &&= typeof p.encounter === 'string' && /^enc_/.test(p.encounter);
    return { object, kind, reqSpirit: p.reqSpirit, x: object.x + object.w / 2, y: object.y + object.h / 2,
      target, encounter: hasEncounter ? p.encounter : undefined, valid };
  });
}

/** 按邻格自动选图块（规则见 art/tiles/README.md） */
function autoTile(grid: Grid, r: number, c: number): number {
  const ch = grid[r][c], at = (rr: number, cc: number) => grid[rr]?.[cc] ?? '.';
  if (ch === '=') return oneWayTileBase(at(r, c - 1) === '=', at(r, c + 1) === '=');
  const top = at(r - 1, c) !== '#';
  const L = at(r, c - 1) === '#' || c === 0, R = at(r, c + 1) === '#' || c === grid[r].length - 1;
  const base = top ? 0 : 4;
  return L && R ? base + 1 : L ? base + 2 : R ? base : base + 3;
}

/** '=' 与显形平台共用左右端/中段/独立块的选择规则。 */
export function oneWayTileBase(left: boolean, right: boolean): number {
  return left && right ? 9 : left ? 10 : right ? 8 : 11;
}

export interface OneWayPlatformTile {
  x: number; width: number; base: number; col: number; row: number;
}

/** 尾格缩放到剩余宽度；不让非整格平台的画面伸出碰撞体。 */
export function oneWayPlatformTiles(x: number, y: number, width: number, tileSize = FEEL.tile): OneWayPlatformTile[] {
  if (![x, y, width, tileSize].every(Number.isFinite) || width <= 0 || tileSize <= 0) return [];
  const count = Math.ceil(width / tileSize), col = Math.floor(x / tileSize), row = Math.floor(y / tileSize);
  return Array.from({ length: count }, (_, index) => ({
    x: x + index * tileSize, width: Math.min(tileSize, width - index * tileSize),
    base: oneWayTileBase(index > 0, index < count - 1), col: col + index, row,
  }));
}

function tilesetFrameCount(scene: Phaser.Scene, key: string): number {
  if (!scene.textures.exists(key)) return 0;
  const frame = scene.textures.get(key).get('__BASE');
  return Math.floor(frame.cutWidth / FEEL.tile) * Math.floor(frame.cutHeight / FEEL.tile);
}

function chooseTile(scene: Phaser.Scene, groups: TileVariantGroups, tileset: string, base: number, col: number, row: number): TileVariantFrame {
  const selected = pickTileVariant(groups, tileset, base, col, row);
  if (selected.frame < tilesetFrameCount(scene, selected.tileset)) return selected;
  const original = groups.get(base)?.base;
  if (original && original.frame < tilesetFrameCount(scene, original.tileset)) return original;
  return { tileset, frame: base, weight: 1 };
}

/** 地砖不可用时，与原 '=' 平台共用完全相同的落脚上沿和土色块。 */
function oneWayFallback(scene: Phaser.Scene, x: number, y: number, width: number): Phaser.GameObjects.Rectangle[] {
  return [
    scene.add.rectangle(x, y, width, 14, 0xc9a56b).setOrigin(0, 0).setDepth(-1),
    scene.add.rectangle(x, y, width, SPEC.oneWayEdge, 0x6fd25a).setOrigin(0, 0).setDepth(-1),
  ];
}

export interface OneWayPlatformVisual {
  object: Phaser.GameObjects.Container;
  fallback: boolean;
  tileset?: string;
  tiles: (OneWayPlatformTile & { tileset: string; frame: number })[];
}

/** 只在显形后调用；不创建额外专用素材，也不依赖另一次 spritesheet 加载。 */
export function createOneWayPlatformVisual(scene: Phaser.Scene, map: BuiltMap, object: MapObj): OneWayPlatformVisual {
  const container = scene.add.container(object.x, object.y).setName(`sense-platform-visual:${object.name}`).setDepth(-1).setAlpha(0.85);
  const tiles: OneWayPlatformVisual['tiles'] = [];
  const useTiles = map.useTiles && !!map.tileset && scene.textures.exists(map.tileset);
  if (useTiles) {
    const variants = tileVariantGroups(scene.cache.json.get(`${map.tileset}_meta`), map.tileset!);
    for (const part of oneWayPlatformTiles(object.x, object.y, object.w)) {
      const chosen = chooseTile(scene, variants, map.tileset!, part.base, part.col, part.row);
      const texture = scene.textures.get(chosen.tileset), frameName = `one-way:${chosen.frame}`;
      if (!texture.has(frameName)) {
        const columns = Math.floor(texture.get('__BASE').cutWidth / FEEL.tile);
        texture.add(frameName, 0, chosen.frame % columns * FEEL.tile, Math.floor(chosen.frame / columns) * FEEL.tile, FEEL.tile, FEEL.tile);
      }
      container.add(scene.add.image(part.x - object.x, 0, chosen.tileset, frameName).setOrigin(0, 0).setDisplaySize(part.width, FEEL.tile));
      tiles.push({ ...part, tileset: chosen.tileset, frame: chosen.frame });
    }
  } else container.add(oneWayFallback(scene, 0, 0, object.w));
  return { object: container, fallback: !useTiles, tileset: map.tileset, tiles };
}

/** 碰撞体：同一行连续的地块合并成一个，避免接缝卡脚；有图块素材就铺图块，没有就画色块 */
function buildTerrain(scene: Phaser.Scene, map: BuiltMap, grid: Grid, tileset?: string) {
  const T = FEEL.tile;
  const useTiles = !!tileset && scene.textures.exists(tileset);
  map.tileset = tileset; map.useTiles = useTiles;
  const gfx = scene.add.graphics().setDepth(-1);
  if (useTiles) {
    const variants = tileVariantGroups(scene.cache.json.get(`${tileset}_meta`), tileset!);
    const offsets = new Map<string, number>([[tileset!, 0]]);
    let nextOffset = tilesetFrameCount(scene, tileset!);
    const tileAt = (base: number, col: number, row: number) => {
      const chosen = chooseTile(scene, variants, tileset!, base, col, row);
      if (!offsets.has(chosen.tileset)) {
        offsets.set(chosen.tileset, nextOffset);
        nextOffset += tilesetFrameCount(scene, chosen.tileset);
      }
      return offsets.get(chosen.tileset)! + chosen.frame;
    };
    const data = grid.map((line, r) => [...line].map((ch, c) => (ch === '#' || ch === '=' ? tileAt(autoTile(grid, r, c), c, r) : -1)));
    // 装饰草：地面顶上一格，按位置伪随机点缀
    grid.forEach((line, r) => [...line].forEach((ch, c) => {
      if (ch !== '#' || r === 0 || grid[r - 1][c] !== '.' || (c * 7 + r * 13) % 5 !== 0) return;
      data[r - 1][c] = tileAt(15, c, r - 1);
    }));
    const tm = scene.make.tilemap({ data, tileWidth: T, tileHeight: T });
    const sets = [...offsets].map(([key, firstgid]) => tm.addTilesetImage(key, key, T, T, 0, 0, firstgid)!);
    tm.createLayer(0, sets, 0, 0)!.setDepth(-1);
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
        if (!useTiles) oneWayFallback(scene, x, y, w);
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
    const variants = tileVariantGroups(scene.cache.json.get(`${tileset}_meta`), tileset!);
    const bases = r.kind === 'rope' ? [12] : [13, 14];
    if (bases.some(base => variants.has(base))) {
      const draw = (base: number, y: number, height: number, top = false) => {
        let chosen = chooseTile(scene, variants, tileset!, base, Math.floor(r.x / FEEL.tile), Math.floor(y / FEEL.tile));
        if (!scene.textures.exists(`${chosen.tileset}_ss`)) {
          const original = variants.get(base)?.base;
          chosen = original && scene.textures.exists(`${original.tileset}_ss`) ? original : { tileset: tileset!, frame: base, weight: 1 };
        }
        const key = `${chosen.tileset}_ss`, frame = chosen.frame;
        if (top) scene.add.image(r.x, y, key, frame).setOrigin(0.5, 0).setDepth(-1);
        else scene.add.tileSprite(r.x, y, FEEL.tile, height, key, frame).setOrigin(0.5, 0).setDepth(-1);
      };
      if (r.kind === 'ladder') draw(14, r.top, FEEL.tile, true);
      for (let y = r.top + (r.kind === 'ladder' ? FEEL.tile : 0); y < r.bottom; y += FEEL.tile)
        draw(r.kind === 'rope' ? 12 : 13, y, Math.min(FEEL.tile, r.bottom - y));
      return;
    }
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

/** GSB 美术已经包含地形和绳梯；这里只建立不可见碰撞与世界锁定图层。 */
function buildGsbScene(scene: Phaser.Scene, map: BuiltMap, id: string, data: GsbSceneData) {
  map.gsbScene = id;
  map.width = data.space.logicalWidth;
  map.height = data.space.logicalHeight;
  const bodies = surfacesToBodies(data);
  for (const rect of bodies.solids) {
    map.solids.add(scene.add.zone(rect.x + rect.width / 2, rect.y + rect.height / 2, rect.width, rect.height));
  }
  for (const rect of bodies.oneWays) {
    const zone = scene.add.zone(rect.x + rect.width / 2, rect.y + rect.height / 2, rect.width, rect.height);
    map.oneWays.add(zone);
    const body = zone.body as Phaser.Physics.Arcade.StaticBody;
    body.checkCollision.down = body.checkCollision.left = body.checkCollision.right = false;
  }
  // Player renders at depth 10; foreground stays above it and below combat FX.
  const layers = [['background', -6], ['playable', -5], ['foreground', 11]] as const;
  for (const [layer, depth] of layers) {
    const key = `gsb_${id}_${layer}`;
    if (scene.textures.exists(key)) {
      scene.add.image(0, 0, key).setOrigin(0, 0).setScrollFactor(1, 1).setDepth(depth);
    }
  }
}

/** 共用缓存判定，让旧背景在建图前即可选择正确模式；没有几何时保持原地图路径。 */
export function getTiledGsbScene(scene: Pick<Phaser.Scene, 'cache'>, tj: any): { id: string; data: GsbSceneData } | undefined {
  const properties = Object.fromEntries((tj?.properties ?? []).map((p: any) => [p.name, p.value]));
  const id = typeof properties.gsbScene === 'string' ? properties.gsbScene.trim() : '';
  if (!id) return;
  const data: unknown = scene.cache.json.get(`gsb_${id}_data`);
  if (isGsbSceneData(data)) return { id, data };
}

/** Tiled JSON（图层约定见 design/01_配置表规范.md） */
export function buildTiledMap(scene: Phaser.Scene, tj: any, tileset?: string): BuiltMap {
  const prop = (arr: any[] | undefined) => Object.fromEntries((arr ?? []).map((p: any) => [p.name, p.value]));
  const mp = prop(tj.properties);
  const map = emptyMap(scene, mp.id ?? 'map', mp.name ?? '', !!mp.safeZone, tj.width, tj.height);
  map.trial = typeof mp.trial === 'string' ? mp.trial : undefined;
  map.night = !!mp.night;
  const gsb = getTiledGsbScene(scene, tj);
  if (gsb) {
    buildGsbScene(scene, map, gsb.id, gsb.data);
  } else {
    const grid: string[][] = Array.from({ length: tj.height }, () => Array(tj.width).fill('.'));
    for (const l of tj.layers) {
      if (l.type !== 'tilelayer') continue;
      const ch = l.name === 'oneway' ? '=' : l.name === 'ground' ? '#' : null;
      if (!ch) continue;
      l.data.forEach((gid: number, i: number) => { if (gid) grid[Math.floor(i / tj.width)][i % tj.width] = ch; });
    }
    buildTerrain(scene, map, grid.map(r => r.join('')), tileset);
  }
  for (const l of tj.layers) {
    if (l.type !== 'objectgroup') continue;
    for (const o of l.objects) {
      const p = prop(o.properties);
      const type = o.type || o.class;
      switch (type) {
        case 'playerStart': map.spawn = { x: o.x, y: o.y }; break;
        case 'rope': case 'ladder': {
          const r: Rope = { kind: type, x: type === 'ladder' ? o.x + o.width / 2 : o.x, top: o.y, bottom: o.y + o.height,
            halfW: type === 'ladder' ? Math.max(12, o.width / 2) : FEEL.ropeGrabRangeX };
          map.ropes.push(r);
          if (!map.gsbScene) drawClimbable(scene, r, tileset);
          break;
        }
        case 'spawn': map.spawns.push({ x: o.x, y: o.y, w: o.width ?? 0, monster: p.monster, count: p.count ?? 1 }); break;
        case 'spawnGate': {
          const gate: MapObj = { type, name: o.name, x: o.x, y: o.y, w: o.width ?? 0, h: o.height ?? 0, props: p };
          map.spawnGates.push(gate);
          map.objects.push(gate);  // 现有筑基台仍按 objects 查找刷怪口
          break;
        }
        case 'zone': map.zones.push({ name: o.name, x: o.x, y: o.y, w: o.width, h: o.height, props: p }); break;
        case 'flyZone': map.objects.push({ type: 'flyZone', name: o.name || 'flyZone', x: o.x, y: o.y, w: o.width ?? 0, h: o.height ?? 0, props: p }); break;
        default: map.objects.push({ type, name: o.name, x: o.x, y: o.y, w: o.width ?? 0, h: o.height ?? 0, props: p,
          ...(type === 'hidden' ? { hiddenGeometryValid: !o.ellipse && !o.polygon && !o.polyline && !(o.rotation ?? 0) } : {}),
          points: o.polyline?.map((point: { x: number; y: number }) => ({ x: o.x + point.x, y: o.y + point.y })) });
      }
    }
  }
  map.hidden = parseHiddenObjects(map.objects);
  for (const hidden of map.hidden) {
    const object = hidden.object;
    hidden.valid &&= object.x >= 0 && object.y >= 0 && object.x + object.w <= map.width && object.y + object.h <= map.height;
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
    if (portals[ch]) map.objects.push({ type: 'portal', name: portals[ch].name, x, y, w: 0, h: 0, props: portals[ch] });
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
