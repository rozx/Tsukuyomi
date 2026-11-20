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

  it('导入新书时部分章节已保存、后面的写入失败：保留这本书并带回 book_id，不删掉已保存的正文', async () => {
    const scrapedChapter = (id: string, n: number) => ({
      id,
      title: {
        original: `第${n}話`,
        translation: { id: `t-${id}`, translation: '', aiModelId: '' },
      },
      webUrl: `${CATALOG}${n}/`,
      createdAt: new Date(),
      lastEdited: new Date(),
    });
    vi.spyOn(NovelScraperFactory, 'getScraper').mockReturnValue({
      isValidUrl: () => true,
      catalogUrl: () => CATALOG,
      fetchNovel: () =>
        Promise.resolve({
          success: true,
          novel: {
            id: 'partial-book',
            title: '写到一半失败的书',
            webUrl: [CATALOG],
            volumes: [
              {
                id: 'v',
                title: {
                  original: '正文',
                  translation: { id: 'vt', translation: '', aiModelId: '' },
                },
                chapters: [scrapedChapter('pc1', 1), scrapedChapter('pc2', 2)],
              },
            ],
            createdAt: new Date(),
            lastEdited: new Date(),
          },
        }),
      fetchChapterContent: (url: string) => Promise.resolve(`正文 ${url}`),
    } as unknown as NovelScraper);
    // 第一章写入成功，第二章写入失败（例如存储空间用尽）
    const realSave = ChapterContentService.saveChapterContent.bind(ChapterContentService);
    let saves = 0;
    vi.spyOn(ChapterContentService, 'saveChapterContent').mockImplementation((...args) => {
      saves += 1;
      return saves === 1 ? realSave(...args) : Promise.reject(new Error('QuotaExceededError'));
    });

    const res = await call('import_book_from_url', { url: CATALOG });
    expect(res.isError).toBe(true);
    expect(res.errorCode).toBe('URL_IMPORT_FAILED');
    // 错误里带回 book_id，Agent 可以接着补剩下的章节
    expect(res.text).toContain('partial-book');
    expect(useBooksStore().getBookById('partial-book')).toBeDefined();
    const kept = await Promise.all(
      ['pc1', 'pc2'].map((id) => ChapterContentService.loadChapterContent(id)),
    );
    expect(kept.filter((content) => content && content.length > 0)).toHaveLength(1);
  });

  it('书已经在书库里、合并目录时写入失败：错误里仍带回这本书的 book_id，不会引导 Agent 再建一本', async () => {
    const created = await call('create_book', { title: '已有的书', web_url: CATALOG });
    const bookId = (created.data as { book_id: string }).book_id;
    vi.spyOn(NovelScraperFactory, 'getScraper').mockReturnValue({
      isValidUrl: () => true,
      catalogUrl: () => CATALOG,
      fetchNovel: () =>
        Promise.resolve({
          success: true,
          novel: {
            id: 'scraped-other-id',
            title: '站点上的书',
            webUrl: [CATALOG],
            volumes: [],
            createdAt: new Date(),
            lastEdited: new Date(),
          },
        }),
      fetchChapterContent: () => Promise.resolve('正文'),
    } as unknown as NovelScraper);
    vi.spyOn(useBooksStore(), 'updateBook').mockRejectedValueOnce(new Error('QuotaExceededError'));

    const res = await call('import_book_from_url', { url: CATALOG });
    expect(res.isError).toBe(true);
    expect(res.text).toContain(bookId);
    expect(res.errorMessage).not.toContain('create_book');
  });

  it('用户正打开的章节被导入补齐正文后，书库里这一章的正文已经加载，阅读区能立刻显示', async () => {
    const scraped = {
      id: 'open-book',
      title: '正在看的书',
      webUrl: [CATALOG],
      volumes: [
        {
          id: 'v',
          title: { original: '正文', translation: { id: 'vt', translation: '', aiModelId: '' } },
          chapters: [
            {
              id: 'open-ch',
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
    };
    let chapterReady = false;
    vi.spyOn(NovelScraperFactory, 'getScraper').mockReturnValue({
      isValidUrl: () => true,
      catalogUrl: () => CATALOG,
      fetchNovel: () => Promise.resolve({ success: true, novel: scraped }),
      // 第一次导入时章节正文还抓不到，只建好目录
      fetchChapterContent: () =>
        chapterReady ? Promise.resolve('一行目。\n二行目。') : Promise.reject(new Error('503')),
    } as unknown as NovelScraper);
    await call('import_book_from_url', { url: CATALOG });
    // 目录建好但没有正文时，第一次导入会回滚新书；这里直接放入一本只有目录的书
    if (!useBooksStore().getBookById('open-book')) await useBooksStore().addBook(scraped);

    // 用户打开了这一章（此时没有正文）
    useContextStore().setCurrentBook('open-book');
    useContextStore().setCurrentChapter('open-ch');
    chapterReady = true;
    const res = await call('import_book_from_url', { url: CATALOG });
    expect(res.isError).toBe(false);

    const chapter = useBooksStore().getBookById('open-book')!.volumes![0]!.chapters![0]!;
    expect(chapter.content?.map((p) => p.text)).toEqual(['一行目。', '二行目。']);
    useContextStore().setCurrentBook(null);
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
