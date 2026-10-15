import { readonly, ref } from 'vue';
import type { Router } from 'vue-router';

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
  const settle = () => {
    clearTimeout(timer);
    timer = undefined;
    pending.value = false;
  };
  router.beforeEach(() => {
    settle();
    timer = setTimeout(() => {
      pending.value = true;
    }, ROUTE_LOADING_DELAY_MS);
  });
  // afterEach 对被取代 / 取消的导航同样触发；加载失败走 onError
  router.afterEach(settle);
  router.onError(settle);
}
