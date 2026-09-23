import { useToast } from 'primevue/usetoast';
import type { ToastMessageOptions } from 'primevue/toast';
import { isDbBlocked } from 'src/utils/indexed-db';

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
  const warning: ToastMessageOptions = {
    severity: 'warn',
    summary: '数据库升级等待中',
    detail:
      '其他标签页或窗口仍在使用旧版本的本应用，数据暂时无法载入。请关闭这些页面，升级会自动继续。',
  };
  return watchDatabaseBlocked(isDbBlocked, (event) => {
    if (event === 'blocked') {
      toast.add(warning);
      return;
    }
    toast.remove(warning);
    toast.add({
      severity: 'success',
      summary: '数据库升级完成',
      detail: '数据已可正常载入。',
      life: 3000,
    });
  });
}
