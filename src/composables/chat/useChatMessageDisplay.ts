import { computed, type Ref } from 'vue';
import type { ChatMessage, MessageAction } from 'src/stores/chat-sessions';

// 消息显示项类型
export interface MessageDisplayItem {
  type: 'content' | 'action' | 'grouped_action';
  content?: string;
  action?: MessageAction;
  groupedActions?: MessageAction[]; // 用于分组显示的操作（如多个 todo 创建）
  messageId: string;
  messageRole: 'user' | 'assistant';
  timestamp: number;
}

const ACTION_GROUP_TIME_WINDOW = 5000; // 5 秒时间窗口（更宽松，以捕获 AI 连续创建的 todo）

const getMessageDisplayItems = (message: ChatMessage): MessageDisplayItem[] => {
  const items: MessageDisplayItem[] = [];

  // 如果没有操作，直接返回内容
  if (!message.actions || message.actions.length === 0) {
    if (message.content) {
      items.push({
        type: 'content',
        content: message.content,
        messageId: message.id,
        messageRole: message.role,
        timestamp: message.timestamp,
      });
    }
    return items;
  }

  // 按时间戳排序操作，同时保留原始索引用于相同时间戳时的排序
  const actionsWithIndex = message.actions.map((action, index) => ({ action, index }));
  const sortedActions = actionsWithIndex.sort((a, b) => {
    // 首先按时间戳排序
    if (a.action.timestamp !== b.action.timestamp) {
      return a.action.timestamp - b.action.timestamp;
    }
    // 如果时间戳相同，按原始索引排序（保持操作添加的顺序）
    return a.index - b.index;
  });

  // 分组处理 todo 创建操作：将连续创建的 todo（相邻时间戳相差小于时间窗口）合并为一个显示项
  let i = 0;
  while (i < sortedActions.length) {
    const currentAction = sortedActions[i]?.action;
    if (!currentAction) {
      i++;
      continue;
    }

    // 检查是否是 todo 创建操作
    if (currentAction.entity === 'todo' && currentAction.type === 'create') {
      // 收集连续的 todo 创建操作
      const todoGroup: MessageAction[] = [currentAction];
      let j = i + 1;
      let lastAddedTimestamp = currentAction.timestamp; // 追踪最后添加的 todo 的时间戳

      // 查找时间戳相近的后续 todo 创建操作
      while (j < sortedActions.length) {
        const nextAction = sortedActions[j]?.action;
        if (!nextAction) {
          j++;
          continue;
        }
        // 比较与上一个 todo 的时间差，而不是与第一个 todo 的时间差
        // 这样可以正确捕获连续创建的 todo（如 0ms, 800ms, 1600ms 都能被分组）
        const timeDiff = nextAction.timestamp - lastAddedTimestamp;

        // 如果下一个操作也是 todo 创建，且时间戳相差小于时间窗口，则加入分组
        if (
          nextAction.entity === 'todo' &&
          nextAction.type === 'create' &&
          timeDiff < ACTION_GROUP_TIME_WINDOW
        ) {
          todoGroup.push(nextAction);
          lastAddedTimestamp = nextAction.timestamp; // 更新最后添加的时间戳
          j++;
        } else {
          break;
        }
      }

      // 如果只有一个 todo，正常显示；如果有多个，使用分组显示
      const firstTodo = todoGroup[0];
      if (!firstTodo) {
        i++;
        continue;
      }

      if (todoGroup.length === 1) {
        items.push({
          type: 'action',
          action: firstTodo,
          messageId: message.id,
          messageRole: message.role,
          timestamp: firstTodo.timestamp,
        });
      } else {
        // 创建分组操作项，使用第一个操作的时间戳
        items.push({
          type: 'grouped_action',
          groupedActions: todoGroup,
          messageId: message.id,
          messageRole: message.role,
          timestamp: firstTodo.timestamp,
        });
      }

      i = j; // 跳过已处理的操作
    } else {
      // 非 todo 创建操作，正常添加
      items.push({
        type: 'action',
        action: currentAction,
        messageId: message.id,
        messageRole: message.role,
        timestamp: currentAction.timestamp,
      });
      i++;
    }
  }

  // 添加内容（如果有），确保内容始终显示在所有工具调用之后
  if (message.content) {
    // 找到所有操作中的最大时间戳，确保内容的时间戳在所有操作之后
    const maxActionTimestamp =
      sortedActions.length > 0
        ? Math.max(...sortedActions.map((a) => a.action.timestamp))
        : message.timestamp;
    // 使用最大操作时间戳 + 1，确保内容始终在工具调用之后显示
    const contentTimestamp = maxActionTimestamp + 1;

    items.push({
      type: 'content',
      content: message.content,
      messageId: message.id,
      messageRole: message.role,
      timestamp: contentTimestamp,
    });
  }

  // 按时间戳排序，相同时间戳时使用更精确的排序策略
  // 为了更准确地反映实际执行顺序，我们需要考虑操作的执行时间
  // 操作是在流式输出过程中添加的，所以操作的 timestamp 应该反映其实际执行时间
  return items.sort((a, b) => {
    if (a.timestamp !== b.timestamp) {
      return a.timestamp - b.timestamp;
    }
    // 如果时间戳相同，需要更精确的排序：
    // 1. 如果都是操作，保持它们在数组中的顺序（已通过 sortedActions 保证）
    // 2. 如果一个是内容一个是操作，根据操作的实际执行时间来判断
    //    由于操作是在流式输出过程中添加的，如果时间戳相同（可能是精度问题），
    //    我们应该将操作放在内容之后，因为操作发生在消息开始输出之后
    if (a.type === 'action' && b.type === 'action') {
      // 都是操作，保持它们在 sortedActions 中的顺序
      // 由于我们已经按索引排序，这里不需要额外处理
      return 0;
    }
    // 处理内容和操作混合的情况
    // 由于内容的时间戳已经设置为所有操作的最大时间戳 + 1，正常情况下内容应该在所有操作之后
    // 但为了处理可能的边界情况，如果时间戳相同，确保内容始终在操作之后
    if (a.type === 'content' && b.type === 'action') {
      // a 是内容，b 是操作
      // 内容应该始终在操作之后显示
      return 1;
    }
    if (a.type === 'action' && b.type === 'content') {
      // a 是操作，b 是内容
      // 操作应该始终在内容之前显示
      return -1;
    }
    return 0;
  });
};

export const useChatMessageDisplay = (messages: Ref<ChatMessage[]>) => {
  const messageDisplayItemsById = computed<Record<string, MessageDisplayItem[]>>(() => {
    const result: Record<string, MessageDisplayItem[]> = {};
    for (const message of messages.value) {
      result[message.id] = getMessageDisplayItems(message);
    }
    return result;
  });

  return {
    messageDisplayItemsById,
  };
};
