// Alt 按下时 event.altKey 为真，Phaser 不会替它 preventDefault：Chrome/Edge 里 Alt+← 会触发后退，Firefox 会弹菜单栏。
// 注意 Phaser 会忽略已经 defaultPrevented 的事件，所以这个监听必须挂在 Phaser 的键盘监听之后（同一目标同一阶段按注册顺序执行），
// 由 GameScene.create 在游戏启动后调用。
const GAME_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'AltLeft', 'AltRight', 'ControlLeft', 'ControlRight', 'KeyZ', 'KeyX', 'KeyC', 'F1', 'Enter']);
let installed = false;
export function installKeyGuard() {
  if (installed) return; installed = true;
  const block = (e: KeyboardEvent) => { if (GAME_KEYS.has(e.code) || e.altKey || (e.ctrlKey && e.code.startsWith('Arrow'))) e.preventDefault(); };
  window.addEventListener('keydown', block);
  window.addEventListener('keyup', block);
}
