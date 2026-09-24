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
});
