## 1. TodoItem Model — Three-state lifecycle

- [x] 1.1 Update `TodoItem` interface in `services/todo-list-service.ts`: replace `completed: boolean` with `status: 'pending' | 'working' | 'done'`, export `TodoStatus` type
- [x] 1.2 Add backwards-compatible migration in `loadTodosFromStorage()`: convert `completed: true` → `status: 'done'`, `completed: false` → `status: 'pending'`
- [x] 1.3 Update all `TodoListService` methods: `markTodoAsDone` sets status `done`, add `markTodoAsWorking` sets status `working`, update `getActiveTodos` to filter `status !== 'done'`, update `getCompletedTodos` to filter `status === 'done'`
- [x] 1.4 Update all consumers of `todo.completed` across the codebase to use `todo.status`

## 2. TodoWorkflow class — Templates, generation, gate

- [x] 2.1 Create `services/ai/tasks/utils/todo-workflow.ts` with `TodoWorkflow` class skeleton: constructor takes `taskType`, `taskId`, holds `initializedStates: Set<TaskStatus>`
- [x] 2.2 Define pre-defined todo templates for each (taskType, state) combination: planning (5 items, all chunks), preparing (4 items translation / 3 items polish+proofreading), working (dynamic batches), review (4 items), chapter_summary planning (2 items) and working (1 item)
- [x] 2.3 Implement `generateForState(state, config)`: generates todos via `TodoListService.createTodo()` on first entry only. For working state, accept `paragraphIds` + chunk text + `chunkIndex` + `chapterTitle` to build verbose batch todos and optional title translation todo
- [x] 2.4 Implement verbose working todo text builder: split paragraphIds into batches of MAX_TRANSLATION_BATCH_SIZE, extract display index + paragraph ID + first ~20 chars of original text from chunk text for each paragraph
- [x] 2.5 Implement `checkGate(taskId, currentState): { allowed: boolean, incompleteItems: TodoItem[] }` — checks all pre-defined todos for current state are `done`, ignores agent-created ad-hoc todos
- [x] 2.6 Implement `buildTodoContextBlock(taskId, currentState): string` — builds the `【待办清单】` section with ✅/→/☐ icons, collapses completed todos, expands current + pending, includes reminder lines

## 3. AI tool updates — mark_todo_working + updated tools

- [x] 3.1 Add `mark_todo_working` tool definition in `services/ai/tools/todo-list-tools.ts`: accepts todo ID, calls `TodoListService.markTodoAsWorking()`, returns success/error
- [x] 3.2 Update `mark_todo_done` tool to work with new `status` field
- [x] 3.3 Update `list_todos` tool output to show three states (`pending`/`working`/`done`) instead of binary
- [x] 3.4 Update `create_todo` tool to create todos with `status: 'pending'`
- [x] 3.5 Update `getTodosSystemPrompt()` in `todo-helper.ts` to document `mark_todo_working` tool and explain the three-state model

## 4. Gate enforcement in status update handler

- [x] 4.1 Update `status-update-handler.ts` in tool-dispatcher: before allowing state transition, call `TodoWorkflow.checkGate()` and reject with incomplete todo list if gate fails
- [x] 4.2 After successful transition, call `TodoWorkflow.generateForState()` for the new state (if first entry)
- [x] 4.3 Wire `TodoWorkflow` instance into `TaskLoopSession` — create it in constructor, pass it to `ToolDispatcher` context

## 5. Review state — allow add_translation_batch

- [x] 5.1 Update `translation-tools.ts` line 333: change `currentStatus !== 'working'` to `currentStatus !== 'working' && currentStatus !== 'review'`
- [x] 5.2 Update prompt text in `common.ts` (`getOutputFormatRules`): change "仅 working 可调用 add_translation_batch" to "working 和 review 可调用"
- [x] 5.3 Update `getReviewStateDescription()` in `common.ts`: remove "如需更新已输出的翻译结果，请用 update_task_status 切回 working", replace with "可直接使用 add_translation_batch 修正翻译"
- [x] 5.4 Update `getReviewLoopPrompt()` in `runner.ts`: remove instruction to go back to working for translation fixes
- [x] 5.5 Update `getMissingParagraphsPrompt()` in `runner.ts`: allow fixing missing paragraphs directly in review state instead of requiring working state backtrack
- [x] 5.6 Update `handleReviewState()` in `task-runner.ts`: when missing paragraphs detected, allow fixing in review without forcing `setCurrentStatus('working')`
- [x] 5.7 Update `getDataManagementRules()` in `common.ts`: update the "review 需要修改先切回 working" line to reflect direct edit capability

## 6. Always-in-context todo display

- [x] 6.1 Update `getCurrentStatusInfo()` in `common.ts`: prepend `TodoWorkflow.buildTodoContextBlock()` output to every state description
- [x] 6.2 Update `getPostToolCallReminder()` in `todo-helper.ts` to use three-state model and reference the always-in-context display
- [x] 6.3 Ensure `TodoWorkflow` instance is accessible from `getCurrentStatusInfoMsg()` call chain in `TaskLoopSession`

## 7. Integration in TaskLoopSession

- [x] 7.1 Create `TodoWorkflow` instance in `TaskLoopSession` constructor with taskType and taskId
- [x] 7.2 Generate initial planning todos on session start (planning is always the first state)
- [x] 7.3 Pass `TodoWorkflow` to `ToolDispatcher` context for gate enforcement and post-transition generation
- [x] 7.4 Pass `TodoWorkflow.buildTodoContextBlock()` to prompt generation chain so `getCurrentStatusInfo` can include it

## 8. UI updates — Three-state todo display

- [x] 8.1 Update `AppRightPanel.vue`: replace binary `todo.completed` rendering with three-state display — pending (☐ circle, default opacity), working (→ arrow, primary color highlight), done (✅ check, reduced opacity + strikethrough)
- [x] 8.2 Update `incompleteTodoCount` computed to count todos where `status !== 'done'`
- [x] 8.3 Add visual emphasis to the currently working todo (primary color border or background)

## 9. Testing

- [x] 9.1 Unit tests for `TodoWorkflow`: template generation per (taskType, state), gate enforcement logic, first-entry-only generation, verbose batch text building
- [x] 9.2 Unit tests for `TodoListService`: three-state lifecycle, backwards migration from boolean, markTodoAsWorking
- [x] 9.3 Integration test: `add_translation_batch` succeeds in review state
- [x] 9.4 Integration test: `update_task_status` blocked when todos incomplete, allowed when all done
