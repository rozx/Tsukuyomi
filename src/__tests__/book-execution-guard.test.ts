import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { BookExecutionGuard } from '../services/book-execution-guard';
import { deferred, webLocksFixture } from './web-locks-fixture';

afterEach(() => vi.unstubAllGlobals());
const owner = { label: '翻译第一章', chapterId: 'chapter' };

describe('书籍执行占用', () => {
  it('共享执行允许同书并行及其他书提交，独占提交拒绝忙碌并能查询占用者', async () => {
    vi.stubGlobal('navigator', { locks: webLocksFixture() });
    const started = deferred();
    const ending = deferred();
    const writing = BookExecutionGuard.write('book', owner, async () => {
      started.resolve();
      await ending.promise;
    });
    await started.promise;
    expect(await BookExecutionGuard.occupants('book')).toEqual([expect.objectContaining(owner)]);
    await expect(
      BookExecutionGuard.write('book', { label: '第二章' }, () => Promise.resolve(2)),
    ).resolves.toBe(2);
    await expect(BookExecutionGuard.commit('other', () => Promise.resolve(3))).resolves.toBe(3);
    await expect(BookExecutionGuard.commit('book', () => Promise.resolve())).rejects.toThrow(
      'TARGET_BUSY',
    );
    ending.resolve();
    await writing;
    await expect(BookExecutionGuard.commit('book', () => Promise.resolve('完成'))).resolves.toBe(
      '完成',
    );
    expect(await BookExecutionGuard.occupants('book')).toEqual([]);
  });

  it('提交先取得独占时，新执行不能读旧快照；收尾失败也会释放占用', async () => {
    vi.stubGlobal('navigator', { locks: webLocksFixture() });
    const started = deferred();
    const ending = deferred();
    const committing = BookExecutionGuard.commit('book', async () => {
      started.resolve();
      await ending.promise;
    });
    await started.promise;
    const read = vi.fn(() => Promise.resolve());
    await expect(BookExecutionGuard.write('book', owner, read)).rejects.toThrow('TARGET_BUSY');
    expect(read).not.toHaveBeenCalled();
    ending.resolve();
    await committing;
    await expect(
      BookExecutionGuard.write('book', owner, () => Promise.reject(new Error('save failed'))),
    ).rejects.toThrow('save failed');
    await expect(BookExecutionGuard.commit('book', read)).resolves.toBeUndefined();
  });

  it('没有可靠锁时拒绝导入提交，原有普通写执行仍可使用', async () => {
    vi.stubGlobal('navigator', {});
    await expect(BookExecutionGuard.commit('book', () => Promise.resolve())).rejects.toThrow(
      'LOCK_UNAVAILABLE',
    );
    await expect(BookExecutionGuard.write('book', owner, () => Promise.resolve(1))).resolves.toBe(
      1,
    );
  });
});
