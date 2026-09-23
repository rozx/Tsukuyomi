<script setup lang="ts">
/**
 * 导入方案：先根据当前草稿生成真实差异（元信息、卷章、段落与译文影响），用户检查后确认才写书库。
 * 草稿修改后旧方案失效，需要重新检查；应用后如书籍有后续修改，撤销会被禁用并说明原因。
 */
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import Button from 'primevue/button';
import Message from 'primevue/message';
import { useConfirm } from 'primevue/useconfirm';
import { useImportWorkspaceStore } from 'src/stores/import-workspace';
import ImportPlanSummary from './ImportPlanSummary.vue';
import ImportPlanConflicts from './ImportPlanConflicts.vue';
import ImportHistoryList from './ImportHistoryList.vue';

const store = useImportWorkspaceStore();
const confirm = useConfirm();
const router = useRouter();

const task = computed(() => store.task);
const plan = computed(() => store.plan);
const awaitingAnswer = computed(() => {
  const question = task.value?.pendingQuestion;
  return Boolean(question?.required && !question.answer);
});
const alreadyApplied = computed(
  () => store.operations.find((entry) => entry.id === plan.value?.operationId)?.state === 'applied',
);
// 应用会把目标写回草稿并递增版本；已应用的方案不再提示「过时」
const stale = computed(
  () =>
    Boolean(plan.value && task.value && plan.value.draftRevision !== task.value.draft.revision) &&
    !alreadyApplied.value,
);
const blocked = computed(() => store.isRunning || awaitingAnswer.value);
const canPreview = computed(() => Boolean(task.value) && !blocked.value);
const canApply = computed(
  () =>
    Boolean(plan.value) &&
    !stale.value &&
    !plan.value!.conflicts.length &&
    !blocked.value &&
    !alreadyApplied.value &&
    store.pendingAction !== 'apply',
);
const previewLabel = computed(() => (plan.value ? '重新生成方案' : '生成导入方案'));
const applyLabel = computed(() => (alreadyApplied.value ? '已导入' : '确认导入'));

const requestApply = () => {
  const current = plan.value;
  const summary = current?.summary;
  if (!current || !summary) return;
  const title = current.book.title || '（未命名）';
  const target = current.targetKind === 'new' ? `新建《${title}》` : `更新《${title}》`;
  const cleared = summary.clearedVersions
    ? `将清空 ${summary.clearedParagraphs} 段原文已修订段落的 ${summary.clearedVersions} 个译文版本。`
    : '不会清空已有译文。';
  const partial = summary.partial ? '这是部分导入，缺失或完整性未确认的章节不会被处理。' : '';
  confirm.require({
    header: '确认导入到书库',
    message: `${target}：${summary.selectedChapters} 章。${cleared}${partial}确认后才会写入书库，可在书籍没有后续修改前整次撤销。`,
    icon: 'pi pi-exclamation-circle',
    acceptLabel: '确认导入',
    rejectLabel: '再检查一下',
    accept: () => void store.applyPlan(),
  });
};
const openBook = () => {
  if (plan.value) void router.push(`/books/${plan.value.targetBookId}`);
};
</script>

<template>
  <section v-if="task" class="ipp" aria-label="导入方案">
    <div class="ipp-actions">
      <Button
        icon="pi pi-list-check"
        :label="previewLabel"
        size="small"
        :disabled="!canPreview"
        :loading="store.pendingAction === 'preview'"
        @click="store.previewPlan"
      />
      <Button
        icon="pi pi-check"
        :label="applyLabel"
        size="small"
        severity="success"
        :disabled="!canApply"
        :loading="store.pendingAction === 'apply'"
        @click="requestApply"
      />
    </div>
    <p class="ipp-hint">
      方案只根据当前草稿计算实际变化，生成后也不会写入书库；只有点击「确认导入」并再次确认后才会应用。
    </p>

    <p v-if="!plan" class="ipp-hint">
      还没有导入方案。整理好草稿后生成方案，检查变化再决定是否导入。
    </p>
    <template v-else>
      <Message v-if="stale" severity="warn" :closable="false">
        草稿在生成方案后已修改，这个方案已过时，请重新生成后再确认。
      </Message>
      <Message v-if="alreadyApplied" severity="success" :closable="false">
        这个方案已导入书库。
        <Button label="打开小说" size="small" text @click="openBook" />
      </Message>
      <ImportPlanSummary :plan="plan" />
      <ImportPlanConflicts :plan="plan" :disabled="stale || store.isRunning" />
    </template>

    <ImportHistoryList />
  </section>
</template>

<style scoped>
.ipp {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.ipp-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.ipp-hint {
  font-size: 0.76rem;
  line-height: 1.6;
  color: rgba(226, 232, 240, 0.6);
  margin: 0;
}
</style>
