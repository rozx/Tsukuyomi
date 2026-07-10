/**
 * usePanelResize 回归测试：拖拽中途组件卸载（作用域销毁）时必须
 * 移除 document 上的 mousemove/mouseup 监听并还原 body 样式，
 * 否则监听器与 user-select:none / col-resize 样式会永久泄漏。
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { effectScope } from 'vue';
import { usePanelResize } from 'src/composables/chat/usePanelResize';
import { useUiStore } from 'src/stores/ui';

describe('usePanelResize 卸载清理', () => {
  beforeEach(() => {
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  });

  it('拖拽中途作用域销毁时还原 body 样式并停止响应 mousemove', () => {
    const ui = useUiStore();
    ui.setRightPanelWidth(400);

    const scope = effectScope();
    let api!: ReturnType<typeof usePanelResize>;
    scope.run(() => {
      api = usePanelResize();
    });

    // 开始拖拽
    api.handleResizeStart(new MouseEvent('mousedown', { clientX: 800 }));
    expect(api.isResizing.value).toBe(true);
    expect(document.body.style.userSelect).toBe('none');
    expect(document.body.style.cursor).toBe('col-resize');

    // 拖拽生效验证：向左移动 100px → 宽度 +100
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 700 }));
    expect(ui.rightPanelWidth).toBe(500);

    // 中途销毁作用域（组件卸载）
    scope.stop();

    expect(api.isResizing.value).toBe(false);
    expect(document.body.style.userSelect).toBe('');
    expect(document.body.style.cursor).toBe('');

    // 卸载后 mousemove 不再改变宽度（监听器已移除）
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 600 }));
    expect(ui.rightPanelWidth).toBe(500);
  });

  it('正常 mouseup 结束拖拽后销毁作用域不产生副作用', () => {
    const ui = useUiStore();
    ui.setRightPanelWidth(400);

    const scope = effectScope();
    let api!: ReturnType<typeof usePanelResize>;
    scope.run(() => {
      api = usePanelResize();
    });

    api.handleResizeStart(new MouseEvent('mousedown', { clientX: 800 }));
    document.dispatchEvent(new MouseEvent('mouseup'));
    expect(api.isResizing.value).toBe(false);
    expect(document.body.style.userSelect).toBe('');

    scope.stop();
    expect(document.body.style.userSelect).toBe('');
    expect(document.body.style.cursor).toBe('');
  });
});
