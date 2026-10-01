import { useToast } from 'primevue/usetoast';
import type { ToastMessageOptions } from 'primevue/toast';
import { isDbBlocked } from 'src/utils/indexed-db';
import { useSettingsStore } from 'src/stores/settings';
import type { MessageKey } from 'src/i18n/types';
import { translateText } from 'src/i18n/translate';

type BlockedEvent = 'blocked' | 'resolved';

/**
 * 轮询数据库升级阻塞状态：进入阻塞时提示一次，解除后提示恢复并停止。
 * 返回停止函数，数据加载完成后由调用方停止；停止时若仍显示阻塞提示则补发恢复。
 */
export function watchDatabaseBlocked(
  isBlocked: () => boolean,
  notify: (event: BlockedEvent) => void,
  intervalMs = 1000,
): () => void {
  let notified = false;
  const resolve = () => {
    clearInterval(timer);
    if (!notified) return;
    notified = false;
    notify('resolved');
  };
  const timer = setInterval(() => {
    const blocked = isBlocked();
    if (blocked && !notified) {
      notified = true;
      notify('blocked');
    } else if (!blocked && notified) resolve();
  }, intervalMs);
  return resolve;
}

/**
 * 其他标签页仍在使用旧版本数据库时，向用户显示需要关闭旧页面的常驻提示。
 * 不经过 toast 历史：历史记录写入 IndexedDB，而此时数据库正被阻塞。
 */
export function useDatabaseBlockedNotice(): () => void {
  const toast = useToast();
  // 数据库被阻塞时设置尚未载入，uiLocale 回退到浏览器语言
  const settingsStore = useSettingsStore();
  const t = (key: string, values?: Record<string, string | number>) =>
    translateText(settingsStore.uiLocale, `syncUi.actions.${key}` as MessageKey, values);
  const warning: ToastMessageOptions = {
    severity: 'warn',
    summary: t('dbBlockedSummary'),
    detail: t('dbBlockedDetail'),
  };
  return watchDatabaseBlocked(isDbBlocked, (event) => {
    if (event === 'blocked') {
      toast.add(warning);
      return;
    }
    toast.remove(warning);
    toast.add({
      severity: 'success',
      summary: t('dbReadySummary'),
      detail: t('dbReadyDetail'),
      life: 3000,
    });
  });
}
