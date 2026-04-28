# Tsukuyomi (月詠) - Moonlit Translator

![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg) ![GitHub Release](https://img.shields.io/github/v/release/rozx/Tsukuyomi) ![Vue](https://img.shields.io/badge/Vue.js-3.5-4FC08D?logo=vue.js&logoColor=white) ![Quasar](https://img.shields.io/badge/Quasar-2.18-1976D2?logo=quasar&logoColor=white) ![Electron](https://img.shields.io/badge/Electron-39.2-47848F?logo=electron&logoColor=white) ![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?logo=typescript&logoColor=white) ![Bun](https://img.shields.io/badge/Bun-1.0-000000?logo=bun&logoColor=white)

[![Github All Releases](https://img.shields.io/github/downloads/rozx/Tsukuyomi/total.svg)](https://github.com/rozx/Tsukuyomi/releases)

![GitHub stars](https://img.shields.io/github/stars/rozx/Tsukuyomi?style=social) ![GitHub forks](https://img.shields.io/github/forks/rozx/Tsukuyomi?style=social) ![GitHub issues](https://img.shields.io/github/issues/rozx/Tsukuyomi) ![GitHub last commit](https://img.shields.io/github/last-commit/rozx/Tsukuyomi) ![GitHub repo size](https://img.shields.io/github/repo-size/rozx/Tsukuyomi)

<img width="192" height="192" alt="android-chrome-192x192" src="https://github.com/user-attachments/assets/80e77fc0-9aa6-4900-9b5f-7420672a12a4" />

> 专为轻小说爱好者和译者打造的现代化 AI 辅助翻译工具。

**Tsukuyomi (月詠)** 是一个利用最先进 AI 模型（如 **GPT-5.2**, **Claude 4.6**, **Gemini 3 Pro** 等）进行外语文本（专为日本轻小说设计）阅读和翻译的综合平台。无论您是想快速阅读"生肉"的读者，还是追求"信达雅"专业水平的译者，Tsukuyomi 都能为您提供全方位的支持。

- 可以直接访问网页版：[https://tsukuyomi.rozx.moe](https://tsukuyomi.rozx.moe/)
- 或者查看最新的Release: [点击这里](https://github.com/rozx/Tsukuyomi/releases/latest)

![Tsukuyomi Dashboard](public/screenshots/desktop-index.png)

## ✨ 核心功能详情

### 🤖 多模型 AI 矩阵

Tsukuyomi 采用 "Bring Your Own Key" 模式，支持接入全球顶尖 AI 模型：

- **OpenAI**: 支持 **GPT-5.2**, **GPT-o1** (超强推理), **GPT-4o** (均衡全能)。
- **Anthropic**: 支持 **Claude 4.6 Opus** (极高文学素养), **Claude 3.5 Sonnet** (极速响应)。
- **Google**: 支持 **Gemini 3 Pro** (百万级上下文), **Gemini 2.0 Flash** (极高性价比)。
- **DeepSeek**: 支持 **DeepSeek-V3**, **DeepSeek-R1** (逻辑与编码最强开源模型)。
- **Moonshot**: 支持 **Kimi k2.5** (针对中文语境深度优化)。

**最佳实践**:

- 使用 **GPT-5.2** 或 **DeepSeek-R1** 进行初翻，处理复杂句式与暗喻。
- 使用 **Claude 4.6 Opus** 或 **Gemini 3 Pro** 进行润色，通过超长上下文保持全书风格一致。

### 📚 智能翻译与阅读

深度定制的阅读环境，让翻译成为一种享受：

- **沉浸式双语模式**: 左右分栏对照，支持段落级自动对齐与高亮，阅读体验极佳。
- **全流程 AI 操作**:
  - **初翻 (Translate)**: 考虑全书背景的精准翻译。
  - **润色 (Polish)**: 消除"翻译腔"，让译文更符合中文地道表达。
  - **校对 (Proofreading)**: 自动检查漏译、错别字及格式问题。
- **多版本并存**: 对同一段落可尝试不同模型，一键切换各版本择优使用。
- **实时进度监控**: 侧边栏显示详细的翻译进度、预计剩余时间及处理日志。

### 🧩 深度上下文管理系统 (Context Engine)

从底层解决 AI 翻译"记不住人名、吐字风格不统一"的顽疾：

#### 1. 📖 术语表 (Glossary)

- **精准替换**: 强制统一 **地名**、**技能名**、**特定名词** 的译法。
- **语义引导**: 为术语添加描述，让 AI 理解其在故事中的具体作用。

#### 2. 👥 角色设定 (Character Settings)

- **多维属性**: 定义角色的 **性别**、**语气**、**口癖**、**性格特征**。
- **别名识别**: 建立别名库，让 AI 明白"勇者"、"那个家伙"、"佐藤"指向的是同一个人。
- **语气控制**: 自动调整对话风格（如傲娇、古风、极道等），让翻译更有灵魂。

#### 3. 🧠 记忆库 (Memory Bank)

- **世界观沉淀**: 记录复杂的势力关系、魔法系统规则、关键剧情伏笔。
- **三信号智能检索**: 基于语义相似度、关键词匹配和时间衰减自动评分（权重 0.6 / 0.3 / 0.1），总分归一到 0–1.0，按字符预算贪心填充，精准注入最相关记忆；支持最低相关度阈值与人口感知打分。
- **本地语义嵌入（可选）**: 内置 `gte-multilingual-base` 多语言编码器（Transformers.js），通过 WebGPU + q4f16 运行，不支持时自动回退 WASM + q8。完全本地运行，不消耗 API 额度；默认关闭，需在"设置 → 本地嵌入"中手动启用，移动端受 WASM 内存限制强制禁用。
- **混合搜索**: `search_memories` 工具支持自然语言查询，同时利用关键词匹配和语义向量排序；关闭嵌入时自动退化为关键词 + 时间衰减。

#### 4. 📑 章节语义索引 (Chapter Vector Index)

- **多向量章节索引**: 启用本地嵌入后，为每个章节按段落建立多向量索引，并额外为"章节标题 + 首段"写入专属向量，支持标题 / 系列 / 主题型查询。
- **`query_chapter` 混合检索**: AI 可用自然语言跨章节搜索原文，总分 = `0.65 × 语义（z-score 归一） + 0.35 × 字面关键词`；翻译、润色、校对、聊天助手四类任务的提示词已学会调用该工具获取前文上下文。
- **批量管理**: 本地向量索引弹窗展示每本书的记录数，支持单书重建、批量重算、测试查询对话框。

### 💬 AI 协作聊天助手

您的侧边栏 24/7 翻译导师：

- **实时协助**: 随时询问 "这句话的梗在哪？" 或 "这里怎么翻译才能保留原作者的俏皮感？"。
- **自动化操控**: 直接通过对话修改书籍信息或增删术语，例如："帮我把这本书改成完结状态"。
- **内置知识库**: 遇到软件使用问题，AI 会检索官方帮助文档为您解答。

### ☁️ 数据同步与安全

- **本地优先**: 数据存储在 IndexedDB 中，无需担心隐私泄露，离线亦可工作。
- **Gist 云同步**: 配合 **GitHub Gist** 实现私有云备份，支持修订历史回溯，一键恢复至任意历史版本。
- **Manifest 增量同步**: 基于 `manifest.json` + SHA-256 哈希，只上传变化的条目；下载使用 `If-None-Match` 条件 GET，远端无变化不消耗 API 配额。上传前伪 CAS 校验远端 ETag，多设备并发写入自动合并重试。
- **跨端删除一致**: Manifest 使用墓碑（tombstones）传递删除语义，A 设备删除的条目不会被 B 设备重新推回。
- **强制推送模式**: 设备迁移或远端损坏时可一键以本地数据覆盖远端，安全可控。

### 📱 全设备适配

- **桌面 / 平板 / 移动**: Dispatcher + 三变体架构，桌面保持信息密度、平板提供双面板阅读与可停靠 AI 助手、移动端采用底部 Tab 栏 + BottomSheet 的原生化体验。
- **Electron 桌面版**: 一套代码同时打包 Web SPA 与跨平台桌面客户端，桌面端强制使用 Desktop 变体。

## 📸 界面预览

自 v0.10.1 起，所有页面在桌面 / 平板 / 手机上都有专属模板（而不是简单拉伸）。以下为各设备的实际运行截图。

### 🏠 首页 · Dashboard

![桌面首页](public/screenshots/desktop-index.png)

|                                 平板 · Tablet                                 |                                 手机 · Mobile                                 |
| :---------------------------------------------------------------------------: | :---------------------------------------------------------------------------: |
| <img src="public/screenshots/tablet-index.png" alt="平板首页" width="100%" /> | <img src="public/screenshots/mobile-index.png" alt="手机首页" width="100%" /> |

### 📚 书库 · Library

![桌面书库](public/screenshots/desktop-library.png)

|                                  平板 · Tablet                                  |                                  手机 · Mobile                                  |
| :-----------------------------------------------------------------------------: | :-----------------------------------------------------------------------------: |
| <img src="public/screenshots/tablet-library.png" alt="平板书库" width="100%" /> | <img src="public/screenshots/mobile-library.png" alt="手机书库" width="100%" /> |

### 📖 书籍详情 / 阅读器 · Book Details & Reader

> 桌面与平板采用双面板布局，将章节树、元数据、段落阅读合并为同一视图；手机端则拆分为独立页面以适配竖屏空间。

![桌面书籍详情](public/screenshots/desktop-book-details.png)

|                                      平板 · Tablet                                       |                                     手机 (书籍详情)                                      |                                  手机 (阅读器)                                   |
| :--------------------------------------------------------------------------------------: | :--------------------------------------------------------------------------------------: | :------------------------------------------------------------------------------: |
| <img src="public/screenshots/tablet-book-details.png" alt="平板书籍详情" width="100%" /> | <img src="public/screenshots/mobile-book-details.png" alt="手机书籍详情" width="100%" /> | <img src="public/screenshots/mobile-reader.png" alt="手机阅读器" width="100%" /> |

### 💬 AI 助手协作 · Reader + Chat Workspace

右侧面板可停靠，随时召唤 AI 助手；启用本地嵌入后可使用 `query_chapter` / `search_memories` 工具跨章节、跨记忆检索上下文。

![桌面阅读器 + AI 助手](public/screenshots/desktop-reader-with-chat.png)

|                                            平板 · Tablet                                             |                                        手机 · Mobile                                         |
| :--------------------------------------------------------------------------------------------------: | :------------------------------------------------------------------------------------------: |
| <img src="public/screenshots/tablet-reader-with-chat.png" alt="平板阅读器 + AI 助手" width="100%" /> | <img src="public/screenshots/mobile-reader-with-chat.png" alt="手机 AI 助手" width="100%" /> |

### 🤖 AI 模型管理 · Model Management

![桌面 AI 模型](public/screenshots/desktop-ai-models.png)

|                                     平板 · Tablet                                     |                                     手机 · Mobile                                     |
| :-----------------------------------------------------------------------------------: | :-----------------------------------------------------------------------------------: |
| <img src="public/screenshots/tablet-ai-models.png" alt="平板 AI 模型" width="100%" /> | <img src="public/screenshots/mobile-ai-models.png" alt="手机 AI 模型" width="100%" /> |

## 🔒 隐私与数据主权

Tsukuyomi 从架构设计起便把"数据属于你"作为第一原则：

- **本地优先架构**: 所有书籍、翻译、术语、记忆与配置默认存储在浏览器 IndexedDB（或 Electron 桌面版的本地磁盘），**完全离线可用**。
- **BYOK（Bring Your Own Key）**: API Key 只在本地保存，请求直连 AI 厂商（或你自选的 CORS 代理 / 网关），不经过任何第三方中继。
- **本地语义嵌入**: 启用"本地嵌入"后，记忆库与章节语义索引使用 Transformers.js 在浏览器 / Electron 内部运行，**不上传任何文本到外部嵌入服务**；模型文件下载后自动缓存到浏览器 Cache Storage。
- **可选 Gist 云同步**: 云备份仅写入你自己的私有 GitHub Gist，基于 Manifest + SHA-256 哈希的条件 GET 最小化流量，Token 本地加密保存；关闭同步即可完全脱网使用。
- **无追踪 · 无埋点**: 不收集使用数据，不接入任何统计或广告 SDK。

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

- **自动抓取**: 支持从 `syosetu.com`, `kakuyomu.jp`, `syosetu.org` 等主流小说网一键导入。
- **JSON 导入**: 支持导入其他译者分享的翻译包或备份文件。

## 📖 文档索引

| 文档类别     | 详细指南 (位于 `public/help`)                                                                                                                                |
| :----------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **基础配置** | [快速开始](public/help/front-page.md) \| [AI 模型配置](public/help/ai-models-guide.md) \| [设置与同步](public/help/settings-guide.md)                        |
| **书籍管理** | [图书馆介绍](public/help/library-guide.md) \| [导入与抓取](public/help/books-page-guide.md) \| [章节管理](public/help/book-details-chapters.md)              |
| **翻译实战** | [翻译功能面板](public/help/book-details-translation.md) \| [三种编辑模式](public/help/book-details-editing.md) \| [工具栏详解](public/help/toolbar-guide.md) |
| **核心逻辑** | [术语管理](public/help/book-details-terminology.md) \| [角色设定](public/help/book-details-characters.md) \| [记忆系统](public/help/book-details-memory.md)  |
| **进阶工具** | [聊天助手实战](public/help/chat-assistant-guide.md)                                                                                                          |

> 📖 **在线文档**: 完整的帮助文档已同步到 [GitHub Wiki](https://github.com/rozx/Tsukuyomi/wiki)，提供更好的浏览体验。

## 🧱 技术栈

| 层级              | 技术                                                                                                                  |
| :---------------- | :-------------------------------------------------------------------------------------------------------------------- |
| **前端框架**      | Vue 3.5 · Quasar 2.18 · TypeScript 5.9 · Pinia 3 · PrimeVue 4.5 · Tailwind CSS 3.4 · Vue-i18n (zh-CN / zh-TW / en-US) |
| **桌面封装**      | Electron 39（Web SPA 与桌面端共用同一份代码，通过 `useDeviceVariant` 强制 Desktop 变体）                              |
| **运行时 / 构建** | Bun ≥ 1.0 · Vite · Quasar CLI                                                                                         |
| **AI SDK**        | OpenAI SDK · Google Generative AI · 自定义 Claude 集成 · Moonshot Kimi 等兼容 OpenAI 协议的模型（BYOK）               |
| **本地嵌入**      | Transformers.js (ONNX Runtime Web) · `gte-multilingual-base` · WebGPU + q4f16（优先）/ WASM + q8（回退）              |
| **存储 / 同步**   | IndexedDB (`idb`) · GitHub Gist (`@octokit/rest`) · SHA-256 哈希 manifest · 条件 GET + 伪 CAS 并发保护                |
| **抓取**          | Puppeteer + `puppeteer-extra-plugin-stealth`（Electron 桌面版）/ HTTP 代理轮询（Web 版）                              |
| **测试**          | Bun test · fake-indexeddb                                                                                             |

## 🛠️ 开发与构建

| 命令                     | 用途                                      |
| :----------------------- | :---------------------------------------- |
| `bun install`            | 安装依赖                                  |
| `bun run dev`            | 启动 Web 开发模式（前端:9000, 后端:8080） |
| `bun run dev:electron`   | 启动 Electron 开发模式                    |
| `bun run build:spa`      | 构建生产环境 Web SPA                      |
| `bun run build:electron` | 打包跨平台桌面客户端 (dmg/exe/deb)        |
| `bun run lint`           | 代码规范性检测                            |
| `bun run type-check`     | TypeScript 类型检查                       |
| `bun test`               | 运行测试套件                              |
| `bun run bump`           | 手动/自动更新版本号                       |

**开发者文档**: [构建故障排查](docs/BUILD_TROUBLESHOOTING.md) \| [主题指南](docs/THEME_GUIDE.md) \| [翻译指南](docs/TRANSLATION_GUIDE.md) \| [Wiki 同步](docs/WIKI_SYNC.md) \| [贡献者指南](AGENTS.md) \| [项目约定 (Claude Code)](CLAUDE.md)

## 🤝 贡献

欢迎 Issue、PR、以及翻译器使用反馈。提交代码前请：

1. `bun run lint && bun run type-check` 通过本地检查；
2. 新增功能请配套写测试（`src/__tests__/`）；
3. UI 改动需在桌面 / 平板 / 手机三个断点手动验证，遵循 `CLAUDE.md` 的"设备变体规则"。

## 📄 许可证

[Apache License 2.0](LICENSE) — 可自由用于个人与商业用途，请在二次分发时保留版权声明。

---

> _Tsukuyomi - 让每一次翻页都如月光般流畅。_
