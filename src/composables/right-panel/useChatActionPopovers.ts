/**
 * 聊天面板尾部「分组动作 + 单个动作」两个浮层（`ChatActionPopovers.vue`）所需的
 * 全部绑定，集中成一个对象。三个变体（Desktop / Tablet / Mobile）原本在模板里
 * 各自重复 7 行 prop 绑定，改成各调一次本 helper、传一个 `:bindings` 即可，消除重复。
 *
 * Desktop 走 `useRightPanel()`、Tablet/Mobile 走 `useChatPanelSetup()`，两者暴露的
 * 字段名一致，故这里用结构化入参兼容两条来源（行为与渲染结果逐字不变）。
 */
import { computed } from 'vue';
import type { Ref } from 'vue';
import type { MessageAction, ChatSessionMessage } from 'src/stores/chat-sessions';
import type { ActionDetailsContext } from 'src/utils/action-info-utils';

interface ChatActionPopoverSource {
  bindGroupedActionPopoverRef: (el: unknown) => void;
  bindActionPopoverRef: (el: unknown) => void;
  hoveredGroupedAction: Ref<{
    actions: MessageAction[];
    message: ChatSessionMessage;
    timestamp: number;
  } | null>;
  hoveredAction: Ref<{ action: MessageAction; message: ChatSessionMessage } | null>;
  actionDetailsContext: ActionDetailsContext;
  handleGroupedActionPopoverHide: () => void;
  handleActionPopoverHide: () => void;
}

/** 渲染 `ChatActionPopovers.vue` 所需的全部 props。 */
export interface ChatActionPopoverBindings {
  bindGroupedActionPopoverRef: (el: unknown) => void;
  groupedActions: MessageAction[] | null;
  onGroupedActionPopoverHide: () => void;
  bindActionPopoverRef: (el: unknown) => void;
  action: MessageAction | null;
  actionDetailsContext: ActionDetailsContext;
  onActionPopoverHide: () => void;
}

export function useChatActionPopovers(source: ChatActionPopoverSource) {
  return computed<ChatActionPopoverBindings>(() => ({
    bindGroupedActionPopoverRef: source.bindGroupedActionPopoverRef,
    groupedActions: source.hoveredGroupedAction.value?.actions || null,
    onGroupedActionPopoverHide: source.handleGroupedActionPopoverHide,
    bindActionPopoverRef: source.bindActionPopoverRef,
    action: source.hoveredAction.value?.action || null,
    actionDetailsContext: source.actionDetailsContext,
    onActionPopoverHide: source.handleActionPopoverHide,
  }));
}
