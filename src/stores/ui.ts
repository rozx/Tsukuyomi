import { defineStore, acceptHMRUpdate } from 'pinia';

const STORAGE_KEY = 'luna-ai-ui-state';

/**
 * 从本地存储加载 UI 状态
 */
function loadUiStateFromStorage(): { sideMenuOpen: boolean } {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const state = JSON.parse(stored) as { sideMenuOpen?: boolean };
      return {
        sideMenuOpen: state.sideMenuOpen ?? true,
      };
    }
  } catch (error) {
    console.error('Failed to load UI state from storage:', error);
  }
  return {
    sideMenuOpen: true,
  };
}

/**
 * 保存 UI 状态到本地存储
 */
function saveUiStateToStorage(state: { sideMenuOpen: boolean }): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error('Failed to save UI state to storage:', error);
  }
}

export const useUiStore = defineStore('ui', {
  state: (): { sideMenuOpen: boolean } => loadUiStateFromStorage(),

  actions: {
    toggleSideMenu() {
      this.sideMenuOpen = !this.sideMenuOpen;
      saveUiStateToStorage(this.$state);
    },
    openSideMenu() {
      this.sideMenuOpen = true;
      saveUiStateToStorage(this.$state);
    },
    closeSideMenu() {
      this.sideMenuOpen = false;
      saveUiStateToStorage(this.$state);
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useUiStore, import.meta.hot));
}
