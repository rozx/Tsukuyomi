# 翻译相关 AI 任务流程改进建议

本文档基于对当前翻译相关 AI 任务流程的深入分析，提出改进建议和优化方向。

## 当前流程评估

### 优点 ✅

1. **清晰的状态机设计**：`planning → working → completed → end` 状态转换逻辑清晰
2. **工具增强机制**：AI 可以通过工具获取上下文，提高翻译质量
3. **分块处理**：支持长文本处理，避免上下文过长
4. **规划上下文共享**：第一个块的规划上下文传递给后续块，减少重复工具调用
5. **实时更新**：段落翻译和标题翻译通过回调实时更新 UI
6. **错误检测**：AI 降级检测和重试机制
7. **状态循环检测**：防止 AI 在同一状态停留过久

### 潜在问题 ⚠️

1. **规划上下文截断**：工具结果截断到 500 字符可能丢失重要信息
2. **状态循环检测可能过严**：`MAX_CONSECUTIVE_STATUS = 2` 在某些复杂情况下可能不够
3. **规划上下文无法更新**：后续块发现新术语/角色时无法更新共享上下文
4. **块大小固定**：2500 字符可能不适合所有情况
5. **JSON 格式错误处理不一致**：`TermTranslationService` 有，但 `TranslationService` 没有
6. **工具调用限制**：`TermTranslationService` 的 `MAX_TOOL_CALLS = 10` 可能不够
7. **错误恢复机制缺失**：如果某个块失败，整个任务失败，没有部分成功机制
8. **性能监控缺失**：没有统计每个阶段的耗时
9. **规划上下文更新机制缺失**：后续块无法更新共享的规划上下文

---

## 改进建议

### 1. 优化规划上下文截断策略

**问题**：
- 工具结果截断到 500 字符可能丢失重要信息
- 特别是术语表和角色表可能很长，截断后信息不完整

**建议**：

#### 方案 A：智能截断（推荐）

```typescript
// 根据工具类型使用不同的截断策略
function truncateToolResult(tool: string, result: string, maxLength: number = 500): string {
  // 对于结构化数据（术语表、角色表），保留关键信息
  if (tool === 'list_terms' || tool === 'list_characters') {
    // 尝试解析 JSON，保留所有条目但截断每个条目的详细信息
    try {
      const data = JSON.parse(result);
      if (Array.isArray(data)) {
        // 保留所有条目，但每个条目只保留关键字段
        const truncated = data.map((item: any) => ({
          id: item.id,
          name: item.name,
          translation: item.translation,
          // 其他字段截断或省略
          description: item.description?.slice(0, 100) + (item.description?.length > 100 ? '...' : ''),
        }));
        return JSON.stringify(truncated);
      }
    } catch {
      // 如果不是 JSON，使用普通截断
    }
  }
  
  // 对于其他工具，使用普通截断
  return result.length > maxLength ? result.slice(0, maxLength) + '...(已截断)' : result;
}
```

#### 方案 B：增加截断长度

```typescript
// 根据工具类型使用不同的最大长度
const MAX_LENGTHS: Record<string, number> = {
  'list_terms': 2000,
  'list_characters': 2000,
  'search_memory_by_keywords': 1000,
  'get_chapter_info': 800,
  'get_book_info': 800,
  'default': 500,
};

const maxLength = MAX_LENGTHS[tool] || MAX_LENGTHS.default;
const truncatedResult = result.length > maxLength 
  ? result.slice(0, maxLength) + '...(已截断)' 
  : result;
```

#### 方案 C：摘要生成

```typescript
// 对于超长结果，生成摘要而不是截断
async function summarizeToolResult(tool: string, result: string): Promise<string> {
  if (result.length <= 500) {
    return result;
  }
  
  // 对于结构化数据，提取关键信息
  if (tool === 'list_terms' || tool === 'list_characters') {
    try {
      const data = JSON.parse(result);
      if (Array.isArray(data)) {
        return `共 ${data.length} 项：${data.slice(0, 10).map((item: any) => 
          `${item.name} → ${item.translation}`
        ).join(', ')}${data.length > 10 ? ` 等 ${data.length} 项` : ''}`;
      }
    } catch {
      // 如果不是 JSON，使用普通截断
    }
  }
  
  // 对于其他工具，使用前 500 字符 + 总长度提示
  return `${result.slice(0, 500)}...(已截断，总长度 ${result.length} 字符)`;
}
```

**优先级**：高  
**影响**：提高后续块使用规划上下文的准确性

---

### 2. 改进状态循环检测机制

**问题**：
- `MAX_CONSECUTIVE_STATUS = 2` 可能在某些复杂情况下不够
- 工具调用会重置计数器，但某些工具调用可能不是"生产性"的

**建议**：

#### 方案 A：基于工具调用的智能检测（推荐）

```typescript
// 区分"生产性"和"非生产性"工具调用
const PRODUCTIVE_TOOLS = [
  'list_terms',
  'list_characters',
  'search_memory_by_keywords',
  'get_chapter_info',
  'get_book_info',
];

// 只有生产性工具调用才重置计数器
if (result.toolCalls && result.toolCalls.length > 0) {
  const hasProductiveTool = result.toolCalls.some(tc => 
    PRODUCTIVE_TOOLS.includes(tc.function.name)
  );
  
  if (hasProductiveTool) {
    // 重置循环检测计数器
    consecutivePlanningCount = 0;
    consecutiveWorkingCount = 0;
    consecutiveCompletedCount = 0;
  }
}
```

#### 方案 B：动态调整阈值

```typescript
// 根据任务复杂度动态调整阈值
function getMaxConsecutiveStatus(taskType: TaskType, hasTools: boolean): number {
  const baseThreshold = 2;
  
  // 如果有工具可用，允许更多规划时间
  if (hasTools) {
    return baseThreshold + 1;
  }
  
  // 对于复杂任务，允许更多时间
  if (taskType === 'translation' && paragraphIds && paragraphIds.length > 20) {
    return baseThreshold + 1;
  }
  
  return baseThreshold;
}
```

#### 方案 C：基于时间的检测

```typescript
// 不仅检测连续次数，还检测总时间
const MAX_STATUS_DURATION = 5 * 60 * 1000; // 5 分钟
let statusStartTime = Date.now();

if (previousStatus !== newStatus) {
  statusStartTime = Date.now();
}

const statusDuration = Date.now() - statusStartTime;
if (statusDuration > MAX_STATUS_DURATION) {
  // 即使连续次数未达到阈值，也强制转换
  console.warn(`[${logLabel}] ⚠️ 状态 ${currentStatus} 持续时间过长（${statusDuration}ms），强制转换`);
}
```

**优先级**：中  
**影响**：减少误报，提高系统鲁棒性

---

### 3. 支持规划上下文更新

**问题**：
- 规划上下文只在第一个块提取
- 后续块发现新术语/角色时无法更新共享上下文

**建议**：

#### 方案 A：增量更新机制（推荐）

```typescript
// 在 executeToolCallLoop 中检测规划上下文的更新
interface PlanningContextUpdate {
  newTerms?: Array<{ name: string; translation: string }>;
  newCharacters?: Array<{ name: string; translation: string }>;
  updatedMemories?: Array<{ id: string; summary: string }>;
}

// 在 completed 阶段检测是否有新信息
if (currentStatus === 'completed') {
  // 检测是否有新创建的术语/角色
  const newTerms = actions.filter(a => 
    a.type === 'create_term' || a.type === 'update_term'
  );
  const newCharacters = actions.filter(a => 
    a.type === 'create_character' || a.type === 'update_character'
  );
  
  if (newTerms.length > 0 || newCharacters.length > 0) {
    // 生成增量更新
    const update: PlanningContextUpdate = {
      newTerms: newTerms.map(a => ({
        name: a.data.name,
        translation: a.data.translation,
      })),
      newCharacters: newCharacters.map(a => ({
        name: a.data.name,
        translation: a.data.translation,
      })),
    };
    
    // 返回更新信息，供后续块使用
    return {
      ...loopResult,
      planningContextUpdate: update,
    };
  }
}
```

#### 方案 B：定期刷新机制

```typescript
// 每隔 N 个块刷新一次规划上下文
const PLANNING_CONTEXT_REFRESH_INTERVAL = 5; // 每 5 个块刷新一次

if (i > 0 && i % PLANNING_CONTEXT_REFRESH_INTERVAL === 0) {
  // 重新获取术语表和角色表
  // 合并到现有规划上下文中
  const refreshedContext = await refreshPlanningContext(bookId, chapterId);
  sharedPlanningContext = mergePlanningContext(
    sharedPlanningContext,
    refreshedContext
  );
}
```

**优先级**：高  
**影响**：确保后续块使用最新的上下文信息

---

### 4. 动态块大小调整

**问题**：
- 块大小固定为 2500 字符
- 某些情况下可能需要更大的块（如对话较多的段落）

**建议**：

#### 方案 A：基于内容类型的动态调整

```typescript
function calculateChunkSize(paragraphs: Paragraph[]): number {
  const baseSize = 2500;
  
  // 检测段落类型
  const hasLongDialogue = paragraphs.some(p => 
    p.text && (p.text.match(/「/g) || []).length > 3
  );
  
  // 对话较多的段落需要更多上下文
  if (hasLongDialogue) {
    return baseSize + 500;
  }
  
  // 检测是否有复杂结构（列表、表格等）
  const hasComplexStructure = paragraphs.some(p =>
    p.text && (p.text.includes('・') || p.text.includes('□'))
  );
  
  if (hasComplexStructure) {
    return baseSize + 300;
  }
  
  return baseSize;
}
```

#### 方案 B：基于模型能力的动态调整

```typescript
function getChunkSizeForModel(model: AIModel): number {
  const baseSize = 2500;
  
  // 根据模型的上下文窗口调整
  if (model.model.includes('gpt-4')) {
    return baseSize + 1000; // GPT-4 可以处理更大的块
  }
  
  if (model.model.includes('claude-3')) {
    return baseSize + 800;
  }
  
  return baseSize;
}
```

**优先级**：低  
**影响**：优化性能和翻译质量

---

### 5. 统一 JSON 格式错误处理

**问题**：
- `TermTranslationService` 有 JSON 格式错误重试机制
- `TranslationService` 没有，依赖 `executeToolCallLoop` 中的通用错误处理

**建议**：

#### 方案 A：在 executeToolCallLoop 中添加 JSON 格式错误处理

```typescript
// 在 executeToolCallLoop 中添加 JSON 格式错误重试
const MAX_JSON_RETRIES = 3;
let jsonRetryCount = 0;

if (parsed.error) {
  // JSON 解析失败，检查重试次数
  if (jsonRetryCount < MAX_JSON_RETRIES) {
    jsonRetryCount++;
    console.warn(`[${logLabel}] ⚠️ JSON 格式错误（第 ${jsonRetryCount}/${MAX_JSON_RETRIES} 次重试）: ${parsed.error}`);
    history.push({
      role: 'assistant',
      content: responseText,
    });
    history.push({
      role: 'user',
      content:
        `${getCurrentStatusInfo(taskType, currentStatus, isBriefPlanning)}\n\n` +
        `响应格式错误：${parsed.error}。[警告] 只返回JSON，状态可独立返回：` +
        `\`{"status": "${currentStatus}"}\`，无需包含paragraphs。系统会自动检查缺失段落。`,
    });
    continue;
  } else {
    // 达到最大重试次数，抛出错误
    throw new Error(`JSON 格式错误：已达到最大重试次数（${MAX_JSON_RETRIES}），无法解析响应。`);
  }
}

// 成功解析后重置计数器
jsonRetryCount = 0;
```

**优先级**：中  
**影响**：提高错误恢复能力

---

### 6. 增加工具调用限制的灵活性

**问题**：
- `TermTranslationService` 的 `MAX_TOOL_CALLS = 10` 可能不够
- 某些复杂术语可能需要更多工具调用来获取上下文

**建议**：

#### 方案 A：基于任务复杂度的动态调整

```typescript
function getMaxToolCalls(text: string, bookId?: string): number {
  const baseMax = 10;
  
  // 如果有 bookId，可能需要更多工具调用
  if (bookId) {
    return baseMax + 5;
  }
  
  // 如果文本较长，可能需要更多上下文
  if (text.length > 100) {
    return baseMax + 3;
  }
  
  return baseMax;
}
```

#### 方案 B：基于工具类型的限制

```typescript
// 对不同类型的工具使用不同的限制
const TOOL_CALL_LIMITS: Record<string, number> = {
  'list_terms': 2, // 术语表最多调用 2 次
  'list_characters': 2, // 角色表最多调用 2 次
  'search_memory_by_keywords': 5, // 记忆搜索可以多调用几次
  'default': Infinity, // 其他工具无限制
};

// 在循环中检测工具调用次数
const toolCallCounts = new Map<string, number>();

for (const toolCall of result.toolCalls) {
  const toolName = toolCall.function.name;
  const currentCount = toolCallCounts.get(toolName) || 0;
  const limit = TOOL_CALL_LIMITS[toolName] || TOOL_CALL_LIMITS.default;
  
  if (currentCount >= limit) {
    console.warn(`[${logLabel}] ⚠️ 工具 ${toolName} 调用次数已达上限（${limit}），跳过此次调用`);
    continue;
  }
  
  toolCallCounts.set(toolName, currentCount + 1);
  // 执行工具调用...
}
```

**优先级**：低  
**影响**：优化工具调用效率

---

### 7. 实现部分成功机制

**问题**：
- 如果某个块失败，整个任务失败
- 没有部分成功机制，已翻译的块无法保存

**建议**：

#### 方案 A：块级别的错误恢复（推荐）

```typescript
// 在 TranslationService 中实现块级别的错误恢复
const failedChunks: number[] = [];
const successfulChunks: { chunkIndex: number; translations: Map<string, string> }[] = [];

for (let i = 0; i < chunks.length; i++) {
  try {
    // 处理块...
    successfulChunks.push({
      chunkIndex: i,
      translations: extractedTranslations,
    });
  } catch (error) {
    console.error(`[TranslationService] ❌ 块 ${i + 1} 处理失败:`, error);
    failedChunks.push(i);
    
    // 继续处理下一个块，而不是立即失败
    if (aiProcessingStore && taskId) {
      void aiProcessingStore.appendThinkingMessage(
        taskId,
        `\n\n[⚠️ 块 ${i + 1} 处理失败，跳过继续处理后续块]\n\n`,
      );
    }
  }
}

// 所有块处理完成后，报告结果
if (failedChunks.length > 0) {
  console.warn(
    `[TranslationService] ⚠️ ${failedChunks.length}/${chunks.length} 个块处理失败`,
    { 失败的块: failedChunks.map(i => i + 1) }
  );
  
  // 返回部分成功的结果
  return {
    text: translatedText,
    paragraphTranslations,
    titleTranslation,
    actions,
    taskId,
    partialSuccess: true,
    failedChunks: failedChunks.map(i => i + 1),
    successfulChunks: successfulChunks.length,
  };
}
```

#### 方案 B：重试失败的块

```typescript
// 在所有块处理完成后，重试失败的块
if (failedChunks.length > 0) {
  console.log(`[TranslationService] 🔄 开始重试 ${failedChunks.length} 个失败的块`);
  
  for (const chunkIndex of failedChunks) {
    try {
      // 重试失败的块（使用更保守的策略）
      // ...
    } catch (retryError) {
      console.error(`[TranslationService] ❌ 块 ${chunkIndex + 1} 重试失败:`, retryError);
    }
  }
}
```

**优先级**：高  
**影响**：提高系统可用性和用户体验

---

### 8. 添加性能监控

**问题**：
- 没有统计每个阶段的耗时
- 无法识别性能瓶颈

**建议**：

#### 方案 A：添加性能指标收集

```typescript
interface PerformanceMetrics {
  totalTime: number;
  planningTime: number;
  workingTime: number;
  completedTime: number;
  toolCallTime: number;
  toolCallCount: number;
  averageToolCallTime: number;
  chunkProcessingTime: number[];
}

// 在 executeToolCallLoop 中收集指标
const metrics: PerformanceMetrics = {
  totalTime: 0,
  planningTime: 0,
  workingTime: 0,
  completedTime: 0,
  toolCallTime: 0,
  toolCallCount: 0,
  averageToolCallTime: 0,
  chunkProcessingTime: [],
};

const statusStartTime = Date.now();

// 在状态转换时记录时间
if (previousStatus !== newStatus) {
  const statusDuration = Date.now() - statusStartTime;
  
  switch (previousStatus) {
    case 'planning':
      metrics.planningTime += statusDuration;
      break;
    case 'working':
      metrics.workingTime += statusDuration;
      break;
    case 'completed':
      metrics.completedTime += statusDuration;
      break;
  }
  
  statusStartTime = Date.now();
}

// 在工具调用时记录时间
const toolCallStartTime = Date.now();
// ... 执行工具调用 ...
metrics.toolCallTime += Date.now() - toolCallStartTime;
metrics.toolCallCount++;

// 返回指标
return {
  ...loopResult,
  metrics: {
    ...metrics,
    averageToolCallTime: metrics.toolCallCount > 0 
      ? metrics.toolCallTime / metrics.toolCallCount 
      : 0,
  },
};
```

#### 方案 B：性能日志输出

```typescript
// 在任务完成时输出性能日志
if (aiProcessingStore && taskId) {
  console.log(`[${logLabel}] 📊 性能指标:`, {
    总耗时: `${metrics.totalTime}ms`,
    规划阶段: `${metrics.planningTime}ms`,
    工作阶段: `${metrics.workingTime}ms`,
    验证阶段: `${metrics.completedTime}ms`,
    工具调用: `${metrics.toolCallCount} 次，平均 ${metrics.averageToolCallTime.toFixed(2)}ms`,
    块处理时间: metrics.chunkProcessingTime.map((t, i) => 
      `块 ${i + 1}: ${t}ms`
    ).join(', '),
  });
}
```

**优先级**：中  
**影响**：帮助识别性能瓶颈，优化系统性能

---

### 9. 改进规划上下文更新机制

**问题**：
- 规划上下文只在第一个块提取
- 后续块无法更新共享的规划上下文

**建议**：

#### 方案 A：增量更新机制（已在第 3 点详细说明）

#### 方案 B：定期刷新机制（已在第 3 点详细说明）

#### 方案 C：基于变更的更新

```typescript
// 检测规划上下文是否需要更新
function shouldUpdatePlanningContext(
  currentContext: string | undefined,
  newActions: ActionInfo[]
): boolean {
  // 如果有新创建的术语/角色，需要更新
  const hasNewTerms = newActions.some(a => 
    a.type === 'create_term' || a.type === 'update_term'
  );
  const hasNewCharacters = newActions.some(a => 
    a.type === 'create_character' || a.type === 'update_character'
  );
  
  return hasNewTerms || hasNewCharacters;
}

// 在块处理完成后检查
if (shouldUpdatePlanningContext(sharedPlanningContext, actions)) {
  // 重新获取术语表和角色表
  const updatedContext = await refreshPlanningContext(bookId, chapterId);
  sharedPlanningContext = mergePlanningContext(sharedPlanningContext, updatedContext);
}
```

**优先级**：高  
**影响**：确保后续块使用最新的上下文信息

---

## 实施优先级

### 高优先级（立即实施）

1. ✅ **优化规划上下文截断策略** - 提高后续块使用规划上下文的准确性
2. ✅ **支持规划上下文更新** - 确保后续块使用最新的上下文信息
3. ✅ **实现部分成功机制** - 提高系统可用性和用户体验

### 中优先级（近期实施）

4. ⚠️ **改进状态循环检测机制** - 减少误报，提高系统鲁棒性
5. ⚠️ **统一 JSON 格式错误处理** - 提高错误恢复能力
6. ⚠️ **添加性能监控** - 帮助识别性能瓶颈

### 低优先级（长期优化）

7. 📝 **动态块大小调整** - 优化性能和翻译质量
8. 📝 **增加工具调用限制的灵活性** - 优化工具调用效率

---

## 总结

当前翻译相关 AI 任务流程已经相当完善，但在以下方面还有改进空间：

1. **上下文管理**：规划上下文的截断和更新机制需要优化
2. **错误处理**：需要更完善的错误恢复机制
3. **性能监控**：需要添加性能指标收集
4. **灵活性**：某些固定参数需要动态调整

建议优先实施高优先级的改进，这些改进将显著提高系统的可用性和翻译质量。

