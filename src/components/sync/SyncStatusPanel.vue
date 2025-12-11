<script setup lang="ts">
import { computed, ref } from 'vue';
import Popover from 'primevue/popover';
import Button from 'primevue/button';
import { useSettingsStore } from 'src/stores/settings';
import { GistSyncService } from 'src/services/gist-sync-service';
import { SyncDataService } from 'src/services/sync-data-service';
import { useAIModelsStore } from 'src/stores/ai-models';
import { useBooksStore } from 'src/stores/books';
import { useCoverHistoryStore } from 'src/stores/cover-history';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import { formatRelativeTime } from 'src/utils/format';
import { useGistSync } from 'src/composables/useGistUploadWithConflictCheck';
import co from 'co';

const settingsStore = useSettingsStore();
const aiModelsStore = useAIModelsStore();
const booksStore = useBooksStore();
const coverHistoryStore = useCoverHistoryStore();
const toast = useToastWithHistory();
const gistSyncService = new GistSyncService();

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
  const now = Date.now();
  const diff = next - now;
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
const { uploadToGist, downloadFromGist } = useGistSync();

// 上传配置
const uploadConfig = async () => {
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

  // 使用 composable 处理上传
  await uploadToGist(
    config,
    (value) => {
      isSyncing.value = value;
    },
    (result) => {
      // 更新远程统计数据（上传的数据）
      remoteStats.value = {
        booksCount: booksStore.books.length,
        aiModelsCount: aiModelsStore.models.length,
      };
      toast.add({
        severity: 'success',
        summary: '同步成功',
        detail: result.message || '数据已成功同步到 Gist',
        life: 3000,
      });
    },
  );
};

// 下载配置
const downloadConfig = async () => {
  const config = gistSync.value;
  if (
    !config.enabled ||
    !config.syncParams.gistId ||
    !config.syncParams.username ||
    !config.secret
  ) {
    toast.add({
      severity: 'warn',
      summary: '下载失败',
      detail: '请先在设置中配置 Gist 同步',
      life: 3000,
    });
    return;
  }

  // 使用 composable 处理下载
  await downloadFromGist(config, (value) => {
    isSyncing.value = value;
  });

  // downloadFromGist 已经应用了数据
  // 我们只需要更新统计信息
  // 注意：这里我们无法直接获取下载的数据来更新统计，
  // 但我们可以更新为本地当前状态（因为已经同步了）
  remoteStats.value = {
    booksCount: booksStore.books.length,
    aiModelsCount: aiModelsStore.models.length,
  };
};

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
            {{ formatRelativeTime(gistSync.lastSyncTime) }}
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
            {{ formatRelativeTime(nextSyncTime) }}
          </p>
        </div>

        <div v-if="!gistSync.enabled">
          <p class="text-sm text-moon/60">Gist 同步未启用</p>
          <p class="text-xs text-moon/50 mt-1">请在设置中启用 Gist 同步</p>
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
          label="上传配置"
          icon="pi pi-upload"
          class="p-button-primary w-full"
          :disabled="!gistSync.enabled || isSyncing"
          :loading="isSyncing"
          @click="uploadConfig"
        />
        <Button
          label="下载配置"
          icon="pi pi-download"
          class="p-button-outlined w-full"
          :disabled="!gistSync.enabled || isSyncing || !gistSync.syncParams.gistId"
          :loading="isSyncing"
          @click="downloadConfig"
        />
      </div>
    </div>
  </Popover>

  <!-- 冲突解决对话框 -->
</template>

<style scoped>
.sync-popover :deep(.p-popover-content) {
  padding: 1rem;
}
</style>
