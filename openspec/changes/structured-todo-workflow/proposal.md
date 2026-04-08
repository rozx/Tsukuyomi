## Why

AI translation agents currently treat todos as optional, self-created, and unstructured. This leads to agents skipping important steps (e.g., not confirming terminology before translating, not reviewing 敬語 strategies). The todo system needs to become a **structured workflow engine** with pre-defined checklists per state, gate enforcement on state transitions, and always-visible context — so agents follow a disciplined, repeatable process.

Additionally, the review state currently forces agents to backtrack to `working` state just to fix translation issues, adding unnecessary state transitions. Review should allow direct translation edits.

## What Changes

- **Pre-defined todo generation**: When the agent enters a state for the first time (excluding `end`), the system auto-generates a checklist of required tasks specific to that state and task type
- **Three-state todo model**: Todos gain a `pending → working → done` lifecycle (replacing the current boolean `completed`)
- **Transition gate**: `update_task_status` enforces that all todos for the current state are `done` before allowing a state transition
- **Review state enhancement**: `add_translation_batch` becomes allowed in `review` state, removing the need to backtrack to `working` for fixes
- **Always-in-context todos**: Every turn's status message includes the full todo list with current task highlighted
- **Verbose working todos**: Working state batches include paragraph IDs + original text snippets for verification
- **New `mark_todo_working` tool**: Agents explicitly mark a todo as in-progress before working on it
- **UI update**: The todo list panel in `AppRightPanel.vue` shows three visual states (pending/working/done) instead of binary check/uncheck

## Capabilities

### New Capabilities
- `structured-todo-workflow`: Pre-defined todo templates per task state, gate enforcement, three-state lifecycle, always-in-context display, and verbose working batches

### Modified Capabilities
- `ai-task-state-tool`: `update_task_status` now checks todo completion gate before allowing transitions
- `ai-translation-batch-tool`: `add_translation_batch` now allowed in `review` state (not just `working`)
- `ai-todo-reminder`: Todo reminder updated to use three-state model and always-in-context display

## Impact

- **services/todo-list-service.ts**: `TodoItem.completed` → `TodoItem.status` (three-state enum)
- **services/ai/tasks/utils/todo-helper.ts**: Major rewrite — todo context builder, pre-defined templates
- **services/ai/tasks/utils/todo-workflow.ts**: New file — template definitions, generation logic, gate enforcement
- **services/ai/tools/todo-list-tools.ts**: Add `mark_todo_working` tool, update `list_todos` output
- **services/ai/tasks/utils/task-runner.ts**: State entry hooks for todo generation, initialization tracking
- **services/ai/tasks/utils/tool-dispatcher/**: Gate check in status handler, allow batch in review
- **services/ai/tools/translation-tools.ts**: Allow `add_translation_batch` in `review` state
- **services/ai/tasks/prompts/common.ts**: Todo context block in status info, updated state descriptions
- **services/ai/tasks/prompts/runner.ts**: Updated review prompts (no backtrack needed for fixes)
- **components/layout/AppRightPanel.vue**: Three-state todo display with active task highlighting
