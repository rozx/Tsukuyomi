import { computed, onUnmounted, readonly, shallowRef } from 'vue';
import type { DesktopUpdateState } from 'src/models/desktop-update';
import { useAIProcessingStore } from 'src/stores/ai-processing';
import { useImportWorkspaceStore } from 'src/stores/import-workspace';
import { useSettingsStore } from 'src/stores/settings';
import { desktopRestartGuard } from 'src/services/desktop-restart-guard';
import { getDB } from 'src/utils/indexed-db';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import type { AppLocale } from 'src/models/locale';
import type { MessageKey } from 'src/i18n/types';
import { translateText } from 'src/i18n/translate';
import { LocalizedError, localizedErrorMessage } from 'src/utils/localized-error';

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
  // 错误经主进程回到更新状态并展示给用户，按当前界面语言生成说明
  const fail = (code: string, key: 'busyTasks' | 'cancelled' | 'lockUnavailable' | 'bookBusy') =>
    new LocalizedError(code, `settingsUi.update.${key}`, {}, settings.uiLocale);
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
      throw fail('RESTART_TASKS_RUNNING', 'busyTasks');
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
        if (id !== preparation) throw fail('RESTART_CANCELLED', 'cancelled');
        assertIdle();
        await desktopRestartGuard.prepare(async () => {
          if (!navigator.locks?.query) throw fail('RESTART_LOCKS_UNAVAILABLE', 'lockUnavailable');
          const locks = await navigator.locks.query();
          if (
            [...(locks.held ?? []), ...(locks.pending ?? [])].some((lock) =>
              lock.name?.startsWith('tsukuyomi:book-execution'),
            )
          ) {
            throw fail('RESTART_BOOK_BUSY', 'bookBusy');
          }
          const db = await getDB();
          // 全 store 的写事务屏障，等待之前排队的持久化完成。
          const tx = db.transaction([...db.objectStoreNames], 'readwrite');
          await tx.done;
          assertIdle();
          if (id !== preparation) throw fail('RESTART_CANCELLED', 'cancelled');
        });
      } catch (error) {
        if (id === preparation) release();
        // 重启保护本身不知道界面语言，离开渲染进程前按当前界面语言投影
        throw error instanceof LocalizedError
          ? new Error(error.messageFor(settings.uiLocale))
          : error;
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
  const settings = useSettingsStore();
  const invoke = async (action: 'check' | 'restart') => {
    try {
      const api = window.electronAPI?.updates;
      if (api) state.value = await api[action]();
    } catch (error) {
      state.value = {
        ...state.value,
        message: localizedErrorMessage(error, settings.uiLocale, 'settingsUi.update.failed'),
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
export function describeUpdateBadge(
  value: DesktopUpdateState,
  locale: AppLocale = 'zh-CN',
): UpdateBadge | null {
  const text = (key: string, values: Record<string, string> = {}) =>
    translateText(locale, `settingsUi.update.${key}` as MessageKey, values);
  const target = value.targetVersion ? `v${value.targetVersion}` : text('newVersion');
  switch (value.phase) {
    case 'idle':
    case 'checking':
      return value.checkedAt
        ? { tone: 'latest', label: 'latest', title: text('latest'), clickable: false }
        : null;
    case 'downloading':
      return {
        tone: 'busy',
        label: `${target} · ${Math.round(value.progress ?? 0)}%`,
        title: text('downloadingBadge', { target }),
        clickable: false,
      };
    case 'ready':
      return {
        tone: 'update',
        label: `${target} available`,
        title: text('readyBadge', { target }),
        clickable: true,
      };
    case 'preparing':
    case 'installing':
      return { tone: 'busy', label: 'updating…', title: text('preparingBadge'), clickable: false };
    default:
      return null;
  }
}

/** 页脚徽标交互：点击后由主进程弹出确认框，失败原因用 toast 告知。 */
export function useDesktopUpdateBadge() {
  const { state, restart } = useDesktopUpdates();
  const toast = useToastWithHistory();
  const settings = useSettingsStore();
  const activate = async () => {
    await restart();
    const reason = state.value.message;
    if (reason && state.value.phase === 'ready') {
      toast.add({
        severity: 'warn',
        summary: translateText(settings.uiLocale, 'settingsUi.update.unavailableNow'),
        detail: reason,
        life: 5000,
      });
    }
  };
  return {
    badge: computed(() => describeUpdateBadge(state.value, settings.uiLocale)),
    activate,
  };
}
