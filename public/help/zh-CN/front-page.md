# Tsukuyomi（月咏）翻译器使用指南 {#front-page-section-1}

欢迎使用 **Tsukuyomi**。本文档用于快速了解当前版本的主要功能与使用路径。

---

## 🌐 界面与书籍语言 {#front-page-languages}

- 首次使用时匹配系统语言；可在 **设置 → 通用设置 → 界面语言** 选择简体中文、繁體中文或 English，选择会随应用设置同步。
- 手动创建、网站导入或 AI 导入真正创建新书时，以当时的界面语言设置书籍目标。AI 导入任务开始或预览时的语言不决定新书目标。
- 已有书籍的目标不随界面切换；可在 **书籍详情 → 设置 → 翻译设置** 单独更改。旧书和未标记的旧译文归为简体中文。
- 原文不限语言，由 AI 按段落判断，同一本书可以混用语言。已经是目标语言的段落可原样保存并计为已处理；简繁转换仍按目标生成。
- 各目标语言分别保留段落版本、选用及卷章标题、术语、角色、别名译名。缺段落或标题译文时显示原文；缺术语、角色或别名译名时保持空白。

## 🚀 快速开始 {#front-page-section-2}

### 1) 配置 AI 模型 {#front-page-section-3}

1. 进入左侧导航 **AI列表**。
2. 新增模型并填写必要信息：
   - 提供商目前支持 **OpenAI** 与 **Gemini**。
   - 填写 API Key。
   - OpenAI 需填写基础地址（Base URL）；Gemini 可不填。
3. 可点击“获取模型资料”从内置的 models.dev 目录读取上下文窗口与输出上限，用“测试可用性”确认连接正常，再保存。

> 💡 详见 [AI 模型配置](/help/ai-models-guide)。

### 2) 创建并导入书籍 {#front-page-section-4}

1. 进入左侧导航 **书籍列表**。
2. 点击“新建书籍”，手动录入基础信息。
3. 小说站点链接可通过「从网站导入」检查并选择章节；TXT、Markdown、HTML、EPUB 或其他网站来源可进入 **AI 导入**，由月詠整理草稿，确认方案后导入。

> 💡 详见 [书籍列表页](/help/books-page-guide) 与 [AI 导入工作台](/help/import-guide)。

### 3) 开始翻译 {#front-page-section-5}

1. 打开任一本书进入书籍详情页。
2. 在章节面板中添加章节或抓取章节。
3. 选择章节后使用工具栏触发翻译、润色、校对等任务。

> 💡 详见 [书籍详情页概览](/help/book-details-overview) 与 [AI 翻译功能](/help/book-details-translation)。

---

## ✨ 核心能力概览 {#front-page-section-6}

### 📖 翻译与编辑 {#front-page-section-7}

- 支持段落级翻译结果与多版本切换。
- 支持翻译模式、原文编辑模式、译文预览模式。
- 支持搜索/替换与撤销/重做。
- 支持键盘快捷键提升编辑效率。

> 💡 详见 [内容编辑](/help/book-details-editing)。

### 🧩 术语、角色与记忆 {#front-page-section-8}

- **术语设置**：维护专有名词及译法。
- **角色设置**：维护角色信息、别名与表达风格。
- **记忆管理**：维护剧情与背景记忆，并可按类型筛选。
- 在翻译过程中，AI 可能自动创建或更新这些数据，建议人工复核。

> 💡 详见 [术语管理](/help/book-details-terminology)、[角色设定管理](/help/book-details-characters)、[记忆管理](/help/book-details-memory)。

### 🤖 任务类型 {#front-page-section-9}

- 翻译（Translation）
- 润色（Polish）
- 校对（Proofreading）

> AI 章节摘要功能已在 v0.12 移除，改由 [本地嵌入](/help/local-embedding) + `query_chapter` 工具按需检索原文。

### 💬 月詠 · 聊天助手 {#front-page-section-10}

应用内 AI 助手以**月詠（Tsukuyomi）**为名——月下学者、本应用之化身。

- 可针对当前书籍上下文进行问答。
- 可协助查询与操作术语、角色、记忆等数据。
- 可读取帮助文档并在需要时导航到指定帮助页面。
- 简繁中文对话以学者口吻自指「月詠」/「妾身」，英文对话采用中性专业表达；写入数据库的译文本体始终使用书籍目标语言，不带助手口吻。

> 💡 详见 [月詠 · 聊天助手](/help/chat-assistant-guide)。

### 🛠️ 系统栏与右栏 {#front-page-section-11}

- **AI 思考过程**：查看任务状态与思考流。
- **同步状态**：查看 Gist 同步状态与入口。
- **消息历史**：查看系统提示与通知历史。
- **月詠 / 翻译进度**：右栏图标轨道，分别打开聊天助手与翻译进度面板。
- **向量索引**（仅书籍详情页 + 启用本地嵌入时）：查看与重建本书的章节 / 记忆向量。

> 💡 详见 [系统栏与导航](/help/toolbar-guide)、[本地嵌入](/help/local-embedding)。

### 💾 数据与同步 {#front-page-section-12}

- 数据本地存储（IndexedDB）。
- 支持 GitHub Gist 同步。
- 支持“导入/导出资料”进行备份与迁移。

> 💡 详见 [设置说明](/help/settings-guide)。

---

## ✅ 使用建议 {#front-page-section-13}

1. 先配置好默认模型，再开始大批量翻译。
2. 先完成章节结构，再分批翻译与复核。
3. 翻译后及时检查术语、角色、记忆的自动更新结果。
4. 定期导出资料，重要项目建议保留多份备份。

---

## ❓ 常见问题 {#front-page-section-14}

**Q: 翻译任务中断怎么办？**

A: 优先检查 API Key、模型可用性与网络连接，再重试任务。

**Q: 可以为不同任务使用不同模型吗？**

A: 可以。在设置中的 AI 模型默认设置里，可分别指定翻译、校对/润色、术语翻译、助手模型。

**Q: 导入资料会影响现有数据吗？**

A: 会。导入会覆盖当前资料，建议先导出一份本地备份。

---

## 📚 相关文档 {#front-page-section-15}

- [快速开始](/help/front-page)（本文）
- [主页介绍](/help/library-guide)
- [书籍列表页](/help/books-page-guide)
- [AI 导入工作台](/help/import-guide)
- [AI 模型配置](/help/ai-models-guide)
- [聊天助手](/help/chat-assistant-guide)
- [顶部工具栏](/help/toolbar-guide)
- [设置说明](/help/settings-guide)
- [书籍详情页概览](/help/book-details-overview)
- [章节管理](/help/book-details-chapters)
- [内容编辑](/help/book-details-editing)
- [AI 翻译功能](/help/book-details-translation)
- [术语管理](/help/book-details-terminology)
- [角色设定管理](/help/book-details-characters)
- [记忆管理](/help/book-details-memory)
