# Capability: core_task_runner

## ADDED Requirements

### Requirement: Coordinator Internal Run Execution (Metrics: <100 LOC)

- **GIVEN** a task loop execution process initializing a turn
- **WHEN** the coordinator orchestrates the sub-components (`StateMachineEngine`, `ToolDispatcher`, `PromptPolicy`, `LLMStreamAdapter`)
- **THEN** its `run()` function and any internal executing loop handler must contain fewer than 100 Lines of Code, maintaining strict delegation without implementing inline tool parsing or prompt logic.

### Requirement: Golden Transcript Invariant (Message History Sequence)

- **GIVEN** an array of tools correctly returned from the AI response
- **WHEN** the Coordinator processes these multi-tool responses
- **THEN** it must dispatch exactly in this sequential order:
  1. Push `{ role: 'assistant', tool_calls: [...] }` to the message array.
  2. Sequentially dispatch tools with the `ToolDispatcher`.
  3. Push each resulting `{ role: 'tool', content: '...', tool_call_id: id }` synchronously after each tool's resolution.
  4. Finally, collect any delayed state modifiers and push them as a single `{ role: 'user', ... }` batch at the very end.

### Requirement: Review Integrity and Database Cross-check

- **GIVEN** the task is inside the `review` state loop and verifying completeness
- **WHEN** the initial memory boundaries check indicates a missing paragraph
- **THEN** the Coordinator must trigger a localized `crossCheckMissingWithDB()` validation that queries the actual database rows before rejecting the phase.

### Requirement: Network Aborts Boundaries

- **GIVEN** a stream cancellation occurs through the AbortController or a `4xx/5xx` HTTP error happens
- **WHEN** the `executeTurn()` attempts to catch this Error
- **THEN** it must immediately break the LLM loop and re-throw the rejection upwards, completely avoiding any infinite retry mechanism hiding inside the runner loop.

### Requirement: Execution Invariants Protection

- **GIVEN** the task loop handles special edge cases
- **WHEN** running its cycles
- **THEN** it must preserve existing degradation limiters (`detectRepeatingCharacters()`) and completely preserve all metrics counters (measuring planning, preparing, specific phase times, and tool rejection sums).
