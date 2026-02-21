## ADDED Requirements

### Requirement: Prefix length validation window guarantee

`add_translation_batch` 工具在校验 `original_text_prefix` 长度时，SHALL 保证合法前缀长度窗口（最小长度 ~ 最大长度）足够宽。当按比例计算的窗口宽度不足时，系统 SHALL 自动放宽最大长度为原文全长。

#### Scenario: Short text with narrow validation window allows full original text as prefix

- **WHEN** AI 提交的 `original_text_prefix` 等于原文全文
- **AND** 原文为非符号文本且按比例计算的合法前缀长度窗口宽度小于 2 个字符
- **THEN** 系统 SHALL 接受该前缀（不触发 `ORIGINAL_TEXT_PREFIX_TOO_LONG`）

#### Scenario: Long text with sufficient window still rejects over-length prefix

- **WHEN** AI 提交的 `original_text_prefix` 长度超过 `max(3, floor(原文长度 * 0.8))` 且不等于原文全文
- **AND** 原文按比例计算的合法前缀长度窗口宽度大于等于 2 个字符
- **THEN** 系统 SHALL 拒绝该前缀并返回 `ORIGINAL_TEXT_PREFIX_TOO_LONG` 错误

### Requirement: Prefix validation as independent function

前缀长度校验逻辑 SHALL 封装为独立的 helper 函数，接收前缀字符串和原文字符串，返回校验结果。

#### Scenario: Helper function returns validation result

- **WHEN** 调用前缀长度校验 helper 函数
- **THEN** 返回结果 SHALL 包含校验是否通过
- **AND** 校验失败时 SHALL 包含具体的错误码（`ORIGINAL_TEXT_PREFIX_TOO_SHORT` 或 `ORIGINAL_TEXT_PREFIX_TOO_LONG`）
