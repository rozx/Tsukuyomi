import './setup';
import { beforeEach, describe, expect, it } from 'bun:test';
import { createPinia, setActivePinia } from 'pinia';
import { estimateAssistantContextTokens } from 'src/utils/ai-context-utils';
import type { ChatSession } from 'src/stores/chat-sessions';

const makeSession = (overrides: Partial<ChatSession> = {}): ChatSession => ({
  id: 'session-1',
  title: '测试会话',
  messages: [
    { id: '1', role: 'user', content: '请读取章节', timestamp: 1 },
    { id: '2', role: 'assistant', content: '好的，已读取。', timestamp: 2 },
  ],
  context: { bookId: null, chapterId: null, paragraphId: null },
  createdAt: 1,
  updatedAt: 1,
  lastSummarizedMessageIndex: 0,
  ...overrides,
});

const baseParams = (session: ChatSession) => ({
  context: { currentBookId: null, currentChapterId: null, selectedParagraphId: null },
  session,
  currentMessages: session.messages,
  includeToolSchemas: false,
});

describe('estimateAssistantContextTokens - 工具开销不应重复计算', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('apiMessageHistory 已包含工具内容时，不应再叠加 toolCallTokenOverhead', () => {
    const apiMessageHistory: ChatSession['apiMessageHistory'] = [
      { role: 'user', content: '请读取章节' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call-1',
            type: 'function',
            function: { name: 'read_chapter', arguments: '{"chapter_id":"c1"}' },
          },
        ],
      },
      { role: 'tool', name: 'read_chapter', tool_call_id: 'call-1', content: '章节内容'.repeat(200) },
      { role: 'assistant', content: '好的，已读取。' },
    ];

    const withOverhead = estimateAssistantContextTokens(
      baseParams(makeSession({ apiMessageHistory, toolCallTokenOverhead: 5000 })),
    );
    const withoutOverhead = estimateAssistantContextTokens(
      baseParams(makeSession({ apiMessageHistory, toolCallTokenOverhead: 0 })),
    );

    expect(withOverhead).toBe(withoutOverhead);
  });

  it('没有 apiMessageHistory（UI 回退历史）时，toolCallTokenOverhead 仍应计入', () => {
    const withOverhead = estimateAssistantContextTokens(
      baseParams(makeSession({ toolCallTokenOverhead: 5000 })),
    );
    const withoutOverhead = estimateAssistantContextTokens(
      baseParams(makeSession({ toolCallTokenOverhead: 0 })),
    );

    expect(withOverhead).toBe(withoutOverhead + 5000);
  });
});
