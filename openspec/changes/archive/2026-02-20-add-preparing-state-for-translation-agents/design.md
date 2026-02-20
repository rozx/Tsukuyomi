## Context

当前翻译相关任务的工作流状态定义与约束分散在多个层面：

- 状态类型与标签：`src/constants/ai/index.ts`、`src/services/ai/tasks/utils/task-types.ts`
- 状态转换校验：`src/services/ai/tools/task-status-tools.ts`
- 任务循环与阶段引导：`src/services/ai/tasks/utils/task-runner.ts`、`src/services/ai/tasks/prompts/common.ts`
- 任务展示：`src/stores/ai-processing.ts` 及相关 UI

现有流程中，AI 在 `working` 阶段仍可能进行术语/角色/记忆维护，导致翻译主流程被频繁打断。该变更要求将“翻译前数据准备”前置为独立阶段，并在运行时强约束工具可用范围，确保 `working` 阶段主要用于翻译提交。

## Goals / Non-Goals

**Goals:**

- 引入 `preparing` 状态，并将流程改为：
  - `translation`: `planning → preparing → working → review → end`
  - `polish/proofreading`: `planning → preparing → working → end`
- 让 `planning` 专注规划、`preparing` 专注数据维护、`working` 专注翻译输出、`review` 专注译文复核。
- 在 `working` 禁止 create/update term/character/memory，相关数据维护统一在 `preparing` 或 `review` 执行。
- 在 `review` 明确允许 memory 更新，以支持复核阶段沉淀可复用翻译经验。
- 记录 `working` 阶段被拒绝的数据写入尝试次数（term/character/memory），用于后续提示词和流程优化。
- 保持 `preparing` 可直接进入 `working`（即使没有任何更新操作）。
- 不保留兼容分支，按新流程直接切换。

**Non-Goals:**

- 不改变翻译提交工具（`add_translation_batch`）的原子性、批次上限与质量校验规则。
- 不改动章节摘要（`chapter_summary`）既有流程（保持现有状态机）。
- 不新增外部依赖或后端接口。

## Decisions

- Decision 1: 统一扩展状态枚举与转换规则，新增 `preparing`
  - 方案：在 `AIWorkflowStatus`、`VALID_TASK_STATUSES`、状态标签映射、任务类型转换表中同步新增 `preparing`。
  - 理由：状态枚举与转换规则是多处共享的基础契约，必须先统一，避免工具层与循环层出现不一致。
  - Alternatives considered:
    - 仅在 prompt 层声明 `preparing`：被拒绝；无法提供运行时强约束，且容易被工具校验拒绝。

- Decision 2: 在 `task-runner` 中新增显式 `preparing` 分支，而非复用 `planning`
  - 方案：`TaskLoopSession.handleStateLogic()` 增加 `preparing` 分支；并为其提供独立 loop 提示（含“可直接进入 working”指令）。
  - 理由：`planning` 与 `preparing` 语义不同（规划 vs 数据变更），显式分支更利于调试、日志分析与后续策略演进。
  - Alternatives considered:
    - 复用 `planning` 并通过布尔标记区分：被拒绝；分支行为变得隐式，后续维护复杂度更高。

- Decision 3: 增加“按状态限制工具”的运行时授权层
  - 方案：在工具调用前（`task-runner` 侧）按 `taskType + currentStatus` 验证工具名是否允许；不允许时返回明确提示并引导状态切换。
  - 规则重点：
    - `planning`：只读查询 + `update_task_status`
    - `preparing`：term/character/memory 可 CRUD（含只读）+ `update_task_status`
    - `working`：`add_translation_batch` / `update_chapter_title` + 只读查询 + `update_task_status`（禁止 term/character/memory 的 create/update）
    - `review`：保持复核定位，允许 term/character/memory 的 create/update，不做翻译提交
  - 理由：当前工具集合是按任务装载而非按状态动态裁剪，增加运行时授权可在不重构工具注册机制的前提下实现强约束。
  - Alternatives considered:
    - 每轮动态重建工具列表并只下发当前状态可用工具：可行但改动面更大，且会影响历史行为兼容性与请求构建复杂度。

- Decision 4: `working` 严格禁止 term/character/memory 写操作
  - 方案：在 `working` 阶段统一禁止 term/character/memory 的 create/update（以及其他写入类操作），仅保留翻译提交与只读查询能力。
  - 理由：确保 working 阶段职责单一，避免翻译过程被数据库维护打断。
  - Alternatives considered:
    - `working` 允许紧急创建：被拒绝；会导致职责回流，削弱 preparing/review 的阶段边界。
    - `working` 允许完整 CRUD：被拒绝；会显著放大状态混乱与回合波动。

- Decision 5: 将“working 阶段被拒绝写入”计数纳入任务指标
  - 方案：在 `task-runner` 统计 `working` 阶段被拒绝的 term/character/memory 写入调用次数，并随 metrics 输出。
  - 理由：为后续优化提供可量化信号（例如 preparing 引导是否充分、模型是否频繁越界）。
  - Alternatives considered:
    - 仅依赖 Action 日志离线分析：被拒绝；实时可观测性不足，定位成本高。

- Decision 6: 不保留兼容代码，直接切换到新状态机
  - 方案：移除/拒绝新增与旧流程并行的兼容分支，所有翻译相关任务统一使用 `preparing` 新流程。
  - 理由：兼容分支会放大状态分叉与测试成本，且会削弱“阶段职责清晰化”的目标。

## Risks / Trade-offs

- [Risk] 额外状态可能增加回合数与耗时
  - Mitigation: 在 `preparing` 提示词中明确“数据已充分时可直接切到 `working`”，并保留循环检测与收敛提示。

- [Risk] 模型在错误状态调用工具导致失败重试增多
  - Mitigation: 统一状态提示 + 工具拒绝信息返回“当前状态、允许工具、建议状态切换”。

- [Risk] `working` 中发现新信息但不能直接写库，可能增加状态切换回合
  - Mitigation: 在拒绝提示中明确引导切换到 `preparing` 或 `review`；并通过“被拒绝写入计数”持续优化提示词。

- [Risk] 不保留兼容分支可能放大升级瞬时风险
  - Mitigation: 以单一状态机定义集中改造并补齐关键测试，发布前通过真实任务回归验证 translation / polish / proofreading 全链路。

## Migration Plan

1. 扩展状态常量与类型：新增 `preparing`，更新标签映射与状态文本。
2. 更新状态转换规则：`task-types` 与 `task-status-tools` 同步切换到新流程。
3. 更新任务循环：新增 `preparing` 分支与对应 loop 引导；保持 existing review 逻辑。
4. 引入按状态工具授权：在工具调用前执行状态-工具匹配校验。
5. 增加 `working` 阶段被拒绝写入统计并接入现有 metrics 输出。
6. 更新 UI 工作流状态展示文案，确保 `preparing` 可见且语义清晰。
7. 清理本变更相关的兼容逻辑与兜底分支，确保运行路径唯一。

Rollback strategy:

- 若发布后出现异常，整体回滚到旧版本代码（包含旧状态机），不在同一版本内保留双轨兼容。

## Open Questions

- 无。
