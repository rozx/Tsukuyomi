import './setup';
import { describe, test, expect, spyOn, mock, afterEach } from 'bun:test';
import type {
  ChatMessage,
  AIToolCall,
  AITool,
  AIServiceConfig,
  TextGenerationRequest,
} from 'src/services/ai/types/ai-service';
import { executeToolCallLoop } from 'src/services/ai/tasks/utils';
import { ToolRegistry } from 'src/services/ai/tools';
import { BookService } from 'src/services/book-service';
import type { AIProcessingStore } from 'src/services/ai/tasks/utils/task-types';
import type { Novel, Paragraph, Volume, Chapter } from 'src/models/novel';

/**
 * crossCheckMissingWithDB 集成测试
 *
 * 验证 handleReviewState 在检测到内存中段落缺失时，
 * 会通过 crossCheckMissingWithDB 查询数据库进行交叉验证，
 * 避免因为重复提交被去重拒绝导致的无限循环。
 *
 * 重要：handleStateLogic() 只在 processTextResponse 中被调用，
 * 即 AI 返回纯文本响应（无 tool calls）时才会触发。
 * 因此测试中需要在 review 状态后提供一个纯文本响应来触发 handleReviewState()。
 */

// 辅助函数：创建标准工具列表
function createTools(): AITool[] {
  return [
    {
      type: 'function',
      function: {
        name: 'update_task_status',
        description: 'update status',
        parameters: { type: 'object', properties: {}, required: [] },
      },
    },
    {
      type: 'function',
      function: {
        name: 'add_translation_batch',
        description: 'add translation batch',
        parameters: { type: 'object', properties: {}, required: [] },
      },
    },
  ];
}

// 辅助函数：创建 mock AIProcessingStore
function createMockStore(taskId: string, chapterId: string): AIProcessingStore {
  return {
    addTask: mock(() => Promise.resolve('mock-id')) as any,
    updateTask: mock(() => Promise.resolve()) as any,
    appendThinkingMessage: mock(() => Promise.resolve()) as any,
    appendOutputContent: mock(() => Promise.resolve()) as any,
    removeTask: mock(() => Promise.resolve()) as any,
    activeTasks: [
      {
        id: taskId,
        type: 'translation',
        modelName: 'test-model',
        status: 'processing',
        chapterId,
        bookId: 'book-1',
        startTime: Date.now(),
      } as any,
    ],
  };
}

// 辅助函数：创建含翻译的段落
function createParagraphWithTranslation(id: string, translation: string): Paragraph {
  return {
    id,
    text: `原文-${id}`,
    selectedTranslationId: `t-${id}`,
    translations: [
      {
        id: `t-${id}`,
        translation,
        aiModelId: 'test-model',
      },
    ],
  };
}

// 辅助函数：创建无翻译的段落
function createParagraphWithoutTranslation(id: string): Paragraph {
  return {
    id,
    text: `原文-${id}`,
    selectedTranslationId: '',
    translations: [],
  };
}

// 辅助函数：创建 mock Novel 对象
function createMockNovel(chapterId: string, content: Paragraph[]): Novel {
  const chapter: Chapter = {
    id: chapterId,
    title: '测试章节',
    content,
    contentLoaded: true,
    lastEdited: new Date(),
    createdAt: new Date(),
  };
  const volume: Volume = {
    id: 'vol-1',
    title: '测试卷',
    chapters: [chapter],
  };
  return {
    id: 'book-1',
    title: '测试小说',
    volumes: [volume],
    terminologies: [],
    characters: [],
    memories: [],
    defaultAIModelId: 'test-model',
    lastEdited: new Date(),
    createdAt: new Date(),
  } as Novel;
}

// 辅助函数：创建 generateText mock
function createGenerateText(responses: Array<{ toolCalls?: AIToolCall[]; text: string }>) {
  let idx = 0;
  return (
    _config: AIServiceConfig,
    _request: TextGenerationRequest,
    _callback: unknown,
  ): Promise<{ text: string; toolCalls?: AIToolCall[]; reasoningContent?: string }> => {
    const r = responses[idx] ?? responses[responses.length - 1]!;
    idx++;
    return Promise.resolve({
      text: r.text,
      ...(r.toolCalls ? { toolCalls: r.toolCalls } : {}),
    });
  };
}

describe('crossCheckMissingWithDB（review 状态数据库交叉验证）', () => {
  afterEach(() => {
    mock.restore();
  });

  test('内存缺失但数据库已有翻译时，应同步内存并正常进入 review（不强制回退 working）', async () => {
    const taskId = 'task-1';
    const chapterId = 'ch-1';
    const paragraphIds = ['p1', 'p2', 'p3'];

    // 模拟数据库中 p3 已有翻译
    const novel = createMockNovel(chapterId, [
      createParagraphWithTranslation('p1', '翻译1'),
      createParagraphWithTranslation('p2', '翻译2'),
      createParagraphWithTranslation('p3', '翻译3'), // 数据库有翻译
    ]);

    const mockGetBookById = spyOn(BookService, 'getBookById').mockResolvedValue(novel);

    const handleToolCallSpy = spyOn(ToolRegistry, 'handleToolCall').mockImplementation(
      (toolCall) => {
        if (toolCall.function.name === 'update_task_status') {
          const args = JSON.parse(toolCall.function.arguments || '{}') as { status?: string };
          return Promise.resolve({
            content: JSON.stringify({ success: true, new_status: args.status }),
          } as any);
        }
        if (toolCall.function.name === 'add_translation_batch') {
          return Promise.resolve({
            content: JSON.stringify({ success: true, saved_count: 2 }),
          } as any);
        }
        return Promise.resolve({
          content: JSON.stringify({ success: true }),
        } as any);
      },
    );

    // 流程：
    // 1. tool: preparing
    // 2. tool: working
    // 3. tool: add_translation_batch(p1, p2) — 故意不提交 p3
    // 4. tool: review — 设置 currentStatus = 'review'
    // 5. text: 纯文本 — 触发 handleStateLogic() → handleReviewState()
    //    → 内存中 p3 缺失 → crossCheckMissingWithDB → 数据库有 → 同步内存
    // 6. tool: end
    const responses: Array<{ toolCalls?: AIToolCall[]; text: string }> = [
      {
        text: '',
        toolCalls: [
          {
            id: 'call-1',
            type: 'function',
            function: { name: 'update_task_status', arguments: '{"status":"preparing"}' },
          },
        ],
      },
      {
        text: '',
        toolCalls: [
          {
            id: 'call-2',
            type: 'function',
            function: { name: 'update_task_status', arguments: '{"status":"working"}' },
          },
        ],
      },
      {
        text: '',
        toolCalls: [
          {
            id: 'call-3',
            type: 'function',
            function: {
              name: 'add_translation_batch',
              arguments: JSON.stringify({
                paragraphs: [
                  { paragraph_id: 'p1', translated_text: '翻译1' },
                  { paragraph_id: 'p2', translated_text: '翻译2' },
                ],
              }),
            },
          },
        ],
      },
      {
        text: '',
        toolCalls: [
          {
            id: 'call-4',
            type: 'function',
            function: { name: 'update_task_status', arguments: '{"status":"review"}' },
          },
        ],
      },
      // 纯文本响应：触发 handleStateLogic() → handleReviewState()
      // 此时 currentStatus 仍为 review（上一轮 processToolCalls 已设置）
      // 但 pendingStatusUpdate 已清除，所以 processTextResponse 不会再次更改状态
      // handleReviewState() 检测到 p3 缺失 → crossCheckMissingWithDB → 数据库确认有翻译 → 同步
      { text: '检查翻译完整性' },
      // review 通过后，AI 结束任务
      {
        text: '',
        toolCalls: [
          {
            id: 'call-5',
            type: 'function',
            function: { name: 'update_task_status', arguments: '{"status":"end"}' },
          },
        ],
      },
    ];

    const history: ChatMessage[] = [
      { role: 'system', content: 'system' },
      { role: 'user', content: 'start' },
    ];

    const result = await executeToolCallLoop({
      history,
      tools: createTools(),
      generateText: createGenerateText(responses),
      aiServiceConfig: { apiKey: '', baseUrl: '', model: 'test' },
      taskType: 'translation',
      chunkText: '原文内容',
      paragraphIds,
      bookId: 'book-1',
      handleAction: () => {},
      onToast: undefined,
      taskId,
      aiProcessingStore: createMockStore(taskId, chapterId),
      logLabel: 'Test-DBSync',
      maxTurns: 15,
    });

    // 应该正常结束，而不是陷入循环
    expect(result.status).toBe('end');

    // 验证 BookService.getBookById 被调用（说明触发了数据库交叉检查）
    expect(mockGetBookById).toHaveBeenCalledWith('book-1');

    // 验证内存中的段落映射应包含 p3（从数据库同步过来的）
    expect(result.paragraphs.has('p3')).toBe(true);
    expect(result.paragraphs.get('p3')).toBe('翻译3');

    // 验证历史中不应出现"段落缺失"的补翻提示
    // （因为数据库确认已翻译，handleReviewState 不会将 currentStatus 回退到 working）
    const hasMissingParagraphForceReset = history.some((m) => {
      const content = typeof m.content === 'string' ? m.content : '';
      // getMissingParagraphsPrompt 会包含缺失段落 ID 列表
      return content.includes('翻译尚未提交') || content.includes('尚未完成翻译');
    });
    expect(hasMissingParagraphForceReset).toBe(false);

    handleToolCallSpy.mockRestore();
    mockGetBookById.mockRestore();
  });

  test('内存缺失且数据库也确认缺失时，应强制回退到 working 状态要求补翻', async () => {
    const taskId = 'task-2';
    const chapterId = 'ch-2';
    const paragraphIds = ['p1', 'p2', 'p3'];

    // 模拟数据库中 p3 没有翻译
    const novel = createMockNovel(chapterId, [
      createParagraphWithTranslation('p1', '翻译1'),
      createParagraphWithTranslation('p2', '翻译2'),
      createParagraphWithoutTranslation('p3'), // 数据库也没有翻译
    ]);

    // 第二次 review 时 p3 已有翻译（因为在 working 阶段补提交了）
    const novelWithP3 = createMockNovel(chapterId, [
      createParagraphWithTranslation('p1', '翻译1'),
      createParagraphWithTranslation('p2', '翻译2'),
      createParagraphWithTranslation('p3', '翻译3'),
    ]);

    let dbCallCount = 0;
    const mockGetBookById = spyOn(BookService, 'getBookById').mockImplementation(() => {
      dbCallCount++;
      // 第一次 review：p3 在 DB 中没翻译
      // 第二次 review：p3 在 DB 中已有翻译（因为 working 补提交了）
      return Promise.resolve(dbCallCount >= 2 ? novelWithP3 : novel);
    });

    const handleToolCallSpy = spyOn(ToolRegistry, 'handleToolCall').mockImplementation(
      (toolCall) => {
        if (toolCall.function.name === 'update_task_status') {
          const args = JSON.parse(toolCall.function.arguments || '{}') as { status?: string };
          return Promise.resolve({
            content: JSON.stringify({ success: true, new_status: args.status }),
          } as any);
        }
        if (toolCall.function.name === 'add_translation_batch') {
          return Promise.resolve({
            content: JSON.stringify({ success: true, saved_count: 1 }),
          } as any);
        }
        return Promise.resolve({
          content: JSON.stringify({ success: true }),
        } as any);
      },
    );

    // 流程：
    // 1. tool: preparing
    // 2. tool: working
    // 3. tool: add_translation_batch(p1, p2)
    // 4. tool: review
    // 5. text: 触发 handleReviewState → p3 缺失 → DB 确认缺失 → 回退到 working
    // 6. tool: add_translation_batch(p3) — 补提交
    // 7. tool: review
    // 8. text: 触发 handleReviewState → 所有段落已翻译（p3 在内存中有了）
    // 9. tool: end
    const responses: Array<{ toolCalls?: AIToolCall[]; text: string }> = [
      {
        text: '',
        toolCalls: [
          {
            id: 'call-1',
            type: 'function',
            function: { name: 'update_task_status', arguments: '{"status":"preparing"}' },
          },
        ],
      },
      {
        text: '',
        toolCalls: [
          {
            id: 'call-2',
            type: 'function',
            function: { name: 'update_task_status', arguments: '{"status":"working"}' },
          },
        ],
      },
      {
        text: '',
        toolCalls: [
          {
            id: 'call-3',
            type: 'function',
            function: {
              name: 'add_translation_batch',
              arguments: JSON.stringify({
                paragraphs: [
                  { paragraph_id: 'p1', translated_text: '翻译1' },
                  { paragraph_id: 'p2', translated_text: '翻译2' },
                ],
              }),
            },
          },
        ],
      },
      {
        text: '',
        toolCalls: [
          {
            id: 'call-4',
            type: 'function',
            function: { name: 'update_task_status', arguments: '{"status":"review"}' },
          },
        ],
      },
      // 纯文本：触发第一次 handleReviewState → p3 DB 确认缺失 → 回退 working
      { text: '检查翻译完整性' },
      // 被回退到 working 后，补提交 p3
      {
        text: '',
        toolCalls: [
          {
            id: 'call-5',
            type: 'function',
            function: {
              name: 'add_translation_batch',
              arguments: JSON.stringify({
                paragraphs: [{ paragraph_id: 'p3', translated_text: '翻译3' }],
              }),
            },
          },
        ],
      },
      // 再次 review
      {
        text: '',
        toolCalls: [
          {
            id: 'call-6',
            type: 'function',
            function: { name: 'update_task_status', arguments: '{"status":"review"}' },
          },
        ],
      },
      // 纯文本：触发第二次 handleReviewState → 全部完成
      { text: '再次检查' },
      // 结束
      {
        text: '',
        toolCalls: [
          {
            id: 'call-7',
            type: 'function',
            function: { name: 'update_task_status', arguments: '{"status":"end"}' },
          },
        ],
      },
    ];

    const history: ChatMessage[] = [
      { role: 'system', content: 'system' },
      { role: 'user', content: 'start' },
    ];

    const result = await executeToolCallLoop({
      history,
      tools: createTools(),
      generateText: createGenerateText(responses),
      aiServiceConfig: { apiKey: '', baseUrl: '', model: 'test' },
      taskType: 'translation',
      chunkText: '原文内容',
      paragraphIds,
      bookId: 'book-1',
      handleAction: () => {},
      onToast: undefined,
      taskId,
      aiProcessingStore: createMockStore(taskId, chapterId),
      logLabel: 'Test-DBMissing',
      maxTurns: 20,
    });

    // 应该最终正常结束
    expect(result.status).toBe('end');

    // 数据库应该被调用过（交叉检查）
    expect(mockGetBookById).toHaveBeenCalled();

    // 最终应包含所有 3 个段落的翻译
    expect(result.paragraphs.has('p1')).toBe(true);
    expect(result.paragraphs.has('p2')).toBe(true);
    expect(result.paragraphs.has('p3')).toBe(true);

    handleToolCallSpy.mockRestore();
    mockGetBookById.mockRestore();
  });

  test('无 bookId 或 chapterId 时，应保守回退到 working（跳过数据库检查）', async () => {
    const paragraphIds = ['p1', 'p2'];

    const handleToolCallSpy = spyOn(ToolRegistry, 'handleToolCall').mockImplementation(
      (toolCall) => {
        if (toolCall.function.name === 'update_task_status') {
          const args = JSON.parse(toolCall.function.arguments || '{}') as { status?: string };
          return Promise.resolve({
            content: JSON.stringify({ success: true, new_status: args.status }),
          } as any);
        }
        if (toolCall.function.name === 'add_translation_batch') {
          return Promise.resolve({
            content: JSON.stringify({ success: true, saved_count: 1 }),
          } as any);
        }
        return Promise.resolve({
          content: JSON.stringify({ success: true }),
        } as any);
      },
    );

    const mockGetBookById = spyOn(BookService, 'getBookById');

    // 流程：
    // 1. tool: preparing
    // 2. tool: working
    // 3. tool: add_translation_batch(p1) — 只提交 p1
    // 4. tool: review
    // 5. text: handleReviewState → p2 缺失 → 无 store/taskId → 无法查 DB → 保守回退 working
    // 6. tool: add_translation_batch(p2) — 补提交
    // 7. tool: review
    // 8. text: handleReviewState → 全部完成
    // 9. tool: end
    const responses: Array<{ toolCalls?: AIToolCall[]; text: string }> = [
      {
        text: '',
        toolCalls: [
          {
            id: 'call-1',
            type: 'function',
            function: { name: 'update_task_status', arguments: '{"status":"preparing"}' },
          },
        ],
      },
      {
        text: '',
        toolCalls: [
          {
            id: 'call-2',
            type: 'function',
            function: { name: 'update_task_status', arguments: '{"status":"working"}' },
          },
        ],
      },
      {
        text: '',
        toolCalls: [
          {
            id: 'call-3',
            type: 'function',
            function: {
              name: 'add_translation_batch',
              arguments: JSON.stringify({
                paragraphs: [{ paragraph_id: 'p1', translated_text: '翻译1' }],
              }),
            },
          },
        ],
      },
      {
        text: '',
        toolCalls: [
          {
            id: 'call-4',
            type: 'function',
            function: { name: 'update_task_status', arguments: '{"status":"review"}' },
          },
        ],
      },
      // 纯文本：触发 handleReviewState → p2 缺失 → 无法查 DB → 保守回退 working
      { text: '检查翻译完整性' },
      // 被回退后补提交 p2
      {
        text: '',
        toolCalls: [
          {
            id: 'call-5',
            type: 'function',
            function: {
              name: 'add_translation_batch',
              arguments: JSON.stringify({
                paragraphs: [{ paragraph_id: 'p2', translated_text: '翻译2' }],
              }),
            },
          },
        ],
      },
      {
        text: '',
        toolCalls: [
          {
            id: 'call-6',
            type: 'function',
            function: { name: 'update_task_status', arguments: '{"status":"review"}' },
          },
        ],
      },
      // 纯文本：触发第二次 handleReviewState → 全部完成
      { text: '再次检查' },
      {
        text: '',
        toolCalls: [
          {
            id: 'call-7',
            type: 'function',
            function: { name: 'update_task_status', arguments: '{"status":"end"}' },
          },
        ],
      },
    ];

    const history: ChatMessage[] = [
      { role: 'system', content: 'system' },
      { role: 'user', content: 'start' },
    ];

    const result = await executeToolCallLoop({
      history,
      tools: createTools(),
      generateText: createGenerateText(responses),
      aiServiceConfig: { apiKey: '', baseUrl: '', model: 'test' },
      taskType: 'translation',
      chunkText: '原文内容',
      paragraphIds,
      bookId: 'book-1',
      handleAction: () => {},
      onToast: undefined,
      taskId: undefined, // 无 taskId
      aiProcessingStore: undefined, // 无 store
      logLabel: 'Test-NoStore',
      maxTurns: 20,
    });

    expect(result.status).toBe('end');
    expect(result.paragraphs.has('p1')).toBe(true);
    expect(result.paragraphs.has('p2')).toBe(true);

    // BookService 不应被调用（因为没有 aiProcessingStore，无法获取 chapterId）
    expect(mockGetBookById).not.toHaveBeenCalled();

    handleToolCallSpy.mockRestore();
    mockGetBookById.mockRestore();
  });

  test('无 paragraphIds 时应跳过完整性检查直接进入 review', async () => {
    const handleToolCallSpy = spyOn(ToolRegistry, 'handleToolCall').mockImplementation(
      (toolCall) => {
        if (toolCall.function.name === 'update_task_status') {
          const args = JSON.parse(toolCall.function.arguments || '{}') as { status?: string };
          return Promise.resolve({
            content: JSON.stringify({ success: true, new_status: args.status }),
          } as any);
        }
        return Promise.resolve({
          content: JSON.stringify({ success: true }),
        } as any);
      },
    );

    const mockGetBookById = spyOn(BookService, 'getBookById');

    const responses: Array<{ toolCalls?: AIToolCall[]; text: string }> = [
      {
        text: '',
        toolCalls: [
          {
            id: 'call-1',
            type: 'function',
            function: { name: 'update_task_status', arguments: '{"status":"preparing"}' },
          },
        ],
      },
      {
        text: '',
        toolCalls: [
          {
            id: 'call-2',
            type: 'function',
            function: { name: 'update_task_status', arguments: '{"status":"working"}' },
          },
        ],
      },
      {
        text: '',
        toolCalls: [
          {
            id: 'call-3',
            type: 'function',
            function: { name: 'update_task_status', arguments: '{"status":"review"}' },
          },
        ],
      },
      // 纯文本：触发 handleReviewState（无 paragraphIds，跳过检查）
      { text: '检查翻译' },
      {
        text: '',
        toolCalls: [
          {
            id: 'call-4',
            type: 'function',
            function: { name: 'update_task_status', arguments: '{"status":"end"}' },
          },
        ],
      },
    ];

    const history: ChatMessage[] = [
      { role: 'system', content: 'system' },
      { role: 'user', content: 'start' },
    ];

    const result = await executeToolCallLoop({
      history,
      tools: createTools(),
      generateText: createGenerateText(responses),
      aiServiceConfig: { apiKey: '', baseUrl: '', model: 'test' },
      taskType: 'translation',
      chunkText: '原文内容',
      paragraphIds: undefined, // 无 paragraphIds
      bookId: 'book-1',
      handleAction: () => {},
      onToast: undefined,
      taskId: undefined,
      aiProcessingStore: undefined,
      logLabel: 'Test-NoParagraphIds',
      maxTurns: 10,
    });

    expect(result.status).toBe('end');
    // BookService 不应被调用（因为没有 paragraphIds，不需要检查完整性）
    expect(mockGetBookById).not.toHaveBeenCalled();

    handleToolCallSpy.mockRestore();
    mockGetBookById.mockRestore();
  });
});
