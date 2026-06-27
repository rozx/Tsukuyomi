<script setup lang="ts">
/**
 * 章节标题更新 / 导航类徽章细节。从 ChatActionBadge 拆出。
 * 用到 extAction 的扩展字段（old_title / new_title）。
 */
import type { BadgeDetailProps } from 'src/components/layout/chat-badge/badge-detail';

defineProps<BadgeDetailProps>();
</script>

<template>
  <span v-if="kind === 'update_chapter_title_full'" class="font-semibold text-xs">
    "{{ extAction.old_title }}" → "{{ extAction.new_title }}"
  </span>
  <span v-else-if="kind === 'update_chapter_title_new'" class="font-semibold text-xs">
    "{{ extAction.new_title }}"
  </span>
  <span v-else-if="kind === 'navigate_help_doc'" class="font-semibold text-xs">
    "{{ action.title }}"
    <span v-if="action.section_id" class="opacity-70 ml-1">#{{ action.section_id }}</span>
  </span>
  <span v-else-if="kind === 'navigate_chapter_title'" class="font-semibold text-xs">
    "{{ action.chapter_title }}"
    <span v-if="action.paragraph_id" class="opacity-70 ml-1">段落</span>
  </span>
  <span v-else-if="kind === 'navigate_paragraph'" class="font-semibold text-xs">
    段落 ({{ getShortId(action.paragraph_id) }})
  </span>
</template>
