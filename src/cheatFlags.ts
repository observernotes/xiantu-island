import type { GameScene } from './scenes/GameScene';

// 启动时读取 URL；不读存档，也不随切图重新应用参数。
const value = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('cheat');
const enabled = value === '1' || value === 'true';
let god = false, skills = false;
let onSceneReady: ((scene: GameScene) => void) | undefined;

export const isCheatEnabled = () => enabled;
export const isCheatGod = () => enabled && god;
export const isCheatSkillsUnlocked = () => enabled && skills;
export function setCheatGod(value: boolean) { god = enabled && value; }
export function unlockCheatSkills() { skills = enabled; }
export function onCheatSceneReady(handler: (scene: GameScene) => void) {
  if (enabled) onSceneReady = handler;
}
export function notifyCheatSceneReady(scene: GameScene) {
  if (enabled) onSceneReady?.(scene);
}
