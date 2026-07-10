import './setup';
import { afterEach, beforeEach, describe, expect, it, spyOn, mock } from 'bun:test';
import { createPinia, setActivePinia } from 'pinia';
import { useChatSessionsStore } from 'src/stores/chat-sessions';

describe('chatSessions store - 持久化安全性', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  afterEach(() => {
    mock.restore();
  });

  it('保存会话时不应原地重排响应式 sessions 数组', () => {
    const store = useChatSessionsStore();
    const idA = store.createSession({ bookId: 'a', chapterId: null, paragraphId: null });
    const idB = store.createSession({ bookId: 'b', chapterId: null, paragraphId: null });

    // 让 A 的 updatedAt 明确早于 B 的下一次更新
    const sessionA = store.sessions.find((s) => s.id === idA);
    if (sessionA) sessionA.updatedAt = 1;

    // 更新 B 触发保存；保存时的排序只应作用于副本，不应原地重排 store.sessions
    store.updateSessionMessages(idB, [
      { id: 'm1', role: 'user', content: '你好', timestamp: Date.now() },
    ]);
    expect(store.sessions.map((s) => s.id)).toEqual([idA, idB]);
  });

  it('localStorage 配额超限时应缩减保存量重试，而不是静默丢弃全部持久化', () => {
    const store = useChatSessionsStore();
    const idA = store.createSession({ bookId: 'a', chapterId: null, paragraphId: null });

    const storage = globalThis.localStorage;
    const originalSetItem = storage.setItem.bind(storage);
    let failedOnce = false;
    const setItemSpy = spyOn(storage, 'setItem').mockImplementation(
      (key: string, value: string) => {
        if (key === 'tsukuyomi-chat-sessions' && !failedOnce) {
          failedOnce = true;
          throw new DOMException('quota exceeded', 'QuotaExceededError');
        }
        originalSetItem(key, value);
      },
    );

    store.updateSessionMessages(idA, [
      { id: 'm1', role: 'user', content: '触发保存', timestamp: Date.now() },
    ]);

    setItemSpy.mockRestore();

    const stored = localStorage.getItem('tsukuyomi-chat-sessions');
    expect(stored).not.toBeNull();
    expect(stored).toContain('触发保存');
  });
});
