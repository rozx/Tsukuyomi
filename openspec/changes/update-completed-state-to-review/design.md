## Context

翻译相关 AI 任务采用状态机驱动的循环执行，模型通过输出 JSON 字段 `status` 指示当前阶段。
当前状态集合为 `planning|working|completed|end`，其中 `completed` 实际承担“复核/验证/补齐缺失内容”的职责。

同时，UI 层会记录 AI 处理过程与历史任务（`AIProcessingTask.status`），该枚举也包含 `completed`，并会持久化到 IndexedDB。

## Goals / Non-Goals

- Goals
  - 将验证阶段从 `completed` 重命名为 `review`，使语义更准确
  - 在 UI 层统一移除 `completed` 状态值，避免概念混用
- Non-Goals
  - 不引入更多新状态（例如 `approved`、`rejected` 等）

## Decisions

- Decision: 新状态名采用 `review`
  - 原因：与“验证/复核/补齐”语义一致；对模型更直观
- Decision: 不兼容旧值 `completed`（AI 任务 JSON 状态）
  - 系统在解析到 `completed` 时，将其视为无效状态并要求改为 `review`
  - 对外文案与提示词只使用 `review`，避免混用
- Decision: UI 历史数据进行迁移（`AIProcessingTask.status`）
  - 读取/加载历史记录时，将旧值 `completed` 映射为 `review`
  - 可选：在加载后回写到 IndexedDB，完成一次性迁移

## Risks / Trade-offs

- 风险：模型/历史提示词仍输出 `completed`，导致状态校验失败或循环增加
  - 缓解：更新所有提示词与引导；并在错误提示中明确要求输出 `review`
- 风险：UI 历史数据中仍包含旧值 `completed`，导致展示/筛选逻辑异常
  - 缓解：加载时迁移映射；必要时对旧数据做一次性回写迁移

## Migration Plan

- AI 任务 JSON 状态：立即切换为仅接受 `review`（不再接受 `completed`）
- UI 历史任务状态：在读取 IndexedDB 时将 `completed` → `review`（并可回写）

## Open Questions

- UI 状态 `review` 的用户可见文案：采用“复核/已复核”

