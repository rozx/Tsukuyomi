<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue';
import ChapterParagraphRow from 'src/components/novel/ChapterParagraphRow.vue';
import type { Paragraph, Terminology, CharacterSetting } from 'src/models/novel';
import type ParagraphCard from 'src/components/novel/ParagraphCard.vue';

// 虚拟滚动中的单个段落行包装：主列表 v-for 与钉住（pinned）行共用同一份
// ChapterParagraphRow 绑定。事件通过 $attrs 自动透传到 ChapterParagraphRow，
// :ref="measureElement" 保持与原先直接挂在 ChapterParagraphRow 上一致的测量行为。
defineProps<{
  paragraph: Paragraph;
  index: number;
  isSmallScreen: boolean;
  terminologies: Terminology[];
  characterSettings: CharacterSetting[];
  bookId?: string | undefined;
  chapterId: string | null;
  isTranslating: boolean;
  isPolishing: boolean;
  isProofreading: boolean;
  searchQuery: string;
  selected: boolean;
  paragraphCardRefs: Map<string, InstanceType<typeof ParagraphCard>>;
  editDraftStore: Map<string, string>;
  measureElement: (el: Element | ComponentPublicInstance | null) => void;
}>();
</script>

<template>
  <ChapterParagraphRow
    :ref="measureElement"
    :data-index="index"
    :paragraph="paragraph"
    :index="index"
    :is-small-screen="isSmallScreen"
    :terminologies="terminologies"
    :character-settings="characterSettings"
    :book-id="bookId"
    :chapter-id="chapterId"
    :is-translating="isTranslating"
    :is-polishing="isPolishing"
    :is-proofreading="isProofreading"
    :search-query="searchQuery"
    :selected="selected"
    :paragraph-card-refs="paragraphCardRefs"
    :edit-draft-store="editDraftStore"
  />
</template>
