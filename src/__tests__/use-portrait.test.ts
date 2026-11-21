import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick, type App, type Ref } from 'vue';
import { usePortrait } from 'src/composables/usePortrait';

type Listener = (event: { matches: boolean }) => void;

function stubMatchMedia(initial: boolean) {
  const listeners = new Set<Listener>();
  const query = {
    matches: initial,
    addEventListener: (_: string, fn: Listener) => listeners.add(fn),
    removeEventListener: (_: string, fn: Listener) => listeners.delete(fn),
  };
  vi.stubGlobal('matchMedia', () => query);
  return {
    listeners,
    rotate(matches: boolean) {
      query.matches = matches;
      for (const fn of listeners) fn({ matches });
    },
  };
}

let app: App | undefined;
afterEach(() => {
  app?.unmount();
  app = undefined;
  vi.unstubAllGlobals();
});

function mount() {
  let portrait!: Ref<boolean>;
  app = createApp(
    defineComponent({
      setup() {
        portrait = usePortrait();
        return () => h('div');
      },
    }),
  );
  app.mount(document.createElement('div'));
  return () => portrait.value;
}

describe('usePortrait', () => {
  it('初始值来自当前朝向，旋转后随之更新', async () => {
    const media = stubMatchMedia(true);
    const portrait = mount();
    expect(portrait()).toBe(true);
    media.rotate(false);
    await nextTick();
    expect(portrait()).toBe(false);
  });

  it('组件卸载后移除监听', () => {
    const media = stubMatchMedia(false);
    mount();
    expect(media.listeners.size).toBe(1);
    app?.unmount();
    app = undefined;
    expect(media.listeners.size).toBe(0);
  });
});
