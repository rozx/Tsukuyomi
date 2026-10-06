# 📖 書籍詳情頁概覽 {#book-details-overview-section-1}

書籍詳情頁（路由 `/books/:id`）是單本書的核心工作區。所有翻譯、術語 / 角色 / 記憶維護、匯出、與 AI 互動都集中在這裡。

介面語言與書籍目標獨立：在書籍翻譯設定選擇簡中、繁中或英文。段落、卷章標題按目標讀取，缺譯文回原文；術語、角色及別名缺目標譯名時為空。舊書和未標記譯文歸簡中，各語言成果分別保留，切換目標不自動翻譯。原文不限語言，可同書混用。

> v0.12.1 起桌面端整體調整：側欄寬度收緊、SETTINGS 入口收納為可折疊分組、刪除冗余的「返回」與「目錄」副標題（頂欄 breadcrumb 替代）；翻譯進度面板移到全域右欄的「翻譯進度」入口，跨頁面均可訪問。本指南按設備變體描述。
>
> v0.12 起 **AI 章節摘要功能已移除**：AI 不再為每章預生成摘要，而是在需要時通過 `query_chapter` 工具按語義檢索原文（依賴[本地嵌入](/help/local-embedding)）。

---

## 🖥️ 桌面端佈局 {#book-details-overview-section-2}

```
+------------------------------------------------+
|  Workbench Header (book title + breadcrumb)    |
+--------------+---------------------------------+
|              |                                 |
|  Sidebar     |   Workspace                     |
|              |   (chapter content / settings)  |
|  BOOK card   |                                 |
|   cover      |   - ChapterToolbar              |
|   + stats    |   - SearchToolbar               |
|              |   - ChapterContentPanel         |
|  SETTINGS    |     or TerminologyPanel /       |
|   - Translation |     CharacterSettingPanel /  |
|   - Terms    |        MemoryPanel /            |
|   - Chars    |        BookUpdatePanel          |
|   - Memory   |                                 |
|   - Update   |                                 |
|              |                                 |
|  Catalog     |                                 |
|   volumes    |                                 |
|   + chapters |                                 |
|              |                                 |
+--------------+---------------------------------+
```

### 側欄（左） {#book-details-overview-section-3}

側欄從上到下分為三部分：

#### 1) BOOK — 書籍卡 {#book-details-overview-section-4}

顯示封面 + 標題 + 卷 / 章 / 字數三聯統計。點選任意位置即可打開 `BookDialog` 編輯書籍資訊（標題、作者、簡介、標籤、封面、別名、Web URL、書籍級特殊指令）。

#### 2) SETTINGS — 可折疊分組 {#book-details-overview-section-5}

展開 / 折疊按鈕控制是否顯示文字標籤：

- **展開態**：顯示 `SETTINGS` eyebrow + 收起按鈕，5 個項以圖標 + 文字呈現：
  - ⚙️ 翻譯設定 → 進入書籍級翻譯設定面板，管理顯示規則、任務分塊與本書模型覆蓋
  - 🔖 術語設定 → 進入 `TerminologyPanel`
  - 👥 角色設定 → 進入 `CharacterSettingPanel`
  - 🗄 記憶管理 → 進入 `MemoryPanel`
  - ⬇ 檢查更新 → 進入 `BookUpdatePanel`，按來源配方回放目錄，確認後再寫入新章節與更新
- **折疊態**（預設）：5 個圖標按鈕 + 1 個 chevron 展開按鈕。

折疊狀態由 `ui.bookSettingsMenuExpanded` 持久化，跨會話保留偏好。

#### 3) 目錄 — 卷 / 章節列表 {#book-details-overview-section-6}

- **新建**：「+ 新卷」「+ 新章節」按鈕位於目錄頂部。
- **卷展開 / 折疊**：點選卷名旁的箭頭切換。
- **拖曳排序**：章節支持跨卷拖曳。
- **章節標題翻譯**：每章可獨立設定翻譯標題。
- **章節級特殊指令**：在章節項上下文菜單或編輯對話框中維護。

> 桌面端 BOOK 卡片下方的「返回」按鈕已被移除。回到書籍列表請用頂部 sysbar 的 breadcrumb，或左欄的「書籍列表」入口。

### 工作區（右） {#book-details-overview-section-7}

工作區根據當前選中狀態切換顯示內容：

| 選中項       | 顯示內容                                                         |
| :----------- | :--------------------------------------------------------------- |
| 一個章節     | `ChapterContentPanel`（按編輯模式渲染）                          |
| 「翻譯設定」 | `BookTranslationSettingsPanel`（書籍級設定、分塊大小與模型覆蓋） |
| 「術語設定」 | `TerminologyPanel`                                               |
| 「角色設定」 | `CharacterSettingPanel`                                          |
| 「記憶管理」 | `MemoryPanel`                                                    |
| 「檢查更新」 | `BookUpdatePanel`（同步工作區）                                  |

進入設定面板時，工作區頂部會顯示「Translation / Terms / Characters / Memory / Update」eyebrow + 名稱 + 圖標的上下文標籤。

---

## 📱 平板端佈局 {#book-details-overview-section-8}

平板端與桌面端共享側欄 + 工作區結構，但有幾個差異：

- **側欄可收起**：預設展開，工具欄右上角有按鈕收起為窄軌道；通過 `ctx.isTabletSidebarOpen` 控制。
- **章節工具欄使用 `ChapterToolbarTablet`**：緊湊版，把次要操作收納到溢出菜單。
- **目錄使用 `VolumesListTablet`**：單列卡片樣式，觸屏點選區域更大。
- **SETTINGS 折疊狀態與桌面端共享**：在桌面端展開後切到平板端，平板側的菜單也是展開態。

---

## 📲 移動端佈局 {#book-details-overview-section-9}

移動端沒有同時可見的側欄與工作區，而是通過 `ctx.workspaceMode` 在兩個全屏視圖間切換：

| `workspaceMode` | 顯示                          |
| :-------------- | :---------------------------- |
| `'catalog'`     | 全屏目錄（書籍卡 + 章節列表） |
| `'reader'`      | 全屏章節內容                  |

切換路徑：

- 主路由進入時預設 `'catalog'`，點選章節進入 `'reader'`。
- 閱讀時點選工具欄左側的「目錄」按鈕回到 `'catalog'`。

> 移動端 SETTINGS 不在側欄渲染（節省空間）— 術語 / 角色 / 記憶通過子路由 `/books/:id/settings/(terms|characters|memory)` 進入對應專用頁面。

> 移動端不新增「翻譯設定」側欄路由態：書籍級翻譯設定位於閱讀器齒輪底部抽屜的「全域設定」頁簽；「檢查更新」從書籍概覽進入 `/books/:id/settings/update`，以全屏頁面顯示同步工作區。桌面 / 平板則使用側欄路由面板。

> 窄螢幕版面沒有右欄軌道；桌面瀏覽器縮窄視窗後，啟用本機嵌入時可從頂部工具列開啟「向量索引」。實體行動裝置仍強制停用本機嵌入，保留關鍵詞 + 時間衰減的記憶選擇，不提供 `query_chapter`。

---

## ✨ 核心能力（跨變體） {#book-details-overview-section-10}

下列能力在所有設備變體上都可用：

### 1) 章節結構管理 {#book-details-overview-section-11}

- 新建、編輯、刪除卷與章節。
- 章節拖曳排序（含跨卷）。
- 章節標題翻譯、章節級特殊指令、章節資訊維護。

### 2) 三種編輯模式 {#book-details-overview-section-12}

`useEditMode` 提供三種模式（預設 `translation`）：

| 模式                          | 用途                                                                             |
| :---------------------------- | :------------------------------------------------------------------------------- |
| **原始文本（`original`）**    | 編輯任意語言的章節原文，原文變化使該段所有語言譯文與選用失效；未變化段落保留成果 |
| **翻譯模式（`translation`）** | 段落級原文 / 譯文操作，是預設工作模式                                            |
| **預覽模式（`preview`）**     | 面向閱讀的譯文預覽；未翻譯段落會以提示樣式呈現                                   |

### 3) 段落與章節操作 {#book-details-overview-section-13}

- 段落級：重譯、潤色、校對、添加翻譯版本（每段支持多版本切換）。
- 章節級：全章翻譯 / 潤色 / 校對，或僅翻譯未翻譯段落。
- 點選工具欄的術語 / 角色 / 記憶按鈕（帶使用計數徽章）打開本章對應面板，復核一致性。

### 4) 搜索與快捷鍵 {#book-details-overview-section-14}

桌面端 `ChapterToolbar` 保留以下快捷鍵：

| 快捷鍵              | 功能                |
| :------------------ | :------------------ |
| `Ctrl+F`            | 打開 / 關閉查找     |
| `Ctrl+H`            | 打開 / 關閉替換     |
| `F3` / `Shift+F3`   | 下一個 / 上一個匹配 |
| `Esc`               | 關閉搜索工具欄      |
| `Ctrl+Z` / `Ctrl+Y` | 撤銷 / 重做         |
| `Ctrl+Shift+C`      | 複製本章已翻譯文本  |

撤銷 / 重做按鈕上會顯示具體的操作描述（如「撤銷: 翻譯第 12 段」）。

### 5) 匯出能力 {#book-details-overview-section-15}

章節工具欄的「匯出」菜單支持：

- **格式**：原文 / 譯文 / 雙語
- **目標**：複製到剪貼板 / 匯出 JSON / 匯出 TXT

支持以單章為單位匯出，也可在書籍列表頁針對整本書批量匯出。

譯文與雙語匯出使用書籍當前目標的選用，缺失處保留原文。英文譯文不強制套用中文標點，原文回退不作為譯文規範化；完整備份則包含所有語言成果。

### 6) AI 上下文檢索 {#book-details-overview-section-16}

- **`search_memories` 工具**：AI 可按自然語言搜索記憶庫，命中的條目臨時注入翻譯上下文。
- **`query_chapter` 工具**（依賴本地嵌入開啟）：AI 可按自然語言搜索本書章節內容（包括標題型、劇情型、人物型 query），無需使用者預先生成章節摘要。

詳見 [AI 翻譯功能](/help/book-details-translation) 與 [本地嵌入](/help/local-embedding)。

---

## 🚀 基本使用流程 {#book-details-overview-section-17}

1. 在主頁 / 書籍列表選中一本書進入。
2. 在側欄目錄中選擇章節，或點開 SETTINGS 維護翻譯設定 / 術語 / 角色 / 記憶及檢查更新。
3. 在工具欄選擇編輯模式（一般是預設的「翻譯模式」）。
4. 進行段落翻譯與修訂；可用搜索替換批量改譯文。
5. 通過術語 / 角色 / 記憶按鈕（帶使用計數）隨時復核一致性。
6. 完成後用匯出菜單輸出章節，或在書籍列表頁批量匯出。

---

## ℹ️ 與全域 sysbar 的關係 {#book-details-overview-section-18}

- 頂部 sysbar（[詳見此處](/help/toolbar-guide)）提供 AI 思考過程、同步狀態、訊息紀錄等全域入口，跨頁面始終可見。
- 桌面端右欄的「**翻譯進度**」入口隨時顯示當前翻譯 / 潤色 / 校對的任務進度條，開始新任務時面板自動切到該任務。
- 「**向量索引**」入口只在書籍詳情頁且本機嵌入有效啟用時顯示，桌面 / 平板 / 窄螢幕版面均可使用。

---

## 📚 相關文檔 {#book-details-overview-section-19}

- [章節管理詳解](/help/book-details-chapters)
- [內容編輯功能](/help/book-details-editing)
- [AI 翻譯功能](/help/book-details-translation)
- [術語管理](/help/book-details-terminology)
- [角色設定管理](/help/book-details-characters)
- [記憶管理](/help/book-details-memory)
- [本地嵌入](/help/local-embedding)
- [系統欄與導航](/help/toolbar-guide)
