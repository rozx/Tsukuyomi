/**
 * 三个 AI 助手聊天面板变体（Desktop / Tablet / Mobile）共享的「派生绑定」聚合器。
 *
 * 之前各变体分别调用 `useChatComposerState` / `useChatActionPopovers` /
 * `useChatMessageListBindings` 三个 helper，并逐字段重复一长串同名实参，本身又
 * 构成重复。这里改成传入**整个** panel 对象（`useChatPanelSetup()` 或
 * `useRightPanel()` 的返回，外加 Desktop 自带的三个 bind 回调），一次性产出
 * 三个绑定，消除实参重复。行为与渲染结果逐字不变。
 */
import { useChatComposerState } from 'src/composables/right-panel/useChatComposerState';
import { useChatActionPopovers } from 'src/composables/right-panel/useChatActionPopovers';
import { useChatMessageListBindings } from 'src/composables/right-panel/useChatMessageListBindings';
import type { ChatActionPopoverBindings } from 'src/composables/right-panel/useChatActionPopovers';
import type {
  ChatMessageListBindings,
  ChatMessageListSource,
} from 'src/composables/right-panel/useChatMessageListBindings';
import type { Ref, ComputedRef } from 'vue';
import type { AIModel } from 'src/services/ai/types/ai-model';
import type { ChatSessionMessage, MessageAction } from 'src/stores/chat-sessions';
import type { ActionDetailsContext } from 'src/utils/action-info-utils';

/**
 * 三个变体的 panel 来源（`useRightPanel` / `useChatPanelSetup`）共有的字段子集，
 * 加上 Desktop 自带的三个 bind 回调。消息列表相关字段直接复用
 * `ChatMessageListSource`，避免与 `useChatMessageListBindings` 重复声明。
 */
interface ChatPanelBindingsSource extends ChatMessageListSource {
  assistantModel: Ref<AIModel | undefined>;
  isSending: Ref<boolean>;
  inputMessage: Ref<string>;
  sendMessage: () => void;
  stopGeneration: () => void;
  hoveredAction: Ref<{ action: MessageAction; message: ChatSessionMessage } | null>;
  hoveredGroupedAction: Ref<{
    actions: MessageAction[];
    message: ChatSessionMessage;
    timestamp: number;
  } | null>;
  actionDetailsContext: ActionDetailsContext;
  handleActionPopoverHide: () => void;
  handleGroupedActionPopoverHide: () => void;
  bindActionPopoverRef: (el: unknown) => void;
  bindGroupedActionPopoverRef: (el: unknown) => void;
}

interface ChatPanelBindingsOptions {
  /** 发送按钮 CSS class 前缀（'cp-send' / 'tcp-send' / 'mc-send'）。 */
  sendClassPrefix: string;
  /** 已配置模型时输入框 placeholder（桌面带换行提示）。 */
  readyPlaceholder: string;
}

export function useChatPanelBindings(
  panel: ChatPanelBindingsSource,
  options: ChatPanelBindingsOptions,
) {
  const composer = useChatComposerState({
    assistantModel: panel.assistantModel,
    isSending: panel.isSending,
    inputMessage: panel.inputMessage,
    sendMessage: panel.sendMessage,
    stopGeneration: panel.stopGeneration,
    sendClassPrefix: options.sendClassPrefix,
    readyPlaceholder: options.readyPlaceholder,
  });

  const actionPopoverBindings: ComputedRef<ChatActionPopoverBindings> = useChatActionPopovers({
    bindGroupedActionPopoverRef: panel.bindGroupedActionPopoverRef,
    bindActionPopoverRef: panel.bindActionPopoverRef,
    hoveredGroupedAction: panel.hoveredGroupedAction,
    hoveredAction: panel.hoveredAction,
    actionDetailsContext: panel.actionDetailsContext,
    handleGroupedActionPopoverHide: panel.handleGroupedActionPopoverHide,
    handleActionPopoverHide: panel.handleActionPopoverHide,
  });

  const messageListBindings: ComputedRef<ChatMessageListBindings> = useChatMessageListBindings({
    messages: panel.messages,
    messageDisplayItemsById: panel.messageDisplayItemsById,
    displayedThinkingProcess: panel.displayedThinkingProcess,
    displayedThinkingPreview: panel.displayedThinkingPreview,
    thinkingExpanded: panel.thinkingExpanded,
    thinkingActive: panel.thinkingActive,
    setThinkingContentRef: panel.setThinkingContentRef,
    toggleThinking: panel.toggleThinking,
    renderMarkdown: panel.renderMarkdown,
    formatMessageTime: panel.formatMessageTime,
    getChapterTitleForAction: panel.getChapterTitleForAction,
    toggleActionPopover: panel.toggleActionPopover,
    handleActionMouseLeave: panel.handleActionMouseLeave,
    toggleGroupedActionPopover: panel.toggleGroupedActionPopover,
    handleGroupedActionMouseLeave: panel.handleGroupedActionMouseLeave,
  });

  return { composer, actionPopoverBindings, messageListBindings };
}
