## 1. 状态模型与转换规则

- [x] 1.1 更新状态类型与标签定义，新增 `preparing`（`src/constants/ai/index.ts`、`src/services/ai/tasks/utils/task-types.ts`）
- [x] 1.2 更新翻译/润色/校对状态机转换表，强制 `planning → preparing → ...`（不保留旧流程兼容分支）
- [x] 1.3 更新 `update_task_status` 工具的状态枚举、转换校验与错误提示（含禁止 `planning → working`）

## 2. 任务循环与提示词

- [x] 2.1 在任务循环中新增 `preparing` 阶段处理分支（`task-runner`）
- [x] 2.2 更新状态说明与执行流程提示（`prompts/common.ts`），明确 `working` 仅翻译、`preparing/review` 负责数据维护
- [x] 2.3 更新 translation 与 polish/proofreading 的阶段收敛逻辑，确保流程分别符合新状态机

## 3. 状态化工具权限控制

- [x] 3.1 实现按 `taskType + workflowStatus` 的工具写入权限校验（运行时拦截）
- [x] 3.2 在 `working` 阶段禁止 term/character/memory 的 create/update，并返回“切换到 preparing 或 review”的引导错误
- [x] 3.3 在 `preparing` 与 `review` 阶段允许 term/character/memory 的 create/update（含 review 的 memory 更新）
- [x] 3.4 增加并输出“working 阶段被拒绝写入次数”指标，用于后续提示词优化

## 4. UI 与状态展示

- [x] 4.1 更新工作流状态展示文案与标签，支持 `preparing` 可视化展示
- [x] 4.2 更新翻译相关流程说明展示：translation 显示 `planning → preparing → working → review → end`，polish/proofreading 显示 `planning → preparing → working → end`
- [x] 4.3 清理旧流程兼容展示路径，确保 UI 仅展示包含 `preparing` 的新流程

## 5. 测试与验证

- [x] 5.1 增加/更新状态转换测试：translation、polish、proofreading 均覆盖 `planning → preparing` 与非法跳转场景
- [x] 5.2 增加/更新工具权限测试：验证 `working` 禁止 term/character/memory 写入，`preparing/review` 允许写入
- [x] 5.3 增加/更新指标测试：验证 `working` 阶段被拒绝写入计数正确累加
- [x] 5.4 运行 `bun run lint`、`bun run type-check`、`bun test` 并修复失败项
