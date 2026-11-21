<script setup lang="ts">
/**
 * 任务中心内容：标题区（并发、暂停 / 继续、全部停止、固定）、
 * 进行中 / 排队中 / 已完成三组章节任务，「后台 · 向量化」区，以及「其他 AI 活动」区。
 * 点击任务行时整个内容区切换为该任务的详情视图（标题区保留，固定面板仍可拖动）；
 * 手机抽屉不在这里切换，而是把事件交给外层打开全屏详情。
 * popover、固定悬浮面板、手机抽屉共用。
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { injectTaskCenter, type TaskCenterRow } from 'src/composables/task-center/useTaskCenter';
import TaskCenterQueueRow from './TaskCenterQueueRow.vue';
import TaskCenterOtherSection from './TaskCenterOtherSection.vue';
import TaskCenterEmbeddingSection from './TaskCenterEmbeddingSection.vue';
import TaskCenterSectionHeader from './TaskCenterSectionHeader.vue';
import TaskCenterDetailView from './TaskCenterDetailView.vue';

const props = defineProps<{
  mode: 'popover' | 'pinned' | 'sheet';
  /** popover 详情视图的高度（px）：日志区需要确定的高度才能填满 */
  detailHeight?: number;
}>();
const emit = defineEmits<{
  pin: [];
  unpin: [];
  collapse: [];
  dragStart: [event: PointerEvent];
  openDetail: [id: string];
}>();

const { t } = useI18n();
const center = injectTaskCenter();
const queue = center.queue;
const groups = center.groups;

const showDetail = computed(() => props.mode !== 'sheet' && center.detail.value !== null);
const bodyStyle = computed(() =>
  props.mode === 'popover' && showDetail.value && props.detailHeight
    ? { height: `${props.detailHeight}px` }
    : undefined,
);
const onOpenDetail = (id: string) => {
  center.openDetail(id);
  if (props.mode === 'sheet') emit('openDetail', id);
};

interface QueueSection {
  key: 'running' | 'queued' | 'finished';
  label: string;
  rows: TaskCenterRow[];
  action?: { label: string; run: () => void };
}
const sections = computed<QueueSection[]>(() => {
  const all: QueueSection[] = [
    { key: 'running', label: t('taskQueueUi.sectionRunning'), rows: groups.value.running },
    {
      key: 'queued',
      label: t('taskQueueUi.sectionQueued'),
      rows: groups.value.queued,
      action: { label: t('taskQueueUi.removeAllQueued'), run: () => void queue.removeAllQueued() },
    },
    {
      key: 'finished',
      label: t('taskQueueUi.sectionFinished'),
      rows: groups.value.finished,
      action: { label: t('taskQueueUi.clearFinished'), run: () => void queue.clearFinished() },
    },
  ];
  return all.filter((section) => section.rows.length > 0);
});
const isEmpty = computed(
  () =>
    groups.value.running.length === 0 &&
    groups.value.queued.length === 0 &&
    groups.value.finished.length === 0 &&
    center.otherTasks.value.length === 0,
);
const pausedText = computed(() => {
  if (!queue.meta.paused || groups.value.queued.length === 0) return '';
  return queue.meta.pausedReason === 'restored'
    ? t('taskQueueUi.pausedRestored')
    : t('taskQueueUi.pausedUser');
});
</script>

<template>
  <!-- 与同步、消息弹层共用 header 弹层外壳（hp-*，见主题 CSS） -->
  <div
    class="tc-body"
    :class="[`tc-body--${mode}`, { 'hp-panel': mode === 'popover' }]"
    :style="bodyStyle"
  >
    <header
      class="hp-head tc-head"
      :class="{ 'tc-head--drag': mode === 'pinned' }"
      @pointerdown="mode === 'pinned' && emit('dragStart', $event)"
    >
      <i v-if="mode === 'pinned'" class="pi pi-arrows-alt tc-head-grip" aria-hidden="true" />
      <span v-if="mode !== 'sheet'" class="hp-title">{{ t('taskQueueUi.title') }}</span>
      <span class="hp-meta">
        {{
          t('taskQueueUi.concurrency', {
            running: groups.running.length,
            max: center.maxConcurrent.value,
          })
        }}
      </span>
      <span class="hp-spacer" />
      <button
        v-if="queue.meta.paused"
        type="button"
        class="hp-icon-btn"
        :title="t('taskQueueUi.resume')"
        :aria-label="t('taskQueueUi.resume')"
        @pointerdown.stop
        @click="queue.resume()"
      >
        <i class="pi pi-play" aria-hidden="true" />
      </button>
      <button
        v-else
        type="button"
        class="hp-icon-btn"
        :title="t('taskQueueUi.pause')"
        :aria-label="t('taskQueueUi.pause')"
        @pointerdown.stop
        @click="queue.pause()"
      >
        <i class="pi pi-pause" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="hp-icon-btn"
        :disabled="groups.running.length === 0"
        :title="t('taskQueueUi.stopAll')"
        :aria-label="t('taskQueueUi.stopAll')"
        @pointerdown.stop
        @click="queue.stopAll()"
      >
        <i class="pi pi-stop" aria-hidden="true" />
      </button>
      <button
        v-if="mode === 'popover'"
        type="button"
        class="hp-icon-btn"
        :title="t('taskQueueUi.pin')"
        :aria-label="t('taskQueueUi.pin')"
        @click="emit('pin')"
      >
        <i class="pi pi-thumbtack" aria-hidden="true" />
      </button>
      <template v-if="mode === 'pinned'">
        <button
          type="button"
          class="hp-icon-btn"
          :title="t('taskQueueUi.collapse')"
          :aria-label="t('taskQueueUi.collapse')"
          @pointerdown.stop
          @click="emit('collapse')"
        >
          <i class="pi pi-minus" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="hp-icon-btn hp-icon-btn--active"
          :title="t('taskQueueUi.unpin')"
          :aria-label="t('taskQueueUi.unpin')"
          @pointerdown.stop
          @click="emit('unpin')"
        >
          <i class="pi pi-thumbtack" aria-hidden="true" />
        </button>
      </template>
    </header>

    <div v-if="center.noLocks.value" class="tc-banner">{{ t('taskQueueUi.noLocks') }}</div>
    <div v-if="pausedText" class="tc-banner">{{ pausedText }}</div>

    <TaskCenterDetailView v-if="showDetail" :mode="mode" @back="center.closeDetail()" />

    <div v-else class="tc-scroll">
      <div v-if="isEmpty" class="tc-empty">
        <i class="pi pi-list-check" aria-hidden="true" />
        <div class="tc-empty-title">{{ t('taskQueueUi.empty') }}</div>
        <div class="tc-empty-hint">{{ t('taskQueueUi.emptyHint') }}</div>
      </div>

      <template v-else>
        <section v-for="section in sections" :key="section.key" class="tc-section">
          <TaskCenterSectionHeader
            :tone="section.key"
            :label="section.label"
            :count="section.rows.length"
          >
            <button
              v-if="section.action"
              type="button"
              class="tc-sh-action"
              @click="section.action.run()"
            >
              {{ section.action.label }}
            </button>
          </TaskCenterSectionHeader>
          <TaskCenterQueueRow
            v-for="row in section.rows"
            :key="row.id"
            :row="row"
            @open-detail="onOpenDetail"
          />
        </section>
      </template>

      <!-- 后台向量化不属于章节任务：没有任务时也显示（本地嵌入关闭时不渲染） -->
      <TaskCenterEmbeddingSection />
      <TaskCenterOtherSection v-if="!isEmpty" @open-detail="onOpenDetail" />
    </div>
  </div>
</template>

<style scoped>
.tc-body {
  display: flex;
  flex-direction: column;
  min-height: 0;
  color: var(--moon-opacity-90);
}

/* 手机抽屉：由抽屉正文滚动，列表不另设滚动容器，分组标题栏才能相对抽屉吸顶 */
.tc-body--sheet .tc-scroll {
  overflow: visible;
}

/* 固定面板：高度由外层面板尺寸决定（可拖动缩放） */
.tc-body--pinned {
  flex: 1;
}

.tc-head--drag {
  cursor: move;
  user-select: none;
}

.tc-head-grip {
  font-size: 11px;
  color: var(--moon-opacity-50);
}

.tc-banner {
  padding: 6px 12px;
  font-size: 11px;
  color: #e7c98a;
  background: rgba(231, 201, 138, 0.08);
  border-bottom: 1px solid var(--white-opacity-6);
}

.tc-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

/* 分区之间：标题栏色带已有上下边线，最后一行不再画底线，避免双线 */
.tc-section > .tc-row:last-child {
  border-bottom: none;
}

.tc-section:first-child > :deep(.tc-sh) {
  border-top-color: transparent;
}

.tc-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 28px 16px;
  text-align: center;
  color: var(--moon-opacity-50);
}

.tc-empty i {
  font-size: 22px;
}

.tc-empty-title {
  font-size: 13px;
  color: var(--moon-opacity-80);
}

.tc-empty-hint {
  font-size: 11px;
}
</style>
