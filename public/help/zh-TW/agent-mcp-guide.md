# 外部 Agent 與 MCP 接入指南 {#agent-mcp-guide-section-1}

透過 **外部 Agent 工作台**（`/mcp`），你可以讓 Claude Code、Pi、Antigravity 等本機 Agent 直接操控 Tsukuyomi，使用現有 Agent 訂閱額度完成建立書籍、新增章節、維護設定與分塊翻譯。

## 執行模式 {#agent-mcp-guide-section-2}

### 桌面版：本機 Streamable HTTP MCP 服務端 {#agent-mcp-guide-section-3}

- 僅監聽本機迴路位址 `127.0.0.1`（預設連接埠 `48321`），預設關閉，需要在 `/mcp` 頁面手動開啟。
- 強制驗證 `Authorization: Bearer <token>`、`Host` 與 `Origin`，防止跨站網頁誤存取。
- 同一 `POST /mcp` 端點同時相容 `2026-07-28` 無狀態協定（`server/discover`）與 `2025-03-26` 握手協定（`initialize`）。
- 本機連接埠、Bearer Token、服務開關與權限模式僅儲存在目前裝置，不會同步到 GitHub Gist，也不會包含在匯出備份檔案中。

### 瀏覽器版：WebMCP 本機中繼 {#agent-mcp-guide-section-4}

- 瀏覽器版透過 **WebMCP 本機中繼**（`@mcp-b/webmcp-local-relay`）讓 Claude Code、Cursor 等本機 Agent 使用本頁的工具，不需要開啟瀏覽器的實驗開關。
- 在頁面第一步開啟 WebMCP 後，應用會在本頁註冊目前權限允許的工具（含唯讀的工作流指南 `get_workflow_guide`），並連線到你電腦上執行的中繼。
- 在 Agent 用戶端裡加入中繼：Claude Code 執行 `claude mcp add webmcp-local-relay -- npx -y @mcp-b/webmcp-local-relay@latest --widget-origin <本頁位址>`，其他用戶端把頁面給出的 JSON 合併到 MCP 設定裡。需要 Node.js 22 或更高版本。頁面給出的設定已經填好本頁位址，中繼只接受來自它的連線。
- 讓 Agent 呼叫 `webmcp_list_sources`，能看到本頁就表示已連線。工具列表裡看不到本頁工具時，可用 `webmcp_list_tools` 列出、`webmcp_call_tool` 按名稱呼叫。
- 使用期間請保持本頁開啟：工具來自這個分頁，關閉或重新整理後 Agent 會暫時看不到它們。
- 本頁必須透過 HTTPS 或 localhost 開啟，否則無法開啟。
- 瀏覽器環境因跨網域限制無法抓取部分站點時，可讓 Agent 自行取得正文後呼叫 `create_book` 與 `add_chapters` 直接匯入。

## 權限分級與多版本寫回 {#agent-mcp-guide-section-5}

- **僅唯讀（`read_only`）**：僅開放書庫、章節、術語、角色、記憶查詢與分塊上下文拉取。
- **翻譯與編輯（`translate_and_edit`，預設）**：允許建書、匯入、批次加章、檢查並匯入書籍更新、提交譯文與維護術語/角色/記憶，但禁止刪除書籍。
- **完全控制（`full`）**：額外開放 `delete_book`；切換到該模式時頁面會要求再確認一次。
- **譯文版本策略**：預設以 `append` 追加新譯文版本並設為選中；每種語言每段最多保留 5 個歷史版本，超過上限時會逐出最早版本，因此請避免對同一段落反覆提交不同譯文。

## 推薦翻譯工作流 {#agent-mcp-guide-section-6}

1. 在 `/mcp` 頁面只需要兩步：開啟服務，然後複製「快速上手指南」並貼給 Agent。
2. 指南開頭的「首次設定」會讓 Agent 替你完成準備：詢問並建立專案資料夾、在其中設定好這個 MCP、把指南保存為該資料夾裡的 AGENTS.md（Claude Code 另建一個引用它的 CLAUDE.md）。之後在這個資料夾裡啟動 Agent 就能直接工作，不用再貼上。指南後面是資料模型、全部工具、分步工作流程、規則與出錯處理。桌面版的指南裡包含存取權杖，不要把這個資料夾提交到公開儲存庫。想自己在用戶端裡加入 MCP 時，展開頁面上的「手動加入 MCP」。
3. 長篇網頁小說透過 `import_book_from_url` 預設按批抓取最多 20 章，可依回傳的 `pending_chapter_count` 重複呼叫續傳，並透過 `max_chapters` 調整單批章數。
4. 連載中的書籍可用 `check_book_updates` 檢查來源站點的新章節，再用 `apply_book_updates` 匯入。預設只匯入新章節；套用已匯入章節的正文改動（`include_updated`）會清除被改段落的譯文。
5. 譯文寫入後會立即更新書庫與閱讀頁面，頁面上的「呼叫活動」會即時顯示每次工具呼叫，譯文歷史會顯示對應的外部來源標籤（例如 `MCP · claude-opus-4`）。
