## ADDED Requirements

### Requirement: Editable webUrl field

EditChapterDialog SHALL 提供一个可编辑的 `webUrl` 输入框，允许用户手动设置、修正或清除章节的网络来源地址。

#### Scenario: Setting webUrl on a local chapter

- **WHEN** 用户在编辑章节对话框中为一个本地章节填入 webUrl 并保存
- **THEN** 该章节 SHALL 被关联到对应的网络来源，后续爬虫对话框中能识别为"已导入"

#### Scenario: Clearing webUrl on an imported chapter

- **WHEN** 用户在编辑章节对话框中清空 webUrl 并保存
- **THEN** 该章节的 `webUrl` SHALL 被设为 `undefined`，成为纯本地章节

#### Scenario: Correcting webUrl

- **WHEN** 用户在编辑章节对话框中修改 webUrl 为新地址并保存
- **THEN** 章节的 `webUrl` SHALL 更新为新地址，之前的关联 SHALL 被解除

### Requirement: Read-only date statistics display

EditChapterDialog SHALL 展示章节的日期统计信息，包括网站更新时间、本地编辑时间和创建时间，均为只读。

#### Scenario: Chapter with all dates available

- **WHEN** 打开编辑章节对话框，且章节具有 `lastUpdated`、`lastEdited` 和 `createdAt`
- **THEN** 对话框 SHALL 显示所有三个日期的格式化文本

#### Scenario: Chapter without lastUpdated

- **WHEN** 打开编辑章节对话框，且章节的 `lastUpdated` 为空（如手动创建的章节）
- **THEN** 网站更新时间字段 SHALL 显示 "—" 或不显示

#### Scenario: Date format

- **WHEN** 任何日期字段被展示
- **THEN** 日期 SHALL 以 `YYYY-MM-DD HH:mm` 的可读格式展示
