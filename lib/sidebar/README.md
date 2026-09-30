# 内置侧栏工作台

工作台内化自 MIT 许可的 `dsh-better-sidebar@0.24.1`，来源为 [omdsh-dev/DSH-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar)。[LICENSE](upstream/LICENSE) 保留原版权声明，[PROVENANCE.md](upstream/PROVENANCE.md) 记录本项目的修改，[upstream-hashes.json](upstream/upstream-hashes.json) 记录原始发布文件的 SHA-256。DSH App 使用这份固定的运行时代码，不再要求另行安装原插件。

`index.mjs` 挂载 Host API、文件上传与下载、ZIP 打包、HTML 预览、目录监听和模型打开文件的推送通道。`upstream/client-factory.mjs` 由 DSH App 的单一客户端模块激活，保留增强文件树、CodeMirror 编辑与保存、Markdown/Mermaid 和 HTML 预览、Git 与本轮 AI 改动、子代理与后台任务、侧边对话、可分栏的底部工作台。图片、PDF、Office 和终端由 DSH 官方原生组件提供。

编辑器、Mermaid 和其他语言词典分别由 `upstream/client-editor.js`、`client-mermaid.js`、`client-locale.js` 按需加载。原生右栏和底部工作台继续共用 `ctx.betterSidebar`；注册 tab、文件 viewer、图标、回调、角标和插件设置的公开接口保持兼容。[客户端桥接](../../client/sidebar-bridge.mjs) 提供 `dsh-better-sidebar`、其 `/client`、`/client/service`、`/client/api` 和 `dsh-external/dsh-better-sidebar` 模块名称。已有扩展可继续贡献内容，GitGraph 的独立正式模块和分支入口继续由其本身管理。

`settings.mjs` 将原设置页面的读写投影到 DSH App 配置的 `sidebar` 字段，更新沿用官方 revision，不覆盖余额等其他配置。公开 `/sidebar` 路径和每个会话的客户端布局存储名称保留；本次集成不删除已有工作区、会话、Git 数据或旧布局。由原文件配置迁移的设置可以保留 tab/viewer 启停、任务视图、HTML 选项、编辑器打开方式和扩展自己的设置。

工作台偏好位于 **设置 → 通用设置**，由本项目的紧凑设置行、开关和可展开配置呈现。原“侧边卡片”独立导航和品牌版本卡片不再注册；引擎将原偏好资源交给自有界面，继续保留动态 tab/viewer 设置、扩展提供的字段和自定义设置组件。外部配置变化通过官方设置事件刷新，写入沿用原 revision。

聚焦测试在发布的 DSH `0.2.0-rc.2` 上验证模块别名及重载、贡献注册与释放、跨会话打开目标、失败订阅者的隔离、Host 文件读写、父设置投影、路由与 WebSocket 的跨站拒绝、三个懒加载文件的内容及缓存再验证、实际 Cordis 挂载与释放。测试使用临时工作区，没有对用户工作区执行提交、文件删除、Side Chat 模型请求或系统应用启动；真实编辑器交互和外部工具操作需另行在客户端验证。
