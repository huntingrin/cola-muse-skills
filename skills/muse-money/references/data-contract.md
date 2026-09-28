# 订阅审计 v2：先记录证据，再计算

运行：

```sh
node <技能目录>/scripts/audit-subscriptions.mjs input.json audit-result.json report.md
```

JSON 与 Markdown 来自同一计算结果；聊天摘要引用结果，不另写一套金额、日期或“上限”。脚本不会连接邮箱、验证证据真伪、取消订阅或退款。只有实际读过的内容才能写成证据。

## 最小完整输入

下例是虚构的账户页与收据。

```json
{
  "schema_version": 2,
  "as_of": "2026-09-28T12:00:00+08:00",
  "max_status_age_days": 30,
  "coverage": {
    "start": "2025-08-28",
    "end_exclusive": "2026-09-29",
    "sources": [{"id": "demo", "kind": "file", "complete": true}],
    "limitations": []
  },
  "subscriptions": [{
    "id": "demo-monthly",
    "name": "演示月刊",
    "currency": "CNY",
    "amount_cents": 2000,
    "amount_basis": "gross",
    "tax_cents": null,
    "interval": "monthly",
    "rate_evidence": {"observed_at": "2026-09-28T12:00:00+08:00", "ref": "demo-account/current-rate"},
    "access_until": "2026-11-01",
    "last_payment": {"date": "2026-09-01", "amount_cents": 2000, "amount_basis": "gross", "tax_cents": null, "ref": "demo-receipt-01"},
    "next_charge": {"date": "2026-10-01", "amount_cents": 2800, "amount_basis": "gross", "tax_cents": null, "observed_at": "2026-09-28T12:00:00+08:00", "ref": "demo-account/next-charge"},
    "source_ids": ["demo"],
    "renewal_observations": [{"status": "enabled", "source": "account", "observed_at": "2026-09-28T12:00:00+08:00", "ref": "demo-account/auto-renew"}],
    "review_notes": []
  }]
}
```

## 字段与证据

- `as_of`、`observed_at`：带秒和时区的真实核对时刻，不能把旧邮件日期改成今天来制造新证据。读历史收据发生在今天，也不等于今天核实了账户状态或当前费率。
- `id`：稳定订阅 ID。相同 ID 的完全相同记录去重，任意字段冲突则报错。不同 ID 不自动合并。相似名称、相同金额/日期不证明重复订阅。
- `currency`：CNY、USD、EUR、GBP、AUD、CAD、HKD、SGD、CHF、NZD、INR、BRL 或 `null`。其他币种需保留原始记录并列为未计算，不冒用小数单位。
- `amount_cents`：当前费率，以百分之一货币单位表示的非负整数；未知为 `null`。历史付款单独存 `last_payment`，不能冒充当前报价。
- `amount_basis`：`gross` 已含税、`net` 税前、`unknown` 未知。仅 `net` 可设置 `tax_cents`；免税也需要依据，明确为 0，不能默认为 0。其他情况下 `tax_cents` 必须为 `null`。税前金额税额未知时不混入含税总额。
- `interval`：`monthly / annual / usage / one_time / unknown`。周期未知就保留 `unknown`，禁止 monthly 占位，禁止据此算年费或所谓上限。
- `rate_evidence`：当前费率的核实时间与证据引用，或 `null`。不确定当前费率就不进入确认总额；已知历史金额仍可保留在 `last_payment`。
- `access_until`：已付权益结束日，**不含该日**，或 `null`。来源只写模糊的“有效至某日”时先核对该日是否仍可使用，不擅自挪一天。权益仍有效不代表续费开启。
- `last_payment`：最近一笔已确认付款的日期、金额、税费口径和引用，或 `null`。它不参与当前续费费率计算。
- `next_charge`：实际页面/通知给出的下一笔扣款日期、独立金额/税费口径、核实时间和引用，或 `null`。不能把旧价格直接复制为下一期价格，不能把过去的日期自动加一年。它与当前费率分开，不必相同。
- `source_ids`：来源 ID，必须存在于 coverage。证据 `ref` 应指向本地证据索引中的邮件（账号别名 + 文件夹 + Message-ID）、附件页码或已保存的账户页面状态；不要将凭证或带 token 的 URL 放入引用。
- `review_notes`：尚未解决的冲突/重复/金额问题；有内容时该项不进入确认汇总或扣款安排。完整说明保存于证据索引。

### 自动续费状态

`renewal_observations` 是证据历史，可以为空。每条记录：

- `status`：`enabled / disabled / unknown`。
- `source`：`account / cancellation_confirmation / renewal_notice / receipt`。
- `observed_at`、`ref`：核对时间与凭据。

脚本取最新观测；同一时刻冲突、过期观测、缺证据均为 unknown。只有账户状态或明确取消确认可证明开启/关闭；收据和续费提醒仅是线索，不足以证明当前设置。取消确认只能是 disabled。默认状态、当前费率和下一期安排的证据有效期 30 天，可按任务调整 `max_status_age_days`（1–365）；这是本次审计的检查窗口，不是服务商保证。

没有新收据、促活邮件、扣款失败、到期提醒，都不能直接推出 disabled。若仅有收据，正常结果可能是“有历史付款、当前续费待核实”，不能为了得出非零总额而伪造账户观测。

## 邮件覆盖范围

时间窗使用开始日包含、结束日排除；检索、筛选和报告用同一口径。`file` / `account` 源的 `complete` 指声明的文件/页面已完整读取，不代表其他账户已覆盖。邮箱源应使用实际检索日志：

```json
{
  "id": "test-inbox",
  "kind": "mailbox",
  "queries": [{
    "id": "receipt-query",
    "start": "2025-08-28",
    "end_exclusive": "2026-09-29",
    "pages": [{"count": 500, "limit": 500}, {"count": 12, "limit": 500}],
    "exhausted": true,
    "errors": []
  }]
}
```

最后一页仍等于上限时继续翻页，必要时读取空页。仅凭返回 500 条不能写 exhausted。尚有错误、未完成分页、时间窗不一致、已知来源缺口时结果为 `partial`。`complete_for_declared_sources` 仅说明所声明查询/来源完成，不保证关键词召回率；未知商户、关键词替代等漏检风险必须写入 `coverage.limitations`。`needs_review` 是条目问题，覆盖范围问题另见 `coverage.issues/limitations`。

## 输出口径

- `by_currency`：已核实自动续费开启、当前含税费率与周期明确、无未决冲突的条目，按币种年化再除以 12。不是历史现金流、未来一年扣款预测或已实现节省。
- `upcoming_charges`：在审计时区的今天起 30 个日历日，含今天、不含第 30 天边界；只列有有效续费与下一笔报价证据的安排。未知金额可列为待核实，不伪造金额。
- `items`：保留原始已知值，另列实际采用的续费状态、权益状态、是否计入及待核实原因。
- `needs_review`：不确定条目的 ID；不能把“未计入”读成“不会扣费”。报告中的空总额也不等于支出为零。

## 取消后的闭环

只有真正完成远程取消、重新加载账户页或取得明确回执后才记录。记录脚本不会替用户执行取消：

```json
{
  "subscription_id": "demo-monthly",
  "status": "disabled",
  "source": "account",
  "observed_at": "2026-09-28T13:00:00+08:00",
  "ref": "demo-account/reloaded-cancel-confirmation",
  "access_until": "2026-11-01"
}
```

```sh
node <技能目录>/scripts/record-cancellation.mjs subscriptions.json proof.json NEW_OUTPUT_DIRECTORY
```

它保留原快照，新目录同时生成 `subscriptions.json`、`audit-result.json`、`report.md`，追加关闭续费的证据、清空下一笔扣款安排，保留历史付款与已付权益。目标目录已存在时拒绝覆盖；相同证据重复记录不叠加。后续查询使用新快照，历史快照不再冒充当前状态。只点击按钮、没读回状态或提交退款申请均不能作为取消证明。

## 从 v1 迁移

v2 拒绝没有 `schema_version: 2` 的输入和旧 `status` 字段。保留 v1 文件作为历史，不直接将 active 映射为 enabled：

1. 旧金额有付款证据就放入 `last_payment`；当前费率、周期、税费和证据未知的保持 null/unknown。
2. 从真正保留的账户或取消证据构造 renewal_observations；没有就留空。
3. 根据真实检索记录填写 coverage；无法补齐时注明缺口，不重写成全覆盖。
4. 用新脚本生成新文件。它可能比旧版少计入项目，这是证据口径改变，不能解释成已经省钱。
