import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { createApp, defineComponent, h, nextTick } from 'vue';
import type { App, Component } from 'vue';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import messages from '../i18n';
import { routeLoading, trackRouteLoading } from 'src/router/route-loading';
import RouteLoadingIndicator from 'src/components/layout/RouteLoadingIndicator.vue';

const Page = { render: () => h('div', 'page') };

/** 懒加载页面：手动决定何时加载完成 / 失败 */
function deferredPage() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const load = () =>
    new Promise<Component>((res, rej) => {
      resolve = () => res(Page);
      reject = rej;
    });
  return { load, resolve: () => resolve(), reject: (e: unknown) => reject(e) };
}

let router: Router;
let app: App | undefined;

async function setup(slow: () => Promise<Component>, slow2: () => Promise<Component> = slow) {
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: Page },
      { path: '/fast', component: Page },
      { path: '/slow', component: slow },
      { path: '/slow2', component: slow2 },
    ],
  });
  trackRouteLoading(router);
  await router.push('/');
}

async function flush() {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
    await nextTick();
  }
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('路由加载状态', () => {
  it('快速切换不显示加载指示', async () => {
    await setup(() => Promise.resolve(Page));
    const seen: boolean[] = [];
    const unwatch = router.afterEach(() => seen.push(routeLoading.value));

    await router.push('/fast');
    await vi.advanceTimersByTimeAsync(1_000);

    expect(seen).toEqual([false]);
    expect(routeLoading.value).toBe(false);
    unwatch();
  });

  it('切换超过 300ms 才显示，加载完成后隐藏', async () => {
    const page = deferredPage();
    await setup(page.load);

    const navigating = router.push('/slow');
    await vi.advanceTimersByTimeAsync(299);
    expect(routeLoading.value).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(routeLoading.value).toBe(true);

    page.resolve();
    await navigating;
    expect(routeLoading.value).toBe(false);
  });

  it('页面加载失败时隐藏，不会一直转圈', async () => {
    const page = deferredPage();
    await setup(page.load);

    const navigating = router.push('/slow').catch(() => undefined);
    await vi.advanceTimersByTimeAsync(400);
    expect(routeLoading.value).toBe(true);

    page.reject(new Error('chunk 加载失败'));
    await navigating;
    expect(routeLoading.value).toBe(false);
  });

  it('慢切换被另一个慢切换取代时，旧导航结束不会隐藏新导航的指示', async () => {
    const first = deferredPage();
    const second = deferredPage();
    await setup(first.load, second.load);

    void router.push('/slow').catch(() => undefined);
    await vi.advanceTimersByTimeAsync(400);
    const navigating = router.push('/slow2');
    first.resolve();
    await vi.advanceTimersByTimeAsync(400);
    expect(routeLoading.value).toBe(true);

    second.resolve();
    await navigating;
    expect(routeLoading.value).toBe(false);
  });

  it('慢切换被新的快速切换取代时立即隐藏', async () => {
    const page = deferredPage();
    await setup(page.load);

    void router.push('/slow').catch(() => undefined);
    await vi.advanceTimersByTimeAsync(400);
    expect(routeLoading.value).toBe(true);

    await router.push('/fast');
    await vi.advanceTimersByTimeAsync(1_000);
    expect(routeLoading.value).toBe(false);
  });
});

describe('内容区加载指示', () => {
  /** 指示器挂在常驻的 App 外壳；`withLayout` 时页面布局已渲染出带 route outlet 的 main */
  async function mountIndicator(withLayout = true) {
    const main = document.createElement('main');
    const outlet = document.createElement('div');
    outlet.id = 'route-outlet-desktop';
    main.appendChild(outlet);
    if (withLayout) document.body.appendChild(main);
    vi.spyOn(main, 'getBoundingClientRect').mockReturnValue({
      top: 40,
      left: 220,
      width: 800,
      height: 600,
    } as DOMRect);
    const Host = defineComponent({ setup: () => () => h(RouteLoadingIndicator) });
    app = createApp(Host);
    app.use(createI18n({ legacy: false, locale: 'zh-CN', messages }));
    app.mount(document.body.appendChild(document.createElement('div')));
    await nextTick();
    return document.body;
  }

  it('慢切换时在内容区中央显示「正在加载…」，完成后移除', async () => {
    const page = deferredPage();
    await setup(page.load);
    const main = await mountIndicator();
    expect(main.querySelector('[role="status"]')).toBeNull();

    const navigating = router.push('/slow');
    await vi.advanceTimersByTimeAsync(300);
    await flush();

    const status = main.querySelector<HTMLElement>('[role="status"]');
    expect(status?.textContent).toContain('正在加载…');
    expect(status?.style.top).toBe('40px');
    expect(status?.style.left).toBe('220px');
    expect(status?.style.width).toBe('800px');
    expect(status?.style.height).toBe('600px');

    page.resolve();
    await navigating;
    await flush();
    await vi.advanceTimersByTimeAsync(500);
    await flush();
    expect(main.querySelector('[role="status"]')).toBeNull();
  });

  it('首屏布局尚未加载时也能显示，铺满视口居中', async () => {
    const page = deferredPage();
    await setup(page.load);
    const body = await mountIndicator(false);

    void router.push('/slow');
    await vi.advanceTimersByTimeAsync(300);
    await flush();

    const status = body.querySelector<HTMLElement>('[role="status"]');
    expect(status?.textContent).toContain('正在加载…');
    expect(status?.getAttribute('style') ?? '').toBe('');
    page.resolve();
  });
});
