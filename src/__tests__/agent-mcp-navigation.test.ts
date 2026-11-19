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
  useUiStore().closeRightPanel();
});

describe('外部 Agent / MCP 导航入口', () => {
  it('访问 /mcp 时激活 mcp 导航项', () => {
    const active = useMainNavActive();
    reactiveRoute.path = '/mcp';
    expect(active.value).toBe('mcp');
  });

  it('派发 mcp 导航项会跳转 /mcp，已在 /mcp 时不重复跳转', () => {
    const { dispatch } = useMainNavDispatch();
    reactiveRoute.path = '/books';
    dispatch('mcp');
    expect(push).toHaveBeenCalledWith('/mcp');

    push.mockReset();
    reactiveRoute.path = '/mcp';
    dispatch('mcp');
    expect(push).not.toHaveBeenCalled();
  });

  it('路由表将 /mcp 指向 AgentMcpPage dispatcher', () => {
    const children = routes[0]!.children ?? [];
    expect(children.some((entry) => entry.path === 'mcp')).toBe(true);
  });
});
