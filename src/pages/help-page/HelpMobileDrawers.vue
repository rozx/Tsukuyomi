<script setup lang="ts">
/**
 * 手机帮助页的「文档抽屉 + TOC 抽屉」（均为底部抽屉）。
 * 从 HelpPageMobile 抽出以降低其模板圈复杂度。自行注入 useHelpPage 上下文。
 */
import { computed } from 'vue';
import MobileBottomSheet from 'src/components/layout/MobileBottomSheet.vue';
import { injectHelpPage } from 'src/composables/help-page/useHelpPage';
import type { TocItem, HelpDocument } from 'src/composables/help-page/useHelpPage';

const ctx = injectHelpPage();

const hasToc = computed(() => ctx.toc.value.length > 0);
const categoryChevron = (category: string) =>
  ctx.expandedCategories.value.has(category) ? 'pi-chevron-down' : 'pi-chevron-right';
const isCategoryExpanded = (category: string) => ctx.expandedCategories.value.has(category);
const isActiveDoc = (doc: HelpDocument) => ctx.currentDoc.value?.id === doc.id;
const docButtonClass = (doc: HelpDocument) =>
  isActiveDoc(doc)
    ? 'bg-primary/20 text-primary font-medium border-primary shadow-sm'
    : 'text-moon/80 hover:bg-white/5 hover:text-moon-100 border-transparent hover:border-moon/20';
const tocItemClass = (item: TocItem) => [
  ctx.activeHeading.value === item.id
    ? 'text-primary border-primary bg-primary/10 font-medium'
    : 'text-moon/60 border-transparent hover:text-moon-100 hover:bg-white/5 hover:border-moon/20',
  item.level === 1 ? 'text-base font-semibold' : '',
  item.level === 2 ? 'text-sm font-medium ml-2' : '',
  item.level === 3 ? 'text-xs ml-6 opacity-90' : '',
  item.level === 4 ? 'text-xs ml-8 opacity-75' : '',
];
</script>

<template>
  <!-- 文档抽屉（底部抽屉） -->
  <MobileBottomSheet
    v-model:visible="ctx.showDocumentNavDrawer.value"
    title="帮助文档"
    eyebrow="HELP · DOCS"
    max-height="86dvh"
  >
    <nav class="space-y-1">
      <div v-for="(docs, category) in ctx.groupedDocuments.value" :key="category" class="mb-3">
        <button
          class="w-full flex items-center justify-between px-2 py-1.5 transition-colors group"
          @click="ctx.toggleCategory(category as string)"
        >
          <h3
            class="font-ui font-medium text-[11px] uppercase tracking-[0.2em] text-moon/60 group-hover:text-moon-100 transition-colors"
          >
            {{ category }}
          </h3>
          <i
            class="pi text-moon/30 text-[10px] transition-transform duration-200"
            :class="categoryChevron(category as string)"
          />
        </button>
        <ul
          v-show="isCategoryExpanded(category as string)"
          class="space-y-0.5 mt-1.5"
        >
          <li v-for="doc in docs" :key="doc.id">
            <button
              class="w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all duration-200 border-l-2"
              :class="docButtonClass(doc)"
              @click="ctx.navigateToDocument(doc)"
            >
              {{ doc.title }}
            </button>
          </li>
        </ul>
      </div>
    </nav>
  </MobileBottomSheet>

  <!-- TOC 抽屉（底部抽屉） -->
  <MobileBottomSheet
    v-if="hasToc"
    v-model:visible="ctx.showTocDrawer.value"
    title="目录"
    eyebrow="TABLE OF CONTENTS"
    max-height="82dvh"
  >
    <nav class="space-y-1">
      <a
        v-for="item in ctx.toc.value"
        :key="item.id"
        :href="`#${item.id}`"
        class="block py-2 px-3 rounded-lg transition-all duration-200 border-l-2"
        :class="tocItemClass(item)"
        @click.prevent="ctx.scrollToHeading(item.id)"
      >
        {{ item.text }}
      </a>
    </nav>
  </MobileBottomSheet>
</template>
