<script setup lang="ts">
import { computed } from 'vue';
import MobileSysBar from 'src/components/layout/MobileSysBar.vue';
import MobileTabBar from 'src/components/layout/MobileTabBar.vue';
import AppSideMenu from 'src/components/layout/AppSideMenu.vue';
import AppRightPanel from 'src/components/layout/AppRightPanel.vue';
import { RouterView } from 'vue-router';
import { useUiStore } from 'src/stores/ui';
import { useOverlayCloseStack } from 'src/composables/useOverlayCloseStack';

const ui = useUiStore();

const rightPanelOverlayStyle = computed(() => ({
  width: '100vw',
}));

const closeSideMenu = () => ui.closeSideMenu();
const closeRightPanel = () => ui.closeRightPanel();

// 手机端两个抽屉都是覆盖式，均应进入关闭栈
useOverlayCloseStack({
  isOpen: computed(() => ui.sideMenuOpen),
  enabled: computed(() => true),
  onClose: closeSideMenu,
});

useOverlayCloseStack({
  isOpen: computed(() => ui.rightPanelOpen),
  enabled: computed(() => true),
  onClose: closeRightPanel,
});
</script>

<template>
  <div class="h-screen overflow-hidden bg-tsukuyomi-sky text-moon-100 flex flex-col">
    <MobileSysBar />

    <div class="flex flex-1 overflow-hidden min-h-0 relative max-w-full">
      <div
        v-if="ui.sideMenuOpen"
        class="layout-overlay-mask z-40"
        @click="closeSideMenu"
      />
      <div
        v-if="ui.rightPanelOpen"
        class="layout-overlay-mask z-40"
        @click="closeRightPanel"
      />

      <div
        class="phone-sidebar-wrapper z-50"
        :class="{ 'phone-sidebar-open': ui.sideMenuOpen }"
        :inert="!ui.sideMenuOpen"
      >
        <AppSideMenu />
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

    <MobileTabBar />
  </div>
</template>

<style scoped>
.layout-overlay-mask {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(1px);
}

.phone-sidebar-wrapper {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  width: 16rem;
  max-width: 86vw;
  transform: translateX(-100%);
  transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1);
}

.phone-sidebar-open {
  transform: translateX(0);
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
