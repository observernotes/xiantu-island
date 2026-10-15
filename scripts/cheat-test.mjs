// 只测试 URL 解析，不载入 Phaser、不启动浏览器、不写真实存档。
import { createServer } from 'vite';

const server = await createServer({
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom', logLevel: 'error',
});
try {
  await server.ssrLoadModule('/src/cheat.test.ts');
} finally {
  await server.close();
}
