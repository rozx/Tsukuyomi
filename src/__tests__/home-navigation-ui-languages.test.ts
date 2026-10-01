import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { createApp, h, nextTick } from 'vue';
import type { App, Component } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createI18n } from 'vue-i18n';
import PrimeVue from 'primevue/config';
import messages from '../i18n';
import { provideIndexPage } from '../composables/index-page/useIndexPage';
import IndexPageDesktop from '../pages/index-page/IndexPageDesktop.vue';
import IndexPageTablet from '../pages/index-page/IndexPageTablet.vue';
import IndexPageMobile from '../pages/index-page/IndexPageMobile.vue';
import AppSideMenu from '../components/layout/AppSideMenu.vue';
import TabletNavRail from '../components/layout/TabletNavRail.vue';
import MobileTabBar from '../components/layout/MobileTabBar.vue';
import MobileProgressSheet from '../components/layout/MobileProgressSheet.vue';
import { useAIProcessingStore } from '../stores/ai-processing';
import { useBookDetailsStore } from '../stores/book-details';
let app: App | undefined;
afterEach(() => {
  app?.unmount();
  app = undefined;
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});
async function mount(component: Component, home = false) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { render: () => null } }],
  });
  await router.push('/');
  const i18n = createI18n({ legacy: false, locale: 'en-US', messages });
  app = createApp({
    setup() {
      if (home) provideIndexPage();
      return () => h(component, { collapsed: true, visible: false });
    },
  });
  app
    .use(pinia)
    .use(router)
    .use(i18n)
    .use(PrimeVue)
    .mount(document.body.appendChild(document.createElement('div')));
  for (let n = 0; n < 12; n++) {
    await Promise.resolve();
    await nextTick();
  }
  return { i18n, router };
}
describe('三变体首页与导航语言', () => {
  it('关闭进度抽屉时仍响应新任务并更新选中任务', async () => {
    await mount(MobileProgressSheet);
    const processing = useAIProcessingStore();
    const details = useBookDetailsStore();
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    const original = await processing.addTask({
      type: 'translation',
      modelName: 'QA',
      status: 'processing',
      bookId: 'book',
      chapterId: 'chapter',
    });
    await nextTick();
    details.selectTask(original);
    await processing.updateTask(original, { status: 'end' });
    vi.mocked(Date.now).mockReturnValue(2000);
    const latest = await processing.addTask({
      type: 'translation',
      modelName: 'QA',
      status: 'processing',
      bookId: 'book',
      chapterId: 'new-chapter',
    });
    await nextTick();
    expect(details.translationProgress.selectedTaskId).toBe(latest);
  });
  for (const [name, component] of [
    ['desktop', IndexPageDesktop],
    ['tablet', IndexPageTablet],
    ['mobile', IndexPageMobile],
  ] as const) {
    it(`${name}固定文字和可访问性随语言更新`, async () => {
      const { i18n } = await mount(component, true);
      expect(document.body.textContent).toContain('Add book');
      expect(document.body.textContent).not.toMatch(/添加书籍|欢迎回来|字数|日站/);
      i18n.global.locale.value = 'zh-TW';
      await nextTick();
      expect(document.body.textContent).toContain('新增書籍');
    });
  }
  for (const [name, component] of [
    ['desktop', AppSideMenu],
    ['tablet', TabletNavRail],
    ['mobile', MobileTabBar],
  ] as const) {
    it(`${name}导航标签响应式变化且路由不变`, async () => {
      const { i18n } = await mount(component);
      expect(document.body.textContent + document.body.innerHTML).toContain('Home');
      i18n.global.locale.value = 'zh-TW';
      await nextTick();
      expect(document.body.textContent + document.body.innerHTML).toContain('首頁');
    });
  }
});
