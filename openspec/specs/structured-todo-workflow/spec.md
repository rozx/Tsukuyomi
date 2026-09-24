# structured-todo-workflow Specification

## Purpose
定义翻译/润色/校对任务中的结构化待办工作流（`todo-workflow.ts` + `TodoListService`）：进入阶段时自动生成预定义待办，待办有 pending / working / done 三态，未完成的预定义待办会阻止切换到下一阶段，当前阶段的待办清单每轮都注入 AI 上下文并在聊天面板中展示。

## Requirements

### Requirement: Pre-defined todo generation on state entry

When a chunked task enters a state for the first time in the current chunk, the system SHALL create that state's pre-defined todos. Re-entering a state in the same chunk (for example `review → working`) MUST NOT create them again.

#### Scenario: First entry into planning

- **GIVEN** a task enters `planning` for the first chunk
- **WHEN** the todos are generated
- **THEN** five pre-defined todos are created: confirm characters/terms/memories; fetch surrounding context; confirm character voice and honorific strategy; confirm the translation strategy; create or update terms, characters, and memories

#### Scenario: Brief planning for later chunks

- **GIVEN** a task enters `planning` for a later chunk that inherits the previous chunk's planning context
- **WHEN** the todos are generated
- **THEN** only two todos are created: confirm continuity with the previous part, and add terms/characters/memories that are new in this part

#### Scenario: First entry into working

- **GIVEN** a task enters `working` with N paragraphs in the current chunk
- **WHEN** the todos are generated
- **THEN** one batch todo is created per `MAX_TRANSLATION_BATCH_SIZE` paragraphs, listing each paragraph's display index, ID, and the first 20 characters of its original text
- **AND** for the first chunk of a chapter with a title, a todo "翻译章节标题：「{title}」" is created first

#### Scenario: First entry into review (translation only)

- **GIVEN** a translation task enters `review`
- **WHEN** the todos are generated
- **THEN** three todos are created: check consistency with the original; fix problem paragraphs with `add_translation_batch`; update terms, characters, and memories
- **AND** polish and proofreading tasks, which have no `review` state, get no review todos

#### Scenario: No todos for end or legacy preparing

- **GIVEN** a task enters `end`, or a restored task enters the legacy `preparing` state
- **WHEN** todos would be generated
- **THEN** none are created

#### Scenario: Moving to a new chunk

- **GIVEN** a task moves on to chunk K > 0
- **WHEN** the todo workflow for that chunk starts
- **THEN** todos left over from earlier chunks are deleted

### Requirement: Three-state todo lifecycle

Each todo SHALL have a `status` of `pending`, `working`, or `done`.

#### Scenario: New todos and auto-promotion

- **GIVEN** todos are created
- **WHEN** no todo of the task is currently `working`
- **THEN** new todos start as `pending` and the first pending todo of the current state is promoted to `working`

#### Scenario: Marking a todo done

- **GIVEN** a todo that is not done
- **WHEN** the agent calls `mark_todo_done`
- **THEN** its status becomes `done`
- **AND** the next pending todo is promoted to `working`

#### Scenario: Marking a done todo as working

- **GIVEN** a todo with status `done`
- **WHEN** the agent calls `mark_todo_working` on it
- **THEN** the tool returns the error "该待办已完成，无法重新标记为进行中"

#### Scenario: Legacy boolean todos

- **GIVEN** stored todos with a boolean `completed` field and no `status`
- **WHEN** they are loaded
- **THEN** `completed: true` becomes `status: 'done'` and `completed: false` becomes `status: 'pending'`

### Requirement: State transition gate

A status transition SHALL be rejected while any pre-defined todo of the current state and chunk is not `done`.

#### Scenario: Incomplete pre-defined todos

- **GIVEN** the current state has pre-defined todos that are `pending` or `working`
- **WHEN** the agent requests a transition via `update_task_status`
- **THEN** the transition is rejected with "⛔ 无法进入 {state}：还有 {n} 个未完成的待办事项" followed by the list

#### Scenario: Ad-hoc todos do not block

- **GIVEN** all pre-defined todos of the current state are `done`
- **AND** the agent created extra todos with `create_todo` that are still open
- **WHEN** the agent requests a transition
- **THEN** the transition is allowed

#### Scenario: State without generated todos

- **GIVEN** no pre-defined todos were generated for the current state
- **WHEN** the agent requests a transition
- **THEN** the gate does not block it

### Requirement: Always-in-context todo block

Every turn SHALL include a `【待办清单】` block for the current state's pre-defined todos.

#### Scenario: Block with mixed states

- **GIVEN** the current state has done, working, and pending todos
- **WHEN** the turn's status message is built
- **THEN** done todos show as `✅ [id] <first line>`, other open todos as `☐ [id] <first line>`
- **AND** the current todo (the working one, or else the first open one) shows as `→ [id] <full text>`
- **AND** a reminder "⚠️ 当前任务：{first line} — 完成后调用 mark_todo_done 标记" follows

#### Scenario: All todos done

- **GIVEN** all pre-defined todos of the current state are done
- **WHEN** the block is built
- **THEN** it ends with "✅ 所有待办已完成，可以进入下一阶段"; otherwise it ends with "⚠️ 完成所有待办后方可进入下一阶段"

### Requirement: Todo list three-state display

The chat panel's todo section (`ChatTodoSection.vue`) SHALL render the three states distinctly.

#### Scenario: Rendering todos

- **GIVEN** a task's todo list is shown
- **WHEN** todos render
- **THEN** pending todos show a circle icon, working todos an arrow icon with emphasis, and done todos a check-circle icon with muted, struck-through text
- **AND** the badge counts todos that are not done
