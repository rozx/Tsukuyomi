<script setup lang="ts">
/**
 * 本任务的导入记录与撤销。书籍在导入后有任何后续修改时撤销不可用，并说明原因。
 */
import { computed, ref, watch } from 'vue';
import Button from 'primevue/button';
import { useConfirm } from 'primevue/useconfirm';
import { useImportWorkspaceStore } from 'src/stores/import-workspace';
import type { ImportOperation } from 'src/models/import';
import { formatTime, readableError } from './import-labels';

const store = useImportWorkspaceStore();
const confirm = useConfirm();

type RevertState = { available: boolean; reason?: string };
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
        next[entry.id] = { available: false, reason: readableError(String(error)) };
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
      title: `${entry.plan.targetKind === 'new' ? '新建' : '更新'}《${entry.plan.book.title}》`,
      time: `${applied ? '导入于' : '撤销于'} ${formatTime(time)}`,
      reason: state?.reason ?? '',
      canRevert: Boolean(state?.available) && !store.isRunning,
    };
  }),
);
const reverting = computed(() => store.pendingAction === 'revert');

const requestRevert = (entry: ImportOperation) => {
  confirm.require({
    header: '撤销这次导入',
    message:
      entry.plan.targetKind === 'new'
        ? '将删除这次导入新建的小说及其正文。'
        : '将恢复导入前的元信息、卷章、原文和全部译文。',
    icon: 'pi pi-undo',
    acceptLabel: '撤销导入',
    rejectLabel: '取消',
    acceptClass: 'p-button-danger',
    accept: () => void store.revertOperation(entry.id),
  });
};
</script>

<template>
  <section v-if="rows.length" class="ipl-card">
    <div class="ipl-card-head">
      <h3 class="ipl-card-title">
        <i class="pi pi-history" aria-hidden="true" />导入记录
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
          label="撤销"
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

<style scoped src="./import-plan.css"></style>
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
