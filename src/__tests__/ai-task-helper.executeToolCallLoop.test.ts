import './setup';
import { describe, test, expect, spyOn, mock } from 'bun:test';
import type {
  ChatMessage,
  TextGenerationRequest,
  AIServiceConfig,
  AIToolCall,
  AITool,
} from 'src/services/ai/types/ai-service';
import { executeToolCallLoop } from 'src/services/ai/tasks/utils';
import { ToolRegistry } from 'src/services/ai/tools';

/**
 * executeToolCallLoop 测试
 *
 * 重要说明：
 * 这些测试已更新为使用工具调用方式来模拟状态转换。
 * 旧的 JSON 解析方式（如 {"status":"planning"}）已被废弃。
 *
 * 当前的 executeToolCallLoop 需要：
 * 1. 使用 update_task_status 工具来更新状态
 * 2. 使用 add_translation_batch 工具来添加翻译
 * 3. 纯文本响应不会自动解析为状态更新
 */
describe('executeToolCallLoop', () => {
  test('简短规划模式下重复规划工具应注入警告提示（brief planning intake）', async () => {
    const handleToolCallSpy = spyOn(ToolRegistry, 'handleToolCall').mockImplementation(
      (toolCall) => {
        if (toolCall.function.name === 'list_terms') {
          return Promise.resolve({
            content: JSON.stringify({ success: true, terms: [] }),
          } as any);
        }
        return Promise.resolve({ content: JSON.stringify({ success: true }) } as any);
      },
    );

    try {
      const responses: Array<{ toolCalls?: AIToolCall[]; text: string }> = [
        {
          text: '',
          toolCalls: [
            {
              id: 'call-brief-1',
              type: 'function',
              function: { name: 'list_terms', arguments: '{}' },
            },
          ],
        },
      ];

      let idx = 0;
      const generateText = (): Promise<{
        text: string;
        toolCalls?: AIToolCall[];
        reasoningContent?: string;
      }> => {
        const r = responses[idx] ?? responses[responses.length - 1]!;
        idx++;
        return Promise.resolve({
          text: r.text,
          ...(r.toolCalls ? { toolCalls: r.toolCalls } : {}),
        });
      };

      const history: ChatMessage[] = [
        { role: 'system', content: 'system' },
        { role: 'user', content: 'start' },
      ];

      try {
        await executeToolCallLoop({
          history,
          tools: [
            {
              type: 'function',
              function: {
                name: 'list_terms',
                description: 'list terms',
                parameters: { type: 'object', properties: {}, required: [] },
              },
            },
          ],
          generateText,
          aiServiceConfig: { apiKey: '', baseUrl: '', model: 'test' },
          taskType: 'polish',
          chunkText: 'chunk',
          paragraphIds: [],
          bookId: 'book1',
          handleAction: () => {},
          onToast: undefined,
          taskId: undefined,
          aiProcessingStore: undefined,
          isBriefPlanning: true,
          logLabel: 'Test',
          maxTurns: 1,
        });
      } catch {
        // 预期 maxTurns 到达后抛错，这里只验证 brief planning 的工具结果注入逻辑
      }

      const warnedToolMessage = history.find(
        (m) =>
          m.role === 'tool' &&
          m.tool_call_id === 'call-brief-1' &&
          m.name === 'list_terms' &&
          typeof m.content === 'string' &&
          m.content.includes('后续 chunk 无需重复调用此工具'),
      );

      expect(warnedToolMessage).toBeDefined();
      expect(handleToolCallSpy).toHaveBeenCalledTimes(1);
    } finally {
      handleToolCallSpy.mockRestore();
    }
  });

  test('只能执行本次会话提供的 tools：未提供的工具调用应被拒绝执行', async () => {
    const handleToolCallSpy = spyOn(ToolRegistry, 'handleToolCall');

    try {
      const toolCallsResponse: AIToolCall[] = [
        {
          id: 'call-1',
          type: 'function',
          function: { name: 'list_terms', arguments: '{}' },
        },
      ];

      // 测试目的：验证未提供的工具调用会被拒绝
      // 只运行 1 轮来验证拒绝机制
      const responses = [
        // 第一次：模型试图调用未提供工具
        { toolCalls: toolCallsResponse, text: '' },
      ];

      let idx = 0;
      const generateText = (
        _config: AIServiceConfig,
        _request: TextGenerationRequest,
        _callback: unknown,
      ): Promise<{ text: string; toolCalls?: AIToolCall[]; reasoningContent?: string }> => {
        const r = responses[idx] ?? responses[responses.length - 1]!;
        idx++;
        if (r.toolCalls) {
          return Promise.resolve({ text: r.text ?? '', toolCalls: r.toolCalls });
        }
        return Promise.resolve({ text: r.text ?? '' });
      };

      const history: ChatMessage[] = [
        { role: 'system', content: 'system' },
        { role: 'user', content: 'start' },
      ];

      // 只提供一个无关工具，模拟 list_terms 不在 tools 列表里
      const tools: AITool[] = [
        {
          type: 'function',
          function: {
            name: 'search_web',
            description: 'search web',
            parameters: { type: 'object', properties: {}, required: [] },
          },
        },
      ];

      // maxTurns 设为 1，只运行一轮来验证拒绝机制
      // 使用 try-catch 因为循环无法在 1 轮内完成会抛出错误
      try {
        await executeToolCallLoop({
          history,
          tools,
          generateText,
          aiServiceConfig: { apiKey: '', baseUrl: '', model: 'test' },
          taskType: 'translation',
          chunkText: 'original chunk text',
          paragraphIds: [],
          bookId: 'book1',
          handleAction: () => {},
          onToast: undefined,
          taskId: undefined,
          aiProcessingStore: undefined,
          logLabel: 'Test',
          maxTurns: 1,
        });
      } catch {
        // 预期会因为 maxTurns 达到限制而抛出错误，忽略
      }

      // 验证未提供的工具调用不应真正执行
      expect(handleToolCallSpy).not.toHaveBeenCalled();

      // 历史中应出现对该工具的拒绝提示（作为 tool 消息）
      const refused = history.some((m) => {
        const mm = m as unknown as { role: string; name?: string; content?: string };
        return (
          mm.role === 'tool' &&
          mm.name === 'list_terms' &&
          typeof mm.content === 'string' &&
          mm.content.includes('未在本次会话提供')
        );
      });
      expect(refused).toBe(true);
    } finally {
      handleToolCallSpy.mockRestore();
    }
  });

  test('working 阶段应拒绝术语写入并累计拒绝计数', async () => {
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

    try {
      const responses: Array<{ toolCalls?: AIToolCall[]; text: string }> = [
        {
          text: '',
          toolCalls: [
            {
              id: 'call-1',
              type: 'function',
              function: {
                name: 'update_task_status',
                arguments: '{"status":"preparing"}',
              },
            },
          ],
        },
        {
          text: '',
          toolCalls: [
            {
              id: 'call-2',
              type: 'function',
              function: {
                name: 'update_task_status',
                arguments: '{"status":"working"}',
              },
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
                name: 'create_term',
                arguments: '{"term":"勇者","translation":"勇者"}',
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
              function: {
                name: 'update_task_status',
                arguments: '{"status":"end"}',
              },
            },
          ],
        },
      ];

      let idx = 0;
      const generateText = (): Promise<{
        text: string;
        toolCalls?: AIToolCall[];
        reasoningContent?: string;
      }> => {
        const r = responses[idx] ?? responses[responses.length - 1]!;
        idx++;
        return Promise.resolve({
          text: r.text,
          ...(r.toolCalls ? { toolCalls: r.toolCalls } : {}),
        });
      };

      const history: ChatMessage[] = [
        { role: 'system', content: 'system' },
        { role: 'user', content: 'start' },
      ];

      const tools: AITool[] = [
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
            name: 'create_term',
            description: 'create term',
            parameters: { type: 'object', properties: {}, required: [] },
          },
        },
      ];

      const result = await executeToolCallLoop({
        history,
        tools,
        generateText,
        aiServiceConfig: { apiKey: '', baseUrl: '', model: 'test' },
        taskType: 'polish',
        chunkText: 'chunk',
        paragraphIds: [],
        bookId: 'book1',
        handleAction: () => {},
        onToast: undefined,
        taskId: undefined,
        aiProcessingStore: undefined,
        logLabel: 'Test',
        maxTurns: 10,
      });

      expect(result.status).toBe('end');
      expect(result.metrics?.workingRejectedWriteCount).toBe(1);

      const createTermCalls = (handleToolCallSpy as any).mock.calls.filter(
        (call: any[]) => call?.[0]?.function?.name === 'create_term',
      );
      expect(createTermCalls.length).toBe(0);

      const hasStatusRestrictionPrompt = history.some((m) => {
        const mm = m as unknown as { role: string; name?: string; content?: string };
        return (
          mm.role === 'tool' &&
          mm.name === 'create_term' &&
          mm.content?.includes('当前状态为 working')
        );
      });
      expect(hasStatusRestrictionPrompt).toBe(true);
    } finally {
      handleToolCallSpy.mockRestore();
    }
  });

  test('preparing 阶段应允许术语写入', async () => {
    const handleToolCallSpy = spyOn(ToolRegistry, 'handleToolCall').mockImplementation(
      (toolCall) => {
        if (toolCall.function.name === 'update_task_status') {
          const args = JSON.parse(toolCall.function.arguments || '{}') as { status?: string };
          return Promise.resolve({
            content: JSON.stringify({ success: true, new_status: args.status }),
          } as any);
        }
        if (toolCall.function.name === 'create_term') {
          return Promise.resolve({
            content: JSON.stringify({ success: true, term_id: 'term-1' }),
          } as any);
        }
        return Promise.resolve({
          content: JSON.stringify({ success: true }),
        } as any);
      },
    );

    try {
      const responses: Array<{ toolCalls?: AIToolCall[]; text: string }> = [
        {
          text: '',
          toolCalls: [
            {
              id: 'call-1',
              type: 'function',
              function: {
                name: 'update_task_status',
                arguments: '{"status":"preparing"}',
              },
            },
          ],
        },
        {
          text: '',
          toolCalls: [
            {
              id: 'call-2',
              type: 'function',
              function: {
                name: 'create_term',
                arguments: '{"term":"勇者","translation":"勇者"}',
              },
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
                name: 'update_task_status',
                arguments: '{"status":"working"}',
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
              function: {
                name: 'update_task_status',
                arguments: '{"status":"end"}',
              },
            },
          ],
        },
      ];

      let idx = 0;
      const generateText = (): Promise<{
        text: string;
        toolCalls?: AIToolCall[];
        reasoningContent?: string;
      }> => {
        const r = responses[idx] ?? responses[responses.length - 1]!;
        idx++;
        return Promise.resolve({
          text: r.text,
          ...(r.toolCalls ? { toolCalls: r.toolCalls } : {}),
        });
      };

      const history: ChatMessage[] = [
        { role: 'system', content: 'system' },
        { role: 'user', content: 'start' },
      ];

      const tools: AITool[] = [
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
            name: 'create_term',
            description: 'create term',
            parameters: { type: 'object', properties: {}, required: [] },
          },
        },
      ];

      const result = await executeToolCallLoop({
        history,
        tools,
        generateText,
        aiServiceConfig: { apiKey: '', baseUrl: '', model: 'test' },
        taskType: 'polish',
        chunkText: 'chunk',
        paragraphIds: [],
        bookId: 'book1',
        handleAction: () => {},
        onToast: undefined,
        taskId: undefined,
        aiProcessingStore: undefined,
        logLabel: 'Test',
        maxTurns: 10,
      });

      expect(result.status).toBe('end');
      expect(result.metrics?.workingRejectedWriteCount).toBe(0);

      const createTermCalls = (handleToolCallSpy as any).mock.calls.filter(
        (call: any[]) => call?.[0]?.function?.name === 'create_term',
      );
      expect(createTermCalls.length).toBe(1);
    } finally {
      handleToolCallSpy.mockRestore();
    }
  });

  test('add_translation_batch 成功时应优先使用 accepted_paragraphs', async () => {
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
            content: JSON.stringify({
              success: true,
              processed_count: 1,
              accepted_paragraphs: [{ paragraph_id: 'p1', translated_text: '规范译文' }],
            }),
          } as any);
        }
        return Promise.resolve({ content: JSON.stringify({ success: true }) } as any);
      },
    );

    try {
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
                arguments:
                  '{"paragraphs":[{"paragraph_id":"p-wrong","translated_text":"错误映射"}]}',
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
              function: { name: 'update_task_status', arguments: '{"status":"end"}' },
            },
          ],
        },
      ];

      let idx = 0;
      const generateText = (): Promise<{
        text: string;
        toolCalls?: AIToolCall[];
        reasoningContent?: string;
      }> => {
        const r = responses[idx] ?? responses[responses.length - 1]!;
        idx++;
        return Promise.resolve({
          text: r.text,
          ...(r.toolCalls ? { toolCalls: r.toolCalls } : {}),
        });
      };

      const result = await executeToolCallLoop({
        history: [
          { role: 'system', content: 'system' },
          { role: 'user', content: 'start' },
        ],
        tools: [
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
        ],
        generateText,
        aiServiceConfig: { apiKey: '', baseUrl: '', model: 'test' },
        taskType: 'polish',
        chunkText: 'chunk',
        paragraphIds: ['p1'],
        bookId: 'book1',
        handleAction: () => {},
        onToast: undefined,
        taskId: undefined,
        aiProcessingStore: undefined,
        logLabel: 'Test',
        maxTurns: 10,
      });

      expect(result.status).toBe('end');
      expect(result.paragraphs.get('p1')).toBe('规范译文');
      expect(result.paragraphs.has('p-wrong')).toBe(false);
    } finally {
      handleToolCallSpy.mockRestore();
    }
  });

  test('add_translation_batch 部分成功时应提取 accepted_paragraphs 且忽略 failed_paragraphs', async () => {
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
            content: JSON.stringify({
              success: true,
              processed_count: 1,
              accepted_paragraphs: [{ paragraph_id: 'p-ok', translated_text: '可接受译文' }],
              failed_paragraphs: [
                {
                  paragraph_id: 'p-bad',
                  error_code: 'ORIGINAL_TEXT_PREFIX_MISMATCH',
                  error: '原文前缀不匹配',
                },
              ],
            }),
          } as any);
        }
        return Promise.resolve({ content: JSON.stringify({ success: true }) } as any);
      },
    );

    try {
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
                arguments:
                  '{"paragraphs":[{"paragraph_id":"p-wrong","original_text_prefix":"错","translated_text":"错误映射"}]}',
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
              function: { name: 'update_task_status', arguments: '{"status":"end"}' },
            },
          ],
        },
      ];

      let idx = 0;
      const generateText = (): Promise<{
        text: string;
        toolCalls?: AIToolCall[];
        reasoningContent?: string;
      }> => {
        const r = responses[idx] ?? responses[responses.length - 1]!;
        idx++;
        return Promise.resolve({
          text: r.text,
          ...(r.toolCalls ? { toolCalls: r.toolCalls } : {}),
        });
      };

      const result = await executeToolCallLoop({
        history: [
          { role: 'system', content: 'system' },
          { role: 'user', content: 'start' },
        ],
        tools: [
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
        ],
        generateText,
        aiServiceConfig: { apiKey: '', baseUrl: '', model: 'test' },
        taskType: 'polish',
        chunkText: 'chunk',
        paragraphIds: ['p-ok'],
        bookId: 'book1',
        handleAction: () => {},
        onToast: undefined,
        taskId: undefined,
        aiProcessingStore: undefined,
        logLabel: 'Test',
        maxTurns: 10,
      });

      expect(result.status).toBe('end');
      expect(result.paragraphs.get('p-ok')).toBe('可接受译文');
      expect(result.paragraphs.has('p-bad')).toBe(false);
      expect(result.paragraphs.has('p-wrong')).toBe(false);
    } finally {
      handleToolCallSpy.mockRestore();
    }
  });

  test('add_translation_batch 成功但缺少 accepted_paragraphs 时应兼容回退旧参数提取', async () => {
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
            content: JSON.stringify({ success: true, processed_count: 1 }),
          } as any);
        }
        return Promise.resolve({ content: JSON.stringify({ success: true }) } as any);
      },
    );

    try {
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
                arguments:
                  '{"paragraphs":[{"paragraph_id":"p2","translated_text":"回退提取译文"}]}',
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
              function: { name: 'update_task_status', arguments: '{"status":"end"}' },
            },
          ],
        },
      ];

      let idx = 0;
      const generateText = (): Promise<{
        text: string;
        toolCalls?: AIToolCall[];
        reasoningContent?: string;
      }> => {
        const r = responses[idx] ?? responses[responses.length - 1]!;
        idx++;
        return Promise.resolve({
          text: r.text,
          ...(r.toolCalls ? { toolCalls: r.toolCalls } : {}),
        });
      };

      const result = await executeToolCallLoop({
        history: [
          { role: 'system', content: 'system' },
          { role: 'user', content: 'start' },
        ],
        tools: [
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
        ],
        generateText,
        aiServiceConfig: { apiKey: '', baseUrl: '', model: 'test' },
        taskType: 'polish',
        chunkText: 'chunk',
        paragraphIds: ['p2'],
        bookId: 'book1',
        handleAction: () => {},
        onToast: undefined,
        taskId: undefined,
        aiProcessingStore: undefined,
        logLabel: 'Test',
        maxTurns: 10,
      });

      expect(result.status).toBe('end');
      expect(result.paragraphs.get('p2')).toBe('回退提取译文');
    } finally {
      handleToolCallSpy.mockRestore();
    }
  });

  test('add_translation_batch 失败时不应推进段落完成映射', async () => {
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
            content: JSON.stringify({
              success: false,
              error: '参数验证失败',
              error_code: 'MISSING_PARAGRAPH_ID',
              invalid_items: [{ index: 0, reason: 'MISSING_PARAGRAPH_ID' }],
            }),
          } as any);
        }
        return Promise.resolve({ content: JSON.stringify({ success: true }) } as any);
      },
    );

    try {
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
                arguments: '{"paragraphs":[{"paragraph_id":"p3","translated_text":"不应被记录"}]}',
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
              function: { name: 'update_task_status', arguments: '{"status":"end"}' },
            },
          ],
        },
      ];

      let idx = 0;
      const generateText = (): Promise<{
        text: string;
        toolCalls?: AIToolCall[];
        reasoningContent?: string;
      }> => {
        const r = responses[idx] ?? responses[responses.length - 1]!;
        idx++;
        return Promise.resolve({
          text: r.text,
          ...(r.toolCalls ? { toolCalls: r.toolCalls } : {}),
        });
      };

      const result = await executeToolCallLoop({
        history: [
          { role: 'system', content: 'system' },
          { role: 'user', content: 'start' },
        ],
        tools: [
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
        ],
        generateText,
        aiServiceConfig: { apiKey: '', baseUrl: '', model: 'test' },
        taskType: 'polish',
        chunkText: 'chunk',
        paragraphIds: ['p3'],
        bookId: 'book1',
        handleAction: () => {},
        onToast: undefined,
        taskId: undefined,
        aiProcessingStore: undefined,
        logLabel: 'Test',
        maxTurns: 10,
      });

      expect(result.status).toBe('end');
      expect(result.paragraphs.size).toBe(0);
      expect(result.paragraphs.has('p3')).toBe(false);
    } finally {
      handleToolCallSpy.mockRestore();
    }
  });

  test('多工具调用应保持 assistant -> tool... -> user 的顺序（Golden Transcript）', async () => {
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
            content: JSON.stringify({ success: true, processed_count: 1 }),
          } as any);
        }

        return Promise.resolve({ content: JSON.stringify({ success: true }) } as any);
      },
    );

    try {
      const responses: Array<{ toolCalls?: AIToolCall[]; text: string }> = [
        {
          text: '',
          toolCalls: [
            {
              id: 'call-1',
              type: 'function',
              function: { name: 'update_task_status', arguments: '{"status":"preparing"}' },
            },
            {
              id: 'call-2',
              type: 'function',
              function: {
                name: 'add_translation_batch',
                arguments: '{"paragraphs":[{"paragraph_id":"p1","translated_text":"译文1"}]}',
              },
            },
          ],
        },
        {
          text: '',
          toolCalls: [
            {
              id: 'call-3',
              type: 'function',
              function: { name: 'update_task_status', arguments: '{"status":"working"}' },
            },
          ],
        },
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

      let idx = 0;
      const generateText = (): Promise<{
        text: string;
        toolCalls?: AIToolCall[];
        reasoningContent?: string;
      }> => {
        const r = responses[idx] ?? responses[responses.length - 1]!;
        idx++;
        return Promise.resolve({
          text: r.text,
          ...(r.toolCalls ? { toolCalls: r.toolCalls } : {}),
        });
      };

      const history: ChatMessage[] = [
        { role: 'system', content: 'system' },
        { role: 'user', content: 'start' },
      ];

      const result = await executeToolCallLoop({
        history,
        tools: [
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
        ],
        generateText,
        aiServiceConfig: { apiKey: '', baseUrl: '', model: 'test' },
        taskType: 'polish',
        chunkText: 'chunk',
        paragraphIds: ['p1'],
        bookId: 'book1',
        handleAction: () => {},
        onToast: undefined,
        taskId: undefined,
        aiProcessingStore: undefined,
        logLabel: 'Test',
        maxTurns: 10,
      });

      expect(result.status).toBe('end');

      const assistantToolIndex = history.findIndex(
        (m) => m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length === 2,
      );
      expect(assistantToolIndex).toBeGreaterThanOrEqual(0);

      const firstToolIndex = history.findIndex(
        (m) => m.role === 'tool' && m.tool_call_id === 'call-1',
      );
      const secondToolIndex = history.findIndex(
        (m) => m.role === 'tool' && m.tool_call_id === 'call-2',
      );
      const userIndex = history.findIndex(
        (m, i) => i > assistantToolIndex && m.role === 'user' && typeof m.content === 'string',
      );

      expect(firstToolIndex).toBeGreaterThan(assistantToolIndex);
      expect(secondToolIndex).toBeGreaterThan(firstToolIndex);
      expect(userIndex).toBeGreaterThan(secondToolIndex);
    } finally {
      handleToolCallSpy.mockRestore();
    }
  });
});
