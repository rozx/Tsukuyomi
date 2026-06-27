<template>
  <div class="flex-1 min-h-0 min-w-0 flex flex-col gap-4">
    <div v-if="showInfoSkeleton" :class="novelInfoClass">
      <Skeleton width="60%" height="1.75rem" class="mb-3" />
      <Skeleton width="50%" height="1rem" class="mb-2" />
      <Skeleton width="90%" height="0.875rem" class="mb-2" />
      <Skeleton width="85%" height="0.875rem" />
    </div>

    <div class="flex-1 min-h-0 min-w-0">
      <component
        :is="contentContainerComponent"
        v-bind="contentContainerProps"
        :class="contentContainerClass"
        :style="contentContainerStyle"
      >
        <component
          :is="contentPanelComponent"
          v-bind="chapterPanelProps"
          :class="chapterPanelWrapperClass"
        >
          <div
            class="h-full flex flex-col bg-night-900/50 rounded-lg border border-white/10 overflow-hidden"
            :style="splitPanelContainerStyle"
          >
            <div class="px-4 py-3 border-b border-white/10 flex-shrink-0 bg-white/5 space-y-2">
              <div class="flex items-center justify-between gap-2">
                <Skeleton width="5.5rem" height="1.25rem" />
                <Skeleton :width="filterSkeletonWidth" height="1.75rem" />
              </div>
              <div class="flex gap-2">
                <Skeleton v-for="i in 4" :key="`filter-${i}`" width="3.25rem" height="1.75rem" />
              </div>
            </div>
            <div class="flex-1 min-h-0 px-3 py-2 overflow-hidden w-full min-w-0">
              <div class="h-full space-y-2">
                <Skeleton
                  v-for="i in 6"
                  :key="`chapter-skeleton-${i}`"
                  width="100%"
                  :height="chapterSkeletonHeight"
                />
              </div>
            </div>
          </div>
        </component>

        <component
          :is="contentPanelComponent"
          v-bind="previewPanelProps"
          :class="previewPanelWrapperClass"
        >
          <div
            class="h-full flex flex-col bg-night-900/50 rounded-lg border border-white/10 overflow-hidden"
            :style="splitPanelContainerStyle"
          >
            <div class="px-4 py-3 border-b border-white/10 flex-shrink-0 bg-white/5">
              <Skeleton width="65%" height="1.5rem" class="mb-2" />
              <Skeleton width="40%" height="0.875rem" />
            </div>
            <div class="flex-1 overflow-y-auto px-6 py-4" :style="contentScrollStyle">
              <div class="space-y-2">
                <Skeleton v-for="i in 14" :key="`preview-${i}`" width="100%" height="1rem" />
              </div>
            </div>
          </div>
        </component>
      </component>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject } from 'vue';
import Skeleton from 'primevue/skeleton';
import { SCRAPER_DIALOG_KEY } from './scraper-dialog-context';

const {
  isPhone,
  mobileShowPreview,
  showNovelInfo,
  novelInfoClass,
  contentContainerComponent,
  contentContainerProps,
  contentContainerClass,
  contentContainerStyle,
  contentPanelComponent,
  chapterPanelProps,
  chapterPanelWrapperClass,
  previewPanelProps,
  previewPanelWrapperClass,
  splitPanelContainerStyle,
  contentScrollStyle,
} = inject(SCRAPER_DIALOG_KEY)!;

// 信息骨架块的显示条件
const showInfoSkeleton = computed(
  () => showNovelInfo.value && (!isPhone.value || !mobileShowPreview.value),
);
const filterSkeletonWidth = computed(() => (isPhone.value ? '2.5rem' : '4.5rem'));
const chapterSkeletonHeight = computed(() => (isPhone.value ? '3.75rem' : '4.25rem'));
</script>
