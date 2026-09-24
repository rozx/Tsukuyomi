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

const toast = vi.hoisted(() => vi.fn());
vi.mock('src/composables/useToastHistory', () => ({ useToastWithHistory: () => ({ add: toast }) }));
let app: App | undefined;
beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
});
afterEach(() => {
  app?.unmount();
  app = undefined;
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  toast.mockReset();
});

async function mountDialog() {
  const visible = ref(false);
  const save = vi.fn();
  const off = { enabled: false, temperature: 0.7 };
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
    enabled: true,
    lastEdited: new Date(0),
    isDefault: { translation: off, proofreading: off, termsTranslation: off, assistant: off },
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
  return save;
}
function click(label: string) {
  const button = [...document.querySelectorAll('button')].find(
    (b) => b.textContent?.trim() === label,
  );
  if (!button) throw new Error(`缺少按钮：${label}`);
  button.click();
}

describe('模型上限自动获取表单', () => {
  it.each(['catalog', 'probe'] as const)('来源 %s 正确回传，目录命中不调用模型', async (source) => {
    vi.spyOn(Limits, 'lookupModelLimits').mockResolvedValue(
      source === 'catalog' ? { contextWindow: 128000, maxOutput: 8192 } : undefined,
    );
    const probe = vi.spyOn(AIServiceFactory, 'getConfig').mockResolvedValue({
      success: true,
      message: '获取成功',
      maxInputTokens: 64000,
      maxOutputTokens: 4096,
    });
    const save = await mountDialog();
    click('获取配置');
    await vi.waitFor(() => expect(toast).toHaveBeenCalled());
    click('保存');
    expect(save.mock.calls[0]?.[0]).toMatchObject({
      limitsSource: source,
      maxInputTokens: source === 'catalog' ? 128000 : 64000,
    });
    expect(probe).toHaveBeenCalledTimes(source === 'catalog' ? 0 : 1);
    expect(JSON.stringify(toast.mock.calls)).toContain(
      source === 'catalog' ? '目录' : '可能不准确',
    );
  });

  it('修改数值字段后来源变成 manual', async () => {
    const save = await mountDialog();
    const input = document.querySelector<HTMLInputElement>('#edit-maxInputTokens input')!;
    input.value = '5000';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
    await nextTick();
    click('保存');
    expect(save.mock.calls[0]?.[0]).toMatchObject({ limitsSource: 'manual', maxInputTokens: 5000 });
  });
});
