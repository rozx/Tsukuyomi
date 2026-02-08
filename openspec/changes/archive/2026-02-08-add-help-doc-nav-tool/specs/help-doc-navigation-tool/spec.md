## ADDED Requirements

### Requirement: AI 助手可导航用户到指定帮助文档

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

### Requirement: 工具仅在聊天助手上下文中可用

`navigate_to_help_doc` 工具 SHALL 仅通过 `ToolRegistry.getAssistantTools()` 提供，不 SHALL 出现在翻译、润色、校对等其他 AI 任务的工具集中。

#### Scenario: 助手可使用帮助文档导航工具

- **WHEN** 调用 `ToolRegistry.getAssistantTools()`
- **THEN** 返回的工具列表中 SHALL 包含 `navigate_to_help_doc`

#### Scenario: 翻译任务不包含帮助文档导航工具

- **WHEN** 调用 `ToolRegistry.getTranslationTools()` 或 `ToolRegistry.getAllTools()`
- **THEN** 返回的工具列表中 SHALL 不包含 `navigate_to_help_doc`

### Requirement: UI 处理帮助文档导航 action

`useChatActionHandler` SHALL 处理 `{ type: 'navigate', entity: 'help_doc' }` 类型的 action，使用 Vue Router 导航到 `/help/{doc_id}`。如果 action 数据中包含 `section_id`，SHALL 附加 `#{section_id}` 作为 URL hash。

#### Scenario: 收到帮助文档导航 action

- **WHEN** `handleAction` 接收到 `{ type: 'navigate', entity: 'help_doc', data: { doc_id: 'ai-models-guide' } }`
- **THEN** 调用 `router.push('/help/ai-models-guide')`

#### Scenario: 收到含章节锚点的帮助文档导航 action

- **WHEN** `handleAction` 接收到含 `section_id: 'openai-配置'` 的帮助文档导航 action
- **THEN** 调用 `router.push('/help/ai-models-guide#openai-配置')`

### Requirement: ChatActionBadge 渲染帮助文档导航操作

`ChatActionBadge` SHALL 为 `{ type: 'navigate', entity: 'help_doc' }` 类型的 action 渲染可识别的操作标签，显示文档标题，并支持点击跳转。

#### Scenario: 显示帮助文档导航标签

- **WHEN** 聊天消息包含帮助文档导航 action
- **THEN** 渲染包含文档标题的导航标签（如"查看: AI 模型配置指南"），点击后执行相同的路由跳转
