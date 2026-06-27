<script setup lang="ts">
/**
 * 手机端 Overview 分段标签（章节 / 术语 / 角色 / 记忆）。
 * 从 BookDetailsMobileOverview 抽出以降低其模板复杂度。样式由 BookDetailsMobile.vue 提供。
 */
import { computed } from 'vue';
import { injectBookDetailsPage } from 'src/composables/book-details/useBookDetailsPage';
import type { MobileActiveTab } from 'src/composables/book-details/useBookDetailsPage';

const ctx = injectBookDetailsPage();

const termsTabLabel = computed(() =>
  ctx.stableTerminologies.value.length
    ? `术语 ${ctx.stableTerminologies.value.length}`
    : '术语',
);
const charactersTabLabel = computed(() =>
  ctx.stableCharacterSettings.value.length
    ? `角色 ${ctx.stableCharacterSettings.value.length}`
    : '角色',
);
// 当前激活标签（脚本侧比较，避免模板内 === 贡献分支复杂度）
const isChapters = computed(() => ctx.mobileActiveTab.value === 'chapters');
const isTerms = computed(() => ctx.mobileActiveTab.value === 'terms');
const isCharacters = computed(() => ctx.mobileActiveTab.value === 'characters');
const isMemory = computed(() => ctx.mobileActiveTab.value === 'memory');
const switchTo = (tab: MobileActiveTab) => ctx.switchMobileTab(tab);
</script>

<template>
  <div class="mbd-seg">
    <button class="mbd-seg-btn" :class="{ 'mbd-seg-btn-active': isChapters }" @click="switchTo('chapters')">
      章节
    </button>
    <button class="mbd-seg-btn" :class="{ 'mbd-seg-btn-active': isTerms }" @click="switchTo('terms')">
      {{ termsTabLabel }}
    </button>
    <button
      class="mbd-seg-btn"
      :class="{ 'mbd-seg-btn-active': isCharacters }"
      @click="switchTo('characters')"
    >
      {{ charactersTabLabel }}
    </button>
    <button class="mbd-seg-btn" :class="{ 'mbd-seg-btn-active': isMemory }" @click="switchTo('memory')">
      记忆
    </button>
  </div>
</template>
