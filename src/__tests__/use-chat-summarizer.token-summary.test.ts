import './setup';
import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { useChatSessionsStore, type ChatSessionMessage } from 'src/stores/chat-sessions';
import { useChatSummarizer } from 'src/composables/chat/useChatSummarizer';
import { AssistantService } from 'src/services/ai/tasks';
import * as useToastHistory from 'src/composables/useToastHistory';
import type { AIModel } from 'src/services/ai/types/ai-model';

const summarizeSessionMock = mock(() => Promise.resolve('少量大消息摘要'));

const mockUseToastWithHistory = mock(() => ({
  add: mock(() => {}),
  remove: mock(() => {}),
  removeGroup: mock(() => {}),
  removeAllGroups: mock(() => {}),
}));

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

describe('useChatSummarizer - token 触发摘要', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    summarizeSessionMock.mockReset();
    summarizeSessionMock.mockResolvedValue('少量大消息摘要');
    spyOn(AssistantService, 'summarizeSession').mockImplementation(summarizeSessionMock as never);
    spyOn(useToastHistory, 'useToastWithHistory').mockImplementation(mockUseToastWithHistory);
  });

  afterEach(() => {
    mock.restore();
  });

  it('token 触发时应允许少于 3 条消息进入 UI summary', async () => {
    const chatSessionsStore = useChatSessionsStore();
    const sessionId = chatSessionsStore.createSession({
      bookId: 'book-1',
      chapterId: null,
      paragraphId: null,
    });
    const initialMessages = [
      makeMessage('1', 'user', '超大问题'),
      makeMessage('2', 'assistant', '超大回答'),
    ];
    chatSessionsStore.updateSessionMessages(sessionId, initialMessages);

    const messages = ref<ChatSessionMessage[]>([...initialMessages]);
    const summarizer = useChatSummarizer(
      messages,
      ref<AIModel | undefined>(makeAssistantModel()),
      mock(() => Promise.resolve()),
      mock(() => {}),
    );
    const performForTokenLimit = summarizer.performUISummarization as (
      willReachLimit: boolean,
      updateIsSending?: (val: boolean) => void,
      options?: { allowFewMessages?: boolean },
    ) => Promise<{ success: boolean }>;

    const result = await performForTokenLimit(false, undefined, { allowFewMessages: true });

    expect(result.success).toBe(true);
    expect(summarizeSessionMock).toHaveBeenCalledWith(
      expect.anything(),
      [
        { role: 'user', content: '超大问题' },
        { role: 'assistant', content: '超大回答' },
      ],
      expect.anything(),
    );
  });
});
