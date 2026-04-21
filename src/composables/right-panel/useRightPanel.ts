import { ref, computed, nextTick, watch, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import type Textarea from 'primevue/textarea';
import { useUiStore } from 'src/stores/ui';
import { useContextStore } from 'src/stores/context';
import { useAIModelsStore } from 'src/stores/ai-models';
import { useBooksStore } from 'src/stores/books';
import { useAIProcessingStore } from 'src/stores/ai-processing';
import {
  useChatSessionsStore,
  type ChatSessionMessage,
  type MessageAction,
  MESSAGE_LIMIT_THRESHOLD,
} from 'src/stores/chat-sessions';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import { getAssetUrl } from 'src/utils';
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

function findChapterInNovel(book: Novel, chapterId: string): Chapter | undefined {
  if (!book.volumes) return undefined;
  for (const volume of book.volumes) {
    const found = volume.chapters?.find((c) => c.id === chapterId);
    if (found) return found;
  }
  return undefined;
}

function formatChapterInfo(
  chapter: Chapter | undefined,
  book: Novel | undefined,
): string {
  if (!chapter) return '当前章节';
  const title = getChapterDisplayTitle(chapter, book);
  return title ? `章节：${title}` : '当前章节';
}

function formatParagraphInfo(
  chapter: Chapter | undefined,
  paragraphId: string,
): string {
  const paraIndex = chapter?.content
    ? chapter.content.findIndex((p) => p.id === paragraphId)
    : -1;
  return paraIndex >= 0 ? `段落：#${paraIndex + 1}` : '当前段落';
}

/**
 * AppRightPanel 的业务逻辑 composable。
 *
 * 汇聚现有 chat composables（usePanelResize / useThinkingDisplay /
 * useChatSession / useChatSummarizer / useChatSending / useChatMessageDisplay /
 * useMarkdownRenderer）以及面板层面的黏合状态（待办、popover、消息操作、
 * 会话统计、上下文信息等）。三变体（Desktop / Tablet / Mobile）通过调用同一
 * composable 获取完整上下文，仅在各自模板内声明纯视图局部状态。
 */
export function useRightPanel() {
  const ui = useUiStore();
  const router = useRouter();
  const contextStore = useContextStore();
  const aiModelsStore = useAIModelsStore();
  const booksStore = useBooksStore();
  const aiProcessingStore = useAIProcessingStore();
  const chatSessionsStore = useChatSessionsStore();
  const toast = useToastWithHistory();

  const logoPath = getAssetUrl('icons/android-chrome-512x512.png');

  // 当前激活的 Tab
  const activeRightTab = computed(() => ui.activeRightTab);

  // 活跃的翻译类任务数量（用于角标）
  const activeTranslationTaskCount = computed(() => aiProcessingStore.activeTranslationTaskCount);

  // 面板与布局
  const { panelContainerRef, resizeHandleRef, isResizing, handleResizeStart } = usePanelResize();

  // Markdown 渲染
  const { renderMarkdown } = useMarkdownRenderer();

  // 基础状态与引用
  const messagesContainerRef = ref<HTMLElement | null>(null);
  const inputRef = ref<InstanceType<typeof Textarea> | null>(null);

  // 会话输入状态
  const messages = ref<ChatSessionMessage[]>([]);
  const inputMessage = ref('');
  const currentTaskId = ref<string | null>(null);
  const currentMessageActions = ref<MessageAction[]>([]);

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
  const assistantModel = computed(() => aiModelsStore.getDefaultModelForTask('assistant'));

  const { reloadMessages, createNewSession, clearChat } = useChatSession(
    messages,
    onSessionSwitched,
  );

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
  const incompleteTodoCount = computed(
    () => todos.value.filter((todo) => todo.status !== 'done').length,
  );

  // 会话列表面板：桌面是 Popover，手机是 MobileBottomSheet —— 统一走 toggle/hide 接口
  type SessionListControl = {
    toggle: (event: Event) => void;
    hide: () => void;
  };
  const sessionListPopoverRef = ref<SessionListControl | null>(null);

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
        if (session.id === currentSessionId) return false;
        return session.context?.bookId === currentBookId;
      })
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .slice(0, 5);
  });

  // 切换到指定会话
  const switchToSession = (sessionId: string) => {
    chatSessionsStore.switchToSession(sessionId);
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

    if (sessionId) {
      todos.value = allTodos.filter((todo) => todo.sessionId === sessionId);
    } else if (currentTaskId.value) {
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

  onMounted(() => {
    loadTodos();
    window.addEventListener('storage', handleStorageChange);
  });

  onUnmounted(() => {
    window.removeEventListener('storage', handleStorageChange);
  });

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

  // Action Popover：桌面 Popover / 手机 MobileBottomSheet —— 统一 toggle/hide
  type ActionPanelControl = {
    toggle: (event: Event) => void;
    hide: () => void;
  };
  const actionPopoverRef = ref<ActionPanelControl | null>(null);
  const hoveredAction = ref<{ action: MessageAction; message: ChatSessionMessage } | null>(null);

  // Grouped action panel：同样的 toggle/hide 接口
  const groupedActionPopoverRef = ref<ActionPanelControl | null>(null);
  const hoveredGroupedAction = ref<{
    actions: MessageAction[];
    message: ChatSessionMessage;
    timestamp: number;
  } | null>(null);

  // 上下文信息
  const contextInfo = computed(() => {
    const context = contextStore.getContext;
    const currentBook = context.currentBookId
      ? booksStore.getBookById(context.currentBookId)
      : undefined;
    const currentChapter =
      currentBook && context.currentChapterId
        ? findChapterInNovel(currentBook, context.currentChapterId)
        : undefined;

    const info: string[] = [];
    if (context.currentBookId) {
      info.push(currentBook ? `书籍：${currentBook.title}` : '当前书籍');
    }
    if (context.currentChapterId) {
      info.push(formatChapterInfo(currentChapter, currentBook));
    }
    if (context.selectedParagraphId) {
      info.push(formatParagraphInfo(currentChapter, context.selectedParagraphId));
    }
    return info.length > 0 ? info.join(' | ') : '无上下文';
  });

  const isAssistantMessageCountable = (msg: (typeof messages.value)[number]): boolean => {
    if (msg.actions && msg.actions.length > 0) return false;
    if (!msg.content || msg.content === '（调用工具）') return false;
    return true;
  };

  const isMessageCountable = (msg: (typeof messages.value)[number]): boolean => {
    if (msg.isSummarization || msg.isSummaryResponse || msg.isContextMessage) return false;
    if (msg.role === 'user') return true;
    if (msg.role === 'assistant') return isAssistantMessageCountable(msg);
    return false;
  };

  // 会话统计信息
  const sessionStats = computed(() => {
    if (messages.value.length === 0) return null;

    const currentSession = chatSessionsStore.currentSession;
    const cutoff = currentSession?.lastSummarizedMessageIndex ?? 0;

    const messagesToCount = messages.value.slice(cutoff).filter(isMessageCountable);

    const currentCount = messagesToCount.length;

    const tokens = estimateAssistantContextTokens({
      context: contextStore.getContext,
      session: currentSession,
      currentMessages: messages.value,
      includeToolSchemas: true,
    });

    const maxInputTokens = assistantModel.value?.maxInputTokens || 0;
    let tokenPercentage = 0;

    if (maxInputTokens > 0) {
      tokenPercentage = Math.round((tokens / maxInputTokens) * 100);
    }

    const msgPercentage = Math.min(
      Math.round((currentCount / MESSAGE_LIMIT_THRESHOLD) * 100),
      100,
    );

    const maxPercentage = Math.max(tokenPercentage, msgPercentage);

    return {
      currentCount,
      limit: MESSAGE_LIMIT_THRESHOLD,
      tokens,
      maxInputTokens,
      tokenPercentage,
      msgPercentage,
      maxPercentage,
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
  const hasThinkingGrowth = (
    oldLen: number | undefined,
    newLen: number,
  ): oldLen is number => oldLen !== undefined && newLen > oldLen && newLen > 0;

  const handleThinkingUpdate = (
    id: string,
    thinking: string | undefined,
  ): void => {
    if (thinkingExpanded.value.get(id)) {
      requestScrollThinkingToBottom(id);
    }
    if (thinking) {
      setDisplayedThinkingImmediatelyIfEmpty(id, thinking);
      updateDisplayedThinkingProcess(id, thinking);
    }
  };

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
        if (!hasThinkingGrowth(oldLen, newVal.thinkingLen)) continue;
        handleThinkingUpdate(newVal.id, msgById.get(newVal.id)?.thinkingProcess);
      }
    },
    { flush: 'post' },
  );

  // 监听助手输入消息状态，自动填充输入框
  watch(
    () => ui.assistantInputMessage,
    (message) => {
      if (message !== null) {
        inputMessage.value = message;
        if (!ui.rightPanelOpen) {
          ui.openRightPanel();
        }
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
    message: ChatSessionMessage,
    _popoverKey: string,
  ) => {
    if (actionPopoverRef.value) {
      hoveredAction.value = { action, message };
      actionPopoverRef.value.toggle(event);
    }
  };

  const handleActionMouseLeave = () => {
    if (actionPopoverRef.value) {
      actionPopoverRef.value.hide();
    }
  };

  const handleActionPopoverHide = () => {
    hoveredAction.value = null;
  };

  const toggleGroupedActionPopover = (
    event: Event,
    actions: MessageAction[],
    message: ChatSessionMessage,
    timestamp: number,
  ) => {
    if (groupedActionPopoverRef.value) {
      hoveredGroupedAction.value = { actions, message, timestamp };
      groupedActionPopoverRef.value.toggle(event);
    }
  };

  const handleGroupedActionMouseLeave = () => {
    if (groupedActionPopoverRef.value) {
      groupedActionPopoverRef.value.hide();
    }
  };

  const handleGroupedActionPopoverHide = () => {
    hoveredGroupedAction.value = null;
  };

  const { messageDisplayItemsById } = useChatMessageDisplay(messages);

  return {
    // stores (for template convenience)
    ui,
    aiModelsStore,
    chatSessionsStore,
    contextStore,
    // refs for template binding
    panelContainerRef,
    resizeHandleRef,
    messagesContainerRef,
    inputRef,
    sessionListPopoverRef,
    actionPopoverRef,
    groupedActionPopoverRef,
    // assets + tab state
    logoPath,
    activeRightTab,
    activeTranslationTaskCount,
    // panel chrome
    isResizing,
    handleResizeStart,
    // messages + input
    messages,
    inputMessage,
    currentTaskId,
    currentMessageActions,
    messageDisplayItemsById,
    // sending
    isSending,
    sendMessage,
    stopGeneration,
    handleKeydown,
    // session + todos
    todos,
    showTodoList,
    incompleteTodoCount,
    recentSessions,
    switchToSession,
    toggleSessionListPopover,
    hideSessionListPopover,
    createNewSession,
    clearChat,
    reloadMessages,
    // thinking display
    thinkingExpanded,
    displayedThinkingProcess,
    displayedThinkingPreview,
    thinkingActive,
    setThinkingContentRef,
    toggleThinking,
    // model + stats + context
    assistantModel,
    contextInfo,
    sessionStats,
    // chapter helper + markdown + time
    getChapterTitleForAction,
    renderMarkdown,
    formatMessageTime,
    // popovers (single + grouped)
    hoveredAction,
    hoveredGroupedAction,
    actionDetailsContext,
    toggleActionPopover,
    handleActionMouseLeave,
    handleActionPopoverHide,
    toggleGroupedActionPopover,
    handleGroupedActionMouseLeave,
    handleGroupedActionPopoverHide,
  };
}
