import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('src/layouts/MainLayout.vue'),
    children: [
      { path: '', component: () => import('src/pages/IndexPage.vue') },
      { path: 'books', component: () => import('src/pages/BooksPage.vue') },
      { path: 'books/:id', component: () => import('src/pages/BookDetailsPage.vue') },
      { path: 'ai', component: () => import('src/pages/AIPage.vue') },
      { path: 'help', component: () => import('src/pages/HelpPage.vue') },
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
