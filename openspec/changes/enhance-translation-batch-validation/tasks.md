## 1. Tool Definitions and Types Update

- [x] 1.1 Update `TranslationBatchItem` and `AddTranslationBatchArgs` types in `translation-tools.ts` to require `original_text_prefix`.
- [x] 1.2 Update `BatchErrorCode` and `ERROR_MESSAGES` to include explicit prefix mismatch and partial success states.
- [x] 1.3 Modify the JSON schema definition for `add_translation_batch` to enforce `original_text_prefix` (with appropriate description about length and usage).

## 2. Implement Prefix Validation and Partial Success in Batch Tool

- [x] 2.1 Refactor `processTranslationBatch` to trim and compare `original_text_prefix` with `paragraph.text.startsWith`.
- [x] 2.2 Alter the validation loop inside `processTranslationBatch` so it accumulates valid items into an `acceptedItems` array while pushing invalid ones and their errors into a `failedItems` array, instead of failing the whole batch instantly.
- [x] 2.3 Modify the tool's main handler function to parse the new return structure from `processTranslationBatch` and return a JSON string containing `success: true` (most cases), `processed_count`, `accepted_paragraphs`, and `failed_paragraphs` (with specific error context).

## 3. Update AI Task Runner

- [x] 3.1 Verify `task-runner.ts` `extractParagraphsFromBatchToolCall` correctly handles partial success responses（已有逻辑优先解析 `accepted_paragraphs`，预期无需大改，仅需确认部分成功场景下 `success: true` + `failed_paragraphs` 的解析路径正确）。
- [x] 3.2 Update `captureToolCallResult` to log `failed_paragraphs` count and details when present in a partial success response, ensuring visibility into per-paragraph validation failures.

## 4. Verification

- [x] 4.1 Create or update unit tests to verify that a batch with a mix of valid, invalid, and prefix-mismatched paragraphs correctly saves the valid ones and reports the failures.
- [x] 4.2 Verify in an end-to-end run that if the AI hallucinates a mismatched `paragraph_id` and wrong `original_text_prefix`, the database strictly rejects it and the system doesn't crash.
