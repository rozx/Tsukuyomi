/**
 * 指针拖动：按下后在 window 上跟踪移动，移动距离超过阈值才算拖动，
 * 回调相对按下点的位移；松开或取消（触屏被系统打断）时结束并报告是否拖动过。
 * 拖动悬浮窗位置、拖动缩放手柄共用。调用方在卸载时调用 `cancel()`。
 */
export function usePointerDrag(handlers: {
  onMove: (delta: { dx: number; dy: number }) => void;
  onEnd: (moved: boolean) => void;
  /** 判定为拖动的最小移动距离（px），默认 4 */
  threshold?: number;
}) {
  const threshold = handlers.threshold ?? 4;
  let start: { x: number; y: number } | null = null;
  let moved = false;

  const onPointerMove = (event: PointerEvent) => {
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (!moved && Math.hypot(dx, dy) < threshold) return;
    moved = true;
    handlers.onMove({ dx, dy });
  };

  const cancel = () => {
    if (!start) return;
    start = null;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', cancel);
    window.removeEventListener('pointercancel', cancel);
    handlers.onEnd(moved);
  };

  /** 在 pointerdown 中调用；非主键返回 false 且不开始 */
  const begin = (event: PointerEvent): boolean => {
    if (event.button !== 0) return false;
    cancel();
    start = { x: event.clientX, y: event.clientY };
    moved = false;
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', cancel);
    window.addEventListener('pointercancel', cancel);
    return true;
  };

  return { begin, cancel };
}
