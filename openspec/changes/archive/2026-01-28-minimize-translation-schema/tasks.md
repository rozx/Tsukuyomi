# Tasks: Minimize Translation Schema

- [x] 1. Update `src/services/ai/tasks/prompts/index.ts` to request minimized JSON keys (`i`, `t`, `p`, `tt`) with integer indices.
- [x] 2. Update `src/services/ai/tasks/translation-service.ts`, `polish-service.ts`, and `proofreading-service.ts` to construct prompts using `[Index]` format instead of `[ID: UUID]`.
- [x] 3. Update `src/services/ai/tasks/utils/ai-task-helper.ts` to parse the new schema format and correctly map integer indices back to paragraph UUIDs using a lookup array.
- [x] 4. Update `src/services/ai/tasks/term-translation-service.ts` to request and parse `{"t": ...}` instead of `{"translation": ...}` if applicable, or keep it consistent with the general schema.
- [x] 5. Verify tests pass.
