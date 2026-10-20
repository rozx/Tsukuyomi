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

    const messages = ref<ChatSessionMessage[]>([...(chatSessions.currentSession?.messages ?? [])]);

    scope = effectScope();
    scope.run(() => useChatSession(messages));
    await flush();

    // 模拟离开书籍页（useBookDetailsPage 路由 watcher 调 clearContext）
    context.clearContext();
    await flush();

    const sessionA = chatSessions.sessions.find((s) => s.id === sessionAId);
    expect(sessionA?.context.bookId).toBe('book-A');
    expect(sessionA?.messages).toEqual([expect.objectContaining({ id: 'msg-1', content: '你好' })]);
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

    const messages = ref<ChatSessionMessage[]>([...(chatSessions.currentSession?.messages ?? [])]);

    scope = effectScope();
    scope.run(() => useChatSession(messages));
    await flush();

    context.clearContext();
    await flush();

    context.setCurrentBook('book-A');
    await flush();

    expect(chatSessions.currentSessionId).toBe(sessionAId);
  });
  it('新建会话等待停止助手任务期间的上下文变化，不应把旧会话改挂到新书', async () => {
    const chatSessions = useChatSessionsStore();
    const context = useContextStore();
    const aiProcessing = useAIProcessingStore();
    let releaseStop: () => void = () => {};
    vi.spyOn(aiProcessing, 'stopAllAssistantTasks').mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          releaseStop = resolve;
        }),
    );

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

    const messages = ref<ChatSessionMessage[]>([...(chatSessions.currentSession?.messages ?? [])]);

    scope = effectScope();
    scope.run(() => useChatSession(messages));
    await flush();

    // 切到没有会话的书 B：createNewSession 卡在 stopAllAssistantTasks
    context.setCurrentBook('book-B');
    await nextTick();
    // 新书页加载出章节、选中段落（同一本书，走“书籍未变”分支）
    context.setCurrentChapter('ch-1');
    await nextTick();
    context.setSelectedParagraph('p-1');
    await nextTick();

    releaseStop();
    await flush();

    const sessionA = chatSessions.sessions.find((s) => s.id === sessionAId);
    expect(sessionA?.context.bookId).toBe('book-A');
    expect(sessionA?.messages).toEqual([expect.objectContaining({ id: 'msg-1', content: '你好' })]);
    expect(chatSessions.currentSession?.context).toEqual({
      bookId: 'book-B',
      chapterId: 'ch-1',
      paragraphId: 'p-1',
    });

    // 回到书 A 应切回原会话
    context.setCurrentBook('book-A');
    await flush();
    expect(chatSessions.currentSessionId).toBe(sessionAId);
  });

  it('悬停段落不应触发会话上下文写入', async () => {
    const chatSessions = useChatSessionsStore();
    const context = useContextStore();
    const aiProcessing = useAIProcessingStore();
    vi.spyOn(aiProcessing, 'stopAllAssistantTasks').mockResolvedValue(undefined);

    context.setCurrentBook('book-A');
    chatSessions.createSession({ bookId: 'book-A', chapterId: null, paragraphId: null });

    const messages = ref<ChatSessionMessage[]>([]);
    scope = effectScope();
    scope.run(() => useChatSession(messages));
    await flush();

    const updateSpy = vi.spyOn(chatSessions, 'updateCurrentSessionContext');
    context.setHoveredParagraph('p-1');
    await flush();
    context.setHoveredParagraph('p-2');
    await flush();

    expect(updateSpy).not.toHaveBeenCalled();
  });
});
