import { defineBoot } from '#q-app/wrappers';

/**
 * Toast 历史记录拦截插件
 * 在应用启动时初始化 toast 历史记录
 * 实际的拦截在 MainLayout 中完成
 */
export default defineBoot(() => {
  // 这个 boot 文件确保 toast-history composable 可以被使用
});

