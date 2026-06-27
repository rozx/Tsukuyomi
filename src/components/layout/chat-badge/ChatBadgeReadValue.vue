<script setup lang="ts">
/**
 * read 系「取值」类徽章细节（书籍/记忆/章节标题/角色名/帮助文档等）。从 ChatActionBadge 拆出。
 */
import type { BadgeDetailProps } from 'src/components/layout/chat-badge/badge-detail';

defineProps<BadgeDetailProps>();
</script>

<template>
  <span v-if="kind === 'help_doc_search'" class="font-semibold text-xs">
    文档搜索
    <span v-if="action.query" class="opacity-70 ml-1">"{{ action.query }}"</span>
  </span>
  <span v-else-if="kind === 'read_get_help_doc'" class="font-semibold text-xs">
    帮助文档: "{{ action.title }}"
  </span>
  <span v-else-if="kind === 'read_list_help_docs'" class="font-semibold text-xs">
    帮助文档列表
  </span>
  <span v-else-if="kind === 'read_get_book_info'" class="font-semibold text-xs">
    书籍信息
  </span>
  <span v-else-if="kind === 'read_get_memory'" class="font-semibold text-xs">
    Memory ({{ getShortId(action.memory_id) }})
  </span>
  <span v-else-if="kind === 'read_chapter_title'" class="font-semibold text-xs">
    "{{ action.chapter_title }}"
  </span>
  <span v-else-if="kind === 'read_character_name'" class="font-semibold text-xs">
    "{{ action.character_name }}"
  </span>
</template>
