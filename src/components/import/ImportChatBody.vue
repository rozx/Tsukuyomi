<script setup lang="ts">
/**
 * 导入聊天的消息区、待回答问题、待办与输入栏。复用月詠的消息列表、操作记录浮层、
 * 待办区和发送按钮；数据全部来自 useImportChatPanel（当前导入任务），每次只挂载一个。
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { resolveAppLocale } from 'src/models/locale';
import ChatActionPopovers from 'src/components/layout/ChatActionPopovers.vue';
import ChatSendButton from 'src/components/layout/ChatSendButton.vue';
import ChatMessageList from 'src/components/layout/ChatMessageList.vue';
import ChatTodoSection from 'src/components/layout/ChatTodoSection.vue';
import { useImportChatPanel } from 'src/composables/import-page/useImportChatPanel';
import { useChatPanelBindings } from 'src/composables/right-panel/useChatPanelBindings';
import ImportQuestionCard from './ImportQuestionCard.vue';
import { CHAT_ERROR_ACTIONS, readableError } from './import-labels';

withDefaults(defineProps<{ safeArea?: boolean }>(), { safeArea: false });
const { t, locale } = useI18n();

const panel = useImportChatPanel();
const {
  store,
  messagesContainerRef,
  inputMessage,
  todos,
  incompleteTodoCount,
  showTodoList,
  awaitingAnswer,
  sendMessage,
} = panel;

const { composer, actionPopoverBindings, messageListBindings } = useChatPanelBindings(panel, {
  sendClassPrefix: 'tcp-send',
  readyPlaceholderKey: 'importUi.chat.readyPlaceholder',
});
const { inputPlaceholder, sendButton, onSendClick } = composer;

const blockedReason = computed(() => {
  if (!store.task) return t('importUi.chat.noTask');
  if (awaitingAnswer.value) return t('importUi.chat.answerFirst');
  if (store.task.compacting || store.pendingAction === 'compact')
    return t('importUi.chat.compacting');
  if (store.runningTaskId && store.runningTaskId !== store.selectedTaskId)
    return t('importUi.chat.otherRunning');
  return '';
});
const chatError = computed(() =>
  store.error && CHAT_ERROR_ACTIONS.has(store.errorAction ?? '')
    ? readableError(store.error, resolveAppLocale(locale.value))
    : '',
);
const inputDisabled = computed(() => composer.inputDisabled.value || Boolean(blockedReason.value));
const placeholder = computed(() => blockedReason.value || inputPlaceholder.value);
const sendBindings = computed(() => ({
  ...sendButton.value,
  disabled: sendButton.value.disabled || (Boolean(blockedReason.value) && !store.isRunning),
}));
</script>

<template>
  <div class="icb">
    <ChatTodoSection
      v-if="todos.length"
      v-model="showTodoList"
      :todos="todos"
      :incomplete-todo-count="incompleteTodoCount"
    />

    <div ref="messagesContainerRef" class="icb-messages">
      <p v-if="!store.task" class="icb-empty">{{ t('importUi.chat.empty') }}</p>
      <ChatMessageList v-else v-bind="messageListBindings" />
    </div>

    <ImportQuestionCard />

    <div v-if="chatError" class="icb-error" role="alert">
      <i class="pi pi-exclamation-circle" aria-hidden="true" />
      <span class="icb-error-text">{{ chatError }}</span>
      <button
        type="button"
        class="icb-error-close"
        :aria-label="t('importUi.chat.closeError')"
        @click="store.clearError"
      >
        <i class="pi pi-times" aria-hidden="true" />
      </button>
    </div>

    <div class="icb-composer-wrap" :class="{ 'icb-composer-wrap--safe': safeArea }">
      <div class="tcp-composer">
        <input
          v-model="inputMessage"
          :disabled="inputDisabled"
          :placeholder="placeholder"
          class="tcp-input"
          :aria-label="t('importUi.chat.input')"
          @keydown.enter.exact.prevent="sendMessage"
        />
        <ChatSendButton v-bind="sendBindings" @click="onSendClick" />
      </div>
    </div>

    <ChatActionPopovers :bindings="actionPopoverBindings" />
  </div>
</template>

<style scoped src="../layout/chat-panel.css"></style>
<style scoped>
.icb {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  width: 100%;
}

.icb-messages {
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 14px 16px 8px;
  display: flex;
  flex-direction: column;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

.icb-messages :deep(.h-full) {
  flex: 1;
  min-height: 100%;
}

.icb-empty {
  margin: auto;
  text-align: center;
  font-size: 0.8rem;
  color: rgba(226, 232, 240, 0.55);
  padding: 2rem 1rem;
}

.icb-error {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0 12px 8px;
  padding: 8px 10px;
  border-radius: 10px;
  font-size: 0.78rem;
  line-height: 1.5;
  color: rgb(254, 202, 202);
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.28);
}

.icb-error > i {
  margin-top: 3px;
}

.icb-error-text {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}

.icb-error-close {
  color: inherit;
  opacity: 0.7;
}

.icb-composer-wrap {
  padding: 10px 12px 14px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(10, 12, 15, 0.72);
  flex-shrink: 0;
}

.icb-composer-wrap--safe {
  padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 12px);
}
</style>
