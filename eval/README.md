# 如何验证，不把“能说”当作“能做”

## 四种证据分别报告

1. **结构验证**：技能可解析、相对路径有效、校验和一致、来源 ID 有映射。
2. **确定性工具测试**：安装、回滚、计算、日历与计划满足已知答案。
3. **Cola 离线代理实测**：真实 Cola 模型读取技能、运行工具、交付合成资料产物，独立检查器验证结果。
4. **真实业务实测**：在明确账号、地区和动作授权下完成真实任务，并由服务端状态/回执核验。

前三类不能替代第四类；资料分析通过也不能推出真实邮箱登录、支付或电话通过。原书案例可能有外部不可控结果，分别记录流程完成与业务结果。

## 本地不收费的检查

```sh
node scripts/validate.mjs
node --test tests/installer.test.mjs tests/workflows.test.mjs
```

CI 在 macOS、Windows、Linux 的 Node 20/22 上执行这些检查。CI 不运行付费模型，也不使用用户账号。平台通过情况以具体 Actions 运行结果为准。

## Cola 实际调用测试（开发者）

需要 Cola 源码和已配置的独立运行时。`run-cola.mjs` **只连接预先准备好的测试运行时**，不会自动登录、复制用户凭证或启动浏览器。

准备工作：

1. 选择独立 `COLA_DATA_DIR` 与 `COLA_OUTPUT_DIR`，不能使用当前日常会话的数据目录；通过 Cola 官方登录/开发测试流程准备模型连接。模型调用会消耗额度。
2. 将技能包安装到该独立数据目录。对基于当前源码的 macOS 文件沙箱测试，把安装后的 `skills` 移入输出目录，再让测试数据目录的 `skills` 链接到该目录；这样 Cola 的技能发现与文件访问限制指向同一批文件。不要对日常目录做此操作。
3. 把 `eval/fixtures` 复制到输出目录的 `fixtures`。提供沙箱内可以运行的 Node 可执行文件；若使用 macOS Prism 文件沙箱，外部 Homebrew 路径不在其允许范围，必须使用位于测试输出目录内的可执行文件。
4. 运行时设置 `COLA_TOOL_ROOT_DIR=<output>`、`COLA_ALLOW_OUTPUT_DIR_OVERRIDE=1`、`COLA_DISABLE_CHANNELS=1`、`COLA_DISABLE_MEMORY_CRON=1`、`COLA_DISABLE_USER_CRONS=1`，浏览器设为 disabled，使用独立端口。按对应源码版本确认这些开关仍然有效；本项目核对版本为 `dba7742e2`。该路径目前依赖 macOS `sandbox-exec`，不把它声称为跨平台代理测试。
5. 检查实际环境后，在测试数据目录创建 `.muse-offline-eval.json`，内容为下例。这个文件是操作确认标记，不是自动证明隔离生效的安全机制。

```json
{
  "output_dir": "/absolute/path/to/test-output",
  "browser_disabled": true,
  "channels_disabled": true,
  "crons_disabled": true
}
```

运行命令示例（替换为你实际的路径和端口）：

```sh
node eval/run-cola.mjs \
  --source /path/to/cola-source \
  --data-dir /path/to/test-data \
  --output-dir /path/to/test-output \
  --server 127.0.0.1:20681 \
  --node-bin /path/to/test-output/bin/node
```

可加 `--case money`、`--case calendar` 或 `--case plan` 单独运行。相同输出已经存在会拒绝，避免把上一次产物误判成新通过。重跑使用新的工作目录或先归档原产物。

检查器读取实际输出并要求工具轨迹中同时出现技能读取与脚本执行。原始对话仅保存在测试输出的 `traces` 内，不自动提交 GitHub；对话可能包含环境信息，发布前审查。公共结果只保存合成产物、哈希、测试元信息和明确的范围。

文件沙箱限制的是文件工具与 bash 路径；不要把它误称为完全隔离整个 Cola 进程。模型请求仍然联网，源运行时也可能执行自己的官方服务探测。禁用开关与原始轨迹要一起检查。

## 继续测试其他技能

每条测试卡写明：用户目标、前置条件、输入、允许的动作、独立验收证据、费用上限/重试期限。一次只扩大一个真实集成范围。

- 邮件：专用测试邮箱，已知邮件样本，分页与附件检查；发送只到受控测试收件人。
- 日历：专用测试日历，创建、改期、取消和重复运行后读回实际事件。
- 浏览器：本项目维护者要求后台 Ego 时，使用专属 TaskSpace，遵循接管与结束规则；现有 Cola browser/CDP harness 不自动成为例外。
- 退款/购物：先受控商家沙箱，再在具体授权下做真实业务；提交、批准、到账分开。
- 电话：先真实外呼服务的受控测试号码；没有接入就标记阻塞，不能以配音文件代替。
- 定时：至少两个触发周期，加一次重启或休眠恢复；不创建自动资金动作。
- 媒体：打开实际成品，核对音画、尺寸、时长与用户要求。

状态建议使用 `not_run`、`offline_agent_pass`、`sandbox_pass`、`live_pass`、`partial`、`blocked`、`policy_boundary`、`fail`。`live_pass` 必须有独立真实业务证据。

## 1081 条映射的维护

`catalog/muse-coverage.json` 保存原文标题、页码与候选技能。关键词映射需要人工复核，分类并非完整能力实现证明。来源文件不随项目分发；维护者可用自行持有的提取结果重新生成：

```sh
node scripts/import-cases.mjs /path/to/muse-cases.json
```

不要直接把重复用例当作独立成功次数。离线子任务的结果单独记录，完整原始案例状态保留 `not_run`，直到真正验收原目标。
