<script setup lang="ts">
/** 变更集汇总：各类数量，以及大面积差异（可能是站点改版）的提示。 */
import { computed } from 'vue';
import { injectBookSync } from 'src/composables/book-sync/useBookSync';

const { changeset, drift } = injectBookSync();

const items = computed(() => {
  const value = changeset.value;
  if (!value) return [];
  return [
    { key: 'new', label: '新章节', count: value.new.length },
    { key: 'updated', label: '有更新', count: value.updated.length },
    { key: 'unchecked', label: '未检查', count: value.unchecked.length },
    { key: 'skipped', label: '已跳过', count: value.skipped.length },
    { key: 'failed', label: '失败', count: value.failed.length },
  ];
});
</script>

<template>
  <section class="cs" data-testid="bsw-summary">
    <div class="cs-grid">
      <div v-for="item in items" :key="item.key" class="cs-item" :class="`cs-item--${item.key}`">
        <span class="cs-label">{{ item.label }}</span>
        <span class="cs-value">{{ item.count }}</span>
      </div>
    </div>
    <div v-if="drift" class="ipl-banner ipl-banner--warn" role="alert">
      <i class="pi pi-exclamation-triangle" aria-hidden="true" />
      <span>
        已比对的章节中超过半数显示有更新，可能是站点改版或配方过期。请先查看几章差异再决定是否应用；
        有更新的章节不会被自动勾选。
      </span>
    </div>
  </section>
</template>

<style scoped src="../../import/import-card.css"></style>
<style scoped>
.cs {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.cs-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 0.5rem;
}

.cs-item {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: 0.55rem 0.7rem;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.035);
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.cs-label {
  font-size: 0.7rem;
  color: rgba(226, 232, 240, 0.55);
}

.cs-value {
  font-size: 1.15rem;
  font-weight: 600;
  color: rgba(226, 232, 240, 0.92);
}

.cs-item--new .cs-value {
  color: rgb(134, 239, 172);
}

.cs-item--updated .cs-value {
  color: rgb(147, 197, 253);
}

.cs-item--failed .cs-value {
  color: rgb(252, 165, 165);
}

@media (max-width: 640px) {
  .cs-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
</style>
