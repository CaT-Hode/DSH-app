<p align="center"><img src="desktop/DSH.svg" width="96" alt="DSH App 鲸鱼图标"></p>
<h1 align="center">DSH App</h1>
<p align="center">Codex 风格的 DSH 工作台：桌面与 Web 共用，文件、Git、技能、MCP 和费用管理集中在一个客户端。</p>
<p align="center"><strong>简体中文</strong> · <a href="README.en.md">English</a> · <a href="https://github.com/CaT-Hode/DSH-app/releases">版本下载</a> · <a href="https://github.com/CaT-Hode/DSH-app/issues">反馈问题</a></p>
<p align="center">
  <img src="https://img.shields.io/badge/DSH-Plugin-4d6bfe" alt="DSH 插件">
  <img src="https://img.shields.io/badge/Windows-Electron-1673c9" alt="Windows Electron">
  <img src="https://img.shields.io/badge/Node.js-24%2B-339933" alt="Node.js 24+">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue" alt="MIT"></a>
</p>

DSH App 是面向 Windows 的社区插件，提供自有客户端布局和 Electron 桌面壳。安装到现有 `web` profile 后，桌面和浏览器连接同一个后端，继续使用已有对话、模型和兼容插件。本项目不是 DeepSeek 官方客户端，也不依赖 Codex UI 插件。

[功能](#功能) · [内化与冲突插件](#内化与冲突插件) · [演示](#演示) · [安装](#安装) · [使用](#使用) · [更新与卸载](#更新与卸载) · [常见问题](#常见问题)

## 功能

- **统一工作台**：导航轨、项目与会话侧栏、融合顶栏、主区域设置、深浅模式和统一字体；桌面与 Web 使用同一布局。
- **文件与 Git 内置**：完整接管 Better Sidebar 的工作台引擎，保留编辑器、预览、差异、任务、侧边对话和扩展贡献接口。
- **一个插件中心**：浏览页合并市场与已安装管理，技能和 MCP 作为一级子页；安装、更新和卸载通过可取消待办及重启流程执行。
- **余额与用量合并**：侧栏显示 DeepSeek 官方 API 余额，详情统一展示费用、Token、预算和当前对话上下文，并保留历史账本。
- **启动与恢复可见**：窗口内显示后端启动日志，前端异常时提供独立诊断页、重试与有效备份支持的恢复入口。

| 日常操作 | DSH App 提供的体验 |
| --- | --- |
| 桌面与 Web 共用 | 同一后端、同一 `web` profile、同一份对话和插件 |
| 打开与关闭 | 原生窗口、鲸鱼托盘、单实例；关闭窗口驻留托盘 |
| 桌面顶栏 | 融合侧栏的标题栏，搜索、前进后退、快捷菜单和窗口控制 |
| 自有客户端布局 | 独立图标导航轨、项目与会话侧栏、全局内容搜索、圆角对话面板与输入框；桌面和 Web 使用同一界面 |
| 冷启动与故障 | 跟随已保存的深浅外观设置，实时显示后端日志、耗时；前端加载失败时切回安全页，可重试、打开诊断，并按有效备份恢复 |
| 核心与插件更新 | 检测到 DSH 新版才显示更新按钮；安装、重启、配置备份与失败恢复 |
| 诊断与恢复 | 查看插件状态和启动失败日志，单独停用或重试；恢复插件更新或切回有备份的上一个 DSH 版本 |
| 模型来源 | 保留模型原始 ID，识别 ASS 提供商标记，记录观察到的配置变化 |
| 费用与余额 | 查询 DeepSeek 官方 API 账户余额，本地记录 Token、模型费用与预算，并保留旧 `dsh-cost-meter` 账本历史 |
| 上下文洞察 | 当前对话的上下文占用与组成、请求趋势、工具耗时、压缩与最近活动，整合在费用与用量中 |
| 内置插件市场 | 搜索、分类与来源安装，检查已装插件更新；持久保存安装、更新和卸载待办，由客户端重启后应用 |
| 内置技能管理 | 在“插件 → 技能”统一浏览、创建、编辑、启停、导入与恢复删除的技能，连接本机与项目技能库 |
| 内置 MCP | 在“插件 → MCP”管理连接、目录、OAuth、自定义服务、工具发现、调用策略、项目范围和备份恢复，保留原目录的图片与 Emoji 标识 |
| 内置侧栏工作台 | 文件树、搜索、上传与 ZIP、CodeMirror、Markdown/Mermaid/HTML 预览、Git 暂存/提交/历史/工作树、AI 改动、子代理与任务、Side Chat、可分栏工作台及扩展查看器；继续使用官方右侧栏和终端 |

插件提供自身的客户端布局、桌面窗口和维护功能，不依赖 Codex UI。项目、会话、归档、模型和发送控件继续使用 DSH 的官方服务与组件；左栏提供聊天、自动化任务、插件和设置入口，“插件”包含浏览、技能和 MCP 三个子页；浏览页将市场与已安装管理合并，通过全部、已安装、可更新和可安装筛选切换。技能与 MCP 不重复出现在设置或左栏，搜索按钮继续提供会话搜索。

齿轮按钮在主区域打开官方设置栏目。MCP 使用本项目的 React 页面，直接读取 DSH 的主题与字体，无嵌入旧网页。界面统一使用本机 Segoe UI 与微软雅黑字体，代码和日志保留等宽字体。原生窗口三键高度为 30 DIP，为下方圆角面板留出间距。

当前验证基线为 DSH `0.2.0-rc.2`，这是发布候选版。其他核心版本需要重新验证客户端接口，不能仅凭安装成功认定兼容。

全文搜索在首次查询时按需建立本地内存索引，不请求外部服务，也不增加冷启动的索引加载工作；首次查询可能比之后的查询慢。profile 中的显式搜索配置仍优先于插件默认值。

## 内化与冲突插件

> **安装前先处理重复插件。** 以下功能已经由 DSH App 提供，应从同一个 profile 卸载或停用对应旧插件的完整 bundle。只隐藏按钮仍可能留下重复路由、存储拥有者、模型工具或客户端模块。内置市场会排除这些包并拒绝重新安装；直接使用 CLI 安装仍需自行避免冲突。DSH App 不会自动卸载你的插件。

| 原插件包名 | 本项目的替代位置 | 同时启用的冲突 |
| --- | --- | --- |
| `dsh-better-sidebar` | 内置文件、Git、任务、Side Chat 与分栏工作台 | `/sidebar` 路由、工作台注册与公共模块名称重复 |
| `dsh-mcp-connector` | **插件 → MCP** | MCP 存储、授权与连接服务重复 |
| `@michengai/dsh-codex-ui` | 自有布局、导航轨、会话侧栏与顶栏 | 侧栏和主界面组件重复接管 |
| `dshmarket` | **插件 → 浏览** | 安装队列、更新与重启流程重复 |
| `dsh-cost-meter` | **费用与用量** | 同一调用重复监听与统计 |
| `dsh-context` | **费用与用量 → 当前会话** | 上下文展示与事件统计重复 |
| `@linxin666/dsh-client-ui-skill-explorer` | **插件 → 技能** | 技能浏览和配置入口重复 |
| `@michengai/dsh-skills-manager` | **插件 → 技能** 与官方技能提供者 | 技能来源、启停策略与注册重复 |

“内化”有两种实现：MCP Host 保留 MIT 许可的 `dsh-mcp-connector@0.2.63` 引擎，Better Sidebar 保留 MIT 许可的 `dsh-better-sidebar@0.24.1` Host、客户端和懒加载运行时代码；布局、技能、费用、上下文与插件市场由本项目重写。前两者的许可证、固定版本、原始文件哈希和本地修改见 [NOTICE.md](NOTICE.md)、[MCP 来源](lib/mcp/upstream/provenance.json) 与 [侧栏来源](lib/sidebar/upstream/PROVENANCE.md)。它们随 DSH App 更新，不再独立更新旧插件。

迁移时先备份 profile 和数据，再核对以下项目；**不要删除 DSH 数据目录**：

1. Better Sidebar：将原有效配置复制到 DSH App 的 `sidebar` 配置字段，再移除原包。每个会话的标签、布局和编辑状态保留相同存储名称；`ctx.betterSidebar`、tab/viewer/图标/角标/设置注册以及公开模块别名继续供扩展使用。功能与接口说明见 [内置侧栏工作台](lib/sidebar/README.md)。
2. MCP：保留原 `mcp_connector` 存储和授权日志，内置引擎继续使用连接、策略、范围及备份数据。旧 MCP 仍启用时，内置 Host 暂不接管该存储；移除原包后重启完成接管。
3. 技能：保留技能文件与旧管理器状态文件，内置功能读取已有来源和策略；模型调用与命令调用分别显示。旧 Skills Manager 仍启用时，内置提供者暂不重复注册。
4. 费用：首次读取导入旧账本，原文件不修改；确认历史已显示后移除原费用插件。未计价调用保留 Token 与次数，填写价格仅影响之后的调用。
5. 市场：先取消旧 `dshmarket` 未完成的变更，再卸载旧市场，避免两套队列处理同一 profile。

官方自动化任务、自动审查、Agent Team、语音输入，以及兼容的 GitGraph 等扩展可以继续使用。这张表不是其他社区插件的全面兼容性保证。卸载 DSH App 会移除上述内置功能并恢复官方侧栏，不会自动重新安装这些旧插件。

## 演示

以下为旧版桌面壳演示，**不代表当前 0.3.5 工作台布局**。

**桌面窗口与顶栏**

![DSH App 桌面与顶栏](https://raw.githubusercontent.com/CaT-Hode/DSH-app/media/v0.2.0/desktop.gif)

**诊断与功能检查**

![DSH App 诊断与功能检查](https://raw.githubusercontent.com/CaT-Hode/DSH-app/media/v0.2.0/diagnostics.gif)

演示使用独立配置下的真实 DSH `0.1.7-rc.2` 和原生 Web 界面，不包含个人会话。GIF 由同一次运行的操作关键帧组成，功能检查不发送模型消息；播放节奏用于展示操作，不代表性能测量。

## 安装

### 准备

- Windows，Node.js **24 或以上**，pnpm **11**。
- 已安装 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)，终端中可运行 `dsh`。
- DSH App **0.3.5** 的客户端接口基线是 DSH **0.2.0-rc.2**，包内版本声明会阻止在更旧核心上启用。Electron 使用 **44**；其他核心版本请先运行功能检查。
- 已按上方冲突表移除或停用重复 bundle，并保留需要迁移的配置与数据。

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

以后使用第三步即可冷启动客户端。Electron 在独立窗口中运行，后端控制台隐藏；启动日志显示在窗口内。启动页和故障安全页优先读取当前 profile 的外观设置，浅色使用白底、深色使用黑底；选择“跟随系统”或未保存设置时跟随系统外观，无需等待后端加载。

<details>
<summary>交给本地 Agent 安装</summary>

```text
请按 https://github.com/CaT-Hode/DSH-app 的 README，将 DSH App 安装到我现有的 web profile。先验证核心版本、Node.js 24+ 和 pnpm 11，备份 profile 与数据，对照内化与冲突表迁移旧设置并移除重复插件，保留模型、对话和兼容扩展。添加 GitHub 插件源，启动一次 Web 完成激活，再打开 dsh-app.cmd。不要删除旧账本、MCP 存储或技能文件，也不要把本项目误当成 npm 上的 dsh-app 包。
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
| 查看当前对话上下文 | **费用与用量** 同页的“当前会话”；也可点击输入框下方的上下文摘要 |
| 管理技能 | **插件 → 技能**，查看、创建、编辑、启停、导入和恢复技能；同页管理技能库 |
| 刷新界面 | `Ctrl+R` |
| 隐藏窗口 / 完全退出 | 关闭窗口驻留托盘；托盘 → **退出 DSH App** 完全退出 |

浏览器登录同一后端后，可访问 `/dsh-app/diagnostics` 查看相同记录；重启和恢复从客户端发起。即使 DSH 前端无法加载，独立安全启动页仍可打开诊断窗口并执行有备份支持的恢复。客户端只停止自己启动的后端，连接外部 Web 服务时不会接管其退出。

费用统计首次读取时将旧 `dsh-cost-meter` 的每日、模型、会话汇总及价格和预算设置复制到独立账本；旧文件不修改。此后只处理新产生的模型用量，不在冷启动时扫描历史会话。金额是按已保存价格计算的估算值；没有价格的调用会计数并标为未计价。ASS 的提供商 ID 与厂商价格表独立，请在费用页的“模型价格”中填写该提供商和模型的实际美元价格，单位为百万 Token；新价格仅用于之后的调用，历史费用不重算。缓存读取和写入分别按配置费率计算，预算使用所选显示货币。确认历史记录后，可从插件市场卸载旧费用插件。

账户余额来自 [DeepSeek 官方 `user/balance` 接口](https://api-docs.deepseek.com/api/get-user-balance/)，显示接口的原币种、总余额、赠送余额和充值余额，独立于本地费用估算。服务器按 DeepSeek 官方 API Key 提供商的当前配置解析凭据；未启用官方提供商、未配置 Key、官方地址被替换为第三方地址或凭据引用与第三方提供商共用时，显示原因并停止查询。Key 不会发送给浏览器或写入余额缓存，ASS、MIFY 等第三方余额暂不查询。请求首次显示时发起，启动不等待网络；默认缓存 5 分钟、超时 5 秒、失败重试间隔 60 秒、手动刷新最短间隔 30 秒，可通过插件的 `balance.refreshMs`、`balance.timeoutMs`、`balance.retryMs`、`balance.minRefreshMs` 调整。失败时保留同一账户上次成功余额并标注时间和过期状态；更换 Key 后不会显示旧账户余额。

费用与用量使用一个连续页面和一条页面滚动区域，按今天、本月或全部历史显示所有会话的费用、Token 和调用概览；费用明细、历史与预算和价格设置可展开。余额下方的“当前会话”跟随选中的对话，显示上下文利用率与估算组成、请求输入/输出和耗时、工具失败、压缩、裁剪及注入活动。当前会话区域不重复展示全局累计 Token 和调用卡片；API 用量与字符估算分别标注，估算组成不用于计费。模块按需读取当前对话的日志投影并增量更新，不扫描全部历史会话，也不轮询；请求趋势和活动只保留最近的记录。文件浏览和团队功能仍由各自模块提供。

内置市场与已安装管理合并在“插件 → 浏览”，按需读取社区目录，支持搜索、分类、全部/已安装/可更新/可安装筛选，以及 npm 确定版本和 GitHub 来源安装。目录外的已装插件也可管理，官方功能的启停与配置继续使用官方服务；已内化的旧插件不再提供重复安装入口。安装、更新和卸载先进入可取消的本地待办；点击“重启并应用”后，客户端停止后端、备份 profile、执行官方 `dsh plugin` 并核对实际包版本和启用状态，后端启动成功后才报告已应用。更新保留插件原来的启用状态，卸载保留插件数据；失败保留待办、日志与恢复备份。独立 Web 服务由其启动者重启。市场不再依赖 `dshmarket`，移除原插件前请先取消原市场未完成的操作；MCP 的更新提示会进入内置市场。

技能管理由 DSH App 自身提供，不依赖 Skills Manager 或 Skill Explorer。该页面连接 DSH 官方技能注册服务，读取现有本机与项目技能目录，并兼容旧 Skills Manager 的来源和停用状态；原状态文件不改写。技能的模型调用标记保存在 `SKILL.md`，编辑时校验文件版本，避免覆盖外部修改。删除先移入可恢复回收站，恢复不覆盖同名文件。支持本机目录、文件夹上传、ZIP 和公开 GitHub 来源导入；导入仅复制文件，不执行脚本，拒绝越界路径、链接、同名覆盖及超限文件。卸载旧的两个社区插件只移除包和激活配置，已有技能文件继续保留。

## 更新与卸载

**更新 DSH App 插件**：先退出客户端，重新执行安装命令，再启动 Web 激活新版，随后启动客户端。插件市场收录后，也可使用市场的更新和重启流程。

**更新 DSH 核心**：有新版本时，点击顶栏更新按钮，选择“安装并重启”。升级前在临时目录检查模式、模型和对话操作，切换后检查实际界面响应；失败会尝试恢复旧核心与配置。此操作不更改全局 `dsh` 或源码仓库，也不回滚会话及插件数据迁移。

**卸载插件**：退出客户端后执行：

```powershell
dsh plugin --profile web remove dsh-app
```

重新启动 DSH Web 后恢复官方侧栏，已有对话和其他插件继续可用；卸载不删除会话或费用账本。已移除的旧插件需要按需自行重新安装，其设置和数据迁移不能通过恢复旧核心代替。

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
| Host `skills.maxContentBytes` / `skills.maxArchiveBytes` / `skills.maxExpandedBytes` / `skills.maxFiles` | 技能正文、ZIP、解压总量与文件数上限，默认 1 MiB / 32 MiB / 64 MiB / 1000 |
| Host `skills.requestTimeoutMs` | GitHub 技能导入请求超时，默认 15000 ms，范围 1000–60000 |

运行记录位于 `$DSH_HOME/dsh-app`：最近启动日志、配置备份、插件隔离记录和模型审计均保存在本地。本机仓库适配版使用 `desktop-link`。连接描述文件包含认证令牌，请勿贴到公开问题中。

</details>

## 生态与项目范围

DSH App 使用标准 `dsh.bundle.patch` 安装，面向 `web` profile。可通过 [GitHub 的 dsh-plugin 主题](https://github.com/topics/dsh-plugin) 发现社区插件；[awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) 是插件市场使用的社区目录。收录由该目录维护者审核。

仓库保留 `bin/` 启动入口、`desktop/` 桌面壳、`client/` 界面源代码、`lib/` Host 与内置引擎，以及必需的构建脚本和职责对应的聚焦行为检查。`npm run build` 生成客户端插件与 sandbox preload。安装包仅包含运行部件、README 和许可证，不包含测试、测试辅助代码、个人 profile 或录制中间文件。

开发验证见 [必要行为检查](tests/README.md)，包含费用、上下文与真实 DSH 客户端工厂的测试环境和运行方式。

MIT · 图标与参考项目归属见 [NOTICE.md](NOTICE.md)。
