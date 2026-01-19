# ai-list-memories-tool Specification

## Purpose
TBD - created by archiving change add-list-memories-tool. Update Purpose after archive.
## Requirements
### Requirement: AI 工具 `list_memories`
系统 MUST 提供一个 AI 工具 `list_memories`，用于列出当前书籍的 Memory 记录列表，支持分页与排序，便于 Assistant 做管理/调试与快速盘点。

#### Scenario: 默认返回摘要列表
- **GIVEN** Assistant 在某本书籍上下文中调用 `list_memories`
- **WHEN** 未显式开启 `include_content`
- **THEN** 系统 MUST 返回 `success:true` 与 `memories` 列表
- **AND** 每个条目 MUST 至少包含 `id/summary/createdAt/lastAccessedAt`
- **AND** 返回结果 MUST 包含 `total`（该书籍 Memory 总数）与 `count`（本次返回条目数）

#### Scenario: 分页参数生效
- **GIVEN** Assistant 调用 `list_memories` 并传入 `offset` 与 `limit`
- **WHEN** 数据总量大于 `limit`
- **THEN** 系统 MUST 仅返回对应分页窗口的数据
- **AND** 返回结果 MUST 回显 `offset` 与 `limit`

#### Scenario: 排序参数生效
- **GIVEN** Assistant 调用 `list_memories` 并设置 `sort_by` 为 `createdAt` 或 `lastAccessedAt`
- **WHEN** 工具返回 `memories`
- **THEN** 系统 MUST 按指定字段倒序排序（最新在前）

#### Scenario: 可选返回完整内容
- **GIVEN** Assistant 调用 `list_memories` 并设置 `include_content=true`
- **WHEN** 工具返回 `memories`
- **THEN** 系统 MUST 在每个条目中包含 `content`

### Requirement: 工具别名 `list_momeries`
系统 MUST 兼容一个工具别名 `list_momeries`（拼写容错），其行为与 `list_memories` 完全一致。

#### Scenario: 使用别名调用
- **GIVEN** Assistant 调用 `list_momeries`
- **THEN** 系统 MUST 返回与 `list_memories` 相同结构与语义的结果

### Requirement: 工具作用域（仅 Assistant）
系统 MUST 仅在 Assistant 对话工具集里提供 `list_memories`（及 `list_momeries`），并且在翻译相关任务工具集中不提供该工具。

#### Scenario: 翻译相关任务不可用
- **GIVEN** translation / polishing / proofreading 任务正在执行
- **WHEN** 系统为该任务构建 tools 列表
- **THEN** tools 列表 MUST 不包含 `list_memories` 与 `list_momeries`

