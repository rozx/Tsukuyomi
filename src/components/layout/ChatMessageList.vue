<script setup lang="ts">
import { computed, watch } from 'vue';
import type { ChatSessionMessage, MessageAction } from 'src/stores/chat-sessions';
import ChatActionBadge from 'src/components/layout/ChatActionBadge.vue';
import AssistantAvatar from 'src/components/layout/AssistantAvatar.vue';
import { useThinkingPhrase } from 'src/composables/chat/useThinkingPhrase';

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
  messages: ChatSessionMessage[];
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

// 思考态文案：每条助手消息一旦进入活跃思考态，就锁定一句池中文案不再随机切换。
const thinkingPhrasesById = new Map<string, string>();
const { pickPhrase, currentPhrase: fallbackPhrase } = useThinkingPhrase();

const getThinkingPhrase = (messageId: string): string => {
  const cached = thinkingPhrasesById.get(messageId);
  if (cached) return cached;
  // 兜底：未抽过时返回当前 fallback；首条消息进入活跃态时由 watcher 抽取并锁定。
  return fallbackPhrase.value;
};

const activeThinkingIds = computed(() => {
  const ids: string[] = [];
  props.thinkingActive.forEach((isActive, id) => {
    if (isActive) ids.push(id);
  });
  return ids;
});

watch(activeThinkingIds, (ids) => {
  for (const id of ids) {
    if (!thinkingPhrasesById.has(id)) {
      thinkingPhrasesById.set(id, pickPhrase());
    }
  }
});
</script>

<template>
  <div
    v-if="props.messages.length === 0"
    class="flex flex-col items-center justify-center h-full text-center px-6"
  >
    <AssistantAvatar :size="128" glowing class="mb-5" />
    <p class="empty-hero-title text-moon-90 mb-2">妾身月詠，于此恭候</p>
    <p class="text-xs text-moon-50">可问翻译、术语、章节诸事</p>
  </div>
  <div v-else class="flex flex-col gap-4 w-full">
    <template v-for="message in props.messages" :key="message.id">
      <template
        v-if="
          !message.isSummaryResponse &&
          !message.isContextMessage &&
          (message.content ||
            message.thinkingProcess ||
            (props.messageDisplayItemsById[message.id]?.length ?? 0) > 0)
        "
      >
        <div class="flex w-full gap-2 items-start">
          <AssistantAvatar
            v-if="message.role === 'assistant'"
            :size="32"
            :pulse="props.thinkingActive.get(message.id) === true"
            :glowing="props.thinkingActive.get(message.id) === true"
            class="mt-1"
          />
          <div
            class="flex flex-col gap-2 min-w-0 flex-1"
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
              <span class="font-medium">{{
                props.thinkingActive.get(message.id) ? getThinkingPhrase(message.id) : '思考过程'
              }}</span>
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
              class="chat-bubble px-3.5 py-2.5 max-w-[85%] min-w-0 w-full leading-relaxed"
              :class="
                item.messageRole === 'user'
                  ? 'chat-bubble--user bg-tsukuyomi-500/18 text-moon-50 border border-tsukuyomi-500/30'
                  : 'chat-bubble--ai bg-white/[0.045] text-moon-90 border border-white/10'
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
        </div>
      </template>
    </template>
  </div>
</template>

<style scoped>
/* 空状态 hero 标题：serif 字体 + 字距，烘托月詠的学者气质 */
.empty-hero-title {
  font-family: 'Noto Serif JP', 'Songti SC', 'Noto Serif SC', serif;
  font-size: 1.05rem;
  letter-spacing: 0.16em;
  font-weight: 500;
}

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

/* 思考过程内容样式 - 确保 URL 正确截断 */
.thinking-content {
  word-break: break-all;
  overflow-wrap: anywhere;
  max-width: 100%;
}
</style>
