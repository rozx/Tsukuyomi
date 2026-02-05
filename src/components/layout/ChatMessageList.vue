<script setup lang="ts">
import type { ChatMessage, MessageAction } from 'src/stores/chat-sessions';
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
  messages: ChatMessage[];
  messageDisplayItemsById: Record<string, MessageDisplayItem[]>;
  displayedThinkingProcess: Record<string, string>;
  displayedThinkingPreview: Record<string, string>;
  thinkingExpanded: Map<string, boolean>;
  thinkingActive: Map<string, boolean>;
  setThinkingContentRef: (id: string, el: HTMLElement) => void;
  toggleThinking: (id: string) => void;
  renderMarkdown: (text: string) => string;
  formatMessageTime: (timestamp: number) => string;
  getChapterTitleForAction: (chapterId: string | undefined) => string | undefined;
  onActionHover: (
    event: Event,
    action: MessageAction,
    message: ChatMessage,
    popoverKey: string,
  ) => void;
  onActionLeave: () => void;
  onGroupedActionHover: (
    event: Event,
    actions: MessageAction[],
    message: ChatMessage,
    timestamp: number,
  ) => void;
  onGroupedActionLeave: () => void;
}

const props = defineProps<Props>();
</script>

<template>
  <div
    v-if="props.messages.length === 0"
    class="flex flex-col items-center justify-center h-full text-center"
  >
    <i class="pi pi-comments text-4xl text-moon-40 mb-4" />
    <p class="text-sm text-moon-60 mb-2">开始与 AI 助手对话</p>
    <p class="text-xs text-moon-40">助手可以帮你管理术语、角色设定，并提供翻译建议</p>
  </div>
  <div v-else class="flex flex-col gap-4 w-full">
    <template v-for="message in props.messages" :key="message.id">
      <template v-if="!message.isSummaryResponse && !message.isContextMessage">
        <div
          class="flex flex-col gap-2 w-full"
          :class="message.role === 'user' ? 'items-end' : 'items-start'"
        >
          <div
            v-if="
              message.role === 'assistant' &&
              props.displayedThinkingProcess[message.id] &&
              props.displayedThinkingProcess[message.id]?.trim()
            "
            class="rounded-lg px-3 py-2 max-w-[85%] min-w-0 bg-white/3 border border-white/10"
          >
            <button
              class="w-full text-left flex items-center gap-2 text-xs text-moon-70 hover:text-moon-90 transition-colors"
              @click="props.toggleThinking(message.id)"
            >
              <i
                class="text-xs transition-transform"
                :class="
                  props.thinkingExpanded.get(message.id)
                    ? 'pi pi-chevron-down'
                    : 'pi pi-chevron-right'
                "
              />
              <span class="font-medium">思考过程</span>
              <i
                v-if="props.thinkingActive.get(message.id)"
                class="pi pi-spin pi-spinner text-xs ml-auto"
              />
            </button>
            <div
              v-if="props.thinkingExpanded.get(message.id)"
              :ref="(el) => props.setThinkingContentRef(message.id, el as HTMLElement)"
              class="mt-2 text-xs text-moon-60 whitespace-pre-wrap break-words overflow-wrap-anywhere max-h-96 overflow-y-auto thinking-content"
              :data-message-id="message.id"
              style="word-break: break-all; overflow-wrap: anywhere"
            >
              {{ props.displayedThinkingProcess[message.id] }}
            </div>
            <div
              v-else
              class="mt-2 text-xs text-moon-60 whitespace-pre-wrap break-words overflow-wrap-anywhere opacity-70"
              style="
                display: -webkit-box;
                -webkit-line-clamp: 2;
                line-clamp: 2;
                -webkit-box-orient: vertical;
                overflow: hidden;
                word-break: break-all;
                overflow-wrap: anywhere;
              "
            >
              {{
                props.displayedThinkingPreview[message.id] ||
                props.displayedThinkingProcess[message.id]
              }}
            </div>
          </div>
          <template
            v-for="(item, itemIdx) in props.messageDisplayItemsById[message.id] || []"
            :key="`${message.id}-${itemIdx}-${item.timestamp}`"
          >
            <div
              v-if="item.type === 'content' && item.content"
              class="rounded-lg px-3 py-2 max-w-[85%] min-w-0 w-full"
              :class="
                item.messageRole === 'user'
                  ? 'bg-primary-500/20 text-primary-100'
                  : 'bg-white/5 text-moon-90'
              "
            >
              <div
                class="text-sm break-words overflow-wrap-anywhere markdown-content w-full min-w-0"
                v-html="props.renderMarkdown(item.content)"
              ></div>
            </div>
            <div
              v-else-if="item.type === 'grouped_action' && item.groupedActions"
              class="max-w-[85%] min-w-0"
            >
              <div class="flex flex-wrap gap-1.5">
                <div
                  :id="`grouped-action-${item.messageId}-${item.timestamp}`"
                  class="inline-flex items-center gap-2 px-2 py-1 rounded text-xs font-medium transition-all duration-300 cursor-help bg-orange-500/25 text-orange-200 border border-orange-500/40 hover:bg-orange-500/35"
                  @mouseenter="
                    (e) =>
                      props.onGroupedActionHover(e, item.groupedActions!, message, item.timestamp)
                  "
                  @mouseleave="props.onGroupedActionLeave"
                >
                  <i class="text-sm pi pi-list" />
                  <span> 创建 {{ item.groupedActions.length }} 个待办事项 </span>
                </div>
              </div>
            </div>
            <div v-else-if="item.type === 'action' && item.action" class="max-w-[85%] min-w-0">
              <ChatActionBadge
                :action="item.action"
                :message-id="item.messageId"
                :timestamp="item.action.timestamp"
                :popover-key="`${item.messageId}-${item.action.timestamp}-${itemIdx}`"
                :get-chapter-title-for-action="props.getChapterTitleForAction"
                @hover="
                  (e) =>
                    props.onActionHover(
                      e,
                      item.action!,
                      message,
                      `${item.messageId}-${item.action!.timestamp}-${itemIdx}`,
                    )
                "
                @leave="props.onActionLeave"
              />
            </div>
            <span
              v-if="itemIdx === (props.messageDisplayItemsById[message.id]?.length ?? 0) - 1"
              class="text-xs text-moon-40"
            >
              {{ props.formatMessageTime(message.timestamp) }}
            </span>
          </template>
        </div>
      </template>
    </template>
  </div>
</template>

<style scoped>
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
  background-color: rgba(255, 255, 255, 0.1);
  padding: 0.125em 0.25em;
  border-radius: 0.25rem;
  font-family: 'Courier New', monospace;
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

/* 思考过程内容样式 - 确保 URL 正确截断 */
.thinking-content {
  word-break: break-all;
  overflow-wrap: anywhere;
  max-width: 100%;
}
</style>
