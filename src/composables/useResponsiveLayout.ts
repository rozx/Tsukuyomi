import { computed, watch } from 'vue';
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
 */
export function useResponsiveLayout() {
  const uiStore = useUiStore();
  const $q = useQuasar();

  const syncDeviceType = () => {
    uiStore.setDeviceType(getDeviceTypeByWidth($q.screen.width));
  };

  // 初次同步一次，避免首次渲染时 deviceType 还是 store 默认值
  syncDeviceType();

  // `$q.screen.width` 本身是 reactive，Quasar 会在 resize / orientationchange
  // 时自动更新；watcher 只负责在宽度变化时把新值写入 store。
  watch(
    () => $q.screen.width,
    () => {
      syncDeviceType();
    },
  );

  const isPhone = computed(() => uiStore.deviceType === 'phone');
  const isTablet = computed(() => uiStore.deviceType === 'tablet');
  const isDesktop = computed(() => uiStore.deviceType === 'desktop');

  return {
    isPhone,
    isTablet,
    isDesktop,
  };
}

