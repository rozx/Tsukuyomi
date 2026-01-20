# Design: Modular AI Task Architecture

## Context

The current `ai-task-helper.ts` violates the Single Responsibility Principle, acting as a "god object" for AI task utilities. This refactor aims to modularize the code without altering business logic.

## Architecture

### Module Breakdown

| Module                      | Responsibility                     | Exports                                                                               |
| :-------------------------- | :--------------------------------- | :------------------------------------------------------------------------------------ |
| **task-types.ts**           | Type definitions and status logic. | `TaskType`, `TaskStatus`, `getStatusLabel`, `getValidTransitionsForTaskType`          |
| **model-selector.ts**       | AI Model resolution.               | `getAIModelForTask`                                                                   |
| **response-parser.ts**      | Parsing AI JSON responses.         | `parseStatusResponse`, `VerificationResult`, `verifyParagraphCompleteness`            |
| **stream-handler.ts**       | Handling streaming responses.      | `createStreamCallback`                                                                |
| **context-builder.ts**      | Building prompt context strings.   | `buildBookContextSection`, `buildChapterContextSection`, `buildInitialUserPromptBase` |
| **chunk-formatter.ts**      | Chunking paragraphs for AI.        | `buildFormattedChunks`, `DEFAULT_TASK_CHUNK_SIZE`                                     |
| **tool-executor.ts**        | Wrapper for tool execution.        | `executeToolCall`                                                                     |
| **productivity-monitor.ts** | Monitoring tool usage/progress.    | `PRODUCTIVE_TOOLS`, `detectPlanningContextUpdate`                                     |

### Dependency Graph

- Most modules will be leaf nodes or dependent on `task-types.ts`.
- `stream-handler.ts` will depend on `task-types.ts` and `ai-processing` store types.
- `tool-executor.ts` will depend on `tool-registry`.

## Migration Strategy

1.  Create new files with extracted code.
2.  Create `index.ts` in `utils` folder exporting everything from new files.
3.  Replace `ai-task-helper.ts` content with exports from `index.ts` (deprecate it).
4.  Update consumers to import from `src/services/ai/tasks/utils` (or specific files if preferred).
