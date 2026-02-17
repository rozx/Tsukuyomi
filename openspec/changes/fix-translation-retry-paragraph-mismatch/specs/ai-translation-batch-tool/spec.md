## MODIFIED Requirements

### Requirement: Translation batch submission tool

系统 SHALL 提供 `add_translation_batch` 工具，允许 AI 通过 Function Calling 批量提交段落翻译、润色或校对结果。

#### Scenario: AI 批量提交翻译结果

- **WHEN** AI 调用 `add_translation_batch` 工具提交多个段落翻译
- **THEN** 系统批量保存所有翻译结果
- **AND THEN** 返回成功确认信息，MUST 包含 `processed_count`
- **AND THEN** 返回结果 MUST 包含 `accepted_paragraphs`，用于标识本次被系统接受的段落集合
- **AND THEN** `accepted_paragraphs` 的每个条目 MUST 包含 `paragraph_id` 与 `translated_text`

## ADDED Requirements

### Requirement: Structured error payload for invalid batch submission

当 `add_translation_batch` 参数校验失败时，系统 SHALL 在保留可读错误信息的同时返回机器可读错误字段，供模型重试时精确修复。

#### Scenario: Missing paragraph_id returns machine-readable diagnostics

- **GIVEN** 批次中某个段落对象缺少 `paragraph_id`
- **WHEN** 调用 `add_translation_batch` 工具
- **THEN** 返回 `success: false` 且包含可读错误信息
- **AND THEN** 返回结果 MUST 包含 `error_code` 与 `invalid_items`
- **AND THEN** `invalid_items` MUST 标识出错条目的位置与原因

#### Scenario: Out-of-range paragraph IDs return machine-readable rejected IDs

- **GIVEN** AI 提交了不在当前任务范围内的 `paragraph_id`
- **WHEN** 调用 `add_translation_batch` 工具
- **THEN** 返回 `success: false` 且包含可读错误信息
- **AND THEN** 返回结果 MUST 包含 `error_code` 与 `invalid_paragraph_ids`
- **AND THEN** `invalid_paragraph_ids` MUST 包含全部被拒绝的段落 ID
