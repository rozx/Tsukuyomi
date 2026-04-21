/**
 * Mobile / Tablet 两个 AI 助手聊天面板变体（`MobileChatSheet.vue`、
 * `TabletChatPanel.vue`）共享的 `<script setup>` 样板。
 *
 * 两处都从 `useRightPanel()` 解构同一批字段（约 40 个），并各自重复定义
 * 三个 `bindXxxRef` helper。把这些逻辑集中到这里，变体文件只需要一行
 * `const chat = useChatPanelSetup()` 即可。
 *
 * 注意：这里只做样板抽取，不改动 `useRightPanel()` 的公共接口，Desktop
 * 变体仍直接调用 `useRightPanel()`。
 */
import { useRightPanel } from 'src/composables/right-panel/useRightPanel';

export function useChatPanelSetup() {
  const panel = useRightPanel();

  // 模板里通过 :ref 回调写入的三个 popover 引用。PrimeVue 实例类型复杂，
  // 这里保持和原始变体文件里一致的 unknown → 目标 ref 类型断言。
  const bindSessionListRef = (el: unknown) => {
    panel.sessionListPopoverRef.value =
      el as typeof panel.sessionListPopoverRef.value;
  };
  const bindActionPopoverRef = (el: unknown) => {
    panel.actionPopoverRef.value = el as typeof panel.actionPopoverRef.value;
  };
  const bindGroupedActionPopoverRef = (el: unknown) => {
    panel.groupedActionPopoverRef.value =
      el as typeof panel.groupedActionPopoverRef.value;
  };

  return {
    // 结构化解构：和两个变体原本展开的字段一一对应，保持模板引用不变。
    chatSessionsStore: panel.chatSessionsStore,
    panelContainerRef: panel.panelContainerRef,
    messagesContainerRef: panel.messagesContainerRef,
    sessionListPopoverRef: panel.sessionListPopoverRef,
    actionPopoverRef: panel.actionPopoverRef,
    groupedActionPopoverRef: panel.groupedActionPopoverRef,
    logoPath: panel.logoPath,
    messages: panel.messages,
    inputMessage: panel.inputMessage,
    messageDisplayItemsById: panel.messageDisplayItemsById,
    isSending: panel.isSending,
    sendMessage: panel.sendMessage,
    stopGeneration: panel.stopGeneration,
    recentSessions: panel.recentSessions,
    switchToSession: panel.switchToSession,
    toggleSessionListPopover: panel.toggleSessionListPopover,
    hideSessionListPopover: panel.hideSessionListPopover,
    createNewSession: panel.createNewSession,
    thinkingExpanded: panel.thinkingExpanded,
    displayedThinkingProcess: panel.displayedThinkingProcess,
    displayedThinkingPreview: panel.displayedThinkingPreview,
    thinkingActive: panel.thinkingActive,
    setThinkingContentRef: panel.setThinkingContentRef,
    toggleThinking: panel.toggleThinking,
    assistantModel: panel.assistantModel,
    getChapterTitleForAction: panel.getChapterTitleForAction,
    renderMarkdown: panel.renderMarkdown,
    formatMessageTime: panel.formatMessageTime,
    hoveredAction: panel.hoveredAction,
    hoveredGroupedAction: panel.hoveredGroupedAction,
    actionDetailsContext: panel.actionDetailsContext,
    toggleActionPopover: panel.toggleActionPopover,
    handleActionMouseLeave: panel.handleActionMouseLeave,
    handleActionPopoverHide: panel.handleActionPopoverHide,
    toggleGroupedActionPopover: panel.toggleGroupedActionPopover,
    handleGroupedActionMouseLeave: panel.handleGroupedActionMouseLeave,
    handleGroupedActionPopoverHide: panel.handleGroupedActionPopoverHide,

    // 共享的三个 ref 绑定回调
    bindSessionListRef,
    bindActionPopoverRef,
    bindGroupedActionPopoverRef,
  };
}
