import { computed } from 'vue';
import { useResponsiveLayout } from './useResponsiveLayout';
import { useElectron } from './useElectron';

/**
 * 设备变体标识，用于 layout / page 分派器挑选具体的变体组件。
 */
export type DeviceVariant = 'desktop' | 'tablet' | 'mobile';

/**
 * 设备变体分派辅助。
 *
 * 用法：每个 layout / page 的 "分派器" SFC 调用此 composable 获取当前应挂载的变体，
 * 然后通过 <component :is> 动态挂载 Desktop / Tablet / Mobile 变体之一。
 *
 * 规则（定义在此处，且只在此处）：
 *   1. Electron 环境始终使用 Desktop 变体，忽略窗口宽度。
 *   2. 否则根据断点：isPhone → mobile，isTablet → tablet，其它 → desktop。
 *
 * 新增断点或调整 Electron 行为时只需修改此文件；任何分派器都不应再手写
 * `isElectron ? ... : isPhone ? ...` 之类的条件链。
 */
export function useDeviceVariant() {
  const { isPhone, isTablet } = useResponsiveLayout();
  const { isElectron } = useElectron();

  const variant = computed<DeviceVariant>(() => {
    if (isElectron.value) return 'desktop';
    if (isPhone.value) return 'mobile';
    if (isTablet.value) return 'tablet';
    return 'desktop';
  });

  return { variant };
}
