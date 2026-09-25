import './setup';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Chapter } from 'src/models/novel';
import { linkManualChapters } from 'src/services/book-sync/changes';
import { BookSyncService } from 'src/services/book-sync/book-sync-service';
import { ImportLibraryReader } from 'src/services/import/import-library-reader';
import * as transport from 'src/services/scraper/core/page-transport';
import { webLocksFixture } from './web-locks-fixture';
import {
  syncBook,
  syncRoot,
  syncSnapshot,
  syncCatalogHtml,
  saveSyncBook,
} from './book-sync-fixtures';

const date = new Date(0);
const ch = (id: string, title: string | { original: string }, webUrl?: string): Chapter =>
  ({
    id,
    title: typeof title === 'string' ? title : { original: title.original, translation: { id: 't', translation: '', aiModelId: '' } },
    ...(webUrl ? { webUrl } : {}),
    createdAt: date,
    lastEdited: date,
  }) as Chapter;
const entry = (n: number, title: string) => ({ url: `https://s.test/${n}.html`, title });

describe('linkManualChapters', () => {
  it('按标题精确匹配没有网址的章节（支持带译文的标题对象与全角/空白差异）', () => {
    const chapters = [
      ch('a', '第一話', 'https://s.test/1.html'),
      ch('b', { original: ' 魂に刻まれた ' }),
      ch('c', 'ＡＢＣ　話'),
    ];
    const entries = [entry(1, '第一話'), entry(2, '魂に刻まれた'), entry(3, 'ABC 話')];
    expect(linkManualChapters(chapters, entries)).toEqual([
      { chapterId: 'b', url: 'https://s.test/2.html' },
      { chapterId: 'c', url: 'https://s.test/3.html' },
    ]);
  });

  it('目录中同名的条目或本地同名章节不按标题关联', () => {
    const chapters = [ch('a', '閑話'), ch('b', '閑話'), ch('c', '番外')];
    const entries = [entry(1, '閑話'), entry(2, '番外'), entry(3, '番外')];
    expect(linkManualChapters(chapters, entries)).toEqual([]);
  });

  it('已被其它章节网址占用的条目不再关联', () => {
    const chapters = [ch('a', '恐怖', 'https://s.test/1.html'), ch('b', '恐怖')];
    expect(linkManualChapters(chapters, [entry(1, '恐怖')])).toEqual([]);
  });

  it('夹在两个已关联章节之间、数量一致时按顺序关联（标题被改过的章节）', () => {
    const chapters = [
      ch('a', '恐怖', 'https://s.test/27.html'),
      ch('b', '魂に刻まれた'),
      ch('c', '骑士'),
      ch('d', '聖女の手を引いた騎士'),
    ];
    const entries = [
      entry(27, '恐怖'),
      entry(28, '魂に刻まれた'),
      entry(29, '竜狩りの騎士'),
      entry(30, '聖女の手を引いた騎士'),
    ];
    expect(linkManualChapters(chapters, entries)).toEqual([
      { chapterId: 'b', url: 'https://s.test/28.html' },
      { chapterId: 'd', url: 'https://s.test/30.html' },
      { chapterId: 'c', url: 'https://s.test/29.html' },
    ]);
  });

  it('夹心区间内章节数与未占用条目数不一致时不猜测', () => {
    const chapters = [
      ch('a', 'A', 'https://s.test/1.html'),
      ch('x', '改名一'),
      ch('b', 'D', 'https://s.test/4.html'),
    ];
    const entries = [entry(1, 'A'), entry(2, 'B'), entry(3, 'C'), entry(4, 'D')];
    expect(linkManualChapters(chapters, entries)).toEqual([]);
  });

  it('区间一端没有已关联章节时不按位置关联', () => {
    const chapters = [ch('a', 'A', 'https://s.test/1.html'), ch('x', '改名')];
    expect(linkManualChapters(chapters, [entry(1, 'A'), entry(2, 'B')])).toEqual([]);
  });
});

describe('检查会话关联手动添加的章节', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('无网址章节按标题关联后不再作为新章节，并写回网址', async () => {
    vi.stubGlobal('navigator', { locks: webLocksFixture() });
    const book = syncBook(2);
    delete book.volumes![0]!.chapters![1]!.webUrl;
    await saveSyncBook(book);
    vi.spyOn(transport, 'fetchScraperPage').mockImplementation((url) =>
      Promise.resolve(
        syncSnapshot(url === syncRoot ? syncCatalogHtml(2) : '<article>旧正文</article>', url),
      ),
    );

    const session = await BookSyncService.openSession({ target: { bookId: 'book' } });
    const result = await session.quickCheck();

    expect(result.new).toEqual([]);
    expect(result.unchecked).toContain('https://example.com/2');
    const read = await ImportLibraryReader.readBook('book');
    if (read.kind !== 'loaded') throw new Error('读取失败');
    expect(read.book.volumes?.[0]?.chapters?.[1]?.webUrl).toBe('https://example.com/2');
  });
});
