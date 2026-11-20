<script setup lang="ts">
/**
 * 批量章节任务确认对话框：任务类型、翻译范围、入队位置、预计模型、队列概况与新增数量。
 * 挂在书籍详情页 dispatcher 上，三个设备变体共用一份。
 */
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import SelectButton from 'primevue/selectbutton';
import AdaptiveDialog from 'src/components/layout/AdaptiveDialog.vue';
import DialogFormActions from './DialogFormActions.vue';
import { injectChapterBatch } from 'src/composables/book-details/useChapterBatch';
import { useAIModelsStore } from 'src/stores/ai-models';
import { useSettingsStore } from 'src/stores/settings';
import type { Novel } from 'src/models/novel';
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

// 每次打开时以入口按钮选择的任务类型为准，其余选项回到默认
watch(
  () => batch?.dialog.visible,
  (visible) => {
    if (!visible || !batch) return;
    kind.value = batch.dialog.kind;
    mode.value = 'continue';
    position.value = 'back';
  },
);

const kindOptions = computed(() =>
  (['translation', 'polish', 'proofreading'] as const).map((value) => ({
    value,
    label: t(`taskQueueUi.kind.${value}`),
  })),
);
const scopeOptions = computed(() => [
  { value: 'continue', label: t('taskQueueUi.batch.scopeContinue') },
  { value: 'retranslate', label: t('taskQueueUi.batch.scopeRetranslate') },
]);
const positionOptions = computed(() => [
  { value: 'back', label: t('taskQueueUi.batch.positionBack') },
  { value: 'front', label: t('taskQueueUi.batch.positionFront') },
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
  () => batch?.preview(kind.value) ?? { add: 0, duplicate: 0, notApplicable: 0 },
);
const queueInfo = computed(() =>
  t('taskQueueUi.batch.queueInfo', {
    max: settings.taskQueueMaxConcurrent,
    running: batch?.queue.runningItems.length ?? 0,
    queued: batch?.queue.queuedItems.length ?? 0,
  }),
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
    desktop-width="30rem"
    tablet-width="min(32rem, 92vw)"
    tablet-height="auto"
    sheet-min-height="auto"
    @update:visible="(value: boolean) => (batch!.dialog.visible = value)"
  >
    <div class="bct-body">
      <section class="bct-field">
        <span class="bct-label">{{ t('taskQueueUi.batch.kindLabel') }}</span>
        <SelectButton
          v-model="kind"
          :options="kindOptions"
          option-label="label"
          option-value="value"
          :allow-empty="false"
          class="bct-kinds"
        />
      </section>

      <section v-if="kind === 'translation'" class="bct-field">
        <span class="bct-label">{{ t('taskQueueUi.batch.scopeLabel') }}</span>
        <SelectButton
          v-model="mode"
          :options="scopeOptions"
          option-label="label"
          option-value="value"
          :allow-empty="false"
          class="bct-stack"
        />
      </section>

      <section class="bct-field">
        <span class="bct-label">{{ t('taskQueueUi.batch.positionLabel') }}</span>
        <SelectButton
          v-model="position"
          :options="positionOptions"
          option-label="label"
          option-value="value"
          :allow-empty="false"
          class="bct-stack"
        />
      </section>

      <ul class="bct-facts">
        <li v-if="model">
          <i class="pi pi-microchip-ai" aria-hidden="true" />{{
            t('taskQueueUi.batch.model', { model: model.name })
          }}
        </li>
        <li v-else class="bct-warn">
          <i class="pi pi-exclamation-triangle" aria-hidden="true" />{{
            t('taskQueueUi.batch.modelMissing')
          }}
        </li>
        <li><i class="pi pi-list" aria-hidden="true" />{{ queueInfo }}</li>
        <li v-if="preview.duplicate > 0">
          <i class="pi pi-info-circle" aria-hidden="true" />{{
            t('taskQueueUi.batch.resultDuplicate', { count: preview.duplicate })
          }}
        </li>
        <li v-if="preview.notApplicable > 0" class="bct-warn">
          <i class="pi pi-info-circle" aria-hidden="true" />{{
            t('taskQueueUi.batch.notApplicable', { count: preview.notApplicable })
          }}
        </li>
      </ul>

      <p class="bct-add">
        <i v-if="computing" class="pi pi-spinner pi-spin" aria-hidden="true" />
        {{ t('taskQueueUi.batch.addCount', { count: preview.add }) }}
      </p>
    </div>
    <template #footer>
      <DialogFormActions
        :submit-label="t('taskQueueUi.batch.confirm')"
        :loading="submitting"
        :disabled="!canSubmit"
        @cancel="close"
        @submit="submit"
      />
    </template>
  </AdaptiveDialog>
</template>

<style scoped>
.bct-body {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.bct-field {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.bct-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--moon-opacity-60);
}

.bct-kinds {
  width: 100%;
}

.bct-kinds :deep(.p-togglebutton) {
  flex: 1;
}

/* 选项文字较长：纵向排列，每项占满一行 */
.bct-stack {
  display: flex;
  flex-direction: column;
  width: 100%;
}

.bct-stack :deep(.p-togglebutton) {
  justify-content: flex-start;
  border-radius: 6px !important;
}

.bct-facts {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  margin: 0;
  padding: 0.625rem 0.75rem;
  list-style: none;
  border-radius: 8px;
  background: var(--white-opacity-4);
  font-size: 0.8125rem;
  color: var(--moon-opacity-80);
}

.bct-facts li {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.bct-facts .pi {
  font-size: 0.75rem;
  color: var(--moon-opacity-50);
}

.bct-warn,
.bct-warn .pi {
  color: var(--orange-400) !important;
}

.bct-add {
  margin: 0;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--primary-300);
}
</style>
