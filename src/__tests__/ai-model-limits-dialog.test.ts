import './setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import type { App } from 'vue';
import { getActivePinia } from 'pinia';
import PrimeVue from 'primevue/config';
import AIModelDialog from '../components/dialogs/AIModelDialog.vue';
import { AIServiceFactory } from '../services/ai/ai-service-factory';
import * as Limits from '../services/ai/model-limits/resolve';
import type { AIModel } from '../services/ai/types/ai-model';
import type { AIService } from '../services/ai/types/ai-service';

const toast = vi.hoisted(() => vi.fn());
vi.mock('src/composables/useToastHistory', () => ({ useToastWithHistory: () => ({ add: toast }) }));
let app: App | undefined;
const generate = vi.fn<AIService['generateText']>();
beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
  generate.mockReset().mockResolvedValue({ text: 'OK' });
  vi.spyOn(AIServiceFactory, 'getService').mockReturnValue({ generateText: generate } as never);
  vi.spyOn(AIServiceFactory, 'getAvailableModels').mockResolvedValue({
    success: true,
    message: 'ok',
    models: [],
  });
});
afterEach(() => {
  app?.unmount();
  app = undefined;
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  toast.mockReset();
});

async function mountDialog(overrides: Partial<AIModel> = {}, initialVisible = false) {
  const visible = ref(initialVisible),
    save = vi.fn(),
    off = { enabled: false, temperature: 0.7 };
  const model: AIModel = {
    id: 'limits-test',
    name: '测试模型',
    provider: 'openai',
    model: 'custom-model',
    apiKey: 'fixture-key',
    baseUrl: 'https://fixture.test',
    temperature: 0.7,
    maxInputTokens: 1000,
    maxOutputTokens: 100,
    limitsSource: 'manual',
    enabled: true,
    lastEdited: new Date(0),
    isDefault: { translation: off, proofreading: off, termsTranslation: off, assistant: off },
    ...overrides,
  };
  const host = document.createElement('div');
  document.body.append(host);
  app = createApp({
    setup: () => () =>
      h(AIModelDialog, { visible: visible.value, mode: 'edit', model, onSave: save }),
  });
  app.use(getActivePinia()!).use(PrimeVue).mount(host);
  visible.value = true;
  await nextTick();
  await nextTick();
  return { save, visible };
}
function click(label: string) {
  const button = [...document.querySelectorAll('button')].find(
    (b) => b.textContent?.trim() === label,
  );
  if (!button) throw new Error(`缺少按钮：${label}`);
  button.click();
}
function fill(selector: string, value: string) {
  const input = document.querySelector<HTMLInputElement>(selector)!;
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('blur', { bubbles: true }));
}

describe('模型资料、测试与思考等级表单', () => {
  it.each([true, false])('只查询 models.dev，命中=%s，未命中保留原值', async (hit) => {
    vi.spyOn(Limits, 'lookupModelLimits').mockResolvedValue(
      hit ? { contextWindow: 128000, maxOutput: 8192 } : undefined,
    );
    const { save } = await mountDialog();
    click('获取模型资料');
    await vi.waitFor(() => expect(toast).toHaveBeenCalled());
    click('保存');
    expect(save.mock.calls[0]?.[0]).toMatchObject({
      limitsSource: hit ? 'catalog' : 'manual',
      maxInputTokens: hit ? 128000 : 1000,
    });
    expect(generate).not.toHaveBeenCalled();
    expect(JSON.stringify(toast.mock.calls)).toContain('models.dev');
  });
  it('测试可用性不填入或保存模型资料，并传入当前思考等级', async () => {
    const { save } = await mountDialog({ thinkingLevel: 'high' });
    click('测试可用性');
    await vi.waitFor(() => expect(document.body.textContent).toContain('当前配置可用'));
    expect(save).not.toHaveBeenCalled();
    expect(generate.mock.calls[0]?.[0].thinkingLevel).toBe('high');
    click('保存');
    expect(save.mock.calls[0]?.[0]).toMatchObject({
      maxInputTokens: 1000,
      maxOutputTokens: 100,
      limitsSource: 'manual',
      thinkingLevel: 'high',
    });
  });
  it.each(['edit', 'close'] as const)('%s 后取消测试并丢弃迟到的成功结果', async (mode) => {
    let finish!: (result: { text: string }) => void;
    generate.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { visible } = await mountDialog();
    click('测试可用性');
    await nextTick();
    const signal = generate.mock.calls[0]![0].signal!;
    if (mode === 'close') visible.value = false;
    else fill('#edit-model input', 'other-model');
    await nextTick();
    expect(signal.aborted).toBe(true);
    finish({ text: 'OK' });
    await nextTick();
    await nextTick();
    expect(JSON.stringify(toast.mock.calls)).not.toContain('当前配置可用');
    expect(document.body.textContent).not.toContain('当前配置可用');
  });
  it('更改思考等级会保存选择，手动数值仍标记 manual', async () => {
    const { save } = await mountDialog();
    document.querySelector<HTMLElement>('#edit-thinkingLevel')!.click();
    await nextTick();
    const option = [...document.querySelectorAll<HTMLElement>('[role=option]')].find(
      (e) => e.textContent?.trim() === '高',
    );
    expect(option).toBeDefined();
    option!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await nextTick();
    fill('#edit-maxInputTokens input', '5000');
    await nextTick();
    click('保存');
    expect(save.mock.calls[0]?.[0]).toMatchObject({
      thinkingLevel: 'high',
      limitsSource: 'manual',
      maxInputTokens: 5000,
    });
  });
  it('初始即打开时正常初始化自定义头，Gemini 测试保留已保存的地址', async () => {
    await mountDialog(
      {
        provider: 'gemini',
        model: 'gemini-3-flash-preview',
        baseUrl: 'https://google-proxy.test',
        customHeaders: { 'X-Fixture': '1' },
      },
      true,
    );
    click('测试可用性');
    await vi.waitFor(() => expect(generate).toHaveBeenCalled());
    expect(generate.mock.calls[0]?.[0]).toMatchObject({
      baseUrl: 'https://google-proxy.test',
      customHeaders: { 'X-Fixture': '1' },
    });
  });
});
