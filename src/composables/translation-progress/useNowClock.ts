import { ref, onMounted, onUnmounted } from 'vue';

/**
 * 1Hz 响应式时钟。
 *
 * 用于驱动持续刷新的时长 / ETA 计算。挂载时启动 setInterval，卸载时清理。
 */
export function useNowClock() {
  const now = ref(Date.now());
  let nowTimer: number | null = null;

  onMounted(() => {
    nowTimer = window.setInterval(() => {
      now.value = Date.now();
    }, 1000);
  });

  onUnmounted(() => {
    if (nowTimer !== null) {
      clearInterval(nowTimer);
      nowTimer = null;
    }
  });

  return { now };
}
