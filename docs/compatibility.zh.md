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

“内化”有两种实现：MCP Host 保留 MIT 许可的 `dsh-mcp-connector@0.2.63` 引擎，Better Sidebar 保留 MIT 许可的 `dsh-better-sidebar@0.24.1` Host、客户端和懒加载运行时代码；布局、技能、费用、上下文与插件市场由本项目重写。前两者的许可证、固定版本、原始文件哈希和本地修改见 [NOTICE.md](../NOTICE.md)、[MCP 来源](../lib/mcp/upstream/provenance.json) 与 [侧栏来源](../lib/sidebar/upstream/PROVENANCE.md)。它们随 DSH App 更新，不再独立更新旧插件。

迁移时先备份 profile 和数据，再核对以下项目；**不要删除 DSH 数据目录**：

1. Better Sidebar：将原有效配置复制到 DSH App 的 `sidebar` 配置字段，再移除原包。每个会话的标签、布局和编辑状态保留相同存储名称；`ctx.betterSidebar`、tab/viewer/图标/角标/设置注册以及公开模块别名继续供扩展使用。功能与接口说明见 [内置侧栏工作台](../lib/sidebar/README.md)。
2. MCP：保留原 `mcp_connector` 存储和授权日志，内置引擎继续使用连接、策略、范围及备份数据。旧 MCP 仍启用时，内置 Host 暂不接管该存储；移除原包后重启完成接管。
3. 技能：保留技能文件与旧管理器状态文件，内置功能读取已有来源和策略；模型调用与命令调用分别显示。旧 Skills Manager 仍启用时，内置提供者暂不重复注册。
4. 费用：首次读取导入旧账本，原文件不修改；确认历史已显示后移除原费用插件。未计价调用保留 Token 与次数，填写价格仅影响之后的调用。
5. 市场：先取消旧 `dshmarket` 未完成的变更，再卸载旧市场，避免两套队列处理同一 profile。

官方自动化任务、自动审查、Agent Team、语音输入，以及兼容的 GitGraph 等扩展可以继续使用。这张表不是其他社区插件的全面兼容性保证。卸载 DSH App 会移除上述内置功能并恢复官方侧栏，不会自动重新安装这些旧插件。
