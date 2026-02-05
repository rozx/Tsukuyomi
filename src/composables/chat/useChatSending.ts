import { ref, nextTick, type Ref } from 'vue';
import type { Router } from 'vue-router';
import {
  useChatSessionsStore,
  type ChatMessage,
  type ChatSession,
  type MessageAction,
  MESSAGE_LIMIT_THRESHOLD,
  MAX_MESSAGES_PER_SESSION,
} from 'src/stores/chat-sessions';
import { useAIProcessingStore } from 'src/stores/ai-processing';
import { AssistantService } from 'src/services/ai/tasks';
import { buildAssistantMessageHistory } from 'src/utils/ai-context-utils';
import type { AIModel } from 'src/services/ai/types/ai-model';
import { SUMMARIZING_MESSAGE_CONTENT } from 'src/composables/chat/constants';
import { useChatActionHandler } from './useChatActionHandler';

export function useChatSending(
  messages: Ref<ChatMessage[]>,
  inputMessage: Ref<string>,
  assistantModel: Ref<AIModel | undefined>,
  scrollToBottom: () => void,
  scrollToBottomThrottled: () => void,
  chatSummarizer: {
    performUISummarization: (
      force: boolean,
      stateSetter: (val: boolean) => void,
    ) => Promise<{ success: boolean }>;
    getMessagesSinceSummaryCount: (session: ChatSession | null) => number;
  },
  thinkingDisplay: {
    setThinkingActive: (id: string, active: boolean) => void;
    setDisplayedThinkingImmediatelyIfEmpty: (id: string, content: string) => void;
    updateDisplayedThinkingProcess: (id: string, content: string) => void;
    markThinkingActive: (id: string) => void;
    thinkingExpanded: Ref<Map<string, boolean>>;
    requestScrollThinkingToBottom: (id: string) => void;
  },
  router: Router,
  toast: { add: (msg: any) => void },
  currentMessageActions: Ref<MessageAction[]>,
  loadTodos: () => void,
  currentTaskId: Ref<string | null>,
) {
  const chatSessionsStore = useChatSessionsStore();
  const aiProcessingStore = useAIProcessingStore();
  const isSending = ref(false);

  const { handleAction } = useChatActionHandler(
    router,
    toast,
    scrollToBottom,
    loadTodos,
    messages,
    currentMessageActions,
    thinkingDisplay.setThinkingActive,
    chatSummarizer.getMessagesSinceSummaryCount,
  );

  const sendMessage = async () => {
    const message = inputMessage.value.trim();
    if (!message || isSending.value) return;

    if (!assistantModel.value) {
      toast.add({
        severity: 'warn',
        summary: '请选择 AI 模型',
        detail: '请在设置中配置至少一个 AI 模型',
        life: 3000,
      });
      return;
    }

    // 检查是否达到限制（在添加新消息之前）
    const sessionForLimit = chatSessionsStore.currentSession;
    let messageCountSinceSummary = chatSummarizer.getMessagesSinceSummaryCount(sessionForLimit);
    const willExceedLimit = messageCountSinceSummary + 1 >= MESSAGE_LIMIT_THRESHOLD;
    const willReachLimit = messageCountSinceSummary + 1 >= MAX_MESSAGES_PER_SESSION;

    let uiPerformedSummarization = false;

    if ((willExceedLimit || willReachLimit) && messages.value.length > 0) {
      const summarizationResult = await chatSummarizer.performUISummarization(
        willReachLimit,
        (val) => (isSending.value = val),
      );

      if (!summarizationResult.success) {
        if (willReachLimit) {
          return;
        }
      } else {
        uiPerformedSummarization = true;
        const updatedSession = chatSessionsStore.currentSession;
        messageCountSinceSummary = chatSummarizer.getMessagesSinceSummaryCount(updatedSession);
        if (messageCountSinceSummary + 1 >= MAX_MESSAGES_PER_SESSION) {
          toast.add({
            severity: 'warn',
            summary: '会话消息数仍达上限',
            detail: '请创建新会话继续对话',
            life: 3000,
          });
          return;
        }
      }
    }

    // 添加用户消息
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: message,
      timestamp: Date.now(),
    };
    messages.value.push(userMessage);
    inputMessage.value = '';
    isSending.value = true;
    scrollToBottom();

    // 添加占位符助手消息
    const assistantMessageIdRef = { value: (Date.now() + 1).toString() };

    const assistantMessage: ChatMessage = {
      id: assistantMessageIdRef.value,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    };
    messages.value.push(assistantMessage);

    const currentSession = chatSessionsStore.currentSession;
    const sessionId = currentSession?.id ?? null;
    const sessionSummary = currentSession?.summary;

    try {
      const messageHistory = buildAssistantMessageHistory(currentSession);
      // Explicitly cast to ChatMessage[] if needed, but buildAssistantMessageHistory should return compatible types.
      // If it returns specific type (AIChatMessage), and ChatMessage is compatible, it's fine.
      // If not, we might need 'any' cast or fix the utils. Assuming compatible for now as inferred content logic matched.

      let internalSummarizationMessageId: string | null = null;
      let isSummarizingInternally = false;
      let savedThinkingProcess: string | undefined = undefined;

      await AssistantService.chat(assistantModel.value, message, {
        ...(sessionSummary ? { sessionSummary } : {}),
        ...(messageHistory ? { messageHistory: messageHistory as ChatMessage[] } : {}),
        ...(sessionId ? { sessionId } : {}),
        ...(uiPerformedSummarization ? { skipTokenLimitSummarization: true } : {}),
        aiProcessingStore, // Pass the store object for internal task management
        onTaskCreated: (id) => {
          currentTaskId.value = id;
        },
        onSummarizingStart: () => {
          isSummarizingInternally = true;

          const assistantMsgIndex = messages.value.findIndex(
            (m) => m.id === assistantMessageIdRef.value,
          );
          if (assistantMsgIndex >= 0) {
            const assistantMsg = messages.value[assistantMsgIndex];
            if (assistantMsg) {
              if (assistantMsg.thinkingProcess) {
                savedThinkingProcess = assistantMsg.thinkingProcess;
              }
              messages.value.splice(assistantMsgIndex, 1);
            }
          }

          internalSummarizationMessageId = (Date.now() - 1).toString();
          const summarizationMessage: ChatMessage = {
            id: internalSummarizationMessageId,
            role: 'assistant',
            content: SUMMARIZING_MESSAGE_CONTENT,
            timestamp: Date.now(),
            isSummarization: true,
          };
          messages.value.push(summarizationMessage);

          if (currentSession) {
            chatSessionsStore.updateSessionMessages(currentSession.id, messages.value);
          }
          scrollToBottom();
        },
        onChunk: (chunk) => {
          if (isSummarizingInternally) {
            return;
          }
          const msg = messages.value.find((m) => m.id === assistantMessageIdRef.value);
          if (msg) {
            if (chunk.text) {
              msg.content += chunk.text;
              scrollToBottomThrottled();
            }
          }
        },
        onThinkingChunk: (text) => {
          if (isSummarizingInternally) {
            return;
          }
          const msg = messages.value.find((m) => m.id === assistantMessageIdRef.value);
          if (msg) {
            if (!msg.thinkingProcess) {
              msg.thinkingProcess = '';
            }
            msg.thinkingProcess += text;
            thinkingDisplay.setDisplayedThinkingImmediatelyIfEmpty(
              assistantMessageIdRef.value,
              msg.thinkingProcess,
            );
            thinkingDisplay.updateDisplayedThinkingProcess(
              assistantMessageIdRef.value,
              msg.thinkingProcess,
            );
            thinkingDisplay.markThinkingActive(assistantMessageIdRef.value);
            if (thinkingDisplay.thinkingExpanded.value.get(assistantMessageIdRef.value)) {
              thinkingDisplay.requestScrollThinkingToBottom(assistantMessageIdRef.value);
            }
            scrollToBottomThrottled();
          }
        },
        onToast: (message) => {
          toast.add(message);
        },
        onAction: (action) => {
          handleAction(action, assistantMessageIdRef);
        },
      });

      const finalSession = chatSessionsStore.currentSession;
      if (finalSession) {
        if (internalSummarizationMessageId) {
          // Logic for restored thinking process if needed
          // If summarization happened, AssistantService handles the new generation.
          // onChunk calls will update the NEW assistant message created after summary.
          // But we need to make sure we found the new ID.
          // Actually, internal logic in AssistantService handles history.
          // But onAction updates local Ref logic?
        }
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'Task aborted') {
        // Ignore
      } else {
        console.error('Failed to send message:', error);
        toast.add({
          severity: 'error',
          summary: '发送失败',
          detail: error instanceof Error ? error.message : 'Unknown error',
          life: 5000,
        });

        const index = messages.value.findIndex((m) => m.id === assistantMessageIdRef.value);
        if (index !== -1) {
          const message = messages.value[index];
          if (message && !message.content && !message.thinkingProcess) {
            messages.value.splice(index, 1);
          }
        }
      }
    } finally {
      isSending.value = false;
      currentTaskId.value = null;

      if (thinkingDisplay.setThinkingActive) {
        thinkingDisplay.setThinkingActive(assistantMessageIdRef.value, false);
      }

      const sessionAfter = chatSessionsStore.currentSession;
      if (sessionAfter) {
        chatSessionsStore.updateSessionMessages(sessionAfter.id, messages.value);
        void chatSummarizer.performUISummarization(true, (val) => (isSending.value = val));
      }
    }
  };

  return {
    isSending,
    sendMessage,
  };
}
