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

      const chatResult = await AssistantService.chat(assistantModel.value, message, {
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
        onSummarizingEnd: () => {
          // 摘要完成，准备接收新的聊天内容
          // 更新摘要消息的显示
          if (internalSummarizationMessageId) {
            const summarizationMsgIndex = messages.value.findIndex(
              (m) => m.id === internalSummarizationMessageId,
            );
            if (summarizationMsgIndex >= 0) {
              const existingMsg = messages.value[summarizationMsgIndex];
              if (existingMsg) {
                messages.value[summarizationMsgIndex] = {
                  ...existingMsg,
                  content: '📝 已完成对话总结',
                };
              }
            }
          }

          // 创建新的助手消息用于接收继续的聊天内容
          assistantMessageIdRef.value = (Date.now() + 2).toString();
          const newAssistantMessage: ChatMessage = {
            id: assistantMessageIdRef.value,
            role: 'assistant',
            content: '',
            timestamp: Date.now(),
            ...(savedThinkingProcess ? { thinkingProcess: savedThinkingProcess } : {}),
          };
          messages.value.push(newAssistantMessage);

          // 重置标志，允许接收新的 chunk
          isSummarizingInternally = false;
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

      // 处理内部摘要后的会话状态更新
      // 注意：摘要消息的显示更新已在 onSummarizingEnd 回调中完成
      const finalSession = chatSessionsStore.currentSession;
      if (finalSession && chatResult.needsReset && chatResult.summary) {
        // 如果服务返回了摘要，更新会话的摘要状态
        chatSessionsStore.summarizeAndReset(chatResult.summary);
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
        // 只有当上次摘要后有超过 2 条消息时，才执行 UI 层摘要
        // 防止新会话第一条消息就触发摘要
        const msgsSinceSummary = chatSummarizer.getMessagesSinceSummaryCount(sessionAfter);
        if (msgsSinceSummary > 2) {
          void chatSummarizer.performUISummarization(true, (val) => (isSending.value = val));
        }
      }
    }
  };

  return {
    isSending,
    sendMessage,
  };
}
