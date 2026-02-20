## Why

AI 可以通过 `create_todo` 工具创建待办事项，但在状态变更（如进入 review 或 end）或提交翻译批次后，系统不会主动提醒 AI 还有哪些待办事项未完成。这导致 AI 可能忘记自己创建的待办任务，影响任务执行的完整性。

## What Changes

- 在 `task-status-tools.ts` 的 `update_task_status` 工具中，当状态变更为 `review` 时，查询当前任务关联的未完成待办事项（通过 `TodoListService.getTodosByTaskId`），并在返回结果中提醒 AI
- 在 `translation-tools.ts` 的 `add_translation_batch` 工具中，每次成功提交翻译批次后，查询当前任务关联的未完成待办事项，并在返回结果中提醒 AI
- 待办信息包括：未完成待办项数量、每项的内容和 ID

## Capabilities

### New Capabilities

- `ai-todo-reminder`: AI 待办事项提醒能力。当状态变更或翻译批次提交后，主动向 AI 报告当前任务的剩余待办事项，帮助 AI 跟进自己创建的任务。

### Modified Capabilities

- (无)

## Impact

- 修改文件：
  - `src/services/ai/tools/task-status-tools.ts`
  - `src/services/ai/tools/translation-tools.ts`
- 新增依赖：`TodoListService` (已有)
- 属于功能增强，不影响现有 API 契约
