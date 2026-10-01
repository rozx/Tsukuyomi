import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { createApp, h, nextTick } from 'vue';
import type { App, Slots } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import PrimeVue from 'primevue/config';
import messages from '../i18n';
import AIModelDialog from '../components/dialogs/AIModelDialog.vue';
vi.mock('src/components/layout/AdaptiveDialog.vue', () => ({
  default: {
    props: ['visible', 'header'],
    setup:
      (props: { visible: boolean; header: string }, { slots }: { slots: Slots }) =>
      () =>
        props.visible
          ? h('section', [h('h2', props.header), slots.default?.(), slots.footer?.()])
          : null,
  },
}));
vi.mock('src/composables/useToastHistory', () => ({
  useToastWithHistory: () => ({ add: vi.fn() }),
}));
let app: App | undefined;
beforeEach(() =>
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  })),
);
afterEach(() => {
  app?.unmount();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});
describe('模型配置校验语言', () => {
  it('已显示校验随语言更新，未保存模型名称保持', async () => {
    const i18n = createI18n({ legacy: false, locale: 'zh-CN', messages });
    app = createApp({ setup: () => () => h(AIModelDialog, { visible: true, mode: 'add' }) });
    app
      .use(createPinia())
      .use(i18n)
      .use(PrimeVue)
      .mount(document.body.appendChild(document.createElement('div')));
    await nextTick();
    const name = document.querySelector<HTMLInputElement>(
      'input[placeholder="例如: GPT-4 翻译模型"]',
    )!;
    name.value = '用户模型草稿';
    name.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === '保存')!.click();
    await nextTick();
    expect(document.body.textContent).toContain('模型标识不能为空');
    i18n.global.locale.value = 'en-US';
    await nextTick();
    expect(document.body.textContent).toContain('Model ID is required');
    expect(document.body.textContent).not.toContain('模型标识不能为空');
    expect(name.value).toBe('用户模型草稿');
  });
});
