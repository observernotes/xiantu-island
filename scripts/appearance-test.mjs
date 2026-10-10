// 不启动浏览器，不监听端口；只载入 Phaser 的动画组件与 Vite SSR 逻辑模块。
import { createRequire } from 'node:module';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
globalThis.appearanceTestPhaser = {
  Animation: require('phaser/src/animations/Animation.js'),
  AnimationState: require('phaser/src/animations/AnimationState.js'),
};
const server = await createServer({
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom',
  logLevel: 'error',
});
try {
  await server.ssrLoadModule('/src/appearance.test.ts');
} finally {
  await server.close();
  delete globalThis.appearanceTestPhaser;
}
