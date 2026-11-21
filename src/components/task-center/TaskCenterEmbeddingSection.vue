<script setup lang="ts">
/**
 * 任务中心「后台 · 向量化」区：嵌入队列进度与常用操作（替代原向量化抽屉）。
 * 本地嵌入关闭时不渲染；不计入章节任务的数量、并发名额与排队顺序。
 * 区头：待处理总数、同步挂起提示、暂停 / 继续；展开后：队列行，书籍页再加本书部分
 * （TaskCenterEmbeddingBook），其他页面提示打开一本书。popover、固定悬浮面板、手机抽屉共用。
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { injectTaskCenter } from 'src/composables/task-center/useTaskCenter';
import TaskCenterSectionHeader from './TaskCenterSectionHeader.vue';
import TaskCenterEmbeddingBook from './TaskCenterEmbeddingBook.vue';

const { t } = useI18n();
const center = injectTaskCenter();
const bg = center.embedding;
const progress = bg.progress;

/** 区头按钮：反映并切换用户自己的暂停状态（同步闸门另行提示） */
const pauseAction = computed(() =>
  bg.userPaused.value
    ? { icon: 'pi pi-play', label: t('embeddingUi.background.resume'), run: bg.resume }
    : { icon: 'pi pi-pause', label: t('embeddingUi.background.pause'), run: bg.pause },
);

const etaText = computed(() => {
  const eta = progress.value.etaMs;
  if (!eta || progress.value.pending === 0) return '';
  const seconds = Math.round(eta / 1000);
  if (seconds < 60) return t('embeddingUi.etaSeconds', { count: seconds });
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest > 0
    ? t('embeddingUi.etaMinutesSeconds', { minutes, seconds: rest })
    : t('embeddingUi.etaMinutes', { count: minutes });
});

/** 队列行：正在处理的书与类型；空闲 / 暂停时显示待处理数 */
const queueLine = computed(() => {
  const task = bg.currentTask.value;
  if (task) {
    const kind = task.kind === 'chapter' ? t('embeddingUi.chapter') : t('embeddingUi.memory');
    const params = { kind, count: task.itemCount };
    return bg.processingOtherBook.value
      ? t('embeddingUi.otherBookTask', params)
      : t('embeddingUi.thisBookTask', params);
  }
  const pending = progress.value.pending;
  if (bg.userPaused.value && pending > 0)
    return t('embeddingUi.background.paused', { count: pending });
  return pending > 0
    ? t('embeddingUi.background.pending', { count: pending })
    : t('embeddingUi.background.idle');
});
const queueIcon = computed(() => {
  if (bg.currentTask.value) return 'pi pi-spin pi-spinner';
  if (progress.value.paused && progress.value.pending > 0) return 'pi pi-pause';
  return progress.value.pending > 0 ? 'pi pi-clock' : 'pi pi-check';
});
</script>

<template>
  <section v-if="bg.enabled.value" class="tc-section" data-testid="task-center-embedding">
    <TaskCenterSectionHeader
      tone="background"
      :label="t('embeddingUi.background.title')"
      :count="progress.pending"
      collapsible
      :collapsed="center.embeddingCollapsed.value"
      @toggle="center.toggleEmbeddingCollapsed"
    >
      <span v-if="bg.syncGated.value" class="tc-emb-note">
        {{ t('embeddingUi.background.syncWaiting') }}
      </span>
      <button
        type="button"
        class="tc-sh-action tc-emb-icon"
        :title="pauseAction.label"
        :aria-label="pauseAction.label"
        @click="pauseAction.run"
      >
        <i :class="pauseAction.icon" aria-hidden="true" />
      </button>
    </TaskCenterSectionHeader>

    <div v-if="!center.embeddingCollapsed.value" class="tc-emb-body">
      <div class="tc-emb-queue" :class="{ 'tc-emb-queue--other': bg.processingOtherBook.value }">
        <i :class="queueIcon" aria-hidden="true" />
        <div class="tc-emb-queue-text">
          <span class="tc-emb-queue-line">{{ queueLine }}</span>
          <span v-if="bg.processingOtherBook.value" class="tc-emb-queue-book">
            {{ bg.currentTaskBookTitle.value }}
          </span>
        </div>
        <span v-if="etaText" class="tc-emb-eta">
          {{ t('embeddingUi.background.eta', { eta: etaText }) }}
        </span>
      </div>

      <TaskCenterEmbeddingBook v-if="bg.book.value" />
      <div v-else class="tc-emb-hint">{{ t('embeddingUi.background.openBookHint') }}</div>
    </div>
  </section>
</template>

<style scoped>
.tc-emb-note {
  font-size: 11px;
  color: #e7c98a;
  white-space: nowrap;
}

.tc-emb-icon {
  display: inline-flex;
  align-items: center;
}

.tc-emb-icon i {
  font-size: 11px;
}

.tc-emb-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 12px 12px;
}

.tc-emb-queue {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--moon-opacity-80);
}

.tc-emb-queue > i {
  font-size: 11px;
  color: #a3b7cf;
}

.tc-emb-queue--other > i {
  color: #e7c98a;
}

.tc-emb-queue-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.tc-emb-queue-line,
.tc-emb-queue-book {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tc-emb-queue-book {
  font-size: 11px;
  color: #e7c98a;
}

.tc-emb-eta {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--moon-opacity-50);
  font-variant-numeric: tabular-nums;
}

.tc-emb-hint {
  font-size: 11px;
  color: var(--moon-opacity-50);
}
</style>
