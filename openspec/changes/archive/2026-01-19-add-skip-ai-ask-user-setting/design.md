## Context

项目已引入 AI 工具 `ask_user`（全屏问答对话框）。该工具在翻译相关任务与 assistant 中可用，但会“阻塞等待用户回答”，在长流程任务里可能造成频繁打断。

同时，UI 侧已存在一个“书籍级别的翻译设置弹窗”（`ChapterSettingsPopover.vue` 的「全局设置」页签），并通过 `BookDetailsPage.vue` 的 `handleSaveChapterSettings` 写回 `booksStore.updateBook()`。

## Goals / Non-Goals

- Goals
  - 为**当前书籍**增加一个开关：跳过 `ask_user` 追问
  - 开启后，不弹出全屏问答 UI，不阻塞任务
  - 尽量复用现有书籍级设置存储（`Novel` 字段 + IndexedDB）
  - 保持默认行为不变（旧书籍默认关闭）

- Non-Goals
  - 不提供全局（所有书籍）统一开关
  - 不实现复杂的“自动默认答案”策略（例如总选第一个）
  - 不改变其他工具的可用性

## Decisions

- Decision: 使用 `Novel` 书籍级字段存储该开关（例如 `skipAskUser?: boolean`）
  - 原因：现有 “翻译设置” 已在 `Novel` 上存储多个书籍级设置，更新路径成熟

- Decision: 在工具层提供“硬保障”，在提示词层提供“软约束”
  - 工具层（源头）：当 `skipAskUser=true` 时，在 translation/polish/proofreading 的 tools 列表中移除 `ask_user`，避免模型调用
  - 工具层（兜底）：当 `skipAskUser=true` 时，`ask_user` handler 直接返回 `cancelled:true`（不弹 UI）
  - 提示词层：在书籍上下文/系统提示中声明“本书已开启跳过追问，禁止调用 ask_user”，降低模型发起调用概率

## Risks / Trade-offs

- 模型可能在缺少关键信息时仍希望追问
  - 缓解：提示词强调自行决策/继续执行；并将取消记录为 action，便于用户事后回溯

- 任务策略差异（translation/polish/proofreading/assistant）导致覆盖不一致
  - 缓解：将提示放在所有路径共用的“书籍上下文/系统提示构建”位置，避免分散修改

## Migration Plan

- 仅新增字段与 UI 开关：旧数据无迁移，`undefined` 视为关闭
- 实现阶段验证：开启开关后，`ask_user` 不再弹窗且不会卡住任务

## Open Questions

- 开启“跳过追问”后，是否需要提供一个“收集所有问题列表”的替代机制（后续增强）？

