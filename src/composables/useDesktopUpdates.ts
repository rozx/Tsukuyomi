import { computed, onUnmounted, readonly, shallowRef } from 'vue';
import type { DesktopUpdateState } from 'src/models/desktop-update';
import { useAIProcessingStore } from 'src/stores/ai-processing';
import { useImportWorkspaceStore } from 'src/stores/import-workspace';
import { useSettingsStore } from 'src/stores/settings';
import { desktopRestartGuard } from 'src/services/desktop-restart-guard';
import { getDB } from 'src/utils/indexed-db';

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
