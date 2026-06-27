/**
 * 聊天消息列表 / 单条消息条目共享的类型定义。
 *
 * `ChatMessageList.vue` 与 `ChatMessageItem.vue` 原本各自重复声明 `MessageDisplayItem`
 * 接口及一整套 action / grouped-action 的 hover/leave 回调签名。把这些类型集中到这里，
 * 两个组件直接 `import type` 复用，消除重复（行为与渲染结果完全不变）。
 */
import type { ChatSessionMessage, MessageAction } from 'src/stores/chat-sessions';

/** 单条消息拆分出的可渲染条目（正文 / 单个动作 / 分组动作）。 */
export interface MessageDisplayItem {
  type: 'content' | 'action' | 'grouped_action';
  content?: string;
  action?: MessageAction;
  groupedActions?: MessageAction[];
  messageId: string;
  messageRole: 'user' | 'assistant';
  timestamp: number;
}

/** 单个动作徽章的 hover 回调。 */
export type ActionHoverHandler = (
  event: Event,
  action: MessageAction,
  message: ChatSessionMessage,
  popoverKey: string,
) => void;

/** 分组动作徽章的 hover 回调。 */
export type GroupedActionHoverHandler = (
  event: Event,
  actions: MessageAction[],
  message: ChatSessionMessage,
  timestamp: number,
) => void;

/** 渲染单条消息条目所需的公共回调集合（被列表组件透传给每个条目）。 */
export interface MessageItemHandlers {
  renderMarkdown: (text: string) => string;
  formatMessageTime: (timestamp: number) => string;
  getChapterTitleForAction: (chapterId: string | undefined) => string | undefined;
  onActionHover: ActionHoverHandler;
  onActionLeave: () => void;
  onGroupedActionHover: GroupedActionHoverHandler;
  onGroupedActionLeave: () => void;
}

/**
 * `ChatMessageList.vue` 的列表级数据字段（不含逐条目回调）。
 * 供组件 Props 与 `ChatMessageListBindings` 共用，字段只声明一处。
 */
export interface ChatMessageListData {
  messages: ChatSessionMessage[];
  messageDisplayItemsById: Record<string, MessageDisplayItem[]>;
  displayedThinkingProcess: Record<string, string>;
  displayedThinkingPreview: Record<string, string>;
  thinkingExpanded: Map<string, boolean>;
  thinkingActive: Map<string, boolean>;
  setThinkingContentRef: (id: string, el: HTMLElement) => void;
  toggleThinking: (id: string) => void;
}

/**
 * 渲染 `ChatMessageList.vue` 所需的全部 props（列表数据 + 逐条目回调）。
 * 即 `ChatMessageListData & MessageItemHandlers`，与组件 Props 完全一致。
 */
export type ChatMessageListBindings = ChatMessageListData & MessageItemHandlers;
