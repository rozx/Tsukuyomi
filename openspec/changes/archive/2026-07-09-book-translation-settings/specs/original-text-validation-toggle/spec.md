## MODIFIED Requirements

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
