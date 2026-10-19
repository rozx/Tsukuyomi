import './setup';
import { createAppI18n } from '../i18n/vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import type { App } from 'vue';
import { getActivePinia } from 'pinia';
import PrimeVue from 'primevue/config';
import AIModelDialog from '../components/dialogs/AIModelDialog.vue';
import { AIServiceFactory } from '../services/ai/ai-service-factory';
import type { AIModel } from '../services/ai/types/ai-model';
import type { AvailableModelsResult, ModelInfo } from '../services/ai/types/ai-service';

vi.mock('src/composables/useToastHistory', () => ({
  useToastWithHistory: () => ({ add: vi.fn() }),
}));

type ListConfig = Parameters<(typeof AIServiceFactory)['getAvailableModels']>[1];

let app: App | undefined;
let listModels: ReturnType<
  typeof vi.fn<(provider: string, config: ListConfig) => Promise<AvailableModelsResult>>
>;

const modelsOf = (...ids: string[]): ModelInfo[] =>
  ids.map((id) => ({ id, name: id, displayName: id }));

beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
  listModels = vi.fn(() => Promise.resolve({ success: true, message: 'ok', models: [] }));
  vi.spyOn(AIServiceFactory, 'getAvailableModels').mockImplementation(listModels as never);
});
afterEach(() => {
  app?.unmount();
  app = undefined;
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function mountDialog(overrides: Partial<AIModel> = {}) {
  const visible = ref(false),
    save = vi.fn(),
    off = { enabled: false, temperature: 0.7 };
  const model: AIModel = {
    id: 'cors-test',
    name: '测试模型',
    provider: 'openai',
    model: 'custom-model',
    apiKey: 'fixture-key',
    baseUrl: 'https://fixture.test',
    temperature: 0.7,
    maxInputTokens: 1000,
    maxOutputTokens: 100,
    enabled: true,
    useCorsProxy: true,
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
  app.use(getActivePinia()!).use(PrimeVue).use(createAppI18n('zh-CN')).mount(host);
  visible.value = true;
  await nextTick();
  await nextTick();
  return { save, visible };
}

function clickButton(label: string) {
  const button = [...document.querySelectorAll('button')].find(
    (b) => b.textContent?.trim() === label,
  );
  if (!button) throw new Error(`缺少按钮：${label}`);
  button.click();
}

/** 直接点击开关本身（与标签无关），兼容 id 落在根节点或 input 上两种结构 */
function clickSwitch(name: string) {
  const input = document.querySelector<HTMLInputElement>(`input#edit-${name}, #edit-${name} input`);
  if (!input) throw new Error(`缺少开关：${name}`);
  input.click();
}

describe('CORS 开关与模型列表', () => {
  it('切换 CORS 开关后按新开关值重新拉取模型列表', async () => {
    await mountDialog();
    await vi.waitFor(() => expect(listModels).toHaveBeenCalledTimes(1));
    expect(listModels.mock.calls[0]?.[1].useCorsProxy).toBe(true);

    clickSwitch('useCorsProxy');
    await vi.waitFor(() => expect(listModels).toHaveBeenCalledTimes(2));
    expect(listModels.mock.calls[1]?.[1].useCorsProxy).toBe(false);
  });

  it('新请求中止上一次仍在进行的请求，并丢弃其迟到的结果', async () => {
    let finishStale!: (result: AvailableModelsResult) => void;
    listModels
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishStale = resolve;
          }),
      )
      .mockResolvedValueOnce({ success: true, message: 'ok', models: modelsOf('fresh') });
    await mountDialog();
    await vi.waitFor(() => expect(listModels).toHaveBeenCalledTimes(1));
    const staleSignal = listModels.mock.calls[0]?.[1].signal;
    expect(staleSignal).toBeInstanceOf(AbortSignal);

    clickSwitch('useCorsProxy');
    await vi.waitFor(() => expect(listModels).toHaveBeenCalledTimes(2));
    expect(staleSignal?.aborted).toBe(true);
    await vi.waitFor(() => expect(document.body.textContent).toContain('找到 1 个可用模型'));

    finishStale({ success: true, message: 'ok', models: modelsOf('a', 'b', 'c') });
    await nextTick();
    await nextTick();
    expect(document.body.textContent).toContain('找到 1 个可用模型');
    expect(document.body.textContent).not.toContain('找到 3 个可用模型');
  });

  it('关闭对话框时中止进行中的模型列表请求', async () => {
    listModels.mockImplementationOnce(() => new Promise(() => {}));
    const { visible } = await mountDialog();
    await vi.waitFor(() => expect(listModels).toHaveBeenCalledTimes(1));
    const signal = listModels.mock.calls[0]?.[1].signal;

    visible.value = false;
    await nextTick();
    expect(signal?.aborted).toBe(true);
  });
});

describe('开关标签', () => {
  it.each([
    ['enabled', '启用模型', 'enabled'],
    ['useCorsProxy', '使用 CORS 代理', 'useCorsProxy'],
    ['temperatureEnabled', '发送温度参数', 'temperatureEnabled'],
  ] as const)('点击「%s」标签会切换对应开关', async (name, labelText, field) => {
    const { save } = await mountDialog({ temperatureEnabled: true });
    const label = [...document.querySelectorAll('label')].find(
      (l) => l.textContent?.trim() === labelText,
    );
    if (!label) throw new Error(`缺少标签：${labelText}`);
    expect(label.htmlFor).toBe(`edit-${name}`);

    label.click();
    await nextTick();
    clickButton('保存');
    expect(save.mock.calls[0]?.[0]?.[field]).toBe(false);
  });
});

describe('Claude 新模型的温度默认值', () => {
  function fillModelId(value: string) {
    const input = document.querySelector<HTMLInputElement>('#edit-model input')!;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  it('模型标识改成拒绝温度的 Claude 模型时自动关闭发送温度', async () => {
    const { save } = await mountDialog({ model: 'gpt-6-luna', temperatureEnabled: true });
    fillModelId('claude-opus-5-5');
    await nextTick();
    clickButton('保存');
    expect(save.mock.calls[0]?.[0]).toMatchObject({
      model: 'claude-opus-5-5',
      temperatureEnabled: false,
    });
  });

  it('打开已保存的模型时不改动用户的温度设置', async () => {
    const { save } = await mountDialog({ model: 'claude-opus-5-5', temperatureEnabled: true });
    clickButton('保存');
    expect(save.mock.calls[0]?.[0]?.temperatureEnabled).toBe(true);
  });

  it('改回其他模型时不会自动重新开启温度', async () => {
    const { save } = await mountDialog({ model: 'gpt-6-luna', temperatureEnabled: true });
    fillModelId('claude-opus-5-5');
    await nextTick();
    fillModelId('claude-sonnet-4-6');
    await nextTick();
    clickButton('保存');
    expect(save.mock.calls[0]?.[0]?.temperatureEnabled).toBe(false);
  });
});
