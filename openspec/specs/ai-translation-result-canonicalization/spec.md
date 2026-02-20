## ADDED Requirements

### Requirement: Canonical accepted items drive translation application

任务执行链路 SHALL 将 `add_translation_batch` 成功返回中的 `accepted_paragraphs` 视为段落应用与完成度推进的权威来源。

#### Scenario: Apply only canonical accepted paragraphs on successful submission

- **GIVEN** 当前 chunk 期望处理多个段落
- **WHEN** `add_translation_batch` 返回 `success: true` 且包含 `accepted_paragraphs`
- **THEN** 系统仅按 `accepted_paragraphs` 中的 `paragraph_id` 应用翻译结果
- **AND THEN** 系统仅按该列表推进已提交段落集合与完成度统计

#### Scenario: Backward-compatible fallback when canonical list is absent

- **GIVEN** `add_translation_batch` 返回 `success: true` 但未包含 `accepted_paragraphs`
- **WHEN** 任务执行层处理本次工具结果
- **THEN** 系统 MUST 使用兼容回退路径从当前工具参数提取段落映射
- **AND THEN** 该回退行为 MUST 保持与现有流程一致，不得中断任务

### Requirement: Failed submission does not advance completion state

当 `add_translation_batch` 返回失败时，系统 SHALL 保持段落完成状态不变，不得将失败批次计为已提交。

#### Scenario: Validation failure in batch submission

- **GIVEN** AI 提交批次中存在缺失或无效 `paragraph_id`
- **WHEN** `add_translation_batch` 返回 `success: false`
- **THEN** 系统不得更新段落翻译映射
- **AND THEN** 系统不得更新 `submittedParagraphIds` 或完成段落计数
