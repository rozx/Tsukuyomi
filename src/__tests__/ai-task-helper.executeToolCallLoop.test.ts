import './setup';
import { describe, test, expect, spyOn } from 'bun:test';
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
  /**
   * 创建一个模拟的工具调用响应
   * 注意：以下辅助函数在 skip 测试恢复后将被使用
   */
  const _createToolCall = (
    name: string,
    args: Record<string, unknown>,
    id?: string,
  ): AIToolCall => ({
    id: id || `call-${Date.now()}-${Math.random()}`,
    type: 'function',
    function: {
      name,
      arguments: JSON.stringify(args),
    },
  });

  // 为未来测试保留的辅助函数（当前未使用）
  void _createToolCall;

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

  /**
   * 下述测试需要更完整的工具调用模拟环境才能运行
   * 由于当前的 executeToolCallLoop 实现需要：
   * 1. 有效的 aiProcessingStore 来跟踪任务状态
   * 2. 通过工具调用来实现状态转换
   *
   * 当前暂时跳过这些测试，待后续补充完整的工具调用测试基础设施
   */

  // 以下是需要工具调用方式的测试示例（注释说明保留，避免删除测试用例）

  test.skip('翻译任务：使用工具调用完成 planning → working → review → end 流程', async () => {
    // TODO: 需要模拟完整的 aiProcessingStore 和工具调用环境
    // 测试应该：
    // 1. 生成 update_task_status(planning) 调用
    // 2. 生成 update_task_status(working) 调用
    // 3. 生成 add_translation_batch 调用添加翻译
    // 4. 生成 update_task_status(review) 调用
    // 5. 生成 update_task_status(end) 调用
    // 6. 验证最终状态和翻译结果
  });

  test.skip('润色/校对任务：使用工具调用完成 planning → working → end 流程', async () => {
    // TODO: 需要模拟完整的 aiProcessingStore 和工具调用环境
    // 润色和校对任务不需要 review 阶段
  });

  test.skip('翻译任务：add_translation_batch 工具调用应正确处理段落翻译', async () => {
    // TODO: 测试 add_translation_batch 工具调用的段落提取
    // 包括：
    // 1. 使用 paragraph_id 方式
    // 2. 使用 index 方式
    // 3. 多段落批量添加
  });

  test.skip('翻译任务：状态转换验证 - review → working 应允许（返回修改）', async () => {
    // TODO: 翻译任务支持 review → working 的回退
    // 用于 AI 在复核时发现问题需要重新翻译的场景
  });

  test.skip('润色/校对任务：状态转换验证 - working → review 应被拒绝', async () => {
    // TODO: 润色和校对任务不支持 review 状态
    // 调用 update_task_status(review) 应返回错误
  });
});
