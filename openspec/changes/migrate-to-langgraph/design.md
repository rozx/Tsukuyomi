## Architecture Overview

本次迁移的核心思路：**将 `TaskLoopSession` 的命令式 while 循环重构为 LangGraph `StateGraph` 的声明式节点和边**，同时保持所有业务逻辑（工具定义、Provider 层、流式处理、验证逻辑）不变。

### 层次结构

```
┌─────────────────────────────────────────────────────┐
│  Service Layer (不变)                                │
│  translation-service / polish-service / assistant   │
└──────────────┬──────────────────────────────────────┘
               │ 调用
┌──────────────▼──────────────────────────────────────┐
│  text-task-processor.ts (轻微修改)                   │
│  - Chunk 循环逻辑保留                                │
│  - executeToolCallLoop → graph.invoke               │
└──────────────┬──────────────────────────────────────┘
               │ 调用
┌──────────────▼──────────────────────────────────────┐
│  LangGraph StateGraph (新增，替换 task-runner.ts)     │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌────────┐│
│  │planning │→ │working  │⇄ │review   │→ │  end   ││
│  └────┬────┘  └────┬────┘  └────┬────┘  └────────┘│
│       │            │            │                   │
│       ▼            ▼            ▼                   │
│  ┌─────────────────────────────────────┐            │
│  │  Tool Node (调用 ToolRegistry)      │            │
│  └─────────────────────────────────────┘            │
└──────────────┬──────────────────────────────────────┘
               │ 调用
┌──────────────▼──────────────────────────────────────┐
│  AI Provider Layer (不变)                            │
│  AIServiceFactory / OpenAIService / GeminiService   │
└─────────────────────────────────────────────────────┘
```

## Key Design Decisions

### Decision 1: 自定义 Model Wrapper vs. 使用 LangChain 官方 Model

**选择：自定义 Model Wrapper**

**原因：**

- 项目已有成熟的 `AIServiceFactory`，支持 OpenAI 和 Gemini 两个 Provider
- 项目有自定义的流式处理逻辑（降级检测、重复字符检测），需要在流式回调中运行
- 使用 LangChain 官方的 `ChatOpenAI` 或 `ChatGoogleGenerativeAI` 会引入大量额外依赖（`@langchain/openai`, `@langchain/google-genai`），增加打包体积
- LangGraph 支持使用 **不依赖 LangChain model** 的方式：通过 `dispatchCustomEvent` 和自定义 Annotation 实现自定义模型调用（见 LangGraph "streaming-tokens-without-langchain" 示例）

**实现方式：**
在 LangGraph 节点函数中直接调用现有 `AIServiceFactory.generateText()`，将结果手动转换为 LangGraph 的 message 格式。不使用 `BaseChatModel` 子类化。

```typescript
// 概念代码
const callModel = async (state: TranslationState) => {
  const result = await config.generateText(
    aiServiceConfig,
    { messages: state.messages, tools: state.tools },
    streamCallback,
  );
  // 将 result 转换为 LangGraph 的 message 格式
  return {
    messages: [convertToGraphMessage(result)],
  };
};
```

**替代方案（已放弃）：**

- 子类化 `BaseChatModel`：需要实现 `_generate()` 和 `_llmType()`，引入强依赖 `@langchain/core`，且与现有 streaming 逻辑不兼容
- 使用官方 `ChatOpenAI`：增加 ~2MB 依赖，且无法复用 `GeminiService` 的自定义逻辑

### Decision 2: Graph 拓扑 - 共用一个参数化 Graph vs. 每种任务类型独立 Graph

**选择：共用一个参数化 Graph，通过 TaskType 控制行为**

**原因：**

- 翻译、润色、校对三种任务的核心流程结构相同（planning → working → review → end）
- 差异仅体现在：允许的状态转换规则、提示词内容、验证逻辑
- 独立 Graph 会导致大量重复代码

**实现方式：**
通过 `TaskType` 参数在条件边函数中选择不同的转换规则和提示词。

```typescript
const graph = new StateGraph(TranslationStateAnnotation)
  .addNode('agent', callModelNode)
  .addNode('tools', toolExecutionNode)
  .addNode('stateRouter', routeByWorkflowState)
  .addEdge(START, 'agent')
  .addConditionalEdges('agent', shouldCallToolsOrRoute)
  .addEdge('tools', 'stateRouter')
  .addConditionalEdges('stateRouter', routeByCurrentStatus)
  .compile();
```

### Decision 3: State 定义 - 使用 MessagesAnnotation vs. 自定义 Annotation

**选择：自定义 Annotation（扩展 MessagesAnnotation）**

**原因：**
`TaskLoopSession` 维护了大量状态，远超简单的 message 列表：

- `currentStatus` (TaskStatus)
- `accumulatedParagraphs` (Map)
- `titleTranslation` (string)
- `planningSummary` (string)
- `toolCallCounts` (Map) - 用于限制工具调用次数
- `consecutivePlanningCount` / `consecutiveWorkingCount` - 用于检测循环
- `metrics` (PerformanceMetrics)

**实现方式：**

```typescript
import { Annotation, MessagesAnnotation } from '@langchain/langgraph';

const TranslationStateAnnotation = Annotation.Root({
  // 继承 messages
  ...MessagesAnnotation.spec,

  // 任务状态
  workflowStatus: Annotation<TaskStatus>({ default: () => 'planning' }),
  taskType: Annotation<TaskType>(),

  // 业务数据
  accumulatedParagraphs: Annotation<Map<string, string>>({
    default: () => new Map(),
    reducer: (current, update) => {
      // merge: new entries override existing
      for (const [k, v] of update) current.set(k, v);
      return current;
    },
  }),
  titleTranslation: Annotation<string | undefined>(),
  planningSummary: Annotation<string | undefined>(),

  // 控制状态
  consecutiveStatusCounts: Annotation<Record<TaskStatus, number>>({
    default: () => ({ planning: 0, working: 0, review: 0, end: 0 }),
  }),
  toolCallCounts: Annotation<Map<string, number>>({
    default: () => new Map(),
  }),

  // 性能指标
  metrics: Annotation<PerformanceMetrics>({ default: () => defaultMetrics() }),

  // 配置（只读，invoke 时传入）
  config: Annotation<ToolCallLoopConfig>(),
});
```

### Decision 4: Tool Node 实现 - LangGraph ToolNode vs. 自定义 Tool Node

**选择：自定义 Tool Node**

**原因：**

- LangGraph 的 `ToolNode` 预置了 LangChain 的 `tool()` 格式，期望工具继承 `StructuredTool` 或使用 `DynamicStructuredTool`
- 项目已有 `ToolRegistry.handleToolCall()` 作为工具执行的入口，内部处理了参数解析（包括 JSON 修复）、错误处理、日志等
- 项目的工具需要丰富的上下文参数（`bookId`, `paragraphIds`, `aiProcessingStore` 等），这些不是 LangChain tool 格式能直接支持的
- 自定义 Tool Node 可以保持 `ToolRegistry.handleToolCall()` 的完整调用方式不变

**实现方式：**

```typescript
const toolExecutionNode = async (state: TranslationState) => {
  const lastMessage = state.messages[state.messages.length - 1];
  const toolCalls = lastMessage.tool_calls;
  if (!toolCalls?.length) return {};

  const toolResults = [];
  for (const toolCall of toolCalls) {
    // 复用现有的 ToolRegistry
    const result = await ToolRegistry.handleToolCall(
      toolCall,
      state.config.bookId,
      state.config.handleAction,
      // ... 其他参数
    );
    toolResults.push({
      role: 'tool',
      content: result.content,
      tool_call_id: toolCall.id,
      name: toolCall.function.name,
    });
  }

  return { messages: toolResults };
};
```

### Decision 5: Checkpointer 策略 - MemorySaver vs. 自定义 vs. 不使用

**选择：第一阶段不使用 Checkpointer，后续按需添加**

**原因：**

- 当前 `TaskLoopSession` 没有持久化能力，迁移的首要目标是结构优化而非新功能
- `MemorySaver`（内存存储）对 Electron 应用中单个翻译任务足够，但不提供真正的持久化
- 后续如需实现"任务中断恢复"，可添加 IndexedDB-based checkpointer（项目已使用 `idb` 库）
- 先完成核心迁移，验证正确性后再引入复杂性

**后续计划：**

```typescript
// 第一阶段：无 checkpointer
const graph = workflow.compile();

// 第二阶段：添加内存 checkpointer（支持同一会话内的回退）
const graph = workflow.compile({ checkpointer: new MemorySaver() });

// 第三阶段：IndexedDB checkpointer（支持跨页面恢复）
const graph = workflow.compile({ checkpointer: new IDBCheckpointer() });
```

### Decision 6: Assistant Service 处理方式

**选择：暂不迁移 Assistant Service，保持独立**

**原因：**

- `assistant-service.ts`（64KB）是最复杂的服务，有独特的多轮对话和用户交互模式
- 翻译/润色/校对任务是批处理模式（processing pipeline），助手是交互模式（chat loop），本质不同
- 先迁移结构更清晰的翻译任务，验证 LangGraph 的适配性后，再决定是否迁移助手

## State Machine Graph (详细)

```
                    ┌──────────────────┐
                    │     START        │
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
           ┌───────│   agent (LLM)    │──────────┐
           │       └──────────────────┘           │
           │                                      │
     has tool_calls                          no tool_calls
           │                                      │
  ┌────────▼─────────┐                  ┌─────────▼────────┐
  │   tools (exec)   │                  │  stateRouter     │
  │  ToolRegistry    │                  │  (条件路由)       │
  └────────┬─────────┘                  └─────────┬────────┘
           │                                      │
           │ 将 tool results                      │ 检查 workflowStatus
           │ 添加到 messages                      │
           │                              ┌───────┼───────┐──────┐
           │                              │       │       │      │
  ┌────────▼─────────┐            planning│  working│  review│   end│
  │  stateRouter     │                    │       │       │      │
  └────────┬─────────┘              ┌─────▼──┐ ┌──▼───┐ ┌▼────┐ ┌▼──┐
           │                        │inject  │ │inject│ │inject│ │END│
           │ 注入状态提示词          │planning│ │work  │ │review│ └───┘
           │ 后回到 agent           │prompt  │ │prompt│ │prompt│
           │                        └───┬────┘ └──┬───┘ └──┬──┘
           │                            │         │        │
           └────────────────────────────┴─────────┴────────┘
                                        │
                               ┌────────▼─────────┐
                               │   agent (LLM)    │
                               │   (下一轮)        │
                               └──────────────────┘
```

## Trade-offs

### 包大小影响

| 包                     | 大小（估算）      | 用途                     |
| ---------------------- | ----------------- | ------------------------ |
| `@langchain/langgraph` | ~150KB (minified) | StateGraph, Annotation   |
| `@langchain/core`      | ~500KB (minified) | Message types, callbacks |
| **总计**               | ~650KB            |                          |

在 Electron 应用中，650KB 的增量是完全可接受的（当前 `node_modules` 已有数百 MB）。

**需要验证：**

- `@langchain/core` 是否有 Node.js 原生模块依赖（可能影响 Electron 打包）
- 是否需要 `@langchain/core` 的完整包，还是可以只导入所需模块

### 已知限制

1. **自定义 Model Wrapper 的限制**：不使用 `BaseChatModel` 意味着无法直接使用 LangGraph 的 `createReactAgent` 预构建方法。需要完全自定义 graph 结构。这是有意的取舍 — 我们需要更细粒度的控制。

2. **Streaming 兼容性**：LangGraph 原生使用 `streamEvents` 进行流式处理。但由于我们使用自定义 model wrapper，streaming 将在节点函数内部通过现有 `createStreamCallback` 处理，而非 LangGraph 的事件系统。这可能限制了使用 LangSmith 的 token-level tracing 能力。

3. **迁移期间的向后兼容性**：在迁移期间，`ToolCallLoopConfig` 和 `ToolCallLoopResult` 的接口保持不变，`text-task-processor.ts` 只需更换内部调用位置。但完整迁移后，这些接口会被 LangGraph 的 State 类型替代。

4. **测试策略变更**：当前测试直接实例化 `TaskLoopSession` 并 mock `generateText`。迁移后，测试需要改为 graph 的 `invoke()` 调用模式，需要重写部分测试用例。

## File Structure

```
src/services/ai/tasks/utils/
├── task-runner.ts          → 重写：LangGraph graph 定义（保留文件名和导出接口）
├── graph/                  → 新增目录
│   ├── state.ts            → State Annotation 定义
│   ├── nodes/
│   │   ├── agent-node.ts   → LLM 调用节点（使用 AIServiceFactory）
│   │   ├── tool-node.ts    → 工具执行节点（包装 ToolRegistry）
│   │   └── state-router.ts → 状态路由和提示词注入
│   ├── edges/
│   │   └── conditions.ts   → 条件边函数（shouldCallTools, routeByStatus）
│   └── index.ts            → Graph 构建和编译
├── tool-executor.ts        → 保留（被 tool-node.ts 调用）
├── stream-handler.ts       → 保留（被 agent-node.ts 使用）
├── productivity-monitor.ts → 保留（被 state-router.ts 使用）
├── text-task-processor.ts  → 修改调用方式
└── ...                     → 其他文件不变
```
