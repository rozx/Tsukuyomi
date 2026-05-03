import './setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';
import { setActivePinia, createPinia } from 'pinia';
import { useChatSessionsStore, type ChatSessionMessage } from 'src/stores/chat-sessions';
import { useContextStore } from 'src/stores/context';
import { useAIProcessingStore } from 'src/stores/ai-processing';
import { useChatSession } from 'src/composables/chat/useChatSession';

/**
 * 反复 flush microtask 队列 + Vue 调度器，
 * 让 watcher 内部 `void createNewSession()` 的 await 链跑完。
 */
const flush = async () => {
  for (let i = 0; i < 6; i++) {
    await Promise.resolve();
    await nextTick();
  }
};

describe('useChatSession - 切换页面时不应丢失会话与书籍关联', () => {
  let scope: ReturnType<typeof effectScope> | null = null;

  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  afterEach(() => {
    scope?.stop();
    scope = null;
    vi.restoreAllMocks();
  });

  it('离开书页（bookId: A → null）时，原会话的 context.bookId 仍应为 A', async () => {
    const chatSessions = useChatSessionsStore();
    const context = useContextStore();
    const aiProcessing = useAIProcessingStore();
    vi.spyOn(aiProcessing, 'stopAllAssistantTasks').mockResolvedValue(undefined);

    context.setCurrentBook('book-A');
    const sessionAId = chatSessions.createSession({
      bookId: 'book-A',
      chapterId: null,
      paragraphId: null,
    });
    chatSessions.addMessageToCurrentSession({
      id: 'msg-1',
      role: 'user',
      content: '你好',
      timestamp: 1000,
    });

    const messages = ref<ChatSessionMessage[]>([
      ...(chatSessions.currentSession?.messages ?? []),
    ]);

    scope = effectScope();
    scope.run(() => useChatSession(messages));
    await flush();

    // 模拟离开书籍页（useBookDetailsPage 路由 watcher 调 clearContext）
    context.clearContext();
    await flush();

    const sessionA = chatSessions.sessions.find((s) => s.id === sessionAId);
    expect(sessionA?.context.bookId).toBe('book-A');
    expect(sessionA?.messages).toEqual([
      expect.objectContaining({ id: 'msg-1', content: '你好' }),
    ]);
  });

  it('离开后再回到同一书籍页时，应能切回之前的会话而不是新建空会话', async () => {
    const chatSessions = useChatSessionsStore();
    const context = useContextStore();
    const aiProcessing = useAIProcessingStore();
    vi.spyOn(aiProcessing, 'stopAllAssistantTasks').mockResolvedValue(undefined);

    context.setCurrentBook('book-A');
    const sessionAId = chatSessions.createSession({
      bookId: 'book-A',
      chapterId: null,
      paragraphId: null,
    });
    chatSessions.addMessageToCurrentSession({
      id: 'msg-1',
      role: 'user',
      content: '你好',
      timestamp: 1000,
    });

    const messages = ref<ChatSessionMessage[]>([
      ...(chatSessions.currentSession?.messages ?? []),
    ]);

    scope = effectScope();
    scope.run(() => useChatSession(messages));
    await flush();

    context.clearContext();
    await flush();

    context.setCurrentBook('book-A');
    await flush();

    expect(chatSessions.currentSessionId).toBe(sessionAId);
  });
});
