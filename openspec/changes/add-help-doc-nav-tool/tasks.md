## 1. AI 工具实现

- [x] 1.1 在 `src/services/ai/tools/help-docs-tools.ts` 中添加 `navigate_to_help_doc` 工具定义，包含 `doc_id`（必填）和 `section_id`（可选）参数
- [x] 1.2 实现工具 handler：校验 `doc_id` 非空、通过 `fetchHelpIndex()` 验证文档存在、触发 `onAction({ type: 'navigate', entity: 'help_doc', data: { doc_id, doc_title, section_id?, tool_name } })`
- [x] 1.3 处理错误情况：`doc_id` 为空返回错误、文档不存在返回错误、索引加载失败返回错误

## 2. UI 导航处理

- [x] 2.1 在 `src/composables/chat/useChatActionHandler.ts` 的 `handleAction` 中新增 `entity === 'help_doc'` 的导航分支，使用 `router.push('/help/{doc_id}')` 或 `router.push('/help/{doc_id}#{section_id}')` 执行跳转
- [x] 2.2 在 `src/components/layout/ChatActionBadge.vue` 中为 `{ type: 'navigate', entity: 'help_doc' }` 类型的 action 添加渲染逻辑，显示文档标题并支持点击跳转
- [x] 2.3 在 `src/utils/action-info-utils.ts` 中扩展导航操作的详情渲染逻辑，支持 `help_doc` 实体的标签和详细信息展示

## 3. 验证

- [x] 3.1 运行 `bun run lint` 确保无代码规范问题
- [x] 3.2 运行 `bun run type-check` 确保无类型错误
