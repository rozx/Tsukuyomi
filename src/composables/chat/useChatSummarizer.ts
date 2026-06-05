import { ref, type Ref } from 'vue';
import {
  useChatSessionsStore,
  type ChatSessionMessage,
  type ChatSession,
} from 'src/stores/chat-sessions';
import { AssistantService } from 'src/services/ai/tasks';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import {
  buildContextMessagesToSummarize,
  countContextMessagesSinceSummary,
} from 'src/utils/chat-session-context';
import { SUMMARIZING_MESSAGE_CONTENT, SUMMARIZED_MESSAGE_CONTENT } from './constants';

import type { AIModel } from 'src/services/ai/types/ai-model';

export interface UISummarizationOptions {
  allowFewMessages?: boolean;
}

export function useChatSummarizer(
  messages: Ref<ChatSessionMessage[]>,
  assistantModel: Ref<AIModel | undefined>,
  reloadMessages: () => Promise<void>,
  scrollToBottom: () => void,
) {
  const chatSessionsStore = useChatSessionsStore();
  const toast = useToastWithHistory();
  const isSummarizing = ref(false);

  /**
   * 计算距离上次总结的消息数量
   */
  const getMessagesSinceSummaryCount = (session: ChatSession | null): number => {
    return countContextMessagesSinceSummary(session, messages.value);
  };

  /**
   * 构建“需要总结”的消息列表：只取上次总结后的新增消息
   */
  const buildMessagesToSummarize = (
    session: ChatSession,
    allMessages: ChatSessionMessage[],
  ): Array<{ role: 'user' | 'assistant'; content: string }> => {
    return buildContextMessagesToSummarize(session, allMessages);
  };

  /**
   * 执行 UI 层摘要
   * @param willReachLimit - 是否达到该会话的最大消息限制
   * @param updateIsSending - 可选回调，用于更新发送状态（失败时可能需要）
   */
  const hasEnoughMessagesToSummarize = (options: UISummarizationOptions = {}): boolean => {
    const session = chatSessionsStore.currentSession;
    if (!session) return true; // 无会话时不拦截（留给后续逻辑抛错）
    const minimumMessages = options.allowFewMessages ? 1 : 3;
    return buildMessagesToSummarize(session, messages.value).length >= minimumMessages;
  };

  const appendSummarizationBubble = (): string => {
    const summarizationMessageId = (Date.now() - 1).toString();
    messages.value.push({
      id: summarizationMessageId,
      role: 'assistant',
      content: SUMMARIZING_MESSAGE_CONTENT,
      timestamp: Date.now(),
      isSummarization: true,
    });
    const session = chatSessionsStore.currentSession;
    if (session) {
      chatSessionsStore.updateSessionMessages(session.id, messages.value);
    }
    scrollToBottom();
    return summarizationMessageId;
  };

  const markSummarizationCompleted = (
    summarizationMessageId: string,
    currentSessionId: string,
  ): void => {
    const idx = messages.value.findIndex((m) => m.id === summarizationMessageId);
    if (idx < 0) return;
    const existing = messages.value[idx];
    if (!existing) return;
    messages.value[idx] = { ...existing, content: SUMMARIZED_MESSAGE_CONTENT };
    chatSessionsStore.updateSessionMessages(currentSessionId, messages.value);
  };

  const reportSummarizationFailure = (
    error: unknown,
    willReachLimit: boolean,
    updateIsSending?: (val: boolean) => void,
  ): void => {
    console.error('Failed to summarize session:', error);
    toast.add({
      severity: 'error',
      summary: '总结失败',
      detail: error instanceof Error ? error.message : '未知错误',
      life: 5000,
    });
    if (willReachLimit) {
      toast.add({
        severity: 'warn',
        summary: '无法发送消息',
        detail: '会话消息数已达上限，且自动总结失败。请手动创建新会话或清空当前会话。',
        life: 5000,
      });
      if (updateIsSending) updateIsSending(false);
    }
  };

  async function performUISummarization(
    willReachLimit: boolean,
    updateIsSending?: (val: boolean) => void,
    options: UISummarizationOptions = {},
  ): Promise<{ success: boolean }> {
    if (!hasEnoughMessagesToSummarize(options)) {
      if (updateIsSending) updateIsSending(false);
      return { success: false };
    }

    isSummarizing.value = true;
    if (updateIsSending) updateIsSending(true);

    try {
      const summarizationMessageId = appendSummarizationBubble();

      const currentSession = chatSessionsStore.currentSession;
      if (!currentSession) throw new Error('当前会话不存在');
      if (!assistantModel.value) throw new Error('助手模型未配置');

      const summary = await AssistantService.summarizeSession(
        assistantModel.value,
        buildMessagesToSummarize(currentSession, messages.value),
        {
          ...(currentSession.summary ? { previousSummary: currentSession.summary } : {}),
          onChunk: () => {
            // 总结过程中可以显示进度，但这里简化处理
          },
        },
      );

      markSummarizationCompleted(summarizationMessageId, currentSession.id);
      chatSessionsStore.summarizeAndReset(summary);
      await reloadMessages();
      return { success: true };
    } catch (error) {
      reportSummarizationFailure(error, willReachLimit, updateIsSending);
      return { success: false };
    } finally {
      isSummarizing.value = false;
      if (updateIsSending) updateIsSending(false);
    }
  }

  return {
    isSummarizing,
    performUISummarization,
    getMessagesSinceSummaryCount,
  };
}
