## Why

当前 AI 翻译、润色、校对任务通过解析 AI 返回的 JSON 格式文本来更新任务状态和保存翻译结果。这种方式存在以下问题：

1. **解析复杂性**: 需要复杂的正则和 JSON 提取逻辑 (response-parser.ts)，容易出错
2. **状态不同步**: AI 输出的 JSON 格式与内部状态管理之间容易出现不一致
3. **错误处理困难**: 格式错误的 JSON 或无效的状态值难以实时检测和纠正
4. **扩展性差**: 新增字段或修改格式需要同时更新提示词和解析逻辑

通过使用 Function Calling 工具（如 `update_task_status`、`add_translation`），AI 可以直接调用工具来操作状态和数据，实现更可靠、更直观的状态管理。

## What Changes

- **新增工具**: 创建 `update_task_status` 工具，允许 AI 请求更新任务状态，并在服务器端验证状态转换是否有效：
  - 验证状态值有效性（planning、working、review、end）
  - 根据任务类型验证状态转换规则：
    - 翻译任务：支持 working ↔ review 双向转换（允许在审阅阶段发现问题后返回工作状态继续翻译）
    - 润色/校对任务：planning → working → end（跳过 review 阶段，完成后直接结束）
  - 无效的状态转换返回错误信息，不执行更新
- **新增工具**: 创建 `update_chapter_title` 工具，允许 AI 提交章节标题的翻译结果
- **新增工具**: 创建 `add_translation_batch` 工具，批量提交段落处理结果：
  - 支持批量添加段落翻译（原文 → 译文映射）
  - 支持批量提交润色后的文本
  - 支持批量提交校对结果（修改建议或修正后的文本）
  - 一次工具调用可提交多个段落的处理结果
- **修改提示词**: 更新 translation/polish/proofreading 的系统提示词，移除 JSON 格式要求，改为工具调用指令
- **删除旧代码**: 完全删除 response-parser.ts 中的 JSON 解析逻辑
- **删除旧代码**: 完全删除 stream-handler.ts 中的流式状态/内容检测逻辑
- **清理代码**: 删除所有与 JSON 格式解析相关的代码和测试文件
- **BREAKING**: AI 模型必须支持 Function Calling 才能使用新流程

## Capabilities

### New Capabilities

- `ai-task-state-tool`: AI 任务状态管理工具 - 提供 `update_task_status` 工具让 AI 直接更新任务状态
- `ai-chapter-title-tool`: AI 章节标题翻译工具 - 提供 `update_chapter_title` 工具让 AI 提交章节标题翻译
- `ai-translation-batch-tool`: AI 批量翻译提交工具 - 提供 `add_translation_batch` 工具让 AI 批量提交段落翻译、润色或校对结果

### Modified Capabilities

- `ai-paragraph-tools`: 更新段落工具的使用方式，与新的统一提交工具协同工作
- `ai-task-state-machine`: 调整状态机实现，支持通过工具调用触发状态转换

## Impact

- **受影响文件**:
  - `src/services/ai/tasks/utils/response-parser.ts` - **删除** JSON 解析逻辑（文件可删除或保留空壳）
  - `src/services/ai/tasks/utils/stream-handler.ts` - **删除**流式状态检测逻辑
  - `src/services/ai/tasks/utils/response-parser.test.ts` - **删除**相关测试文件
  - `src/services/ai/tasks/prompts/translation.ts` - 修改提示词
  - `src/services/ai/tasks/prompts/polish.ts` - 修改提示词
  - `src/services/ai/tasks/prompts/proofreading.ts` - 修改提示词
  - `src/services/ai/tools/` - 新增工具定义和处理器
  - `src/services/ai/tasks/translation-service.ts` - 适配工具调用模式
  - `src/services/ai/tasks/polish-service.ts` - 适配工具调用模式
  - `src/services/ai/tasks/proofreading-service.ts` - 适配工具调用模式

- **API 变化**: AI 提供商调用方式不变，但内部处理逻辑从解析文本改为处理工具调用

- **依赖**: 需要 AI 模型支持 Function Calling（OpenAI 和 Gemini 均支持）
