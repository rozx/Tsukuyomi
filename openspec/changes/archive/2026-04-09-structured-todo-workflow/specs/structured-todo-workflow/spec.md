## ADDED Requirements

### Requirement: Pre-defined todo generation on state entry

When an AI agent enters a task state for the first time (excluding `end`), the system SHALL auto-generate a pre-defined checklist of todos for that state based on the task type. Todos SHALL only be generated once per state — re-entering a state (e.g., `review → working` backtrack) MUST NOT regenerate todos.

#### Scenario: First entry into planning state generates planning todos

- **GIVEN** a translation task enters `planning` state for the first time
- **WHEN** the state transition completes
- **THEN** the system MUST create the following todos for the task:
  1. 确认角色信息（上下文已提供，缺失时调用工具补充）
  2. 确认术语信息（上下文已提供，缺失时调用工具补充）
  3. 确认记忆信息（上下文已提供，缺失时搜索补充）
  4. 确认段落内容（验证段落ID与原文，制定翻译策略）
  5. 获取前后文上下文（如需要，可调用工具预览段落/章节）

#### Scenario: First entry into preparing state generates preparing todos (translation)

- **GIVEN** a translation task enters `preparing` state for the first time
- **WHEN** the state transition completes
- **THEN** the system MUST create the following todos for the task:
  1. 创建/更新术语（确认完成或无需操作）
  2. 创建/更新角色（确认完成或无需操作）
  3. 创建/更新记忆（确认完成或无需操作）
  4. 确认敬语翻译策略（搜索记忆/段落/角色关系，确定各角色间的敬语处理方式）

#### Scenario: First entry into preparing state generates preparing todos (polish/proofreading)

- **GIVEN** a polish or proofreading task enters `preparing` state for the first time
- **WHEN** the state transition completes
- **THEN** the system MUST create the following todos for the task:
  1. 创建/更新术语（确认完成或无需操作）
  2. 创建/更新角色（确认完成或无需操作）
  3. 创建/更新记忆（确认完成或无需操作）
- **AND THEN** the system MUST NOT include a 敬語 strategy todo

#### Scenario: First entry into working state generates verbose batch todos

- **GIVEN** a translation task enters `working` state for the first time
- **AND GIVEN** the current chunk contains N paragraphs with IDs and original text
- **WHEN** the state transition completes
- **THEN** the system MUST create batch todos, each covering up to MAX_TRANSLATION_BATCH_SIZE (10) paragraphs
- **AND THEN** each batch todo MUST include the display index, paragraph ID, and first ~20 characters of original text for each paragraph in the batch

#### Scenario: First entry into working state with chapter title (first chunk, translation)

- **GIVEN** a translation task enters `working` state for the first time
- **AND GIVEN** this is the first chunk (chunkIndex === 0) and a chapter title exists
- **WHEN** the state transition completes
- **THEN** the system MUST create an additional todo for translating the chapter title: "翻译章节标题：「{chapterTitle}」"

#### Scenario: First entry into review state generates review todos

- **GIVEN** a translation task enters `review` state for the first time
- **WHEN** the state transition completes
- **THEN** the system MUST create the following todos for the task:
  1. 检查翻译与原文一致性
  2. 检查人称代词和语气词
  3. 修正问题段落（可直接使用 add_translation_batch）
  4. 更新术语/角色/记忆（如有新发现）

#### Scenario: Re-entry into a state does not regenerate todos

- **GIVEN** a translation task transitions from `review` back to `working`
- **AND GIVEN** working todos were already generated on first entry
- **WHEN** the state transition completes
- **THEN** the system MUST NOT create new todos for the working state
- **AND THEN** the existing working todos MUST remain unchanged

#### Scenario: End state does not generate todos

- **GIVEN** a task transitions to `end` state
- **WHEN** the state transition completes
- **THEN** the system MUST NOT generate any todos

#### Scenario: Single-paragraph tasks do not generate todos

- **GIVEN** a single-paragraph polish or proofreading task (uses single-paragraph-processor)
- **WHEN** the task is executed
- **THEN** the system MUST NOT generate any pre-defined todos

### Requirement: Three-state todo lifecycle

Each todo item SHALL have a status of `pending`, `working`, or `done` (replacing the boolean `completed` field). Agents MUST explicitly transition todos through these states.

#### Scenario: New todo starts as pending

- **WHEN** a todo is created (pre-defined or via create_todo)
- **THEN** its status MUST be `pending`

#### Scenario: Agent marks todo as working

- **WHEN** the agent calls `mark_todo_working` with a todo ID
- **THEN** the todo status MUST change to `working`

#### Scenario: Agent marks todo as done

- **WHEN** the agent calls `mark_todo_done` with a todo ID
- **THEN** the todo status MUST change to `done`

#### Scenario: Backwards compatibility migration

- **GIVEN** existing todos in localStorage with `completed: boolean` field
- **WHEN** todos are loaded from storage
- **THEN** the system MUST migrate `completed: true` to `status: 'done'`
- **AND THEN** the system MUST migrate `completed: false` to `status: 'pending'`

### Requirement: mark_todo_working AI tool

The system SHALL provide a `mark_todo_working` tool that allows the AI agent to explicitly mark a todo as in-progress.

#### Scenario: Agent marks a pending todo as working

- **WHEN** the agent calls `mark_todo_working` with a valid todo ID that has status `pending`
- **THEN** the system MUST update the todo status to `working`
- **AND THEN** return a success message

#### Scenario: Agent marks an already-working todo as working

- **WHEN** the agent calls `mark_todo_working` with a todo ID that already has status `working`
- **THEN** the system MUST return a success message (idempotent)

#### Scenario: Agent marks a done todo as working

- **WHEN** the agent calls `mark_todo_working` with a todo ID that has status `done`
- **THEN** the system MUST return an error message: "该待办已完成，无法重新标记为进行中"

### Requirement: State transition gate enforcement

The `update_task_status` tool SHALL enforce that all pre-defined todos for the current state are marked as `done` before allowing a transition to the next state.

#### Scenario: Transition allowed when all todos are done

- **GIVEN** the current state is `planning` with 5 pre-defined todos, all with status `done`
- **WHEN** the agent calls `update_task_status` to transition to `preparing`
- **THEN** the system MUST allow the transition

#### Scenario: Transition blocked when todos are incomplete

- **GIVEN** the current state is `planning` with 5 pre-defined todos, 2 of which have status `pending`
- **WHEN** the agent calls `update_task_status` to transition to `preparing`
- **THEN** the system MUST reject the transition
- **AND THEN** the system MUST return an error listing the incomplete todos: "⛔ 无法进入 preparing：还有 2 个未完成的待办事项" followed by the list

#### Scenario: Transition blocked when todos are still working

- **GIVEN** the current state is `working` with 3 batch todos, 1 with status `working`
- **WHEN** the agent calls `update_task_status` to transition to `review`
- **THEN** the system MUST reject the transition
- **AND THEN** the system MUST return an error listing the incomplete todos

#### Scenario: Agent-created ad-hoc todos do not block transitions

- **GIVEN** the current state has all pre-defined todos marked as `done`
- **AND GIVEN** the agent created additional custom todos via `create_todo` that are still `pending`
- **WHEN** the agent calls `update_task_status` to transition
- **THEN** the system MUST allow the transition (only pre-defined todos gate)

### Requirement: Always-in-context todo display

Every turn's status message SHALL include a `【待办清单】` block showing all todos for the current state with their statuses and a reminder for the current working todo.

#### Scenario: Todo block in status message with mixed states

- **GIVEN** the current state is `working` with 3 batch todos (1 done, 1 working, 1 pending)
- **WHEN** the system builds the status message for a new turn
- **THEN** the status message MUST include a `【待办清单】` section showing:
  - Completed todos with ✅ icon (collapsed, no paragraph details)
  - Working todo with → icon (expanded with full paragraph details)
  - Pending todos with ☐ icon (expanded with full paragraph details)
- **AND THEN** the message MUST include a reminder line: "⚠️ 当前任务：{working todo text} — 完成后请调用 mark_todo_done 标记"
- **AND THEN** the message MUST include: "⚠️ 完成所有待办后方可进入下一阶段"

#### Scenario: All todos done shows completion message

- **GIVEN** all todos for the current state are `done`
- **WHEN** the system builds the status message
- **THEN** the status message MUST include: "✅ 所有待办已完成，可以进入下一阶段"

### Requirement: Todo list UI three-state display

The todo list panel in `AppRightPanel.vue` SHALL display todos with three visual states instead of binary check/uncheck.

#### Scenario: Pending todo display

- **GIVEN** a todo with status `pending`
- **WHEN** rendered in the todo list panel
- **THEN** it MUST display with a circle outline icon and default text opacity

#### Scenario: Working todo display

- **GIVEN** a todo with status `working`
- **WHEN** rendered in the todo list panel
- **THEN** it MUST display with a highlighted icon (e.g., arrow or spinner) in primary color
- **AND THEN** it MUST have visual emphasis (e.g., primary color text or background highlight)

#### Scenario: Done todo display

- **GIVEN** a todo with status `done`
- **WHEN** rendered in the todo list panel
- **THEN** it MUST display with a check-circle icon in green
- **AND THEN** it MUST have reduced opacity and strikethrough text

#### Scenario: Badge count shows non-done todos

- **GIVEN** a task has 5 todos: 2 done, 1 working, 2 pending
- **WHEN** the todo list badge is rendered
- **THEN** the badge MUST show count 3 (pending + working)
