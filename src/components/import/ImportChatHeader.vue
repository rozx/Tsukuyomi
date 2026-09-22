<script setup lang="ts">
/** 导入聊天外壳的标题栏：显示当前任务、运行状态，并提供暂停与关闭。 */
import { computed } from 'vue';
import AssistantAvatar from 'src/components/layout/AssistantAvatar.vue';
import { useImportWorkspaceStore } from 'src/stores/import-workspace';
import { useAIModelsStore } from 'src/stores/ai-models';
import { TASK_STATE } from './import-labels';

const emit = defineEmits<{ close: [] }>();

const store = useImportWorkspaceStore();
const aiModels = useAIModelsStore();
const model = computed(() => aiModels.getDefaultModelForTask('assistant'));

const subtitle = computed(() => {
  const task = store.task;
  if (!task) return '未选择导入任务';
  return `${task.name} · ${TASK_STATE[task.state].label}`;
});
</script>

<template>
  <header class="icb-appbar">
    <AssistantAvatar :size="28" class="tcp-appbar-avatar" />
    <div class="tcp-appbar-text">
      <div class="tcp-appbar-title">月詠 · AI 导入</div>
      <div class="tcp-appbar-sub">
        <span class="tcp-status-dot" :class="{ 'tcp-status-dot--off': !model }" />
        {{ subtitle }}
      </div>
    </div>
    <button
      v-if="store.isRunning"
      type="button"
      class="tcp-icon-btn"
      aria-label="暂停导入"
      @click="store.pause"
    >
      <i class="pi pi-pause" aria-hidden="true" />
    </button>
    <button
      type="button"
      class="tcp-icon-btn tcp-icon-btn--close"
      aria-label="关闭"
      @click="emit('close')"
    >
      <i class="pi pi-times" aria-hidden="true" />
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
</style>
