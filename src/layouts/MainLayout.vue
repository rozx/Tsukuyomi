<script setup lang="ts">
/**
 * Device-variant dispatcher for the main app shell.
 *
 * Variant selection lives in `useDeviceVariant()`. One-time shell side effects
 * (auto-sync, AI task watcher, embedding warmup, global `__luna*` bridges) run
 * exactly once here via `useMainLayoutShell()` so they do NOT re-register when
 * a runtime breakpoint swap causes a variant to remount.
 *
 * 页面（RouterView）也只在这里渲染一次，经 Teleport 放进当前变体的 `#route-outlet-<variant>`。
 * 断点切换只移动页面 DOM，页面组件不会随外壳一起重新挂载，页面状态得以保留。
 */
import { computed } from 'vue';
import { RouterView } from 'vue-router';
import { useDeviceVariant } from 'src/composables/useDeviceVariant';
import { useMainLayoutShell } from 'src/composables/main-layout/useMainLayoutShell';
import MainLayoutDesktop from './main-layout/MainLayoutDesktop.vue';
import MainLayoutTablet from './main-layout/MainLayoutTablet.vue';
import MainLayoutMobile from './main-layout/MainLayoutMobile.vue';
import AskUserDialog from 'src/components/dialogs/AskUserDialog.vue';
import QuickStartGuideDialog from 'src/components/dialogs/QuickStartGuideDialog.vue';
import Toast from 'primevue/toast';
import ConfirmDialog from 'primevue/confirmdialog';

const { variant } = useDeviceVariant();
const { handleToastClose, quickStartGuideVisible, dismissQuickStartGuide } = useMainLayoutShell();

const variantComponent = computed(() => {
  switch (variant.value) {
    case 'mobile':
      return MainLayoutMobile;
    case 'tablet':
      return MainLayoutTablet;
    case 'desktop':
    default:
      return MainLayoutDesktop;
  }
});
</script>

<template>
  <component :is="variantComponent" />
  <Teleport :to="`#route-outlet-${variant}`" defer>
    <RouterView />
  </Teleport>

  <!-- Global chrome — same across every variant, rendered once by the dispatcher -->
  <Toast position="top-right" @close="handleToastClose" />
  <ConfirmDialog />
  <!-- 强制推送确认对话框：挂在 MainLayout 确保 SyncStatusPanel 关闭后仍能弹出 -->
  <ConfirmDialog group="force-sync" />
  <AskUserDialog />
  <QuickStartGuideDialog :visible="quickStartGuideVisible" @dismiss="dismissQuickStartGuide" />
</template>
