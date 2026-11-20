<script setup lang="ts">
/**
 * 多选模式下章节行尾的状态徽章：在队列中显示「排队中 / 进行中」，
 * 否则显示按书籍目标语言计算的完成度（计算中显示加载）。
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { injectChapterBatch } from 'src/composables/book-details/useChapterBatch';

const props = defineProps<{ chapterId: string }>();

const { t } = useI18n();
const batch = injectChapterBatch();

const queueState = computed(() => batch?.chapterQueueState(props.chapterId) ?? null);
const percent = computed(() => batch?.stats.percent(props.chapterId) ?? null);

const label = computed(() => {
  if (queueState.value === 'running') return t('taskQueueUi.batch.badgeRunning');
  if (queueState.value === 'queued') return t('taskQueueUi.batch.badgeQueued');
  if (percent.value === null) return '';
  return percent.value === 0 ? t('taskQueueUi.batch.badgeUntranslated') : `${percent.value}%`;
});
const tone = computed(() => {
  if (queueState.value) return `cb-badge--${queueState.value}`;
  if (percent.value === 100) return 'cb-badge--done';
  return percent.value === 0 ? 'cb-badge--empty' : 'cb-badge--partial';
});
</script>

<template>
  <span v-if="label" class="cb-badge" :class="tone">{{ label }}</span>
  <i
    v-else
    class="pi pi-spinner pi-spin cb-badge-loading"
    role="status"
    :aria-label="t('readerUi.chapterLoading')"
  />
</template>

<style scoped>
.cb-badge {
  flex-shrink: 0;
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 10.5px;
  line-height: 16px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  border: 1px solid transparent;
}

.cb-badge--running {
  color: var(--primary-300);
  background: var(--primary-opacity-15);
  border-color: var(--primary-opacity-30);
}

.cb-badge--queued {
  color: var(--moon-opacity-80);
  background: var(--white-opacity-5);
  border-color: var(--white-opacity-10);
}

.cb-badge--done {
  color: var(--green-500);
}

.cb-badge--partial {
  color: var(--orange-400);
}

.cb-badge--empty {
  color: var(--moon-opacity-50);
}

.cb-badge-loading {
  flex-shrink: 0;
  font-size: 10px;
  color: var(--moon-opacity-40);
}
</style>
