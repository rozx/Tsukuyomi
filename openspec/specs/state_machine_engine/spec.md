# state_machine_engine Specification

## Purpose
定义 `StateMachineEngine`（`state-machine-engine.ts`）：一个按任务类型决定合法状态转换的纯状态机，不依赖流式请求、指标统计或工具结果解析。

## Requirements

### Requirement: Independent State Transitions by TaskType

The `StateMachineEngine` SHALL derive its allowed status transitions entirely from `taskType` via `getValidTransitionsForTaskType`.

#### Scenario: Translation task transitions

- **GIVEN** a `translation` task
- **WHEN** the engine is initialized
- **THEN** it allows `planning → working → review → end`, and `review → working` for rework
- **AND** a legacy persisted `preparing` status may only transition to `working`

#### Scenario: Polish and proofreading task transitions

- **GIVEN** a `polish` or `proofreading` task
- **WHEN** the engine is initialized
- **THEN** it allows `planning → working → end`
- **AND** no transition into or out of `review` is allowed

#### Scenario: Unknown task type

- **GIVEN** a task type that is not `translation`, `polish`, or `proofreading`
- **WHEN** the transition table is requested
- **THEN** an error is thrown

### Requirement: Pure Engine Purity

Logic inside `StateMachineEngine` SHALL NOT depend on LLM streaming abort controllers, metric timing, or tool result parsing.

#### Scenario: Validating a transition

- **GIVEN** logic executed inside `StateMachineEngine`
- **WHEN** validating or performing transitions
- **THEN** it uses only the current status, the target status, and the transition table
- **AND** metric timing and tool result parsing stay in the coordinator
