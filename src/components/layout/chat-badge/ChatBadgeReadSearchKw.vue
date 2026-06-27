<script setup lang="ts">
/**
 * read 关键词搜索类徽章细节（搜索角色 / 术语 / 记忆 / 通用关键词 / 兜底 tool_name）。从 ChatActionBadge 拆出。
 */
import type { BadgeDetailProps } from 'src/components/layout/chat-badge/badge-detail';

defineProps<BadgeDetailProps>();
</script>

<template>
  <span v-if="kind === 'read_search_characters'" class="font-semibold text-xs">
    搜索角色
    <span class="opacity-70 ml-1">关键词: {{ action.keywords!.join('、') }}</span>
  </span>
  <span v-else-if="kind === 'read_search_terms'" class="font-semibold text-xs">
    搜索术语
    <span class="opacity-70 ml-1">关键词: {{ action.keywords!.join('、') }}</span>
  </span>
  <span v-else-if="kind === 'read_search_memories'" class="font-semibold text-xs">
    搜索记忆
    <span class="opacity-70 ml-1">关键词: {{ action.keywords!.join('、') }}</span>
  </span>
  <span v-else-if="kind === 'read_keywords'" class="font-semibold text-xs">
    关键词: {{ action.keywords!.join('、') }}
  </span>
  <span v-else-if="kind === 'read_tool_name'" class="font-semibold text-xs">
    {{ action.tool_name }}
  </span>
</template>
