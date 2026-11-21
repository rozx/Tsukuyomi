<script setup lang="ts">
/**
 * 当前导入任务需要注意的提示：存储问题、等待回答、另一个任务在运行、未配置模型、
 * 上次失败原因与工作台错误。桌面 / 平板的运行条与手机三步引导共用。
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { resolveAppLocale } from 'src/models/locale';
import Message from 'primevue/message';
import { useImportWorkspaceStore } from 'src/stores/import-workspace';
import { useAIModelsStore } from 'src/stores/ai-models';
import { CHAT_ERROR_ACTIONS, readableError } from './import-labels';

const store = useImportWorkspaceStore();
const { t, locale } = useI18n();
const uiLocale = computed(() => resolveAppLocale(locale.value));
const aiModels = useAIModelsStore();

const runningOther = computed(
  () => store.runningTaskId !== undefined && store.runningTaskId !== store.selectedTaskId,
);
const awaitingAnswer = computed(() => {
  const question = store.task?.pendingQuestion;
  return Boolean(question?.required && !question.answer);
});
const hasModel = computed(() => Boolean(aiModels.getDefaultModelForTask('assistant')));
const lastError = computed(() => {
  const error = store.task?.lastError;
  return error && !store.isRunning ? readableError(error, uiLocale.value) : '';
});
const workspaceError = computed(
  () => Boolean(store.error) && !CHAT_ERROR_ACTIONS.has(store.errorAction ?? ''),
);
</script>

<template>
  <Message v-if="store.storageIssue" severity="error" :closable="false" class="irn-msg">
    {{
      t('importUi.runBar.storageIssue', {
        message: readableError(store.storageIssue, uiLocale),
      })
    }}
  </Message>
  <Message v-if="awaitingAnswer" severity="warn" :closable="false" class="irn-msg">
    {{ t('importUi.runBar.awaitingAnswer') }}
  </Message>
  <Message v-if="runningOther" severity="info" :closable="false" class="irn-msg">
    {{ t('importUi.runBar.otherRunning') }}
  </Message>
  <Message v-if="!hasModel" severity="warn" :closable="false" class="irn-msg">
    {{ t('importUi.runBar.noModel') }}
  </Message>
  <Message v-if="lastError" severity="secondary" :closable="false" class="irn-msg">
    {{ lastError }}
  </Message>
  <Message v-if="workspaceError" severity="error" class="irn-msg" @close="store.clearError">
    {{ readableError(store.error ?? '', uiLocale) }}
  </Message>
</template>

<style scoped>
.irn-msg {
  margin: 0;
}

.irn-msg :deep(.p-message-text) {
  font-size: 0.8rem;
}
</style>
