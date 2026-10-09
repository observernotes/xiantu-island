// 手感参数（单位：像素 / 秒）。测试调手感只改这里。
// 参考冒险岛的体感：起步几乎立刻到速、空中只能微调方向、跳跃高度约 2.5 个地块。
export const FEEL = {
  tile: 32,
  gravity: 2000,
  maxFallSpeed: 670,

  walkSpeed: 160,
  groundAccel: 2400,     // 越大起步越干脆
  groundDecel: 3000,     // 松手后的刹车，越大越不滑
  airAccel: 300,         // 空中转向能力，冒险岛很弱
  airMaxSpeed: 160,

  jumpSpeed: 600,        // 起跳初速，约 90px 高
  coyoteMs: 60,          // 离开平台后仍可起跳的宽限
  jumpBufferMs: 80,      // 落地前提前按跳的缓冲

  doubleJumpVy: 480,     // 二段跳纵向速度
  doubleJumpVx: 330,     // 二段跳向前冲刺（类似冒险岛的“二段跳/轻功”）

  climbSpeed: 110,
  ropeGrabRangeX: 14,    // 离绳子中线多近按↑可以抓住
  ropeJumpVx: 160,       // 绳上左/右 + 跳 跳离
  ropeJumpVy: 360,

  dropThroughMs: 220,    // ↓+跳 穿过单向平台的时长

  attackCooldownMs: 450,
  attackActiveMs: 120,
  attackRange: 64,
  attackHeight: 48,
  attackDamage: [18, 26] as [number, number],
  attackLocksGroundMove: true, // 地面普攻时站定（冒险岛的感觉）

  hurtKnockVx: 180,
  hurtKnockVy: 300,
  hurtInvulnMs: 1200,
};

// 素材规格（见美术风格指南第四节）
export const SPEC = {
  charCanvas: 96,        // 角色画布 96×96，锚点脚底中心
  bodyW: 26,
  bodyH: 58,
  oneWayEdge: 8,         // 单向平台碰撞边：顶部 8px
};
