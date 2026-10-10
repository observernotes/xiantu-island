import Phaser from 'phaser';
import { FEEL } from './config/feel';
import { GameScene } from './scenes/GameScene';
import assets from './gen/assets.json';
import { optionalAssetUrls, probeOptionalAssets } from './optionalAssets';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  width: 1280,
  height: 720,
  backgroundColor: '#9fd8f5',
  pixelArt: false,
  physics: {
    default: 'arcade',
    arcade: { gravity: { x: 0, y: FEEL.gravity }, debug: false, tileBias: 16 },
  },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [GameScene],
};

async function start() {
  // 可选素材先探测存在性，缺图不进 Phaser 加载队列（G15）。
  await probeOptionalAssets(optionalAssetUrls(assets));
  if (import.meta.env.VITE_XT_TEST === '1') {
    const { startTestGame } = await import('./XtTestBridge');
    startTestGame(config);
  } else {
    new Phaser.Game(config);
  }
}
void start();

