# Change: 支持 AI 一次向用户提出多个问题（批量 ask_user）

## Why

当前 `ask_user` 工具一次只能提出一个问题。对于翻译/润色/校对等任务，AI 经常需要用户一次性确认多项偏好或关键歧义（例如人名译名、口吻、术语取舍、敬语策略等）。如果逐个调用 `ask_user`：

- 会导致多次全屏弹窗打断，体验割裂
- 任务等待时间变长，用户操作成本高
- action 记录分散，回溯不便

因此需要支持 AI **在一次工具调用中提出多个问题**，由 UI 在一个全屏流程里收集所有答案，并一次性返回给 AI。

## What Changes

- 扩展 `ask-user-tools.ts`：新增一个批量提问工具（建议命名 `ask_user_batch`）
  - 输入为问题列表，每个问题可包含 `question`、`suggested_answers`、`allow_free_text` 等字段
  - 输出为答案列表，并支持 `cancelled` 表示用户中途取消
  - 若用户中途取消，工具返回 **已答部分（partial answers）**
- 扩展 AskUser UI：支持在**同一个全屏问答对话框**中完成多问题采集
  - 采用 **Stepper/分步形式（一题一屏）** 呈现，避免同时展示过多信息
  - 支持返回每题的 `answer` 与可选 `selected_index`
- 兼容与回退策略：
  - 保持 `ask_user` 原有行为不变
  - 在无 UI 环境下（测试/无窗口上下文）返回明确错误而不是挂起
- 与现有“跳过 AI 追问（ask_user）”书籍级开关协同：
  - 开启后不向模型提供 `ask_user` 与 `ask_user_batch`
  - 兜底：若仍调用，直接返回 `cancelled:true`（不弹 UI、不阻塞）
- Action 记录：
  - 记录批量问答的关键字段，便于聊天历史展示与上下文摘要压缩

## Impact

- Affected specs:
  - `ai-ask-user-tool`（新增批量提问相关 requirements）
- Affected code (预计实现阶段修改/新增):
  - `src/services/ai/tools/ask-user-tools.ts`：新增 `ask_user_batch` 工具定义与 handler
  - `src/stores/ask-user.ts`：扩展 store 支持批量问答（队列项可为单题/多题）
  - `src/components/dialogs/AskUserDialog.vue`：支持多题模式（Stepper/多题表单）
  - `src/layouts/MainLayout.vue`：暴露批量桥接能力（例如 `window.__lunaAskUserBatch` 或扩展现有桥接）
  - `src/services/ai/tools/index.ts`：在翻译相关任务中根据书籍级设置过滤 `ask_user_batch`
  - `src/utils/action-info-utils.ts` / `src/stores/chat-sessions.ts`：扩展 action 数据结构以记录批量问答（如需要）

## Open Questions

- 批量问答结果结构的最终定稿：
  - 建议在取消时返回 `cancelled:true` + `answers`（已答部分）并包含 `question_index`，避免与未答问题对齐的空值数组。

