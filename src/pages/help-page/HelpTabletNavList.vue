<script setup lang="ts">
/**
 * 平板帮助页左侧文档导航列表（卷/文档树）。从 HelpPageTablet 抽出以降低其模板圈复杂度。
 * 外层 <aside class="ht-nav"> / <nav class="ht-nav-list"> 仍由父组件持有（保留竖屏 drawer 的 :deep 规则）。
 * 选中文档时通过 select-doc 事件冒泡，由父组件处理 portrait 抽屉收起逻辑。
 */
import { injectHelpPage } from 'src/composables/help-page/useHelpPage';
import type { HelpDocument } from 'src/composables/help-page/useHelpPage';

defineEmits<{ selectDoc: [doc: HelpDocument] }>();

const ctx = injectHelpPage();
</script>

<template>
  <div
    v-for="(docs, category) in ctx.groupedDocuments.value"
    :key="category"
    class="ht-nav-group"
  >
    <button class="ht-nav-category" @click="ctx.toggleCategory(category as string)">
      <span>{{ category }}</span>
      <i class="pi" :class="ctx.categoryChevron(category as string)" aria-hidden="true" />
    </button>
    <ul v-show="ctx.isCategoryExpanded(category as string)" class="ht-nav-items">
      <li v-for="doc in docs" :key="doc.id">
        <button
          class="ht-nav-item"
          :class="{ 'ht-nav-item--active': ctx.isActiveDoc(doc) }"
          @click="$emit('selectDoc', doc)"
        >
          {{ doc.title }}
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.ht-nav-group {
  margin-bottom: 10px;
}

.ht-nav-category {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  background: transparent;
  border: none;
  color: var(--moon-50-opacity-45);
  font-family: inherit;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  cursor: pointer;
  transition: color 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.ht-nav-category:hover {
  color: var(--moon-50-opacity-75);
}

.ht-nav-category i {
  font-size: 10px;
  color: var(--moon-50-opacity-30); /* token: moon-50 @ 30% */
}

.ht-nav-items {
  margin-top: 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ht-nav-item {
  width: 100%;
  text-align: left;
  padding: 8px 12px;
  border: none;
  border-left: 2px solid transparent;
  background: transparent;
  color: var(--moon-50-opacity-80); /* token: moon-50 @ 80% */
  font-family: inherit;
  font-size: 13px;
  border-radius: 8px;
  cursor: pointer;
  transition:
    background 150ms cubic-bezier(0.4, 0, 0.2, 1),
    color 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.ht-nav-item:hover {
  background: var(--white-opacity-4);
  color: var(--moon-50-opacity-100);
}

.ht-nav-item--active {
  background: var(--tsukuyomi-opacity-20);
  border-left-color: var(--tsukuyomi-300); /* token: tsukuyomi-300 */
  color: var(--tsukuyomi-300); /* token: tsukuyomi-300 */
  font-weight: 500;
}
</style>
