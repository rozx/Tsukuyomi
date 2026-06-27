<script setup lang="ts">
import Badge from 'primevue/badge';
import type { Paragraph } from 'src/models/novel';

// 预览模式单段渲染：有译文显示译文，无译文但有原文显示"未翻译"徽章 + 原文。
defineProps<{
  paragraph: Paragraph;
  translationText: string;
}>();
</script>

<template>
  <template v-if="translationText">
    <p class="translation-text">{{ translationText }}</p>
  </template>
  <template v-else-if="paragraph.text.trim()">
    <div class="untranslated-content">
      <Badge value="未翻译" severity="warning" class="untranslated-badge" />
      <p class="original-text">{{ paragraph.text }}</p>
    </div>
  </template>
</template>
