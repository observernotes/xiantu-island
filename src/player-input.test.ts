import { InputBindings, PlayerInputLatch, type PlayerInput } from './PlayerInput';

let assertions = 0;
function eq(actual: unknown, expected: unknown, message: string) {
  assertions++;
  if (actual !== expected) throw new Error(`${message}：得到 ${String(actual)}，期望 ${String(expected)}`);
}
function same(actual: unknown, expected: unknown, message: string) {
  eq(JSON.stringify(actual), JSON.stringify(expected), message);
}
function input(changes: Partial<PlayerInput> = {}): PlayerInput {
  return { left: false, right: false, up: false, down: false, jumpDown: false, attackDown: false, ...changes };
}
const idle = { ...input(), attackHeld: false };

// 新动作不抢占已有键；绑定与角色/物理输入分离，可重绑、解绑且实例之间不串用。
{
  const bindings = new InputBindings(), other = new InputBindings();
  eq(bindings.keyCode('spirit_scan'), undefined, '神识默认不绑定任何键');
  bindings.bind('spirit_scan', 113); // F2，开发配置示例，非默认值。
  eq(bindings.keyCode('spirit_scan'), 113, '读取真实配置键码');
  eq(other.keyCode('spirit_scan'), undefined, '动作绑定不污染其他会话');
  bindings.bind('spirit_scan', 114);
  eq(bindings.keyCode('spirit_scan'), 114, '重新绑定替换旧键');
  for (const invalid of [NaN, Infinity, 0, -1, 1.5]) {
    let rejected = false;
    try { bindings.bind('spirit_scan', invalid); } catch { rejected = true; }
    eq(rejected, true, '非法键码被拒绝');
    eq(bindings.keyCode('spirit_scan'), 114, '失败保留旧绑定');
  }
  bindings.bind('spirit_scan');
  eq(bindings.keyCode('spirit_scan'), undefined, '解除绑定恢复按钮入口');
}

// 高刷渲染帧可以没有物理步；按下后已经松键，边沿仍必须交给下一物理步。
{
  const latch = new PlayerInputLatch();
  same(latch.consume(), idle, '初始输入无按键');
  latch.capture(input({ right: true, jumpDown: true, attackDown: true }));
  for (let frame = 0; frame < 4; frame++) latch.capture(input());
  same(latch.consume(), { ...idle, jumpDown: true, attackDown: true }, '多渲染帧后保留已经松开的两个按下边沿');
  same(latch.consume(), idle, '追赶物理步不会重复消费按下边沿');
  same(latch.consume(), idle, '后续物理步无残留边沿');
}

// 两个真实按下发生在同一物理步之前时，不能合并而丢失第二次。
{
  const latch = new PlayerInputLatch();
  latch.capture(input({ jumpDown: true, attackDown: true }));
  latch.capture(input());
  latch.capture(input({ jumpDown: true, attackDown: true }));
  latch.capture(input());
  for (let tick = 0; tick < 2; tick++) {
    same(latch.consume(), { ...idle, jumpDown: true, attackDown: true }, `第 ${tick + 1} 个真实按下各消费一次`);
  }
  same(latch.consume(), idle, '两个按下之后不合成第三次');
}

// 两类边沿独立计数；方向以最新采样为准，攻击长按由消费者按冷却处理。
{
  const latch = new PlayerInputLatch();
  latch.capture(input({ right: true, up: true, jumpDown: true, attackDown: true, attackHeld: true }));
  latch.capture(input({ left: true, down: true, attackDown: true, attackHeld: true }));
  same(latch.consume(), { ...idle, left: true, down: true, jumpDown: true, attackDown: true, attackHeld: true }, '方向读取最新快照且保留早前跳跃');
  same(latch.consume(), { ...idle, left: true, down: true, attackDown: true, attackHeld: true }, '攻击与跳跃队列独立');
  for (let tick = 0; tick < 3; tick++) {
    const consumed = latch.consume();
    eq(consumed.attackHeld, true, '追赶物理步保留攻击长按');
    eq(consumed.attackDown, false, '攻击长按不合成按下边沿');
    eq(consumed.jumpDown, false, '攻击长按不合成跳跃');
  }
  latch.capture(input());
  same(latch.consume(), idle, '松开输入后所有持续状态更新');
}

// clear 用于窗口/场景切换，不能在关闭窗口或重启之后回放旧输入。
{
  const latch = new PlayerInputLatch();
  latch.capture(input({ left: true, right: true, up: true, down: true, jumpDown: true, attackDown: true, attackHeld: true }));
  latch.capture(input({ left: true, right: true, up: true, down: true, jumpDown: true, attackDown: true, attackHeld: true }));
  latch.clear();
  same(latch.consume(), idle, '清理同时丢弃所有持续状态和队列');
  same(latch.consume(), idle, '清理多条队列后无第二次旧边沿');
  latch.capture(input({ jumpDown: true }));
  same(latch.consume(), { ...idle, jumpDown: true }, '清理之后可以采样新按键');
}

// capture/consume 都必须使用值拷贝；调用方之后改对象不能污染待消费状态。
{
  const latch = new PlayerInputLatch();
  const sampled = input({ right: true, jumpDown: true, attackHeld: true });
  latch.capture(sampled);
  sampled.right = false;
  sampled.left = true;
  sampled.jumpDown = false;
  sampled.attackHeld = false;
  const first = latch.consume();
  same(first, { ...idle, right: true, jumpDown: true, attackHeld: true }, 'capture 不保留调用方对象引用');
  first.right = false;
  first.left = true;
  first.jumpDown = true;
  first.attackDown = true;
  first.attackHeld = false;
  same(latch.consume(), { ...idle, right: true, attackHeld: true }, 'consume 对象修改不污染下一物理步');
}

console.log(`player-input.test: ${assertions} 条断言通过（高刷锁存/物理追赶/连续按下/长按/清理/快照隔离）`);
