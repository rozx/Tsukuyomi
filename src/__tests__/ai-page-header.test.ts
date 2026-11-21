import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { createApp, h, nextTick, type App } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import ConfirmationService from 'primevue/confirmationservice';
import messages from '../i18n';
import { provideAIPage } from '../composables/ai-page/useAIPage';
import { useAIModelsStore } from '../stores/ai-models';
import type { AIModel } from '../services/ai/types/ai-model';

const feedback = vi.hoisted(() => ({ add: vi.fn() }));
vi.mock('src/composables/useToastHistory', () => ({ useToastWithHistory: () => feedback }));

let app: App | undefined;
afterEach(() => {
  app?.unmount();
  app = undefined;
  document.body.innerHTML = '';
});

const OFF = { enabled: false, temperature: 0.7 };
const NO_DEFAULTS: AIModel['isDefault'] = {
  translation: OFF,
  proofreading: OFF,
  termsTranslation: OFF,
  assistant: OFF,
};

async function mount(models: Partial<AIModel>[] = []) {
  const pinia = createPinia();
  setActivePinia(pinia);
  useAIModelsStore().models = models as AIModel[];
  let context!: ReturnType<typeof provideAIPage>;
  app = createApp({
    setup() {
      context = provideAIPage();
      return () => h('div');
    },
  });
  app
    .use(pinia)
    .use(createI18n({ legacy: false, locale: 'en-US', messages }))
    .use(ConfirmationService)
    .mount(document.body.appendChild(document.createElement('div')));
  await nextTick();
  return context;
}

describe('AI 模型页页头（桌面与平板共用）', () => {
  it('标题、说明与统计：模型总数 / 已启用 / 已配置的任务路由', async () => {
    const context = await mount([
      { id: 'a', name: 'A', provider: 'openai', model: 'm', enabled: true, isDefault: NO_DEFAULTS },
      {
        id: 'b',
        name: 'B',
        provider: 'openai',
        model: 'm',
        enabled: false,
        isDefault: NO_DEFAULTS,
      },
    ]);
    const header = context.pageHeader.value;
    expect(header.eyebrow).toBe('AI models');
    expect(header.title).toBe('AI model workbench');
    expect(header.description).toBe('Manage models, task defaults and routing in one place.');
    expect(header.stats.map((item) => item.label)).toEqual(['Models', 'Enabled', 'Task routing']);
    expect(header.stats[0]!.value).toBe(2);
    expect(header.stats[1]!.value).toBe(1);
    expect(header.stats[2]!.value).toMatch(/^\d+\/\d+$/);
  });

  it('搜索时说明改为筛选结果数', async () => {
    const context = await mount([
      {
        id: 'a',
        name: 'Alpha',
        provider: 'openai',
        model: 'm',
        enabled: true,
        isDefault: NO_DEFAULTS,
      },
    ]);
    context.searchQuery.value = 'alpha';
    await nextTick();
    expect(context.pageHeader.value.description).toBe(
      'Showing 1 models. Edit, duplicate or adjust task routing.',
    );
  });
});
