import './setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '../services/ai/tasks/config-service';
import { AIServiceFactory } from '../services/ai/ai-service-factory';
import * as Limits from '../services/ai/model-limits/resolve';
import type { AIModel } from '../services/ai/types/ai-model';
import type { AIService } from '../services/ai/types/ai-service';

const off = { enabled: false, temperature: 0.7 };
const model: AIModel = {
  id: 'test',
  name: '测试',
  provider: 'openai',
  model: 'custom-model(high)',
  apiKey: 'fixture-key',
  baseUrl: 'https://fixture.test/v1',
  temperature: 0.7,
  maxInputTokens: 50000,
  maxOutputTokens: 8192,
  enabled: true,
  lastEdited: new Date(0),
  isDefault: { translation: off, proofreading: off, termsTranslation: off, assistant: off },
  customHeaders: { 'X-Route': 'fixture' },
  useCorsProxy: false,
  thinkingLevel: 'high',
};
const generate = vi.fn<AIService['generateText']>();
const legacyProbe = vi.fn();
beforeEach(() => {
  generate.mockReset().mockResolvedValue({ text: 'OK' });
  legacyProbe
    .mockReset()
    .mockResolvedValue({ success: true, message: '模型自述', maxInputTokens: 1 });
  vi.spyOn(AIServiceFactory, 'getService').mockReturnValue({
    generateText: generate,
    getConfig: legacyProbe,
  } as never);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('models.dev 资料与独立可用性测试', () => {
  it('支持没有 AbortSignal.any 的浏览器，仍使用外部取消信号', async () => {
    vi.spyOn(AbortSignal, 'any').mockImplementation(() => {
      throw new Error('not supported');
    });
    expect(
      await ConfigService.testAvailability(model, { signal: new AbortController().signal }),
    ).toMatchObject({ success: true });
  });
  it('目录命中不需要密钥，只返回 models.dev 数据', async () => {
    vi.spyOn(Limits, 'lookupModelLimits').mockResolvedValue({
      contextWindow: 128000,
      maxOutput: 8192,
    });
    expect(await ConfigService.getConfig({ ...model, apiKey: '' })).toMatchObject({
      success: true,
      limitsSource: 'catalog',
      maxInputTokens: 128000,
      maxOutputTokens: 8192,
      message: expect.stringContaining('models.dev'),
    });
    expect(generate).not.toHaveBeenCalled();
    expect(legacyProbe).not.toHaveBeenCalled();
  });
  it('目录未命中不询问模型，也不改写现有配置', async () => {
    vi.spyOn(Limits, 'lookupModelLimits').mockResolvedValue(undefined);
    const before = JSON.stringify(model);
    expect(await ConfigService.getConfig(model)).toMatchObject({
      success: false,
      message: expect.stringContaining('手动'),
    });
    expect(generate).not.toHaveBeenCalled();
    expect(legacyProbe).not.toHaveBeenCalled();
    expect(JSON.stringify(model)).toBe(before);
  });
  it('可用性测试使用原始模型 id、头、代理和思考等级，仅生成短回复且不填配置', async () => {
    generate.mockResolvedValue({ text: '{"maxInputTokens":123,"model":"wrong-model"}' });
    const before = JSON.stringify(model);
    const result = await ConfigService.testAvailability(model);
    expect(result).toMatchObject({ success: true, durationMs: expect.any(Number) });
    expect(result).not.toHaveProperty('maxInputTokens');
    expect(JSON.stringify(model)).toBe(before);
    expect(generate).toHaveBeenCalledOnce();
    expect(generate.mock.calls[0]?.[0]).toMatchObject({
      model: 'custom-model(high)',
      baseUrl: model.baseUrl,
      apiKey: model.apiKey,
      customHeaders: model.customHeaders,
      useCorsProxy: false,
      thinkingLevel: 'high',
      signal: expect.any(AbortSignal),
    });
    expect(generate.mock.calls[0]?.[1]).toMatchObject({
      prompt: expect.stringContaining('OK'),
      maxOutputTokens: 2048,
    });
    expect(generate.mock.calls[0]?.[1].tools).toBeUndefined();
  });
  it('Gemini 测试保留自定义地址，禁用的模型也能测试而不被启用', async () => {
    await ConfigService.testAvailability({ ...model, provider: 'gemini', enabled: false });
    expect(generate.mock.calls[0]?.[0].baseUrl).toBe(model.baseUrl);
  });
  it('凭据缺失不发请求；厂商错误可见且隐藏密钥', async () => {
    expect(await ConfigService.testAvailability({ ...model, apiKey: '' })).toMatchObject({
      success: false,
    });
    expect(generate).not.toHaveBeenCalled();
    generate.mockRejectedValue(new Error('invalid credentials fixture-key'));
    const result = await ConfigService.testAvailability(model);
    expect(result.success).toBe(false);
    expect(result.message).toContain('invalid credentials');
    expect(result.message).not.toContain(model.apiKey);
  });
  it('30 秒总超时终止测试', async () => {
    vi.useFakeTimers();
    generate.mockImplementation(
      (config) =>
        new Promise((_resolve, reject) =>
          config.signal!.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          ),
        ),
    );
    const result = ConfigService.testAvailability(model);
    await vi.advanceTimersByTimeAsync(30000);
    expect(await result).toMatchObject({
      success: false,
      message: expect.stringContaining('超时'),
    });
  });
  it('调用方取消终止在途测试，已取消的测试不发请求', async () => {
    const controller = new AbortController();
    generate.mockImplementation(
      (config) =>
        new Promise((_resolve, reject) =>
          config.signal!.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          ),
        ),
    );
    const result = ConfigService.testAvailability(model, { signal: controller.signal });
    controller.abort();
    expect(await result).toMatchObject({
      success: false,
      message: expect.stringContaining('取消'),
    });
    generate.mockClear();
    await ConfigService.testAvailability(model, { signal: controller.signal });
    expect(generate).not.toHaveBeenCalled();
  });
});
