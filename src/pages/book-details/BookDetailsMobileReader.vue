<script setup lang="ts">
/**
 * 手机端 · 阅读器（章节正文 + 翻译状态条 + 段落操作栏 + 批量 / 目录 picker）。
 *
 * 承载原 BookDetailsMobile 的阅读器分支与「章节目录 picker」状态。
 * 段落虚拟滚动由 BookMobileParagraphList 承担，卷 / 章节目录树复用 BookMobileChapterTree。
 * 样式由 BookDetailsMobile.vue 的非 scoped 样式表统一提供。
 */
import { ref, computed } from 'vue';
import MobileBottomSheet from 'src/components/layout/MobileBottomSheet.vue';
import { injectBookDetailsPage } from 'src/composables/book-details/useBookDetailsPage';
import type { Chapter } from 'src/models/novel';
import BookMobileChapterTree from './BookMobileChapterTree.vue';
import BookMobileParagraphList from './BookMobileParagraphList.vue';
import BookMobileBatchPicker from './BookMobileBatchPicker.vue';

const ctx = injectBookDetailsPage();

// 状态条图标 / 禁用态：批量忙碌时显示 spinner，否则显示常规图标（从模板三元 / 逻辑表达式抽出）
const batchProgressIcon = computed(() =>
  ctx.mobileBatchBusy.value ? 'pi-spin pi-spinner' : 'pi-objects-column',
);
const batchButtonIcon = computed(() =>
  ctx.mobileBatchBusy.value ? 'pi-spin pi-spinner' : 'pi-play',
);
const batchButtonDisabled = computed(
  () => ctx.mobileBatchBusy.value || ctx.mobileBatchMenuItems.value.length === 0,
);
// appbar 进度百分比：total>0 时四舍五入，否则 null（模板据此决定是否渲染 · xx%）
const readerPercent = computed(() => {
  const stats = ctx.mobileReaderStats.value;
  return stats.total > 0 ? Math.round((stats.translated / stats.total) * 100) : null;
});
// 以下 computed 仅用于把模板里的 ?. / > 等表达式收进脚本侧，降低模板分支复杂度
const bookTitle = computed(() => ctx.book.value?.title ?? '');
const hasActiveTask = computed(() => ctx.activeTranslationTaskCount.value > 0);
const activeTaskCount = computed(() => ctx.activeTranslationTaskCount.value);

// 阅读器内的"章节目录"按钮在手机端改为底部抽屉 picker：
// 旧行为会调用 onNavigateToChapterList() 强制 setSelectedChapter(null) ，
// 把用户从阅读器踢回 overview；新行为保留当前阅读上下文，仅弹出 sheet。
const showChapterListPicker = ref(false);
const openChapterListPicker = () => {
  showChapterListPicker.value = true;
};
const pickChapterFromSheet = (ch: Chapter) => {
  showChapterListPicker.value = false;
  ctx.onNavigateToChapter(ch);
};
</script>

<template>
  <template v-if="ctx.selectedChapter.value">
    <!-- 手机端 · 阅读页顶部 app bar -->
    <header class="mbd-appbar mbd-appbar--reader">
    <button class="mbd-icon-btn" aria-label="返回书籍详情" @click="ctx.onNavigateToChapterList">
      <i class="pi pi-chevron-left" aria-hidden="true" />
    </button>
    <div class="mbd-appbar-text">
      <div class="mbd-appbar-title">
        {{
          ctx.getChapterDisplayTitle(ctx.selectedChapter.value, ctx.book.value || undefined) ||
          '未命名章节'
        }}
      </div>
      <div class="mbd-appbar-sub">
        {{ bookTitle }}<template v-if="readerPercent !== null"> · {{ readerPercent }}%</template>
      </div>
    </div>
    <button class="mbd-icon-btn" aria-label="章节目录" @click="openChapterListPicker">
      <i class="pi pi-list" aria-hidden="true" />
    </button>
    <button class="mbd-icon-btn" aria-label="章节设置" @click="ctx.toggleChapterSettingsPopover">
      <i class="pi pi-cog" aria-hidden="true" />
    </button>
  </header>

  <!-- 手机端阅读器主体 -->
  <div class="mobile-reader">
    <!-- 翻译状态条 -->
    <div class="mbr-strip">
      <span class="mbr-strip-badge">
        <i class="pi pi-sparkles" aria-hidden="true" />
        {{ ctx.mobileReaderModelName.value }}
      </span>
      <span class="mbr-strip-stats">
        共 {{ ctx.mobileReaderStats.value.total }} 段 · 已译
        {{ ctx.mobileReaderStats.value.translated }}
      </span>
      <button
        class="mbr-strip-icon-btn"
        :class="{ 'mbr-strip-icon-btn--active': ctx.mobileBatchBusy.value }"
        aria-label="翻译进度"
        @click="ctx.openMobileTranslationProgress"
      >
        <i class="pi" :class="batchProgressIcon" aria-hidden="true" />
        <span v-if="hasActiveTask" class="mbr-strip-icon-badge">
          {{ activeTaskCount }}
        </span>
      </button>
      <button
        class="mbr-strip-btn"
        :disabled="batchButtonDisabled"
        aria-haspopup="dialog"
        :aria-expanded="ctx.showMobileBatchPicker.value"
        @click="ctx.openMobileBatchPicker"
      >
        <i class="pi" :class="batchButtonIcon" aria-hidden="true" />
        批量
        <i class="pi pi-chevron-down mbr-strip-btn-caret" aria-hidden="true" />
      </button>
    </div>

    <BookMobileParagraphList />

    <!-- Floating action bar for selected paragraph -->
    <div v-if="ctx.mobileSelectedParagraphId.value" class="mbr-actionbar">
      <button
        class="ab-btn primary"
        :disabled="ctx.translatingParagraphIds.value.has(ctx.mobileSelectedParagraphId.value)"
        @click="ctx.retranslateParagraph(ctx.mobileSelectedParagraphId.value)"
      >
        <i class="pi pi-sparkles" aria-hidden="true" />
        <span>翻译</span>
      </button>
      <button
        class="ab-btn"
        :disabled="ctx.polishingParagraphIds.value.has(ctx.mobileSelectedParagraphId.value)"
        @click="ctx.polishParagraph(ctx.mobileSelectedParagraphId.value)"
      >
        <i class="pi pi-pencil" aria-hidden="true" />
        <span>润色</span>
      </button>
      <button
        class="ab-btn"
        :disabled="ctx.proofreadingParagraphIds.value.has(ctx.mobileSelectedParagraphId.value)"
        @click="ctx.proofreadParagraph(ctx.mobileSelectedParagraphId.value)"
      >
        <i class="pi pi-check-circle" aria-hidden="true" />
        <span>校对</span>
      </button>
      <div class="ab-sep" />
      <button class="ab-btn" @click="ctx.mobileSelectedParagraphId.value = null">
        <i class="pi pi-times" aria-hidden="true" />
        <span>关闭</span>
      </button>
    </div>

    <!-- 批量操作 picker —— 使用共享 MobileBottomSheet 外壳 -->
    <BookMobileBatchPicker />

    <!-- 章节目录 picker —— 阅读中弹出，不打断当前章节 -->
    <MobileBottomSheet
      v-model:visible="showChapterListPicker"
      title="章节目录"
      eyebrow="BOOK · 目录"
      max-height="86dvh"
    >
      <div class="mbr-chapter-picker-tree">
        <BookMobileChapterTree
          volume-tag="button"
          :active-chapter-id="ctx.selectedChapter.value?.id ?? null"
          @navigate="pickChapterFromSheet"
        />
      </div>
    </MobileBottomSheet>
  </div>
  </template>
</template>
