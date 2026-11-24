import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { nextTick } from 'vue';
import createAppRouter from '../router';

vi.mock('../router/routes', () => ({
  default: [
    { path: '/help/:docId?', component: { render: () => null } },
    { path: '/books', component: { render: () => null } },
  ],
}));

afterEach(() => vi.restoreAllMocks());

async function flushScroll() {
  await nextTick();
  await nextTick();
}

describe('路由文档滚动', () => {
  it('同页更新章节 hash 不把帮助正文重新滚到顶部', async () => {
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    // 路由工厂不使用传入的上下文（store、ssrContext）
    const router = await createAppRouter({} as Parameters<typeof createAppRouter>[0]);
    await router.push('/help/front-page');
    await flushScroll();
    scroll.mockClear();

    await router.replace('/help/front-page#front-settings');
    await flushScroll();

    expect(scroll).not.toHaveBeenCalled();
  });
});
