import { describe, expect, it, mock, afterEach } from 'bun:test';
import { invokeToolHandler } from '../services/ai/tools/tool-call-invoker';
import type { ToolDefinition } from '../services/ai/tools/types';
import type { AIToolCall } from '../services/ai/types/ai-service';

/**
 * 回归测试：被截断的工具调用参数必须被拒绝，而不是被 jsonrepair 静默"修复"。
 *
 * Bug 背景：长译文撞到模型输出 token 上限时，流式拼接的 arguments 会在字符串
 * 中间被切断。jsonrepair 会把这种残缺 JSON "补全"成语法合法的对象（半截译文），
 * 工具随后以 success:true 入库，造成无告警的数据损坏。
 */

function makeToolCall(args: string): AIToolCall {
  return {
    id: 'tc-1',
    type: 'function',
    function: { name: 'test_tool', arguments: args },
  };
}

function makeStubTool(handler: ReturnType<typeof mock>): ToolDefinition {
  return {
    definition: {
      type: 'function',
      function: { name: 'test_tool', description: 'stub', parameters: { type: 'object', properties: {} } },
    },
    handler: handler as never,
  };
}

describe('tool-call-invoker - 截断参数检测', () => {
  afterEach(() => {
    mock.restore();
  });

  it('参数在字符串中间被截断时必须抛错，不得调用 handler', async () => {
    const handler = mock(() => Promise.resolve('{"success":true}'));
    const tool = makeStubTool(handler);
    const fullArgs = JSON.stringify({
      paragraph_id: 'para-1',
      translation: '这是一段很长的译文，'.repeat(50),
    });
    // 模拟输出 token 上限：在译文中间切断
    const truncated = fullArgs.slice(0, Math.floor(fullArgs.length * 0.6));

    await (expect(
      invokeToolHandler(tool, makeToolCall(truncated), { bookId: 'book-1' }),
    ).rejects.toThrow(/截断/) as unknown as Promise<void>);
    expect(handler).not.toHaveBeenCalled();
  });

  it('空参数字符串应视为无参调用（{}），不得按截断拒绝', async () => {
    // 部分 provider 对无参工具（如 list_characters）会流式返回 "" 作为 arguments
    const handler = mock(() => Promise.resolve('{"success":true}'));
    const tool = makeStubTool(handler);

    await invokeToolHandler(tool, makeToolCall(''), { bookId: 'book-1' });
    expect(handler).toHaveBeenCalledTimes(1);
    const receivedArgs = (handler.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(receivedArgs).toEqual({});
  });

  it('纯空白参数字符串同样视为无参调用（{}）', async () => {
    const handler = mock(() => Promise.resolve('{"success":true}'));
    const tool = makeStubTool(handler);

    await invokeToolHandler(tool, makeToolCall('  \n '), { bookId: 'book-1' });
    expect(handler).toHaveBeenCalledTimes(1);
    const receivedArgs = (handler.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(receivedArgs).toEqual({});
  });

  it('完整但轻微格式错误的 JSON（以 } 结尾）仍允许 jsonrepair 修复', async () => {
    const handler = mock(() => Promise.resolve('{"success":true}'));
    const tool = makeStubTool(handler);
    // 尾随逗号：语法非法但内容完整
    const malformedButComplete = '{"paragraph_id": "para-1", "translation": "完整译文",}';

    const result = await invokeToolHandler(tool, makeToolCall(malformedButComplete), {
      bookId: 'book-1',
    });
    expect(handler).toHaveBeenCalledTimes(1);
    const receivedArgs = (handler.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(receivedArgs.translation).toBe('完整译文');
    expect(result.content).toBe('{"success":true}');
  });

  it('完全合法的 JSON 正常解析', async () => {
    const handler = mock(() => Promise.resolve('{"success":true}'));
    const tool = makeStubTool(handler);

    await invokeToolHandler(tool, makeToolCall('{"paragraph_id":"para-1"}'), { bookId: 'book-1' });
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
