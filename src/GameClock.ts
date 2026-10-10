/** 绝对游戏时间；默认动态读取系统时间，存档仍使用毫秒时间戳。 */
let timeSource: (() => number) | null = null;

export function gameNow(): number { return timeSource ? timeSource() : Date.now(); }

/** 时间源由独立测试构建接管，正式构建没有控制入口。 */
export function setGameTimeSource(source: (() => number) | null): void { timeSource = source; }
