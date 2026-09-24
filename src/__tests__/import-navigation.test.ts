import { afterEach, describe, expect, it, vi } from 'vitest';
import { reactive } from 'vue';

const { route, push } = vi.hoisted(() => ({
  route: { path: '/' },
  push: vi.fn(),
}));

vi.mock('vue-router', async (importOriginal) => {
  const original: Record<string, unknown> = await importOriginal();
  return { ...original, useRoute: () => reactiveRoute, useRouter: () => ({ push }) };
});

const reactiveRoute = reactive(route);

import { useMainNavActive } from 'src/composables/useMainNavActive';
import { useMainNavDispatch } from 'src/composables/layout/useMainNavDispatch';
import { useUiStore } from 'src/stores/ui';
import routes from 'src/router/routes';

afterEach(() => {
  push.mockReset();
  reactiveRoute.path = '/';
});

describe('AI 导入导航入口', () => {
  it('导入路由（含任务 ID）激活导入入口；展开聊天时仍显示导入上下文', () => {
    const active = useMainNavActive();
    const ui = useUiStore();
    reactiveRoute.path = '/import';
    expect(active.value).toBe('import');
    reactiveRoute.path = '/import/task-1';
    expect(active.value).toBe('import');
    ui.setActiveRightTab('chat');
    ui.openRightPanel();
    expect(active.value).toBe('import');
  });

  it('其他路由展开聊天时仍激活月詠，不误亮导入或首页', () => {
    const active = useMainNavActive();
    const ui = useUiStore();
    reactiveRoute.path = '/books';
    ui.setActiveRightTab('chat');
    ui.openRightPanel();
    expect(active.value).toBe('chat');
  });

  it('派发导入入口会进入 /import，已在导入任务页时不重复跳转', () => {
    const { dispatch } = useMainNavDispatch();
    reactiveRoute.path = '/books';
    dispatch('import');
    expect(push).toHaveBeenCalledWith('/import');
    push.mockReset();
    reactiveRoute.path = '/import/task-1';
    dispatch('import');
    expect(push).not.toHaveBeenCalled();
  });

  it('路由表把 /import/:taskId? 指向导入 dispatcher', () => {
    const children = routes[0]!.children ?? [];
    expect(children.some((entry) => entry.path === 'import/:taskId?')).toBe(true);
  });
});
