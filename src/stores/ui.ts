import { defineStore, acceptHMRUpdate } from 'pinia';

const STORAGE_KEY = 'luna-ai-ui-state';

/**
 * 从 localStorage 加载 UI 状态
 */
function loadUiStateFromStorage(): { sideMenuOpen: boolean } {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const state = JSON.parse(stored);
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
 * 保存 UI 状态到 localStorage
 */
function saveUiStateToStorage(state: { sideMenuOpen: boolean }): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error('Failed to save UI state to storage:', error);
  }
}

export const useUiStore = defineStore('ui', {
  state: (): { sideMenuOpen: boolean; isLoaded: boolean } => ({
    sideMenuOpen: true,
    isLoaded: false,
  }),

  actions: {
    /**
     * 从 localStorage 加载 UI 状态
     */
    loadState(): void {
      if (this.isLoaded) {
        return;
      }

      const state = loadUiStateFromStorage();
      this.sideMenuOpen = state.sideMenuOpen;
      this.isLoaded = true;
    },

    toggleSideMenu() {
      this.sideMenuOpen = !this.sideMenuOpen;
      saveUiStateToStorage({ sideMenuOpen: this.sideMenuOpen });
    },
    openSideMenu() {
      this.sideMenuOpen = true;
      saveUiStateToStorage({ sideMenuOpen: this.sideMenuOpen });
    },
    closeSideMenu() {
      this.sideMenuOpen = false;
      saveUiStateToStorage({ sideMenuOpen: this.sideMenuOpen });
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useUiStore, import.meta.hot));
}
