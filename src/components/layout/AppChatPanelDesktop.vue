<script setup lang="ts">
/**
 * 桌面 AI 助手面板 —— 与 TabletChatPanel 同构，但保留桌面专属的 context /
 * todo / session stats 等细节。由 AppRightPanelDesktop 在右栏展开时挂载，
 * 关闭按钮直接调用 `ui.closeRightPanel()` 折叠成图标栏。
 */
import Textarea from 'primevue/textarea';
import ProgressBar from 'primevue/progressbar';
import ChatActionDetailsPopover from 'src/components/layout/ChatActionDetailsPopover.vue';
import ChatGroupedActionPopover from 'src/components/layout/ChatGroupedActionPopover.vue';
import ChatSessionListPopover from 'src/components/layout/ChatSessionListPopover.vue';
import ChatMessageList from 'src/components/layout/ChatMessageList.vue';
import AssistantAvatar from 'src/components/layout/AssistantAvatar.vue';
import { useRightPanel } from 'src/composables/right-panel/useRightPanel';

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
  messageDisplayItemsById,
  isSending,
  sendMessage,
  stopGeneration,
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
  thinkingExpanded,
  displayedThinkingProcess,
  displayedThinkingPreview,
  thinkingActive,
  setThinkingContentRef,
  toggleThinking,
  assistantModel,
  contextInfo,
  sessionStats,
  getChapterTitleForAction,
  renderMarkdown,
  formatMessageTime,
  hoveredAction,
  hoveredGroupedAction,
  actionDetailsContext,
  toggleActionPopover,
  handleActionMouseLeave,
  handleActionPopoverHide,
  toggleGroupedActionPopover,
  handleGroupedActionMouseLeave,
  handleGroupedActionPopoverHide,
} = useRightPanel();

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
</script>

<template>
  <section class="cp-shell" aria-label="月詠 AI 助手">
    <header class="cp-appbar">
      <AssistantAvatar :size="28" class="cp-appbar-avatar" />
      <div class="cp-appbar-text">
        <div class="cp-appbar-title">月詠</div>
        <div class="cp-appbar-sub">
          <span class="cp-status-dot" :class="{ 'cp-status-dot--off': !assistantModel }" />
          <template v-if="assistantModel">
            {{ assistantModel.name || assistantModel.id }} · 在线
          </template>
          <template v-else>未配置助手模型</template>
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

    <div class="cp-todo-section">
      <button class="cp-todo-toggle" @click="showTodoList = !showTodoList">
        <div class="cp-todo-toggle-copy">
          <i class="pi pi-list"></i>
          <span>待办事项</span>
          <span v-if="incompleteTodoCount > 0" class="cp-todo-badge">
            {{ incompleteTodoCount }}
          </span>
        </div>
        <i
          class="pi cp-todo-chevron"
          :class="showTodoList ? 'pi-chevron-down' : 'pi-chevron-right'"
        ></i>
      </button>
      <div v-if="showTodoList" class="cp-todo-list">
        <div v-if="todos.length === 0" class="cp-todo-empty">暂无待办事项</div>
        <div v-else class="cp-todo-items">
          <div
            v-for="todo in todos"
            :key="todo.id"
            class="cp-todo-item"
            :class="{
              'cp-todo-item--done': todo.status === 'done',
              'cp-todo-item--working': todo.status === 'working',
            }"
          >
            <i
              class="pi cp-todo-icon"
              :class="{
                'pi-check-circle': todo.status === 'done',
                'pi-arrow-right': todo.status === 'working',
                'pi-circle': todo.status === 'pending',
              }"
            ></i>
            <span
              class="cp-todo-text"
              :class="{
                'cp-todo-text--done': todo.status === 'done',
                'cp-todo-text--working': todo.status === 'working',
              }"
            >
              {{ todo.text }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <div ref="messagesContainerRef" class="cp-messages">
      <ChatMessageList
        :messages="messages"
        :message-display-items-by-id="messageDisplayItemsById"
        :displayed-thinking-process="displayedThinkingProcess"
        :displayed-thinking-preview="displayedThinkingPreview"
        :thinking-expanded="thinkingExpanded"
        :thinking-active="thinkingActive"
        :set-thinking-content-ref="setThinkingContentRef"
        :toggle-thinking="toggleThinking"
        :render-markdown="renderMarkdown"
        :format-message-time="formatMessageTime"
        :get-chapter-title-for-action="getChapterTitleForAction"
        :on-action-hover="toggleActionPopover"
        :on-action-leave="handleActionMouseLeave"
        :on-grouped-action-hover="toggleGroupedActionPopover"
        :on-grouped-action-leave="handleGroupedActionMouseLeave"
      />
    </div>

    <div class="cp-composer-wrap">
      <div v-if="sessionStats" v-tooltip.top="sessionStats.summary" class="cp-usage-bar">
        <ProgressBar :value="sessionStats.maxPercentage" :show-value="false" />
        <div class="cp-usage-text">
          {{ sessionStats.maxPercentage }}% · {{ sessionStats.tokens }}/{{
            sessionStats.maxInputTokens || '∞'
          }}
        </div>
      </div>
      <div class="cp-composer">
        <Textarea
          ref="inputRef"
          v-model="inputMessage"
          :disabled="isSending || !assistantModel"
          :placeholder="
            assistantModel ? '请月詠相助… (Shift+Enter 换行)' : '未配置助手模型'
          "
          class="cp-input"
          :auto-resize="true"
          rows="1"
          :unstyled="true"
          @keydown="handleKeydown"
        />
        <button
          class="cp-send"
          :class="{
            'cp-send--stop': isSending,
            'cp-send--idle': !isSending && !inputMessage.trim(),
          }"
          :disabled="!isSending && (!inputMessage.trim() || !assistantModel)"
          :aria-label="isSending ? '停止' : '发送'"
          @click="isSending ? stopGeneration() : sendMessage()"
        >
          <i class="pi" :class="isSending ? 'pi-stop-circle' : 'pi-send'" aria-hidden="true" />
        </button>
      </div>
    </div>

    <ChatGroupedActionPopover
      :ref="bindGroupedActionPopoverRef"
      :actions="hoveredGroupedAction?.actions || null"
      @hide="handleGroupedActionPopoverHide"
    />

    <ChatActionDetailsPopover
      :ref="bindActionPopoverRef"
      :action="hoveredAction?.action || null"
      :context="actionDetailsContext"
      @hide="handleActionPopoverHide"
    />
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

.cp-todo-section {
  flex-shrink: 0;
  border-bottom: 1px solid var(--white-opacity-6);
}

.cp-todo-toggle {
  width: 100%;
  padding: 6px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  text-align: left;
  background: transparent;
  border: none;
  color: var(--moon-opacity-70);
  cursor: pointer;
  transition: background 160ms cubic-bezier(0.4, 0, 0.2, 1);
}

.cp-todo-toggle:hover {
  background: var(--white-opacity-4);
}

.cp-todo-toggle-copy {
  display: flex;
  align-items: center;
  gap: 6px;
}

.cp-todo-toggle-copy i {
  font-size: 12px;
  color: var(--moon-opacity-50);
}

.cp-todo-toggle-copy span:nth-child(2) {
  font-size: 11px;
  font-weight: 500;
  color: var(--moon-opacity-85);
}

.cp-todo-badge {
  padding: 1px 6px;
  font-size: 9px;
  font-weight: 600;
  border-radius: 6px;
  background: var(--tsukuyomi-opacity-15);
  color: var(--tsukuyomi-opacity-90);
}

.cp-todo-chevron {
  font-size: 11px;
  color: var(--moon-opacity-50);
  transition: transform 160ms cubic-bezier(0.4, 0, 0.2, 1);
}

.cp-todo-list {
  max-height: 16rem;
  overflow-y: auto;
  border-top: 1px solid var(--white-opacity-6);
  background: var(--white-opacity-3);
}

.cp-todo-empty {
  padding: 10px 16px;
  font-size: 11px;
  color: var(--moon-opacity-40);
  text-align: center;
}

.cp-todo-items {
  padding: 6px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.cp-todo-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 4px 6px;
  border-radius: 8px;
  transition: background 160ms cubic-bezier(0.4, 0, 0.2, 1);
}

.cp-todo-item:hover {
  background: var(--white-opacity-4);
}

.cp-todo-item--done {
  opacity: 0.55;
}

.cp-todo-item--working {
  border-left: 2px solid var(--tsukuyomi-opacity-50);
  padding-left: 6px;
}

.cp-todo-icon {
  margin-top: 2px;
  font-size: 11px;
  flex-shrink: 0;
}

.cp-todo-item--done .cp-todo-icon {
  color: rgba(134, 239, 172, 0.8);
}

.cp-todo-item--working .cp-todo-icon {
  color: var(--tsukuyomi-opacity-90);
}

.cp-todo-item:not(.cp-todo-item--done):not(.cp-todo-item--working) .cp-todo-icon {
  color: var(--moon-opacity-40);
}

.cp-todo-text {
  font-size: 11px;
  flex: 1;
  word-break: break-word;
  color: var(--moon-opacity-70);
}

.cp-todo-text--done {
  text-decoration: line-through;
  color: var(--moon-opacity-40);
}

.cp-todo-text--working {
  color: var(--tsukuyomi-opacity-95);
  font-weight: 500;
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

.cp-send i {
  font-size: 13px;
}
</style>
