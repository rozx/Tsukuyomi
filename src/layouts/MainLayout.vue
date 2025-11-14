<script setup lang="ts">
import AppHeader from '../components/AppHeader.vue';
import AppFooter from '../components/AppFooter.vue';
import AppSideMenu from '../components/AppSideMenu.vue';
import { useUiStore } from '../stores/ui';

const ui = useUiStore();
</script>

<template>
  <div class="h-screen overflow-hidden bg-luna-sky text-moon flex flex-col">
    <AppHeader />

    <div class="flex flex-1 overflow-hidden">
      <div
        class="sidebar-wrapper flex-shrink-0"
        :style="{ width: ui.sideMenuOpen ? '16rem' : '0' }"
        :aria-hidden="!ui.sideMenuOpen"
      >
        <div
          class="h-full w-64 transform transition duration-200"
          :class="ui.sideMenuOpen ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2'"
        >
          <AppSideMenu />
        </div>
      </div>
      <main class="flex-1 overflow-auto">
        <router-view />
      </main>
    </div>

    <AppFooter />
  </div>
</template>

<style scoped>
.sidebar-wrapper {
  overflow: hidden;
  transition: width 220ms cubic-bezier(0.22, 1, 0.36, 1);
  will-change: width;
}
</style>
