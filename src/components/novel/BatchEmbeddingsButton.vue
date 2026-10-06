<template>
  <button
    v-if="isAvailable"
    type="button"
    :aria-label="t('libraryUi.vectors')"
    :title="t('libraryUi.vectors')"
    :aria-expanded="visible"
    aria-haspopup="dialog"
    @click="toggle"
  >
    <i class="pi pi-bolt" aria-hidden="true" />
  </button>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useBatchEmbeddingsPanel } from 'src/composables/useBatchEmbeddingsPanel';

const { t } = useI18n();
const { isAvailable, visible, toggle } = useBatchEmbeddingsPanel();
</script>

<style scoped>
i {
  font-size: 14px;
  line-height: 1;
}
</style>
