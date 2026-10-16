export interface PlayerInput {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  jumpDown: boolean;
  attackDown: boolean;
  attackHeld?: boolean;
}

export type InputAction = 'spirit_scan';

/** 会话内可配置的动作槽；独立于物理边沿 latch，不占技能栏、不写角色存档。 */
export class InputBindings {
  private readonly codes: Partial<Record<InputAction, number>> = {};

  keyCode(action: InputAction): number | undefined { return this.codes[action]; }
  bind(action: InputAction, keyCode?: number): void {
    if (keyCode !== undefined && (!Number.isSafeInteger(keyCode) || keyCode <= 0)) throw new RangeError('Invalid key code');
    if (keyCode === undefined) delete this.codes[action];
    else this.codes[action] = keyCode;
  }
}

/** Render frames sample held keys; physics ticks consume each sampled press once. */
export class PlayerInputLatch {
  private left = false;
  private right = false;
  private up = false;
  private down = false;
  private attackHeld = false;
  private jumpPresses = 0;
  private attackPresses = 0;

  capture(input: PlayerInput): void {
    this.left = input.left;
    this.right = input.right;
    this.up = input.up;
    this.down = input.down;
    this.attackHeld = input.attackHeld ?? false;
    if (input.jumpDown) this.jumpPresses++;
    if (input.attackDown) this.attackPresses++;
  }

  consume(): PlayerInput {
    const jumpDown = this.jumpPresses > 0;
    const attackDown = this.attackPresses > 0;
    if (jumpDown) this.jumpPresses--;
    if (attackDown) this.attackPresses--;
    return {
      left: this.left,
      right: this.right,
      up: this.up,
      down: this.down,
      jumpDown,
      attackDown,
      attackHeld: this.attackHeld,
    };
  }

  /** Modal transitions and restarts must discard both queued presses and held keys. */
  clear(): void {
    this.left = this.right = this.up = this.down = this.attackHeld = false;
    this.jumpPresses = this.attackPresses = 0;
  }
}
