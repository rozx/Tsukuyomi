<script setup lang="ts">
import Button from 'primevue/button';
import Textarea from 'primevue/textarea';
import ChatActionDetailsPopover from 'src/components/layout/ChatActionDetailsPopover.vue';
import ChatGroupedActionPopover from 'src/components/layout/ChatGroupedActionPopover.vue';
import ChatSessionListPopover from 'src/components/layout/ChatSessionListPopover.vue';
import ChatMessageList from 'src/components/layout/ChatMessageList.vue';
import TranslationProgress from 'src/components/novel/TranslationProgress.vue';
import ProgressBar from 'primevue/progressbar';
import { useRightPanel } from 'src/composables/right-panel/useRightPanel';
import { getAssetUrl } from 'src/utils';

const props = withDefaults(defineProps<{ showResizeHandle?: boolean }>(), {
  showResizeHandle: true,
});

const {
  ui,
  aiModelsStore: _aiModelsStore,
  chatSessionsStore,
  panelContainerRef,
  resizeHandleRef,
  messagesContainerRef,
  inputRef,
  sessionListPopoverRef,
  actionPopoverRef,
  groupedActionPopoverRef,
  activeRightTab,
  activeTranslationTaskCount,
  isResizing,
  handleResizeStart,
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

const logoPath = getAssetUrl('icons/android-chrome-512x512.png');

defineExpose({ props });
</script>

<template>
  <aside ref="panelContainerRef" class="rp-shell" :style="{ width: `${ui.rightPanelWidth}px` }">
    <div
      v-if="showResizeHandle"
      ref="resizeHandleRef"
      class="rp-resize"
      :class="{ 'rp-resize--active': isResizing }"
      @mousedown="handleResizeStart"
    />

    <!-- Tab switcher — desktop keeps both chat + progress as in-page tabs -->
    <div class="rp-tabbar">
      <button
        class="rp-tabbar-btn"
        :class="{ active: activeRightTab === 'chat' }"
        @click="ui.setActiveRightTab('chat')"
      >
        AI 助手
      </button>
      <button
        class="rp-tabbar-btn"
        :class="{ active: activeRightTab === 'progress' }"
        @click="ui.setActiveRightTab('progress')"
      >
        翻译进度
        <span v-if="activeTranslationTaskCount > 0" class="rp-tabbar-badge">
          {{ activeTranslationTaskCount }}
        </span>
      </button>
    </div>

    <!-- Progress tab -->
    <div v-if="activeRightTab === 'progress'" class="rp-body rp-body--progress">
      <TranslationProgress />
    </div>

    <!-- Chat tab -->
    <template v-if="activeRightTab === 'chat'">
      <!-- Appbar — matches TabletChatPanel pattern -->
      <header class="rp-appbar">
        <div class="rp-appbar-logo">
          <img :src="logoPath" alt="" />
        </div>
        <div class="rp-appbar-text">
          <div class="rp-appbar-title">AI 助手</div>
          <div class="rp-appbar-sub">
            <span class="rp-status-dot" :class="{ 'rp-status-dot--off': !assistantModel }" />
            <template v-if="assistantModel">
              {{ assistantModel.name || assistantModel.id }} · 在线
            </template>
            <template v-else>未配置助手模型</template>
          </div>
        </div>
        <button
          v-if="chatSessionsStore.allSessions.length > 1"
          id="session-list-button"
          type="button"
          class="rp-icon-btn"
          aria-label="会话历史"
          @click="toggleSessionListPopover"
        >
          <i class="pi pi-history" aria-hidden="true" />
        </button>
        <button type="button" class="rp-icon-btn" aria-label="新聊天" @click="createNewSession">
          <i class="pi pi-plus" aria-hidden="true" />
        </button>
        <button
          v-if="messages.length > 0"
          type="button"
          class="rp-icon-btn"
          aria-label="清空聊天"
          @click="clearChat"
        >
          <i class="pi pi-trash" aria-hidden="true" />
        </button>
      </header>

      <ChatSessionListPopover
        :ref="bindSessionListRef"
        target="#session-list-button"
        :sessions="recentSessions"
        :current-session-id="chatSessionsStore.currentSessionId"
        @hide="hideSessionListPopover"
        @select="switchToSession"
      />

      <!-- Context info -->
      <div v-if="contextInfo !== '无上下文'" class="rp-context">
        <p>{{ contextInfo }}</p>
      </div>

      <!-- Todo section -->
      <div class="rp-todo-section">
        <button class="rp-todo-toggle" @click="showTodoList = !showTodoList">
          <div class="rp-todo-toggle-copy">
            <i class="pi pi-list"></i>
            <span>待办事项</span>
            <span v-if="incompleteTodoCount > 0" class="rp-todo-badge">
              {{ incompleteTodoCount }}
            </span>
          </div>
          <i
            class="pi rp-todo-chevron"
            :class="showTodoList ? 'pi-chevron-down' : 'pi-chevron-right'"
          ></i>
        </button>
        <div v-if="showTodoList" class="rp-todo-list">
          <div v-if="todos.length === 0" class="rp-todo-empty">暂无待办事项</div>
          <div v-else class="rp-todo-items">
            <div
              v-for="todo in todos"
              :key="todo.id"
              class="rp-todo-item"
              :class="{
                'rp-todo-item--done': todo.status === 'done',
                'rp-todo-item--working': todo.status === 'working',
              }"
            >
              <i
                class="pi rp-todo-icon"
                :class="{
                  'pi-check-circle': todo.status === 'done',
                  'pi-arrow-right': todo.status === 'working',
                  'pi-circle': todo.status === 'pending',
                }"
              ></i>
              <span
                class="rp-todo-text"
                :class="{
                  'rp-todo-text--done': todo.status === 'done',
                  'rp-todo-text--working': todo.status === 'working',
                }"
              >
                {{ todo.text }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Messages -->
      <div ref="messagesContainerRef" class="rp-messages">
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

      <!-- Capsule composer — matches TabletChatPanel pattern -->
      <div class="rp-composer-wrap">
        <div v-if="sessionStats" v-tooltip.top="sessionStats.summary" class="rp-usage-bar">
          <ProgressBar :value="sessionStats.maxPercentage" :show-value="false" />
          <div class="rp-usage-text">
            {{ sessionStats.maxPercentage }}% · {{ sessionStats.tokens }}/{{
              sessionStats.maxInputTokens || '∞'
            }}
          </div>
        </div>
        <div class="rp-composer">
          <Textarea
            ref="inputRef"
            v-model="inputMessage"
            :disabled="isSending || !assistantModel"
            :placeholder="
              assistantModel ? '向 AI 助手提问… (Shift+Enter 换行)' : '未配置助手模型'
            "
            class="rp-input"
            :auto-resize="true"
            rows="1"
            :unstyled="true"
            @keydown="handleKeydown"
          />
          <button
            class="rp-send"
            :class="{
              'rp-send--stop': isSending,
              'rp-send--idle': !isSending && !inputMessage.trim(),
            }"
            :disabled="!isSending && (!inputMessage.trim() || !assistantModel)"
            :aria-label="isSending ? '停止' : '发送'"
            @click="isSending ? stopGeneration() : sendMessage()"
          >
            <i class="pi" :class="isSending ? 'pi-stop-circle' : 'pi-send'" aria-hidden="true" />
          </button>
        </div>
      </div>
    </template>

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
  </aside>
</template>

<style scoped>
.rp-shell {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--shell-opacity-96); /* token: night-300 @ 96% */
  border-left: 1px solid var(--white-opacity-8);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  overflow: hidden;
  position: relative;
}

.rp-resize {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 6px;
  cursor: col-resize;
  z-index: 30;
  background: var(--tsukuyomi-opacity-10);
  transition: background 160ms cubic-bezier(0.4, 0, 0.2, 1);
}

.rp-resize:hover {
  background: var(--tsukuyomi-opacity-20);
}

.rp-resize--active {
  background: var(--tsukuyomi-opacity-35); /* token: tsukuyomi-500 @ 35% */
}

.rp-tabbar {
  display: flex;
  gap: 2px;
  padding: 8px 12px 0;
  border-bottom: 1px solid var(--white-opacity-6);
  flex-shrink: 0;
}

.rp-tabbar-btn {
  padding: 6px 12px;
  font-family:
    'Noto Sans SC',
    'PingFang SC',
    -apple-system,
    sans-serif;
  font-size: 11px;
  font-weight: 500;
  border-radius: 8px 8px 0 0;
  border: none;
  background: transparent;
  color: var(--moon-opacity-50);
  cursor: pointer;
  transition:
    color 160ms cubic-bezier(0.4, 0, 0.2, 1),
    background 160ms cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  align-items: center;
  gap: 6px;
}

.rp-tabbar-btn:hover {
  color: var(--moon-opacity-80);
  background: var(--white-opacity-4);
}

.rp-tabbar-btn.active {
  color: var(--moon-opacity-100);
  border-bottom: 2px solid var(--tsukuyomi-opacity-50); /* token: tsukuyomi-500 @ 50% */
  background: var(--white-opacity-4);
}

.rp-tabbar-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1rem;
  height: 1rem;
  padding: 0 0.2rem;
  border-radius: 999px;
  background: var(--tsukuyomi-opacity-20);
  color: var(--moon-opacity-95);
  font-size: 9px;
  font-weight: 700;
}

.rp-body--progress {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  width: 100%;
}

.rp-appbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--white-opacity-6);
  flex-shrink: 0;
}

.rp-appbar-logo {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  overflow: hidden;
  flex-shrink: 0;
  background: var(--night-200); /* token: night-200 */
}

.rp-appbar-logo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.rp-appbar-text {
  flex: 1;
  min-width: 0;
}

.rp-appbar-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--moon-opacity-100);
  line-height: 1.2;
}

.rp-appbar-sub {
  font-size: 10px;
  color: var(--moon-opacity-50);
  margin-top: 2px;
  display: flex;
  align-items: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rp-status-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-success-300); /* token: success-300 */
  margin-right: 6px;
  flex-shrink: 0;
}

.rp-status-dot--off {
  background: var(--moon-opacity-30);
}

.rp-icon-btn {
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

.rp-icon-btn:hover,
.rp-icon-btn:active {
  background: var(--white-opacity-6);
  color: var(--moon-opacity-100);
}

.rp-icon-btn i {
  font-size: 13px;
}

.rp-context {
  flex-shrink: 0;
  padding: 6px 16px;
  border-bottom: 1px solid var(--white-opacity-6);
}

.rp-context p {
  font-size: 10px;
  color: var(--moon-opacity-50);
  margin: 0;
}

.rp-todo-section {
  flex-shrink: 0;
  border-bottom: 1px solid var(--white-opacity-6);
}

.rp-todo-toggle {
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

.rp-todo-toggle:hover {
  background: var(--white-opacity-4);
}

.rp-todo-toggle-copy {
  display: flex;
  align-items: center;
  gap: 6px;
}

.rp-todo-toggle-copy i {
  font-size: 12px;
  color: var(--moon-opacity-50);
}

.rp-todo-toggle-copy span:nth-child(2) {
  font-size: 11px;
  font-weight: 500;
  color: var(--moon-opacity-85);
}

.rp-todo-badge {
  padding: 1px 6px;
  font-size: 9px;
  font-weight: 600;
  border-radius: 6px;
  background: var(--tsukuyomi-opacity-15);
  color: var(--tsukuyomi-opacity-90); /* token: tsukuyomi-500 @ 90% */
}

.rp-todo-chevron {
  font-size: 11px;
  color: var(--moon-opacity-50);
  transition: transform 160ms cubic-bezier(0.4, 0, 0.2, 1);
}

.rp-todo-list {
  max-height: 16rem;
  overflow-y: auto;
  border-top: 1px solid var(--white-opacity-6);
  background: var(--white-opacity-3);
}

.rp-todo-empty {
  padding: 10px 16px;
  font-size: 11px;
  color: var(--moon-opacity-40);
  text-align: center;
}

.rp-todo-items {
  padding: 6px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.rp-todo-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 4px 6px;
  border-radius: 8px;
  transition: background 160ms cubic-bezier(0.4, 0, 0.2, 1);
}

.rp-todo-item:hover {
  background: var(--white-opacity-4);
}

.rp-todo-item--done {
  opacity: 0.55;
}

.rp-todo-item--working {
  border-left: 2px solid var(--tsukuyomi-opacity-50); /* token: tsukuyomi-500 @ 50% */
  padding-left: 6px;
}

.rp-todo-icon {
  margin-top: 2px;
  font-size: 11px;
  flex-shrink: 0;
}

.rp-todo-item--done .rp-todo-icon {
  color: rgba(134, 239, 172, 0.8); /* not tokenized */
}

.rp-todo-item--working .rp-todo-icon {
  color: var(--tsukuyomi-opacity-90); /* token: tsukuyomi-500 @ 90% */
}

.rp-todo-item:not(.rp-todo-item--done):not(.rp-todo-item--working) .rp-todo-icon {
  color: var(--moon-opacity-40);
}

.rp-todo-text {
  font-size: 11px;
  flex: 1;
  word-break: break-word;
  color: var(--moon-opacity-70);
}

.rp-todo-text--done {
  text-decoration: line-through;
  color: var(--moon-opacity-40);
}

.rp-todo-text--working {
  color: var(--tsukuyomi-opacity-95); /* token: tsukuyomi-500 @ 95% */
  font-weight: 500;
}

.rp-messages {
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

.rp-messages :deep(.h-full) {
  flex: 1;
  min-height: 100%;
}

.rp-messages::-webkit-scrollbar {
  width: 6px;
}

.rp-messages::-webkit-scrollbar-thumb {
  background: var(--white-opacity-20);
  border-radius: 3px;
}

.rp-composer-wrap {
  padding: 10px 12px 14px;
  border-top: 1px solid var(--white-opacity-6);
  background: var(--night-500-opacity-72); /* token: night-500 @ 72% */
  flex-shrink: 0;
}

.rp-usage-bar {
  margin-bottom: 8px;
}

.rp-usage-bar :deep(.p-progressbar) {
  height: 5px;
  background: var(--white-opacity-6);
}

.rp-usage-bar :deep(.p-progressbar-value) {
  transition: width 0.2s ease;
}

.rp-usage-text {
  margin-top: 4px;
  font-size: 10px;
  color: var(--moon-opacity-50);
}

.rp-composer {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 8px 10px;
  background: var(--white-opacity-4);
  border: 1px solid var(--white-opacity-10);
  border-radius: 20px;
  transition: border-color 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.rp-composer:focus-within {
  border-color: var(--primary-opacity-35); /* token: primary-200 @ 35% */
}

.rp-input {
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

.rp-input::placeholder {
  color: var(--moon-opacity-40);
}

.rp-input:disabled {
  opacity: 0.5;
  cursor: default;
}

.rp-send {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--accent-blue-color);
  color: white; /* token: white */
  border: none;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.rp-send:hover:not(:disabled) {
  background: var(--tsukuyomi-opacity-85); /* token: tsukuyomi-500 @ 85% */
}

.rp-send:disabled {
  opacity: 0.45;
  cursor: default;
}

.rp-send--idle {
  background: var(--tsukuyomi-opacity-35); /* token: tsukuyomi-500 @ 35% */
}

.rp-send--stop {
  background: var(--color-danger); /* token: danger-500 */
}

.rp-send i {
  font-size: 13px;
}
</style>
