<script setup lang="ts">
/**
 * 批量章节任务确认对话框。
 *
 * 左栏列出选中的章节（按卷分组）：每章本次会处理的段落数，或被跳过的原因（已在队列 / 没有译文）；
 * 右栏是选项：翻译范围（仅翻译）和入队位置，用单选行加一句说明。手机上上下排列。
 * 任务类型由打开它的按钮（润色 / 校对 / 翻译 N 章）决定，标题里直接写明；新增章数写在确认按钮上。
 * 挂在书籍详情页 dispatcher 上，三个设备变体共用一份。
 */
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import RadioButton from 'primevue/radiobutton';
import AdaptiveDialog from 'src/components/layout/AdaptiveDialog.vue';
import DialogFormActions from './DialogFormActions.vue';
import {
  injectChapterBatch,
  type BatchPreviewRow,
} from 'src/composables/book-details/useChapterBatch';
import { useAIModelsStore } from 'src/stores/ai-models';
import { useSettingsStore } from 'src/stores/settings';
import type { Novel } from 'src/models/novel';
import { getVolumeDisplayTitle } from 'src/utils';
import type { TaskQueueKind, TaskQueueTranslationMode } from 'src/models/task-queue';

const props = defineProps<{ book: Novel | null }>();

const { t } = useI18n();
const batch = injectChapterBatch();
const aiModelsStore = useAIModelsStore();
const settings = useSettingsStore();

const kind = ref<TaskQueueKind>('translation');
const mode = ref<TaskQueueTranslationMode>('continue');
const position = ref<'front' | 'back'>('back');
const submitting = ref(false);

// 每次打开时以入口按钮的任务类型为准，其余选项回到默认
watch(
  () => batch?.dialog.visible,
  (visible) => {
    if (!visible || !batch) return;
    kind.value = batch.dialog.kind;
    mode.value = 'continue';
    position.value = 'back';
  },
);

const scopeOptions = computed(() => [
  {
    value: 'continue' as const,
    title: t('taskQueueUi.batch.scopeContinue'),
    hint: t('taskQueueUi.batch.scopeContinueHint'),
  },
  {
    value: 'retranslate' as const,
    title: t('taskQueueUi.batch.scopeRetranslate'),
    hint: t('taskQueueUi.batch.scopeRetranslateHint'),
  },
]);
const positionOptions = computed(() => [
  {
    value: 'back' as const,
    title: t('taskQueueUi.batch.positionBack'),
    hint: t('taskQueueUi.batch.positionBackHint'),
  },
  {
    value: 'front' as const,
    title: t('taskQueueUi.batch.positionFront'),
    hint: t('taskQueueUi.batch.positionFrontHint'),
  },
]);

/** 右栏的单选组：翻译范围（仅翻译）与入队位置 */
const optionGroups = computed(() => [
  ...(kind.value === 'translation'
    ? [
        {
          name: 'bct-scope',
          label: t('taskQueueUi.batch.scopeLabel'),
          options: scopeOptions.value,
          value: mode.value as string,
          select: (value: string) => (mode.value = value as TaskQueueTranslationMode),
        },
      ]
    : []),
  {
    name: 'bct-position',
    label: t('taskQueueUi.batch.positionLabel'),
    options: positionOptions.value,
    value: position.value as string,
    select: (value: string) => (position.value = value as 'front' | 'back'),
  },
]);

const count = computed(() => batch?.selection.count.value ?? 0);
const header = computed(() =>
  t('taskQueueUi.batch.dialogTitle', {
    kind: t(`taskQueueUi.kind.${kind.value}`),
    count: count.value,
  }),
);
const model = computed(() =>
  aiModelsStore.getModelForTask(
    kind.value === 'translation' ? 'translation' : 'proofreading',
    props.book,
  ),
);
const preview = computed(
  () =>
    batch?.preview(kind.value, mode.value) ?? {
      add: 0,
      duplicate: 0,
      notApplicable: 0,
      paragraphs: 0,
      items: [] as BatchPreviewRow[],
    },
);

/** 选中的章节按卷分组；只有一卷时不显示卷标题 */
const groups = computed(() => {
  const volumes = props.book?.volumes ?? [];
  const byVolume = new Map<string, BatchPreviewRow[]>();
  for (const row of preview.value.items) {
    byVolume.set(row.volumeId, [...(byVolume.get(row.volumeId) ?? []), row]);
  }
  return volumes
    .filter((volume) => byVolume.has(volume.id))
    .map((volume) => ({
      id: volume.id,
      title: getVolumeDisplayTitle(volume, props.book),
      rows: byVolume.get(volume.id) ?? [],
    }));
});

/** 行尾说明：将处理的段落数，或跳过原因 */
const rowMeta = (row: BatchPreviewRow): { text: string; tone: 'count' | 'skip' | 'muted' } => {
  if (row.status === 'duplicate')
    return { text: t('taskQueueUi.batch.statusDuplicate'), tone: 'skip' };
  if (row.status === 'notApplicable') {
    // 翻译跳过的是已全部翻译的章节；润色 / 校对跳过的是没有译文的章节
    const key =
      kind.value === 'translation'
        ? 'taskQueueUi.batch.statusNothing'
        : 'taskQueueUi.batch.statusNotApplicable';
    return { text: t(key), tone: 'skip' };
  }
  if (row.paragraphs === null) return { text: '…', tone: 'muted' };
  if (row.paragraphs === 0) return { text: t('taskQueueUi.batch.statusNothing'), tone: 'muted' };
  return { text: t('taskQueueUi.batch.paragraphCount', { count: row.paragraphs }), tone: 'count' };
};
const listSummary = computed(() =>
  t('taskQueueUi.batch.listSummary', {
    count: preview.value.add,
    paragraphs: preview.value.paragraphs,
  }),
);
const summary = computed(() =>
  model.value
    ? t('taskQueueUi.batch.summary', {
        model: model.value.name,
        max: settings.taskQueueMaxConcurrent,
        running: batch?.queue.runningItems.length ?? 0,
        queued: batch?.queue.queuedItems.length ?? 0,
      })
    : '',
);
const computing = computed(() => kind.value !== 'translation' && !!batch?.stats.loading.value);
const canSubmit = computed(() => !!model.value && preview.value.add > 0 && !computing.value);

const close = () => {
  if (batch) batch.dialog.visible = false;
};
const submit = async () => {
  if (!batch || !canSubmit.value) return;
  submitting.value = true;
  try {
    await batch.confirm({ kind: kind.value, mode: mode.value, position: position.value });
  } finally {
    submitting.value = false;
  }
};
</script>

<template>
  <AdaptiveDialog
    v-if="batch"
    :visible="batch.dialog.visible"
    :header="header"
    :eyebrow="t('taskQueueUi.title')"
    desktop-width="46rem"
    tablet-width="min(46rem, 94vw)"
    tablet-height="auto"
    sheet-min-height="auto"
    @update:visible="(value: boolean) => (batch!.dialog.visible = value)"
  >
    <div class="bct-layout">
      <section class="bct-chapters" :aria-label="t('taskQueueUi.batch.listTitle')">
        <header class="bct-chapters-head">
          <span class="bct-label">{{ t('taskQueueUi.batch.listTitle') }}</span>
          <span class="bct-chapters-sum">{{ listSummary }}</span>
        </header>
        <div class="bct-chapter-list">
          <template v-for="group in groups" :key="group.id">
            <div v-if="groups.length > 1" class="bct-volume">{{ group.title }}</div>
            <div
              v-for="row in group.rows"
              :key="row.chapterId"
              class="bct-chapter"
              :class="{ 'bct-chapter--skipped': row.status !== 'add' }"
            >
              <span class="bct-chapter-title">{{ row.title }}</span>
              <span class="bct-chapter-meta" :class="`bct-chapter-meta--${rowMeta(row).tone}`">{{
                rowMeta(row).text
              }}</span>
            </div>
          </template>
        </div>
      </section>

      <div class="bct-options">
        <fieldset v-for="group in optionGroups" :key="group.name" class="bct-group">
          <legend class="bct-label">{{ group.label }}</legend>
          <label
            v-for="option in group.options"
            :key="option.value"
            class="bct-option"
            :class="{ 'bct-option--active': group.value === option.value }"
          >
            <RadioButton
              :model-value="group.value"
              :name="group.name"
              :value="option.value"
              @update:model-value="group.select"
            />
            <span class="bct-option-text">
              <span class="bct-option-title">{{ option.title }}</span>
              <span class="bct-option-hint">{{ option.hint }}</span>
            </span>
          </label>
        </fieldset>

        <p v-if="!model" class="bct-notice">
          <i class="pi pi-info-circle" aria-hidden="true" />{{
            t('taskQueueUi.batch.modelMissing')
          }}
        </p>
        <p v-else class="bct-summary">
          <i class="pi pi-microchip-ai" aria-hidden="true" />{{ summary }}
        </p>
      </div>
    </div>
    <template #footer>
      <DialogFormActions
        :submit-label="t('taskQueueUi.batch.confirm', { count: preview.add })"
        :loading="submitting || computing"
        :disabled="!canSubmit"
        @cancel="close"
        @submit="submit"
      />
    </template>
  </AdaptiveDialog>
</template>

<style scoped>
/* 左：章节清单；右：选项。窄屏（手机抽屉）上下排列 */
.bct-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 17rem);
  gap: 1.25rem;
  align-items: start;
}

@media (max-width: 640px) {
  .bct-layout {
    grid-template-columns: minmax(0, 1fr);
  }
}

.bct-chapters {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  min-width: 0;
}

.bct-chapters-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
}

.bct-chapters-sum {
  font-size: 0.75rem;
  color: var(--btn-primary-color);
  white-space: nowrap;
}

.bct-chapter-list {
  max-height: 22rem;
  overflow-y: auto;
  border: 1px solid var(--white-opacity-8);
  border-radius: var(--btn-radius);
  background: var(--white-opacity-2);
}

@media (max-width: 640px) {
  .bct-chapter-list {
    max-height: 12rem;
  }
}

.bct-volume {
  position: sticky;
  top: 0;
  padding: 0.35rem 0.75rem;
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--moon-50-opacity-55);
  background: var(--shell-opacity-96);
  border-bottom: 1px solid var(--white-opacity-6);
}

.bct-chapter {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.45rem 0.75rem;
  font-size: 0.85rem;
  color: var(--moon-50-opacity-90);
}

.bct-chapter + .bct-chapter {
  border-top: 1px solid var(--white-opacity-4);
}

.bct-chapter--skipped .bct-chapter-title {
  color: var(--moon-50-opacity-45);
}

.bct-chapter-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bct-chapter-meta {
  flex-shrink: 0;
  font-size: 0.72rem;
  white-space: nowrap;
}

.bct-chapter-meta--count {
  font-family: 'JetBrains Mono', monospace;
  color: var(--moon-50-opacity-55);
}

.bct-chapter-meta--muted {
  color: var(--moon-50-opacity-45);
}

.bct-chapter-meta--skip {
  padding: 0 6px;
  border-radius: 999px;
  line-height: 16px;
  color: var(--btn-warn-color);
  background: var(--btn-warn-bg);
}

.bct-options {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-width: 0;
}

.bct-group {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin: 0;
  padding: 0;
  border: none;
  min-width: 0;
}

.bct-label {
  padding: 0;
  margin-bottom: 0.2rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--moon-50-opacity-55);
}

/* 单选行：整行可点，选中行用主按钮的薄藍淡底 */
.bct-option {
  display: flex;
  align-items: flex-start;
  gap: 0.65rem;
  padding: 0.55rem 0.7rem;
  border: 1px solid var(--white-opacity-8);
  border-radius: var(--btn-radius);
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease;
}

.bct-option:hover {
  background: var(--white-opacity-3);
  border-color: var(--white-opacity-12);
}

.bct-option--active,
.bct-option--active:hover {
  background: var(--btn-primary-bg);
  border-color: var(--btn-primary-border);
}

.bct-option :deep(.p-radiobutton) {
  flex-shrink: 0;
  margin-top: 0.1rem;
}

.bct-option-text {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
}

.bct-option-title {
  font-size: 0.85rem;
  color: var(--moon-50-opacity-90);
}

.bct-option-hint {
  font-size: 0.72rem;
  line-height: 1.4;
  color: var(--moon-50-opacity-55);
}

.bct-notice,
.bct-summary {
  display: flex;
  align-items: flex-start;
  gap: 0.45rem;
  margin: 0;
  font-size: 0.75rem;
  line-height: 1.4;
}

.bct-notice {
  color: var(--btn-warn-color);
}

.bct-summary {
  color: var(--moon-50-opacity-55);
}

.bct-notice .pi,
.bct-summary .pi {
  margin-top: 0.15rem;
  font-size: 0.75rem;
}
</style>
