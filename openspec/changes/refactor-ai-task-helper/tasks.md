# Tasks

- [x] **Scaffold Modules** <!-- id: 0 -->
  - [x] Create `task-types.ts` with types and status logic. <!-- id: 1 -->
  - [x] Create `model-selector.ts` with `getAIModelForTask`. <!-- id: 2 -->
  - [x] Create `chunk-formatter.ts` with chunking logic. <!-- id: 3 -->
  - [x] Create `response-parser.ts` with parsing logic. <!-- id: 4 -->
  - [x] Create `productivity-monitor.ts` with productivity checks. <!-- id: 5 -->
  - [x] Create `context-builder.ts` with context building functions. <!-- id: 6 -->
  - [x] Create `tool-executor.ts` with tool execution logic. <!-- id: 7 -->
  - [x] Create `stream-handler.ts` with stream callback logic. <!-- id: 8 -->
- [x] **Create Index** <!-- id: 9 -->
  - [x] Create `src/services/ai/tasks/utils/index.ts` and export all modules. <!-- id: 10 -->
- [x] **Verify & Cleanup** <!-- id: 11 -->
  - [x] Run type checks to ensure no circular dependency issues. <!-- id: 12 -->
  - [x] Update `ai-task-helper.ts` to re-export from `index.ts` (or delete if updating all references). <!-- id: 13 -->
  - [x] Update all import references in the codebase (optional if keeping re-export). <!-- id: 14 -->
