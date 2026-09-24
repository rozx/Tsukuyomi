<script setup lang="ts">
import AppHeader from 'src/components/layout/AppHeader.vue';
import AppFooter from 'src/components/layout/AppFooter.vue';
import AppSideMenu from 'src/components/layout/AppSideMenu.vue';
import AppRightPanel from 'src/components/layout/AppRightPanel.vue';
import { computed } from 'vue';
import { useUiStore } from 'src/stores/ui';
import { useImportRouteScope } from 'src/composables/import-page/useImportRouteScope';

const ui = useUiStore();
// 导入工作台以月詠对话为核心：导入路由下右栏始终展开，不能折叠
const isImportRoute = useImportRouteScope();
const asideOpen = computed(() => ui.rightPanelOpen || isImportRoute.value);
const asideWidth = computed(() => (asideOpen.value ? `${ui.rightPanelWidth}px` : '3rem'));
</script>

<template>
  <div class="desktop-shell bg-tsukuyomi-sky">
    <AppHeader />

    <div class="desktop-shell-body">
      <div class="desktop-shell-rail" :style="{ width: ui.sideMenuOpen ? '14rem' : '4rem' }">
        <div class="desktop-shell-rail-inner">
          <AppSideMenu :collapsed="!ui.sideMenuOpen" />
        </div>
      </div>

      <main class="desktop-shell-canvas bg-night-900/60">
        <!-- 页面由 MainLayout 渲染并 Teleport 到这里，断点切换时不重新挂载 -->
        <div id="route-outlet-desktop" class="route-outlet" />
      </main>

      <div class="desktop-shell-aside" :style="{ width: asideWidth }">
        <div class="desktop-shell-aside-inner" :style="{ width: asideWidth }">
          <AppRightPanel :collapsed="!asideOpen" />
        </div>
      </div>
    </div>

    <AppFooter />
  </div>
</template>

<style scoped>
.route-outlet {
  display: contents;
}

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
}

.desktop-shell-canvas {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
  height: 100%;
}
</style>
