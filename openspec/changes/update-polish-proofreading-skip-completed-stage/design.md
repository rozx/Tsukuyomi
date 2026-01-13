## Context

翻译相关 AI 任务采用统一状态机：`planning → working → completed → end`，并在工具调用循环中对状态转换做强约束。

当前实现会在两处拒绝 `working → end`：
- 流式输出时的提前校验（检测到无效转换会中止输出）
- `executeToolCallLoop` 中的主循环校验（无效转换会向模型回推错误提示并要求重试）

对润色/校对任务而言，`completed` 阶段的“完整性验证”价值较低（任务只返回变化段落），强制进入 `completed` 会引入额外回合和循环风险。

## Goals / Non-Goals

- Goals
  - 仅对 `polish` / `proofreading` 调整状态机：跳过并禁用 `completed`，固定为 `planning → working → end`
  - 保持 `translation` 状态机不变：仍要求 `working → completed → end`
  - 更新提示词与文档，使模型在工作完成后直接 `end`

- Non-Goals
  - 不改变“内容只能在 working 输出”的规则（`end` 仍只作为收尾状态）
  - 不引入新的状态字段或扩展状态集合（仍是 `planning|working|completed|end`）

## Decisions

- Decision: `validTransitions` 改为按 `taskType` 生成
  - `translation`: `planning → working → completed → end`
  - `polish|proofreading`: `planning → working → end`（`completed` 禁用）

- Decision: 调整 loop 引导文案（polish/proofreading）
  - 当模型已无更多修改时，引导其直接返回 `{"status":"end"}` 结束当前 chunk
  - 若需要继续修改已输出段落，则仍可回到 `{"status":"working"}`（兼容既有修订流程）

## Alternatives considered

- 仅修改提示词，不修改状态机约束
  - 风险：实现仍会拒绝 `working → end`，导致模型按提示返回后被系统强制报错重试

- 对所有任务放宽 `working → end`
  - 风险：translation 的 `completed` 阶段承担“完整性验证/补齐缺失段落”的作用，放宽会影响质量与一致性

## Risks / Trade-offs

- **兼容性（行为变化）**：历史 prompt/模型可能仍会返回 `{"status":"completed"}`
  - 缓解：系统明确拒绝并纠正为 `{"status":"end"}`；同时更新提示词与文档，降低触发概率

- **状态循环**：若模型在 `working` 输出后忘记收尾，仍可能停留在 `working`
  - 缓解：在 polish/proofreading 的“完成提醒”中明确要求 `end`，并保持循环检测机制

## Migration Plan

- 实现阶段先改状态机校验为按 `taskType` 区分
- 再同步更新提示词与文档
- 最后补齐单元测试，确保 translation 行为不受影响

