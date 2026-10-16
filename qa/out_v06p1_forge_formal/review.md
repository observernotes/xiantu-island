# 正式配方接线独立复核

Review PASS；复核 design/25 §3/4/5、design/24 关态与原子性及最终源码差异。

- 生产默认仅解析正式 type===forge，完整校验 id/name/blueprint/materials/output/outputCount、配置引用及唯一 id。
- 显式 fixtureRecipes 独占授权集；空集或无匹配均不补正式配方，生产正式空集也不回退夹具。
- outputCount 贯穿容量检查、入库增量、结果、重放和历史袋验证；局部注入数量 3 有运行断言，磁盘表仍为 1。
- 八 API 首句关态返回原八 tip；laterService 继续拒绝；品质仅抽 enhance.forge.grade；不写 forging 经验等级。
- 未改 Flag/GameScene/features/data/Market* 和禁改配表；旧 QA 输出原字节保留。

最终运行结果以 selfcheck.json 与各专项日志为准。PASS≠release≠发版；不进包。
