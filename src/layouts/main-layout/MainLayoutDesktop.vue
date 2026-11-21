<script setup lang="ts">
import AppHeader from 'src/components/layout/AppHeader.vue';
import AppFooter from 'src/components/layout/AppFooter.vue';
import AppSideMenu from 'src/components/layout/AppSideMenu.vue';
import AppRightPanel from 'src/components/layout/AppRightPanel.vue';
import DeskPet from 'src/components/desk-pet/DeskPet.vue';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useUiStore } from 'src/stores/ui';
import { useImportRouteScope } from 'src/composables/import-page/useImportRouteScope';

/** 与 .desktop-shell-aside 的宽度过渡时长一致：收起动画结束后再卸载面板 */
const ASIDE_TRANSITION_MS = 220;

const ui = useUiStore();
// 导入工作台以月詠对话为核心：导入路由下右栏始终展开，不能折叠
const isImportRoute = useImportRouteScope();
const asideOpen = computed(() => ui.rightPanelOpen || isImportRoute.value);
const asideWidth = computed(() => (asideOpen.value ? `${ui.rightPanelWidth}px` : '0px'));

// 关闭时右侧零宽度；面板内容在收起动画播完后才卸载，打开时立即挂载
const panelMounted = ref(asideOpen.value);
let unmountTimer: ReturnType<typeof setTimeout> | undefined;
watch(asideOpen, (open) => {
  clearTimeout(unmountTimer);
  if (open) {
    panelMounted.value = true;
    return;
  }
  unmountTimer = setTimeout(() => {
    panelMounted.value = false;
  }, ASIDE_TRANSITION_MS);
});
onBeforeUnmount(() => clearTimeout(unmountTimer));

// 段落「复制到助手 / 解释选中」写入 ui.assistantInputMessage。面板关闭时对话组件不在，
// 由一直挂载的桌面外壳打开面板；消息的填入与清空交给挂载后的对话面板（useRightPanel 的
// immediate watcher）。平板 / 手机的对话面板常驻挂载，自己处理，不在共享壳层里重复。
watch(
  () => ui.assistantInputMessage,
  (message) => {
    if (message == null) return;
    if (ui.activeRightTab !== 'chat') ui.setActiveRightTab('chat');
    if (!ui.rightPanelOpen) ui.openRightPanel();
  },
);
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
        <div class="desktop-shell-aside-inner" :style="{ width: `${ui.rightPanelWidth}px` }">
          <AppRightPanel v-if="panelMounted" />
        </div>
      </div>

      <!-- 月詠桌宠：只在桌面布局挂载，右侧助手面板关着时转述进度（打开时桌宠自己隐藏） -->
      <div class="desktop-shell-pet">
        <DeskPet />
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

/* 面板内层保持自身宽度，外层宽度过渡时裁切，开合像滑入滑出而不是挤压重排 */
.desktop-shell-aside {
  overflow: hidden;
}

.desktop-shell-rail-inner,
.desktop-shell-aside-inner {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.desktop-shell-aside-inner {
  flex-shrink: 0;
}

.desktop-shell-pet {
  position: absolute;
  right: 16px;
  bottom: 16px;
  z-index: 25;
}

.desktop-shell-canvas {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
  height: 100%;
}
</style>
