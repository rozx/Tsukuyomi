<template>
  <div v-if="showInfo" :class="novelInfoClass">
    <div class="flex items-center justify-between">
      <div>
        <h3 class="text-lg font-semibold text-moon/90 mb-1" :class="{ 'line-clamp-2': isPhone }">
          {{ novelTitle }}
        </h3>
        <div class="flex items-center gap-4 text-sm text-moon/70" :class="{ 'text-xs': isPhone }">
          <span v-if="novelAuthor">作者: {{ novelAuthor }}</span>
          <span>卷数: {{ stats.volumes }}</span>
          <span>章节数: {{ stats.chapters }}</span>
        </div>
      </div>
    </div>
    <div v-if="showDescription" class="mt-3 text-sm text-moon/80 whitespace-pre-wrap">
      {{ novelDescription }}
    </div>
    <div v-if="showTags" class="mt-3 flex flex-wrap gap-2">
      <span v-for="tag in novelTags" :key="tag" class="novel-tag">
        {{ tag }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject } from 'vue';
import { SCRAPER_DIALOG_KEY } from './scraper-dialog-context';

const { scrapedNovel, loading, showNovelInfo, isPhone, mobileShowPreview, stats, novelInfoClass } =
  inject(SCRAPER_DIALOG_KEY)!;

// 小说各字段的非可选访问（将模板中的 ?. 收敛到 computed，降低圈复杂度）
const novelTitle = computed(() => scrapedNovel.value?.title ?? '');
const novelAuthor = computed(() => scrapedNovel.value?.author);
const novelDescription = computed(() => scrapedNovel.value?.description ?? '');
const novelTags = computed(() => scrapedNovel.value?.tags ?? []);

// 小说信息块的显示条件
const showInfo = computed(
  () =>
    !!scrapedNovel.value &&
    !loading.value &&
    showNovelInfo.value &&
    (!isPhone.value || !mobileShowPreview.value),
);
// 描述仅桌面端展示
const showDescription = computed(() => !!scrapedNovel.value?.description && !isPhone.value);
// 标签仅桌面端且有内容时展示
const showTags = computed(() => !isPhone.value && novelTags.value.length > 0);
</script>
