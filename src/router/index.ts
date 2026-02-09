import { defineRouter } from '#q-app/wrappers';
import {
  createMemoryHistory,
  createRouter,
  createWebHashHistory,
  createWebHistory,
} from 'vue-router';
import { LoadingBar } from 'quasar';
import routes from './routes';

/*
 * If not building with SSR mode, you can
 * directly export the Router instantiation;
 *
 * The function below can be async too; either use
 * async/await or return a Promise which resolves
 * with the Router instance.
 */

export default defineRouter(function (/* { store, ssrContext } */) {
  const createHistory = process.env.SERVER
    ? createMemoryHistory
    : process.env.VUE_ROUTER_MODE === 'history'
      ? createWebHistory
      : createWebHashHistory;

  const Router = createRouter({
    scrollBehavior: () => ({ left: 0, top: 0 }),
    routes,

    // Leave this as is and make changes in quasar.conf.js instead!
    // quasar.conf.js -> build -> vueRouterMode
    // quasar.conf.js -> build -> publicPath
    history: createHistory(process.env.VUE_ROUTER_BASE),
  });

  // 配置路由加载进度条外观
  LoadingBar.setDefaults({
    color: 'primary',
    size: '2.5px',
    position: 'top',
  });

  // 路由切换时显示顶部加载进度条，为懒加载的页面组件提供视觉反馈
  // 仅当导航耗时超过阈值时才显示，避免快速切换时闪烁
  let loadingBarTimer: ReturnType<typeof setTimeout> | null = null;

  Router.beforeEach(() => {
    loadingBarTimer = setTimeout(() => {
      LoadingBar.start();
    }, 150);
  });

  Router.afterEach(() => {
    if (loadingBarTimer !== null) {
      clearTimeout(loadingBarTimer);
      loadingBarTimer = null;
    }
    LoadingBar.stop();
  });

  return Router;
});
