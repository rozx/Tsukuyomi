## Context

应用已有完整的帮助文档体系：

- **静态文档**: `public/help/` 下的 Markdown 文件，通过 `index.json` 索引
- **帮助页面**: `HelpPage.vue` 支持 `/help/:docId` 路由和 `#section-id` 锚点定位
- **AI 工具**: `help-docs-tools.ts` 提供 `search_help_docs`、`get_help_doc`、`list_help_docs`（仅助手可用）
- **导航先例**: `navigation-tools.ts` 通过 `onAction({ type: 'navigate', entity: 'chapter'|'paragraph' })` 触发 UI 导航
- **Action 处理**: `useChatActionHandler.ts` 中的 `handleAction` 目前仅处理含 `book_id` 的 navigate action

## Goals / Non-Goals

**Goals:**

- 让 AI 助手能在回答帮助相关问题后，主动将用户导航到对应的帮助文档页面
- 支持导航到文档内的具体章节（锚点定位）
- 复用现有的 action 回调机制和工具注册模式
- 在 `ChatActionBadge` 中正确渲染帮助文档导航操作标签

**Non-Goals:**

- 不修改帮助文档的内容或结构
- 不扩展 `ActionInfo` 类型（现有 `type: 'navigate'` + `entity: 'help_doc'` 已足够）
- 不为翻译/润色/校对等非助手任务提供此工具

## Decisions

### 1. 工具放置位置：追加到 `help-docs-tools.ts`

**方案**: 将 `navigate_to_help_doc` 添加到现有的 `helpDocsTools` 数组中。

**理由**: 该工具与帮助文档紧密相关，且 `helpDocsTools` 已通过 `getAssistantTools()` 注册为助手专用工具，无需修改 `ToolRegistry.getAssistantTools()` 或 `index.ts` 中的任何逻辑。

**替代方案**: 创建独立的 `help-nav-tools.ts` 文件 —— 过度拆分，且需要修改 `index.ts` 注册逻辑。

### 2. 参数设计：`doc_id` + `section_id`

**方案**:

- `doc_id`（必填）: 帮助文档 ID，与 `index.json` 中的 `id` 字段对应
- `section_id`（可选）: 文档内的锚点 ID，用于定位到具体章节

**理由**: `doc_id` 确保导航目标有效；`section_id` 可选以支持精确定位，AI 可通过 `get_help_doc` 获取文档内容后推断出合适的 section 锚点。

### 3. Action 数据结构

```typescript
onAction({
  type: 'navigate',
  entity: 'help_doc',
  data: {
    doc_id: string,
    doc_title: string,
    section_id?: string,
    tool_name: 'navigate_to_help_doc',
  },
});
```

**理由**: 复用现有 `ActionInfo` 类型体系。`doc_title` 用于 UI 显示。`tool_name` 用于 action 标签渲染。

### 4. UI 导航处理：扩展 `useChatActionHandler.ts`

**方案**: 在 `handleAction` 函数中增加对 `entity: 'help_doc'` + `type: 'navigate'` 的判断，使用 `router.push('/help/{docId}#{sectionId}')` 执行跳转。

**理由**: 与现有的章节/段落导航处理逻辑并列，保持一致性。

### 5. ChatActionBadge 渲染

**方案**: 在 `ChatActionBadge.vue` 中为帮助文档导航 action 添加渲染条件，显示文档标题和"查看文档"链接。

**理由**: 让用户在聊天记录中能看到 AI 执行了哪些导航操作，并可点击再次跳转。

## Risks / Trade-offs

- **[锚点 ID 不稳定]** → AI 推断的 section_id 可能与实际渲染的锚点不匹配。缓解：工具仅在 section_id 无效时忽略锚点，仍导航到文档顶部。
- **[文档索引加载失败]** → 工具依赖 `/help/index.json`。缓解：复用 `fetchHelpIndex()` 的错误处理，返回明确的失败信息。
