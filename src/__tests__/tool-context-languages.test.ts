import { describe, expect, it, vi } from 'vitest';
import './setup';
import { invokeToolHandler } from '../services/ai/tools/tool-call-invoker';
import { captureExecutionLanguages } from '../services/ai/tasks/utils/execution-languages';
import type { ToolDefinition } from '../services/ai/tools/types';

describe('工具执行语言上下文', () => {
  it('工具宿主传入冻结语言，模型参数不能覆盖它', async () => {
    const languages = captureExecutionLanguages('en-US', 'zh-TW');
    const tool: ToolDefinition = {
      definition: {
        type: 'function',
        function: {
          name: 'inspect_languages',
          description: '',
          parameters: { type: 'object', properties: {}, required: [] },
        },
      },
      handler: (_args, context) => Promise.resolve(JSON.stringify(context.languages)),
    };
    const result = await invokeToolHandler(
      tool,
      {
        id: 'call',
        type: 'function',
        function: {
          name: 'inspect_languages',
          arguments: JSON.stringify({ targetLanguage: 'zh-CN', uiLocale: 'zh-CN' }),
        },
      },
      { bookId: 'b', languages },
    );
    expect(JSON.parse(result.content)).toEqual({ uiLocale: 'en-US', targetLanguage: 'zh-TW' });
  });
  it('操作回执绑定调用时的书籍和语言，调用方后续修改和工具自带数据不能覆盖', async () => {
    const onAction = vi.fn();
    const options = {
      bookId: 'a',
      languages: captureExecutionLanguages('en-US', 'zh-TW'),
      onAction,
    };
    const tool: ToolDefinition = {
      definition: {
        type: 'function',
        function: {
          name: 'change',
          description: '',
          parameters: { type: 'object', properties: {} },
        },
      },
      handler: (_args, context) => {
        options.bookId = 'b';
        options.languages = captureExecutionLanguages('zh-CN');
        context.onAction?.({
          type: 'update',
          entity: 'translation',
          data: { id: 'p' },
          execution: { bookId: 'wrong', languages: captureExecutionLanguages('zh-CN') },
        });
        return Promise.resolve('{"success":true}');
      },
    };
    await invokeToolHandler(
      tool,
      { id: 'call', type: 'function', function: { name: 'change', arguments: '{}' } },
      options,
    );
    const execution = onAction.mock.calls[0]?.[0].execution;
    expect(execution).toEqual({
      bookId: 'a',
      languages: { uiLocale: 'en-US', targetLanguage: 'zh-TW' },
    });
    expect(Object.isFrozen(execution)).toBe(true);
  });
});
