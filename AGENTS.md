# Tsukuyomi Translator - AI Coding Agent Guide

> **项目**: AI 驱动的日本小说翻译器 (Vue 3 + Quasar + TypeScript + Electron)

---

## 开发命令

```bash
# 开发
bun run dev              # 前端(9000) + 后端(8080) 同时启动
bun run dev:electron     # Electron 桌面应用开发模式

# 构建
bun run build:spa        # 构建 Web SPA
bun run build:electron   # 构建 Electron 桌面应用

# 代码质量 (修改后必须运行)
bun run lint             # ESLint 检查
bun run type-check       # TypeScript 类型检查

# 测试
bun test                           # 运行所有测试
bun test book-service              # 按文件名匹配
bun test -t "应该保存书籍"         # 按测试名匹配
bun test --watch                   # 监听模式
```

---

## 代码风格

### 导入规范

```typescript
// 类型导入必须使用 type 关键字 (ESLint 强制)
import type { Novel, Chapter } from 'src/models/novel';
import { BookService } from 'src/services/book-service';
```

### 格式化

- 单引号、行宽 100、分号结尾
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

---

## 架构分层

```
src/
├── models/        # 数据结构定义 (纯 TypeScript)
├── services/      # 业务逻辑 (不依赖 Vue)
├── composables/   # Vue Composition API 封装
├── stores/        # Pinia 状态管理
├── components/    # UI 组件
└── __tests__/     # 测试文件
```

**核心 Services**: `book-service.ts`, `chapter-service.ts`, `chapter-content-service.ts`, `memory-service.ts`

---

## 测试策略

使用 Bun 内置测试框架，测试文件位于 `src/__tests__/`：

```typescript
import { describe, expect, it, mock, beforeEach, afterEach, spyOn } from 'bun:test';
import './setup'; // 必须导入，提供 IndexedDB polyfill

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

**注意**: 使用 `spyOn` 局部 mock，避免全局 `mock.module` 影响其他测试。

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

- **章节懒加载**: 内容存储在独立的 `chapter-contents` IndexedDB store
- **AI 记忆**: LRU 缓存，`lastAccessedAt` 追踪访问
- **多版本翻译**: 每个段落支持多个翻译版本
- **ID 生成**: 书籍用 UUID，其他用 8 位 hex (`generateShortId`)

---

## 重要提醒

1. **中文优先**: 代码注释、UI 文本、回答均用简体中文
2. **修改后检查**: 必须运行 `bun run lint && bun run type-check`
3. **遵循现有风格**: 创建新文件前参考现有实现
4. **DRY 原则**: 不重复代码，提取可复用函数
