import Phaser from 'phaser';
import type { GameScene } from './scenes/GameScene';
import type { PlayerInputLatch } from './PlayerInput';

/** Imported only by XtTestBridge; drives complete render frames without wall-clock jitter. */
export function fixedStepTestProbe(scene: GameScene, hz: number, manual: boolean) {
  let active = false, origin = 0, renderFrames = 0, physicsSteps = 0;
  let playerSteps = 0, jumpEdges = 0, attackEdges = 0, attacks = 0, doubleJumps = 0;
  let trace: ReturnType<typeof snapshot>[] = [];
  function snapshot() {
    const p = scene.player, b = p.body;
    return { hz, timeMs: renderFrames * 1000 / hz, renderTimeMs: renderFrames * 1000 / hz,
      physicsTimeMs: physicsSteps * 1000 / 60, renderFrames, physicsSteps,
      x: b.center.x, y: b.bottom, bodyX: b.x, bodyY: b.y, vx: b.velocity.x, vy: b.velocity.y,
      grounded: p.onGround, state: p.state2, didDouble: p.didDouble,
      playerSteps, jumpEdges, attackEdges, attacks, doubleJumps };
  }
  function attach() {
    const p = scene.player, step = p.step.bind(p);
    let previousAttackDown = false;
    p.step = (time, dt, input, ropes) => {
      if (active) {
        playerSteps++;
        if (input.jumpDown) jumpEdges++;
        if (input.attackDown && (input.attackHeld !== undefined || !previousAttackDown)) attackEdges++;
      }
      previousAttackDown = input.attackDown;
      const before = p.attackReadyAt;
      step(time, dt, input, ropes);
      if (active && p.attackReadyAt !== before) attacks++;
    };
    p.on('doublejump', () => { if (active) doubleJumps++; });
    scene.physics.world.on(Phaser.Physics.Arcade.Events.WORLD_STEP, () => {
      if (!active) return;
      physicsSteps++;
      trace.push({ ...snapshot(), timeMs: physicsSteps * 1000 / 60 });
    });
  }
  return {
    attach,
    snapshot,
    start() {
      if (!manual || ![30, 60, 144].includes(hz) || scene.map.id !== 'field_test')
        throw new Error('Fixed-step probe requires xtManualLoop=1, xtRenderHz=30|60|144 and map=test');
      scene.game.loop.stop();
      // Recreate the identical native spawn and phase for every measurement.
      const p = scene.player;
      p.body.reset(scene.map.spawn.x, scene.map.spawn.y);
      p.body.setAllowGravity(true);
      p.state2 = 'air'; p.rope = null; p.facing = 1;
      p.canDouble = true; p.didDouble = false; p.dead = false;
      p.lastGroundAt = -9999; p.jumpBufferedAt = -9999;
      p.attackReadyAt = 0; p.attackLockUntil = 0;
      p.skillRooted = false; p.skillCancelOnJump = false;
      p.hurtUntil = 0; p.invulnUntil = 0; p.dropUntil = 0;
      (scene.physics.world as unknown as { _elapsed: number })._elapsed = 0;
      const runtime = scene as unknown as { playerPhysicsAccumulator?: number; playerInput?: PlayerInputLatch };
      runtime.playerPhysicsAccumulator = 0; runtime.playerInput?.clear();
      origin = scene.time.now;
      renderFrames = 0; physicsSteps = 0; playerSteps = 0;
      jumpEdges = 0; attackEdges = 0; attacks = 0; doubleJumps = 0; trace = [];
      active = true;
      return snapshot();
    },
    advance(frames: number) {
      if (!active || !Number.isInteger(frames) || frames < 1 || frames > 10000)
        throw new Error('Invalid fixed-step probe frame count');
      for (let i = 0; i < frames; i++) {
        renderFrames++;
        // Game.step includes input processing, Scene update/postUpdate and real rendering.
        scene.game.step(origin + renderFrames * 1000 / hz, 1000 / hz);
      }
      return snapshot();
    },
    drain() { const result = trace; trace = []; return result; },
  };
}
