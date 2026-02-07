# Tsukuyomi (月詠) - Moonlit Translator

<img width="192" height="192" alt="android-chrome-192x192" src="https://github.com/user-attachments/assets/80e77fc0-9aa6-4900-9b5f-7420672a12a4" />


> 专为轻小说爱好者和译者打造的现代化 AI 辅助翻译工具。

**Tsukuyomi (月詠)** 是一个利用最先进 AI 模型（如 **GPT-5.2**, **Claude 4.6**, **Gemini 3 Pro** 等）进行外语文本（专为日本轻小说设计）阅读和翻译的综合平台。无论您是想快速阅读"生肉"的读者，还是追求"信达雅"专业水平的译者，Tsukuyomi 都能为您提供全方位的支持。

<img width="2552" height="1330" alt="Tsukuyomi - 2" src="https://github.com/user-attachments/assets/b91535f7-d606-4358-8921-509648cd7d2b" />


## ✨ 核心功能详情

### 🤖 多模型 AI 矩阵
Tsukuyomi 采用 "Bring Your Own Key" 模式，支持接入全球顶尖 AI 模型：

-   **OpenAI**: 支持 **GPT-5.2**, **GPT-o1** (超强推理), **GPT-4o** (均衡全能)。
-   **Anthropic**: 支持 **Claude 4.6 Opus** (极高文学素养), **Claude 3.5 Sonnet** (极速响应)。
-   **Google**: 支持 **Gemini 3 Pro** (百万级上下文), **Gemini 2.0 Flash** (极高性价比)。
-   **DeepSeek**: 支持 **DeepSeek-V3**, **DeepSeek-R1** (逻辑与编码最强开源模型)。
-   **Moonshot**: 支持 **Kimi k2.5** (针对中文语境深度优化)。

**最佳实践**:
*   使用 **GPT-5.2** 或 **DeepSeek-R1** 进行初翻，处理复杂句式与暗喻。
*   使用 **Claude 4.6 Opus** 或 **Gemini 3 Pro** 进行润色，通过超长上下文保持全书风格一致。

### 📚 智能翻译与阅读
深度定制的阅读环境，让翻译成为一种享受：

-   **沉浸式双语模式**: 左右分栏对照，支持段落级自动对齐与高亮，阅读体验极佳。
-   **全流程 AI 操作**:
    -   **初翻 (Translate)**: 考虑全书背景的精准翻译。
    -   **润色 (Polish)**: 消除"翻译腔"，让译文更符合中文地道表达。
    -   **校对 (Proofreading)**: 自动检查漏译、错别字及格式问题。
-   **多版本并存**: 对同一段落可尝试不同模型，一键切换各版本择优使用。
-   **实时进度监控**: 侧边栏显示详细的翻译进度、预计剩余时间及处理日志。

### 🧩 深度上下文管理系统 (Context Engine)
从底层解决 AI 翻译"记不住人名、吐字风格不统一"的顽疾：

#### 1. 📖 术语表 (Glossary)
*   **精准替换**: 强制统一 **地名**、**技能名**、**特定名词** 的译法。
*   **语义引导**: 为术语添加描述，让 AI 理解其在故事中的具体作用。

#### 2. 👥 角色设定 (Character Settings)
*   **多维属性**: 定义角色的 **性别**、**语气**、**口癖**、**性格特征**。
*   **别名识别**: 建立别名库，让 AI 明白"勇者"、"那个家伙"、"佐藤"指向的是同一个人。
*   **语气控制**: 自动调整对话风格（如傲娇、古风、极道等），让翻译更有灵魂。

#### 3. 🧠 记忆库 (Memory Bank)
*   **世界观沉淀**: 记录复杂的势力关系、魔法系统规则、关键剧情伏笔。
*   **智能检索 (LRU)**: 根据当前章节内容动态调取最相关的记忆片段。

### 💬 AI 协作聊天助手
您的侧边栏 24/7 翻译导师：

-   **实时协助**: 随时询问 "这句话的梗在哪？" 或 "这里怎么翻译才能保留原作者的俏皮感？"。
-   **自动化操控**: 直接通过对话修改书籍信息或增删术语，例如："帮我把这本书改成完结状态"。
-   **内置知识库**: 遇到软件使用问题，AI 会检索官方帮助文档为您解答。

### ☁️ 数据同步与安全
-   **本地优先**: 数据存储在 IndexedDB 中，无需担心隐私泄露，离线亦可工作。
-   **Gist 云同步**: 配合 **GitHub Gist** 实现私有云备份，支持修订历史回溯，一键恢复至任意历史版本。

## 🚀 快速开始

### 1. 安装与运行

本项目基于 [Bun](https://bun.sh) 构建：

```bash
# 克隆仓库并进入
git clone https://github.com/rozx/Tsukuyomi.git
cd Tsukuyomi

# 安装依赖
bun install

# 开启开发环境
bun run dev
```

### 2. 快捷导入指南

-   **自动抓取**: 支持从 `syosetu.com`, `kakuyomu.jp`, `syosetu.org` 等主流小说网一键导入。
-   **JSON 导入**: 支持导入其他译者分享的翻译包或备份文件。

## 📖 文档索引

| 文档类别 | 详细指南 (位于 `public/help`) |
| :--- | :--- |
| **基础配置** | [快速开始](public/help/front-page.md) \| [AI 模型配置](public/help/ai-models-guide.md) \| [设置与同步](public/help/settings-guide.md) |
| **书籍管理** | [图书馆介绍](public/help/library-guide.md) \| [导入与抓取](public/help/books-page-guide.md) \| [章节管理](public/help/book-details-chapters.md) |
| **翻译实战** | [翻译功能面板](public/help/book-details-translation.md) \| [三种编辑模式](public/help/book-details-editing.md) \| [工具栏详解](public/help/toolbar-guide.md) |
| **核心逻辑** | [术语管理](public/help/book-details-terminology.md) \| [角色设定](public/help/book-details-characters.md) \| [记忆系统](public/help/book-details-memory.md) |
| **进阶工具** | [聊天助手实战](public/help/chat-assistant-guide.md) |

> 📖 **在线文档**: 完整的帮助文档已同步到 [GitHub Wiki](https://github.com/rozx/Tsukuyomi/wiki)，提供更好的浏览体验。

## 🛠️ 开发与构建

| 命令 | 用途 |
| :--- | :--- |
| `bun run build` | 构建生产环境 Web 版本 |
| `bun run build:electron` | 打包跨平台桌面客户端 (dmg/exe/deb) |
| `bun run bump` | 手动/自动更新版本号 |
| `bun run lint` | 代码规范性检测 |

**开发者文档**: [构建故障排查](docs/BUILD_TROUBLESHOOTING.md) \| [主题指南](docs/THEME_GUIDE.md) \| [翻译指南](docs/TRANSLATION_GUIDE.md) \| [Wiki 同步](docs/WIKI_SYNC.md)

---
> *Tsukuyomi - 让每一次翻页都如月光般流畅。*
