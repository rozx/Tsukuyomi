<script setup lang="ts">
/** 方案的章节变化：按新增／更新／重组筛选的列表。 */
import { computed, ref, watch } from 'vue';
import type { ImportPlan } from 'src/models/import';

type Kind = NonNullable<ImportPlan['chapterChanges']>[number]['kind'];

const props = defineProps<{ plan: ImportPlan }>();

const KINDS: { id: Kind; label: string }[] = [
  { id: 'insert', label: '新增' },
  { id: 'update', label: '更新' },
  { id: 'restructure', label: '重组' },
];
const KIND_LABEL: Record<Kind, string> = { insert: '新增', update: '更新', restructure: '重组' };

const filter = ref<Kind | 'all'>('all');
const changes = computed(() => props.plan.chapterChanges ?? []);
const filters = computed(() => [
  { id: 'all' as const, label: '全部', count: changes.value.length },
  ...KINDS.map((kind) => ({
    ...kind,
    count: changes.value.filter((change) => change.kind === kind.id).length,
  })).filter((kind) => kind.count > 0),
]);
const shown = computed(() =>
  filter.value === 'all'
    ? changes.value
    : changes.value.filter((change) => change.kind === filter.value),
);
// 方案重新生成后原筛选可能已无条目
watch(filters, (entries) => {
  if (!entries.some((entry) => entry.id === filter.value)) filter.value = 'all';
});
</script>

<template>
  <section v-if="changes.length" class="ipl-card">
    <div class="ipl-card-head">
      <h3 class="ipl-card-title">
        <i class="pi pi-book" aria-hidden="true" />章节变化
        <span class="ipl-count">{{ changes.length }}</span>
      </h3>
      <div v-if="filters.length > 2" class="ipch-filters" role="group" aria-label="筛选章节变化">
        <button
          v-for="entry in filters"
          :key="entry.id"
          type="button"
          class="ipch-filter"
          :class="{ 'ipch-filter--active': filter === entry.id }"
          :aria-pressed="filter === entry.id"
          @click="filter = entry.id"
        >
          {{ entry.label }} {{ entry.count }}
        </button>
      </div>
    </div>
    <ol class="ipch-list">
      <li v-for="change in shown" :key="change.draftChapterId" class="ipch-row">
        <span class="ipch-kind" :class="`ipch-kind--${change.kind}`">
          {{ KIND_LABEL[change.kind] }}
        </span>
        <span class="ipch-title">{{ change.title }}</span>
      </li>
    </ol>
  </section>
</template>

<style scoped src="./import-plan.css"></style>
<style scoped>
.ipch-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}

.ipch-filter {
  padding: 0.15rem 0.6rem;
  border-radius: 999px;
  font-size: 0.72rem;
  color: rgba(226, 232, 240, 0.65);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.ipch-filter--active {
  color: rgb(224, 231, 255);
  background: rgba(99, 102, 241, 0.22);
  border-color: rgba(129, 140, 248, 0.45);
}

.ipch-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 20rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  scrollbar-width: thin;
}

.ipch-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.4rem 0.2rem;
  font-size: 0.8rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}

.ipch-row:last-child {
  border-bottom: none;
}

.ipch-kind {
  flex-shrink: 0;
  min-width: 2.6rem;
  text-align: center;
  padding: 0.05rem 0.4rem;
  border-radius: 6px;
  font-size: 0.68rem;
  font-weight: 600;
}

.ipch-kind--insert {
  color: rgb(134, 239, 172);
  background: rgba(34, 197, 94, 0.12);
}

.ipch-kind--update {
  color: rgb(147, 197, 253);
  background: rgba(59, 130, 246, 0.14);
}

.ipch-kind--restructure {
  color: rgb(253, 186, 116);
  background: rgba(249, 115, 22, 0.14);
}

.ipch-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
