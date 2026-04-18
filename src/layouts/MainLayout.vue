<script setup lang="ts">
/**
 * Device-variant dispatcher for the main app shell.
 *
 * Variant selection lives in `useDeviceVariant()`. One-time shell side effects
 * (auto-sync, AI task watcher, embedding warmup, global `__luna*` bridges) run
 * exactly once here via `useMainLayoutShell()` so they do NOT re-register when
 * a runtime breakpoint swap causes a variant to remount.
 */
import { computed } from 'vue';
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

  <!-- Global chrome — same across every variant, rendered once by the dispatcher -->
  <Toast position="top-right" @close="handleToastClose" />
  <ConfirmDialog />
  <AskUserDialog />
  <QuickStartGuideDialog :visible="quickStartGuideVisible" @dismiss="dismissQuickStartGuide" />
</template>
