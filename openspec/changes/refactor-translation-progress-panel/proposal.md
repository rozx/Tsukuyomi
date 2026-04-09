## Why

The current `TranslationProgress.vue` uses a multi-tab system (Thinking, Output, Todos) coupled with automatic tab-switching. For users—especially when running concurrent chapter translations—this results in jarring UI jumps, information fragmentation, and a loss of global progress tracking. Refactoring into a unified Master-Detail structure will provide a seamless, cohesive view of the AI's operation without forcing the user's focus around.

## What Changes

- Replace the tab-based translation progress panel with a single Master-Detail (Focus) UI.
- Introduce a horizontal or pill-based **Task Switcher** at the top for visualizing concurrent tasks and selecting a chapter to focus on.
- Pin a concise **Todo Tracker** for the currently focused task to the top of the details view.
- Merge the "Thinking" and "Output" elements into a single **Activity Feed**. AI logic logs (thinking, tool logs) will be folded to save space, and output chunks will be printed chronologically.
- Remove legacy layout features (e.g., `autoTabSwitchingEnabled`) from the progress UI configuration.

## Capabilities

### New Capabilities
- `translation-progress-ux`: A re-architected translation progress UI utilizing an Activity Feed and persistent Todo view partitioned per active chapter task.

### Modified Capabilities


## Impact

- `src/components/novel/TranslationProgress.vue` (Major rewrite).
- `src/stores/book-details.ts` (State cleanup for legacy translation progress tabs/settings; add `focusedTaskId`).
- `src/components/layout/AppRightPanel.vue` (Update if component interface changes).
