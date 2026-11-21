import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { MessageKey } from 'src/i18n/types';
import { useImportWorkspaceStore } from 'src/stores/import-workspace';
import { awaitingImportAnswer } from 'src/services/import/import-question-service';
import { injectImportPage, type ImportSection } from './useImportPage';
import {
  STEP_SECTION,
  importStepAction,
  importStepStates,
  type ImportStepId,
} from './import-steps';

const STEP_LABELS: Record<ImportStepId, MessageKey> = {
  sources: 'importUi.flow.sources',
  organize: 'importUi.flow.organize',
  import: 'importUi.flow.import',
};

export const IMPORT_ACTION_ICONS = {
  continue: 'pi pi-play',
  pause: 'pi pi-pause',
  preview: 'pi pi-list-check',
} as const;

/**
 * 导入「来源 → 整理 → 导入」三步引导的界面状态（三端共用）：
 * 正在查看哪一步、每一步的标签 / 进度 / 完成情况，以及这一步底部主按钮的文字与动作。
 * 判断规则见 import-steps 的纯函数。
 */
export function useImportFlow() {
  const ctx = injectImportPage();
  const store = useImportWorkspaceStore();
  const { t } = useI18n();

  // 打开任务时（分区为任务 / 对话）按进度落到当前步
  const current = computed<ImportSection>(() =>
    ctx.section.value === 'tasks' || ctx.section.value === 'chat'
      ? ctx.landingSection.value
      : ctx.section.value,
  );

  const chapters = computed(() => store.task?.draft.chapters ?? []);
  const remainingCalls = computed(() => store.task?.checkpoint?.remainingCalls.length ?? 0);
  const contentSources = computed(() =>
    store.sources.filter((source) => source.purpose !== 'metadata-only'),
  );

  const stepMeta = (id: ImportStepId): string => {
    if (id === 'sources') {
      if (!contentSources.value.length) return '';
      const extracted = contentSources.value.filter((s) => s.status === 'extracted').length;
      const failed = contentSources.value.filter((s) => s.status === 'failed').length;
      const meta = t('importUi.flow.sourcesMeta', {
        extracted,
        total: contentSources.value.length,
      });
      return failed ? `${meta} · ${t('importUi.runBar.sourcesFailed', { count: failed })}` : meta;
    }
    if (id === 'organize') {
      const ready = chapters.value.filter((chapter) => chapter.status === 'ready').length;
      return ready ? t('importUi.flow.organizeMeta', { count: ready }) : '';
    }
    if (store.task?.state === 'applied') return t('importUi.flow.importDone');
    return store.task?.state === 'ready' ? t('importUi.flow.importReady') : '';
  };

  const steps = computed(() => {
    const { current: active, done } = importStepStates({
      sourceCount: store.sources.length,
      taskState: store.task?.state ?? 'draft',
    });
    return (['sources', 'organize', 'import'] as const).map((id, index) => ({
      id,
      index: index + 1,
      label: t(STEP_LABELS[id]),
      meta: stepMeta(id),
      done: done[id],
      active: id === active,
      viewing: STEP_SECTION[id] === current.value,
    }));
  });

  const selectStep = (id: ImportStepId) => {
    ctx.section.value = STEP_SECTION[id];
  };

  const action = computed(() =>
    importStepAction({
      section: current.value,
      running: store.isRunning,
      canContinue: store.canContinue,
      sourceCount: store.sources.length,
      chapterCount: chapters.value.length,
      resumable: store.task?.state === 'paused' || Boolean(remainingCalls.value),
      awaitingAnswer: Boolean(store.task && awaitingImportAnswer(store.task)),
    }),
  );

  /** 没有来源时主按钮不可点，旁边说明原因 */
  const actionHint = computed(() =>
    action.value?.kind === 'continue' && !store.sources.length
      ? t('importUi.flow.needSources')
      : '',
  );

  const actionLabel = computed(() => {
    switch (action.value?.kind) {
      case 'pause':
        return t('importUi.flow.pause');
      case 'preview':
        return t('importUi.planHero.generate');
      default:
        if (!chapters.value.length) return t('importUi.flow.start');
        return t(remainingCalls.value ? 'importUi.chat.continueCalls' : 'importUi.chat.continue');
    }
  });

  const runAction = async (): Promise<void> => {
    switch (action.value?.kind) {
      case 'pause':
        await store.pause();
        return;
      case 'preview':
        await store.previewPlan();
        ctx.section.value = 'plan';
        return;
      case 'continue':
        void store.send('');
        // 开始整理后去看卷章草稿的进展
        ctx.section.value = 'draft';
        return;
    }
  };

  return { current, steps, selectStep, action, actionHint, actionLabel, runAction };
}
