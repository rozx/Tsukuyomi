/**
 * 在非浏览器环境（SSR / 部分测试 runner）下 `CustomEvent` 可能不存在，
 * 这时退化为一个带 `detail` 属性的普通 Event，保持监听器 API 不变。
 *
 * EmbeddingService / EmbeddingQueue 等多个事件发射点共用，避免各自重复特性检测。
 */
export function dispatchCustomEvent(
  target: EventTarget,
  type: string,
  detail?: unknown,
): void {
  const hasCustomEvent = typeof (globalThis as { CustomEvent?: unknown }).CustomEvent !== 'undefined';
  const event = hasCustomEvent
    ? new CustomEvent(type, { detail })
    : Object.assign(new Event(type), { detail });
  target.dispatchEvent(event as Event);
}
