import './setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChapterContentService } from 'src/services/chapter-content-service';
import { createAgentMcpKernel } from 'src/services/agent-mcp/kernel';
import { agentMcpLibraryTools } from 'src/services/agent-mcp/tools/library';
import { NovelScraperFactory, type NovelScraper } from 'src/services/scraper';
import { useBooksStore } from 'src/stores/books';
import { useContextStore } from 'src/stores/context';
import { useSettingsStore } from 'src/stores/settings';

const CATALOG = 'https://ncode.syosetu.com/n1234ab/';
const INTERNAL = 'http://127.0.0.1:8080/admin';

describe('外部工具写入与抓取的网址限制', () => {
  let kernel: ReturnType<typeof createAgentMcpKernel>;
  const call = (name: string, args: Record<string, unknown>) =>
    kernel.callTool(name, args, { channel: 'desktop-mcp' });

  beforeEach(async () => {
    await useSettingsStore().loadSettings();
    await useSettingsStore().updateAgentMcpSettings({ permissionMode: 'translate_and_edit' });
    await useBooksStore().loadBooks();
    useContextStore().setCurrentBook(null);
    kernel = createAgentMcpKernel({ tools: agentMcpLibraryTools });
  });
  afterEach(() => vi.restoreAllMocks());

  it('来源网址只接受 http / https：界面会把它渲染成链接', async () => {
    const bad = await call('create_book', { title: '坏链接', web_url: 'javascript:alert(1)' });
    expect(bad.errorCode).toBe('INVALID_ARGS');

    const created = await call('create_book', { title: '好链接', web_url: CATALOG });
    expect(created.isError).toBe(false);
    const bookId = (created.data as { book_id: string }).book_id;
    for (const web_url of ['javascript:alert(1)', 'file:///etc/passwd', 'not a url']) {
      const res = await call('add_chapters', {
        book_id: bookId,
        chapters: [{ title: '第一章', text: '正文', web_url }],
      });
      expect(res.errorCode).toBe('INVALID_ARGS');
    }
    expect(useBooksStore().getBookById(bookId)?.volumes ?? []).toEqual([]);
  });

  it('正文为空的章节没有段落，仍算「空章节」', async () => {
    const created = await call('create_book', {
      title: '空章节',
      chapters: [{ title: '第一章', text: '' }],
    });
    const book = useBooksStore().getBookById((created.data as { book_id: string }).book_id)!;
    const chapterId = book.volumes![0]!.chapters![0]!.id;
    expect((await ChapterContentService.loadChapterContent(chapterId)) ?? []).toEqual([]);
  });

  it('从网址导入时只抓取该站点的章节网址：章节上写着的其他网址不会被请求', async () => {
    // 先放进一个正文为空、网址指向内网的章节，并让这本书能被导入流程按目录网址认出来
    const created = await call('create_book', {
      title: '被动过手脚的书',
      web_url: CATALOG,
      chapters: [{ title: '内网', text: '', web_url: INTERNAL }],
    });
    expect(created.isError).toBe(false);
    const bookId = (created.data as { book_id: string }).book_id;

    const fetchChapterContent = vi.fn((url: string) => Promise.resolve(`正文 ${url}`));
    vi.spyOn(NovelScraperFactory, 'getScraper').mockReturnValue({
      isValidUrl: (url: string) => url.startsWith('https://ncode.syosetu.com/'),
      catalogUrl: () => CATALOG,
      fetchNovel: () =>
        Promise.resolve({
          success: true,
          novel: {
            id: 'scraped',
            title: '站点上的书',
            webUrl: [CATALOG],
            volumes: [
              {
                id: 'v',
                title: {
                  original: '正文',
                  translation: { id: 'vt', translation: '', aiModelId: '' },
                },
                chapters: [
                  {
                    id: 'c1',
                    title: {
                      original: '第一話',
                      translation: { id: 'ct', translation: '', aiModelId: '' },
                    },
                    webUrl: `${CATALOG}1/`,
                    createdAt: new Date(),
                    lastEdited: new Date(),
                  },
                ],
              },
            ],
            createdAt: new Date(),
            lastEdited: new Date(),
          },
        }),
      fetchChapterContent,
    } as unknown as NovelScraper);

    const res = await call('import_book_from_url', { url: CATALOG });
    expect(res.isError).toBe(false);
    const data = res.data as {
      book_id: string;
      fetched_chapter_count: number;
      pending_chapter_count: number;
      ignored_chapters?: Array<{ url: string }>;
    };
    expect(data.book_id).toBe(bookId);
    expect(fetchChapterContent.mock.calls.map(([url]) => url)).toEqual([`${CATALOG}1/`]);
    expect(data.fetched_chapter_count).toBe(1);
    // 被忽略的章节如实报告，但不算「待抓取」，不会让 Agent 反复重试
    expect(data.ignored_chapters?.map((ch) => ch.url)).toEqual([INTERNAL]);
    expect(data.pending_chapter_count).toBe(0);
  });

  it('get_book 统计进度时分批读取正文，不逐章单独读取', async () => {
    const created = await call('create_book', {
      title: '统计',
      chapters: [
        { title: '1话', paragraphs: ['a', '', 'b'] },
        { title: '2话', paragraphs: ['c'] },
        { title: '3话', paragraphs: ['d'] },
      ],
    });
    const bookId = (created.data as { book_id: string }).book_id;
    // 与真实使用一致：章节正文不在内存里
    await useBooksStore().refreshBookFromStorage(bookId);
    const single = vi.spyOn(ChapterContentService, 'loadChapterContent');
    const batch = vi.spyOn(ChapterContentService, 'loadChapterContentsBatch');

    const res = await call('get_book', { book_id: bookId });
    const chapters = (
      res.data as { volumes: Array<{ chapters: Array<{ paragraph_count: number }> }> }
    ).volumes[0]!.chapters;
    expect(chapters.map((ch) => ch.paragraph_count)).toEqual([2, 1, 1]);
    expect(single).not.toHaveBeenCalled();
    expect(batch).toHaveBeenCalledTimes(1);
  });
});
