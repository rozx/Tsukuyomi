<script setup lang="ts">
/**
 * 导入工作台的统一页头（桌面与平板共用）：任务数，以及当前任务的来源与章节数。
 * showBack 时在眉标左侧显示「全部任务」，返回任务列表（平板任务内使用）。
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import PageHeader from 'src/components/layout/PageHeader.vue';
import { injectImportPage } from 'src/composables/import-page/useImportPage';
import { useImportWorkspaceStore } from 'src/stores/import-workspace';

withDefaults(defineProps<{ showBack?: boolean }>(), { showBack: false });
const ctx = injectImportPage();
const store = useImportWorkspaceStore();
const { t } = useI18n();

// 未选任务时来源与章节显示 —
const stats = computed(() => [
  { label: t('importUi.page.tasks'), value: store.tasks.length },
  { label: t('importUi.page.sources'), value: store.task ? store.sources.length : '—' },
  {
    label: t('importUi.page.chapters'),
    value: store.task ? store.task.draft.chapters.length : '—',
  },
]);
</script>

<template>
  <PageHeader
    :eyebrow="t('importUi.page.title')"
    :title="t('importUi.page.workbench')"
    :description="t('importUi.page.summary')"
    :stats="stats"
    :back-label="showBack ? t('importUi.page.allTasks') : ''"
    @back="ctx.closeTask()"
  />
</template>
