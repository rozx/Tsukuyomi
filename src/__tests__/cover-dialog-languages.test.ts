import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { createApp, h, nextTick } from 'vue';
import type { App, Slots } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import PrimeVue from 'primevue/config';
import messages from '../i18n';
import CoverManagerDialog from '../components/dialogs/CoverManagerDialog.vue';
import MobileBottomSheet from '../components/layout/MobileBottomSheet.vue';
const toast = vi.hoisted(() => ({ add: vi.fn() }));
vi.mock('src/composables/useToastHistory', () => ({ useToastWithHistory: () => toast }));
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
let app: App | undefined;
afterEach(() => {
  app?.unmount();
  app = undefined;
  toast.add.mockClear();
  document.body.innerHTML = '';
});
function click(text: string) {
  const button = [...document.querySelectorAll('button')].find(
    (b) => b.textContent?.trim() === text,
  );
  expect(button).toBeDefined();
  button!.click();
}
describe('封面弹窗与通用关闭说明', () => {
  it('切语言更新封面说明和校验，URL草稿保持', async () => {
    const i18n = createI18n({ legacy: false, locale: 'en-US', messages });
    app = createApp({ setup: () => () => h(CoverManagerDialog, { visible: true }) });
    app
      .use(createPinia())
      .use(i18n)
      .use(PrimeVue)
      .mount(document.body.appendChild(document.createElement('div')));
    await nextTick();
    expect(document.body.textContent).toContain('Manage cover');
    click('Add by URL');
    await nextTick();
    const input = document.querySelector<HTMLInputElement>('input[type="text"]')!;
    input.value = '用户 URL 草稿';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    click('Add');
    await nextTick();
    expect(toast.add).toHaveBeenCalledWith(expect.objectContaining({ summary: 'Invalid URL' }));
    i18n.global.locale.value = 'zh-TW';
    await nextTick();
    expect(document.body.textContent).toContain('尚無封面歷史記錄');
    expect(input.value).toBe('用户 URL 草稿');
  });
  it('外壳默认关闭标签随语言，显式用户标签保持', async () => {
    const i18n = createI18n({ legacy: false, locale: 'en-US', messages });
    app = createApp({
      setup: () => () =>
        h('div', [
          h(MobileBottomSheet, { visible: true, title: '用户标题' }),
          h(MobileBottomSheet, { visible: true, title: '另一标题', closeLabel: '用户关闭文字' }),
        ]),
    });
    app.use(i18n).mount(document.body.appendChild(document.createElement('div')));
    await nextTick();
    expect(document.querySelectorAll('button[aria-label="Close"]').length).toBe(2);
    i18n.global.locale.value = 'zh-TW';
    await nextTick();
    expect(document.querySelectorAll('button[aria-label="關閉"]').length).toBe(2);
    expect(document.querySelectorAll('button[aria-label="用户关闭文字"]').length).toBe(2);
  });
});
