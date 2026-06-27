<script setup lang="ts">
/**
 * translation 系徽章细节（批量替换 / 段落翻译更新 / 段落翻译）。从 ChatBadgeReadInfo 拆出，
 * 避免单个子组件圈复杂度过高。用到 extAction 的扩展字段（replaced_*、old/new_translation）。
 */
import type { BadgeDetailProps } from 'src/components/layout/chat-badge/badge-detail';

defineProps<BadgeDetailProps>();
</script>

<template>
  <span v-if="kind === 'translation_batch_replace'" class="font-semibold text-xs">
    批量替换
    {{ extAction.replaced_paragraph_count ?? 0 }}
    个段落（共
    {{ extAction.replaced_translation_count ?? 0 }}
    个翻译版本）
  </span>
  <span v-else-if="kind === 'translation_update'" class="font-semibold text-xs">
    段落翻译更新
    <span v-if="action.paragraph_id" class="opacity-70 ml-1"
      >({{ getShortId(action.paragraph_id) }})</span
    >
    <span class="opacity-70 ml-1">
      |
      {{ getTextPreview(extAction.old_translation) }}
      →
      {{ getTextPreview(extAction.new_translation) }}
    </span>
  </span>
  <span v-else-if="kind === 'translation_paragraph'" class="font-semibold text-xs">
    段落翻译
    <span v-if="action.paragraph_id" class="opacity-70 ml-1"
      >({{ getShortId(action.paragraph_id) }})</span
    >
  </span>
</template>
