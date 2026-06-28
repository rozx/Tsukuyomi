import './setup';
import { describe, expect, it, vi } from 'vitest';
import { useScrollbarDrag } from 'src/composables/book-details/useScrollbarDrag';

/** 记录 add/removeEventListener 的假事件目标（替身 window），可回放已注册的处理器 */
function makeEventTarget() {
  const handlers: Record<string, Set<EventListener>> = {};
  return {
    addEventListener: vi.fn((type: string, h: EventListener) => {
      (handlers[type] ??= new Set()).add(h);
    }),
    removeEventListener: vi.fn((type: string, h: EventListener) => {
      handlers[type]?.delete(h);
    }),
    has(type: string) {
      return (handlers[type]?.size ?? 0) > 0;
    },
    dispatch(type: string, event: unknown) {
      for (const h of handlers[type] ?? []) h(event as Event);
    },
  };
}

/** 假滑块元素，记录其自身（如 lostpointercapture）的监听器 */
function makeThumb() {
  const handlers: Record<string, Set<EventListener>> = {};
  return {
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(),
    getBoundingClientRect: () => ({ top: 100, left: 0, right: 0, bottom: 0, width: 8, height: 28 }),
    addEventListener: vi.fn((type: string, h: EventListener) => {
      (handlers[type] ??= new Set()).add(h);
    }),
    removeEventListener: vi.fn((type: string, h: EventListener) => {
      handlers[type]?.delete(h);
    }),
    has(type: string) {
      return (handlers[type]?.size ?? 0) > 0;
    },
    dispatch(type: string, event: unknown) {
      for (const h of handlers[type] ?? []) h(event as Event);
    },
  };
}

function makeOptions(eventTarget: ReturnType<typeof makeEventTarget>) {
  const track = {
    getBoundingClientRect: () => ({ top: 0, left: 0, right: 0, bottom: 200, width: 12, height: 200 }),
  } as unknown as HTMLElement;
  const scrollToFraction = vi.fn();
  return {
    scrollToFraction,
    options: {
      getTrack: () => track,
      getHeightPct: () => 50,
      getTopPct: () => 0,
      scrollToFraction,
      minThumbPx: 28,
      eventTarget: eventTarget as unknown as Window,
    },
  };
}

function pointerDownEvent(thumb: ReturnType<typeof makeThumb>) {
  return {
    currentTarget: thumb,
    clientY: 100,
    pointerId: 1,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as PointerEvent;
}

describe('useScrollbarDrag', () => {
  it('在 pointerdown 后进入拖动态并注册 pointermove 监听', () => {
    const target = makeEventTarget();
    const { options } = makeOptions(target);
    const drag = useScrollbarDrag(options);
    const thumb = makeThumb();

    drag.onThumbPointerDown(pointerDownEvent(thumb));

    expect(drag.dragging.value).toBe(true);
    expect(target.has('pointermove')).toBe(true);
    expect(thumb.setPointerCapture).toHaveBeenCalledWith(1);
  });

  it('收到 pointercancel 时结束拖动并移除 pointermove（移动端核心修复）', () => {
    const target = makeEventTarget();
    const { options } = makeOptions(target);
    const drag = useScrollbarDrag(options);
    const thumb = makeThumb();

    drag.onThumbPointerDown(pointerDownEvent(thumb));
    expect(drag.dragging.value).toBe(true);

    // 移动端浏览器常以 pointercancel（而非 pointerup）结束触摸手势
    expect(target.has('pointercancel')).toBe(true);
    target.dispatch('pointercancel', {});

    expect(drag.dragging.value).toBe(false);
    expect(target.has('pointermove')).toBe(false);
  });

  it('pointercancel 之后不再劫持滚动（后续 move 不调用 scrollToFraction）', () => {
    const target = makeEventTarget();
    const { options, scrollToFraction } = makeOptions(target);
    const drag = useScrollbarDrag(options);
    const thumb = makeThumb();

    drag.onThumbPointerDown(pointerDownEvent(thumb));
    target.dispatch('pointercancel', {});
    scrollToFraction.mockClear();

    // 直接调用守卫逻辑：拖动已结束，move 不应再驱动滚动
    drag.handleMove({ clientY: 150 } as unknown as PointerEvent);

    expect(scrollToFraction).not.toHaveBeenCalled();
  });

  it('pointerup 仍能正常结束拖动并清理监听', () => {
    const target = makeEventTarget();
    const { options } = makeOptions(target);
    const drag = useScrollbarDrag(options);
    const thumb = makeThumb();

    drag.onThumbPointerDown(pointerDownEvent(thumb));
    target.dispatch('pointerup', {});

    expect(drag.dragging.value).toBe(false);
    expect(target.has('pointermove')).toBe(false);
    expect(target.has('pointerup')).toBe(false);
    expect(target.has('pointercancel')).toBe(false);
  });

  it('lostpointercapture（捕获被释放）也能结束拖动并清理监听', () => {
    const target = makeEventTarget();
    const { options } = makeOptions(target);
    const drag = useScrollbarDrag(options);
    const thumb = makeThumb();

    drag.onThumbPointerDown(pointerDownEvent(thumb));
    // lostpointercapture 挂在滑块自身（捕获目标），而非 window
    expect(thumb.has('lostpointercapture')).toBe(true);
    thumb.dispatch('lostpointercapture', {});

    expect(drag.dragging.value).toBe(false);
    expect(target.has('pointermove')).toBe(false);
    expect(thumb.has('lostpointercapture')).toBe(false);
  });

  it('重复结束（pointerup 后又 lostpointercapture）安全且幂等', () => {
    const target = makeEventTarget();
    const { options } = makeOptions(target);
    const drag = useScrollbarDrag(options);
    const thumb = makeThumb();

    drag.onThumbPointerDown(pointerDownEvent(thumb));
    target.dispatch('pointerup', {});
    // 真机上 pointerup 会隐式释放捕获，紧接着触发 lostpointercapture——二次清理不应抛错或残留
    expect(() => thumb.dispatch('lostpointercapture', {})).not.toThrow();

    expect(drag.dragging.value).toBe(false);
    expect(target.has('pointermove')).toBe(false);
  });

  it('setPointerCapture 抛错时仍能进入拖动并可被 pointercancel 清理（不卡死）', () => {
    const target = makeEventTarget();
    const { options } = makeOptions(target);
    const drag = useScrollbarDrag(options);
    const thumb = makeThumb();
    // 指针在 handler 运行时可能已失效，setPointerCapture 抛 NotFoundError
    thumb.setPointerCapture = vi.fn(() => {
      throw new DOMException('No active pointer', 'NotFoundError');
    });

    // 抛错不得冒泡出 onThumbPointerDown，否则监听器永远挂不上、拖动态卡死
    expect(() => drag.onThumbPointerDown(pointerDownEvent(thumb))).not.toThrow();
    expect(drag.dragging.value).toBe(true);
    expect(target.has('pointermove')).toBe(true);

    // 仍可被 pointercancel 正常清理
    target.dispatch('pointercancel', {});
    expect(drag.dragging.value).toBe(false);
    expect(target.has('pointermove')).toBe(false);
  });
});
