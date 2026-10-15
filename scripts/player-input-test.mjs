// 仅加载输入锁存的内存逻辑测试，不启动 Phaser 或监听端口。
import { createServer } from 'vite';

const server = await createServer({
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom', logLevel: 'error',
});
try {
  await server.ssrLoadModule('/src/player-input.test.ts');
} finally {
  await server.close();
}
