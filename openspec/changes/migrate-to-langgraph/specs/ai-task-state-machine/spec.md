# ai-task-state-machine Specification (Delta)

## Purpose

将 AI 任务状态机从命令式实现（`TaskLoopSession` 中的 if/else 和 while 循环）迁移到 LangGraph 声明式 graph edges。状态转换规则不变，仅改变实现方式。

## Requirements

### Requirement: 状态转换规则保持不变

系统 MUST 通过 LangGraph 的条件边（conditional edges）实现与现有完全相同的状态转换规则。

#### Scenario: Translation 任务状态转换（Graph 实现）

- **GIVEN** Translation 任务在 LangGraph Graph 中执行
- **WHEN** stateRouter 节点评估状态转换
- **THEN** 系统 MUST 允许且仅允许以下转换：
  - `planning → working`
  - `working → review`
  - `review → working`（允许返回修改）
  - `review → end`

#### Scenario: Polish/Proofreading 任务状态转换（Graph 实现）

- **GIVEN** Polish 或 Proofreading 任务在 LangGraph Graph 中执行
- **WHEN** stateRouter 节点评估状态转换
- **THEN** 系统 MUST 允许且仅允许以下转换：
  - `planning → working`
  - `working → end`
- **AND THEN** 系统 MUST 拒绝 `working → review` 的转换

### Requirement: 连续状态计数保留

系统 MUST 通过 Graph State 中的 `consecutiveStatusCounts` 字段实现与现有 `consecutivePlanningCount` / `consecutiveWorkingCount` / `consecutiveReviewCount` 相同的循环检测逻辑。

#### Scenario: Planning 状态循环检测

- **GIVEN** Graph 在 planning 状态已连续执行 2 次（`MAX_CONSECUTIVE_STATUS`）
- **WHEN** stateRouter 注入提示词
- **THEN** 系统 MUST 注入强制转换到 working 的提示词
- **AND THEN** 该逻辑 MUST 与现有 `handleStateLogic()` 中的 planning 分支行为一致

#### Scenario: Review 状态循环检测

- **GIVEN** Graph 在 review 状态已连续执行 2 次
- **WHEN** stateRouter 注入提示词
- **THEN** 系统 MUST 注入强制结束的提示词（`getReviewLoopPrompt`）

### Requirement: 段落完整性验证保留

系统 MUST 在 stateRouter 的 working 状态分支中保留段落完整性验证逻辑。

#### Scenario: Working 状态下验证完整性

- **GIVEN** 当前 workflowStatus 为 `working`
- **WHEN** stateRouter 处理 working 状态逻辑
- **THEN** 系统 MUST 调用 `verifyParagraphCompleteness` 检查所有段落是否已翻译
- **AND THEN** 根据验证结果注入 `getWorkingFinishedPrompt` 或 `getWorkingContinuePrompt`

#### Scenario: Review 状态下发现缺失段落

- **GIVEN** 当前 workflowStatus 为 `review`
- **WHEN** stateRouter 发现有缺失的段落翻译
- **THEN** 系统 MUST 将状态回退到 `working`
- **AND THEN** 系统 MUST 注入 `getMissingParagraphsPrompt`
