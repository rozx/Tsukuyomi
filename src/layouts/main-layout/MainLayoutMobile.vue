<script setup lang="ts">
import { computed } from 'vue';
import MobileSysBar from 'src/components/layout/MobileSysBar.vue';
import MobileTabBar from 'src/components/layout/MobileTabBar.vue';
import AppSideMenu from 'src/components/layout/AppSideMenu.vue';
import MobileChatSheet from 'src/components/layout/MobileChatSheet.vue';
import { useImportRouteScope } from 'src/composables/import-page/useImportRouteScope';
import { useUiStore } from 'src/stores/ui';
import { useOverlayCloseStack } from 'src/composables/useOverlayCloseStack';

const ui = useUiStore();
// 导入路由的对话是工作台的「对话」分区（常驻页面内），不挂普通月詠抽屉
const isImportRoute = useImportRouteScope();

// 右侧面板在移动端是 AI 助手的底部抽屉（翻译进度已移到顶部信息条的任务中心）
const isChatOpen = computed<boolean>({
  get: () => ui.rightPanelOpen && ui.activeRightTab === 'chat',
  set: (open) => {
    if (open) {
      ui.setActiveRightTab('chat');
      if (!ui.rightPanelOpen) ui.openRightPanel();
    } else if (ui.activeRightTab === 'chat') {
      ui.closeRightPanel();
    }
  },
});

const closeSideMenu = () => ui.closeSideMenu();

useOverlayCloseStack({
  isOpen: computed(() => ui.sideMenuOpen),
  enabled: computed(() => true),
  onClose: closeSideMenu,
});
</script>

<template>
  <div class="mobile-shell bg-tsukuyomi-sky text-moon-100">
    <div class="mobile-shell-sysbar"><MobileSysBar /></div>

    <div class="mobile-shell-content">
      <!-- 侧边菜单遮罩 -->
      <div v-if="ui.sideMenuOpen" class="layout-overlay-mask z-40" @click="closeSideMenu" />

      <div
        class="phone-sidebar-wrapper z-50"
        :class="{ 'phone-sidebar-open': ui.sideMenuOpen }"
        :inert="!ui.sideMenuOpen"
      >
        <AppSideMenu />
      </div>

      <main class="bg-night-900/60">
        <!-- 页面由 MainLayout 渲染并 Teleport 到这里，断点切换时不重新挂载 -->
        <div id="route-outlet-mobile" class="route-outlet" />
      </main>
    </div>

    <div class="mobile-shell-tabbar"><MobileTabBar /></div>

    <!-- AI 助手底部抽屉常驻 DOM，useRightPanel 内部状态不会被 sheet 关闭时清掉 —— 只有
         MobileBottomSheet 的 transition 控制可见性。 -->
    <MobileChatSheet v-if="!isImportRoute" v-model:visible="isChatOpen" />
  </div>
</template>

<style scoped>
.mobile-shell {
  --mobile-tabbar-height: calc(77px + env(safe-area-inset-bottom, 0px));
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  overflow-x: clip;
}

.mobile-shell-sysbar {
  position: sticky;
  top: 0;
  z-index: 6;
}

.mobile-shell-content {
  flex: 1;
  min-width: 0;
}

.mobile-shell-tabbar {
  position: sticky;
  bottom: 0;
  z-index: 40;
}

.route-outlet {
  display: contents;
}

.layout-overlay-mask {
  position: fixed;
  inset: 0;
  z-index: 45;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(1px);
}

.phone-sidebar-wrapper {
  position: fixed;
  top: 37px;
  left: 0;
  bottom: var(--mobile-tabbar-height);
  width: 16rem;
  max-width: 86vw;
  transform: translateX(-100%);
  transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1);
}

.phone-sidebar-open {
  transform: translateX(0);
}

main {
  min-width: 0;
  overflow: visible;
}

:global(body:has(.phone-sidebar-open)) {
  overflow: hidden;
}
</style>
