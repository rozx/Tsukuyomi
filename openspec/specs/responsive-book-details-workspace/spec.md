# responsive-book-details-workspace Specification

## Purpose

TBD - created by archiving change support-mobile-tablet-full-feature. Update Purpose after archive.

## Requirements

### Requirement: 小屏书籍详情全功能编排

系统 MUST 在手机与平板端提供书籍详情工作区的完整功能编排，覆盖目录、正文、翻译、术语、角色、记忆与进度操作。

#### Scenario: 手机端完整功能可达

- **WHEN** 用户在手机端进入书籍详情页
- **THEN** 系统 MUST 通过模式切换或面板切换提供所有桌面能力且不删减功能

#### Scenario: 平板端核心工作区优先

- **WHEN** 用户在平板端进入书籍详情页
- **THEN** 系统 MUST 优先展示正文与翻译工作区，并支持快速切换到辅助面板

### Requirement: 工作区模式切换可恢复

系统 MUST 在不同工作模式间切换时保留当前编辑状态与阅读位置，避免重复操作。

#### Scenario: 模式切换后保留段落定位

- **WHEN** 用户从正文模式切换到术语或角色模式后再返回正文
- **THEN** 系统 MUST 恢复到先前段落位置与当前选中翻译版本

### Requirement: 高级面板具备小屏操作闭环

系统 MUST 为术语、角色设定、记忆管理、AI 助手提供在手机和平板上的创建、编辑、删除、查看闭环能力。

#### Scenario: 手机端编辑术语闭环

- **WHEN** 用户在手机端新增或编辑术语
- **THEN** 系统 MUST 支持完成保存与回看结果，不依赖桌面宽屏面板

#### Scenario: 平板端管理记忆闭环

- **WHEN** 用户在平板端对 AI 记忆执行检索和更新
- **THEN** 系统 MUST 在单页流程内完成操作并即时反馈结果
