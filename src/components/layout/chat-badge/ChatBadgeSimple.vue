<script setup lang="ts">
/**
 * query / url / name / memory_id / memory_keyword 等单值徽章细节。从 ChatActionBadge 拆出。
 */
import type { BadgeDetailProps } from 'src/components/layout/chat-badge/badge-detail';

defineProps<BadgeDetailProps>();
</script>

<template>
  <span v-if="kind === 'query'" class="font-semibold">"{{ action.query }}"</span>
  <span v-else-if="kind === 'url'" class="font-semibold text-xs">{{ action.url }}</span>
  <span v-else-if="kind === 'name'" class="font-semibold">"{{ action.name }}"</span>
  <span v-else-if="kind === 'memory_id'" class="font-semibold text-xs">
    Memory ID: {{ action.memory_id }}
  </span>
  <span v-else-if="kind === 'memory_keyword'" class="font-semibold text-xs">
    搜索: "{{ action.keyword }}"
  </span>
</template>
