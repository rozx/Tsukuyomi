## Why

翻译、润色和校对任务按设定大小切分章节后，末尾经常只剩一个很小的 chunk。为这段少量内容单独发起一次 AI 请求，会增加固定等待时间与重复上下文 token 消耗，因此应在可控范围内将它并入前一个 chunk。

## What Changes

- 当章节产生多个任务 chunk，且最后一个 chunk 的格式化文本长度严格小于设定 `chunkSize` 的三分之一时，将它合并到前一个 chunk。
- 合并后保持段落顺序及 `paragraphIds` 顺序，允许合并结果超过常规 `chunkSize`，以换取少一次 AI 请求。
- 当末块大小等于或大于三分之一、章节只有一个 chunk，或没有可处理内容时，保持现有分块行为。
- 该规则统一应用于翻译、润色和校对任务，以及任务重试时的 chunk 重建路径。

## Capabilities

### New Capabilities

- `ai-task-chunking`: 定义翻译、润色和校对任务按段落切块，以及小尾块合并的统一行为与边界条件。

### Modified Capabilities

- 无。

## Impact

- 受影响代码：`src/services/ai/tasks/utils/chunk-formatter.ts` 及其调用的统一任务分块路径。
- 受影响测试：`src/__tests__/chunk-formatter.test.ts`，必要时补充任务流水线回归测试。
- API 与持久化：不改变公开 API、书籍设置结构或已有数据；`translationChunkSize` 仍是唯一的分块大小设置。
- 运行时行为：满足条件的章节会少一次 AI 调用，但倒数第二个请求的输入最多增加一个小于设定值三分之一的尾块（段落自身超长的既有情况除外）。
