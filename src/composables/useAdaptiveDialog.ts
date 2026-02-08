import { computed } from 'vue';
import { useUiStore } from 'src/stores/ui';

interface UseAdaptiveDialogOptions {
  desktopWidth: string;
  tabletWidth?: string;
  desktopHeight?: string;
  tabletHeight?: string;
}

export function useAdaptiveDialog(options: UseAdaptiveDialogOptions) {
  const uiStore = useUiStore();

  const tabletWidth = options.tabletWidth ?? '92vw';
  const tabletHeight = options.tabletHeight ?? '92vh';

  const isPhone = computed(() => uiStore.deviceType === 'phone');
  const isTablet = computed(() => uiStore.deviceType === 'tablet');

  const dialogStyle = computed(() => {
    if (isPhone.value) {
      return {
        width: '100vw',
        maxWidth: '100vw',
        height: '100dvh',
        maxHeight: '100dvh',
      };
    }
    if (isTablet.value) {
      return {
        width: tabletWidth,
        maxWidth: '96vw',
        height: tabletHeight,
        maxHeight: '96vh',
      };
    }
    return {
      width: options.desktopWidth,
      ...(options.desktopHeight ? { height: options.desktopHeight } : {}),
    };
  });

  const dialogClass = computed(() => {
    return isPhone.value ? 'adaptive-dialog-fullscreen' : '';
  });

  return {
    dialogStyle,
    dialogClass,
    isPhone,
    isTablet,
  };
}

