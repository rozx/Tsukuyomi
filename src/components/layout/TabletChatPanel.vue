<script setup lang="ts">
/**
 * 平板 AI 助手面板——参考 MobileChatSheet 的单行 appbar（logo + 标题 +
 * 在线状态副标题 + 动作按钮 + close）+ 胶囊输入栏。外壳从 MobileBottomSheet
 * 改成右侧侧滑面板，与 TabletProgressPanel 互斥挂载（由 MainLayoutTablet
 * 按 activeRightTab 驱动）。
 *
 * 内部状态完全来自 useRightPanel，与 AppRightPanelDesktop 共享 composable；
 * 这里只换一层 chrome、不 duplicate 任何消息/输入逻辑。
 */
import { computed } from 'vue';
import ChatActionDetailsPopover from 'src/components/layout/ChatActionDetailsPopover.vue';
import ChatGroupedActionPopover from 'src/components/layout/ChatGroupedActionPopover.vue';
import ChatSessionListPopover from 'src/components/layout/ChatSessionListPopover.vue';
import ChatMessageList from 'src/components/layout/ChatMessageList.vue';
import AssistantAvatar from 'src/components/layout/AssistantAvatar.vue';
import { useUiStore } from 'src/stores/ui';
import { useChatPanelSetup } from 'src/composables/right-panel/useChatPanelSetup';

const ui = useUiStore();

// useRightPanel 解构 + bindXxxRef 样板已抽到 useChatPanelSetup，
// Mobile 变体也走同一份 helper，保持两边行为一致。
const {
  chatSessionsStore,
  panelContainerRef,
  messagesContainerRef,
  messages,
  inputMessage,
  messageDisplayItemsById,
  isSending,
  sendMessage,
  stopGeneration,
  recentSessions,
  switchToSession,
  toggleSessionListPopover,
  hideSessionListPopover,
  createNewSession,
  thinkingExpanded,
  displayedThinkingProcess,
  displayedThinkingPreview,
  thinkingActive,
  setThinkingContentRef,
  toggleThinking,
  assistantModel,
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
  bindSessionListRef,
  bindActionPopoverRef,
  bindGroupedActionPopoverRef,
} = useChatPanelSetup();

const close = () => ui.closeRightPanel();

// 输入栏 / 发送按钮状态收敛进 computed，降低模板圈复杂度（与 MobileChatSheet 同构）。
const assistantStatusText = computed(() =>
  assistantModel.value
    ? `${assistantModel.value.name || assistantModel.value.id} · 在线`
    : '未配置助手模型',
);
const inputPlaceholder = computed(() =>
  assistantModel.value ? '请月詠相助…' : '未配置助手模型',
);
const inputDisabled = computed(() => isSending.value || !assistantModel.value);
const sendClass = computed(() => ({
  'tcp-send--stop': isSending.value,
  'tcp-send--idle': !isSending.value && !inputMessage.value.trim(),
}));
const sendDisabled = computed(
  () => !isSending.value && (!inputMessage.value.trim() || !assistantModel.value),
);
const sendAriaLabel = computed(() => (isSending.value ? '停止' : '发送'));
const sendIcon = computed(() => (isSending.value ? 'pi-stop-circle' : 'pi-send'));
const onSendClick = () => {
  if (isSending.value) stopGeneration();
  else sendMessage();
};
</script>

<template>
  <aside ref="panelContainerRef" class="tcp-shell" aria-label="月詠 AI 助手">
    <header class="tcp-appbar">
      <AssistantAvatar :size="28" class="tcp-appbar-avatar" />
      <div class="tcp-appbar-text">
        <div class="tcp-appbar-title">月詠</div>
        <div class="tcp-appbar-sub">
          <span
            class="tcp-status-dot"
            :class="{ 'tcp-status-dot--off': !assistantModel }"
          />
          {{ assistantStatusText }}
        </div>
      </div>
      <button
        v-if="chatSessionsStore.allSessions.length > 1"
        id="session-list-button-tablet"
        type="button"
        class="tcp-icon-btn"
        aria-label="会话历史"
        @click="toggleSessionListPopover"
      >
        <i class="pi pi-history" aria-hidden="true" />
      </button>
      <button type="button" class="tcp-icon-btn" aria-label="新聊天" @click="createNewSession">
        <i class="pi pi-plus" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="tcp-icon-btn tcp-icon-btn--close"
        aria-label="关闭"
        @click="close"
      >
        <i class="pi pi-times" aria-hidden="true" />
      </button>
    </header>

    <ChatSessionListPopover
      :ref="bindSessionListRef"
      target="#session-list-button-tablet"
      :sessions="recentSessions"
      :current-session-id="chatSessionsStore.currentSessionId"
      @hide="hideSessionListPopover"
      @select="switchToSession"
    />

    <div
      ref="messagesContainerRef"
      class="tcp-messages"
    >
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

    <div class="tcp-composer-wrap">
      <div class="tcp-composer">
        <button class="tcp-plus" aria-label="更多操作">
          <i class="pi pi-plus" aria-hidden="true" />
        </button>
        <input
          v-model="inputMessage"
          :disabled="inputDisabled"
          :placeholder="inputPlaceholder"
          class="tcp-input"
          @keydown.enter.exact.prevent="sendMessage"
        />
        <button
          class="tcp-send"
          :class="sendClass"
          :disabled="sendDisabled"
          :aria-label="sendAriaLabel"
          @click="onSendClick"
        >
          <i class="pi" :class="sendIcon" aria-hidden="true" />
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
  </aside>
</template>

<style scoped>
.tcp-shell {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: rgba(14, 16, 20, 0.96);
  border-left: 1px solid rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  overflow: hidden;
}

.tcp-appbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}

.tcp-appbar-avatar {
  flex-shrink: 0;
}

.tcp-appbar-text {
  flex: 1;
  min-width: 0;
}

.tcp-appbar-title {
  font-size: 13px;
  font-weight: 600;
  color: rgba(247, 244, 236, 1);
  line-height: 1.2;
}

.tcp-appbar-sub {
  font-size: 10px;
  color: rgba(247, 244, 236, 0.55);
  margin-top: 2px;
  display: flex;
  align-items: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tcp-status-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #a7d1b0;
  margin-right: 6px;
  flex-shrink: 0;
}

.tcp-status-dot--off {
  background: rgba(247, 244, 236, 0.3);
}

.tcp-icon-btn {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(247, 244, 236, 0.75);
  background: transparent;
  border: none;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.tcp-icon-btn:hover,
.tcp-icon-btn:active {
  background: rgba(255, 255, 255, 0.06);
  color: rgba(247, 244, 236, 1);
}

.tcp-icon-btn i {
  font-size: 13px;
}

.tcp-icon-btn--close {
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.04);
  color: rgba(192, 198, 209, 0.85);
}

.tcp-icon-btn--close i {
  font-size: 11px;
}

.tcp-icon-btn--close:active {
  background: rgba(255, 255, 255, 0.08);
  color: #e9edf5;
}

.tcp-messages {
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 14px 16px 8px;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
  display: flex;
  flex-direction: column;
}

.tcp-messages :deep(.h-full) {
  flex: 1;
  min-height: 100%;
}

.tcp-messages::-webkit-scrollbar {
  width: 6px;
}

.tcp-messages::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 3px;
}

.tcp-composer-wrap {
  padding: 10px 12px 14px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(10, 12, 15, 0.72);
  flex-shrink: 0;
}

.tcp-composer {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 20px;
  transition: border-color 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.tcp-composer:focus-within {
  border-color: rgba(233, 237, 245, 0.35);
}

.tcp-plus {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  color: rgba(247, 244, 236, 0.75);
  border: none;
  cursor: pointer;
  flex-shrink: 0;
}

.tcp-plus:hover {
  background: rgba(255, 255, 255, 0.05);
  color: rgba(247, 244, 236, 1);
}

.tcp-plus i {
  font-size: 14px;
}

.tcp-input {
  flex: 1;
  min-width: 0;
  background: transparent;
  border: none;
  outline: none;
  color: rgba(247, 244, 236, 1);
  font-family: 'Noto Sans SC', 'PingFang SC', -apple-system, sans-serif;
  font-size: 14px;
  padding: 6px 0;
}

.tcp-input::placeholder {
  color: rgba(247, 244, 236, 0.45);
}

.tcp-send {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #6d88a8;
  color: #fff;
  border: none;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.tcp-send:hover:not(:disabled) {
  background: #7f97b4;
}

.tcp-send:disabled {
  opacity: 0.45;
  cursor: default;
}

.tcp-send--idle {
  background: rgba(109, 136, 168, 0.35);
}

.tcp-send--stop {
  background: #ef5f5f;
}

.tcp-send i {
  font-size: 13px;
}
</style>
