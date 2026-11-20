<script setup lang="ts">
import { useI18n } from 'vue-i18n';

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
import ChapterBatchActions from 'src/components/novel/chapter-batch/ChapterBatchActions.vue';

const { t } = useI18n();

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
const batch = ctx.chapterBatch;
const selecting = computed(() => batch.selection.active.value);
const onChapterAction = (payload: { chapter: Chapter; volumeId: string; index: number }) =>
  emit('chapter-action', payload);
</script>

<template>
  <div class="mbd-tab-content">
    <template v-if="isChaptersTab">
      <!-- 普通模式与多选模式共用同一行与按钮样式 -->
      <div v-if="selecting" class="mbd-chapter-actions">
        <span class="mbd-chapter-actions-label">{{
          t('taskQueueUi.batch.selectedCount', { count: batch.selection.count.value })
        }}</span>
        <button
          class="mbd-link-btn"
          :disabled="batch.untranslatedLoading.value"
          @click="batch.selectUntranslated()"
        >
          <i
            class="pi"
            :class="batch.untranslatedLoading.value ? 'pi-spinner pi-spin' : 'pi-filter'"
            aria-hidden="true"
          />{{ t('taskQueueUi.batch.selectUntranslated') }}
        </button>
        <button class="mbd-link-btn" @click="batch.selection.exit()">
          <i class="pi pi-times" aria-hidden="true" />{{ t('taskQueueUi.batch.exit') }}
        </button>
      </div>
      <div v-else class="mbd-chapter-actions">
        <button class="mbd-link-btn" @click="batch.selection.enter()">
          <i class="pi pi-list-check" aria-hidden="true" />{{ t('taskQueueUi.batch.multiSelect') }}
        </button>
        <button class="mbd-link-btn" @click="ctx.showAddVolumeDialog.value = true">
          <i class="pi pi-folder-plus" aria-hidden="true" />{{ t('readerUi.newVolume') }}
        </button>
        <button class="mbd-link-btn" @click="ctx.openAddChapterDialog">
          <i class="pi pi-file-plus" aria-hidden="true" />{{ t('readerUi.newChapter') }}
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
      <ChapterBatchActions v-if="selecting" class="mbd-batch-actions" />
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
