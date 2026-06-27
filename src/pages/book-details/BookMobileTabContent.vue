<script setup lang="ts">
/**
 * 手机端 Overview 标签内容（章节树 / 术语 / 角色 / 记忆 面板四选一）。
 * 从 BookDetailsMobileOverview 抽出以降低其模板复杂度。样式由 BookDetailsMobile.vue 提供。
 */
import { computed } from 'vue';
import TerminologyPanel from 'src/components/novel/TerminologyPanel.vue';
import CharacterSettingPanel from 'src/components/novel/CharacterSettingPanel.vue';
import MemoryPanel from 'src/components/novel/MemoryPanel.vue';
import { injectBookDetailsPage } from 'src/composables/book-details/useBookDetailsPage';
import type { Chapter, Volume } from 'src/models/novel';
import BookMobileChapterTree from './BookMobileChapterTree.vue';

const ctx = injectBookDetailsPage();

const emit = defineEmits<{
  'volume-action': [volume: Volume];
  'chapter-action': [payload: { chapter: Chapter; volumeId: string; index: number }];
}>();

const isChaptersTab = computed(() => ctx.mobileActiveTab.value === 'chapters');
const isTermsTab = computed(() => ctx.mobileActiveTab.value === 'terms');
const isCharactersTab = computed(() => ctx.mobileActiveTab.value === 'characters');
const isMemoryTab = computed(() => ctx.mobileActiveTab.value === 'memory');
const activeChapterId = computed(() => ctx.continueReadingChapter.value?.id ?? null);
const onChapterAction = (payload: { chapter: Chapter; volumeId: string; index: number }) =>
  emit('chapter-action', payload);
</script>

<template>
  <div class="mbd-tab-content">
    <template v-if="isChaptersTab">
      <div class="mbd-chapter-actions">
        <button class="mbd-link-btn" @click="ctx.showAddVolumeDialog.value = true">
          <i class="pi pi-plus" aria-hidden="true" />新卷
        </button>
        <button class="mbd-link-btn" @click="ctx.openAddChapterDialog">
          <i class="pi pi-plus-circle" aria-hidden="true" />新章节
        </button>
      </div>

      <!-- 清爽的手机端章节树：卷（可折叠）+ 章节（状态图标 + 百分比） -->
      <div class="mbd-tree">
        <BookMobileChapterTree
          volume-tag="div"
          show-row-actions
          :active-chapter-id="activeChapterId"
          @navigate="ctx.onNavigateToChapter"
          @volume-action="(vol) => emit('volume-action', vol)"
          @chapter-action="onChapterAction"
        />
      </div>
    </template>
    <TerminologyPanel v-else-if="isTermsTab" :book="ctx.book.value || null" class="mbd-panel" />
    <CharacterSettingPanel
      v-else-if="isCharactersTab"
      :book="ctx.book.value || null"
      class="mbd-panel"
    />
    <MemoryPanel v-else-if="isMemoryTab" :book="ctx.book.value || null" class="mbd-panel" />
  </div>
</template>
