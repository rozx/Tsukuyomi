<script setup lang="ts">
/** 方案的数量概览：导入章节数、段落变化，以及对已有译文的影响。 */
import { computed } from 'vue';
import type { ImportPlan } from 'src/models/import';

const props = defineProps<{ plan: ImportPlan }>();

const summary = computed(() => props.plan.summary);
const paragraphs = computed(() => {
  const value = summary.value;
  if (!value) return [];
  return [
    { label: '新增段落', value: value.insertedParagraphs },
    { label: '修订段落', value: value.revisedParagraphs },
    { label: '移动段落', value: value.movedParagraphs },
    { label: '删除段落', value: value.removedParagraphs },
  ];
});

const translation = computed(() => {
  const value = summary.value;
  if (!value) return undefined;
  return value.clearedVersions
    ? {
        loss: true,
        text: `将清空 ${value.clearedParagraphs} 段的 ${value.clearedVersions} 个译文版本`,
        detail: '这些段落的原文被修订，旧译文不再对应，导入时会被清空。',
      }
    : { loss: false, text: '不会清空任何已有译文', detail: '' };
});
</script>

<template>
  <div v-if="summary" class="ist">
    <div class="ist-card">
      <div class="ist-chapters">
        <span class="ist-chapters-value">{{ summary.selectedChapters }}</span>
        <span class="ist-chapters-label">章将导入</span>
        <span v-if="summary.partial" class="ist-partial">部分导入</span>
      </div>
      <dl class="ist-grid">
        <div
          v-for="entry in paragraphs"
          :key="entry.label"
          class="ist-cell"
          :class="{ 'ist-cell--zero': !entry.value }"
        >
          <dt class="ist-label">{{ entry.label }}</dt>
          <dd class="ist-value">{{ entry.value }}</dd>
        </div>
      </dl>
    </div>
    <div
      v-if="translation"
      class="ist-translation"
      :class="{ 'ist-translation--loss': translation.loss }"
    >
      <i
        class="pi"
        :class="translation.loss ? 'pi-exclamation-circle' : 'pi-shield'"
        aria-hidden="true"
      />
      <div>
        <div class="ist-translation-text">{{ translation.text }}</div>
        <div v-if="translation.detail" class="ist-translation-detail">{{ translation.detail }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ist {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  container-type: inline-size;
}

.ist-card {
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
  gap: 0.75rem 1.25rem;
  padding: 0.85rem 1rem;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.035);
  border: 1px solid rgba(255, 255, 255, 0.07);
}

.ist-chapters {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 5.5rem;
  padding-right: 1.25rem;
  border-right: 1px solid rgba(255, 255, 255, 0.08);
}

.ist-chapters-value {
  font-size: 1.8rem;
  font-weight: 600;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}

.ist-chapters-label {
  font-size: 0.74rem;
  color: rgba(226, 232, 240, 0.6);
}

.ist-partial {
  margin-top: 0.2rem;
  font-size: 0.68rem;
  color: rgb(253, 186, 116);
}

.ist-grid {
  flex: 1 1 16rem;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.5rem;
  margin: 0;
}

.ist-cell {
  display: flex;
  flex-direction: column-reverse;
  justify-content: center;
  gap: 0.1rem;
  min-width: 0;
}

.ist-value {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 600;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}

.ist-label {
  font-size: 0.7rem;
  color: rgba(226, 232, 240, 0.55);
  white-space: nowrap;
}

.ist-cell--zero .ist-value {
  color: rgba(226, 232, 240, 0.3);
}

/* 窄容器（手机、平板窄栏）：章节数横排在上，段落数在下 */
@container (max-width: 30rem) {
  .ist-card {
    flex-direction: column;
  }

  .ist-chapters {
    flex-direction: row;
    align-items: baseline;
    gap: 0.45rem;
    padding: 0 0 0.7rem;
    border-right: none;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .ist-partial {
    margin: 0 0 0 auto;
  }

  .ist-grid {
    flex-basis: auto;
  }
}

.ist-translation {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  padding: 0.65rem 0.8rem;
  border-radius: 12px;
  font-size: 0.8rem;
  color: rgb(134, 239, 172);
  background: rgba(34, 197, 94, 0.08);
  border: 1px solid rgba(34, 197, 94, 0.2);
}

.ist-translation > i {
  margin-top: 0.2rem;
}

.ist-translation--loss {
  color: rgb(253, 186, 116);
  background: rgba(249, 115, 22, 0.1);
  border-color: rgba(249, 115, 22, 0.28);
}

.ist-translation-text {
  font-weight: 600;
}

.ist-translation-detail {
  margin-top: 0.15rem;
  font-size: 0.74rem;
  color: rgba(226, 232, 240, 0.6);
}
</style>
