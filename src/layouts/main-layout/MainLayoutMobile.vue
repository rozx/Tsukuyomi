<script setup lang="ts">
import { computed } from 'vue';
import MobileSysBar from 'src/components/layout/MobileSysBar.vue';
import MobileTabBar from 'src/components/layout/MobileTabBar.vue';
import AppSideMenu from 'src/components/layout/AppSideMenu.vue';
import MobileChatSheet from 'src/components/layout/MobileChatSheet.vue';
import MobileProgressSheet from 'src/components/layout/MobileProgressSheet.vue';
import { RouterView } from 'vue-router';
import { useUiStore } from 'src/stores/ui';
import { useOverlayCloseStack } from 'src/composables/useOverlayCloseStack';

const ui = useUiStore();

// 右侧面板在移动端拆成两张独立的 bottom sheet：
//   MobileChatSheet    — AI 助手（activeRightTab === 'chat'）
//   MobileProgressSheet — 翻译进度（activeRightTab === 'progress'）
// 两者互斥，由 activeRightTab 决定 v-model:visible
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

const isProgressOpen = computed<boolean>({
  get: () => ui.rightPanelOpen && ui.activeRightTab === 'progress',
  set: (open) => {
    if (open) {
      ui.setActiveRightTab('progress');
      if (!ui.rightPanelOpen) ui.openRightPanel();
    } else if (ui.activeRightTab === 'progress') {
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
  <div class="h-screen overflow-hidden bg-tsukuyomi-sky text-moon-100 flex flex-col">
    <MobileSysBar />

    <div class="flex flex-1 overflow-hidden min-h-0 relative max-w-full">
      <!-- 侧边菜单遮罩 -->
      <div
        v-if="ui.sideMenuOpen"
        class="layout-overlay-mask z-40"
        @click="closeSideMenu"
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
    </div>

    <MobileTabBar />

    <!-- 两张底部抽屉：chat 和 progress 互斥挂载，但都常驻 DOM，
         这样各自的 useRightPanel / TranslationProgress 内部状态不会被 sheet
         关闭时清掉 —— 只有 MobileBottomSheet 的 transition 控制可见性。 -->
    <MobileChatSheet v-model:visible="isChatOpen" />
    <MobileProgressSheet v-model:visible="isProgressOpen" />
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

main {
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
  height: 100%;
}
</style>
