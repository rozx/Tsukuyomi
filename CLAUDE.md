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
bun run quality-check          # Fallow 代码质量检查（要先跑 test:coverage 才有 CRAP 评分数据）
bun run format                 # Prettier 格式化

bun run test                   # 运行所有测试（vitest）
bun run test:watch             # 监听模式
bun run test:coverage          # 生成 istanbul 覆盖率（coverage/coverage-final.json）
bunx vitest run book-service   # 按文件名过滤
bunx vitest run -t "测试描述"  # 按测试名过滤
```

**修改代码后必须运行**: `bun run lint && bun run type-check && bun run quality-check`

## 架构分层

```
pages/components (UI) → composables (逻辑复用) → stores (Pinia 状态) → services (业务逻辑) → IndexedDB/API
```

- **services/** — 纯业务逻辑，不依赖 Vue/Pinia。核心: `book-service`, `chapter-service`, `chapter-content-service`, `memory-service`, `memory-scoring`, `embedding-service`, `embedding-queue`, `terminology-service`, `sync-data-service`
- **stores/** — Pinia 状态管理 (12 个): `books`, `book-details`, `ai-models`, `ai-processing`, `settings`, `chat-sessions`, `ui`, `context` 等
- **composables/** — Vue Composition API 封装，包含 `book-details/`, `chat/` 等
- **services/ai/** — AI 子系统: `core/` 基础服务, `providers/` (OpenAI/Gemini), `tasks/` (translate/polish/proofread/explain/assistant), `tools/` (30+ AI 工具定义)
- **models/** — 数据模型: `novel.ts` (Novel/Volume/Chapter/Paragraph/Translation/ScoreBreakdown), `memory.ts` (Memory + 可选 embedding/embeddingModel), `settings.ts` (含 MemoryInjectionSettings), `sync.ts`

## 设备变体规则（Dispatcher + Desktop/Tablet/Mobile）

**强制规则**: 所有 `src/layouts/*.vue`、`src/pages/*.vue`，以及任何在桌面 / 平板 / 手机呈现差异明显的组件，都**必须**使用 dispatcher + 三变体模式。禁止在页面或布局里直接写 `v-if="isPhone"` / `v-if="isElectron"` 分支。

**分派规则**（唯一实现位置：[`src/composables/useDeviceVariant.ts`](src/composables/useDeviceVariant.ts)）：

- Electron 永远强制 `'desktop'`（无论窗口尺寸）
- Web 端按 `useResponsiveLayout()` 断点选择 `'mobile'` / `'tablet'` / `'desktop'`
- 禁止在别处手写 `isElectron ? ... : isPhone ? ...`。叶子对话框（`BookDialog`、`NovelScraperDialog` 等）是明确豁免项

**标准文件结构**（以页面为例，布局/组件同构）：

```
src/pages/<name>.vue                              # dispatcher（30 行内，保持路由路径稳定）
src/pages/<name-kebab>/
  <Name>Desktop.vue                               # 桌面模板
  <Name>Tablet.vue                                # 平板：多为 3 行 wrapper（<Desktop />）
  <Name>Mobile.vue                                # 手机模板
src/composables/<name-kebab>/use<Name>.ts         # 业务逻辑，通过 provide / inject 跨变体共享
```

**关键约定**：

1. **业务逻辑全部进 composable** — 变体文件只负责模板。composable 暴露 `provide<Name>()` + `inject<Name>()` 两个 helper，dispatcher 调 provide，变体调 inject（参考 `useBookDetailsPage.ts`、`useSettingsPage.ts`）
2. **一次性副作用只跑一次** — auto-sync、AI 任务 watcher、embedding warmup、toast 初始化等放在 composable 的 `onMounted` 或 dispatcher 里，**不得**在每个变体里重复注册（否则断点切换会重复触发）
3. **跨变体共享的弹窗 / Toast 挂在 dispatcher** — 避免三个变体各自渲染一份造成重复挂载和状态分叉
4. **UI 状态走 Pinia 或 provide/inject** — 不要在变体内部用本地 `ref` 保存需要跨断点切换存活的状态；变体组件会被整体换掉
5. **Tablet 常是 `<Desktop />` wrapper** — 除非确有三套模板，否则写 wrapper 保留文件结构统一（后续做独立平板设计时不改 dispatcher）
6. **DRY**：变体之间重复的模板片段要抽成 `components/<surface>/XxxFragment.vue`（例子：`components/novel/translation-progress/TaskEmptyState.vue`）

## 关键设计

- **多版本翻译**: 每个 Paragraph 含 `translations: Translation[]` 数组，支持多个翻译版本并行
- **章节懒加载**: 章节内容存储在独立的 `chapter-contents` IndexedDB store，按需读取
- **AI 工具循环**: AI 任务通过工具调用循环执行（类似 function calling），30+ 个工具处理翻译、记忆更新等
- **记忆注入**: 三信号自动打分（语义相似度 + 关键词匹配 + 时间衰减，权重 0.6/0.3/0.1，满分 1.0），基于字符预算贪心填充注入翻译上下文
- **本地嵌入**: Transformers.js + EmbeddingGemma 300M ONNX（256 维 Matryoshka，动态 import 不进主 bundle），EmbeddingQueue 异步批量处理
- **记忆搜索**: `search_memories` 工具接收自然语言 query，混合关键词 + 语义检索
- **章节检索**: `query_chapter` 工具混合打分 — z-score 归一化的语义（`max(title_norm, α·content_max + (1-α)·content_top3_mean)`，α=0.6）+ 字面关键词（标题加权 1.0、正文 0.6），`total = 0.65 × semantic + 0.35 × keyword`。每章额外嵌入一条 `kind: 'title'` chunk（章节标题 + 首段），支持标题/系列/主题型 query
- **ID 生成**: 书籍用 UUID，其他用 8 位 hex (`generateShortId`)
- **数据同步**: 基于 manifest 的增量同步。`manifest.json` 记录每个条目（settings / ai-models / cover-history / novel:<id> / memories:<id>）的 SHA-256 哈希；上传只推哈希变化的文件，下载只解析变化条目。`useSyncExecutor` 使用 `If-None-Match` 条件 GET + 伪 CAS（PATCH 前再验 ETag）防止多设备静默覆盖。`SyncConfig.lastRemoteETag` / `knownRemoteHashes` 持久化同步状态。Memory / AI 模型 / 封面各自独立文件。`SyncDataService.applyPartialRemoteData` 按 entry 合并远端变化

## 路由

```
/                     → IndexPage (首页)
/books                → BooksPage (书籍库)
/books/:id            → BookDetailsPage (书籍详情，最复杂的页面)
/books/:id/settings/:setting(terms|characters|memory) → BookDetailsPage (设置标签)
/ai                   → AIPage (AI 配置)
/settings             → SettingsPage (应用设置，已从弹窗改为路由页)
/help/:docId?         → HelpPage
```

> 所有页面都是 dispatcher，见「设备变体规则」。路由**只指向 dispatcher** (`src/pages/*.vue`)，变体文件不进路由表。

## 代码风格

- **语言**: 代码注释、UI 文本、回答均用**简体中文**
- **导入**: 类型导入必须用 `import type { ... }` (ESLint 强制)
- **格式**: 单引号、行宽 100、分号结尾、2 空格缩进
- **Vue**: `<script setup lang="ts">`，Props 用 `defineProps<Props>()`，Emits 类型安全
- **命名**: 文件 kebab-case (`book-service.ts`)，Service PascalCase (`BookService`)，变量 camelCase

## Fallow 误报抑制

Fallow 无法追踪 Vue `<template>` 消费者、动态 import、抽象基类多态调用等。遇到误报（`unused-export` / `unused-class-member`）**优先删真死代码**；确认是误报才抑制。

**用行内注释**，**不要**往 `.fallowrc.json` 加 `ignoreExports` / `usedClassMembers`（用户明确要求）：

```ts
// fallow-ignore-next-line unused-export
export const MODEL_ID = '...';

/**
 * 抽象方法，子类实现通过 NovelScraperFactory 多态分派
 */
// fallow-ignore-next-line unused-class-member
abstract fetchNovel(url: string): Promise<Novel>;
```

注释放在目标声明**正上方一行**；有 JSDoc 时夹在 JSDoc 的 `*/` 与声明之间。规则名是**单数**（`unused-export` / `unused-class-member`），不是复数。

## 测试

使用 **Vitest (jsdom)** 运行测试。测试文件放在 `src/__tests__/`，沿用 `bun:test` 风格的 import（通过 `src/__tests__/bun-test-shim.ts` 别名映射到 vitest），新测试也可直接 `from 'vitest'`。全局 Pinia 与 PrimeVue `useToast` 在 `src/__tests__/vitest-setup.ts` 里预先 mock 好，无需每个文件重复。

```typescript
import { describe, expect, it, mock, beforeEach, afterEach, spyOn } from 'bun:test';

describe('MyService', () => {
  afterEach(() => { mock.restore(); });
  it('should work', async () => {
    spyOn(SomeService, 'method').mockImplementation(fn);
    const result = await MyService.doSomething();
    expect(result).toBe(expected);
  });
});
```

**模块级 mock**（整个模块替换）必须用 `vi.mock('path', factory)`，并通过 `vi.hoisted(() => …)` 构造 factory 里引用的 spy —— vitest 会把 `vi.mock` 调用静态提升到所有 import 之前执行。**不要**用 `await mock.module(...)`，vite 的 transform 不会提升它。

运行时 mock（根据每个测试动态换实现）用 `vi.doMock + vi.resetModules + 动态 `import()`，参考 `src/__tests__/local-embedding.test.ts`。

`bun test` 仍可用于极少数依赖 Bun 专属 API 的文件（scraper 测试用 `Bun.file(...)`），通过 `bun run test:bun` 触发；但主要 runner 是 vitest。

## 技术栈

Vue 3.5 + Quasar 2.18 + TypeScript 5.9 + Pinia 3 + PrimeVue 4.5 + Tailwind CSS 3.4 + Vue-i18n (zh-CN/zh-TW/en-US) + Electron 39 + Bun

AI: OpenAI SDK + Google Generative AI + 自定义 Claude 集成

存储: IndexedDB (idb) + GitHub Gist (@octokit/rest)

## 相关文档

- [AGENTS.md](AGENTS.md) — AI 编码代理指南（与本文件有重叠，更简洁）
- [docs/TRANSLATION_GUIDE.md](docs/TRANSLATION_GUIDE.md) — 翻译规则、敬语处理、AI 提示词
- [docs/BUILD_TROUBLESHOOTING.md](docs/BUILD_TROUBLESHOOTING.md) — 构建问题排查
- [docs/THEME_GUIDE.md](docs/THEME_GUIDE.md) — PrimeVue 主题配置
