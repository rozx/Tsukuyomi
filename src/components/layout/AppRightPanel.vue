<script setup lang="ts">
/**
 * Device-variant dispatcher for the AI assistant / progress right panel.
 *
 * Only Desktop and Tablet use this component — MainLayoutMobile renders chat /
 * progress as two independent MobileBottomSheet instances (MobileChatSheet +
 * MobileProgressSheet) rather than folding them into a single right panel. So
 * the mobile case here intentionally falls through to Desktop: if some unusual
 * call site ever mounts this on a phone, it'll get the desktop layout instead
 * of a broken empty panel.
 */
import { computed } from 'vue';
import { useDeviceVariant } from 'src/composables/useDeviceVariant';
import AppRightPanelDesktop from './AppRightPanelDesktop.vue';
import AppRightPanelTablet from './AppRightPanelTablet.vue';

const { variant } = useDeviceVariant();

const variantComponent = computed(() => {
  switch (variant.value) {
    case 'tablet':
      return AppRightPanelTablet;
    case 'mobile':
    case 'desktop':
    default:
      return AppRightPanelDesktop;
  }
});
</script>

<template>
  <component :is="variantComponent" />
</template>
