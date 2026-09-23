# DSH App

DSH App is a Windows Electron companion **installed as a DeepSeek Harness plugin**. Its bundle adds one small Host bridge to the existing `web` profile; the `dsh-app` command opens that same authenticated DSH instance in a native window. If no instance is running, the app starts the installed DSH CLI with a hidden console, displays its live startup output, and chooses a free loopback port. The browser entry in the tray opens the same backend, sessions, settings, and plugin profile.

This repository contains only DSH App's bridge, launcher, Electron window, UI strip, icons, and their tests. It does **not** bundle Codex UI, the plugin market, MCP Connector, pets, or any other community plugin. Menu entries for those features act only when the corresponding plugin is separately installed. The strip integrates with the stock DSH workbench as well as Codex UI; it follows the sidebar width, border, and theme and stays accessible above Codex UI's settings page.

## Install and run

Requirements: Windows, Node.js 24+, the DSH CLI, and pnpm. From the directory where `dsh` is available:

```powershell
dsh plugin --profile web add 'git+https://github.com/CaT-Hode/DSH-app.git'
dsh web --no-open
```

The first Web start activates the plugin and writes the local CLI path to `%USERPROFILE%\.dsh\dsh-app\runtime.json`. Stop that foreground Web command, then launch the installed desktop command:

```powershell
& "$HOME\.dsh\profiles\web\node_modules\.bin\dsh-app.cmd"
```

DSH App reuses an already running Web instance when possible. For a one-command cold start after the initial activation, use the same `dsh-app.cmd` command. `dsh-app --open-web` also opens the shared instance in the system browser; closing the window leaves DSH in the tray, and **Exit DSH App** stops only a backend started by this app. The startup page retains sanitized backend output and offers a retry button on failure. Plugin updates reported through DSH's pending-update protocol are applied on restart with backup and restore support.

Electron 44 is an optional package dependency so the Host plugin can still load if the Electron binary is unavailable. pnpm may defer the binary download until the first `dsh-app` launch, which can take longer and needs network access. If that download fails, set `DSH_APP_ELECTRON` to a compatible `electron.exe`. `DSH_APP_CLI` and `DSH_APP_NODE` can override the remembered DSH runtime paths. `DSH_APP_PORT` can request a specific port; the default `0` lets Windows allocate a free loopback port.

The DSH App command is installed under the Web profile's `.bin` directory; adding the plugin does not replace the standard `dsh` command or modify Windows registry entries. The package does not publish an installer or auto-update channel.

## Develop and verify

```powershell
npm run check
npm pack --dry-run --ignore-scripts
```

`npm run check` rebuilds the sandbox preload and runs the Host IPC, plugin-update, startup-log, and recovery tests. To verify with DSH itself, set an isolated `DSH_HOME`, install the local `.tgz` through `dsh plugin --profile web add`, run `dsh web --no-open`, and confirm `%DSH_HOME%\dsh-app\web.json` appears and its authenticated URL returns HTTP 200. Then start `dsh-app` with the same `DSH_HOME` and verify the Electron title strip and browser entry. The launch token in `web.json` is a secret; do not paste it into issue reports.

DSH App currently targets the `web` profile and Windows. It has been tested against DSH `0.1.5-rc.1` from source with Electron 44. DSH is in developer preview, so later Host or client plugin interfaces may require changes.

## 中文说明

本仓库只包含 DSH App 自己的 DSH bundle、共享服务桥接、Electron 启动器、顶栏和测试，不包含其他社区插件源码。安装后先运行一次 `dsh web --no-open` 完成插件激活，再执行上面的 `dsh-app.cmd`；此后冷启动可由客户端直接启动隐藏的 DSH 后端。客户端和浏览器使用同一 `web` 配置、插件与会话。启动日志、服务重启、插件更新后的恢复入口保留在客户端中。未安装 Codex UI、MCP 连接器等插件时，DSH App 不会替你安装它们。

桌面壳布局参考 [DSH Codex Desktop](https://github.com/MichengAI/dsh-codex-desktop)；第三方素材归属见 [NOTICE.md](NOTICE.md)。
