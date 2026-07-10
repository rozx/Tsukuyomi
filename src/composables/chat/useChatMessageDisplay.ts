import { computed, type Ref } from 'vue';
import type { ChatSessionMessage, MessageAction } from 'src/stores/chat-sessions';

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

function sortActionsByTimestampAndIndex(actions: MessageAction[]): MessageAction[] {
  return actions
    .map((action, index) => ({ action, index }))
    .sort((a, b) => {
      if (a.action.timestamp !== b.action.timestamp) {
        return a.action.timestamp - b.action.timestamp;
      }
      return a.index - b.index;
    })
    .map((item) => item.action);
}

function isTodoCreate(action: MessageAction): boolean {
  return action.entity === 'todo' && action.type === 'create';
}

function collectTodoCreateGroup(
  sortedActions: MessageAction[],
  startIndex: number,
): { group: MessageAction[]; nextIndex: number } {
  const group: MessageAction[] = [sortedActions[startIndex]!];
  let j = startIndex + 1;
  let lastAddedTimestamp = group[0]!.timestamp;

  while (j < sortedActions.length) {
    const next = sortedActions[j];
    if (!next) {
      j++;
      continue;
    }
    const timeDiff = next.timestamp - lastAddedTimestamp;
    if (!isTodoCreate(next) || timeDiff >= ACTION_GROUP_TIME_WINDOW) break;
    group.push(next);
    lastAddedTimestamp = next.timestamp;
    j++;
  }
  return { group, nextIndex: j };
}

function buildActionItems(
  sortedActions: MessageAction[],
  message: ChatSessionMessage,
): MessageDisplayItem[] {
  const items: MessageDisplayItem[] = [];
  let i = 0;
  while (i < sortedActions.length) {
    const currentAction = sortedActions[i];
    if (!currentAction) {
      i++;
      continue;
    }

    if (isTodoCreate(currentAction)) {
      const { group, nextIndex } = collectTodoCreateGroup(sortedActions, i);
      const first = group[0]!;
      items.push(
        group.length === 1
          ? {
              type: 'action',
              action: first,
              messageId: message.id,
              messageRole: message.role,
              timestamp: first.timestamp,
            }
          : {
              type: 'grouped_action',
              groupedActions: group,
              messageId: message.id,
              messageRole: message.role,
              timestamp: first.timestamp,
            },
      );
      i = nextIndex;
      continue;
    }

    items.push({
      type: 'action',
      action: currentAction,
      messageId: message.id,
      messageRole: message.role,
      timestamp: currentAction.timestamp,
    });
    i++;
  }
  return items;
}

function buildTrailingContentItem(
  message: ChatSessionMessage,
  sortedActions: MessageAction[],
): MessageDisplayItem | null {
  if (!message.content) return null;
  const maxActionTimestamp =
    sortedActions.length > 0
      ? Math.max(...sortedActions.map((a) => a.timestamp))
      : message.timestamp;
  return {
    type: 'content',
    content: message.content,
    messageId: message.id,
    messageRole: message.role,
    timestamp: maxActionTimestamp + 1,
  };
}

function compareDisplayItems(a: MessageDisplayItem, b: MessageDisplayItem): number {
  if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
  if (a.type === 'content' && b.type === 'action') return 1;
  if (a.type === 'action' && b.type === 'content') return -1;
  return 0;
}

const getMessageDisplayItems = (message: ChatSessionMessage): MessageDisplayItem[] => {
  if (!message.actions || message.actions.length === 0) {
    if (!message.content) return [];
    return [
      {
        type: 'content',
        content: message.content,
        messageId: message.id,
        messageRole: message.role,
        timestamp: message.timestamp,
      },
    ];
  }

  const sortedActions = sortActionsByTimestampAndIndex(message.actions);
  const items = buildActionItems(sortedActions, message);
  const trailing = buildTrailingContentItem(message, sortedActions);
  if (trailing) items.push(trailing);
  return items.sort(compareDisplayItems);
};

// 逐消息缓存条目：content 引用与 actions 数量都未变时直接复用上次的条目数组
interface DisplayCacheEntry {
  content: string;
  actionsLength: number;
  items: MessageDisplayItem[];
}

export const useChatMessageDisplay = (messages: Ref<ChatSessionMessage[]>) => {
  // 逐消息缓存：流式输出时每个 token 只有一条消息在变化，
  // 只重建变化的那条，其余消息的条目数组保持引用不变，避免整表重建。
  const displayCache = new Map<string, DisplayCacheEntry>();

  const messageDisplayItemsById = computed<Record<string, MessageDisplayItem[]>>(() => {
    const result: Record<string, MessageDisplayItem[]> = {};
    const seenIds = new Set<string>();
    for (const message of messages.value) {
      seenIds.add(message.id);
      const actionsLength = message.actions?.length ?? 0;
      const cached = displayCache.get(message.id);
      if (cached && cached.content === message.content && cached.actionsLength === actionsLength) {
        result[message.id] = cached.items;
        continue;
      }
      const items = getMessageDisplayItems(message);
      displayCache.set(message.id, { content: message.content, actionsLength, items });
      result[message.id] = items;
    }
    // 清理已从列表移除的消息缓存，防止 Map 无界增长
    for (const id of displayCache.keys()) {
      if (!seenIds.has(id)) displayCache.delete(id);
    }
    return result;
  });

  return {
    messageDisplayItemsById,
  };
};
