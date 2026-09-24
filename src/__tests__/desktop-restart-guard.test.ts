import { expect } from 'vitest';
import { describe, it } from 'bun:test';
import './setup';
import { DesktopRestartGuard, desktopRestartGuard } from '../services/desktop-restart-guard';
import { BookExecutionGuard } from '../services/book-execution-guard';

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

  it('准备检查期间启动的新工作照常执行而不被丢弃，并使本次准备失败', async () => {
    const guard = new DesktopRestartGuard();
    let saved = false;
    await expect(
      guard.prepare(() => {
        const done = guard.beginAction();
        saved = true;
        done();
        return Promise.resolve();
      }),
    ).rejects.toThrow('新的操作');
    expect(saved).toBe(true);
    guard.beginAction()();
    await guard.prepare(() => Promise.resolve());
  });

  it('准备期间仍未结束的新工作使准备失败', async () => {
    const guard = new DesktopRestartGuard();
    let done!: () => void;
    await expect(
      guard.prepare(() => {
        done = guard.beginAction();
        return Promise.resolve();
      }),
    ).rejects.toThrow('新的操作');
    await expect(guard.prepare(() => Promise.resolve())).rejects.toThrow('保存');
    done();
    await guard.prepare(() => Promise.resolve());
  });

  it('书籍执行（含同步回滚）在准备检查期间不抛错，并阻止本次重启', async () => {
    let ran = false;
    await expect(
      desktopRestartGuard.prepare(() =>
        BookExecutionGuard.write('book', { label: '测试' }, () => {
          ran = true;
          return Promise.resolve();
        }),
      ),
    ).rejects.toThrow('新的操作');
    expect(ran).toBe(true);
    await desktopRestartGuard.prepare(() => Promise.resolve());
    await expect(
      BookExecutionGuard.write('book', { label: '测试' }, () => Promise.resolve()),
    ).rejects.toThrow('重启');
    desktopRestartGuard.release();
  });
});
