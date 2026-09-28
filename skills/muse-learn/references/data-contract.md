# 有时间预算的计划输入

运行 `node <本技能目录>/scripts/plan.mjs input.json output.json`。

```json
{"start_date":"2026-10-01","days":3,"daily_minutes":30,"tasks":[{"id":"outline","title":"列提纲","minutes":45},{"id":"review","title":"检查提纲","minutes":15,"depends_on":["outline"]}]}
```

任务必须先由模型根据用户目标设计并估时。脚本按依赖排序，再顺序分配每日分钟，允许把任务拆到多天；依赖可在同一天较早完成。它不自动生成领域课程、不添加周末规则、不连接提醒。超容量、依赖环和未知依赖直接报错，不静默删任务。输出空日期表示缓冲/休息，由模型解释。
