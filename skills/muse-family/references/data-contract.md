# 日历导出输入

运行 `node <本技能目录>/scripts/calendar.mjs input.json output.ics`。

```json
{"namespace":"family-school","exported_at":"2026-09-28T09:00:00+08:00","events":[{"id":"rehearsal-001","summary":"排练","start":"2026-10-01T17:00:00+08:00","end":"2026-10-01T18:00:00+08:00","location":"学校","sequence":0}]}
```

输入事件先从 PDF/邮件核对，工具不负责 OCR。带时刻的日期必须包含时区偏移；输出 UTC 时间。全天活动用 `all_day:true` 和 YYYY-MM-DD，结束日期为不包含的下一天。重复规则先展开为具体场次。修改保持 namespace 与 id，增加 sequence；取消使用 `status:"cancelled"`。同一 ID 的冲突版本需先人工确定最新版本。

生成 ICS 不会导入日历。不同客户端对取消/更新的导入处理不同；在线同步须读回实际状态，不能只依赖 UID。
