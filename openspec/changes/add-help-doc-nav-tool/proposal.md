## Why

当用户在聊天助手中询问使用方法或功能相关问题时，AI 虽然能通过 `search_help_docs` / `get_help_doc` 获取帮助文档内容并回答，但无法主动将用户导航到对应的帮助页面。用户需要手动前往帮助中心查找相关文档，体验割裂。新增 `navigate_to_help_doc` 工具可以让 AI 助手在回答问题后直接引导用户跳转到相关文档页面及具体章节，实现"问答 + 导航"的一体化体验。

## What Changes

- 新增 AI 工具 `navigate_to_help_doc`：接受 `doc_id`（必填）和 `section_id`（可选，用于锚点定位），触发 UI 导航到帮助文档页面的指定位置
- 该工具仅在聊天助手上下文中可用（复用现有的 `getAssistantTools()` 分发机制）
- 在 UI 层处理 `navigate` + `help_doc` 类型的 action，执行路由跳转 `/help/{docId}#{sectionId}`

## Capabilities

### New Capabilities

- `help-doc-navigation-tool`: AI 聊天助手专用的帮助文档导航工具，支持导航到指定文档及其内部章节锚点

### Modified Capabilities

<!-- 无需修改现有 spec 的需求层行为 -->

## Impact

- **代码变更**: `src/services/ai/tools/help-docs-tools.ts`（新增工具定义）、`src/services/ai/tools/index.ts`（无需变更，工具已通过 `helpDocsTools` 数组自动注册）
- **UI 层**: 需要在聊天助手的 action 处理逻辑中增加对 `{ type: 'navigate', entity: 'help_doc' }` 的路由跳转处理
- **类型**: `ActionInfo` 的 `entity` 已包含 `'help_doc'`，`type` 已包含 `'navigate'`，无需扩展类型定义
- **依赖**: 无新增外部依赖
