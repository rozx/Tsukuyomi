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

// Action popover refs 绑定：桌面 Popover / 手机 MobileBottomSheet 都暴露
// 相同的 { toggle, hide } 接口；用 function ref 手动写入 Ref.value
const bindSessionListRef = (el: unknown) => {
  sessionListPopoverRef.value = el as typeof sessionListPopoverRef.value;
};
const bindActionPopoverRef = (el: unknown) => {
  actionPopoverRef.value = el as typeof actionPopoverRef.value;
};
const bindGroupedActionPopoverRef = (el: unknown) => {
  groupedActionPopoverRef.value = el as typeof groupedActionPopoverRef.value;
};

// Desktop variant 使用 ui 的面板宽度；tablet 变体传入 showResizeHandle=false 即可复用模板
defineExpose({ props });
</script>

<template>
  <aside
    ref="panelContainerRef"
    class="shrink-0 h-full border-l border-white/10 bg-night-950/95 backdrop-blur-sm flex flex-col relative overflow-hidden"
    :style="{ width: `${ui.rightPanelWidth}px` }"
  >
    <!-- Resize handle — 仅桌面端；平板变体通过 showResizeHandle=false 隐藏 -->
    <div
      v-if="showResizeHandle"
      ref="resizeHandleRef"
      class="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize transition-colors z-30"
      :class="{
        'bg-primary-500/50': isResizing,
        'bg-primary-500/20 hover:bg-primary-500/40': !isResizing,
      }"
      @mousedown="handleResizeStart"
    />

    <!-- Subtle gradient overlay -->
    <div
      class="absolute inset-0 bg-gradient-to-b from-tsukuyomi-500/5 via-transparent to-transparent pointer-events-none"
    />

    <!-- Header with Tab switcher -->
    <div class="shrink-0 px-4 pt-4 pb-0 relative z-10 border-b border-white/10">
      <div class="flex items-center justify-between flex-wrap gap-y-1 mb-1">
        <div class="flex gap-0.5 min-w-0">
          <button
            class="px-3 py-1.5 text-xs font-medium rounded-t transition-colors"
            :class="
              activeRightTab === 'chat'
                ? 'text-moon-100 border-b-2 border-primary-400 bg-white/5'
                : 'text-moon-50 hover:text-moon-80 hover:bg-white/5'
            "
            @click="ui.setActiveRightTab('chat')"
          >
            AI 助手
          </button>
          <button
            class="px-3 py-1.5 text-xs font-medium rounded-t transition-colors flex items-center gap-1.5"
            :class="
              activeRightTab === 'progress'
                ? 'text-moon-100 border-b-2 border-primary-400 bg-white/5'
                : 'text-moon-50 hover:text-moon-80 hover:bg-white/5'
            "
            @click="ui.setActiveRightTab('progress')"
          >
            翻译进度
            <span
              v-if="activeTranslationTaskCount > 0"
              class="inline-flex items-center justify-center min-w-4 h-4 px-1 text-xs font-bold rounded-full bg-primary-500/80 text-white"
            >
              {{ activeTranslationTaskCount }}
            </span>
          </button>
        </div>

        <div
          v-if="activeRightTab === 'chat'"
          class="flex items-center gap-1 pb-1 shrink-0 ml-auto"
        >
          <Button
            v-if="messages.length > 0"
            aria-label="清空聊天"
            class="p-button-text p-button-rounded text-moon-70 hover:text-moon-100 transition-colors"
            icon="pi pi-trash"
            size="small"
            @click="clearChat"
          />
          <Button
            v-if="chatSessionsStore.allSessions.length > 1"
            id="session-list-button"
            aria-label="会话列表"
            class="p-button-text p-button-rounded text-moon-70 hover:text-moon-100 transition-colors"
            icon="pi pi-history"
            size="small"
            @click="toggleSessionListPopover"
          />
          <Button
            aria-label="新聊天"
            class="p-button-text p-button-rounded text-moon-70 hover:text-moon-100 transition-colors"
            icon="pi pi-comments"
            size="small"
            @click="createNewSession"
          />
        </div>
      </div>
    </div>

    <ChatSessionListPopover
      :ref="bindSessionListRef"
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
        v-if="contextInfo !== '无上下文'"
        class="shrink-0 px-4 py-2 relative z-10 border-b border-white/10"
      >
        <p class="text-xs text-moon-50">{{ contextInfo }}</p>
      </div>

      <div class="shrink-0 relative z-10 border-b border-white/10">
        <button
          class="w-full px-4 py-2 flex items-center justify-between text-left hover:bg-white/5 transition-colors"
          @click="showTodoList = !showTodoList"
        >
          <div class="flex items-center gap-2">
            <i class="pi pi-list text-sm text-moon-70"></i>
            <span class="text-xs font-medium text-moon-100">待办事项</span>
            <span
              v-if="incompleteTodoCount > 0"
              class="px-1.5 py-0.5 text-xs font-medium rounded bg-primary-500/30 text-primary-200"
            >
              {{ incompleteTodoCount }}
            </span>
          </div>
          <i
            class="pi text-xs text-moon-70 transition-transform"
            :class="showTodoList ? 'pi-chevron-down' : 'pi-chevron-right'"
          ></i>
        </button>
        <div
          v-if="showTodoList"
          class="max-h-64 overflow-y-auto border-t border-white/10 bg-white/3"
        >
          <div v-if="todos.length === 0" class="px-4 py-3 text-xs text-moon-60 text-center">
            暂无待办事项
          </div>
          <div v-else class="px-4 py-2 space-y-1">
            <div
              v-for="todo in todos"
              :key="todo.id"
              class="flex items-start gap-2 px-2 py-1.5 rounded hover:bg-white/5 transition-colors"
              :class="{
                'opacity-60': todo.status === 'done',
                'border-l-2 border-primary pl-1': todo.status === 'working',
              }"
            >
              <i
                class="pi mt-0.5 text-xs flex-shrink-0"
                :class="{
                  'pi-check-circle text-green-400': todo.status === 'done',
                  'pi-arrow-right text-primary': todo.status === 'working',
                  'pi-circle text-moon-50': todo.status === 'pending',
                }"
              ></i>
              <span
                class="text-xs flex-1 break-words"
                :class="{
                  'line-through text-moon-60': todo.status === 'done',
                  'text-primary font-medium': todo.status === 'working',
                  'text-moon-80': todo.status === 'pending',
                }"
              >
                {{ todo.text }}
              </span>
            </div>
          </div>
        </div>
      </div>

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

      <div
        class="shrink-0 px-4 py-3 border-t border-white/10 relative z-10 bg-night-950/50 min-w-0"
      >
        <div class="flex flex-col gap-2 w-full min-w-0">
          <div v-if="sessionStats" v-tooltip.top="sessionStats.summary" class="context-usage-bar">
            <ProgressBar :value="sessionStats.maxPercentage" :show-value="false" />
            <div class="context-usage-text">
              {{ sessionStats.maxPercentage }}% · {{ sessionStats.tokens }}/{{
                sessionStats.maxInputTokens || '∞'
              }}
            </div>
          </div>
          <Textarea
            ref="inputRef"
            v-model="inputMessage"
            :disabled="isSending || !assistantModel"
            placeholder="输入消息... (Enter 发送, Shift+Enter 换行)"
            class="w-full resize-none min-w-0"
            :auto-resize="true"
            rows="3"
            @keydown="handleKeydown"
          />
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2 text-xs text-moon-50">
              <span v-if="!assistantModel">未配置助手模型</span>
              <span v-else>{{ assistantModel.name || assistantModel.id }}</span>
            </div>
            <div class="flex items-center gap-2">
              <Button
                :disabled="!isSending && (!inputMessage.trim() || !assistantModel)"
                :label="isSending ? '停止' : '发送'"
                :icon="isSending ? 'pi pi-stop-circle' : 'pi pi-send'"
                :severity="isSending ? 'danger' : 'primary'"
                size="small"
                @click="isSending ? stopGeneration() : sendMessage()"
              />
            </div>
          </div>
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
.resize-handle {
  user-select: none;
  -webkit-user-select: none;
}

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

/* 聊天 composer：设计系统 textarea 规范——
   空闲态 white/4 + white/10 边框，
   聚焦态月白 (E9EDF5) 边框 + 2px 月白 alpha 柔光 */
:deep(.p-textarea) {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: var(--fg-1, rgba(247, 244, 236, 1));
  font-family:
    'Noto Sans SC', 'PingFang SC', 'Hiragino Sans GB', -apple-system, sans-serif;
  font-size: 0.8125rem;
  line-height: 1.55;
  max-height: 200px !important;
  overflow-y: auto !important;
  transition:
    border-color 0.2s cubic-bezier(0.4, 0, 0.2, 1),
    box-shadow 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

:deep(.p-textarea:focus) {
  border-color: #e9edf5;
  box-shadow: 0 0 0 2px rgba(233, 237, 245, 0.2);
}

:deep(.p-textarea::placeholder) {
  color: rgba(247, 244, 236, 0.45);
}

:deep(.p-textarea textarea) {
  max-height: 200px !important;
  overflow-y: auto !important;
}

.context-usage-bar {
  margin-top: 10px;
}

.context-usage-bar :deep(.p-progressbar) {
  height: 6px;
  background: rgba(255, 255, 255, 0.08);
}

.context-usage-bar :deep(.p-progressbar-value) {
  transition: width 0.2s ease;
}

.context-usage-text {
  margin-top: 6px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.6);
}
</style>
