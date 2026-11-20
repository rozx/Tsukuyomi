import './setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useBooksStore } from 'src/stores/books';
import { useBookDetailsStore } from 'src/stores/book-details';
import { useContextStore } from 'src/stores/context';
import { useSettingsStore } from 'src/stores/settings';
import { NovelScraperFactory, type NovelScraper } from 'src/services/scraper';
import { ChapterContentService } from 'src/services/chapter-content-service';
import { createAgentMcpKernel } from 'src/services/agent-mcp/kernel';
import { agentMcpContextTools } from 'src/services/agent-mcp/tools/context';
import { agentMcpLibraryTools } from 'src/services/agent-mcp/tools/library';
import { agentMcpTranslationTools } from 'src/services/agent-mcp/tools/translation';

describe('AgentMcp context & library tools', () => {
  beforeEach(async () => {
    await useSettingsStore().loadSettings();
    await useBooksStore().loadBooks();
    useContextStore().setCurrentBook(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('get_app_context 与 navigate_to 能读取状态并触发路由跳转', async () => {
    const navigated: string[] = [];
    const kernel = createAgentMcpKernel({
      tools: [...agentMcpContextTools, ...agentMcpLibraryTools],
      navigate: (path) => {
        navigated.push(path);
      },
    });

    const createRes = await kernel.callTool(
      'create_book',
      { title: '月下旅人', author: '作者A', target_language: 'zh-CN' },
      { channel: 'desktop-mcp' },
    );
    expect(createRes.isError).toBe(false);
    const createdBookId = (createRes.data as { book_id: string }).book_id;

    useContextStore().setCurrentBook(createdBookId);
    const ctxRes = await kernel.callTool('get_app_context', {}, { channel: 'desktop-mcp' });
    expect(ctxRes.isError).toBe(false);
    expect((ctxRes.data as { current_book_id: string }).current_book_id).toBe(createdBookId);

    const navRes = await kernel.callTool(
      'navigate_to',
      { target: 'book', book_id: createdBookId },
      { channel: 'desktop-mcp' },
    );
    expect(navRes.isError).toBe(false);
    expect(navigated).toEqual([`/books/${createdBookId}`]);

    // 添加章节后验证 chapter / paragraph 导航同步更新 bookDetailsStore（供 BookDetailsPage 实际打开并滚动）
    const addRes = await kernel.callTool(
      'add_chapters',
      {
        book_id: createdBookId,
        chapters: [{ title: '第一章', paragraphs: ['第一段', '第二段'] }],
      },
      { channel: 'desktop-mcp' },
    );
    const chapterId = (addRes.data as { chapters: Array<{ chapter_id: string }> }).chapters[0]!
      .chapter_id;
    const paragraphs = (await ChapterContentService.loadChapterContent(chapterId))!;
    const secondParagraphId = paragraphs[1]!.id;

    const navChRes = await kernel.callTool(
      'navigate_to',
      { target: 'chapter', book_id: createdBookId, chapter_id: chapterId },
      { channel: 'desktop-mcp' },
    );
    expect(navChRes.isError).toBe(false);
    expect(useBookDetailsStore().getSelectedChapter(createdBookId)).toBe(chapterId);

    const navParaRes = await kernel.callTool(
      'navigate_to',
      {
        target: 'paragraph',
        book_id: createdBookId,
        chapter_id: chapterId,
        paragraph_id: secondParagraphId,
      },
      { channel: 'desktop-mcp' },
    );
    expect(navParaRes.isError).toBe(false);
    expect(useBookDetailsStore().pendingParagraphTarget).toEqual({
      bookId: createdBookId,
      chapterId,
      paragraphId: secondParagraphId,
    });

    // 导航到 target='book' 应清除残留的段落定位目标
    const navBookAgain = await kernel.callTool(
      'navigate_to',
      { target: 'book', book_id: createdBookId },
      { channel: 'desktop-mcp' },
    );
    expect(navBookAgain.isError).toBe(false);
    expect(useBookDetailsStore().pendingParagraphTarget).toBeNull();
  });

  it('create_book 与 add_chapters 支持纯文本分段与段落数组并立即反映到书库 Store', async () => {
    const kernel = createAgentMcpKernel({
      tools: [...agentMcpContextTools, ...agentMcpLibraryTools],
    });

    const createRes = await kernel.callTool(
      'create_book',
      {
        title: '星海异闻',
        author: '测试作者',
        description: '简介',
        tags: ['奇幻'],
        target_language: 'zh-CN',
      },
      { channel: 'desktop-mcp' },
    );
    expect(createRes.isError).toBe(false);
    const bookId = (createRes.data as { book_id: string }).book_id;

    const addRes = await kernel.callTool(
      'add_chapters',
      {
        book_id: bookId,
        volume_title: '第一卷',
        chapters: [
          { title: '第一章 序幕', text: '第一段原文。\n\n第二段原文。' },
          { title: '第二章 启程', paragraphs: ['段落甲', '段落乙', '段落丙'] },
        ],
      },
      { channel: 'desktop-mcp' },
    );
    expect(addRes.isError).toBe(false);
    const addData = addRes.data as {
      volume_id: string;
      chapters: Array<{ chapter_id: string; paragraph_count: number }>;
    };
    expect(addData.chapters).toHaveLength(2);
    // 与站内导入一致：每一行是一个段落，空行也算
    expect(addData.chapters[0]?.paragraph_count).toBe(3);
    expect(addData.chapters[1]?.paragraph_count).toBe(3);

    const bookInStore = useBooksStore().getBookById(bookId);
    expect(bookInStore?.title).toBe('星海异闻');
    expect(bookInStore?.volumes?.[0]?.chapters).toHaveLength(2);

    const ch1Content = await ChapterContentService.loadChapterContent(
      addData.chapters[0]!.chapter_id,
    );
    expect(ch1Content?.map((p) => p.text)).toEqual(['第一段原文。', '', '第二段原文。']);

    const listRes = await kernel.callTool('list_books', {}, { channel: 'desktop-mcp' });
    expect(listRes.isError).toBe(false);
    expect((listRes.data as { books: Array<{ id: string }> }).books.map((b) => b.id)).toContain(
      bookId,
    );

    const getRes = await kernel.callTool(
      'get_book',
      { book_id: bookId },
      { channel: 'desktop-mcp' },
    );
    expect(getRes.isError).toBe(false);
    expect((getRes.data as { chapter_count: number }).chapter_count).toBe(2);
  });

  it('加章的分段规则与站内导入一致：每一行一个段落，空行、缩进与行尾空白原样保留', async () => {
    const kernel = createAgentMcpKernel({
      tools: [...agentMcpContextTools, ...agentMcpLibraryTools],
    });
    const created = await kernel.callTool(
      'create_book',
      {
        title: '分段测试',
        // 建书时带的初始章节走同一套规则
        chapters: [{ title: '序', text: '\u3000序章の一行目。\r\n\r\n二行目。 ' }],
      },
      { channel: 'desktop-mcp' },
    );
    const bookId = (created.data as { book_id: string }).book_id;
    const firstChapterId = useBooksStore().getBookById(bookId)!.volumes![0]!.chapters![0]!.id;
    const first = await ChapterContentService.loadChapterContent(firstChapterId);
    // Windows 换行按一行处理；行首的全角空格缩进与行尾空白都不动
    expect(first?.map((p) => p.text)).toEqual(['\u3000序章の一行目。', '', '二行目。 ']);

    const added = await kernel.callTool(
      'add_chapters',
      {
        book_id: bookId,
        chapters: [
          { title: '文本', text: '一。\n\n\n二。\n' },
          { title: '数组', paragraphs: ['\u3000甲', '', '乙'] },
        ],
      },
      { channel: 'desktop-mcp' },
    );
    const chapters = (added.data as { chapters: Array<{ chapter_id: string }> }).chapters;
    const text = await ChapterContentService.loadChapterContent(chapters[0]!.chapter_id);
    expect(text?.map((p) => p.text)).toEqual(['一。', '', '', '二。', '']);
    const array = await ChapterContentService.loadChapterContent(chapters[1]!.chapter_id);
    expect(array?.map((p) => p.text)).toEqual(['\u3000甲', '', '乙']);
    // 段落 ID 各不相同
    const ids = [...(text ?? []), ...(array ?? [])].map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('import_book_from_url 对不支持站点与抓取失败均返回降级指引，支持站点则落盘', async () => {
    const kernel = createAgentMcpKernel({
      tools: [...agentMcpContextTools, ...agentMcpLibraryTools],
    });

    // 1. 不支持的站点
    vi.spyOn(NovelScraperFactory, 'getScraper').mockReturnValueOnce(null);
    const unsupported = await kernel.callTool(
      'import_book_from_url',
      { url: 'https://unknown-site.example/novel/1' },
      { channel: 'webmcp' },
    );
    expect(unsupported.isError).toBe(true);
    expect(unsupported.errorCode).toBe('UNSUPPORTED_SITE');
    expect(unsupported.errorMessage).toContain('create_book');
    expect(unsupported.errorMessage).toContain('add_chapters');

    // 2. 支持站点但抓取失败（如 Web CORS）
    vi.spyOn(NovelScraperFactory, 'getScraper').mockReturnValueOnce({
      isValidUrl: () => true,
      catalogUrl: (u: string) => u,
      fetchNovel: () => Promise.resolve({ success: false, error: 'CORS blocked' }),
      fetchChapterContent: () => Promise.resolve(''),
    } as unknown as NovelScraper);
    const failed = await kernel.callTool(
      'import_book_from_url',
      { url: 'https://ncode.syosetu.com/n1234ab/' },
      { channel: 'webmcp' },
    );
    expect(failed.isError).toBe(true);
    expect(failed.errorCode).toBe('URL_IMPORT_FAILED');
    expect(failed.errorMessage).toContain('add_chapters');

    // 3. 抓取成功拉取目录与章节正文并写入书库，可直接进入 get_translation_chunk 翻译闭环
  });

  it('import_book_from_url 抓取正文后可直接翻译，重复导入按 webUrl 原地增量更新并保留用户元数据与旧译文', async () => {
    vi.spyOn(NovelScraperFactory, 'getScraper').mockReturnValueOnce({
      isValidUrl: () => true,
      catalogUrl: () => 'https://ncode.syosetu.com/n1234ab/',
      fetchNovel: () =>
        Promise.resolve({
          success: true,
          novel: {
            id: 'scraped-uuid-1',
            title: '爬虫导入小说',
            author: '站内作者',
            webUrl: ['https://ncode.syosetu.com/n1234ab/'],
            volumes: [
              {
                id: 'v-scraped-1',
                title: {
                  original: '正文',
                  translation: { id: 'vt1', translation: '', aiModelId: '' },
                },
                chapters: [
                  {
                    id: 'ch-scraped-1',
                    title: {
                      original: '第一話',
                      translation: { id: 'ct1', translation: '', aiModelId: '' },
                    },
                    webUrl: 'https://ncode.syosetu.com/n1234ab/1/',
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
      fetchChapterContent: (chapterUrl: string) =>
        Promise.resolve(chapterUrl.endsWith('/1/') ? '第一話の最初の段落。\n\n二番目の段落。' : ''),
    } as unknown as NovelScraper);

    const fullKernel = createAgentMcpKernel({
      tools: [...agentMcpContextTools, ...agentMcpLibraryTools, ...agentMcpTranslationTools],
    });
    const ok = await fullKernel.callTool(
      'import_book_from_url',
      { url: 'https://ncode.syosetu.com/n1234ab/' },
      { channel: 'desktop-mcp' },
    );
    expect(ok.isError).toBe(false);
    const importData = ok.data as {
      book_id: string;
      updated_existing: boolean;
      chapter_count: number;
      fetched_chapter_count: number;
      fetched_chapters: Array<{ chapter_id: string; volume_id: string; title_original: string }>;
    };
    expect(importData.book_id).toBe('scraped-uuid-1');
    expect(importData.updated_existing).toBe(false);
    expect(importData.fetched_chapter_count).toBe(1);
    // 直接带回抓到正文的章节 ID，不必再读整本目录
    expect(importData.fetched_chapters.map((ch) => ch.chapter_id)).toEqual(['ch-scraped-1']);
    expect(importData.fetched_chapters[0]?.volume_id).toBeTruthy();

    // 立即调用 get_translation_chunk 应能读到抓取的段落而非空章
    const chunkRes = await fullKernel.callTool(
      'get_translation_chunk',
      { book_id: 'scraped-uuid-1', chapter_id: 'ch-scraped-1', mode: 'untranslated' },
      { channel: 'desktop-mcp' },
    );
    expect(chunkRes.isError).toBe(false);
    expect((chunkRes.data as { completed: boolean }).completed).toBe(false);
    expect(
      (chunkRes.data as { paragraphs: Array<{ text: string }> }).paragraphs.map((p) => p.text),
    ).toEqual(['第一話の最初の段落。', '二番目の段落。']);

    // 4. 重复导入相同 URL（即使 scraper 生成全新 UUID）应按 webUrl 匹配已有书并原地增量更新，保留用户书名/作者与旧章译文
    await useBooksStore().updateBook('scraped-uuid-1', {
      title: '用户自定义书名',
      author: '用户自定义作者',
      description: '用户自定义简介',
    });
    const firstParaId = (chunkRes.data as { paragraphs: Array<{ id: string }> }).paragraphs[0]!.id;
    await fullKernel.callTool(
      'submit_translations',
      {
        book_id: 'scraped-uuid-1',
        chapter_id: 'ch-scraped-1',
        paragraphs: [{ paragraph_id: firstParaId, translated_text: '第一话第一段译文。' }],
      },
      { channel: 'desktop-mcp' },
    );

    vi.spyOn(NovelScraperFactory, 'getScraper').mockReturnValueOnce({
      isValidUrl: () => true,
      catalogUrl: () => 'https://ncode.syosetu.com/n1234ab/',
      fetchNovel: () =>
        Promise.resolve({
          success: true,
          novel: {
            id: 'scraped-uuid-2-new-random',
            title: '爬虫导入小说（站点改名）',
            author: '站点作者新名',
            description: '站点新简介',
            webUrl: ['https://ncode.syosetu.com/n1234ab/'],
            volumes: [
              {
                id: 'v-scraped-new',
                title: {
                  original: '正文',
                  translation: { id: 'vt2', translation: '', aiModelId: '' },
                },
                chapters: [
                  {
                    id: 'ch-scraped-1-dup',
                    title: {
                      original: '第一話',
                      translation: { id: 'ct2', translation: '', aiModelId: '' },
                    },
                    webUrl: 'https://ncode.syosetu.com/n1234ab/1/',
                    createdAt: new Date(),
                    lastEdited: new Date(),
                  },
                  {
                    id: 'ch-scraped-2',
                    title: {
                      original: '第二話',
                      translation: { id: 'ct3', translation: '', aiModelId: '' },
                    },
                    webUrl: 'https://ncode.syosetu.com/n1234ab/2/',
                    createdAt: new Date(),
                    lastEdited: new Date(),
                  },
                  {
                    id: 'ch-scraped-3',
                    title: {
                      original: '第三話',
                      translation: { id: 'ct4', translation: '', aiModelId: '' },
                    },
                    webUrl: 'https://ncode.syosetu.com/n1234ab/3/',
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
      fetchChapterContent: (chapterUrl: string) =>
        Promise.resolve(
          chapterUrl.endsWith('/2/')
            ? '第二話の本文。'
            : chapterUrl.endsWith('/3/')
              ? '第三話の本文。'
              : 'SHOULD NOT OVERWRITE',
        ),
    } as unknown as NovelScraper);

    const booksBeforeUpdate = useBooksStore().books.length;
    const updateRes = await fullKernel.callTool(
      'import_book_from_url',
      { url: 'https://ncode.syosetu.com/n1234ab', max_chapters: 1 },
      { channel: 'desktop-mcp' },
    );
    expect(updateRes.isError).toBe(false);
    const updateData = updateRes.data as {
      book_id: string;
      updated_existing: boolean;
      added_chapter_count: number;
      chapter_count: number;
      pending_chapter_count: number;
    };
    expect(updateData.book_id).toBe('scraped-uuid-1');
    expect(updateData.updated_existing).toBe(true);
    expect(updateData.added_chapter_count).toBe(2);
    expect(updateData.chapter_count).toBe(3);
    expect(updateData.pending_chapter_count).toBe(1);
    expect(useBooksStore().books.length).toBe(booksBeforeUpdate);

    // 用户手改的书名/作者/简介不得被站点数据冲掉
    const bookAfterUpdate = useBooksStore().getBookById('scraped-uuid-1')!;
    expect(bookAfterUpdate.title).toBe('用户自定义书名');
    expect(bookAfterUpdate.author).toBe('用户自定义作者');
    expect(bookAfterUpdate.description).toBe('用户自定义简介');

    // 原第一话译文完整保留，新第二话正文已落盘，第三话待下次增量拉取
    const ch1After = (await ChapterContentService.loadChapterContent('ch-scraped-1'))!;
    expect(ch1After[0]?.translations[0]?.translation).toBe('第一话第一段译文。');
    const ch2After = (await ChapterContentService.loadChapterContent('ch-scraped-2'))!;
    expect(ch2After.map((p) => p.text)).toEqual(['第二話の本文。']);
  });

  it('import_book_from_url 默认按上限分批抓取，互斥拦截重叠调用，且并发新增章节不会被覆盖或误删', async () => {
    const kernel = createAgentMcpKernel({
      tools: [...agentMcpContextTools, ...agentMcpLibraryTools],
    });

    // 1. 重叠调用同一 URL 时立即返回 IMPORT_IN_PROGRESS；且抓取期间通过 add_chapters 新增的章节不得丢失
    let releaseChapter1!: (text: string) => void;
    const ch1FetchStarted = new Promise<void>((resolve) => {
      vi.spyOn(NovelScraperFactory, 'getScraper').mockReturnValue({
        isValidUrl: () => true,
        catalogUrl: () => 'https://ncode.syosetu.com/n9999zz/',
        fetchNovel: () =>
          Promise.resolve({
            success: true,
            novel: {
              id: 'scraped-overlap-1',
              title: '并发安全测试书',
              webUrl: ['https://ncode.syosetu.com/n9999zz/'],
              volumes: [
                {
                  id: 'v-ov-1',
                  title: {
                    original: '正文',
                    translation: { id: 'vt-ov', translation: '', aiModelId: '' },
                  },
                  chapters: [
                    {
                      id: 'ch-ov-1',
                      title: {
                        original: '第一話',
                        translation: { id: 'ct-ov1', translation: '', aiModelId: '' },
                      },
                      webUrl: 'https://ncode.syosetu.com/n9999zz/1/',
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
        fetchChapterContent: () =>
          new Promise<string>((res) => {
            releaseChapter1 = res;
            resolve();
          }),
      } as unknown as NovelScraper);
    });

    const firstImportPromise = kernel.callTool(
      'import_book_from_url',
      { url: 'https://ncode.syosetu.com/n9999zz/' },
      { channel: 'desktop-mcp' },
    );
    await ch1FetchStarted;

    // 重叠调用必须立即被互斥拒绝
    const overlapping = await kernel.callTool(
      'import_book_from_url',
      { url: 'https://ncode.syosetu.com/n9999zz' },
      { channel: 'desktop-mcp' },
    );
    expect(overlapping.isError).toBe(true);
    expect(overlapping.errorCode).toBe('IMPORT_IN_PROGRESS');

    // 在抓取期间通过 add_chapters 向同一本书追加一个手动章节
    const extraRes = await kernel.callTool(
      'add_chapters',
      {
        book_id: 'scraped-overlap-1',
        chapters: [{ title: '番外 手动追加', paragraphs: ['番外正文'] }],
      },
      { channel: 'desktop-mcp' },
    );
    expect(extraRes.isError).toBe(false);
    const extraChapterId = (extraRes.data as { chapters: Array<{ chapter_id: string }> })
      .chapters[0]!.chapter_id;

    // 放行首次抓取
    releaseChapter1('第一話の本文内容。');
    const firstImportRes = await firstImportPromise;
    expect(firstImportRes.isError).toBe(false);

    // 两个章节与各自正文都必须完好存在，不能因为旧 volumes 快照被清理掉
    const bookAfter = useBooksStore().getBookById('scraped-overlap-1')!;
    const allChapterIds = (bookAfter.volumes ?? []).flatMap((v) =>
      (v.chapters ?? []).map((c) => c.id),
    );
    expect(allChapterIds).toContain('ch-ov-1');
    expect(allChapterIds).toContain(extraChapterId);
    expect((await ChapterContentService.loadChapterContent('ch-ov-1'))?.map((p) => p.text)).toEqual(
      ['第一話の本文内容。'],
    );
    expect(
      (await ChapterContentService.loadChapterContent(extraChapterId))?.map((p) => p.text),
    ).toEqual(['番外正文']);

    // 2. 超过默认每批上限（20 章）时，未传 max_chapters 自动限批并返回 pending_chapter_count
    const manyChapters = Array.from({ length: 25 }, (_, i) => ({
      id: `ch-many-${i + 1}`,
      title: {
        original: `第${i + 1}話`,
        translation: { id: `ct-m-${i + 1}`, translation: '', aiModelId: '' },
      },
      webUrl: `https://ncode.syosetu.com/n8888yy/${i + 1}/`,
      createdAt: new Date(),
      lastEdited: new Date(),
    }));
    vi.spyOn(NovelScraperFactory, 'getScraper').mockReturnValueOnce({
      isValidUrl: () => true,
      catalogUrl: () => 'https://ncode.syosetu.com/n8888yy/',
      fetchNovel: () =>
        Promise.resolve({
          success: true,
          novel: {
            id: 'scraped-many-1',
            title: '长篇测试书',
            webUrl: ['https://ncode.syosetu.com/n8888yy/'],
            volumes: [
              {
                id: 'v-many-1',
                title: {
                  original: '正文',
                  translation: { id: 'vt-m', translation: '', aiModelId: '' },
                },
                chapters: manyChapters,
              },
            ],
            createdAt: new Date(),
            lastEdited: new Date(),
          },
        }),
      fetchChapterContent: (u: string) => Promise.resolve(`内容 ${u}`),
    } as unknown as NovelScraper);

    const manyRes = await kernel.callTool(
      'import_book_from_url',
      { url: 'https://ncode.syosetu.com/n8888yy/' },
      { channel: 'desktop-mcp' },
    );
    expect(manyRes.isError).toBe(false);
    const manyData = manyRes.data as {
      fetched_chapter_count: number;
      pending_chapter_count: number;
      has_more: boolean;
    };
    expect(manyData.fetched_chapter_count).toBe(20);
    expect(manyData.pending_chapter_count).toBe(5);
    expect(manyData.has_more).toBe(true);
  });

  it('import_book_from_url 抓取期间书被删除时不写孤儿章节，建壳后抛异常时回滚空壳书', async () => {
    const kernel = createAgentMcpKernel({
      tools: [...agentMcpContextTools, ...agentMcpLibraryTools],
    });

    // 1. 抓取期间书被删除：不得把已抓到的段落写入孤儿 chapter-contents 记录，且返回 BOOK_NOT_FOUND
    let releaseDel!: (text: string) => void;
    const delFetchStarted = new Promise<void>((resolve) => {
      vi.spyOn(NovelScraperFactory, 'getScraper').mockReturnValueOnce({
        isValidUrl: () => true,
        catalogUrl: () => 'https://ncode.syosetu.com/n7777del/',
        fetchNovel: () =>
          Promise.resolve({
            success: true,
            novel: {
              id: 'scraped-deleted-midway',
              title: '中途删除测试书',
              webUrl: ['https://ncode.syosetu.com/n7777del/'],
              volumes: [
                {
                  id: 'v-del',
                  title: {
                    original: '正文',
                    translation: { id: 'vt-d', translation: '', aiModelId: '' },
                  },
                  chapters: [
                    {
                      id: 'ch-orphan-check',
                      title: {
                        original: '第一話',
                        translation: { id: 'ct-d', translation: '', aiModelId: '' },
                      },
                      webUrl: 'https://ncode.syosetu.com/n7777del/1/',
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
        fetchChapterContent: () =>
          new Promise<string>((res) => {
            releaseDel = res;
            resolve();
          }),
      } as unknown as NovelScraper);
    });

    const importPromise = kernel.callTool(
      'import_book_from_url',
      { url: 'https://ncode.syosetu.com/n7777del/' },
      { channel: 'desktop-mcp' },
    );
    await delFetchStarted;

    // 中途删除该书
    await useBooksStore().deleteBook('scraped-deleted-midway');
    releaseDel('不应落盘的孤儿段落');

    const delRes = await importPromise;
    expect(delRes.isError).toBe(true);
    expect(delRes.errorCode).toBe('BOOK_NOT_FOUND');
    expect(await ChapterContentService.loadChapterContent('ch-orphan-check')).toBeUndefined();

    // 2. 新书目录壳落盘后，若后续存储阶段意外抛异常，必须回滚删除空壳书
    vi.spyOn(NovelScraperFactory, 'getScraper').mockReturnValueOnce({
      isValidUrl: () => true,
      catalogUrl: () => 'https://ncode.syosetu.com/n6666err/',
      fetchNovel: () =>
        Promise.resolve({
          success: true,
          novel: {
            id: 'scraped-rollback-shell',
            title: '异常回滚测试书',
            webUrl: ['https://ncode.syosetu.com/n6666err/'],
            volumes: [
              {
                id: 'v-err',
                title: {
                  original: '正文',
                  translation: { id: 'vt-e', translation: '', aiModelId: '' },
                },
                chapters: [
                  {
                    id: 'ch-err-1',
                    title: {
                      original: '第一話',
                      translation: { id: 'ct-e', translation: '', aiModelId: '' },
                    },
                    webUrl: 'https://ncode.syosetu.com/n6666err/1/',
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
      fetchChapterContent: () => Promise.resolve('正常抓到的内容'),
    } as unknown as NovelScraper);

    vi.spyOn(ChapterContentService, 'saveChapterContent').mockRejectedValueOnce(
      new Error('Simulated IndexedDB write failure'),
    );

    const errRes = await kernel.callTool(
      'import_book_from_url',
      { url: 'https://ncode.syosetu.com/n6666err/' },
      { channel: 'desktop-mcp' },
    );
    expect(errRes.isError).toBe(true);
    expect(errRes.errorCode).toBe('URL_IMPORT_FAILED');
    expect(useBooksStore().getBookById('scraped-rollback-shell')).toBeUndefined();
  });

  /** 构造仅含一卷、若干带 webUrl 空章节的抓取结果 */
  const scrapedCatalog = (bookId: string, base: string, chapterIds: string[]) => ({
    success: true,
    novel: {
      id: bookId,
      title: `测试书 ${bookId}`,
      webUrl: [base],
      volumes: [
        {
          id: `v-${bookId}`,
          title: {
            original: '正文',
            translation: { id: `vt-${bookId}`, translation: '', aiModelId: '' },
          },
          chapters: chapterIds.map((id, index) => ({
            id,
            title: {
              original: `第${index + 1}話`,
              translation: { id: `ct-${id}`, translation: '', aiModelId: '' },
            },
            webUrl: `${base}${index + 1}/`,
            createdAt: new Date(),
            lastEdited: new Date(),
          })),
        },
      ],
      createdAt: new Date(),
      lastEdited: new Date(),
    },
  });

  it('import_book_from_url 对已有书抓取失败时返回 book_id 且只建议 add_chapters，不引导重新建书', async () => {
    const kernel = createAgentMcpKernel({
      tools: [...agentMcpContextTools, ...agentMcpLibraryTools],
    });
    const base = 'https://ncode.syosetu.com/n5555exist/';
    const failingSecond = (url: string) =>
      url.endsWith('/1/')
        ? Promise.resolve('第一話の本文。')
        : Promise.reject(new Error('HTTP 503'));
    vi.spyOn(NovelScraperFactory, 'getScraper').mockReturnValue({
      isValidUrl: () => true,
      catalogUrl: () => base,
      fetchNovel: () =>
        Promise.resolve(scrapedCatalog('existing-fail-book', base, ['ex-1', 'ex-2'])),
      fetchChapterContent: failingSecond,
    } as unknown as NovelScraper);

    // 首次导入：第一章成功、第二章失败，书保留且第二章待续
    const first = await kernel.callTool(
      'import_book_from_url',
      { url: base },
      { channel: 'desktop-mcp' },
    );
    expect(first.isError).toBe(false);
    expect((first.data as { pending_chapter_count: number }).pending_chapter_count).toBe(1);

    // 再次导入：唯一待抓章节仍失败。书已存在，绝不能建议 create_book
    const second = await kernel.callTool(
      'import_book_from_url',
      { url: base },
      { channel: 'desktop-mcp' },
    );
    expect(second.isError).toBe(true);
    expect(second.errorCode).toBe('URL_IMPORT_FAILED');
    const error = (second.data as { error: { message: string; details: Record<string, unknown> } })
      .error;
    expect(error.details.book_id).toBe('existing-fail-book');
    expect(error.details.fallback_tools).toEqual(['add_chapters']);
    expect(error.message).not.toMatch(/create_book/);
    expect(useBooksStore().getBookById('existing-fail-book')).toBeDefined();

    // 已有书在落盘阶段抛异常时同样带回 book_id
    vi.spyOn(NovelScraperFactory, 'getScraper').mockReturnValue({
      isValidUrl: () => true,
      catalogUrl: () => base,
      fetchNovel: () =>
        Promise.resolve(scrapedCatalog('existing-fail-book', base, ['ex-1', 'ex-2'])),
      fetchChapterContent: () => Promise.resolve('第二話の本文。'),
    } as unknown as NovelScraper);
    vi.spyOn(ChapterContentService, 'saveChapterContent').mockRejectedValueOnce(
      new Error('Simulated IndexedDB write failure'),
    );
    const third = await kernel.callTool(
      'import_book_from_url',
      { url: base },
      { channel: 'desktop-mcp' },
    );
    expect(third.isError).toBe(true);
    const thirdError = (
      third.data as { error: { message: string; details: Record<string, unknown> } }
    ).error;
    expect(thirdError.details.book_id).toBe('existing-fail-book');
    expect(thirdError.details.fallback_tools).toEqual(['add_chapters']);
    expect(thirdError.message).not.toMatch(/create_book/);
  });

  it('import_book_from_url 抓取期间写入目标章节的正文与译文不会被导入结果覆盖', async () => {
    const kernel = createAgentMcpKernel({
      tools: [...agentMcpContextTools, ...agentMcpLibraryTools],
    });
    const base = 'https://ncode.syosetu.com/n4444keep/';
    let release!: (text: string) => void;
    const fetchStarted = new Promise<void>((resolve) => {
      vi.spyOn(NovelScraperFactory, 'getScraper').mockReturnValue({
        isValidUrl: () => true,
        catalogUrl: () => base,
        fetchNovel: () =>
          Promise.resolve(scrapedCatalog('keep-translation-book', base, ['keep-1'])),
        fetchChapterContent: () =>
          new Promise<string>((res) => {
            release = res;
            resolve();
          }),
      } as unknown as NovelScraper);
    });

    const importPromise = kernel.callTool(
      'import_book_from_url',
      { url: base },
      { channel: 'desktop-mcp' },
    );
    await fetchStarted;

    // 抓取尚未返回时，该章节已由其它途径写入正文并提交了译文
    const concurrentParagraphs = [
      {
        id: 'keep-para-1',
        text: '先に書き込まれた本文。',
        selectedTranslationId: 'keep-tr-1',
        translations: [
          {
            id: 'keep-tr-1',
            translation: '先写入的译文。',
            aiModelId: 'mcp:external',
            language: 'zh-CN' as const,
          },
        ],
      },
    ];
    await ChapterContentService.saveChapterContent('keep-1', concurrentParagraphs, {
      bookId: 'keep-translation-book',
    });

    release('後から届いた本文。');
    const res = await importPromise;
    expect(res.isError).toBe(false);
    expect((res.data as { fetched_chapter_count: number }).fetched_chapter_count).toBe(0);

    const stored = (await ChapterContentService.loadChapterContent('keep-1'))!;
    expect(stored).toHaveLength(1);
    expect(stored[0]!.id).toBe('keep-para-1');
    expect(stored[0]!.text).toBe('先に書き込まれた本文。');
    expect(stored[0]!.translations.map((t) => t.translation)).toContain('先写入的译文。');
  });

  it('get_book 可只看某一卷、只看最近几章，或只要卷的概览，长篇不必读整本目录', async () => {
    const kernel = createAgentMcpKernel({
      tools: [...agentMcpContextTools, ...agentMcpLibraryTools],
    });
    const created = await kernel.callTool(
      'create_book',
      {
        title: '长篇',
        volume_title: '第一卷',
        chapters: [
          { title: '1话', paragraphs: ['a'] },
          { title: '2话', paragraphs: ['b'] },
        ],
      },
      { channel: 'desktop-mcp' },
    );
    const bookId = (created.data as { book_id: string }).book_id;
    await kernel.callTool(
      'add_chapters',
      {
        book_id: bookId,
        volume_title: '第二卷',
        chapters: [
          { title: '3话', paragraphs: ['c'] },
          { title: '4话', paragraphs: ['d'] },
          { title: '5话', paragraphs: ['e'] },
        ],
      },
      { channel: 'desktop-mcp' },
    );
    type BookResult = {
      chapter_count: number;
      returned_chapter_count: number;
      volumes: Array<{
        id: string;
        title_original: string;
        chapter_count: number;
        chapters?: Array<{ title_original: string; paragraph_count?: number }>;
      }>;
    };
    const call = async (args: Record<string, unknown>) =>
      (await kernel.callTool('get_book', { book_id: bookId, ...args }, { channel: 'desktop-mcp' }))
        .data as BookResult;
    const titles = (book: BookResult) =>
      book.volumes.map((v) => (v.chapters ?? []).map((ch) => ch.title_original));

    // 默认：全部卷章
    const full = await call({});
    expect(full.chapter_count).toBe(5);
    expect(full.returned_chapter_count).toBe(5);
    expect(titles(full)).toEqual([
      ['1话', '2话'],
      ['3话', '4话', '5话'],
    ]);

    // 只看最近 2 章：其余卷只给概览
    const recent = await call({ recent_chapters: 2 });
    expect(recent.chapter_count).toBe(5);
    expect(recent.returned_chapter_count).toBe(2);
    expect(titles(recent)).toEqual([[], ['4话', '5话']]);
    expect(recent.volumes.map((v) => v.chapter_count)).toEqual([2, 3]);
    expect(recent.volumes[1]?.chapters?.[0]?.paragraph_count).toBe(1);

    // 只看某一卷
    const second = await call({ volume_id: full.volumes[1]!.id });
    expect(titles(second)).toEqual([[], ['3话', '4话', '5话']]);

    // 只要卷的概览
    const outline = await call({ include_chapters: false });
    expect(outline.returned_chapter_count).toBe(0);
    expect(outline.volumes.every((v) => v.chapters === undefined)).toBe(true);
    expect(outline.volumes.map((v) => v.chapter_count)).toEqual([2, 3]);

    // 简介可以省略（有些简介很长）；默认仍然返回
    await kernel.callTool(
      'update_book',
      { book_id: bookId, description: '一段很长的简介' },
      { channel: 'desktop-mcp' },
    );
    expect(
      (await call({ recent_chapters: 1 })) as unknown as { description: string },
    ).toHaveProperty('description', '一段很长的简介');
    expect(await call({ recent_chapters: 1, include_description: false })).not.toHaveProperty(
      'description',
    );

    const missing = await kernel.callTool(
      'get_book',
      { book_id: bookId, volume_id: 'nope' },
      { channel: 'desktop-mcp' },
    );
    expect(missing.isError).toBe(true);
    expect(missing.errorCode).toBe('VOLUME_NOT_FOUND');
  });

  it('update_book 修改作者、简介、标签与别名，只改传入的字段；什么都没传时报错', async () => {
    const kernel = createAgentMcpKernel({
      tools: [...agentMcpContextTools, ...agentMcpLibraryTools],
    });
    const createRes = await kernel.callTool(
      'create_book',
      { title: '星之旅人', author: '旧作者', description: '旧简介', tags: ['奇幻'] },
      { channel: 'desktop-mcp' },
    );
    const bookId = (createRes.data as { book_id: string }).book_id;

    const res = await kernel.callTool(
      'update_book',
      {
        book_id: bookId,
        author: ' 新作者 ',
        tags: ['奇幻', ' 冒险 ', ''],
        alternate_titles: ['Star Traveler'],
      },
      { channel: 'desktop-mcp' },
    );
    expect(res.isError).toBe(false);
    expect(res.data).toMatchObject({
      book_id: bookId,
      updated_fields: ['author', 'tags', 'alternate_titles'],
      author: '新作者',
      description: '旧简介',
      tags: ['奇幻', '冒险'],
      alternate_titles: ['Star Traveler'],
    });
    const stored = useBooksStore().getBookById(bookId);
    expect(stored?.author).toBe('新作者');
    expect(stored?.description).toBe('旧简介');
    expect(stored?.tags).toEqual(['奇幻', '冒险']);
    expect(stored?.alternateTitles).toEqual(['Star Traveler']);
    expect(stored?.title).toBe('星之旅人');

    // 传空字符串 / 空数组表示清空该字段
    const cleared = await kernel.callTool(
      'update_book',
      { book_id: bookId, description: '', tags: [] },
      { channel: 'desktop-mcp' },
    );
    expect(cleared.isError).toBe(false);
    expect(useBooksStore().getBookById(bookId)?.description).toBeUndefined();
    expect(useBooksStore().getBookById(bookId)?.tags).toBeUndefined();

    const nothing = await kernel.callTool(
      'update_book',
      { book_id: bookId },
      { channel: 'desktop-mcp' },
    );
    expect(nothing.isError).toBe(true);
    expect(nothing.errorCode).toBe('INVALID_ARGS');

    await useSettingsStore().updateAgentMcpSettings({ permissionMode: 'read_only' });
    const denied = await kernel.callTool(
      'update_book',
      { book_id: bookId, author: 'x' },
      { channel: 'desktop-mcp' },
    );
    expect(denied.errorCode).toBe('PERMISSION_DENIED');
  });

  it('get_app_context 说明用户在哪个页面、打开了哪一章、选中了哪个段落及其内容', async () => {
    let currentPath = '/books';
    const kernel = createAgentMcpKernel({
      tools: [...agentMcpContextTools, ...agentMcpLibraryTools, ...agentMcpTranslationTools],
      getCurrentPath: () => currentPath,
    });
    const createRes = await kernel.callTool(
      'create_book',
      {
        title: '月下旅人',
        chapters: [{ title: '第一章', paragraphs: ['第一段原文', '第二段原文'] }],
      },
      { channel: 'desktop-mcp' },
    );
    const bookId = (createRes.data as { book_id: string }).book_id;
    const chapterId = useBooksStore().getBookById(bookId)!.volumes![0]!.chapters![0]!.id;
    const paragraphs = (await ChapterContentService.loadChapterContent(chapterId))!;

    // 在书库页、没有打开任何书
    const listPage = (await kernel.callTool('get_app_context', {}, { channel: 'desktop-mcp' }))
      .data as Record<string, unknown>;
    expect(listPage.page).toEqual({ kind: 'books', path: '/books' });
    expect(listPage.current_chapter).toBeNull();
    expect(listPage.selected_paragraph).toBeNull();

    // 打开了书的某一章并选中第二段
    currentPath = `/books/${bookId}`;
    useContextStore().setCurrentBook(bookId);
    useContextStore().setCurrentChapter(chapterId);
    useContextStore().setSelectedParagraph(paragraphs[1]!.id);
    await kernel.callTool(
      'submit_translations',
      {
        book_id: bookId,
        chapter_id: chapterId,
        paragraphs: [{ paragraph_id: paragraphs[1]!.id, translated_text: '第二段译文' }],
      },
      { channel: 'desktop-mcp' },
    );

    const reading = (await kernel.callTool('get_app_context', {}, { channel: 'desktop-mcp' }))
      .data as Record<string, unknown>;
    expect(reading.page).toEqual({ kind: 'book', path: `/books/${bookId}`, book_id: bookId });
    expect(reading.current_book_id).toBe(bookId);
    expect(reading.current_chapter).toMatchObject({
      id: chapterId,
      title_original: '第一章',
      paragraph_count: 2,
      translated_count: 1,
    });
    expect(reading.selected_paragraph_id).toBe(paragraphs[1]!.id);
    expect(reading.selected_paragraph).toEqual({
      id: paragraphs[1]!.id,
      chapter_id: chapterId,
      index: 1,
      text: '第二段原文',
      translation: '第二段译文',
    });

    // 书籍设置页与帮助页能说明具体位置
    currentPath = `/books/${bookId}/settings/terms`;
    const settingsPage = (await kernel.callTool('get_app_context', {}, { channel: 'desktop-mcp' }))
      .data as Record<string, unknown>;
    expect(settingsPage.page).toEqual({
      kind: 'book_settings',
      path: `/books/${bookId}/settings/terms`,
      book_id: bookId,
      section: 'terms',
    });

    currentPath = '/help/import-guide';
    const helpPage = (await kernel.callTool('get_app_context', {}, { channel: 'desktop-mcp' }))
      .data as Record<string, unknown>;
    expect(helpPage.page).toEqual({
      kind: 'help',
      path: '/help/import-guide',
      help_doc_id: 'import-guide',
    });
  });

  it('get_app_context 带上用户在页面上划选的文字；没有接入路由时页面为未知', async () => {
    const kernel = createAgentMcpKernel({ tools: agentMcpContextTools });
    vi.spyOn(window, 'getSelection').mockReturnValue({
      toString: () => '  划选的一句话  ',
    } as Selection);

    const data = (await kernel.callTool('get_app_context', {}, { channel: 'desktop-mcp' }))
      .data as Record<string, unknown>;
    expect(data.selected_text).toBe('划选的一句话');
    expect(data.page).toEqual({ kind: 'unknown', path: null });

    vi.spyOn(window, 'getSelection').mockReturnValue({ toString: () => '' } as Selection);
    const none = (await kernel.callTool('get_app_context', {}, { channel: 'desktop-mcp' }))
      .data as Record<string, unknown>;
    expect(none.selected_text).toBeNull();
  });

  it('delete_book 在 translate_and_edit 被拦截，仅在 full 模式下允许删除', async () => {
    const kernel = createAgentMcpKernel({
      tools: [...agentMcpContextTools, ...agentMcpLibraryTools],
    });
    const createRes = await kernel.callTool(
      'create_book',
      { title: '待删书籍' },
      { channel: 'desktop-mcp' },
    );
    const bookId = (createRes.data as { book_id: string }).book_id;

    const denied = await kernel.callTool(
      'delete_book',
      { book_id: bookId },
      { channel: 'desktop-mcp' },
    );
    expect(denied.isError).toBe(true);
    expect(denied.errorCode).toBe('PERMISSION_DENIED');
    expect(useBooksStore().getBookById(bookId)).toBeDefined();

    await useSettingsStore().updateAgentMcpSettings({ permissionMode: 'full' });
    const ok = await kernel.callTool(
      'delete_book',
      { book_id: bookId },
      { channel: 'desktop-mcp' },
    );
    expect(ok.isError).toBe(false);
    expect(useBooksStore().getBookById(bookId)).toBeUndefined();
  });

  it('get_workflow_guide 仅在 WebMCP 通道暴露并返回工作流指引', async () => {
    const kernel = createAgentMcpKernel({
      tools: [...agentMcpContextTools, ...agentMcpLibraryTools],
    });

    expect(kernel.listTools('desktop-mcp').some((t) => t.name === 'get_workflow_guide')).toBe(
      false,
    );
    expect(kernel.listTools('webmcp').some((t) => t.name === 'get_workflow_guide')).toBe(true);

    const res = await kernel.callTool(
      'get_workflow_guide',
      { workflow: 'translate-chapter', chapter_id: 'ch-9' },
      { channel: 'webmcp' },
    );
    expect(res.isError).toBe(false);
    expect((res.data as { guide: string }).guide).toContain('ch-9');
  });
});
