# Project Context

## Purpose

Tsukuyomi (月咏) - Moonlit Translator 是一个专业的日本小说翻译工作台，专注于将日文小说高质量翻译为自然流畅的简体中文。项目目标包括：

- **智能翻译**: 集成 AI 翻译服务（OpenAI、Gemini），支持批量翻译、术语一致性管理、角色设定应用
- **语料优化**: 提供校对、润色、校稿功能，持续改善翻译质量
- **多站点支持**: 支持从多个日文小说网站（小説家になろう、カクヨム、ノクターンノベルス等）抓取内容
- **本地优先**: 基于 IndexedDB 的本地数据存储，支持离线使用和数据同步（GitHub Gist）
- **桌面应用**: 基于 Electron 的跨平台桌面应用，提供沉浸式翻译体验
- **数据管理**: 完整的书籍、章节、段落、术语、角色设定、备注等数据模型

## Tech Stack

### 核心框架

- **Quasar 2.18+**: Vue 3 全栈框架，提供 SPA、Electron 等多模式支持
- **Vue 3.5+**: 使用 Composition API (`<script setup>`)
- **Vite**: 快速的开发构建工具

### 运行时环境

- **Bun 1.0+**: JavaScript 运行时和包管理器，负责所有脚本执行
- **Electron 39+**: 桌面应用框架

### UI 组件库

- **PrimeVue 4.5+**: 主要 UI 组件库
- **PrimeIcons**: 图标库
- **@primevue/themes**: 主题系统（自定义 tsukuyomi-preset）

### 状态管理与路由

- **Pinia 3.0+**: 全局状态管理
- **Vue Router 4.6+**: 路由管理
- **Vue I18n 11+**: 国际化支持

### 数据存储

- **IndexedDB (idb 8+)**: 本地数据库，存储所有书籍、章节、翻译等数据
- **UUID**: 实体 ID 生成

### AI 服务

- **OpenAI SDK 6.9+**: GPT 模型集成
- **@google/generative-ai 0.24+**: Gemini 模型集成
- **自定义 AI 服务层**: 支持 OpenAI、Gemini 两种提供商

### 网页抓取

- **Puppeteer 24+**: 浏览器自动化，支持动态网页抓取
- **Puppeteer Extra + Stealth**: 避免反爬虫检测
- **Cheerio 1.1+**: 静态 HTML 解析
- **http-proxy-middleware**: 代理服务器支持

### 工具库

- **Axios**: HTTP 请求
- **Dompurify**: HTML 清理
- **Marked**: Markdown 渲染
- **Lodash**: 工具函数
- **Fuse.js 7+**: 模糊搜索
- **@octokit/rest**: GitHub API（Gist 同步）
- **co**: 协程支持

### 开发工具

- **TypeScript 5.9+**: 严格类型检查
- **ESLint 9+**: 代码规范检查
- **Prettier**: 代码格式化
- **Vue TSC**: TypeScript 类型检查
- **TailwindCSS**: CSS 框架（部分使用）
- **Autoprefixer**: CSS 前缀处理

### 测试

- **Bun Test**: 单元测试框架
- **fake-indexeddb**: IndexedDB mock

## Project Conventions

### Code Style

#### 命名规范

- **文件名**: kebab-case（如 `book-service.ts`, `paragraph-card.vue`）
- **Service 类**: PascalCase + `Service` 后缀（如 `BookService`, `TerminologyService`）
- **变量/函数**: camelCase
- **常量**: UPPER_SNAKE_CASE
- **类型/接口**: PascalCase
- **Vue 组件**: PascalCase（如 `ParagraphCard.vue`）

#### 代码格式

- **引号**: 所有字符串使用单引号（Prettier 配置）
- **行宽**: 最大 100 字符
- **缩进**: 2 空格
- **分号**: 使用分号（TypeScript 风格）

#### 类型系统

- **严格模式**: 启用 TypeScript 严格类型检查
- **类型导入**: 优先使用 `import type` 导入类型（ESLint 强制）
- **禁止 any**: 避免使用 `any`，必要时使用 `unknown` 或具体类型
- **空值处理**: 明确处理 null/undefined 情况

#### 导入规范

```typescript
// 类型导入优先
import type { Novel, Chapter } from 'src/models/novel';
// 实际导入
import { BookService } from 'src/services/book-service';

// 使用路径别名
import { foo } from 'src/utils/bar';
```

#### Vue 组件规范

- **script 位置**: 必须置于 template 之后
- **语法**: 必须使用 `<script setup lang="ts">`
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

#### 注释规范

- **代码注释**: 使用简体中文
- **文档**: 使用简体中文撰写 README 和文档

### Architecture Patterns

#### 分层架构

1. **Service 层** (`src/services/`): 所有数据的 CRUD 操作
   - 不允许组件直接操作数据
   - 抛出明确的错误对象
   - 使用 try-catch 包裹异步操作

2. **组件层** (`src/pages/`, `src/layouts/`, `src/components/`): UI 展示
   - 通过 Service 层访问数据
   - 使用 Composables 提取可复用逻辑

3. **Store 层** (`src/stores/`): 全局状态管理
   - 使用 Pinia 管理跨组件状态

4. **工具层** (`src/utils/`): 纯函数工具
   - 无副作用
   - 可复用

5. **AI 服务层** (`src/services/ai/`): AI 相关功能
   - **Providers**: AI 提供商适配（OpenAI、Gemini）
   - **Tasks**: AI 任务服务（翻译、润色、校稿、解释）
   - **Tools**: AI 工具函数（书籍、术语、角色、记忆等）

6. **网页抓取层** (`src/services/scraper/`): 网站内容抓取
   - **Core**: 基础抓取器类
   - **Scrapers**: 各网站实现（小説家になろう、カクヨム等）

#### 数据模型设计

- **ID 生成策略**:
  - `Novel`: 完整 uuidv4（如 `550e8400-e29b-41d4-a716-446655440000`）
  - 其他实体: 8 位十六进制短 ID（如 `e58ed763`）
  - 使用 `UniqueIdGenerator` 确保组内唯一
- **实体关系**: Novel → Volume → Chapter → Paragraph → Translation
- **章节内容分离**: 大型章节内容独立存储到 IndexedDB

#### 状态管理

- 使用 Pinia stores 管理全局状态
- 组件本地状态使用 `ref` / `reactive`
- 使用 Composables 封装可复用逻辑

### Testing Strategy

#### 测试框架

- **Bun Test**: 主要测试框架
- **fake-indexeddb**: IndexedDB mock

#### 测试结构

```typescript
// 文件顶部声明全局函数
declare const describe: (name: string, fn: () => void) => void;
declare const test: (name: string, fn: () => void | Promise<void>) => void;
declare const expect: (actual: unknown) => { toBe: (expected: unknown) => void; ... };
```

#### Mock 策略

- **局部 mock**: 使用 `spyOn` 避免全局 `mock.module`
- **测试隔离**: 每个测试独立运行，不受其他测试影响

```typescript
import { spyOn } from 'bun:test';
beforeEach(() => {
  spyOn(ChapterContentService, 'saveChapterContent').mockImplementation(fn);
});
afterEach(() => {
  mock.restore();
});
```

#### 测试命名

- 文件以 `.test.ts` 结尾（如 `book-service.test.ts`）
- 测试描述使用中文，清晰表达测试意图

#### 测试运行

```bash
bun test                    # 运行所有测试
bun test <pattern>          # 运行匹配的测试文件
bun test -t <regex>         # 运行名称匹配的测试
bun test --only             # 仅运行 marked 的测试
```

### Git Workflow

#### 分支策略

- **main/mainline**: 生产代码，仅接受 merge request
- **develop**: 开发分支，功能开发
- **feature/\***: 功能分支（如 `feature/ai-translation`）
- **bugfix/\***: 缺陷修复分支
- **refactor/\***: 重构分支

#### Commit 规范

- **格式**: `<type>(<scope>): <subject>`
- **类型**:
  - `feat`: 新功能
  - `fix`: 缺陷修复
  - `refactor`: 重构
  - `perf`: 性能优化
  - `style`: 代码风格（不影响逻辑）
  - `docs`: 文档
  - `test`: 测试
  - `chore`: 构建/工具链

#### Code Review

- 所有代码必须通过 `bun run lint` 和 `bun run type-check`
- AI 助手提交前必须验证代码质量

## Domain Context

### 数据模型

#### 核心实体

- **Novel (书籍)**: 一本小说，包含多个卷
- **Volume (卷)**: 书籍的分卷，包含多个章节
- **Chapter (章节)**: 单个章节，包含多个段落
- **Paragraph (段落)**: 日文原文段落
- **Translation (翻译)**: 段落的中文翻译
- **Terminology (术语)**: 专业术语或特定名词的翻译规则
- **CharacterSetting (角色设定)**: 角色的名称、性格、用语习惯等
- **Note (备注)**: 章节或段落的注释
- **ChatSession (对话会话)**: AI 助手的对话历史

#### AI 服务

- **翻译任务**: 批量翻译段落，应用术语和角色设定
- **润色任务**: 优化翻译的流畅度和自然度
- **校稿任务**: 检查翻译错误和术语一致性
- **解释任务**: 解释日文原文的含义
- **术语翻译任务**: 翻译和管理术语表

#### 网站支持

- **小説家になろう (syosetu.com)**: 最大的日文小说网站
- **カクヨム (kakuyomu.jp)**: KADOKAWA 的小说平台
- **ノクターンノベルス (novel18.syosetu.com)**: 成人小说网站
- **Nコード小説家になろう (ncode.syosetu.com)**: 小说网站变体

### UI 文本

- **主要语言**: 简体中文
- **支持语言**: 繁体中文、英语、日语（可扩展）

## Important Constraints

### 技术约束

- **Bun 运行时**: 所有脚本必须使用 Bun 执行
- **TypeScript 严格模式**: 必须通过类型检查和 lint
- **IndexedDB**: 所有数据存储在 IndexedDB 中，不支持其他数据库
- **Electron 兼容性**: 必须同时支持 Web 和 Electron 模式

### 性能约束

- **章节内容分离**: 大章节内容独立存储，避免主数据过大
- **批量操作**: 使用 IndexedDB 事务批量处理
- **AI 调用优化**: 避免重复调用，使用缓存和批处理

### 安全约束

- **API 密钥管理**: 不提交 API 密钥到代码库
- **XSS 防护**: 使用 DOMPurify 清理用户输入的 HTML
- **数据隔离**: 不同用户数据互不干扰（桌面应用单用户）

### 业务约束

- **本地优先**: 主要为离线使用设计
- **隐私保护**: 用户数据不上传到非授权服务
- **开源兼容**: 遵循开源协议要求

## External Dependencies

### AI 服务

- **OpenAI API**: GPT-3.5、GPT-4 等模型
- **Google Generative AI**: Gemini Pro 等模型

### 网站服务

- **小説家になろう**: https://syosetu.com/
- **カクヨム**: https://kakuyomu.jp/
- **ノクターンノベルス**: https://novel18.syosetu.com/
- **Nコード小説家になろう**: https://ncode.syosetu.com/

### 数据同步

- **GitHub Gist API**: 数据备份和同步

### 代理服务

- **http-proxy-middleware**: 支持代理配置，访问受限网站

### 其他服务

- **Unpkg / jsDelivr**: CDN 资源加载
