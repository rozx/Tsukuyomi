import './setup';
import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { useChatSessionsStore, type ChatSessionMessage } from 'src/stores/chat-sessions';
import { useChatSending } from 'src/composables/chat/useChatSending';
import { AssistantService, type AssistantResult } from 'src/services/ai/tasks';
import * as AiContextUtils from 'src/utils/ai-context-utils';
import type { AIModel } from 'src/services/ai/types/ai-model';

const estimateAssistantContextTokensMock = mock(AiContextUtils.estimateAssistantContextTokens);
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
    estimateAssistantContextTokensMock.mockReset();
    assistantChatMock.mockReset();
    assistantChatMock.mockResolvedValue({
      text: 'ok',
      messageHistory: [],
    } satisfies AssistantResult);
    spyOn(AiContextUtils, 'estimateAssistantContextTokens').mockImplementation(
      estimateAssistantContextTokensMock,
    );
    spyOn(AssistantService, 'chat').mockImplementation(assistantChatMock as never);
  });

  afterEach(() => {
    mock.restore();
  });

  it('token 用量超过模型输入窗口时，即使消息数未达阈值也会先触发 UI 总结', async () => {
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
        performUISummarization,
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

    estimateAssistantContextTokensMock.mockReturnValueOnce(1100).mockReturnValue(0);

    await sendMessage();

    expect(performUISummarization).toHaveBeenCalled();
    expect(performUISummarization.mock.calls[0]?.[2]).toEqual({ allowFewMessages: true });
    expect(assistantChatMock).toHaveBeenCalledWith(
      assistantModel.value,
      '继续讨论',
      expect.objectContaining({ skipTokenLimitSummarization: true }),
    );
  });

  it('发送前 token 检查应把当前输入作为 pending user 纳入估算', async () => {
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
        performUISummarization,
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

    estimateAssistantContextTokensMock.mockImplementation(({ currentMessages }) =>
      currentMessages.some(
        (msg: ChatSessionMessage) => msg.content === '这条输入会把上下文推过窗口',
      )
        ? 1100
        : 0,
    );

    await sendMessage();

    expect(performUISummarization).toHaveBeenCalled();
    expect(performUISummarization.mock.calls[0]?.[2]).toEqual({ allowFewMessages: true });
    expect(assistantChatMock).toHaveBeenCalledWith(
      assistantModel.value,
      '这条输入会把上下文推过窗口',
      expect.objectContaining({ skipTokenLimitSummarization: true }),
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
    estimateAssistantContextTokensMock.mockReturnValue(0);

    const { sendMessage } = useChatSending(
      messages,
      inputMessage,
      assistantModel,
      mock(() => {}),
      mock(() => {}),
      {
        performUISummarization,
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
