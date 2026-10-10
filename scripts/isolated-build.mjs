// 多构建/缺图验收拥有独立工程与 preview，不能借用外部 build:test 服务。
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';

const require = createRequire(import.meta.url);
const viteCLI = path.join(path.dirname(require.resolve('vite/package.json')), 'bin/vite.js');

export const childBuildEnv = (overrides = {}) => ({ ...process.env,
  // 外部自测 loader 会把 preview 重定向到共享测试构建；子工程独立验收正式产物。
  NODE_OPTIONS: '', XT_DATA: 'snapshot', ...overrides });

export async function createIsolatedBuild(projectRoot, label) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `xiantu-${label}-project-`));
  try {
    for (const name of ['src', 'scripts', 'data', 'art-overlays', 'index.html', 'package.json',
      'tsconfig.json', 'vite.config.ts'])
      await fs.cp(path.join(projectRoot, name), path.join(root, name), { recursive: true });
    await fs.symlink(await fs.realpath(path.join(projectRoot, 'node_modules')), path.join(root, 'node_modules'));
    return { root, cleanup: () => fs.rm(root, { recursive: true, force: true }) };
  } catch (error) {
    await fs.rm(root, { recursive: true, force: true });
    throw error;
  }
}

export async function preview({ root, build = {}, preview: options = {} }) {
  const child = spawn(process.execPath, [viteCLI, 'preview', '--host', '127.0.0.1',
    '--port', String(options.port ?? 0), '--strictPort', '--outDir', build.outDir ?? 'dist'],
  { cwd: root, env: childBuildEnv(), stdio: ['ignore', 'pipe', 'pipe'] });
  const stopped = new Promise(resolve => child.once('close', resolve));
  const close = async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    child.kill('SIGTERM');
    const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
    timer.unref();
    try { await stopped; } finally { clearTimeout(timer); }
  };
  try {
    const baseURL = await new Promise((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(new Error(`preview 启动超时\n${output}`)), 15000);
      const finish = (fn, value) => { clearTimeout(timer); fn(value); };
      const append = chunk => {
        output = (output + chunk.toString()).slice(-12000);
        const url = output.match(/http:\/\/127\.0\.0\.1:\d+\//)?.[0];
        if (url) finish(resolve, url);
      };
      child.stdout.on('data', append);
      child.stderr.on('data', append);
      child.once('error', error => finish(reject, error));
      child.once('close', (code, signal) => finish(reject,
        new Error(`preview 退出（${signal ?? code}）\n${output}`)));
    });
    return { resolvedUrls: { local: [baseURL], network: [] }, close,
      httpServer: { close(callback) { void close().then(() => callback?.(), error => callback?.(error)); } } };
  } catch (error) {
    await close();
    throw error;
  }
}
