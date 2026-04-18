<script setup lang="ts">
/** Dispatcher for the AI models page. */
import { computed } from 'vue';
import ConfirmDialog from 'primevue/confirmdialog';
import AIModelDialog from 'src/components/dialogs/AIModelDialog.vue';
import { useDeviceVariant } from 'src/composables/useDeviceVariant';
import { provideAIPage } from 'src/composables/ai-page/useAIPage';
import AIPageDesktop from './ai-page/AIPageDesktop.vue';
import AIPageTablet from './ai-page/AIPageTablet.vue';
import AIPageMobile from './ai-page/AIPageMobile.vue';

const ctx = provideAIPage();
const { variant } = useDeviceVariant();

const variantComponent = computed(() => {
  switch (variant.value) {
    case 'mobile':
      return AIPageMobile;
    case 'tablet':
      return AIPageTablet;
    case 'desktop':
    default:
      return AIPageDesktop;
  }
});
</script>

<template>
  <component :is="variantComponent" />

  <!-- Shared dialogs -->
  <AIModelDialog
    v-model:visible="ctx.showAddDialog.value"
    mode="add"
    @save="ctx.handleSave"
    @cancel="ctx.showAddDialog.value = false"
  />
  <AIModelDialog
    v-model:visible="ctx.showEditDialog.value"
    mode="edit"
    :model="ctx.selectedModel.value"
    @save="ctx.handleSave"
    @cancel="ctx.showEditDialog.value = false"
  />
  <ConfirmDialog group="ai-model" />
</template>
