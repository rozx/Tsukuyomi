import { defineStore, acceptHMRUpdate } from 'pinia';

const STORAGE_KEY = 'luna-ai-ui-state';

/**
 * 从 localStorage 加载 UI 状态
 */
function loadUiStateFromStorage(): { sideMenuOpen: boolean; rightPanelOpen: boolean } {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const state = JSON.parse(stored);
      return {
        sideMenuOpen: state.sideMenuOpen ?? true,
        rightPanelOpen: state.rightPanelOpen ?? false,
      };
    }
  } catch (error) {
    console.error('Failed to load UI state from storage:', error);
  }
  return {
    sideMenuOpen: true,
    rightPanelOpen: false,
  };
}

/**
 * 保存 UI 状态到 localStorage
 */
function saveUiStateToStorage(state: { sideMenuOpen: boolean; rightPanelOpen: boolean }): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error('Failed to save UI state to storage:', error);
  }
}

export const useUiStore = defineStore('ui', {
  state: (): { sideMenuOpen: boolean; rightPanelOpen: boolean; isLoaded: boolean } => ({
    sideMenuOpen: true,
    rightPanelOpen: false,
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
      this.rightPanelOpen = state.rightPanelOpen;
      this.isLoaded = true;
    },

    toggleSideMenu() {
      this.sideMenuOpen = !this.sideMenuOpen;
      saveUiStateToStorage({ sideMenuOpen: this.sideMenuOpen, rightPanelOpen: this.rightPanelOpen });
    },
    openSideMenu() {
      this.sideMenuOpen = true;
      saveUiStateToStorage({ sideMenuOpen: this.sideMenuOpen, rightPanelOpen: this.rightPanelOpen });
    },
    closeSideMenu() {
      this.sideMenuOpen = false;
      saveUiStateToStorage({ sideMenuOpen: this.sideMenuOpen, rightPanelOpen: this.rightPanelOpen });
    },
    toggleRightPanel() {
      this.rightPanelOpen = !this.rightPanelOpen;
      saveUiStateToStorage({ sideMenuOpen: this.sideMenuOpen, rightPanelOpen: this.rightPanelOpen });
    },
    openRightPanel() {
      this.rightPanelOpen = true;
      saveUiStateToStorage({ sideMenuOpen: this.sideMenuOpen, rightPanelOpen: this.rightPanelOpen });
    },
    closeRightPanel() {
      this.rightPanelOpen = false;
      saveUiStateToStorage({ sideMenuOpen: this.sideMenuOpen, rightPanelOpen: this.rightPanelOpen });
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useUiStore, import.meta.hot));
}
