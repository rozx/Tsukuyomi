## MODIFIED Requirements

### Requirement: Pre-defined todo generation on state entry

The system SHALL generate natural-language text using the AI execution's captured UI language; quoted Chinese labels in the following scenarios denote zh-CN examples with equivalent zh-TW/en-US resources. IDs, display indexes, status values, batch membership and state gates SHALL remain language-independent.

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
- **THEN** one batch todo is created per `MAX_TRANSLATION_BATCH_SIZE` paragraphs, listing only each paragraph's display index and ID; source text is not copied into the todo because it is already in the chunk context and the current todo is re-sent every turn
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

#### Scenario: Localized batch todo

- **WHEN** a working todo is generated in English
- **THEN** its instruction SHALL be English and the same paragraph display indexes, IDs and order SHALL appear without depending on a Chinese label in formatted chunk text

### Requirement: Always-in-context todo block

The system SHALL generate natural-language text using the AI execution's captured UI language; quoted Chinese labels in the following scenarios denote zh-CN examples with equivalent zh-TW/en-US resources. IDs, display indexes, status values, batch membership and state gates SHALL remain language-independent.

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

#### Scenario: UI language changes while a task runs

- **GIVEN** a translation task started in English and has generated English predefined todos
- **WHEN** the UI language changes to Chinese before the task finishes
- **THEN** existing todos, IDs and states SHALL remain unchanged, and todos and context blocks generated later in the same execution SHALL keep using English
- **AND** the change SHALL NOT add a pause or restart-resume path for chunked translation, polish or proofreading tasks
