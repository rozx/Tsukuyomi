# modular-ai-task-logic Specification

## Purpose
约定 AI 任务的通用逻辑拆分在 `src/services/ai/tasks/utils/` 下的单一职责模块中（取代早期的单体 `ai-task-helper.ts`），并通过 `utils/index.ts` 统一导出。

## Requirements

### Requirement: Modular Architecture

Shared AI task logic SHALL live in single-responsibility modules under `src/services/ai/tasks/utils/` rather than in one monolithic helper file.

#### Scenario: Responsibilities are split by module

- **GIVEN** the AI task utilities
- **WHEN** a developer looks for a piece of shared task logic
- **THEN** task types and transitions live in `task-types.ts`, chunk formatting in `chunk-formatter.ts`, context building in `context-builder.ts`, response parsing in `response-parser.ts`, stream handling in `stream-handler.ts`, tool execution in `tool-executor.ts`, and the tool-call loop in `task-runner.ts`
- **AND** no monolithic `ai-task-helper.ts` exists

#### Scenario: Consumers import through the barrel

- **GIVEN** code outside `utils/` that needs these helpers
- **WHEN** it imports them
- **THEN** it can import from `src/services/ai/tasks/utils` via `index.ts`
