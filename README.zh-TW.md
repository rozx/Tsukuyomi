# Tsukuyomi (月詠) - Moonlit Translator

[简体中文](README.md) | **繁體中文** | [English](README.en-US.md)

![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg) ![GitHub Release](https://img.shields.io/github/v/release/rozx/Tsukuyomi) ![Vue](https://img.shields.io/badge/Vue.js-3.5-4FC08D?logo=vue.js&logoColor=white) ![Quasar](https://img.shields.io/badge/Quasar-2.20-1976D2?logo=quasar&logoColor=white) ![Electron](https://img.shields.io/badge/Electron-39-47848F?logo=electron&logoColor=white) ![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white) ![Bun](https://img.shields.io/badge/Bun-1.0%2B-000000?logo=bun&logoColor=white)

[![Github All Releases](https://img.shields.io/github/downloads/rozx/Tsukuyomi/total.svg)](https://github.com/rozx/Tsukuyomi/releases)

![GitHub stars](https://img.shields.io/github/stars/rozx/Tsukuyomi?style=social) ![GitHub forks](https://img.shields.io/github/forks/rozx/Tsukuyomi?style=social) ![GitHub issues](https://img.shields.io/github/issues/rozx/Tsukuyomi) ![GitHub last commit](https://img.shields.io/github/last-commit/rozx/Tsukuyomi) ![GitHub repo size](https://img.shields.io/github/repo-size/rozx/Tsukuyomi)

<img width="192" height="192" alt="android-chrome-192x192" src="https://github.com/user-attachments/assets/80e77fc0-9aa6-4900-9b5f-7420672a12a4" />

> 面向小說的 AI 匯入、閱讀與翻譯工具：原文不限語言，可譯為簡體中文、繁體中文或 English；對日文網路小說與輕小說有專門支援。

**Tsukuyomi (月詠)** 將小說匯入、雙語閱讀、翻譯、潤色和校對放在同一個工作台中。使用自己的 API Key 接入 OpenAI、Gemini 或相容 OpenAI 協定的服務，透過術語、角色設定和記憶庫為翻譯提供上下文。支援網頁版與 Electron 桌面版。

- [開啟網頁版](https://tsukuyomi.rozx.moe/)
- [下載桌面版](https://github.com/rozx/Tsukuyomi/releases/latest)

## ☁️ v0.18 新增：按章節增量同步與更輕量的本機嵌入

同步改為按章節小組上傳與下載，大型書庫也能順暢同步；本機嵌入改用更小的模型，並在獨立 Worker 中執行，不再卡住介面。

- **同步協定 v6**：書籍目錄與章節正文分開存放，正文按章節 ID 固定分成 16 個小組。新增或修改一章通常只上傳所在小組、變更的目錄與清單，不再重傳整本書。
- **大型書庫同步**：GitHub 檔案清單超過 300 個檔案被截斷時，依完整同步清單補齊檔案繼續同步；書庫沒有變化時略過全庫掃描。
- **遺留檔案清理與修訂歷史**：在「設定 → 同步設定」掃描並清理遠端不再引用的舊檔案；修訂歷史按書籍歸組顯示檔案變化。
- **設定同步更可靠**：Tavily / Firecrawl API Key 與各任務的預設模型分別按修改時間合併，不再被其他設定覆蓋或在同步途中被清空。
- **Bekko 本機嵌入**：預設模型換成 `bekko-embedding-v1-a25m`（384 維，WebGPU / WASM 共用約 190 MiB），推論移入 Web Worker；「向量索引」面板重新設計，平板與窄螢幕也有入口。

**多裝置同步請先備份，再將所有裝置升級到 v0.18.0，最後逐台同步；首次同步會將 Gist 完整遷移到 v6。啟用本機嵌入的使用者需要重新下載模型並重建向量。**

[閱讀 v0.18.0 發布說明（簡體中文）](public/releaseNotes/RELEASE_NOTES_v0.18.0.md) · [設定說明](public/help/zh-TW/settings-guide.md) · [本機嵌入](public/help/zh-TW/local-embedding.md)

![Tsukuyomi Dashboard](public/screenshots/desktop-index.png)

## ✨ 核心功能詳情

### 🌐 多語言翻譯

- **原文不限語言**: AI 按段落判斷原文語言，同一本書可以混用多種語言；已經是目標語言的段落可原樣保留。
- **按書設定目標語言**: 每本書可選簡體中文、繁體中文或 English 作為譯文語言，新書預設跟隨目前介面語言。
- **各語言譯文分開保存**: 段落譯文、卷章標題、術語和角色譯名按目標語言分別保存，切換目標語言不會覆蓋已有譯文。
- **三語介面與說明**: 介面和說明文件提供簡體中文、繁體中文和 English。

### 🤖 AI 模型配置

Tsukuyomi 採用 Bring Your Own Key 模式，內建兩種提供商：

- **OpenAI**：填寫 API Key、基礎位址與模型 ID，也可用於相容 OpenAI 協定的服務或閘道。
- **Gemini**：使用 Google Generative AI SDK 接入，填寫 API Key 與模型 ID。

其他模型需要透過受支援的相容介面接入，具體可用模型與工具呼叫能力取決於服務端。可在介面拉取模型列表、驗證連線，並設定自訂請求標頭及瀏覽器 CORS 代理。

翻譯、校對/潤色、術語翻譯和助手可分別設定預設模型；單本書還可覆寫翻譯與校對/潤色模型。詳見 [AI 模型配置](public/help/zh-TW/ai-models-guide.md)。

### 📚 智慧翻譯與閱讀

在書籍詳情頁閱讀、編輯和處理章節：

- **雙語對照**: 按段落查看原文與譯文，支援翻譯、原文編輯和譯文預覽三種模式。
- **全流程 AI 操作**:
  - **初翻 (Translate)**: 結合術語、角色設定和檢索到的上下文產生譯文。
  - **潤色 (Polish)**: 消除「翻譯腔」，讓譯文更符合目標語言的道地表達。
  - **校對 (Proofreading)**: 自動檢查漏譯、錯別字及格式問題。
- **多版本並存**: 對同一段落可嘗試不同模型，一鍵切換各版本擇優使用。
- **任務進度**: 查看翻譯進度、待辦事項、思考與輸出時間線，以及工具呼叫詳情。

### 🧩 深度上下文管理系統 (Context Engine)

透過術語、角色設定、記憶和章節檢索，為 AI 提供目前段落之外的參考資訊：

#### 1. 📖 術語表 (Glossary)

- **譯法參考**: 為地名、技能名和特定名詞記錄統一譯法，供翻譯任務使用。
- **語意引導**: 為術語添加描述，讓 AI 理解其在故事中的具體作用。

#### 2. 👥 角色設定 (Character Settings)

- **多維屬性**: 定義角色的 **性別**、**語氣**、**口癖**、**性格特徵**。
- **別名識別**: 建立別名庫，讓 AI 明白「勇者」、「那個傢伙」、「佐藤」指向的是同一個人。
- **語氣參考**: 將角色口吻和性格描述傳給 AI，輔助保持對話風格一致。

#### 3. 🧠 記憶庫 (Memory Bank)

- **世界觀沉澱**: 記錄複雜的勢力關係、魔法系統規則、關鍵劇情伏筆。
- **語意優先的記憶檢索**: Embedding 可用時按語意相似度、關鍵字匹配和時間衰減自動評分（權重 0.85 / 0.10 / 0.05）；關閉或不可用時回退到關鍵字和時間衰減（0.75 / 0.25）。總分歸一到 0–1.0，並按字元預算注入最相關記憶。
- **本機語意嵌入（可選）**: 內建 `bekko-embedding-v1-a25m` 多語言編碼器（Transformers.js），WebGPU 優先、WASM 回退，兩個後端共用約 190 MiB 的預設壓縮 ONNX 檔案。模型載入與推理在獨立瀏覽器 Worker 中完成，背景批次限速並優先回應搜尋；不消耗 AI API 額度；預設關閉，在「設定 → 本機嵌入」中啟用，實體行動裝置上停用。
- **混合搜尋**: `search_memories` 工具支援自然語言查詢，同時利用關鍵字匹配和語意向量排序；關閉嵌入時自動退化為關鍵字 + 時間衰減。

#### 4. 📑 章節語意索引 (Chapter Vector Index)

- **多向量章節索引**: 啟用本機嵌入後，為每個章節按約 100 字的段落邊界建立原生 384 維多向量索引，並額外為「章節標題 + 首段」寫入專屬向量，支援標題 / 系列 / 主題型查詢。
- **`query_chapter` 混合檢索**: AI 可用自然語言跨章節搜尋原文；模糊情節先對候選原文段落做本地重排，明確匹配保留整塊上下文。隨後在章節粒度校準語意信賴度並融合語意 / 關鍵字 RRF 排名，再按 `0.85 × 語意 + 0.15 × 關鍵字` 排序並過濾弱匹配。翻譯、潤色、校對、聊天助手四類任務的提示詞已學會呼叫該工具取得前文上下文。
- **批次管理**: 在書籍詳情的「向量索引」面板查看索引紀錄、重建和批次重算，也可測試查詢結果。詳見 [本地嵌入](public/help/zh-TW/local-embedding.md)。

### 💬 AI 協作聊天助手

月詠可結合目前書籍上下文回答問題，並透過工具協助操作：

- **即時協助**: 隨時詢問「這句話的梗在哪？」或「這裡怎麼翻譯才能保留原作者的俏皮感？」。
- **自動化操控**: 直接透過對話修改書籍資訊或增刪術語，例如：「幫我把這本書改成完結狀態」。
- **內建知識庫**: 遇到軟體使用問題，AI 會檢索官方說明文件為您解答。

### ☁️ 跨裝置同步

- **Gist 雲端同步**: 可選擇將資料同步到自己的 GitHub Gist，支援查看按書籍歸組的修訂歷史、還原可用快照，並清理遠端不再引用的遺留檔案。
- **Manifest 增量同步**: 基於 `manifest.json` 與 SHA-256 雜湊選擇變化條目，使用條件請求減少下載；上傳前複核 ETag，偵測到並行變化後重新合併重試。
- **按章節小組同步**: 書籍目錄與章節正文分開存放，正文按章節 ID 固定分成 16 組，修改一章只上傳所在小組、目錄與清單，其他小組不再重傳；檔案清單超過 300 個時依同步清單補齊，大型書庫也能完整同步。
- **跨端刪除一致**: Manifest 使用墓碑（tombstones）傳遞刪除語意，A 裝置刪除的條目不會被 B 裝置重新推回。
- **書內實體刪除記錄**: 術語、角色、別名擁有穩定身分，刪除記錄隨書長期保留；刪除的譯文版本同樣留有記錄，離線裝置回流時不會復活。
- **段落合併**: 有同步結構基準時，保留單端的原文修訂與刪除；只有原文一致的段落才合併譯文，兩端都改過結構時提示檢查衝突。
- **強制推送模式**: 將遠端資料替換為本機快照，覆蓋前可核對來源裝置與目標 Gist。

### 📱 全裝置適配

- **桌面 / 平板 / 行動**: Dispatcher + 三變體架構，桌面保持資訊密度、平板提供雙面板閱讀與可停靠 AI 助手、行動端採用底部 Tab 欄 + BottomSheet 的原生化體驗。
- **Electron 桌面版**: 一套程式碼同時打包 Web SPA 與跨平台桌面用戶端，桌面端強制使用 Desktop 變體。

## 📸 介面預覽

以下截圖展示桌面、平板和手機上的首頁、書庫、閱讀器與模型管理頁面。

### 🏠 首頁 · Dashboard

![桌面首頁](public/screenshots/desktop-index.png)

|                                 平板 · Tablet                                 |                                 手機 · Mobile                                 |
| :---------------------------------------------------------------------------: | :---------------------------------------------------------------------------: |
| <img src="public/screenshots/tablet-index.png" alt="平板首頁" width="100%" /> | <img src="public/screenshots/mobile-index.png" alt="手機首頁" width="100%" /> |

### 📚 書庫 · Library

![桌面書庫](public/screenshots/desktop-library.png)

|                                  平板 · Tablet                                  |                                  手機 · Mobile                                  |
| :-----------------------------------------------------------------------------: | :-----------------------------------------------------------------------------: |
| <img src="public/screenshots/tablet-library.png" alt="平板書庫" width="100%" /> | <img src="public/screenshots/mobile-library.png" alt="手機書庫" width="100%" /> |

### 📖 書籍詳情 / 閱讀器 · Book Details & Reader

> 桌面與平板採用雙面板版面，將章節樹、中繼資料、段落閱讀合併為同一視圖；手機端則拆分為獨立頁面以適配直向空間。

![桌面書籍詳情](public/screenshots/desktop-book-details.png)

|                                      平板 · Tablet                                       |                                     手機 (書籍詳情)                                      |                                  手機 (閱讀器)                                   |
| :--------------------------------------------------------------------------------------: | :--------------------------------------------------------------------------------------: | :------------------------------------------------------------------------------: |
| <img src="public/screenshots/tablet-book-details.png" alt="平板書籍詳情" width="100%" /> | <img src="public/screenshots/mobile-book-details.png" alt="手機書籍詳情" width="100%" /> | <img src="public/screenshots/mobile-reader.png" alt="手機閱讀器" width="100%" /> |

### 💬 AI 助手協作 · Reader + Chat Workspace

右側面板可停靠，隨時召喚 AI 助手；啟用本機嵌入後可使用 `query_chapter` / `search_memories` 工具跨章節、跨記憶檢索上下文。

![桌面閱讀器 + AI 助手](public/screenshots/desktop-reader-with-chat.png)

|                                            平板 · Tablet                                             |                                        手機 · Mobile                                         |
| :--------------------------------------------------------------------------------------------------: | :------------------------------------------------------------------------------------------: |
| <img src="public/screenshots/tablet-reader-with-chat.png" alt="平板閱讀器 + AI 助手" width="100%" /> | <img src="public/screenshots/mobile-reader-with-chat.png" alt="手機 AI 助手" width="100%" /> |

### 🤖 AI 模型管理 · Model Management

![桌面 AI 模型](public/screenshots/desktop-ai-models.png)

|                                     平板 · Tablet                                     |                                     手機 · Mobile                                     |
| :-----------------------------------------------------------------------------------: | :-----------------------------------------------------------------------------------: |
| <img src="public/screenshots/tablet-ai-models.png" alt="平板 AI 模型" width="100%" /> | <img src="public/screenshots/mobile-ai-models.png" alt="手機 AI 模型" width="100%" /> |

## 🔒 隱私與資料主權

本機儲存、AI 請求和雲端同步分別處理資料：

- **本機儲存**: 書籍、譯文、術語、記憶、配置與匯入任務預設保存在目前瀏覽器或 Electron 資料目錄的 IndexedDB 中。已保存內容可在本機閱讀和編輯；呼叫遠端 AI、網頁抓取、聯網搜尋及 Gist 同步需要網路。
- **AI 請求**: 翻譯、聊天和 AI 匯入會把所需文字與上下文發送給設定的模型服務。瀏覽器端公網請求預設啟用 CORS 代理，可按模型關閉；同源、本機和區域網路位址自動直連。Electron 的 AI 請求直連設定的服務位址。
- **金鑰與同步範圍**: 模型 API Key 隨模型配置保存在本機，開啟 Gist 同步後也會隨 AI 模型配置同步。GitHub 同步 Token 保留在目前裝置，不寫入同步包。應用程式未額外加密這些本機憑證。
- **本機語意嵌入**: 啟用「本機嵌入」後，記憶庫與章節語意索引使用 Transformers.js 在瀏覽器 / Electron 內部執行，**不上傳任何文字到外部嵌入服務**；模型檔案下載後自動快取到瀏覽器 Cache Storage。
- **可選 Gist 雲端同步**: 同步書籍、記憶、模型、封面及應用程式設定；AI 匯入任務與中間草稿僅保存在目前裝置，確認匯入後的書籍可正常同步。

## 🚀 快速開始

### 1. 開啟應用程式，設定模型

使用 [網頁版](https://tsukuyomi.rozx.moe/) 或 [下載桌面版](https://github.com/rozx/Tsukuyomi/releases/latest)，無需先複製原始碼。開啟「AI 列表」，添加模型並設定翻譯、校對/潤色和助手的預設模型。AI 匯入工作台使用「助手」預設模型。

### 2. 匯入一本小說

1. 開啟「AI 匯入」，點選「新任務」。
2. 在「來源」中添加小說網址，或選擇／拖入 TXT、Markdown、HTML、EPUB 檔案。
3. 在對話中說明匯入範圍、分卷分章要求，讓月詠整理。
4. 在「卷章草稿」檢查書籍資料、章節順序和正文。
5. 產生「匯入方案」，核對目標書籍、缺失章節和譯文影響，再點選「確認匯入」。完成後點「打開小說」。

更多範例見 [AI 匯入工作台指南](public/help/zh-TW/import-guide.md)。也可以在書庫中選擇「從網站匯入」，使用內建的日文小說網站規則處理 `ncode.syosetu.com`、`novel18.syosetu.com`、`kakuyomu.jp`、`syosetu.org`；其他網站可轉交 AI 匯入器。網站攔截代理存取時會自動改用 Firecrawl 抓取（無需 Key 也可使用）；書籍更新檢查只讀取目錄，可按需逐章比對正文。應用程式格式的 JSON 書籍檔案可透過「從 JSON 匯入」添加，完整資料備份在設定中還原。

### 3. 從原始碼執行

本專案基於 [Bun](https://bun.sh) 建置：

```bash
# 複製儲存庫並進入
git clone https://github.com/rozx/Tsukuyomi.git
cd Tsukuyomi

# 安裝相依套件
bun install

# 首次 clone 後註冊提交鉤子（提交時自動遞增建置號）
bun run setup:git-hooks

# 啟動開發環境
bun run dev
```

`bun run dev` 啟動 Quasar/Vite 開發伺服器，預設位於 `http://localhost:9000`，可用 `PORT` 環境變數修改連接埠。Electron 開發使用 `bun run dev:electron`。

## 📖 文件索引

| 文件類別     | 詳細指南 (位於 `public/help/zh-TW`)                                                                                                                                            |
| :----------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **基礎配置** | [快速開始](public/help/zh-TW/front-page.md) \| [AI 模型配置](public/help/zh-TW/ai-models-guide.md) \| [設定與同步](public/help/zh-TW/settings-guide.md)                        |
| **書籍管理** | [圖書館介紹](public/help/zh-TW/library-guide.md) \| [匯入與抓取](public/help/zh-TW/books-page-guide.md) \| [章節管理](public/help/zh-TW/book-details-chapters.md)              |
| **翻譯實戰** | [翻譯功能面板](public/help/zh-TW/book-details-translation.md) \| [三種編輯模式](public/help/zh-TW/book-details-editing.md) \| [工具列詳解](public/help/zh-TW/toolbar-guide.md) |
| **核心邏輯** | [術語管理](public/help/zh-TW/book-details-terminology.md) \| [角色設定](public/help/zh-TW/book-details-characters.md) \| [記憶系統](public/help/zh-TW/book-details-memory.md)  |
| **AI 匯入**  | [匯入工作台：分步操作、拆章與補章](public/help/zh-TW/import-guide.md)                                                                                                          |
| **進階工具** | [聊天助手實戰](public/help/zh-TW/chat-assistant-guide.md) \| [本地嵌入與章節檢索](public/help/zh-TW/local-embedding.md)                                                        |
| **更新紀錄** | [v0.18.0 發布說明（簡體中文）](public/releaseNotes/RELEASE_NOTES_v0.18.0.md)                                                                                                   |

> 應用程式內「說明」可查閱使用指南；主分支文件透過工作流程同步到 [GitHub Wiki](https://github.com/rozx/Tsukuyomi/wiki)（簡體中文）。

## 🧱 技術棧

| 層級                | 技術                                                                                                                  |
| :------------------ | :-------------------------------------------------------------------------------------------------------------------- |
| **前端框架**        | Vue 3.5 · Quasar 2.20 · TypeScript 5.9 · Pinia 3 · PrimeVue 4.5 · Tailwind CSS 3.4 · Vue-i18n (zh-CN / zh-TW / en-US) |
| **桌面封裝**        | Electron 39（Web SPA 與桌面端共用同一份程式碼，透過 `useDeviceVariant` 強制 Desktop 變體）                            |
| **執行環境 / 建置** | Bun ≥ 1.0 · Vite · Quasar CLI                                                                                         |
| **AI SDK**          | OpenAI SDK · Google Generative AI；透過 OpenAI 配置接入相容協定服務（BYOK）                                           |
| **本機嵌入**        | Transformers.js (ONNX Runtime Web) · `bekko-embedding-v1-a25m` · 384 維 mean pooling · WebGPU（優先）/ WASM（回退）   |
| **儲存 / 同步**     | IndexedDB (`idb`) · GitHub Gist (`@octokit/rest`) · SHA-256 雜湊 manifest · 條件 GET + 偽 CAS 並行保護                |
| **抓取**            | Puppeteer + `puppeteer-extra-plugin-stealth`（Electron 桌面版）/ CORS 代理（Web 版）· 被攔截時回退 Firecrawl          |
| **AI 匯入**         | 工具呼叫整理草稿 · Web Worker 檔案解析 · EPUB/ZIP（fflate）· Web Locks 跨分頁互斥                                     |
| **測試 / 品質**     | Vitest（jsdom）· fake-indexeddb · Istanbul 覆蓋率 · ESLint · vue-tsc · Fallow                                         |

## 🛠️ 開發與建置

| 指令                      | 用途                                                                               |
| :------------------------ | :--------------------------------------------------------------------------------- |
| `bun install`             | 安裝相依套件                                                                       |
| `bun run setup:git-hooks` | 首次 clone 後註冊 pre-commit 建置號鉤子                                            |
| `bun run dev`             | 啟動 Web 開發伺服器（預設 9000）                                                   |
| `bun run dev:electron`    | 啟動 Electron 開發模式                                                             |
| `bun run build:spa`       | 建置正式環境 Web SPA                                                               |
| `bun run build:electron`  | 按目標平台打包桌面用戶端（macOS: dmg/zip；Windows: portable exe；Linux: AppImage） |
| `bun run lint`            | 程式碼規範檢查                                                                     |
| `bun run type-check`      | TypeScript 型別檢查                                                                |
| `bun run quality-check`   | Fallow 分析及差異範圍 CI 門禁                                                      |
| `bun run format`          | Prettier 格式化                                                                    |
| `bun run test`            | 使用 Vitest 執行測試套件                                                           |
| `bun run test:watch`      | Vitest 監聽模式                                                                    |
| `bun run test:coverage`   | 執行測試並產生 Istanbul 覆蓋率                                                     |
| `bun bump <version>`      | 更新發布版本，例如 `bun bump 0.16.0`                                               |

**開發者文件（簡體中文）**: [建置故障排查](docs/BUILD_TROUBLESHOOTING.md) \| [主題指南](docs/THEME_GUIDE.md) \| [翻譯指南](docs/TRANSLATION_GUIDE.md) \| [Wiki 同步](docs/WIKI_SYNC.md) \| [貢獻者指南](AGENTS.md) \| [專案約定 (Claude Code)](CLAUDE.md)

## 🤝 貢獻

歡迎 Issue、PR，以及翻譯器使用回饋。提交程式碼前請：

1. 執行 `bun run lint && bun run type-check && bun run quality-check`；
2. 新功能、修 bug 和執行期邏輯變更遵循 TDD：先寫失敗測試，再實作並確認通過。測試位於 `src/__tests__/`，使用 `bun run test`；純文件、樣式和設定改動可不新增測試；
3. UI 改動需在桌面 / 平板 / 手機三個斷點驗證，遵循 [AGENTS.md](AGENTS.md) 的裝置變體規則。

## 📄 授權條款

[Apache License 2.0](LICENSE) — 可自由用於個人與商業用途，請在二次散布時保留版權聲明。

---

> _Tsukuyomi - 讓每一次翻頁都如月光般流暢。_
