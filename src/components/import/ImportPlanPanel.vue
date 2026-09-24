<script setup lang="ts">
/**
 * 导入方案：先根据当前草稿生成真实差异（元信息、卷章、段落与译文影响），用户检查后确认才写书库。
 * 版面自上而下为：状态与操作、待处理项、数量概览、元信息与完整性、更新配方、章节变化、导入记录。
 */
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useConfirm } from 'primevue/useconfirm';
import { useImportWorkspaceStore } from 'src/stores/import-workspace';
import { importPlanStatus } from 'src/composables/import-page/import-plan-status';
import ImportPlanHero from './ImportPlanHero.vue';
import ImportPlanConflicts from './ImportPlanConflicts.vue';
import ImportPlanStats from './ImportPlanStats.vue';
import ImportPlanDetails from './ImportPlanDetails.vue';
import ImportPlanRecipe from './ImportPlanRecipe.vue';
import ImportPlanChapters from './ImportPlanChapters.vue';
import ImportHistoryList from './ImportHistoryList.vue';

const store = useImportWorkspaceStore();
const confirm = useConfirm();
const router = useRouter();

const task = computed(() => store.task);
const plan = computed(() => store.plan);
const blocked = computed(() => {
  const question = task.value?.pendingQuestion;
  if (store.isRunning) return '月詠正在整理，暂停或等待本轮完成后才能生成或确认方案。';
  if (question?.required && !question.answer)
    return '月詠在等待你的回答，回答后才能生成或确认方案。';
  return '';
});
const status = computed(() =>
  importPlanStatus({
    plan: plan.value,
    draftRevision: task.value?.draft.revision ?? 0,
    applied:
      store.operations.find((entry) => entry.id === plan.value?.operationId)?.state === 'applied',
    blocked: blocked.value,
  }),
);

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
  const recipe = ['add', 'replace'].includes(current.recipeChange?.kind ?? '')
    ? '同时写入更新配方。'
    : '';
  confirm.require({
    header: '确认导入到书库',
    message: `${target}：${summary.selectedChapters} 章。${cleared}${partial}${recipe}确认后才会写入书库，可在书籍没有后续修改前整次撤销。`,
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
    <ImportPlanHero
      :plan="plan"
      :status="status"
      @preview="store.previewPlan"
      @apply="requestApply"
      @open-book="openBook"
    />
    <template v-if="plan">
      <ImportPlanConflicts :plan="plan" :disabled="status.kind === 'stale' || store.isRunning" />
      <ImportPlanStats :plan="plan" />
      <ImportPlanDetails :plan="plan" />
      <ImportPlanRecipe :plan="plan" />
      <ImportPlanChapters :plan="plan" />
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
</style>
