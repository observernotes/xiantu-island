export interface PlayerInput {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  jumpDown: boolean;
  attackDown: boolean;
  attackHeld?: boolean;
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
