import './setup';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MODELS_DEV_API_URL, buildLimitsCatalog } from '../services/ai/model-limits/catalog-types';
import { lookupLatestModelLimits } from '../services/ai/model-limits/live-catalog';
import { ConfigService } from '../services/ai/tasks/config-service';
import type { AIModel } from '../services/ai/types/ai-model';

const off = { enabled: false, temperature: 0.7 };
const gemini: AIModel = {
  id: 'g',
  name: 'Gemini 4 Hydrogen',
  provider: 'gemini',
  model: 'gemini-4-hydrogen',
  apiKey: '',
  baseUrl: '',
  temperature: 0.7,
  maxInputTokens: 1000,
  maxOutputTokens: 500,
  enabled: true,
  lastEdited: new Date(0),
  isDefault: { translation: off, proofreading: off, termsTranslation: off, assistant: off },
};

/** models.dev /api.json 的最小真实形态（2026-11-12 新增 gemini-4-hydrogen）。 */
const modelsDevData = {
  google: {
    id: 'google',
    models: {
      'gemini-4-hydrogen': {
        id: 'gemini-4-hydrogen',
        name: 'Gemini 4 Hydrogen',
        limit: { context: 1_048_576, output: 65_536 },
      },
    },
  },
  vercel: {
    models: {
      'google/gemini-4-hydrogen': { limit: { context: 1_000_000, output: 1_000_000 } },
    },
  },
};

function stubFetch(impl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  const spy = vi.fn(impl);
  vi.stubGlobal('fetch', spy);
  return spy;
}
const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('buildLimitsCatalog', () => {
  it('转换为 [窗口, 输出, 输入?]，跳过零窗口，未知输出记为 0', () => {
    expect(
      buildLimitsCatalog({
        a: {
          models: {
            withInput: { limit: { context: 400_000, output: 128_000, input: 272_000 } },
            noOutput: { limit: { context: 8192 } },
            zero: { limit: { context: 0, output: 100 } },
            noLimit: {},
          },
        },
        empty: { models: {} },
      }),
    ).toEqual({ a: { noOutput: [8192, 0], withInput: [400_000, 128_000, 272_000] } });
  });

  it('容忍损坏的目录数据（null 条目、非对象 models、非对象根）', () => {
    expect(
      buildLimitsCatalog({
        a: { models: { broken: null, ok: { limit: { context: 10, output: 5 } } } },
        b: { models: 42 },
        c: null,
      } as never),
    ).toEqual({ a: { ok: [10, 5] } });
    expect(buildLimitsCatalog(null as never)).toEqual({});
    expect(buildLimitsCatalog([] as never)).toEqual({});
  });
});

describe('lookupLatestModelLimits', () => {
  it('在线查询 models.dev，命中打包快照之后才收录的新模型', async () => {
    const fetchSpy = stubFetch(() => Promise.resolve(jsonResponse(modelsDevData)));
    expect(await lookupLatestModelLimits(gemini)).toEqual({
      limits: { contextWindow: 1_048_576, maxOutput: 65_536 },
      offline: false,
    });
    expect(fetchSpy.mock.calls[0]?.[0]).toBe(MODELS_DEV_API_URL);
  });

  it('在线目录可达但未收录时如实返回未命中', async () => {
    stubFetch(() => Promise.resolve(jsonResponse(modelsDevData)));
    expect(await lookupLatestModelLimits({ ...gemini, model: 'no-such-model-xyz' })).toEqual({
      limits: undefined,
      offline: false,
    });
  });

  it.each([
    ['网络错误', () => Promise.reject(new TypeError('Failed to fetch'))],
    ['HTTP 503', () => Promise.resolve(jsonResponse({}, 503))],
    ['非 JSON', () => Promise.resolve(new Response('<html>', { status: 200 }))],
    ['空目录', () => Promise.resolve(jsonResponse({}))],
  ])('在线目录不可用（%s）时回退打包快照并标记离线', async (_label, impl) => {
    stubFetch(impl);
    // 打包快照中必然存在的模型
    expect(
      await lookupLatestModelLimits({ provider: 'anthropic', model: 'claude-opus-4-7' }),
    ).toMatchObject({ limits: { contextWindow: expect.any(Number) }, offline: true });
    expect(await lookupLatestModelLimits({ ...gemini, model: 'no-such-model-xyz' })).toEqual({
      limits: undefined,
      offline: true,
    });
  });

  it('请求超时后回退打包快照', async () => {
    vi.useFakeTimers();
    stubFetch(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    );
    const pending = lookupLatestModelLimits(
      { provider: 'anthropic', model: 'claude-opus-4-7' },
      { timeoutMs: 1000 },
    );
    await vi.advanceTimersByTimeAsync(1000);
    expect(await pending).toMatchObject({ offline: true, limits: expect.any(Object) });
  });

  it('调用方取消时抛出 AbortError，不回退', async () => {
    stubFetch(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    );
    const controller = new AbortController();
    const pending = lookupLatestModelLimits(gemini, { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('ConfigService.getConfig 在线目录', () => {
  it('回归：Gemini 4 Hydrogen 已在 models.dev 收录时能获取上限', async () => {
    stubFetch(() => Promise.resolve(jsonResponse(modelsDevData)));
    expect(await ConfigService.getConfig(gemini)).toMatchObject({
      success: true,
      limitsSource: 'catalog',
      maxInputTokens: 1_048_576,
      maxOutputTokens: 65_536,
      message: expect.stringContaining('models.dev'),
    });
  });

  it('离线且内置快照命中时成功，并提示使用的是内置目录', async () => {
    stubFetch(() => Promise.reject(new TypeError('Failed to fetch')));
    const result = await ConfigService.getConfig(
      { ...gemini, provider: 'anthropic', model: 'claude-opus-4-7' },
      'en-US',
    );
    expect(result).toMatchObject({ success: true, limitsSource: 'catalog' });
    expect(result.message).toBe(
      'Could not reach models.dev; limits were taken from the built-in catalog snapshot and may be outdated.',
    );
  });

  it('离线且内置快照未命中时不误报“未收录”', async () => {
    stubFetch(() => Promise.reject(new TypeError('Failed to fetch')));
    const result = await ConfigService.getConfig(
      { ...gemini, model: 'no-such-model-xyz' },
      'en-US',
    );
    expect(result.success).toBe(false);
    expect(result.message).toBe(
      'Could not reach models.dev and the built-in catalog snapshot has no entry for this model. Existing values were kept; try again later or enter limits manually.',
    );
  });
});
