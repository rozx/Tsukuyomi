# 外部 Agent 與 MCP 接入指南 {#agent-mcp-guide-section-1}

透過 **外部 Agent 工作台**（`/mcp`），你可以讓 Claude Code、Pi、Antigravity 或支援 WebMCP 的瀏覽器 Agent 直接操控 Tsukuyomi，使用現有 Agent 訂閱額度完成建立書籍、新增章節、維護設定與分塊翻譯。

## 執行模式 {#agent-mcp-guide-section-2}

### 桌面版：本機 Streamable HTTP MCP 服務端 {#agent-mcp-guide-section-3}

- 僅監聽本機迴路位址 `127.0.0.1`（預設連接埠 `48321`），預設關閉，需要在 `/mcp` 頁面手動開啟。
- 強制驗證 `Authorization: Bearer <token>`、`Host` 與 `Origin`，防止跨站網頁誤存取。
- 同一 `POST /mcp` 端點同時相容 `2026-07-28` 無狀態協定（`server/discover`）與 `2025-03-26` 握手協定（`initialize`）。
- 本機連接埠、Bearer Token、服務開關與權限模式僅儲存在目前裝置，不會同步到 GitHub Gist，也不會包含在匯出備份檔案中。

### 瀏覽器版：WebMCP 橋接 {#agent-mcp-guide-section-4}

- 在瀏覽器版開啟 `/mcp` 頁面時，應用會自動偵測 `document.modelContext` 或 `navigator.modelContext`。
- 開啟「啟用 WebMCP 工具註冊」後，目前權限允許的工具（以及唯讀工作流指南 `get_workflow_guide`）會自動註冊到瀏覽器模型上下文。
- 瀏覽器環境因跨網域限制無法抓取部分站點時，可讓 Agent 自行取得正文後呼叫 `create_book` 與 `add_chapters` 直接匯入。

## 權限分級與多版本寫回 {#agent-mcp-guide-section-5}

- **僅唯讀（`read_only`）**：僅開放書庫、章節、術語、角色、記憶查詢與分塊上下文拉取。
- **讀寫翻譯與設定（`translate_and_edit`，預設）**：允許建書、匯入、批次加章、提交譯文與維護術語/角色/記憶，但禁止刪除書籍。
- **完全控制（`full`）**：額外開放 `delete_book`。
- **譯文版本策略**：預設以 `append` 追加新譯文版本並設為選中；每種語言每段最多保留 5 個歷史版本，超過上限時會逐出最早版本，因此請避免對同一段落反覆提交不同譯文。

## 推薦翻譯工作流 {#agent-mcp-guide-section-6}

1. 在 `/mcp` 頁面開啟服務並複製對應客戶端（Claude Code / Pi / Antigravity）的設定片段。
2. 在外部 Agent 中呼叫 `translate-chapter` 或 `import-and-translate` 工作流（長篇網頁小說透過 `import_book_from_url` 預設按批抓取最多 20 章，可依回傳的 `pending_chapter_count` 重複呼叫續傳，並透過 `max_chapters` 調整單批章數）。
3. 譯文寫入後會立即更新書庫與閱讀頁面，譯文歷史會顯示對應的外部來源標籤（例如 `MCP · claude-opus-4`）。
