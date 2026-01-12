# Change: 添加「AI 向用户提问」工具（全屏问答对话框）

## Why

当前 AI 工具体系支持读取/写入数据、导航、网络搜索等，但当 AI 遇到**信息缺失/决策需要用户偏好**时，只能在聊天里“问一句”，无法以结构化方式获取答案并继续工具链流程（尤其是需要用户在多个选项中快速选择时）。

本变更引入一个 **AI Tool：`ask_user`**，允许 AI 发起一个**全屏、强提示、可选择预设答案且支持自由输入**的问答对话框，并将用户答案作为工具结果返回给 AI，从而继续后续推理/执行。

## What Changes

- 新增 AI 工具：`ask_user`
  - AI 调用该工具时，UI 弹出**全屏对话框**展示问题
  - 对话框展示 AI 预生成的若干候选答案（按钮/列表形式）
  - 同时提供一个“自定义输入”区域，用户可输入任意内容作为答案
  - 用户提交后，工具返回结构化结果（JSON 字符串）给 AI
  - 用户可点击“取消”，工具返回 `cancelled:true` 的结果，由 AI 自行决定后续策略
- 新增一套“工具调用 → UI 对话框 → Promise 结果回传”的桥接机制
  - 优先复用现有模式：在 `MainLayout.vue` 注册全局函数（类似 `window.__lunaToast`）
  - 工具 handler 内通过该桥接机制等待用户回答
- 工具作用域（默认策略）
  - **在翻译相关任务（translation / polishing / proofreading）与 Assistant 对话中均可用**
  - 通过提示词/规则约束工具使用时机，避免高频打断（例如：只有遇到关键歧义/缺失信息时才提问）
- 工具操作记录
  - `ask_user` 的提问与回答将被记录为 action（用于聊天历史与上下文摘要）

## Impact

- Affected specs:
  - 新增 capability：`ai-ask-user-tool`
- Affected code (预计实现阶段修改/新增):
  - `src/services/ai/tools/`：新增 `ask-user-tools.ts` 并注册到 `ToolRegistry`
  - `src/stores/`：新增 `ask-user.ts`（维护对话框状态、队列、Promise 解析）
  - `src/components/dialogs/`：新增全屏对话框组件 `AskUserDialog.vue`
  - `src/layouts/MainLayout.vue`：注册 `window.__lunaAskUser`（或等价接口）
  - `src/components/layout/AppRightPanel.vue`：记录/展示 ask_user 的 action（用于上下文摘要与用户可追溯）

