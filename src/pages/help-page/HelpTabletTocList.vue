<script setup lang="ts">
/**
 * 平板帮助页右侧 TOC 列表。从 HelpPageTablet 抽出以降低其模板圈复杂度。
 * 外层 <aside class="ht-toc"> / <nav class="ht-toc-list"> 仍由父组件持有。
 * 点击目录项通过 select 事件冒泡，由父组件处理 portrait 抽屉收起逻辑。
 */
import { injectHelpPage } from 'src/composables/help-page/useHelpPage';
import type { TocItem } from 'src/composables/help-page/useHelpPage';

defineEmits<{ select: [id: string] }>();

const ctx = injectHelpPage();

const tocItemClass = (item: TocItem) => [
  ctx.activeHeading.value === item.id ? 'ht-toc-item--active' : '',
  item.level === 1 ? 'ht-toc-item--l1' : '',
  item.level === 2 ? 'ht-toc-item--l2' : '',
  item.level === 3 ? 'ht-toc-item--l3' : '',
  item.level === 4 ? 'ht-toc-item--l4' : '',
];
</script>

<template>
  <a
    v-for="item in ctx.toc.value"
    :key="item.id"
    :href="`#${item.id}`"
    class="ht-toc-item"
    :class="tocItemClass(item)"
    @click.prevent="$emit('select', item.id)"
  >
    {{ item.text }}
  </a>
</template>

<style scoped>
.ht-toc-item {
  display: block;
  padding: 7px 10px;
  margin-bottom: 2px;
  border-radius: 8px;
  border-left: 2px solid transparent;
  color: var(--moon-50-opacity-60);
  font-size: 12px;
  line-height: 1.4;
  text-decoration: none;
  transition:
    background 150ms cubic-bezier(0.4, 0, 0.2, 1),
    color 150ms cubic-bezier(0.4, 0, 0.2, 1),
    border-color 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.ht-toc-item:hover {
  background: var(--white-opacity-4);
  color: var(--moon-50-opacity-100);
  border-left-color: var(--moon-50-opacity-20); /* token: moon-50 @ 20% */
}

.ht-toc-item--active {
  color: var(--tsukuyomi-300); /* token: tsukuyomi-300 */
  background: var(--tsukuyomi-opacity-15);
  border-left-color: var(--tsukuyomi-300); /* token: tsukuyomi-300 */
  font-weight: 500;
}

.ht-toc-item--l1 {
  font-size: 13px;
  font-weight: 600;
}

.ht-toc-item--l2 {
  font-size: 12px;
  font-weight: 500;
  margin-left: 8px;
}

.ht-toc-item--l3 {
  font-size: 11px;
  margin-left: 20px;
  opacity: 0.9;
}

.ht-toc-item--l4 {
  font-size: 11px;
  margin-left: 28px;
  opacity: 0.75;
}
</style>
