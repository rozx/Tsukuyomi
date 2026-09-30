import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { createApp, h, nextTick } from 'vue';
import type { App, Slots } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import PrimeVue from 'primevue/config';
import messages from '../i18n';
import CharacterEditDialog from '../components/dialogs/CharacterEditDialog.vue';
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
  document.body.innerHTML = '';
});
describe('角色编辑的界面语言', () => {
  it('性别选项随语言更新但草稿和目标语言不变', async () => {
    const i18n = createI18n({ legacy: false, locale: 'en-US', messages });
    app = createApp({
      setup: () => () => h(CharacterEditDialog, { visible: true, targetLanguage: 'zh-CN' }),
    });
    app
      .use(createPinia())
      .use(i18n)
      .use(PrimeVue)
      .mount(document.body.appendChild(document.createElement('div')));
    await nextTick();
    expect(document.body.textContent).toContain('Female');
    const input = document.querySelector<HTMLInputElement>(
      'input[placeholder="Enter a translation"]',
    )!;
    input.value = '用户简中译名草稿';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    i18n.global.locale.value = 'zh-TW';
    await nextTick();
    expect(document.body.textContent).toContain('女性');
    expect(input.value).toBe('用户简中译名草稿');
  });
});
