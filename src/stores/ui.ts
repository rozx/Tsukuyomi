import { defineStore, acceptHMRUpdate } from 'pinia';

const STORAGE_KEY = 'luna-ai-ui-state';

/**
 * 从 localStorage 加载 UI 状态
 */
function loadUiStateFromStorage(): {
  sideMenuOpen: boolean;
  rightPanelOpen: boolean;
  rightPanelWidth: number;
} {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const state = JSON.parse(stored);
      return {
        sideMenuOpen: state.sideMenuOpen ?? true,
        rightPanelOpen: state.rightPanelOpen ?? false,
        rightPanelWidth: state.rightPanelWidth ?? 384, // 默认 384px (w-96)
      };
    }
  } catch (error) {
    console.error('Failed to load UI state from storage:', error);
  }
  return {
    sideMenuOpen: true,
    rightPanelOpen: false,
    rightPanelWidth: 384, // 默认 384px (w-96)
  };
}

/**
 * 保存 UI 状态到 localStorage
 */
function saveUiStateToStorage(state: {
  sideMenuOpen: boolean;
  rightPanelOpen: boolean;
  rightPanelWidth: number;
}): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error('Failed to save UI state to storage:', error);
  }
}

export const useUiStore = defineStore('ui', {
  state: (): {
    sideMenuOpen: boolean;
    rightPanelOpen: boolean;
    rightPanelWidth: number;
    isLoaded: boolean;
  } => ({
    sideMenuOpen: true,
    rightPanelOpen: false,
    rightPanelWidth: 384, // 默认 384px (w-96)
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
      this.rightPanelWidth = state.rightPanelWidth;
      this.isLoaded = true;
    },

    toggleSideMenu() {
      this.sideMenuOpen = !this.sideMenuOpen;
      this.saveState();
    },
    openSideMenu() {
      this.sideMenuOpen = true;
      this.saveState();
    },
    closeSideMenu() {
      this.sideMenuOpen = false;
      this.saveState();
    },
    toggleRightPanel() {
      this.rightPanelOpen = !this.rightPanelOpen;
      this.saveState();
    },
    openRightPanel() {
      this.rightPanelOpen = true;
      this.saveState();
    },
    closeRightPanel() {
      this.rightPanelOpen = false;
      this.saveState();
    },
    setRightPanelWidth(width: number) {
      // 限制宽度范围：最小 256px，最大 1024px
      this.rightPanelWidth = Math.max(256, Math.min(1024, width));
      this.saveState();
    },
    saveState() {
      saveUiStateToStorage({
        sideMenuOpen: this.sideMenuOpen,
        rightPanelOpen: this.rightPanelOpen,
        rightPanelWidth: this.rightPanelWidth,
      });
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useUiStore, import.meta.hot));
}
