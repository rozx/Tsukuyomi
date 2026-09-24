import './setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, createApp, h, nextTick, provide, ref } from 'vue';
import type { App } from 'vue';
import PrimeVue from 'primevue/config';
import AiModelSelector from '../components/dialogs/AiModelSelector.vue';
import { AI_MODEL_FORM_KEY } from '../components/dialogs/ai-model-form-types';
import type { AIModelFormData } from '../components/dialogs/ai-model-form-types';

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
  vi.unstubAllGlobals();
});

async function mountSelector(hasModels = true) {
  const off = { enabled: false, temperature: 0.7 };
  const formData = ref<AIModelFormData>({
    model: 'gpt-6',
    isDefault: { translation: off, proofreading: off, termsTranslation: off, assistant: off },
  });
  const models = hasModels ? [{ id: 'gpt-6-luna' }, { id: 'gpt-6-sol' }] : [];
  app = createApp({
    setup() {
      provide(AI_MODEL_FORM_KEY, {
        formData,
        formErrors: ref({}),
        idPrefix: computed(() => 'edit'),
      });
      return () =>
        h(AiModelSelector, {
          modelOptions: models.map((model) => ({ label: model.id, value: model.id, model })),
          availableModels: models,
          isLoadingModels: false,
        });
    },
  });
  const host = document.createElement('div');
  document.body.append(host);
  app.use(PrimeVue).mount(host);
  await nextTick();
  return formData;
}

describe('模型标识输入焦点', () => {
  it.each([true, false])(
    '有模型列表=%s 时，连续字符仍进入模型标识而非筛选框',
    async (hasModels) => {
      const form = await mountSelector(hasModels);
      const input = document.querySelector<HTMLInputElement>('#edit-model input')!;
      input.focus();
      input.dispatchEvent(
        new KeyboardEvent('keydown', { key: '-', code: 'Minus', bubbles: true, cancelable: true }),
      );
      input.value = 'gpt-6-';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      // 等待真实 Select 的浮层过渡及延迟聚焦执行，不 mock 它的行为。
      await vi.waitFor(() => expect(document.querySelector('[role="listbox"]')).not.toBeNull());
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(document.activeElement).toBe(input);
      for (const character of 'luna') {
        const active = document.activeElement as HTMLInputElement;
        active.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: character,
            code: `Key${character.toUpperCase()}`,
            bubbles: true,
            cancelable: true,
          }),
        );
        active.value += character;
        active.dispatchEvent(new Event('input', { bubbles: true }));
        await nextTick();
      }
      expect(form.value.model).toBe('gpt-6-luna');
      expect(document.activeElement).toBe(input);
    },
  );

  it('方向键和回车仍可选择模型，输入法按键不被下拉框接管', async () => {
    const form = await mountSelector();
    const input = document.querySelector<HTMLInputElement>('#edit-model input')!;
    input.focus();
    const composing = new KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      isComposing: true,
      bubbles: true,
      cancelable: true,
    });
    input.dispatchEvent(composing);
    await nextTick();
    expect(composing.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(input);
    expect(form.value.model).toBe('gpt-6');
    for (const key of ['ArrowDown', 'ArrowDown', 'Enter']) {
      input.dispatchEvent(
        new KeyboardEvent('keydown', { key, code: key, bubbles: true, cancelable: true }),
      );
      await nextTick();
    }
    expect(form.value.model).toBe('gpt-6-luna');
  });

  it('用户主动点击筛选框仍可筛选并选择模型', async () => {
    const form = await mountSelector();
    const input = document.querySelector<HTMLInputElement>('#edit-model input')!;
    input.focus();
    input.value = 'gpt-6-';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.waitFor(() => expect(document.querySelector('[role="searchbox"]')).not.toBeNull());
    const filter = document.querySelector<HTMLInputElement>('[role="searchbox"]')!;
    filter.focus();
    filter.value = 'sol';
    filter.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    const options = [...document.querySelectorAll<HTMLElement>('[role="option"]')];
    expect(options).toHaveLength(1);
    expect(options[0]?.textContent).toContain('gpt-6-sol');
    options[0]!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await nextTick();
    expect(form.value.model).toBe('gpt-6-sol');
  });
});
