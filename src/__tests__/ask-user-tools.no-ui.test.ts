import './setup';
import { describe, expect, it } from 'bun:test';
import { askUserTools } from 'src/services/ai/tools/ask-user-tools';

describe('ask_user tool (no UI fallback)', () => {
  it('当 window.__lunaAskUser 不存在时应返回明确错误', async () => {
    // 确保没有桥接
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window = {};

    const tool = askUserTools.find((t) => t.definition.function.name === 'ask_user');
    expect(tool).toBeTruthy();

    const res = await tool!.handler(
      { question: '你是谁？' },
      {
        onAction: () => {},
      } as any,
    );

    const obj = JSON.parse(res) as { success: boolean; error?: string };
    expect(obj.success).toBe(false);
    expect(obj.error).toContain('AskUser UI 不可用');
  });
});

