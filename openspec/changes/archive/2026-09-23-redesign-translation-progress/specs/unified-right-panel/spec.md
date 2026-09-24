## MODIFIED Requirements

### Requirement: 翻译任务开始时自动切换到翻译进度 Tab

当翻译、润色或校对任务创建时，系统 SHALL 自动将右侧面板切换到「翻译进度」Tab，并且翻译进度面板 SHALL 自动选中该新任务。

#### Scenario: 翻译任务创建后自动跳转

- **WHEN** 用户触发章节翻译、润色或校对操作，且右侧面板当前处于「AI 助手」Tab
- **THEN** 系统 MUST 自动切换到「翻译进度」Tab

#### Scenario: 新任务自动成为当前查看任务

- **WHEN** 新的翻译/润色/校对任务被创建
- **THEN** 翻译进度面板 MUST 自动将 selectedTaskId 设置为新任务的 ID

#### Scenario: 用户手动切换后不再强制跳转（同一任务期间）

- **WHEN** 用户在翻译进行中手动切换到「AI 助手」Tab
- **THEN** 系统 MUST NOT 再次自动切换回「翻译进度」Tab（除非新任务开始）
