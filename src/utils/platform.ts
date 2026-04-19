/**
 * 运行环境/设备相关的通用判定。
 *
 * 三个维度互不重叠,使用前看清楚自己要问的是哪个:
 *
 *   ┌─────────────────────┬──────────────────────────────┬──────────────────────┐
 *   │ 判定                │ 看什么                       │ 典型用途             │
 *   ├─────────────────────┼──────────────────────────────┼──────────────────────┤
 *   │ isMobileDevice()    │ UA(Quasar Platform.is.mobile)│ 物理设备门:如禁用    │
 *   │                     │                              │ 本地嵌入 / 屏蔽推销  │
 *   │ isElectron()        │ window.electronAPI           │ 能调 Node/IPC 的场景│
 *   │ useResponsiveLayout │ 窗口宽度断点                 │ 布局变体选择        │
 *   │   .isPhone          │                              │                      │
 *   └─────────────────────┴──────────────────────────────┴──────────────────────┘
 *
 * 特别注意:**不要**用 `isMobileDevice()` 做布局判断 —— 桌面浏览器拖窄窗口不是
 * 手机;也**不要**用 `isPhone` 做功能门 —— 用户把桌面浏览器缩到手机宽度不应被
 * 当成移动设备去禁用功能。
 */

import { Platform } from 'quasar';

/**
 * 是否为"真移动设备"(Quasar 基于 UA 判定)。
 * 在单元测试等无 Quasar 环境中 Platform.is 可能是空对象,返回 false。
 */
export function isMobileDevice(): boolean {
  try {
    return Platform?.is?.mobile === true;
  } catch {
    return false;
  }
}

/**
 * 是否跑在 Electron 环境里(由 preload 脚本注入的 `window.electronAPI.isElectron` 标记)。
 * 这个值在运行期不会变,不需要响应式 —— Vue 组件如果非要 computed,
 * 用 `useElectron()` 包一层即可。
 */
export function isElectron(): boolean {
  return typeof window !== 'undefined' && window.electronAPI?.isElectron === true;
}
