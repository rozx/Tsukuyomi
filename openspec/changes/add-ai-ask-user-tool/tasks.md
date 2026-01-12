## 1. Implementation

- [x] 1.1 新增 AI 工具定义 `ask_user`
  - [x] 在 `src/services/ai/tools/ask-user-tools.ts` 定义工具 schema（question、suggested_answers、allow_free_text 等）
  - [x] 在 `ToolRegistry` 注册该工具定义，并在 assistant / translation / polish / proofreading 任务中提供

- [x] 1.2 新增 Pinia store：问答队列与 Promise 桥接
  - [x] 新建 `src/stores/ask-user.ts`
  - [x] 支持 enqueue / resolve / reject / cancel / timeout（可先实现 cancel，timeout 作为后续增强）

- [x] 1.3 新增全屏对话框组件
  - [x] 新建 `src/components/dialogs/AskUserDialog.vue`
  - [x] UI 要求：全屏 modal、展示问题、候选答案按钮、自由输入框、提交/取消
  - [x] 交互要求：点击候选答案即提交；自由输入支持回车提交（或按钮提交）

- [x] 1.4 在 `MainLayout.vue` 注册全局桥接函数
  - [x] 注册 `window.__lunaAskUser`，内部调用 store 并返回 Promise
  - [x] 将 `AskUserDialog` 挂载在布局层（确保全局可用）

- [x] 1.5 工具 handler 实现：等待用户回答并返回 tool result
  - [x] handler 调用 `window.__lunaAskUser`（或 context 注入回调）等待结果
  - [x] 返回 `JSON.stringify({ success: true, answer, selected_index? })`
  - [x] 取消/异常返回 `JSON.stringify({ success: false, cancelled?: true, error? })`

- [x] 1.6 Action 记录：将 ask_user 的提问与回答记录到聊天 action
  - [x] 扩展 `ActionInfo` / `MessageAction`（新增 entity 或 tool_name 约定）用于记录问答
  - [x] 在 assistant 聊天 UI 的上下文摘要中展示问答（问题 + 答案摘要）

## 2. Tests

- [x] 2.1 单元测试：store 队列行为
  - [x] enqueue 多个问题时顺序弹出、逐个 resolve
  - [x] cancel 行为返回 cancelled 结果

- [x] 2.2 单元测试：工具 handler 在无 UI 桥接时的降级行为
  - [x] `window` 不存在或 `__lunaAskUser` 不存在时返回明确错误

## 3. Validation

- [x] 3.1 运行 `bun run lint`
- [x] 3.2 运行 `bun run type-check`
- [x] 3.3 运行 `bun test`

