<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Password from 'primevue/password';
import Checkbox from 'primevue/checkbox';
import InputNumber from 'primevue/inputnumber';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import { useConfirm } from 'primevue/useconfirm';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import { useAIModelsStore } from 'src/stores/ai-models';
import { useBooksStore } from 'src/stores/books';
import { useCoverHistoryStore } from 'src/stores/cover-history';
import { useSettingsStore } from 'src/stores/settings';
import { GistSyncService } from 'src/services/gist-sync-service';
import { SyncDataService } from 'src/services/sync-data-service';
import { groupChunkFiles } from 'src/utils/gist-file-utils';
import type { SyncConfig } from 'src/types/sync';
import { formatRelativeTime } from 'src/utils/format';
import { useAutoSync } from 'src/composables/useAutoSync';

// 格式化文件大小
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
};

// 判断是否为元数据文件
const isMetaFile = (filename: string): boolean => {
  // 只过滤书籍元数据文件（.meta.json），设置文件应该显示
  if (filename.endsWith('.meta.json') && filename.startsWith('novel-')) {
    return true;
  }
  return false;
};

// 从文件名中提取小说 ID
const extractNovelIdFromFilename = (filename: string): string | null => {
  // 格式: novel-{id}.json 或 novel-{id} (分组后的文件名)
  const match = filename.match(/^novel-(.+)\.json$/);
  if (match && match[1]) {
    return match[1];
  }
  // 分组后的格式也可能是 novel-{id}（不带 .json）
  if (filename.startsWith('novel-')) {
    const id = filename.replace(/^novel-/, '').replace(/\.json$/, '');
    if (id) {
      return id;
    }
  }
  return null;
};

// 获取文件的显示名称和图标
const getFileDisplayInfo = (filename: string): { displayName: string; icon: string } => {
  // 设置文件显示友好名称
  if (filename === 'luna-ai-settings.json') {
    return {
      displayName: '应用设置',
      icon: 'pi pi-cog',
    };
  }
  
  // 尝试提取小说 ID
  const novelId = extractNovelIdFromFilename(filename);
  if (!novelId) {
    // 不是小说文件，返回原文件名
    return {
      displayName: filename,
      icon: 'pi pi-file',
    };
  }
  
  // 查找小说
  const novel = booksStore.books.find((b) => b.id === novelId);
  if (novel) {
    return {
      displayName: novel.title || filename,
      icon: 'pi pi-book',
    };
  }
  
  // 找不到，显示"已删除"
  return {
    displayName: `[已删除] ${filename}`,
    icon: 'pi pi-trash',
  };
};

// 分组文件，将分块文件合并显示，并过滤元数据文件
const getGroupedFiles = (
  files: Array<{
    filename: string;
    status: 'added' | 'removed' | 'modified' | 'renamed';
    size?: number;
    sizeDiff?: number;
  }>,
): Array<{
  filename: string;
  displayName: string;
  icon: string;
  status: 'added' | 'removed' | 'modified' | 'renamed';
  size?: number;
  sizeDiff?: number;
}> => {
  // 过滤掉元数据文件
  const filteredFiles = files.filter((file) => !isMetaFile(file.filename));
  // 使用可重用的分组函数
  const grouped = groupChunkFiles(filteredFiles);
  // 为每个文件添加显示名称和图标
  const filesWithDisplayInfo = grouped.map((file) => {
    const displayInfo = getFileDisplayInfo(file.filename);
    return {
      ...file,
      displayName: displayInfo.displayName,
      icon: displayInfo.icon,
    };
  });
  
  // 排序：设置文件始终在最前面，其他文件按显示名称排序
  return filesWithDisplayInfo.sort((a, b) => {
    // 设置文件优先
    const aIsSettings = a.filename === 'luna-ai-settings.json';
    const bIsSettings = b.filename === 'luna-ai-settings.json';
    
    if (aIsSettings && !bIsSettings) {
      return -1;
    }
    if (!aIsSettings && bIsSettings) {
      return 1;
    }
    
    // 其他文件按显示名称排序
    return a.displayName.localeCompare(b.displayName, 'zh-CN');
  });
};

const props = defineProps<{
  visible: boolean;
}>();

const aiModelsStore = useAIModelsStore();
const booksStore = useBooksStore();
const coverHistoryStore = useCoverHistoryStore();
const settingsStore = useSettingsStore();
const toast = useToastWithHistory();
const confirm = useConfirm();
const { stopAutoSync, setupAutoSync } = useAutoSync();

// Gist 同步相关
const gistSyncService = new GistSyncService();
const gistUsername = ref('');
const gistToken = ref('');
const gistEnabled = ref(false);
const gistId = ref('');
const gistSyncing = computed({
  get: () => settingsStore.isSyncing,
  set: (value: boolean) => settingsStore.setSyncing(value),
});
const gistValidating = ref(false);
const gistLastSyncTime = ref<number | undefined>(undefined);
const autoSyncEnabled = ref(false);
const syncIntervalMinutes = ref(5);

// 修订历史相关
const revisions = ref<
  Array<{
    version: string;
    committedAt: string;
    changeStatus: {
      total: number;
      additions: number;
      deletions: number;
    };
        files?: Array<{
          filename: string;
          status: 'added' | 'removed' | 'modified' | 'renamed';
          size?: number;
          sizeDiff?: number;
          additions?: number;
          deletions?: number;
          changes?: number;
        }>;
  }>
>([]);
const loadingRevisions = ref(false);
const revertingVersion = ref<string | null>(null);
const expandedRevisions = ref<Set<string>>(new Set());
const loadingRevisionDetails = ref<Set<string>>(new Set());

// 加载修订历史
const loadRevisions = async () => {
  if (!gistId.value || !gistEnabled.value) {
    return;
  }

  loadingRevisions.value = true;
  try {
    const baseConfig = settingsStore.gistSync;
    const config: SyncConfig = {
      ...baseConfig,
      enabled: true,
      syncParams: {
        ...baseConfig.syncParams,
        username: gistUsername.value,
        gistId: gistId.value,
      },
      secret: gistToken.value,
    };

    const result = await gistSyncService.getGistRevisions(config);
    if (result.success && result.revisions) {
      revisions.value = result.revisions;
    } else {
      toast.add({
        severity: 'warn',
        summary: '加载失败',
        detail: result.error || '加载修订历史失败',
        life: 3000,
      });
    }
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: '加载失败',
      detail: error instanceof Error ? error.message : '加载修订历史时发生错误',
      life: 3000,
    });
  } finally {
    loadingRevisions.value = false;
  }
};

// 切换修订版本展开/折叠
const toggleRevision = async (version: string) => {
  if (expandedRevisions.value.has(version)) {
    // 折叠：移除展开状态
    expandedRevisions.value.delete(version);
  } else {
    // 展开：添加展开状态并加载详细信息
    expandedRevisions.value.add(version);

    // 总是重新加载详情，以确保显示该修订版本的所有文件
    await loadRevisionDetails(version);
  }
};

// 加载单个修订版本的详细信息
const loadRevisionDetails = async (version: string) => {
  if (!gistId.value || !gistEnabled.value || loadingRevisionDetails.value.has(version)) {
    return;
  }

  loadingRevisionDetails.value.add(version);
  try {
    const baseConfig = settingsStore.gistSync;
    const config: SyncConfig = {
      ...baseConfig,
      enabled: true,
      syncParams: {
        ...baseConfig.syncParams,
        username: gistUsername.value,
        gistId: gistId.value,
      },
      secret: gistToken.value,
    };

    // 找到当前修订版本的索引
    const revisionIndex = revisions.value.findIndex((r) => r.version === version);
    if (revisionIndex === -1) {
      return;
    }

    // 获取该修订版本的详细信息
    const revisionResponse = await gistSyncService.getGistRevision(config, version);

    if (revisionResponse.success && revisionResponse.data) {
      // 获取当前修订版本的所有文件（这就是该版本存在的所有文件）
      const currentFilesMap = revisionResponse.data.files || {};
      
      // 获取上一个版本的文件（用于计算 sizeDiff 和状态）
      let previousFilesMap: Map<string, { size?: number }> | null = null;
      if (revisionIndex < revisions.value.length - 1) {
        const previousVersion = revisions.value[revisionIndex + 1].version;
        const previousRevisionResponse = await gistSyncService.getGistRevision(config, previousVersion);
        if (previousRevisionResponse.success && previousRevisionResponse.data) {
          previousFilesMap = new Map();
          for (const [filename, file] of Object.entries(previousRevisionResponse.data.files || {})) {
            previousFilesMap.set(filename, { size: file?.size });
          }
        }
      }

      // 从 getGistRevisions 的结果中获取已有文件的变更状态（如果存在）
      const existingRevision = revisions.value[revisionIndex];
      const existingFilesMap = new Map(
        (existingRevision.files || []).map((f) => [f.filename, f])
      );

      // 构建文件列表 - 显示该修订版本中存在的所有文件
      const files = Object.keys(currentFilesMap).map((filename) => {
        const file = currentFilesMap[filename];
        const currentSize = file?.size || 0;
        const previousFile = previousFilesMap?.get(filename);
        const previousSize = previousFile?.size;
        
        // 确定文件状态（优先使用已有状态）
        let status: 'added' | 'removed' | 'modified' | 'renamed' = 'modified';
        const existingFile = existingFilesMap.get(filename);
        if (existingFile?.status) {
          // 使用已有状态（来自 getGistRevisions）
          status = existingFile.status;
        } else if (!previousFilesMap) {
          // 这是第一个版本，所有文件都是新增的
          status = 'added';
        } else if (!previousFile) {
          // 在前一个版本不存在，是新文件
          status = 'added';
        } else {
          // 在前一个版本存在，检查是否被修改
          if (previousSize !== undefined && currentSize !== previousSize) {
            status = 'modified';
          } else {
            status = 'modified'; // 默认
          }
        }

        // 计算大小差异
        let sizeDiff: number | undefined;
        if (!previousFilesMap) {
          // 这是第一个版本，没有上一个版本
          sizeDiff = undefined;
        } else if (!previousFile) {
          // 文件不存在于上一个版本，是新文件
          sizeDiff = currentSize;
        } else if (previousSize !== undefined) {
          // 计算大小差异
          sizeDiff = currentSize - previousSize;
        }

        return {
          filename,
          status,
          size: currentSize,
          sizeDiff,
        };
      });

      // 保留所有原有属性，只更新 files
      if (existingRevision) {
        revisions.value[revisionIndex] = {
          version: existingRevision.version,
          committedAt: existingRevision.committedAt,
          changeStatus: existingRevision.changeStatus,
          files,
        };
      }
    }
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: '加载失败',
      detail: error instanceof Error ? error.message : '加载修订版本详情时发生错误',
      life: 3000,
    });
  } finally {
    loadingRevisionDetails.value.delete(version);
  }
};

// 初始化 Gist 配置
watch(
  () => props.visible,
  (isVisible) => {
    if (isVisible) {
      const config = settingsStore.gistSync;
      gistUsername.value = config.syncParams.username ?? '';
      gistToken.value = config.secret ?? '';
      gistEnabled.value = config.enabled ?? false;
      gistId.value = config.syncParams.gistId ?? '';
      gistLastSyncTime.value = config.lastSyncTime || undefined;
      // 自动同步：如果 syncInterval > 0 则认为启用了自动同步
      autoSyncEnabled.value = config.syncInterval > 0;
      syncIntervalMinutes.value =
        config.syncInterval > 0 ? Math.floor(config.syncInterval / 60000) : 5;
      // 加载修订历史
      if (gistId.value && gistEnabled.value) {
        void loadRevisions();
      }
    }
  },
  { immediate: true },
);

// 恢复到指定修订版本
const revertToRevision = (version: string) => {
  if (!gistId.value || !gistEnabled.value) {
    return;
  }

  confirm.require({
    message: '确定要恢复到该修订版本吗？这将覆盖当前本地数据。',
    header: '确认恢复',
    icon: 'pi pi-exclamation-triangle',
    accept: async () => {
      revertingVersion.value = version;
      try {
        const baseConfig = settingsStore.gistSync;
        const config: SyncConfig = {
          ...baseConfig,
          enabled: true,
          syncParams: {
            ...baseConfig.syncParams,
            username: gistUsername.value,
            gistId: gistId.value,
          },
          secret: gistToken.value,
        };

        const result = await gistSyncService.downloadFromGistRevision(config, version);

        if (result.success && result.data) {
          // 恢复模式：先清空本地数据，确保完全覆盖（Restore behavior）
          // 这样 SyncDataService.applyDownloadedData 就会将远程数据视为"新数据"直接添加
          // 从而实现"完全覆盖本地数据"的效果
          await booksStore.clearBooks();
          aiModelsStore.clearModels();
          coverHistoryStore.clearHistory();

          // 应用下载的数据
          await SyncDataService.applyDownloadedData(result.data, []);

          settingsStore.updateLastSyncTime();
          gistLastSyncTime.value = Date.now();
          // 重置自动同步定时器
          setupAutoSync();
          toast.add({
            severity: 'success',
            summary: '恢复成功',
            detail: '已恢复到指定修订版本',
            life: 3000,
          });
        } else {
          toast.add({
            severity: 'error',
            summary: '恢复失败',
            detail: result.error || '恢复修订版本时发生错误',
            life: 5000,
          });
        }
      } catch (error) {
        toast.add({
          severity: 'error',
          summary: '恢复失败',
          detail: error instanceof Error ? error.message : '恢复时发生未知错误',
          life: 5000,
        });
      } finally {
        revertingVersion.value = null;
      }
    },
  });
};

// 保存 Gist 配置
const saveGistConfig = (shouldRestartAutoSync = false) => {
  settingsStore.setGistSyncCredentials(gistUsername.value, gistToken.value);
  if (gistId.value) {
    settingsStore.setGistId(gistId.value);
  }
  settingsStore.setGistSyncEnabled(gistEnabled.value);
  // 保存自动同步设置（注意：这不会覆盖已设置的 lastSyncTime）
  settingsStore.setSyncInterval(autoSyncEnabled.value ? syncIntervalMinutes.value * 60000 : 0);
  
  // 如果需要重新启动自动同步，延迟执行以确保配置已保存
  if (shouldRestartAutoSync) {
    // 使用 nextTick 确保状态更新完成后再重新启动
    window.setTimeout(() => {
      setupAutoSync();
    }, 150);
  }
};

// 处理自动同步启用/禁用
const handleAutoSyncEnabledChange = (value: boolean) => {
  autoSyncEnabled.value = value;
  stopAutoSync(); // 立即停止自动同步
  if (value) {
    // 如果启用自动同步，先保存同步间隔
    settingsStore.setSyncInterval(syncIntervalMinutes.value * 60000);
    // 然后重置最后同步时间为当前时间，使计时器从当前时间重新开始
    settingsStore.updateLastSyncTime();
    // 重新启动自动同步
    window.setTimeout(() => {
      setupAutoSync();
    }, 100);
  } else {
    // 如果禁用自动同步，设置间隔为 0
    settingsStore.setSyncInterval(0);
  }
};

// 处理同步间隔更改
const handleSyncIntervalChange = (value: number | null) => {
  const newValue = Number(value) || 5;
  if (newValue !== syncIntervalMinutes.value) {
    syncIntervalMinutes.value = newValue;
    
    if (autoSyncEnabled.value) {
      // 先保存同步间隔
      settingsStore.setSyncInterval(newValue * 60000);
      // 然后重置最后同步时间为当前时间，使计时器从当前时间重新开始
      settingsStore.updateLastSyncTime();
      // 重新启动自动同步（使用新的间隔和新的开始时间）
      window.setTimeout(() => {
        setupAutoSync();
      }, 100);
    } else {
      // 即使自动同步未启用，也保存值
      settingsStore.setSyncInterval(0);
    }
  }
};

// 验证 GitHub token
const validateGistToken = async () => {
  if (!gistUsername.value.trim() || !gistToken.value.trim()) {
    toast.add({
      severity: 'warn',
      summary: '验证失败',
      detail: '请先输入 GitHub 用户名和 token',
      life: 3000,
    });
    return;
  }

  gistValidating.value = true;
  try {
    const config = settingsStore.gistSync;
    const testConfig: SyncConfig = {
      ...config,
      enabled: true,
      syncParams: {
        ...config.syncParams,
        username: gistUsername.value,
      },
      secret: gistToken.value,
    };
    const result = await gistSyncService.validateToken(testConfig);

    if (result.valid) {
      saveGistConfig();
      toast.add({
        severity: 'success',
        summary: '验证成功',
        detail: 'GitHub token 验证通过',
        life: 3000,
      });
    } else {
      toast.add({
        severity: 'error',
        summary: '验证失败',
        detail: result.error || 'Token 验证失败',
        life: 5000,
      });
    }
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: '验证失败',
      detail: error instanceof Error ? error.message : '验证时发生未知错误',
      life: 5000,
    });
  } finally {
    gistValidating.value = false;
  }
};

// 上传到 Gist
const uploadToGist = async () => {
  if (!gistUsername.value.trim() || !gistToken.value.trim()) {
    toast.add({
      severity: 'warn',
      summary: '同步失败',
      detail: '请先配置 GitHub 用户名和 token',
      life: 3000,
    });
    return;
  }

  gistSyncing.value = true;
  try {
    const baseConfig = settingsStore.gistSync;
    const config: SyncConfig = {
      ...baseConfig,
      enabled: true,
      syncParams: {
        ...baseConfig.syncParams,
        username: gistUsername.value,
        ...(gistId.value ? { gistId: gistId.value } : {}),
      },
      secret: gistToken.value,
    };

    const result = await gistSyncService.uploadToGist(config, {
      aiModels: aiModelsStore.models,
      appSettings: settingsStore.getAllSettings(),
      novels: booksStore.books,
      coverHistory: coverHistoryStore.covers,
    });

    if (result.success) {
      // 更新 Gist ID（无论是更新还是重新创建，都需要更新为新 ID）
      if (result.gistId) {
        gistId.value = result.gistId;
        settingsStore.setGistId(result.gistId);
        // 如果重新创建了 Gist，显示提示信息
        if (result.isRecreated) {
          toast.add({
            severity: 'warn',
            summary: 'Gist 已重新创建',
            detail: `原 Gist 不存在，已创建新的 Gist (ID: ${result.gistId})`,
            life: 5000,
          });
        }
      }
      settingsStore.updateLastSyncTime();
      gistLastSyncTime.value = Date.now();
      saveGistConfig();
      // 重置自动同步定时器
      setupAutoSync();
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
    gistSyncing.value = false;
  }
};

// 从 Gist 下载
const downloadFromGist = async () => {
  if (!gistId.value.trim()) {
    toast.add({
      severity: 'warn',
      summary: '下载失败',
      detail: '请先配置 Gist ID',
      life: 3000,
    });
    return;
  }

  if (!gistUsername.value.trim() || !gistToken.value.trim()) {
    toast.add({
      severity: 'warn',
      summary: '下载失败',
      detail: '请先配置 GitHub 用户名和 token',
      life: 3000,
    });
    return;
  }

  gistSyncing.value = true;
  try {
    const baseConfig = settingsStore.gistSync;
    const config: SyncConfig = {
      ...baseConfig,
      enabled: true,
      syncParams: {
        ...baseConfig.syncParams,
        username: gistUsername.value,
        gistId: gistId.value,
      },
      secret: gistToken.value,
    };

    const result = await gistSyncService.downloadFromGist(config);

    if (result.success && result.data) {
      // 直接应用下载的数据（无冲突解决，因为这是手动下载，直接覆盖）
      await SyncDataService.applyDownloadedData(result.data, []);

      settingsStore.updateLastSyncTime();
      gistLastSyncTime.value = Date.now();
      // 重置自动同步定时器
      setupAutoSync();
      
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
    gistSyncing.value = false;
  }
};

// 删除 Gist
const deleteGist = () => {
  if (!gistId.value.trim()) {
    toast.add({
      severity: 'warn',
      summary: '删除失败',
      detail: '请先配置 Gist ID',
      life: 3000,
    });
    return;
  }

  if (!gistUsername.value.trim() || !gistToken.value.trim()) {
    toast.add({
      severity: 'warn',
      summary: '删除失败',
      detail: '请先配置 GitHub 用户名和 token',
      life: 3000,
    });
    return;
  }

  // 使用 ConfirmDialog 确认删除
  confirm.require({
    message: `确定要删除 Gist (ID: ${gistId.value}) 吗？此操作不可撤销，将永久删除 Gist 中的所有数据。`,
    header: '确认删除 Gist',
    icon: 'pi pi-exclamation-triangle',
    rejectClass: 'p-button-text',
    acceptClass: 'p-button-danger',
    rejectLabel: '取消',
    acceptLabel: '删除',
    accept: async () => {
      gistSyncing.value = true;
      try {
        const baseConfig = settingsStore.gistSync;
        const config: SyncConfig = {
          ...baseConfig,
          enabled: true,
          syncParams: {
            ...baseConfig.syncParams,
            username: gistUsername.value,
            gistId: gistId.value,
          },
          secret: gistToken.value,
        };

        const result = await gistSyncService.deleteGist(config);

        if (result.success) {
          // 清除本地 Gist ID
          gistId.value = '';
          settingsStore.setGistId('');
          saveGistConfig();
          toast.add({
            severity: 'success',
            summary: '删除成功',
            detail: result.message || 'Gist 已成功删除',
            life: 3000,
          });
        } else {
          toast.add({
            severity: 'error',
            summary: '删除失败',
            detail: result.error || '删除 Gist 时发生未知错误',
            life: 5000,
          });
        }
      } catch (error) {
        toast.add({
          severity: 'error',
          summary: '删除失败',
          detail: error instanceof Error ? error.message : '删除时发生未知错误',
          life: 5000,
        });
      } finally {
        gistSyncing.value = false;
      }
    },
  });
};
</script>

<template>
  <div class="p-4 space-y-4">
    <div>
      <h3 class="text-sm font-medium text-moon/90 mb-1">Gist 同步设置</h3>
      <p class="text-xs text-moon/70">
        使用 GitHub Gist 同步您的设置和书籍数据。所有数据将保存在一个私有 Gist 中。
      </p>
      <p class="text-xs text-moon/60 mt-1">
        需要 GitHub Personal Access Token，权限需要包含 <code class="text-xs">gist</code>
      </p>
    </div>

    <!-- 启用同步 -->
    <div class="space-y-2">
      <div class="flex items-center gap-2">
        <Checkbox
          :binary="true"
          :model-value="gistEnabled"
          input-id="gist-enabled"
          @update:model-value="
            (value) => {
              gistEnabled = value as boolean;
              saveGistConfig();
            }
          "
        />
        <label for="gist-enabled" class="text-xs text-moon/80 cursor-pointer">
          启用 Gist 同步
        </label>
      </div>
    </div>

    <!-- GitHub 用户名 -->
    <div class="space-y-2">
      <label for="gist-username" class="text-xs text-moon/80">GitHub 用户名</label>
      <InputText
        id="gist-username"
        v-model="gistUsername"
        placeholder="输入您的 GitHub 用户名"
        class="w-full"
        :disabled="!gistEnabled"
        @blur="saveGistConfig"
      />
    </div>

    <!-- GitHub Token -->
    <div class="space-y-2">
      <label for="gist-token" class="text-xs text-moon/80">GitHub Personal Access Token</label>
      <Password
        id="gist-token"
        v-model="gistToken"
        placeholder="输入您的 GitHub token"
        class="w-full"
        :disabled="!gistEnabled"
        :feedback="false"
        toggle-mask
        @blur="saveGistConfig"
      />
      <p class="text-xs text-moon/60">
        在 GitHub Settings → Developer settings → Personal access tokens 中创建
      </p>
    </div>

    <!-- Gist ID -->
    <div class="space-y-2">
      <label for="gist-id" class="text-xs text-moon/80">Gist ID（可选）</label>
      <InputText
        id="gist-id"
        v-model="gistId"
        placeholder="留空将自动创建新的 Gist"
        class="w-full"
        :disabled="!gistEnabled"
        @blur="saveGistConfig"
      />
      <p class="text-xs text-moon/60">如果已有 Gist，请输入 Gist ID。留空将自动创建新的 Gist</p>
    </div>

    <!-- 自动同步设置 -->
    <div class="p-4 rounded-lg border border-white/10 bg-white/5 space-y-3">
      <div class="flex items-center gap-2">
        <Checkbox
          :binary="true"
          :model-value="autoSyncEnabled"
          input-id="auto-sync-enabled"
          :disabled="!gistEnabled"
          @update:model-value="handleAutoSyncEnabledChange"
        />
        <label for="auto-sync-enabled" class="text-xs text-moon/80 cursor-pointer">
          启用自动同步
        </label>
      </div>
      <div v-if="autoSyncEnabled" class="space-y-2">
        <label for="sync-interval" class="text-xs text-moon/80">同步间隔（分钟）</label>
        <InputNumber
          id="sync-interval"
          :model-value="syncIntervalMinutes"
          :min="1"
          :max="1440"
          :show-buttons="true"
          class="w-full"
          :disabled="!gistEnabled"
          @focus="stopAutoSync"
          @update:model-value="handleSyncIntervalChange"
        />
        <p class="text-xs text-moon/60">
          每 {{ syncIntervalMinutes }} 分钟自动同步一次（1-1440 分钟，即最多 24 小时）
        </p>
      </div>
    </div>

    <!-- 最后同步时间 -->
    <div v-if="gistLastSyncTime" class="text-xs text-moon/60">
      最后同步时间：
      {{ new Date(gistLastSyncTime).toLocaleString('zh-CN') }}
    </div>

    <!-- 操作按钮 -->
    <div class="space-y-2 pt-2">
      <Button
        label="验证 Token"
        icon="pi pi-check-circle"
        class="p-button-outlined w-full"
        :disabled="!gistEnabled || gistValidating"
        :loading="gistValidating"
        @click="validateGistToken"
      />
      <div class="grid grid-cols-2 gap-2">
        <Button
          label="上传到 Gist"
          icon="pi pi-upload"
          class="p-button-primary"
          :disabled="!gistEnabled || gistSyncing"
          :loading="gistSyncing"
          @click="uploadToGist"
        />
        <Button
          label="从 Gist 下载"
          icon="pi pi-download"
          class="p-button-outlined"
          :disabled="!gistEnabled || gistSyncing || !gistId"
          :loading="gistSyncing"
          @click="downloadFromGist"
        />
      </div>
    </div>

    <!-- 修订历史 -->
    <div v-if="gistEnabled && gistId" class="border-t border-white/10 pt-6 mt-6">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-sm font-medium text-moon/90">修订历史</h3>
        <Button
          icon="pi pi-refresh"
          class="p-button-text p-button-sm"
          :disabled="loadingRevisions"
          :loading="loadingRevisions"
          @click="loadRevisions"
        />
      </div>

      <div class="space-y-2">
        <div
          v-for="revision in revisions"
          :key="revision.version"
          class="border border-white/10 rounded-lg overflow-hidden"
        >
          <div
            class="flex items-center justify-between p-3 cursor-pointer hover:bg-white/5 transition-colors"
            @click="toggleRevision(revision.version)"
          >
            <div class="flex items-center gap-3 flex-1">
              <i
                :class="[
                  expandedRevisions.has(revision.version)
                    ? 'pi pi-chevron-down'
                    : 'pi pi-chevron-right',
                  'text-moon/60 text-sm',
                ]"
              />
              <code class="text-xs bg-white/5 px-2 py-1 rounded">{{
                revision.version.substring(0, 7)
              }}</code>
              <div class="flex flex-col flex-1">
                <span class="text-sm text-moon/90">{{
                  formatRelativeTime(new Date(revision.committedAt).getTime())
                }}</span>
                <span class="text-xs text-moon/60">
                  {{ new Date(revision.committedAt).toLocaleString('zh-CN') }}
                </span>
              </div>
              <div class="flex items-center gap-2">
                <span class="text-green-500 text-sm">+{{ revision.changeStatus.additions }}</span>
                <span class="text-red-500 text-sm">-{{ revision.changeStatus.deletions }}</span>
              </div>
            </div>
            <div class="flex items-center gap-2 ml-4">
              <Button
                label="恢复"
                icon="pi pi-undo"
                class="p-button-text p-button-sm"
                :disabled="revertingVersion === revision.version"
                :loading="revertingVersion === revision.version"
                @click.stop="revertToRevision(revision.version)"
              />
            </div>
          </div>

          <!-- 展开的文件变更列表 -->
          <div
            v-if="expandedRevisions.has(revision.version)"
            class="border-t border-white/10 bg-white/5 p-3"
          >
            <div v-if="loadingRevisionDetails.has(revision.version)" class="text-center py-4">
              <i class="pi pi-spin pi-spinner text-moon/60" />
              <span class="text-sm text-moon/60 ml-2">加载中...</span>
            </div>
            <div v-else-if="revision.files && revision.files.length > 0" class="space-y-2">
              <div
                v-for="file in getGroupedFiles(revision.files)"
                :key="file.filename"
                class="flex items-center justify-between py-1 px-2 rounded hover:bg-white/5"
              >
                <div class="flex items-center gap-2 flex-1 min-w-0">
                  <i :class="[file.icon, 'text-moon/60 text-sm']" />
                  <span class="text-sm text-moon/90 truncate">{{ file.displayName }}</span>
                </div>
                <div class="flex items-center gap-2 ml-2">
                  <span class="text-xs text-moon/60">
                    {{ file.size !== undefined ? formatFileSize(file.size) : '-' }}
                  </span>
                  <span
                    v-if="file.sizeDiff !== undefined"
                    :class="[
                      'text-xs',
                      file.sizeDiff > 0
                        ? 'text-green-500'
                        : file.sizeDiff < 0
                          ? 'text-red-500'
                          : 'text-moon/60',
                    ]"
                  >
                    {{ file.sizeDiff > 0 ? '+' : '' }}{{ formatFileSize(Math.abs(file.sizeDiff)) }}
                  </span>
                </div>
              </div>
            </div>
            <p v-else class="text-sm text-moon/60 text-center py-2">无文件变更信息</p>
          </div>
        </div>
      </div>

      <div
        v-if="revisions.length === 0 && !loadingRevisions"
        class="text-sm text-moon/60 text-center py-4"
      >
        暂无修订历史
      </div>
      <div v-if="loadingRevisions" class="text-sm text-moon/60 text-center py-4">加载中...</div>
    </div>

    <!-- 删除 Gist 按钮（独立区域） -->
    <div class="border-t border-white/10 pt-6 mt-6">
      <Button
        label="删除当前 Gist"
        icon="pi pi-trash"
        class="p-button-danger w-full"
        :disabled="!gistEnabled || gistSyncing || !gistId"
        :loading="gistSyncing"
        @click="deleteGist"
      />
    </div>
  </div>
</template>

<style scoped>
.revisions-table :deep(.p-datatable) {
  background: transparent;
  color: inherit;
}

.revisions-table :deep(.p-datatable-header) {
  background: transparent;
  border: none;
  padding: 0.5rem 0;
}

.revisions-table :deep(.p-datatable-thead > tr > th) {
  background: transparent;
  border: none;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.8);
  padding: 0.75rem;
  font-weight: 500;
}

.revisions-table :deep(.p-datatable-tbody > tr) {
  background: transparent;
  border: none;
}

.revisions-table :deep(.p-datatable-tbody > tr > td) {
  padding: 0.75rem;
  border: none;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.9);
}

.revisions-table :deep(.p-datatable-tbody > tr:hover) {
  background: rgba(255, 255, 255, 0.05);
}

.revisions-table :deep(.p-paginator) {
  background: transparent;
  border: none;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  padding: 0.75rem 0;
}

.revisions-table :deep(.p-paginator .p-paginator-pages .p-paginator-page) {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.8);
}

.revisions-table :deep(.p-paginator .p-paginator-pages .p-paginator-page.p-highlight) {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.2);
  color: rgba(255, 255, 255, 0.95);
}

.revisions-table :deep(.p-paginator .p-paginator-pages .p-paginator-page:hover) {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.2);
}
</style>
