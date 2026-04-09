## Why

当前单段落润色/校对与批量章节处理共用相同的状态机流程（planning → preparing → working → end），对于只处理单个段落来说过于复杂。用户只需要快速获得润色结果，类似术语翻译（`TermTranslationService`）的简洁体验——无需状态机流转，直接返回结果。同时，单段落润色缺乏足够的上下文支持，AI 无法看到前后段落来理解语境。

## What Changes

- 单段落润色/校对时跳过状态机流转（不再经历 planning → preparing → working → end），改为直接处理并返回结果，行为类似术语翻译
- 自动提供默认上下文（内嵌在 prompt 中，无需工具调用）：
  - 当前段落的前后各 3 段内容，让 AI 理解语境
  - 当前段落中匹配的相关术语信息
  - 本章出场的角色信息
  - 书籍基本信息（书名、简介、标签等）
  - 当前章节摘要
- 提供上下文获取工具集，让 AI 在需要时可以主动获取更多信息：
  - **段落工具**: `get_previous_paragraphs` / `get_next_paragraphs`（获取更多前后段落）、`get_paragraph_info`（段落详情）、`find_paragraph_by_keywords` / `search_paragraphs_by_regex`（搜索相关段落）、`get_translation_history`（翻译历史）
  - **术语/角色工具**: `get_term` / `get_character`（查询详情）、`search_terms_by_keywords` / `search_characters_by_keywords`（搜索相关术语/角色）
  - **记忆工具**: `search_memory_by_keywords` / `get_memory`（搜索和获取相关记忆）
  - **书籍工具**: `get_book_info` / `get_chapter_info`（获取书籍和章节背景）、`search_chapter_summaries`（搜索章节摘要了解剧情）
  - **网络搜索**: `search_web` / `fetch_webpage`（查询外部参考资料）
  - **翻译提交工具**: `add_translation_batch`（使用与批量润色相同的工具提交润色结果）
- 批量（多段落/章节级）润色/校对流程保持不变

## Capabilities

### New Capabilities

- `single-para-polish`: 单段落润色/校对的简化处理流程，包括无状态机直接返回、自动上下文注入（前后 3 段、章节角色、书籍信息、章节摘要、相关术语）、以及完整的上下文获取工具集（段落、术语、角色、记忆、书籍、网络搜索）

### Modified Capabilities

- `ai-task-state-machine`: 单段落润色/校对任务不再走完整状态机流程，需要新增判断逻辑区分单段落和批量处理
- `ai-processing-task-status`: 单段落任务的 UI 状态展示简化，不再显示进度条和阶段信息

## Impact

- **服务层**: `PolishService` 和 `ProofreadingService` 需要新增单段落快速处理路径
- **提示词**: 需要新建或调整单段落专用的 system/user prompt，内嵌上下文段落
- **Composable**: `useChapterTranslation.ts` 中的 `polishParagraph()` 和 `proofreadParagraph()` 需要切换到简化调用模式
- **UI 组件**: `ParagraphCard.vue` 单段落处理时不再显示进度/阶段状态，仅显示 loading → 结果
- **Store**: `ai-processing.ts` 中单段落任务可简化 task 记录
- **工具注册**: 单段落模式需注册完整的上下文获取工具集（段落、术语、角色、记忆、书籍、网络搜索工具），确保 AI 可以主动获取所需上下文
- **现有批量流程**: 不受影响，保持原有状态机和进度追踪
