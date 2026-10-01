import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { createApp, h, nextTick } from 'vue';
import type { App } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import PrimeVue from 'primevue/config';
import messages from '../i18n';
import BookTranslationSettingsForm from '../components/novel/BookTranslationSettingsForm.vue';
import type { BookTranslationSettingsFormHandle } from '../composables/book-details/chapter-settings-update';
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
describe('书籍翻译设置显示语言', () => {
  it('模型占位与说明跟随语言，书籍目标和未保存开关保留', async () => {
    const i18n = createI18n({ legacy: false, locale: 'en-US', messages });
    let form!: BookTranslationSettingsFormHandle;
    app = createApp({
      setup: () => () =>
        h(BookTranslationSettingsForm, {
          ref: (value: unknown) => {
            form = value as BookTranslationSettingsFormHandle;
          },
          book: {
            id: 'b',
            title: '用户书名',
            targetLanguage: 'zh-CN',
            createdAt: new Date(),
            lastEdited: new Date(),
            taskModelOverrides: { translation: 'original-model-id' },
          },
        }),
    });
    app
      .use(createPinia())
      .use(i18n)
      .use(PrimeVue)
      .mount(document.body.appendChild(document.createElement('div')));
    await nextTick();
    expect(document.body.textContent).toContain('Options');
    expect(document.body.textContent).toContain('Use global default');
    const toggle = document.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    toggle.click();
    await nextTick();
    const before = form.buildBookLevelPayload();
    i18n.global.locale.value = 'zh-TW';
    await nextTick();
    expect(document.body.textContent).toContain('開關設定');
    expect(form.buildBookLevelPayload()).toEqual(before);
    expect(before.targetLanguage).toBe('zh-CN');
  });
});
