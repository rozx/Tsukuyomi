import './setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';
import { setActivePinia, createPinia } from 'pinia';
import { useChatSessionsStore, type ChatSessionMessage } from 'src/stores/chat-sessions';
import { useAIProcessingStore } from 'src/stores/ai-processing';
import { useChatSession } from 'src/composables/chat/useChatSession';

describe('useChatSession - 节流落盘的会话绑定', () => {
  let scope: ReturnType<typeof effectScope> | null = null;

  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    vi.useFakeTimers();
  });

  afterEach(() => {
    scope?.stop();
    scope = null;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('trailing flush 应写回排程时的会话，而不是切换后的当前会话', async () => {
    const chatSessions = useChatSessionsStore();
    const aiProcessing = useAIProcessingStore();
    vi.spyOn(aiProcessing, 'stopAllAssistantTasks').mockResolvedValue(undefined);

    const sessionAId = chatSessions.createSession({
      bookId: null,
      chapterId: null,
      paragraphId: null,
    });
    const sessionBId = chatSessions.createSession({
      bookId: null,
      chapterId: null,
      paragraphId: null,
    });
    chatSessions.switchToSession(sessionAId);

    const messages = ref<ChatSessionMessage[]>([]);
    scope = effectScope();
    scope.run(() => {
      useChatSession(messages);
    });
    await nextTick();

    // 第一次修改：占用 throttle 的立即执行窗口
    messages.value.push({ id: 'm0', role: 'user', content: '第一条', timestamp: 1 });
    await nextTick();

    // 第二次修改：进入 trailing 窗口（此时消息属于会话 A）
    messages.value.push({ id: 'm1', role: 'user', content: 'A 的流式内容', timestamp: 2 });
    await nextTick();

    // 切到会话 B，随后 trailing flush 触发
    chatSessions.switchToSession(sessionBId);
    await nextTick();
    vi.advanceTimersByTime(300);
    await nextTick();

    const sessionA = chatSessions.sessions.find((s) => s.id === sessionAId);
    const sessionB = chatSessions.sessions.find((s) => s.id === sessionBId);
    expect(sessionB?.messages.map((m) => m.content)).not.toContain('A 的流式内容');
    expect(sessionA?.messages.map((m) => m.content)).toContain('A 的流式内容');
  });
});
