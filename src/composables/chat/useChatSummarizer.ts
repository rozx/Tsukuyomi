import { ref, type Ref } from 'vue';
import { useChatSessionsStore, type ChatMessage, type ChatSession } from 'src/stores/chat-sessions';
import { AssistantService } from 'src/services/ai/tasks';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import { SUMMARIZING_MESSAGE_CONTENT, SUMMARIZED_MESSAGE_CONTENT } from './constants';

import type { AIModel } from 'src/services/ai/types/ai-model';

export function useChatSummarizer(
  messages: Ref<ChatMessage[]>,
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
    if (!session) return messages.value.length;
    // session.lastSummarizedMessageIndex should be present in ChatSession interface
    const cutoff = session.lastSummarizedMessageIndex ?? 0;
    return Math.max(0, session.messages.length - cutoff);
  };

  /**
   * 构建“需要总结”的消息列表：只取上次总结后的新增消息
   */
  const buildMessagesToSummarize = (
    session: ChatSession,
    allMessages: ChatMessage[],
  ): Array<{ role: 'user' | 'assistant'; content: string }> => {
    const cutoff = session.lastSummarizedMessageIndex ?? 0;
    return allMessages
      .slice(Math.max(0, cutoff))
      .filter((msg) => !msg.isSummarization && !msg.isSummaryResponse && !msg.isContextMessage)
      .map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));
  };

  /**
   * 执行 UI 层摘要
   * @param willReachLimit - 是否达到该会话的最大消息限制
   * @param updateIsSending - 可选回调，用于更新发送状态（失败时可能需要）
   */
  async function performUISummarization(
    willReachLimit: boolean,
    updateIsSending?: (val: boolean) => void,
  ): Promise<{ success: boolean }> {
    isSummarizing.value = true;
    if (updateIsSending) updateIsSending(true);

    try {
      // 创建总结消息气泡
      const summarizationMessageId = (Date.now() - 1).toString();
      const summarizationMessage: ChatMessage = {
        id: summarizationMessageId,
        role: 'assistant',
        content: SUMMARIZING_MESSAGE_CONTENT,
        timestamp: Date.now(),
        isSummarization: true,
      };
      messages.value.push(summarizationMessage);

      // 更新 store 中的消息历史
      const currentSession = chatSessionsStore.currentSession;
      if (currentSession) {
        chatSessionsStore.updateSessionMessages(currentSession.id, messages.value);
      }
      scrollToBottom();

      if (!currentSession) {
        throw new Error('当前会话不存在');
      }

      // 构建要总结的消息
      const messagesToSummarize = buildMessagesToSummarize(currentSession, messages.value);

      if (!assistantModel.value) {
        throw new Error('助手模型未配置');
      }

      const summary = await AssistantService.summarizeSession(
        assistantModel.value,
        messagesToSummarize,
        {
          ...(currentSession.summary ? { previousSummary: currentSession.summary } : {}),
          onChunk: () => {
            // 总结过程中可以显示进度，但这里简化处理
          },
        },
      );

      // 更新总结消息状态为完成
      const summarizationMsgIndex = messages.value.findIndex(
        (m) => m.id === summarizationMessageId,
      );
      if (summarizationMsgIndex >= 0) {
        const existingMsg = messages.value[summarizationMsgIndex];
        if (existingMsg) {
          messages.value[summarizationMsgIndex] = {
            ...existingMsg,
            content: SUMMARIZED_MESSAGE_CONTENT,
          };
          // 更新 store 中的消息历史
          chatSessionsStore.updateSessionMessages(currentSession.id, messages.value);
        }
      }

      // 保存总结（不清除聊天历史）
      chatSessionsStore.summarizeAndReset(summary);

      // 更新本地消息列表
      await reloadMessages();

      return { success: true };
    } catch (error) {
      console.error('Failed to summarize session:', error);

      toast.add({
        severity: 'error',
        summary: '总结失败',
        detail: error instanceof Error ? error.message : '未知错误',
        life: 5000,
      });

      // 总结失败时，检查是否达到限制
      if (willReachLimit) {
        toast.add({
          severity: 'warn',
          summary: '无法发送消息',
          detail: '会话消息数已达上限，且自动总结失败。请手动创建新会话或清空当前会话。',
          life: 5000,
        });
        if (updateIsSending) updateIsSending(false);
      }

      return { success: false };
    } finally {
      isSummarizing.value = false;
    }
  }

  return {
    isSummarizing,
    performUISummarization,
    getMessagesSinceSummaryCount,
  };
}
