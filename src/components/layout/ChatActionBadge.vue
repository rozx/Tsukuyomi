<script setup lang="ts">
import { computed } from 'vue';
import type { MessageAction } from 'src/stores/chat-sessions';
import { ACTION_LABELS, ENTITY_LABELS } from 'src/utils/action-info-utils';

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

const actionId = computed(() => `action-${props.messageId}-${props.timestamp}`);

const actionClass = computed(() => {
  if (props.action.entity === 'todo') {
    return 'bg-orange-500/25 text-orange-200 border border-orange-500/40 hover:bg-orange-500/35';
  }

  switch (props.action.type) {
    case 'create':
      return 'bg-green-500/25 text-green-200 border border-green-500/40 hover:bg-green-500/35';
    case 'update':
      return 'bg-blue-500/25 text-blue-200 border border-blue-500/40 hover:bg-blue-500/35';
    case 'delete':
      return 'bg-red-500/25 text-red-200 border border-red-500/40 hover:bg-red-500/35';
    case 'web_search':
      return 'bg-purple-500/25 text-purple-200 border border-purple-500/40 hover:bg-purple-500/35';
    case 'search':
      return 'bg-fuchsia-500/25 text-fuchsia-200 border border-fuchsia-500/40 hover:bg-fuchsia-500/35';
    case 'web_fetch':
      return 'bg-cyan-500/25 text-cyan-200 border border-cyan-500/40 hover:bg-cyan-500/35';
    case 'read':
      return 'bg-yellow-500/25 text-yellow-200 border border-yellow-500/40 hover:bg-yellow-500/35';
    case 'navigate':
      return 'bg-indigo-500/25 text-indigo-200 border border-indigo-500/40 hover:bg-indigo-500/35';
    default:
      return '';
  }
});

const actionIconClass = computed(() => {
  if (props.action.entity === 'todo') return 'pi pi-list';
  switch (props.action.type) {
    case 'create':
      return 'pi pi-plus-circle';
    case 'update':
      return 'pi pi-pencil';
    case 'delete':
      return 'pi pi-trash';
    case 'web_search':
    case 'search':
      return 'pi pi-search';
    case 'web_fetch':
      return 'pi pi-link';
    case 'read':
      return 'pi pi-eye';
    case 'navigate':
      return 'pi pi-arrow-right';
    default:
      return '';
  }
});

const getShortId = (value: string | undefined, length = 8): string => {
  if (!value) return '';
  return value.substring(0, length);
};

const getTextPreview = (value: string | undefined, maxLength = 20): string => {
  if (!value) return '';
  return value.length > maxLength ? `${value.substring(0, maxLength)}...` : value;
};
</script>

<template>
  <div class="flex flex-wrap gap-1.5">
    <div
      :id="actionId"
      class="inline-flex items-center gap-2 px-2 py-1 rounded text-xs font-medium transition-all duration-300 cursor-help"
      :class="actionClass"
      @mouseenter="(event) => emit('hover', event)"
      @mouseleave="emit('leave')"
    >
      <i class="text-sm" :class="actionIconClass" />
      <span>
        {{ ACTION_LABELS[action.type] || '' }}
        {{ ENTITY_LABELS[action.entity] || '' }}
        <span
          v-if="action.type === 'read' && action.tool_name === 'get_term' && action.name"
          class="font-semibold text-xs"
        >
          "{{ action.name }}"
        </span>
        <span
          v-else-if="
            action.type === 'read' &&
            action.tool_name === 'get_paragraph_info' &&
            action.chapter_title
          "
          class="font-semibold text-xs"
        >
          "{{ action.chapter_title }}"
          <span v-if="action.paragraph_id" class="opacity-70 ml-1"
            >段落 ({{ getShortId(action.paragraph_id) }})</span
          >
        </span>
        <span
          v-else-if="
            action.type === 'read' &&
            (action.tool_name === 'get_previous_paragraphs' ||
              action.tool_name === 'get_next_paragraphs') &&
            action.paragraph_id
          "
          class="font-semibold text-xs"
        >
          {{ action.tool_name === 'get_previous_paragraphs' ? '前' : '后' }}段落 ({{
            getShortId(action.paragraph_id)
          }})
        </span>
        <span
          v-else-if="action.entity === 'help_doc' && action.type === 'search'"
          class="font-semibold text-xs"
        >
          文档搜索
          <span v-if="action.query" class="opacity-70 ml-1">"{{ action.query }}"</span>
        </span>
        <span v-else-if="action.query" class="font-semibold">"{{ action.query }}"</span>
        <span
          v-else-if="action.type === 'read' && action.tool_name === 'get_help_doc' && action.title"
          class="font-semibold text-xs"
        >
          帮助文档: "{{ action.title }}"
        </span>
        <span
          v-else-if="action.type === 'read' && action.tool_name === 'list_help_docs'"
          class="font-semibold text-xs"
        >
          帮助文档列表
        </span>
        <span v-else-if="action.url" class="font-semibold text-xs">{{ action.url }}</span>
        <span
          v-else-if="
            action.entity === 'translation' && action.tool_name === 'batch_replace_translations'
          "
          class="font-semibold text-xs"
        >
          批量替换
          {{ (action as MessageActionWithAllProperties).replaced_paragraph_count ?? 0 }}
          个段落（共
          {{ (action as MessageActionWithAllProperties).replaced_translation_count ?? 0 }}
          个翻译版本）
        </span>
        <span
          v-else-if="
            action.entity === 'translation' &&
            action.paragraph_id &&
            (action as MessageActionWithAllProperties).old_translation &&
            (action as MessageActionWithAllProperties).new_translation
          "
          class="font-semibold text-xs"
        >
          段落翻译更新
          <span v-if="action.paragraph_id" class="opacity-70 ml-1"
            >({{ getShortId(action.paragraph_id) }})</span
          >
          <span class="opacity-70 ml-1">
            |
            {{ getTextPreview((action as MessageActionWithAllProperties).old_translation) }}
            →
            {{ getTextPreview((action as MessageActionWithAllProperties).new_translation) }}
          </span>
        </span>
        <span
          v-else-if="action.entity === 'translation' && action.paragraph_id"
          class="font-semibold text-xs"
        >
          段落翻译
          <span v-if="action.paragraph_id" class="opacity-70 ml-1"
            >({{ getShortId(action.paragraph_id) }})</span
          >
        </span>
        <span v-else-if="action.name" class="font-semibold">"{{ action.name }}"</span>
        <span
          v-else-if="
            action.type === 'read' && action.tool_name === 'get_book_info' && action.book_id
          "
          class="font-semibold text-xs"
        >
          书籍信息
        </span>
        <span
          v-else-if="
            action.type === 'read' && action.tool_name === 'get_memory' && action.memory_id
          "
          class="font-semibold text-xs"
        >
          Memory ({{ getShortId(action.memory_id) }})
        </span>
        <span
          v-else-if="action.type === 'read' && action.chapter_title"
          class="font-semibold text-xs"
        >
          "{{ action.chapter_title }}"
        </span>
        <span
          v-else-if="action.type === 'read' && action.character_name"
          class="font-semibold text-xs"
        >
          "{{ action.character_name }}"
        </span>
        <span
          v-else-if="action.type === 'read' && action.tool_name === 'find_paragraph_by_keywords'"
          class="font-semibold text-xs"
        >
          关键词搜索
          <span v-if="action.keywords && action.keywords.length > 0" class="opacity-70 ml-1">
            原文: {{ action.keywords.join('、') }}
          </span>
          <span
            v-if="
              (action as MessageActionWithAllProperties).translation_keywords &&
              ((action as MessageActionWithAllProperties).translation_keywords?.length ?? 0) > 0
            "
            class="opacity-70 ml-1"
          >
            翻译:
            {{ (action as MessageActionWithAllProperties).translation_keywords?.join('、') ?? '' }}
          </span>
          <span v-if="action.chapter_id" class="opacity-70 ml-1">
            | 章节:
            {{ getChapterTitleForAction(action.chapter_id) || getShortId(action.chapter_id) }}
          </span>
        </span>
        <span
          v-else-if="action.type === 'search' && action.tool_name === 'search_chapter_summaries'"
          class="font-semibold text-xs"
        >
          搜索摘要
          <span v-if="action.keywords && action.keywords.length > 0" class="opacity-70 ml-1">
            : {{ action.keywords.join('、') }}
          </span>
        </span>
        <span
          v-else-if="
            action.type === 'read' &&
            action.tool_name === 'search_paragraphs_by_regex' &&
            action.regex_pattern
          "
          class="font-semibold text-xs"
        >
          正则:
          {{
            action.regex_pattern.length > 30
              ? action.regex_pattern.substring(0, 30) + '...'
              : action.regex_pattern
          }}
        </span>
        <span
          v-else-if="
            action.type === 'read' &&
            action.entity === 'term' &&
            action.tool_name === 'get_occurrences_by_keywords' &&
            action.keywords &&
            action.keywords.length > 0
          "
          class="font-semibold text-xs"
        >
          关键词: {{ action.keywords.join('、') }}
        </span>
        <span
          v-else-if="
            action.type === 'read' &&
            action.entity === 'character' &&
            action.tool_name === 'search_characters_by_keywords' &&
            action.keywords &&
            action.keywords.length > 0
          "
          class="font-semibold text-xs"
        >
          搜索角色
          <span class="opacity-70 ml-1">关键词: {{ action.keywords.join('、') }}</span>
        </span>
        <span
          v-else-if="
            action.type === 'read' &&
            action.entity === 'term' &&
            action.tool_name === 'search_terms_by_keywords' &&
            action.keywords &&
            action.keywords.length > 0
          "
          class="font-semibold text-xs"
        >
          搜索术语
          <span class="opacity-70 ml-1">关键词: {{ action.keywords.join('、') }}</span>
        </span>
        <span
          v-else-if="
            action.type === 'read' &&
            action.entity === 'memory' &&
            action.tool_name === 'search_memory_by_keywords' &&
            action.keywords &&
            action.keywords.length > 0
          "
          class="font-semibold text-xs"
        >
          搜索记忆
          <span class="opacity-70 ml-1">关键词: {{ action.keywords.join('、') }}</span>
        </span>
        <span
          v-else-if="action.type === 'read' && action.keywords && action.keywords.length > 0"
          class="font-semibold text-xs"
        >
          关键词: {{ action.keywords.join('、') }}
        </span>
        <span
          v-else-if="action.type === 'read' && action.regex_pattern"
          class="font-semibold text-xs"
        >
          正则:
          {{
            action.regex_pattern.length > 30
              ? action.regex_pattern.substring(0, 30) + '...'
              : action.regex_pattern
          }}
        </span>
        <span v-else-if="action.type === 'read' && action.tool_name" class="font-semibold text-xs">
          {{ action.tool_name }}
        </span>
        <span
          v-else-if="action.entity === 'memory' && action.memory_id"
          class="font-semibold text-xs"
        >
          Memory ID: {{ action.memory_id }}
        </span>
        <span
          v-else-if="action.entity === 'memory' && action.keyword"
          class="font-semibold text-xs"
        >
          搜索: "{{ action.keyword }}"
        </span>
        <span
          v-else-if="
            action.type === 'update' &&
            action.entity === 'chapter' &&
            action.tool_name === 'update_chapter_title' &&
            (action as MessageActionWithAllProperties).old_title &&
            (action as MessageActionWithAllProperties).new_title
          "
          class="font-semibold text-xs"
        >
          "{{ (action as MessageActionWithAllProperties).old_title }}" → "{{
            (action as MessageActionWithAllProperties).new_title
          }}"
        </span>
        <span
          v-else-if="
            action.type === 'update' &&
            action.entity === 'chapter' &&
            (action as MessageActionWithAllProperties).new_title
          "
          class="font-semibold text-xs"
        >
          "{{ (action as MessageActionWithAllProperties).new_title }}"
        </span>
        <span
          v-else-if="action.type === 'navigate' && action.chapter_title"
          class="font-semibold text-xs"
        >
          "{{ action.chapter_title }}"
          <span v-if="action.paragraph_id" class="opacity-70 ml-1">段落</span>
        </span>
        <span
          v-else-if="action.type === 'navigate' && action.paragraph_id"
          class="font-semibold text-xs"
        >
          段落 ({{ getShortId(action.paragraph_id) }})
        </span>
      </span>
    </div>
  </div>
</template>
