# 订阅审计

核对截至：2026-09-28T12:00:00+08:00。状态证据有效窗口：30 天。

覆盖已声明的数据源；不代表所有邮箱、银行卡和支付渠道。
检索时间窗：2025-08-28 至 2026-09-29（不含结束日）。

## 已核实自动续费的当前含税费率

按当前费率折算；不是实际年度支出、未来扣款承诺或已经省下的钱。

| 币种 | 当前费率年化 | 折算每月 |
| --- | --- | --- |
| CNY | CNY 240.00 | CNY 20.00 |
| USD | USD 218.00 | USD 18.17 |

## 逐项状态

| 项目 | 自动续费 | 权益 | 资料含税金额 / 周期 | 计入汇总 | 待核实 |
| --- | --- | --- | --- | --- | --- |
| Demo monthly | 已核实开启 | 已付权益仍有效，至 2026-11-01（不含当日） | CNY 20.00 / 月付 | 是 | 无 |
| Demo annual-tax | 已核实开启 | 已付权益仍有效，至 2026-11-01（不含当日） | USD 218.00 / 年付 | 是 | 无 |
| Demo period-unknown | 已核实开启 | 已付权益仍有效，至 2026-11-01（不含当日） | USD 40.50 / 周期未知 | 否 | 计费周期未知 |
| Demo price-unknown | 已核实开启 | 已付权益仍有效，至 2026-11-01（不含当日） | 待核实 / 月付 | 否 | 含税金额未知；当前费率尚未核实 |
| Demo receipt-only | 待核实 | 已付权益仍有效，至 2026-11-01（不含当日） | CNY 10.00 / 月付 | 否 | 仅有邮件线索，未核对账户；当前费率尚未核实 |
| Demo already-disabled | 已核实关闭 | 已付权益仍有效，至 2026-11-01（不含当日） | CNY 90.00 / 年付 | 否 | 无 |

## 未来 30 个日历日的已知扣款安排

2026-09-28 至 2026-10-28（不含结束日）。金额采用独立的下一期报价，不能从旧收据直接推算。

| 项目 | 日期 | 下一期含税金额 | 证据 |
| --- | --- | --- | --- |
| Demo monthly | 2026-10-17 | CNY 28.00 | fixture/monthly/new-price |

## 证据与缺口

- Demo monthly：来源 synthetic-file；状态证据时间 2026-09-28T12:00:00+08:00；凭据 fixture/monthly/account。
  费率证据 fixture/monthly/rate；核实 2026-09-28T12:00:00+08:00。
  历史付款 2026-09-01：CNY 20.00；凭据 fixture/monthly/receipt。历史付款不证明当前续费。
- Demo annual-tax：来源 synthetic-file；状态证据时间 2026-09-28T12:00:00+08:00；凭据 fixture/annual-tax/account。
  费率证据 fixture/annual-tax/rate；核实 2026-09-28T12:00:00+08:00。
- Demo period-unknown：来源 synthetic-file；状态证据时间 2026-09-28T12:00:00+08:00；凭据 fixture/period-unknown/account。
  费率证据 fixture/period-unknown/rate；核实 2026-09-28T12:00:00+08:00。
- Demo price-unknown：来源 synthetic-file；状态证据时间 2026-09-28T12:00:00+08:00；凭据 fixture/price-unknown/account。
- Demo receipt-only：来源 synthetic-file；状态证据时间 2026-09-28T12:00:00+08:00；凭据 fixture/old-receipt。
  历史付款 2026-09-01：CNY 10.00；凭据 fixture/receipt-only/receipt。历史付款不证明当前续费。
- Demo already-disabled：来源 synthetic-file；状态证据时间 2026-09-28T12:00:00+08:00；凭据 fixture/cancelled。
  费率证据 fixture/already-disabled/rate；核实 2026-09-28T12:00:00+08:00。
  历史付款 2026-09-01：CNY 90.00；凭据 fixture/already-disabled/receipt。历史付款不证明当前续费。
