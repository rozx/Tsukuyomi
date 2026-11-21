<script setup lang="ts">
/**
 * 章节列表多选模式底部操作栏：润色、校对、翻译 N 章（打开批量确认对话框）。
 * 按钮与目录标题行的图标按钮同一视觉（2rem 高、同色），主操作用选中项的 tsukuyomi 底色。
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { injectChapterBatch } from 'src/composables/book-details/useChapterBatch';

const { t } = useI18n();
const batch = injectChapterBatch();

const count = computed(() => batch?.selection.count.value ?? 0);
const empty = computed(() => count.value === 0);
</script>

<template>
  <div v-if="batch" class="cb-actions">
    <button type="button" class="cb-action" :disabled="empty" @click="batch.openDialog('polish')">
      {{ t('taskQueueUi.batch.actionPolish') }}
    </button>
    <button
      type="button"
      class="cb-action"
      :disabled="empty"
      @click="batch.openDialog('proofreading')"
    >
      {{ t('taskQueueUi.batch.actionProofread') }}
    </button>
    <button
      type="button"
      class="cb-action cb-action--primary"
      :disabled="empty"
      @click="batch.openDialog('translation')"
    >
      <i class="pi pi-language" aria-hidden="true" />
      {{ t('taskQueueUi.batch.actionTranslate', { count }) }}
    </button>
  </div>
</template>

<style scoped>
.cb-actions {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.5rem 0.75rem;
  border-top: 1px solid var(--white-opacity-6);
  flex-shrink: 0;
}

.cb-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  height: 2rem;
  padding: 0 0.65rem;
  border: 1px solid transparent;
  border-radius: var(--btn-radius);
  background: transparent;
  /* 按钮系统：文字按钮；主操作见 --primary */
  color: var(--btn-text-color);
  font-family: inherit;
  font-size: 0.78rem;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease,
    opacity 0.15s ease;
}

.cb-action:hover:not(:disabled) {
  background: var(--btn-text-hover-bg);
  color: var(--btn-text-hover-color);
}

.cb-action--primary {
  flex: 1;
  min-width: 0;
  background: var(--btn-primary-bg);
  border-color: var(--btn-primary-border);
  color: var(--btn-primary-color);
}

.cb-action--primary:hover:not(:disabled) {
  background: var(--btn-primary-hover-bg);
  border-color: var(--btn-primary-hover-border);
  color: var(--btn-primary-hover-color);
}

.cb-action:disabled {
  opacity: 0.45;
  cursor: default;
}

.cb-action:focus-visible {
  outline: 2px solid var(--primary-opacity-50);
  outline-offset: 1px;
}
</style>
