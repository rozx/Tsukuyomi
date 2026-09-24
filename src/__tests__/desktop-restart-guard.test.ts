import { expect } from 'vitest';
import { describe, it } from 'bun:test';
import './setup';
import { DesktopRestartGuard } from '../services/desktop-restart-guard';

describe('桌面更新重启保护', () => {
  it('未完成 action 阻止重启，准备期间不允许启动新工作，取消后恢复', async () => {
    const guard = new DesktopRestartGuard();
    const done = guard.beginAction();
    await expect(guard.prepare(() => Promise.resolve())).rejects.toThrow('保存');
    done();
    await guard.prepare(() => Promise.resolve());
    expect(() => guard.beginAction()).toThrow('重启');
    guard.release();
    guard.beginAction()();
  });

  it('保存检查失败或超时取消后不能继续确认，且解除冻结', async () => {
    const guard = new DesktopRestartGuard();
    await expect(guard.prepare(() => Promise.reject(new Error('磁盘错误')))).rejects.toThrow(
      '磁盘错误',
    );
    guard.beginAction()();
    let finish!: () => void;
    const pending = guard.prepare(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    guard.release();
    finish();
    await expect(pending).rejects.toThrow('取消');
    guard.beginAction()();
  });
});
