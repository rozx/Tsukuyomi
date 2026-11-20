# Tasks

## 1. 本机配置、状态与译文来源基础

- [x] 1.1 在 `src/models/settings.ts` 中新增 `AgentMcpSettings`、`AgentMcpPermissionMode` 与 `AgentMcpWriteMode` 类型及默认值（服务端与 WebMCP 默认关闭、端口 48321、权限 `translate_and_edit`、写回模式 `append`、写操作提示开启），在 `src/stores/settings.ts` 中增加配置读写、随机 Bearer Token 生成/重置；在 `src/utils/sync-strip.ts` 的 `stripAppSettingsLocalFields` 中剥离 `agentMcp`，在 `importSettings` 中忽略传入值、在 `replaceSettingsFromSyncSnapshot` 中带回本机值，并在 `useSettingsImportExport` 导出备份前剥离；通过新增的 `src/__tests__/agent-mcp-settings.test.ts` 验证默认初始化、上传载荷与设置哈希不含 `agentMcp`、下载合并保留、恢复修订保留、备份导出不含令牌与导入他机备份不改本机配置。
- [x] 1.2 新增 `src/utils/translation-model-label.ts` 解析外部译文来源（`mcp:*` / `webmcp:*` 与站内 `AIModel` 名称统一映射），并接入 `src/components/dialogs/TranslationHistoryDialog.vue` 与 `src/composables/book-details/useBookDetailsPage.ts`；通过 `src/__tests__/translation-model-label.test.ts` 验证站内模型、外部带标签来源、外部缺省来源与未知模型回退。
- [x] 1.3 新增 `src/stores/agent-mcp.ts` 管理运行态信息（桌面 MCP 服务端状态/报错、WebMCP 环境检测状态、已注册工具列表、内存态环形活动日志与清空操作），通过 `src/__tests__/agent-mcp-store.test.ts` 验证日志容量上限与状态更新。

## 2. 共享外部 Agent 工具内核

- [x] 2.1 在 `src/services/agent-mcp/` 中建立核心调度器（`types.ts`、`kernel.ts`、`prompts.ts`），实现工具注册表、三级权限门禁（`read_only` / `translate_and_edit` / `full`）、显式 `book_id` 与当前打开书籍上下文回退、`translate-chapter` / `polish-chapter` / `import-and-translate` 三个内置工作流模板，以及调用活动记录与可选 Toast 写通知；书库 Store 未加载完成时返回 `NOT_READY`，写入统一经 `useBooksStore` action 以刷新 UI；通过 `src/__tests__/agent-mcp-kernel.test.ts` 验证权限拦截、上下文回退、Store 未就绪错误、工作流模板渲染与日志记录。
- [x] 2.2 实现应用上下文与书库导入工具（`src/services/agent-mcp/tools/context.ts`、`tools/library.ts`、`tools/url-import.ts`）：`get_app_context`、`navigate_to`、`list_books`、`get_book`、`create_book`、`add_chapters`（支持纯文本分段与段落数组）、`import_book_from_url`（复用 `NovelScraperFactory.getScraper`，站点不受支持即返回 `null` 时与 Web 端抓取失败时都返回降级指引）、`delete_book`（仅 `full` 模式）与 `get_workflow_guide`；通过 `src/__tests__/agent-mcp-library-tools.test.ts` 验证建书、批量加章、不支持站点与抓取失败两种 URL 导入降级、删除权限拦截。
- [x] 2.3 实现翻译核心循环工具（`src/services/agent-mcp/tools/translation.ts`）：先把 `src/services/ai/tools/translation-tools.ts` 中的原文前缀校验/段落 ID 容错抽成可共享纯函数（站内行为不变，既有 `tools.test.ts` 保持通过）；`get_translation_chunk`（复用 `chunk-formatter`、只读的 `selectRelevantMemoriesForChunk`、术语/角色匹配与特殊指令，支持 `untranslated`/`all`，游标为章节原始段落索引）、`submit_translations`（使用抽出的校验函数，经 `booksStore.editParagraphTranslations` 以 `append` / `update` 编辑落盘，无选中译文时覆盖退化为追加，支持可选章节标题译文与外部 `aiModelId` 写入，并返回剩余未翻统计与下一块游标）、`get_chapter_paragraphs` 与 `update_chapter_title`；通过 `src/__tests__/agent-mcp-translation-tools.test.ts` 验证分块打包、默认追加版本、显式覆盖（保留原来源标识）、无译文时覆盖退化为追加、同文提交不新增版本、版本上限逐出、原文前缀校验失败、提交后未翻模式不跳段、失败段落再次返回，以及拉取上下文不改写 `getLastScoreBreakdowns` 的结果。
- [x] 2.4 实现世界观维护工具（`src/services/agent-mcp/tools/worldbuilding.ts`）：`list_terms`、`upsert_terms`、`list_characters`、`upsert_characters`、`search_memories`、`upsert_memory`、`get_special_instructions` 与 `update_special_instructions`；通过 `src/__tests__/agent-mcp-worldbuilding-tools.test.ts` 验证批量幂等 upsert、混合记忆检索与书/章特殊指令读写。

## 3. Electron 本地 Streamable HTTP MCP 服务端与 IPC 桥接

- [x] 3.1 在 `src-electron/mcp-server.ts` 中基于 `node:http` 与 `node:crypto` 实现仅绑定 `127.0.0.1` 的双代 MCP Streamable HTTP JSON-RPC 2.0 服务端（单一 `POST /mcp` 端点按请求分流：带 `_meta` 协议版本的走 `2026-07-28` 无状态语义并实现 `server/discover` 与 `MCP-Protocol-Version` / `Mcp-Method` / `Mcp-Name` 请求头校验、结果附带 `resultType` 及列表结果的 `ttlMs` / `cacheScope`；`initialize` 走 `2025-03-26` 旧握手并支持 `notifications/initialized`、`ping`；两代均提供 `tools/list`、`tools/call`、`prompts/list`、`prompts/get`，不签发会话 ID，`GET` / `DELETE` 返回 405；实现前对照 `2026-07-28` schema 页核对结果字段；强制 `Host`/`Origin` 防跨站重绑定校验与 `timingSafeEqual` Bearer Token 鉴权、端口占用错误处理）；通过 `src/__tests__/electron-mcp-server.test.ts`（文件首行 `// @vitest-environment node`，默认 jsdom 环境不适合监听端口）验证旧代握手全流程、现代无握手直接调用与 `server/discover`、请求头缺失或与 `_meta` 不一致返回 400/`-32020`、不支持版本返回 `-32022` 并列出支持版本、未知方法 404、`GET`/`DELETE` 405、两代并发互不影响、鉴权 401、跨站 Origin/Host 403、Token 轮换立即失效、端口冲突报错与工具/Prompt 路由。
- [x] 3.2 新增 `src-electron/mcp-ipc.ts` 并在 `src-electron/electron-main.ts`、`src-electron/electron-preload.ts` 与 `src/types/electron.d.ts` 中接入 `window.electronAPI.mcp` 双向桥接（含请求 ID 关联、超时控制、`trustedDesktopSender` 来源校验、窗口未就绪/关闭时结束挂起请求、窗口重建后继续可用与应用退出自动停服），同时在 `src/services/agent-mcp/desktop-bridge.ts` 中完成渲染进程侧请求消费；通过 `src/__tests__/agent-mcp-desktop-bridge.test.ts` 验证主进程-渲染进程转发、非可信来源响应被丢弃、超时错误、窗口关闭时挂起请求返回错误与状态同步。

## 4. 浏览器 WebMCP 适配层与启动初始化

- [x] 4.1 实现 `src/services/agent-mcp/webmcp-adapter.ts`，兼容探测 `document.modelContext` 与 `navigator.modelContext`，实现基于 `AbortController` 与 `unregisterTool` 回退的注册/注销生命周期管理、权限切换同步重注册、暴露 `get_workflow_guide` 工具以及在不支持浏览器中的静默降级；通过 `src/__tests__/agent-mcp-webmcp-adapter.test.ts` 验证两种接口形态、动态权限切换、关闭清理与无支持环境降级。
- [x] 4.2 新增 `src/boot/agent-mcp.ts` 并在 `quasar.config.ts` 的 `boot` 数组中注册，实现应用启动加载设置后按运行环境同步状态（Electron 仅同步桌面 MCP 服务端状态且不注册 WebMCP，浏览器端仅同步 WebMCP 注册状态；默认关闭时不监听端口也不注册工具，HMR 与卸载时清理监听器）；通过 `src/__tests__/agent-mcp-boot.test.ts` 验证默认关闭、已开启恢复以及 Electron 下跳过 WebMCP 注册三条路径。

## 5. 独立 `/mcp` 工作台页面、导航与三语文档

- [x] 5.1 扩展主导航与路由：更新 `src/router/routes.ts`（新增 `/mcp`）、`src/composables/useMainNavActive.ts`、`src/composables/layout/useMainNavDispatch.ts`、`src/components/layout/AppSideMenu.vue` 与 `src/components/layout/TabletNavRail.vue`（桌面与平板主导航平行于 `/import` 和 `/ai`），并在 `IndexPage` 或设置入口补充移动端直达 `/mcp` 的快捷入口；通过 `src/__tests__/agent-mcp-navigation.test.ts` 验证路由激活态与导航分派。
- [x] 5.2 实现 `/mcp` 页面逻辑与三变体 UI：新增 `src/composables/agent-mcp-page/useAgentMcpPage.ts`（`provideAgentMcpPage` / `injectAgentMcpPage`，包含桌面启停、端口保存与校验、Token 复制/重置、按 Electron/Web 环境区分展示的控件与 Claude Code / Pi / Antigravity / WebMCP 动态配置片段生成、权限与默认写回策略切换、工具筛选与日志管理）、共享 UI 碎片组件 `src/components/agent-mcp/`，以及 `src/pages/AgentMcpPage.vue` + `src/pages/agent-mcp/AgentMcp{Desktop,Tablet,Mobile}.vue`；通过 `src/__tests__/use-agent-mcp-page.test.ts` 验证配置片段随端口/Token 实时更新、Electron 不展示 WebMCP 开关、权限变更联动与跨断点状态保持。
- [x] 5.3 补齐 `src/i18n/{zh-CN,zh-TW,en-US}/` 三语界面文案，并在 `public/help/{zh-CN,zh-TW,en-US}/` 新增外部 Agent / MCP 使用与接入指南且同步更新三语 `index.json`；运行 `bun run check:i18n` 验证三语键名完整无缺失。

- [x] 5.4 按使用顺序重新设计 `/mcp` 工作台：用 `AgentMcpPanel` / `AgentMcpSetupSteps` / `AgentMcpActivityLog` / `AgentMcpPermissionPanel` / `AgentMcpConnectionSettings` / `AgentMcpToolCatalog` 取代原三张卡片；服务未运行时配置不可复制；新增 `src/services/agent-mcp/agent-quick-start.ts` 生成可直接粘贴给 Agent 的快速上手指南（通用说明，不按任务或书籍定制）；权限选项带后果说明与工具数量，切换到 `full` 与重新生成令牌需二次确认；通过 `src/__tests__/agent-mcp-quick-start.test.ts` 与 `src/__tests__/use-agent-mcp-page.test.ts` 验证。
- [x] 5.5 新增 `check_book_updates` 与 `apply_book_updates`（`src/services/agent-mcp/tools/book-updates.ts`，复用 `BookSyncService`），加入长操作清单并补齐三语工具说明与帮助文档；通过 `src/__tests__/agent-mcp-book-update-tools.test.ts` 验证检查结果、默认只导入新章节、显式应用正文改动、限定范围、来源缺失/失效与权限拦截。

- [x] 5.6（已被 5.7 取代）浏览器不支持 WebMCP 时禁用开关、合并为单一状态，并按浏览器（Chrome / Edge / Firefox / Safari）给出开启指南与非安全页面提示；新增 `src/utils/browser-kind.ts`，通过 `src/__tests__/browser-kind.test.ts` 与 `src/__tests__/use-agent-mcp-page.test.ts` 验证。

- [x] 5.7 浏览器版改用 WebMCP 本地中继：新增依赖 `@mcp-b/global`（动态加载）与开发依赖 `@mcp-b/webmcp-local-relay`，把 `embed.js` / `widget.html` 复制到 `public/webmcp-relay/`；新增 `src/services/agent-mcp/webmcp-relay.ts` 并接入运行时的开启/关闭顺序；页面第二步在浏览器端给出带 `--widget-origin` 的中继配置，移除按浏览器的实验开关指南与 `browser-kind` 工具；快速上手指南的浏览器版改为说明中继；通过 `src/__tests__/agent-mcp-webmcp-relay.test.ts`、`agent-mcp-runtime-relay.test.ts`、`use-agent-mcp-page.test.ts`、`agent-mcp-quick-start.test.ts` 验证，并用真实浏览器加本机中继做过端到端检查。

- [x] 5.8 扩展快速上手指南：以「首次设置」开头，让 Agent 替用户建立项目文件夹、以项目级方式配置 MCP、把指南保存为该文件夹的 AGENTS.md；补充数据模型、工具一览、分步工作流与出错处理；页面改为两步，客户端配置收进默认折叠的「手动添加 MCP」；连接配置抽到 `src/services/agent-mcp/client-config.ts` 与页面片段共用；通过 `src/__tests__/agent-mcp-quick-start.test.ts` 验证。

- [x] 5.9 处理浏览器自带旧版 WebMCP：`webmcp-relay.ts` 探测并在本页替换为 polyfill，无法替换时返回 `legacy-native`；中继接通状态写入 store 并在页面说明原因；页面与指南补充「只开一个标签页 / 工具名后缀」说明；通过 `agent-mcp-webmcp-relay.test.ts`、`agent-mcp-runtime-relay.test.ts`、`use-agent-mcp-page.test.ts` 验证，并在带旧版原生接口的浏览器里做了端到端检查。

## 6. 集成验证与代码质量门禁

- [x] 6.1 运行完整代码质量检查与全量测试：`bun run lint && bun run type-check && bun run test:coverage && bun run quality-check`，确认零 ESLint/TypeScript/Fallow/i18n 错误且全部单元测试通过。
- [ ] 6.2 在桌面开发模式与 Web 开发模式分别人工验证：`/mcp` 页面三设备断点渲染正常；桌面端开启本地 MCP 服务后用真实 Coding Agent（Claude Code / Pi / Antigravity，逐一记录各自实际使用的协议代）完成工具发现 → `get_translation_chunk` → `submit_translations` 闭环，并用 `curl` 分别走一遍旧代 `initialize` 与现代无握手两条路径并确认书库 UI 实时更新；Web 端确认无 WebMCP 环境优雅降级且在注入模拟 `document.modelContext` 时可完整调用。

## Workflow follow-up

- 待所有实现任务与人工验证完成后，运行 `/openspec-verify-change` 核对实现与规格一致性。
- Review 通过后使用 `/openspec-archive-change` 归档变更并将 4 份新能力规格合并至 `openspec/specs/`。
