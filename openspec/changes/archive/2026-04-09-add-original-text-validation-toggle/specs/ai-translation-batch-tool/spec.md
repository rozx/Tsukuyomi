## MODIFIED Requirements

### Requirement: Batch operation parameters

`add_translation_batch` 工具 SHALL 接收包含多个段落处理结果的数组，且每个条目 MUST 使用 `paragraph_id` 标识目标段落。当书籍的 `enableOriginalTextValidation` 为 `true` 时，`original_text_prefix` 为必填字段；当为 `false` 或 `undefined` 时，`original_text_prefix` 为可选字段。

#### Scenario: Valid batch submission with paragraph IDs

- **GIVEN** AI 提供包含 `paragraph_id`、`translated_text` 的对象数组
- **WHEN** 调用 `add_translation_batch` 工具
- **THEN** 所有段落翻译被保存
- **AND THEN** 返回成功信息，包含处理的段落数量

#### Scenario: Missing paragraph_id

- **GIVEN** 批次中某个段落对象缺少 `paragraph_id`
- **WHEN** 调用 `add_translation_batch` 工具
- **THEN** 返回错误信息："必须提供 paragraph_id"
- **AND THEN** 不保存任何数据（原子性操作）

#### Scenario: Legacy index-only payload is rejected

- **GIVEN** 批次中某个段落对象仅提供 `index` 而未提供 `paragraph_id`
- **WHEN** 调用 `add_translation_batch` 工具
- **THEN** 返回错误信息："不再支持 index，请改用 paragraph_id"
- **AND THEN** 不保存任何数据（原子性操作）

#### Scenario: original_text_prefix optional when validation disabled

- **GIVEN** 书籍的 `enableOriginalTextValidation` 为 `false` 或 `undefined`
- **AND GIVEN** AI 提供的段落未包含 `original_text_prefix` 字段
- **WHEN** 调用 `add_translation_batch` 工具
- **THEN** 系统 SHALL 正常处理该段落，不因缺少前缀而拒绝
