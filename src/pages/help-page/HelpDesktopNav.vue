<script setup lang="ts">
/**
 * 桌面帮助页左侧文档导航。从 HelpPageDesktop 抽出以降低其模板圈复杂度。
 * 自行注入 useHelpPage 上下文。
 */
import { injectHelpPage } from 'src/composables/help-page/useHelpPage';

const ctx = injectHelpPage();

const categoryChevron = (category: string) =>
  ctx.expandedCategories.value.has(category) ? 'pi-chevron-down' : 'pi-chevron-right';
</script>

<template>
  <aside class="help-nav">
    <header class="help-nav-brand">
      <div class="help-nav-brand-icon">
        <i class="pi pi-book" aria-hidden="true" />
      </div>
      <div class="help-nav-brand-text">
        <span class="help-nav-brand-eyebrow">HELP CENTER</span>
        <span class="help-nav-brand-title">帮助中心</span>
      </div>
    </header>

    <nav class="help-nav-tree">
      <div
        v-for="(docs, category) in ctx.groupedDocuments.value"
        :key="category"
        class="help-nav-group"
      >
        <button
          type="button"
          class="help-nav-group-head"
          @click="ctx.toggleCategory(category as string)"
        >
          <span class="help-nav-group-label">{{ category }}</span>
          <i
            class="pi help-nav-group-chev"
            :class="categoryChevron(category as string)"
            aria-hidden="true"
          />
        </button>
        <ul
          v-show="ctx.expandedCategories.value.has(category as string)"
          class="help-nav-group-list"
        >
          <li v-for="doc in docs" :key="doc.id">
            <button
              type="button"
              class="help-nav-item"
              :class="{
                'help-nav-item--active': ctx.currentDoc.value?.id === doc.id,
              }"
              @click="ctx.navigateToDocument(doc)"
            >
              {{ doc.title }}
            </button>
          </li>
        </ul>
      </div>
    </nav>
  </aside>
</template>

<style scoped>
.help-nav {
  width: 17rem;
  height: 100%;
  flex-shrink: 0;
  border-right: 1px solid var(--white-opacity-6);
  background: var(--shell-opacity-45); /* token: night-500 @ 45% */
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.help-nav-brand {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.95rem 1rem 0.85rem;
  border-bottom: 1px solid var(--white-opacity-6);
  flex-shrink: 0;
}

.help-nav-brand-icon {
  width: 2.2rem;
  height: 2.2rem;
  border-radius: 7px;
  background: var(--tsukuyomi-opacity-14); /* token: tsukuyomi-500 @ 14% */
  border: 1px solid var(--tsukuyomi-opacity-22);
  color: var(--tsukuyomi-300); /* token: tsukuyomi-300 */
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.help-nav-brand-icon .pi {
  font-size: 1rem;
}

.help-nav-brand-text {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  min-width: 0;
}

.help-nav-brand-eyebrow {
  font-family:
    'Noto Sans SC',
    'PingFang SC',
    -apple-system,
    sans-serif;
  font-size: 0.56rem;
  font-weight: 600;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--accent-silver);
}

.help-nav-brand-title {
  font-family:
    'Noto Serif JP',
    'Songti SC',
    serif;
  font-size: 1rem;
  font-weight: 600;
  color: var(--moon-opacity-95);
}

.help-nav-tree {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0.75rem 0.6rem 1rem;
}

.help-nav-group {
  margin-bottom: 0.5rem;
}

.help-nav-group-head {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.4rem 0.55rem;
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--accent-silver);
  transition: color 160ms cubic-bezier(0.4, 0, 0.2, 1);
}

.help-nav-group-head:hover {
  color: var(--moon-opacity-100);
}

.help-nav-group-label {
  font-family:
    'Noto Sans SC',
    'PingFang SC',
    -apple-system,
    sans-serif;
  font-size: 0.6rem;
  font-weight: 600;
  letter-spacing: 0.22em;
  text-transform: uppercase;
}

.help-nav-group-chev {
  font-size: 0.55rem;
  opacity: 0.55;
}

.help-nav-group-list {
  list-style: none;
  margin: 0.2rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.12rem;
}

.help-nav-item {
  width: 100%;
  text-align: left;
  padding: 0.5rem 0.7rem;
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--moon-50-opacity-72); /* token: moon-50 @ 72% */
  font-family: inherit;
  font-size: 0.82rem;
  cursor: pointer;
  transition: all 160ms cubic-bezier(0.4, 0, 0.2, 1);
  line-height: 1.35;
}

.help-nav-item:hover {
  background: var(--white-opacity-4);
  color: var(--moon-opacity-100);
}

.help-nav-item--active {
  background: var(--tsukuyomi-200-opacity-8); /* token: tsukuyomi-200 @ 8% */
  border-color: var(--tsukuyomi-300-opacity-22);
  color: var(--moon-opacity-100);
}
</style>
