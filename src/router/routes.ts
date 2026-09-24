import type { RouteRecordRaw } from 'vue-router';
import { FEATURES } from 'src/constants/features';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('src/layouts/MainLayout.vue'),
    children: [
      { path: '', component: () => import('src/pages/IndexPage.vue') },
      { path: 'books', component: () => import('src/pages/BooksPage.vue') },
      // 静态段放在 books/:id 之前，避免 new 被当作书籍 ID
      { path: 'books/new/web', component: () => import('src/pages/BookSyncNewPage.vue') },
      {
        path: 'books/:id/settings/:setting(terms|characters|memory|translation|update)',
        component: () => import('src/pages/BookDetailsPage.vue'),
      },
      { path: 'books/:id', component: () => import('src/pages/BookDetailsPage.vue') },
      {
        path: 'import/:taskId?',
        component: () => import('src/pages/ImportPage.vue'),
        // 回退关闭导入时回到首页，已保存的任务不受影响
        beforeEnter: () => FEATURES.importWorkspace || '/',
      },
      { path: 'ai', component: () => import('src/pages/AIPage.vue') },
      { path: 'settings', component: () => import('src/pages/SettingsPage.vue') },
      { path: 'help/:docId?', component: () => import('src/pages/HelpPage.vue') },
    ],
  },

  // Always leave this as last one,
  // but you can also remove it
  {
    path: '/:catchAll(.*)*',
    component: () => import('src/pages/NotFoundPage.vue'),
  },
];

export default routes;
