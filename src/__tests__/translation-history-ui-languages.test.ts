import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { createApp, h, nextTick } from 'vue';
import type { App, Slots } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import PrimeVue from 'primevue/config';
import messages from '../i18n';
import TranslationHistoryDialog from '../components/dialogs/TranslationHistoryDialog.vue';
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
describe('译文历史显示语言', () => {
  it('英文固定标签与语言名即时更新，另一语言版本仍不能选入简中', async () => {
    const choose = vi.fn();
    const i18n = createI18n({ legacy: false, locale: 'en-US', messages });
    app = createApp({
      setup: () => () =>
        h(TranslationHistoryDialog, {
          visible: true,
          targetLanguage: 'zh-CN',
          paragraph: {
            id: 'p',
            text: '用户原文',
            selectedTranslationId: 'cn',
            translations: [
              { id: 'cn', translation: '用户简中译文', language: 'zh-CN', aiModelId: '' },
              {
                id: 'en',
                translation: 'User English translation',
                language: 'en-US',
                aiModelId: '',
              },
            ],
          },
          'onSelect-translation': choose,
        }),
    });
    app
      .use(createPinia())
      .use(i18n)
      .use(PrimeVue)
      .mount(document.body.appendChild(document.createElement('div')));
    await nextTick();
    expect(document.body.textContent).toContain('Translation history');
    expect(document.body.textContent).toContain('Simplified Chinese');
    document.querySelector<HTMLElement>('.translation-history-item.is-disabled')!.click();
    expect(choose).not.toHaveBeenCalled();
    i18n.global.locale.value = 'zh-TW';
    await nextTick();
    expect(document.body.textContent).toContain('翻譯歷史');
    expect(document.body.textContent).toContain('用户简中译文');
  });

  it('其他语言最近有多个版本时，目标语言的历史版本仍出现且可选回', async () => {
    const choose = vi.fn();
    const i18n = createI18n({ legacy: false, locale: 'zh-CN', messages });
    const english = Array.from({ length: 5 }, (_, i) => ({
      id: `en${i}`,
      translation: `English ${i}`,
      language: 'en-US' as const,
      aiModelId: '',
    }));
    app = createApp({
      setup: () => () =>
        h(TranslationHistoryDialog, {
          visible: true,
          targetLanguage: 'zh-CN',
          paragraph: {
            id: 'p',
            text: '原文',
            selectedTranslationId: 'cn-new',
            translations: [
              { id: 'cn-old', translation: '旧简中译文', language: 'zh-CN', aiModelId: '' },
              { id: 'cn-new', translation: '新简中译文', language: 'zh-CN', aiModelId: '' },
              ...english,
            ],
          },
          'onSelect-translation': choose,
        }),
    });
    app
      .use(createPinia())
      .use(i18n)
      .use(PrimeVue)
      .mount(document.body.appendChild(document.createElement('div')));
    await nextTick();
    const items = [...document.querySelectorAll<HTMLElement>('.translation-history-item')];
    expect(items.length).toBeLessThanOrEqual(5);
    const old = items.find((item) => item.textContent?.includes('旧简中译文'));
    expect(old).toBeDefined();
    expect(old!.classList.contains('is-disabled')).toBe(false);
    old!.click();
    expect(choose).toHaveBeenCalledWith('cn-old');
  });
});
