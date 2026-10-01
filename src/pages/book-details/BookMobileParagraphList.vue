<script setup lang="ts">
import { useI18n } from 'vue-i18n';

/**
 * 手机端阅读器段落列表（虚拟滚动）。
 *
 * 承载原 BookDetailsMobile 的 useChapterVirtualizer 配置与 block-translation 渲染。
 * 手机使用文档滚动，虚拟列表监听窗口；页面上下文持有文档滚动元素以便切章复位。
 * 样式由 BookDetailsMobile.vue 的非 scoped 样式表统一提供。
 */
import { computed, ref, onMounted, nextTick, watch } from 'vue';
import type { ComponentPublicInstance } from 'vue';
import ProgressSpinner from 'primevue/progressspinner';
import { injectBookDetailsPage } from 'src/composables/book-details/useBookDetailsPage';
import { useChapterVirtualizer } from 'src/composables/book-details/useChapterVirtualizer';
import type { Paragraph } from 'src/models/novel';
import BookMobileParagraphMeta from './BookMobileParagraphMeta.vue';

const { t } = useI18n();

const ctx = injectBookDetailsPage();

// 移动端 .mbr-p 段落列表虚拟滚动（性能优化；无内联编辑/键盘导航/搜索，故无需钉住与索引导航）。
const mbrScrollMargin = ref(0);
const mbrListStartRef = ref<HTMLElement | null>(null);
const {
  virtualRows: mbrVirtualRows,
  spacerSize: mbrSpacerSize,
  blockStart: mbrBlockStart,
  measureElement: mbrMeasureElement,
} = useChapterVirtualizer({
  scrollElement: ctx.chapterContentPanelRef,
  scrollTarget: 'window',
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
  const sentinel = mbrListStartRef.value;
  if (!sentinel) return;
  const next = Math.max(0, Math.round(sentinel.getBoundingClientRect().top + window.scrollY));
  if (next !== mbrScrollMargin.value) mbrScrollMargin.value = next;
};

const setDocumentScrollRef = (el: Element | ComponentPublicInstance | null) => {
  ctx.setChapterContentPanelRef(el ? document.scrollingElement : null);
};

// 段落选中切换与上 / 下章导航：抽成方法以避免模板内的三元赋值与 && 短路贡献复杂度
const toggleParagraph = (p: Paragraph) => {
  ctx.mobileSelectedParagraphId.value = ctx.mobileSelectedParagraphId.value === p.id ? null : p.id;
};
const goToPrevChapter = () => {
  if (ctx.prevChapter.value) ctx.onNavigateToChapter(ctx.prevChapter.value);
};
const goToNextChapter = () => {
  if (ctx.nextChapter.value) ctx.onNavigateToChapter(ctx.nextChapter.value);
};
onMounted(() => void nextTick(recomputeMbrScrollMargin));
watch(
  [() => ctx.selectedChapterId.value, mbrListStartRef],
  () => void nextTick(recomputeMbrScrollMargin),
);
</script>

<template>
  <!-- 段落列表随文档滚动，窗口虚拟化避免整章同时挂载。 -->
  <div class="mbr-scroll-wrap">
    <div
      :ref="setDocumentScrollRef"
      class="mbr-scroll"
      :class="{ 'mbr-scroll--with-actionbar': !!ctx.mobileSelectedParagraphId.value }"
    >
      <div v-if="ctx.isLoadingChapterContent.value" class="mbr-state">
        <ProgressSpinner
          style="width: 28px; height: 28px"
          stroke-width="4"
          animation-duration=".8s"
          :aria-label="t('readerUi.loading')"
        />
        <span>{{ t('readerUi.loadingChapter') }}</span>
      </div>
      <template v-else>
        <!-- 空章节状态 -->
        <div v-if="ctx.selectedChapterParagraphs.value.length === 0" class="mbr-state">
          <i class="pi pi-inbox" aria-hidden="true" />
          <span>{{ t('readerUi.noParagraphs') }}</span>
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
          <button class="mbr-nav-btn" :disabled="!ctx.prevChapter.value" @click="goToPrevChapter">
            <i class="pi pi-chevron-left" aria-hidden="true" />{{ t('readerUi.prevChapter') }}
          </button>
          <button class="mbr-nav-btn" :disabled="!ctx.nextChapter.value" @click="goToNextChapter">
            {{ t('readerUi.nextChapter') }}<i class="pi pi-chevron-right" aria-hidden="true" />
          </button>
        </div>
      </template>
    </div>
  </div>
</template>
