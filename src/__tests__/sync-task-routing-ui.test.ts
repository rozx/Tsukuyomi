import './setup';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import type { App } from 'vue';
import { getActivePinia } from 'pinia';
import { createAppI18n } from '../i18n/vue';
import { useSettingsStore } from '../stores/settings';
import { useAIModelsStore } from '../stores/ai-models';
import { SyncDataService } from '../services/sync-data-service';
import { aiModelService } from '../services/ai-model-service';
import { provideAIPage } from '../composables/ai-page/useAIPage';
import AIModelSettingsTab from '../components/settings/AIModelSettingsTab.vue';
import type { AIModel } from '../services/ai/types/ai-model';

vi.mock('primevue/useconfirm', () => ({ useConfirm: () => ({ require: vi.fn() }) }));
vi.mock('primevue/select', () => ({ default: { render: () => null } }));

let app: App | undefined;
afterEach(() => {
  app?.unmount();
  vi.restoreAllMocks();
});

for (const surface of ['AI 页面', '设置标签页']) {
  describe(surface, () => {
    it.each([false, true])('逐个同步模型时不清空选择（已有旧模型：%s）', async (hasOldModel) => {
      const settings = useSettingsStore();
      await settings.loadSettings();
      const models = useAIModelsStore();
      await models.loadModels();
      const saveSelection = vi.spyOn(settings, 'setTaskDefaultModelId');
      app = createApp({
        setup() {
          if (surface === 'AI 页面') provideAIPage();
          return () => (surface === 'AI 页面' ? h('div') : h(AIModelSettingsTab));
        },
      });
      app.use(getActivePinia()!).use(createAppI18n('zh-CN'));
      app.mount(document.createElement('div'));
      await nextTick();

      const task = { enabled: true, temperature: 0.7 };
      const makeModel = (id: string): AIModel => ({
        id,
        name: id,
        provider: 'openai',
        model: 'test-model',
        apiKey: 'fixture',
        baseUrl: '',
        temperature: 0.7,
        maxInputTokens: 0,
        maxOutputTokens: 0,
        enabled: true,
        lastEdited: new Date(2000),
        isDefault: {
          translation: task,
          proofreading: task,
          termsTranslation: task,
          assistant: task,
        },
      });
      // 另一模型仍是本地旧的禁用版本；其远端更新晚于 m1 到达。
      if (hasOldModel) {
        await models.addModel({ ...makeModel('m2'), enabled: false, lastEdited: new Date(0) });
      }
      settings.isSyncing = true;
      expect(
        await SyncDataService.applyPartialRemoteData({
          settings: {
            kind: 'settings',
            value: {
              lastEdited: new Date(2000),
              taskDefaultModels: { translation: 'm2', proofreading: 'm2' },
            },
          },
          'ai-models': { kind: 'ai-models', value: [makeModel('m1'), makeModel('m2')] },
        }),
      ).toEqual([]);
      await nextTick();
      await Promise.all(saveSelection.mock.results.map((result) => result.value));
      settings.isSyncing = false;
      expect(await aiModelService.getModel('m2')).toBeDefined();
      expect(settings.settings.taskDefaultModels).toEqual({
        translation: 'm2',
        proofreading: 'm2',
      });
      expect(models.getDefaultModelForTask('translation')?.id).toBe('m2');
      expect(saveSelection).not.toHaveBeenCalled();

      if (surface === 'AI 页面' && hasOldModel) {
        // 真正停用的任务仍应在整轮同步结束后清理，不能永远跳过原有校验。
        settings.isSyncing = true;
        await SyncDataService.applyPartialRemoteData({
          'ai-models': {
            kind: 'ai-models',
            value: [
              {
                ...makeModel('m2'),
                lastEdited: new Date(3000),
                isDefault: {
                  ...makeModel('m2').isDefault,
                  translation: { ...task, enabled: false },
                },
              },
            ],
          },
        });
        await nextTick();
        expect(settings.getTaskDefaultModelId('translation')).toBe('m2');
        settings.isSyncing = false;
        await nextTick();
        await Promise.all(saveSelection.mock.results.map((result) => result.value));
        expect(settings.getTaskDefaultModelId('translation')).toBeNull();
        expect(settings.getTaskDefaultModelId('proofreading')).toBe('m2');
      }
    });
  });
}
