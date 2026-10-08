<template>
  <section
    class="border-t border-white/10 pt-6 mt-6 space-y-3"
    aria-labelledby="sync-cleanup-title"
  >
    <h3 id="sync-cleanup-title" class="text-sm font-medium text-moon/90">
      {{ t('syncUi.cleanup.title') }}
    </h3>
    <p class="text-xs text-moon/60">{{ t('syncUi.cleanup.description') }}</p>
    <Button
      :label="t(plan ? 'syncUi.cleanup.rescan' : 'syncUi.cleanup.scan')"
      icon="pi pi-search"
      outlined
      :loading="phase === 'scan'"
      :disabled="blocked"
      @click="scan"
    />
    <p v-if="error" role="alert" class="text-sm text-red-300">{{ error }}</p>
    <div v-if="plan" class="space-y-3" aria-live="polite">
      <p v-if="plan.partial" class="text-xs text-amber-200/90">
        {{ t('syncUi.cleanup.partial') }}
      </p>
      <template v-if="plan.files.length">
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <p class="text-sm text-moon/90">
            {{ t('syncUi.cleanup.summary', { count: plan.files.length, size: previewSize }) }}
          </p>
          <code class="text-xs text-moon/50">{{ plan.revision.slice(0, 7) }}</code>
        </div>
        <div
          class="max-h-72 overflow-y-auto overscroll-contain rounded-lg border border-white/10 px-2"
        >
          <SyncRevisionGroup v-for="group in groups" :key="group.filename" :group="group" />
        </div>
        <p class="text-xs text-moon/50">{{ t('syncUi.cleanup.historyHint') }}</p>
        <Button
          :label="t('syncUi.cleanup.remove', { count: plan.files.length })"
          icon="pi pi-trash"
          severity="danger"
          outlined
          :disabled="blocked"
          @click="confirmCleanup"
        />
      </template>
      <p v-else class="text-sm text-moon/70">{{ t('syncUi.cleanup.empty') }}</p>
    </div>
    <p v-if="phase === 'cleanup'" role="status" class="text-sm text-moon/70">
      <i class="pi pi-spin pi-spinner mr-2" aria-hidden="true" />{{ t('syncUi.settings.loading') }}
    </p>
    <ConfirmDialog group="sync-cleanup" />
  </section>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import ConfirmDialog from 'primevue/confirmdialog';
import { useConfirm } from 'primevue/useconfirm';
import type { SyncConfig } from 'src/models/sync';
import { useGistCleanup } from 'src/composables/useGistCleanup';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import { useBooksStore } from 'src/stores/books';
import { useSettingsStore } from 'src/stores/settings';
import { formatFileSize, getGroupedFiles } from './sync-revision-display';
import SyncRevisionGroup from './SyncRevisionGroup.vue';

const props = defineProps<{ config: SyncConfig }>();
const emit = defineEmits<{ cleaned: [] }>();
const { t } = useI18n();
const confirm = useConfirm();
const toast = useToastWithHistory();
const books = useBooksStore();
const settings = useSettingsStore();
const { plan, error, phase, completed, blocked, scan, cleanup } = useGistCleanup(
  () => props.config,
);
watch(completed, () => emit('cleaned'));
const previewSize = computed(() => {
  if (!plan.value) return '';
  const prefix = plan.value.files.some((file) => file.size === undefined) ? '≥ ' : '';
  return prefix + formatFileSize(plan.value.totalBytes);
});
const groups = computed(() =>
  getGroupedFiles(
    (plan.value?.files ?? []).map((file) => ({ ...file, status: 'modified' as const })),
    books.books,
    settings.uiLocale,
  ),
);

function confirmCleanup() {
  const preview = plan.value;
  if (!preview || blocked.value) return;
  confirm.require({
    group: 'sync-cleanup',
    header: t('syncUi.cleanup.confirmTitle'),
    message: t('syncUi.cleanup.confirm', { count: preview.files.length, size: previewSize.value }),
    icon: 'pi pi-trash',
    defaultFocus: 'reject',
    rejectLabel: t('syncUi.settings.cancel'),
    acceptLabel: t('syncUi.cleanup.remove', { count: preview.files.length }),
    acceptProps: { severity: 'danger' },
    rejectProps: { severity: 'secondary', outlined: true },
    accept: () => {
      void finishCleanup(preview);
    },
  });
}

async function finishCleanup(preview: NonNullable<typeof plan.value>) {
  if (!(await cleanup(preview))) return;
  toast.add({
    severity: 'success',
    summary: t('syncUi.cleanup.succeeded'),
    detail: t('syncUi.cleanup.removed', { count: preview.files.length }),
    life: 5000,
  });
}
</script>
