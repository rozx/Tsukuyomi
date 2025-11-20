<script setup lang="ts">
import { computed, ref } from 'vue';
import OverlayPanel from 'primevue/overlaypanel';
import Button from 'primevue/button';
import { useSettingsStore } from 'src/stores/settings';
import { GistSyncService } from 'src/services/gist-sync-service';
import { useAIModelsStore } from 'src/stores/ai-models';
import { useBooksStore } from 'src/stores/books';
import { useCoverHistoryStore } from 'src/stores/cover-history';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import { formatRelativeTime } from 'src/utils/format';

const settingsStore = useSettingsStore();
const aiModelsStore = useAIModelsStore();
const booksStore = useBooksStore();
const coverHistoryStore = useCoverHistoryStore();
const toast = useToastWithHistory();
const gistSyncService = new GistSyncService();

// 同步相关
const gistSync = computed(() => settingsStore.gistSync);
const isSyncing = ref(false);

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

  isSyncing.value = true;
  try {
    const result = await gistSyncService.uploadToGist(config, {
      aiModels: aiModelsStore.models,
      appSettings: settingsStore.getAllSettings(),
      novels: booksStore.books,
      coverHistory: coverHistoryStore.covers,
    });

    if (result.success) {
      // 更新 Gist ID（无论是更新还是重新创建，都需要更新为新 ID）
      if (result.gistId) {
        settingsStore.setGistId(result.gistId);
      }
      settingsStore.updateLastSyncTime();
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
    } else {
      toast.add({
        severity: 'error',
        summary: '同步失败',
        detail: result.error || '同步到 Gist 时发生未知错误',
        life: 5000,
      });
    }
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: '同步失败',
      detail: error instanceof Error ? error.message : '同步时发生未知错误',
      life: 5000,
    });
  } finally {
    isSyncing.value = false;
  }
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

  isSyncing.value = true;
  try {
    const result = await gistSyncService.downloadFromGist(config);

    if (result.success && result.data) {
      // 覆盖当前的 AI 模型数据
      if (result.data.aiModels && result.data.aiModels.length > 0) {
        aiModelsStore.clearModels();
        result.data.aiModels.forEach((model) => {
          aiModelsStore.addModel(model);
        });
      }

      // 覆盖当前的书籍数据
      if (result.data.novels && result.data.novels.length > 0) {
        await booksStore.clearBooks();
        try {
          // 使用批量添加方法，只保存一次到 IndexedDB
          await booksStore.bulkAddBooks(result.data.novels);
        } catch (error) {
          // 如果保存失败，给出明确的错误提示
          const errorMessage =
            error instanceof Error ? error.message : '保存书籍到本地存储时发生错误';
          toast.add({
            severity: 'error',
            summary: '存储失败',
            detail: errorMessage,
            life: 10000,
          });
          throw error; // 重新抛出以中断后续操作
        }
      }

      // 覆盖当前的封面历史数据
      if (result.data.coverHistory && result.data.coverHistory.length > 0) {
        coverHistoryStore.clearHistory();
        result.data.coverHistory.forEach((cover) => {
          coverHistoryStore.addCover(cover);
        });
      }

      // 覆盖当前的应用设置（但保留 Gist 配置）
      if (result.data.appSettings) {
        const currentGistSync = settingsStore.gistSync;
        settingsStore.importSettings(result.data.appSettings);
        // 恢复 Gist 配置
        settingsStore.updateGistSync(currentGistSync);
      }

      settingsStore.updateLastSyncTime();
      // 更新远程统计数据（下载的数据）
      remoteStats.value = {
        booksCount: result.data.novels?.length || 0,
        aiModelsCount: result.data.aiModels?.length || 0,
      };
      toast.add({
        severity: 'success',
        summary: '下载成功',
        detail: result.message || '从 Gist 下载数据成功',
        life: 3000,
      });
    } else {
      toast.add({
        severity: 'error',
        summary: '下载失败',
        detail: result.error || '从 Gist 下载数据时发生未知错误',
        life: 5000,
      });
    }
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: '下载失败',
      detail: error instanceof Error ? error.message : '下载时发生未知错误',
      life: 5000,
    });
  } finally {
    isSyncing.value = false;
  }
};

// OverlayPanel ref
const popoverRef = ref<InstanceType<typeof OverlayPanel> | null>(null);

// 暴露方法供父组件调用
defineExpose({
  toggle: (event: Event) => {
    popoverRef.value?.toggle(event);
  },
});
</script>

<template>
  <OverlayPanel
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
  </OverlayPanel>
</template>

<style scoped>
.sync-popover :deep(.p-overlaypanel-content) {
  padding: 1rem;
}
</style>
