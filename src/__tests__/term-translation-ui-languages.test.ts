import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { createApp, h } from 'vue';
import type { App } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import messages from '../i18n';
import { useTermTranslation } from '../composables/translation/useTermTranslation';
const toast = vi.hoisted(() => ({ add: vi.fn() }));
vi.mock('src/composables/useToastHistory', () => ({ useToastWithHistory: () => toast }));
let app: App | undefined;
afterEach(() => {
  app?.unmount();
  toast.add.mockClear();
  document.body.innerHTML = '';
});
describe('术语输入翻译的界面反馈', () => {
  it('没有模型时使用英文固定说明并清理加载状态', async () => {
    let term!: ReturnType<typeof useTermTranslation>;
    app = createApp({
      setup() {
        term = useTermTranslation();
        return () => h('div');
      },
    });
    app
      .use(createPinia())
      .use(createI18n({ legacy: false, locale: 'en-US', messages }))
      .mount(document.body.appendChild(document.createElement('div')));
    expect(await term.runTermTranslation('用户原文')).toBeNull();
    expect(term.translating.value).toBe(false);
    expect(toast.add).toHaveBeenCalledWith(
      expect.objectContaining({
        summary: 'Translation failed',
        detail: 'No term translation model is available. Configure one in settings',
      }),
    );
  });
});
