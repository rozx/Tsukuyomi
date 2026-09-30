<script setup lang="ts">
/**
 * 当前任务的标题、状态、进度与运行控制。整理完成只显示「可预览」，
 * 不等于已导入书库；目录完整性未确认时只报告「已发现」数量。
 */
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { resolveAppLocale } from 'src/models/locale';
import Button from 'primevue/button';
import Tag from 'primevue/tag';
import Message from 'primevue/message';
import InputText from 'primevue/inputtext';
import { useImportWorkspaceStore } from 'src/stores/import-workspace';
import { useAIModelsStore } from 'src/stores/ai-models';
import { CHAT_ERROR_ACTIONS, TASK_STATE, readableError } from './import-labels';

const store = useImportWorkspaceStore();
const { t, locale } = useI18n();
const uiLocale = computed(() => resolveAppLocale(locale.value));
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
    const known = t('importUi.runBar.knownProgress', { total: completeness.knownTotal, ready });
    return missing ? `${known}${t('importUi.runBar.missingSuffix', { count: missing })}` : known;
  }
  return t('importUi.runBar.foundProgress', { found: draft.chapters.length, ready });
});

const continueLabel = computed(() =>
  t(
    task.value?.checkpoint?.remainingCalls.length
      ? 'importUi.chat.continueCalls'
      : 'importUi.chat.continue',
  ),
);
const lastError = computed(() => {
  const error = task.value?.lastError;
  return error ? readableError(error, uiLocale.value) : '';
});

const workspaceError = computed(
  () => Boolean(store.error) && !CHAT_ERROR_ACTIONS.has(store.errorAction ?? ''),
);

const continueRun = () => void store.send('');
</script>

<template>
  <section v-if="task" class="irb" :aria-label="t('importUi.runBar.region')">
    <div class="irb-row">
      <InputText
        v-model="name"
        class="irb-name"
        :aria-label="t('importUi.runBar.name')"
        maxlength="80"
        @blur="saveName"
        @keydown.enter="saveName"
      />
      <Tag v-if="state" :value="t(state.label)" :severity="state.severity" />
      <div class="irb-actions">
        <Button
          v-if="running"
          icon="pi pi-pause"
          :label="t('importUi.runBar.pause')"
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
        {{
          t('importUi.runBar.sources', {
            extracted: sourceProgress.extracted,
            total: sourceProgress.total,
          })
        }}
        <template v-if="sourceProgress.failed">
          · {{ t('importUi.runBar.sourcesFailed', { count: sourceProgress.failed }) }}</template
        >
      </span>
      <span>{{ chapterProgress }}</span>
      <span v-if="task.batchProgress" aria-live="polite">
        {{
          t('importUi.runBar.batch', {
            ready: task.batchProgress.ready,
            total: task.batchProgress.total,
            pending: task.batchProgress.pending,
          })
        }}
        <template v-if="task.batchProgress.failed">
          · {{ t('importUi.runBar.batchFailed', { count: task.batchProgress.failed }) }}</template
        >
      </span>
    </div>

    <Message v-if="store.storageIssue" severity="error" :closable="false" class="irb-msg">
      {{
        t('importUi.runBar.storageIssue', {
          message: readableError(store.storageIssue, uiLocale),
        })
      }}
    </Message>
    <Message v-if="awaitingAnswer" severity="warn" :closable="false" class="irb-msg">
      {{ t('importUi.runBar.awaitingAnswer') }}
    </Message>
    <Message v-if="runningOther" severity="info" :closable="false" class="irb-msg">
      {{ t('importUi.runBar.otherRunning') }}
    </Message>
    <Message v-if="!hasModel" severity="warn" :closable="false" class="irb-msg">
      {{ t('importUi.runBar.noModel') }}
    </Message>
    <Message v-if="lastError && !running" severity="secondary" :closable="false" class="irb-msg">
      {{ lastError }}
    </Message>
    <Message v-if="workspaceError" severity="error" class="irb-msg" @close="store.clearError">
      {{ readableError(store.error ?? '', uiLocale) }}
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
