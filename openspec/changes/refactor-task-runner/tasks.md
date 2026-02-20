# Tasks

## 1. Step 1 (Zero Behavior Change): Pure State Extraction

- [x] 1.1 Create `src/services/ai/tasks/utils/state-machine-engine.ts` and implement `StateMachineEngine` class ensuring taskType dependency rules.
- [x] 1.2 Create `src/services/ai/tasks/utils/prompt-policy.ts` and extract string generation functions (`getWorkingLoopPrompt`, `getToolErrorPrompt`, etc).
- [x] 1.3 Refactor `task-runner.ts` to instantiate `StateMachineEngine` and replace hardcoded switch checks (`isValidTransition`).
- [x] 1.4 Refactor `task-runner.ts` to call `PromptPolicy` for all generated strings (Missing Paragraphs, Error Prompts, Status updates).
- [x] 1.5 Run existing automated test suite to ensure Step 1 is completely green.

## 2. Step 2 (The Dispatcher Swap): Tool Handlers & Execution

- [x] 2.1 Create `src/services/ai/tasks/utils/tool-dispatcher/index.ts` with `ToolExecutionResult` and `ToolHandler` interfaces.
- [x] 2.2 Create `handlers/translation-batch-handler.ts` bridging `add_translation_batch` tools and returning deduplicated IDs internally via the new contract.
- [x] 2.3 Create `handlers/write-tools-handler.ts` implementing the state allowance logic (allowing only in `review/preparing` and rejecting/counting in `working`, blocking elsewhere).
- [x] 2.4 Create `handlers/status-update-handler.ts`.
- [x] 2.5 Refactor `task-runner.ts` logic `processToolCalls` to iterate array and call the `ToolDispatcher`, handling the precise Golden Transcript invariant of appending `assistant` -> multiple `tool` -> grouped `user` response sequentially.
- [x] 2.6 Mock and assert test demonstrating the Golden Transcript sequence on multi-tool returns.

## 3. Step 3 (Stream Adapter, Instrumentation & Cleanup)

- [x] 3.1 Create `src/services/ai/tasks/utils/llm-stream-adapter.ts`. Extract `createWrappedStreamCallback`, AbortController wrap, and error rethrow boundaries (Network Aborts and 4xx/5xx).
- [x] 3.2 Create `src/services/ai/tasks/utils/instrumentation.ts`. Extract metrics counting (`PerformanceMetrics`) and status duration tracking.
- [x] 3.3 Strip out remaining old parsing and variables inside `task-runner.ts`. Collapse the `executeTurn` and `run` down to pure Coordinator structure logic.
- [x] 3.4 Confirm cyclomatic limits: Verify `executeTurn()`/`run()` code limits with a lines-of-code metric or ESLint.
- [x] 3.5 Final Regression run: Assert that specific tests (Brief planning intake, DB-missing review fallback check) execute correctly across the new boundary.
