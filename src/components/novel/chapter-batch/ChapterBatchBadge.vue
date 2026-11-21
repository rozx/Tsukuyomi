<script setup lang="ts">
/**
 * 多选模式下章节行尾的状态：已在队列中时显示「排队中 / 进行中」，
 * 否则显示普通目录同样的完成度。行里已有完成度标签的目录（平板、手机）通过默认插槽传入原标签，
 * 保证两种模式外观一致；桌面目录没有标签，使用这里的百分比（计算中显示加载）。
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { injectChapterBatch } from 'src/composables/book-details/useChapterBatch';

const props = withDefaults(
  defineProps<{
    chapterId: string;
    /** 是否处于多选模式；否则只渲染插槽（普通模式的原标签） */
    active?: boolean;
  }>(),
  { active: true },
);

const { t } = useI18n();
const batch = injectChapterBatch();

const queueState = computed(() =>
  props.active ? (batch?.chapterQueueState(props.chapterId) ?? null) : null,
);
const queueLabel = computed(() => {
  if (queueState.value === 'running') return t('taskQueueUi.batch.badgeRunning');
  return queueState.value === 'queued' ? t('taskQueueUi.batch.badgeQueued') : '';
});
const percent = computed(() => batch?.stats.percent(props.chapterId) ?? null);
</script>

<template>
  <span v-if="queueLabel" class="cb-badge" :class="`cb-badge--${queueState}`">{{
    queueLabel
  }}</span>
  <slot v-else>
    <span v-if="percent !== null" class="cb-percent">{{ percent }}%</span>
    <i
      v-else
      class="pi pi-spinner pi-spin cb-percent"
      role="status"
      :aria-label="t('readerUi.chapterLoading')"
    />
  </slot>
</template>

<style scoped>
.cb-badge {
  flex-shrink: 0;
  padding: 0 6px;
  border-radius: 999px;
  font-size: 10.5px;
  line-height: 16px;
  white-space: nowrap;
  border: 1px solid transparent;
}

.cb-badge--running {
  color: var(--tsukuyomi-300);
  background: var(--tsukuyomi-opacity-15);
  border-color: var(--tsukuyomi-opacity-30);
}

.cb-badge--queued {
  color: var(--moon-50-opacity-72);
  background: var(--white-opacity-5);
  border-color: var(--white-opacity-10);
}

/* 与平板 / 手机目录的完成度标签（.vt-row-count）同一样式 */
.cb-percent {
  flex-shrink: 0;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: var(--moon-50-opacity-55);
}
</style>
