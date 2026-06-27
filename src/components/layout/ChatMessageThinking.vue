<script setup lang="ts">
/**
 * 单条聊天消息里的「思考过程」折叠区块。从 ChatMessageList 拆出，
 * 把 chevron / 文案 / spinner 等 v-if 与三元收进子组件，降低父模板圈复杂度。
 */
import { computed } from 'vue';
import type { ChatSessionMessage } from 'src/stores/chat-sessions';

interface Props {
  message: ChatSessionMessage;
  displayedThinkingProcess: Record<string, string>;
  displayedThinkingPreview: Record<string, string>;
  thinkingExpanded: Map<string, boolean>;
  thinkingActive: Map<string, boolean>;
  thinkingPhrase: string;
  toggleThinking: (id: string) => void;
  setThinkingContentRef: (id: string, el: HTMLElement) => void;
}

const props = defineProps<Props>();

const showBlock = computed(
  () =>
    props.message.role === 'assistant' &&
    !!props.displayedThinkingProcess[props.message.id]?.trim(),
);
const isActive = computed(() => props.thinkingActive.get(props.message.id) === true);
const isExpanded = computed(() => props.thinkingExpanded.get(props.message.id) === true);
const chevronIcon = computed(() =>
  isExpanded.value ? 'pi pi-chevron-down' : 'pi pi-chevron-right',
);
const labelText = computed(() => (isActive.value ? props.thinkingPhrase : '思考过程'));
const thinkingContent = computed(() => props.displayedThinkingProcess[props.message.id] ?? '');
const previewContent = computed(
  () => props.displayedThinkingPreview[props.message.id] || thinkingContent.value,
);
</script>

<template>
  <div
    v-if="showBlock"
    class="rounded-lg px-3 py-2 max-w-[85%] min-w-0 bg-white/3 border border-white/10"
  >
    <button
      class="w-full text-left flex items-center gap-2 text-xs text-moon-70 hover:text-moon-90 transition-colors"
      @click="toggleThinking(message.id)"
    >
      <i class="text-xs transition-transform" :class="chevronIcon" />
      <span class="font-medium">{{ labelText }}</span>
      <i v-if="isActive" class="pi pi-spin pi-spinner text-xs ml-auto" />
    </button>
    <div
      v-if="isExpanded"
      :ref="(el) => setThinkingContentRef(message.id, el as HTMLElement)"
      class="mt-2 text-xs text-moon-60 whitespace-pre-wrap break-words overflow-wrap-anywhere max-h-96 overflow-y-auto thinking-content"
      :data-message-id="message.id"
      style="word-break: break-all; overflow-wrap: anywhere"
    >
      {{ thinkingContent }}
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
      {{ previewContent }}
    </div>
  </div>
</template>

<style scoped>
/* 思考过程内容样式 - 确保 URL 正确截断。
 * 注：从 ChatMessageList.vue 迁移而来 —— 列表把思考区块抽成本组件后，
 * 父级 scoped 样式无法命中子组件内部的 .thinking-content（仅子组件根元素继承父级 scope）。 */
.thinking-content {
  word-break: break-all;
  overflow-wrap: anywhere;
  max-width: 100%;
}
</style>
