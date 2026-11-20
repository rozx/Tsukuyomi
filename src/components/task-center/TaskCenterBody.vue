<script setup lang="ts">
/**
 * 任务中心内容：标题区（并发、暂停 / 继续、全部停止、固定）、
 * 进行中 / 排队中 / 已完成三组章节任务，以及「其他 AI 活动」区。
 * popover、固定悬浮面板、手机抽屉共用。
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { AIProcessingTask } from 'src/stores/ai-processing';
import {
  injectTaskCenter,
  type TaskCenterRow,
} from 'src/composables/task-center/useTaskCenter';
import TaskCenterQueueRow from './TaskCenterQueueRow.vue';
import TaskCenterOtherSection from './TaskCenterOtherSection.vue';

const props = defineProps<{ mode: 'popover' | 'pinned' | 'sheet' }>();
const emit = defineEmits<{
  pin: [];
  unpin: [];
  collapse: [];
  dragStart: [event: PointerEvent];
  openRowDetail: [row: TaskCenterRow];
  openTaskDetail: [task: AIProcessingTask];
}>();

const { t } = useI18n();
const center = injectTaskCenter();
const queue = center.queue;
const groups = center.groups;

const external = computed(() => props.mode === 'sheet');
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
  <div class="tc-body" :class="`tc-body--${mode}`">
    <header
      class="tc-head"
      :class="{ 'tc-head--drag': mode === 'pinned' }"
      @pointerdown="mode === 'pinned' && emit('dragStart', $event)"
    >
      <i v-if="mode === 'pinned'" class="pi pi-arrows-alt tc-head-grip" aria-hidden="true" />
      <span v-if="mode !== 'sheet'" class="tc-head-title">{{ t('taskQueueUi.title') }}</span>
      <span class="tc-head-meta">
        {{ t('taskQueueUi.concurrency', { running: groups.running.length, max: center.maxConcurrent.value }) }}
      </span>
      <span class="tc-head-spacer" />
      <button
        v-if="queue.meta.paused"
        type="button"
        class="tc-head-btn"
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
        class="tc-head-btn"
        :title="t('taskQueueUi.pause')"
        :aria-label="t('taskQueueUi.pause')"
        @pointerdown.stop
        @click="queue.pause()"
      >
        <i class="pi pi-pause" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="tc-head-btn"
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
        class="tc-head-btn"
        :title="t('taskQueueUi.pin')"
        :aria-label="t('taskQueueUi.pin')"
        @click="emit('pin')"
      >
        <i class="pi pi-thumbtack" aria-hidden="true" />
      </button>
      <template v-if="mode === 'pinned'">
        <button
          type="button"
          class="tc-head-btn"
          :title="t('taskQueueUi.collapse')"
          :aria-label="t('taskQueueUi.collapse')"
          @pointerdown.stop
          @click="emit('collapse')"
        >
          <i class="pi pi-minus" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="tc-head-btn tc-head-btn--active"
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

    <div class="tc-scroll">
      <div v-if="isEmpty" class="tc-empty">
        <i class="pi pi-list-check" aria-hidden="true" />
        <div class="tc-empty-title">{{ t('taskQueueUi.empty') }}</div>
        <div class="tc-empty-hint">{{ t('taskQueueUi.emptyHint') }}</div>
      </div>

      <template v-else>
        <section v-if="groups.running.length > 0">
          <div class="tc-section">{{ t('taskQueueUi.sectionRunning', { count: groups.running.length }) }}</div>
          <TaskCenterQueueRow
            v-for="row in groups.running"
            :key="row.id"
            :row="row"
            :open-detail-externally="external"
            @open-detail="emit('openRowDetail', $event)"
          />
        </section>

        <section v-if="groups.queued.length > 0">
          <div class="tc-section">
            <span>{{ t('taskQueueUi.sectionQueued', { count: groups.queued.length }) }}</span>
            <button type="button" class="tc-section-action" @click="queue.removeAllQueued()">
              {{ t('taskQueueUi.removeAllQueued') }}
            </button>
          </div>
          <TaskCenterQueueRow
            v-for="row in groups.queued"
            :key="row.id"
            :row="row"
            :open-detail-externally="external"
            @open-detail="emit('openRowDetail', $event)"
          />
        </section>

        <section v-if="groups.finished.length > 0">
          <div class="tc-section">
            <span>{{ t('taskQueueUi.sectionFinished', { count: groups.finished.length }) }}</span>
            <button type="button" class="tc-section-action" @click="queue.clearFinished()">
              {{ t('taskQueueUi.clearFinished') }}
            </button>
          </div>
          <TaskCenterQueueRow
            v-for="row in groups.finished"
            :key="row.id"
            :row="row"
            :open-detail-externally="external"
            @open-detail="emit('openRowDetail', $event)"
          />
        </section>

        <TaskCenterOtherSection
          :open-detail-externally="external"
          @open-detail="emit('openTaskDetail', $event)"
        />
      </template>
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

.tc-body--popover {
  max-height: min(640px, 80dvh);
}

.tc-body--pinned {
  max-height: min(560px, 70dvh);
}

.tc-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--white-opacity-8);
  flex-shrink: 0;
}

.tc-head--drag {
  cursor: move;
  user-select: none;
}

.tc-head-grip {
  font-size: 11px;
  color: var(--moon-opacity-50);
}

.tc-head-title {
  font-size: 13px;
  font-weight: 600;
}

.tc-head-meta {
  font-size: 11px;
  color: var(--moon-opacity-50);
}

.tc-head-spacer {
  flex: 1;
}

.tc-head-btn {
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--moon-opacity-60);
  cursor: pointer;
}

.tc-head-btn:hover:not(:disabled) {
  background: var(--white-opacity-8);
  color: var(--moon-opacity-100);
}

.tc-head-btn:disabled {
  opacity: 0.35;
  cursor: default;
}

.tc-head-btn--active {
  color: #a3b7cf;
}

.tc-head-btn i {
  font-size: 12px;
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

.tc-section {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px 2px;
  font-size: 11px;
  color: var(--moon-opacity-50);
}

.tc-section-action {
  background: none;
  border: none;
  padding: 0;
  font-size: 11px;
  color: #a3b7cf;
  cursor: pointer;
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
