# Change: 添加「list_memories」工具（仅 Assistant 可用）

## Why

当前已存在 Memory 相关工具（例如 `get_recent_memories`、`search_memory_by_keywords`、`get_memory`），但缺少一个**面向管理/调试**的“列出 Memory 列表”工具：

- Assistant 在需要快速盘点当前书籍所有记忆、检查摘要质量、定位重复/过期内容时不方便
- 现有 `get_recent_memories` 仅覆盖“最近 N 条”，无法做全量浏览与分页

## What Changes

- 新增 AI 工具：`list_memories`
  - 支持分页（`offset` / `limit`）与排序（`createdAt` / `lastAccessedAt`）
  - 默认返回轻量字段（`id/summary/createdAt/lastAccessedAt`），可选返回 `content`
- 兼容别名工具名：`list_momeries`（拼写容错，行为与 `list_memories` 一致）
- **工具作用域：仅 Assistant 可用**
  - Assistant 对话可用（`ToolRegistry.getAllTools()` 提供）
  - 翻译相关任务（translation / polish / proofreading）不提供该工具，避免提示膨胀与无谓的全量输出

## Impact

- Affected specs:
  - 新增 capability：`ai-list-memories-tool`
- Affected code (预计实现阶段修改/新增):
  - `src/services/ai/tools/memory-tools.ts`：新增工具定义与 handler
  - `src/services/ai/tools/index.ts`：在翻译工具集中过滤该工具（保持 Assistant 可用）
  - `src/services/ai/tasks/utils/ai-task-helper.ts`：更新工具统计/截断配置（如需要）

