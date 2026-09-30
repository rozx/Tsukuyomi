import { describe, expect, it } from 'vitest';
import './setup';
import {
  buildUnknownToolResult,
  buildErrorToolResult,
  invokeToolHandler,
} from '../services/ai/tools/tool-call-invoker';
import { captureExecutionLanguages } from '../services/ai/tasks/utils/execution-languages';
import type { AIToolCall } from '../services/ai/types/ai-service';
import type { ToolDefinition } from '../services/ai/tools/types';
const call: AIToolCall = {
  id: 'c',
  type: 'function',
  function: { name: 'unknown_tool', arguments: '{}' },
};
describe('工具公共反馈与稳定错误码', () => {
  it('未知工具采用执行语言且错误码不依赖说明', () => {
    const result = JSON.parse(buildUnknownToolResult(call, 'en-US').content);
    expect(result.error_code).toBe('UNKNOWN_TOOL');
    expect(result.error).toBe('Unknown tool: unknown_tool');
  });
  it('截断参数在 handler 前拒绝，英文说明不影响代码与诊断身份', async () => {
    let invoked = false;
    const tool: ToolDefinition = {
      definition: {
        type: 'function',
        function: {
          name: 'known',
          description: '',
          parameters: { type: 'object', properties: {} },
        },
      },
      handler: () => {
        invoked = true;
        return Promise.resolve('{}');
      },
    };
    let failure: unknown;
    try {
      await invokeToolHandler(
        tool,
        { ...call, function: { name: 'known', arguments: '{"text":"cut' } },
        {
          bookId: '',
          languages: captureExecutionLanguages('en-US'),
        },
      );
    } catch (error) {
      failure = error;
    }
    expect(invoked).toBe(false);
    const response = JSON.parse(buildErrorToolResult(call, failure, 'en-US').content);
    expect(response.error_code).toBe('TOOL_ARGUMENTS_TRUNCATED');
    expect(response.error).toContain('truncated');
    expect(response.error).not.toMatch(/工具参数|未知错误/);
  });
});
