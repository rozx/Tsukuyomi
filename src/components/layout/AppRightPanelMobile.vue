<script setup lang="ts">
import ChatActionDetailsPopover from 'src/components/layout/ChatActionDetailsPopover.vue';
import ChatGroupedActionPopover from 'src/components/layout/ChatGroupedActionPopover.vue';
import ChatSessionListPopover from 'src/components/layout/ChatSessionListPopover.vue';
import ChatMessageList from 'src/components/layout/ChatMessageList.vue';
import TranslationProgress from 'src/components/novel/TranslationProgress.vue';
import { useRightPanel } from 'src/composables/right-panel/useRightPanel';

const {
  chatSessionsStore,
  panelContainerRef,
  messagesContainerRef,
  sessionListPopoverRef,
  actionPopoverRef,
  groupedActionPopoverRef,
  logoPath,
  activeRightTab,
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
} = useRightPanel();
</script>

<template>
  <aside
    ref="panelContainerRef"
    class="shrink-0 h-full border-l border-white/10 bg-night-950/95 backdrop-blur-sm flex flex-col relative overflow-hidden"
    :style="{ width: '100%' }"
  >
    <div
      class="absolute inset-0 bg-gradient-to-b from-tsukuyomi-500/5 via-transparent to-transparent pointer-events-none"
    />

    <!-- 手机端 · AI 助手 app bar（按设计稿） -->
    <header v-if="activeRightTab === 'chat'" class="mc-appbar">
      <div class="mc-appbar-logo">
        <img :src="logoPath" alt="" />
      </div>
      <div class="mc-appbar-text">
        <div class="mc-appbar-title">AI 助手</div>
        <div class="mc-appbar-sub">
          <span
            class="mc-status-dot"
            :class="{ 'mc-status-dot--off': !assistantModel }"
          />
          <template v-if="assistantModel">
            {{ assistantModel.name || assistantModel.id }} · 在线
          </template>
          <template v-else>未配置助手模型</template>
        </div>
      </div>
      <button
        v-if="chatSessionsStore.allSessions.length > 1"
        id="session-list-button"
        class="mc-icon-btn"
        aria-label="会话历史"
        @click="toggleSessionListPopover"
      >
        <i class="pi pi-history" aria-hidden="true" />
      </button>
      <button class="mc-icon-btn" aria-label="新聊天" @click="createNewSession">
        <i class="pi pi-plus" aria-hidden="true" />
      </button>
    </header>

    <ChatSessionListPopover
      v-model:popover-ref="sessionListPopoverRef"
      target="#session-list-button"
      :sessions="recentSessions"
      :current-session-id="chatSessionsStore.currentSessionId"
      @hide="hideSessionListPopover"
      @select="switchToSession"
    />

    <!-- 翻译进度 Tab -->
    <div v-if="activeRightTab === 'progress'" class="flex-1 min-h-0 overflow-hidden w-full">
      <TranslationProgress />
    </div>

    <!-- AI 助手 Tab -->
    <template v-if="activeRightTab === 'chat'">
      <div
        ref="messagesContainerRef"
        class="flex-1 overflow-y-auto overflow-x-hidden px-4 pt-4 pb-2 min-h-0 min-w-0 relative z-10 messages-container"
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

      <!-- 胶囊状输入栏（按设计稿：plus + input + send） -->
      <div class="mc-composer-wrap">
        <div class="mc-composer">
          <button class="mc-plus" aria-label="更多操作">
            <i class="pi pi-plus" aria-hidden="true" />
          </button>
          <input
            v-model="inputMessage"
            :disabled="isSending || !assistantModel"
            :placeholder="assistantModel ? '向 AI 助手提问…' : '未配置助手模型'"
            class="mc-input"
            @keydown.enter.exact.prevent="sendMessage"
          />
          <button
            class="mc-send"
            :class="{
              'mc-send--stop': isSending,
              'mc-send--idle': !isSending && !inputMessage.trim(),
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
      v-model:popover-ref="groupedActionPopoverRef"
      :actions="hoveredGroupedAction?.actions || null"
      @hide="handleGroupedActionPopoverHide"
    />

    <ChatActionDetailsPopover
      v-model:popover-ref="actionPopoverRef"
      :action="hoveredAction?.action || null"
      :context="actionDetailsContext"
      @hide="handleActionPopoverHide"
    />
  </aside>
</template>

<style scoped>
.messages-container {
  overflow-y: auto !important;
  overflow-x: hidden !important;
  word-wrap: break-word;
  overflow-wrap: break-word;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
}

.messages-container p {
  word-wrap: break-word;
  overflow-wrap: break-word;
  word-break: break-word;
  max-width: 100%;
}

.messages-container > div {
  width: 100%;
  min-width: 0;
}

.messages-container::-webkit-scrollbar {
  width: 6px;
}

.messages-container::-webkit-scrollbar-track {
  background: transparent;
}

.messages-container::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 3px;
}

.messages-container::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
}

/* ───────────────── Mobile AI 助手 ───────────────── */
.mc-appbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px 12px;
  background: rgba(10, 12, 15, 0.72);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
  position: relative;
  z-index: 5;
}

.mc-appbar-logo {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  overflow: hidden;
  flex-shrink: 0;
  background: #1c1f26;
}

.mc-appbar-logo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.mc-appbar-text {
  flex: 1;
  min-width: 0;
}

.mc-appbar-title {
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-weight: 600;
  font-size: 15px;
  color: rgba(247, 244, 236, 1);
  letter-spacing: -0.01em;
}

.mc-appbar-sub {
  font-size: 11px;
  color: rgba(247, 244, 236, 0.6);
  margin-top: 1px;
  display: flex;
  align-items: center;
}

.mc-status-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #a7d1b0;
  margin-right: 5px;
  flex-shrink: 0;
}

.mc-status-dot--off {
  background: rgba(247, 244, 236, 0.3);
}

.mc-icon-btn {
  width: 36px;
  height: 36px;
  border-radius: 10px;
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

.mc-icon-btn:hover {
  background: rgba(255, 255, 255, 0.05);
  color: rgba(247, 244, 236, 1);
}

.mc-icon-btn i {
  font-size: 16px;
}

/* 胶囊输入栏 */
.mc-composer-wrap {
  padding: 10px 12px 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(10, 12, 15, 0.72);
  flex-shrink: 0;
}

.mc-composer {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 20px;
  transition: border-color 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.mc-composer:focus-within {
  border-color: rgba(233, 237, 245, 0.35);
}

.mc-plus {
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

.mc-plus:hover {
  background: rgba(255, 255, 255, 0.05);
  color: rgba(247, 244, 236, 1);
}

.mc-plus i {
  font-size: 14px;
}

.mc-input {
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

.mc-input::placeholder {
  color: rgba(247, 244, 236, 0.45);
}

.mc-send {
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

.mc-send:hover:not(:disabled) {
  background: #7f97b4;
}

.mc-send:disabled {
  opacity: 0.45;
  cursor: default;
}

.mc-send--idle {
  background: rgba(109, 136, 168, 0.35);
}

.mc-send--stop {
  background: #ef5f5f;
}

.mc-send i {
  font-size: 13px;
}
</style>
