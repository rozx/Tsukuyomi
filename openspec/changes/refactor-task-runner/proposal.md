# Proposal: refactor-task-runner

## Why

The current `src/services/ai/tasks/utils/task-runner.ts` has grown into a "God Object" of nearly 1200 lines. The core class, `TaskLoopSession`, tightly couples three distinct areas of responsibility:

1. **Control Flow, State Machine & Prompt Policies**: Managing task-specific state transitions (e.g., `planning` → `preparing` → `working` → `review` → `end` for translation; `planning` → `working` → `end` for chapter summaries), guarding against infinite loops, and dynamically injecting side-effect prompt modifiers.
2. **LLM Connection & Streaming**: Wrapping LLM API calls, abort controllers, stream callbacks, and history arrays.
3. **Business Logic & Tool Handlers**: Ad-hoc logic for specifically parsing and normalizing translations out of tools like `add_translation_batch`, verifying translation bounds, managing status restrictions, and accumulating metrics.

This tight coupling makes the code unreadable, drastically increases the cognitive overhead required to debug or extend workflows, and risks breaking non-translation task types when modifying generic loops.

## What

We will dismantle `TaskLoopSession` and establish a clean, modular architecture:

1. **Pure State Machine**: Extract a _pure_ state machine responsible strictly for validating state and checking transition rules (differentiated by `taskType`).
2. **Prompt Policy & Session Context**: Isolate the logic that injects prompts (e.g., "brief planning", "missing paragraphs review") and writes to the message history, separating it from the pure transition rules.
3. **Tool Dispatcher / Handlers Extraction**: Relocate hardcoded tool business logic from the coordinator. Create a `ToolDispatcher` that delegates to specific classes/functions which manage their own allowed statuses and execution protocols.
4. **TaskRunner Coordinator**: Reduce the main loop to a coordinator that queries the state machine context, calls the AI, dispatches tools, and maintains essential invariants without embedding the parsing logic.

## Capabilities

- `core_task_runner`: A centralized, lightweight coordinator loop that manages the AI text generation and enforces strict execution invariants.
- `state_machine_engine`: A pure, typed state container checking valid transitions depending on task context (`translation`, `polish`, etc.).
- `prompt_policy`: An independent layer that decides which instructions to inject into the LLM history based on current state transitions.
- `tool_dispatch_system`: A modular tool registry and dispatcher where handlers parse tool returns and handle their own lifecycle and permissions.

## Scope

- Target File: `src/services/ai/tasks/utils/task-runner.ts`
- Related Files: Extracted modules will live securely in `src/services/ai/tasks/utils/` (e.g., `state-machine.ts`, `tool-dispatcher.ts`, `prompt-policy.ts`).
- Boundary: The external interfaces (`executeToolCallLoop`, `ToolCallLoopConfig`, `ToolCallLoopResult`) **MUST remain identical** to prevent breaking downstream callers.

## Explicit Invariants (High Risk)

During refactoring, the following fragile hidden behaviors **must be explicitly preserved**:

- **Degradation Detection**: Using `detectRepeatingCharacters` to abort bad loops.
- **Review Integrity**: Fallback/Cross-checking for missing paragraphs via database lookups (`crossCheckMissingWithDB()`) and synchronized memory refilling must be explicitly preserved. It is not just doing memory boundaries checks, but doing real validation against DB results.
- **Planning Context Updates**: Extracting context through `detectPlanningContextUpdate()`.
- **Metrics accumulation**: Preserving accurate time and counter metrics per stage.
- **Tool Limiting**: Keeping strict bounds on `TOOL_CALL_LIMITS`.
- **Duplicate Batch Tolerance**: Handling repetitive paragraph IDs gracefully during AI corrections without crashing.
- **State Protections**: The exact current behavior where Data Write tools are allowed during `preparing` and `review`, but blocked during `planning`, `working`, and `end` (with `working` specifically tracking metric rejection counts) must be strictly maintained.
- **Message History & Side-Effect Ordering**: In multi-tool call scenarios, we must maintain the exact current dispatching sequence: first appending `assistant(tool_calls)`, then sequentially executing and tracking all `tool` results, and finally batch-appending any delayed `user` state context modifiers (`pendingUserMessages`) at the very end.

## Impact

- **Maintainability**: The cognitive overhead to understand the task execution loop drops drastically.
- **Extensibility**: Adding new tools or changing prompt structures won't demand rewriting the coordinator loop.
- **Stability**: Moving from "hardcoded states" to a configured "pure state machine" prevents non-translation task types from accidentally executing the translation-specific preparation or review loops.

## Success Criteria / Acceptance

1. **Test Alignment**: All existing automated behavior tests covering `executeToolCallLoop` **must pass green without modifications**.
2. **Regression Assertions**: The test suite (existing or new) must explicitly assert coverage for the following concrete scenarios against the entry point:
   - State fallback (e.g., `review` reverting to `working`).
   - Tool `limit reached` handling and limits enforcement.
   - DB cross-checking for missing paragraphs during `review` and successful memory refilling.
   - `brief planning` warning ingestion.
   - Data write refusal and metric incrementation during `working` state.
3. **Complexity Reduction**: The main internal run loop and turn execution functions must be constrained. Specifically, `run()` and the extracted orchestrator functions iterating turns must not exceed 100 lines of code, and cyclomatic branching within the main iteration flow must be explicitly delegated to states and handlers, capping single-function complexity.
4. **Zero Edge-Case Drift**: All explicit invariants listed above operate identically without requiring changes to downstream consuming services.
