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

/**
 * 在事件源上注册 `CustomEvent` 监听器并返回取消订阅函数。
 * 被 createCustomEventSubscriber 工厂内部共用。
 */
function subscribeCustomEvent(
  target: EventTarget,
  type: string,
  listener: (event: CustomEvent) => void,
): () => void {
  const handler = (e: Event) => listener(e as CustomEvent);
  target.addEventListener(type, handler);
  return () => target.removeEventListener(type, handler);
}

/**
 * 为单一事件源构建一个受类型约束的 addEventListener 包装器。
 * EmbeddingService / EmbeddingQueue 等类各自维护不同的 type 字面量联合，
 * 通过本工厂把那层类型窄化的样板一次性消去（共享 subscribeCustomEvent 底层）。
 */
export function createCustomEventSubscriber<TType extends string>(
  target: EventTarget,
): (type: TType, listener: (event: CustomEvent) => void) => () => void {
  return (type, listener) => subscribeCustomEvent(target, type, listener);
}
