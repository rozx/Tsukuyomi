# Capability: state_machine_engine

## ADDED Requirements

### Requirement: Independent State Transitions by TaskType

- **GIVEN** a task loop starting up
- **WHEN** initializing the pure `StateMachineEngine`
- **THEN** it must dynamically adjust its allowed status transitions based entirely on `taskType` (e.g., `translation` supports `planning -> preparing -> working -> review -> end`, while `summarize` may skip `preparing` and `review`).

### Requirement: Pure Engine Purity

- **GIVEN** logic executed inside `StateMachineEngine`
- **WHEN** validating or performing transitions
- **THEN** it must NOT have internal dependencies on LLM streaming abort controllers, tracking metric times, or directly parsing `toolResultContent`. Tracking these metrics must remain outside this pure class.
