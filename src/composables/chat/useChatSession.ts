import { ref, watch, onMounted, nextTick, type Ref } from 'vue';
import { useChatSessionsStore, type ChatMessage } from 'src/stores/chat-sessions';
import { useContextStore } from 'src/stores/context';
import { useAIProcessingStore } from 'src/stores/ai-processing';
import { throttle } from 'src/utils/throttle';

/**
 * 聊天会话管理逻辑
 * @param messages 消息列表 Ref (外部传入)
 * @param onSessionSwitched 会话切换时的回调
 */
export function useChatSession(messages: Ref<ChatMessage[]>, onSessionSwitched?: () => void) {
  const chatSessionsStore = useChatSessionsStore();
  const contextStore = useContextStore();
  const aiProcessingStore = useAIProcessingStore();

  let isUpdatingFromStore = false;

  // 使用 throttle 工具函数
  const syncMessagesToSessionThrottled = throttle((newMessages: ChatMessage[]) => {
    chatSessionsStore.updateCurrentSessionMessages(newMessages);
  }, 200).fn;

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
      syncMessagesToSessionThrottled(newMessages);
    },
    { deep: true },
  );

  // 监听上下文变化，处理书籍切换时的会话管理
  watch(
    () => contextStore.getContext,
    (newContext, oldContext) => {
      const newBookId = newContext.currentBookId;
      const oldBookId = oldContext?.currentBookId;

      // 如果书籍变化了，需要切换或创建会话
      if (newBookId !== oldBookId) {
        if (newBookId) {
          // 尝试找到该书籍的现有会话（查找最近更新的、与此书籍关联的会话）
          const sessions = chatSessionsStore.allSessions.filter(
            (s) => s.context.bookId === newBookId,
          );

          const existingSession = sessions.length > 0 ? sessions[0] : undefined;

          if (existingSession) {
            // 切换到现有会话
            chatSessionsStore.switchToSession(existingSession.id);
          } else {
            // 创建新会话
            void createNewSession();
          }
        } else {
          // 如果没有书籍上下文，创建一个新会话（无书籍关联）
          void createNewSession();
        }
      }

      // 更新当前会话的上下文
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
