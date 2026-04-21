import type { ToastMessageOptions } from 'primevue/toast';

interface ToastLike {
  add: (msg: ToastMessageOptions) => void;
}

/**
 * 将文本写入系统剪贴板，并通过 toast 回调显示成功/失败反馈。
 * 空值直接返回，不显示任何提示。
 *
 * @param text 需要复制的文本；为空时静默跳过
 * @param toast Toast 容器（兼容 useToastWithHistory 的返回值）
 * @param options 自定义成功/失败提示文案
 */
export async function copyTextWithToast(
  text: string | undefined | null,
  toast: ToastLike,
  options: {
    successSummary?: string;
    successDetail?: string;
    errorSummary?: string;
    errorDetail?: string;
  } = {},
): Promise<void> {
  if (!text) return;
  const {
    successSummary = '已复制',
    successDetail = '已复制到剪贴板',
    errorSummary = '复制失败',
    errorDetail = '无法复制到剪贴板',
  } = options;
  try {
    await navigator.clipboard.writeText(text);
    toast.add({
      severity: 'success',
      summary: successSummary,
      detail: successDetail,
      life: 2000,
    });
  } catch (error) {
    console.error('复制失败:', error);
    toast.add({
      severity: 'error',
      summary: errorSummary,
      detail: errorDetail,
      life: 3000,
    });
  }
}
