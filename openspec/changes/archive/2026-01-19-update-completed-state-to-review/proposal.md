# Change: 将 `completed` 状态重命名为 `review`（AI 任务状态机 + UI 任务状态）

## Why

当前翻译相关 AI 任务的执行状态机使用 `planning → working → completed → end`。

其中 `completed` 阶段的语义更接近“复核/验证/补齐缺失内容”，与英文单词 `completed`（已完成）存在直觉偏差；这也容易导致模型在“验证阶段”仍输出内容、或误以为任务已经结束。

将该阶段重命名为 `review`（复核）可以更准确地表达意图，提升提示词可读性与模型遵循度。

## What Changes

- 将 **AI 任务 JSON `status` 状态机**中的 `completed` 状态重命名为 `review`
  - translation：状态机变更为 `planning → working → review → end`
  - polish / proofreading：维持 `planning → working → end`（并继续禁用中间验证阶段）
- **不提供兼容旧值 `completed`**
  - 当 AI 输出 `{"status":"completed"}` 时，系统 MUST 视为无效状态并要求改为 `{"status":"review"}`
- 更新提示词与文档，避免出现 `completed`
- 将 **UI 层任务状态**中的 `completed` 重命名为 `review`
  - 影响 `AIProcessingTask.status` 的类型、UI 展示与 IndexedDB 历史数据
  - 迁移策略：读取历史数据时，将旧值 `completed` 映射为新值 `review`（一次性迁移/回写或读取时转换）

## Impact

- Affected specs:
  - 更新 capability：`ai-task-state-machine`
  - 新增 capability：`ai-processing-task-status`
- Affected code (预计实现阶段修改/新增):
  - `src/services/ai/tasks/utils/ai-task-helper.ts`
    - 状态值校验与纠错（`completed` → `review`）
    - 状态转换校验与引导文案（`planning → working → review → end`）
  - `src/services/ai/tasks/prompts/index.ts`
    - `getExecutionWorkflowRules()` 及相关规则文本
  - `src/__tests__/ai-task-helper.executeToolCallLoop.test.ts`
    - 覆盖/更新状态纠错与状态转换测试
  - `docs/TRANSLATION_AI_TASK_FLOW.md`（如该文档仍描述旧状态）
  - `src/stores/ai-processing.ts`
    - UI 任务状态枚举：`completed` → `review`
    - 历史数据迁移/兼容读取
  - `src/components/ai/ThinkingProcessPanel.vue`
  - `src/components/novel/TranslationProgress.vue`

## Open Questions

- UI 状态 `review` 的展示文案采用“复核/已复核”（例如状态标签显示“已复核”，历史分组标题显示“已复核的任务”）

