## Context

项目已实现 `ask_user`：

- 工具层：`src/services/ai/tools/ask-user-tools.ts` 通过 `window.__lunaAskUser` 等桥接等待用户回答
- UI 层：`AskUserDialog` 以全屏 modal 展示问题与候选答案/自由输入
- Store 层：`src/stores/ask-user.ts` 管理队列，保证一次只显示一个问答对话框
- 书籍级设置：支持“跳过 AI 追问（ask_user）”，并在 tools 列表与 handler 里做硬保障

本变更希望减少多次弹窗打断：允许 AI 在一次工具调用里提出多个问题，由 UI 以单个全屏流程收集答案并一次性回传。

## Goals / Non-Goals

- Goals
  - 新增批量问答能力（建议新工具 `ask_user_batch`），一次返回多个答案
  - 多题在同一个全屏对话框内完成，避免多次弹窗打断
  - 与现有队列机制兼容：批量视为一个队列项
  - 与“跳过 AI 追问”设置协同：过滤工具 + handler 兜底不阻塞
  - 可记录批量问答为 action，支持摘要压缩与回溯

- Non-Goals
  - 不改变 `ask_user` 既有行为（保持向后兼容）
  - 不做跨会话持久化（批量问答结果默认不写入数据库）
  - 不引入新的 UI/状态管理框架

## Decisions

- Decision: 新增工具 `ask_user_batch`，而不是修改 `ask_user` schema
  - 原因：避免破坏现有工具 schema 与模型调用习惯，降低兼容成本
  - `ask_user` 仍用于单一关键问题；`ask_user_batch` 用于一次性收集多项偏好/确认项

- Decision: 批量问答作为“单个队列项”处理
  - 原因：与现有“一次只显示一个全屏 modal”的约束一致
  - UI 内部通过 Stepper/分步完成多题采集（**一题一屏**），不在队列中拆成多项以避免连续弹窗

- Decision: 取消时返回已答部分（partial answers）
  - 原因：用户在批量流程中可能已经提供了部分关键决策信息，丢弃会降低任务可继续性
  - 建议返回结构采用“answered-only + question_index”的列表形式，避免未答问题的空值占位与歧义

- Decision: JSON 字符串返回，延续现有工具返回约定
  - 返回结构建议包含：
    - `success`
    - `questions`（可选，用于回溯/调试）
    - `answers`（按输入顺序）
    - `cancelled`（用户取消）

## Alternatives considered

- 扩展 `ask_user` 支持 `questions[]`
  - 优点：减少工具数量
  - 缺点：需要修改 schema 的 required/返回结构，容易引入兼容问题，并使单题/多题语义混杂

- 连续调用多次 `ask_user`（现状）
  - 缺点：多次全屏弹窗打断，体验差；action 记录分散

## Risks / Trade-offs

- 批量问题过多导致用户负担重
  - 缓解：提示词约束（仅收集关键问题）；UI 采用 Stepper，显示进度并允许取消

- 取消语义（partial answers）导致模型处理复杂
  - 缓解：在 spec 中明确并提供一致的数据结构（包含 `question_index`），提示词指导模型如何利用 partial answers 继续执行

## Migration Plan

- 新增 `ask_user_batch` 能力，不影响旧行为
- 在翻译相关任务中逐步引入提示词/策略，优先使用批量提问收敛用户交互

## Open Questions

- UI 方案最终选型：Stepper vs 多题表单（见 proposal）
- 是否需要限制 `questions.length`（例如最多 10 题）以避免滥用？

