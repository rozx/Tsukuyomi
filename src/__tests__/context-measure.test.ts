import './setup';
import { describe, expect, it } from 'vitest';
import { reactive } from 'vue';
import {
  createContextAnchor,
  measureContext,
  modelContextKey,
} from '../services/ai/context/measure';
import { getEstimationMultiplier, observeTokenUsage } from '../services/ai/context/calibration';
import { contextBudgets } from '../services/ai/context/constants';
import { estimateMessagesTokenCount, estimateToolSchemaTokens } from '../utils/ai-token-utils';
import type { ChatMessage, AITool } from '../services/ai/types/ai-service';

const history: ChatMessage[] = [{ role: 'user', content: '帮我翻译这本书。' }];
const tools: AITool[] = [
  {
    type: 'function',
    function: {
      name: 'read_book',
      description: '读书',
      parameters: { type: 'object', properties: { id: { type: 'string' } } },
    },
  },
];
const request = (modelKey: string) => ({
  systemPrompt: '你是翻译助手。',
  history,
  tools,
  modelKey,
});

describe('统一上下文度量', () => {
  it('对象字段顺序变化不使相同请求的锚点失效', () => {
    const input = request('key-order');
    const anchor = createContextAnchor(input, 42000)!;
    const reordered = input.history.map((message) => ({
      content: message.content,
      role: message.role,
    }));
    expect(measureContext({ ...input, history: reordered, anchor })).toEqual({
      tokens: 42000,
      estimated: false,
    });
  });
  it('无锚点时完整估算，包含系统提示与工具定义', () => {
    const input = request('measure-fresh');
    expect(measureContext(input)).toEqual({
      tokens:
        estimateMessagesTokenCount([{ role: 'system', content: input.systemPrompt }], 1.6) +
        estimateToolSchemaTokens(tools, 1.6) +
        estimateMessagesTokenCount(history, 1.6),
      estimated: true,
    });
  });
  it('实测锚点只增加新消息的估算，并使用更新后的系数', () => {
    const input = request('measure-tail');
    const anchor = createContextAnchor(input, 42000)!;
    const tail: ChatMessage[] = [
      { role: 'assistant', content: '已经读取。' },
      { role: 'user', content: '继续翻译。' },
    ];
    expect(measureContext({ ...input, history: [...history, ...tail], anchor })).toEqual({
      tokens: 42000 + estimateMessagesTokenCount(tail, getEstimationMultiplier(input.modelKey)),
      estimated: false,
    });
    expect(measureContext({ ...input, anchor })).toEqual({ tokens: 42000, estimated: false });
  });
  it('提示词或工具变化时只加估算差额，较短提示允许减少用量', () => {
    const input = { ...request('measure-prompt'), systemPrompt: '很长的系统提示词。'.repeat(100) };
    const anchor = createContextAnchor(input, 9000)!;
    const changed = { ...input, systemPrompt: '短提示', tools: [], anchor };
    const ratio = getEstimationMultiplier(input.modelKey);
    const promptBase = estimateMessagesTokenCount(
      [{ role: 'system', content: changed.systemPrompt }],
      1,
    );
    expect(measureContext(changed)).toEqual({
      tokens: Math.max(0, Math.ceil(9000 + (promptBase - anchor.promptTokens) * ratio)),
      estimated: false,
    });
  });
  it.each(['model', 'prefix', 'shorter', 'legacy', 'metadata'])(
    '锚点 %s 失效后回退全量估算',
    (kind) => {
      const input = request(`invalidate-${kind}`);
      const anchor = createContextAnchor(input, 42000)!;
      const changed = { ...input, history: [...history] };
      if (kind === 'model') changed.modelKey = 'another';
      if (kind === 'prefix') changed.history = [{ role: 'user', content: '编辑过的正文' }];
      if (kind === 'shorter') changed.history = [];
      if (kind === 'metadata')
        changed.history = [
          {
            ...history[0]!,
            tool_calls: [
              {
                id: 'c1',
                type: 'function',
                function: { name: 'read', arguments: '{}' },
                providerMetadata: { google: { thoughtSignature: 'new' } },
              },
            ],
          },
        ];
      const candidate = kind === 'legacy' ? { inputTokens: 42000 } : anchor;
      expect(measureContext({ ...changed, anchor: candidate as typeof anchor })).toEqual(
        measureContext(changed),
      );
      expect(measureContext({ ...changed, anchor: candidate as typeof anchor }).estimated).toBe(
        true,
      );
    },
  );
  it('响应式历史可建立锚点，后续修改不能改变锚点前缀', () => {
    const input = {
      ...request('reactive'),
      history: reactive([{ role: 'user' as const, content: '正文' }]),
    };
    const anchor = createContextAnchor(input, 100);
    expect(measureContext({ ...input, anchor }).estimated).toBe(false);
    input.history[0]!.content = '已修改';
    expect(measureContext({ ...input, anchor }).estimated).toBe(true);
  });
  it.each([undefined, NaN, Infinity, -1])('没有有效 usage (%s) 时不伪造锚点', (tokens) => {
    expect(createContextAnchor(request('missing'), tokens)).toBeUndefined();
  });
  it('模型身份绑定模型配置、提供商、路由地址，不包含密钥', () => {
    const model = {
      id: 'one',
      provider: 'openai' as const,
      model: 'm',
      baseUrl: 'https://one.test',
    };
    const key = modelContextKey(model);
    for (const change of [
      { id: 'two' },
      { provider: 'gemini' as const },
      { model: 'n' },
      { baseUrl: 'https://two.test' },
    ])
      expect(modelContextKey({ ...model, ...change })).not.toBe(key);
  });
});

describe('估算自校准与压缩预算', () => {
  it('估算入口尊重乘数', () => {
    expect(estimateMessagesTokenCount(history, 2)).toBe(estimateMessagesTokenCount(history, 1) * 2);
    expect(estimateToolSchemaTokens(tools, 2)).toBe(estimateToolSchemaTokens(tools, 1) * 2);
  });
  it('按模型 EMA 更新，默认 1.6，限制在 0.5–3', () => {
    const key = 'calibration-ema';
    expect(getEstimationMultiplier(key)).toBe(1.6);
    observeTokenUsage(key, 200, 100);
    expect(getEstimationMultiplier(key)).toBeCloseTo(1.72);
    observeTokenUsage(key, 100, 100);
    expect(getEstimationMultiplier(key)).toBeCloseTo(1.504);
    observeTokenUsage(key, 100000, 100);
    expect(getEstimationMultiplier(key)).toBe(3);
    for (let i = 0; i < 10; i++) observeTokenUsage(key, 0, 100);
    expect(getEstimationMultiplier(key)).toBe(0.5);
    expect(getEstimationMultiplier('unobserved')).toBe(1.6);
    observeTokenUsage(key, 10, 0);
    expect(getEstimationMultiplier(key)).toBe(0.5);
  });
  it.each([
    [128000, 8192, 8192, 20000],
    [128000, undefined, 16384, 20000],
    [8000, 64000, 2000, 2000],
    [128000, 1, 4096, 20000],
    [200000, 100000, 32768, 20000],
  ])('窗口 %s / 输出 %s 的预算', (contextWindow, maxOutput, reserve, keepRecentBudget) => {
    expect(contextBudgets({ contextWindow, maxOutput })).toEqual({
      reserve,
      keepRecentBudget,
      threshold: contextWindow! - reserve!,
    });
  });
  it('未知窗口不提供预判阈值，但提供有界恢复预算', () => {
    expect(contextBudgets({})).toEqual({ keepRecentBudget: 20000 });
  });
});
