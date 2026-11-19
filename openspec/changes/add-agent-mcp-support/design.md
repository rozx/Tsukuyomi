# Design

## Context

Tsukuyomi 的核心业务数据（书籍、卷章、段落多版本译文、术语、角色设定、记忆、本地嵌入索引）均持久化在渲染进程的 IndexedDB 中，由 `BookService` / `ChapterService` / `MemoryService` 等服务层读写。注意 UI 刷新并非写盘自动触发：`bookCommitBus` 目前只由书籍同步（`book-sync/persistence.ts`）与 AI 导入（`import-application-service.ts`）发布；常规写入靠 `useBooksStore` 的 action 在写盘后调用 `refreshBookFromStorage` 刷新 Store。另外 `TerminologyService` / `CharacterSettingService` 直接依赖 `useBooksStore().getBookById`，要求书库 Store 已加载。同时，应用已具备成熟的站内 AI 工具体系（`src/services/ai/tools/`）与翻译上下文组装器（`src/services/ai/tasks/utils/context-builder.ts`、`chunk-formatter.ts`）。

背景与目标见 [proposal.md](./proposal.md)，外部可见行为契约见各 `specs/*/spec.md`。当前技术约束如下：
- **双端运行形态**：同一套 Vue 3 + Quasar 代码同时构建为 Web SPA（运行于浏览器，不能监听 TCP 端口）与 Electron 45 桌面应用（主进程为 Node.js，渲染进程拥有 IndexedDB 与业务服务）。
- **主流 Coding Agents 接入方式**：Antigravity、Pi、Claude Code 均原生支持 Streamable HTTP MCP（`POST /mcp` + `Authorization: Bearer <token>`）；浏览器侧则面向 W3C WebMCP（`document.modelContext` / `navigator.modelContext`）及 `@mcp-b` 等浏览器桥接生态。
- **既有架构约束**：所有顶层页面必须遵循 Dispatcher + `Desktop / Tablet / Mobile` 三变体模式（`useDeviceVariant`）；`AppSettings` 中涉及本机凭据的字段在 Gist 同步时必须剥离并在下载时保留本机值。

## Goals / Non-Goals

**Goals:**
- 以一套协议无关的渲染进程工具内核同时驱动 **Electron 本地 Streamable HTTP MCP 服务端** 与 **浏览器 WebMCP 适配层**，避免双端逻辑分叉。
- 让外部 Coding Agent 无需重复理解站内底层表结构，单次调用即可获得与站内翻译引擎同等级的上下文（分块、上文衔接、命中术语/角色、三信号打分记忆、特殊指令）。
- 确保安全基线：默认关闭、仅绑 `127.0.0.1`、强制 Bearer Token + `Host`/`Origin` 校验、三级权限门禁、令牌绝不泄露至 Gist 同步。
- 提供独立一级工作台 `/mcp`（平行于 `/import` 与 `/ai`），支持一键接入配置复制与实时调用观测。

**Non-Goals:**
- 不提供面向公网或局域网的多用户远程 MCP 服务（严禁监听 `0.0.0.0`）。
- 不内置完整的 OAuth 2.1 授权服务器（本机回环采用高熵随机 Bearer Token 即可满足安全与易用平衡）。
- 不取代或改动站内已有 AI 翻译引擎与 `ToolRegistry` 内部调用协议。
- 不在仓库中捆绑独立的浏览器扩展或外部 CLI 进程（Web 端兼容浏览器原生 WebMCP 及社区桥接扩展即可）。

## Architecture Overview

```text
   Antigravity / Pi / Claude Code              Browser Agent / WebMCP Extension
                 |                                             |
                 | Streamable HTTP MCP (JSON-RPC 2.0)          | WebMCP API
                 | http://127.0.0.1:<port>/mcp                 | document / navigator
                 | Authorization: Bearer <token>               | .modelContext
                 v                                             v
   +-------------------------------+             +-------------------------------+
   | Electron Main Process         |             | Renderer: WebMCP Adapter      |
   | src-electron/mcp-server.ts    |             | src/services/agent-mcp/       |
   | - node:http on 127.0.0.1      |             |   webmcp-adapter.ts           |
   | - Bearer + Host/Origin guard  |             | - feature detect              |
   | - dual-era: server/discover + |             | - AbortSignal / unregister    |
   |   legacy initialize; tools/*  |             | - dynamic permission sync     |
   +---------------+---------------+             +---------------+---------------+
                   | Electron IPC (requestId correlated)         | Direct call
                   | src-electron/mcp-ipc.ts <-> electron-preload|
                   v                                             v
   +-----------------------------------------------------------------------------+
   |       Renderer: Shared Agent Tool Kernel (src/services/agent-mcp/)          |
   |                                                                             |
   |  kernel.ts            - registry, permission gate, dispatch, activity hook  |
   |  tools/library.ts     - list_books, get_book, create_book, add_chapters,    |
   |                         delete_book                                         |
   |  tools/url-import.ts  - import_book_from_url                                |
   |  tools/translation.ts - get_translation_chunk, submit_translations,         |
   |                         get_chapter_paragraphs, update_chapter_title        |
   |  tools/worldbuilding.ts - list/upsert terms & characters, memories,         |
   |                         get/update_special_instructions                     |
   |  tools/context.ts     - get_app_context, navigate_to, get_workflow_guide    |
   |  prompts.ts           - translate-chapter, polish-chapter,                  |
   |                         import-and-translate                                |
   +--------------------------------------+--------------------------------------+
                                          |
                                          v
       BookService / ChapterService / MemoryService / NovelScraperFactory
       + chunk-formatter / context-builder / add_translation_batch helpers
                                          | booksStore actions / refreshBookFromStorage
                                          v
                        Pinia Stores -> Live Reactive UI
```

## Decisions

### 1. 渲染进程共享工具内核 + 双传输薄绑定
- **决策**：将全部外部工具定义、参数校验、权限门禁、业务执行、Prompt 模板组装与活动日志记录集中在渲染进程纯 TypeScript 模块 `src/services/agent-mcp/`；Electron 主进程 MCP Server 与浏览器 WebMCP 适配层只做协议适配与转发。
- **理由**：IndexedDB、`BookService`、本地嵌入 Worker、爬虫服务及 Pinia 状态全部位于渲染进程。渲染进程共享内核使桌面端与浏览器端 90%+ 代码复用，写入统一经 `useBooksStore` 的 action（如 `editParagraphTranslations`、`updateBook`，写盘后 `refreshBookFromStorage`）以刷新 UI；确需直接调用 `BookService` 的路径由内核在写盘后显式调用 `refreshBookFromStorage` 或发布 `bookCommitBus`。内核在书库 Store 加载完成前收到调用时返回 `NOT_READY` 结构化错误。
- **备选方案**：在 Electron 主进程单独读 SQLite/文件或另起一套独立工具实现。由于 Tsukuyomi 数据存在浏览器 IndexedDB 中，主进程无法直接安全并发访问，故否决。

### 2. Electron 主进程使用零额外依赖的 `node:http` 实现双代（dual-era）Streamable HTTP MCP
- **决策**：在 `src-electron/mcp-server.ts` 中基于 Node 内置 `node:http` 与 `node:crypto` 直接实现 MCP Streamable HTTP，在同一个 `POST /mcp` 端点上同时服务两代客户端，按每个请求的开场方式分流：
  - **现代无状态（`2026-07-28`）**：请求 `params._meta` 带 `io.modelcontextprotocol/protocolVersion` 时走无状态语义，没有握手也没有会话。实现 `server/discover`（返回 `supportedVersions`、`capabilities` 等）、`tools/list`、`tools/call`、`prompts/list`、`prompts/get`。校验 `MCP-Protocol-Version`（须与 `_meta` 一致）、`Mcp-Method`，以及 `tools/call` / `prompts/get` 的 `Mcp-Name`；缺失或不一致返回 HTTP 400 + `-32020`（HeaderMismatch），版本不支持返回 400 + `-32022` 并在 `data.supported` 列出支持版本，未知方法返回 404 + `-32601`。所有结果带 `resultType`，`tools/list` / `prompts/list` 结果另带 `ttlMs` 与 `cacheScope`。
  - **旧代握手（`2025-03-26`）**：`initialize` 请求选择旧语义，继续支持 `notifications/initialized`（返回 202）、`ping`、`tools/*`、`prompts/*`；不带 `MCP-Protocol-Version` 头的非现代请求按 `2025-03-26` 处理。不签发也不回显 `Mcp-Session-Id`（旧规范中会话本就可选），因此两代都无服务端会话状态。
  - `GET /mcp` 与 `DELETE /mcp` 一律返回 405（不提供 SSE 流，也没有会话可终止）。
  - 两代共用同一套鉴权/来源校验与同一条 IPC 转发路径，差异只在信封（请求头校验、`_meta`、结果附加字段）。结果字段的精确形状（`ListToolsResult` 等）实现前须对照 `2026-07-28` schema 页原文核对。
- **理由**：
  - 避免引入 `@modelcontextprotocol/sdk` 在 `zod@^4` 与 Quasar Electron esbuild 打包中的潜在版本/模块解析风险（见 `quasar.config.ts` 中对 Electron 打包的特殊处理）。
  - `2026-07-28` 修订取消了 `initialize` 握手、会话、`ping`、GET 流与 DELETE，且规范的兼容矩阵明确「仅现代客户端 + 仅旧代服务端 = 失败」，客户端回退旧握手并非强制；只实现 `2025-03-26` 会把可用性押在各家客户端是否保留回退上，因此采用双代。
  - 本服务端只需要核心的无状态 JSON-RPC 路由（约 350~500 行），手写完全透明，便于用 Vitest 针对 `127.0.0.1`、Header 校验、错误码与并发请求做 100% 确定性测试。
  - 安全校验逻辑集中在一个 HTTP 中间件入口：`Host` 白名单（`127.0.0.1:*` / `localhost:*`）、拒绝非空且非本机的 `Origin`、`crypto.timingSafeEqual` 比对 `Authorization: Bearer <token>`、请求体大小上限（如 10 MB，防止大文本加章超限又避免内存滥用）。
- **备选方案**：引入 `@modelcontextprotocol/sdk`。若未来需要扩展复杂 MCP 特性（如服务端主动 sampling / SSE 推送订阅），再平滑迁移至官方 SDK 也不影响内核与 IPC 边界。

### 3. 主进程 <-> 渲染进程请求关联 IPC 协议
- **决策**：新增 `src-electron/mcp-ipc.ts` 并在 `electron-preload.ts` 暴露 `window.electronAPI.mcp`：
  - **渲染 -> 主进程**：`start(config)`、`stop()`、`updateConfig(config)`、`getStatus()`、`onStatus(cb)`、`onRequest(cb)`、`sendResponse(payload)`。
  - **主进程 -> 渲染**：每收到一次需要内核处理的 MCP 请求，主进程生成唯一 `requestId`，通过 `webContents.send('agent-mcp:request', { requestId, method, params, clientName })` 投递给渲染进程并挂起带超时（默认 60s；`DESKTOP_MCP_LONG_OPERATION_TOOLS` 中的长操作 `import_book_from_url`、`add_chapters` 放宽至 180s，清单定义在 `src/models/desktop-mcp.ts` 并有测试校验其均为已注册工具）的 Promise；渲染进程通过 `ipcRenderer.send('agent-mcp:response', { requestId, result | error })` 回传。
  - **渲染就绪信号**：页面加载完成不代表 boot 已注册请求监听。渲染进程在桥接层注册 `onRequest` 之后发送 `agent-mcp:ready`，主进程收到可信来源的就绪信号前不转发请求。主框架跨文档导航（整页重载）、`render-process-gone` 与窗口关闭都会清除就绪状态并结束挂起请求，新页面须重新就绪。
  - 窗口已销毁、页面仍在加载或渲染进程尚未就绪时，主进程立即返回 JSON-RPC `-32002` 错误，避免客户端死等。
  - 主进程对 `agent-mcp:response` 及 `start` / `stop` / `updateConfig` / `getStatus` 一律用既有 `trustedDesktopSender(event, mainWindow)`（`src-electron/trusted-sender.ts`）校验来源，非主窗口顶层页面的消息直接丢弃（主窗口为 `webSecurity: false`，不能默认信任任意 frame）。
  - `mainWindow` 会被置空并重建（macOS 关窗后 `activate` 重新 `createWindow`）：服务端每次请求时动态取当前窗口而不是缓存 `webContents`；窗口 `closed` 时立即以 `-32002` 结束所有挂起请求。
- **理由**：复用现有 `electron-preload.ts` 中 `desktop-update:prepare` / `prepared` 已验证的 `id` 关联模式，类型安全且无需在渲染进程暴露任何 Node 能力。

### 4. 精选 20 个面向工作流的聚合工具（而非透传 30+ 内部工具）
- **决策**：对外提供 20 个高内聚工具（WebMCP 通道额外暴露 `get_workflow_guide`），底层复用现有 services 与验证逻辑：
  - **应用与导航（2）**：`get_app_context`（读）、`navigate_to`（写 UI，支持跳转首页/书库/书籍/章节/段落）。
  - **书库与导入（6）**：`list_books`（读）、`get_book`（读）、`create_book`（写）、`add_chapters`（写，支持纯文本按空行/换行分段或段落数组，自动创建或追加到指定卷）、`import_book_from_url`（写，实现位于 `tools/url-import.ts`，调用 `NovelScraperFactory`；按规范化目录 URL 匹配已有书并增量合并目录，不覆盖用户改过的书名/作者/简介；每次调用抓取至多 `max_chapters` 个缺正文章节（默认 20、上限 50），返回 `pending_chapter_count` / `has_more` 供 Agent 续调；同一 URL 的重叠调用返回 `IMPORT_IN_PROGRESS`；已有正文的章节不重抓、不覆盖；新建书在未写入任何章节就失败时回滚删除空壳；失败时若书仍在书库则带回 `book_id` 且只建议 `add_chapters`，否则给出 `create_book` + `add_chapters` 的降级指引；Web 端 CORS 失败与站点不受支持同样返回结构化降级指引）、`delete_book`（危险写，仅 `full` 模式）。
  - **翻译核心循环（4）**：
    - `get_translation_chunk`（读）：分块大小取 `book.translationChunkSize`（经 `resolveTaskChunkSize`，显式 `chunk_size` 经 `resolveRuntimeTaskChunkSize`），复用 `buildChunks`、`resolveSpecialInstructionsForTask` 与术语/角色匹配；记忆使用只读的 `selectRelevantMemoriesForChunk`（返回结构化结果），**不**使用 `getRelatedMemoriesForChunk`——后者返回拼好的提示词字符串，并会写入按书共享的 `lastScoreBreakdownsByBook`，与站内同书任务并发时会互相覆盖打分明细。参数 `book_id?`、`chapter_id`、`mode: 'untranslated' | 'all'`、`cursor`、`chunk_size?`、`context_before?`（默认 3 段已译衔接）、`task_type?: 'translation' | 'polish' | 'proofreading'`（默认 `'translation'`，用于解析对应的书/章级特殊指令）。
      - **游标语义**：`cursor` 是章节原始段落序列中的起始段落索引（不是块序号）。`untranslated` 模式下每次提交后未翻集合都会缩小，块序号会跳块；因此该模式从 `cursor`（缺省为 0）起向后取第一批仍未翻译的段落，校验失败而未写入的段落在下一次不带 `cursor` 的调用中会再次返回。
    - `submit_translations`（写）：站内 `add_translation_batch` 不能直接调用——其入口要求 `aiProcessingStore` 中存在 `working` 状态的任务，`processTranslationBatch` 未导出且只做校验，真正落盘由任务侧 `onParagraphsExtracted` 回调完成。因此本工具把原文前缀校验/段落 ID 容错从 `translation-tools.ts` 抽成可共享的纯函数（站内行为与既有 `tools.test.ts` 保持不变），落盘走 `ParagraphTranslationEdit`：`append` → `{ type: 'append' }`（同 `saveLanguageParagraphResults`），`overwrite` → `{ type: 'update', translationId: <当前选中> }`，目标语言无选中译文时退化为 `append`。支持 `write_mode: 'append' | 'overwrite'`（默认跟随用户配置的 `defaultWriteMode`，即 `append`）、可选 `chapter_title_translation` 与 `model_label`，落盘后返回 `{ savedCount, failedItems, chapterTranslatedCount, chapterTotalCount, remainingUntranslatedCount, nextCursor }` 驱动 Agent 续翻。
    - `get_chapter_paragraphs`（读）：按范围或关键词检索章节段落与译文历史。
    - `update_chapter_title`（写）：独立更新章节标题译文。
  - **世界观维护（8）**：`list_terms`（读）、`upsert_terms`（写，支持单次数组批量新增/更新）、`list_characters`（读）、`upsert_characters`（写，支持批量新增/更新含性别/说话风格/别名）、`search_memories`（读，复用混合检索）、`upsert_memory`（写）、`get_special_instructions`（读）与 `update_special_instructions`（写，按读写拆分以保证 `readOnlyHint` 与权限门禁静态精确）。
  - **工作流指引（WebMCP 专用补充）**：`get_workflow_guide`（读，返回与 MCP Prompts 等价的 `translate-chapter` / `polish-chapter` / `import-and-translate` 文本）。
- **理由**：
  - 减少外部 Agent 上下文里的工具 schema 体积，同时用「打包拉取 + 批量 upsert」把翻译一章的轮次压到最低。
  - 拆分 `get_special_instructions` 与 `update_special_instructions` 让每个工具的 `readOnlyHint` 与三级权限门禁 100% 静态明确，无参数级歧义。

### 5. 外部译文 `aiModelId` 约定与兼容渲染
- **决策**：
  - `Translation.aiModelId` 保持现有 `string` 类型不变，不修改 IndexedDB / Gist 同步数据格式。
  - 外部写入的 `aiModelId` 采用规范前缀：`mcp:<sanitized-label>`（桌面 MCP 通道，未传 `model_label` 时为 `mcp:external`）或 `webmcp:<sanitized-label>`（WebMCP 通道，未传时为 `webmcp:external`）。
  - 新增纯工具函数 `src/utils/translation-model-label.ts`（`resolveTranslationModelLabel(aiModelId, models, unknownLabel)`），先查 `aiModelsStore`，未命中时解析 `mcp:` / `webmcp:` 前缀为可读标签（如 `MCP · claude-opus-4`、`WebMCP`），其余才回退 `unknownLabel`。
  - 在 `TranslationHistoryDialog.vue`（`getModelName`）与 `useBookDetailsPage.ts`（`getParagraphModelName`）统一消费该辅助函数。
  - `overwrite` 走 `reviseLanguageTranslation`，只改文本与 revision、保留原 `aiModelId`，因此覆盖后的版本仍显示原来源；外部来源标识只在 `append` 新版本上出现。
  - `append` 的两个既有约束：同语言同文本时复用已有版本而不新增；每种语言最多保留 5 个版本（新版本 + 最近 4 个），更早的版本会被逐出。
- **理由**：零 schema 破坏、完全兼容 Gist 双向同步和历史修订恢复，且老版本客户端也能无损读取该译文记录。

### 6. WebMCP 适配层与浏览器兼容性策略
- **决策**：在 `src/services/agent-mcp/webmcp-adapter.ts` 中封装探测与生命周期管理：
  - 探测顺序：`document.modelContext`（最新 W3C 草案，标记状态 `native-document`）→ `navigator.modelContext`（早期 Chrome Preview 或 `@mcp-b` polyfill 注入，标记状态 `native-navigator`）→ 均不存在时标记 `unavailable`。
  - 注册工具时为每个工具提供 `name`、`description`、`inputSchema`、`annotations: { readOnlyHint }` 与 `execute(args)`；若运行环境支持 `registerTool(def, { signal })` 则挂入批次 `AbortController`，注销时调用 `controller.abort()`；若目标对象提供 `unregisterTool(name)` 则在清理时同步调用作为兜底。
  - `registerTool` 在同名工具已存在时会抛错：权限切换与 HMR 重注册必须先完成注销再注册，并对单个工具注册失败做捕获与状态上报，不得中断其余工具。
  - 桌面端（Electron）渲染进程没有浏览器 Agent，WebMCP 开关在 Electron 下不展示、不注册。
  - 不在主 bundle 中强行引入第三方 polyfill（避免增大常规用户体积和追踪不稳定草案依赖），但适配器完全兼容页面已存在的 `@w3c/webmcp-polyfill` 或 `@mcp-b/global` 注入对象。
- **理由**：既紧跟 W3C 标准演进，又零风险地支持早期 Chrome Preview 与 MCP-B 浏览器扩展。

### 7. 设备本地配置持久化与 Gist 同步隔离
- **决策**：在 `src/models/settings.ts` 的 `AppSettings` 中新增可选字段 `agentMcp?: AgentMcpSettings`：
  ```ts
  export type AgentMcpPermissionMode = 'read_only' | 'translate_and_edit' | 'full';
  export type AgentMcpWriteMode = 'append' | 'overwrite';

  export interface AgentMcpSettings {
    desktopServerEnabled: boolean;       // 默认 false
    desktopPort: number;                 // 默认 48321 (1024..65535)
    desktopAuthToken: string;            // 首次开启或初始化时生成 32 字节 hex
    webMcpEnabled: boolean;              // 默认 false
    permissionMode: AgentMcpPermissionMode; // 默认 'translate_and_edit'
    defaultWriteMode: AgentMcpWriteMode; // 默认 'append'
    notifyOnWrite: boolean;              // 默认 true
  }
  ```
  沿用**设备本地字段**（`syncs`、`memoryInjection.embeddingModelCached`）的处理路径，而不是 `tavilyApiKey` / `firecrawlApiKey`——后两者实际会随 Gist 同步并按 `apiKeysUpdatedAt` 合并（`services/settings/api-keys.ts`）：
  - 上传与 manifest 哈希：在 `src/utils/sync-strip.ts` 的 `stripAppSettingsLocalFields` 中剥离 `agentMcp`（调用点 `useSyncExecutor.ts`、`sync-local-checkpoint.ts`），开关/端口变化不会造成设置哈希变化。
  - 下载合并：`settingsStore.importSettings` 忽略传入的 `agentMcp`，保留本机值。
  - 恢复修订 / 强制下载：`settingsStore.replaceSettingsFromSyncSnapshot` 以默认值为基线重建设置，必须像 `embeddingModelCached` 一样显式带回本机 `agentMcp`，否则会被清空并关停服务。
  - 备份文件：`useSettingsImportExport` 导出的是未剥离的 `getAllSettings()`，导出前同样剥离 `agentMcp`；导入他机备份经 `importSettings`，不会改动本机 MCP 配置。
- **理由**：与既有设备本地字段机制一致，零额外存储表，且确保 Token 与本机端口不经 Gist 或备份文件外泄。

### 8. 独立一级工作台 `/mcp` 与三变体页面结构
- **决策**：
  - 路由：`{ path: 'mcp', component: () => import('src/pages/AgentMcpPage.vue') }`。
  - 文件组织严格遵循 `device-variant-dispatch` 与 `desktop-tool-pages`：
    - `src/pages/AgentMcpPage.vue`（Dispatcher，调用 `provideAgentMcpPage()`）
    - `src/pages/agent-mcp/AgentMcpDesktop.vue`（双栏桌面工作台：左栏按运行环境分别展示 Electron 本地 MCP 服务端端口/Token 或 Web 桌面端 WebMCP 开关与检测状态，外加通用权限/写回策略；右栏按环境适配的客户端接入片段 + 工具目录与实时活动日志）
    - `src/pages/agent-mcp/AgentMcpTablet.vue`（复用/适配桌面布局）
    - `src/pages/agent-mcp/AgentMcpMobile.vue`（单列卡片流，适合移动端查看状态与调整 WebMCP/权限）
    - `src/composables/agent-mcp-page/useAgentMcpPage.ts`（`provideAgentMcpPage` / `injectAgentMcpPage`，保存跨断点存活的选中配置 Tab、工具搜索词、端口草稿等状态）
    - `src/components/agent-mcp/`（共享 UI 碎片：连接状态卡、客户端配置片段卡、工具目录与实时日志面板，消除三变体模板重复）。
  - 导航入口：
    - `MainNavTab` / `MainNavTarget` 新增 `'mcp'`；
    - `AppSideMenu.vue` 与 `TabletNavRail.vue` 在主功能区 `ai` 之后加入 `mcp` 入口；
    - `MobileTabBar.vue` 保持现有 5 个核心 tab 不变，在 `IndexPage` 快捷入口或 `SettingsPage` 通用区提供跳转 `/mcp` 的卡片/入口，保证手机端可达。
  - 启动初始化：新增 `src/boot/agent-mcp.ts`（在 `quasar.config.ts` 的 `boot` 列表中注册），应用启动且 settings 加载完成后，按运行环境分别同步：Electron 仅同步本地 MCP 服务端状态（不注册 WebMCP），浏览器端仅同步 WebMCP 注册状态（均默认关闭，仅在用户上次已开启时恢复）。

## Risks / Trade-offs

- **[Risk] 本机其他网页尝试通过 `localhost` 访问 Electron MCP 端口（DNS Rebinding / CSRF）** → **Mitigation**: 强制仅绑定 `127.0.0.1`、强制校验 `Host` 为回环地址、拒绝携带非本机 `Origin` 的浏览器请求、每个请求均校验高熵 Bearer Token，且服务默认关闭。
- **[Risk] 外部 Coding Agent 与用户同时编辑同一章节导致竞态覆盖** → **Mitigation**: 写回路径全部走 `booksStore.editParagraphTranslations` → `LibraryPersistence` 事务（原文变化时以 `PARAGRAPH_SOURCE_CHANGED` 拒绝）；默认采用 `append` 新增译文版本并选中，不改写用户当前版本。但每种语言最多保留 5 个版本，Agent 对同一段反复提交不同译文会逐出最早的版本（可能包含用户手改版本）——工作流模板要求 Agent 不对同一段重复提交，帮助文档说明该上限。
- **[Risk] 浏览器 WebMCP 标准仍在快速演进，不同浏览器/扩展 API 形态存在差异** → **Mitigation**: 将 WebMCP 适配隔离在单一文件 `webmcp-adapter.ts`，同时兼容 `document.modelContext` 与 `navigator.modelContext`、`AbortSignal` 与 `unregisterTool`；后续规范稳定时只需改这一个适配文件。
- **[Risk] 超长章节调用 `get_translation_chunk` 或 `add_chapters` 触发 IPC/HTTP 载荷过大或超时** → **Mitigation**: `get_translation_chunk` 强制按 `chunk_size` 分块（带硬上限保护）并返回游标分批拉取；Electron HTTP 端设 10 MB 请求体上限，长耗时爬虫调用配置独立超时阈值。
- **[Risk] 活动日志在长时间翻译任务中无限增长占内存** → **Mitigation**: `useAgentMcpStore` 中的调用活动日志采用固定容量环形上限（例如保留最近 200 条），仅存内存不落盘，支持手动清空。

## Migration Plan

1. **零破坏平滑上线**：`agentMcp` 字段为 `AppSettings` 可选属性，旧版用户升级后自动补齐安全默认值（`desktopServerEnabled: false`、`webMcpEnabled: false`、`permissionMode: 'translate_and_edit'`、`defaultWriteMode: 'append'`），对未启用该功能的用户无任何运行时开销或端口监听。
2. **回滚策略**：如需紧急停用，只需在 `quasar.config.ts` 移除 `agent-mcp` boot 或将服务开关置为关闭；已由外部 Agent 写入的译文均为标准 `Translation` 记录，不受回滚影响，仍可正常阅读、切换历史版本与 Gist 同步。
