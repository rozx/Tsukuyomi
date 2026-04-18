<script setup lang="ts">
/** Dispatcher for the help docs page. */
import { computed } from 'vue';
import { useDeviceVariant } from 'src/composables/useDeviceVariant';
import { provideHelpPage } from 'src/composables/help-page/useHelpPage';
import HelpPageDesktop from './help-page/HelpPageDesktop.vue';
import HelpPageTablet from './help-page/HelpPageTablet.vue';
import HelpPageMobile from './help-page/HelpPageMobile.vue';

provideHelpPage();
const { variant } = useDeviceVariant();

const variantComponent = computed(() => {
  switch (variant.value) {
    case 'mobile':
      return HelpPageMobile;
    case 'tablet':
      return HelpPageTablet;
    case 'desktop':
    default:
      return HelpPageDesktop;
  }
});
</script>

<template>
  <component :is="variantComponent" />
</template>
