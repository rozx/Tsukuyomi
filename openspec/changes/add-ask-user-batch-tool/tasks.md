## 1. Implementation

- [x] 1.1 扩展 AI 工具：新增 `ask_user_batch`
  - [x] 在 `src/services/ai/tools/ask-user-tools.ts` 增加第二个 tool definition（`ask_user_batch`）
  - [x] 参数：`questions: Array<{ question: string; suggested_answers?: string[]; allow_free_text?: boolean; placeholder?: string; submit_label?: string; cancel_label?: string; max_length?: number }>`
  - [x] 返回：`JSON.stringify({ success: true, answers: [...], cancelled?: boolean })`（取消时 `success:false + cancelled:true + answers` 返回 partial answers）

- [x] 1.2 UI 桥接：提供批量问答 Promise 接口
  - [x] 在 `MainLayout.vue` 注册 `window.__lunaAskUserBatch`
  - [x] `ask_user` 与 `ask_user_batch` 共用同一个队列机制，避免并发弹窗

- [x] 1.3 Store：支持单题/多题队列项
  - [x] 扩展 `src/stores/ask-user.ts`：新增批量 payload/result 类型，并提供 `askBatch()`
  - [x] 队列策略：任意时刻最多显示一个 AskUserDialog；批量作为一个队列项处理
  - [x] 取消策略：中途取消时返回已答部分（partial answers），并提供 `question_index` 映射回原问题

- [x] 1.4 AskUserDialog：多题模式交互
  - [x] 在 `src/components/dialogs/AskUserDialog.vue` 增加 batch UI
  - [x] Stepper（一题一屏）：支持上一题/下一题、完成提交、取消
  - [x] 候选答案与自由输入行为与单题保持一致

- [x] 1.5 与“跳过 AI 追问”设置协同
  - [x] `src/services/ai/tools/index.ts`：当书籍开启跳过追问时，从翻译相关任务 tools 列表中移除 `ask_user_batch`
  - [x] `ask_user_batch` handler：开启跳过追问时，直接返回等价 `cancelled:true`

- [x] 1.6 Action 记录与摘要
  - [x] 在 action 记录中支持批量问答（记录问题列表 + answers/partial answers）
  - [x] 上下文摘要可展示批量问答信息（右侧面板摘要增加批量预览，详情增加逐题展示）

## 2. Tests

- [x] 2.1 单元测试：批量问答 store 行为
  - [x] 批量作为一个队列项处理，流程完成后一次性 resolve
  - [x] 取消时返回 partial answers（含 `question_index`）覆盖测试

- [x] 2.2 单元测试：工具 handler 在无 UI 桥接时的降级行为
  - [x] `window.__lunaAskUserBatch` 不存在时返回明确错误
  - [x] `skipAskUser=true` 时直接 cancelled 且不依赖 UI

## 3. Validation

- [x] 3.1 运行 `bun run lint`
- [x] 3.2 运行 `bun run type-check`
- [x] 3.3 运行 `bun test`

