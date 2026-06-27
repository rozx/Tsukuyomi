<script setup lang="ts">
import { computed, watch } from 'vue';
import type { ChatSessionMessage, MessageAction } from 'src/stores/chat-sessions';
import AssistantAvatar from 'src/components/layout/AssistantAvatar.vue';
import ChatMessageThinking from 'src/components/layout/ChatMessageThinking.vue';
import ChatMessageItem from 'src/components/layout/ChatMessageItem.vue';
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

// 以下方法把原先模板里的 && / 三元 / .get() === true 判断搬到 script，压低模板圈复杂度
const shouldRenderMessage = (message: ChatSessionMessage): boolean =>
  !message.isSummaryResponse &&
  !message.isContextMessage &&
  (!!message.content ||
    !!message.thinkingProcess ||
    (props.messageDisplayItemsById[message.id]?.length ?? 0) > 0);

const isMessageThinking = (id: string): boolean => props.thinkingActive.get(id) === true;

const messageAlignClass = (role: 'user' | 'assistant'): string =>
  role === 'user' ? 'items-end' : 'items-start';

const itemCountFor = (id: string): number => props.messageDisplayItemsById[id]?.length ?? 0;
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
      <template v-if="shouldRenderMessage(message)">
        <div class="flex w-full gap-2 items-start">
          <AssistantAvatar
            v-if="message.role === 'assistant'"
            :size="32"
            :pulse="isMessageThinking(message.id)"
            :glowing="isMessageThinking(message.id)"
            class="mt-1"
          />
          <div class="flex flex-col gap-2 min-w-0 flex-1" :class="messageAlignClass(message.role)">
            <ChatMessageThinking
              :message="message"
              :displayed-thinking-process="props.displayedThinkingProcess"
              :displayed-thinking-preview="props.displayedThinkingPreview"
              :thinking-expanded="props.thinkingExpanded"
              :thinking-active="props.thinkingActive"
              :thinking-phrase="getThinkingPhrase(message.id)"
              :toggle-thinking="props.toggleThinking"
              :set-thinking-content-ref="props.setThinkingContentRef"
            />
            <template
              v-for="(item, itemIdx) in props.messageDisplayItemsById[message.id] || []"
              :key="`${message.id}-${itemIdx}-${item.timestamp}`"
            >
              <ChatMessageItem
                :item="item"
                :message="message"
                :item-idx="itemIdx"
                :item-count="itemCountFor(message.id)"
                :render-markdown="props.renderMarkdown"
                :format-message-time="props.formatMessageTime"
                :get-chapter-title-for-action="props.getChapterTitleForAction"
                :on-action-hover="props.onActionHover"
                :on-action-leave="props.onActionLeave"
                :on-grouped-action-hover="props.onGroupedActionHover"
                :on-grouped-action-leave="props.onGroupedActionLeave"
              />
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
