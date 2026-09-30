<script setup lang="ts">
/**
 * read 关键词搜索类徽章细节（搜索角色 / 术语 / 记忆 / 通用关键词 / 兜底 tool_name）。从 ChatActionBadge 拆出。
 */
import { useI18n } from 'vue-i18n';
import type { AppLocale } from 'src/models/locale';
import { joinList } from 'src/utils/action-info/types';
import type { BadgeDetailProps } from 'src/components/layout/chat-badge/badge-detail';

defineProps<BadgeDetailProps>();
const { t, locale } = useI18n();
const keywordsText = (keywords: string[] | undefined): string =>
  t('activityUi.badge.keywords', {
    keywords: joinList(locale.value as AppLocale, keywords ?? []),
  });
</script>

<template>
  <span v-if="kind === 'read_search_characters'" class="font-semibold text-xs">
    {{ t('activityUi.badge.searchCharacters') }}
    <span class="opacity-70 ml-1">{{ keywordsText(action.keywords) }}</span>
  </span>
  <span v-else-if="kind === 'read_search_terms'" class="font-semibold text-xs">
    {{ t('activityUi.badge.searchTerms') }}
    <span class="opacity-70 ml-1">{{ keywordsText(action.keywords) }}</span>
  </span>
  <span v-else-if="kind === 'read_search_memories'" class="font-semibold text-xs">
    {{ t('activityUi.badge.searchMemories') }}
    <span class="opacity-70 ml-1">{{ keywordsText(action.keywords) }}</span>
  </span>
  <span v-else-if="kind === 'read_keywords'" class="font-semibold text-xs">
    {{ keywordsText(action.keywords) }}
  </span>
  <span v-else-if="kind === 'read_tool_name'" class="font-semibold text-xs">
    {{ action.tool_name }}
  </span>
</template>
