<script setup lang="ts">
/**
 * 手机端 Overview 顶部 Hero（封面 + 作者 / 标题 / 标签 / 进度条）。
 * 从 BookDetailsMobileOverview 抽出以降低其模板复杂度。样式由 BookDetailsMobile.vue 提供。
 */
import { computed } from 'vue';
import { injectBookDetailsPage } from 'src/composables/book-details/useBookDetailsPage';

const ctx = injectBookDetailsPage();

const heroTags = computed(() => ctx.book.value?.tags?.slice(0, 3) ?? []);
// 封面加载失败时回退到同一封面 URL（触发 CoverService 兜底占位图）
const onCoverError = (e: Event) => {
  const t = e.target as HTMLImageElement;
  if (ctx.book.value) t.src = ctx.getCoverUrl(ctx.book.value);
};
</script>

<template>
  <section v-if="ctx.book.value" class="mbd-hero">
    <div class="mbd-hero-cover-wrap">
      <img
        :src="ctx.getCoverUrl(ctx.book.value)"
        :alt="ctx.book.value.title"
        class="mbd-hero-cover"
        @error="onCoverError"
      />
    </div>
    <div class="mbd-hero-body">
      <div v-if="ctx.book.value.author" class="mbd-hero-author">
        {{ ctx.book.value.author }}
      </div>
      <h1 class="mbd-hero-title">{{ ctx.book.value.title }}</h1>
      <div v-if="heroTags.length" class="mbd-hero-badges">
        <span v-for="tag in heroTags" :key="tag" class="mbd-badge">{{ tag }}</span>
      </div>
      <div class="mbd-hero-progress">
        <div class="mbd-prog">
          <div class="mbd-prog-fill" :style="{ width: `${ctx.mobileBookProgress.value}%` }" />
        </div>
        <span class="mbd-prog-value">{{ ctx.mobileBookProgress.value }}%</span>
      </div>
    </div>
  </section>
</template>
