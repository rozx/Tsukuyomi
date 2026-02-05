## ADDED Requirements

### Requirement: Chapter title update tool

系统 SHALL 提供 `update_chapter_title` 工具，允许 AI 通过 Function Calling 提交章节标题的翻译结果。

#### Scenario: AI 提交章节标题翻译

- **WHEN** AI 调用 `update_chapter_title` 工具
- **THEN** 系统保存章节标题翻译到对应章节
- **AND THEN** 返回成功确认信息

### Requirement: Chapter title parameters

`update_chapter_title` 工具 SHALL 接收并验证必要的参数。

#### Scenario: Valid chapter title update

- **GIVEN** AI 提供 chapter_id、original_title 和 translated_title
- **WHEN** 调用 `update_chapter_title` 工具
- **THEN** 章节标题翻译被保存
- **AND THEN** 返回成功信息

#### Scenario: Missing chapter_id

- **GIVEN** AI 未提供 chapter_id 参数
- **WHEN** 调用 `update_chapter_title` 工具
- **THEN** 返回错误信息："缺少章节 ID"
- **AND THEN** 不保存任何数据

#### Scenario: Missing translated_title

- **GIVEN** AI 未提供 translated_title 参数
- **WHEN** 调用 `update_chapter_title` 工具
- **THEN** 返回错误信息："缺少标题翻译"
- **AND THEN** 不保存任何数据

### Requirement: Chapter existence validation

`update_chapter_title` 工具 SHALL 验证章节是否存在。

#### Scenario: Chapter not found

- **GIVEN** AI 提供的 chapter_id 不存在于当前书籍
- **WHEN** 调用 `update_chapter_title` 工具
- **THEN** 返回错误信息："章节不存在"
- **AND THEN** 不保存任何数据

### Requirement: Title update persistence

`update_chapter_title` 工具保存的标题翻译 SHALL 持久化到数据存储中。

#### Scenario: Title update is persisted

- **GIVEN** AI 成功调用 `update_chapter_title` 工具
- **WHEN** 后续查询该章节信息
- **THEN** 返回的章节对象包含更新的标题翻译
