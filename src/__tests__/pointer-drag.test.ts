import { describe, expect, it, vi } from 'vitest';
import { usePointerDrag } from 'src/composables/usePointerDrag';

function pointer(type: string, x: number, y: number, button = 0) {
  return new MouseEvent(type, { clientX: x, clientY: y, button }) as PointerEvent;
}

describe('usePointerDrag', () => {
  it('按下后移动超过阈值才回调位移，松开时报告是否拖动过', () => {
    const onMove = vi.fn();
    const onEnd = vi.fn();
    const drag = usePointerDrag({ onMove, onEnd, threshold: 4 });

    expect(drag.begin(pointer('pointerdown', 100, 100))).toBe(true);
    window.dispatchEvent(pointer('pointermove', 102, 101));
    expect(onMove).not.toHaveBeenCalled();
    window.dispatchEvent(pointer('pointermove', 130, 90));
    expect(onMove).toHaveBeenLastCalledWith({ dx: 30, dy: -10 });
    window.dispatchEvent(pointer('pointerup', 130, 90));
    expect(onEnd).toHaveBeenCalledWith(true);

    // 松开后不再响应移动
    window.dispatchEvent(pointer('pointermove', 200, 200));
    expect(onMove).toHaveBeenCalledTimes(1);
  });

  it('没有移动过的单击报告未拖动', () => {
    const onEnd = vi.fn();
    const drag = usePointerDrag({ onMove: vi.fn(), onEnd });
    drag.begin(pointer('pointerdown', 10, 10));
    window.dispatchEvent(pointer('pointerup', 10, 10));
    expect(onEnd).toHaveBeenCalledWith(false);
  });

  it('pointercancel 同样结束拖动', () => {
    const onEnd = vi.fn();
    const drag = usePointerDrag({ onMove: vi.fn(), onEnd });
    drag.begin(pointer('pointerdown', 10, 10));
    window.dispatchEvent(pointer('pointercancel', 10, 10));
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('非主键按下不开始拖动', () => {
    const onMove = vi.fn();
    const drag = usePointerDrag({ onMove, onEnd: vi.fn() });
    expect(drag.begin(pointer('pointerdown', 10, 10, 2))).toBe(false);
    window.dispatchEvent(pointer('pointermove', 80, 80));
    expect(onMove).not.toHaveBeenCalled();
  });
});
