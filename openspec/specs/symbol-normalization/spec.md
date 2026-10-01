# symbol-normalization Specification

## Purpose
This capability defines how translation text symbols are normalized to ensure consistent formatting in the output.

## Requirements

### Requirement: Dash normalization

The system SHALL normalize dash characters according to Chinese typographic conventions only for zh-CN/zh-TW translation output when normalization is enabled:

- Single em dash (—) or en dash (–) SHALL be converted to double em dash (——)
- Two or more consecutive dashes SHALL be preserved as-is

#### Scenario: Single em dash is converted

- **WHEN** the text contains "—" (1 em dash)
- **THEN** the normalized text SHALL be "——" (converted to 2 em dashes)

#### Scenario: Single en dash is converted

- **WHEN** the text contains "–" (1 en dash)
- **THEN** the normalized text SHALL be "——" (converted to 2 em dashes)

#### Scenario: Two dashes are preserved

- **WHEN** the text contains "——" (2 em dashes)
- **THEN** the normalized text SHALL be "——" (2 em dashes preserved)

#### Scenario: Three or more dashes are preserved

- **WHEN** the text contains "————" (4 em dashes)
- **THEN** the normalized text SHALL be "————" (4 em dashes preserved)

#### Scenario: Three or more en dashes are preserved

- **WHEN** the text contains "––––" (4 en dashes)
- **THEN** the normalized text SHALL be "––––" (4 en dashes preserved)

#### Scenario: English punctuation is preserved

- **GIVEN** the selected translation is en-US and symbol normalization is enabled
- **WHEN** displaying or exporting a sentence containing an em dash, ASCII punctuation and English quotes
- **THEN** the system MUST NOT convert it to Chinese double dashes, full-width punctuation or Chinese quotation marks

#### Scenario: Original-text fallback

- **WHEN** a missing target translation causes original text to be displayed or exported
- **THEN** Chinese translation symbol normalization MUST NOT rewrite that original text

### Requirement: 译名写入的标点处理遵循目标语言

手动编辑、数据导入和 AI 工具写入术语、角色及别名译名时，系统 SHALL 按写入目标语言处理标点；英文 MUST NOT 在持久化前被转换成中文引号、全角标点或中文破折号。该要求 SHALL 覆盖写入与后续重载，不能仅在显示时修正。简繁译名继续采用对应的已有规范化行为。

#### Scenario: 手动保存英文姓名

- **WHEN** 用户在英文目标下保存 `Dr. Smith` 或包含英文成对引号的译名
- **THEN** 持久化数据与重载结果 SHALL 保留英文句点、引号和其他英文标点

#### Scenario: AI 保存英文术语和别名

- **WHEN** AI 工具在英文目标执行中创建或修改术语、角色或别名译名
- **THEN** 保存结果 SHALL 遵循相同的英文标点规则，不被工具或服务层的中文规范化再次改写
