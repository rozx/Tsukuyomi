# Tsukuyomi（月咏）翻译器使用指南

欢迎使用 **Tsukuyomi**。本文档用于快速了解当前版本的主要功能与使用路径。

---

## 🚀 快速开始

### 1) 配置 AI 模型

1. 进入左侧导航 **AI列表**。
2. 新增模型并填写必要信息：
   - 提供商目前支持 **OpenAI** 与 **Gemini**。
   - 填写 API Key。
   - OpenAI 需填写基础地址（Base URL）；Gemini 可不填。
3. 可点击“获取配置”读取模型能力信息，再保存。

> 💡 详见 [AI 模型配置](/help/ai-models-guide)。

### 2) 创建并导入书籍

1. 进入左侧导航 **书籍列表**。
2. 点击“新建书籍”，手动录入基础信息。
3. 需要时可通过小说站点链接抓取元数据与章节内容。

> 💡 详见 [书籍列表页](/help/books-page-guide)。

### 3) 开始翻译

1. 打开任一本书进入书籍详情页。
2. 在章节面板中添加章节或抓取章节。
3. 选择章节后使用工具栏触发翻译、润色、校对等任务。

> 💡 详见 [书籍详情页概览](/help/book-details-overview) 与 [AI 翻译功能](/help/book-details-translation)。

---

## ✨ 核心能力概览

### 📖 翻译与编辑

- 支持段落级翻译结果与多版本切换。
- 支持翻译模式、原文编辑模式、译文预览模式。
- 支持搜索/替换与撤销/重做。
- 支持键盘快捷键提升编辑效率。

> 💡 详见 [内容编辑](/help/book-details-editing)。

### 🧩 术语、角色与记忆

- **术语设置**：维护专有名词及译法。
- **角色设置**：维护角色信息、别名与表达风格。
- **记忆管理**：维护剧情与背景记忆，并可按类型筛选。
- 在翻译过程中，AI 可能自动创建或更新这些数据，建议人工复核。

> 💡 详见 [术语管理](/help/book-details-terminology)、[角色设定管理](/help/book-details-characters)、[记忆管理](/help/book-details-memory)。

### 🤖 任务类型

- 翻译（Translation）
- 润色（Polish）
- 校对（Proofreading）
- 章节摘要（含批量摘要）

### 💬 聊天助手

- 可针对当前书籍上下文进行问答。
- 可协助查询与操作术语、角色、记忆等数据。
- 可读取帮助文档并在需要时导航到指定帮助页面。

> 💡 详见 [聊天助手](/help/chat-assistant-guide)。

### 🛠️ 顶部工具栏

- **AI 思考过程**：查看任务状态与思考流。
- **同步状态**：查看 Gist 同步状态与入口。
- **批量摘要**：在书籍详情页对章节批量生成摘要。
- **消息历史**：查看系统提示与通知历史。
- **聊天助手**：开关右侧助手面板。

> 💡 详见 [顶部工具栏](/help/toolbar-guide)。

### 💾 数据与同步

- 数据本地存储（IndexedDB）。
- 支持 GitHub Gist 同步。
- 支持“导入/导出资料”进行备份与迁移。

> 💡 详见 [设置说明](/help/settings-guide)。

---

## ✅ 使用建议

1. 先配置好默认模型，再开始大批量翻译。
2. 先完成章节结构，再分批翻译与复核。
3. 翻译后及时检查术语、角色、记忆的自动更新结果。
4. 定期导出资料，重要项目建议保留多份备份。

---

## ❓ 常见问题

**Q: 翻译任务中断怎么办？**

A: 优先检查 API Key、模型可用性与网络连接，再重试任务。

**Q: 可以为不同任务使用不同模型吗？**

A: 可以。在设置中的 AI 模型默认设置里，可分别指定翻译、校对/润色、术语翻译/章节摘要、助手模型。

**Q: 导入资料会影响现有数据吗？**

A: 会。导入会覆盖当前资料，建议先导出一份本地备份。

---

## 📚 相关文档

- [快速开始](/help/front-page)（本文）
- [主页介绍](/help/library-guide)
- [书籍列表页](/help/books-page-guide)
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
