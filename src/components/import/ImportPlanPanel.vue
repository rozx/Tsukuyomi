<script setup lang="ts">
/**
 * 导入方案：先根据当前草稿生成真实差异（元信息、卷章、段落与译文影响），用户检查后确认才写书库。
 * 版面自上而下为：状态与操作、待处理项、数量概览、元信息与完整性、更新配方、章节变化、导入记录。
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSettingsStore } from 'src/stores/settings';
import { importApplyConfirmation } from 'src/composables/import-page/import-apply-confirmation';
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
const settings = useSettingsStore();
const { t } = useI18n();
const confirm = useConfirm();
const router = useRouter();

const task = computed(() => store.task);
const plan = computed(() => store.plan);
const blocked = computed(() => {
  const question = task.value?.pendingQuestion;
  if (store.isRunning) return t('importUi.planPanel.blockedRunning');
  if (question?.required && !question.answer) return t('importUi.planPanel.blockedAnswer');
  return '';
});
const status = computed(() =>
  importPlanStatus({
    plan: plan.value,
    draftRevision: task.value?.draft.revision ?? 0,
    applied:
      store.operations.find((entry) => entry.id === plan.value?.operationId)?.state === 'applied',
    blocked: blocked.value,
    locale: settings.uiLocale,
  }),
);

const requestApply = () => {
  const current = plan.value;
  if (!current?.summary) return;
  const { targetLanguage, ...dialog } = importApplyConfirmation(current, settings.uiLocale);
  confirm.require({
    ...dialog,
    icon: 'pi pi-exclamation-circle',
    accept: () => void store.applyPlan({ planId: current.id, targetLanguage }),
  });
};
const openBook = () => {
  if (plan.value) void router.push(`/books/${plan.value.targetBookId}`);
};
</script>

<template>
  <section v-if="task" class="ipp" :aria-label="t('importUi.planHero.eyebrow')">
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
