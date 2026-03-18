## 1. 工具注册

- [x] 1.1 在 `src/services/ai/tools/index.ts` 的 `ToolRegistry` 中新增 `getSingleParagraphPolishTools(bookId)` 静态方法，返回只读上下文工具 + `add_translation_batch`，排除数据修改工具、`update_task_status`、`ask_user`、待办事项和导航工具
- [x] 1.2 验证 `getSingleParagraphPolishTools()` 返回的工具列表符合 spec 中定义的可用/不可用工具清单

## 2. Prompt 构建

- [x] 2.1 新建 `src/services/ai/tasks/prompts/single-paragraph-polish.ts`，实现 `buildSingleParagraphPolishSystemPrompt()` 方法，包含润色核心规则（语言自然化、准确性、角色区分等），引用工具列表说明，不包含状态机指令
- [x] 2.2 在同文件中实现 `buildSingleParagraphPolishUserPrompt()` 方法，接收并格式化以下默认上下文：前后各 3 段内容（原文+翻译）、相关术语、本章角色、书籍信息、章节摘要、当前待润色段落
- [x] 2.3 新建 `src/services/ai/tasks/prompts/single-paragraph-proofreading.ts`，实现 `buildSingleParagraphProofreadingSystemPrompt()` 方法，包含校对检查项（文字错误、内容一致性、准确性等），不包含状态机指令
- [x] 2.4 在同文件中实现 `buildSingleParagraphProofreadingUserPrompt()` 方法，与润色版本共享相同的上下文注入结构

## 3. 上下文构建辅助

- [x] 3.1 在 `src/services/ai/tasks/utils/context-builder.ts` 中新增 `buildSurroundingParagraphsContext()` 方法，接收当前段落 ID 和全章段落数组，返回格式化的前后各 3 段内容（含原文和翻译）
- [x] 3.2 在同文件中新增 `buildChapterCharactersContext()` 方法，获取本章出场角色信息并格式化（名称、翻译、性别、描述、说话风格、别名）
- [x] 3.3 在同文件中新增 `buildSingleParagraphDefaultContext()` 方法，组合调用 `buildSurroundingParagraphsContext()`、`buildChapterCharactersContext()`、`buildBookContextSection()`、`buildChapterContextSection()` 以及 `findUniqueTermsInText()` 匹配的术语，返回完整的默认上下文字符串

## 4. 核心服务实现

- [x] 4.1 在 `src/services/ai/tasks/polish-service.ts` 中新增 `polishSingle()` 静态方法，直接构建 prompt（含默认上下文）、注册工具集、调用 AI 模型，实现工具调用循环（调用 AI → 处理工具调用 → 回传结果 → 直到 stop），不使用 `processTextTask()` 和状态机
- [x] 4.2 在 `src/services/ai/tasks/proofreading-service.ts` 中新增 `proofreadSingle()` 静态方法，结构与 `polishSingle()` 类似，使用校对专用 prompt 和较低温度（0.3）
- [x] 4.3 提取 `polishSingle()` 和 `proofreadSingle()` 的共享逻辑（工具调用循环、上下文构建）到 `src/services/ai/tasks/utils/single-paragraph-processor.ts` 中的 `processSingleParagraph()` 方法，避免代码重复

## 5. UI 调用层适配

- [x] 5.1 修改 `src/composables/book-details/useChapterTranslation.ts` 中的 `polishParagraph()` 方法，改为调用 `PolishService.polishSingle()`，创建简化的 `AIProcessingTask`（不设 `workflowStatus`，状态从 `thinking` 直接到 `end`）
- [x] 5.2 修改同文件中的 `proofreadParagraph()` 方法，改为调用 `ProofreadingService.proofreadSingle()`，使用相同的简化任务记录模式
- [x] 5.3 确保 `ParagraphCard.vue` 中单段落润色/校对时不显示流程阶段提示，仅显示 loading 状态

## 6. 测试验证

- [ ] 6.1 验证单段落润色：触发单段落润色 → AI 直接返回润色结果（无状态机流转）→ 结果通过 `add_translation_batch` 正确应用到段落翻译
- [ ] 6.2 验证单段落校对：触发单段落校对 → AI 直接返回校对结果 → 结果正确应用
- [ ] 6.3 验证默认上下文注入：确认 prompt 中包含前后 3 段、相关术语、章节角色、书籍信息、章节摘要
- [ ] 6.4 验证工具可用性：AI 可以调用上下文查询工具获取额外信息，但无法调用数据修改工具
- [ ] 6.5 验证批量润色/校对不受影响：章节级润色/校对仍走原有 `processTextTask()` 流程和状态机
- [ ] 6.6 验证任务取消：单段落润色/校对进行中可通过 AbortController 正常取消
