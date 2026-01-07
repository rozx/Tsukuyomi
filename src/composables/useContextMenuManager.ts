import { ref, type Ref } from 'vue';

/**
 * 上下文菜单管理器 composable（单例模式）
 * 确保同一时间只有一个上下文菜单可见，防止多个菜单叠加导致半透明效果
 */
type PopoverInstance = {
  hide: () => void;
  show?: (event: Event, target?: HTMLElement) => void;
  toggle?: (event: Event) => void;
};

// 单例状态：当前活动的上下文菜单 popover 实例
const activeContextMenuRef = ref<PopoverInstance | null>(null);

/**
 * 上下文菜单管理器
 * 提供注册、注销和显示上下文菜单的方法
 */
export function useContextMenuManager() {
  /**
   * 注册一个上下文菜单 popover 实例
   * @param popoverRef Popover 组件实例的 ref
   * @returns 注销函数，用于在组件卸载时调用
   */
  const registerContextMenu = (popoverRef: Ref<any>): (() => void) => {
    // 如果之前有活动的菜单，先隐藏它
    if (activeContextMenuRef.value) {
      try {
        activeContextMenuRef.value.hide();
      } catch (e) {
        // 忽略错误，可能组件已经卸载
        console.warn('Failed to hide previous context menu:', e);
      }
    }

    // 创建包装对象，提供 hide 方法
    const popoverInstance: PopoverInstance = {
      hide: () => {
        if (popoverRef.value) {
          // 尝试多种方式调用 hide
          const instance = popoverRef.value as any;
          if (instance.hide) {
            instance.hide();
          } else if (instance.$ && instance.$.exposed && instance.$.exposed.hide) {
            instance.$.exposed.hide();
          }
        }
      },
      show: (event: Event, target?: HTMLElement) => {
        if (popoverRef.value) {
          const instance = popoverRef.value as any;
          if (instance.show) {
            instance.show(event, target);
          } else if (instance.$ && instance.$.exposed && instance.$.exposed.show) {
            instance.$.exposed.show(event, target);
          }
        }
      },
      toggle: (event: Event) => {
        if (popoverRef.value) {
          const instance = popoverRef.value as any;
          if (instance.toggle) {
            instance.toggle(event);
          } else if (instance.$ && instance.$.exposed && instance.$.exposed.toggle) {
            instance.$.exposed.toggle(event);
          }
        }
      },
    };

    // 设置为当前活动的菜单
    activeContextMenuRef.value = popoverInstance;

    // 返回注销函数
    return () => {
      // 如果这是当前活动的菜单，清除引用
      if (activeContextMenuRef.value === popoverInstance) {
        activeContextMenuRef.value = null;
      }
    };
  };

  /**
   * 显示上下文菜单
   * 会自动隐藏之前活动的菜单（立即强制隐藏，不等待动画）
   * @param popoverRef Popover 组件实例的 ref
   * @param event 触发事件
   * @param target 可选的目标元素
   */
  const showContextMenu = (popoverRef: Ref<any>, event: Event, target?: HTMLElement) => {
    // 立即强制隐藏所有可见的 context-menu-popover（不等待动画）
    // 查找所有 context-menu-popover 元素并立即强制隐藏
    const allPopovers = document.querySelectorAll('.context-menu-popover');
    allPopovers.forEach((popoverEl) => {
      const style = window.getComputedStyle(popoverEl);
      // 如果 popover 是可见的（opacity > 0 且 display 不是 none）
      if (parseFloat(style.opacity) > 0 && style.display !== 'none') {
        // 立即强制隐藏：设置 display: none 和 opacity: 0
        // 这会跳过 PrimeVue 的动画
        const htmlEl = popoverEl as HTMLElement;
        htmlEl.style.display = 'none';
        htmlEl.style.opacity = '0';
        htmlEl.style.visibility = 'hidden';
        // 也尝试取消动画
        htmlEl.style.animation = 'none';
        htmlEl.style.transition = 'none';
      }
    });

    // 如果之前有活动的菜单引用，也调用 hide（双重保险）
    if (activeContextMenuRef.value) {
      try {
        activeContextMenuRef.value.hide();
      } catch (e) {
        // 忽略错误
        console.warn('Failed to hide previous context menu:', e);
      }
    }

    // 等待一小段时间确保旧菜单已从 DOM 中移除或完全隐藏，然后显示新菜单
    setTimeout(() => {
      // 再次检查并强制隐藏任何残留的 popover
      const remainingPopovers = document.querySelectorAll('.context-menu-popover');
      remainingPopovers.forEach((popoverEl) => {
        const style = window.getComputedStyle(popoverEl);
        if (parseFloat(style.opacity) > 0 && style.display !== 'none') {
          const htmlEl = popoverEl as HTMLElement;
          htmlEl.style.display = 'none';
          htmlEl.style.opacity = '0';
          htmlEl.style.visibility = 'hidden';
        }
      });

      // 注册并显示新菜单
      const unregister = registerContextMenu(popoverRef);
      const instance = activeContextMenuRef.value;
      if (instance && instance.show) {
        instance.show(event, target);
      } else if (popoverRef.value) {
        // 备用方案：直接调用
        const popoverInstance = popoverRef.value as any;
        if (popoverInstance.show) {
          popoverInstance.show(event, target);
        }
      }
    }, 100); // 100ms 延迟，确保旧菜单已完全隐藏
  };

  /**
   * 隐藏当前活动的上下文菜单
   */
  const hideActiveContextMenu = () => {
    if (activeContextMenuRef.value) {
      try {
        activeContextMenuRef.value.hide();
        activeContextMenuRef.value = null;
      } catch (e) {
        console.warn('Failed to hide active context menu:', e);
        activeContextMenuRef.value = null;
      }
    }
  };

  return {
    registerContextMenu,
    showContextMenu,
    hideActiveContextMenu,
  };
}

