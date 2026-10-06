<script setup lang="ts">
import { useI18n } from 'vue-i18n';

import type { TestResultItem, TestTarget } from './batch-query-types';
const { t } = useI18n();

defineProps<{
  results: TestResultItem[];
  targetLabel: string;
  lastTarget: TestTarget | null;
}>();

const emit = defineEmits<{
  select: [item: TestResultItem];
}>();
</script>

<template>
  <div class="results-heading">
    <span>
      {{ t('embeddingUi.queryResults', { target: targetLabel }) }}
      <span class="results-count">{{ results.length }}</span>
    </span>
    <span class="results-hint">{{
      t('embeddingUi.clickResult', {
        action:
          lastTarget === 'chapter'
            ? t('embeddingUi.navigateChapter')
            : t('embeddingUi.viewDetails'),
      })
    }}</span>
  </div>

  <div v-if="results.length === 0" class="results-empty" role="status">
    <i class="pi pi-search" aria-hidden="true" />
    <span>{{ t('embeddingUi.noMatches') }}</span>
  </div>

  <ul v-else class="results-list">
    <li
      v-for="(item, idx) in results"
      :key="idx"
      role="button"
      tabindex="0"
      class="result-row"
      @click="emit('select', item)"
      @keydown.enter.prevent="emit('select', item)"
      @keydown.space.prevent="emit('select', item)"
    >
      <div class="result-heading">
        <span class="result-rank">{{ idx + 1 }}</span>
        <span class="result-title" :title="item.title">
          {{
            item.title ||
            t(item.kind === 'chapter' ? 'embeddingUi.noTitle' : 'embeddingUi.noSummary')
          }}
        </span>
        <span class="result-score" :title="t('embeddingUi.queryScore')">
          {{ item.score.toFixed(3) }}
        </span>
      </div>
      <div v-if="item.preview" class="line-clamp-3 preview-text">
        {{ item.preview }}
      </div>
    </li>
  </ul>
</template>

<style scoped>
.results-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 6px 12px;
  color: var(--moon-opacity-75);
  font-size: 11px;
}

.results-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  margin-left: 5px;
  padding: 0 6px;
  border-radius: 6px;
  background: var(--white-opacity-6);
  color: var(--moon-opacity-70);
  font-variant-numeric: tabular-nums;
}

.results-hint {
  color: var(--moon-opacity-45);
  font-size: 10px;
}

.results-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 0;
  margin: 0;
  list-style: none;
  min-width: 0;
}

.result-row {
  display: flex;
  flex-direction: column;
  flex-wrap: nowrap;
  gap: 8px;
  min-width: 0;
  padding: 13px 14px;
  background: var(--white-opacity-3);
  border: 1px solid var(--white-opacity-8);
  border-radius: 10px;
  overflow: hidden;
  cursor: pointer;
  transition:
    background 150ms ease,
    border-color 150ms ease;
}

.result-heading {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
}

.result-rank {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  border-radius: 6px;
  background: var(--white-opacity-5);
  color: var(--moon-opacity-50);
  font-family: var(--font-mono);
  font-size: 10px;
}

.result-title {
  flex: 1;
  min-width: 0;
  color: var(--moon-opacity-90);
  font-size: 12px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result-score {
  flex-shrink: 0;
  padding: 3px 6px;
  border: 1px solid rgba(109, 136, 168, 0.18);
  border-radius: 6px;
  background: rgba(109, 136, 168, 0.08);
  color: #a3b7cf;
  font-family: var(--font-mono);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}

.results-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 28px 16px;
  border: 1px dashed var(--white-opacity-10);
  border-radius: 10px;
  color: var(--moon-opacity-50);
  font-size: 12px;
}

.results-empty i {
  color: var(--moon-opacity-40);
  font-size: 20px;
}

.result-row:hover {
  background-color: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.15);
}
.result-row:focus-visible {
  outline: 2px solid #a3b7cf;
  outline-offset: 2px;
}
.preview-text {
  color: var(--moon-opacity-65);
  font-size: 12px;
  line-height: 1.65;
  overflow-wrap: anywhere;
  word-break: break-word;
}
</style>
