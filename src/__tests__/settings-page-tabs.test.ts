import { describe, expect, it } from 'vitest';
import {
  getSettingsPanelComponent,
  savedIndexToTabValue,
  settingsTabsFor,
  tabValueToSavedIndex,
} from 'src/composables/settings-page/useSettingsPage';
import SiteMappingSettingsTab from 'src/components/settings/SiteMappingSettingsTab.vue';
import ProxySettingsTab from 'src/components/settings/ProxySettingsTab.vue';

const labelFor = (isElectron: boolean, value: string) =>
  settingsTabsFor(isElectron).find((tab) => tab.value === value)?.label;

describe('设置页标签列表', () => {
  it('Web：含代理设置与网站映射，顺序固定', () => {
    expect(settingsTabsFor(false).map((t) => t.label)).toEqual([
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
