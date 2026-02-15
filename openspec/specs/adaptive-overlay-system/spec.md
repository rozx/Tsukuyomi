# adaptive-overlay-system Specification

## Purpose

TBD - created by archiving change support-mobile-tablet-full-feature. Update Purpose after archive.

## Requirements

### Requirement: 弹层形态按断点自适应

系统 MUST 按设备断点为 Dialog、Popover、侧滑面板选择可用形态，避免固定宽度导致内容裁切或无法操作。

#### Scenario: 手机端大体量表单弹层

- **WHEN** 手机端打开包含复杂表单的弹层
- **THEN** 系统 MUST 使用全屏或近全屏形态并提供顶部关闭与保存操作

#### Scenario: 平板端工具弹层

- **WHEN** 平板端打开辅助操作弹层
- **THEN** 系统 MUST 使用中等宽度居中弹层或侧边面板，且主页面上下文保持可感知

### Requirement: 弹层可见区与安全区兼容

系统 MUST 在移动端处理安全区、虚拟键盘与滚动容器关系，保证输入区和确认按钮始终可达。

#### Scenario: 键盘弹起时操作区可达

- **WHEN** 用户在手机端弹层中聚焦输入框并弹出键盘
- **THEN** 系统 MUST 保证主要输入区与确认按钮不会被遮挡

### Requirement: 弹层交互一致且可撤销

系统 MUST 为不同断点提供一致的关闭行为与撤销路径，避免误触造成数据丢失。

#### Scenario: 误触关闭前提醒

- **WHEN** 用户在有未保存改动的弹层中执行关闭动作
- **THEN** 系统 MUST 提供确认提示或草稿保留机制

#### Scenario: 多层弹层返回顺序正确

- **WHEN** 用户在小屏端连续打开多层弹层后执行返回
- **THEN** 系统 MUST 按后进先出顺序关闭，并保持上一层状态不丢失
