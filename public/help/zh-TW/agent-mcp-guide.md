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
- 在頁面第一步開啟 WebMCP 後，目前權限允許的工具（以及唯讀工作流指南 `get_workflow_guide`）會自動註冊到瀏覽器模型上下文。
- 瀏覽器沒有提供 WebMCP 介面時開關無法使用，頁面會依瀏覽器給出開啟辦法：Chrome 在 `chrome://flags/#enable-webmcp-testing` 把「WebMCP for testing」設為 Enabled 後重新啟動；Edge 在 `edge://flags` 搜尋 WebMCP；Firefox 與 Safari 目前沒有原生支援，請改用 Chrome 或 Edge。該介面只在 HTTPS 或 localhost 頁面上提供。
- 瀏覽器環境因跨網域限制無法抓取部分站點時，可讓 Agent 自行取得正文後呼叫 `create_book` 與 `add_chapters` 直接匯入。

## 權限分級與多版本寫回 {#agent-mcp-guide-section-5}

- **僅唯讀（`read_only`）**：僅開放書庫、章節、術語、角色、記憶查詢與分塊上下文拉取。
- **翻譯與編輯（`translate_and_edit`，預設）**：允許建書、匯入、批次加章、檢查並匯入書籍更新、提交譯文與維護術語/角色/記憶，但禁止刪除書籍。
- **完全控制（`full`）**：額外開放 `delete_book`；切換到該模式時頁面會要求再確認一次。
- **譯文版本策略**：預設以 `append` 追加新譯文版本並設為選中；每種語言每段最多保留 5 個歷史版本，超過上限時會逐出最早版本，因此請避免對同一段落反覆提交不同譯文。

## 推薦翻譯工作流 {#agent-mcp-guide-section-6}

1. 在 `/mcp` 頁面依序完成三步：開啟服務 → 把設定複製到用戶端（Claude Code / Pi / Antigravity）→ 複製「快速上手指南」並貼給 Agent。服務沒有執行時設定無法複製。
2. 「快速上手指南」是一份給 Agent 看的通用說明：有哪些工具、怎樣了解書庫現狀、翻譯 / 潤飾 / 匯入 / 跟進更新各用哪些工具，以及必須遵守的規則。可以直接貼到對話裡，也可以放進 Agent 的專案說明檔。
3. 長篇網頁小說透過 `import_book_from_url` 預設按批抓取最多 20 章，可依回傳的 `pending_chapter_count` 重複呼叫續傳，並透過 `max_chapters` 調整單批章數。
4. 連載中的書籍可用 `check_book_updates` 檢查來源站點的新章節，再用 `apply_book_updates` 匯入。預設只匯入新章節；套用已匯入章節的正文改動（`include_updated`）會清除被改段落的譯文。
5. 譯文寫入後會立即更新書庫與閱讀頁面，頁面上的「呼叫活動」會即時顯示每次工具呼叫，譯文歷史會顯示對應的外部來源標籤（例如 `MCP · claude-opus-4`）。
