## Context

AI 可以通过 `create_todo` 工具创建待办事项，但当前系统不会在关键时机（状态变更或翻译批次提交）提醒 AI 还有哪些待办事项未完成。这导致 AI 可能忘记自己创建的任务。

## Goals / Non-Goals

**Goals:**

- 在 `update_task_status` 工具中，当状态变更为 `review` 时，向 AI 返回当前任务的未完成待办事项
- 在 `add_translation_batch` 工具中，成功提交翻译批次后，向 AI 返回当前任务的未完成待办事项

**Non-Goals:**

- 不修改待办事项的创建、更新、删除功能
- 不添加新的待办事项服务 API
- 不在 `end` 状态时提醒（仅在 `review` 状态）

## Decisions

1. **使用 TodoListService 已有方法获取待办事项**
   - 使用 `TodoListService.getTodosByTaskId(taskId)` 获取当前任务的未完成待办
   - 不新增服务方法，复用现有能力

2. **待办提醒格式**
   - 返回未完成待办项数量
   - 包含每项的 ID、文本内容
   - 作为工具返回结果的 `todo_reminder` 字段

3. **仅在 review 状态提醒**
   - 因为这是翻译任务的关键检查点，AI 需要确认所有待办事项已处理
   - 翻译批次提交时也提醒，让 AI 可以随时了解待办状态

## Risks / Trade-offs

- [低风险] 如果 taskId 不存在或无待办事项，返回空列表即可
- [低风险] 待办事项数据存储在 localStorage，需确保服务可用
