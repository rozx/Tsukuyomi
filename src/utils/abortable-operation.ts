function cancellationError(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException(
        typeof signal.reason === 'string' ? signal.reason : '操作已取消',
        'AbortError',
      );
}

/** 接口不能真正中止底层请求时，也立即停止等待并丢弃其迟到结果。 */
export function runAbortable<T>(
  signal: AbortSignal | undefined,
  operation: () => Promise<T>,
): Promise<T> {
  if (signal?.aborted) return Promise.reject(cancellationError(signal));
  if (!signal) return operation();
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(cancellationError(signal));
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve()
      .then(() => {
        if (signal.aborted) throw cancellationError(signal);
        return operation();
      })
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', abort));
  });
}

export function delayAbortable(ms: number, signal?: AbortSignal): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return runAbortable(
    signal,
    () =>
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, ms);
      }),
  ).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}
