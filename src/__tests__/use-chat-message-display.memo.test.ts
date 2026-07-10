/**
 * useChatMessageDisplay 逐消息缓存回归测试：
 * 流式输出时每个 token 只应重建发生变化的那条消息的显示条目，
 * 其余消息的条目数组必须保持引用不变（避免整表重建 + 子组件全量重渲染）。
 */
import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import type { ChatSessionMessage, MessageAction } from 'src/stores/chat-sessions';
import { useChatMessageDisplay } from 'src/composables/chat/useChatMessageDisplay';

function makeMessage(
  id: string,
  content: string,
  actions?: MessageAction[],
): ChatSessionMessage {
  const msg: ChatSessionMessage = {
    id,
    role: 'assistant',
    content,
    timestamp: 1000,
  };
  if (actions) msg.actions = actions;
  return msg;
}

describe('useChatMessageDisplay 逐消息缓存', () => {
  it('只有内容变化的消息被重建，其他消息条目引用不变', () => {
    const messages = ref<ChatSessionMessage[]>([
      makeMessage('m1', '第一条消息'),
      makeMessage('m2', '第二条'),
    ]);
    const { messageDisplayItemsById } = useChatMessageDisplay(messages);

    const before = messageDisplayItemsById.value;
    expect(before['m1']).toHaveLength(1);
    expect(before['m2']).toHaveLength(1);

    // 模拟流式追加：只有 m2 的内容变化
    messages.value[1]!.content += ' 新 token';
    const after = messageDisplayItemsById.value;

    // m1 未变化：条目数组必须是同一个引用（缓存命中）
    expect(after['m1']).toBe(before['m1']);
    // m2 变化：重建且内容更新
    expect(after['m2']).not.toBe(before['m2']);
    expect(after['m2']![0]!.content).toBe('第二条 新 token');
  });

  it('actions 数量变化时对应消息重建', () => {
    const action: MessageAction = {
      type: 'update',
      entity: 'translation',
      timestamp: 1500,
      paragraph_id: 'p1',
    };
    const messages = ref<ChatSessionMessage[]>([
      makeMessage('m1', '内容', [action]),
      makeMessage('m2', '另一条'),
    ]);
    const { messageDisplayItemsById } = useChatMessageDisplay(messages);

    const before = messageDisplayItemsById.value;
    expect(before['m1']).toHaveLength(2);

    // 向 m1 原地 push 一个新 action（数组引用不变，长度变化）
    messages.value[0]!.actions!.push({
      type: 'read',
      entity: 'chapter',
      timestamp: 1600,
      chapter_title: '第一章',
    });
    const after = messageDisplayItemsById.value;

    expect(after['m1']).not.toBe(before['m1']);
    expect(after['m1']!.filter((i) => i.type === 'action')).toHaveLength(2);
    expect(after['m2']).toBe(before['m2']);
  });

  it('内容长度相同但字符不同也必须重建（不允许长度伪键导致陈旧内容）', () => {
    const messages = ref<ChatSessionMessage[]>([makeMessage('m1', 'abc')]);
    const { messageDisplayItemsById } = useChatMessageDisplay(messages);
    const before = messageDisplayItemsById.value;
    expect(before['m1']![0]!.content).toBe('abc');

    messages.value[0]!.content = 'xyz';
    const after = messageDisplayItemsById.value;
    expect(after['m1']![0]!.content).toBe('xyz');
  });

  it('消息被移除后重新加入同 id 消息时输出正确', () => {
    const messages = ref<ChatSessionMessage[]>([makeMessage('m1', '旧内容')]);
    const { messageDisplayItemsById } = useChatMessageDisplay(messages);
    expect(messageDisplayItemsById.value['m1']![0]!.content).toBe('旧内容');

    messages.value = [];
    expect(messageDisplayItemsById.value['m1']).toBeUndefined();

    messages.value = [makeMessage('m1', '新内容')];
    expect(messageDisplayItemsById.value['m1']![0]!.content).toBe('新内容');
  });
});
