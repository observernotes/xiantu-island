import Phaser from 'phaser';
import { FEEL } from './config/feel';
import { GameScene } from './scenes/GameScene';
import { installOptionalAssetErrorHandler } from './optionalAssets';
import { installCrashGuard } from './crashGuard';
import { isCheatEnabled } from './cheatFlags';
import { chooseRenderer, recordRendererChoice } from './rendererChoice';
import { featureEnabled } from './features';
import { Progress } from './Progress';
import { saveStore, SAVE_SLOT_KEYS } from './SaveStore';
import { installSaveSlotsPanel } from './SaveSlotsPanel';

installOptionalAssetErrorHandler(Phaser);

const rendererChoice = chooseRenderer(window.location.search);
const config: Phaser.Types.Core.GameConfig = {
  type: rendererChoice.type,
  parent: 'game',
  width: 1280,
  height: 720,
  backgroundColor: '#9fd8f5',
  pixelArt: false,
  physics: {
    default: 'arcade',
    arcade: { gravity: { x: 0, y: FEEL.gravity }, fps: 60, fixedStep: true, debug: false, tileBias: 16 },
  },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [GameScene],
};

async function start() {
  if (isCheatEnabled()) {
    const { installCheat } = await import('./Cheat');
    installCheat();
  }
  if (featureEnabled('indexedDbSaves')) {
    let initial = await Progress.load({ async: true });
    if (new URLSearchParams(location.search).get('reset') === '1' && !initial.storageError
      && await Progress.reset({ async: true })) initial = await Progress.load({ async: true });
    config.callbacks = { preBoot: game => { game.registry.set('progress', initial); } };
  }
  let game: Phaser.Game;
  if (import.meta.env.VITE_XT_TEST === '1') {
    const { startTestGame } = await import('./XtTestBridge');
    game = startTestGame(config, rendererChoice);
  } else {
    game = new Phaser.Game(config);
    recordRendererChoice(game, rendererChoice);
    installCrashGuard(game);
  }
  if (featureEnabled('indexedDbSaves')) {
    const current = (): Progress | undefined => game.registry.get('progress');
    let panelVisible = false;
    let pausedByPanel = false;
    const setPaused = (visible: boolean): void => {
      panelVisible = visible;
      if (visible && game.scene.isActive('game')) { game.scene.pause('game'); pausedByPanel = true; }
      if (!visible && pausedByPanel) { game.scene.resume('game'); pausedByPanel = false; }
    };
    const dispose = installSaveSlotsPanel({
      async listSlots() {
        const slots = await saveStore.listSlots();
        return SAVE_SLOT_KEYS.map((slot, i) => ({ slot, data: slots[i]?.data, lastSaveAt: slots[i]?.lastSaveAt }));
      },
      activeSlot: () => Progress.getActiveSlot(),
      async saveSlot(slot) {
        const p = current();
        if (!p || p.storageError) return false;
        await p.flushSaves();
        return saveStore.writeSlot(slot, p.exportSave());
      },
      async loadSlot(slot) {
        await current()?.flushSaves();
        const p = await Progress.load({ async: true, slot });
        if (p.storageError) return false;
        game.registry.set('progress', p);
        for (const key of ['chests', 'trialPending', 'trialRate', 'sectTrialEntering', 'sectTrialReturnMessage', 'sectTrialReturnDetail']) game.registry.remove(key);
        const at = p.position;
        game.scene.start('game', at ? { map: at.mapId, pos: { x: at.x, y: at.y } } : {});
        return true;
      },
      async deleteSlot(slot) { await current()?.flushSaves(); return Progress.reset({ async: true, slot }); },
      async exportSlot(slot) { await current()?.flushSaves(); return saveStore.exportSlotBlob(slot); },
      async importSlot(slot, file) { await current()?.flushSaves(); return saveStore.importIntoSlot(slot, file); },
      onVisibilityChange: setPaused,
    });
    game.events.on(Phaser.Core.Events.POST_STEP, () => { if (panelVisible) setPaused(true); });
    game.events.once(Phaser.Core.Events.DESTROY, () => dispose?.());
  }
}
void start();

