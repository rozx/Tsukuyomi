# Refactor AI Task Helper

## Goal

Deconstruct the monolithic `src/services/ai/tasks/utils/ai-task-helper.ts` into smaller, single-responsibility modules to improve maintainability, testability, and readability.

## Background

The `ai-task-helper.ts` file has grown to over 2000 lines, mixing various concerns such as task status management, model selection, response parsing, and stream handling. This makes it difficult to navigate, test, and modify without risk of regression.

## Scope

- **Refactor**: Split `ai-task-helper.ts` into granular modules within `src/services/ai/tasks/utils/`.
- **Preserve**: Ensure all existing functionality remains unchanged (refactor only).
- **Update**: Update all import references in the codebase to point to the new locations (or re-export through a barrel file for backward compatibility if needed, but direct imports are preferred).

## Key Changes

1.  **Extract Modules**:
    - `task-types.ts`: Task enums, status definitions, and workflow transitions.
    - `model-selector.ts`: AI model retrieval logic.
    - `response-parser.ts`: JSON parsing and validation logic.
    - `stream-handler.ts`: Stream callback creation and state monitoring.
    - `context-builder.ts`: Prompt context construction (book, chapter info).
    - `chunk-formatter.ts`: Text chunking logic.
    - `tool-executor.ts`: Tool execution wrappers.
    - `productivity-monitor.ts`: Productivity checks and limits.
2.  **Barrel File**: Create `src/services/ai/tasks/utils/index.ts` to export all new modules, facilitating the migration.
