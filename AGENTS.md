<!-- OPENSPEC:START -->
# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:
- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:
- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->

# Agent Architecture (日本語→简体中文 翻译)

> 项目名称: `tsukuyomi-translator`
> 框架与运行环境: 使用 Quasar (Vue 3 + Vite) 构建桌面应用，运行/脚本管理由 **Bun** 驱动。主界面语言为 **简体中文**。
> 目标: 将日本小说文本高质量翻译为自然流畅的简体中文，并支持后续校对与语料优化。

## 命令指南

### 开发与构建

- `bun run dev` - 启动 Quasar Vite 开发环境（包含前端和后端服务器）
- `bun run dev:vite` - 仅启动前端开发环境
- `bun run dev:server` - 仅启动后端服务器
- `bun run dev:electron` - 启动 Electron 桌面应用开发环境
- `bun run build:electron` - 构建 Electron 桌面应用（生产模式）
- `bun run build:spa` - 构建 SPA Web 应用

### 代码质量检查

- `bun run lint` - 运行 ESLint 检查代码规范
- `bun run type-check` - 运行 TypeScript 类型检查（vue-tsc）
- `bun run format` - 使用 Prettier 格式化代码

### 测试

- `bun test` - 运行所有单元测试
- `bun test <pattern>` - 运行匹配文件名的测试文件（如 `bun test book-service`）
- `bun test -t <regex>` - 仅运行名称匹配的测试（如 `bun test -t "应该保存书籍"`）
- `bun test --only` - 仅运行标记为 `test.only()` 或 `describe.only()` 的测试

## 代码规范

### 导入与格式化

- **Type 导入优先**: 使用 `import type` 导入类型（ESLint 强制）：
  ```typescript
  import type { Novel, Chapter } from 'src/models/novel';
  import { BookService } from 'src/services/book-service';
  ```
- **单引号**: 所有字符串使用单引号（Prettier 配置）
- **行宽**: 最大 100 字符（Prettier 配置）
- **路径别名**: 使用 `src/*` 别名导入：
  ```typescript
  import { foo } from 'src/utils/bar';
  ```

### Vue 组件规范

- **script 位置**: 必须置于 template 之后
- **语法**: 必须使用 `<script setup lang="ts">` 语法
- **Props 定义**: 使用 TypeScript 接口定义 props，使用 `defineProps`:
  ```typescript
  interface Props {
    book: Novel;
    title?: string;
  }
  const props = defineProps<Props>();
  ```
- **Emits 定义**: 使用类型安全的 `defineEmits`:
  ```typescript
  const emit = defineEmits<{
    save: [bookId: string];
    delete: [bookId: string];
  }>();
  ```

### 命名规范

- **Service 类**: 使用 PascalCase + Service 后缀，如 `BookService`, `TerminologyService`
- **文件命名**: kebab-case，如 `book-service.ts`, `paragraph-card.vue`
- **测试文件**: 以 `.test.ts` 结尾，如 `book-service.test.ts`
- **变量/函数**: camelCase
- **常量**: UPPER_SNAKE_CASE
- **类型/接口**: PascalCase

### 类型系统

- **严格类型检查**: 代码必须通过 `bun run type-check` 和 `bun run lint`
- **禁止 any**: 避免使用 `any`，必要时使用 `unknown` 或具体类型
- **类型导入**: 优先使用 `import type` 导入类型
- **空值处理**: 明确处理 null/undefined 情况

### ID 生成规范

- `Novel` 实体: 使用完整 `uuidv4`（如 `550e8400-e29b-41d4-a716-446655440000`）
- `Volume`、`Chapter`、`Paragraph`、`Translation`、`Note`、`Terminology`、`CharacterSetting`: 使用短 ID（8 位十六进制，如 `e58ed763`）
- 使用 `UniqueIdGenerator` 确保组内唯一:
  ```typescript
  import { UniqueIdGenerator } from 'src/utils/id-generator';
  const idGenerator = new UniqueIdGenerator(existingIds);
  const id = idGenerator.generate();
  ```

### 错误处理

- **Service 层**: 抛出明确的错误对象，使用 `throw new Error('具体错误信息')`
- **异步错误**: 使用 try-catch 包裹异步操作，记录错误日志
- **组件层**: 通过 useToastWithHistory 展示错误信息给用户
- **日志**: 使用 `console.error` 记录错误，包含上下文信息

### 架构分层

- **Service 层**: 所有数据的 CRUD 操作必须在 Service 层完成
- **组件层**: 组件不允许直接操作数据，必须通过 Service 层
- **状态管理**: 使用 Pinia stores 管理全局状态（`src/stores/`）
- **复用逻辑**: 使用 Composables 提取可复用逻辑（`src/composables/`）

### 测试规范

- **框架**: 使用 Bun 测试框架
- **Mock 策略**: 使用局部 mock，避免全局 `mock.module` 影响其他测试
  ```typescript
  import { spyOn } from 'bun:test';
  beforeEach(() => {
    spyOn(ChapterContentService, 'saveChapterContent').mockImplementation(fn);
  });
  afterEach(() => {
    mock.restore();
  });
  ```
- **测试声明**: 在文件顶部声明全局函数（避免 import 类型注解问题）
  ```typescript
  declare const describe: (name: string, fn: () => void) => void;
  declare const test: (name: string, fn: () => void | Promise<void>) => void;
  declare const expect: (actual: unknown) => { toBe: (expected: unknown) => void; ... };
  ```

### UI 与交互

- **组件库**: 使用 PrimeVue 组件库
- **Toast**: 使用 `useToastWithHistory` 展示重要操作结果（保存、删除、更新章节内容等）
- **语言**: 所有 UI 文本使用简体中文
- **注释**: 使用简体中文撰写代码注释和文档

### 代码质量原则

- **DRY 原则**: 不重复代码，提取可复用的函数/组件
- **鲁棒性**: 注意边界情况，确保代码健壮性
- **抽象性**: 创建抽象层，提高代码可维护性
- **单一职责**: 每个函数/类/组件只负责一件事

### 索引数据库（IndexedDB）

- **Date 序列化**: 存储 Date 对象时使用 ISO 字符串，读取时转换回 Date
- **章节内容分离**: 大型章节内容独立存储到 IndexedDB，减少主数据大小
- **批量操作**: 使用事务批量处理提升性能

## 重要提醒

**永远再次检查任务结果，确保任务结果正确。**

- 完成任务后必须运行 `bun run lint` 和 `bun run type-check` 确保代码质量
- 所有代码和注释使用中文
- 遵循现有代码风格和模式
- 在创建新组件/服务前，先参考现有实现
