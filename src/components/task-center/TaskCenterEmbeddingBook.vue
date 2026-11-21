<script setup lang="ts">
/**
 * 任务中心「后台 · 向量化」区里当前书的部分（只在书籍详情页渲染）：
 * 旧向量提示与「重建」、书名与「补齐缺失」、「⋯」菜单（重建本书章节向量 / 测试查询 / 嵌入设置），
 * 以及章节、记忆两条「已嵌入 X / Y」进度。
 */
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { injectTaskCenter } from 'src/composables/task-center/useTaskCenter';

const { t } = useI18n();
const center = injectTaskCenter();
const bg = center.embedding;

const percent = (stats: { embedded: number; total: number }) =>
  stats.total === 0 ? 100 : Math.min(100, Math.round((stats.embedded / stats.total) * 100));

const staleItems = computed(() =>
  [
    bg.staleCounts.value.chapter > 0
      ? t('embeddingUi.staleChapters', { count: bg.staleCounts.value.chapter })
      : '',
    bg.staleCounts.value.memory > 0
      ? t('embeddingUi.staleMemories', { count: bg.staleCounts.value.memory })
      : '',
  ]
    .filter(Boolean)
    .join(' / '),
);

const rows = computed(() => [
  {
    key: 'chapter',
    label: t('embeddingUi.chapterEmbeddings'),
    stats: bg.chapterStats.value,
    percent: percent(bg.chapterStats.value),
  },
  {
    key: 'memory',
    label: t('embeddingUi.memoryEmbeddings'),
    stats: bg.memoryStats.value,
    percent: percent(bg.memoryStats.value),
  },
]);

// 「⋯」菜单：在区内就地展开，不另开浮层（popover 里的浮层会被当成外部点击而关闭任务中心）
const menuOpen = ref(false);
watch([center.embeddingCollapsed, bg.bookId], () => {
  menuOpen.value = false;
});
const menuItems = computed(() => [
  {
    key: 'rebuild',
    icon: 'pi pi-sync',
    label: t('embeddingUi.background.rebuildChapters'),
    disabled: bg.actionsDisabled.value,
    run: bg.rebuildChapters,
  },
  {
    key: 'test',
    icon: 'pi pi-search',
    label: t('embeddingUi.testQuery'),
    disabled: bg.testDisabled.value,
    run: bg.openTestQuery,
  },
  {
    key: 'settings',
    icon: 'pi pi-cog',
    label: t('embeddingUi.background.settings'),
    disabled: false,
    run: bg.openSettings,
  },
]);
const runMenu = (action: () => unknown) => {
  menuOpen.value = false;
  void action();
};
</script>

<template>
  <div v-if="bg.showStale.value" class="tc-emb-stale">
    <i class="pi pi-exclamation-triangle" aria-hidden="true" />
    <span class="tc-emb-stale-text">
      {{ t('embeddingUi.background.stale', { items: staleItems }) }}
    </span>
    <button
      type="button"
      class="tc-emb-btn tc-emb-btn--warn"
      :disabled="bg.actionsDisabled.value"
      @click="bg.rebuildStale"
    >
      {{ t('embeddingUi.background.rebuild') }}
    </button>
  </div>

  <div class="tc-emb-book">
    <i class="pi pi-book" aria-hidden="true" />
    <span class="tc-emb-book-title" :title="bg.book.value?.title">
      {{ bg.book.value?.title }}
    </span>
    <button
      type="button"
      class="tc-emb-btn"
      :disabled="bg.actionsDisabled.value"
      @click="bg.backfill"
    >
      <i class="pi pi-refresh" aria-hidden="true" />
      {{ t('embeddingUi.background.backfill') }}
    </button>
    <button
      type="button"
      class="tc-emb-more"
      :class="{ 'tc-emb-more--open': menuOpen }"
      :title="t('embeddingUi.background.more')"
      :aria-label="t('embeddingUi.background.more')"
      aria-haspopup="menu"
      :aria-expanded="menuOpen"
      @click="menuOpen = !menuOpen"
    >
      <i class="pi pi-ellipsis-h" aria-hidden="true" />
    </button>
  </div>

  <div v-if="menuOpen" class="tc-emb-menu" role="menu">
    <button
      v-for="item in menuItems"
      :key="item.key"
      type="button"
      role="menuitem"
      class="tc-emb-menu-item"
      :disabled="item.disabled"
      @click="runMenu(item.run)"
    >
      <i :class="item.icon" aria-hidden="true" />
      {{ item.label }}
    </button>
  </div>

  <div v-for="row in rows" :key="row.key" class="tc-emb-stat">
    <div class="tc-emb-stat-head">
      <span>{{ row.label }}</span>
      <span class="tc-emb-stat-count">
        {{
          t('embeddingUi.embeddedCount', { completed: row.stats.embedded, total: row.stats.total })
        }}
      </span>
    </div>
    <div
      class="tc-emb-bar"
      role="progressbar"
      :aria-label="row.label"
      :aria-valuenow="row.percent"
      aria-valuemin="0"
      aria-valuemax="100"
    >
      <span class="tc-emb-bar-fill" :style="{ width: `${row.percent}%` }" />
    </div>
  </div>
</template>

<style scoped>
.tc-emb-stale {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 8px;
  font-size: 11px;
  color: #e7c98a;
  background: rgba(231, 201, 138, 0.08);
  border: 1px solid rgba(231, 201, 138, 0.22);
}

.tc-emb-stale-text {
  flex: 1;
  min-width: 0;
}

.tc-emb-book {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.tc-emb-book > i {
  font-size: 11px;
  color: var(--moon-opacity-50);
}

.tc-emb-book-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--moon-opacity-90);
}

.tc-emb-btn,
.tc-emb-more,
.tc-emb-menu-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px solid var(--white-opacity-8);
  border-radius: 6px;
  background: var(--white-opacity-4);
  color: var(--btn-text-color);
  font-size: 11px;
  cursor: pointer;
  white-space: nowrap;
}

.tc-emb-btn {
  height: 24px;
  padding: 0 8px;
}

.tc-emb-btn i,
.tc-emb-menu-item i {
  font-size: 10px;
}

.tc-emb-more {
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
}

.tc-emb-btn:hover:not(:disabled),
.tc-emb-more:hover,
.tc-emb-more--open,
.tc-emb-menu-item:hover:not(:disabled) {
  background: var(--btn-text-hover-bg);
  color: var(--btn-text-hover-color);
}

.tc-emb-btn:disabled,
.tc-emb-menu-item:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.tc-emb-btn--warn {
  border-color: rgba(231, 201, 138, 0.35);
  color: #e7c98a;
  background: transparent;
}

.tc-emb-menu {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px;
  border-radius: 8px;
  border: 1px solid var(--white-opacity-8);
  background: rgba(0, 0, 0, 0.2);
}

.tc-emb-menu-item {
  justify-content: flex-start;
  height: 28px;
  padding: 0 8px;
  border-color: transparent;
  background: transparent;
  font-size: 12px;
}

.tc-emb-stat {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.tc-emb-stat-head {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 11px;
  color: var(--moon-opacity-70);
}

.tc-emb-stat-count {
  font-variant-numeric: tabular-nums;
  color: var(--moon-opacity-50);
}

.tc-emb-bar {
  height: 4px;
  border-radius: 2px;
  overflow: hidden;
  background: var(--white-opacity-10);
}

.tc-emb-bar-fill {
  display: block;
  height: 100%;
  background: #7fc29b;
  transition: width 300ms ease;
}
</style>
