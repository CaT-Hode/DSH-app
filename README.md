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
| 冷启动与故障 | 实时显示后端日志、耗时；前端加载失败时切回安全页，可重试、打开诊断，并按有效备份恢复 |
| 核心与插件更新 | 检测到 DSH 新版才显示更新按钮；安装、重启、配置备份与失败恢复 |
| 诊断与恢复 | 查看插件状态和启动失败日志，单独停用或重试；恢复插件更新或切回有备份的上一个 DSH 版本 |
| 模型来源 | 保留模型原始 ID，识别 ASS 提供商标记，记录观察到的配置变化 |

插件只提供自身的桌面与维护功能。Codex UI、插件市场、MCP 连接器等由各自插件提供，需单独安装；顶栏可调用已有插件的页面。

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
- 当前版本已在 DSH **0.1.7-rc.2**、Electron **44** 上实测。DSH 仍在快速迭代，其他版本请先运行功能检查。

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
| 刷新界面 | `Ctrl+R` |
| 隐藏窗口 / 完全退出 | 关闭窗口驻留托盘；托盘 → **退出 DSH App** 完全退出 |

浏览器登录同一后端后，可访问 `/dsh-app/diagnostics` 查看相同记录；重启和恢复从客户端发起。即使 DSH 前端无法加载，独立安全启动页仍可打开诊断窗口并执行有备份支持的恢复。客户端只停止自己启动的后端，连接外部 Web 服务时不会接管其退出。

## 更新与卸载

**更新 DSH App 插件**：先退出客户端，重新执行安装命令，再启动 Web 激活新版，随后启动客户端。插件市场收录后，也可使用市场的更新和重启流程。

**更新 DSH 核心**：有新版本时，点击顶栏更新按钮，选择“安装并重启”。升级前在临时目录检查模式、模型和对话操作，切换后检查实际界面响应；失败会尝试恢复旧核心与配置。此操作不更改全局 `dsh` 或源码仓库，也不回滚会话及插件数据迁移。

**卸载插件**：退出客户端后执行：

```powershell
dsh plugin --profile web remove dsh-app
```

重新启动 DSH Web 后，仍可从浏览器使用已有对话和其他插件。

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

运行记录位于 `$DSH_HOME/dsh-app`：最近启动日志、配置备份、插件隔离记录和模型审计均保存在本地。本机仓库适配版使用 `desktop-link`。连接描述文件包含认证令牌，请勿贴到公开问题中。

</details>

## 生态与项目范围

DSH App 使用标准 `dsh.bundle.patch` 安装，面向 `web` profile。可通过 [GitHub 的 dsh-plugin 主题](https://github.com/topics/dsh-plugin) 发现社区插件；[awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) 是插件市场使用的社区目录。收录由该目录维护者审核。

仓库保留 `bin/` 启动入口、`desktop/` 桌面壳、`lib/` Host 与维护模块，以及必需的构建脚本。`npm run build` 生成已随仓库提供的 sandbox preload。开发测试、快照和录制中间文件不随源码主分支发布。

MIT · 图标与参考项目归属见 [NOTICE.md](NOTICE.md)。
