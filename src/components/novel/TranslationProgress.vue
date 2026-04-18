<script setup lang="ts">
/**
 * Device-variant dispatcher for the translation progress panel.
 * Variant selection rule lives in `useDeviceVariant()` — this file only consumes it.
 */
import { computed } from 'vue';
import { useDeviceVariant } from 'src/composables/useDeviceVariant';
import TranslationProgressDesktop from './TranslationProgressDesktop.vue';
import TranslationProgressTablet from './TranslationProgressTablet.vue';
import TranslationProgressMobile from './TranslationProgressMobile.vue';

const { variant } = useDeviceVariant();

const variantComponent = computed(() => {
  switch (variant.value) {
    case 'mobile':
      return TranslationProgressMobile;
    case 'tablet':
      return TranslationProgressTablet;
    case 'desktop':
    default:
      return TranslationProgressDesktop;
  }
});
</script>

<template>
  <component :is="variantComponent" />
</template>
