## Context

The current todo system is advisory — AI agents create their own todos optionally, with no enforcement. The state machine (`planning → preparing → working → review → end`) relies on prompt instructions to guide agents, but agents frequently skip steps (e.g., not reviewing terminology, not checking 敬語 strategies). The review state forces agents to backtrack to `working` just to fix translation issues.

The todo system uses a simple `completed: boolean` model stored in localStorage, with 5 AI tools for CRUD operations. The UI in `AppRightPanel.vue` shows a collapsible list with binary check/uncheck icons.

Key files:
- `services/todo-list-service.ts` — TodoItem model + localStorage CRUD
- `services/ai/tasks/utils/todo-helper.ts` — prompt generation, reminders
- `services/ai/tools/todo-list-tools.ts` — 5 AI tools (create/update/mark_done/delete/list)
- `services/ai/tasks/utils/task-runner.ts` — TaskLoopSession manages state machine loop
- `services/ai/tasks/utils/tool-dispatcher/` — routes tool calls, enforces state restrictions
- `services/ai/tasks/prompts/common.ts` — state descriptions, getCurrentStatusInfo
- `services/ai/tools/translation-tools.ts` — add_translation_batch validation (line 333: `working` only check)
- `components/layout/AppRightPanel.vue` — todo list UI panel

## Goals / Non-Goals

**Goals:**
- Pre-defined todo checklist generated automatically per state + task type on first entry
- Three-state todo lifecycle (`pending → working → done`) with explicit agent control
- Gate enforcement: block state transitions until all todos for current state are done
- Review state allows direct `add_translation_batch` calls (no backtrack to working)
- Always-in-context todo display in every turn's status message
- Verbose working todos with paragraph IDs + original text snippets
- UI updated to show three visual states with active task highlighting

**Non-Goals:**
- Changing the state machine itself (states and transitions remain the same)
- Changing how single-paragraph tasks work (they bypass the state machine entirely)
- Making todos persist across task restarts (todos are cleaned up on task end)
- Adding undo/revert for todo state changes
- Agent-created custom todos (keep existing `create_todo` for ad-hoc use, but pre-defined todos are the primary mechanism)

## Decisions

### Decision 1: New `TodoWorkflow` class owns template + generation + gate logic

**Choice**: Create `services/ai/tasks/utils/todo-workflow.ts` as a standalone class that:
- Defines pre-defined todo templates per (taskType, state) combination
- Generates todos on first state entry via `TodoListService.createTodo()`
- Tracks which states have been initialized (`Set<TaskStatus>`)
- Provides `checkGate(taskId, currentState)` for transition enforcement
- Builds the always-in-context todo display block

**Why**: Keeps `TaskLoopSession` focused on the loop mechanics. The workflow logic is complex enough to warrant its own module, and it can be unit-tested independently.

**Alternative considered**: Embedding generation logic directly in `TaskLoopSession` or `StateMachineEngine`. Rejected because it would bloat already-complex classes and make testing harder.

### Decision 2: Three-state enum replaces boolean

**Choice**: `TodoItem.completed: boolean` → `TodoItem.status: 'pending' | 'working' | 'done'`

**Why**: Enables "currently working on" tracking, which is essential for the always-in-context display and for agents to explicitly signal which todo they're addressing.

**Migration**: Update all `todo.completed` references to `todo.status === 'done'`. Update `incompleteTodoCount` computations. The localStorage data shape changes — existing todos (if any) should be migrated on load: `completed: true → status: 'done'`, `completed: false → status: 'pending'`.

### Decision 3: Gate enforcement in `update_task_status` tool handler

**Choice**: Add gate check in `status-update-handler.ts` (tool dispatcher) before the state machine transition. If incomplete todos exist for the current state, reject with a list of what's remaining.

**Why**: The tool handler is the natural interception point — it already validates state transitions. Adding the gate here means the AI gets immediate feedback in the tool response. The `StateMachineEngine` itself stays pure (it only validates transitions, not business logic).

**Alternative considered**: Enforcing in `StateMachineEngine.transition()`. Rejected because the engine is a pure state machine and shouldn't know about todos.

### Decision 4: `add_translation_batch` allowed in review state

**Choice**: Change the validation in `translation-tools.ts` line 333 from `currentStatus !== 'working'` to `currentStatus !== 'working' && currentStatus !== 'review'`. Update all prompt text that says "仅 working 可调用" to include review.

**Why**: Eliminates unnecessary `review → working → review` roundtrips. The agent can fix issues directly during review without state juggling.

### Decision 5: Todo context block in every status message

**Choice**: Inject a `【待办清单】` block at the top of `getCurrentStatusInfo()` output. Show all todos with status icons (✅/→/☐). Collapse completed todo details, expand current + pending. Include a reminder line for the current working todo.

**Why**: Agents need constant awareness of what they should be doing. The post-tool-call reminder (`getPostToolCallReminder`) is insufficient because it only fires after tool calls. The status message fires on every turn.

**Token budget**: ~150-300 tokens per turn. Acceptable — same magnitude as existing state descriptions.

### Decision 6: Pre-defined todo templates

Templates per (taskType, state):

**Translation — planning (all chunks):**
1. 确认角色信息（上下文已提供，缺失时调用工具补充）
2. 确认术语信息（上下文已提供，缺失时调用工具补充）
3. 确认记忆信息（上下文已提供，缺失时搜索补充）
4. 确认段落内容（验证段落ID与原文，制定翻译策略）
5. 获取前后文上下文（如需要，可调用工具预览段落/章节）

**Translation — preparing:**
1. 创建/更新术语（确认完成或无需操作）
2. 创建/更新角色（确认完成或无需操作）
3. 创建/更新记忆（确认完成或无需操作）
4. 确认敬语翻译策略（搜索记忆/段落/角色关系，确定各角色间的敬语处理方式）

**Translation — working (dynamic):**
- Batched by `MAX_TRANSLATION_BATCH_SIZE` (10). Each todo includes verbose paragraph list with IDs + original text snippets (~20 chars each)
- If first chunk: additional todo for translating chapter title via `update_chapter_title`

**Translation — review:**
1. 检查翻译与原文一致性
2. 检查人称代词和语气词
3. 修正问题段落（可直接使用 add_translation_batch）
4. 更新术语/角色/记忆（如有新发现）

**Polish/Proofreading** — same as translation except: no 敬語 todo in preparing, no review state, working label uses 润色/校对.

**Chapter summary** — planning: confirm chapter content + previous summary. Working: generate summary.

### Decision 7: `mark_todo_working` as new AI tool

**Choice**: Add a new tool `mark_todo_working` that sets a todo's status to `working`. The existing `mark_todo_done` tool updates to set status to `done`.

**Why**: The user explicitly wants agents to mark todos as `working` before starting them. This creates an explicit commitment model — the agent signals "I'm now addressing this item."

### Decision 8: Working todo text includes verbose paragraph info

**Choice**: Each working batch todo includes display index, paragraph ID (short), and first ~20 chars of original text:

```
翻译段落批次 1/3（10 段）：
  [1] [a1b2c3d4] これは最初の段落で...
  [2] [e5f6g7h8] 次の段落は少し長く...
  ...
```

**Why**: Helps agent verify they're working on the right paragraphs. The chunk text is already in context, but the todo serves as a cross-reference checklist.

**Generation**: `TodoWorkflow.generateWorkingTodos()` receives `paragraphIds` + chunk text from `ToolCallLoopConfig`, parses the formatted chunk text to extract original text per paragraph ID.

### Decision 9: Only generate on first state entry

**Choice**: Track initialized states in `TodoWorkflow` via `Set<TaskStatus>`. On `review → working` backtrack, working todos are NOT regenerated (they were created on first entry). On any re-entry, existing todos remain.

**Why**: Prevents duplicate todos and preserves progress tracking across backtracks.

### Decision 10: UI three-state display

**Choice**: Update `AppRightPanel.vue` todo list to show:
- `pending` → ☐ circle icon, default opacity
- `working` → → arrow or spinner icon, highlighted/primary color
- `done` → ✅ check icon, reduced opacity + strikethrough

The currently active todo (status `working`) gets visual emphasis (e.g., primary color border or background highlight).

**Why**: Users monitoring the translation process can see at a glance what the AI is currently doing and what's left.

## Risks / Trade-offs

**[Risk] Gate blocks agent progress if it can't complete a todo** → Mitigation: All planning/preparing/review todos are "confirm X" style — they can always be marked done (even if the answer is "nothing needed"). Working todos correspond to actual translation batches which must be completed anyway.

**[Risk] Token overhead from always-in-context display** → Mitigation: Collapse completed todos to one-line summaries. Only expand current + pending items. Estimated ~150-300 tokens per turn, acceptable for the guidance benefit.

**[Risk] Backwards compatibility of TodoItem model change** → Mitigation: Add migration logic in `loadTodosFromStorage()` to convert `completed: boolean` → `status` field. Since todos are task-scoped and cleaned up on task end, stale data is unlikely.

**[Risk] Review state allowing add_translation_batch changes working-state semantics** → Mitigation: The existing review completeness check still runs. The only change is that fixes happen in-place instead of requiring a state roundtrip.

**[Trade-off] Pre-defined todos add rigidity** → Accepted: This is the explicit goal — force agents through a disciplined process. Agents can still create ad-hoc todos via `create_todo` for task-specific needs beyond the pre-defined checklist.
