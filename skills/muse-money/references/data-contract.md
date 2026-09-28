# 订阅审计输入

运行 `node <本技能目录>/scripts/audit-subscriptions.mjs input.json output.json`。

`subscriptions` 是已经核实/规范化的当前订阅条目，不是原始银行流水。模型先根据收据识别周期与当前状态，不确定则用 unknown；脚本只计算，不会猜测续费状态。

```json
{"subscriptions":[{"id":"music-001","name":"Music","currency":"CNY","amount_cents":18000,"interval":"annual","status":"active"}]}
```

- `amount_cents`：非负整数、百分之一货币单位。支持 CNY、USD、EUR、GBP、AUD、CAD、HKD、SGD、CHF、NZD、INR、BRL；其他货币拒绝计算，需另行处理单位，不能直接套用。
- `interval`：monthly / annual / usage / one_time。
- `status`：active / cancelled / unknown。
- 同一 ID 相同记录去重，冲突记录报错；不同 ID 不自动认定为重复。
- 只计 active 且固定周期的年成本，按币种分别汇总后除以 12 四舍五入。不是现金流，也不是已实现节省。
