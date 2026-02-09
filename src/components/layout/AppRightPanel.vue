<script setup lang="ts">
import { ref, computed, nextTick, watch, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import Button from 'primevue/button';
import Textarea from 'primevue/textarea';
import type Popover from 'primevue/popover';
import ChatActionDetailsPopover from 'src/components/layout/ChatActionDetailsPopover.vue';
import ChatGroupedActionPopover from 'src/components/layout/ChatGroupedActionPopover.vue';
import ChatSessionListPopover from 'src/components/layout/ChatSessionListPopover.vue';
import ChatMessageList from 'src/components/layout/ChatMessageList.vue';
import ProgressBar from 'primevue/progressbar';
import { useUiStore } from 'src/stores/ui';
import { useContextStore } from 'src/stores/context';
import { useAIModelsStore } from 'src/stores/ai-models';
import { useBooksStore } from 'src/stores/books';
import { useAIProcessingStore } from 'src/stores/ai-processing';
import {
  useChatSessionsStore,
  type ChatMessage,
  type MessageAction,
  MESSAGE_LIMIT_THRESHOLD,
} from 'src/stores/chat-sessions';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import { ChapterService } from 'src/services/chapter-service';
import { TodoListService, type TodoItem } from 'src/services/todo-list-service';
import { estimateAssistantContextTokens } from 'src/utils/ai-context-utils';
import { throttle } from 'src/utils/throttle';
import { usePanelResize } from 'src/composables/chat/usePanelResize';
import { useThinkingDisplay } from 'src/composables/chat/useThinkingDisplay';
import { useChatSession } from 'src/composables/chat/useChatSession';
import { useChatSummarizer } from 'src/composables/chat/useChatSummarizer';
import { useChatSending } from 'src/composables/chat/useChatSending';
import { useChatMessageDisplay } from 'src/composables/chat/useChatMessageDisplay';
import { useMarkdownRenderer } from 'src/composables/chat/useMarkdownRenderer';
import { getChapterDisplayTitle } from 'src/utils/novel-utils';
import type { Novel, Chapter } from 'src/models/novel';
import type { ActionDetailsContext } from 'src/utils/action-info-utils';

const ui = useUiStore();
const router = useRouter();
const contextStore = useContextStore();
const aiModelsStore = useAIModelsStore();
const booksStore = useBooksStore();
const aiProcessingStore = useAIProcessingStore();
const chatSessionsStore = useChatSessionsStore();
const toast = useToastWithHistory();
const isDesktop = computed(() => ui.deviceType === 'desktop');
const panelWidthStyle = computed(() => ({
  width: isDesktop.value ? `${ui.rightPanelWidth}px` : '100%',
}));

// 面板与布局
const { panelContainerRef, resizeHandleRef, isResizing, handleResizeStart } = usePanelResize();

// Markdown 渲染
const { renderMarkdown } = useMarkdownRenderer();

// 基础状态与引用
const messagesContainerRef = ref<HTMLElement | null>(null);
const inputRef = ref<InstanceType<typeof Textarea> | null>(null);

onMounted(() => {
  // 初始化时加载待办事项
  loadTodos();
  // 监听 localStorage 变化（跨标签页同步）
  window.addEventListener('storage', handleStorageChange);
});

onUnmounted(() => {
  // 清理 storage 事件监听
  window.removeEventListener('storage', handleStorageChange);
});

// 会话输入状态
const messages = ref<ChatMessage[]>([]);
const inputMessage = ref('');
// isSending removed here, will be returned by useChatSending
const currentTaskId = ref<string | null>(null);
const currentMessageActions = ref<MessageAction[]>([]); // 当前消息的操作列表

// 滚动控制
const scrollToBottom = () => {
  void nextTick(() => {
    if (messagesContainerRef.value) {
      requestAnimationFrame(() => {
        if (messagesContainerRef.value) {
          messagesContainerRef.value.scrollTop = messagesContainerRef.value.scrollHeight;
        }
      });
    }
  });
};

// 流式输出时，使用节流版本避免每个 token 都触发 nextTick + 滚动
const { fn: scrollToBottomThrottled } = throttle(() => {
  scrollToBottom();
}, 100);

// 思考过程展示
const thinkingDisplay = useThinkingDisplay(messages, () => scrollToBottom());
const {
  thinkingExpanded,
  displayedThinkingProcess,
  displayedThinkingPreview,
  thinkingActive,
  setThinkingContentRef,
  requestScrollThinkingToBottom,
  toggleThinking,
  updateDisplayedThinkingProcess,
  setDisplayedThinkingImmediatelyIfEmpty,
  clearThinkingState,
  clearThinkingStateForMessage,
  initializeThinkingState,
} = thinkingDisplay;

const onSessionSwitched = () => {
  clearThinkingState();
  initializeThinkingState();
};

// 模型与会话
const assistantModel = computed(() => {
  return aiModelsStore.getDefaultModelForTask('assistant');
});

const {
  reloadMessages,
  createNewSession,
  clearChat,
  // handleDeleteSession, // unused
} = useChatSession(messages, onSessionSwitched);

// 获取章节标题的辅助函数（用于 action 显示）
const getChapterTitleForAction = (chapterId: string | undefined): string | undefined => {
  if (!chapterId) return undefined;
  const currentBookId = contextStore.getContext.currentBookId;
  if (!currentBookId) return undefined;
  const book = booksStore.getBookById(currentBookId);
  if (!book) return undefined;
  const chapterResult = ChapterService.findChapterById(book, chapterId);
  if (chapterResult && chapterResult.chapter) {
    return getChapterDisplayTitle(chapterResult.chapter);
  }
  return undefined;
};

const chatSummarizer = useChatSummarizer(messages, assistantModel, reloadMessages, () =>
  scrollToBottom(),
);

// 待办事项与会话列表
const todos = ref<TodoItem[]>([]);
const showTodoList = ref(false);
const incompleteTodoCount = computed(() => todos.value.filter((todo) => !todo.completed).length);

// 会话列表 Popover
const sessionListPopoverRef = ref<InstanceType<typeof Popover> | null>(null);

// 切换会话列表 Popover
const toggleSessionListPopover = (event: Event) => {
  sessionListPopoverRef.value?.toggle(event);
};

// 关闭会话列表 Popover
const hideSessionListPopover = () => {
  sessionListPopoverRef.value?.hide();
};

// 获取最近的会话列表（最多5个，排除当前会话）
const recentSessions = computed(() => {
  const allSessions = chatSessionsStore.allSessions;
  const currentSessionId = chatSessionsStore.currentSessionId;
  const currentBookId = contextStore.getContext.currentBookId;

  return allSessions
    .filter((session) => {
      // 过滤掉当前会话
      if (session.id === currentSessionId) return false;
      // 仅保留与当前书籍 ID 匹配的会话（如果当前没有书籍 ID，则保留无书籍 ID 的会话）
      return session.context?.bookId === currentBookId;
    })
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, 5);
});

// 切换到指定会话
const switchToSession = (sessionId: string) => {
  chatSessionsStore.switchToSession(sessionId);
  // loadCurrentSession 会通过 watch 自动触发
  // 切换会话后关闭 popover
  hideSessionListPopover();
};

// 时间显示
const formatMessageTime = (timestamp: number): string => {
  return new Date(timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

// 待办事项加载
const loadTodos = () => {
  const allTodos = TodoListService.getAllTodos();
  const currentSession = chatSessionsStore.currentSession;
  const sessionId = currentSession?.id;

  // 对于助手聊天，优先使用 sessionId 过滤待办事项
  if (sessionId) {
    todos.value = allTodos.filter((todo) => todo.sessionId === sessionId);
  } else if (currentTaskId.value) {
    // 对于其他任务（翻译、润色等），使用 taskId 过滤
    todos.value = allTodos.filter((todo) => todo.taskId === currentTaskId.value);
  } else {
    todos.value = [];
  }
};

// 监听待办事项变化（通过 localStorage 事件）
const handleStorageChange = (e: StorageEvent) => {
  if (e.key === 'tsukuyomi-todo-list') {
    loadTodos();
  }
};

// 监听 currentTaskId 和当前会话变化，重新加载待办事项
watch(
  () => [currentTaskId.value, chatSessionsStore.currentSessionId],
  () => {
    loadTodos();
  },
);

// 发送逻辑
const { isSending, sendMessage } = useChatSending(
  messages,
  inputMessage,
  assistantModel,
  scrollToBottom,
  scrollToBottomThrottled,
  chatSummarizer,
  thinkingDisplay,
  router,
  toast,
  currentMessageActions,
  loadTodos,
  currentTaskId,
);

// Popover 状态
const actionPopoverRef = ref<InstanceType<typeof Popover> | null>(null);
const hoveredAction = ref<{ action: MessageAction; message: ChatMessage } | null>(null);

// Popover refs for grouped action details
const groupedActionPopoverRef = ref<InstanceType<typeof Popover> | null>(null);
const hoveredGroupedAction = ref<{
  actions: MessageAction[];
  message: ChatMessage;
  timestamp: number;
} | null>(null);

// 上下文信息
const contextInfo = computed(() => {
  const context = contextStore.getContext;
  const info: string[] = [];

  let currentChapter: Chapter | undefined;
  let currentBook: Novel | undefined;

  if (context.currentBookId) {
    const book = booksStore.getBookById(context.currentBookId);
    if (book) {
      currentBook = book;
      info.push(`书籍：${book.title}`);

      // 查找当前章节对象
      if (context.currentChapterId && book.volumes) {
        for (const volume of book.volumes) {
          if (volume.chapters) {
            const found = volume.chapters.find((c) => c.id === context.currentChapterId);
            if (found) {
              currentChapter = found;
              break;
            }
          }
        }
      }
    } else {
      info.push('当前书籍');
    }
  }

  if (context.currentChapterId) {
    if (currentChapter) {
      const title = getChapterDisplayTitle(currentChapter, currentBook);
      info.push(title ? `章节：${title}` : '当前章节');
    } else {
      info.push('当前章节');
    }
  }

  if (context.selectedParagraphId) {
    let paraIndex = -1;
    if (currentChapter && currentChapter.content) {
      paraIndex = currentChapter.content.findIndex((p) => p.id === context.selectedParagraphId);
    }

    if (paraIndex >= 0) {
      // 显示 1-based 索引
      info.push(`段落：#${paraIndex + 1}`);
    } else {
      info.push('当前段落');
    }
  }

  return info.length > 0 ? info.join(' | ') : '无上下文';
});

// 会话统计信息
const sessionStats = computed(() => {
  if (messages.value.length === 0) return null;

  // 计算距离上次总结的消息数量
  const currentSession = chatSessionsStore.currentSession;
  const cutoff = currentSession?.lastSummarizedMessageIndex ?? 0;

  // 过滤掉不计数的系统消息/辅助消息，以及工具调用消息
  // 只统计：用户消息 + 包含实际内容的助手消息（非纯工具调用）
  const messagesToCount = messages.value.slice(cutoff).filter((msg) => {
    // 1. 过滤总结相关和辅助消息
    if (msg.isSummarization || msg.isSummaryResponse || msg.isContextMessage) return false;

    // 2. 统计用户消息
    if (msg.role === 'user') return true;

    // 3. 统计助手消息，但排除纯工具调用
    if (msg.role === 'assistant') {
      // 检查是否包含 actions（即工具调用结果）
      if (msg.actions && msg.actions.length > 0) {
        // 如果同时有大量文本内容，可能需要统计，但根据 "tool call shouldn't take count"
        // 我们假设只要包含 actions 或者是为了由于 tools 产生的 tool-use 消息，就不计入 "对话轮数/消息限制"
        return false;
      }
      // 排除那些 content 为空或只包含 "（调用工具）" 等占位符的消息
      if (!msg.content || msg.content === '（调用工具）') return false;

      return true;
    }

    return false;
  });

  const currentCount = messagesToCount.length;

  // 估算 Token 数量
  const tokens = estimateAssistantContextTokens({
    context: contextStore.getContext,
    session: currentSession,
    currentMessages: messages.value,
    includeToolSchemas: true,
  });

  const maxTokens = assistantModel.value?.contextWindow || 0;
  let tokenPercentage = 0;

  if (maxTokens > 0) {
    tokenPercentage = Math.round((tokens / maxTokens) * 100);
  }

  // 计算消息数量进度百分比
  const msgPercentage = Math.min(Math.round((currentCount / MESSAGE_LIMIT_THRESHOLD) * 100), 100);

  // 取两者的最大值作为总体使用百分比
  const maxPercentage = Math.max(tokenPercentage, msgPercentage);

  return {
    currentCount,
    limit: MESSAGE_LIMIT_THRESHOLD,
    tokens,
    maxTokens,
    tokenPercentage,
    msgPercentage,
    maxPercentage,
    // 显示 "上下文使用: 45% (80/180 消息 | 4000 Tokens)"
    summary: `上下文使用: ${maxPercentage}% (${currentCount}/${MESSAGE_LIMIT_THRESHOLD} 消息 | ${tokens} Tokens)`,
  };
});

// 消息操作
const stopGeneration = async () => {
  if (currentTaskId.value) {
    try {
      await aiProcessingStore.stopTask(currentTaskId.value);
    } catch (e) {
      console.error('停止任务失败 (可能已完成)', e);
    }
    isSending.value = false;
    currentTaskId.value = null;
  }
};

// 处理键盘事件
const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    void sendMessage();
  }
};

// 监听与副作用
watch(
  () => messages.value.length,
  () => {
    scrollToBottom();
  },
);

// 清理已删除消息对应的缓存与 handler，避免长会话内存不断增长
watch(
  () => messages.value.map((m) => m.id),
  (newIds) => {
    const idSet = new Set(newIds);

    // 收集所有可能包含状态的 ID
    const idsToCheck = new Set([
      ...Object.keys(displayedThinkingProcess.value),
      ...thinkingExpanded.value.keys(),
      ...thinkingActive.value.keys(),
    ]);

    for (const id of idsToCheck) {
      if (!idSet.has(id)) {
        clearThinkingStateForMessage(id);
      }
    }
  },
  { flush: 'post' },
);

// 监听思考过程更新，如果已展开则滚动到底部
watch(
  () =>
    messages.value.map((m) => ({
      id: m.id,
      thinkingLen: m.thinkingProcess ? m.thinkingProcess.length : 0,
    })),
  (newValues, oldValues) => {
    if (!oldValues) return;

    const oldLenById = new Map(oldValues.map((v) => [v.id, v.thinkingLen]));
    const msgById = new Map(messages.value.map((m) => [m.id, m]));

    for (const newVal of newValues) {
      const oldLen = oldLenById.get(newVal.id);
      if (
        oldLen !== undefined &&
        newVal.thinkingLen > oldLen &&
        newVal.thinkingLen > 0 &&
        thinkingExpanded.value.get(newVal.id)
      ) {
        requestScrollThinkingToBottom(newVal.id);
      }

      if (oldLen !== undefined && newVal.thinkingLen > oldLen && newVal.thinkingLen > 0) {
        const msg = msgById.get(newVal.id);
        const thinking = msg?.thinkingProcess;
        if (thinking) {
          setDisplayedThinkingImmediatelyIfEmpty(newVal.id, thinking);
          updateDisplayedThinkingProcess(newVal.id, thinking);
        }
      }
    }
  },
  { flush: 'post' },
);

// 监听助手输入消息状态，自动填充输入框
watch(
  () => ui.assistantInputMessage,
  (message) => {
    if (message !== null) {
      // 设置输入框的值
      inputMessage.value = message;
      // 打开右侧面板（如果未打开）
      if (!ui.rightPanelOpen) {
        ui.openRightPanel();
      }
      // 聚焦到输入框
      void nextTick(() => {
        if (inputRef.value) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const component = inputRef.value as any;
          if (component.$el) {
            const textarea = component.$el.querySelector('textarea');
            if (textarea) {
              textarea.focus();
            }
          }
        }
      });
      // 清除状态
      ui.setAssistantInputMessage(null);
    }
  },
);

// 操作详情上下文
const actionDetailsContext: ActionDetailsContext = {
  getBookById: (bookId: string) => booksStore.getBookById(bookId),
  getCurrentBookId: () => contextStore.getContext.currentBookId,
};

// 切换操作详情 Popover
const toggleActionPopover = (
  event: Event,
  action: MessageAction,
  message: ChatMessage,
  _popoverKey: string,
) => {
  if (actionPopoverRef.value) {
    hoveredAction.value = { action, message };
    actionPopoverRef.value.toggle(event);
  }
};

// 处理鼠标离开事件，关闭 Popover
const handleActionMouseLeave = () => {
  if (actionPopoverRef.value) {
    actionPopoverRef.value.hide();
  }
};

// 处理 Popover 关闭
const handleActionPopoverHide = () => {
  hoveredAction.value = null;
};

// 切换分组操作详情 Popover
const toggleGroupedActionPopover = (
  event: Event,
  actions: MessageAction[],
  message: ChatMessage,
  timestamp: number,
) => {
  if (groupedActionPopoverRef.value) {
    hoveredGroupedAction.value = { actions, message, timestamp };
    groupedActionPopoverRef.value.toggle(event);
  }
};

// 处理鼠标离开事件，关闭分组操作 Popover
const handleGroupedActionMouseLeave = () => {
  if (groupedActionPopoverRef.value) {
    groupedActionPopoverRef.value.hide();
  }
};

// 处理分组操作 Popover 关闭
const handleGroupedActionPopoverHide = () => {
  hoveredGroupedAction.value = null;
};

const { messageDisplayItemsById } = useChatMessageDisplay(messages);
</script>

<template>
  <aside
    ref="panelContainerRef"
    class="shrink-0 h-full border-l border-white/10 bg-night-950/95 backdrop-blur-sm flex flex-col relative overflow-hidden"
    :style="panelWidthStyle"
  >
    <!-- Resize handle -->
    <div
      v-if="isDesktop"
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

    <!-- Header with new chat button -->
    <div
      class="shrink-0 px-4 pt-6 pb-4 relative z-10 flex items-center justify-between border-b border-white/10"
    >
      <h2 class="text-sm font-semibold text-moon-100 uppercase tracking-wide">AI 助手</h2>
      <div class="flex items-center gap-2">
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

    <!-- Session List Popover -->
    <ChatSessionListPopover
      v-model:popover-ref="sessionListPopoverRef"
      target="#session-list-button"
      :sessions="recentSessions"
      :current-session-id="chatSessionsStore.currentSessionId"
      @hide="hideSessionListPopover"
      @select="switchToSession"
    />

    <!-- Context info -->
    <div
      v-if="contextInfo !== '无上下文'"
      class="shrink-0 px-4 py-2 relative z-10 border-b border-white/10"
    >
      <p class="text-xs text-moon-50">{{ contextInfo }}</p>
    </div>

    <!-- Todo List Section -->
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
      <div v-if="showTodoList" class="max-h-64 overflow-y-auto border-t border-white/10 bg-white/3">
        <div v-if="todos.length === 0" class="px-4 py-3 text-xs text-moon-60 text-center">
          暂无待办事项
        </div>
        <div v-else class="px-4 py-2 space-y-1">
          <div
            v-for="todo in todos"
            :key="todo.id"
            class="flex items-start gap-2 px-2 py-1.5 rounded hover:bg-white/5 transition-colors"
            :class="{ 'opacity-60': todo.completed }"
          >
            <i
              class="pi mt-0.5 text-xs flex-shrink-0"
              :class="todo.completed ? 'pi-check-circle text-green-400' : 'pi-circle text-moon-50'"
            ></i>
            <span
              class="text-xs text-moon-80 flex-1 break-words"
              :class="{ 'line-through': todo.completed }"
            >
              {{ todo.text }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Messages area -->
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

    <!-- Input area -->
    <div class="shrink-0 px-4 py-3 border-t border-white/10 relative z-10 bg-night-950/50 min-w-0">
      <div class="flex flex-col gap-2 w-full min-w-0">
        <div v-if="sessionStats" class="context-usage-bar" v-tooltip.top="sessionStats.summary">
          <ProgressBar :value="sessionStats.maxPercentage" :show-value="false" />
          <div class="context-usage-text">
            {{ sessionStats.maxPercentage }}% · {{ sessionStats.tokens }}/{{
              sessionStats.maxTokens || '∞'
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
    <!-- Shared Grouped Action Popover -->
    <ChatGroupedActionPopover
      v-model:popover-ref="groupedActionPopoverRef"
      :actions="hoveredGroupedAction?.actions || null"
      @hide="handleGroupedActionPopoverHide"
    />

    <!-- Shared Action Details Popover -->
    <ChatActionDetailsPopover
      v-model:popover-ref="actionPopoverRef"
      :action="hoveredAction?.action || null"
      :context="actionDetailsContext"
      @hide="handleActionPopoverHide"
    />
  </aside>
</template>

<style scoped>
/* Resize handle styles */
.resize-handle {
  user-select: none;
  -webkit-user-select: none;
}

/* 消息容器样式 - 防止水平滚动 */
.messages-container {
  overflow-y: auto !important;
  overflow-x: hidden !important;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

/* 确保所有文本元素都能正确换行 */
.messages-container p {
  word-wrap: break-word;
  overflow-wrap: break-word;
  word-break: break-word;
  max-width: 100%;
}

/* 消息气泡容器 */
.messages-container > div {
  width: 100%;
  min-width: 0;
}

/* 自定义滚动条样式 */
:deep(.p-textarea) {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: var(--moon-opacity-90);
  font-size: 0.875rem;
  max-height: 200px !important;
  overflow-y: auto !important;
}

:deep(.p-textarea:focus) {
  border-color: var(--primary-opacity-50);
  box-shadow: 0 0 0 0.2rem rgba(var(--primary-rgb), 0.1);
}

:deep(.p-textarea::placeholder) {
  color: var(--moon-opacity-50);
}

/* 限制 textarea 最大高度，防止布局被破坏 */
:deep(.p-textarea textarea) {
  max-height: 200px !important;
  overflow-y: auto !important;
}

/* 消息容器滚动条 */
.messages-container {
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
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
