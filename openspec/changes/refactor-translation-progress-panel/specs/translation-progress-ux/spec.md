## ADDED Requirements

### Requirement: Master-Detail Task Switcher
The translation progress panel SHALL display all active and pending translation chapter tasks as switchable elements at the top of the interface. This component provides the master selection context (foreign key) for the panel.

#### Scenario: Switching Focus Task
- **WHEN** the user selects a different chapter from the task switcher list
- **THEN** the system immediately updates the `focusedTaskId` and renders the Todo Tracker and Activity Feed bound to the newly selected chapter.

#### Scenario: Visual Indication of Background Tasks
- **WHEN** multiple tasks are processing concurrently
- **THEN** the task switcher visually indicates the macro progress percentage of background tasks without taking focus away from the active explicitly focused task.

### Requirement: Unified Activity Feed
The translation progress panel SHALL render the AI thinking logs, tool executions, and stream output chunks sequentially inside a single vertically scrolling container per `focusedTaskId`.

#### Scenario: Processing Tool Calls
- **WHEN** the AI emits a tool call status log
- **THEN** the activity feed renders a visually distinct (and optionally collapsible) inline card chronologically appended to the feed, without switching contexts.

#### Scenario: Continuous Output Stream
- **WHEN** the AI outputs parts of a translation chunk
- **THEN** the output appends naturally inside the current activity stream directly below the prerequisite thinking/tool contexts.

### Requirement: Fixed Task Todo Tracker
A summarized AI Todo Tracker SHALL be pinned at the top level of the details view, directly underneath the Master Switcher, continuously visible to the user as they scroll the activity feed.

#### Scenario: Maintaining Visibility while reading output
- **WHEN** the user scrolls deep into the activity feed stream to read output
- **THEN** the Todo Tracker remains sticky on the screen, continuing to visualize high-level active step progression (e.g. "Translating paragraph 2/10").

### Requirement: Deprecation of Automatic Tab Switching
The system MUST permanently remove the `autoTabSwitchingEnabled`, `activeTab`, and `taskFolded` store preferences and uncouple the legacy "tab index" states from the task runner lifecycle.

#### Scenario: Running AI Translation Cycle
- **WHEN** the translation loop proceeds from "Thinking" phase to "Output" phase
- **THEN** the panel appends the new state to the Activity Feed stream without triggering abrupt UI layer jumps or forcing scroll context re-alignments.

### Requirement: Activity Feed Event Parsing
The Activity Feed SHALL parse the existing concatenated `thinkingMessage` and `outputContent` strings into discrete typed event segments using the established marker patterns, without requiring changes to the AI pipeline data model.

#### Scenario: Tool Call in Thinking Stream
- **WHEN** the thinking message contains a `[调用工具: toolName]` marker
- **THEN** the Activity Feed renders it as a distinct collapsible tool-call card at the corresponding position in the feed.

#### Scenario: Chunk Separator in Output Stream
- **WHEN** the output content contains a `[=== chunk N/M ===]` separator
- **THEN** the Activity Feed renders the subsequent text as a new output-chunk block appended after any preceding thinking/tool events.

### Requirement: Show Only Current Chapter Filter
The `showOnlyCurrentChapter` toggle SHALL filter the Task Switcher pill list to show only tasks matching the currently selected chapter.

#### Scenario: Filtering with Single Result
- **WHEN** the user enables "show only current chapter" and only one task matches
- **THEN** the system auto-selects that task as `focusedTaskId` and renders its Activity Feed and Todo Tracker.
