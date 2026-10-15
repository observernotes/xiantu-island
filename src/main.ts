import Phaser from 'phaser';
import { FEEL } from './config/feel';
import { GameScene } from './scenes/GameScene';
import { installOptionalAssetErrorHandler } from './optionalAssets';
import { installCrashGuard } from './crashGuard';
import { isCheatEnabled } from './cheatFlags';

installOptionalAssetErrorHandler(Phaser);

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
  if (isCheatEnabled()) {
    const { installCheat } = await import('./Cheat');
    installCheat();
  }
  if (import.meta.env.VITE_XT_TEST === '1') {
    const { startTestGame } = await import('./XtTestBridge');
    startTestGame(config);
  } else {
    installCrashGuard(new Phaser.Game(config));
  }
}
void start();

