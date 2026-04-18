/**
 * 一次性同步读取当前视口朝向。
 *
 * 与 Quasar 的 `$q.screen` 不同，这里是命令式接口——用在 `onClick` / composable
 * 初始化等「拿当前值就走」的场景。如果需要响应式地跟踪朝向变化，用
 * `window.matchMedia(...).addEventListener('change', ...)` 或直接看
 * `$q.screen.width / height`。
 *
 * SSR 安全：无 `window` 时保守返回 `false`（横屏）。
 */
export function isPortrait(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(orientation: portrait)').matches;
}
