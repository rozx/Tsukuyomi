# Change: 为当前书籍新增「跳过 AI 追问（ask_user）」设置

## Why

`ask_user` 全屏问答对话框能解决关键歧义，但在批量翻译/润色/校对时也可能造成频繁打断，影响连续工作流（尤其是用户希望“先跑完任务，后统一处理歧义”时）。

需要一个**书籍级别**的开关，让用户可以针对当前书籍选择“跳过 AI 追问”，从而避免 `ask_user` 弹窗阻塞任务执行。

## What Changes

- 在 `ChapterToolbar.vue` 的“翻译设置”弹窗（`ChapterSettingsPopover.vue` 的「全局设置」页签）新增一个开关：
  - 文案建议：`跳过 AI 追问（不弹出问答对话框）`
  - 作用范围：**仅当前书籍**
  - 默认值：关闭（不改变现有行为）
- 当该设置开启时：
  - 在 **translation / polishing / proofreading** 等翻译相关任务中，系统 MUST **不向 AI 提供** `ask_user` 工具（从 tools 列表中移除）
  - 作为兜底防护：若模型仍尝试调用 `ask_user`（例如旧上下文/提示词残留导致），系统应返回一个“可继续执行”的结果（例如等价于 `cancelled:true`），避免 UI 阻塞

## Impact

- Affected specs:
  - 修改 capability：`ai-ask-user-tool`（新增书籍级“跳过 ask_user”要求）
- Affected code (预计实现阶段修改/新增):
  - `src/models/novel.ts`：新增书籍级字段（如 `skipAskUser?: boolean`）
  - `src/components/novel/ChapterSettingsPopover.vue`：新增开关 UI
  - `src/pages/BookDetailsPage.vue`：保存书籍级设置到 IndexedDB（复用现有 updateBook 逻辑）
  - `src/services/ai/tools/ask-user-tools.ts`：按 bookId 设置跳过弹窗/直接返回取消结果（或等效策略）
  - `src/services/ai/tools/index.ts`：翻译相关任务的 tools 构建逻辑在 skipAskUser 开启时移除 `ask_user`
  - `src/services/ai/tasks/utils/ai-task-helper.ts`：在系统提示词/书籍上下文中声明该书籍已开启跳过追问（降低模型调用概率）

