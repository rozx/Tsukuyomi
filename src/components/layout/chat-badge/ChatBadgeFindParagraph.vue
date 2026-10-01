<script setup lang="ts">
/**
 * find_paragraph_by_keywords 徽章细节（含原文/翻译关键词/章节三个可选子段，嵌套较深）。
 * 从 ChatBadgeReadSearch 拆出。该组件只被父级在 kind === 'read_find_paragraph_by_keywords'
 * 时通过 <component :is> 挂载，因此无需再判 kind，直接渲染。
 * 用到 extAction.translation_keywords 扩展字段。
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { AppLocale } from 'src/models/locale';
import { joinList } from 'src/utils/action-info/types';
import type { BadgeDetailProps } from 'src/components/layout/chat-badge/badge-detail';

const props = defineProps<BadgeDetailProps>();
const { t, locale } = useI18n();

// 把模板里的 && / ?? / || 运算搬到 computed，压低模板圈复杂度
const hasOriginKeywords = computed(
  () => !!props.action.keywords && props.action.keywords.length > 0,
);
const originKeywordsText = computed(() =>
  joinList(locale.value as AppLocale, props.action.keywords ?? []),
);
const hasTranslationKeywords = computed(
  () =>
    !!props.extAction.translation_keywords &&
    (props.extAction.translation_keywords?.length ?? 0) > 0,
);
const translationKeywordsText = computed(() =>
  joinList(locale.value as AppLocale, props.extAction.translation_keywords ?? []),
);
const chapterText = computed(
  () =>
    props.getChapterTitleForAction(props.action.chapter_id, props.action.language) ||
    props.getShortId(props.action.chapter_id),
);
</script>

<template>
  <span class="font-semibold text-xs">
    {{ t('activityUi.badge.keywordSearch') }}
    <span v-if="hasOriginKeywords" class="opacity-70 ml-1">
      {{ t('activityUi.badge.original', { text: originKeywordsText }) }}
    </span>
    <span v-if="hasTranslationKeywords" class="opacity-70 ml-1">
      {{ t('activityUi.badge.translated', { text: translationKeywordsText }) }}
    </span>
    <span v-if="action.chapter_id" class="opacity-70 ml-1">
      | {{ t('activityUi.badge.chapter', { text: chapterText }) }}
    </span>
  </span>
</template>
