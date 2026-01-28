# Agent Architecture (AI Coding Agents Guide)

> **项目名称**: `tsukuyomi-translator` (月咏翻译器)  
> **产品名称**: Tsukuyomi - Moonlit Translator  
> **目标**: 将日本小说文本高质量翻译为自然流畅的简体中文，并支持校对、润色与语料优化

---

## 项目概述

Tsukuyomi 是一个 AI 驱动的日本小说翻译工具，支持从日本小说网站自动抓取内容，并使用 AI 进行翻译、润色和校对。应用采用**桌面优先**设计，同时支持 Web (SPA) 和 Electron 桌面两种运行模式。

### 核心功能

- **AI 翻译**: 支持 OpenAI 和 Google Gemini API，提供流式翻译、润色、校对
- **网页抓取**: 自动从 syosetu.org、kakuyomu.jp、ncode.syosetu.com、novel18.syosetu.com 等网站抓取小说
- **多版本翻译**: 每个段落支持多个翻译版本，可随时切换对比
- **术语管理**: 书籍级别的术语表和角色设定管理
- **AI 记忆系统**: LRU 缓存策略管理上下文记忆，支持长文本连贯翻译
- **数据同步**: 支持通过 GitHub Gist 进行跨设备数据同步
- **导出功能**: 支持导出为 TXT、Markdown、HTML 等格式

---

## 技术栈

### 前端框架与运行时

| 技术 | 版本 | 用途 |
|------|------|------|
| **Bun** | >=1.0.0 | JavaScript 运行时与包管理器 |
| **Vue 3** | ^3.5.25 | 前端框架（Composition API） |
| **Quasar** | ^2.18.6 | UI 框架与构建工具 |
| **Vite** | (内置) | 构建工具与开发服务器 |
| **TypeScript** | ^5.9.3 | 类型系统（严格模式） |

### UI 组件与样式

| 技术 | 版本 | 用途 |
|------|------|------|
| **PrimeVue** | ^4.5.0 | 主要 UI 组件库 |
| **Tailwind CSS** | ^3.4.18 | 工具类 CSS 框架 |
| **Quasar 组件** | ^2.18.6 | 补充 UI 组件（`q-` 前缀） |
| **PrimeIcons** | ^7.0.0 | 图标库 |

### 状态管理与数据

| 技术 | 版本 | 用途 |
|------|------|------|
| **Pinia** | ^3.0.4 | 全局状态管理 |
| **idb** | ^8.0.3 | IndexedDB 封装库 |
| **IndexedDB** | - | 本地数据持久化 |

### AI 与网络

| 技术 | 版本 | 用途 |
|------|------|------|
| **openai** | ^6.9.1 | OpenAI API SDK |
| **@google/generative-ai** | ^0.24.1 | Gemini API SDK |
| **axios** | ^1.13.2 | HTTP 客户端 |
| **cheerio** | ^1.1.2 | 服务器端 HTML 解析 |
| **marked** | ^17.0.1 | Markdown 解析 |

### 桌面端 (Electron)

| 技术 | 版本 | 用途 |
|------|------|------|
| **electron** | ^39.2.4 | 桌面应用框架 |
| **puppeteer** | ^24.31.0 | 浏览器自动化（用于爬虫） |
| **puppeteer-in-electron** | ^3.0.5 | Electron 集成 Puppeteer |
| **puppeteer-extra-plugin-stealth** | ^2.11.2 | 反检测插件 |

### 后端服务器

| 技术 | 版本 | 用途 |
|------|------|------|
| **express** | ^4.22.1 | Web 服务器框架 |
| **http-proxy-middleware** | ^3.0.5 | 开发代理 |

---

## 开发命令

### 开发模式

```bash
# 同时启动前端开发服务器(端口9000)和后端应用服务器(端口8080)
bun run dev

# 仅启动前端开发服务器 (Vite, 端口9000)
bun run dev:vite

# 仅启动后端应用服务器 (Express, 端口8080)
bun run dev:server

# 启动 Electron 桌面应用开发模式
bun run dev:electron
```

### 构建命令

```bash
# 构建 SPA Web 应用 (生产模式)
bun run build:spa

# 构建 Electron 桌面应用 (生产模式)
bun run build:electron

# 调试模式构建 Electron (启用开发者工具)
bun run build:electron:debug

# 完整的构建与部署脚本
bun run build:deploy
```

### 代码质量

```bash
# 运行 ESLint 检查代码规范
bun run lint

# 运行 TypeScript 类型检查
bun run type-check

# 使用 Prettier 格式化代码
bun run format
```

### 测试

```bash
# 运行所有测试
bun test

# 运行匹配文件名的测试
bun test book-service

# 仅运行名称匹配的测试
bun test -t "应该保存书籍"

# 仅运行标记为 .only() 的测试
bun test --only
```

### 其他命令

```bash
# 版本号递增 (用于发布)
bun run bump

# 启动生产服务器
bun run start

# 启动代理服务器
bun run start:proxy
```

---

## 项目架构

### 目录结构

```
project-root/
├── src/                          # 前端源代码
│   ├── __tests__/                # 测试文件
│   ├── boot/                     # Quasar 启动文件
│   ├── components/               # Vue 组件
│   │   ├── ai/                   # AI 相关组件
│   │   ├── common/               # 通用组件
│   │   ├── dialogs/              # 对话框组件
│   │   ├── layout/               # 布局组件
│   │   ├── novel/                # 小说相关组件
│   │   ├── settings/             # 设置页面组件
│   │   ├── sync/                 # 同步相关组件
│   │   └── translation/          # 翻译相关组件
│   ├── composables/              # Vue 组合式函数
│   │   └── book-details/         # 书籍详情页专用 composables
│   ├── constants/                # 常量定义
│   ├── css/                      # 样式文件
│   ├── i18n/                     # 国际化 (zh-CN, zh-TW, en-US)
│   ├── layouts/                  # 页面布局
│   ├── models/                   # TypeScript 数据模型
│   ├── pages/                    # 页面组件
│   ├── router/                   # Vue Router 配置
│   ├── services/                 # 业务服务层
│   │   ├── ai/                   # AI 服务
│   │   │   ├── core/             # 核心 AI 服务
│   │   │   ├── providers/        # AI 提供商 (OpenAI, Gemini)
│   │   │   ├── tasks/            # AI 任务 (翻译、润色等)
│   │   │   ├── tools/            # AI Function Calling 工具
│   │   │   └── types/            # AI 相关类型定义
│   │   └── scraper/              # 网页爬虫服务
│   ├── stores/                   # Pinia 状态管理
│   ├── theme/                    # PrimeVue 主题预设
│   ├── types/                    # 全局类型定义
│   └── utils/                    # 工具函数
├── server/                       # 后端服务器代码
│   ├── app-server.ts             # Express 应用服务器
│   ├── proxy-server.ts           # 代理服务器
│   └── proxy/                    # 代理处理器
├── src-electron/                 # Electron 主进程代码
│   ├── electron-main.ts          # 主进程入口
│   ├── electron-preload.ts       # Preload 脚本
│   └── icons/                    # 应用图标
├── vite-plugins/                 # 自定义 Vite 插件
└── scripts/                      # 构建脚本
```

### 架构分层

项目采用经典的分层架构，遵循**单一职责原则**:

#### 1. Models 层 (`src/models/`)

定义核心数据结构和 TypeScript 接口。

- `novel.ts`: 小说、卷、章节、段落等核心数据模型
- `settings.ts`: 应用设置数据模型
- `memory.ts`: AI 记忆存储模型
- `sync.ts`: 同步相关模型

#### 2. Services 层 (`src/services/`)

核心业务逻辑层，处理数据操作和复杂计算。**Services 不依赖 Vue，是纯 TypeScript。**

主要服务:

| 服务 | 职责 |
|------|------|
| `book-service.ts` | 书籍的 CRUD 操作，管理 IndexedDB 中的书籍数据 |
| `chapter-service.ts` | 章节管理、段落搜索 |
| `chapter-content-service.ts` | 章节内容的独立存储和加载（懒加载机制） |
| `terminology-service.ts` | 术语表管理 |
| `character-setting-service.ts` | 角色设定管理 |
| `memory-service.ts` | AI 记忆的存储和检索（LRU 缓存） |
| `gist-sync-service.ts` | GitHub Gist 同步功能 |
| `sync-data-service.ts` | 数据同步服务 |
| `ai-model-service.ts` | AI 模型配置管理 |

#### 3. Composables 层 (`src/composables/`)

Vue 3 Composition API 封装的业务逻辑，连接 Services 和 Components。

主要 composables:

| Composable | 职责 |
|------------|------|
| `useChapterTranslation.ts` | 章节翻译逻辑 |
| `useParagraphTranslation.ts` | 段落翻译逻辑 |
| `useEditMode.ts` | 编辑模式管理 |
| `useChapterDragDrop.ts` | 章节拖拽排序 |
| `useChapterExport.ts` | 章节导出功能 |
| `useKeyboardShortcuts.ts` | 键盘快捷键管理 |
| `useToastHistory.ts` | Toast 历史记录 |

#### 4. Stores 层 (`src/stores/`)

Pinia 全局状态管理，用于跨组件共享状态。

主要 stores:

| Store | 职责 |
|-------|------|
| `books.ts` | 书籍列表和当前书籍状态 |
| `book-details.ts` | 书籍详情页状态 |
| `ai-processing.ts` | AI 处理队列和状态 |
| `settings.ts` | 应用设置 |
| `context.ts` | 当前上下文（选中的章节、段落等） |
| `toast-history.ts` | Toast 通知历史 |

#### 5. Components 层 (`src/components/`)

Vue 单文件组件，仅负责 UI 渲染和用户交互。

### 核心子系统

#### AI 服务架构 (`src/services/ai/`)

采用**工厂模式 + 提供者模式**:

```
ai/
├── core/
│   └── base-ai-service.ts      # AI 服务基类和工厂
├── providers/
│   ├── gemini-service.ts       # Google Gemini 实现
│   ├── openai-service.ts       # OpenAI API 实现
│   └── index.ts
├── tasks/                      # AI 任务服务
│   ├── translation-service.ts  # 翻译任务
│   ├── polish-service.ts       # 润色任务
│   ├── proofreading-service.ts # 校对任务
│   ├── assistant-service.ts    # AI 助手对话
│   └── prompts/                # 提示词模板
├── tools/                      # Function Calling 工具
│   ├── book-tools.ts           # 书籍操作
│   ├── character-tools.ts      # 角色设定
│   ├── terminology-tools.ts    # 术语管理
│   ├── memory-tools.ts         # 记忆管理
│   ├── paragraph-tools.ts      # 段落操作
│   └── web-search-tools.ts     # 网络搜索
└── types/                      # 类型定义
```

#### 爬虫架构 (`src/services/scraper/`)

采用**策略模式 + 工厂模式**:

```
scraper/
├── core/
│   └── base-scraper.ts         # 爬虫基类
├── scrapers/
│   ├── syosetu-scraper.ts      # syosetu.org
│   ├── kakuyomu-scraper.ts     # kakuyomu.jp
│   ├── ncode-syosetu-scraper.ts # ncode.syosetu.com
│   └── novel18-syosetu-scraper.ts # novel18.syosetu.com
└── services/
    └── scraper-service.ts      # 爬虫服务
```

---

## 关键设计模式

### 1. 章节内容懒加载

为减少内存占用，章节内容采用**按需加载**策略:

- **列表视图**: `chapter.content = undefined`, `chapter.contentLoaded = false`
- **查看详情**: 通过 `ChapterContentService.loadChapterContent(chapterId)` 加载内容
- **保存时**: 内容被剥离到独立的 `chapter-contents` IndexedDB 存储

### 2. AI 记忆系统 (LRU 缓存)

`memory-service.ts` 实现 LRU (Least Recently Used) 缓存:

- 存储大块内容：章节摘要、背景设定等
- `lastAccessedAt` 字段追踪访问时间
- 自动清理最少使用的记忆
- AI 上下文管理：根据任务类型和 token 预算动态选择相关记忆

### 3. 段落多版本翻译

每个段落支持多个翻译版本:

```typescript
interface Paragraph {
  id: string;
  text: string;                          // 原文
  selectedTranslationId: string;         // 当前选中的翻译版本
  translations: Translation[];           // 所有翻译版本
}

interface Translation {
  id: string;
  translation: string;                   // 译文
  aiModelId: string;                     // 使用的 AI 模型
}
```

### 4. ID 生成规范

| 实体类型 | ID 格式 | 示例 |
|----------|---------|------|
| Novel (书籍) | UUID v4 | `550e8400-e29b-41d4-a716-446655440000` |
| Volume, Chapter, Paragraph, 等 | 8位十六进制短 ID | `e58ed763` |

使用 `UniqueIdGenerator` 确保组内唯一性:

```typescript
import { UniqueIdGenerator } from 'src/utils/id-generator';
const idGenerator = new UniqueIdGenerator(existingIds);
const id = idGenerator.generate();
```

---

## 代码规范

### 导入规范

- **Type 导入优先**: 使用 `import type` 导入类型（ESLint 强制）

```typescript
// ✅ 正确
import type { Novel, Chapter } from 'src/models/novel';
import { BookService } from 'src/services/book-service';

// ❌ 错误
import { Novel, Chapter } from 'src/models/novel';  // 类型未使用 type
```

- **路径别名**: 使用 `src/*` 别名导入

```typescript
import { foo } from 'src/utils/bar';
```

### Vue 组件规范

- **script 位置**: 必须置于 template 之后
- **语法**: 必须使用 `<script setup lang="ts">` 语法
- **Props 定义**: 使用 TypeScript 接口

```typescript
interface Props {
  book: Novel;
  title?: string;
}
const props = defineProps<Props>();
```

- **Emits 定义**: 使用类型安全的 `defineEmits`

```typescript
const emit = defineEmits<{
  save: [bookId: string];
  delete: [bookId: string];
}>();
```

### 命名规范

| 类型 | 规范 | 示例 |
|------|------|------|
| Service 类 | PascalCase + Service 后缀 | `BookService`, `TerminologyService` |
| 文件名 | kebab-case | `book-service.ts`, `paragraph-card.vue` |
| 测试文件 | `.test.ts` 后缀 | `book-service.test.ts` |
| 变量/函数 | camelCase | `getAllBooks`, `chapterId` |
| 常量 | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT` |
| 类型/接口 | PascalCase | `Novel`, `Chapter` |

### 格式化规范

- **单引号**: 所有字符串使用单引号
- **行宽**: 最大 100 字符
- **分号**: 语句末尾使用分号

---

## 测试策略

### 测试框架

使用 **Bun 内置测试框架**:

```typescript
// 文件顶部声明全局函数（避免 import 类型注解问题）
declare const describe: (name: string, fn: () => void) => void;
declare const test: (name: string, fn: () => void | Promise<void>) => void;
declare const expect: (actual: unknown) => { toBe: (expected: unknown) => void; ... };

import { test, expect, describe, beforeEach, afterEach, spyOn } from 'bun:test';
```

### Mock 策略

使用局部 mock，**避免全局 `mock.module`** 影响其他测试:

```typescript
import { spyOn } from 'bun:test';

beforeEach(() => {
  spyOn(ChapterContentService, 'saveChapterContent').mockImplementation(fn);
});

afterEach(() => {
  mock.restore();
});
```

### 测试环境设置

`src/__tests__/setup.ts` 提供测试环境 polyfill:

- `fake-indexeddb`: IndexedDB 实现
- `localStorage` polyfill
- `FileReader` mock

### 测试文件位置

所有测试文件放在 `src/__tests__/` 目录，命名格式: `<module-name>.test.ts`

---

## 数据存储

### IndexedDB 架构

数据库名称: `tsukuyomi`，版本: `7`

| 存储名称 | 键路径 | 用途 |
|----------|--------|------|
| `books` | `id` | 书籍元数据（不含章节内容） |
| `chapter-contents` | `chapterId` | 章节内容独立存储 |
| `ai-models` | `id` | AI 模型配置 |
| `settings` | `key` | 应用设置 |
| `sync-configs` | `id` | 同步配置 |
| `cover-history` | `id` | 封面历史 |
| `toast-history` | `id` | Toast 历史 |
| `thinking-processes` | `id` | AI 思考过程 |
| `memories` | `id` | AI 记忆 |
| `full-text-indexes` | `bookId` | 全文搜索索引 |

### Date 序列化

存储 Date 对象时使用 ISO 字符串，读取时转换回 Date:

```typescript
// 存储
obj.toISOString();

// 读取
new Date(isoString);
```

---

## 错误处理

### Service 层

抛出明确的错误对象:

```typescript
throw new Error('具体错误信息');
```

### 组件层

通过 `useToastWithHistory` 展示错误信息给用户:

```typescript
import { useToastWithHistory } from 'src/composables/useToastHistory';
const { showError } = useToastWithHistory();

showError('操作失败', error instanceof Error ? error.message : '未知错误');
```

### 日志

使用 `console.error` 记录错误，包含上下文信息:

```typescript
console.error('Failed to load book:', error);
```

---

## 多语言支持 (i18n)

支持语言:

- `zh-CN` (简体中文) - **主界面语言**
- `zh-TW` (繁体中文)
- `en-US` (英文)

语言文件位置: `src/i18n/{locale}/index.ts`

---

## 开发环境配置

### 端口配置

| 服务 | 端口 | 说明 |
|------|------|------|
| Vite 开发服务器 | 9000 | 前端开发 |
| Express 应用服务器 | 8080 | 后端 API 和代理 |

### 环境变量

| 变量 | 用途 |
|------|------|
| `NODE_ENV` | `production` 或 `development` |
| `PORT` | 应用服务器端口（默认 8080） |
| `VITE_PORT` | Vite 服务器端口（默认 9000） |
| `PROXY_MODE` | `puppeteer` 或 `allorigins` |
| `ELECTRON_DEBUG` | `true` 启用 Electron 开发者工具 |

---

## 安全注意事项

1. **API Keys**: AI 模型的 API Key 存储在本地 IndexedDB，不会上传到服务器
2. **CORS 代理**: 开发时使用 Vite 代理，生产环境使用 Express 代理服务器
3. **XSS 防护**: 使用 DOMPurify 清理用户输入和外部内容
4. **Electron 安全**: 
   - 禁用 `nodeIntegration`，启用 `contextIsolation`
   - Preload 脚本提供安全的 IPC 通信
   - 禁用 `webSecurity` 以允许爬虫绕过 CORS（仅在 Electron 中）

---

## 部署

### SPA Web 部署

构建输出目录: `dist/spa/`

```bash
bun run build:spa
```

### Electron 桌面应用

构建输出目录: `dist/electron/`

| 平台 | 输出格式 |
|------|----------|
| Windows | Portable `.exe` |
| macOS | `.app` bundle |
| Linux | AppImage |

```bash
bun run build:electron
```

---

## 重要提醒

1. **代码质量检查**: 完成修改后必须运行 `bun run lint` 和 `bun run type-check`
2. **中文优先**: 所有代码注释和 UI 文本使用简体中文
3. **遵循现有风格**: 创建新组件/服务前，先参考现有实现
4. **DRY 原则**: 不重复代码，提取可复用的函数/组件
5. **鲁棒性**: 注意边界情况，确保代码健壮性
