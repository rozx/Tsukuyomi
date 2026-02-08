## ADDED Requirements

### Requirement: 首次启动自动展示快速开始弹窗

系统 SHALL 在用户首次打开应用且未记录“已关闭快速开始引导”状态时，自动展示快速开始弹窗。

#### Scenario: 新用户首次进入应用

- **GIVEN** 应用设置中不存在快速开始已关闭状态，或该状态为 `false`
- **WHEN** 用户打开应用并进入主界面
- **THEN** 系统自动显示快速开始弹窗

#### Scenario: 已关闭用户再次进入应用

- **GIVEN** 应用设置中快速开始已关闭状态为 `true`
- **WHEN** 用户再次打开应用
- **THEN** 系统 MUST NOT 自动显示快速开始弹窗

### Requirement: 弹窗内容来自 front-page 帮助文档

系统 SHALL 使用 `public/help/front-page.md` 作为快速开始弹窗内容源，并以 Markdown 形式渲染展示。

#### Scenario: 文档加载成功

- **WHEN** 系统加载快速开始弹窗内容
- **THEN** 系统从 `/help/front-page.md` 读取内容
- **AND THEN** 将 Markdown 渲染为用户可读内容后展示

### Requirement: 关闭弹窗后状态持久化

用户关闭快速开始弹窗后，系统 SHALL 立即持久化“已关闭”状态，确保同设备后续启动不再自动弹出。

#### Scenario: 用户关闭弹窗

- **GIVEN** 快速开始弹窗当前处于显示状态
- **WHEN** 用户执行关闭操作
- **THEN** 系统将快速开始已关闭状态写入持久化设置
- **AND THEN** 当前会话关闭弹窗

#### Scenario: 关闭后刷新应用

- **GIVEN** 用户已关闭快速开始弹窗且状态已持久化
- **WHEN** 用户刷新页面或重新启动应用
- **THEN** 系统 MUST NOT 自动再次弹出快速开始弹窗

### Requirement: 快速开始关闭状态参与数据同步

系统 SHALL 将快速开始已关闭状态纳入应用设置同步数据，并在多设备间保持一致。

#### Scenario: 已关闭状态同步到其他设备

- **GIVEN** 设备 A 已记录快速开始已关闭状态为 `true`
- **AND GIVEN** 用户已完成设置同步到设备 B
- **WHEN** 设备 B 打开应用
- **THEN** 设备 B 读取到已关闭状态为 `true`
- **AND THEN** 设备 B MUST NOT 自动显示快速开始弹窗

#### Scenario: 同步冲突时保持已关闭语义

- **GIVEN** 一端状态为 `true`，另一端状态为 `false` 或缺失
- **WHEN** 系统执行设置合并
- **THEN** 合并结果 SHALL 保持快速开始已关闭状态为 `true`

### Requirement: 状态读取异常时的安全回退

当快速开始状态读取失败时，系统 SHALL 采用可恢复行为，允许用户正常关闭并重新写入状态。

#### Scenario: 启动时状态读取失败

- **GIVEN** 系统在启动阶段无法读取快速开始状态
- **WHEN** 用户进入应用
- **THEN** 系统按“未关闭”处理并允许展示快速开始弹窗

#### Scenario: 异常后用户关闭弹窗

- **GIVEN** 快速开始弹窗因读取失败而被展示
- **WHEN** 用户关闭弹窗
- **THEN** 系统尝试重新写入快速开始已关闭状态
