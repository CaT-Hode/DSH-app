<p align="center"><img src="desktop/DSH.svg" width="96" alt="DSH App 鲸鱼图标"></p>
<h1 align="center">DSH App</h1>
<p align="center">把 DeepSeek Harness 装进桌面窗口，继续使用同一份 Web 插件、配置与对话。</p>
<p align="center"><strong>简体中文</strong> · <a href="README.en.md">English</a> · <a href="https://github.com/CaT-Hode/DSH-app/releases">版本下载</a> · <a href="https://github.com/CaT-Hode/DSH-app/issues">反馈问题</a></p>
<p align="center">
  <img src="https://img.shields.io/badge/DSH-Plugin-4d6bfe" alt="DSH 插件">
  <img src="https://img.shields.io/badge/Windows-Electron-1673c9" alt="Windows Electron">
  <img src="https://img.shields.io/badge/Node.js-24%2B-339933" alt="Node.js 24+">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue" alt="MIT"></a>
</p>

DSH App 是面向 Windows 的社区插件。安装到现有 `web` profile 后，可以直接打开 Electron 窗口；托盘中的“在浏览器打开”连接同一个后端。已安装的插件、会话和设置继续使用。它不是 DeepSeek 官方客户端。

[功能](#功能) · [演示](#演示) · [安装](#安装) · [使用](#使用) · [更新与卸载](#更新与卸载) · [常见问题](#常见问题)

## 功能

| 日常操作 | DSH App 提供的体验 |
| --- | --- |
| 桌面与 Web 共用 | 同一后端、同一 `web` profile、同一份对话和插件 |
| 打开与关闭 | 原生窗口、鲸鱼托盘、单实例；关闭窗口驻留托盘 |
| 桌面顶栏 | 融合侧栏的标题栏，搜索、前进后退、快捷菜单和窗口控制 |
| 自有客户端布局 | 独立图标导航轨、项目与会话侧栏、全局内容搜索、圆角对话面板与输入框；桌面和 Web 使用同一界面 |
| 冷启动与故障 | 实时显示后端日志、耗时；前端加载失败时切回安全页，可重试、打开诊断，并按有效备份恢复 |
| 核心与插件更新 | 检测到 DSH 新版才显示更新按钮；安装、重启、配置备份与失败恢复 |
| 诊断与恢复 | 查看插件状态和启动失败日志，单独停用或重试；恢复插件更新或切回有备份的上一个 DSH 版本 |
| 模型来源 | 保留模型原始 ID，识别 ASS 提供商标记，记录观察到的配置变化 |
| 费用与余额 | 查询 DeepSeek 官方 API 账户余额，本地记录 Token、模型费用与预算，并保留旧 `dsh-cost-meter` 账本历史 |
| 上下文洞察 | 当前对话的上下文占用与组成、请求趋势、工具耗时、压缩与最近活动，整合在费用与用量中 |

插件提供自身的客户端布局、桌面窗口和维护功能，不依赖 Codex UI。项目、会话、归档、模型和发送控件继续使用 DSH 的官方服务与组件；插件市场、技能、MCP 等插件会出现在导航轨或“更多功能”菜单中。安装时只替换官方侧栏外壳，工作区、设置、对话与右栏插件继续按原插槽组合。

上方“更多功能”打开设置，黑白拼图图标打开 MCP。两页显示在会话侧栏右侧的主区域，保留导航和项目列表；设置继续使用官方设置栏目，MCP 继续使用连接器原有的服务配置、市场与更新功能。原生顶栏保留导航、快捷操作和窗口控件，使用当前主题背景。

设置内联呈现已验证 DSH `0.2.0-rc.2`，MCP 内联呈现已验证 `dsh-mcp-connector@0.2.63`；这两个呈现适配依赖对应组件的插槽与 React 元素结构，其他版本需要重新验证。

全文搜索在首次查询时按需建立本地内存索引，不请求外部服务，也不增加冷启动的索引加载工作；首次查询可能比之后的查询慢。profile 中的显式搜索配置仍优先于插件默认值。

## 演示

**桌面窗口与顶栏**

![DSH App 桌面与顶栏](https://raw.githubusercontent.com/CaT-Hode/DSH-app/media/v0.2.0/desktop.gif)

**诊断与功能检查**

![DSH App 诊断与功能检查](https://raw.githubusercontent.com/CaT-Hode/DSH-app/media/v0.2.0/diagnostics.gif)

演示使用独立配置下的真实 DSH `0.1.7-rc.2` 和原生 Web 界面，不包含个人会话。GIF 由同一次运行的操作关键帧组成，功能检查不发送模型消息；播放节奏用于展示操作，不代表性能测量。

## 安装

### 准备

- Windows，Node.js **24 或以上**，pnpm **11**。
- 已安装 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)，终端中可运行 `dsh`。
- DSH App **0.3.0** 的客户端接口基线是 DSH **0.2.0-rc.2**，包内版本声明会阻止在更旧核心上启用。Electron 使用 **44**；其他核心版本请先运行功能检查。

### 1. 添加插件

在 PowerShell 中执行：

```powershell
dsh plugin --profile web add 'git+https://github.com/CaT-Hode/DSH-app.git'
```

这是 GitHub 安装源；本项目目前没有 npm 发布包。也可将 Releases 中的 `.tgz` 文件路径传给同一条 `dsh plugin --profile web add` 命令。

### 2. 首次激活

```powershell
dsh --profile web --no-open
```

等待 Web 服务就绪。插件会记住当前 DSH 的启动入口；之后按 `Ctrl+C` 停止这次前台服务。

### 3. 打开客户端

```powershell
$dshHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $HOME '.dsh' }
& (Join-Path $dshHome 'profiles\web\node_modules\.bin\dsh-app.cmd')
```

以后使用第三步即可冷启动客户端。Electron 在独立窗口中运行，后端控制台隐藏；启动日志显示在窗口内。

<details>
<summary>交给本地 Agent 安装</summary>

```text
请按 https://github.com/CaT-Hode/DSH-app 的 README，将 DSH App 安装到我现有的 web profile，保留已有配置、模型和插件。先验证 dsh、Node.js 24+ 和 pnpm 11 可用，添加 GitHub 插件源，启动一次 Web 完成激活，再打开 dsh-app.cmd。不要覆盖其他插件或把它误当成 npm 上的 dsh-app 包。
```

</details>

## 使用

| 想做什么 | 操作入口 |
| --- | --- |
| 同时使用浏览器 | 托盘或顶栏菜单 → **在浏览器打开** |
| 查看诊断 | 顶栏 `…` 或鲸鱼托盘 → **诊断与恢复** |
| 启动或前端异常 | 安全启动页 → **重新启动 / 诊断与恢复**；存在有效备份时会显示插件或 DSH 恢复按钮 |
| 检查对话与模型操作 | 诊断与恢复 → **运行功能检查** |
| 停用故障插件 | 诊断与恢复 → 插件状态 → **暂时停用并重启** |
| 恢复该插件 | 同一页面 → **重新启用并重启** |
| 查看模型改动 | 诊断与恢复 → **模型来源 / 变更记录** |
| 查看费用与余额 | 侧栏底部 **费用与用量** 显示官方 API 余额、当月费用、Token 和预算；点击进入详情。同一 Web 服务也可打开 `/dsh-app/cost` |
| 查看当前对话上下文 | **费用与用量 → 上下文**；也可点击输入框下方的上下文摘要 |
| 刷新界面 | `Ctrl+R` |
| 隐藏窗口 / 完全退出 | 关闭窗口驻留托盘；托盘 → **退出 DSH App** 完全退出 |

浏览器登录同一后端后，可访问 `/dsh-app/diagnostics` 查看相同记录；重启和恢复从客户端发起。即使 DSH 前端无法加载，独立安全启动页仍可打开诊断窗口并执行有备份支持的恢复。客户端只停止自己启动的后端，连接外部 Web 服务时不会接管其退出。

费用统计首次读取时将旧 `dsh-cost-meter` 的每日、模型、会话汇总及价格和预算设置复制到独立账本；旧文件不修改。此后只处理新产生的模型用量，不在冷启动时扫描历史会话。金额是按已保存价格计算的估算值；没有价格的调用会计数并标为未计价。ASS 的提供商 ID 与厂商价格表独立，请在费用页的“模型价格”中填写该提供商和模型的实际美元价格，单位为百万 Token；新价格仅用于之后的调用，历史费用不重算。缓存读取和写入分别按配置费率计算，预算使用所选显示货币。确认历史记录后，可从插件市场卸载旧费用插件。

账户余额来自 [DeepSeek 官方 `user/balance` 接口](https://api-docs.deepseek.com/api/get-user-balance/)，显示接口的原币种、总余额、赠送余额和充值余额，独立于本地费用估算。服务器按 DeepSeek 官方 API Key 提供商的当前配置解析凭据；未启用官方提供商、未配置 Key、官方地址被替换为第三方地址或凭据引用与第三方提供商共用时，显示原因并停止查询。Key 不会发送给浏览器或写入余额缓存，ASS、MIFY 等第三方余额暂不查询。请求首次显示时发起，启动不等待网络；默认缓存 5 分钟、超时 5 秒、失败重试间隔 60 秒、手动刷新最短间隔 30 秒，可通过插件的 `balance.refreshMs`、`balance.timeoutMs`、`balance.retryMs`、`balance.minRefreshMs` 调整。失败时保留同一账户上次成功余额并标注时间和过期状态；更换 Key 后不会显示旧账户余额。

上下文页跟随当前选中的对话，显示 DSH 官方 Token 统计、上下文利用率与估算组成，以及请求输入/输出、耗时、工具失败、压缩、裁剪和注入活动。API 用量与字符估算分别标注，估算组成不用于计费。模块按需读取当前对话的日志投影并增量更新，不扫描全部历史会话，也不轮询；请求趋势和活动只保留最近的记录，调用总数仍累计。这里只整合主要上下文统计；文件浏览、团队功能和跨会话费用仍由各自模块提供。

## 更新与卸载

**更新 DSH App 插件**：先退出客户端，重新执行安装命令，再启动 Web 激活新版，随后启动客户端。插件市场收录后，也可使用市场的更新和重启流程。

**更新 DSH 核心**：有新版本时，点击顶栏更新按钮，选择“安装并重启”。升级前在临时目录检查模式、模型和对话操作，切换后检查实际界面响应；失败会尝试恢复旧核心与配置。此操作不更改全局 `dsh` 或源码仓库，也不回滚会话及插件数据迁移。

**卸载插件**：退出客户端后执行：

```powershell
dsh plugin --profile web remove dsh-app
```

重新启动 DSH Web 后恢复官方侧栏，已有对话和其他插件继续可用；卸载不删除会话或费用账本。

## 常见问题

<details>
<summary>找不到 Electron，或者首次启动失败？</summary>

Electron 是可选依赖。二进制下载可能需要联网；包管理器的安装策略或网络失败会使插件已安装、窗口却无法启动。可以把 `DSH_APP_ELECTRON` 设置为已有的兼容 `electron.exe` 路径后重试。找不到 DSH 启动入口时，先完成“首次激活”。

</details>

<details>
<summary>诊断里的“ASS 标识”能证明是谁修改了模型吗？</summary>

不能。它按提供商 ID 的命名约定识别 ASS 配置。变更记录只保存运行期间观察到的前后值，外部写入者标为未知；首次启动建立基线，不补造历史，也可能遗漏两次观察之间的中间修改。密钥不会写入模型审计记录。

</details>

<details>
<summary>功能检查会调用模型或修改我的对话吗？</summary>

检查使用临时 DSH 目录，新建空白对话、切换模式与模型，再执行归档；不发送模型消息，也不使用已有对话。它不验证额度或模型回答。插件仍会执行各自的正常启动逻辑。

</details>

<details>
<summary>可以配置路径、端口和记录数量吗？</summary>

| 配置 | 用途 |
| --- | --- |
| `DSH_HOME` | 使用已有的非默认 DSH 数据目录 |
| `DSH_APP_ELECTRON` | 指定 Electron 可执行文件 |
| `DSH_APP_NODE` / `DSH_APP_CLI` | 显式指定后端 Node 和 DSH CLI |
| `DSH_APP_PORT` | 指定本机端口；默认 `0`，由系统分配 |
| `DSH_APP_PNPM_CLI` | 指定核心更新使用的 pnpm 11 `pnpm.cjs` |
| Host `auditIntervalMs` | 模型配置观察间隔，默认 2000 ms，范围 500–60000 |
| Host `historyLimit` | 保留的模型变更条数，默认 200，范围 1–2000 |
| Host `contextInsight.historyLimit` / `contextInsight.activityLimit` | 当前对话保留的请求/活动条数，默认各 32，每项范围 2–1000 |
| Host `contextInsight.toolLimit` / `contextInsight.pendingLimit` | 保留的工具名称/待完成调用数，默认 16/128，每项范围 2–1000；超出工具名称上限的调用归入“其他工具” |

运行记录位于 `$DSH_HOME/dsh-app`：最近启动日志、配置备份、插件隔离记录和模型审计均保存在本地。本机仓库适配版使用 `desktop-link`。连接描述文件包含认证令牌，请勿贴到公开问题中。

</details>

## 生态与项目范围

DSH App 使用标准 `dsh.bundle.patch` 安装，面向 `web` profile。可通过 [GitHub 的 dsh-plugin 主题](https://github.com/topics/dsh-plugin) 发现社区插件；[awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) 是插件市场使用的社区目录。收录由该目录维护者审核。

仓库保留 `bin/` 启动入口、`desktop/` 桌面壳、`lib/` Host 与维护模块，以及必需的构建脚本。`npm run build` 生成客户端插件与 sandbox preload。仅保留费用与客户端职责的必要行为回归，快照和录制中间文件不随源码主分支发布。

开发验证见 [必要行为检查](tests/README.md)，包含费用、上下文与真实 DSH 客户端工厂的测试环境和运行方式。

MIT · 图标与参考项目归属见 [NOTICE.md](NOTICE.md)。
