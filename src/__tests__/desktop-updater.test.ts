import { expect } from 'vitest';
import { describe, it, mock } from 'bun:test';
import './setup';
import { DesktopUpdater } from '../../src-electron/desktop-updater';

describe('桌面自动更新', () => {
  it('下载失败可重试；准备失败或用户取消不安装，已下载包仍可重启', async () => {
    let broken = true;
    let busy = true;
    let confirmed = false;
    const install = mock(() => {});
    const release = mock(() => {});
    const updater = new DesktopUpdater({
      version: '0.16.0',
      check: () => Promise.resolve({ version: '0.16.1' }),
      download: () => (broken ? Promise.reject(new Error('下载中断')) : Promise.resolve()),
      confirm: () => Promise.resolve(confirmed),
      prepare: () => (busy ? Promise.reject(new Error('正在保存')) : Promise.resolve()),
      install,
      release,
    });
    await updater.check();
    expect(updater.snapshot().phase).toBe('error');
    broken = false;
    await updater.check();
    await updater.restart();
    expect(install).not.toHaveBeenCalled();
    confirmed = true;
    await updater.restart();
    expect(updater.snapshot()).toMatchObject({ phase: 'ready', message: '正在保存' });
    expect(release).toHaveBeenCalled();
    expect(install).not.toHaveBeenCalled();
    busy = false;
    await Promise.all([updater.restart(), updater.restart()]);
    expect(install).toHaveBeenCalledTimes(1);
    expect(updater.snapshot().phase).toBe('installing');
  });

  it('开发包不检查网络，也不能安装未下载更新', async () => {
    const check = mock(() => Promise.resolve(null));
    const install = mock(() => {});
    const updater = new DesktopUpdater({
      version: '0.16.0',
      unavailable: '开发环境',
      check,
      download: () => Promise.resolve(),
      confirm: () => Promise.resolve(true),
      prepare: () => Promise.resolve(),
      install,
      release: () => {},
    });
    await updater.check();
    await updater.restart();
    expect(check).not.toHaveBeenCalled();
    expect(install).not.toHaveBeenCalled();
  });
  it('合并重复检查并下载一次，下载完成不会自行退出', async () => {
    let resolve!: (value: { version: string }) => void;
    const check = mock(
      () =>
        new Promise<{ version: string }>((done) => {
          resolve = done;
        }),
    );
    const download = mock(() => Promise.resolve());
    const install = mock(() => {});
    const updater = new DesktopUpdater({
      version: '0.16.0',
      check,
      download,
      install,
      prepare: () => Promise.resolve(),
      confirm: () => Promise.resolve(true),
      release: () => {},
    });
    const first = updater.check();
    const second = updater.check();
    resolve({ version: '0.16.1' });
    await Promise.all([first, second]);
    expect(check).toHaveBeenCalledTimes(1);
    expect(download).toHaveBeenCalledTimes(1);
    expect(updater.snapshot().phase).toBe('ready');
    expect(install).not.toHaveBeenCalled();
  });

  describe('已下载后继续检查', () => {
    type Target = { version: string };
    function setup(initial = '0.16.1') {
      let remote: Target | null | Error = { version: initial };
      let downloadError: Error | undefined;
      const phases: string[] = [];
      const check = mock(() =>
        remote instanceof Error ? Promise.reject(remote) : Promise.resolve(remote),
      );
      const download = mock((target: Target) => {
        void target;
        return downloadError ? Promise.reject(downloadError) : Promise.resolve();
      });
      const install = mock((target: Target) => {
        void target;
      });
      const updater = new DesktopUpdater<Target>({
        version: '0.16.0',
        check,
        download: (target) => download(target),
        install,
        prepare: () => Promise.resolve(),
        confirm: () => Promise.resolve(true),
        release: () => {},
        publish: (state) => phases.push(state.phase),
      });
      return {
        updater,
        check,
        download,
        install,
        phases,
        setRemote: (value: Target | null | Error) => {
          remote = value;
        },
        failDownload: (error?: Error) => {
          downloadError = error;
        },
      };
    }

    it('发现更新版本时下载并替换目标，安装使用最新下载的目标', async () => {
      const t = setup();
      await t.updater.check();
      t.setRemote({ version: '0.16.2' });
      await t.updater.check();
      expect(t.download).toHaveBeenCalledTimes(2);
      expect(t.updater.snapshot()).toMatchObject({ phase: 'ready', targetVersion: '0.16.2' });
      await t.updater.restart();
      expect(t.install).toHaveBeenCalledWith({ version: '0.16.2' });
    });

    it('同版本、无更新或检查失败时静默保持已下载版本可安装', async () => {
      const t = setup();
      await t.updater.check();
      t.phases.length = 0;
      await t.updater.check();
      t.setRemote(null);
      await t.updater.check();
      t.setRemote(new Error('离线'));
      await t.updater.check();
      expect(t.check).toHaveBeenCalledTimes(4);
      expect(t.download).toHaveBeenCalledTimes(1);
      expect(t.phases).toEqual([]);
      expect(t.updater.snapshot()).toMatchObject({ phase: 'ready', targetVersion: '0.16.1' });
      await t.updater.restart();
      expect(t.install).toHaveBeenCalledWith({ version: '0.16.1' });
    });

    it('新版本下载失败后不再安装旧目标，重试会重新下载', async () => {
      const t = setup();
      await t.updater.check();
      t.setRemote({ version: '0.16.2' });
      t.failDownload(new Error('下载中断'));
      await t.updater.check();
      expect(t.updater.snapshot()).toMatchObject({ phase: 'error', message: '下载中断' });
      await t.updater.restart();
      expect(t.install).not.toHaveBeenCalled();
      t.failDownload();
      await t.updater.check();
      await t.updater.restart();
      expect(t.install).toHaveBeenCalledWith({ version: '0.16.2' });
    });

    it('后台检查进行中点击重启会等检查结束后继续安装', async () => {
      const t = setup();
      await t.updater.check();
      let resolve!: (value: Target | null) => void;
      t.check.mockImplementationOnce(
        () =>
          new Promise<Target | null>((done) => {
            resolve = done;
          }),
      );
      const checking = t.updater.check();
      const restarting = t.updater.restart();
      resolve({ version: '0.16.1' });
      await Promise.all([checking, restarting]);
      expect(t.install).toHaveBeenCalledTimes(1);
      expect(t.updater.snapshot().phase).toBe('installing');
    });
  });
});
