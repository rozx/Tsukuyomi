# Tsukuyomi Translator - AI Coding Agent Guide

> **项目**: AI 驱动的日本小说翻译器 (Vue 3 + Quasar + TypeScript + Electron)

---

## 开发命令

```bash
# 安装依赖
bun install

# 开发
bun run dev              # 前端(9000) + 后端(8080) 同时启动
bun run dev:electron     # Electron 桌面应用开发模式

# 构建
bun run build:spa        # 构建 Web SPA
bun run build:electron   # 构建 Electron 桌面应用

# 代码质量 (修改后必须运行)
bun run lint             # ESLint 检查
bun run type-check       # TypeScript 类型检查 (vue-tsc --noEmit)
bun run format           # Prettier 格式化

# 测试
bun test                           # 运行所有测试
bun test book-service              # 按文件名模式匹配
bun test -t "应该保存书籍"         # 按测试名匹配
bun test --watch                   # 监听模式
```

**修改代码后必须运行**: `bun run lint && bun run type-check`

---

## 代码风格

### 导入规范

```typescript
// 类型导入必须使用 type 关键字 (ESLint @typescript-eslint/consistent-type-imports 强制)
import type { Novel, Chapter } from 'src/models/novel';
import { BookService } from 'src/services/book-service';
```

### 格式化

- 单引号、行宽 100、分号结尾、2 空格缩进、UTF-8、LF 换行
- 运行 `bun run format` 自动格式化

### 命名规范

| 类型      | 规范                 | 示例                   |
| --------- | -------------------- | ---------------------- |
| Service   | PascalCase + Service | `BookService`          |
| 文件名    | kebab-case           | `book-service.ts`      |
| 测试文件  | `.test.ts` 后缀      | `book-service.test.ts` |
| 变量/函数 | camelCase            | `getAllBooks`          |
| 常量      | UPPER_SNAKE_CASE     | `MAX_RETRY_COUNT`      |

### Vue 组件

- `<script setup lang="ts">` 置于 template 之后
- Props 使用 TypeScript 接口：`defineProps<Props>()`
- Emits 类型安全：`defineEmits<{ save: [id: string] }>()`

### ESLint 关键规则

- `@typescript-eslint/consistent-type-imports`: error — 必须用 `import type`
- `@typescript-eslint/no-explicit-any`: warn — 避免使用 any
- `@typescript-eslint/no-unused-vars`: warn — 未使用变量以 `_` 前缀忽略
- `@typescript-eslint/no-floating-promises`: off
- `@typescript-eslint/no-misused-promises`: warn
- TypeScript strict 模式已启用 (quasar.config.ts)

---

## 架构分层

```
数据流向: pages/components (UI) → composables (逻辑复用) → stores (Pinia 状态) → services (业务逻辑) → IndexedDB/API

src/
├── models/        # 数据结构定义 (纯 TypeScript，无依赖)
├── services/      # 业务逻辑 (不依赖 Vue/Pinia)
│   ├── ai/        # AI 子系统
│   │   ├── core/        # 基础 AI 服务
│   │   ├── providers/   # AI 提供商 (OpenAI/Gemini)
│   │   ├── tasks/       # AI 任务 (translate/polish/proofread/explain/assistant)
│   │   └── tools/       # 30+ AI 工具定义 (function calling)
│   └── scraper/   # 小说网站爬虫 (ncode/kakuyomu/syosetu 等)
├── composables/   # Vue Composition API 封装
├── stores/        # Pinia 状态管理 (12 个 store)
├── components/    # UI 组件
├── pages/         # 页面组件
├── router/        # Vue Router 路由配置
├── i18n/          # 国际化 (zh-CN/zh-TW/en-US)
├── utils/         # 工具函数
├── constants/     # 常量定义
├── types/         # 全局类型定义
└── __tests__/     # 测试文件 (70+ 测试文件)
```

**核心 Services**: `book-service`, `chapter-service`, `chapter-content-service`, `memory-service`, `memory-scoring`, `embedding-service`, `embedding-queue`, `terminology-service`, `sync-data-service`

---

## 路由

```
/                                          → IndexPage (首页)
/books                                     → BooksPage (书籍库)
/books/:id                                 → BookDetailsPage (书籍详情，最复杂的页面)
/books/:id/settings/:setting(terms|characters|memory) → BookDetailsPage (设置标签)
/ai                                        → AIPage (AI 配置)
/help/:docId?                              → HelpPage
```

---

## 测试策略

使用 Bun 内置测试框架，测试文件位于 `src/__tests__/`：

```typescript
import { describe, expect, it, mock, beforeEach, afterEach, spyOn } from 'bun:test';
import './setup'; // 必须导入，提供 IndexedDB/localStorage/FileReader polyfill
import { BookService } from '../services/book-service';
import type { Novel } from '../models/novel';

describe('MyService', () => {
  beforeEach(() => {
    spyOn(SomeService, 'method').mockImplementation(fn);
  });
  afterEach(() => {
    mock.restore();
  });
  it('should work', async () => {
    const result = await MyService.doSomething();
    expect(result).toBe(expected);
  });
});
```

**关键规则**:

- 必须导入 `./setup` (提供 fake-indexeddb、localStorage、FileReader polyfill，每个 test 前自动 `resetDbForTests()`)
- 使用 `spyOn` 局部 mock，避免全局 `mock.module` 影响其他测试
- 测试导入 service 使用相对路径 `../services/xxx`

---

## 错误处理

```typescript
// Service 层：抛出明确错误
throw new Error('具体错误信息');

// 组件层：使用 Toast 展示
import { useToastWithHistory } from 'src/composables/useToastHistory';
const { showError } = useToastWithHistory();
showError('操作失败', error.message);

// 日志
console.error('Failed to load book:', error);
```

---

## 关键设计

- **多版本翻译**: 每个 Paragraph 含 `translations: Translation[]`，支持多翻译版本并行
- **章节懒加载**: 内容存储在独立的 `chapter-contents` IndexedDB store，按需读取
- **AI 工具循环**: AI 任务通过工具调用循环执行 (function calling)，30+ 工具处理翻译、记忆更新等
- **记忆注入**: 三信号打分 (语义 0.6 + 关键词 0.3 + 时间衰减 0.1，满分 1.0) 自动选择最相关记忆注入翻译上下文，`memory-scoring.ts` 纯函数实现
- **本地嵌入**: `embedding-service.ts` (Transformers.js + EmbeddingGemma 300M，256 维) + `embedding-queue.ts` (异步批量嵌入)，动态 import 不进主 bundle
- **记忆搜索**: `search_memories` 工具接收自然语言 query，混合关键词 + 语义检索，复用 `scoreMemory()` 统一评分
- **ID 生成**: 书籍用 UUID，其他用 8 位 hex (`generateShortId`)
- **数据同步**: 基于 manifest 的增量同步。`manifest.json` 为权威索引，记录各条目 SHA-256 哈希；上传/下载按 hash diff 选择性处理。`useSyncExecutor` 用条件 GET（`If-None-Match`）+ 伪 CAS（PATCH 前再验 ETag）检测并发写入。`SyncConfig.lastRemoteETag` / `knownRemoteHashes` 持久化同步状态。Memory / AI 模型 / 封面独立文件存储
- **IndexedDB**: 使用 `idb` 库操作，`src/utils/indexed-db.ts` 封装了数据库初始化

---

## 技术栈

Vue 3.5 + Quasar 2.18 + TypeScript 5.9 (strict) + Pinia 3 + PrimeVue 4.5 + Tailwind CSS 3.4 + Vue-i18n + Electron 39 + Bun

AI: OpenAI SDK + Google Generative AI | 存储: IndexedDB (idb) + GitHub Gist (@octokit/rest)

---

## 重要提醒

1. **中文优先**: 代码注释、UI 文本、回答均用简体中文
2. **修改后检查**: 必须运行 `bun run lint && bun run type-check`
3. **遵循现有风格**: 创建新文件前参考现有实现
4. **DRY 原则**: 不重复代码，提取可复用函数
5. **路径别名**: 使用 `src/` 前缀导入模块 (tsconfig paths 配置)
