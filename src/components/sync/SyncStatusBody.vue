<script setup lang="ts">
/**
 * 同步状态面板的内容部分。从 SyncStatusPanel 里拆出来，
 * 方便在桌面 Popover 和手机 MobileBottomSheet 里复用同一套渲染。
 * 所有状态（syncStatus、remoteStats、进度、恢复对话框等）都留在这里，
 * 由父面板通过 slot 引用，这样就不需要把 props / emits 链到顶层。
 */
import { computed, inject, onMounted, onUnmounted, ref, watch } from 'vue';
import Button from 'primevue/button';
import ProgressBar from 'primevue/progressbar';
import ForceSyncToggle from 'src/components/sync/ForceSyncToggle.vue';
import SyncNextTime from 'src/components/sync/SyncNextTime.vue';
import SyncPendingList from 'src/components/sync/SyncPendingList.vue';
import SyncRestoreDialog from 'src/components/sync/SyncRestoreDialog.vue';
import { SyncPanelCloseKey } from 'src/components/sync/sync-panel-injection';
import { useSettingsStore } from 'src/stores/settings';
import { useAIModelsStore } from 'src/stores/ai-models';
import { useBooksStore } from 'src/stores/books';
import { useUiStore } from 'src/stores/ui';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import { formatRelativeTime } from 'src/utils/format';
import { useGistSync } from 'src/composables/useGistUploadWithConflictCheck';
import { useForceSync } from 'src/composables/useForceSync';
import { useSyncStatusDisplay } from 'src/composables/useSyncPendingChanges';
import type { RestorableItem } from 'src/services/sync-data-service';

const settingsStore = useSettingsStore();
const aiModelsStore = useAIModelsStore();
const booksStore = useBooksStore();
const uiStore = useUiStore();
const toast = useToastWithHistory();

const isPhone = computed(() => uiStore.deviceType === 'phone');

// 驱动相对时间显示的定时刷新
const nowMs = ref(Date.now());
let nowTimer: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  nowTimer = setInterval(() => {
    nowMs.value = Date.now();
  }, 10_000);
});
onUnmounted(() => {
  if (nowTimer) {
    clearInterval(nowTimer);
    nowTimer = null;
  }
});

// SyncStatusBody 需要可写的 isSyncing（以便内部触发/取消同步）, 因此单独保留。
// 只读的同步状态指示器、nextSyncTime、pendingItems 走共享 composable。
const isSyncing = computed({
  get: () => settingsStore.isSyncing,
  set: (value: boolean) => settingsStore.setSyncing(value),
});
const isRestoringRevision = computed(() => settingsStore.isRestoringSyncSnapshot);

const { gistSync, pendingCount, hasPendingChanges, pendingItems, syncStatus, nextSyncTime } =
  useSyncStatusDisplay({
    disabled: 'text-moon/50',
    syncing: 'text-primary',
    pending: 'text-amber-300',
    synced: 'text-green-500',
    unsynced: 'text-moon/70',
  });

const MAX_DETAIL_ITEMS = 8;
const visiblePendingItems = computed(() => pendingItems.value.slice(0, MAX_DETAIL_ITEMS));
const hiddenPendingCount = computed(() =>
  Math.max(0, pendingItems.value.length - MAX_DETAIL_ITEMS),
);

const remoteStats = ref<{
  booksCount: number;
  aiModelsCount: number;
} | null>(null);

const { sync, restoreDeletedItems } = useGistSync();
const { confirmAndForceSync } = useForceSync();

// 强制推送模式状态（从 settingsStore 驱动）
const forceMode = computed(() => settingsStore.forceSyncMode.active);

// 父 SyncStatusPanel 通过 provide 注入的关闭回调；
// 弹确认对话框前调用，避免 Popover/BottomSheet 挡住 ConfirmDialog 的操作链路
const closePanel = inject(SyncPanelCloseKey, undefined);

const triggerForceSync = () => {
  if (isRestoringRevision.value) {
    return;
  }

  const onBeforeConfirm = closePanel ? () => closePanel() : undefined;
  void confirmAndForceSync(onBeforeConfirm ? { onBeforeConfirm } : {});
};

const showRestoreDialog = ref(false);
const restorableItems = ref<RestorableItem[]>([]);
const selectedRestoreItems = ref<string[]>([]);

const resetRestoreDialogState = () => {
  showRestoreDialog.value = false;
  restorableItems.value = [];
  selectedRestoreItems.value = [];
};

watch(isRestoringRevision, (restoring) => {
  if (restoring) {
    resetRestoreDialogState();
  }
});

// 关闭（含遮罩 / X 按钮）时也走 skip 流程，避免下次再打开时残留上次的 items
const handleRestoreDialogVisibleChange = (next: boolean) => {
  if (isRestoringRevision.value) {
    resetRestoreDialogState();
    return;
  }

  if (!next && showRestoreDialog.value) {
    skipRestore();
  } else {
    showRestoreDialog.value = next;
  }
};

const syncData = async () => {
  if (isRestoringRevision.value) {
    return;
  }

  const config = gistSync.value;
  if (!config.enabled || !config.syncParams.username || !config.secret) {
    toast.add({
      severity: 'warn',
      summary: '同步失败',
      detail: '请先在设置中配置 Gist 同步',
      life: 3000,
    });
    return;
  }

  const items = await sync();

  if (items.length > 0) {
    restorableItems.value = items;
    selectedRestoreItems.value = [];
    showRestoreDialog.value = true;
  }

  remoteStats.value = {
    booksCount: booksStore.books.length,
    aiModelsCount: aiModelsStore.models.length,
  };
};

const confirmRestore = async () => {
  if (isRestoringRevision.value) {
    resetRestoreDialogState();
    return;
  }

  const itemsToRestore = restorableItems.value.filter((item) =>
    selectedRestoreItems.value.includes(item.id),
  );

  if (itemsToRestore.length > 0) {
    await restoreDeletedItems(itemsToRestore);
    remoteStats.value = {
      booksCount: booksStore.books.length,
      aiModelsCount: aiModelsStore.models.length,
    };
  }

  resetRestoreDialogState();
};

const skipRestore = () => {
  if (isRestoringRevision.value) {
    resetRestoreDialogState();
    return;
  }

  resetRestoreDialogState();

  toast.add({
    severity: 'info',
    summary: '跳过恢复',
    detail: '已跳过恢复已删除的项目',
    life: 3000,
  });
};

const syncProgress = computed(() => settingsStore.syncProgress);

const syncStageLabel = computed(() => {
  switch (syncProgress.value.stage) {
    case 'downloading':
      return '下载中';
    case 'uploading':
      return '上传中';
    case 'applying':
      return '应用中';
    case 'merging':
      return '合并中';
    default:
      return '';
  }
});

// 以下 computed 把模板里剩余的 && / 三元收敛进来，进一步压低模板圈复杂度
const showProgress = computed(() => isSyncing.value && !!syncProgress.value.stage);
const showRemote = computed(
  () => gistSync.value.enabled && gistSync.value.lastSyncTime > 0 && remoteStats.value !== null,
);
const syncButtonDisabled = computed(
  () => !gistSync.value.enabled || isSyncing.value || isRestoringRevision.value,
);
const syncButtonLabel = computed(() => (forceMode.value ? '强制推送到远程' : '同步'));
const syncButtonSeverity = computed<'danger' | 'primary'>(() =>
  forceMode.value ? 'danger' : 'primary',
);
const onSyncButtonClick = () => {
  if (forceMode.value) triggerForceSync();
  else syncData();
};
</script>

<template>
  <div class="flex flex-col space-y-4">
    <div
      v-if="!isPhone"
      class="flex items-center justify-between pb-3 border-b border-white/10"
    >
      <h3 class="text-lg font-semibold text-moon/90">同步状态</h3>
      <i :class="[syncStatus.icon, syncStatus.color]" />
    </div>

    <div class="space-y-3 max-w-full min-w-0">
      <div
        v-if="isPhone"
        class="flex items-center justify-between pb-2 border-b border-white/10"
      >
        <span class="text-xs text-moon/60">当前状态</span>
        <span class="flex items-center gap-2 text-xs text-moon/90">
          <i :class="[syncStatus.icon, syncStatus.color]" />
          <span>{{ syncStatus.label }}</span>
        </span>
      </div>

      <div>
        <label class="text-xs text-moon/60">最后同步时间</label>
        <p class="text-sm text-moon/90 mt-1">
          {{ formatRelativeTime(gistSync.lastSyncTime, nowMs) }}
        </p>
      </div>

      <SyncNextTime :enabled="gistSync.enabled" :next-sync-time="nextSyncTime" :now-ms="nowMs" />

      <div v-if="!gistSync.enabled">
        <p class="text-sm text-moon/60">Gist 同步未启用</p>
        <p class="text-xs text-moon/50 mt-1">请在设置中启用 Gist 同步</p>
      </div>

      <div v-if="showProgress" class="pt-2 border-t border-white/10">
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs text-moon/70">{{ syncStageLabel }}</span>
          <span class="text-xs text-moon/50">{{ syncProgress.percentage }}%</span>
        </div>
        <ProgressBar
          :value="syncProgress.percentage"
          :show-value="false"
          style="height: 6px"
          class="sync-progress-bar"
        />
        <p class="text-xs text-moon/50 mt-2 truncate" style="max-width: 274px">
          {{ syncProgress.message }}
        </p>
      </div>

      <SyncPendingList
        :enabled="gistSync.enabled"
        :has-pending-changes="hasPendingChanges"
        :pending-count="pendingCount"
        :visible-pending-items="visiblePendingItems"
        :hidden-pending-count="hiddenPendingCount"
      />

      <div v-if="showRemote" class="pt-2 border-t border-white/10 space-y-2">
        <label class="text-xs text-moon/60">远程数据</label>
        <div class="flex items-center gap-2">
          <i class="pi pi-book text-sm text-moon/70" />
          <span class="text-sm text-moon/90">书籍: {{ remoteStats!.booksCount }}</span>
        </div>
        <div class="flex items-center gap-2">
          <i class="pi pi-cog text-sm text-moon/70" />
          <span class="text-sm text-moon/90">AI 模型: {{ remoteStats!.aiModelsCount }}</span>
        </div>
      </div>
    </div>

    <div class="flex flex-col gap-3 pt-2 border-t border-white/10">
      <ForceSyncToggle :disabled="syncButtonDisabled" />
      <Button
        :label="syncButtonLabel"
        icon="pi pi-sync"
        :severity="syncButtonSeverity"
        class="w-full"
        :disabled="syncButtonDisabled"
        :loading="isSyncing"
        @click="onSyncButtonClick"
      />
    </div>
  </div>

  <SyncRestoreDialog
    :visible="showRestoreDialog"
    :restorable-items="restorableItems"
    :selected-restore-items="selectedRestoreItems"
    :is-restoring-revision="isRestoringRevision"
    :now-ms="nowMs"
    @update:visible="handleRestoreDialogVisibleChange"
    @update:selected-restore-items="selectedRestoreItems = $event"
    @skip="skipRestore"
    @confirm="confirmRestore"
  />
</template>

<style scoped>
.sync-progress-bar :deep(.p-progressbar) {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
}

.sync-progress-bar :deep(.p-progressbar-value) {
  background: var(--p-primary-color);
  border-radius: 3px;
}
</style>
