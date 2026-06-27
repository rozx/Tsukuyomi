<script setup lang="ts">
import { computed } from 'vue';
import type { Component } from 'vue';
import type { MessageAction } from 'src/stores/chat-sessions';
import { ACTION_LABELS, ENTITY_LABELS } from 'src/utils/action-info-utils';
import ChatBadgeSimple from 'src/components/layout/chat-badge/ChatBadgeSimple.vue';
import ChatBadgeAsk from 'src/components/layout/chat-badge/ChatBadgeAsk.vue';
import ChatBadgeReadValue from 'src/components/layout/chat-badge/ChatBadgeReadValue.vue';
import ChatBadgeReadInfo from 'src/components/layout/chat-badge/ChatBadgeReadInfo.vue';
import ChatBadgeTranslation from 'src/components/layout/chat-badge/ChatBadgeTranslation.vue';
import ChatBadgeNavigate from 'src/components/layout/chat-badge/ChatBadgeNavigate.vue';
import ChatBadgeReadSearch from 'src/components/layout/chat-badge/ChatBadgeReadSearch.vue';
import ChatBadgeReadSearchKw from 'src/components/layout/chat-badge/ChatBadgeReadSearchKw.vue';
import ChatBadgeFindParagraph from 'src/components/layout/chat-badge/ChatBadgeFindParagraph.vue';

type MessageActionWithAllProperties = MessageAction & {
  replaced_paragraph_count?: number;
  replaced_translation_count?: number;
  old_translation?: string;
  new_translation?: string;
  old_title?: string;
  new_title?: string;
  translation_keywords?: string[];
};

interface Props {
  action: MessageAction;
  messageId: string;
  timestamp: number;
  popoverKey: string;
  getChapterTitleForAction: (chapterId: string | undefined) => string | undefined;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  hover: [event: Event];
  leave: [];
}>();

// 将 action 断言为带扩展属性的类型,避免模板中大量重复的强制类型转换
const extAction = computed(() => props.action as MessageActionWithAllProperties);

const actionId = computed(() => `action-${props.messageId}-${props.timestamp}`);

// 徽章配色：todo 实体单独使用橙色；其余按 action.type 查表
const ACTION_CLASS_TODO =
  'bg-orange-500/25 text-orange-200 border border-orange-500/40 hover:bg-orange-500/35';
const ACTION_CLASS_BY_TYPE: Record<string, string> = {
  create: 'bg-green-500/25 text-green-200 border border-green-500/40 hover:bg-green-500/35',
  update: 'bg-blue-500/25 text-blue-200 border border-blue-500/40 hover:bg-blue-500/35',
  delete: 'bg-red-500/25 text-red-200 border border-red-500/40 hover:bg-red-500/35',
  web_search: 'bg-purple-500/25 text-purple-200 border border-purple-500/40 hover:bg-purple-500/35',
  search: 'bg-fuchsia-500/25 text-fuchsia-200 border border-fuchsia-500/40 hover:bg-fuchsia-500/35',
  web_fetch: 'bg-cyan-500/25 text-cyan-200 border border-cyan-500/40 hover:bg-cyan-500/35',
  read: 'bg-yellow-500/25 text-yellow-200 border border-yellow-500/40 hover:bg-yellow-500/35',
  navigate: 'bg-indigo-500/25 text-indigo-200 border border-indigo-500/40 hover:bg-indigo-500/35',
  ask: 'bg-teal-500/25 text-teal-200 border border-teal-500/40 hover:bg-teal-500/35',
};

const actionClass = computed(() => {
  if (props.action.entity === 'todo') return ACTION_CLASS_TODO;
  return ACTION_CLASS_BY_TYPE[props.action.type] ?? '';
});

// 徽章图标：web_search / search 共用搜索图标
const ACTION_ICON_BY_TYPE: Record<string, string> = {
  create: 'pi pi-plus-circle',
  update: 'pi pi-pencil',
  delete: 'pi pi-trash',
  web_search: 'pi pi-search',
  search: 'pi pi-search',
  web_fetch: 'pi pi-link',
  read: 'pi pi-eye',
  navigate: 'pi pi-arrow-right',
  ask: 'pi pi-question-circle',
};

const actionIconClass = computed(() => {
  if (props.action.entity === 'todo') return 'pi pi-list';
  return ACTION_ICON_BY_TYPE[props.action.type] ?? '';
});

const getShortId = (value: string | undefined, length = 8): string => {
  if (!value) return '';
  return value.substring(0, length);
};

const getTextPreview = (value: string | undefined, maxLength = 20): string => {
  if (!value) return '';
  return value.length > maxLength ? `${value.substring(0, maxLength)}...` : value;
};

// 细节渲染分派：原先模板里 ~35 路 v-if/v-else-if 链。改为有序规则表，按原顺序
// 取第一个命中的 kind；命中不到返回 'none'。每条 test 都是简单合取，避免大 if 链。
type ExtActionLike = MessageActionWithAllProperties;
interface DetailKindRule {
  kind: string;
  test: (a: MessageAction, e: ExtActionLike) => boolean;
}
const DETAIL_KIND_RULES: readonly DetailKindRule[] = [
  { kind: 'ask_user', test: (a) => a.type === 'ask' && a.tool_name === 'ask_user' && !!a.question },
  {
    kind: 'ask_user_batch',
    test: (a) => a.type === 'ask' && a.tool_name === 'ask_user_batch' && !!a.batch_questions,
  },
  { kind: 'read_get_term', test: (a) => a.type === 'read' && a.tool_name === 'get_term' && !!a.name },
  {
    kind: 'read_get_paragraph_info',
    test: (a) => a.type === 'read' && a.tool_name === 'get_paragraph_info' && !!a.chapter_title,
  },
  {
    kind: 'read_prev_next_paragraphs',
    test: (a) =>
      a.type === 'read' &&
      (a.tool_name === 'get_previous_paragraphs' || a.tool_name === 'get_next_paragraphs') &&
      !!a.paragraph_id,
  },
  { kind: 'help_doc_search', test: (a) => a.entity === 'help_doc' && a.type === 'search' },
  { kind: 'query', test: (a) => !!a.query },
  {
    kind: 'read_get_help_doc',
    test: (a) => a.type === 'read' && a.tool_name === 'get_help_doc' && !!a.title,
  },
  { kind: 'read_list_help_docs', test: (a) => a.type === 'read' && a.tool_name === 'list_help_docs' },
  { kind: 'url', test: (a) => !!a.url },
  {
    kind: 'translation_batch_replace',
    test: (a) => a.entity === 'translation' && a.tool_name === 'batch_replace_translations',
  },
  {
    kind: 'translation_update',
    test: (a, e) =>
      a.entity === 'translation' && !!a.paragraph_id && !!e.old_translation && !!e.new_translation,
  },
  { kind: 'translation_paragraph', test: (a) => a.entity === 'translation' && !!a.paragraph_id },
  { kind: 'name', test: (a) => !!a.name },
  {
    kind: 'read_get_book_info',
    test: (a) => a.type === 'read' && a.tool_name === 'get_book_info' && !!a.book_id,
  },
  {
    kind: 'read_get_memory',
    test: (a) => a.type === 'read' && a.tool_name === 'get_memory' && !!a.memory_id,
  },
  { kind: 'read_chapter_title', test: (a) => a.type === 'read' && !!a.chapter_title },
  { kind: 'read_character_name', test: (a) => a.type === 'read' && !!a.character_name },
  {
    kind: 'read_find_paragraph_by_keywords',
    test: (a) => a.type === 'read' && a.tool_name === 'find_paragraph_by_keywords',
  },
  {
    kind: 'search_chapter_summaries',
    test: (a) => a.type === 'search' && a.tool_name === 'search_chapter_summaries',
  },
  {
    kind: 'read_search_paragraphs_by_regex',
    test: (a) =>
      a.type === 'read' && a.tool_name === 'search_paragraphs_by_regex' && !!a.regex_pattern,
  },
  {
    kind: 'read_term_occurrences',
    test: (a) =>
      a.type === 'read' &&
      a.entity === 'term' &&
      a.tool_name === 'get_occurrences_by_keywords' &&
      !!a.keywords &&
      a.keywords.length > 0,
  },
  {
    kind: 'read_search_characters',
    test: (a) =>
      a.type === 'read' &&
      a.entity === 'character' &&
      a.tool_name === 'search_characters_by_keywords' &&
      !!a.keywords &&
      a.keywords.length > 0,
  },
  {
    kind: 'read_search_terms',
    test: (a) =>
      a.type === 'read' &&
      a.entity === 'term' &&
      a.tool_name === 'search_terms_by_keywords' &&
      !!a.keywords &&
      a.keywords.length > 0,
  },
  {
    kind: 'read_search_memories',
    test: (a) =>
      a.type === 'read' &&
      a.entity === 'memory' &&
      a.tool_name === 'search_memories' &&
      !!a.keywords &&
      a.keywords.length > 0,
  },
  {
    kind: 'read_keywords',
    test: (a) => a.type === 'read' && !!a.keywords && a.keywords.length > 0,
  },
  { kind: 'read_regex_pattern', test: (a) => a.type === 'read' && !!a.regex_pattern },
  { kind: 'read_tool_name', test: (a) => a.type === 'read' && !!a.tool_name },
  { kind: 'memory_id', test: (a) => a.entity === 'memory' && !!a.memory_id },
  { kind: 'memory_keyword', test: (a) => a.entity === 'memory' && !!a.keyword },
  {
    kind: 'update_chapter_title_full',
    test: (a, e) =>
      a.type === 'update' &&
      a.entity === 'chapter' &&
      a.tool_name === 'update_chapter_title' &&
      !!e.old_title &&
      !!e.new_title,
  },
  {
    kind: 'update_chapter_title_new',
    test: (a, e) => a.type === 'update' && a.entity === 'chapter' && !!e.new_title,
  },
  {
    kind: 'navigate_help_doc',
    test: (a) => a.type === 'navigate' && a.entity === 'help_doc' && !!a.title,
  },
  { kind: 'navigate_chapter_title', test: (a) => a.type === 'navigate' && !!a.chapter_title },
  { kind: 'navigate_paragraph', test: (a) => a.type === 'navigate' && !!a.paragraph_id },
];
const detailKind = computed<string>(() => {
  const a = props.action;
  const e = extAction.value;
  return DETAIL_KIND_RULES.find((r) => r.test(a, e))?.kind ?? 'none';
});

// kind → 渲染子组件查表；每个子组件只负责自己那组 kind，互不重叠
const COMPONENT_BY_KIND: Record<string, Component> = {
  ask_user: ChatBadgeAsk,
  ask_user_batch: ChatBadgeAsk,
  query: ChatBadgeSimple,
  url: ChatBadgeSimple,
  name: ChatBadgeSimple,
  memory_id: ChatBadgeSimple,
  memory_keyword: ChatBadgeSimple,
  help_doc_search: ChatBadgeReadValue,
  read_get_book_info: ChatBadgeReadValue,
  read_get_memory: ChatBadgeReadValue,
  read_chapter_title: ChatBadgeReadValue,
  read_character_name: ChatBadgeReadValue,
  read_list_help_docs: ChatBadgeReadValue,
  read_get_help_doc: ChatBadgeReadValue,
  read_get_term: ChatBadgeReadInfo,
  read_get_paragraph_info: ChatBadgeReadInfo,
  read_prev_next_paragraphs: ChatBadgeReadInfo,
  translation_batch_replace: ChatBadgeTranslation,
  translation_update: ChatBadgeTranslation,
  translation_paragraph: ChatBadgeTranslation,
  update_chapter_title_full: ChatBadgeNavigate,
  update_chapter_title_new: ChatBadgeNavigate,
  navigate_help_doc: ChatBadgeNavigate,
  navigate_chapter_title: ChatBadgeNavigate,
  navigate_paragraph: ChatBadgeNavigate,
  read_find_paragraph_by_keywords: ChatBadgeFindParagraph,
  search_chapter_summaries: ChatBadgeReadSearch,
  read_search_paragraphs_by_regex: ChatBadgeReadSearch,
  read_term_occurrences: ChatBadgeReadSearch,
  read_regex_pattern: ChatBadgeReadSearch,
  read_search_characters: ChatBadgeReadSearchKw,
  read_search_terms: ChatBadgeReadSearchKw,
  read_search_memories: ChatBadgeReadSearchKw,
  read_keywords: ChatBadgeReadSearchKw,
  read_tool_name: ChatBadgeReadSearchKw,
};

const detailComponent = computed<Component | null>(() => COMPONENT_BY_KIND[detailKind.value] ?? null);
</script>

<template>
  <div class="flex flex-wrap gap-1.5 max-w-full min-w-0">
    <div
      :id="actionId"
      class="inline-flex items-start gap-2 px-2 py-1 rounded text-xs font-medium transition-all duration-300 cursor-help max-w-full min-w-0 action-badge"
      :class="actionClass"
      @mouseenter="(event) => emit('hover', event)"
      @mouseleave="emit('leave')"
    >
      <i class="text-sm shrink-0 mt-0.5" :class="actionIconClass" />
      <span class="min-w-0 break-words">
        {{ ACTION_LABELS[action.type] || '' }}
        {{ ENTITY_LABELS[action.entity] || '' }}
        <component
          :is="detailComponent"
          v-if="detailComponent"
          :kind="detailKind"
          :action="action"
          :ext-action="extAction"
          :get-short-id="getShortId"
          :get-text-preview="getTextPreview"
          :get-chapter-title-for-action="getChapterTitleForAction"
        />
      </span>
    </div>
  </div>
</template>

<style scoped>
/* 确保长 URL、关键词等无空格文本能在徽章内任意位置换行,避免撑破布局 */
.action-badge,
.action-badge :deep(span) {
  overflow-wrap: anywhere;
  word-break: break-word;
}
</style>
