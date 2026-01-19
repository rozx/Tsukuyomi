## 1. Implementation

- [x] 1.1 统一 AI 任务状态集合：引入 `review` 并弃用 `completed`
  - [x] 更新状态值校验：仅允许 `planning|working|review|end`（不再接受 `completed`）
  - [x] 更新状态转换规则：translation 固定 `planning → working → review → end`
  - [x] polish/proofreading 维持 `planning → working → end`（继续禁用中间阶段）

- [x] 1.2 更新提示词与循环引导
  - [x] 更新 `getExecutionWorkflowRules()`：将 `completed` 文案替换为 `review`
  - [x] 更新所有引导输出：以 `review` 作为验证/复核阶段名称
  - [x] 在规则中明确：若模型输出 `completed`，系统会视为无效状态并要求改为 `review`

- [x] 1.3 更新文档
  - [x] 更新 `docs/TRANSLATION_AI_TASK_FLOW.md`（如仍描述旧状态）

 - [x] 1.4 更新 UI 层任务状态：`completed` → `review`
  - [x] 更新 `AIProcessingTask.status` 枚举与相关逻辑（筛选/清理/展示）
  - [x] 更新 UI 标签与图标映射（例如“复核/已复核”）
  - [x] 处理 IndexedDB 历史数据迁移（读取时映射或一次性回写）

## 2. Tests

- [x] 2.1 单元测试：状态值纠错
  - [x] 输入 `{"status":"completed"}` 时返回明确错误并要求改为 `review`
  - [x] 输入未知状态时返回明确错误

- [x] 2.2 单元测试：状态转换约束
  - [x] translation 禁止 `working → end`（必须经过 `review`）
  - [x] polish/proofreading 禁止进入 `review`（固定 `planning → working → end`）

- [x] 2.3 单元测试：UI 历史数据迁移
  - [x] 旧值 `completed` 能正确映射为 `review`（避免升级后 UI 异常）

## 3. Validation

- [x] 3.1 运行 `bun run lint`
- [x] 3.2 运行 `bun run type-check`
- [x] 3.3 运行 `bun test`

