<script setup lang="ts">
/**
 * 手机端段落元信息行：§ 序号 + 翻译 / 润色 / 校对 / 已译状态徽章。
 *
 * 从 BookMobileParagraphList 抽出以降低段落模板的认知复杂度（状态 v-if 链）。
 * 样式由 BookDetailsMobile.vue 的非 scoped 样式表统一提供（mbr-p-meta* 前缀唯一）。
 */
import { injectBookDetailsPage } from 'src/composables/book-details/useBookDetailsPage';
import type { Paragraph } from 'src/models/novel';

const ctx = injectBookDetailsPage();

defineProps<{
  p: Paragraph;
  index: number;
}>();
</script>

<template>
  <div class="mbr-p-meta">
    <span class="mbr-p-num">§ {{ String(index + 1).padStart(3, '0') }}</span>
    <template v-if="ctx.translatingParagraphIds.value.has(p.id)">
      <span class="mbr-badge mbr-badge-blue">
        <i class="pi pi-spin pi-spinner" aria-hidden="true" />翻译中…
      </span>
    </template>
    <template v-else-if="ctx.polishingParagraphIds.value.has(p.id)">
      <span class="mbr-badge mbr-badge-blue">
        <i class="pi pi-spin pi-spinner" aria-hidden="true" />润色中…
      </span>
    </template>
    <template v-else-if="ctx.proofreadingParagraphIds.value.has(p.id)">
      <span class="mbr-badge mbr-badge-blue">
        <i class="pi pi-spin pi-spinner" aria-hidden="true" />校对中…
      </span>
    </template>
    <template v-else-if="(p.translations?.length ?? 0) > 0">
      <i class="pi pi-sparkles mbr-p-meta-ai" aria-hidden="true" />
      <span v-if="ctx.getParagraphModelName(p)">{{ ctx.getParagraphModelName(p) }}</span>
    </template>
    <!-- 空段 / 待翻译 状态不再展示徽章，仅以 §编号 标注段落位置 -->
  </div>
</template>
