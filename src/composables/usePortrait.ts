import { onBeforeUnmount, ref, type Ref } from 'vue';

const QUERY = '(orientation: portrait)';

/**
 * 响应式的视口朝向：竖屏为 true，旋转设备或改变窗口比例时随之更新，组件卸载时移除监听。
 * 只需要读一次当前值时用 `utils/device-orientation` 的 `isPortrait()`。
 */
export function usePortrait(): Ref<boolean> {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return ref(false);
  }
  const media = window.matchMedia(QUERY);
  const portrait = ref(media.matches);
  const onChange = (event: { matches: boolean }) => {
    portrait.value = event.matches;
  };
  media.addEventListener('change', onChange);
  onBeforeUnmount(() => media.removeEventListener('change', onChange));
  return portrait;
}
