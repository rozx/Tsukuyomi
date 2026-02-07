## Context

当前 AI 翻译系统使用 JSON 解析方式处理 AI 的输出。AI 在翻译、润色或校对时，需要输出特定格式的 JSON（如 `{"status":"working","p":[{"i":0,"t":"译文"}]}`），系统通过正则表达式和 JSON 解析器提取状态和翻译内容。

这种模式的痛点：

1. **解析脆弱性**：流式输出中 JSON 可能被截断或夹杂其他文本
2. **状态不同步**：AI 可能输出无效的状态值或不符合工作流的状态转换
3. **代码复杂度高**：response-parser.ts 包含 200+ 行复杂的解析逻辑，stream-handler.ts 需要实时扫描文本检测状态和内容字段
4. **调试困难**：格式错误只能在解析后才发现，AI 无法得知自己的错误

通过 Function Calling 工具，AI 可以直接调用 `update_task_status` 和 `add_translation_batch` 等工具，将状态更新和数据提交分离，实现更可靠的状态管理。

## Goals / Non-Goals

**Goals:**

- 提供 `update_task_status`、`update_chapter_title`、`add_translation_batch` 三个工具供 AI 调用
- 在服务器端验证状态值和状态转换规则
- 支持翻译任务的 working ↔ review 双向转换
- 支持润色/校对任务的 working → end 单向流程（跳过 review）
- 批量提交翻译结果，保证原子性
- 完全删除旧的 JSON 解析代码（response-parser.ts、stream-handler.ts 中的相关逻辑）
- 更新任务提示词，指示 AI 使用工具而非输出 JSON

**Non-Goals:**

- 不改变 AI 提供商的调用方式（仍使用 OpenAI/Gemini 的 function calling）
- 不修改段落查询工具的功能（只修改使用方式）
- 不改变数据存储结构（继续使用 IndexedDB）
- 不支持旧版 AI 模型（必须支持 function calling）

## Decisions

### Decision: 三个独立工具 vs 一个合并工具

**选择**：三个独立工具（`update_task_status`、`update_chapter_title`、`add_translation_batch`）

**理由**：

- 职责分离：状态更新、标题翻译、段落翻译是不同维度的操作
- 错误隔离：一个工具失败不影响其他工具
- 语义清晰：AI 明确知道何时该调用哪个工具

**替代方案**：一个合并工具包含所有操作

- 拒绝原因：参数会过于复杂，AI 容易混淆

### Decision: 服务器端状态验证

**选择**：在工具处理器中验证状态值和转换规则

**理由**：

- 可靠性：防止 AI 错误导致的状态混乱
- 即时反馈：工具返回明确的错误信息，AI 可立即纠正
- 可维护性：状态规则集中在服务端，易于修改

**验证规则**：

```typescript
const transitions = {
  translation: {
    planning: ['working'],
    working: ['review'],
    review: ['working', 'end'], // 翻译支持返回修改
    end: [],
  },
  polish: {
    planning: ['working'],
    working: ['end'], // 跳过 review
    end: [],
  },
  proofreading: {
    planning: ['working'],
    working: ['end'], // 跳过 review
    end: [],
  },
};
```

### Decision: 批次操作原子性

**选择**：批次要么全部成功，要么全部失败

**理由**：

- 数据一致性：不会出现部分段落更新成功、部分失败的不一致状态
- AI 友好：AI 可以重新提交整个批次，无需追踪哪些成功哪些失败

**实现**：先验证所有段落 index 是否有效并映射为段落 ID，再执行保存操作

### Decision: 完全删除旧代码而非保留 fallback

**选择**：删除 response-parser.ts 和 stream-handler.ts 中的 JSON 解析逻辑

**理由**：

- 代码简洁：避免维护两套并行逻辑
- 强制迁移：确保所有任务都使用新工具模式
- 测试简化：无需测试 fallback 路径

**删除范围**：

- `src/services/ai/tasks/utils/response-parser.ts` - 整个文件删除
- `src/services/ai/tasks/utils/response-parser.test.ts` - 测试文件删除
- `src/services/ai/tasks/utils/stream-handler.ts` - 保留文件但删除状态/内容检测逻辑（约 80% 代码）

### Decision: 提示词更新策略

**选择**：更新三个提示词文件（translation.ts、polish.ts、proofreading.ts）

**关键变更**：

1. 移除所有 JSON 格式示例
2. 添加工具调用说明：
   - "使用 `update_task_status` 工具更新任务状态"
   - "使用 `add_translation_batch` 工具提交段落翻译"
   - "使用 `update_chapter_title` 工具提交章节标题"
3. 强调："不要输出 JSON 格式文本，直接调用工具"

## Risks / Trade-offs

**[Risk]** AI 可能不习惯使用工具，仍然尝试输出 JSON
→ **Mitigation**: 提示词中明确强调；工具调用失败时给出清晰的错误信息

**[Risk]** Function Calling 增加 API 调用次数（每个工具调用是一次额外的 API 往返）
→ **Mitigation**: 批量提交减少调用次数；工具调用结果立即返回，不等待 AI 继续生成

**[Risk]** 旧任务历史数据中的输出内容包含 JSON，可能影响思考过程的显示
→ **Mitigation**: 历史数据保持原样，只影响新任务；输出内容仅用于展示，不参与业务逻辑

**[Trade-off]** 不支持不支持 Function Calling 的旧模型
→ **Acceptance**: OpenAI 和 Gemini 主流模型均支持，这是可接受的限制

**[Trade-off]** 代码删除后无法回滚
→ **Mitigation**: 已完整归档在 OpenSpec 变更中，如需恢复可从 Git 历史找回

## Migration Plan

### Phase 1: 创建工具

1. 创建 `src/services/ai/tools/task-status-tools.ts`
   - 定义 `update_task_status` 工具
   - 实现状态验证逻辑
2. 创建 `src/services/ai/tools/chapter-title-tools.ts`
   - 定义 `update_chapter_title` 工具
3. 创建 `src/services/ai/tools/translation-batch-tools.ts`
   - 定义 `add_translation_batch` 工具
   - 实现批次验证和原子保存

### Phase 2: 修改服务层

4. 修改 `translation-service.ts` 适配工具调用
5. 修改 `polish-service.ts` 适配工具调用
6. 修改 `proofreading-service.ts` 适配工具调用

### Phase 3: 更新提示词

7. 更新 `translation.ts` 提示词
8. 更新 `polish.ts` 提示词
9. 更新 `proofreading.ts` 提示词

### Phase 4: 删除旧代码

10. 删除 `response-parser.ts`
11. 删除 `response-parser.test.ts`
12. 重构 `stream-handler.ts` 移除检测逻辑

### Phase 5: 测试

13. 运行 `bun run type-check`
14. 运行 `bun run lint`
15. 手动测试翻译/润色/校对流程

## Open Questions

1. **Q**: AI 是否可能在一次响应中多次调用 `add_translation_batch`？
   **A**: 技术上可行，但每次调用都会触发保存操作。建议在提示词中指导 AI 一次性提交所有段落。

2. **Q**: 如果 AI 忘记调用 `update_task_status(end)`，任务会永远处于 working 状态吗？
   **A**: 是的。需要在 task runner 中添加超时检测或强制结束机制（超出 scope，未来改进）。

3. **Q**: 润色/校对任务跳过 review 阶段，如何确保质量？
   **A**: 润色/校对本身就是对已有翻译的改进，不需要额外的 review 阶段。AI 完成所有段落后直接 end 即可。
