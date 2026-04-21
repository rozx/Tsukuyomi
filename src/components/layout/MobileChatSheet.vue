<script setup lang="ts">
/**
 * 手机端 AI 助手底部抽屉（按月詠 Mobile 设计稿 ChatSheetVariant）。
 *
 * Header 走 MobileBottomSheet 的 #header slot：单行紧凑布局——
 * logo + 标题 "AI 助手" + 副标题 "GPT-5.4 · 在线" + 会话历史 + 新聊天 + 关闭X。
 * Body 用 fullBleed 让消息列表 + composer 占满整个 sheet 内容区。
 *
 * 状态来自 useRightPanel（chat 专属），与 MobileProgressSheet 完全独立。
 */
import { computed } from 'vue';
import ChatActionDetailsPopover from 'src/components/layout/ChatActionDetailsPopover.vue';
import ChatGroupedActionPopover from 'src/components/layout/ChatGroupedActionPopover.vue';
import ChatSessionListPopover from 'src/components/layout/ChatSessionListPopover.vue';
import ChatMessageList from 'src/components/layout/ChatMessageList.vue';
import MobileBottomSheet from 'src/components/layout/MobileBottomSheet.vue';
import { useChatPanelSetup } from 'src/composables/right-panel/useChatPanelSetup';

const props = defineProps<{
  visible: boolean;
}>();

const emit = defineEmits<{
  'update:visible': [value: boolean];
}>();

const localVisible = computed({
  get: () => props.visible,
  set: (v) => emit('update:visible', v),
});

// useRightPanel 解构 + bindXxxRef 样板已抽到 useChatPanelSetup，
// Tablet 变体也走同一份 helper，保持两边行为一致。
// fallow-ignore-next-line code-duplication
const {
  chatSessionsStore,
  panelContainerRef,
  messagesContainerRef,
  logoPath,
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
</script>

<template>
  <MobileBottomSheet v-model:visible="localVisible" title="AI 助手" full-bleed>
    <!-- 按设计稿：logo + 标题 + 副标题 + 动作按钮 + 关闭X 单行紧凑布局 -->
    <template #header="{ close }">
      <header class="mc-appbar">
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
        <button
          type="button"
          class="mc-icon-btn mc-icon-btn--close"
          aria-label="关闭"
          @click="close"
        >
          <i class="pi pi-times" aria-hidden="true" />
        </button>
      </header>
    </template>

    <aside ref="panelContainerRef" class="mc-shell">
      <ChatSessionListPopover
        :ref="bindSessionListRef"
        target="#session-list-button"
        :sessions="recentSessions"
        :current-session-id="chatSessionsStore.currentSessionId"
        @hide="hideSessionListPopover"
        @select="switchToSession"
      />

      <!-- 消息列表（占满剩余高度） -->
      <div
        ref="messagesContainerRef"
        class="flex-1 overflow-y-auto overflow-x-hidden px-4 pt-3 pb-2 min-h-0 min-w-0 relative z-10 mc-messages"
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

      <!-- 胶囊状输入栏 -->
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
  </MobileBottomSheet>
</template>

<style scoped>
.mc-shell {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  width: 100%;
  background: transparent;
}

.mc-messages {
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
  word-wrap: break-word;
  overflow-wrap: break-word;
  display: flex;
  flex-direction: column;
}

/* ChatMessageList 的空状态用 h-full 想撑满消息区并居中文本；在
   手机 sheet 里父容器是 flex item，height:100% 可能解析不到父高度 ——
   用 min-height:100% + flex:1 确保它始终占满消息区并竖直居中 */
.mc-messages :deep(.h-full) {
  flex: 1;
  min-height: 100%;
}

.mc-messages::-webkit-scrollbar {
  width: 6px;
}

.mc-messages::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 3px;
}

/* 月詠 Mobile chat sheet app bar —— 单行紧凑：logo + 标题/副标题 + 动作按钮 + X */
.mc-appbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 14px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
  width: 100%;
}

.mc-appbar-logo {
  width: 28px;
  height: 28px;
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
  font-size: 13px;
  font-weight: 600;
  color: rgba(247, 244, 236, 1);
  line-height: 1.2;
}

.mc-appbar-sub {
  font-size: 10px;
  color: rgba(247, 244, 236, 0.55);
  margin-top: 2px;
  display: flex;
  align-items: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mc-status-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #a7d1b0;
  margin-right: 6px;
  flex-shrink: 0;
}

.mc-status-dot--off {
  background: rgba(247, 244, 236, 0.3);
}

.mc-icon-btn {
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

.mc-icon-btn:hover,
.mc-icon-btn:active {
  background: rgba(255, 255, 255, 0.06);
  color: rgba(247, 244, 236, 1);
}

.mc-icon-btn i {
  font-size: 13px;
}

.mc-icon-btn--close {
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.04);
  color: rgba(192, 198, 209, 0.85);
}

.mc-icon-btn--close i {
  font-size: 11px;
}

.mc-icon-btn--close:active {
  background: rgba(255, 255, 255, 0.08);
  color: #e9edf5;
}

/* 胶囊输入栏 */
.mc-composer-wrap {
  padding: 10px 12px calc(env(safe-area-inset-bottom, 0px) + 12px);
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
