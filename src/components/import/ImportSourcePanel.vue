<script setup lang="ts">
/**
 * 来源管理：添加来源、按父子关系列出来源（区分用户提供与月詠发现），并查看已保存的内容。
 */
import { computed } from 'vue';
import { injectImportPage } from 'src/composables/import-page/useImportPage';
import { useImportWorkspaceStore } from 'src/stores/import-workspace';
import type { ImportSource } from 'src/models/import';
import ImportSourceAdd from './ImportSourceAdd.vue';
import ImportSourceRow from './ImportSourceRow.vue';
import ImportSourceViewer from './ImportSourceViewer.vue';

const ctx = injectImportPage();
const store = useImportWorkspaceStore();

/** 按父子关系展开成带缩进的行；父来源不在列表中时作为根。 */
const rows = computed(() => {
  const ids = new Set(store.sources.map((source) => source.id));
  const children = new Map<string, ImportSource[]>();
  const roots: ImportSource[] = [];
  for (const source of store.sources) {
    const parent = source.parentSourceId;
    if (parent && ids.has(parent)) children.set(parent, [...(children.get(parent) ?? []), source]);
    else roots.push(source);
  }
  const result: { source: ImportSource; depth: number }[] = [];
  const visit = (source: ImportSource, depth: number) => {
    result.push({ source, depth });
    for (const child of children.get(source.id) ?? []) visit(child, depth + 1);
  };
  for (const root of roots) visit(root, 0);
  return result;
});

const referenced = computed(
  () => new Set((ctx.preview.value?.sources ?? []).map((source) => source.id)),
);
const selectedSource = computed(() =>
  store.sources.find((source) => source.id === ctx.selectedSourceId.value),
);
const open = (sourceId: string) => void ctx.showSource(sourceId);
</script>

<template>
  <section class="isp" aria-label="来源">
    <ImportSourceAdd />

    <p v-if="!rows.length" class="isp-empty">还没有来源。</p>
    <ul v-else class="isp-list">
      <ImportSourceRow
        v-for="{ source, depth } in rows"
        :key="source.id"
        :source="source"
        :depth="depth"
        :selected="ctx.selectedSourceId.value === source.id"
        :referenced="referenced.has(source.id)"
        @open="open"
      />
    </ul>

    <ImportSourceViewer v-if="selectedSource" :source="selectedSource" />
  </section>
</template>

<style scoped>
.isp {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  min-height: 0;
}

.isp-empty {
  font-size: 0.75rem;
  color: rgba(226, 232, 240, 0.55);
  margin: 0;
}

.isp-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
  min-height: 0;
}
</style>
