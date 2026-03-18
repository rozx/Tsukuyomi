## Context

当前单段落润色/校对通过 `PolishService.polish([paragraph], model, options)` 调用，内部委托给 `processTextTask()`，走完整的状态机流程（planning → preparing → working → end）。这对单段落来说过重：需要多轮工具调用来获取上下文，增加了延迟和 token 消耗。

术语翻译（`TermTranslationService`）提供了更轻量的模式：直接构建 prompt 并调用 `generateText()`，无状态机，将上下文预注入 prompt 中。单段落润色应采用类似架构。

**现有关键文件**：
- `src/services/ai/tasks/polish-service.ts` / `proofreading-service.ts` — 现有批量处理入口
- `src/services/ai/tasks/term-translation-service.ts` — 无状态机的轻量参考实现
- `src/services/ai/tasks/utils/text-task-processor.ts` — 批量处理的通用处理器（`processTextTask()`）
- `src/services/ai/tasks/utils/context-builder.ts` — 上下文构建工具
- `src/services/ai/tools/index.ts` — 工具注册中心（`ToolRegistry`）
- `src/composables/book-details/useChapterTranslation.ts` — UI 调用入口（`polishParagraph()` / `proofreadParagraph()`）
- `src/utils/text-matcher.ts` — 术语/角色文本匹配（`findUniqueTermsInText` / `findUniqueCharactersInText`）

## Goals / Non-Goals

**Goals:**

- 单段落润色/校对不走状态机，直接处理并返回结果
- 自动在 prompt 中注入丰富的默认上下文（前后 3 段、章节角色、书籍信息、章节摘要、相关术语）
- 提供完整的工具集让 AI 在需要时主动获取更多上下文
- 使用 `add_translation_batch` 工具提交结果，与批量流程保持一致
- 保持批量润色/校对流程完全不变

**Non-Goals:**

- 不修改批量（多段落/章节级）润色/校对的任何行为
- 不引入新的 UI 组件或新的用户交互模式
- 不改变工具的底层实现（只调整工具集注册方式）

## Decisions

### 1. 新建独立的单段落处理方法，而非修改现有 `processTextTask()`

**选择**: 在 `PolishService` 和 `ProofreadingService` 中各新增一个 `polishSingle()` / `proofreadSingle()` 静态方法，绕过 `processTextTask()`，直接参考 `TermTranslationService` 的模式调用 AI。

**理由**: `processTextTask()` 承载了分块、状态机、进度追踪等复杂逻辑，为单段落在其中加入特殊分支会增加复杂度。独立方法更清晰，也更容易测试。

**替代方案**: 在 `processTextTask()` 中加 `isSingleParagraph` 分支跳过状态机 → 侵入性强，增加已经复杂的代码路径。

### 2. 上下文预注入 prompt，同时提供工具作为补充

**选择**: 默认上下文（前后 3 段、章节角色、书籍信息、章节摘要、相关术语）直接构建进 system/user prompt 中。同时注册工具集（段落、术语、角色、记忆、书籍、网络搜索、`add_translation_batch`）供 AI 按需使用。

**理由**: 预注入避免了 AI 必须先调用工具才能了解上下文，减少了往返次数和延迟。工具作为补充，让 AI 在需要深入了解时有能力自主获取更多信息。这是 `TermTranslationService`（纯预注入，无工具提交）和现有批量流程（全工具驱动）之间的平衡。

**替代方案**: 仅预注入上下文、不提供工具 → AI 无法获取 prompt 之外的信息，降低润色质量。

### 3. 使用 `add_translation_batch` 工具提交结果

**选择**: 单段落模式下 AI 通过 `add_translation_batch` 工具调用提交润色结果，与批量流程使用相同的提交机制。

**理由**: 复用现有的结果提交管线（翻译版本管理、UI 更新回调等），避免额外实现结果解析逻辑。

**替代方案**: 像 `TermTranslationService` 一样通过 JSON 文本返回结果 → 需要额外的 JSON 解析和重试逻辑，且与现有润色结果处理管线不兼容。

### 4. 工具集组合：复用现有工具 + 排除状态机和不必要的工具

**选择**: 新建一个 `ToolRegistry.getSingleParagraphPolishTools(bookId)` 方法，包含：
- 段落工具（`get_previous_paragraphs`, `get_next_paragraphs`, `get_paragraph_info`, `find_paragraph_by_keywords`, `search_paragraphs_by_regex`, `get_translation_history`）
- 术语工具（`get_term`, `search_terms_by_keywords`, `list_terms`）
- 角色工具（`get_character`, `search_characters_by_keywords`, `list_characters`）
- 记忆工具（`search_memory_by_keywords`, `get_memory`, `list_memories`）
- 书籍工具（`get_book_info`, `get_chapter_info`, `search_chapter_summaries`）
- 网络搜索工具（`search_web`, `fetch_webpage`）
- 翻译提交工具（`add_translation_batch`）

**排除**：
- `update_task_status`（无状态机）
- 术语/角色/记忆的创建/更新/删除工具（单段落润色不应修改数据）
- `ask_user` / 待办事项工具（简化流程不需要）
- 导航工具（单段落无需跳转）

**理由**: 提供足够的上下文获取能力，同时排除数据修改和流程控制类工具，保持单段落模式的简洁性和安全性。

### 5. 新建单段落专用 prompt，复用现有 prompt 构建工具

**选择**: 新建 `src/services/ai/tasks/prompts/single-paragraph-polish.ts`，包含 `buildSingleParagraphPolishSystemPrompt()` 和 `buildSingleParagraphPolishUserPrompt()`。复用现有的 `context-builder.ts` 中的方法（`buildBookContextSection`, `buildChapterContextSection` 等）和 `text-matcher.ts` 中的匹配方法来构建上下文。

**理由**: 单段落润色的核心规则与批量润色相同（语言自然化、准确性等），但需要不同的输出格式（不需要状态机指令、不需要分块处理说明）。独立 prompt 文件避免了在现有 prompt 中加入条件分支。

### 6. AI 调用方式：带工具的 `generateText()` 循环

**选择**: 使用 `generateText()` 调用 AI，但与 `TermTranslationService` 不同的是，需要支持工具调用循环（因为需要 `add_translation_batch` 和可选的上下文查询工具）。实现类似 `processTextTask()` 中的工具调用循环，但不包含状态机逻辑。

**理由**: AI 需要通过工具提交结果，也可能需要多轮工具调用来获取额外上下文。一个简单的循环（调用 AI → 处理工具调用 → 回传结果 → 直到 AI 发送 stop）即可满足需求。

### 7. UI 层：`polishParagraph()` / `proofreadParagraph()` 切换到新方法

**选择**: 在 `useChapterTranslation.ts` 中，当处理单个段落时，调用新的 `PolishService.polishSingle()` / `ProofreadingService.proofreadSingle()` 方法。仍然创建 `aiProcessingTask` 用于追踪，但简化状态（直接 `thinking` → `end`，不设 `workflowStatus`）。

**理由**: 保持任务追踪的一致性（用户可以在任务历史中看到单段落润色记录），但不显示阶段进度。

## Risks / Trade-offs

**[上下文 token 消耗增加]** → 预注入前后 3 段 + 章节角色 + 书籍信息 + 章节摘要会增加 prompt 大小。对于小模型可能接近上下文窗口限制。
→ 缓解：使用 `context-builder.ts` 中已有的截断逻辑（如 `MAX_DESC_LEN`），必要时减少注入段落数。

**[工具调用增加延迟]** → AI 可能在提交结果前调用多个上下文查询工具，增加处理时间。
→ 缓解：在 prompt 中明确指导"默认上下文已足够，仅在必要时使用工具"，减少不必要的工具调用。

**[代码重复]** → 新的 `polishSingle()` / `proofreadSingle()` 方法与现有批量方法有部分逻辑重叠（上下文构建、工具调用处理）。
→ 缓解：提取共享逻辑到工具函数中（如 `buildDefaultContext()`, `runToolCallLoop()`），供两种模式复用。
