import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { createApp, h, nextTick } from 'vue';
import type { App } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import ConfirmationService from 'primevue/confirmationservice';
import messages from '../i18n';
import { provideAIPage } from '../composables/ai-page/useAIPage';
const feedback = vi.hoisted(() => ({ add: vi.fn() }));
vi.mock('src/composables/useToastHistory', () => ({ useToastWithHistory: () => feedback }));
let app: App | undefined;
afterEach(() => {
  app?.unmount();
  feedback.add.mockClear();
  document.body.innerHTML = '';
});
describe('AI模型页显示语言', () => {
  it('任务标签与路由选项切语言，机器任务键和用户搜索保持', async () => {
    const i18n = createI18n({ legacy: false, locale: 'en-US', messages });
    let context!: ReturnType<typeof provideAIPage>;
    app = createApp({
      setup() {
        context = provideAIPage();
        return () => h('div');
      },
    });
    app
      .use(createPinia())
      .use(i18n)
      .use(ConfirmationService)
      .mount(document.body.appendChild(document.createElement('div')));
    await nextTick();
    context.searchQuery.value = '用户模型搜索';
    expect(context.taskRouting.value[0]!.label).toBe('Translation (first draft)');
    expect(context.getTaskRoutingOptions('translation')[0]!.label).toBe('Select automatically');
    i18n.global.locale.value = 'zh-TW';
    await nextTick();
    expect(context.taskRouting.value[0]!.label).toBe('翻譯（初譯）');
    expect(context.taskRouting.value[0]!.task).toBe('translation');
    expect(context.searchQuery.value).toBe('用户模型搜索');
  });
});
