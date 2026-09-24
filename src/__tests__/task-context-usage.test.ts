import './setup';
import { describe, expect, it, vi } from 'vitest';
import { withContextUsage } from '../services/ai/context/task-context';
import type { AIService, TextGenerationResult } from '../services/ai/types/ai-service';

describe('翻译工具循环用量', () => {
  it.each([true, false])('每次响应透传 usage，实测存在=%s，缺省时显示估算', async (known) => {
    const result: TextGenerationResult = {
      text: '译文',
      ...(known ? { usage: { inputTokens: 42000 } } : {}),
    };
    const underlying = vi.fn<AIService['generateText']>().mockResolvedValue(result);
    const updateTask = vi.fn().mockResolvedValue(undefined);
    const generate = withContextUsage(underlying, {
      modelKey: `task-${known}`,
      contextWindow: 128000,
      aiProcessingStore: { updateTask } as never,
      taskId: 't1',
    });
    expect(
      await generate(
        { apiKey: 'fixture', model: 'fixture' },
        {
          messages: [
            { role: 'system', content: '提示' },
            { role: 'user', content: '待翻译内容' },
          ],
        },
      ),
    ).toBe(result);
    const last = updateTask.mock.calls.at(-1)?.[1];
    expect(last.contextEstimated).toBe(!known);
    if (known) expect(last).toMatchObject({ contextTokens: 42000, contextPercentage: 33 });
    else expect(last.contextTokens).toBeGreaterThan(0);
    expect(underlying).toHaveBeenCalledTimes(1);
  });
  it('未知窗口清除百分比，后续缺省 usage 不复用旧实测', async () => {
    const underlying = vi
      .fn<AIService['generateText']>()
      .mockResolvedValueOnce({ text: '1', usage: { inputTokens: 40000 } })
      .mockResolvedValueOnce({ text: '2' });
    const updateTask = vi.fn().mockResolvedValue(undefined);
    const generate = withContextUsage(underlying, {
      modelKey: 'missing-usage-task',
      contextWindow: undefined,
      aiProcessingStore: { updateTask } as never,
      taskId: 't1',
    });
    const request = { messages: [{ role: 'user' as const, content: '短输入' }] };
    await generate({ apiKey: 'fixture', model: 'fixture' }, request);
    await generate({ apiKey: 'fixture', model: 'fixture' }, request);
    expect(updateTask.mock.calls.at(-1)?.[1]).toMatchObject({
      contextEstimated: true,
      contextPercentage: undefined,
    });
  });
});
