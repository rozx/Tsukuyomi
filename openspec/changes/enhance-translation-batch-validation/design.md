## Context

Currently, the `add_translation_batch` tool processes translations in batches. If any single paragraph within a batch fails a validation check (e.g., missing quotation marks or length anomalies), the entire tool call returns `success: false` with an error message. When the AI attempts to retry and fix the specific paragraph, it often loses track of the paragraph alignment, resulting in mismatching the `paragraph_id` of one paragraph with the translated text of another. This "alignment loss" corrupts previously good translations because the system blindly trusts the ID provided by the AI.

## Goals / Non-Goals

**Goals:**

- Eliminate the possibility of a translated text being assigned to the wrong `paragraph_id` during a batch submission.
- Reduce the cognitive load on the AI by allowing valid paragraphs in a batch to succeed even if others fail (Partial Success).
- Provide explicit, actionable feedback to the AI about exactly which paragraphs succeeded and which failed so it can fix only the failed ones.

**Non-Goals:**

- Changing the LangGraph task loop structure intrinsically; we simply want the tool to respond better.
- Modifying the AI prompt substantially, aside from explaining the requirement for the new `original_text_prefix` parameter.

## Decisions

**1. Introduce `original_text_prefix` as an Anchor**

- **Decision**: Add a new required parameter `original_text_prefix` (e.g., first 5-10 chars of the original Japanese text) to each item in the `paragraphs` array.
- **Rationale**: By enforcing that `original_text_prefix` matches the start of the target paragraph in the database, we physically block misaligned payload submissions. Even if the AI hallucinated the wrong `paragraph_id`, the prefix check will fail, and the overwrite will be prevented.
- **Alternative Considered**: Trying to use approximate string matching or length heuristics. Discarded because heuristics can be bypassed by edge cases, whereas a strict prefix check is deterministic.

**2. Implement Partial Success in `processTranslationBatch`**

- **Decision**: Instead of failing the entire batch when a validation error occurs (like missing quotes), we will filter out the invalid items, push their errors to a `failed_paragraphs` or `warnings` list, and still save the valid items.
- **Rationale**: If the tool returns a complete failure, the AI attempts to regenerate the whole batch, increasing the chance of alignment loss. If we save the valid ones and only report the invalid ones, the AI only needs to fix the specific rejected paragraphs in its next action.
- **Behavior Change**:
  - `validationErrors` handling will change: rather than returning immediately with `success: false`, the tool will add the valid paragraphs to `acceptedIds` and format the response to report BOTH the successes and the isolated failures.
  - **Three-tier response semantics**:
    - **全部成功** → `success: true`，无 `failed_paragraphs` 字段
    - **部分成功** → `success: true`，附带 `failed_paragraphs` 列表（关键：`extractParagraphsFromBatchToolCall` 已基于 `success` 判断是否提取 `accepted_paragraphs`，因此保持 `success: true` 可确保已通过验证的段落被正确提取和保存）
    - **全部失败** → `success: false`（仅当批次中所有段落均未通过验证时）

**3. Structural vs Content Validation Distinction**

- **Decision**: `paragraph_id` 缺失导致整个工具调用直接失败（hard fail），而 `original_text_prefix` 缺失仅导致该段落被标记为验证失败（soft fail），不影响其他段落。
- **Rationale**: `paragraph_id` 是条目的结构标识，缺失意味着无法确定该条目对应哪个段落，属于数据完整性问题，无法进行任何「部分处理」。而 `original_text_prefix` 是内容级校验参数，某个条目缺失不影响其他条目的独立校验和保存。
- **Implication**: 实现时需要区分这两层验证：`validateBatchArgs`（结构验证，hard fail）在 `processTranslationBatch`（内容验证，soft fail per item）之前执行。

## Risks / Trade-offs

- **Risk**: AI might struggle to extract the exact `original_text_prefix`, especially with leading whitespace or weird punctuation.
  - **Mitigation**: Provide clear instructions in the tool description. When validating computationally, we will apply `.trim()` to both the database text and the user-provided prefix to loosen formatting strictness while maintaining alignment security. Allow a generous max length (e.g., up to 20 chars) but validate only what is provided (min 3 chars).
- **Risk**: Returning `success: true` with failed items might confuse the AI into thinking the entire task is done.
  - **Mitigation**: Ensure the result message explicitly lists the failed items and instructs the AI to fix them. The existing LangGraph completeness check (`verifyParagraphCompleteness`) will already catch any missing translations and force the AI to retry them, so this is fully covered by existing architecture.
- **Risk**: Task runner (`task-runner.ts`) adaptation scope may be overestimated.
  - **Note**: `extractParagraphsFromBatchToolCall` already prioritizes `accepted_paragraphs` from the tool response and handles the canonical extraction path correctly. The actual required change in `task-runner.ts` is minimal — primarily `captureToolCallResult` should log `failed_paragraphs` for observability. No structural changes to the extraction logic are needed.
