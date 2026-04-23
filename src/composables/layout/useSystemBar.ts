import { computed, ref, type ComponentPublicInstance } from 'vue';
import { useToastHistory } from 'src/composables/useToastHistory';
import { useSyncPendingChanges } from 'src/composables/useSyncPendingChanges';
import { useAIProcessingStore } from 'src/stores/ai-processing';
import { useSettingsStore } from 'src/stores/settings';

type TogglePanel = { toggle: (event: Event) => void };

/**
 * MobileSysBar / TabletSysBar 共享的脚本逻辑：
 * - 通知徽标、AI 思考指示灯、同步状态分类
 * - ToastHistoryDialog / SyncStatusPanel / ThinkingProcessPanel 的 ref + toggle handler
 *
 * 模板结构（class、布局）保持各变体自定义。
 */
export function useSystemBar() {
  const { unreadCount } = useToastHistory();
  const aiProcessing = useAIProcessingStore();
  const settingsStore = useSettingsStore();

  const gistSync = computed(() => settingsStore.gistSync);
  const isSyncing = computed(() => settingsStore.isSyncing);
  const { pendingCount, hasPendingChanges } = useSyncPendingChanges();

  const syncState = computed<'idle' | 'syncing' | 'changes' | 'ok' | 'pending'>(() => {
    if (!gistSync.value.enabled) return 'idle';
    if (isSyncing.value) return 'syncing';
    if (hasPendingChanges.value) return 'changes';
    if (gistSync.value.lastSyncTime && gistSync.value.lastSyncTime > 0) return 'ok';
    return 'pending';
  });

  const nextSyncTime = computed<number | null>(() => {
    const cfg = gistSync.value;
    if (!cfg.enabled || !cfg.lastSyncTime || cfg.syncInterval <= 0) return null;
    return cfg.lastSyncTime + cfg.syncInterval;
  });

  const thinking = computed(() => aiProcessing.hasActiveTasks);

  const latestThinkingStatus = computed<'thinking' | 'processing' | null>(() => {
    const active = aiProcessing.activeTasks.filter(
      (t) => t.status === 'thinking' || t.status === 'processing',
    );
    if (active.length === 0) return null;
    const latest = active.sort((a, b) => b.startTime - a.startTime)[0];
    const status = latest?.status;
    return status === 'thinking' || status === 'processing' ? status : null;
  });

  const toastHistoryRef = ref<ComponentPublicInstance<TogglePanel> | null>(null);
  const thinkingPanelRef = ref<TogglePanel | null>(null);
  const syncPanelRef = ref<TogglePanel | null>(null);

  const toggleHistory = (event: Event) => toastHistoryRef.value?.toggle(event);
  const toggleThinking = (event: Event) => thinkingPanelRef.value?.toggle(event);
  const toggleSync = (event: Event) => syncPanelRef.value?.toggle(event);

  return {
    unreadCount,
    pendingCount,
    syncState,
    nextSyncTime,
    thinking,
    latestThinkingStatus,
    toastHistoryRef,
    thinkingPanelRef,
    syncPanelRef,
    toggleHistory,
    toggleThinking,
    toggleSync,
  };
}
