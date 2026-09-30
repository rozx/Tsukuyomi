<script setup lang="ts">
/**
 * read 取段落信息类徽章细节（术语 / 段落信息 / 前后段落）。从 ChatActionBadge 拆出。
 * 翻译类已拆到 ChatBadgeTranslation。
 */
import { useI18n } from 'vue-i18n';
import type { BadgeDetailProps } from 'src/components/layout/chat-badge/badge-detail';

defineProps<BadgeDetailProps>();
const { t } = useI18n();
</script>

<template>
  <span v-if="kind === 'read_get_term'" class="font-semibold text-xs"> "{{ action.name }}" </span>
  <span v-else-if="kind === 'read_get_paragraph_info'" class="font-semibold text-xs">
    "{{ action.chapter_title }}"
    <span v-if="action.paragraph_id" class="opacity-70 ml-1">{{
      t('activityUi.badge.paragraphId', { id: getShortId(action.paragraph_id) })
    }}</span>
  </span>
  <span v-else-if="kind === 'read_prev_next_paragraphs'" class="font-semibold text-xs">
    {{
      t(
        action.tool_name === 'get_previous_paragraphs'
          ? 'activityUi.badge.previousParagraphs'
          : 'activityUi.badge.nextParagraphs',
        { id: getShortId(action.paragraph_id) },
      )
    }}
  </span>
</template>
