# Tsukuyomi（月詠）翻譯器使用指南 {#front-page-section-1}

歡迎使用 **Tsukuyomi**。本文檔用於快速瞭解當前版本的主要功能與使用路徑。

---

## 🌐 介面與書籍語言 {#front-page-languages}

- 首次使用時匹配系統語言；可在 **設定 → 通用設定 → 介面語言** 選擇簡體中文、繁體中文或 English，選擇會隨應用設定同步。
- 手動建立、網站匯入或 AI 匯入真正建立新書時，以當時的介面語言設定書籍目標。AI 匯入任務開始或預覽時的語言不決定新書目標。
- 已有書籍的目標不隨介面切換；可在 **書籍詳情 → 設定 → 翻譯設定** 單獨更改。舊書和未標記的舊譯文歸為簡體中文。
- 原文不限語言，由 AI 按段落判斷，同一本書可以混用語言。已經是目標語言的段落可原樣儲存並計為已處理；簡繁轉換仍按目標生成。
- 各目標語言分別保留段落版本、選用及卷章標題、術語、角色、別名譯名。缺段落或標題譯文時顯示原文；缺術語、角色或別名譯名時保持空白。

## 🚀 快速開始 {#front-page-section-2}

### 1) 配置 AI 模型 {#front-page-section-3}

1. 進入左側導航 **AI列表**。
2. 新增模型並填寫必要資訊：
   - 提供商目前支持 **OpenAI** 與 **Gemini**。
   - 填寫 API Key。
   - OpenAI 需填寫基礎地址（Base URL）；Gemini 可不填。
3. 可點選“獲取模型資料”從內置的 models.dev 目錄讀取上下文視窗與輸出上限，用“測試可用性”確認連線正常，再儲存。

> 💡 詳見 [AI 模型配置](/help/ai-models-guide)。

### 2) 建立並匯入書籍 {#front-page-section-4}

1. 進入左側導航 **書籍列表**。
2. 點選“新建書籍”，手動錄入基礎資訊。
3. 小說站點鏈接可通過「從網站匯入」檢查並選擇章節；TXT、Markdown、HTML、EPUB 或其他網站來源可進入 **AI 匯入**，由月詠整理草稿，確認方案後匯入。

> 💡 詳見 [書籍列表頁](/help/books-page-guide) 與 [AI 匯入工作台](/help/import-guide)。

### 3) 開始翻譯 {#front-page-section-5}

1. 打開任一本書進入書籍詳情頁。
2. 在章節面板中添加章節或抓取章節。
3. 選擇章節後使用工具欄觸發翻譯、潤色、校對等任務。

> 💡 詳見 [書籍詳情頁概覽](/help/book-details-overview) 與 [AI 翻譯功能](/help/book-details-translation)。

---

## ✨ 核心能力概覽 {#front-page-section-6}

### 📖 翻譯與編輯 {#front-page-section-7}

- 支持段落級翻譯結果與多版本切換。
- 支持翻譯模式、原文編輯模式、譯文預覽模式。
- 支持搜索/替換與撤銷/重做。
- 支持鍵盤快捷鍵提升編輯效率。

> 💡 詳見 [內容編輯](/help/book-details-editing)。

### 🧩 術語、角色與記憶 {#front-page-section-8}

- **術語設定**：維護專有名詞及譯法。
- **角色設定**：維護角色資訊、別名與表達風格。
- **記憶管理**：維護劇情與背景記憶，並可按類型篩選。
- 在翻譯過程中，AI 可能自動建立或更新這些資料，建議人工復核。

> 💡 詳見 [術語管理](/help/book-details-terminology)、[角色設定管理](/help/book-details-characters)、[記憶管理](/help/book-details-memory)。

### 🤖 任務類型 {#front-page-section-9}

- 翻譯（Translation）
- 潤色（Polish）
- 校對（Proofreading）

> AI 章節摘要功能已在 v0.12 移除，改由 [本地嵌入](/help/local-embedding) + `query_chapter` 工具按需檢索原文。

### 💬 月詠 · 聊天助手 {#front-page-section-10}

應用內 AI 助手以**月詠（Tsukuyomi）**為名——月下學者、本應用之化身。

- 可針對當前書籍上下文進行問答。
- 可協助查詢與操作術語、角色、記憶等資料。
- 可讀取幫助文檔並在需要時導航到指定幫助頁面。
- 簡繁中文對話以學者口吻自指「月詠」/「妾身」，英文對話採用中性專業表達；寫入資料庫的譯文本體始終使用書籍目標語言，不帶助手口吻。

> 💡 詳見 [月詠 · 聊天助手](/help/chat-assistant-guide)。

### 🛠️ 系統欄與右欄 {#front-page-section-11}

- **AI 思考過程**：查看任務狀態與思考流。
- **同步狀態**：查看 Gist 同步狀態與入口。
- **訊息歷史**：查看系統提示與通知歷史。
- **月詠 / 翻譯進度**：右欄圖標軌道，分別打開聊天助手與翻譯進度面板。
- **向量索引**（僅書籍詳情頁 + 啟用本地嵌入時）：查看與重建本書的章節 / 記憶向量。

> 💡 詳見 [系統欄與導航](/help/toolbar-guide)、[本地嵌入](/help/local-embedding)。

### 💾 資料與同步 {#front-page-section-12}

- 資料本地存儲（IndexedDB）。
- 支持 GitHub Gist 同步。
- 支持“匯入/匯出資料”進行備份與遷移。

> 💡 詳見 [設定說明](/help/settings-guide)。

---

## ✅ 使用建議 {#front-page-section-13}

1. 先配置好預設模型，再開始大批量翻譯。
2. 先完成章節結構，再分批翻譯與復核。
3. 翻譯後及時檢查術語、角色、記憶的自動更新結果。
4. 定期匯出資料，重要項目建議保留多份備份。

---

## ❓ 常見問題 {#front-page-section-14}

**Q: 翻譯任務中斷怎麼辦？**

A: 優先檢查 API Key、模型可用性與網路連線，再重試任務。

**Q: 可以為不同任務使用不同模型嗎？**

A: 可以。在設定中的 AI 模型預設設定里，可分別指定翻譯、校對/潤色、術語翻譯、助手模型。

**Q: 匯入資料會影響現有資料嗎？**

A: 會。匯入會覆蓋當前資料，建議先匯出一份本地備份。

---

## 📚 相關文檔 {#front-page-section-15}

- [快速開始](/help/front-page)（本文）
- [主頁介紹](/help/library-guide)
- [書籍列表頁](/help/books-page-guide)
- [AI 匯入工作台](/help/import-guide)
- [AI 模型配置](/help/ai-models-guide)
- [聊天助手](/help/chat-assistant-guide)
- [頂部工具欄](/help/toolbar-guide)
- [設定說明](/help/settings-guide)
- [書籍詳情頁概覽](/help/book-details-overview)
- [章節管理](/help/book-details-chapters)
- [內容編輯](/help/book-details-editing)
- [AI 翻譯功能](/help/book-details-translation)
- [術語管理](/help/book-details-terminology)
- [角色設定管理](/help/book-details-characters)
- [記憶管理](/help/book-details-memory)
