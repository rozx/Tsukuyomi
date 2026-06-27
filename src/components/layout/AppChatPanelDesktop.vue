<script setup lang="ts">
/**
 * 桌面 AI 助手面板 —— 与 TabletChatPanel 同构，但保留桌面专属的 context /
 * todo / session stats 等细节。由 AppRightPanelDesktop 在右栏展开时挂载，
 * 关闭按钮直接调用 `ui.closeRightPanel()` 折叠成图标栏。
 */
import { computed } from 'vue';
import Textarea from 'primevue/textarea';
import ProgressBar from 'primevue/progressbar';
import ChatActionPopovers from 'src/components/layout/ChatActionPopovers.vue';
import ChatSendButton from 'src/components/layout/ChatSendButton.vue';
import ChatSessionListPopover from 'src/components/layout/ChatSessionListPopover.vue';
import ChatMessageList from 'src/components/layout/ChatMessageList.vue';
import ChatTodoSection from 'src/components/layout/ChatTodoSection.vue';
import AssistantAvatar from 'src/components/layout/AssistantAvatar.vue';
import { useRightPanel } from 'src/composables/right-panel/useRightPanel';
import { useChatPanelBindings } from 'src/composables/right-panel/useChatPanelBindings';

// Desktop 直接用 useRightPanel（需要 todo / sessionStats / inputRef 等桌面专属字段），
// 整个 panel 对象 + 自带的三个 bind 回调传给 useChatPanelBindings，避免逐字段重复实参。
const panel = useRightPanel();
const {
  ui,
  chatSessionsStore,
  messagesContainerRef,
  inputRef,
  sessionListPopoverRef,
  actionPopoverRef,
  groupedActionPopoverRef,
  messages,
  inputMessage,
  isSending,
  handleKeydown,
  todos,
  showTodoList,
  incompleteTodoCount,
  recentSessions,
  switchToSession,
  toggleSessionListPopover,
  hideSessionListPopover,
  createNewSession,
  clearChat,
  assistantModel,
  contextInfo,
  sessionStats,
} = panel;

const bindSessionListRef = (el: unknown) => {
  sessionListPopoverRef.value = el as typeof sessionListPopoverRef.value;
};
const bindActionPopoverRef = (el: unknown) => {
  actionPopoverRef.value = el as typeof actionPopoverRef.value;
};
const bindGroupedActionPopoverRef = (el: unknown) => {
  groupedActionPopoverRef.value = el as typeof groupedActionPopoverRef.value;
};

const close = () => ui.closeRightPanel();

// 发送状态 / 浮层绑定 / 消息列表绑定一次性产出（与 Tablet / Mobile 同构，桌面 placeholder 多带换行提示）。
const { composer, actionPopoverBindings, messageListBindings } = useChatPanelBindings(
  { ...panel, bindActionPopoverRef, bindGroupedActionPopoverRef },
  {
    sendClassPrefix: 'cp-send',
    readyPlaceholder: '请月詠相助… (Shift+Enter 换行)',
  },
);
const { assistantStatusText, inputPlaceholder, inputDisabled, sendButton, onSendClick } = composer;

// 状态点 / 用量文本：把模板里的 :class 对象与 || 表达式搬到 computed，进一步压低模板圈复杂度
const statusDotClass = computed(() => ({ 'cp-status-dot--off': !assistantModel.value }));
const usageText = computed(() => {
  const s = sessionStats.value;
  if (!s) return '';
  return `${s.maxPercentage}% · ${s.tokens}/${s.maxInputTokens || '∞'}`;
});
</script>

<template>
  <section class="cp-shell" aria-label="月詠 AI 助手">
    <header class="cp-appbar">
      <AssistantAvatar :size="28" class="cp-appbar-avatar" />
      <div class="cp-appbar-text">
        <div class="cp-appbar-title">月詠</div>
        <div class="cp-appbar-sub">
          <span class="cp-status-dot" :class="statusDotClass" />
          {{ assistantStatusText }}
        </div>
      </div>
      <button
        v-if="chatSessionsStore.allSessions.length > 1"
        id="session-list-button-desktop"
        type="button"
        class="cp-icon-btn"
        aria-label="会话历史"
        @click="toggleSessionListPopover"
      >
        <i class="pi pi-history" aria-hidden="true" />
      </button>
      <button type="button" class="cp-icon-btn" aria-label="新聊天" @click="createNewSession">
        <i class="pi pi-plus" aria-hidden="true" />
      </button>
      <button
        v-if="messages.length > 0"
        type="button"
        class="cp-icon-btn"
        aria-label="清空聊天"
        @click="clearChat"
      >
        <i class="pi pi-trash" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="cp-icon-btn cp-icon-btn--close"
        aria-label="关闭"
        @click="close"
      >
        <i class="pi pi-times" aria-hidden="true" />
      </button>
    </header>

    <ChatSessionListPopover
      :ref="bindSessionListRef"
      target="#session-list-button-desktop"
      :sessions="recentSessions"
      :current-session-id="chatSessionsStore.currentSessionId"
      @hide="hideSessionListPopover"
      @select="switchToSession"
    />

    <div v-if="contextInfo !== '无上下文'" class="cp-context">
      <p>{{ contextInfo }}</p>
    </div>

    <ChatTodoSection
      v-model="showTodoList"
      :todos="todos"
      :incomplete-todo-count="incompleteTodoCount"
    />

    <div ref="messagesContainerRef" class="cp-messages">
      <ChatMessageList v-bind="messageListBindings" />
    </div>

    <div class="cp-composer-wrap">
      <div v-if="sessionStats" v-tooltip.top="sessionStats.summary" class="cp-usage-bar">
        <ProgressBar :value="sessionStats.maxPercentage" :show-value="false" />
        <div class="cp-usage-text">
          {{ usageText }}
        </div>
      </div>
      <div class="cp-composer">
        <Textarea
          ref="inputRef"
          v-model="inputMessage"
          :disabled="inputDisabled"
          :placeholder="inputPlaceholder"
          class="cp-input"
          :auto-resize="true"
          rows="1"
          :unstyled="true"
          @keydown="handleKeydown"
        />
        <ChatSendButton v-bind="sendButton" @click="onSendClick" />
      </div>
    </div>

    <ChatActionPopovers :bindings="actionPopoverBindings" />
  </section>
</template>

<style scoped>
.cp-shell {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.cp-appbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--white-opacity-6);
  flex-shrink: 0;
}

.cp-appbar-avatar {
  flex-shrink: 0;
}

.cp-appbar-text {
  flex: 1;
  min-width: 0;
}

.cp-appbar-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--moon-opacity-100);
  line-height: 1.2;
}

.cp-appbar-sub {
  font-size: 10px;
  color: var(--moon-opacity-50);
  margin-top: 2px;
  display: flex;
  align-items: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cp-status-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-success-300);
  margin-right: 6px;
  flex-shrink: 0;
}

.cp-status-dot--off {
  background: var(--moon-opacity-30);
}

.cp-icon-btn {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--moon-opacity-70);
  background: transparent;
  border: none;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.cp-icon-btn:hover,
.cp-icon-btn:active {
  background: var(--white-opacity-6);
  color: var(--moon-opacity-100);
}

.cp-icon-btn i {
  font-size: 13px;
}

.cp-icon-btn--close {
  border-radius: 50%;
  border: 1px solid var(--white-opacity-10);
  background: var(--white-opacity-4);
  color: rgba(192, 198, 209, 0.85);
}

.cp-icon-btn--close i {
  font-size: 11px;
}

.cp-icon-btn--close:hover,
.cp-icon-btn--close:active {
  background: var(--white-opacity-8);
  color: #e9edf5;
}

.cp-context {
  flex-shrink: 0;
  padding: 6px 16px;
  border-bottom: 1px solid var(--white-opacity-6);
}

.cp-context p {
  font-size: 10px;
  color: var(--moon-opacity-50);
  margin: 0;
}

.cp-messages {
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 14px 16px 8px;
  scrollbar-width: thin;
  scrollbar-color: var(--white-opacity-20) transparent;
  display: flex;
  flex-direction: column;
}

.cp-messages :deep(.h-full) {
  flex: 1;
  min-height: 100%;
}

.cp-messages::-webkit-scrollbar {
  width: 6px;
}

.cp-messages::-webkit-scrollbar-thumb {
  background: var(--white-opacity-20);
  border-radius: 3px;
}

.cp-composer-wrap {
  padding: 10px 12px 14px;
  border-top: 1px solid var(--white-opacity-6);
  background: var(--night-500-opacity-72);
  flex-shrink: 0;
}

.cp-usage-bar {
  margin-bottom: 8px;
}

.cp-usage-bar :deep(.p-progressbar) {
  height: 5px;
  background: var(--white-opacity-6);
}

.cp-usage-bar :deep(.p-progressbar-value) {
  transition: width 0.2s ease;
}

.cp-usage-text {
  margin-top: 4px;
  font-size: 10px;
  color: var(--moon-opacity-50);
}

.cp-composer {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 8px 10px;
  background: var(--white-opacity-4);
  border: 1px solid var(--white-opacity-10);
  border-radius: 20px;
  transition: border-color 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.cp-composer:focus-within {
  border-color: var(--primary-opacity-35);
}

.cp-input {
  flex: 1;
  min-width: 0;
  background: transparent;
  border: none;
  outline: none;
  color: var(--moon-opacity-100);
  font-family:
    'Noto Sans SC',
    'PingFang SC',
    -apple-system,
    sans-serif;
  font-size: 14px;
  line-height: 1.45;
  padding: 6px 0;
  resize: none;
  max-height: 160px;
  overflow-y: auto;
}

.cp-input::placeholder {
  color: var(--moon-opacity-40);
}

.cp-input:disabled {
  opacity: 0.5;
  cursor: default;
}

.cp-send {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--accent-blue-color);
  color: white;
  border: none;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.cp-send:hover:not(:disabled) {
  background: var(--tsukuyomi-opacity-85);
}

.cp-send:disabled {
  opacity: 0.45;
  cursor: default;
}

.cp-send--idle {
  background: var(--tsukuyomi-opacity-35);
}

.cp-send--stop {
  background: var(--color-danger);
}
</style>
