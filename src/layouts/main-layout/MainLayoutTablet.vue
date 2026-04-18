<script setup lang="ts">
/**
 * Tablet shell — hybrid: persistent sidebar + overlay right panel + AppHeader + AppFooter.
 * This preserves today's tablet behavior (the previous v-if structure rendered this combination).
 * When a dedicated tablet redesign lands, replace this template accordingly.
 */
import { computed } from 'vue';
import AppHeader from 'src/components/layout/AppHeader.vue';
import AppFooter from 'src/components/layout/AppFooter.vue';
import AppSideMenu from 'src/components/layout/AppSideMenu.vue';
import AppRightPanel from 'src/components/layout/AppRightPanel.vue';
import { RouterView } from 'vue-router';
import { useUiStore } from 'src/stores/ui';
import { useOverlayCloseStack } from 'src/composables/useOverlayCloseStack';

const ui = useUiStore();

const rightPanelOverlayStyle = computed(() => ({
  width: `min(92vw, ${ui.rightPanelWidth}px)`,
}));

const closeRightPanel = () => ui.closeRightPanel();

// 平板：侧边栏为常驻抽屉（推开内容），右侧面板为覆盖层，仅右侧面板进入关闭栈。
useOverlayCloseStack({
  isOpen: computed(() => ui.rightPanelOpen),
  enabled: computed(() => true),
  onClose: closeRightPanel,
});
</script>

<template>
  <div class="h-screen overflow-hidden bg-tsukuyomi-sky text-moon-100 flex flex-col">
    <AppHeader />

    <div class="flex flex-1 overflow-hidden min-h-0 relative max-w-full">
      <div
        v-if="ui.rightPanelOpen"
        class="layout-overlay-mask z-40"
        @click="closeRightPanel"
      />

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

      <main class="flex-1 overflow-y-auto overflow-x-hidden min-h-0 bg-night-900/60">
        <RouterView />
      </main>

      <div
        class="overlay-right-panel z-50"
        :class="{ 'overlay-right-panel-open': ui.rightPanelOpen }"
        :style="rightPanelOverlayStyle"
        :inert="!ui.rightPanelOpen"
      >
        <AppRightPanel />
      </div>
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

.layout-overlay-mask {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(1px);
}

.overlay-right-panel {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  transform: translateX(100%);
  transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1);
}

.overlay-right-panel-open {
  transform: translateX(0);
}

main {
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
  height: 100%;
}
</style>
