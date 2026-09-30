import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { BookExecutionGuard } from '../services/book-execution-guard';
import { bumpBookRevision } from '../services/book-revision';
import { ChapterService } from '../services/chapter-service';
import { CoverService } from '../services/cover-service';
import { LocalizedError, localizedErrorMessage } from '../utils/localized-error';
import { deferred, webLocksFixture } from './web-locks-fixture';
import type { Chapter } from '../models/novel';

const CJK = /[぀-ヿ㐀-鿿]/;

async function rejection(promise: Promise<unknown>): Promise<LocalizedError> {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(LocalizedError);
  return error as LocalizedError;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('书籍执行占用错误', () => {
  it('占用者列表按界面语言连接，简中消息保留错误码前缀', async () => {
    vi.stubGlobal('navigator', { locks: webLocksFixture() });
    const started = deferred();
    const ending = deferred();
    const writing = BookExecutionGuard.write('book', { label: 'Translate chapter' }, async () => {
      started.resolve();
      await ending.promise;
    });
    await started.promise;
    const otherStarted = deferred();
    const other = BookExecutionGuard.write('book', { label: 'Polish chapter' }, async () => {
      otherStarted.resolve();
      await ending.promise;
    });
    await otherStarted.promise;
    const error = await rejection(BookExecutionGuard.commit('book', () => Promise.resolve()));
    expect(error.code).toBe('TARGET_BUSY');
    expect(error.message).toBe(
      'TARGET_BUSY: Translate chapter、Polish chapter，请等待执行和保存结束',
    );
    expect(error.messageFor('en-US')).toBe(
      'Translate chapter, Polish chapter: wait until they finish running and saving',
    );
    ending.resolve();
    await Promise.all([writing, other]);
  });

  it('没有 Web Locks 时导入提交错误可渲染为英文', async () => {
    vi.stubGlobal('navigator', {});
    const error = await rejection(BookExecutionGuard.commit('book', () => Promise.resolve()));
    expect(error.code).toBe('LOCK_UNAVAILABLE');
    expect(error.message).toBe(
      'LOCK_UNAVAILABLE: 当前环境无法协调导入提交，请使用支持 Web Locks 的环境',
    );
    expect(error.messageFor('en-US')).not.toMatch(CJK);
  });
});

describe('书籍修改序号与章节导出错误', () => {
  it('修改序号越界带错误码', async () => {
    const error = await rejection(
      bumpBookRevision(
        {
          get: () => Promise.resolve({ bookId: 'b', revision: -1 }),
          put: () => Promise.resolve('b'),
        },
        'b',
      ),
    );
    expect(error.code).toBe('REVISION_OVERFLOW');
    expect(error.message).toBe('REVISION_OVERFLOW: 书籍修改序号无效或已达到上限');
    expect(error.messageFor('zh-TW')).toMatch(CJK);
    expect(error.messageFor('en-US')).not.toMatch(CJK);
  });

  it('空章节导出错误按界面语言显示', async () => {
    const chapter = { id: 'c', title: 't', content: [] } as unknown as Chapter;
    vi.spyOn(ChapterService, 'loadChapterContent').mockResolvedValue(chapter);
    const error = await rejection(ChapterService.exportChapter(chapter, 'original', 'txt'));
    expect(error.code).toBe('EXPORT_EMPTY');
    expect(error.message).toBe('章节内容为空，无法导出');
    expect(localizedErrorMessage(error, 'en-US', 'translationUi.retryPermissions')).not.toMatch(
      CJK,
    );
  });

  it('剪贴板失败保留浏览器诊断', async () => {
    const chapter = {
      id: 'c',
      title: 't',
      content: [{ id: 'p', text: '原文', translations: [], selectedTranslationId: '' }],
    } as unknown as Chapter;
    vi.spyOn(ChapterService, 'loadChapterContent').mockResolvedValue(chapter);
    vi.stubGlobal('navigator', {
      clipboard: { writeText: () => Promise.reject(new Error('Denied by browser')) },
    });
    const error = await rejection(ChapterService.exportChapter(chapter, 'original', 'clipboard'));
    expect(error.code).toBe('CLIPBOARD_FAILED');
    expect(error.message).toBe('复制到剪贴板失败：Denied by browser');
    expect(error.messageFor('en-US')).toBe('Failed to copy to the clipboard: Denied by browser');
  });
});

describe('默认封面', () => {
  it('无标题时的占位名按界面语言生成，简中保持原样', () => {
    const decode = (url: string) =>
      new TextDecoder().decode(
        Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), (char) => char.charCodeAt(0)),
      );
    expect(decode(CoverService.generateDefaultCover(''))).toContain('未命名');
    expect(decode(CoverService.generateDefaultCover('', undefined, 'en-US'))).toContain('Untitled');
  });
});
