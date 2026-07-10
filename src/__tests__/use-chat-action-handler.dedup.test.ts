import './setup';
import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import type { ChatSessionMessage, MessageAction } from 'src/stores/chat-sessions';
import { useChatActionHandler } from 'src/composables/chat/useChatActionHandler';
import type { ActionInfo } from 'src/services/ai/tools/types';

describe('useChatActionHandler - action 去重', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  afterEach(() => {
    mock.restore();
  });

  it('同一 action 重复上报时，实时 badge 列表与持久化列表都只保留一条', () => {
    const dateNowSpy = spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);

    const messages = ref<ChatSessionMessage[]>([
      { id: 'a1', role: 'assistant', content: '正在处理', timestamp: 1 },
    ]);
    const currentMessageActions = ref<MessageAction[]>([]);
    const { handleAction } = useChatActionHandler(
      { push: mock(() => Promise.resolve()) } as never,
      { add: mock(() => {}) },
      mock(() => {}),
      mock(() => {}),
      messages,
      currentMessageActions,
      mock(() => {}),
      mock(() => 0),
    );

    // todo 操作不轮换助手气泡、也不清空实时 badge 列表，最能暴露重复 push 问题
    const action: ActionInfo = {
      type: 'read',
      entity: 'todo',
      name: '待办列表',
      data: { name: '待办列表' },
    } as unknown as ActionInfo;

    const assistantMessageIdRef = { value: 'a1' };
    handleAction(action, assistantMessageIdRef);
    handleAction(action, assistantMessageIdRef);

    dateNowSpy.mockRestore();

    const assistantMsg = messages.value.find((m) => m.id === 'a1');
    expect(assistantMsg?.actions?.length ?? 0).toBe(1);
    expect(currentMessageActions.value.length).toBe(1);
  });
});
