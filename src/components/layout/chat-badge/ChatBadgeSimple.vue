<script setup lang="ts">
/**
 * query / url / name / memory_id / memory_keyword 等单值徽章细节。从 ChatActionBadge 拆出。
 */
import { useI18n } from 'vue-i18n';
import type { BadgeDetailProps } from 'src/components/layout/chat-badge/badge-detail';

defineProps<BadgeDetailProps>();
const { t } = useI18n();
</script>

<template>
  <span v-if="kind === 'query'" class="font-semibold">"{{ action.query }}"</span>
  <span v-else-if="kind === 'url'" class="font-semibold text-xs">{{ action.url }}</span>
  <span v-else-if="kind === 'name'" class="font-semibold">"{{ action.name }}"</span>
  <span v-else-if="kind === 'memory_id'" class="font-semibold text-xs">
    Memory ID: {{ action.memory_id }}
  </span>
  <span v-else-if="kind === 'memory_keyword'" class="font-semibold text-xs">
    {{ t('activityUi.badge.search', { keyword: action.keyword ?? '' }) }}
  </span>
</template>
