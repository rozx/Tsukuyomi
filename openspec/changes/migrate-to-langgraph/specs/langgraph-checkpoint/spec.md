# langgraph-checkpoint Specification

## Purpose

利用 LangGraph 的 Checkpointer 机制实现任务断点恢复能力。允许翻译任务在中断后从断点恢复执行，而非从头重新开始。

## Requirements

### Requirement: 分阶段引入 Checkpointer

系统 MUST 按阶段引入 Checkpointer 能力，第一阶段不强制使用。

#### Scenario: 第一阶段 - 无 Checkpointer

- **GIVEN** 系统完成核心 LangGraph 迁移
- **WHEN** Graph 被编译
- **THEN** Graph MUST 在无 Checkpointer 的情况下正常工作
- **AND THEN** 所有翻译、润色、校对任务 MUST 保持功能正常

#### Scenario: 第二阶段 - MemorySaver

- **GIVEN** 核心迁移已验证通过
- **WHEN** 系统启用 MemorySaver checkpointer
- **THEN** 系统 MUST 在 Graph 编译时注入 `new MemorySaver()`
- **AND THEN** 同一会话内的任务 MUST 支持状态回退

#### Scenario: 第三阶段 - IndexedDB Checkpointer

- **GIVEN** 系统需要跨页面/跨会话恢复
- **WHEN** 系统实现自定义 IDB checkpointer
- **THEN** 系统 MUST 使用项目现有的 `idb` 库实现 `BaseCheckpointSaver` 接口
- **AND THEN** 中断的任务 MUST 能通过 thread_id 恢复执行

### Requirement: Thread ID 管理

系统 MUST 为每次 Graph invoke 生成唯一的 thread ID，用于 checkpoint 索引。

#### Scenario: 生成 Thread ID

- **GIVEN** `text-task-processor.ts` 发起一次 chunk 翻译
- **WHEN** 系统调用 `graph.invoke()`
- **THEN** 系统 MUST 传入唯一的 `thread_id` 配置
- **AND THEN** thread_id SHOULD 包含 bookId、chapterId 和 chunkIndex 信息以便追溯
