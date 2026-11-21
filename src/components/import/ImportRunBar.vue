<script setup lang="ts">
/**
 * 当前任务的标题（可改名）、状态、章节进度与需要注意的提示（桌面 / 平板工作区顶部）。
 * 整理完成只显示「可预览」，不等于已导入书库；目录完整性未确认时只报告「已发现」数量。
 * 运行控制在三步引导底部的主按钮里，来源进度在「来源」一步上。
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import Tag from 'primevue/tag';
import InputText from 'primevue/inputtext';
import { useImportWorkspaceStore } from 'src/stores/import-workspace';
import { useImportTaskName } from 'src/composables/import-page/useImportTaskName';
import { TASK_STATE } from './import-labels';
import ImportRunNotices from './ImportRunNotices.vue';

const store = useImportWorkspaceStore();
const { t } = useI18n();

const task = computed(() => store.task);
const { name, save: saveName } = useImportTaskName();

const state = computed(() => (task.value ? TASK_STATE[task.value.state] : undefined));

const chapterProgress = computed(() => {
  const draft = task.value?.draft;
  if (!draft) return '';
  const ready = draft.chapters.filter((chapter) => chapter.status === 'ready').length;
  const { completeness } = draft;
  if (completeness.confirmed && completeness.knownTotal !== undefined) {
    const missing = completeness.missing.length;
    const known = t('importUi.runBar.knownProgress', { total: completeness.knownTotal, ready });
    return missing ? `${known}${t('importUi.runBar.missingSuffix', { count: missing })}` : known;
  }
  return t('importUi.runBar.foundProgress', { found: draft.chapters.length, ready });
});
</script>

<template>
  <section v-if="task" class="irb" :aria-label="t('importUi.runBar.region')">
    <div class="irb-row">
      <InputText
        v-model="name"
        class="irb-name"
        :aria-label="t('importUi.runBar.name')"
        maxlength="80"
        @blur="saveName"
        @keydown.enter="saveName"
      />
      <Tag v-if="state" :value="t(state.label)" :severity="state.severity" />
    </div>

    <div class="irb-progress">
      <span>{{ chapterProgress }}</span>
      <span v-if="task.batchProgress" aria-live="polite">
        {{
          t('importUi.runBar.batch', {
            ready: task.batchProgress.ready,
            total: task.batchProgress.total,
            pending: task.batchProgress.pending,
          })
        }}
        <template v-if="task.batchProgress.failed">
          · {{ t('importUi.runBar.batchFailed', { count: task.batchProgress.failed }) }}</template
        >
      </span>
    </div>

    <ImportRunNotices />
  </section>
</template>

<style scoped>
.irb {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.irb-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.irb-name {
  flex: 1 1 12rem;
  min-width: 0;
  font-weight: 600;
}

.irb-progress {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 1rem;
  font-size: 0.75rem;
  color: rgba(247, 244, 236, 0.6);
}
</style>
