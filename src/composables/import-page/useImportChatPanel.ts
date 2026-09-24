/**
 * 导入聊天外壳的状态适配器。
 *
 * 提供 `useChatPanelBindings` 所需的同一组字段，但数据来自当前导入任务：
 * 消息与工具记录读自任务事件，发送与停止调用导入 Agent。不调用普通聊天的
 * `useChatSession`，不改写 `currentSessionId`，也不把导入目标写进全局当前书籍。
 */
import { computed, nextTick, ref, watch } from 'vue';
import { useImportWorkspaceStore } from 'src/stores/import-workspace';
import { useAIModelsStore } from 'src/stores/ai-models';
import { useBooksStore } from 'src/stores/books';
import { useThinkingDisplay } from 'src/composables/chat/useThinkingDisplay';
import { useChatMessageDisplay } from 'src/composables/chat/useChatMessageDisplay';
import { useMarkdownRenderer } from 'src/composables/chat/useMarkdownRenderer';
import { importEventsToMessages } from 'src/composables/import-page/import-chat-messages';
import type { ChatSessionMessage, MessageAction } from 'src/stores/chat-sessions';
import type { ActionDetailsContext } from 'src/utils/action-info-utils';
import type { TodoItem } from 'src/services/todo-list-service';
import { importRepairPrefill } from 'src/services/import/import-recipe-repair';

type PanelControl = { toggle: (event: Event) => void; hide: () => void };

export function useImportChatPanel() {
  const store = useImportWorkspaceStore();
  const aiModels = useAIModelsStore();
  const booksStore = useBooksStore();
  const { renderMarkdown } = useMarkdownRenderer();

  const messagesContainerRef = ref<HTMLElement | null>(null);
  const inputMessage = ref('');
  const showTodoList = ref(false);

  const messages = computed<ChatSessionMessage[]>(() =>
    importEventsToMessages(store.events, {
      sourceNames: store.sourceNames,
      sources: store.sources,
      ...(store.task ? { task: store.task } : {}),
      ...(store.task?.streaming?.text ? { streaming: store.task.streaming.text } : {}),
      ...(store.task?.compacting || store.pendingAction === 'compact' ? { compacting: true } : {}),
    }),
  );

  const scrollToBottom = () => {
    void nextTick(() => {
      const container = messagesContainerRef.value;
      if (container) container.scrollTop = container.scrollHeight;
    });
  };
  const thinking = useThinkingDisplay(messages, scrollToBottom);
  const { messageDisplayItemsById } = useChatMessageDisplay(messages);
  watch(
    () => [store.selectedTaskId, messages.value.length, store.task?.streaming?.text] as const,
    scrollToBottom,
  );
  watch(
    () => store.selectedTaskId,
    () => {
      inputMessage.value = '';
      thinking.clearThinkingState();
    },
  );
  // 修复任务首次打开时预填失效说明，由用户决定是否发送；每个任务只预填一次
  let prefilledFor: string | undefined;
  watch(
    () => [store.task, store.events.length] as const,
    ([task, count]) => {
      if (!task || prefilledFor === task.id || inputMessage.value) return;
      const text = importRepairPrefill(task, count);
      if (!text) return;
      prefilledFor = task.id;
      inputMessage.value = text;
    },
    { immediate: true },
  );

  const assistantModel = computed(() => aiModels.getDefaultModelForTask('assistant'));
  const isSending = computed(() => store.isRunning);
  const question = computed(() => store.task?.pendingQuestion);
  const awaitingAnswer = computed(() =>
    Boolean(question.value?.required && !question.value.answer),
  );

  const sendMessage = () => {
    const text = inputMessage.value.trim();
    if (!text || !store.task) return;
    inputMessage.value = '';
    void store.send(text, assistantModel.value);
  };
  const stopGeneration = () => void store.pause();

  const todos = computed<TodoItem[]>(() =>
    (store.task?.todos ?? []).map((todo) => ({ ...todo, taskId: store.task!.id })),
  );
  const incompleteTodoCount = computed(
    () => todos.value.filter((todo) => todo.status !== 'done').length,
  );

  // 操作记录浮层：与普通聊天相同的 toggle / hide 接口
  const actionPopoverRef = ref<PanelControl | null>(null);
  const groupedActionPopoverRef = ref<PanelControl | null>(null);
  const hoveredAction = ref<{ action: MessageAction; message: ChatSessionMessage } | null>(null);
  const hoveredGroupedAction = ref<{
    actions: MessageAction[];
    message: ChatSessionMessage;
    timestamp: number;
  } | null>(null);

  const actionDetailsContext: ActionDetailsContext = {
    getBookById: (bookId) => booksStore.getBookById(bookId),
    getCurrentBookId: () => null,
  };

  return {
    store,
    messagesContainerRef,
    messages,
    inputMessage,
    isSending,
    assistantModel,
    question,
    awaitingAnswer,
    todos,
    incompleteTodoCount,
    showTodoList,
    sendMessage,
    stopGeneration,
    messageDisplayItemsById,
    displayedThinkingProcess: thinking.displayedThinkingProcess,
    displayedThinkingPreview: thinking.displayedThinkingPreview,
    thinkingExpanded: thinking.thinkingExpanded,
    thinkingActive: thinking.thinkingActive,
    setThinkingContentRef: thinking.setThinkingContentRef,
    toggleThinking: thinking.toggleThinking,
    renderMarkdown,
    formatMessageTime: (timestamp: number) =>
      new Date(timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
    getChapterTitleForAction: () => undefined,
    hoveredAction,
    hoveredGroupedAction,
    actionDetailsContext,
    toggleActionPopover: (event: Event, action: MessageAction, message: ChatSessionMessage) => {
      if (!actionPopoverRef.value) return;
      hoveredAction.value = { action, message };
      actionPopoverRef.value.toggle(event);
    },
    handleActionMouseLeave: () => actionPopoverRef.value?.hide(),
    handleActionPopoverHide: () => {
      hoveredAction.value = null;
    },
    toggleGroupedActionPopover: (
      event: Event,
      actions: MessageAction[],
      message: ChatSessionMessage,
      timestamp: number,
    ) => {
      if (!groupedActionPopoverRef.value) return;
      hoveredGroupedAction.value = { actions, message, timestamp };
      groupedActionPopoverRef.value.toggle(event);
    },
    handleGroupedActionMouseLeave: () => groupedActionPopoverRef.value?.hide(),
    handleGroupedActionPopoverHide: () => {
      hoveredGroupedAction.value = null;
    },
    bindActionPopoverRef: (el: unknown) => {
      actionPopoverRef.value = el as PanelControl | null;
    },
    bindGroupedActionPopoverRef: (el: unknown) => {
      groupedActionPopoverRef.value = el as PanelControl | null;
    },
  };
}
