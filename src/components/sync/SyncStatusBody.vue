<script setup lang="ts">
/**
 * 同步状态面板的内容部分。从 SyncStatusPanel 里拆出来，
 * 方便在桌面 Popover 和手机 MobileBottomSheet 里复用同一套渲染。
 * 所有状态（syncStatus、remoteStats、进度、恢复对话框等）都留在这里，
 * 由父面板通过 slot 引用，这样就不需要把 props / emits 链到顶层。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue';
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import ProgressBar from 'primevue/progressbar';
import AdaptiveDialog from 'src/components/layout/AdaptiveDialog.vue';
import { useSettingsStore } from 'src/stores/settings';
import { useAIModelsStore } from 'src/stores/ai-models';
import { useBooksStore } from 'src/stores/books';
import { useUiStore } from 'src/stores/ui';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import { formatRelativeTime } from 'src/utils/format';
import { useGistSync } from 'src/composables/useGistUploadWithConflictCheck';
import { useSyncPendingChanges } from 'src/composables/useSyncPendingChanges';
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

const gistSync = computed(() => settingsStore.gistSync);
const isSyncing = computed({
  get: () => settingsStore.isSyncing,
  set: (value: boolean) => settingsStore.setSyncing(value),
});

const { pendingCount, hasPendingChanges, pendingItems } = useSyncPendingChanges();

const MAX_DETAIL_ITEMS = 8;
const visiblePendingItems = computed(() => pendingItems.value.slice(0, MAX_DETAIL_ITEMS));
const hiddenPendingCount = computed(() =>
  Math.max(0, pendingItems.value.length - MAX_DETAIL_ITEMS),
);

const kindLabel: Record<string, string> = {
  book: '书籍',
  'ai-model': 'AI 模型',
  cover: '封面',
  settings: '设置',
  memory: '记忆',
};

const kindIcon: Record<string, string> = {
  book: 'pi pi-book',
  'ai-model': 'pi pi-cog',
  cover: 'pi pi-image',
  settings: 'pi pi-sliders-h',
  memory: 'pi pi-database',
};

const actionLabel: Record<'edited' | 'added' | 'deleted', string> = {
  edited: '已编辑',
  added: '新增',
  deleted: '删除',
};

const syncStatus = computed(() => {
  if (!gistSync.value.enabled) {
    return { icon: 'pi pi-cloud', color: 'text-moon/50', label: '未启用' };
  }
  if (isSyncing.value) {
    return { icon: 'pi pi-spin pi-spinner', color: 'text-primary', label: '同步中' };
  }
  if (hasPendingChanges.value) {
    return {
      icon: 'pi pi-cloud-upload',
      color: 'text-amber-300',
      label: `${pendingCount.value} 项变更`,
    };
  }
  if (gistSync.value.lastSyncTime && gistSync.value.lastSyncTime > 0) {
    return { icon: 'pi pi-cloud-check', color: 'text-green-500', label: '已同步' };
  }
  return { icon: 'pi pi-cloud', color: 'text-moon/70', label: '未同步' };
});

const nextSyncTime = computed(() => {
  if (!gistSync.value.enabled || !gistSync.value.lastSyncTime || gistSync.value.syncInterval <= 0) {
    return null;
  }
  return gistSync.value.lastSyncTime + gistSync.value.syncInterval;
});

const formatNextSyncTime = computed(() => {
  const next = nextSyncTime.value;
  if (!next) return '未设置';
  const diff = next - nowMs.value;
  if (diff <= 0) return '即将同步';
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours} 小时后`;
  if (minutes > 0) return `${minutes} 分钟后`;
  return '即将同步';
});

const remoteStats = ref<{
  booksCount: number;
  aiModelsCount: number;
} | null>(null);

const { sync, restoreDeletedItems } = useGistSync();

const showRestoreDialog = ref(false);
const restorableItems = ref<RestorableItem[]>([]);
const selectedRestoreItems = ref<string[]>([]);

// 关闭（含遮罩 / X 按钮）时也走 skip 流程，避免下次再打开时残留上次的 items
const handleRestoreDialogVisibleChange = (next: boolean) => {
  if (!next && showRestoreDialog.value) {
    skipRestore();
  } else {
    showRestoreDialog.value = next;
  }
};

const syncData = async () => {
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

  showRestoreDialog.value = false;
  restorableItems.value = [];
  selectedRestoreItems.value = [];
};

const skipRestore = () => {
  showRestoreDialog.value = false;
  restorableItems.value = [];
  selectedRestoreItems.value = [];

  toast.add({
    severity: 'info',
    summary: '跳过恢复',
    detail: '已跳过恢复已删除的项目',
    life: 3000,
  });
};

const getItemTypeLabel = (type: RestorableItem['type']) => {
  switch (type) {
    case 'novel':
      return '书籍';
    case 'model':
      return 'AI 模型';
    case 'cover':
      return '封面';
    default:
      return '项目';
  }
};

const formatDeletedTime = (timestamp: number) => formatRelativeTime(timestamp, nowMs.value);

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

      <div>
        <label class="text-xs text-moon/60">下次同步时间</label>
        <p v-if="gistSync.enabled && nextSyncTime" class="text-sm text-moon/90 mt-1">
          {{ formatNextSyncTime }}
        </p>
        <p v-else-if="gistSync.enabled" class="text-sm text-moon/70 mt-1">未设置自动同步</p>
        <p v-else class="text-sm text-moon/70 mt-1">未启用</p>
        <p v-if="gistSync.enabled && nextSyncTime" class="text-xs text-moon/50 mt-1">
          {{ formatRelativeTime(nextSyncTime, nowMs) }}
        </p>
      </div>

      <div v-if="!gistSync.enabled">
        <p class="text-sm text-moon/60">Gist 同步未启用</p>
        <p class="text-xs text-moon/50 mt-1">请在设置中启用 Gist 同步</p>
      </div>

      <div v-if="isSyncing && syncProgress.stage" class="pt-2 border-t border-white/10">
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

      <div
        v-if="gistSync.enabled && hasPendingChanges"
        class="pt-2 border-t border-white/10 space-y-2"
      >
        <div class="flex items-center justify-between">
          <label class="text-xs text-moon/60">待同步变更</label>
          <span class="text-xs text-amber-300">{{ pendingCount }} 项</span>
        </div>
        <ul class="space-y-1.5 max-h-44 overflow-y-auto pr-1">
          <li
            v-for="(item, idx) in visiblePendingItems"
            :key="`${item.kind}-${item.label}-${idx}`"
            class="flex items-center gap-2 text-xs text-moon/85 min-w-0"
          >
            <i :class="kindIcon[item.kind]" class="text-moon/60 shrink-0" />
            <span class="text-moon/50 shrink-0">{{ kindLabel[item.kind] }}</span>
            <span class="truncate flex-1 min-w-0" :title="item.label">{{ item.label }}</span>
            <span
              class="text-[10px] shrink-0"
              :class="item.action === 'deleted' ? 'text-rose-300/80' : 'text-moon/50'"
            >
              {{ actionLabel[item.action] }}
            </span>
          </li>
        </ul>
        <p v-if="hiddenPendingCount > 0" class="text-xs text-moon/50">
          还有 {{ hiddenPendingCount }} 项未列出
        </p>
      </div>

      <div
        v-if="gistSync.enabled && gistSync.lastSyncTime > 0 && remoteStats"
        class="pt-2 border-t border-white/10 space-y-2"
      >
        <label class="text-xs text-moon/60">远程数据</label>
        <div class="flex items-center gap-2">
          <i class="pi pi-book text-sm text-moon/70" />
          <span class="text-sm text-moon/90">书籍: {{ remoteStats.booksCount }}</span>
        </div>
        <div class="flex items-center gap-2">
          <i class="pi pi-cog text-sm text-moon/70" />
          <span class="text-sm text-moon/90">AI 模型: {{ remoteStats.aiModelsCount }}</span>
        </div>
      </div>
    </div>

    <div class="flex flex-col gap-2 pt-2 border-t border-white/10">
      <Button
        label="同步"
        icon="pi pi-sync"
        class="p-button-primary w-full"
        :disabled="!gistSync.enabled || isSyncing"
        :loading="isSyncing"
        @click="syncData"
      />
    </div>
  </div>

  <!-- 恢复已删除项目对话框（桌面 Dialog / 手机 BottomSheet） -->
  <AdaptiveDialog
    :visible="showRestoreDialog"
    header="发现已删除的项目"
    desktop-width="450px"
    eyebrow="RESTORE"
    @update:visible="handleRestoreDialogVisibleChange"
  >
    <div class="space-y-4">
      <p class="text-moon/80">远程存在以下您之前删除的项目，您可以选择恢复它们：</p>

      <div class="max-h-60 overflow-y-auto space-y-2">
        <div
          v-for="item in restorableItems"
          :key="item.id"
          class="flex items-center gap-3 p-3 bg-white/5 rounded-lg"
        >
          <Checkbox v-model="selectedRestoreItems" :input-id="item.id" :value="item.id" />
          <label :for="item.id" class="flex-1 cursor-pointer">
            <div class="flex items-center gap-2">
              <i
                :class="[
                  item.type === 'novel'
                    ? 'pi pi-book'
                    : item.type === 'model'
                      ? 'pi pi-cog'
                      : 'pi pi-image',
                  'text-moon/70',
                ]"
              />
              <span class="text-moon/90">{{ item.title }}</span>
              <span class="text-xs text-moon/50"> ({{ getItemTypeLabel(item.type) }}) </span>
            </div>
            <div class="text-xs text-moon/50 mt-1">
              删除于: {{ formatDeletedTime(item.deletedAt) }}
            </div>
          </label>
        </div>
      </div>
    </div>

    <template #footer>
      <Button label="跳过" class="p-button-text" @click="skipRestore" />
      <Button
        label="恢复选中项目"
        class="p-button-primary"
        :disabled="selectedRestoreItems.length === 0"
        @click="confirmRestore"
      />
    </template>
  </AdaptiveDialog>
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
