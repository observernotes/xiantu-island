# 炼器阁·主程序 状态（2026-10-17）

## 当前
v0.6.9 已发版；试玩 https://observernotes.github.io/xiantu-island/v0.6.9/（Pages HTTP 200）。
内容=强化正式结算（装备实例源）soft-open；--from tip@18a7a0c；master/tag^{}@0cd3fc9。
EnhanceOpenFlag 正式 true；ForgeOpenFlag true；released 本发已进包；执法销账可后置。

## 实现与验证
Forge 完整 committed→registerFormalEnhanceInstance→Gate 无夹具只认本档实例；欧冶匠同次入口。
护符 true 仍 enhance.formal.protect；附灵/分解仍 later_service；fixture≠正式。
soft-open 证据：formalTipsWired / formalInstanceSource / softOpenedEntrance / softOpenedFormalSettle。
dry-run 0 阻断 → 实发 EXIT 0；precheck/build/tag/push/gh-pages/包 全过。

## 交付与旁证
V069_RELEASE：reports/炼器阁/V069_RELEASE.md；包 releases/v0.6.9/（938 文件）+ SHA256 清单。
tag object `3bddc1c6…`；gh-pages `7d6a662`（880d7fd..7d6a662）；日志 qa/out/release_v0.6.9_*。
enhance `d5b91a06…` / recipes `1be644e365…` / 两 Flag 原字节；GAME_PHASE=5；gifts 仍关。

## 边界与下一棒
禁附灵/分解/阵法/gifts/#20/拍卖/坊市混窗；禁护符映射；禁再改两 Flag/enhance/recipes。
下一棒：执法销账/冒烟 → qa/out_v069_close/（或约定）；执法不打 tag/推 Pages。
经理：Pages 200 + V069_RELEASE 就绪后短报负责人转用户试玩链。
无发版阻断；本令仅授权 v0.6.9 一次。
