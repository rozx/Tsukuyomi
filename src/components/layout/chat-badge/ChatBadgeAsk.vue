<script setup lang="ts">
/**
 * ask_user / ask_user_batch 提问徽章细节。从 ChatActionBadge 拆出。
 */
import type { BadgeDetailProps } from 'src/components/layout/chat-badge/badge-detail';

defineProps<BadgeDetailProps>();
</script>

<template>
  <span v-if="kind === 'ask_user'" class="font-semibold text-xs">
    "{{ getTextPreview(action.question, 30) }}"
    <span v-if="action.answer" class="opacity-70 ml-1"
      >→ {{ getTextPreview(action.answer, 20) }}</span
    >
    <span v-else-if="action.cancelled" class="opacity-70 ml-1 text-red-300">(已取消)</span>
  </span>
  <span v-else-if="kind === 'ask_user_batch'" class="font-semibold text-xs">
    {{ action.batch_questions!.length }} 个问题
    <span v-if="action.batch_answers" class="opacity-70 ml-1"
      >→ 已回答 {{ action.batch_answers.length }} 题</span
    >
    <span v-else-if="action.cancelled" class="opacity-70 ml-1 text-red-300">(已取消)</span>
  </span>
</template>
