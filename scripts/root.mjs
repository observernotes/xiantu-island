// 数据根目录（含 balance/ maps/ design/ art/ 的那一层）。
// 发版分支（master、hotfix、qa、detached tag）用分支里已提交的快照 game/data/，策划改到一半的共享数据进不了发版；
// dev、feat/* 读共享目录 /workspace/xiantu/。环境变量 XT_DATA=snapshot|shared 可强制指定。
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const RELEASE_BRANCHES = ['master', 'hotfix', 'qa', 'HEAD'];
export function branchOf(dir) {
  try { return execSync('git rev-parse --abbrev-ref HEAD', { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return 'HEAD'; }
}
export function sharedRoot(start) {
  let d = path.dirname(start);
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(d, 'balance')) && fs.existsSync(path.join(d, 'art')) && !d.endsWith(path.sep + 'data')) return d;
    d = path.dirname(d);
  }
  throw new Error('找不到 xiantu 共享目录（含 balance/ 与 art/）');
}
export function dataMode(start) {
  const env = process.env.XT_DATA;
  if (env === 'snapshot' || env === 'shared') return env;
  return RELEASE_BRANCHES.includes(branchOf(start)) ? 'snapshot' : 'shared';
}
/** start = 工程目录（game/ 或 wt/<分支>/） */
export function findRoot(start) {
  if (dataMode(start) === 'snapshot') {
    const snap = path.join(start, 'data');
    if (!fs.existsSync(path.join(snap, 'balance'))) throw new Error('发版分支缺少数据快照 data/，先在 dev 上 npm run snapshot 并合并过来');
    return snap;
  }
  try { return sharedRoot(start); }
  catch (e) {
    // 云端 agent / 新机器上没有共享目录：退回分支里的快照
    if (fs.existsSync(path.join(start, 'data', 'balance'))) { console.warn('[root] 没有共享目录，改用 data/ 快照'); return path.join(start, 'data'); }
    throw e;
  }
}
