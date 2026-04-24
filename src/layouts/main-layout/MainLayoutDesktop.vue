<script setup lang="ts">
import AppHeader from 'src/components/layout/AppHeader.vue';
import AppFooter from 'src/components/layout/AppFooter.vue';
import AppSideMenu from 'src/components/layout/AppSideMenu.vue';
import AppRightPanel from 'src/components/layout/AppRightPanel.vue';
import { RouterView } from 'vue-router';
import { useUiStore } from 'src/stores/ui';

const ui = useUiStore();
</script>

<template>
  <div class="desktop-shell bg-tsukuyomi-sky">
    <AppHeader />

    <div class="desktop-shell-body">
      <div
        class="desktop-shell-rail"
        :style="{ width: ui.sideMenuOpen ? '16.5rem' : '0' }"
        :inert="!ui.sideMenuOpen"
      >
        <div class="desktop-shell-rail-inner" :class="ui.sideMenuOpen ? 'is-open' : 'is-closed'">
          <AppSideMenu />
        </div>
      </div>

      <main class="desktop-shell-canvas bg-night-900/60">
        <RouterView />
      </main>

      <div
        class="desktop-shell-aside"
        :style="{ width: ui.rightPanelOpen ? `${ui.rightPanelWidth}px` : '0' }"
        :inert="!ui.rightPanelOpen"
      >
        <div
          class="desktop-shell-aside-inner"
          :style="{ width: `${ui.rightPanelWidth}px` }"
          :class="ui.rightPanelOpen ? 'is-open' : 'is-closed'"
        >
          <AppRightPanel />
        </div>
      </div>
    </div>

    <AppFooter />
  </div>
</template>

<style scoped>
.desktop-shell {
  height: 100vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  color: var(--moon-50-opacity-95); /* token: moon-50 @ 95% */
}

.desktop-shell-body {
  flex: 1;
  display: flex;
  overflow: hidden;
  min-height: 0;
  position: relative;
  max-width: 100%;
}

.desktop-shell-rail,
.desktop-shell-aside {
  transition: width 220ms cubic-bezier(0.22, 1, 0.36, 1);
  will-change: width;
  height: 100%;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
}

.desktop-shell-rail-inner,
.desktop-shell-aside-inner {
  height: 100%;
  display: flex;
  flex-direction: column;
  transition:
    opacity 200ms cubic-bezier(0.4, 0, 0.2, 1),
    transform 200ms cubic-bezier(0.4, 0, 0.2, 1);
}

.desktop-shell-rail-inner.is-open {
  opacity: 1;
  transform: translateX(0);
}

.desktop-shell-rail-inner.is-closed {
  opacity: 0;
  transform: translateX(-0.5rem);
}

.desktop-shell-aside-inner.is-open {
  opacity: 1;
  transform: translateX(0);
}

.desktop-shell-aside-inner.is-closed {
  opacity: 0;
  transform: translateX(0.5rem);
}

.desktop-shell-canvas {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
  height: 100%;
}
</style>
