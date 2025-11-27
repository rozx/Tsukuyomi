import type { ToastMessageWithHistoryOptions } from 'src/composables/useToastHistory';

/**
 * Toast 消息选项（简化版，用于工具）
 */
export interface ToolToastOptions {
  severity?: 'success' | 'error' | 'info' | 'warn';
  summary: string;
  detail?: string;
  life?: number;
  onRevert?: () => void | Promise<void>;
}

/**
 * Toast 回调函数类型
 */
export type ToastCallback = (message: ToastMessageWithHistoryOptions) => void;

/**
 * 在工具中显示 toast 通知的辅助函数
 * 优先使用传入的 onToast 回调，如果不存在则回退到全局 toast
 * @param options Toast 选项
 * @param onToast 可选的 toast 回调函数
 */
export function showToolToast(
  options: ToolToastOptions,
  onToast?: ToastCallback,
): void {
  const message: ToastMessageWithHistoryOptions = {
    severity: options.severity || 'info',
    summary: options.summary,
    ...(options.detail ? { detail: options.detail } : {}),
    ...(options.life !== undefined ? { life: options.life } : {}),
    ...(options.onRevert ? { onRevert: options.onRevert } : {}),
  };

  // 优先使用传入的回调
  if (onToast) {
    onToast(message);
    return;
  }

  // 回退到全局 toast（如果可用）
  if (typeof window !== 'undefined') {
    const globalToast = (window as unknown as { __lunaToast?: ToastCallback }).__lunaToast;
    if (globalToast) {
      globalToast(message);
      return;
    }
  }

  // 如果都无法使用，至少记录到控制台
  console.log('[ToolToast]', message);
}

