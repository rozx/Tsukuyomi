<script setup lang="ts">
/**
 * 当前任务的标题、状态、进度与运行控制。整理完成只显示「可预览」，
 * 不等于已导入书库；目录完整性未确认时只报告「已发现」数量。
 */
import { computed, ref, watch } from 'vue';
import Button from 'primevue/button';
import Tag from 'primevue/tag';
import Message from 'primevue/message';
import InputText from 'primevue/inputtext';
import { useImportWorkspaceStore } from 'src/stores/import-workspace';
import { useAIModelsStore } from 'src/stores/ai-models';
import { CHAT_ERROR_ACTIONS, TASK_STATE, readableError } from './import-labels';

const store = useImportWorkspaceStore();
const aiModels = useAIModelsStore();

const task = computed(() => store.task);
const name = ref('');
watch(
  () => task.value?.name,
  (value) => {
    name.value = value ?? '';
  },
  { immediate: true },
);
const saveName = () => {
  if (task.value && name.value.trim() && name.value !== task.value.name)
    void store.renameTask(task.value.id, name.value);
};

const state = computed(() => (task.value ? TASK_STATE[task.value.state] : undefined));
const running = computed(() => store.isRunning);
const runningOther = computed(
  () => store.runningTaskId !== undefined && store.runningTaskId !== store.selectedTaskId,
);
const awaitingAnswer = computed(() => {
  const question = task.value?.pendingQuestion;
  return Boolean(question?.required && !question.answer);
});
const hasModel = computed(() => Boolean(aiModels.getDefaultModelForTask('assistant')));

const sourceProgress = computed(() => {
  const content = store.sources.filter((source) => source.purpose !== 'metadata-only');
  const extracted = content.filter((source) => source.status === 'extracted').length;
  const failed = content.filter((source) => source.status === 'failed').length;
  return { total: content.length, extracted, failed };
});

const chapterProgress = computed(() => {
  const draft = task.value?.draft;
  if (!draft) return '';
  const ready = draft.chapters.filter((chapter) => chapter.status === 'ready').length;
  const { completeness } = draft;
  if (completeness.confirmed && completeness.knownTotal !== undefined) {
    const missing = completeness.missing.length;
    return `目录共 ${completeness.knownTotal} 章 · 已取得 ${ready} 章${missing ? ` · 缺 ${missing} 章` : ''}`;
  }
  return `已发现 ${draft.chapters.length} 章 · 已取得 ${ready} 章 · 完整性未确认`;
});

const continueLabel = computed(() =>
  task.value?.checkpoint?.remainingCalls.length ? '继续执行' : '继续整理',
);
const lastError = computed(() => {
  const error = task.value?.lastError;
  return error ? readableError(error.message) : '';
});

const workspaceError = computed(
  () => Boolean(store.error) && !CHAT_ERROR_ACTIONS.has(store.errorAction ?? ''),
);

const continueRun = () => void store.send('');
</script>

<template>
  <section v-if="task" class="irb" aria-label="任务状态">
    <div class="irb-row">
      <InputText
        v-model="name"
        class="irb-name"
        aria-label="任务名称"
        maxlength="80"
        @blur="saveName"
        @keydown.enter="saveName"
      />
      <Tag v-if="state" :value="state.label" :severity="state.severity" />
      <div class="irb-actions">
        <Button
          v-if="running"
          icon="pi pi-pause"
          label="暂停"
          size="small"
          severity="warn"
          :loading="task.state === 'pausing'"
          @click="store.pause"
        />
        <Button
          v-else
          icon="pi pi-play"
          :label="continueLabel"
          size="small"
          :disabled="!store.canContinue"
          @click="continueRun"
        />
      </div>
    </div>

    <div class="irb-progress">
      <span>
        来源 {{ sourceProgress.extracted }}/{{ sourceProgress.total }} 已提取
        <template v-if="sourceProgress.failed"> · {{ sourceProgress.failed }} 个失败</template>
      </span>
      <span>{{ chapterProgress }}</span>
    </div>

    <Message v-if="store.storageIssue" severity="error" :closable="false" class="irb-msg">
      {{ store.storageIssue.message }} 在恢复前，最新进度不能保证在关闭页面后仍可找回。
    </Message>
    <Message v-if="awaitingAnswer" severity="warn" :closable="false" class="irb-msg">
      月詠在等待你的回答（见对话区），回答后才会继续。
    </Message>
    <Message v-if="runningOther" severity="info" :closable="false" class="irb-msg">
      另一个导入任务正在运行。同一时间只能运行一个任务，请先暂停它。
    </Message>
    <Message v-if="!hasModel" severity="warn" :closable="false" class="irb-msg">
      尚未配置助手模型，请先在「AI 模型」中为助手指定默认模型。
    </Message>
    <Message v-if="lastError && !running" severity="secondary" :closable="false" class="irb-msg">
      {{ lastError }}
    </Message>
    <Message v-if="workspaceError" severity="error" class="irb-msg" @close="store.clearError">
      {{ readableError(store.error ?? '') }}
    </Message>
  </section>
</template>

<style scoped>
.irb {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.irb-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.irb-name {
  flex: 1 1 12rem;
  min-width: 0;
  font-weight: 600;
}

.irb-actions {
  display: flex;
  gap: 0.35rem;
  flex-wrap: wrap;
}

.irb-progress {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 1rem;
  font-size: 0.75rem;
  color: rgba(226, 232, 240, 0.6);
}

.irb-msg {
  margin: 0;
}

.irb-msg :deep(.p-message-text) {
  font-size: 0.8rem;
}
</style>
