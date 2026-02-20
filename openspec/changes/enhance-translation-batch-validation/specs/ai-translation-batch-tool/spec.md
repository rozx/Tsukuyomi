## MODIFIED Requirements

### Requirement: Batch operation parameters

`add_translation_batch` 工具 SHALL 接收包含多个段落处理结果的数组，且每个条目 MUST 使用 `paragraph_id` 标识目标段落，并提供 `original_text_prefix` 用于防错位校验。

#### Scenario: Valid batch submission with paragraph IDs and prefix

- **GIVEN** AI 提供包含 `paragraph_id`、`original_text_prefix`、`translated_text` 的对象数组
- **WHEN** 调用 `add_translation_batch` 工具
- **THEN** 所有符合验证（含前缀匹配）的段落翻译被保存
- **AND THEN** 返回成功信息，包含处理的段落数量

#### Scenario: Missing paragraph_id

- **GIVEN** 批次中某个段落对象缺少 `paragraph_id`
- **WHEN** 调用 `add_translation_batch` 工具
- **THEN** 返回错误信息："必须提供 paragraph_id"
- **AND THEN** 该工具调用直接验证失败

#### Scenario: Missing original_text_prefix

- **GIVEN** 批次中某个段落对象缺少 `original_text_prefix`
- **WHEN** 调用 `add_translation_batch` 工具
- **THEN** 返回错误信息："必须提供 original_text_prefix"
- **AND THEN** 该段落被标记为验证失败，但不影响其他正确段落的保存

#### Scenario: Legacy index-only payload is rejected

- **GIVEN** 批次中某个段落对象仅提供 `index` 而未提供 `paragraph_id`
- **WHEN** 调用 `add_translation_batch` 工具
- **THEN** 返回错误信息："不再支持 index，请改用 paragraph_id"
- **AND THEN** 该工具调用直接验证失败

### Requirement: Batch atomicity

FROM: Batch atomicity
TO: Batch partial success handling

`add_translation_batch` 工具 SHALL 支持批次的部分成功处理，允许在部分段落验证失败的情况下保存成功的段落。

#### Scenario: Partial batch save

- **GIVEN** 批次包含多个段落提交
- **WHEN** 其中部分段落验证失败（如缺失引号或长度异常）
- **THEN** 验证通过的段落翻译被成功保存
- **AND THEN** 返回的成功结果中，包含 `failed_paragraphs` 列表，明确指出哪些段落失败及原因
- **AND THEN** 仅当所有段落都完全结构损坏时，才返回整体工具错误

## ADDED Requirements

### Requirement: Original text prefix validation

系统 SHALL 使用 `original_text_prefix` 进行锚点验证，防止任何 ID 错位导致的翻译覆盖。

#### Scenario: Misaligned submission prevented

- **GIVEN** AI 提交了错位的 `paragraph_id`，但其内部的 `original_text_prefix` 与该 ID 对应的原文前缀不匹配
- **WHEN** 调用 `add_translation_batch` 时验证该段落
- **THEN** 系统拦截该段落的保存操作
- **AND THEN** 在部分失败报告中反馈："原文前缀不匹配"

#### Scenario: Prefix too short

- **GIVEN** 某个段落的 `original_text_prefix` 长度少于 3 个字符（trim 后）
- **WHEN** 调用 `add_translation_batch` 时验证该段落
- **THEN** 该段落被标记为验证失败
- **AND THEN** 在部分失败报告中反馈："原文前缀长度不足（最少 3 个字符）"
- **AND THEN** 不影响其他段落的正常保存
