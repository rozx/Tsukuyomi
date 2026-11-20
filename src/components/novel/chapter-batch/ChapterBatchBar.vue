<script setup lang="ts">
/**
 * 章节列表多选模式顶部栏：已选数量、「选未翻译」与退出。
 * 桌面 / 平板侧栏与手机目录共用。
 */
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import { injectChapterBatch } from 'src/composables/book-details/useChapterBatch';

const { t } = useI18n();
const batch = injectChapterBatch();

const selecting = ref(false);
const selectUntranslated = async () => {
  if (!batch || selecting.value) return;
  selecting.value = true;
  try {
    await batch.selectUntranslated();
  } finally {
    selecting.value = false;
  }
};
</script>

<template>
  <div v-if="batch" class="cb-bar">
    <span class="cb-bar-count">{{
      t('taskQueueUi.batch.selectedCount', { count: batch.selection.count.value })
    }}</span>
    <Button
      :label="t('taskQueueUi.batch.selectUntranslated')"
      class="p-button-text p-button-sm"
      size="small"
      :loading="selecting"
      @click="selectUntranslated"
    />
    <Button
      icon="pi pi-times"
      class="p-button-text p-button-sm p-button-rounded"
      size="small"
      :title="t('taskQueueUi.batch.exit')"
      :aria-label="t('taskQueueUi.batch.exit')"
      @click="batch.selection.exit()"
    />
  </div>
</template>

<style scoped>
.cb-bar {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  min-width: 0;
}

.cb-bar-count {
  flex: 1;
  min-width: 0;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--primary-300);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
