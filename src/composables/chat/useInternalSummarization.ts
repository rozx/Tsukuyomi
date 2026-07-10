import { ref, type Ref } from 'vue';
import { v4 as uuidv4 } from 'uuid';
import type { ChatSessionMessage } from 'src/stores/chat-sessions';
import type { useChatSessionsStore } from 'src/stores/chat-sessions';
import { SUMMARIZING_MESSAGE_CONTENT } from 'src/composables/chat/constants';

export function useInternalSummarization(
  messages: Ref<ChatSessionMessage[]>,
  scrollToBottom: () => void,
  chatSessionsStore: ReturnType<typeof useChatSessionsStore>,
) {
  const internalSummarizationMessageId = ref<string | null>(null);
  const isSummarizingInternally = ref(false);
  const savedThinkingProcess = ref<string | undefined>(undefined);

  const reset = () => {
    internalSummarizationMessageId.value = null;
    isSummarizingInternally.value = false;
    savedThinkingProcess.value = undefined;
  };

  const handleSummarizingStart = (
    assistantMessageIdRef: { value: string },
    currentSessionId: string | undefined,
  ) => {
    isSummarizingInternally.value = true;

    const assistantMsgIndex = messages.value.findIndex((m) => m.id === assistantMessageIdRef.value);
    if (assistantMsgIndex >= 0) {
      const assistantMsg = messages.value[assistantMsgIndex];
      if (assistantMsg) {
        if (assistantMsg.thinkingProcess) {
          savedThinkingProcess.value = assistantMsg.thinkingProcess;
        }
        messages.value.splice(assistantMsgIndex, 1);
      }
    }

    internalSummarizationMessageId.value = uuidv4();
    const summarizationMessage: ChatSessionMessage = {
      id: internalSummarizationMessageId.value,
      role: 'assistant',
      content: SUMMARIZING_MESSAGE_CONTENT,
      timestamp: Date.now(),
      isSummarization: true,
    };
    messages.value.push(summarizationMessage);

    if (currentSessionId) {
      chatSessionsStore.updateSessionMessages(currentSessionId, messages.value);
    }
    scrollToBottom();
  };

  const handleSummarizingEnd = (assistantMessageIdRef: { value: string }) => {
    // 未经历 handleSummarizingStart（或已结束）时直接忽略，保证 Start/End 严格配对，
    // 避免摘要失败路径重复调用 End 时凭空多出助手消息
    if (!isSummarizingInternally.value) return;

    // 摘要完成，准备接收新的聊天内容
    // 更新摘要消息的显示
    if (internalSummarizationMessageId.value) {
      const summarizationMsgIndex = messages.value.findIndex(
        (m) => m.id === internalSummarizationMessageId.value,
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
    assistantMessageIdRef.value = uuidv4();
    const newAssistantMessage: ChatSessionMessage = {
      id: assistantMessageIdRef.value,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      ...(savedThinkingProcess.value ? { thinkingProcess: savedThinkingProcess.value } : {}),
    };
    messages.value.push(newAssistantMessage);

    // 重置标志，允许接收新的 chunk
    isSummarizingInternally.value = false;
    scrollToBottom();
  };

  return {
    isSummarizingInternally,
    handleSummarizingStart,
    handleSummarizingEnd,
    reset,
  };
}
