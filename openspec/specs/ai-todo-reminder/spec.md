# ai-todo-reminder Specification

## Purpose
在 AI 进入 review 状态或提交翻译批次后，把当前任务未完成的待办项回传给 AI，避免遗漏。

## Requirements

### Requirement: AI receives todo reminder when entering review state

When the AI updates a translation task's status to `review`, the system SHALL return the incomplete todo items associated with the current task in the tool response.

#### Scenario: Status changed to review with incomplete todos

- **WHEN** AI calls `update_task_status` with status `review` for a task that has incomplete todo items
- **THEN** the response includes a `todo_reminder` field containing:
  - `incomplete_count`: number of incomplete todos
  - `todos`: array of objects with `id` and `text` for each incomplete todo

#### Scenario: Status changed to review with no todos

- **WHEN** AI calls `update_task_status` with status `review` for a task that has no todo items
- **THEN** the response includes a `todo_reminder` field with `incomplete_count: 0` and empty `todos` array

### Requirement: AI receives todo reminder after translation batch submission

When the AI successfully submits a translation batch via `add_translation_batch`, the system SHALL return the incomplete todo items associated with the current task in the tool response.

#### Scenario: Batch submitted with incomplete todos

- **WHEN** AI calls `add_translation_batch` and the batch is processed successfully
- **THEN** the response includes a `todo_reminder` field containing:
  - `incomplete_count`: number of incomplete todos
  - `todos`: array of objects with `id` and `text` for each incomplete todo

#### Scenario: Batch submitted with no todos

- **WHEN** AI calls `add_translation_batch` for a task that has no todo items
- **THEN** the response includes a `todo_reminder` field with `incomplete_count: 0` and empty `todos` array
