import { computed, ref } from 'vue';
import type Popover from 'primevue/popover';
import { useUiStore } from 'src/stores/ui';

/**
 * 响应式弹层控制器：桌面使用 Popover、手机使用 MobileBottomSheet。
 *
 * @param onHide 手机抽屉关闭或桌面 popover 被隐藏时触发，用于发送 emit('hide')。
 */
export function usePopoverBottomSheet(onHide: () => void) {
  const uiStore = useUiStore();
  const isPhone = computed(() => uiStore.deviceType === 'phone');
  const popoverRef = ref<InstanceType<typeof Popover> | null>(null);
  const mobileVisible = ref(false);

  const onMobileVisibleChange = (visible: boolean) => {
    const wasOpen = mobileVisible.value;
    mobileVisible.value = visible;
    if (wasOpen && !visible) onHide();
  };

  const toggle = (event: Event) => {
    if (isPhone.value) {
      mobileVisible.value = !mobileVisible.value;
    } else {
      popoverRef.value?.toggle(event);
    }
  };

  const hide = () => {
    if (isPhone.value) {
      if (mobileVisible.value) {
        mobileVisible.value = false;
        onHide();
      }
    } else {
      popoverRef.value?.hide();
    }
  };

  return {
    isPhone,
    popoverRef,
    mobileVisible,
    onMobileVisibleChange,
    toggle,
    hide,
  };
}
