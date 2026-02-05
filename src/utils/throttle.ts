/**
 * 节流函数：限制函数执行频率，支持清理
 * @param func 要节流的函数
 * @param delay 延迟时间（毫秒）
 * @returns 包含节流函数和清理函数的对象
 */
export function throttle<Args extends unknown[]>(
  func: (...args: Args) => void,
  delay: number,
  options?: { trailing?: boolean },
): {
  fn: (...args: Args) => void;
  cleanup: () => void;
} {
  let lastCall = 0;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const throttledFn = (...args: Args) => {
    const now = Date.now();
    const timeSinceLastCall = now - lastCall;

    if (timeSinceLastCall >= delay) {
      lastCall = now;
      func(...args);
    } else if (options?.trailing !== false) {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      timeoutId = setTimeout(() => {
        lastCall = Date.now();
        func(...args);
        timeoutId = null;
      }, delay - timeSinceLastCall);
    }
  };

  const cleanup = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  return { fn: throttledFn, cleanup };
}
