<script setup lang="ts">
/**
 * Device-variant dispatcher for the AI assistant / progress right panel.
 * Variant selection rule lives in `useDeviceVariant()` — this file only consumes it.
 */
import { computed } from 'vue';
import { useDeviceVariant } from 'src/composables/useDeviceVariant';
import AppRightPanelDesktop from './AppRightPanelDesktop.vue';
import AppRightPanelTablet from './AppRightPanelTablet.vue';
import AppRightPanelMobile from './AppRightPanelMobile.vue';

const { variant } = useDeviceVariant();

const variantComponent = computed(() => {
  switch (variant.value) {
    case 'mobile':
      return AppRightPanelMobile;
    case 'tablet':
      return AppRightPanelTablet;
    case 'desktop':
    default:
      return AppRightPanelDesktop;
  }
});
</script>

<template>
  <component :is="variantComponent" />
</template>
