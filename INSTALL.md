# 安装、检查、更新和卸载

这是给 Cola 执行安装时读取的操作说明。普通用户从 [README](README.md) 复制安装话术即可。

## 获取项目

1. 仅从 `https://github.com/huntingrin/cola-muse-skills/releases/latest` 获取 `cola-muse-skills.zip` 与 `SHA256SUMS`。校验下载的 ZIP 的 SHA-256 与校验文件一致，再解压到独立目录。校验用于检测传输损坏，不代替对发布者的信任。
2. 若用户明确要求开发版，可下载 GitHub `main` 分支 ZIP 或 clone 仓库，说明开发版与正式版的区别。不要覆盖用户已有项目目录。
3. 读取本文件与 `install.mjs`；使用当前 Cola 命令环境中的 Node.js 18+。没有 Node 时先说明缺失，按官方 Node 安装流程准备，不下载未知运行时。无需 `npm install`。

## 确认安装位置

- 优先使用当前 Cola 进程提供的 `COLA_DATA_DIR`。
- 未提供时，安装器检查用户主目录的 `.cola`（国际版）与 `.cola-cn`（中国版）。仅发现一个时使用该目录。
- 同时存在两个时，确认当前使用哪一个；通过 `--data-dir` 显式指定。
- 都不存在时，请用户先打开 Cola，或提供真实自定义目录；不要猜测并宣称安装成功。
- 不向 `resources/skills` 写入，不修改 `skills.json`、系统提示词或其他插件。

## 安装

在解压后的项目目录执行（路径有空格时使用对应 shell 的正确引用方式）：

```sh
node install.mjs install --dry-run
node install.mjs install
node install.mjs doctor
```

自定义目录时，每条命令都带同一个参数：

```sh
node install.mjs install --data-dir "/path/to/cola-data"
node install.mjs doctor --data-dir "/path/to/cola-data"
```

安装器核对 `manifest.json` 中所有技能文件的 SHA-256，复制到 `<data-dir>/skills/muse-*`，每个技能保存自己的安装记录。不会连接账号、开通收费服务、改动现有非本项目技能、创建定时任务或自动启用被用户禁用的技能。

成功应看到安装结果 `count: 25`，doctor 中 25 项为 `installed`。`account_connections: not_checked` 是正常值：这是文件安装检查，不代表邮箱、电话等已连接。通过后请用户发下一条任务；若 Cola 未刷新，请重开 App。最后用一个无需账号的示例核实实际调用。

## 更新

重新下载正式版本，再运行相同的 `install` 和 `doctor`。安装器仅替换带本项目安装记录且没有本地修改的技能。发现冲突时整批停止，不静默覆盖；请先备份用户修改，再讨论如何合并。没有 `--force`。

## 卸载

在保留的安装包或重新下载的对应版本中执行：

```sh
node install.mjs uninstall --dry-run
node install.mjs uninstall
```

自定义目录仍需 `--data-dir`。只移除包清单中、由本项目安装且未改动的技能；不会删任务产物、已创建的定时任务或其他账号授权。多个版本有技能改名/删除时，使用旧版本包卸载旧技能；当前 0.1.0 没有迁移历史。

## 安装异常

- 源文件校验失败：重新下载同一版本，不跳过校验。
- 同名目录非本项目安装：保留原目录，先展示冲突；不要自动删除。
- 技能有本地修改：保留修改，备份后合并；不要擅自卸载。
- 安装锁存在：先确认是否另一安装正在运行；只有确认原进程已经退出，才清理 `<data-dir>/skills/.cola-muse-install.lock` 后重试。
- 安装过程中进程被系统强制终止：保留 `.cola-muse-stage-*` 中的 `old` 备份，先核对目录状态再恢复。普通异常会自动回滚，断电不承诺跨文件原子恢复。
- Node 不存在：让 Cola 检查它的命令环境；普通用户不必盲目尝试终端命令。
