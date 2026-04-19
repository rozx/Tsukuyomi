/**
 * 本地嵌入(Transformers.js + gte-multilingual-base)"是否有效启用"的统一判定。
 *
 * 两道门:
 * 1. 设备:手机端(Quasar `Platform.is.mobile` 判定,走 UA,不看屏幕尺寸)强制禁用 —
 *    300M+ 参数的本地嵌入在移动浏览器里要么跑不动,要么 WebGPU 不稳定,
 *    干脆在 Service Worker / 内存压力进一步受限之前就拦下来。
 *    注意:这里不使用 `useResponsiveLayout` 的断点 — 那是按窗口宽度判断布局的,
 *    桌面窗口拖窄不应触发移动端限制。
 * 2. 用户设置:`AppSettings.enableLocalEmbedding` 的总开关。
 */

import { isMobileDevice } from 'src/utils/platform';

/**
 * 结合"设备门"和"用户设置"计算本地嵌入是否有效启用。
 * - 手机端:永远返回 false(即使用户之前在桌面端把设置同步过来开启了,也强制关)
 * - 非手机端:按设置返回
 */
export function isLocalEmbeddingEffectivelyEnabled(
  storedValue: boolean | undefined,
): boolean {
  if (isMobileDevice()) return false;
  return storedValue === true;
}
