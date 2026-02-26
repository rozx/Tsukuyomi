<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue';
import Popover from 'primevue/popover';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import Checkbox from 'primevue/checkbox';
import ProgressBar from 'primevue/progressbar';
import { useSettingsStore } from 'src/stores/settings';
import { useAIModelsStore } from 'src/stores/ai-models';
import { useBooksStore } from 'src/stores/books';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import { formatRelativeTime } from 'src/utils/format';
import { useGistSync } from 'src/composables/useGistUploadWithConflictCheck';
import type { RestorableItem } from 'src/services/sync-data-service';

const settingsStore = useSettingsStore();
const aiModelsStore = useAIModelsStore();
const booksStore = useBooksStore();
const toast = useToastWithHistory();

// 用于驱动相对时间显示的定时刷新（避免“刚刚/xx分钟前”不自动更新）
const nowMs = ref(Date.now());
let nowTimer: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  nowTimer = setInterval(() => {
    nowMs.value = Date.now();
  }, 10_000); // 10s 刷新一次即可
});
onUnmounted(() => {
  if (nowTimer) {
    clearInterval(nowTimer);
    nowTimer = null;
  }
});

// 同步相关
const gistSync = computed(() => settingsStore.gistSync);
const isSyncing = computed({
  get: () => settingsStore.isSyncing,
  set: (value: boolean) => settingsStore.setSyncing(value),
});

// 计算同步状态
const syncStatus = computed(() => {
  if (!gistSync.value.enabled) {
    return { icon: 'pi pi-cloud', color: 'text-moon/50', label: '未启用' };
  }
  if (isSyncing.value) {
    return { icon: 'pi pi-spin pi-spinner', color: 'text-primary', label: '同步中' };
  }
  if (gistSync.value.lastSyncTime && gistSync.value.lastSyncTime > 0) {
    return { icon: 'pi pi-cloud-upload', color: 'text-green-500', label: '已同步' };
  }
  return { icon: 'pi pi-cloud', color: 'text-moon/70', label: '未同步' };
});

// 计算下次同步时间
const nextSyncTime = computed(() => {
  if (!gistSync.value.enabled || !gistSync.value.lastSyncTime || gistSync.value.syncInterval <= 0) {
    return null;
  }
  return gistSync.value.lastSyncTime + gistSync.value.syncInterval;
});

// 格式化下次同步时间
const formatNextSyncTime = computed(() => {
  const next = nextSyncTime.value;
  if (!next) {
    return '未设置';
  }
  const diff = next - nowMs.value;
  if (diff <= 0) {
    return '即将同步';
  }
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) {
    return `${hours} 小时后`;
  }
  if (minutes > 0) {
    return `${minutes} 分钟后`;
  }
  return '即将同步';
});

// 远程同步的数据统计
const remoteStats = ref<{
  booksCount: number;
  aiModelsCount: number;
} | null>(null);

// 同步相关 - 使用 composable
const { sync, restoreDeletedItems } = useGistSync();

// 恢复已删除项目对话框状态
const showRestoreDialog = ref(false);
const restorableItems = ref<RestorableItem[]>([]);
const selectedRestoreItems = ref<string[]>([]);

// 同步操作
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

  // 如果有可恢复的项目，显示恢复对话框
  if (items.length > 0) {
    restorableItems.value = items;
    selectedRestoreItems.value = []; // 默认不选中
    showRestoreDialog.value = true;
  }

  // 更新统计信息
  remoteStats.value = {
    booksCount: booksStore.books.length,
    aiModelsCount: aiModelsStore.models.length,
  };
};

// 确认恢复选中的项目
const confirmRestore = async () => {
  const itemsToRestore = restorableItems.value.filter((item) =>
    selectedRestoreItems.value.includes(item.id),
  );

  if (itemsToRestore.length > 0) {
    await restoreDeletedItems(itemsToRestore);

    // 更新统计
    remoteStats.value = {
      booksCount: booksStore.books.length,
      aiModelsCount: aiModelsStore.models.length,
    };
  }

  showRestoreDialog.value = false;
  restorableItems.value = [];
  selectedRestoreItems.value = [];
};

// 跳过恢复
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

// 获取项目类型的显示名称
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

// 格式化删除时间
const formatDeletedTime = (timestamp: number) => {
  return formatRelativeTime(timestamp, nowMs.value);
};

// 同步进度
const syncProgress = computed(() => settingsStore.syncProgress);

// 获取进度阶段的显示名称
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

// Popover ref
const popoverRef = ref<InstanceType<typeof Popover> | null>(null);

// 暴露方法供父组件调用
defineExpose({
  toggle: (event: Event) => {
    popoverRef.value?.toggle(event);
  },
});
</script>

<template>
  <Popover
    ref="popoverRef"
    :dismissable="true"
    :show-close-icon="false"
    style="width: 300px"
    class="sync-popover"
  >
    <div class="flex flex-col space-y-4">
      <div class="flex items-center justify-between pb-3 border-b border-white/10">
        <h3 class="text-lg font-semibold text-moon/90">同步状态</h3>
        <i :class="[syncStatus.icon, syncStatus.color]" />
      </div>

      <div class="space-y-3">
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

        <!-- 同步进度显示 -->
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
  </Popover>

  <!-- 恢复已删除项目对话框 -->
  <Dialog
    v-model:visible="showRestoreDialog"
    modal
    header="发现已删除的项目"
    :style="{ width: '450px' }"
    :closable="true"
    @hide="skipRestore"
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
      <div class="flex gap-2 justify-end">
        <Button label="跳过" class="p-button-text" @click="skipRestore" />
        <Button
          label="恢复选中项目"
          class="p-button-primary"
          :disabled="selectedRestoreItems.length === 0"
          @click="confirmRestore"
        />
      </div>
    </template>
  </Dialog>
</template>

<style scoped>
.sync-popover :deep(.p-popover-content) {
  padding: 1rem;
}

.sync-progress-bar :deep(.p-progressbar) {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
}

.sync-progress-bar :deep(.p-progressbar-value) {
  background: var(--p-primary-color);
  border-radius: 3px;
}
</style>
