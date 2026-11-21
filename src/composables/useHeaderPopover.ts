import { computed, ref } from 'vue';
import type Popover from 'primevue/popover';
import { useUiStore } from 'src/stores/ui';
import { useAnchoredPopover } from './useAnchoredPopover';

/**
 * 顶部系统栏弹层（同步、消息等）的开关逻辑：桌面 / 平板用 Popover（箭头对准 chip），
 * 手机用底部抽屉。调用方在模板里把 `popoverRef` 绑到 Popover、`mobileVisible` 绑到抽屉，
 * Popover 加 class `anchored-popover header-popover <containerClass>` 并在 @show 调用 `centerArrow`。
 */
export function useHeaderPopover(containerClass: string) {
  const uiStore = useUiStore();
  const isPhone = computed(() => uiStore.deviceType === 'phone');
  const popoverRef = ref<InstanceType<typeof Popover> | null>(null);
  const mobileVisible = ref(false);
  const anchored = useAnchoredPopover({ containerClass, max: 600 });

  const toggle = (event: Event) => {
    if (isPhone.value) {
      mobileVisible.value = !mobileVisible.value;
      return;
    }
    anchored.prepare(event);
    popoverRef.value?.toggle(event);
  };

  const close = () => {
    if (isPhone.value) mobileVisible.value = false;
    else popoverRef.value?.hide();
  };

  return { isPhone, popoverRef, mobileVisible, toggle, close, centerArrow: anchored.centerArrow };
}
