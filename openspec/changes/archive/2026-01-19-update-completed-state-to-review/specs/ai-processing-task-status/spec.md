## ADDED Requirements

### Requirement: UI 任务状态值从 `completed` 重命名为 `review`
系统 MUST 将 UI 层 AI 处理任务状态（`AIProcessingTask.status`）中的 `completed` 重命名为 `review`。

#### Scenario: 新任务完成后状态为 review
- **GIVEN** 系统创建并执行一个 AI 处理任务
- **WHEN** 该任务成功结束
- **THEN** 系统 MUST 将任务状态标记为 `review`

### Requirement: 历史数据迁移（IndexedDB）
系统 MUST 处理历史任务数据中旧状态值 `completed`，以确保升级后 UI 可正常展示与筛选。

#### Scenario: 加载到旧数据 completed 时可正常显示
- **GIVEN** IndexedDB 中存在历史任务记录，且 `status="completed"`
- **WHEN** 系统加载并展示历史任务列表
- **THEN** 系统 MUST 将该记录映射为 `status="review"` 并正常展示

### Requirement: UI 文案与图标映射
系统 MUST 为 `review` 状态提供“复核/已复核”语义一致的 UI 展示（文案/图标/样式）。

#### Scenario: review 显示为已复核
- **GIVEN** 某任务 `status="review"`
- **WHEN** UI 渲染任务列表
- **THEN** UI MUST 显示“已复核”（或等价文案）
- **AND** UI MUST 使用完成态图标与样式（例如绿色对勾）

#### Scenario: 历史列表分组标题使用已复核
- **GIVEN** UI 正在展示历史任务分组
- **WHEN** 分组为 `status="review"` 的任务集合
- **THEN** UI SHOULD 使用“已复核的任务”（或等价标题）作为分组标题

