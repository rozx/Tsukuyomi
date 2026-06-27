/**
 * `ChatMessageList.vue` 的全部 props 打包成单个对象。三个聊天面板变体
 * （Desktop / Tablet / Mobile）原本逐字重复一段 15 个 prop 的 `<ChatMessageList>`
 * 调用，改成各调一次本 helper、模板里 `v-bind` 一个对象即可，消除重复。
 *
 * 入参字段名与 `useRightPanel()` / `useChatPanelSetup()` 暴露的一致（含
 * action / grouped-action 的 hover/leave 映射），渲染结果与原先逐字不变。
 */
import { computed } from 'vue';
import type { Ref } from 'vue';
import type { ChatSessionMessage } from 'src/stores/chat-sessions';
import type {
  MessageDisplayItem,
  ActionHoverHandler,
  GroupedActionHoverHandler,
  ChatMessageListBindings,
} from 'src/components/layout/chat-message-types';

export type { ChatMessageListBindings };

interface ChatMessageListSource {
  messages: Ref<ChatSessionMessage[]>;
  messageDisplayItemsById: Ref<Record<string, MessageDisplayItem[]>>;
  displayedThinkingProcess: Ref<Record<string, string>>;
  displayedThinkingPreview: Ref<Record<string, string>>;
  thinkingExpanded: Ref<Map<string, boolean>>;
  thinkingActive: Ref<Map<string, boolean>>;
  setThinkingContentRef: (id: string, el: HTMLElement) => void;
  toggleThinking: (id: string) => void;
  renderMarkdown: (text: string) => string;
  formatMessageTime: (timestamp: number) => string;
  getChapterTitleForAction: (chapterId: string | undefined) => string | undefined;
  toggleActionPopover: ActionHoverHandler;
  handleActionMouseLeave: () => void;
  toggleGroupedActionPopover: GroupedActionHoverHandler;
  handleGroupedActionMouseLeave: () => void;
}

export function useChatMessageListBindings(source: ChatMessageListSource) {
  return computed<ChatMessageListBindings>(() => ({
    messages: source.messages.value,
    messageDisplayItemsById: source.messageDisplayItemsById.value,
    displayedThinkingProcess: source.displayedThinkingProcess.value,
    displayedThinkingPreview: source.displayedThinkingPreview.value,
    thinkingExpanded: source.thinkingExpanded.value,
    thinkingActive: source.thinkingActive.value,
    setThinkingContentRef: source.setThinkingContentRef,
    toggleThinking: source.toggleThinking,
    renderMarkdown: source.renderMarkdown,
    formatMessageTime: source.formatMessageTime,
    getChapterTitleForAction: source.getChapterTitleForAction,
    onActionHover: source.toggleActionPopover,
    onActionLeave: source.handleActionMouseLeave,
    onGroupedActionHover: source.toggleGroupedActionPopover,
    onGroupedActionLeave: source.handleGroupedActionMouseLeave,
  }));
}
