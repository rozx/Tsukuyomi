<script setup lang="ts">
/**
 * 章节列表多选模式底部操作栏：润色、校对、翻译 N 章（打开批量确认对话框）。
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import { injectChapterBatch } from 'src/composables/book-details/useChapterBatch';

const { t } = useI18n();
const batch = injectChapterBatch();

const count = computed(() => batch?.selection.count.value ?? 0);
const empty = computed(() => count.value === 0);
</script>

<template>
  <div v-if="batch" class="cb-actions">
    <Button
      :label="t('taskQueueUi.batch.actionPolish')"
      class="p-button-outlined p-button-sm"
      size="small"
      :disabled="empty"
      @click="batch.openDialog('polish')"
    />
    <Button
      :label="t('taskQueueUi.batch.actionProofread')"
      class="p-button-outlined p-button-sm"
      size="small"
      :disabled="empty"
      @click="batch.openDialog('proofreading')"
    />
    <Button
      :label="t('taskQueueUi.batch.actionTranslate', { count })"
      icon="pi pi-language"
      class="p-button-sm cb-actions-primary"
      size="small"
      :disabled="empty"
      @click="batch.openDialog('translation')"
    />
  </div>
</template>

<style scoped>
.cb-actions {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 0.75rem;
  border-top: 1px solid var(--white-opacity-8);
  background: var(--shell-opacity-96);
  flex-shrink: 0;
}

.cb-actions :deep(.p-button-label) {
  white-space: nowrap;
}

.cb-actions-primary {
  flex: 1;
  min-width: 0;
}
</style>
