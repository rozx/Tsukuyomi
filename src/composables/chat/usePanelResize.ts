import { getCurrentScope, onScopeDispose, ref } from 'vue';
import { useUiStore } from 'src/stores/ui';

/**
 * 侧边栏面板调整大小逻辑
 */
export function usePanelResize() {
  const ui = useUiStore();
  const panelContainerRef = ref<HTMLElement | null>(null);
  const resizeHandleRef = ref<HTMLElement | null>(null);

  // 拖拽调整大小状态
  const isResizing = ref(false);
  const startX = ref(0);
  const startWidth = ref(0);

  const handleResizeMove = (event: MouseEvent) => {
    if (!isResizing.value) return;

    const deltaX = startX.value - event.clientX; // 向左拖拽时 deltaX 为正
    const newWidth = startWidth.value + deltaX;
    ui.setRightPanelWidth(newWidth);
  };

  const handleResizeEnd = () => {
    isResizing.value = false;
    document.removeEventListener('mousemove', handleResizeMove);
    document.removeEventListener('mouseup', handleResizeEnd);
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  };

  // 拖拽中途组件被卸载（作用域销毁）时兜底结束拖拽：
  // 移除 document 上的 mousemove/mouseup 监听并还原 body 样式，防止泄漏
  if (getCurrentScope()) {
    onScopeDispose(handleResizeEnd);
  }

  const handleResizeStart = (event: MouseEvent) => {
    isResizing.value = true;
    startX.value = event.clientX;
    startWidth.value = ui.rightPanelWidth;

    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', handleResizeEnd);

    // 防止拖拽过程中选中文本
    event.preventDefault();
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
  };

  return {
    panelContainerRef,
    resizeHandleRef,
    isResizing,
    handleResizeStart,
  };
}
