## 1. 修改 task-status-tools.ts

- [x] 1.1 在 `update_task_status` 工具的 handler 中，添加 `TodoListService` 的导入
- [x] 1.2 在状态变更为 `review` 时，调用 `TodoListService.getTodosByTaskId(taskId)` 获取未完成待办
- [x] 1.3 在返回结果中添加 `todo_reminder` 字段，包含 `incomplete_count` 和 `todos` 数组

## 2. 修改 translation-tools.ts

- [x] 2.1 在 `add_translation_batch` 工具的 handler 中，添加 `TodoListService` 的导入
- [x] 2.2 在成功提交翻译批次后，调用 `TodoListService.getTodosByTaskId(taskId)` 获取未完成待办
- [x] 2.3 在返回结果中添加 `todo_reminder` 字段，包含 `incomplete_count` 和 `todos` 数组

## 3. 测试验证

- [x] 3.1 运行 `bun run lint` 检查代码
- [x] 3.2 运行 `bun run type-check` 检查类型
