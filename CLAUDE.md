# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

这是一个基于 Quasar Framework (Vue 3) 的 AI 驱动的小说翻译工具,支持从日本小说网站自动抓取内容并使用 AI 进行翻译、润色和校对。

## 常用命令

### 开发
```bash
# 开发模式 (同时启动前端和后端服务器)
bun run dev

# 仅启动前端 (Vite 开发服务器,端口 9000)
bun run dev:vite

# 仅启动后端应用服务器 (端口 8080)
bun run dev:server

# Electron 桌面应用开发模式
bun run dev:electron
```

### 构建
```bash
# 构建生产版本 (SPA)
bun run build:spa

# 构建 Electron 桌面应用
bun run build:electron

# 调试模式构建 Electron
bun run build:electron:debug
```

### 测试和质量检查
```bash
# 运行所有测试 (使用 Bun 测试运行器)
bun run test

# Lint 代码
bun run lint

# 类型检查
bun run type-check

# 格式化代码
bun run format
```

## 架构概览

### 分层架构
项目采用经典的分层架构:

1. **Models (数据模型)** - `src/models/`
   - `novel.ts`: 小说、卷、章节、段落等核心数据模型
   - `memory.ts`: AI 记忆存储模型
   - `settings.ts`: 设置数据模型
   - `sync.ts`: 同步相关模型

2. **Services (服务层)** - `src/services/`
   - 核心业务逻辑层,处理数据操作和复杂计算
   - 主要服务:
     - `book-service.ts`: 书籍 CRUD 操作
     - `chapter-service.ts`: 章节管理和段落搜索
     - `chapter-content-service.ts`: 章节内容处理和导出
     - `memory-service.ts`: AI 记忆的存储和检索 (LRU 缓存)
     - `character-setting-service.ts`: 人物设定管理
     - `terminology-service.ts`: 术语管理
     - `gist-sync-service.ts`: GitHub Gist 同步功能
     - `sync-data-service.ts`: 数据同步服务

3. **Composables (组合式函数)** - `src/composables/`
   - Vue 3 组合式 API 封装的业务逻辑
   - 连接服务和组件的桥梁
   - `book-details/`: 书籍详情页专用 composables

4. **Stores (状态管理)** - `src/stores/`
   - Pinia stores,管理全局状态
   - 主要 stores:
     - `books.ts`: 书籍列表和当前书籍状态
     - `book-details.ts`: 书籍详情页状态
     - `ai-processing.ts`: AI 处理队列和状态
     - `settings.ts`: 应用设置
     - `context.ts`: 当前上下文 (选中的章节、段落等)

5. **Components (UI 组件)** - `src/components/`
   - Vue 单文件组件
   - 按功能分类: `dialogs/`, `novel/`, `settings/`, `translation/`, `ai/`, `layout/`

### 核心子系统

#### AI 服务架构 (`src/services/ai/`)

采用**工厂模式 + 提供者模式**:

- `AIServiceFactory`: AI 服务工厂,统一接口
- 提供者:
  - `providers/gemini-service.ts`: Google Gemini API
  - `providers/openai-service.ts`: OpenAI 兼容 API
- 任务服务 (`tasks/`):
  - `translation-service.ts`: 翻译任务
  - `polish-service.ts`: 润色任务
  - `proofreading-service.ts`: 校对任务
  - `assistant-service.ts`: AI 助手对话
  - `config-service.ts`: AI 模型配置
- AI 工具 (`tools/`): Function Calling 工具定义
  - `book-tools.ts`: 书籍操作工具
  - `character-tools.ts`: 人物设定工具
  - `terminology-tools.ts`: 术语工具
  - `memory-tools.ts`: 记忆管理工具
  - `paragraph-tools.ts`: 段落操作工具
  - `web-search-tools.ts`: 网络搜索工具
  - `todo-list-tools.ts`: 待办事项工具

#### Novel Scraper 架构 (`src/services/scraper/`)

采用**策略模式 + 工厂模式**:

- `NovelScraperFactory`: 根据 URL 自动选择爬虫
- 支持的网站:
  - `syosetu.org`: SyosetuScraper (自定义中文翻译站)
  - `kakuyomu.jp`: KakuyomuScraper
  - `ncode.syosetu.com`: NcodeSyosetuScraper
  - `novel18.syosetu.com`: Novel18SyosetuScraper
- `BaseScraper`: 基础爬虫类,定义通用接口
- `ScraperService`: 爬虫服务,提供批量抓取功能

#### 数据同步架构

- **GitHub Gist 同步**: `gist-sync-service.ts`
  - 支持增量同步和冲突检测
  - 自动上传和下载数据

- **本地 IndexedDB**: 使用 `idb` 库
  - 所有数据持久化在浏览器本地
  - 支持导出/导入 (`ImportExportTab.vue`)

### 章节内容懒加载机制

关键设计模式:章节内容按需加载

- 列表视图时:`chapter.content = undefined`, `chapter.contentLoaded = false`
- 查看详情时:加载内容到 `chapter.content`,设置 `contentLoaded = true`
- 好处:大幅减少内存占用,支持大型小说

### AI 记忆系统 (`memory-service.ts`)

**LRU (Least Recently Used) 缓存策略**:

- 存储大块内容:章节摘要、背景设定等
- `lastAccessedAt` 字段追踪访问时间
- 自动清理最少使用的记忆
- AI 上下文管理:根据任务类型和 token 预算动态选择相关记忆

### 段落翻译系统

**多版本翻译支持**:

- 每个段落可有多个翻译版本 (`paragraph.translations[]`)
- `paragraph.selectedTranslationId`: 当前选中的翻译版本
- 支持切换不同翻译版本进行对比
- 翻译、润色、校对都生成新版本,不覆盖原文

## 重要开发注意事项

### 类型安全
- 项目使用严格模式 TypeScript (`strict: true`)
- 所有新代码必须定义类型
- 优先使用 `src/models/` 中已定义的接口

### 状态管理
- 优先使用 Composables 处理业务逻辑,不要直接在组件中编写复杂逻辑
- 只在需要跨组件共享状态时使用 Pinia Stores
- 服务层应该是纯 TypeScript,不依赖 Vue

### 数据模型
- 核心模型定义在 `src/models/novel.ts`
- 段落、章节、卷、书籍的层级关系: `Paragraph → Chapter → Volume → Novel`
- 修改数据结构时,同步更新相关服务和 composables

### 翻译任务流程
1. 用户选择段落/章节
2. 通过 `useChapterTranslation.ts` composable 触发翻译
3. 调用 `AI Processing Store` 加入任务队列
4. AI 服务处理 (使用流式输出,实时更新进度)
5. 结果保存到 IndexedDB,更新 UI

### AI 工具开发
新增 AI Function Calling 工具时:
1. 在 `src/services/ai/tools/` 下创建工具文件
2. 导出 Zod schema (参数验证) 和处理器函数
3. 在 `src/services/ai/tools/index.ts` 中注册工具
4. 在对应的任务服务中引用工具

### 测试
- 测试文件放在 `src/__tests__/` 目录
- 使用 Bun 内置的测试运行器
- 测试文件命名: `<module-name>.test.ts`

### 样式开发
- 使用 Tailwind CSS 工具类
- PrimeVue 组件库 (已配置自动导入)
- Quasar 组件 (通过 `q-` 前缀使用)

### 国际化 (i18n)
- 语言文件: `src/i18n/{locale}/index.ts`
- 支持的语言: `zh-CN`, `zh-TW`, `en-US`
- 使用 `$t()` 函数在组件中翻译文本

## Electron 桌面应用

- 主进程入口: 自动生成,位于 `dist/electron/`
- 使用 `electron-builder` 打包
- 开发时使用 `quasar dev -m electron`
- 生产构建使用 `quasar build -m electron`
- 注意:Electron 模式下静态资源使用相对路径 (`./`)

## 服务器

- `server/app-server.ts`: Express 应用服务器 (端口 8080)
- `server/proxy-server.ts`: 代理服务器
- 开发模式下与 Vite 前端服务器 (端口 9000) 并行运行
- 用于处理需要后端的功能 (如代理、文件处理等)
