#!/usr/bin/env node
/**
 * 将已 VERIFY_PASS 的 GSB 场景接入正式地图 JSON + 运行时素材清单路径。
 * 用法：node scripts/gsb_integrate_map.mjs <mapId> <gsbSceneId>
 * 例：node scripts/gsb_integrate_map.mjs qingyun_village qingyun_village_gsb_v2
 *
 * - 更新共享 maps/<mapId>.json：绑定 gsbScene、尺寸对齐、物体/绳梯坐标取自 scene-data、清空 tile 碰撞层
 * - 同步 data/maps/<mapId>.json 快照（若存在）
 * - 拷贝 runtime 件到 data/art/scenes/<gsbSceneId>/（供发版分支 snapshot 模式）
 * 不改 game/src；碰撞/图层加载由 MapBuilder/GameScene 读 gsbScene 完成。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sharedRoot } from './root.mjs';

const here = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const root = sharedRoot(here);
const mapId = process.argv[2];
const gsbSceneId = process.argv[3];
if (!mapId || !gsbSceneId) {
  console.error('用法: node scripts/gsb_integrate_map.mjs <mapId> <gsbSceneId>');
  process.exit(2);
}

const sceneDir = path.join(root, 'art/scenes', gsbSceneId);
const sceneDataPath = path.join(sceneDir, 'scene-data.json');
if (!fs.existsSync(sceneDataPath)) {
  console.error('缺少 scene-data.json:', sceneDataPath);
  process.exit(1);
}
const scene = JSON.parse(fs.readFileSync(sceneDataPath, 'utf8'));
const space = scene.space ?? {};
const logicalW = space.logicalWidth ?? scene.width;
const logicalH = space.logicalHeight ?? scene.height;
if (!logicalW || !logicalH) {
  console.error('scene-data 缺少 space.logicalWidth/Height');
  process.exit(1);
}

const RUNTIME_FILES = ['background.png', 'playable.png', 'foreground.png', 'scene-data.json', 'manifest.json'];
const POINT_TO_OBJECT = {
  start_spawn: 'playerStart',
  goal_east: ['portal_to_bamboo', 'portal_to_lingxi', 'portal_to_village'],
  portal_west: ['portal_west_locked', 'portal_to_village'],
  point_west: 'portal_west_locked',
  npc_elder: 'village_elder',
  npc_wang: 'grocer_wang',
  npc_sun: 'doctor_sun',
  npc_envoy: 'tianjian_envoy',
  npc_teacher: 'tianjian_elder',
  dummy_1: 'dummy_1',
  dummy_2: 'dummy_2',
  dummy_3: 'dummy_3',
  point_chest: 'chest_lookout',
  point_stage_return: 'enc_sage_advice_anchor',
};
const CLIMB_TO_OBJECT = {
  c_ladder: 'ladder_elder',
  c_stage: 'rope_stage',
  c_tower: 'rope_tower',
  c_east: 'rope_east',
  // 筑基台 gsb_v1：scene-data climbs 用 c_rope_*，正式图对象仍为 rope_10/24/39
  c_rope_left: 'rope_10',
  c_rope_center: 'rope_24',
  c_rope_right: 'rope_39',
};

function setProp(props, name, type, value) {
  const list = Array.isArray(props) ? props.slice() : [];
  const i = list.findIndex(p => p.name === name);
  const entry = { name, type, value };
  if (i >= 0) list[i] = entry; else list.push(entry);
  return list;
}

function patchMap(mapPath) {
  const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
  const tile = map.tilewidth || 32;
  const cols = Math.round(logicalW / tile);
  const rows = Math.round(logicalH / tile);
  if (cols * tile !== logicalW || rows * tile !== logicalH) {
    console.warn(`[gsb] 逻辑尺寸 ${logicalW}x${logicalH} 非 ${tile} 整除；tile 网格用 ${cols}x${rows}，运行时以 scene-data 像素为准`);
  }
  map.width = cols;
  map.height = rows;
  map.properties = setProp(map.properties, 'gsbScene', 'string', gsbSceneId);
  map.properties = setProp(map.properties, 'gsbGeometryRevision', 'string', scene.geometryRevision ?? '');

  const objectNames = new Set((map.layers ?? [])
    .filter(layer => layer.type === 'objectgroup')
    .flatMap(layer => (layer.objects ?? []).map(o => o.name)));
  const resolveAlias = (aliases, id) => [aliases[id]].flat().find(name => objectNames.has(name));
  const pointByObj = new Map();
  // 直名点优先，避免 goal_east 等旧别名覆盖本图明确标注的 portal（不依赖 points 顺序）。
  for (const p of scene.points ?? []) {
    if (objectNames.has(p.id) && Array.isArray(p.position)) pointByObj.set(p.id, p.position);
  }
  for (const p of scene.points ?? []) {
    if (objectNames.has(p.id)) continue;
    const name = resolveAlias(POINT_TO_OBJECT, p.id);
    if (name && !pointByObj.has(name) && Array.isArray(p.position)) pointByObj.set(name, p.position);
  }
  const climbByObj = new Map();
  for (const c of scene.climbs ?? []) {
    const stripped = c.id?.replace(/^c_/, '');
    const name = resolveAlias(CLIMB_TO_OBJECT, c.id) ?? (objectNames.has(stripped) ? stripped : undefined);
    if (!name || !c.corridor?.length) continue;
    const xs = c.corridor.map(pt => pt[0]);
    const ys = c.corridor.map(pt => pt[1]);
    const left = Math.min(...xs), right = Math.max(...xs);
    const top = Math.min(...ys), bottom = Math.max(...ys);
    const cx = c.ends?.end?.position?.[0] ?? c.ends?.start?.position?.[0] ?? (left + right) / 2;
    climbByObj.set(name, { kind: c.kind, left, right, top, bottom, cx, w: right - left, h: bottom - top });
  }

  for (const layer of map.layers ?? []) {
    if (layer.type === 'tilelayer' && (layer.name === 'ground' || layer.name === 'oneway')) {
      layer.width = cols;
      layer.height = rows;
      layer.data = Array(cols * rows).fill(0);
    }
    if (layer.type === 'objectgroup') {
      const dy = Array.isArray(space.sourceTranslation) ? (space.sourceTranslation[1] ?? 0) : 0;
      for (const o of layer.objects ?? []) {
        let relocated = false;
        const pos = pointByObj.get(o.name);
        if (pos) { o.x = pos[0]; o.y = pos[1]; relocated = true; }
        const climb = climbByObj.get(o.name);
        if (climb) {
          if (climb.kind === 'ladder' || o.type === 'ladder') {
            o.x = climb.left;
            o.y = climb.top;
            o.width = Math.max(16, climb.w);
            o.height = Math.max(8, climb.h);
          } else {
            // rope：MapBuilder 用 o.x 作中心
            o.x = climb.cx;
            o.y = climb.top;
            o.width = 0;
            o.height = Math.max(8, climb.h);
          }
          relocated = true;
        }
        // 郊野荒驿等：scene-data 有 sourceTranslation 时，未点位/绳梯对齐的玩法对象随画布平移（禁丢对象）
        if (!relocated && dy) o.y = (o.y ?? 0) + dy;
      }
    }
  }

  fs.writeFileSync(mapPath, JSON.stringify(map, null, 2) + '\n');
  console.log('[gsb] patched map', mapPath, `→ ${cols}x${rows} gsbScene=${gsbSceneId}`);
}

const sharedMap = path.join(root, 'maps', `${mapId}.json`);
if (!fs.existsSync(sharedMap)) {
  console.error('缺少共享地图', sharedMap);
  process.exit(1);
}
patchMap(sharedMap);

const snapMap = path.join(here, 'data/maps', `${mapId}.json`);
if (fs.existsSync(path.dirname(snapMap))) {
  fs.mkdirSync(path.dirname(snapMap), { recursive: true });
  fs.copyFileSync(sharedMap, snapMap);
  console.log('[gsb] synced snapshot map', snapMap);
}

const runtimeOut = path.join(here, 'data/art/scenes', gsbSceneId);
fs.mkdirSync(runtimeOut, { recursive: true });
for (const name of RUNTIME_FILES) {
  const src = path.join(sceneDir, name);
  if (!fs.existsSync(src)) {
    if (name === 'foreground.png') continue;
    console.warn('[gsb] 缺 runtime 件，跳过拷贝', name);
    continue;
  }
  fs.copyFileSync(src, path.join(runtimeOut, name));
  console.log('[gsb] staged', path.join('data/art/scenes', gsbSceneId, name));
}

console.log('[gsb] integrate done. 接着 npm run sync（或 node scripts/sync.mjs）刷新 public/art + assets.json');
