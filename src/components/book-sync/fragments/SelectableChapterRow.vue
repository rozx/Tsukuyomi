<script setup lang="ts">
/** 可勾选的章节行（新章节与有更新共用）：勾选框 + 标题，右侧操作与下方展开内容由插槽提供。 */
import { injectBookSync } from 'src/composables/book-sync/useBookSync';

defineProps<{ url: string; title: string }>();
const { selected, toggle } = injectBookSync();
</script>

<template>
  <li>
    <div class="bsw-row">
      <input
        type="checkbox"
        class="bsw-check"
        :data-url="url"
        :checked="selected.has(url)"
        :aria-label="`选择${title}`"
        @change="toggle(url)"
      />
      <span class="bsw-title" :title="title">{{ title }}</span>
      <slot />
    </div>
    <div v-if="$slots.detail" class="bsw-detail">
      <slot name="detail" />
    </div>
  </li>
</template>

<style scoped src="../book-sync.css"></style>
