import { describe, it, mock } from 'bun:test';
import { expect } from 'vitest';
import './setup';
import { delayAbortable, runAbortable } from '../utils/abortable-operation';

describe('可取消操作', () => {
  it('在排入微任务后立刻取消也不能开始实际操作', async () => {
    const controller = new AbortController();
    const operation = mock(() => Promise.resolve('不应执行'));
    const promise = runAbortable(controller.signal, operation);
    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    await Promise.resolve();
    expect(operation).not.toHaveBeenCalled();
  });

  it('取消等待丢弃迟到响应，长重试延时可立即退出', async () => {
    const controller = new AbortController();
    let finish: (value: string) => void = () => undefined;
    const promise = runAbortable(
      controller.signal,
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    );
    await Promise.resolve();
    controller.abort();
    finish('迟到');
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    await expect(delayAbortable(60000, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(await runAbortable(undefined, () => Promise.resolve('成功'))).toBe('成功');
  });
});
