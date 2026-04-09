# Capability: tool_dispatch_system

## ADDED Requirements

### Requirement: Unified ToolExecutionResult Contract

- **GIVEN** a `ToolHandler` implementation executing a raw `AIToolCall`
- **WHEN** returning its result
- **THEN** it must always strictly return the unified `ToolExecutionResult` interface carrying { `content`, `stateModifiers`, `metricsModifiers` } back to the `ToolDispatcher`, never a raw string, thus preventing repetitive downstream dual-path parsing.

### Requirement: State Protections (Data Writes Guardrails)

- **GIVEN** a tool attempting a data-write operation (e.g. `create_term` / `create_character`)
- **WHEN** checking allowance through `ToolHandler.isAllowed()`
- **THEN** it must be allowed during `preparing` and `review` stages, blocked and prompted with refusal during `planning` and `end`, and blocked while accurately incrementing the `metrics.workingRejectedWriteCount` during `working`.

### Requirement: Tool Limit Counting & Ejection

- **GIVEN** a tool invocation registered via `ToolDispatcher` hitting `TOOL_CALL_LIMITS`
- **WHEN** evaluated by the Dispatcher
- **THEN** the Handler's execution must be skipped entirely, immediately emitting the "Rate limit reached" simulated AI response, circumventing recursive call failures.

### Requirement: Duplicate Batch Tolerance (add_translation_batch)

- **GIVEN** `TranslationBatchHandler` processes `add_translation_batch` payloads containing repetitive or already-translated paragraph IDs from the AI
- **WHEN** updating the local translation maps
- **THEN** these IDs must be silently overwritten without raising hard exceptions or crashing the loop run.
