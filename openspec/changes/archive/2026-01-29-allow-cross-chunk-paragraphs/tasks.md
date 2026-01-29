## 1. Update Paragraph Tools

- [x] 1.1 Remove chunk boundary checks in `get_previous_paragraphs`, `get_next_paragraphs`, and `get_paragraph_position` handlers in `src/services/ai/tools/paragraph-tools.ts`.
- [x] 1.2 Remove `isParagraphInChunk` and `filterResultsByChunkBoundary` usage and (if unused) definitions from `src/services/ai/tools/paragraph-tools.ts`.

## 2. Update Prompts

- [x] 2.1 Update translation prompt in `src/services/ai/tasks/prompts/translation.ts` to instruct AI to focus on the provided chunk while using context tools freely.
- [x] 2.2 Update polishing prompt in `src/services/ai/tasks/prompts/polish.ts` to instruct AI to focus on the provided chunk while using context tools freely.
- [x] 2.3 Update proofreading prompt in `src/services/ai/tasks/prompts/proofreading.ts` to instruct AI to focus on the provided chunk while using context tools freely.
