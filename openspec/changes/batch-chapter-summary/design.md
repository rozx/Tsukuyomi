# Design Decisions

## UI Component Structure

- **New Component**: `src/components/novel/BatchSummaryPanel.vue`
  - Implemented as a Popover (similar to `ThinkingProcessPanel`).
  - Contains:
    - Toggle switch: "Overwrite existing summaries".
    - Button: "Start Batch Generation".
    - Progress Bar / Status: Shows "Processing X/Y", "Completed: Z", "Failed: W".
    - List of active/failed tasks (optional, maybe just rely on main AI panel for details).
- **Integration**:
  - `src/components/layout/AppHeader.vue`: Import and use `BatchSummaryPanel`. Add a trigger button.

## Batch Processing Logic

- The batch logic will be contained within `BatchSummaryPanel.vue` (or a composable `useBatchSummary`).
- **Concurrency**:
  - Since `ChapterSummaryService` triggers an AI task which might be long-running, we shouldn't fire all requests at once.
  - We will implement a simple queue system with a concurrency limit (e.g., 3 concurrent tasks).
  - We will monitor `AIProcessingStore` to track status of submitted tasks.
- **State Management**:
  - Local state in component/composable to track:
    - `isBatchRunning`: boolean
    - `progress`: { total, current, success, failed }
    - `queue`: Array of chapters to process.

## Reusing Existing Services

- We will reuse `ChapterSummaryService.generateSummary`.
- This service already integrates with `aiProcessingStore` to show "Thinking..." status.
- By calling this service, tasks will naturally appear in the global `ThinkingProcessPanel`.
- The `BatchSummaryPanel` will primarily act as a "Task Scheduler" and "High-level Progress Monitor".

## User Experience

- User clicks "Batch Summary" button in header.
- Popover opens.
- User selects options (default: Skip existing).
- User clicks "Start".
- Button changes to "Stop".
- Progress bar appears.
- User can close popover; processing continues (as tasks are in store), but the "Scheduler" needs to keep running.
  - _Constraint_: If the scheduler is in a Vue component, unmounting it (e.g. navigating away?) might stop the scheduler loop.
  - `AppHeader` is persistent in the layout, so `BatchSummaryPanel` (if mounted there) should persist.
  - However, `Popover` usually unmounts content when hidden? No, PrimeVue Popover usually keeps content or just hides it.
  - To be safe, we might want the scheduling logic in a Store or a persistent Composable, but for simplicity, we can keep it in the component if we ensure the component stays mounted (or the logic is independent).
  - Actually, `ThinkingProcessPanel` is mounted in `AppHeader`. `BatchSummaryPanel` will also be mounted in `AppHeader`. So it will persist as long as the layout is active.

## Alternative: Store-based Scheduler

- If we want true background persistence, we could add a `BatchTaskStore`.
- given "Favor straightforward, minimal implementations", keeping logic in the component (which is in `AppHeader`) is acceptable for now.
