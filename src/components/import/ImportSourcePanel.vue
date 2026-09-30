<script setup lang="ts">
/**
 * 来源管理：添加来源，按父子关系列出来源（可按状态筛选，区分月詠发现的来源），
 * 并查看已保存的内容。宽屏时列表与内容并排。
 */
import { computed, nextTick, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useConfirm } from 'primevue/useconfirm';
import { injectImportPage } from 'src/composables/import-page/useImportPage';
import { useImportWorkspaceStore } from 'src/stores/import-workspace';
import {
  sourceOverview,
  sourceRows,
  type SourceFilter,
} from 'src/composables/import-page/import-workspace-overview';
import type { ImportSource } from 'src/models/import';
import ImportSourceAdd from './ImportSourceAdd.vue';
import ImportSourceRow from './ImportSourceRow.vue';
import ImportSourceViewer from './ImportSourceViewer.vue';
import ImportFilterChips from './ImportFilterChips.vue';
import { SOURCE_STATUS } from './import-labels';

const ctx = injectImportPage();
const store = useImportWorkspaceStore();
const { t } = useI18n();
const confirm = useConfirm();
const removeDisabled = computed(
  () =>
    store.isRunning ||
    Boolean(store.task?.run) ||
    ['apply', 'revert', 'remove-source'].includes(store.pendingAction ?? '') ||
    ['applying', 'reverting'].includes(store.task?.state ?? ''),
);

const confirmRemove = (source: ImportSource) => {
  confirm.require({
    header: t('importUi.sources.removeHeader'),
    message: t('importUi.sources.removeMessage', { name: source.relativePath || source.name }),
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: t('importUi.sources.removeHeader'),
    rejectLabel: t('importUi.common.cancel'),
    acceptClass: 'p-button-danger',
    accept: () => {
      void store.removeSource(source.id, source.taskId).then((removed) => {
        if (
          removed &&
          store.selectedTaskId === source.taskId &&
          !store.sources.some((entry) => entry.id === ctx.selectedSourceId.value)
        )
          ctx.closeSource();
      });
    },
  });
};

const STATUS_ORDER: ImportSource['status'][] = [
  'registered',
  'inspected',
  'extracted',
  'failed',
  'excluded',
];

const filter = ref<SourceFilter>('all');
const overview = computed(() => sourceOverview(store.sources));
const filters = computed(() => [
  { id: 'all' as SourceFilter, label: t('importUi.common.all'), count: overview.value.total },
  ...STATUS_ORDER.map((status) => ({
    id: status as SourceFilter,
    label: t(SOURCE_STATUS[status].label),
    count: overview.value.status[status],
  })).filter((entry) => entry.count > 0),
]);
// 来源变化后原筛选可能已无条目
watch(filters, (entries) => {
  if (!entries.some((entry) => entry.id === filter.value)) filter.value = 'all';
});
const rows = computed(() => sourceRows(store.sources, filter.value));
const origins = computed(() => {
  const { total, agent, metadataOnly } = overview.value;
  const parts = [t('importUi.sources.userProvided', { count: total - agent })];
  if (agent) parts.push(t('importUi.sources.agentFound', { count: agent }));
  if (metadataOnly) parts.push(t('importUi.sources.metadataOnlyCount', { count: metadataOnly }));
  return parts.join(' · ');
});

const referenced = computed(
  () => new Set((ctx.preview.value?.sources ?? []).map((source) => source.id)),
);
const selectedSource = computed(
  () =>
    store.sources.find((source) => source.id === ctx.selectedSourceId.value) ??
    ctx.preview.value?.sources.find((source) => source.id === ctx.selectedSourceId.value),
);
const viewer = ref<{ $el: HTMLElement } | null>(null);
// 窄容器里内容区在列表下方：打开后滚到可见处（并排时已可见，不会移动）
const open = async (sourceId: string) => {
  await ctx.showSource(sourceId);
  await nextTick();
  viewer.value?.$el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
};
</script>

<template>
  <section class="isp" :aria-label="t('importUi.sources.title')">
    <div class="isp-layout" :class="{ 'isp-layout--split': selectedSource }">
      <div class="isp-main">
        <ImportSourceAdd />

        <section class="ipl-card">
          <div class="ipl-card-head">
            <h3 class="ipl-card-title">
              <i class="pi pi-folder" aria-hidden="true" />{{ t('importUi.sources.title') }}
              <span class="ipl-count">{{ overview.total }}</span>
            </h3>
            <ImportFilterChips
              v-if="filters.length > 2"
              v-model="filter"
              :filters="filters"
              :label="t('importUi.sources.filter')"
            />
          </div>
          <p v-if="overview.total" class="ipl-muted">{{ origins }}</p>

          <div v-if="!overview.total" class="isp-empty">
            <i class="pi pi-inbox" aria-hidden="true" />
            <span>{{ t('importUi.sources.empty') }}</span>
          </div>
          <ul v-else class="isp-list">
            <ImportSourceRow
              v-for="{ source, depth } in rows"
              :key="source.id"
              :source="source"
              :depth="depth"
              :selected="ctx.selectedSourceId.value === source.id"
              :referenced="referenced.has(source.id)"
              :remove-disabled="removeDisabled"
              @open="(id: string) => void open(id)"
              @remove="confirmRemove(source)"
            />
          </ul>
        </section>
      </div>

      <ImportSourceViewer
        v-if="selectedSource"
        ref="viewer"
        :source="selectedSource"
        class="isp-viewer"
      />
    </div>
  </section>
</template>

<style scoped src="./import-card.css"></style>
<style scoped>
.isp {
  container-type: inline-size;
  height: 100%;
  min-height: 0;
}

.isp-layout {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.isp-main {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  min-width: 0;
}

.isp-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 1.25rem 0.5rem;
  font-size: 0.78rem;
  text-align: center;
  color: rgba(226, 232, 240, 0.55);
}

.isp-empty i {
  font-size: 1.4rem;
  color: rgba(165, 180, 252, 0.6);
}

.isp-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

/* 宽容器：列表与内容并排并撑满可视高度，两栏各自滚动，外层不滚动 */
@container (min-width: 52rem) {
  .isp-layout--split {
    display: grid;
    height: 100%;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr);
  }

  .isp-layout--split .isp-main {
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .isp-layout--split .isp-viewer {
    min-height: 0;
  }

  .isp-layout--split :deep(.isv-text) {
    flex: 1;
    min-height: 0;
    max-height: none;
  }
}
</style>
