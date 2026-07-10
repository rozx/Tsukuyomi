<script setup lang="ts">
/**
 * 单条聊天消息内「内容 / 分组动作 / 动作徽章」三种条目的渲染，以及末尾的时间戳。
 * 从 ChatMessageList 的 v-for 循环体里拆出，降低父模板圈复杂度。
 */
import { computed } from 'vue';
import type { ChatSessionMessage } from 'src/stores/chat-sessions';
import type { MessageDisplayItem, MessageItemHandlers } from './chat-message-types';
import ChatActionBadge from 'src/components/layout/ChatActionBadge.vue';
import { useThrottledMarkdown } from 'src/composables/chat/useMarkdownRenderer';

interface Props extends MessageItemHandlers {
  item: MessageDisplayItem;
  message: ChatSessionMessage;
  itemIdx: number;
  itemCount: number;
}

const props = defineProps<Props>();

const isContent = computed(() => props.item.type === 'content' && !!props.item.content);
// 流式输出时节流渲染 Markdown（120ms），避免每个 token 都全量重解析整条消息；
// trailing 渲染保证流结束后最终内容与完整文本一致
const renderedContent = useThrottledMarkdown(
  () => (props.item.type === 'content' ? (props.item.content ?? '') : ''),
  (text) => props.renderMarkdown(text),
);
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
      v-html="renderedContent"
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

<style scoped>
/* 聊天气泡与 Markdown 内容样式。
 * 注：这些样式从 ChatMessageList.vue 迁移而来 —— 列表把单条消息抽成本组件后，
 * 父级 scoped 样式无法穿透到子组件内部嵌套元素（仅子组件根元素继承父级 scope），
 * 导致 .chat-bubble / .markdown-content 等丢失样式。样式应与其消费的模板同处一个组件作用域。 */

/* 设计系统：聊天气泡——AI 左上拐角 4px，User 右上拐角 4px，保留气泡"尾巴"感 */
.chat-bubble {
  border-radius: 14px;
  transition: background-color 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.chat-bubble--ai {
  border-top-left-radius: 4px;
}

.chat-bubble--user {
  border-top-right-radius: 4px;
}

/* Markdown 内容样式 */
.markdown-content {
  line-height: 1.6;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  word-wrap: break-word;
  overflow-wrap: break-word;
  word-break: break-word;
}

.markdown-content :deep(p) {
  margin: 0.5em 0;
  word-wrap: break-word;
  overflow-wrap: break-word;
  word-break: break-word;
  max-width: 100%;
  min-width: 0;
}

.markdown-content :deep(p:first-child) {
  margin-top: 0;
}

.markdown-content :deep(p:last-child) {
  margin-bottom: 0;
}

.markdown-content :deep(strong) {
  font-weight: 600;
  color: inherit;
}

.markdown-content :deep(em) {
  font-style: italic;
}

.markdown-content :deep(code) {
  /* 设计系统：行内代码—薄藍色调 + JetBrains Mono */
  background-color: rgba(109, 136, 168, 0.12);
  color: #A3B7CF;
  padding: 0.125em 0.4em;
  border-radius: 6px;
  font-family: 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace;
  font-size: 0.9em;
  word-wrap: break-word;
  overflow-wrap: break-word;
  word-break: break-all;
  max-width: 100%;
  display: inline-block;
}

.markdown-content :deep(pre) {
  background-color: rgba(0, 0, 0, 0.3);
  padding: 0.75em;
  border-radius: 0.5rem;
  overflow-x: auto;
  margin: 0.75em 0;
  max-width: 100%;
  width: 100%;
  min-width: 0;
  word-wrap: break-word;
  overflow-wrap: break-word;
  word-break: break-word;
}

.markdown-content :deep(pre code) {
  background-color: transparent;
  padding: 0;
  border-radius: 0;
  word-wrap: break-word;
  overflow-wrap: break-word;
  word-break: break-word;
  white-space: pre-wrap;
  max-width: 100%;
  display: block;
}

.markdown-content :deep(ul),
.markdown-content :deep(ol) {
  margin: 0.75em 0;
  padding-left: 1.5em;
  max-width: 100%;
  min-width: 0;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

.markdown-content :deep(ul:first-child),
.markdown-content :deep(ol:first-child) {
  margin-top: 0;
}

.markdown-content :deep(ul:last-child),
.markdown-content :deep(ol:last-child) {
  margin-bottom: 0;
}

.markdown-content :deep(li) {
  margin: 0.4em 0;
  line-height: 1.5;
  word-wrap: break-word;
  overflow-wrap: break-word;
  word-break: break-word;
  max-width: 100%;
  min-width: 0;
}

.markdown-content :deep(li:first-child) {
  margin-top: 0;
}

.markdown-content :deep(li:last-child) {
  margin-bottom: 0;
}

.markdown-content :deep(blockquote) {
  border-left: 3px solid rgba(255, 255, 255, 0.3);
  padding-left: 1em;
  margin: 0.75em 0;
  opacity: 0.8;
  word-wrap: break-word;
  overflow-wrap: break-word;
  word-break: break-word;
  max-width: 100%;
  min-width: 0;
}

.markdown-content :deep(table) {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  border-collapse: collapse;
  word-wrap: break-word;
  overflow-wrap: break-word;
  table-layout: fixed;
}

.markdown-content :deep(table td),
.markdown-content :deep(table th) {
  word-wrap: break-word;
  overflow-wrap: break-word;
  word-break: break-word;
  max-width: 100%;
  min-width: 0;
}

.markdown-content :deep(a) {
  color: var(--primary-400);
  text-decoration: underline;
  word-wrap: break-word;
  overflow-wrap: break-word;
  word-break: break-all;
  max-width: 100%;
}

.markdown-content :deep(a:hover) {
  color: var(--primary-300);
}

.markdown-content :deep(h1),
.markdown-content :deep(h2),
.markdown-content :deep(h3),
.markdown-content :deep(h4),
.markdown-content :deep(h5),
.markdown-content :deep(h6) {
  font-weight: 600;
  margin: 0.75em 0 0.5em 0;
  word-wrap: break-word;
  overflow-wrap: break-word;
  word-break: break-word;
  max-width: 100%;
  min-width: 0;
}

.markdown-content :deep(h1:first-child),
.markdown-content :deep(h2:first-child),
.markdown-content :deep(h3:first-child),
.markdown-content :deep(h4:first-child),
.markdown-content :deep(h5:first-child),
.markdown-content :deep(h6:first-child) {
  margin-top: 0;
}

.markdown-content :deep(hr) {
  border: none;
  border-top: 1px solid rgba(255, 255, 255, 0.2);
  margin: 1em 0;
}
</style>
