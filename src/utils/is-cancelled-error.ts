/**
 * 判定一个 error 对象是否代表"用户/调用方取消"，覆盖下述所有情况：
 *   - `Error.message` 为项目约定的 '请求已取消' 或包含 'aborted'
 *   - `Error.name` 为 'AbortError' / 'CanceledError'（fetch AbortSignal / axios cancel）
 *   - 任意 `{ message: 'canceled' }` 形状（axios v1 CanceledError 的老版序列化）
 *
 * 聊天发送、AI 任务流处理器等多处都需要区分"取消"与"真错误"，因此集中判定。
 */
export function isCancelledError(error: unknown): boolean {
  if (error instanceof Error) {
    return (
      error.message === '请求已取消' ||
      error.message.includes('aborted') ||
      error.name === 'AbortError' ||
      error.name === 'CanceledError'
    );
  }
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return (error as { message: unknown }).message === 'canceled';
  }
  return false;
}
