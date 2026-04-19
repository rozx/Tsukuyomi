import { computed } from 'vue';
import { isElectron as isElectronImperative } from 'src/utils/platform';

/**
 * Electron 环境检测 composable —— 为 Vue 响应式场景(template / computed / watch)
 * 提供包装。真值来源是 `utils/platform.ts#isElectron()`;运行期不会变,之所以
 * 做成 computed 只是为了和其它响应式依赖放在同一个反应图里使用方便。
 *
 * 纯 TS / service 层请直接用 `utils/platform.ts#isElectron()`,不要再在本地
 * 抄一份 `window.electronAPI?.isElectron === true`。
 */
export function useElectron() {
  const isElectron = computed(() => isElectronImperative());
  const isBrowser = computed(() => typeof window !== 'undefined' && !isElectron.value);
  const isNode = computed(() => typeof window === 'undefined');

  return {
    isElectron,
    isBrowser,
    isNode,
  };
}

