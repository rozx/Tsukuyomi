import { computed, effectScope, watch } from 'vue';
import { useQuasar } from 'quasar';
import { getDeviceTypeByWidth } from 'src/constants/responsive';
import { useUiStore } from 'src/stores/ui';

/**
 * 响应式设备类型解析。
 *
 * 依赖 Quasar 的 `$q.screen`——Quasar 自带窗口 resize / orientationchange 监听，
 * 无需在应用层手写 addEventListener。我们只在断点边界切换时把结果写回 uiStore，
 * 这样既省掉手动监听，又保持 `uiStore.deviceType` 为所有消费者（组件 / 其他
 * composable）提供的单一真相。
 *
 * 注意：本 composable 被多个派发器 / 上层 composable 间接调用
 * （如每个 page dispatcher 通过 useDeviceVariant 调用一次）。
 * 为避免重复注册监听同步同一个状态，watcher 只在**首次调用**时安装，
 * 并置于模块级 detached effectScope 中，让其独立于首位调用方组件的生命周期。
 *
 * HMR：开发环境下本模块被替换时，`import.meta.hot.dispose` 钩子会停止旧 scope
 * 并重置初始化标志，避免产生多个并存 watcher / 残留闭包引用旧 `$q` 实例。
 */
let sharedScope = effectScope(true);
let sharedInitialized = false;

export function useResponsiveLayout() {
  const uiStore = useUiStore();
  const $q = useQuasar();

  if (!sharedInitialized) {
    sharedInitialized = true;
    sharedScope.run(() => {
      const syncDeviceType = () => {
        uiStore.setDeviceType(getDeviceTypeByWidth($q.screen.width));
      };
      // 初次同步一次，避免首次渲染时 deviceType 还是 store 默认值
      syncDeviceType();
      watch(() => $q.screen.width, syncDeviceType);
    });
  }

  const isPhone = computed(() => uiStore.deviceType === 'phone');
  const isTablet = computed(() => uiStore.deviceType === 'tablet');
  const isDesktop = computed(() => uiStore.deviceType === 'desktop');

  return {
    isPhone,
    isTablet,
    isDesktop,
  };
}

// HMR 清理：模块被热替换时停止旧 scope，新模块会创建一个全新的 scope + 标志
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    sharedScope.stop();
    sharedScope = effectScope(true);
    sharedInitialized = false;
  });
}
