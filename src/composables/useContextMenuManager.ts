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
 * 提供显示上下文菜单的方法，确保同一时间只有一个菜单可见
 */
export function useContextMenuManager() {
  /**
   * 显示上下文菜单
   * 会自动隐藏之前活动的菜单，使用 PrimeVue 的 API 而非直接操作 DOM
   * @param popoverRef Popover 组件实例的 ref
   * @param event 触发事件
   * @param target 可选的目标元素
   */
  const showContextMenu = (popoverRef: Ref<any>, event: Event, target?: HTMLElement) => {
    // 使用 PrimeVue 的 hide() 方法关闭之前的菜单
    if (activeContextMenuRef.value) {
      try {
        activeContextMenuRef.value.hide();
      } catch (e) {
        console.warn('Failed to hide previous context menu:', e);
      }
    }

    // 创建包装对象并设置为当前活动菜单
    const popoverInstance: PopoverInstance = {
      hide: () => {
        if (popoverRef.value) {
          const instance = popoverRef.value as any;
          if (instance.hide) {
            instance.hide();
          } else if (instance.$ && instance.$.exposed && instance.$.exposed.hide) {
            instance.$.exposed.hide();
          }
        }
      },
      show: (evt: Event, tgt?: HTMLElement) => {
        if (popoverRef.value) {
          const instance = popoverRef.value as any;
          if (instance.show) {
            instance.show(evt, tgt);
          } else if (instance.$ && instance.$.exposed && instance.$.exposed.show) {
            instance.$.exposed.show(evt, tgt);
          }
        }
      },
    };
    activeContextMenuRef.value = popoverInstance;

    // 在下一帧显示新菜单，确保浏览器完成上一次 hide 的渲染
    // 保存实例引用到局部变量，避免 requestAnimationFrame 回调执行时引用已被修改
    const instanceToShow = popoverInstance;
    requestAnimationFrame(() => {
      if (instanceToShow && instanceToShow.show) {
        instanceToShow.show(event, target);
      }
    });
  };

  return {
    showContextMenu,
  };
}
