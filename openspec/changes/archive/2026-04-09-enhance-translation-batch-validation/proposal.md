## Why

The current translation batch processing logic is "all-or-nothing" - if a single paragraph fails validation (e.g., mismatched quotes), the entire batch is rejected. When the AI attempts to fix the error and resubmit, it often experiences "alignment loss" (context misalignment), accidentally pairing the wrongly shifted translated text with the original paragraph IDs. This results in the wrong translation overwriting existing paragraphs. We need to introduce a "partial success" mechanism to reduce the AI's cognitive load and a prefix anchor check to physically prevent misaligned translations from being saved.

## What Changes

- **Implement Partial Success Mechanism**: Allow valid paragraphs within a batch to be saved even if other paragraphs in the same batch fail validation.
- **Return Detailed Error Reports**: Send back a structured error response that explicitly states which paragraphs succeeded and which failed (with specific reasons), guiding the AI to only retry the failed ones.
- **Introduce Original Text Prefix Anchor**: Add a new `original_text_prefix` parameter to the batch submission tool.
- **Enforce Prefix Validation**: Before saving any translation, verify that the target paragraph's original text starts with the provided `original_text_prefix`. Reject the specific paragraph if it doesn't match, permanently preventing ID/Content misalignment.
- **BREAKING**: The response format of `add_translation_batch` will change to support partial success indicating which paragraphs were accepted and which need retry.
- **BREAKING**: The arguments for `add_translation_batch` will require `original_text_prefix` for each item.

## Capabilities

### New Capabilities

<!-- Leave empty if no new capabilities -->

### Modified Capabilities

- `ai-translation-batch-tool`: Tool schema needs to require `original_text_prefix` and response format needs to support partial success, clearly delineating successful and failed items.
- `translation-batch-save`: Batch saving logic must validate the `original_text_prefix` against the database source text before processing each paragraph and support saving only the valid subset.

## Impact

- `src/services/ai/tools/translation-tools.ts`: Tool definition schema and batch processing logic will be heavily modified.
- `src/services/ai/tasks/utils/task-runner.ts`: Task runner 已有 `extractParagraphsFromBatchToolCall` 可正确解析 `accepted_paragraphs`，改动较小：主要是 `captureToolCallResult` 需要记录 `failed_paragraphs` 信息以提升可观测性。
- LangGraph task retry loops and prompts 不需要修改——已有的 `verifyParagraphCompleteness` 会自动捕获部分失败遗漏的段落并驱动 AI 重试。
