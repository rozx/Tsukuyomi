<script setup lang="ts">
/** 导入聊天外壳的标题栏：显示当前任务、运行状态，并提供压缩上下文、继续与暂停。 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import AssistantAvatar from 'src/components/layout/AssistantAvatar.vue';
import { useImportWorkspaceStore } from 'src/stores/import-workspace';
import { useAIModelsStore } from 'src/stores/ai-models';
import { TASK_STATE } from './import-labels';

const store = useImportWorkspaceStore();
const { t } = useI18n();
const aiModels = useAIModelsStore();
const model = computed(() => aiModels.getDefaultModelForTask('assistant'));

const subtitle = computed(() => {
  const task = store.task;
  if (!task) return t('importUi.chat.noTaskSelected');
  return `${task.name} · ${t(TASK_STATE[task.state].label)}`;
});
const compacting = computed(
  () => Boolean(store.task?.compacting) || store.pendingAction === 'compact',
);
const continueLabel = computed(() =>
  t(
    store.task?.checkpoint?.remainingCalls.length
      ? 'importUi.chat.continueCalls'
      : 'importUi.chat.continue',
  ),
);
</script>

<template>
  <header class="icb-appbar">
    <AssistantAvatar :size="28" class="tcp-appbar-avatar" />
    <div class="tcp-appbar-text">
      <div class="tcp-appbar-title">{{ t('importUi.chat.title') }}</div>
      <div class="tcp-appbar-sub">
        <span class="tcp-status-dot" :class="{ 'tcp-status-dot--off': !model }" />
        {{ subtitle }}
      </div>
    </div>
    <button
      v-if="store.task"
      type="button"
      class="tcp-icon-btn"
      :class="{ 'icb-spin': compacting }"
      :disabled="!store.canCompact"
      :title="t(compacting ? 'importUi.chat.compactingTitle' : 'importUi.chat.compactTitle')"
      :aria-label="t('importUi.chat.compact')"
      @click="store.compact()"
    >
      <i class="pi pi-arrow-down-left-and-arrow-up-right-to-center" aria-hidden="true" />
    </button>
    <button
      v-if="store.isRunning"
      type="button"
      class="tcp-icon-btn"
      :title="t('importUi.chat.pause')"
      :aria-label="t('importUi.chat.pause')"
      @click="store.pause"
    >
      <i class="pi pi-pause" aria-hidden="true" />
    </button>
    <button
      v-else-if="store.task"
      type="button"
      class="tcp-icon-btn"
      :disabled="!store.canContinue"
      :title="continueLabel"
      :aria-label="continueLabel"
      @click="store.send('')"
    >
      <i class="pi pi-play" aria-hidden="true" />
    </button>
  </header>
</template>

<style scoped src="../layout/chat-panel.css"></style>
<style scoped>
.icb-appbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
  width: 100%;
}

.icb-appbar .tcp-icon-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.icb-spin i {
  animation: icb-pulse 1.2s ease-in-out infinite;
}

@keyframes icb-pulse {
  50% {
    opacity: 0.35;
  }
}
</style>
