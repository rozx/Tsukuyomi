import { ref, type Ref } from 'vue';
import type { Router } from 'vue-router';
import {
  useChatSessionsStore,
  type ChatSessionMessage,
  type ChatSession,
  type MessageAction,
  type ApiMessage,
  MESSAGE_LIMIT_THRESHOLD,
  MAX_MESSAGES_PER_SESSION,
} from 'src/stores/chat-sessions';
import { useAIProcessingStore } from 'src/stores/ai-processing';
import { AssistantService } from 'src/services/ai/tasks';
import { buildAssistantMessageHistory } from 'src/utils/ai-context-utils';
import { isCancelledError } from 'src/utils/is-cancelled-error';
import type { AIModel } from 'src/services/ai/types/ai-model';

import { useChatActionHandler } from './useChatActionHandler';
import { useInternalSummarization } from './useInternalSummarization';

export function useChatSending(
  messages: Ref<ChatSessionMessage[]>,
  inputMessage: Ref<string>,
  assistantModel: Ref<AIModel | undefined>,
  scrollToBottom: () => void,
  scrollToBottomThrottled: () => void,
  chatSummarizer: {
    performUISummarization: (
      force: boolean,
      stateSetter?: (val: boolean) => void,
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
  toast: {
    add: (msg: {
      severity?: string | undefined;
      summary?: string | undefined;
      detail?: string | undefined;
      life?: number | undefined;
      group?: string | undefined;
    }) => void;
  },
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

  const {
    isSummarizingInternally,
    handleSummarizingStart,
    handleSummarizingEnd,
    reset: resetInternalSummarization,
  } = useInternalSummarization(messages, scrollToBottom, chatSessionsStore);

  const enforceMessageLimitBeforeSend = async (): Promise<{
    aborted: boolean;
    uiPerformedSummarization: boolean;
  }> => {
    const sessionForLimit = chatSessionsStore.currentSession;
    let messageCountSinceSummary = chatSummarizer.getMessagesSinceSummaryCount(sessionForLimit);
    const willExceedLimit = messageCountSinceSummary + 1 >= MESSAGE_LIMIT_THRESHOLD;
    const willReachLimit = messageCountSinceSummary + 1 >= MAX_MESSAGES_PER_SESSION;
    if (!(willExceedLimit || willReachLimit) || messages.value.length === 0) {
      return { aborted: false, uiPerformedSummarization: false };
    }
    const summarizationResult = await chatSummarizer.performUISummarization(
      willReachLimit,
      (val) => (isSending.value = val),
    );
    if (!summarizationResult.success) {
      return { aborted: willReachLimit, uiPerformedSummarization: false };
    }
    const updatedSession = chatSessionsStore.currentSession;
    messageCountSinceSummary = chatSummarizer.getMessagesSinceSummaryCount(updatedSession);
    if (messageCountSinceSummary + 1 >= MAX_MESSAGES_PER_SESSION) {
      toast.add({
        severity: 'warn',
        summary: '会话消息数仍达上限',
        detail: '请创建新会话继续对话',
        life: 3000,
      });
      return { aborted: true, uiPerformedSummarization: true };
    }
    return { aborted: false, uiPerformedSummarization: true };
  };

  const pushUserAndAssistantPlaceholder = (
    message: string,
  ): { assistantMessageIdRef: { value: string } } => {
    const userMessage: ChatSessionMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: message,
      timestamp: Date.now(),
    };
    messages.value.push(userMessage);
    inputMessage.value = '';
    isSending.value = true;
    scrollToBottom();
    const assistantMessageIdRef = { value: (Date.now() + 1).toString() };
    messages.value.push({
      id: assistantMessageIdRef.value,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    });
    return { assistantMessageIdRef };
  };

  const buildChatCallbacks = (assistantMessageIdRef: { value: string }, sessionIdForSummary: string | undefined) => ({
    onTaskCreated: (id: string) => {
      currentTaskId.value = id;
    },
    onSummarizingStart: () => {
      handleSummarizingStart(assistantMessageIdRef, sessionIdForSummary);
    },
    onSummarizingEnd: () => {
      handleSummarizingEnd(assistantMessageIdRef);
    },
    onChunk: (chunk: { text?: string }) => {
      if (isSummarizingInternally.value) return;
      const msg = messages.value.find((m) => m.id === assistantMessageIdRef.value);
      if (msg && chunk.text) {
        msg.content += chunk.text;
        scrollToBottomThrottled();
      }
    },
    onThinkingChunk: (text: string) => {
      if (isSummarizingInternally.value) return;
      const msg = messages.value.find((m) => m.id === assistantMessageIdRef.value);
      if (!msg) return;
      if (!msg.thinkingProcess) msg.thinkingProcess = '';
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
    },
    onToast: (m: Parameters<typeof toast.add>[0]) => {
      toast.add(m);
    },
    onAction: (action: Parameters<typeof handleAction>[0]) => {
      handleAction(action, assistantMessageIdRef);
    },
  });

  const persistChatResult = (chatResult: Awaited<ReturnType<typeof AssistantService.chat>>) => {
    const finalSession = chatSessionsStore.currentSession;
    if (!finalSession) return;
    if (chatResult.needsReset && chatResult.summary) {
      chatSessionsStore.summarizeAndReset(chatResult.summary);
    }
    if (chatResult.toolCallTokenOverhead !== undefined) {
      chatSessionsStore.updateToolCallTokenOverhead(
        finalSession.id,
        chatResult.toolCallTokenOverhead,
      );
    }
    if (chatResult.messageHistory && !chatResult.needsReset) {
      const apiMessages: ApiMessage[] = chatResult.messageHistory
        .filter((msg) => msg.role !== 'system')
        .map((msg) => ({
          role: msg.role as 'user' | 'assistant' | 'tool',
          content: msg.content ?? null,
          ...(msg.name ? { name: msg.name } : {}),
          ...(msg.tool_call_id ? { tool_call_id: msg.tool_call_id } : {}),
          ...(msg.tool_calls ? { tool_calls: msg.tool_calls } : {}),
          ...(msg.reasoning_content ? { reasoning_content: msg.reasoning_content } : {}),
        }));
      const serialized = JSON.stringify(apiMessages);
      if (serialized.length <= 512_000) {
        chatSessionsStore.updateApiMessageHistory(finalSession.id, apiMessages);
      } else {
        console.warn(
          `[ChatSending] API 消息历史过大 (${Math.round(serialized.length / 1024)}KB)，跳过保存`,
        );
      }
    }
  };

  const handleChatSendError = (error: unknown, assistantMessageIdRef: { value: string }) => {
    const isCancelled = isCancelledError(error);
    if (error instanceof Error && error.message === 'Task aborted') {
      // ignore
    } else if (!isCancelled) {
      console.error('Failed to send message:', error);
      toast.add({
        severity: 'error',
        summary: '发送失败',
        detail: error instanceof Error ? error.message : 'Unknown error',
        life: 5000,
      });
    }
    const index = messages.value.findIndex((m) => m.id === assistantMessageIdRef.value);
    if (index !== -1) {
      const msg = messages.value[index];
      if (msg && !msg.content && !msg.thinkingProcess) {
        messages.value.splice(index, 1);
      }
    }
  };

  const finalizeChatSend = (assistantMessageIdRef: { value: string }) => {
    isSending.value = false;
    currentTaskId.value = null;
    if (thinkingDisplay.setThinkingActive) {
      thinkingDisplay.setThinkingActive(assistantMessageIdRef.value, false);
    }
    resetInternalSummarization();
    const sessionAfter = chatSessionsStore.currentSession;
    if (!sessionAfter) return;
    chatSessionsStore.updateSessionMessages(sessionAfter.id, messages.value);
    const msgsSinceSummary = chatSummarizer.getMessagesSinceSummaryCount(sessionAfter);
    if (msgsSinceSummary >= MESSAGE_LIMIT_THRESHOLD) {
      void chatSummarizer.performUISummarization(false);
    }
  };

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

    const { aborted, uiPerformedSummarization } = await enforceMessageLimitBeforeSend();
    if (aborted) return;

    const { assistantMessageIdRef } = pushUserAndAssistantPlaceholder(message);
    const currentSession = chatSessionsStore.currentSession;
    const sessionId = currentSession?.id ?? null;
    const sessionSummary = currentSession?.summary;

    try {
      const messageHistory = buildAssistantMessageHistory(currentSession);
      resetInternalSummarization();
      const chatResult = await AssistantService.chat(assistantModel.value, message, {
        ...(sessionSummary ? { sessionSummary } : {}),
        ...(messageHistory ? { messageHistory } : {}),
        ...(sessionId ? { sessionId } : {}),
        ...(uiPerformedSummarization ? { skipTokenLimitSummarization: true } : {}),
        aiProcessingStore,
        ...buildChatCallbacks(assistantMessageIdRef, currentSession?.id),
      });
      persistChatResult(chatResult);
    } catch (error) {
      handleChatSendError(error, assistantMessageIdRef);
    } finally {
      finalizeChatSend(assistantMessageIdRef);
    }
  };

  return {
    isSending,
    sendMessage,
  };
}
