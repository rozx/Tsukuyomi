## ADDED Requirements

### Requirement: 单段落润色/校对直接处理模式

系统 MUST 为单段落润色（polish）和校对（proofreading）提供直接处理模式，跳过状态机流程（不经历 planning → preparing → working → end），直接构建 prompt 并调用 AI 模型返回结果。

#### Scenario: 单段落润色直接返回结果

- **WHEN** 用户对单个段落触发润色操作
- **THEN** 系统 MUST 直接构建包含上下文的 prompt 并调用 AI 模型
- **AND THEN** 系统 MUST 不创建状态机、不调用 `update_task_status` 工具
- **AND THEN** AI 通过 `add_translation_batch` 工具提交润色结果后，系统 MUST 结束任务

#### Scenario: 单段落校对直接返回结果

- **WHEN** 用户对单个段落触发校对操作
- **THEN** 系统 MUST 直接构建包含上下文的 prompt 并调用 AI 模型
- **AND THEN** 系统 MUST 不创建状态机、不调用 `update_task_status` 工具
- **AND THEN** AI 通过 `add_translation_batch` 工具提交校对结果后，系统 MUST 结束任务

#### Scenario: 批量润色/校对保持原有流程

- **WHEN** 用户对多个段落或整个章节触发润色或校对操作
- **THEN** 系统 MUST 继续使用原有的 `processTextTask()` 流程和状态机
- **AND THEN** 行为与本变更之前完全一致

### Requirement: 默认上下文自动注入 prompt

系统 MUST 在单段落润色/校对的 prompt 中自动注入以下默认上下文信息，无需 AI 通过工具调用获取：

#### Scenario: 注入前后各 3 段上下文

- **WHEN** 系统为单段落润色/校对构建 prompt
- **THEN** prompt MUST 包含当前段落的前 3 段内容（原文 + 翻译）
- **AND THEN** prompt MUST 包含当前段落的后 3 段内容（原文 + 翻译）
- **AND THEN** 若前方或后方不足 3 段，MUST 包含实际可用的全部段落

#### Scenario: 注入相关术语信息

- **WHEN** 系统为单段落润色/校对构建 prompt
- **THEN** 系统 MUST 使用 `findUniqueTermsInText()` 匹配当前段落中出现的术语
- **AND THEN** prompt MUST 包含每个匹配术语的名称、翻译和描述

#### Scenario: 注入本章出场角色信息

- **WHEN** 系统为单段落润色/校对构建 prompt
- **THEN** 系统 MUST 提供本章出场的角色信息
- **AND THEN** prompt MUST 包含每个角色的名称、翻译、性别、描述、说话风格和别名

#### Scenario: 注入书籍基本信息

- **WHEN** 系统为单段落润色/校对构建 prompt
- **THEN** prompt MUST 包含书籍基本信息（书名、简介、标签等）
- **AND THEN** 系统 MUST 复用 `buildBookContextSection()` 构建书籍上下文

#### Scenario: 注入当前章节摘要

- **WHEN** 系统为单段落润色/校对构建 prompt
- **THEN** prompt MUST 包含当前章节的标题和摘要信息
- **AND THEN** 系统 MUST 复用 `buildChapterContextSection()` 构建章节上下文

### Requirement: 上下文获取工具集注册

系统 MUST 为单段落润色/校对模式注册以下只读上下文获取工具和翻译提交工具，供 AI 按需使用：

#### Scenario: 段落工具可用

- **WHEN** AI 在单段落润色/校对模式中运行
- **THEN** 以下段落工具 MUST 可用：`get_previous_paragraphs`、`get_next_paragraphs`、`get_paragraph_info`、`find_paragraph_by_keywords`、`search_paragraphs_by_regex`、`get_translation_history`

#### Scenario: 术语和角色工具可用

- **WHEN** AI 在单段落润色/校对模式中运行
- **THEN** 以下术语工具 MUST 可用：`get_term`、`search_terms_by_keywords`、`list_terms`
- **AND THEN** 以下角色工具 MUST 可用：`get_character`、`search_characters_by_keywords`、`list_characters`

#### Scenario: 记忆工具可用

- **WHEN** AI 在单段落润色/校对模式中运行
- **THEN** 以下记忆工具 MUST 可用：`search_memory_by_keywords`、`get_memory`、`list_memories`

#### Scenario: 书籍工具可用

- **WHEN** AI 在单段落润色/校对模式中运行
- **THEN** 以下书籍工具 MUST 可用：`get_book_info`、`get_chapter_info`、`search_chapter_summaries`

#### Scenario: 网络搜索工具可用

- **WHEN** AI 在单段落润色/校对模式中运行
- **THEN** 以下网络搜索工具 MUST 可用：`search_web`、`fetch_webpage`

#### Scenario: 翻译提交工具可用

- **WHEN** AI 在单段落润色/校对模式中运行
- **THEN** `add_translation_batch` 工具 MUST 可用，用于提交润色/校对结果

#### Scenario: 数据修改工具不可用

- **WHEN** AI 在单段落润色/校对模式中运行
- **THEN** 以下工具 MUST 不可用：`create_term`、`update_term`、`delete_term`、`create_character`、`update_character`、`delete_character`、`create_memory`、`update_memory`、`delete_memory`
- **AND THEN** `update_task_status` MUST 不可用
- **AND THEN** `ask_user`、`ask_user_batch` MUST 不可用
- **AND THEN** 待办事项工具（`create_todo`、`update_todos`、`mark_todo_done`、`delete_todo`、`list_todos`）MUST 不可用

### Requirement: 单段落任务记录

系统 MUST 为单段落润色/校对创建简化的 `AIProcessingTask` 记录，用于任务历史追踪。

#### Scenario: 创建简化任务记录

- **WHEN** 用户触发单段落润色或校对
- **THEN** 系统 MUST 创建 `AIProcessingTask`，`type` 为 `polish` 或 `proofreading`
- **AND THEN** 任务 MUST 不设置 `workflowStatus`（无状态机阶段）
- **AND THEN** 任务状态 MUST 从 `thinking` 直接转为 `end`（成功时）或 `error`（失败时）

#### Scenario: 任务可被取消

- **WHEN** 用户在单段落润色/校对进行中取消操作
- **THEN** 系统 MUST 通过 `AbortController` 中止 AI 请求
- **AND THEN** 任务状态 MUST 更新为 `cancelled`
