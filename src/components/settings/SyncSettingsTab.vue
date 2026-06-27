<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Password from 'primevue/password';
import Checkbox from 'primevue/checkbox';
import InputNumber from 'primevue/inputnumber';
import { useConfirm } from 'primevue/useconfirm';
import ConfirmDialog from 'primevue/confirmdialog';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import { useSettingsStore } from 'src/stores/settings';
import { GistSyncService } from 'src/services/gist-sync-service';
import { SyncDataService, type RestorableItem } from 'src/services/sync-data-service';
import type { SyncConfig } from 'src/models/sync';
import { useAutoSync } from 'src/composables/useAutoSync';
import { useGistSync } from 'src/composables/useGistUploadWithConflictCheck';
import { useForceSync } from 'src/composables/useForceSync';
import ForceSyncToggle from 'src/components/sync/ForceSyncToggle.vue';
import RestoreDeletedItemsDialog from 'src/components/dialogs/RestoreDeletedItemsDialog.vue';
import SyncRevisionCard from 'src/components/settings/SyncRevisionCard.vue';
import { isRevisionRestoreBlocked } from 'src/utils/sync-revision-guards';
import co from 'co';

const props = defineProps<{
  visible: boolean;
}>();

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
const isRestoringRevision = computed(() => settingsStore.isRestoringSyncSnapshot);

// 同步相关 - 使用 composable
const { sync: syncComposable, restoreDeletedItems: restoreDeletedItemsComposable } = useGistSync();
const { confirmAndForceSync } = useForceSync();

// 强制推送模式状态
const forceMode = computed(() => settingsStore.forceSyncMode.active);

// 触发强制推送：使用当前表单的配置作为 config 覆盖
const triggerForceSync = () => {
  if (isRestoringRevision.value) {
    return;
  }

  const baseConfig = settingsStore.gistSync;
  const currentConfig: SyncConfig = {
    ...baseConfig,
    enabled: true,
    syncParams: {
      ...baseConfig.syncParams,
      username: gistUsername.value,
      ...(gistId.value ? { gistId: gistId.value } : {}),
    },
    secret: gistToken.value,
  };
  void confirmAndForceSync({ config: currentConfig });
};

// 恢复对话框状态
const showRestoreDialog = ref(false);
const restorableItems = ref<RestorableItem[]>([]);

const resetDeletedItemsRestoreDialog = () => {
  showRestoreDialog.value = false;
  restorableItems.value = [];
};

watch(isRestoringRevision, (restoring) => {
  if (restoring) {
    resetDeletedItemsRestoreDialog();
  }
});

const isRevisionActionLocked = computed(() => gistSyncing.value || isRestoringRevision.value);

// 以下 computed 把模板里重复的 || / && / ?: 表达式收进脚本侧，降低模板圈复杂度
const gistInputDisabled = computed(() => !gistEnabled.value || isRestoringRevision.value);
const syncActionDisabled = computed(
  () => !gistEnabled.value || gistSyncing.value || isRestoringRevision.value,
);
const validateTokenDisabled = computed(
  () => !gistEnabled.value || gistValidating.value || isRestoringRevision.value,
);
const loadRevisionsBtnDisabled = computed(
  () => loadingRevisions.value || isRevisionActionLocked.value,
);
const hasRevisionHistory = computed(() => gistEnabled.value && !!gistId.value);
const hasNoRevisions = computed(() => revisions.value.length === 0 && !loadingRevisions.value);
const deleteGistDisabled = computed(
  () => !gistEnabled.value || gistSyncing.value || isRestoringRevision.value || !gistId.value,
);
const syncButtonLabel = computed(() => (forceMode.value ? '强制推送到远程' : '同步'));
const syncButtonSeverity = computed(() => (forceMode.value ? 'danger' : 'primary'));
const handleSyncClick = () => {
  if (forceMode.value) {
    triggerForceSync();
  } else {
    syncToGist();
  }
};

const isRevisionRestoreDisabled = (version: string): boolean =>
  isRevisionRestoreBlocked({
    gistId: gistId.value,
    gistEnabled: gistEnabled.value,
    isSyncing: gistSyncing.value,
    isRestoringRevision: isRestoringRevision.value,
    revertingVersion: revertingVersion.value,
    version,
  });

// 同一批次（2 分钟内）的修订合并显示，每批只保留列表中第一条（即最新一条）
const REVISION_BATCH_WINDOW_MS = 120000;

const shouldStartNewBatch = <T extends { committedAt: string }>(
  lastRev: T,
  rev: T,
): boolean => {
  const timeDiff = new Date(lastRev.committedAt).getTime() - new Date(rev.committedAt).getTime();
  return Math.abs(timeDiff) > REVISION_BATCH_WINDOW_MS;
};

const finalizeBatch = <T>(combined: T[], batch: T[]): void => {
  const first = batch[0];
  if (batch.length > 0 && first) {
    combined.push(first);
  }
};

const combineNearbyRevisions = <T extends { committedAt: string }>(revs: T[]): T[] => {
  const combined: T[] = [];
  let currentBatch: T[] = [];

  for (let index = 0; index < revs.length; index++) {
    const rev = revs[index]!;
    const lastRev = currentBatch[currentBatch.length - 1];

    if (currentBatch.length === 0 || (lastRev !== undefined && !shouldStartNewBatch(lastRev, rev))) {
      currentBatch.push(rev);
    } else if (lastRev !== undefined) {
      // 当前批次结束，取最新一条（列表第一条）写入合并结果
      finalizeBatch(combined, currentBatch);
      currentBatch = [rev];
    }

    // 最后一条修订：把收尾批次写入合并结果
    if (index === revs.length - 1) {
      finalizeBatch(combined, currentBatch);
    }
  }

  return combined;
};

// 修订文件状态枚举
type RevisionFileStatus = 'added' | 'removed' | 'modified' | 'renamed';
type RevisionFileEntry = { filename: string; status?: RevisionFileStatus };
type BuiltRevisionFile = { filename: string; status: RevisionFileStatus; size: number; sizeDiff?: number };

// 用当前表单值构造用于调用 Gist API 的同步配置（loadRevisions / loadRevisionDetails 共用）
const buildGistFetchConfig = (): SyncConfig => {
  const baseConfig = settingsStore.gistSync;
  return {
    ...baseConfig,
    enabled: true,
    syncParams: {
      ...baseConfig.syncParams,
      username: gistUsername.value,
      gistId: gistId.value,
    },
    secret: gistToken.value,
  };
};

// 加载修订历史的门禁条件
const canLoadRevisions = (): boolean =>
  !gistId.value || !gistEnabled.value || gistSyncing.value || isRestoringRevision.value;

// 加载修订历史
const loadRevisions = async () => {
  if (canLoadRevisions()) {
    return;
  }

  loadingRevisions.value = true;
  try {
    const result = await gistSyncService.getGistRevisions(buildGistFetchConfig());
    if (result.success && result.revisions) {
      revisions.value = combineNearbyRevisions(result.revisions);
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

// 拉取上一版文件 size 映射，用于计算 sizeDiff / added 状态；无上一版或拉取失败返回 null
const buildPreviousFilesMap = async (
  config: SyncConfig,
  previousRevision: { version: string } | undefined,
): Promise<Map<string, { size?: number }> | null> => {
  if (!previousRevision) return null;
  const previousRevisionResponse = await gistSyncService.getGistRevision(
    config,
    previousRevision.version,
  );
  if (!previousRevisionResponse.success || !previousRevisionResponse.data) return null;

  const map = new Map<string, { size?: number }>();
  for (const [filename, file] of Object.entries(previousRevisionResponse.data.files || {})) {
    if (file?.size !== undefined) {
      map.set(filename, { size: file.size });
    } else {
      map.set(filename, {});
    }
  }
  return map;
};

// 判定单个文件相对上一版的变更状态（优先沿用 getGistRevisions 已提供的状态）
const resolveRevisionFileStatus = (
  existingFile: RevisionFileEntry | undefined,
  previousFilesMap: Map<string, { size?: number }> | null,
  previousFile: { size?: number } | undefined,
): RevisionFileStatus => {
  if (existingFile?.status) return existingFile.status;
  if (!previousFilesMap) return 'added'; // 第一个版本，所有文件都是新增
  if (!previousFile) return 'added'; // 上一版不存在 → 新文件
  return 'modified';
};

// 计算单个文件相对上一版的大小差异
const resolveRevisionSizeDiff = (
  currentSize: number,
  previousFilesMap: Map<string, { size?: number }> | null,
  previousFile: { size?: number } | undefined,
): number | undefined => {
  if (!previousFilesMap) return undefined; // 第一个版本，无上一版
  if (!previousFile) return currentSize; // 新文件
  if (previousFile.size !== undefined) return currentSize - previousFile.size;
  return undefined;
};

// 汇总单次修订的文件列表：合并当前快照、上一版 size 映射、已有状态
const buildRevisionFiles = (
  currentFilesMap: Record<string, { size?: number }>,
  existingRevision: { files?: RevisionFileEntry[] } | undefined,
  previousFilesMap: Map<string, { size?: number }> | null,
): BuiltRevisionFile[] => {
  const existingFiles = existingRevision?.files ?? [];
  const existingFilesMap = new Map(existingFiles.map((f) => [f.filename, f] as const));
  return Object.keys(currentFilesMap).map((filename) => {
    const file = currentFilesMap[filename];
    const currentSize = file?.size || 0;
    const previousFile = previousFilesMap?.get(filename);

    const status = resolveRevisionFileStatus(
      existingFilesMap.get(filename),
      previousFilesMap,
      previousFile,
    );
    const sizeDiff = resolveRevisionSizeDiff(currentSize, previousFilesMap, previousFile);

    return {
      filename,
      status,
      size: currentSize,
      ...(sizeDiff !== undefined ? { sizeDiff } : {}),
    };
  });
};

// 拉取并汇总单个修订版本的文件列表（不含 try/catch 与 loading 状态）
const processRevisionDetails = async (version: string, config: SyncConfig): Promise<void> => {
  const revisionIndex = revisions.value.findIndex((r) => r.version === version);
  if (revisionIndex === -1) {
    return;
  }

  const revisionResponse = await gistSyncService.getGistRevision(config, version);
  if (!revisionResponse.success || !revisionResponse.data) {
    return;
  }

  const currentFilesMap = revisionResponse.data.files || {};
  const previousRevision = revisions.value[revisionIndex + 1];
  const previousFilesMap = await buildPreviousFilesMap(config, previousRevision);

  const existingRevision = revisions.value[revisionIndex];
  const files = buildRevisionFiles(currentFilesMap, existingRevision, previousFilesMap);

  // 保留所有原有属性，只更新 files
  if (existingRevision) {
    revisions.value[revisionIndex] = {
      version: existingRevision.version,
      committedAt: existingRevision.committedAt,
      changeStatus: existingRevision.changeStatus,
      files,
    };
  }
};

// 加载单个修订版本的详细信息
const loadRevisionDetails = async (version: string) => {
  if (!gistId.value || !gistEnabled.value || loadingRevisionDetails.value.has(version)) {
    return;
  }

  loadingRevisionDetails.value.add(version);
  try {
    await processRevisionDetails(version, buildGistFetchConfig());
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

// 把 syncInterval（毫秒）换算为分钟数；未启用自动同步时回退到默认 5 分钟
const resolveSyncIntervalMinutes = (interval: number): number =>
  interval > 0 ? Math.floor(interval / 60000) : 5;

// 把 store 中的 Gist 同步配置同步到表单 ref
const applyGistConfigToForm = (config: SyncConfig) => {
  gistUsername.value = config.syncParams.username ?? '';
  gistToken.value = config.secret ?? '';
  gistEnabled.value = config.enabled ?? false;
  gistId.value = config.syncParams.gistId ?? '';
  gistLastSyncTime.value = config.lastSyncTime || undefined;
  // 自动同步：syncInterval > 0 视为已启用
  autoSyncEnabled.value = config.syncInterval > 0;
  syncIntervalMinutes.value = resolveSyncIntervalMinutes(config.syncInterval);
};

// 初始化 Gist 配置
watch(
  () => props.visible,
  (isVisible) => {
    if (!isVisible) return;
    applyGistConfigToForm(settingsStore.gistSync);
    // 加载修订历史
    if (gistId.value && gistEnabled.value) {
      void loadRevisions();
    }
  },
  { immediate: true },
);

// 恢复到指定修订版本
const revertToRevision = (version: string, event?: Event) => {
  // 阻止事件冒泡，防止触发父元素的点击事件
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }

  if (isRevisionRestoreDisabled(version)) {
    return;
  }

  confirm.require({
    group: 'sync',
    message:
      '确定要恢复到该修订版本吗？这将用该版本的快照完全覆盖本地数据，本地独有且未同步的内容（包括书籍、记忆、AI 模型等）将会丢失，无法找回。',
    header: '确认恢复',
    icon: 'pi pi-exclamation-triangle',
    rejectProps: {
      label: '取消',
      severity: 'secondary',
    },
    acceptProps: {
      label: '恢复',
      severity: 'danger',
    },
    accept: () => {
      if (isRevisionRestoreDisabled(version)) {
        return;
      }

      void co(function* () {
        resetDeletedItemsRestoreDialog();
        settingsStore.setRestoringSyncSnapshot(true);
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

          const result = yield gistSyncService.downloadFromGistRevision(config, version);

          if (result.success && result.data) {
            // 完全覆盖：SyncDataService 内部会清空所有已同步数据、按快照写回，
            // 并清空删除记录。恢复模式下不弹出"恢复已删除项"对话框。
            yield SyncDataService.overwriteFromSnapshot(result.data);

            yield settingsStore.updateLastSyncTime();
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
          settingsStore.setRestoringSyncSnapshot(false);
          revertingVersion.value = null;
        }
      });
    },
  });
};

// 保存 Gist 配置
const saveGistConfig = (shouldRestartAutoSync = false) => {
  if (isRestoringRevision.value) {
    return;
  }

  void co(function* () {
    try {
      yield settingsStore.setGistSyncCredentials(gistUsername.value, gistToken.value);
      if (gistId.value) {
        yield settingsStore.setGistId(gistId.value);
      }
      yield settingsStore.setGistSyncEnabled(gistEnabled.value);
      // 保存自动同步设置（注意：这不会覆盖已设置的 lastSyncTime）
      yield settingsStore.setSyncInterval(
        autoSyncEnabled.value ? syncIntervalMinutes.value * 60000 : 0,
      );
    } catch (error) {
      console.error('[SyncSettingsTab] 保存 Gist 配置失败:', error);
    }
  });

  // 如果需要重新启动自动同步，延迟执行以确保配置已保存
  if (shouldRestartAutoSync) {
    // 使用 nextTick 确保状态更新完成后再重新启动
    window.setTimeout(() => {
      setupAutoSync();
    }, 150);
  }
};

const handleGistEnabledChange = (value: boolean) => {
  if (isRestoringRevision.value) {
    return;
  }

  gistEnabled.value = value;
  saveGistConfig();
};

// 处理自动同步启用/禁用
const handleAutoSyncEnabledChange = (value: boolean) => {
  if (isRestoringRevision.value) {
    return;
  }

  autoSyncEnabled.value = value;
  stopAutoSync(); // 立即停止自动同步
  if (value) {
    // 如果启用自动同步，先保存同步间隔
    void co(function* () {
      try {
        yield settingsStore.setSyncInterval(syncIntervalMinutes.value * 60000);
        // 然后重置最后同步时间为当前时间，使计时器从当前时间重新开始
        yield settingsStore.updateLastSyncTime();
      } catch (error) {
        console.error('[SyncSettingsTab] 更新自动同步设置失败:', error);
      }
    });
    // 重新启动自动同步
    window.setTimeout(() => {
      setupAutoSync();
    }, 100);
  } else {
    // 如果禁用自动同步，设置间隔为 0
    void settingsStore.setSyncInterval(0);
  }
};

// 处理同步间隔更改
const handleSyncIntervalChange = (value: number | null) => {
  if (isRestoringRevision.value) {
    return;
  }

  const newValue = Number(value) || 5;
  if (newValue !== syncIntervalMinutes.value) {
    syncIntervalMinutes.value = newValue;

    if (autoSyncEnabled.value) {
      // 先保存同步间隔
      void co(function* () {
        try {
          yield settingsStore.setSyncInterval(newValue * 60000);
          // 然后重置最后同步时间为当前时间，使计时器从当前时间重新开始
          yield settingsStore.updateLastSyncTime();
        } catch (error) {
          console.error('[SyncSettingsTab] 更新同步间隔失败:', error);
        }
      });
      // 重新启动自动同步（使用新的间隔和新的开始时间）
      window.setTimeout(() => {
        setupAutoSync();
      }, 100);
    } else {
      // 即使自动同步未启用，也保存值
      void settingsStore.setSyncInterval(0);
    }
  }
};

// 验证 GitHub token
const validateGistToken = async () => {
  if (isRestoringRevision.value) {
    return;
  }

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

// 同步到 Gist（统一的双向同步操作）
const syncToGist = async () => {
  if (isRestoringRevision.value) {
    return;
  }

  if (!gistUsername.value.trim() || !gistToken.value.trim()) {
    toast.add({
      severity: 'warn',
      summary: '同步失败',
      detail: '请先配置 GitHub 用户名和 token',
      life: 3000,
    });
    return;
  }

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

  // 使用 composable 处理同步
  const items = await syncComposable(config);

  // 同步完成后更新本地状态
  // 从 store 中获取最新的 gistId（可能在首次同步时被设置）
  const updatedGistId = settingsStore.gistSync.syncParams.gistId;
  if (updatedGistId) {
    gistId.value = updatedGistId;
  }
  gistLastSyncTime.value = Date.now();
  saveGistConfig();
  // 重置自动同步定时器
  setupAutoSync();

  // 如果有可恢复的项目，显示恢复对话框
  if (items && items.length > 0) {
    restorableItems.value = items;
    showRestoreDialog.value = true;
  }
};

// 处理恢复对话框
const handleRestoreItems = async (items: RestorableItem[]) => {
  if (isRestoringRevision.value) {
    resetDeletedItemsRestoreDialog();
    return;
  }

  await restoreDeletedItemsComposable(items);
  resetDeletedItemsRestoreDialog();
  gistLastSyncTime.value = Date.now();
  // 重置自动同步定时器
  setupAutoSync();
};

const handleCancelRestore = () => {
  if (isRestoringRevision.value) {
    resetDeletedItemsRestoreDialog();
    return;
  }

  resetDeletedItemsRestoreDialog();
};

const handleDeletedItemsRestoreDialogVisibleChange = (visible: boolean) => {
  if (isRestoringRevision.value) {
    resetDeletedItemsRestoreDialog();
    return;
  }

  showRestoreDialog.value = visible;
};

// 删除 Gist
const deleteGist = () => {
  if (isRestoringRevision.value) {
    return;
  }

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
    group: 'sync',
    message: `确定要删除 Gist (ID: ${gistId.value}) 吗？此操作不可撤销，将永久删除 Gist 中的所有数据。`,
    header: '确认删除 Gist',
    icon: 'pi pi-exclamation-triangle',
    rejectProps: {
      label: '取消',
      severity: 'secondary',
    },
    acceptProps: {
      label: '删除',
      severity: 'danger',
    },
    accept: () => {
      void co(function* () {
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

          const result = yield gistSyncService.deleteGist(config);

          if (result.success) {
            // 清除本地 Gist ID
            gistId.value = '';
            void co(function* () {
              try {
                yield settingsStore.setGistId('');
              } catch (error) {
                console.error('[SyncSettingsTab] 清除 Gist ID 失败:', error);
              }
            });
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
      });
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
          :disabled="isRestoringRevision"
          @update:model-value="(value) => handleGistEnabledChange(value as boolean)"
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
        :disabled="gistInputDisabled"
        @blur="() => saveGistConfig()"
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
        :disabled="gistInputDisabled"
        :feedback="false"
        toggle-mask
        @blur="() => saveGistConfig()"
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
        :disabled="gistInputDisabled"
        @blur="() => saveGistConfig()"
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
          :disabled="gistInputDisabled"
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
          :disabled="gistInputDisabled"
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
    <div class="space-y-3 pt-2">
      <ForceSyncToggle :disabled="syncActionDisabled" />
      <Button
        label="验证 Token"
        icon="pi pi-check-circle"
        class="p-button-outlined w-full"
        :disabled="validateTokenDisabled"
        :loading="gistValidating"
        @click="validateGistToken"
      />
      <Button
        :label="syncButtonLabel"
        icon="pi pi-sync"
        :severity="syncButtonSeverity"
        class="w-full"
        :disabled="syncActionDisabled"
        :loading="gistSyncing"
        @click="handleSyncClick"
      />
    </div>

    <!-- 修订历史 -->
    <div v-if="hasRevisionHistory" class="border-t border-white/10 pt-6 mt-6">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-sm font-medium text-moon/90">修订历史</h3>
        <Button
          icon="pi pi-refresh"
          class="p-button-text p-button-sm"
          :disabled="loadRevisionsBtnDisabled"
          :loading="loadingRevisions"
          @click="loadRevisions"
        />
      </div>

      <div class="space-y-2">
        <SyncRevisionCard
          v-for="revision in revisions"
          :key="revision.version"
          :version="revision.version"
          :committed-at="revision.committedAt"
          :additions="revision.changeStatus.additions"
          :deletions="revision.changeStatus.deletions"
          :files="revision.files"
          :is-expanded="expandedRevisions.has(revision.version)"
          :is-loading-details="loadingRevisionDetails.has(revision.version)"
          :is-reverting="revertingVersion === revision.version"
          :is-restore-disabled="isRevisionRestoreDisabled(revision.version)"
          @toggle="toggleRevision(revision.version)"
          @revert="(event) => revertToRevision(revision.version, event)"
        />
      </div>

      <div
        v-if="hasNoRevisions"
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
        :disabled="deleteGistDisabled"
        :loading="gistSyncing"
        @click="deleteGist"
      />
    </div>

    <!-- 确认对话框（force-sync group 挂在 MainLayout，这里不重复挂） -->
    <ConfirmDialog group="sync" />
    <RestoreDeletedItemsDialog
      :visible="showRestoreDialog"
      :items="restorableItems"
      @update:visible="handleDeletedItemsRestoreDialogVisibleChange"
      @restore="handleRestoreItems"
      @cancel="handleCancelRestore"
    />
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

@media (max-width: 640px) {
  .revision-row {
    flex-wrap: wrap;
    gap: 0.5rem;
    padding: 0.75rem !important;
  }

  .revision-info {
    flex: 1 1 100%;
    flex-wrap: wrap;
    gap: 0.375rem;
  }

  .revision-stats {
    margin-left: auto;
  }

  .revision-actions {
    flex: 1 1 100%;
    justify-content: flex-end;
    margin-left: 0 !important;
  }
}
</style>
