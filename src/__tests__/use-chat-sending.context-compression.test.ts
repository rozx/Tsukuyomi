import './setup';
import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { useChatSessionsStore, type ChatSessionMessage } from 'src/stores/chat-sessions';
import { useChatSending } from 'src/composables/chat/useChatSending';
import { AssistantService, type AssistantResult } from 'src/services/ai/tasks';
import type { AIModel } from 'src/services/ai/types/ai-model';

const assistantChatMock = mock(() =>
  Promise.resolve({ text: 'ok', messageHistory: [] } as AssistantResult),
);

const makePerformUISummarization = () =>
  mock(
    (
      _force: boolean,
      _stateSetter?: (val: boolean) => void,
      _options?: { allowFewMessages?: boolean },
    ) => Promise.resolve({ success: true }),
  );

const makeAssistantModel = (): AIModel => ({
  id: 'assistant-model',
  name: 'Assistant Model',
  provider: 'openai',
  model: 'test-model',
  temperature: 0.7,
  maxInputTokens: 1000,
  maxOutputTokens: 200,
  apiKey: 'test-key',
  baseUrl: 'https://example.test',
  isDefault: {
    translation: { enabled: false, temperature: 0.7 },
    proofreading: { enabled: false, temperature: 0.7 },
    termsTranslation: { enabled: false, temperature: 0.7 },
    assistant: { enabled: true, temperature: 0.7 },
  },
  enabled: true,
  lastEdited: new Date('2026-01-01T00:00:00Z'),
});

const makeMessage = (
  id: string,
  role: ChatSessionMessage['role'],
  content: string,
): ChatSessionMessage => ({
  id,
  role,
  content,
  timestamp: Number(id),
});

const makeThinkingDisplay = () => ({
  setThinkingActive: mock(() => {}),
  setDisplayedThinkingImmediatelyIfEmpty: mock(() => {}),
  updateDisplayedThinkingProcess: mock(() => {}),
  markThinkingActive: mock(() => {}),
  thinkingExpanded: ref(new Map<string, boolean>()),
  requestScrollThinkingToBottom: mock(() => {}),
});

describe('useChatSending - assistant 上下文压缩触发', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    assistantChatMock.mockReset();
    assistantChatMock.mockResolvedValue({
      text: 'ok',
      messageHistory: [],
    } satisfies AssistantResult);
    spyOn(AssistantService, 'chat').mockImplementation(assistantChatMock as never);
  });

  afterEach(() => {
    mock.restore();
  });

  it('token 用量很高时 UI 仍把完整历史交给助手服务统一处理', async () => {
    const chatSessionsStore = useChatSessionsStore();
    const sessionId = chatSessionsStore.createSession({
      bookId: 'book-1',
      chapterId: null,
      paragraphId: null,
    });
    const initialMessages = [
      makeMessage('1', 'user', '第一轮问题'),
      makeMessage('2', 'assistant', '第一轮回答'),
      makeMessage('3', 'user', '第二轮问题'),
      makeMessage('4', 'assistant', '第二轮回答'),
    ];
    chatSessionsStore.updateSessionMessages(sessionId, initialMessages);

    const messages = ref<ChatSessionMessage[]>([...initialMessages]);
    const inputMessage = ref('继续讨论');
    const assistantModel = ref<AIModel | undefined>(makeAssistantModel());
    const performUISummarization = makePerformUISummarization();

    const { sendMessage } = useChatSending(
      messages,
      inputMessage,
      assistantModel,
      mock(() => {}),
      mock(() => {}),
      {
        getMessagesSinceSummaryCount: (session) =>
          session ? session.messages.length - session.lastSummarizedMessageIndex : 0,
      },
      makeThinkingDisplay(),
      { push: mock(() => {}) } as never,
      { add: mock(() => {}) },
      ref([]),
      mock(() => {}),
      ref(null),
    );

    await sendMessage();

    expect(performUISummarization).not.toHaveBeenCalled();
    expect(assistantChatMock).toHaveBeenCalledWith(
      assistantModel.value,
      '继续讨论',
      expect.objectContaining({
        messageHistory: initialMessages.map(({ role, content }) => ({ role, content })),
      }),
    );
  });

  it('当前输入原样传给服务，UI 不独立执行摘要或设置跳过标记', async () => {
    const chatSessionsStore = useChatSessionsStore();
    const sessionId = chatSessionsStore.createSession({
      bookId: 'book-1',
      chapterId: null,
      paragraphId: null,
    });
    const initialMessages = [
      makeMessage('1', 'user', '旧问题'),
      makeMessage('2', 'assistant', '旧回答'),
    ];
    chatSessionsStore.updateSessionMessages(sessionId, initialMessages);

    const messages = ref<ChatSessionMessage[]>([...initialMessages]);
    const inputMessage = ref('这条输入会把上下文推过窗口');
    const assistantModel = ref<AIModel | undefined>(makeAssistantModel());
    const performUISummarization = makePerformUISummarization();

    const { sendMessage } = useChatSending(
      messages,
      inputMessage,
      assistantModel,
      mock(() => {}),
      mock(() => {}),
      {
        getMessagesSinceSummaryCount: (session) =>
          session ? session.messages.length - session.lastSummarizedMessageIndex : 0,
      },
      makeThinkingDisplay(),
      { push: mock(() => {}) } as never,
      { add: mock(() => {}) },
      ref([]),
      mock(() => {}),
      ref(null),
    );

    await sendMessage();

    expect(performUISummarization).not.toHaveBeenCalled();
    expect(assistantChatMock).toHaveBeenCalledWith(
      assistantModel.value,
      '这条输入会把上下文推过窗口',
      expect.objectContaining({
        messageHistory: initialMessages.map(({ role, content }) => ({ role, content })),
      }),
    );
  });

  it('循环内 summary 返回后应持久化 session summary，并保存去掉 system 的 API tail', async () => {
    const chatSessionsStore = useChatSessionsStore();
    chatSessionsStore.createSession({
      bookId: 'book-1',
      chapterId: null,
      paragraphId: null,
    });

    const messages = ref<ChatSessionMessage[]>([]);
    const inputMessage = ref('请读取大量资料');
    const assistantModel = ref<AIModel | undefined>(makeAssistantModel());
    const performUISummarization = makePerformUISummarization();

    assistantChatMock.mockResolvedValueOnce({
      text: '已完成',
      summary: '循环内摘要',
      messageHistory: [
        { role: 'system', content: 'system\n\n## 之前的对话总结\n\n循环内摘要' },
        { role: 'user', content: '请读取大量资料' },
        { role: 'assistant', content: '已完成' },
      ],
    } satisfies AssistantResult);

    const { sendMessage } = useChatSending(
      messages,
      inputMessage,
      assistantModel,
      mock(() => {}),
      mock(() => {}),
      {
        getMessagesSinceSummaryCount: () => 0,
      },
      makeThinkingDisplay(),
      { push: mock(() => {}) } as never,
      { add: mock(() => {}) },
      ref([]),
      mock(() => {}),
      ref(null),
    );

    await sendMessage();

    const session = chatSessionsStore.currentSession;
    expect(session?.summary).toBe('循环内摘要');
    expect(session?.apiMessageHistory).toEqual([
      { role: 'user', content: '请读取大量资料' },
      { role: 'assistant', content: '已完成' },
    ]);
    expect(session?.apiMessageHistoryVisibleMessageCount).toBe(2);
  });
});
