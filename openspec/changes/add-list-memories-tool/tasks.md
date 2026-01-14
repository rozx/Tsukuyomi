## 1. Implementation

- [x] 1.1 新增 AI 工具 `list_memories`（Memory 列表）
  - [x] 在 `src/services/ai/tools/memory-tools.ts` 中新增 `list_memories`
  - [x] 参数支持：`offset`、`limit`、`sort_by`、`include_content`
  - [x] 返回结构：`{ success, memories, count, total, offset, limit, sort_by }`

- [x] 1.2 兼容别名工具 `list_momeries`
  - [x] 定义工具 schema 与 handler（可复用 `list_memories` handler）

- [x] 1.3 限制工具作用域为 “Assistant only”
  - [x] 在翻译相关工具集合中排除 `list_memories` / `list_momeries`

- [x] 1.4 更新工具相关的辅助配置（如需要）
  - [x] 工具结果截断长度配置（避免超长输出）
  - [x] 生产性工具列表/调用限制（如该项目对工具使用有统计）

## 2. Tests

- [x] 2.1 单元测试：工具 handler 基本行为
  - [x] 无 bookId 时返回 `success:false`
  - [x] 分页/排序参数生效
  - [x] `include_content=false` 不返回 content

## 3. Validation

- [x] 3.1 运行 `bun run lint`
- [x] 3.2 运行 `bun run type-check`
- [x] 3.3 运行 `bun test`
