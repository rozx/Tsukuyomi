import './setup';
import { describe, expect, it } from 'bun:test';
import { lookupModelLimits, resolveModelLimits } from '../services/ai/model-limits/resolve';

const catalog = {
  deepseek: { 'deepseek-v4-flash': [1_000_000, 64_000], shared: [128_000, 8192, 100_000] },
  openrouter: { shared: [64_000, 4096] },
  google: { 'gemini-test': [128_000, 8192] },
  other: { shared: [32_000, 2048], empty: [0, 1000] },
} as const;

describe('模型上限目录', () => {
  it.each([
    ['shared', 'https://api.deepseek.com/v1', 100_000, 8192],
    ['shared', 'https://openrouter.ai/api/v1', 64_000, 4096],
    ['shared', 'https://custom.test/v1', 32_000, 2048],
    ['Vendor/SHARED', 'https://custom.test/v1', 32_000, 2048],
    ['models/DEEPSEEK-V4-FLASH', '', 1_000_000, 64_000],
  ])(
    '查找 %s，优先匹配端点，跨提供商保守回退',
    async (model, baseUrl, contextWindow, maxOutput) => {
      expect(await lookupModelLimits({ model, baseUrl, provider: 'openai' }, catalog)).toEqual({
        contextWindow,
        maxOutput,
      });
    },
  );

  it('Gemini 类型定位 google，未知或零窗口条目不算命中', async () => {
    expect(
      await lookupModelLimits({ model: 'models/gemini-test', provider: 'gemini' }, catalog),
    ).toEqual({ contextWindow: 128_000, maxOutput: 8192 });
    expect(
      await lookupModelLimits({ model: 'empty', provider: 'openai' }, catalog),
    ).toBeUndefined();
    expect(
      await lookupModelLimits({ model: 'missing', provider: 'openai' }, catalog),
    ).toBeUndefined();
  });

  it('未知输出上限不把已知输出上限覆盖为零', async () => {
    expect(
      await lookupModelLimits(
        { model: 'shared', provider: 'openai' },
        {
          a: { shared: [100, 0] },
          b: { shared: [200, 50] },
        },
      ),
    ).toEqual({ contextWindow: 100, maxOutput: 50 });
  });

  it('手动值始终优先，旧值与探测值可由目录覆盖，且不修改配置', async () => {
    const model = {
      model: 'shared',
      provider: 'openai' as const,
      baseUrl: 'https://api.deepseek.com',
      maxInputTokens: 500,
      maxOutputTokens: 100,
    };
    expect(await resolveModelLimits({ ...model, limitsSource: 'manual' }, catalog)).toEqual({
      contextWindow: 500,
      maxOutput: 100,
      source: 'manual',
    });
    expect(await resolveModelLimits({ ...model, limitsSource: 'probe' }, catalog)).toEqual({
      contextWindow: 100_000,
      maxOutput: 8192,
      source: 'catalog',
    });
    expect(await resolveModelLimits(model, catalog)).toEqual({
      contextWindow: 100_000,
      maxOutput: 8192,
      source: 'catalog',
    });
    expect(model.maxInputTokens).toBe(500);
  });

  it.each([undefined, 'catalog', 'probe', 'manual'] as const)(
    '目录未命中时使用存储值，来源=%s',
    async (limitsSource) => {
      expect(
        await resolveModelLimits(
          {
            model: 'custom',
            provider: 'openai',
            maxInputTokens: 4000,
            maxOutputTokens: 500,
            ...(limitsSource ? { limitsSource } : {}),
          },
          catalog,
        ),
      ).toEqual({ contextWindow: 4000, maxOutput: 500, source: limitsSource ?? 'stored' });
    },
  );

  it.each([0, -1, Number.NaN, Infinity])('无效或无限窗口 %s 返回未知', async (value) => {
    expect(
      await resolveModelLimits(
        {
          model: 'custom',
          provider: 'openai',
          maxInputTokens: value,
          maxOutputTokens: value,
          limitsSource: 'manual',
        },
        catalog,
      ),
    ).toEqual({ source: 'manual' });
  });

  it('打包目录离线可用', async () => {
    const result = await lookupModelLimits({
      provider: 'openai',
      model: 'deepseek-v4-flash',
      baseUrl: 'https://api.deepseek.com',
    });
    expect(result?.contextWindow).toBeGreaterThan(0);
  });
});
