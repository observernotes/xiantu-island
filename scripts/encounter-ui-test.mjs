import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

// 每种 XT_DATA 模式使用独立进程，真实配置与翻译不会共用模块缓存。
if (!process.argv.includes('--single-mode')) {
  for (const mode of ['snapshot', 'shared']) {
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--single-mode'], {
        cwd: process.cwd(), env: { ...process.env, XT_DATA: mode }, stdio: 'inherit',
      });
      child.on('error', reject);
      child.on('exit', code => code === 0 ? resolve() : reject(new Error(`encounter-ui ${mode} failed: ${code}`)));
    });
  }
} else {
  const server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error',
    // UI 只替换 Phaser 的显示对象分配；控制器、Progress、读表与 t() 均加载真实模块。
    plugins: [{ name: 'encounter-ui-render-stub', enforce: 'pre',
      resolveId(id) { if (id === 'phaser') return '\0encounter-ui-phaser'; },
      load(id) { if (id === '\0encounter-ui-phaser') return 'export default {GameObjects:{NineSlice:class {}},Scenes:{Events:{SHUTDOWN:"shutdown"}}};'; },
    }], ssr: { noExternal: ['phaser'] },
  });
  try {
    await server.ssrLoadModule('/src/encounter-ui.test.ts');
    console.log(`encounter-ui XT_DATA=${process.env.XT_DATA}: passed`);
  } finally {
    await server.close();
  }
}
