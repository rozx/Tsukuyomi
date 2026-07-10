import { watch, onMounted, nextTick, type Ref } from 'vue';
import { useChatSessionsStore, type ChatSessionMessage } from 'src/stores/chat-sessions';
import { useContextStore } from 'src/stores/context';
import { useAIProcessingStore } from 'src/stores/ai-processing';
import { throttle } from 'src/utils/throttle';

/**
 * 聊天会话管理逻辑
 * @param messages 消息列表 Ref (外部传入)
 * @param onSessionSwitched 会话切换时的回调
 */
export function useChatSession(messages: Ref<ChatSessionMessage[]>, onSessionSwitched?: () => void) {
  const chatSessionsStore = useChatSessionsStore();
  const contextStore = useContextStore();
  const aiProcessingStore = useAIProcessingStore();

  // 提前从 localStorage hydrate context（loadState 内部有 isLoaded 幂等守卫）。
  // 否则 App.vue 的 onMounted 会在子组件 onMounted 之后才调用 loadState，
  // 导致下面的 context watcher 把 null→bookId 的初始化误当成用户切换书籍，
  // 从而覆盖用户刚恢复的 currentSessionId。
  contextStore.loadState();

  let isUpdatingFromStore = false;

  // 使用 throttle 工具函数。目标会话在"排程时"捕获：
  // trailing flush 可能在会话切换之后才触发，按实时 currentSessionId 落盘
  // 会把旧会话的消息数组写进新会话
  const syncMessagesToSessionThrottled = throttle(
    (newMessages: ChatSessionMessage[], sessionId: string | null) => {
      if (!sessionId) return;
      chatSessionsStore.updateSessionMessages(sessionId, newMessages);
    },
    200,
  ).fn;

  // 重新加载消息（从 Store）
  const reloadMessages = async () => {
    isUpdatingFromStore = true; // 标记正在从 store 更新
    const session = chatSessionsStore.currentSession;
    if (session) {
      messages.value = [...session.messages];
    } else {
      messages.value = [];
    }
    // 使用 nextTick 确保在下一个 tick 重置标记
    await nextTick();
    isUpdatingFromStore = false;
  };

  // 加载当前会话的消息（并触发切换回调）
  const loadCurrentSession = async () => {
    await reloadMessages();

    // 触发会话切换回调（用于清理状态等）
    if (onSessionSwitched) {
      onSessionSwitched();
    }
  };

  // 创建新会话
  const createNewSession = async () => {
    // 停止所有正在进行的助手（聊天）相关任务
    // 仅停止聊天任务，不影响翻译、校对等其他任务
    try {
      await aiProcessingStore.stopAllAssistantTasks();
    } catch (error) {
      console.error('Failed to stop assistant tasks:', error);
      // 不阻止创建新会话，即使停止任务失败
    }

    const context = contextStore.getContext;
    chatSessionsStore.createSession({
      bookId: context.currentBookId,
      chapterId: context.currentChapterId,
      paragraphId: context.selectedParagraphId,
    });
    // loadCurrentSession will be triggered by watcher, but we can also set messages empty here
    messages.value = [];
  };

  // 清空聊天
  const clearChat = () => {
    messages.value = [];
    chatSessionsStore.clearCurrentSession();
  };

  // 删除会话
  const handleDeleteSession = async (sessionId: string) => {
    chatSessionsStore.deleteSession(sessionId);
    if (!chatSessionsStore.currentSessionId) {
      await createNewSession();
    }
  };

  // 初始化会话
  onMounted(() => {
    chatSessionsStore.loadSessions();
    if (!chatSessionsStore.currentSessionId) {
      // 如果没有当前会话，创建新会话
      void createNewSession();
    } else {
      // 加载当前会话的消息
      void loadCurrentSession();
    }
  });

  // 监听当前会话变化
  watch(
    () => chatSessionsStore.currentSessionId,
    () => {
      void loadCurrentSession();
    },
  );

  // 监听消息变化，同步到会话
  watch(
    () => messages.value,
    (newMessages) => {
      // 如果正在从 store 更新，跳过同步，避免循环
      if (isUpdatingFromStore) {
        return;
      }
      syncMessagesToSessionThrottled(newMessages, chatSessionsStore.currentSessionId);
    },
    { deep: true },
  );

  // 监听上下文变化，处理书籍切换时的会话管理
  watch(
    () => contextStore.getContext,
    (newContext, oldContext) => {
      const newBookId = newContext.currentBookId;
      const oldBookId = oldContext?.currentBookId;

      if (newBookId !== oldBookId) {
        // 书籍变了：切换或创建会话。
        // 注意：createNewSession 是 async（要先 await stopAllAssistantTasks），
        // 此时 currentSessionId 仍指向旧会话——不能在此分支再调用
        // updateCurrentSessionContext，否则会把旧会话的 context.bookId 改写成新值，
        // 导致用户回到原书籍页时再也按 bookId 匹配不到原会话（表现为“会话丢失”）。
        if (newBookId) {
          const existingSession = chatSessionsStore.allSessions.find(
            (s) => s.context.bookId === newBookId,
          );
          if (existingSession) {
            chatSessionsStore.switchToSession(existingSession.id);
            // switchToSession 是同步的，currentSessionId 已经切到新会话，
            // 此时再用最新 context 刷新它（章节/段落可能与上次保存的不同）是安全的。
            chatSessionsStore.updateCurrentSessionContext({
              bookId: newContext.currentBookId,
              chapterId: newContext.currentChapterId,
              paragraphId: newContext.selectedParagraphId,
            });
          } else {
            // createNewSession 内部读取最新的 contextStore.getContext 作为种子，无需额外更新
            void createNewSession();
          }
        } else {
          void createNewSession();
        }
        return;
      }

      // 书籍未变：只是章节/段落变了，刷新当前会话的 context
      chatSessionsStore.updateCurrentSessionContext({
        bookId: newContext.currentBookId,
        chapterId: newContext.currentChapterId,
        paragraphId: newContext.selectedParagraphId,
      });
    },
    { deep: true },
  );

  return {
    reloadMessages,
    loadCurrentSession,
    createNewSession,
    clearChat,
    handleDeleteSession,
  };
}
