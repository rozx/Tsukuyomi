# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

**Tsukuyomi (月詠)** — AI 驱动的日本轻小说翻译工具。Vue 3 + Quasar + TypeScript，支持 Web SPA 和 Electron 桌面端。数据存储在 IndexedDB（完全离线），可选 GitHub Gist 云同步。

## 开发命令

```bash
bun install                    # 安装依赖
bun run dev                    # Web 开发模式 (前端:9000, 后端:8080)
bun run dev:electron           # Electron 开发模式

bun run build:spa              # 构建 Web SPA
bun run build:electron         # 构建 Electron 桌面应用

bun run lint                   # ESLint 检查
bun run type-check             # TypeScript 类型检查
bun run format                 # Prettier 格式化

bun test                       # 运行所有测试
bun test book-service          # 按文件名匹配
bun test -t "测试描述"          # 按测试名匹配
bun test --watch               # 监听模式
```

**修改代码后必须运行**: `bun run lint && bun run type-check`

## 架构分层

```
pages/components (UI) → composables (逻辑复用) → stores (Pinia 状态) → services (业务逻辑) → IndexedDB/API
```

- **services/** — 纯业务逻辑，不依赖 Vue/Pinia。核心: `book-service`, `chapter-service`, `chapter-content-service`, `memory-service`, `terminology-service`, `sync-data-service`
- **stores/** — Pinia 状态管理 (12 个): `books`, `book-details`, `ai-models`, `ai-processing`, `settings`, `chat-sessions`, `ui`, `context` 等
- **composables/** — Vue Composition API 封装，包含 `book-details/`, `chat/` 等
- **services/ai/** — AI 子系统: `core/` 基础服务, `providers/` (OpenAI/Gemini), `tasks/` (translate/polish/proofread/explain/assistant), `tools/` (30+ AI 工具定义)
- **models/** — 数据模型: `novel.ts` (Novel/Volume/Chapter/Paragraph/Translation), `memory.ts`, `settings.ts`, `sync.ts`

## 关键设计

- **多版本翻译**: 每个 Paragraph 含 `translations: Translation[]` 数组，支持多个翻译版本并行
- **章节懒加载**: 章节内容存储在独立的 `chapter-contents` IndexedDB store，按需读取
- **AI 工具循环**: AI 任务通过工具调用循环执行（类似 function calling），30+ 个工具处理翻译、记忆更新等
- **记忆库 LRU**: Memory 按 `lastAccessedAt` 排序，自动淘汰旧记忆
- **ID 生成**: 书籍用 UUID，其他用 8 位 hex (`generateShortId`)
- **数据同步**: `SyncDataService` 负责本地/远程数据合并与冲突解决，基于 `lastEdited` 时间戳

## 路由

```
/                     → IndexPage (首页)
/books                → BooksPage (书籍库)
/books/:id            → BookDetailsPage (书籍详情，最复杂的页面)
/books/:id/settings/:setting(terms|characters|memory) → BookDetailsPage (设置标签)
/ai                   → AIPage (AI 配置)
/help/:docId?         → HelpPage
```

## 代码风格

- **语言**: 代码注释、UI 文本、回答均用**简体中文**
- **导入**: 类型导入必须用 `import type { ... }` (ESLint 强制)
- **格式**: 单引号、行宽 100、分号结尾、2 空格缩进
- **Vue**: `<script setup lang="ts">`，Props 用 `defineProps<Props>()`，Emits 类型安全
- **命名**: 文件 kebab-case (`book-service.ts`)，Service PascalCase (`BookService`)，变量 camelCase

## 测试

使用 Bun 内置测试框架，测试文件位于 `src/__tests__/`：

```typescript
import { describe, expect, it, mock, beforeEach, afterEach, spyOn } from 'bun:test';
import './setup'; // 必须导入，提供 IndexedDB polyfill

describe('MyService', () => {
  afterEach(() => { mock.restore(); });
  it('should work', async () => {
    spyOn(SomeService, 'method').mockImplementation(fn); // 使用 spyOn 局部 mock
    const result = await MyService.doSomething();
    expect(result).toBe(expected);
  });
});
```

**注意**: 使用 `spyOn` 局部 mock，避免全局 `mock.module` 影响其他测试。

## 技术栈

Vue 3.5 + Quasar 2.18 + TypeScript 5.9 + Pinia 3 + PrimeVue 4.5 + Tailwind CSS 3.4 + Vue-i18n (zh-CN/zh-TW/en-US) + Electron 39 + Bun

AI: OpenAI SDK + Google Generative AI + 自定义 Claude 集成

存储: IndexedDB (idb) + GitHub Gist (@octokit/rest)

## 相关文档

- [AGENTS.md](AGENTS.md) — AI 编码代理指南（与本文件有重叠，更简洁）
- [docs/TRANSLATION_GUIDE.md](docs/TRANSLATION_GUIDE.md) — 翻译规则、敬语处理、AI 提示词
- [docs/BUILD_TROUBLESHOOTING.md](docs/BUILD_TROUBLESHOOTING.md) — 构建问题排查
- [docs/THEME_GUIDE.md](docs/THEME_GUIDE.md) — PrimeVue 主题配置
