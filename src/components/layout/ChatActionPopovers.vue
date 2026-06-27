<script setup lang="ts">
/**
 * 聊天面板尾部的两个动作详情浮层（分组动作 + 单个动作）。三个变体
 * （`AppChatPanelDesktop.vue` / `TabletChatPanel.vue` / `MobileChatSheet.vue`）
 * 原本逐字重复这段标记，抽成共享片段后各变体直接挂载它。
 *
 * `:ref` 回调仍写回 useRightPanel 的同一批 popover ref，所以全部绑定由
 * `useChatActionPopovers` 打包成单个 `bindings` 对象透传，渲染结果逐字不变。
 */
import ChatActionDetailsPopover from 'src/components/layout/ChatActionDetailsPopover.vue';
import ChatGroupedActionPopover from 'src/components/layout/ChatGroupedActionPopover.vue';
import type { ChatActionPopoverBindings } from 'src/composables/right-panel/useChatActionPopovers';

defineProps<{ bindings: ChatActionPopoverBindings }>();
</script>

<template>
  <ChatGroupedActionPopover
    :ref="bindings.bindGroupedActionPopoverRef"
    :actions="bindings.groupedActions"
    @hide="bindings.onGroupedActionPopoverHide"
  />

  <ChatActionDetailsPopover
    :ref="bindings.bindActionPopoverRef"
    :action="bindings.action"
    :context="bindings.actionDetailsContext"
    @hide="bindings.onActionPopoverHide"
  />
</template>
