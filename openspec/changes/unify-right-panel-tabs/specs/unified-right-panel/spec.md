## ADDED Requirements

### Requirement: 右侧面板支持 AI 助手与翻译进度的 Tab 切换

AppRightPanel SHALL 提供「AI 助手」和「翻译进度」两个顶层 Tab，用户可随时手动切换，系统在特定条件下自动切换。

#### Scenario: 用户手动切换到翻译进度 Tab

- **WHEN** 用户点击「翻译进度」Tab
- **THEN** 系统 MUST 显示翻译进度面板内容，隐藏 AI 聊天内容

#### Scenario: 用户手动切换到 AI 助手 Tab

- **WHEN** 用户点击「AI 助手」Tab
- **THEN** 系统 MUST 显示 AI 聊天消息列表与输入框，隐藏翻译进度内容

### Requirement: 翻译任务开始时自动切换到翻译进度 Tab

当翻译、润色或校对任务创建时，系统 SHALL 自动将右侧面板切换到「翻译进度」Tab，使用户无需手动切换即可查看任务状态。

#### Scenario: 翻译任务创建后自动跳转

- **WHEN** 用户触发章节翻译、润色或校对操作，且右侧面板当前处于「AI 助手」Tab
- **THEN** 系统 MUST 自动切换到「翻译进度」Tab

#### Scenario: 用户手动切换后不再强制跳转（同一任务期间）

- **WHEN** 用户在翻译进行中手动切换到「AI 助手」Tab
- **THEN** 系统 MUST NOT 再次自动切换回「翻译进度」Tab（除非新任务开始）

### Requirement: 翻译进度跨页面持续可见

翻译进度面板 SHALL 在所有页面可访问，不限于书籍详情页，使用户在导航到其他页面时仍能查看任务进行状态。

#### Scenario: 从书籍详情页导航到其他页面后查看进度

- **WHEN** 翻译任务正在进行中，用户导航到非书籍详情页（如 AI 配置页、帮助页）
- **THEN** 用户 MUST 能够通过右侧面板的「翻译进度」Tab 查看所有活跃任务状态

#### Scenario: 非书籍详情页的翻译进度显示完整信息

- **WHEN** 用户在非书籍详情页打开「翻译进度」Tab 且有活跃翻译任务
- **THEN** 系统 MUST 显示任务类型、目标章节标题、当前段落进度（current/total）及工作流状态

### Requirement: 翻译进度数据通过全局 store 传递

翻译段落进度（current、total、message）SHALL 通过 `AIProcessingTask.progress` 字段存储在 `aiProcessingStore`，使任何组件无需依赖 BookDetailsPage 的局部状态即可读取进度。

#### Scenario: 翻译进行中进度字段实时更新

- **WHEN** 翻译任务中每个段落翻译完成
- **THEN** 系统 MUST 将对应 `AIProcessingTask.progress.current` 和 `progress.total` 更新到最新值

#### Scenario: 翻译完成后进度字段保持最终值

- **WHEN** 翻译任务结束（status 变为 end、error 或 cancelled）
- **THEN** `progress` 字段 MUST 保持最后一次更新的值，直到任务被手动清理

### Requirement: 取消任务后 BookDetailsPage 局部 UI 状态自动同步

BookDetailsPage SHALL 通过监听 `aiProcessingStore.activeTasks` 检测到翻译/润色/校对任务变为 `cancelled` 状态，并据此更新局部 UI 状态（如按钮禁用状态、章节翻译标志），无需依赖组件间事件链路。

#### Scenario: 从翻译进度面板取消任务后按钮状态更新

- **WHEN** 用户在「翻译进度」Tab 中点击取消按钮，且 BookDetailsPage 当前加载
- **THEN** 系统 MUST 将对应章节的翻译/润色/校对状态标志重置，相关操作按钮恢复可用

#### Scenario: 章节内容区不再包含翻译进度分栏

- **WHEN** 用户在书籍详情页查看任意章节
- **THEN** 章节内容区域 MUST 占据中间内容区的全部宽度，不存在翻译进度分栏布局
