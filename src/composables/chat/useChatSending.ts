import { ref, type Ref } from 'vue';
import { v4 as uuidv4 } from 'uuid';
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
import { useContextStore } from 'src/stores/context';
import { AssistantService } from 'src/services/ai/tasks';
import {
  buildAssistantMessageHistory,
  estimateAssistantContextTokens,
  pickApiMessageExtras,
} from 'src/utils/ai-context-utils';
import { isCancelledError } from 'src/utils/is-cancelled-error';
import { UNLIMITED_TOKENS } from 'src/constants/ai';
import type { AIModel } from 'src/services/ai/types/ai-model';

import { useChatActionHandler } from './useChatActionHandler';
import { useInternalSummarization } from './useInternalSummarization';
import { SUMMARIZING_MESSAGE_CONTENT } from './constants';
import type { UISummarizationOptions } from './useChatSummarizer';

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
      options?: UISummarizationOptions,
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
  const contextStore = useContextStore();
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

  const buildMessagesWithPendingUser = (message: string): ChatSessionMessage[] => [
    ...messages.value,
    {
      id: 'pending-user-context-check',
      role: 'user',
      content: message,
      timestamp: Date.now(),
    },
  ];

  const hasReachedContextTokenLimit = (
    session: ChatSession | null,
    currentMessages: ChatSessionMessage[] = messages.value,
  ): boolean => {
    const maxInputTokens = assistantModel.value?.maxInputTokens ?? 0;
    if (!session || maxInputTokens <= 0 || maxInputTokens === UNLIMITED_TOKENS) {
      return false;
    }

    const contextTokens = estimateAssistantContextTokens({
      context: contextStore.getContext,
      session,
      currentMessages,
      includeToolSchemas: true,
    });

    return contextTokens >= maxInputTokens;
  };

  /**
   * 可见消息数（用户+助手，不含总结气泡等辅助消息）。
   * getMessagesSinceSummaryCount 按 API 上下文计数（每个工具调用/结果各算一条），
   * 用于触发压缩；但"会话消息数上限"的硬中止必须按可见消息计，否则
   * 工具密集的会话十几轮就会被误判为达到 200 条上限。
   */
  const countVisibleMessages = (msgs: ChatSessionMessage[]): number =>
    msgs.filter(
      (m) =>
        !m.isSummarization &&
        !m.isSummaryResponse &&
        !m.isContextMessage &&
        Boolean(m.content && m.content.trim()),
    ).length;

  const enforceMessageLimitBeforeSend = async (
    message: string,
  ): Promise<{
    aborted: boolean;
    uiPerformedSummarization: boolean;
  }> => {
    const sessionForLimit = chatSessionsStore.currentSession;
    const messageCountSinceSummary = chatSummarizer.getMessagesSinceSummaryCount(sessionForLimit);
    const willExceedLimit = messageCountSinceSummary + 1 >= MESSAGE_LIMIT_THRESHOLD;
    const willReachLimit = countVisibleMessages(messages.value) + 1 >= MAX_MESSAGES_PER_SESSION;
    const reachedContextTokenLimit = hasReachedContextTokenLimit(
      sessionForLimit,
      buildMessagesWithPendingUser(message),
    );
    if (
      !(willExceedLimit || willReachLimit || reachedContextTokenLimit) ||
      messages.value.length === 0
    ) {
      return { aborted: false, uiPerformedSummarization: false };
    }
    const summarizationResult = await chatSummarizer.performUISummarization(
      willReachLimit,
      (val) => (isSending.value = val),
      { allowFewMessages: reachedContextTokenLimit },
    );
    if (!summarizationResult.success) {
      return { aborted: willReachLimit, uiPerformedSummarization: false };
    }
    if (countVisibleMessages(messages.value) + 1 >= MAX_MESSAGES_PER_SESSION) {
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
      id: uuidv4(),
      role: 'user',
      content: message,
      timestamp: Date.now(),
    };
    messages.value.push(userMessage);
    inputMessage.value = '';
    isSending.value = true;
    scrollToBottom();
    const assistantMessageIdRef = { value: uuidv4() };
    messages.value.push({
      id: assistantMessageIdRef.value,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    });
    return { assistantMessageIdRef };
  };

  const buildChatCallbacks = (
    assistantMessageIdRef: { value: string },
    sessionIdForSummary: string | undefined,
  ) => ({
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

  const persistChatResult = (
    chatResult: Awaited<ReturnType<typeof AssistantService.chat>>,
    sessionIdAtSend: string | null,
  ) => {
    // 结果必须写回发起请求时的会话；响应期间用户可能已切到其他会话，
    // 读实时 currentSession 会把 A 会话的摘要/历史写进 B 会话
    const targetSessionId = sessionIdAtSend ?? chatSessionsStore.currentSession?.id ?? null;
    if (!targetSessionId) return;
    const targetSession = chatSessionsStore.sessions.find((s) => s.id === targetSessionId);
    if (!targetSession) return;

    if (chatResult.summary) {
      chatSessionsStore.summarizeAndReset(chatResult.summary, targetSessionId);
    }
    if (chatResult.toolCallTokenOverhead !== undefined) {
      chatSessionsStore.updateToolCallTokenOverhead(
        targetSessionId,
        chatResult.toolCallTokenOverhead,
      );
    }
    // needsReset（服务端摘要重置）后同样要持久化重建的 API 历史，
    // 否则摘要覆盖不到的最近一轮问答会从下一次请求的上下文中消失
    if (chatResult.messageHistory) {
      const apiMessages: ApiMessage[] = chatResult.messageHistory
        .filter((msg) => msg.role !== 'system')
        .map((msg) => ({
          role: msg.role as 'user' | 'assistant' | 'tool',
          content: msg.content ?? null,
          ...pickApiMessageExtras(msg),
        }));
      const serialized = JSON.stringify(apiMessages);
      if (serialized.length <= 512_000) {
        const stillOnSameSession = chatSessionsStore.currentSession?.id === targetSessionId;
        chatSessionsStore.updateApiMessageHistory(
          targetSessionId,
          apiMessages,
          stillOnSameSession ? messages.value.length : targetSession.messages.length,
        );
      } else {
        console.warn(
          `[ChatSending] API 消息历史过大 (${Math.round(serialized.length / 1024)}KB)，跳过保存`,
        );
      }
    }
  };

  /**
   * 流式 chunk 可能因摘要状态或会话切换被丢弃；聊天结束后把最终文本兜底写入助手消息，
   * 保证用户总能看到回复。仅在仍处于发起时的会话时执行。
   */
  const applyFinalTextFallback = (
    chatResult: Awaited<ReturnType<typeof AssistantService.chat>>,
    assistantMessageIdRef: { value: string },
    sessionIdAtSend: string | null,
  ) => {
    const text = chatResult.text?.trim();
    if (!text) return;
    if (sessionIdAtSend && chatSessionsStore.currentSession?.id !== sessionIdAtSend) return;
    const msg = messages.value.find((m) => m.id === assistantMessageIdRef.value);
    if (msg) {
      if (!msg.content || !msg.content.trim()) {
        msg.content = chatResult.text;
      }
    } else {
      // 助手气泡被内部摘要流程移除且未恢复：补一条消息承载最终回复
      messages.value.push({
        id: uuidv4(),
        role: 'assistant',
        content: chatResult.text,
        timestamp: Date.now(),
      });
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

  /** 清理失败/中断后残留的"总结中"气泡，避免永久卡在总结状态 */
  const cleanupStaleSummarizationBubbles = () => {
    for (let i = messages.value.length - 1; i >= 0; i--) {
      const msg = messages.value[i];
      if (msg?.isSummarization && msg.content === SUMMARIZING_MESSAGE_CONTENT) {
        messages.value.splice(i, 1);
      }
    }
  };

  const finalizeChatSend = (
    assistantMessageIdRef: { value: string },
    sessionIdAtSend: string | null,
  ) => {
    isSending.value = false;
    currentTaskId.value = null;
    if (thinkingDisplay.setThinkingActive) {
      thinkingDisplay.setThinkingActive(assistantMessageIdRef.value, false);
    }
    resetInternalSummarization();
    cleanupStaleSummarizationBubbles();
    const sessionAfter = chatSessionsStore.currentSession;
    if (!sessionAfter) return;
    // 会话已切换：messages.value 已被替换成新会话内容，绝不能写回旧会话，也不再触发自动总结
    if (sessionIdAtSend && sessionAfter.id !== sessionIdAtSend) return;
    chatSessionsStore.updateSessionMessages(sessionAfter.id, messages.value);
    const msgsSinceSummary = chatSummarizer.getMessagesSinceSummaryCount(sessionAfter);
    const reachedContextTokenLimit = hasReachedContextTokenLimit(sessionAfter);
    if (msgsSinceSummary >= MESSAGE_LIMIT_THRESHOLD || reachedContextTokenLimit) {
      void chatSummarizer.performUISummarization(false, undefined, {
        allowFewMessages: reachedContextTokenLimit,
      });
    }
  };

  const warnNoAssistantModel = (): void => {
    toast.add({
      severity: 'warn',
      summary: '请选择 AI 模型',
      detail: '请在设置中配置至少一个 AI 模型',
      life: 3000,
    });
  };

  const buildChatRequestOptions = (
    currentSession: ChatSession | null,
    assistantMessageIdRef: { value: string },
    uiPerformedSummarization: boolean,
  ): Parameters<typeof AssistantService.chat>[2] => {
    const sessionId = currentSession?.id ?? null;
    const sessionSummary = currentSession?.summary;
    const messageHistory = buildAssistantMessageHistory(currentSession);
    return {
      ...(sessionSummary ? { sessionSummary } : {}),
      ...(messageHistory ? { messageHistory } : {}),
      ...(sessionId ? { sessionId } : {}),
      ...(uiPerformedSummarization ? { skipTokenLimitSummarization: true } : {}),
      aiProcessingStore,
      ...buildChatCallbacks(assistantMessageIdRef, currentSession?.id),
    };
  };

  // 同步重入守卫：isSending 要到 placeholder 推入后才置 true，
  // 中间的 await 窗口内同一 tick 的重复调用会绕过 isSending 检查
  let sendInFlight = false;

  const sendMessage = async () => {
    const message = inputMessage.value.trim();
    if (!message || isSending.value || sendInFlight) return;
    if (!assistantModel.value) {
      warnNoAssistantModel();
      return;
    }

    sendInFlight = true;
    try {
      const { aborted, uiPerformedSummarization } = await enforceMessageLimitBeforeSend(message);
      if (aborted) return;

      const { assistantMessageIdRef } = pushUserAndAssistantPlaceholder(message);
      const currentSession = chatSessionsStore.currentSession;
      const sessionIdAtSend = currentSession?.id ?? null;

      try {
        resetInternalSummarization();
        const chatResult = await AssistantService.chat(
          assistantModel.value,
          message,
          buildChatRequestOptions(currentSession, assistantMessageIdRef, uiPerformedSummarization),
        );
        applyFinalTextFallback(chatResult, assistantMessageIdRef, sessionIdAtSend);
        persistChatResult(chatResult, sessionIdAtSend);
      } catch (error) {
        handleChatSendError(error, assistantMessageIdRef);
      } finally {
        finalizeChatSend(assistantMessageIdRef, sessionIdAtSend);
      }
    } finally {
      sendInFlight = false;
    }
  };

  return {
    isSending,
    sendMessage,
  };
}
