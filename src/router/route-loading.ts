import { readonly, ref } from 'vue';
import type { RouteLocationNormalized, Router } from 'vue-router';

/** 路由切换超过该时长才显示加载指示，快速切换时完全不出现 */
const ROUTE_LOADING_DELAY_MS = 300;

const pending = ref(false);

/**
 * 路由切换是否慢到需要提示（懒加载页面 chunk 下载中等）。
 * 由内容区的 RouteLoadingIndicator 显示；不拦截任何网络请求，检查更新等请求不会触发。
 */
export const routeLoading = readonly(pending);

export function trackRouteLoading(router: Router): void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let current: RouteLocationNormalized | undefined;
  const settle = () => {
    clearTimeout(timer);
    timer = undefined;
    pending.value = false;
  };
  // 被取代的导航晚些也会触发 afterEach / onError：只认当前导航，否则会清掉新导航的计时与指示
  const settleIfCurrent = (to: RouteLocationNormalized) => {
    if (to !== current) return;
    current = undefined;
    settle();
  };
  router.beforeEach((to) => {
    settle();
    current = to;
    timer = setTimeout(() => {
      pending.value = true;
    }, ROUTE_LOADING_DELAY_MS);
  });
  router.afterEach((to) => settleIfCurrent(to));
  router.onError((_error, to) => settleIfCurrent(to));
}
