import './setup';
import { describe, expect, it } from 'vitest';
import {
  getSettingsPanelComponent,
  savedIndexToTabValue,
  settingsTabsFor,
  tabValueToSavedIndex,
} from 'src/composables/settings-page/useSettingsPage';
import { useSettingsStore } from 'src/stores/settings';
import SiteMappingSettingsTab from 'src/components/settings/SiteMappingSettingsTab.vue';
import ProxySettingsTab from 'src/components/settings/ProxySettingsTab.vue';

const labelFor = (isElectron: boolean, value: string) =>
  settingsTabsFor(isElectron).find((tab) => tab.value === value)?.label;

describe('设置页标签列表', () => {
  it('Web：含代理设置与网站映射，顺序固定', () => {
    expect(settingsTabsFor(false).map((t) => t.label)).toEqual([
      '通用设置',
      'AI 模型',
      '代理设置',
      '网站映射',
      'API Keys',
      '同步设置',
      '本地嵌入',
      '爬虫设置',
      '导入/导出',
      '关于',
    ]);
  });

  it('Electron：含网站映射，不含代理设置', () => {
    const labels = settingsTabsFor(true).map((t) => t.label);
    expect(labels).toContain('网站映射');
    expect(labels).not.toContain('代理设置');
  });

  it('tab value 为连续的位置序号', () => {
    for (const electron of [false, true]) {
      expect(settingsTabsFor(electron).map((t) => t.value)).toEqual(
        settingsTabsFor(electron).map((_, i) => String(i)),
      );
    }
  });

  it('面板组件按 value 分派', () => {
    const web = settingsTabsFor(false);
    expect(getSettingsPanelComponent(false, web.find((t) => t.label === '网站映射')!.value)).toBe(
      SiteMappingSettingsTab,
    );
    expect(getSettingsPanelComponent(false, web.find((t) => t.label === '代理设置')!.value)).toBe(
      ProxySettingsTab,
    );
    const electron = settingsTabsFor(true);
    expect(
      getSettingsPanelComponent(true, electron.find((t) => t.label === '网站映射')!.value),
    ).toBe(SiteMappingSettingsTab);
  });
});

describe('已保存的标签序号在新增标签后仍指向同一逻辑标签', () => {
  const HISTORICAL: Record<number, string> = {
    0: 'AI 模型',
    2: '同步设置',
    3: '爬虫设置',
    4: '导入/导出',
    6: 'API Keys',
    7: '本地嵌入',
    8: '关于',
  };

  it.each(Object.entries(HISTORICAL))('savedIndex %s → %s（Web 与 Electron）', (index, label) => {
    expect(labelFor(false, savedIndexToTabValue(false, Number(index)))).toBe(label);
    expect(labelFor(true, savedIndexToTabValue(true, Number(index)))).toBe(label);
  });

  it('旧代理序号 1：Web 为代理设置，Electron 回退到 API Keys', () => {
    expect(labelFor(false, savedIndexToTabValue(false, 1))).toBe('代理设置');
    expect(labelFor(true, savedIndexToTabValue(true, 1))).toBe('API Keys');
  });

  it('未知序号回退到第一个标签', () => {
    expect(savedIndexToTabValue(false, 42)).toBe('0');
  });

  it('value ↔ savedIndex 往返一致，网站映射使用新序号 9', () => {
    for (const electron of [false, true]) {
      for (const tab of settingsTabsFor(electron)) {
        expect(savedIndexToTabValue(electron, tabValueToSavedIndex(electron, tab.value))).toBe(
          tab.value,
        );
      }
      const mapping = settingsTabsFor(electron).find((t) => t.label === '网站映射')!;
      expect(tabValueToSavedIndex(electron, mapping.value)).toBe(9);
    }
  });
});

describe('通用设置语言入口', () => {
  it('新标签使用 10，英文与繁中均保留原有标签映射', () => {
    for (const electron of [false, true]) {
      const general = settingsTabsFor(electron, 'en-US')[0]!;
      expect(general.label).toBe('General');
      expect(tabValueToSavedIndex(electron, general.value)).toBe(10);
      expect(settingsTabsFor(electron, 'zh-TW')[0]!.label).toBe('一般設定');
    }
  });
});

describe('首次进入设置页（没有保存过分区）', () => {
  it.each([false, true])('isElectron=%s：默认打开第一页「通用设置」', async (isElectron) => {
    const store = useSettingsStore();
    await store.loadSettings();
    const value = savedIndexToTabValue(isElectron, store.lastOpenedSettingsTab);
    expect(value).toBe('0');
    expect(labelFor(isElectron, value)).toBe('通用设置');
  });

  it('设置里缺少该字段时同样回到「通用设置」', () => {
    const store = useSettingsStore();
    store.$patch((state) => {
      delete state.settings.lastOpenedSettingsTab;
    });
    expect(labelFor(false, savedIndexToTabValue(false, store.lastOpenedSettingsTab))).toBe(
      '通用设置',
    );
  });
});

describe('其他入口用 ?tab= 指定设置分区', () => {
  async function mountSettings(path: string) {
    const { createApp, defineComponent, nextTick } = await import('vue');
    const { createMemoryHistory, createRouter } = await import('vue-router');
    const { createAppI18n } = await import('src/i18n/vue');
    const { provideSettingsPage } = await import('src/composables/settings-page/useSettingsPage');
    const store = useSettingsStore();
    await store.loadSettings();
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/:any(.*)*', component: { render: () => null } }],
    });
    await router.push(path);
    let ctx!: ReturnType<typeof provideSettingsPage>;
    const app = createApp(
      defineComponent({
        setup() {
          ctx = provideSettingsPage();
          return () => null;
        },
      }),
    );
    app.use(router).use(createAppI18n('zh-CN')).mount(document.createElement('div'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    await nextTick();
    return { ctx, store, router, app, nextTick };
  }

  it('带 ?tab=embedding 打开设置页时落在「本地嵌入」', async () => {
    const { ctx, app } = await mountSettings('/settings?tab=embedding');
    expect(labelFor(false, ctx.activeTab.value)).toBe('本地嵌入');
    app.unmount();
  });

  it('设置页已打开时再收到 ?tab=embedding 也会切过去', async () => {
    const { ctx, router, app, nextTick } = await mountSettings('/settings');
    expect(labelFor(false, ctx.activeTab.value)).toBe('通用设置');
    await router.push('/settings?tab=embedding');
    await nextTick();
    expect(labelFor(false, ctx.activeTab.value)).toBe('本地嵌入');
    app.unmount();
  });

  it('同步改了保存的分区时，已打开的设置页不跳标签', async () => {
    const { ctx, store, app, nextTick } = await mountSettings('/settings');
    const { EMBEDDING_SETTINGS_TAB } = await import('src/models/settings');
    store.$patch((state) => {
      state.settings.lastOpenedSettingsTab = EMBEDDING_SETTINGS_TAB;
    });
    await nextTick();
    expect(labelFor(false, ctx.activeTab.value)).toBe('通用设置');
    app.unmount();
  });
});
