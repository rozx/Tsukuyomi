import './setup';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import type { App } from 'vue';
import { getActivePinia } from 'pinia';
import { createAppI18n } from '../i18n/vue';
import { useSettingsStore } from '../stores/settings';
import { SyncDataService } from '../services/sync-data-service';
import { FirecrawlClient } from '../services/firecrawl/firecrawl-client';
import ApiKeysSettingsTab from '../components/settings/ApiKeysSettingsTab.vue';

vi.mock('primevue/password', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      props: { modelValue: String },
      emits: ['update:modelValue'],
      setup:
        (props, { emit }) =>
        () =>
          h('input', {
            type: 'password',
            value: props.modelValue,
            onInput: (event: Event) =>
              emit('update:modelValue', (event.target as HTMLInputElement).value),
          }),
    }),
  };
});
vi.mock('primevue/button', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      props: ['label'],
      setup: (props) => () => h('button', props.label),
    }),
  };
});
vi.mock('primevue/toggleswitch', () => ({ default: { render: () => null } }));

let app: App | undefined;
afterEach(() => {
  app?.unmount();
  vi.restoreAllMocks();
});

describe('API Key 设置表单同步', () => {
  it('显式保存后表单显示规范化后的 Key，清空后仍可保存', async () => {
    const settings = useSettingsStore();
    await settings.loadSettings();
    app = createApp({ render: () => h(ApiKeysSettingsTab) });
    app.use(getActivePinia()!).use(createAppI18n('zh-CN'));
    const root = document.createElement('div');
    app.mount(root);
    await nextTick();
    const input = root.querySelector('input')!;
    const button = root.querySelector('button')!;
    for (const [draft, expected] of [
      ['  saved-key  ', 'saved-key'],
      ['  ', ''],
    ]) {
      input.value = draft!;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await nextTick();
      button.click();
      await vi.waitFor(() => expect(input.value).toBe(expected));
      expect(button.disabled).toBe(true);
      expect(settings.tavilyApiKey ?? '').toBe(expected);
    }
  });

  it.each([false, true])('后台同步回填表单，保留未保存输入：%s', async (hasDraft) => {
    const settings = useSettingsStore();
    await settings.loadSettings();
    const credits = vi.spyOn(FirecrawlClient, 'getCreditUsage');
    app = createApp({ render: () => h(ApiKeysSettingsTab) });
    app.use(getActivePinia()!).use(createAppI18n('zh-CN'));
    const root = document.createElement('div');
    app.mount(root);
    await nextTick();
    const inputs = root.querySelectorAll('input');
    const tavily = inputs[0]!;
    if (hasDraft) {
      tavily.value = 'unsaved-draft';
      tavily.dispatchEvent(new Event('input', { bubbles: true }));
    }

    await SyncDataService.applyPartialRemoteData({
      settings: {
        kind: 'settings',
        value: {
          lastEdited: new Date(1000),
          tavilyApiKey: 'synced-tavily',
          firecrawlApiKey: 'synced-firecrawl',
        },
      },
    });
    await nextTick();
    expect(tavily.value).toBe(hasDraft ? 'unsaved-draft' : 'synced-tavily');
    expect(inputs[1]!.value).toBe('synced-firecrawl');
    expect(credits).not.toHaveBeenCalled();

    if (!hasDraft) {
      expect(root.querySelector('button')!.disabled).toBe(true);
      await SyncDataService.applyPartialRemoteData({
        settings: {
          kind: 'settings',
          value: {
            lastEdited: new Date(2000),
            apiKeysUpdatedAt: { tavilyApiKey: 2000, firecrawlApiKey: 2000 },
          },
        },
      });
      await nextTick();
      expect(tavily.value).toBe('');
      expect(inputs[1]!.value).toBe('');
      expect(root.querySelector('button')!.disabled).toBe(true);
    }
  });
});
