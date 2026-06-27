<template>
  <div :class="compareContainerClass">
    <!-- 左侧：已导入内容 -->
    <div :class="compareImportedClass">
      <div class="mb-3 pb-2 border-b border-white/10 flex-shrink-0">
        <h5 class="text-sm font-semibold text-moon/90 mb-1">已导入内容</h5>
        <span class="text-xs text-moon/60">
          {{ formatWordCount(selectedChapterImportedContent?.length ?? 0) }} 字
        </span>
      </div>
      <div class="flex-1 overflow-y-auto">
        <div
          class="text-sm text-moon/80 whitespace-pre-line leading-relaxed prose prose-invert max-w-none"
        >
          {{ selectedChapterImportedContent }}
        </div>
      </div>
    </div>

    <!-- 右侧：新获取内容 / 等待加载 -->
    <div v-if="hasNewContent" :class="compareFetchedClass">
      <div class="mb-3 pb-2 border-b border-white/10 flex-shrink-0">
        <h5 class="text-sm font-semibold text-moon/90 mb-1">新获取内容</h5>
        <span class="text-xs text-moon/60">
          {{ formatWordCount(selectedChapterContent?.length ?? 0) }} 字
        </span>
      </div>
      <div class="flex-1 overflow-y-auto">
        <div
          class="text-sm text-moon/80 whitespace-pre-line leading-relaxed prose prose-invert max-w-none"
        >
          {{ selectedChapterContent }}
        </div>
      </div>
    </div>
    <div
      v-else
      :class="[
        compareFetchedClass,
        'flex items-center justify-center text-moon/60',
        { 'pt-2': isPhone },
      ]"
    >
      <i class="pi pi-spin pi-spinner text-4xl text-moon/40 mb-4 block" />
      <p>正在加载新内容以进行对比...</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { inject } from 'vue';
import { formatWordCount } from 'src/utils';
import { SCRAPER_DIALOG_KEY } from './scraper-dialog-context';

defineProps<{
  // diff：已加载新内容并排对比；waiting：等待加载新内容
  hasNewContent: boolean;
}>();

const {
  selectedChapterImportedContent,
  selectedChapterContent,
  compareContainerClass,
  compareImportedClass,
  compareFetchedClass,
  isPhone,
} = inject(SCRAPER_DIALOG_KEY)!;
</script>
