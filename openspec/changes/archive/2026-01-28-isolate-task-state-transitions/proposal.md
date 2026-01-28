# Change: Isolate Task State Transitions

## Why

To improve parsing reliability and prevent data "leakage", state transitions must be strictly isolated from content generation. Mixing status updates with content in the same JSON object complicates stream processing and potential error handling.

## What Changes

- **Strict Output Separation**: AI must emit state changes (e.g., `planning` -> `working`) as standalone JSON objects containing only the `status` field.
- **Content Isolation**: Translation content must be emitted in formatted JSON objects separate from status updates.

## Impact

- **Specs**: `ai-task-state-machine`
- **Codebase**:
  - Prompts need updates to explicitly instruct the AI about this separation.
  - Stream handlers might need verification to ensure they handle fragmented chunks correctly (though they likely already do).
