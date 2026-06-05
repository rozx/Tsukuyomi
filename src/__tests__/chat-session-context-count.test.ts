import './setup';
import { describe, expect, it } from 'vitest';
import type { ChatSession, ChatSessionMessage } from 'src/stores/chat-sessions';
import {
  buildContextMessagesToSummarize,
  countContextMessagesSinceSummary,
} from 'src/utils/chat-session-context';

const makeSession = (overrides: Partial<ChatSession> = {}): ChatSession => ({
  id: 'session-1',
  title: '测试会话',
  messages: [],
  context: { bookId: 'book-1', chapterId: null, paragraphId: null },
  createdAt: 1,
  updatedAt: 1,
  lastSummarizedMessageIndex: 0,
  ...overrides,
});

const makeMessage = (
  id: string,
  role: ChatSessionMessage['role'],
  content: string,
  extra: Partial<ChatSessionMessage> = {},
): ChatSessionMessage => ({
  id,
  role,
  content,
  timestamp: Number(id),
  ...extra,
});

describe('chat session context count', () => {
  it('上下文消息数应按真实 API history 计入 assistant tool-call 和 tool result', () => {
    const session = makeSession({
      messages: [makeMessage('1', 'user', '可见问题'), makeMessage('2', 'assistant', '可见回答')],
      apiMessageHistory: [
        { role: 'user', content: '可见问题' },
        {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'call-1',
              type: 'function',
              function: { name: 'read_chapter', arguments: '{"chapter_id":"c1"}' },
            },
            {
              id: 'call-2',
              type: 'function',
              function: { name: 'search_memories', arguments: '{"query":"月"}' },
            },
          ],
        },
        {
          role: 'tool',
          name: 'read_chapter',
          tool_call_id: 'call-1',
          content: '{"success":true,"content":"章节内容"}',
        },
        {
          role: 'tool',
          name: 'search_memories',
          tool_call_id: 'call-2',
          content: '{"success":true,"memories":[]}',
        },
        { role: 'assistant', content: '基于工具结果回答' },
      ],
    });

    expect(countContextMessagesSinceSummary(session, session.messages)).toBe(6);
  });

  it('摘要输入应把每个工具调用与工具结果压缩成独立 assistant 可总结文本', () => {
    const largeResult = '工具返回内容'.repeat(500);
    const session = makeSession({
      apiMessageHistory: [
        { role: 'user', content: '请读取章节' },
        {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'call-1',
              type: 'function',
              function: { name: 'read_chapter', arguments: '{"chapter_id":"chapter-1"}' },
            },
            {
              id: 'call-2',
              type: 'function',
              function: { name: 'search_memories', arguments: '{"query":"月"}' },
            },
          ],
        },
        {
          role: 'tool',
          name: 'read_chapter',
          tool_call_id: 'call-1',
          content: largeResult,
        },
      ],
    });

    const messagesToSummarize = buildContextMessagesToSummarize(session, []);

    expect(messagesToSummarize).toHaveLength(4);
    expect(messagesToSummarize[1]).toEqual(
      expect.objectContaining({
        role: 'assistant',
        content: expect.stringContaining('工具调用 read_chapter'),
      }),
    );
    expect(messagesToSummarize[2]).toEqual(
      expect.objectContaining({
        role: 'assistant',
        content: expect.stringContaining('工具调用 search_memories'),
      }),
    );
    expect(messagesToSummarize[3]).toEqual(
      expect.objectContaining({
        role: 'assistant',
        content: expect.stringContaining('工具结果 read_chapter'),
      }),
    );
    expect(messagesToSummarize[3]!.content.length).toBeLessThan(1400);
  });

  it('API history 后追加的可见消息应作为增量计入上下文消息数', () => {
    const session = makeSession({
      messages: [makeMessage('1', 'user', '旧问题'), makeMessage('2', 'assistant', '旧回答')],
      apiMessageHistoryVisibleMessageCount: 2,
      apiMessageHistory: [
        { role: 'user', content: '旧问题' },
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
        {
          role: 'tool',
          name: 'read_chapter',
          tool_call_id: 'call-1',
          content: '{"success":true}',
        },
      ],
    } as Partial<ChatSession>);
    const visibleMessages = [...session.messages, makeMessage('3', 'user', '发送中的新问题')];

    expect(countContextMessagesSinceSummary(session, visibleMessages)).toBe(4);
  });

  it('工具调用占位文本不应作为独立摘要消息计数', () => {
    const session = makeSession({
      apiMessageHistory: [
        { role: 'user', content: '请读取章节' },
        {
          role: 'assistant',
          content: '（月詠施术中）',
          tool_calls: [
            {
              id: 'call-1',
              type: 'function',
              function: { name: 'read_chapter', arguments: '{"chapter_id":"chapter-1"}' },
            },
          ],
        },
        {
          role: 'tool',
          name: 'read_chapter',
          tool_call_id: 'call-1',
          content: '{"success":true}',
        },
      ],
    });

    const messagesToSummarize = buildContextMessagesToSummarize(session, []);

    expect(countContextMessagesSinceSummary(session, [])).toBe(3);
    expect(messagesToSummarize).toHaveLength(3);
    expect(messagesToSummarize.map((msg) => msg.content)).not.toContain('（月詠施术中）');
  });
});
