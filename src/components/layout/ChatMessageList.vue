<script setup lang="ts">
import { computed, watch } from 'vue';
import type { ChatSessionMessage } from 'src/stores/chat-sessions';
import type { ChatMessageListData, MessageItemHandlers } from './chat-message-types';
import AssistantAvatar from 'src/components/layout/AssistantAvatar.vue';
import ChatMessageThinking from 'src/components/layout/ChatMessageThinking.vue';
import ChatMessageItem from 'src/components/layout/ChatMessageItem.vue';
import { useThinkingPhrase } from 'src/composables/chat/useThinkingPhrase';

// Props = 列表数据 + 逐条目回调，字段定义集中在 chat-message-types，避免与
// ChatMessageListBindings 重复声明同一批字段。
interface Props extends ChatMessageListData, MessageItemHandlers {}

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

/* 注：聊天气泡（.chat-bubble*）、Markdown 内容（.markdown-content 及其 :deep 子规则）
 * 已迁移至 ChatMessageItem.vue；思考过程（.thinking-content）已迁移至 ChatMessageThinking.vue
 * —— 这些类渲染在子组件内部嵌套元素，父级 scoped 样式无法命中。本文件仅保留自身模板用到的样式。 */
</style>
