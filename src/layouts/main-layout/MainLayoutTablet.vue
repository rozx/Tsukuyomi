<script setup lang="ts">
/**
 * Tablet shell — slim left icon rail + top utility strip + main RouterView,
 * with TWO independent right-edge slide-in panels for the AI 助手 / 翻译进度
 * surfaces. Each panel owns its own appbar + close button and stays mounted
 * in the DOM so its internal state (useRightPanel / TranslationProgress) isn't
 * reset when the other opens — same pattern as MainLayoutMobile with its
 * MobileChatSheet + MobileProgressSheet.
 *
 * Active tab state is shared with MobileTabBar / BookDetailsTablet rail via
 * useMainNavActive() and the uiStore.activeRightTab state.
 */
import { computed } from 'vue';
import TabletSysBar from 'src/components/layout/TabletSysBar.vue';
import TabletNavRail from 'src/components/layout/TabletNavRail.vue';
import TabletChatPanel from 'src/components/layout/TabletChatPanel.vue';
import TabletProgressPanel from 'src/components/layout/TabletProgressPanel.vue';
import { RouterView } from 'vue-router';
import { useUiStore } from 'src/stores/ui';
import { useOverlayCloseStack } from 'src/composables/useOverlayCloseStack';

const ui = useUiStore();

const rightPanelOverlayStyle = computed(() => ({
  width: `min(92vw, ${ui.rightPanelWidth}px)`,
}));

const isChatOpen = computed(() => ui.rightPanelOpen && ui.activeRightTab === 'chat');
const isProgressOpen = computed(() => ui.rightPanelOpen && ui.activeRightTab === 'progress');

const closeRightPanel = () => ui.closeRightPanel();

// 只有右侧面板进入关闭栈；左侧图标导航栏是常驻的，不可折叠。
useOverlayCloseStack({
  isOpen: computed(() => ui.rightPanelOpen),
  enabled: computed(() => true),
  onClose: closeRightPanel,
});
</script>

<template>
  <div class="h-[100dvh] overflow-hidden bg-tsukuyomi-sky text-moon-100 flex flex-col">
    <TabletSysBar />

    <div class="flex flex-1 overflow-hidden min-h-0 relative max-w-full">
      <TabletNavRail />

      <main class="flex-1 overflow-y-auto overflow-x-hidden min-h-0 bg-night-900/60 relative">
        <div
          v-if="ui.rightPanelOpen"
          class="layout-overlay-mask z-40"
          @click="closeRightPanel"
        />

        <RouterView />

        <!-- AI 助手 面板——独立挂载，仅当 activeRightTab === 'chat' 时 slide-in -->
        <div
          class="overlay-right-panel z-50"
          :class="{ 'overlay-right-panel-open': isChatOpen }"
          :style="rightPanelOverlayStyle"
          :inert="!isChatOpen"
        >
          <TabletChatPanel />
        </div>

        <!-- 翻译进度 面板——独立挂载，仅当 activeRightTab === 'progress' 时 slide-in -->
        <div
          class="overlay-right-panel z-50"
          :class="{ 'overlay-right-panel-open': isProgressOpen }"
          :style="rightPanelOverlayStyle"
          :inert="!isProgressOpen"
        >
          <TabletProgressPanel />
        </div>
      </main>
    </div>
  </div>
</template>

<style scoped>
.layout-overlay-mask {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(1px);
  -webkit-backdrop-filter: blur(1px);
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
