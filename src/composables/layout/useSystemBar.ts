import { computed, ref, type ComponentPublicInstance } from 'vue';
import { useToastHistory } from 'src/composables/useToastHistory';
import { useSyncStatusDisplay } from 'src/composables/useSyncPendingChanges';
import { useAIProcessingStore } from 'src/stores/ai-processing';
import { useSettingsStore } from 'src/stores/settings';

type TogglePanel = { toggle: (event: Event) => void };

// 状态栏调色风格由各设备变体自行覆盖；此处仅用于复用 useSyncStatusDisplay 的判定逻辑，
// 颜色读值不在 system-bar 模板里使用。
const SYNC_DISPLAY_COLORS = {
  disabled: '',
  syncing: '',
  pending: '',
  synced: '',
  unsynced: '',
};

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
  // 复用 useSyncStatusDisplay，避免 nextSyncTime / pendingCount 规则在两处漂移
  const { pendingCount, hasPendingChanges, nextSyncTime } = useSyncStatusDisplay(
    SYNC_DISPLAY_COLORS,
  );

  const syncState = computed<'idle' | 'syncing' | 'changes' | 'ok' | 'pending'>(() => {
    if (!gistSync.value.enabled) return 'idle';
    if (isSyncing.value) return 'syncing';
    if (hasPendingChanges.value) return 'changes';
    if (gistSync.value.lastSyncTime && gistSync.value.lastSyncTime > 0) return 'ok';
    return 'pending';
  });

  const thinking = computed(() => aiProcessing.hasActiveTasks);

  const latestThinkingStatus = computed<'thinking' | 'processing' | null>(() => {
    let latestStatus: 'thinking' | 'processing' | null = null;
    let latestStart = -Infinity;
    for (const task of aiProcessing.activeTasks) {
      if (task.status !== 'thinking' && task.status !== 'processing') continue;
      if (task.startTime > latestStart) {
        latestStart = task.startTime;
        latestStatus = task.status;
      }
    }
    return latestStatus;
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
