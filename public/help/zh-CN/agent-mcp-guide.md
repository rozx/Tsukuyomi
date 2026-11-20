# 外部 Agent 与 MCP 接入指南 {#agent-mcp-guide-section-1}

通过 **外部 Agent 工作台**（`/mcp`），你可以让 Claude Code、Pi、Antigravity 或支持 WebMCP 的浏览器 Agent 直接操控 Tsukuyomi，使用已有 Agent 订阅额度完成建书、加章、维护设定与分块翻译。

## 运行模式 {#agent-mcp-guide-section-2}

### 桌面版：本地 Streamable HTTP MCP 服务端 {#agent-mcp-guide-section-3}

- 仅绑定本机回环地址 `127.0.0.1`（默认端口 `48321`），默认关闭，需要在 `/mcp` 页面手动开启。
- 强制校验 `Authorization: Bearer <token>`、`Host` 与 `Origin`，防止跨站网页误访问。
- 同一 `POST /mcp` 端点同时兼容 `2026-07-28` 无状态协议（`server/discover`）与 `2025-03-26` 握手协议（`initialize`）。
- 本机端口、Bearer Token、服务开关与权限模式仅保存于当前设备，不会同步到 GitHub Gist，也不会包含在导出备份文件中。

### 浏览器版：WebMCP 桥接 {#agent-mcp-guide-section-4}

- 在浏览器版打开 `/mcp` 页面时，应用会自动检测 `document.modelContext` 或 `navigator.modelContext`。
- 在页面第一步开启 WebMCP 后，当前权限允许的工具（及只读工作流指南 `get_workflow_guide`）会自动注册到浏览器模型上下文。
- 浏览器没有提供 WebMCP 接口时开关不可用，页面会按浏览器给出开启办法：Chrome 在 `chrome://flags/#enable-webmcp-testing` 把「WebMCP for testing」设为 Enabled 后重启；Edge 在 `edge://flags` 搜索 WebMCP；Firefox 与 Safari 目前没有原生支持，请改用 Chrome 或 Edge。该接口只在 HTTPS 或 localhost 页面上提供。
- 浏览器环境因跨域限制无法抓取部分站点时，可让 Agent 自行获取正文后调用 `create_book` 与 `add_chapters` 直接导入。

## 权限分级与多版本写回 {#agent-mcp-guide-section-5}

- **仅只读（`read_only`）**：仅开放书库、章节、术语、角色、记忆查询与分块上下文拉取。
- **翻译与编辑（`translate_and_edit`，默认）**：允许建书、导入、批量加章、检查并导入书籍更新、提交译文与维护术语/角色/记忆，但禁止删除书籍。
- **完全控制（`full`）**：额外开放 `delete_book`；切换到该模式时页面会要求再确认一次。
- **译文版本策略**：默认以 `append` 追加新译文版本并设为选中；每种语言每段最多保留 5 个历史版本，超过上限时会逐出最早版本，因此请避免对同一段落反复提交不同译文。

## 推荐翻译工作流 {#agent-mcp-guide-section-6}

1. 在 `/mcp` 页面按顺序完成三步：开启服务 → 把配置复制到客户端（Claude Code / Pi / Antigravity）→ 复制「快速上手指南」并粘贴给 Agent。服务没有运行时配置不可复制。
2. 「快速上手指南」是一份给 Agent 看的通用说明：有哪些工具、怎样了解书库现状、翻译 / 润色 / 导入 / 跟进更新各用哪些工具，以及必须遵守的规则。可以直接粘贴到对话里，也可以放进 Agent 的项目说明文件。
3. 大部头网页小说通过 `import_book_from_url` 默认按批抓取最多 20 章，可按返回的 `pending_chapter_count` 重复调用续传，并通过 `max_chapters` 调节单批章数。
4. 连载中的书籍可用 `check_book_updates` 检查来源站点的新章节，再用 `apply_book_updates` 导入。默认只导入新章节；应用已导入章节的正文改动（`include_updated`）会清除被改段落的译文。
5. 翻译落盘后会立即刷新书库与阅读页面，页面上的「调用活动」会实时显示每次工具调用，译文历史中会展示对应的外部来源标签（如 `MCP · claude-opus-4`）。
