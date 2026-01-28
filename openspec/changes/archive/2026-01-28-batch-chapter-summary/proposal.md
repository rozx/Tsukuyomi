# Change: Add Batch Chapter Summary

## Why

Users need a way to generate summaries for all chapters in a novel at once, rather than triggering them individually, to save time and ensure consistent context for other AI tasks.

## What Changes

- Add "Batch Summary" button to AppHeader.
- Create `BatchSummaryPanel` component (Popover) for configuration and progress monitoring.
- Allow generating summaries for all chapters or only missing ones.
- Execute summary tasks in batch with concurrency control.

## Impact

- Affected specs: `batch-summary`
- Affected code:
  - `src/components/layout/AppHeader.vue`
  - `src/components/novel/BatchSummaryPanel.vue` (new)
