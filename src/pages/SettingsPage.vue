<script setup lang="ts">
/**
 * Dispatcher for the /settings page. Replaces the previous SettingsDialog
 * popup — settings is now a routed page so breakpoint swaps, back/forward,
 * and deep-linking work like any other route. Variants follow the uniform
 * Desktop / Tablet / Mobile pattern via `useDeviceVariant`.
 */
import { computed } from 'vue';
import Toast from 'primevue/toast';
import ConfirmDialog from 'primevue/confirmdialog';
import { useDeviceVariant } from 'src/composables/useDeviceVariant';
import { provideSettingsPage } from 'src/composables/settings-page/useSettingsPage';
import SettingsPageDesktop from './settings-page/SettingsPageDesktop.vue';
import SettingsPageTablet from './settings-page/SettingsPageTablet.vue';
import SettingsPageMobile from './settings-page/SettingsPageMobile.vue';

const ctx = provideSettingsPage();
const { variant } = useDeviceVariant();

const variantComponent = computed(() => {
  switch (variant.value) {
    case 'mobile':
      return SettingsPageMobile;
    case 'tablet':
      return SettingsPageTablet;
    case 'desktop':
    default:
      return SettingsPageDesktop;
  }
});
</script>

<template>
  <component :is="variantComponent" />

  <!-- 供设置 tab 内部操作使用的确认对话框 -->
  <ConfirmDialog group="settings" />
</template>
