import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import type { DesktopUpdateState } from '../models/desktop-update';
import { describeUpdateBadge, initializeDesktopUpdates } from '../composables/useDesktopUpdates';
import AppFooter from '../components/layout/AppFooter.vue';

const toast = vi.hoisted(() => ({ add: vi.fn() }));
vi.mock('src/composables/useToastHistory', () => ({
  useToastWithHistory: () => toast,
}));

const base: DesktopUpdateState = { phase: 'idle', currentVersion: '0.16.0' };

describe('页脚更新徽标状态', () => {
  it('从未完成检查、检查中、出错或不可用时不显示', () => {
    expect(describeUpdateBadge(base)).toBeNull();
    expect(describeUpdateBadge({ ...base, phase: 'checking' })).toBeNull();
    expect(describeUpdateBadge({ ...base, phase: 'error', checkedAt: 1 })).toBeNull();
    expect(describeUpdateBadge({ ...base, phase: 'unavailable', checkedAt: 1 })).toBeNull();
  });

  it('检查完成且无更新时显示 latest，不可点击', () => {
    expect(describeUpdateBadge({ ...base, checkedAt: 1 })).toMatchObject({
      tone: 'latest',
      label: 'latest',
      clickable: false,
    });
  });

  it('下载中显示目标版本和进度，不可点击', () => {
    expect(
      describeUpdateBadge({ ...base, phase: 'downloading', targetVersion: '0.16.1', progress: 42 }),
    ).toMatchObject({ tone: 'busy', label: 'v0.16.1 · 42%', clickable: false });
  });

  it('已下载时提示新版本可用并可点击', () => {
    expect(
      describeUpdateBadge({ ...base, phase: 'ready', targetVersion: '0.16.1', progress: 100 }),
    ).toMatchObject({ tone: 'update', label: 'v0.16.1 available', clickable: true });
  });

  it('准备或安装中显示更新中，不可点击', () => {
    for (const phase of ['preparing', 'installing'] as const) {
      expect(describeUpdateBadge({ ...base, phase, targetVersion: '0.16.1' })).toMatchObject({
        tone: 'busy',
        clickable: false,
      });
    }
  });
});

describe('页脚更新徽标交互', () => {
  afterEach(() => {
    delete window.electronAPI;
    toast.add.mockReset();
  });

  function mountFooter(initial: DesktopUpdateState, afterRestart: DesktopUpdateState) {
    const restart = vi.fn(() => Promise.resolve(afterRestart));
    window.electronAPI = {
      updates: {
        getState: () => Promise.resolve(initial),
        check: () => Promise.resolve(initial),
        restart,
        onState: () => () => {},
        onPrepare: () => () => {},
        onRelease: () => () => {},
      },
    } as unknown as NonNullable<Window['electronAPI']>;
    const element = document.createElement('div');
    const app = createApp({
      setup() {
        initializeDesktopUpdates();
        return () => h(AppFooter);
      },
    });
    app.use(createPinia());
    app.mount(element);
    return { element, restart, unmount: () => app.unmount() };
  }

  const ready: DesktopUpdateState = {
    ...base,
    phase: 'ready',
    targetVersion: '0.16.1',
    progress: 100,
  };

  it('Web 端不显示徽标', () => {
    const element = document.createElement('div');
    const app = createApp(AppFooter);
    app.use(createPinia());
    app.mount(element);
    expect(element.querySelector('.dsk-statusbar-update')).toBeNull();
    app.unmount();
  });

  it('已是最新时显示 latest', async () => {
    const footer = mountFooter({ ...base, checkedAt: 1 }, base);
    await vi.waitFor(() =>
      expect(footer.element.querySelector('.dsk-statusbar-update')?.textContent).toContain(
        'latest',
      ),
    );
    footer.unmount();
  });

  it('点击新版本徽标请求重启更新（由主进程弹出确认），失败时提示原因', async () => {
    const footer = mountFooter(ready, { ...ready, message: '仍有翻译、导入或同步任务' });
    await vi.waitFor(() =>
      expect(footer.element.querySelector('button.dsk-statusbar-update')).not.toBeNull(),
    );
    footer.element.querySelector<HTMLButtonElement>('button.dsk-statusbar-update')!.click();
    await vi.waitFor(() => expect(footer.restart).toHaveBeenCalledTimes(1));
    await nextTick();
    expect(toast.add).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'warn', detail: '仍有翻译、导入或同步任务' }),
    );
    footer.unmount();
  });

  it('用户取消确认时不提示', async () => {
    const footer = mountFooter(ready, ready);
    await vi.waitFor(() =>
      expect(footer.element.querySelector('button.dsk-statusbar-update')).not.toBeNull(),
    );
    footer.element.querySelector<HTMLButtonElement>('button.dsk-statusbar-update')!.click();
    await vi.waitFor(() => expect(footer.restart).toHaveBeenCalledTimes(1));
    await nextTick();
    expect(toast.add).not.toHaveBeenCalled();
    footer.unmount();
  });
});
