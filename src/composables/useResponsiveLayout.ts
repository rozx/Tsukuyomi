import { computed, onMounted, onUnmounted } from 'vue';
import { getDeviceTypeByWidth } from 'src/constants/responsive';
import { useUiStore } from 'src/stores/ui';

export function useResponsiveLayout() {
  const uiStore = useUiStore();

  const updateDeviceType = () => {
    uiStore.setDeviceType(getDeviceTypeByWidth(window.innerWidth));
  };

  // 在初始化时同步检测设备类型，避免首次渲染闪烁
  if (typeof window !== 'undefined') {
    updateDeviceType();
  }

  onMounted(() => {
    updateDeviceType();
    window.addEventListener('resize', updateDeviceType);
    window.addEventListener('orientationchange', updateDeviceType);
  });

  onUnmounted(() => {
    window.removeEventListener('resize', updateDeviceType);
    window.removeEventListener('orientationchange', updateDeviceType);
  });

  const isPhone = computed(() => uiStore.deviceType === 'phone');
  const isTablet = computed(() => uiStore.deviceType === 'tablet');
  const isDesktop = computed(() => uiStore.deviceType === 'desktop');

  return {
    isPhone,
    isTablet,
    isDesktop,
    updateDeviceType,
  };
}

