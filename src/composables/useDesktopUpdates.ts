import { computed, onUnmounted, readonly, shallowRef } from 'vue';
import type { DesktopUpdateState } from 'src/models/desktop-update';
import { useAIProcessingStore } from 'src/stores/ai-processing';
import { useImportWorkspaceStore } from 'src/stores/import-workspace';
import { useSettingsStore } from 'src/stores/settings';
import { desktopRestartGuard } from 'src/services/desktop-restart-guard';
import { getDB } from 'src/utils/indexed-db';
import { useToastWithHistory } from 'src/composables/useToastHistory';

const state = shallowRef<DesktopUpdateState>({ phase: 'unavailable', currentVersion: '' });
let initialized = false;

/** App 生命周期注册一次；关于页只读取状态，不拥有订阅和后台定时器。 */
export function initializeDesktopUpdates() {
  const api = window.electronAPI?.updates;
  if (!api || initialized) return;
  initialized = true;
  const ai = useAIProcessingStore();
  const imports = useImportWorkspaceStore();
  const settings = useSettingsStore();
  let preparation = 0;
  const release = () => {
    preparation++;
    desktopRestartGuard.release();
    document.body.inert = false;
  };
  const assertIdle = () => {
    if (
      ai.hasActiveTasks ||
      settings.isSyncing ||
      settings.isRestoringSyncSnapshot ||
      imports.pendingAction ||
      imports.runningTaskId ||
      imports.tasks.some((task) => ['running', 'pausing'].includes(task.state))
    ) {
      throw new Error('仍有翻译、导入或同步任务，请完成后再更新');
    }
  };
  const stops = [
    api.onState((value) => {
      state.value = value;
    }),
    api.onRelease(release),
    api.onPrepare(async () => {
      const id = ++preparation;
      try {
        assertIdle();
        document.body.inert = true;
        // 聊天消息有 200ms trailing 保存；禁用输入后先让已排程保存落盘。
        await new Promise((resolve) => setTimeout(resolve, 300));
        if (id !== preparation) throw new Error('重启准备已取消');
        assertIdle();
        await desktopRestartGuard.prepare(async () => {
          if (!navigator.locks?.query) throw new Error('当前环境无法确认后台任务状态');
          const locks = await navigator.locks.query();
          if (
            [...(locks.held ?? []), ...(locks.pending ?? [])].some((lock) =>
              lock.name?.startsWith('tsukuyomi:book-execution'),
            )
          ) {
            throw new Error('书籍正在处理或保存，请稍后再更新');
          }
          const db = await getDB();
          // 全 store 的写事务屏障，等待之前排队的持久化完成。
          const tx = db.transaction([...db.objectStoreNames], 'readwrite');
          await tx.done;
          assertIdle();
          if (id !== preparation) throw new Error('重启准备已取消');
        });
      } catch (error) {
        if (id === preparation) release();
        throw error;
      }
    }),
  ];
  // 订阅先于快照；若快照返回前收到事件，保留较新的事件状态。
  const initial = state.value;
  void api
    .getState()
    .then((value) => {
      if (state.value === initial) state.value = value;
    })
    .catch((error: unknown) => {
      state.value = { ...state.value, message: String(error) };
    });
  onUnmounted(() => {
    stops.forEach((stop) => stop());
    release();
    initialized = false;
  });
}

export function useDesktopUpdates() {
  const invoke = async (action: 'check' | 'restart') => {
    try {
      const api = window.electronAPI?.updates;
      if (api) state.value = await api[action]();
    } catch (error) {
      state.value = {
        ...state.value,
        message: error instanceof Error ? error.message : '更新操作失败',
      };
    }
  };
  return {
    state: readonly(state),
    available: Boolean(window.electronAPI?.updates),
    busy: computed(() =>
      ['checking', 'downloading', 'preparing', 'installing'].includes(state.value.phase),
    ),
    check: () => invoke('check'),
    restart: () => invoke('restart'),
  };
}

export interface UpdateBadge {
  tone: 'latest' | 'update' | 'busy';
  label: string;
  title: string;
  clickable: boolean;
}

/** 页脚徽标：只在确认过结果时显示，避免尚未检查就宣称“已是最新”。 */
export function describeUpdateBadge(value: DesktopUpdateState): UpdateBadge | null {
  const target = value.targetVersion ? `v${value.targetVersion}` : '新版本';
  switch (value.phase) {
    case 'idle':
    case 'checking':
      return value.checkedAt
        ? { tone: 'latest', label: 'latest', title: '已是最新版本', clickable: false }
        : null;
    case 'downloading':
      return {
        tone: 'busy',
        label: `${target} · ${Math.round(value.progress ?? 0)}%`,
        title: `发现新版本 ${target}，正在后台下载`,
        clickable: false,
      };
    case 'ready':
      return {
        tone: 'update',
        label: `${target} available`,
        title: `新版本 ${target} 已下载，点击重启并更新`,
        clickable: true,
      };
    case 'preparing':
    case 'installing':
      return { tone: 'busy', label: 'updating…', title: '正在准备重启更新', clickable: false };
    default:
      return null;
  }
}

/** 页脚徽标交互：点击后由主进程弹出确认框，失败原因用 toast 告知。 */
export function useDesktopUpdateBadge() {
  const { state, restart } = useDesktopUpdates();
  const toast = useToastWithHistory();
  const activate = async () => {
    await restart();
    const reason = state.value.message;
    if (reason && state.value.phase === 'ready') {
      toast.add({ severity: 'warn', summary: '暂时无法更新', detail: reason, life: 5000 });
    }
  };
  return { badge: computed(() => describeUpdateBadge(state.value)), activate };
}
