# 本窗回归旁证

21 个既有专项均在本窗实际执行，命令、时间、stdin=/dev/null、退出码与日志路径分别见同名 `.result.json`。最终全部 exit 0，已记录至少 182708 条断言；`regression-summary.json` 与 `count-policy.json` 给出统计范围。v06b 两套分别按两根组件打印计数相加为 744 / 816，外层静态 assert 调用不计入，未合成额外计数。

既有脚本的历史 strings SHA/键数、源码清单、入口文本证明通过本窗 pinned Node loader 精确适配；原脚本磁盘不写。`pinned-inputs.json`、`loader-provenance.json`、`adaptations/` 保留原 SHA、origin/dev 基线 7b06f5a 的当前精确 pin、替换次数与内容。当前 GameScene 和 forge smoke 测试文本只在旧静态字节证明中恢复历史文本，产品 SSR 业务运行使用当前磁盘模块，Gate 结算断言不改。

`../strings-append-proof.json` 为只读借用的旧关态历史 append 证明，其来源和 SHA 单列于 `../audit/borrowed-historical-proof.json`；本窗实际双根 strings SHA 与 1013 键数由 `../protection-check.json` 独立复核。旧 QA/out、art pending、dist-test 与共享合并关态 out 的文件集合和 SHA 由写前清单保护。活动运行器对本窗既存 `codex_launch.log` 的追加按原前缀 SHA MATCH 单列；既存 codex 两文件不纳入提交。

早期静态兼容适配失败和首次 tsc 类型错误保存在各 `attempts/`，canonical 同名 log/result 均为最终通过运行。回归输出全部重定向本窗，无旧 out 写入。

复核保护：`node scripts/v06p1-smith-services-open-regression.mjs protection < /dev/null`。
复核 audit：`node scripts/v06p1-smith-services-open-regression.mjs audit < /dev/null`。
复跑全部回归：先 `node scripts/v06p1-smith-services-open-regression.mjs prepare < /dev/null`，再 `node scripts/v06p1-smith-services-open-regression.mjs regressions < /dev/null`。prepare 不覆写写前保护快照。

本窗开态夹具全表不代替 soft-open、release 或进包授权。
