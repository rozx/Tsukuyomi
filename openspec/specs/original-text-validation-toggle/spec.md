# original-text-validation-toggle Specification

## Purpose
TBD - created by archiving change add-original-text-validation-toggle. Update Purpose after archive.
## Requirements
### Requirement: Book-level original text validation toggle

系统 SHALL 在 `Novel` 数据模型中提供 `enableOriginalTextValidation` 字段（`boolean | undefined`），用于控制 `add_translation_batch` 工具是否启用 `original_text_prefix` 校验。当字段值为 `true` 时启用校验，`false` 或 `undefined` 时禁用校验。

#### Scenario: 用户在翻译设置中启用原文校验

- **GIVEN** 用户打开书籍翻译设置（桌面/平板：侧栏「翻译设置」面板；手机：翻译设置底部抽屉的「全局设置」页签）
- **WHEN** 用户开启「原文校验」开关并保存
- **THEN** `Novel.enableOriginalTextValidation` SHALL 被设置为 `true`
- **AND THEN** 后续翻译任务中 `add_translation_batch` 工具 SHALL 启用 `original_text_prefix` 校验

#### Scenario: 用户在翻译设置中禁用原文校验（默认状态）

- **GIVEN** 用户打开书籍翻译设置（桌面/平板：侧栏「翻译设置」面板；手机：翻译设置底部抽屉的「全局设置」页签）
- **WHEN** 「原文校验」开关处于关闭状态（默认）
- **THEN** `Novel.enableOriginalTextValidation` SHALL 为 `false`
- **AND THEN** 后续翻译任务中 `add_translation_batch` 工具 SHALL 跳过 `original_text_prefix` 校验

#### Scenario: 旧版书籍数据无此字段

- **GIVEN** `Novel` 对象的 `enableOriginalTextValidation` 字段为 `undefined`
- **WHEN** 系统读取该设置
- **THEN** 系统 SHALL 将其视为 `false`（禁用校验）

### Requirement: Dynamic tool schema based on validation setting

当 `enableOriginalTextValidation` 禁用时，系统 SHALL 动态修改 `add_translation_batch` 工具的 schema，使 `original_text_prefix` 字段不再标记为 `required`。

#### Scenario: 校验启用时 schema 包含 required original_text_prefix

- **GIVEN** `enableOriginalTextValidation` 为 `true`
- **WHEN** 系统构建 `add_translation_batch` 工具 schema
- **THEN** `required` 数组 SHALL 包含 `'original_text_prefix'`

#### Scenario: 校验禁用时 schema 移除 required original_text_prefix

- **GIVEN** `enableOriginalTextValidation` 为 `false` 或 `undefined`
- **WHEN** 系统构建 `add_translation_batch` 工具 schema
- **THEN** `required` 数组 SHALL NOT 包含 `'original_text_prefix'`

### Requirement: Skip prefix validation when disabled

当 `enableOriginalTextValidation` 禁用时，`add_translation_batch` handler SHALL 跳过所有 `original_text_prefix` 相关验证。

#### Scenario: 禁用时跳过缺失检查

- **GIVEN** `enableOriginalTextValidation` 为 `false`
- **AND GIVEN** AI 提交的段落未包含 `original_text_prefix` 字段
- **WHEN** 调用 `add_translation_batch` 工具
- **THEN** 系统 SHALL NOT 返回 `MISSING_ORIGINAL_TEXT_PREFIX` 错误
- **AND THEN** 正常处理该段落

#### Scenario: 禁用时跳过长度检查

- **GIVEN** `enableOriginalTextValidation` 为 `false`
- **AND GIVEN** AI 提交的段落包含了 `original_text_prefix` 但长度不合规
- **WHEN** 调用 `add_translation_batch` 工具
- **THEN** 系统 SHALL NOT 返回 `ORIGINAL_TEXT_PREFIX_TOO_SHORT` 或 `ORIGINAL_TEXT_PREFIX_TOO_LONG` 错误

#### Scenario: 禁用时跳过前缀匹配检查

- **GIVEN** `enableOriginalTextValidation` 为 `false`
- **AND GIVEN** AI 提交的 `original_text_prefix` 与原文不匹配
- **WHEN** 调用 `add_translation_batch` 工具
- **THEN** 系统 SHALL NOT 返回 `ORIGINAL_TEXT_PREFIX_MISMATCH` 错误

#### Scenario: 启用时保持所有现有校验行为

- **GIVEN** `enableOriginalTextValidation` 为 `true`
- **WHEN** 调用 `add_translation_batch` 工具
- **THEN** 系统 SHALL 执行所有现有的 `original_text_prefix` 校验（缺失、长度、匹配）

