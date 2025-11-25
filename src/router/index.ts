import { defineRouter } from '#q-app/wrappers';
import {
  createMemoryHistory,
  createRouter,
  createWebHashHistory,
  createWebHistory,
} from 'vue-router';
import routes from './routes';
import { useBooksStore } from 'src/stores/books';
import { useAIModelsStore } from 'src/stores/ai-models';
import { useSettingsStore } from 'src/stores/settings';
import { useToastHistoryStore } from 'src/stores/toast-history';
import { useCoverHistoryStore } from 'src/stores/cover-history';
import { useAIProcessingStore } from 'src/stores/ai-processing';
import { useUiStore } from 'src/stores/ui';
import { migrateFromLocalStorage } from 'src/utils/indexed-db';

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

  // 数据加载状态标记
  let isDataLoading = false;
  let isDataLoaded = false;
  let migrationPromise: Promise<void> | null = null;

  // 全局前置守卫：确保数据已加载
  Router.beforeEach(async (to, from, next) => {
    // 如果数据已加载，直接通过
    if (isDataLoaded) {
      next();
      return;
    }

    // 如果正在加载，等待加载完成
    if (isDataLoading) {
      // 轮询等待加载完成
      const checkInterval = setInterval(() => {
        if (isDataLoaded) {
          clearInterval(checkInterval);
          next();
        }
      }, 50);
      return;
    }

    // 开始加载数据
    isDataLoading = true;
    
    // 设置 UI 加载状态
    const uiStore = useUiStore();
    uiStore.setInitialDataLoading(true);

    try {
      // 首次运行时从 localStorage 迁移到 IndexedDB（只执行一次）
      if (!migrationPromise) {
        const hasRun = sessionStorage.getItem('indexeddb-migration-done');
        if (!hasRun) {
          migrationPromise = migrateFromLocalStorage().then(() => {
            sessionStorage.setItem('indexeddb-migration-done', 'true');
          });
        } else {
          migrationPromise = Promise.resolve();
        }
      }
      await migrationPromise;

      // 从 IndexedDB 加载所有 stores
      const booksStore = useBooksStore();
      const aiModelsStore = useAIModelsStore();
      const settingsStore = useSettingsStore();
      const toastHistoryStore = useToastHistoryStore();
      const coverHistoryStore = useCoverHistoryStore();
      const aiProcessingStore = useAIProcessingStore();

      await Promise.all([
        booksStore.loadBooks(),
        aiModelsStore.loadModels(),
        settingsStore.loadSettings(),
        toastHistoryStore.loadHistory(),
        coverHistoryStore.loadCoverHistory(),
        aiProcessingStore.loadThinkingProcesses(),
      ]);

      isDataLoaded = true;
      isDataLoading = false;
      uiStore.setInitialDataLoading(false);
      next();
    } catch (error) {
      console.error('Failed to load initial data:', error);
      isDataLoading = false;
      uiStore.setInitialDataLoading(false);
      // 即使加载失败也允许导航，避免应用完全无法使用
      isDataLoaded = true;
      next();
    }
  });

  return Router;
});
