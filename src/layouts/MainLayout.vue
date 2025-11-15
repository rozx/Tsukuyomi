<script setup lang="ts">
import AppHeader from '../components/AppHeader.vue';
import AppFooter from '../components/AppFooter.vue';
import AppSideMenu from '../components/AppSideMenu.vue';
import { RouterView } from 'vue-router';
import { useUiStore } from '../stores/ui';

const ui = useUiStore();
</script>

<template>
  <div class="h-screen overflow-hidden bg-luna-sky text-moon flex flex-col">
    <AppHeader />

    <div class="flex flex-1 overflow-hidden min-h-0">
      <div
        class="sidebar-wrapper flex-shrink-0 flex flex-col"
        :style="{ width: ui.sideMenuOpen ? '16rem' : '0' }"
        :inert="!ui.sideMenuOpen"
      >
        <div
          class="h-full w-64 transform transition duration-200 flex flex-col"
          :class="ui.sideMenuOpen ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2'"
        >
          <AppSideMenu />
        </div>
      </div>
      <main class="flex-1 overflow-y-auto overflow-x-hidden min-h-0">
        <RouterView />
      </main>
    </div>

    <AppFooter />
  </div>
</template>

<style scoped>
.sidebar-wrapper {
  transition: width 220ms cubic-bezier(0.22, 1, 0.36, 1);
  will-change: width;
  height: 100%;
}

main {
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0; /* Required for flexbox overflow to work */
  height: 100%; /* Ensure main takes full height of flex container */
}
</style>
