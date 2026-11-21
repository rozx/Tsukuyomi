<script setup lang="ts">
/**
 * 手机导入任务顶部的「月詠在做什么」预览：状态 + 一行说明（必答问题、错误、运行输出、最近的回复……），
 * 点击打开月詠对话抽屉（与底部栏「月詠」同一个入口）。
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { resolveAppLocale } from 'src/models/locale';
import AssistantAvatar from 'src/components/layout/AssistantAvatar.vue';
import { useImportWorkspaceStore } from 'src/stores/import-workspace';
import { useMainNavDispatch } from 'src/composables/layout/useMainNavDispatch';
import { buildImportAssistantPreview } from 'src/composables/import-page/import-assistant-preview';
import { CHAT_ERROR_ACTIONS, TASK_STATE, readableError } from './import-labels';

const store = useImportWorkspaceStore();
const { t, locale } = useI18n();
const { dispatch } = useMainNavDispatch();

// 月詠最近一条回复：从任务事件末尾往前找（只看助手消息，不重新生成整段对话）
const lastReply = computed(() => {
  for (let index = store.events.length - 1; index >= 0; index--) {
    const message = store.events[index]!.message;
    if (message?.role === 'assistant' && message.content?.trim()) return message.content;
  }
  return undefined;
});

const preview = computed(() => {
  const task = store.task;
  const question = task?.pendingQuestion;
  const chatError =
    store.error && CHAT_ERROR_ACTIONS.has(store.errorAction ?? '')
      ? readableError(store.error, resolveAppLocale(locale.value))
      : undefined;
  return buildImportAssistantPreview(
    {
      stateLabel: task ? t(TASK_STATE[task.state].label) : '',
      running: store.isRunning,
      compacting: Boolean(task?.compacting) || store.pendingAction === 'compact',
      ...(task?.streaming?.text ? { streamingText: task.streaming.text } : {}),
      ...(chatError ? { error: chatError } : {}),
      ...(question?.required && !question.answer ? { question: question.question } : {}),
      ...(lastReply.value ? { lastReply: lastReply.value } : {}),
    },
    {
      question: t('importUi.chat.previewQuestion'),
      error: t('importUi.chat.previewError'),
      compacting: t('importUi.chat.previewCompacting'),
      running: t('importUi.chat.previewRunning'),
      idleHint: t('importUi.chat.previewHint'),
    },
  );
});
</script>

<template>
  <button
    type="button"
    class="iap"
    :class="`iap--${preview.tone}`"
    :aria-label="t('importUi.chat.open')"
    @click="dispatch('chat')"
  >
    <AssistantAvatar :size="26" class="iap-avatar" />
    <span class="iap-text">
      <span class="iap-status">
        <span class="iap-dot" aria-hidden="true" />
        {{ preview.status }}
      </span>
      <span v-if="preview.detail" class="iap-detail">{{ preview.detail }}</span>
    </span>
    <i class="pi pi-angle-up iap-open" aria-hidden="true" />
  </button>
</template>

<style scoped>
.iap {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  padding: 4px 10px 4px 6px;
  border: 1px solid var(--white-opacity-8);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.03);
  color: inherit;
  text-align: left;
}

.iap:active {
  background: rgba(109, 136, 168, 0.12);
}

.iap-avatar {
  flex-shrink: 0;
}

.iap-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.iap-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--moon-50-opacity-100);
}

.iap-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--moon-50-opacity-50);
}

.iap--active .iap-dot {
  background: var(--tsukuyomi-300);
  box-shadow: 0 0 0 3px rgba(163, 183, 207, 0.2);
}

.iap--attention .iap-dot {
  background: #e7c98a;
}

.iap--attention {
  border-color: rgba(231, 201, 138, 0.35);
}

.iap--error .iap-dot {
  background: #f0a3a3;
}

.iap--error {
  border-color: rgba(240, 163, 163, 0.35);
}

.iap-detail {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11.5px;
  color: var(--moon-50-opacity-60);
}

.iap-open {
  flex-shrink: 0;
  font-size: 13px;
  color: var(--moon-50-opacity-50);
}
</style>
