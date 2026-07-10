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

const makeAssistantModel = (): AIModel => ({
  id: 'assistant-model',
  name: 'Assistant Model',
  provider: 'openai',
  model: 'test-model',
  temperature: 0.7,
  maxInputTokens: 100000,
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
): ChatSessionMessage => ({ id, role, content, timestamp: 1 });

const makeThinkingDisplay = () => ({
  setThinkingActive: mock(() => {}),
  setDisplayedThinkingImmediatelyIfEmpty: mock(() => {}),
  updateDisplayedThinkingProcess: mock(() => {}),
  markThinkingActive: mock(() => {}),
  thinkingExpanded: ref(new Map<string, boolean>()),
  requestScrollThinkingToBottom: mock(() => {}),
});

const makeSummarizer = (count = 0) => ({
  performUISummarization: mock(() => Promise.resolve({ success: true })),
  getMessagesSinceSummaryCount: mock(() => count),
});

const buildSending = (params: {
  messages: ChatSessionMessage[];
  input: string;
  summarizer?: ReturnType<typeof makeSummarizer>;
}) => {
  const messages = ref<ChatSessionMessage[]>([...params.messages]);
  const inputMessage = ref(params.input);
  const assistantModel = ref<AIModel | undefined>(makeAssistantModel());
  const summarizer = params.summarizer ?? makeSummarizer();
  const sending = useChatSending(
    messages,
    inputMessage,
    assistantModel,
    mock(() => {}),
    mock(() => {}),
    summarizer,
    makeThinkingDisplay(),
    { push: mock(() => {}) } as never,
    { add: mock(() => {}) },
    ref([]),
    mock(() => {}),
    ref(null),
  );
  return { ...sending, messages, inputMessage, summarizer };
};

describe('useChatSending - 持久化与会话安全', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    estimateAssistantContextTokensMock.mockReset();
    estimateAssistantContextTokensMock.mockReturnValue(0);
    assistantChatMock.mockReset();
    assistantChatMock.mockResolvedValue({ text: 'ok', messageHistory: [] } satisfies AssistantResult);
    spyOn(AiContextUtils, 'estimateAssistantContextTokens').mockImplementation(
      estimateAssistantContextTokensMock,
    );
    spyOn(AssistantService, 'chat').mockImplementation(assistantChatMock as never);
  });

  afterEach(() => {
    mock.restore();
  });

  it('needsReset 摘要后仍应持久化重建的 API 消息历史，避免丢失最近一轮对话', async () => {
    const store = useChatSessionsStore();
    store.createSession({ bookId: 'book-1', chapterId: null, paragraphId: null });

    assistantChatMock.mockResolvedValueOnce({
      text: '重试后的回答',
      summary: '重置摘要',
      needsReset: true,
      messageHistory: [
        { role: 'system', content: 'system\n\n## 之前的对话总结\n\n重置摘要' },
        { role: 'user', content: '当前问题' },
        { role: 'assistant', content: '重试后的回答' },
      ],
    } satisfies AssistantResult);

    const { sendMessage } = buildSending({
      messages: [makeMessage('1', 'user', '旧问题'), makeMessage('2', 'assistant', '旧回答')],
      input: '当前问题',
    });

    await sendMessage();

    const session = store.currentSession;
    expect(session?.summary).toBe('重置摘要');
    expect(session?.apiMessageHistory).toEqual([
      { role: 'user', content: '当前问题' },
      { role: 'assistant', content: '重试后的回答' },
    ]);
  });

  it('响应期间切换会话时，结果应写回发起时的会话而不是当前会话', async () => {
    const store = useChatSessionsStore();
    const sessionAId = store.createSession({ bookId: 'book-a', chapterId: null, paragraphId: null });
    const sessionBId = store.createSession({ bookId: 'book-b', chapterId: null, paragraphId: null });
    store.switchToSession(sessionAId);

    assistantChatMock.mockImplementationOnce(() => {
      // 模拟响应期间用户切到会话 B
      store.switchToSession(sessionBId);
      return Promise.resolve({
        text: 'A 的回答',
        summary: 'A 的摘要',
        messageHistory: [
          { role: 'user', content: 'A 的问题' },
          { role: 'assistant', content: 'A 的回答' },
        ],
        toolCallTokenOverhead: 123,
      } satisfies AssistantResult);
    });

    const { sendMessage } = buildSending({
      messages: [makeMessage('1', 'user', '之前的问题'), makeMessage('2', 'assistant', '之前的回答')],
      input: 'A 的问题',
    });

    await sendMessage();

    const sessionA = store.sessions.find((s) => s.id === sessionAId);
    const sessionB = store.sessions.find((s) => s.id === sessionBId);
    expect(sessionB?.summary).toBeUndefined();
    expect(sessionB?.apiMessageHistory).toBeUndefined();
    expect(sessionB?.toolCallTokenOverhead ?? 0).toBe(0);
    expect(sessionA?.summary).toBe('A 的摘要');
    expect(sessionA?.apiMessageHistory).toEqual([
      { role: 'user', content: 'A 的问题' },
      { role: 'assistant', content: 'A 的回答' },
    ]);
    // 切换后不应把 A 的消息数组覆盖进 B
    expect(sessionB?.messages.length).toBe(0);
  });

  it('工具调用导致的膨胀计数不应触发"会话消息数已达上限"的硬中止', async () => {
    const store = useChatSessionsStore();
    store.createSession({ bookId: 'book-1', chapterId: null, paragraphId: null });

    // 上下文计数（含工具调用/结果）远超 200，但可见消息只有 4 条
    const summarizer = makeSummarizer(250);
    const { sendMessage } = buildSending({
      messages: [
        makeMessage('1', 'user', '问题一'),
        makeMessage('2', 'assistant', '回答一'),
        makeMessage('3', 'user', '问题二'),
        makeMessage('4', 'assistant', '回答二'),
      ],
      input: '继续',
      summarizer,
    });

    await sendMessage();

    // 摘要可以触发，但不应硬中止发送
    expect(assistantChatMock).toHaveBeenCalled();
  });

  it('同一 tick 内重复调用 sendMessage 不应重复发送', async () => {
    const store = useChatSessionsStore();
    store.createSession({ bookId: 'book-1', chapterId: null, paragraphId: null });

    const { sendMessage, messages } = buildSending({
      messages: [makeMessage('1', 'user', '旧问题')],
      input: '新问题',
    });

    const p1 = sendMessage();
    const p2 = sendMessage();
    await Promise.all([p1, p2]);

    expect(assistantChatMock).toHaveBeenCalledTimes(1);
    expect(messages.value.filter((m) => m.content === '新问题').length).toBe(1);
  });

  it('流式 chunk 丢失时应把最终回复文本兜底写入助手消息', async () => {
    const store = useChatSessionsStore();
    store.createSession({ bookId: 'book-1', chapterId: null, paragraphId: null });

    // chat 直接返回文本，但从不调用 onChunk（模拟摘要失败后 chunk 被抑制的场景）
    assistantChatMock.mockResolvedValueOnce({
      text: '最终回复文本',
      messageHistory: [],
    } satisfies AssistantResult);

    const { sendMessage, messages } = buildSending({ messages: [], input: '你好' });

    await sendMessage();

    const lastAssistant = [...messages.value].reverse().find((m) => m.role === 'assistant');
    expect(lastAssistant?.content).toBe('最终回复文本');
  });

  it('同一毫秒内创建的消息 ID 不应冲突', async () => {
    const store = useChatSessionsStore();
    store.createSession({ bookId: 'book-1', chapterId: null, paragraphId: null });

    const dateNowSpy = spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);

    const { sendMessage, messages, inputMessage } = buildSending({ messages: [], input: '第一条' });
    await sendMessage();
    inputMessage.value = '第二条';
    await sendMessage();

    dateNowSpy.mockRestore();

    const ids = messages.value.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
