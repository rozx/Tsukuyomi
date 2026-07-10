import './setup';
import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { useChatSessionsStore, type ChatSessionMessage } from 'src/stores/chat-sessions';
import { useInternalSummarization } from 'src/composables/chat/useInternalSummarization';

describe('useInternalSummarization', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('未经历 handleSummarizingStart 时，handleSummarizingEnd 不应新增消息或改动消息 ID', () => {
    const store = useChatSessionsStore();
    const messages = ref<ChatSessionMessage[]>([
      { id: 'u1', role: 'user', content: '问题', timestamp: 1 },
      { id: 'a1', role: 'assistant', content: '部分回答', timestamp: 2 },
    ]);
    const { handleSummarizingEnd } = useInternalSummarization(messages, mock(() => {}), store);

    const assistantMessageIdRef = { value: 'a1' };
    handleSummarizingEnd(assistantMessageIdRef);

    expect(messages.value.length).toBe(2);
    expect(assistantMessageIdRef.value).toBe('a1');
  });

  it('Start → End 配对时应替换气泡并创建新的助手消息', () => {
    const store = useChatSessionsStore();
    store.createSession({ bookId: null, chapterId: null, paragraphId: null });
    const messages = ref<ChatSessionMessage[]>([
      { id: 'u1', role: 'user', content: '问题', timestamp: 1 },
      { id: 'a1', role: 'assistant', content: '', timestamp: 2 },
    ]);
    const { handleSummarizingStart, handleSummarizingEnd, isSummarizingInternally } =
      useInternalSummarization(messages, mock(() => {}), store);

    const assistantMessageIdRef = { value: 'a1' };
    handleSummarizingStart(assistantMessageIdRef, store.currentSessionId ?? undefined);
    expect(isSummarizingInternally.value).toBe(true);

    handleSummarizingEnd(assistantMessageIdRef);
    expect(isSummarizingInternally.value).toBe(false);
    expect(assistantMessageIdRef.value).not.toBe('a1');
    const newMsg = messages.value.find((m) => m.id === assistantMessageIdRef.value);
    expect(newMsg?.role).toBe('assistant');
  });
});
