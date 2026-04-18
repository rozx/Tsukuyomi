<script setup lang="ts">
/**
 * Dispatcher for the 404 page. Variants are identical today but ship separately
 * so the pattern is uniform across all pages per the `device-variant-dispatch` spec.
 */
import { computed } from 'vue';
import { useDeviceVariant } from 'src/composables/useDeviceVariant';
import NotFoundPageDesktop from './not-found-page/NotFoundPageDesktop.vue';
import NotFoundPageTablet from './not-found-page/NotFoundPageTablet.vue';
import NotFoundPageMobile from './not-found-page/NotFoundPageMobile.vue';

const { variant } = useDeviceVariant();

const variantComponent = computed(() => {
  switch (variant.value) {
    case 'mobile':
      return NotFoundPageMobile;
    case 'tablet':
      return NotFoundPageTablet;
    case 'desktop':
    default:
      return NotFoundPageDesktop;
  }
});
</script>

<template>
  <component :is="variantComponent" />
</template>
