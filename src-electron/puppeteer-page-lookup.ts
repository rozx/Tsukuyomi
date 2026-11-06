/**
 * 为抓取窗口查找对应的 Puppeteer Page。
 *
 * puppeteer-in-electron 的 getPage 在窗口里写入 guid 后立刻读取 browser.pages()。
 * Electron 45（Chromium 156）中，新窗口 target 的创建事件和上一个抓取窗口的关闭事件
 * 可能晚于 loadURL('about:blank') 完成才到达，此时列表里仍是已关闭的旧窗口、
 * 还没有新窗口，于是抛出「Unable to find puppeteer Page」。稍等片刻列表即更新，
 * 因此只对这一种错误短暂重试，其他错误原样抛出。
 */

const PAGE_NOT_FOUND = 'Unable to find puppeteer Page';

interface PageLookupOptions {
  /** 最多查找次数（含首次），默认 10 */
  attempts?: number;
  /** 两次查找之间的等待毫秒数，默认 100 */
  delayMs?: number;
  /** 等待实现，便于测试注入 */
  wait?: (ms: number) => Promise<void>;
}

const defaultWait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function isPageNotFound(error: unknown): boolean {
  return error instanceof Error && error.message.includes(PAGE_NOT_FOUND);
}

export async function findPageWithRetry<T>(
  lookup: () => Promise<T>,
  { attempts = 10, delayMs = 100, wait = defaultWait }: PageLookupOptions = {},
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await lookup();
    } catch (error) {
      if (attempt >= attempts || !isPageNotFound(error)) throw error;
      await wait(delayMs);
    }
  }
}
