<script setup lang="ts">
/**
 * 单条聊天消息内「内容 / 分组动作 / 动作徽章」三种条目的渲染，以及末尾的时间戳。
 * 从 ChatMessageList 的 v-for 循环体里拆出，降低父模板圈复杂度。
 */
import { computed } from 'vue';
import type { ChatSessionMessage, MessageAction } from 'src/stores/chat-sessions';
import ChatActionBadge from 'src/components/layout/ChatActionBadge.vue';

interface MessageDisplayItem {
  type: 'content' | 'action' | 'grouped_action';
  content?: string;
  action?: MessageAction;
  groupedActions?: MessageAction[];
  messageId: string;
  messageRole: 'user' | 'assistant';
  timestamp: number;
}

interface Props {
  item: MessageDisplayItem;
  message: ChatSessionMessage;
  itemIdx: number;
  itemCount: number;
  renderMarkdown: (text: string) => string;
  formatMessageTime: (timestamp: number) => string;
  getChapterTitleForAction: (chapterId: string | undefined) => string | undefined;
  onActionHover: (
    event: Event,
    action: MessageAction,
    message: ChatSessionMessage,
    popoverKey: string,
  ) => void;
  onActionLeave: () => void;
  onGroupedActionHover: (
    event: Event,
    actions: MessageAction[],
    message: ChatSessionMessage,
    timestamp: number,
  ) => void;
  onGroupedActionLeave: () => void;
}

const props = defineProps<Props>();

const isContent = computed(() => props.item.type === 'content' && !!props.item.content);
const isGroupedAction = computed(
  () => props.item.type === 'grouped_action' && !!props.item.groupedActions,
);
const isAction = computed(() => props.item.type === 'action' && !!props.item.action);
// 末尾时间戳只在最后一条条目后展示
const showTime = computed(() => props.itemIdx === props.itemCount - 1);
const popoverKey = computed(
  () => `${props.item.messageId}-${props.item.action!.timestamp}-${props.itemIdx}`,
);
const bubbleClass = computed(() =>
  props.item.messageRole === 'user'
    ? 'chat-bubble--user bg-tsukuyomi-500/18 text-moon-50 border border-tsukuyomi-500/30'
    : 'chat-bubble--ai bg-white/[0.045] text-moon-90 border border-white/10',
);
</script>

<template>
  <div
    v-if="isContent"
    class="chat-bubble px-3.5 py-2.5 max-w-[85%] min-w-0 w-full leading-relaxed"
    :class="bubbleClass"
  >
    <div
      class="text-sm break-words overflow-wrap-anywhere markdown-content w-full min-w-0"
      v-html="renderMarkdown(item.content!)"
    ></div>
  </div>
  <div v-else-if="isGroupedAction" class="max-w-[85%] min-w-0">
    <div class="flex flex-wrap gap-1.5">
      <div
        :id="`grouped-action-${item.messageId}-${item.timestamp}`"
        class="inline-flex items-center gap-2 px-2 py-1 rounded text-xs font-medium transition-all duration-300 cursor-help bg-orange-500/25 text-orange-200 border border-orange-500/40 hover:bg-orange-500/35"
        @mouseenter="(e) => onGroupedActionHover(e, item.groupedActions!, message, item.timestamp)"
        @mouseleave="onGroupedActionLeave"
      >
        <i class="text-sm pi pi-list" />
        <span> 创建 {{ item.groupedActions!.length }} 个待办事项 </span>
      </div>
    </div>
  </div>
  <div v-else-if="isAction" class="max-w-[85%] min-w-0">
    <ChatActionBadge
      :action="item.action!"
      :message-id="item.messageId"
      :timestamp="item.action!.timestamp"
      :popover-key="popoverKey"
      :get-chapter-title-for-action="getChapterTitleForAction"
      @hover="(e) => onActionHover(e, item.action!, message, popoverKey)"
      @leave="onActionLeave"
    />
  </div>
  <span v-if="showTime" class="text-xs text-moon-40">
    {{ formatMessageTime(message.timestamp) }}
  </span>
</template>
