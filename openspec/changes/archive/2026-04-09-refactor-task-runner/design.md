# Technical Design: Refactor Task Runner

## Architecture

We are extracting the massive `TaskLoopSession` (currently ~1100 lines) within `task-runner.ts` into a decentralized, modular architecture consisting of the following core areas:

### 1. The Pure State Machine (`StateMachineEngine`)

A module solely responsible for holding the current state and validating if a state transition is legal entirely based on `taskType`. It has no knowledge of the network stream, prompt strings, metrics durations, or tool handlers.

```typescript
export class StateMachineEngine {
  constructor(private taskType: TaskType);
  getCurrentStatus(): TaskStatus;
  isValidTransition(next: TaskStatus): boolean;
  transition(next: TaskStatus): void;
}
```

### 1.5 The Coordinator / LLM Adapter (`LLMStreamAdapter` & Instrumentation)

Since `StateMachineEngine` is pure, tracking metrics (e.g. `trackStatusDuration`) and managing stream aborts/HTTP errors are explicitly handled here by the Coordinator layer. A separate `LLMStreamAdapter` structure will be defined to manage the `createWrappedStreamCallback` and signal abortions to completely separate network fragility from the cycle coordination.

### 2. The Prompt Policy (`PromptPolicy`)

An isolated layer responsible for knowing _which strings to generate_ when a state transitions or an error occurs.

```typescript
export const PromptPolicy = {
  getTransitionPrompt(prev: TaskStatus, current: TaskStatus, context: TaskContext): string | null {
    // Generates the working loop prompt, missing paragraphs prompt, etc.
  },
  getToolErrorPrompt(errorType: 'unauthorized' | 'rate_limit', toolName: string): string { ... }
}
```

### 3. The Tool Dispatcher & Handlers (`ToolDispatchSystem`)

A registry that maps tool names to specific isolated handler classes/functions. The `ToolDispatcher` processes the raw tool arrays returned by the LLM, checks execution rights, and batches the output into a unified `ToolExecutionResult` to preserve invariants and avoid downstream JSON re-parsing.

```typescript
export interface ToolExecutionResult {
  content: string; // The raw string to report back to LLM
  stateModifiers?: {
    newStatus?: TaskStatus;
    newTitleTranslation?: string;
  };
  metricsModifiers?: {
    processedCount?: number;
    failedParagraphs?: Array<{ paragraph_id?: string; error_code?: string; error?: string }>;
  };
}

export interface ToolHandler {
  name: string;
  isAllowed(status: TaskStatus, taskType: TaskType): { allowed: boolean; trackRefusal?: boolean };
  execute(call: AIToolCall, context: TaskContext): Promise<ToolExecutionResult>;
}
```

### 4. The Coordinator

The stripped-down version of the old `TaskLoopSession`. Its `executeTurn` and `run` functions are limited to a clear orchestration path (< 100 lines each):

1. Ask LLM to generate text based on `history`.
2. Push `assistant` content to history.
3. If tool calls exist, delegate to `ToolDispatcher`.
4. `ToolDispatcher` runs tools, pushes exactly ordered responses to `history`, and returns any deferred state changes.
5. If state changes, `StateMachineEngine` validates it, `PromptPolicy` generates the modifier string, and it's appended to history.

## Data Flow

**Tool Execution Sequence (Golden Transcript Invariant):**

To ensure LLM behavior consistency, tests MUST assert this exact history transcript sequence during multi-tool returns:

1. Coordinator appends `{ role: 'assistant', tool_calls: [...] }` to history.
2. Dispatcher executes tools _sequentially_.
3. As each tool completes, `{ role: 'tool', content: '...', tool_call_id: id }` is appended immediately.
4. Dispatcher collects `pendingUserMessages` (delayed state transitions).
5. Coordinator pushes `pendingUserMessages` (as role `user`) to history.

## Implementation Details

### Directory Structure

```text
src/services/ai/tasks/utils/
  ├─ task-runner.ts             (The Coordinator)
  ├─ state-machine-engine.ts    (Pure State Machine)
  ├─ prompt-policy.ts           (Prompt construction layer)
  ├─ llm-stream-adapter.ts      (Network streaming & aborts)
  ├─ instrumentation.ts         (Metrics & durations tracking)
  ├─ tool-dispatcher/
  │   ├─ dispatcher.ts
  │   ├─ handlers/
  │   │   ├─ translation-batch-handler.ts
  │   │   ├─ status-update-handler.ts
  │   │   └─ ...
```

### Addressing Explicit Constraints & Acceptance Criteria

- **External Interface Identity**: The signature and parameters of `executeToolCallLoop()` and `ToolCallLoopConfig` must remain completely untouched.
- **State Protections (Regression Assertion)**: Transition fallback from `review -> working` must trigger successfully. `WriteToolsHandler.isAllowed()` must block data tools in `planning`/`working`/`end` and allow in `preparing`/`review`. Specifically in `working` state, it must record a metric refusal count.
- **Duplicate Paragraph Tolerance**: Using `add_translation_batch` with identical paragraph IDs must update translations silently without crashes, managed by `TranslationBatchHandler`.
- **Tool Limiting (Regression Assertion)**: If `TOOL_CALL_LIMITS` is reached, the dispatcher must actively reject the execution, immediately respond to the AI with a simulated tool message ("rate limit reached"), and skip calling the actual function.
- **Brief Planning (Regression Assertion)**: The ingestion of the early contextual boolean `isBriefPlanning` must correctly modify emitted prompt policies.
- **Review Integrity (Regression Assertion)**: The `crossCheckMissingWithDB()` logic triggers if and only if the `review` phase's initial missing paragraphs check fails in the Coordinator (matching the exact localized behavior inside `handleReviewState`). Validated by simulated missing DB rows asserting successful refill.
- **Complexity limits**: `TaskLoopSession.executeTurn()` logic moved into Dispatcher. Internal run and turn loops must measure under 100 LOC (measured strictly ignoring whitespace/comments, or using standard block length tooling like ESLint 'max-lines-per-function').

### Error & Exit Strategy (Boundary Conditions)

The main Coordinator `run()` controls explicit boundaries:

1. **Network Aborts/Cancellations**: Explicitly thrown upwards (e.g., `AbortError` or cancellation messages) rather than silently breaking the loop to preserve upstream tracking.
2. **HTTP 4xx/5xx Errors**: Logged and re-thrown to avoid infinite retries during `run()`.
3. **Max Turns Check**: Handled specifically to break out of infinite LLM looping boundaries via `checkMaxTurns()`.

### Strangler Migration Strategy (Refactoring Steps)

To minimize regression windows, we execute in exactly three decoupled stages:

1. **Step 1 (Zero Behavior Change):** Extract `StateMachineEngine` and `PromptPolicy`. Swap `TaskLoopSession` internals to use them for pure strings and transitions. Verify all tests pass.
2. **Step 2 (The Dispatcher Swap):** Extract hardcoded parsing into `ToolHandler` instances returning `ToolExecutionResult`. Inject the `ToolDispatchSystem`. Run golden transcript tests validating exact `assistant -> tool -> user` string pushes.
3. **Step 3 (Cleanup & Instrumentation):** Delete dead code, extract `llm-stream-adapter.ts` and `instrumentation.ts`, collapse `TaskLoopSession` into the final `< 100-line` Coordinator structure.

## Alternatives Considered

- **LangGraph.js Migration**: Considered moving entirely to a DAG state execution graph instead of a manual loop.
  - _Why rejected_: Doing this simultaneously with untangling the business logic introduces massive failure risks. Refactoring to the Coordinator pattern first makes a future transition to LangGraph trivial.
- **Class-based vs. Functional Tool Handlers**:
  - _Decision_: We will use interface-based objects for `ToolHandler` and structured `ToolExecutionResult` returns to cleanly co-locate execution replacing the fragmented switch statements in the original file.
