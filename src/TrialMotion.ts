export interface Point { x: number; y: number }
export interface PatrolMotion extends Point { target: number; direction: number; pauseLeft: number; facing: number }

/** 折线首点出发，沿原路线往返；只有两端停顿。 */
export function startPatrol(points: Point[]): PatrolMotion {
  return { ...points[0], target: 1, direction: 1, pauseLeft: 0, facing: Math.sign(points[1].x - points[0].x) || 1 };
}
export function advancePatrol(state: PatrolMotion, points: Point[], speed: number, deltaMs: number, pauseMs: number) {
  let left = Math.max(0, deltaMs);
  if (speed <= 0 || points.length < 2 || !points.some(p => p.x !== points[0].x || p.y !== points[0].y)) return;
  while (left > 0) {
    if (state.pauseLeft > 0) {
      const wait = Math.min(left, state.pauseLeft); left -= wait; state.pauseLeft -= wait;
      if (!left) return;
    }
    const end = points[state.target], dx = end.x - state.x, dy = end.y - state.y;
    const distance = Math.hypot(dx, dy), travelMs = distance / speed * 1000;
    if (dx) state.facing = Math.sign(dx);
    if (left < travelMs) {
      const ratio = left / travelMs; state.x += dx * ratio; state.y += dy * ratio;
      return;
    }
    state.x = end.x; state.y = end.y; left -= travelMs;
    if (state.target === 0 || state.target === points.length - 1) {
      state.direction *= -1;
      state.pauseLeft = Math.max(0, pauseMs);
    }
    state.target += state.direction;
  }
}

export function inShadow(player: Point, zones: { x: number; y: number; w: number; h: number; props: { kind?: string } }[]) {
  return zones.some(z => z.props.kind === 'shadow' && player.x >= z.x && player.x <= z.x + z.w && player.y >= z.y && player.y <= z.y + z.h);
}

/** feet 用来判高差和阴影；胸前点与灯笼同高，边界对应锥的真实长度/半角。 */
export function seesPlayer(origin: Point, facing: number, patrolFeet: Point, points: Point[], playerFeet: Point,
  shadow: boolean, vision: { length: number; halfAngleDeg: number }) {
  if (shadow || Math.abs(playerFeet.y - patrolFeet.y) >= 96) return false;
  const xs = points.map(p => p.x);
  if (playerFeet.x < Math.min(...xs) - 192 || playerFeet.x > Math.max(...xs) + 192) return false;
  const forward = (playerFeet.x - origin.x) * facing;
  const vertical = Math.abs(playerFeet.y - 40 - origin.y);
  return forward >= 0 && forward <= vision.length && vertical <= forward * Math.tan(vision.halfAngleDeg * Math.PI / 180);
}

export function detectProgress(current: number, seen: boolean, deltaMs: number, vision: { detectMs: number; decayMul: number }) {
  return Math.min(vision.detectMs, Math.max(0, current + Math.max(0, deltaMs) * (seen ? 1 : -vision.decayMul)));
}

/** 不重叠的阴影拼片；非整块中段裁掉尾部。 */
export function shadowPieces(x: number, width: number, pieceWidth = 32) {
  const edge = Math.min(pieceWidth, width / 2);
  const pieces: { kind: 'left' | 'mid' | 'right'; x: number; width: number }[] = [{ kind: 'left', x, width: edge }];
  for (let at = x + edge; at < x + width - edge; at += pieceWidth) {
    pieces.push({ kind: 'mid', x: at, width: Math.min(pieceWidth, x + width - edge - at) });
  }
  pieces.push({ kind: 'right', x: x + width - edge, width: edge });
  return pieces;
}
