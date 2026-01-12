## Context

项目已存在 AI 工具体系：
- 工具定义集中在 `src/services/ai/tools/*`
- `ToolRegistry.handleToolCall()` 负责解析参数并执行工具 handler
- 工具 handler 可以通过 `ToolContext` 拿到 `onAction` / `onToast` 等回调

同时 UI 已存在全局桥接模式：
- `MainLayout.vue` 将 toast 能力暴露为 `window.__lunaToast`，供工具层回退使用

本变更需要一个“**从工具 handler 发起 UI 对话框并等待用户回答**”的闭环，这比 toast 更复杂（需要异步 Promise、队列、取消与超时策略）。

## Goals / Non-Goals

- Goals
  - 提供一个 AI Tool：`ask_user`，让 AI 能以结构化方式向用户提问并获得回答（按钮选择或自由输入）
  - UI 以**全屏 modal** 形式展示问题，避免用户错过
  - 工具层可 `await` 用户回答并将结果作为 tool result 返回
  - 支持队列：当 AI 连续发起多个 ask 时，按顺序逐个展示与响应
  - `ask_user` 的提问与回答可被记录为 action，供聊天历史与上下文摘要使用

- Non-Goals
  - 不做跨设备/跨会话持久化（问题与答案默认不写入 IndexedDB）
  - 不引入新的 UI 框架/状态管理体系（沿用 Pinia + PrimeVue）

## Decisions

- Decision: 使用“全局函数 + Pinia store”作为工具层与 UI 的桥接
  - 在 `MainLayout.vue` 注册 `window.__lunaAskUser`（名称可调整，但建议与 toast 保持一致命名风格）
  - `window.__lunaAskUser(payload) => Promise<AskUserResult>`
  - 由 `useAskUserStore()` 实现队列、当前显示状态、resolve/reject
  - 工具 handler（`ask_user`）优先使用 `context` 注入的回调（若未来加 `onAskUser`），否则回退到 `window.__lunaAskUser`

- Decision: 工具结果使用 JSON 字符串返回，保持现有工具返回约定
  - `ToolRegistry.handleToolCall()` 当前将 handler 返回值直接填入 `content`
  - 统一返回 `JSON.stringify({ success, ... })`，便于模型解析与后续工具链复用

## Alternatives considered

- 直接用 `onAction` 传递 ask 事件，再由 UI 返回答案
  - 问题：`onAction` 当前是单向事件流，缺乏“回传 Promise 结果”的通道
  - 若要改造 `onAction` 为双向，会波及大量现有工具与 UI 处理逻辑

- 只在右侧 Assistant 面板内以消息形式提问
  - 问题：用户可能错过；且难以提供“候选答案按钮 + 自定义输入 + 强制阻塞继续执行”的交互

## Risks / Trade-offs

- **阻塞工具调用**：`ask_user` 会等待用户输入，可能导致 AI 任务长时间挂起
  - 缓解：支持取消/超时并返回 `cancelled` 状态；UI 提示“AI 正在等待你的回答”

- **并发与队列**：多次 ask 需要排队，避免多个全屏对话框叠加
  - 缓解：store 内置队列，严格一次只显示一个

- **可用性（无 UI 环境）**：单元测试/非浏览器环境可能没有 `window`
  - 缓解：工具 handler 在无桥接可用时返回明确错误：`success:false` + `error:"AskUser UI not available"`

## Migration Plan

- 新增能力，不影响现有工具与 UI；在 assistant 与翻译相关任务中引入 `ask_user`
- 通过提示词/规则约束在翻译任务中仅在关键歧义时提问，避免频繁打断

## Open Questions

- 对话框是否需要“记住我的选择/默认选项”能力（后续可能作为设置项）？

