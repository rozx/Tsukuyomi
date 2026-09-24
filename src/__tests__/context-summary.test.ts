import './setup';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AIServiceFactory } from '../services/ai/ai-service-factory';
import { summarizeInto } from '../services/ai/context/summarize';
import { compactHistory } from '../services/ai/context/compact-history';
import { formatSummaryMessages } from '../services/ai/context/summary-input';
import { getStructuredSummaryPrompt } from '../services/ai/tasks/prompts/assistant';
import { estimateMessagesTokenCount } from '../utils/ai-token-utils';
import type { AIModel } from '../services/ai/types/ai-model';
import type { ChatMessage } from '../services/ai/types/ai-service';

const off = { enabled: false, temperature: 0.7 };
const model: AIModel = {
  id: 'summary-model',
  provider: 'openai',
  model: 'custom-test',
  name: '测试',
  apiKey: 'fixture',
  baseUrl: 'https://fixture.test',
  enabled: true,
  lastEdited: new Date(0),
  temperature: 0.7,
  maxInputTokens: 2000,
  maxOutputTokens: 400,
  limitsSource: 'manual',
  isDefault: { translation: off, proofreading: off, termsTranslation: off, assistant: off },
};
const messages: ChatMessage[] = [
  { role: 'user', content: '翻译这本书' },
  { role: 'assistant', content: '本轮已经完成前两章，需要接着处理第三章并沿用原来的术语。' },
];
const summary = '目标：翻译这本书。进展：前两章已完成。下一步：继续处理第三章，保留术语。';
afterEach(() => vi.restoreAllMocks());
const generate = () => vi.spyOn(AIServiceFactory.getService('openai'), 'generateText');

describe('共享结构化摘要', () => {
  it('提示词更新同一份摘要，包含所有规定小节', () => {
    const prompt = getStructuredSummaryPrompt('旧摘要内容', '新增消息内容');
    for (const section of [
      '目标',
      '约束与偏好',
      '进展',
      '关键决定',
      '用户问答',
      '下一步',
      '关键标识',
      '旧摘要内容',
      '新增消息内容',
      '更新',
    ])
      expect(prompt).toContain(section);
  });
  it.each(['ask_user', 'ask_user_batch'])('保留 %s 问答和关键标识，普通工具输出仍裁剪', (name) => {
    const question = '请确认？'.repeat(120) + '末尾问题';
    const answer = '我选择保留书名。'.repeat(200) + '最终答案';
    const input: ChatMessage[] = [
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'q1',
            type: 'function',
            function: { name, arguments: JSON.stringify({ question }) },
          },
        ],
      },
      { role: 'tool', tool_call_id: 'q1', content: answer },
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'read1',
            type: 'function',
            function: {
              name: 'read_book',
              arguments: '{"book_id":"book-123","long":"' + 'x'.repeat(1000) + '"}',
            },
          },
        ],
      },
      { role: 'tool', tool_call_id: 'read1', name: 'read_book', content: 'x'.repeat(5000) },
    ];
    const text = JSON.stringify(formatSummaryMessages(input));
    expect(text).toContain('末尾问题');
    expect(text).toContain('最终答案');
    expect(text).toContain('book-123');
    expect(text).toContain('read_book');
    expect(text).not.toContain('x'.repeat(1300));
  });
  it('多段覆盖全部普通消息，每一段更新上一段摘要并限制请求与输出预算', async () => {
    const chunks: string[] = [];
    const spy = generate().mockImplementation((_config, request) => {
      const prompt = request.messages![0]!.content!;
      const segment = prompt.split('【新增对话内容】\n')[1]!;
      chunks.push(segment);
      if (chunks.length > 1) expect(prompt).toContain(`${summary}第${chunks.length - 1}段`);
      expect(request.maxOutputTokens).toBe(400);
      expect(estimateMessagesTokenCount(request.messages!)).toBeLessThanOrEqual(
        model.maxInputTokens * 0.6,
      );
      return Promise.resolve({ text: `${summary}第${chunks.length}段` });
    });
    const longMessages = [
      ...messages,
      { role: 'user' as const, content: '新请求：'.repeat(1600) + '最后一个标识' },
    ];
    const before = JSON.stringify(longMessages);
    const result = await summarizeInto({
      messages: longMessages,
      model,
      previousSummary: '旧摘要',
    });
    expect(spy.mock.calls.length).toBeGreaterThan(2);
    expect(chunks.join('')).toBe(
      formatSummaryMessages(longMessages)
        .map((m) => `[${m.role}] ${m.content}`)
        .join('\n\n'),
    );
    expect(result).toBe(`${summary}第${chunks.length}段`);
    expect(JSON.stringify(longMessages)).toBe(before);
  });
  it('输出未知时上限为 2048', async () => {
    const spy = generate().mockResolvedValue({ text: summary });
    await summarizeInto({ messages, model: { ...model, maxInputTokens: 0, maxOutputTokens: 0 } });
    expect(spy.mock.calls[0]?.[1].maxOutputTokens).toBe(2048);
  });
  it.each(['', '太短'])('拒绝无效摘要 %s，保留原历史', async (text) => {
    generate().mockResolvedValue({ text });
    const before = JSON.stringify(messages);
    await expect(
      compactHistory({
        history: messages,
        pinnedIndex: 0,
        keepRecentBudget: 0,
        previousSummary: '旧摘要',
        model,
      }),
    ).rejects.toThrow('摘要');
    expect(JSON.stringify(messages)).toBe(before);
  });
  it('接口错误不生成降级摘要', async () => {
    generate().mockRejectedValue(new Error('network failed'));
    await expect(summarizeInto({ messages, model })).rejects.toThrow('network failed');
  });
  it('取消后不继续分段、不返回候选状态', async () => {
    const controller = new AbortController();
    const spy = generate().mockImplementation(() => {
      controller.abort();
      return Promise.resolve({ text: summary });
    });
    await expect(
      compactHistory({
        history: messages,
        pinnedIndex: 0,
        keepRecentBudget: 0,
        model,
        signal: controller.signal,
      }),
    ).rejects.toThrow();
    expect(spy).toHaveBeenCalledTimes(1);
  });
  it('开始前取消时不发请求', async () => {
    const controller = new AbortController();
    controller.abort();
    const spy = generate();
    await expect(summarizeInto({ messages, model, signal: controller.signal })).rejects.toThrow();
    expect(spy).not.toHaveBeenCalled();
  });
  it('压缩只返回候选摘要和原样 kept 历史，不写存储', async () => {
    generate().mockResolvedValue({ text: summary });
    const saved = vi.spyOn(localStorage, 'setItem');
    expect(
      await compactHistory({ history: messages, pinnedIndex: 0, keepRecentBudget: 0, model }),
    ).toEqual({ summary, keep: [messages[0]] });
    expect(saved).not.toHaveBeenCalled();
  });
  it('不适用时不调用摘要模型', async () => {
    const spy = generate();
    expect(
      await compactHistory({ history: messages, pinnedIndex: 0, keepRecentBudget: 10000, model }),
    ).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });
});
