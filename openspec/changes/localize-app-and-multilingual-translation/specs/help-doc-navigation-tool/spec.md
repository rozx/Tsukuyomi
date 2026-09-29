## MODIFIED Requirements

### Requirement: AI 助手可导航用户到指定帮助文档

下列中文反馈示例 SHALL 作为 zh-CN 文案；其他语言返回等价本地化说明。`doc_id` 和 `section_id` SHALL 为跨语言稳定标识，标题不充当身份。

系统 SHALL 提供 `navigate_to_help_doc` AI 工具，接受 `doc_id`（必填，string）和 `section_id`（可选，string）参数。该工具 SHALL 验证 `doc_id` 在帮助文档索引中存在，并通过 `onAction` 回调触发 UI 导航到对应的帮助文档页面。

#### Scenario: 成功导航到帮助文档

- **WHEN** AI 助手调用 `navigate_to_help_doc`，传入有效的 `doc_id`
- **THEN** 工具返回 `{ success: true, message: "已导航到帮助文档: {title}" }`，并触发 `onAction({ type: 'navigate', entity: 'help_doc', data: { doc_id, doc_title, tool_name: 'navigate_to_help_doc' } })`

#### Scenario: 导航到帮助文档的指定章节

- **WHEN** AI 助手调用 `navigate_to_help_doc`，传入有效的 `doc_id` 和 `section_id`
- **THEN** 工具返回 `{ success: true }` 并触发含 `section_id` 的 navigate action，UI SHALL 导航到 `/help/{docId}#{sectionId}`

#### Scenario: 文档 ID 不存在

- **WHEN** AI 助手调用 `navigate_to_help_doc`，传入不存在的 `doc_id`
- **THEN** 工具返回 `{ success: false, error: "未找到 ID 为 \"{doc_id}\" 的帮助文档" }`，不触发导航

#### Scenario: doc_id 参数为空

- **WHEN** AI 助手调用 `navigate_to_help_doc`，`doc_id` 为空或未提供
- **THEN** 工具返回 `{ success: false, error: "文档 ID 不能为空" }`

#### Scenario: 执行与页面语言不同

- **GIVEN** 英文助手执行读取了指南，用户随后把界面切到繁中
- **WHEN** 助手导航到该文档章节
- **THEN** 页面 SHALL 打开繁中版本对应章节，工具自身反馈仍使用执行的英文
