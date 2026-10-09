import { FEEL } from './config/feel';

/**
 * 速度 / 跳跃点数换成像素速度。
 * 点数基础是 100（player_growth.base.speed / jump）。装备和轻身术都先加在点数上，再进这个函数。
 * - 地面走速 = FEEL.walkSpeed × speed / 100
 * - 空中最大速度 = FEEL.airMaxSpeed × speed / 100
 * - 起跳初速 = FEEL.jumpSpeed × jump / 100
 * 二段跳 FEEL.doubleJumpVy / doubleJumpVx 不在这里，调用处保持原值。
 */
export function pixelsFromMovePoints(speed: number, jump: number) {
  return {
    walkSpeed: FEEL.walkSpeed * speed / 100,
    airMaxSpeed: FEEL.airMaxSpeed * speed / 100,
    jumpSpeed: FEEL.jumpSpeed * jump / 100,
  };
}
