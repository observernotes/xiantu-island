# Y10 太虚交付存档故障复验

结果：PASS。以只读原用例 `/workspace/xiantu/qa/out_trial5_edaa7d6/storage-delivery.mjs` 为基准适配；前置使用 `before_five_sect_trials` fixture，交付、刷新后重谈与补领均使用真实 Z 输入，没有直接调用 turnIn 或发奖。故障仅拦截 `xiantu_save_v1` 的写入。故障期间及首次刷新前仅用 `prog.exportSave()` 和 `localStorage.getItem()` 采样，未调用会写盘的 `__xt.exportSave()`。

本轮 preview 明确设置 `root=/workspace/xiantu/wt/dev`、`configFile=false`、`build.outDir=dist`、端口 4698，服务本树 `XT_DATA=snapshot npm run build:test` 的产物；数据根目录为本树 `data/`。源码及产物散列见 [build-source.json](build-source.json)。其中 revision 是构建时工作树的基准提交，修复源码在提交前构建，其散列记录了实际验收版本。

| 路径 | 故障期成功/失败写盘 | 首次刷新后 | 恢复存储后重谈及再次刷新 |
| --- | --- | --- | --- |
| 正常交付 | 2 / 0 | done、taixu_acolyte、710 灵石、Lv12 / exp273 | 数值稳定，不能重复领奖 |
| 第 1 笔成功，第 2 笔起失败 | 1 / 1 | done、taixu_acolyte、710 灵石、Lv12 / exp273 | 数值稳定，不能重复领奖 |
| 所有写盘失败 | 0 / 2 | active、未入宗、560 灵石、Lv11 / exp342 | 可补领一次；done、taixu_acolyte、710 灵石、Lv12 / exp273 |

第 1 笔成功的路径中，首笔即包含完成状态、职业、150 灵石、300 修为及职业技能/赠点/道袍，第二笔是对白收尾保存。全失败路径断言内存所有采样奖励字段回到交付前，磁盘保持交付前状态；刷新后仍可交付，补领后再次刷新、再次重谈均不增奖。浏览器 console.error、pageerror、HTTP 错误均为 0。

执行命令与结果：

```text
node --check qa/out_trial5_y10/storage-delivery.mjs     # PASS
XT_DATA=snapshot node qa/out_trial5_y10/storage-delivery.mjs  # exit 0
```

证据：[正常交付](normal-once.json)、[首写成功故障](first-write-success.json)、[全失败与补领](all-writes-fail-retry.json)、[结构化汇总](results.json)、[简短日志](storage-delivery.log)。未运行完整 tier1。
