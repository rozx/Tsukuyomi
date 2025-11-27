import { computed } from 'vue';

/**
 * Electron 环境检测 composable
 * 提供统一的 Electron 环境检测功能
 */
export function useElectron() {
  /**
   * 检查是否在 Electron 环境中
   */
  const isElectron = computed(() => {
    return typeof window !== 'undefined' && window.electronAPI?.isElectron === true;
  });

  /**
   * 检查是否在浏览器环境中（非 Electron）
   */
  const isBrowser = computed(() => {
    return typeof window !== 'undefined' && !isElectron.value;
  });

  /**
   * 检查是否在 Node.js/Bun 环境中
   */
  const isNode = computed(() => {
    return typeof window === 'undefined';
  });

  return {
    isElectron,
    isBrowser,
    isNode,
  };
}

