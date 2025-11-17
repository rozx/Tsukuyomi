import { defineStore, acceptHMRUpdate } from 'pinia';
import type { AppSettings } from 'src/types/settings';

const STORAGE_KEY = 'luna-ai-settings';

/**
 * 默认设置
 */
const DEFAULT_SETTINGS: AppSettings = {
  scraperConcurrencyLimit: 3,
};

/**
 * 从本地存储加载设置
 */
function loadSettingsFromStorage(): AppSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const settings = JSON.parse(stored) as Partial<AppSettings>;
      // 合并默认设置，确保所有字段都存在
      return {
        ...DEFAULT_SETTINGS,
        ...settings,
      };
    }
  } catch (error) {
    console.error('Failed to load settings from storage:', error);
  }
  return { ...DEFAULT_SETTINGS };
}

/**
 * 保存设置到本地存储
 */
function saveSettingsToStorage(settings: AppSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error('Failed to save settings to storage:', error);
  }
}

export const useSettingsStore = defineStore('settings', {
  state: () => ({
    settings: loadSettingsFromStorage(),
  }),

  getters: {
    /**
     * 获取爬虫并发数限制
     */
    scraperConcurrencyLimit: (state): number => {
      return state.settings.scraperConcurrencyLimit;
    },
  },

  actions: {
    /**
     * 更新设置
     */
    updateSettings(updates: Partial<AppSettings>): void {
      this.settings = {
        ...this.settings,
        ...updates,
      };
      saveSettingsToStorage(this.settings);
    },

    /**
     * 设置爬虫并发数限制
     */
    setScraperConcurrencyLimit(limit: number): void {
      if (limit < 1) {
        limit = 1;
      }
      if (limit > 10) {
        limit = 10;
      }
      this.updateSettings({ scraperConcurrencyLimit: limit });
    },

    /**
     * 重置为默认设置
     */
    resetToDefaults(): void {
      this.settings = { ...DEFAULT_SETTINGS };
      saveSettingsToStorage(this.settings);
    },

    /**
     * 获取所有设置（用于导出）
     */
    getAllSettings(): AppSettings {
      return { ...this.settings };
    },

    /**
     * 导入设置（用于导入）
     */
    importSettings(settings: Partial<AppSettings>): void {
      this.updateSettings(settings);
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useSettingsStore, import.meta.hot));
}
