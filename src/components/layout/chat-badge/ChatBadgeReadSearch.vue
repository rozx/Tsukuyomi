<script setup lang="ts">
/**
 * read 搜索/正则类徽章细节（摘要、正则、term 出现次数）。从 ChatActionBadge 拆出。
 * find_paragraph_by_keywords 已拆到 ChatBadgeFindParagraph。
 */
import type { BadgeDetailProps } from 'src/components/layout/chat-badge/badge-detail';

defineProps<BadgeDetailProps>();
</script>

<template>
  <span v-if="kind === 'search_chapter_summaries'" class="font-semibold text-xs">
    搜索摘要
    <span v-if="action.keywords && action.keywords.length > 0" class="opacity-70 ml-1">
      : {{ action.keywords!.join('、') }}
    </span>
  </span>
  <span v-else-if="kind === 'read_search_paragraphs_by_regex'" class="font-semibold text-xs">
    正则:
    {{ getTextPreview(action.regex_pattern, 30) }}
  </span>
  <span v-else-if="kind === 'read_term_occurrences'" class="font-semibold text-xs">
    关键词: {{ action.keywords!.join('、') }}
  </span>
  <span v-else-if="kind === 'read_regex_pattern'" class="font-semibold text-xs">
    正则:
    {{ getTextPreview(action.regex_pattern, 30) }}
  </span>
</template>
