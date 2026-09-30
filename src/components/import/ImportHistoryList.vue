<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { resolveAppLocale } from 'src/models/locale';
import { serializeImportError } from 'src/services/import/import-error';
import type { ImportNotice } from 'src/models/import-feedback';

/**
 * 本任务的导入记录与撤销。书籍在导入后有任何后续修改时撤销不可用，并说明原因。
 */
import { computed, ref, watch } from 'vue';
import Button from 'primevue/button';
import { useConfirm } from 'primevue/useconfirm';
import { useImportWorkspaceStore } from 'src/stores/import-workspace';
import type { ImportOperation } from 'src/models/import';
import { formatTime, readableError } from './import-labels';

const { t, locale } = useI18n();
const uiLocale = computed(() => resolveAppLocale(locale.value));

const store = useImportWorkspaceStore();
const confirm = useConfirm();

type RevertState = { available: boolean; reason?: ImportNotice };
const revertState = ref<Record<string, RevertState>>({});

const history = computed(() => store.operations.filter((entry) => entry.state !== 'planned'));
watch(
  () => [history.value, store.task?.updatedAt] as const,
  async ([entries]) => {
    const next: Record<string, RevertState> = {};
    for (const entry of entries) {
      try {
        next[entry.id] = await store.revertStatus(entry.id);
      } catch (error) {
        next[entry.id] = {
          available: false,
          reason: serializeImportError(error, 'REVERT_STATUS_FAILED'),
        };
      }
    }
    revertState.value = next;
  },
  { immediate: true },
);

const rows = computed(() =>
  history.value.map((entry) => {
    const applied = entry.state === 'applied';
    const time = (applied ? entry.appliedAt : entry.revertedAt) ?? entry.plan.createdAt;
    const state = revertState.value[entry.id];
    return {
      entry,
      applied,
      title: t(
        entry.plan.targetKind === 'new' ? 'importUi.common.newBook' : 'importUi.common.updateBook',
        {
          title: entry.plan.book.title,
        },
      ),
      time: t(applied ? 'importUi.history.appliedAt' : 'importUi.history.revertedAt', {
        time: formatTime(time, uiLocale.value),
      }),
      reason: state?.reason === undefined ? '' : readableError(state.reason, uiLocale.value),
      canRevert: Boolean(state?.available) && !store.isRunning,
    };
  }),
);
const reverting = computed(() => store.pendingAction === 'revert');

const requestRevert = (entry: ImportOperation) => {
  confirm.require({
    header: t('importUi.history.revertHeader'),
    message: t(
      entry.plan.targetKind === 'new'
        ? 'importUi.history.revertNewMessage'
        : 'importUi.history.revertUpdateMessage',
    ),
    icon: 'pi pi-undo',
    acceptLabel: t('importUi.history.revertAccept'),
    rejectLabel: t('importUi.common.cancel'),
    acceptClass: 'p-button-danger',
    accept: () => void store.revertOperation(entry.id),
  });
};
</script>

<template>
  <section v-if="rows.length" class="ipl-card">
    <div class="ipl-card-head">
      <h3 class="ipl-card-title">
        <i class="pi pi-history" aria-hidden="true" />{{ t('importUi.history.title') }}
        <span class="ipl-count">{{ rows.length }}</span>
      </h3>
    </div>
    <ul class="ihl-list">
      <li v-for="row in rows" :key="row.entry.id" class="ihl-item">
        <i
          class="pi ihl-state"
          :class="row.applied ? 'pi-check-circle ihl-state--applied' : 'pi-undo'"
          aria-hidden="true"
        />
        <div class="ihl-main">
          <span class="ihl-title">{{ row.title }}</span>
          <span class="ihl-meta">{{ row.time }}</span>
          <span v-if="row.reason" class="ihl-meta">{{ row.reason }}</span>
        </div>
        <Button
          v-if="row.applied"
          icon="pi pi-undo"
          :label="t('importUi.history.revert')"
          size="small"
          severity="danger"
          outlined
          :disabled="!row.canRevert"
          :loading="reverting"
          @click="requestRevert(row.entry)"
        />
      </li>
    </ul>
  </section>
</template>

<style scoped src="./import-card.css"></style>
<style scoped>
.ihl-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.ihl-item {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.5rem 0.65rem;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.16);
}

.ihl-state {
  flex-shrink: 0;
  font-size: 0.9rem;
  color: rgba(226, 232, 240, 0.45);
}

.ihl-state--applied {
  color: rgb(134, 239, 172);
}

.ihl-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  min-width: 0;
}

.ihl-title {
  font-size: 0.8rem;
  overflow-wrap: anywhere;
}

.ihl-meta {
  font-size: 0.7rem;
  color: rgba(226, 232, 240, 0.5);
}
</style>
