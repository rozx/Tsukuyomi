import { defineStore, acceptHMRUpdate } from 'pinia';
import { getDB } from 'src/utils/indexed-db';

/**
 * 从 IndexedDB 加载 UI 状态
 */
async function loadUiStateFromDB(): Promise<{ sideMenuOpen: boolean }> {
  try {
    const db = await getDB();
    const stored = await db.get('ui-state', 'state');
    if (stored) {
      const { key: _key, ...state } = stored;
      return {
        sideMenuOpen: state.sideMenuOpen ?? true,
      };
    }
  } catch (error) {
    console.error('Failed to load UI state from DB:', error);
  }
  return {
    sideMenuOpen: true,
  };
}

/**
 * 保存 UI 状态到 IndexedDB
 */
async function saveUiStateToDB(state: { sideMenuOpen: boolean }): Promise<void> {
  try {
    const db = await getDB();
    await db.put('ui-state', {
      key: 'state',
      ...state,
    });
  } catch (error) {
    console.error('Failed to save UI state to DB:', error);
  }
}

export const useUiStore = defineStore('ui', {
  state: (): { sideMenuOpen: boolean; isLoaded: boolean } => ({
    sideMenuOpen: true,
    isLoaded: false,
  }),

  actions: {
    /**
     * 从 IndexedDB 加载 UI 状态
     */
    async loadState(): Promise<void> {
      if (this.isLoaded) {
        return;
      }

      const state = await loadUiStateFromDB();
      this.sideMenuOpen = state.sideMenuOpen;
      this.isLoaded = true;
    },

    async toggleSideMenu() {
      this.sideMenuOpen = !this.sideMenuOpen;
      await saveUiStateToDB({ sideMenuOpen: this.sideMenuOpen });
    },
    async openSideMenu() {
      this.sideMenuOpen = true;
      await saveUiStateToDB({ sideMenuOpen: this.sideMenuOpen });
    },
    async closeSideMenu() {
      this.sideMenuOpen = false;
      await saveUiStateToDB({ sideMenuOpen: this.sideMenuOpen });
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useUiStore, import.meta.hot));
}
