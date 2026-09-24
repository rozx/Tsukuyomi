<script setup lang="ts">
/**
 * Device-variant dispatcher for the home page.
 * Provides the shared IndexPage context once (so dialogs and state survive variant swaps),
 * renders the selected variant, and hosts the shared dialogs.
 */
import { computed } from 'vue';
import BookDialog from 'src/components/dialogs/BookDialog.vue';
import { useDeviceVariant } from 'src/composables/useDeviceVariant';
import { provideIndexPage } from 'src/composables/index-page/useIndexPage';
import IndexPageDesktop from './index-page/IndexPageDesktop.vue';
import IndexPageTablet from './index-page/IndexPageTablet.vue';
import IndexPageMobile from './index-page/IndexPageMobile.vue';

const ctx = provideIndexPage();
const { variant } = useDeviceVariant();

const variantComponent = computed(() => {
  switch (variant.value) {
    case 'mobile':
      return IndexPageMobile;
    case 'tablet':
      return IndexPageTablet;
    case 'desktop':
    default:
      return IndexPageDesktop;
  }
});
</script>

<template>
  <component :is="variantComponent" />

  <!-- Shared dialogs (mounted once by the dispatcher) -->
  <BookDialog
    v-model:visible="ctx.showAddDialog.value"
    mode="add"
    @save="ctx.handleSave"
    @cancel="ctx.showAddDialog.value = false"
  />
</template>
