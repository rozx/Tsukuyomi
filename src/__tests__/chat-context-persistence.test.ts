import './setup';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useChatSessionsStore } from '../stores/chat-sessions';
import type { ApiMessage } from '../stores/chat-sessions';
import { createContextAnchor } from '../services/ai/context/measure';
import { buildAssistantMessageHistory } from '../utils/ai-context-utils';

afterEach(() => vi.restoreAllMocks());
const summary = '目标：继续处理。约束：保留角色名。进展：已完成旧任务。下一步：处理后续章节。';
const history: ApiMessage[] = [
  { role: 'user', content: '本轮请求' },
  {
    role: 'assistant',
    content: null,
    tool_calls: [
      {
        id: 'c1',
        type: 'function',
        function: { name: 'read', arguments: '{}' },
        providerMetadata: { google: { thoughtSignature: 'signature' } },
      },
    ],
  },
  { role: 'tool', tool_call_id: 'c1', name: 'read', content: '结果' },
];
const anchor = createContextAnchor(
  { systemPrompt: '提示', tools: [], history, modelKey: 'test' },
  42000,
)!;
function setupSession() {
  const store = useChatSessionsStore();
  const id = store.createSession({ bookId: null, chapterId: null, paragraphId: null });
  store.updateSessionMessages(id, [
    { id: '1', role: 'user', content: '旧请求', timestamp: 1 },
    { id: '2', role: 'assistant', content: '旧回复', timestamp: 2 },
  ]);
  return { store, id };
}

describe('助手上下文原子保存', () => {
  it('摘要、kept 历史、可见索引与锚点同一次落盘，可见原文不变', () => {
    const { store, id } = setupSession();
    const visible = JSON.stringify(store.currentSession?.messages);
    const write = vi.spyOn(localStorage, 'setItem');
    store.saveChatResult(id, { summary, messageHistory: history, contextAnchor: anchor }, 2);
    expect(write).toHaveBeenCalledTimes(1);
    const saved = JSON.parse(localStorage.getItem('tsukuyomi-chat-sessions')!)[0];
    expect(saved).toMatchObject({
      summary,
      apiMessageHistory: history,
      lastSummarizedMessageIndex: 2,
      apiMessageHistoryVisibleMessageCount: 2,
      contextAnchor: anchor,
    });
    expect(JSON.stringify(store.currentSession?.messages)).toBe(visible);
  });
  it('超过 512000 字符的 kept 历史完整保存', () => {
    const { store, id } = setupSession();
    const large: ApiMessage[] = [{ role: 'user', content: 'x'.repeat(520000) }];
    store.saveChatResult(id, { summary, messageHistory: large }, 2);
    expect(
      JSON.parse(localStorage.getItem('tsukuyomi-chat-sessions')!)[0].apiMessageHistory[0].content
        .length,
    ).toBe(520000);
  });
  it('存储失败时保持原摘要、历史、索引与锚点，并抛出可读错误', () => {
    const { store, id } = setupSession();
    store.saveChatResult(
      id,
      {
        summary: '原摘要',
        messageHistory: [{ role: 'user', content: '原历史' }],
        contextAnchor: anchor,
      },
      1,
    );
    const before = JSON.stringify(store.sessions);
    const stored = localStorage.getItem('tsukuyomi-chat-sessions');
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    expect(() => store.saveChatResult(id, { summary, messageHistory: history }, 2)).toThrow('保存');
    expect(JSON.stringify(store.sessions)).toBe(before);
    expect(localStorage.getItem('tsukuyomi-chat-sessions')).toBe(stored);
  });
  it('没有新 usage 时清空锚点，普通回复也通过同一保存入口', () => {
    const { store, id } = setupSession();
    store.saveChatResult(id, { messageHistory: history, contextAnchor: anchor }, 2);
    store.saveChatResult(id, { messageHistory: history }, 2);
    expect(store.currentSession?.contextAnchor).toBeUndefined();
  });
  it('旧会话没有 API 历史时从摘要索引回退，废弃 overhead 不再加载', () => {
    const { store } = setupSession();
    const session = {
      ...store.currentSession!,
      summary,
      lastSummarizedMessageIndex: 1,
      toolCallTokenOverhead: 123456,
    };
    localStorage.setItem('tsukuyomi-chat-sessions', JSON.stringify([session]));
    store.loadSessions();
    expect('toolCallTokenOverhead' in store.currentSession!).toBe(false);
    expect(buildAssistantMessageHistory(store.currentSession)).toEqual([
      { role: 'assistant', content: '旧回复' },
    ]);
  });
});
