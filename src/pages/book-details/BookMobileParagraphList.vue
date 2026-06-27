<script setup lang="ts">
/**
 * 手机端阅读器段落列表（虚拟滚动）。
 *
 * 承载原 BookDetailsMobile 的 useChapterVirtualizer 配置与 block-translation 渲染。
 * 滚动容器即 .mbr-scroll（由 ctx.setChapterContentPanelRef 持有）。
 * 样式由 BookDetailsMobile.vue 的非 scoped 样式表统一提供。
 */
import { computed, ref, onMounted, nextTick, watch } from 'vue';
import ProgressSpinner from 'primevue/progressspinner';
import ChapterScrollbar from 'src/components/novel/ChapterScrollbar.vue';
import { injectBookDetailsPage } from 'src/composables/book-details/useBookDetailsPage';
import { useChapterVirtualizer } from 'src/composables/book-details/useChapterVirtualizer';
import type { Paragraph } from 'src/models/novel';
import BookMobileParagraphMeta from './BookMobileParagraphMeta.vue';

const ctx = injectBookDetailsPage();

// 移动端 .mbr-p 段落列表虚拟滚动（性能优化；无内联编辑/键盘导航/搜索，故无需钉住与索引导航）。
const mbrScrollMargin = ref(0);
const mbrListStartRef = ref<HTMLElement | null>(null);
const {
  virtualRows: mbrVirtualRows,
  spacerSize: mbrSpacerSize,
  blockStart: mbrBlockStart,
  measureElement: mbrMeasureElement,
  scrollbarModel: mbrScrollbarModel,
  scrollToFraction: mbrScrollToFraction,
} = useChapterVirtualizer({
  scrollElement: ctx.chapterContentPanelRef,
  paragraphs: ctx.selectedChapterParagraphs,
  mode: 'mobile',
  scrollMargin: mbrScrollMargin,
  overscan: 6,
  getTranslationText: (p) => ctx.getParagraphTranslationText(p),
});

// 把虚拟行与其段落配对，模板仍可直接用 p / index（§ 序号用真实索引）
const mbrRenderRows = computed(() => {
  const paras = ctx.selectedChapterParagraphs.value;
  const out: Array<{ index: number; key: string; p: Paragraph }> = [];
  for (const row of mbrVirtualRows.value) {
    const p = paras[row.index];
    if (p) out.push({ index: row.index, key: p.id, p });
  }
  return out;
});

const recomputeMbrScrollMargin = () => {
  const sc = ctx.chapterContentPanelRef.value;
  const sentinel = mbrListStartRef.value;
  if (!sc || !sentinel) return;
  const next = Math.max(
    0,
    Math.round(
      sentinel.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop,
    ),
  );
  if (next !== mbrScrollMargin.value) mbrScrollMargin.value = next;
};

// 段落选中切换与上 / 下章导航：抽成方法以避免模板内的三元赋值与 && 短路贡献复杂度
const toggleParagraph = (p: Paragraph) => {
  ctx.mobileSelectedParagraphId.value =
    ctx.mobileSelectedParagraphId.value === p.id ? null : p.id;
};
const goToPrevChapter = () => {
  if (ctx.prevChapter.value) ctx.onNavigateToChapter(ctx.prevChapter.value);
};
const goToNextChapter = () => {
  if (ctx.nextChapter.value) ctx.onNavigateToChapter(ctx.nextChapter.value);
};
onMounted(() => void nextTick(recomputeMbrScrollMargin));
watch(
  () => ctx.selectedChapterId.value,
  () => void nextTick(recomputeMbrScrollMargin),
);
</script>

<template>
  <!-- 段落列表（外层 wrap 为非滚动定位锚点，使自定义滚动条只覆盖正文滚动区、不延伸到状态条） -->
  <div class="mbr-scroll-wrap">
    <div
      :ref="ctx.setChapterContentPanelRef"
      class="mbr-scroll"
      :class="{ 'mbr-scroll--with-actionbar': !!ctx.mobileSelectedParagraphId.value }"
    >
      <div v-if="ctx.isLoadingChapterContent.value" class="mbr-state">
        <ProgressSpinner
          style="width: 28px; height: 28px"
          stroke-width="4"
          animation-duration=".8s"
          aria-label="加载中"
        />
        <span>加载章节内容…</span>
      </div>
      <template v-else>
        <!-- 空章节状态 -->
        <div v-if="ctx.selectedChapterParagraphs.value.length === 0" class="mbr-state">
          <i class="pi pi-inbox" aria-hidden="true" />
          <span>本章暂无段落</span>
        </div>

        <!-- 段落列表虚拟滚动 · block translation -->
        <div
          v-else
          ref="mbrListStartRef"
          class="vlist-spacer"
          :style="{ height: `${mbrSpacerSize}px` }"
        >
          <div class="vlist-window" :style="{ transform: `translateY(${mbrBlockStart}px)` }">
            <div
              v-for="{ index, key, p } in mbrRenderRows"
              :key="key"
              :ref="mbrMeasureElement"
              :data-index="index"
              class="mbr-p"
              :class="{ selected: ctx.mobileSelectedParagraphId.value === p.id }"
              @click="toggleParagraph(p)"
            >
              <BookMobileParagraphMeta :p="p" :index="index" />

              <!-- Original -->
              <div v-if="(p.text ?? '').trim().length > 0" class="mbr-p-ja">{{ p.text }}</div>

              <!-- Translation -->
              <div v-if="ctx.getParagraphTranslationText(p)" class="mbr-p-zh">
                {{ ctx.getParagraphTranslationText(p) }}
              </div>
            </div>
          </div>
        </div>

        <!-- Prev / Next chapter -->
        <div class="mbr-chapter-nav">
          <button
            class="mbr-nav-btn"
            :disabled="!ctx.prevChapter.value"
            @click="goToPrevChapter"
          >
            <i class="pi pi-chevron-left" aria-hidden="true" />上一章
          </button>
          <button
            class="mbr-nav-btn"
            :disabled="!ctx.nextChapter.value"
            @click="goToNextChapter"
          >
            下一章<i class="pi pi-chevron-right" aria-hidden="true" />
          </button>
        </div>
      </template>
    </div>

    <!-- 自定义索引驱动滚动条（Teleport 到 .mbr-scroll-wrap，仅覆盖正文滚动区，不延伸到状态条/操作栏） -->
    <ChapterScrollbar
      :model="mbrScrollbarModel"
      teleport-to=".mbr-scroll-wrap"
      :scroll-to-fraction="mbrScrollToFraction"
    />
  </div>
</template>
