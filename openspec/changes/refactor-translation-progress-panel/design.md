## Context

Currently, the `TranslationProgress.vue` component presents the AI's translation progress using multiple tabs: "Thinking", "Output", and "Todos". The system relies on auto-switching logic to shift focus as the AI works, which severely degrades the user experience when multiple chapters are processed concurrently. Furthermore, keeping tabs isolated obscures the macro timeline of the task. The new design shifts to a Master-Detail paradigm: users select a focus chapter from a top task switcher, viewing a unified "Activity Feed" and a sticky "Todo Tracker" specifically for that task.

## Goals / Non-Goals

**Goals:**
- Unify AI thinking, tool logs, and outputs into a single vertical activity feed to eliminate tab-switching.
- Provide a clear, persistent Task Switcher (Concurrency Tracker) at the top of the panel to navigate between multiple active translation chapters.
- Maintain a sticky, heavily concise Todo Tracker at the top of the details view.
- Clean up legacy layout states in the Pinia store (e.g., `autoTabSwitchingEnabled`, `activeTab`).

**Non-Goals:**
- Completely rewriting the AI translation pipeline logic.
- Adding arbitrary new translation statuses; we only change how they are visualized.

## Decisions

### 1. Activity Feed rendering
Instead of distinct DOM containers for Thinking vs Output, we will structure the active task state into a chronological or logical vertical flow. 
- *Thinking* and *Tool Logs* will be handled as compact, optionally collapsible accordion-like cards in the stream.
- *Outputs* (translation chunks) will be text blocks seamlessly appended to the stream.

### 2. Task Switcher (Master-Detail Focus)
We will introduce a horizontal list (or pill group) of active chapters at the top of the app's side panel.
- A local UI state, `focusedTaskId`, will dictate which task is actively rendering its Todo and Activity Feed.
- Background tasks will simply reflect their macro progress percentage via the Task Switcher UI.

### 3. Store State Deprecation
We will strip out `activeTab` and `autoTabSwitchingEnabled` maps from `bookDetailsStore.translationProgress`. Keeping `autoScrollEnabled` per task is still valuable as users might want to freeze the scroll to inspect the activity feed.

Additionally:
- **`taskFolded`**: Remove. In the Master-Detail architecture the focused task is always fully rendered and non-focused tasks are represented only as pills in the Task Switcher. Per-task fold state no longer applies.
- **`clearTaskTranslationProgress`**: Update to stop cleaning up the removed keys (`autoTabSwitchingEnabled`, `activeTab`, `taskFolded`). Only `autoScrollEnabled` cleanup remains.

### 4. Activity Feed Data Source Strategy
The current `AIProcessingTask` stores thinking as a single concatenated string (`thinkingMessage`) and output as a single string (`outputContent`). There are no discrete timestamped events to interleave.

**Decision:** Parse the existing concatenated strings into pseudo-events at the rendering layer, reusing the existing marker-based parsing logic (chunk separators `[=== chunk N/M ===]`, tool calls `[调用工具: ...]`, tool results `[工具结果: ...]`). This avoids changing the AI pipeline data model (which is a non-goal) while still producing a sequential Activity Feed.

**Approach:**
- Build a `parseActivityEvents(task)` function that splits `thinkingMessage` and `outputContent` into typed event segments (thinking-block, tool-call, tool-result, output-chunk).
- Events are ordered by their parse position, not wall-clock time — the concatenation order in the raw strings already reflects chronological order.
- The function is memoized per task ID and re-computed when the source strings change (replacing the per-tab throttle maps `formattedThinkingThrottles` / `displayedOutputThrottles` with a single unified throttle).

### 5. `showOnlyCurrentChapter` Filter Interaction
The existing `showOnlyCurrentChapter` toggle filters `recentAITasks` to only the selected chapter. In the new architecture this filter applies to the **Task Switcher pill list** — when enabled, only the current chapter's task(s) appear in the switcher. If only one task remains after filtering, `focusedTaskId` auto-selects it.

### 6. Throttle Strategy for Unified Feed
The current per-tab throttle maps (`formattedThinkingThrottles`, `displayedOutputThrottles`) are replaced by a single per-task throttle that re-parses activity events. The throttle interval remains at ~200ms (`FORMAT_CACHE_THROTTLE_MS`). Cleanup on unmount iterates one map instead of two.

## Risks / Trade-offs

- **Risk:** Parsing concatenated strings into pseudo-events is fragile if the marker format changes upstream.
- **Mitigation:** The marker patterns are already constants in `TranslationProgress.vue`. Centralizing them in the new `parseActivityEvents` function makes them easier to maintain. Add unit tests for the parser.

- **Risk:** Removing `taskFolded` changes behavior for users who relied on collapsing finished tasks in the list.
- **Mitigation:** Finished tasks are no longer rendered inline — they appear as completed pills in the Task Switcher, which is a more compact representation by default.
