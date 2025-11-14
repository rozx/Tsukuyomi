import { defineStore, acceptHMRUpdate } from 'pinia';

export const useUiStore = defineStore('ui', {
  state: () => ({
    sideMenuOpen: true,
  }),
  actions: {
    toggleSideMenu() {
      this.sideMenuOpen = !this.sideMenuOpen;
    },
    openSideMenu() {
      this.sideMenuOpen = true;
    },
    closeSideMenu() {
      this.sideMenuOpen = false;
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useUiStore, import.meta.hot));
}
