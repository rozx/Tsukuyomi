<script setup lang="ts">
/**
 * read 搜索/正则类徽章细节（摘要、正则、term 出现次数）。从 ChatActionBadge 拆出。
 * find_paragraph_by_keywords 已拆到 ChatBadgeFindParagraph。
 */
import { useI18n } from 'vue-i18n';
import type { AppLocale } from 'src/models/locale';
import { joinList } from 'src/utils/action-info/types';
import type { BadgeDetailProps } from 'src/components/layout/chat-badge/badge-detail';

defineProps<BadgeDetailProps>();
const { t, locale } = useI18n();
const joinKeywords = (keywords: string[] | undefined): string =>
  joinList(locale.value as AppLocale, keywords ?? []);
</script>

<template>
  <span v-if="kind === 'search_chapter_summaries'" class="font-semibold text-xs">
    {{ t('activityUi.badge.searchSummaries') }}
    <span v-if="action.keywords && action.keywords.length > 0" class="opacity-70 ml-1">
      : {{ joinKeywords(action.keywords) }}
    </span>
  </span>
  <span v-else-if="kind === 'read_search_paragraphs_by_regex'" class="font-semibold text-xs">
    {{ t('activityUi.badge.regex', { pattern: getTextPreview(action.regex_pattern, 30) }) }}
  </span>
  <span v-else-if="kind === 'read_term_occurrences'" class="font-semibold text-xs">
    {{ t('activityUi.badge.keywords', { keywords: joinKeywords(action.keywords) }) }}
  </span>
  <span v-else-if="kind === 'read_regex_pattern'" class="font-semibold text-xs">
    {{ t('activityUi.badge.regex', { pattern: getTextPreview(action.regex_pattern, 30) }) }}
  </span>
</template>
