import './setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookSyncChangeset } from 'src/models/book-sync';
import { DESKTOP_MCP_LONG_OPERATION_TOOLS } from 'src/models/desktop-mcp';
import { ALL_AGENT_MCP_TOOLS } from 'src/services/agent-mcp';
import { createAgentMcpKernel } from 'src/services/agent-mcp/kernel';
import { agentMcpBookUpdateTools } from 'src/services/agent-mcp/tools/book-updates';
import { agentMcpLibraryTools } from 'src/services/agent-mcp/tools/library';
import { BookSyncService } from 'src/services/book-sync/book-sync-service';
import { useBooksStore } from 'src/stores/books';
import { useSettingsStore } from 'src/stores/settings';

type Session = Awaited<ReturnType<typeof BookSyncService.openSession>>;

function changeset(overrides: Partial<BookSyncChangeset> = {}): BookSyncChangeset {
  return {
    baseRevision: 1,
    new: [],
    updated: [],
    skipped: [],
    failed: [],
    unchecked: [],
    checked: [],
    dateUnchanged: [],
    dateNewer: [],
    status: 'ready',
    ...overrides,
  };
}

const NEW_1 = {
  url: 'https://example.com/n/11/',
  title: '第十一話',
  groupKey: 'g',
  target: { newTitle: '正文' },
};
const NEW_2 = {
  url: 'https://example.com/n/12/',
  title: '第十二話',
  groupKey: 'g',
  target: { newTitle: '正文' },
};
const UPDATED_1 = {
  url: 'https://example.com/n/3/',
  title: '第三話',
  chapterId: 'ch-3',
  paragraphs: [],
  changes: [],
  revised: 2,
  inserted: 1,
  removed: 0,
  clearedVersions: 4,
};

function fakeSession(quick: BookSyncChangeset, deep: BookSyncChangeset = quick) {
  const session = {
    quickCheck: vi.fn(() => Promise.resolve(quick)),
    deepCheck: vi.fn(() => Promise.resolve(deep)),
    apply: vi.fn((selection: { urls: string[] }) =>
      Promise.resolve({
        bookId: 'ignored',
        revision: 2,
        status: 'success' as const,
        appliedUrls: [...selection.urls],
        failed: [],
      }),
    ),
  };
  const open = vi
    .spyOn(BookSyncService, 'openSession')
    .mockResolvedValue(session as unknown as Session);
  return { session, open };
}

describe('AgentMcp book update tools', () => {
  let kernel: ReturnType<typeof createAgentMcpKernel>;
  let bookId: string;

  beforeEach(async () => {
    await useSettingsStore().loadSettings();
    await useSettingsStore().updateAgentMcpSettings({ permissionMode: 'translate_and_edit' });
    await useBooksStore().loadBooks();
    kernel = createAgentMcpKernel({
      tools: [...agentMcpLibraryTools, ...agentMcpBookUpdateTools],
    });
    const created = await kernel.callTool(
      'create_book',
      { title: '更新检查测试书' },
      { channel: 'desktop-mcp' },
    );
    bookId = (created.data as { book_id: string }).book_id;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('两个工具已注册、属于长操作清单，且只读权限下不可用', async () => {
    const names = ALL_AGENT_MCP_TOOLS.map((tool) => tool.name);
    expect(names).toContain('check_book_updates');
    expect(names).toContain('apply_book_updates');
    expect(DESKTOP_MCP_LONG_OPERATION_TOOLS).toContain('check_book_updates');
    expect(DESKTOP_MCP_LONG_OPERATION_TOOLS).toContain('apply_book_updates');

    await useSettingsStore().updateAgentMcpSettings({ permissionMode: 'read_only' });
    fakeSession(changeset());
    for (const tool of ['check_book_updates', 'apply_book_updates']) {
      const res = await kernel.callTool(tool, { book_id: bookId }, { channel: 'desktop-mcp' });
      expect(res.isError).toBe(true);
    }
    expect(kernel.listTools('desktop-mcp').map((tool) => tool.name)).not.toContain(
      'check_book_updates',
    );
  });

  it('check_book_updates 同时给出本地的翻译进度：来源站点没有新章节时，也能看出刚手动导入、还没译的章节', async () => {
    const now = new Date();
    const para = (id: string, translation?: string) => ({
      id,
      text: `原文${id}`,
      selectedTranslationId: translation ? `tr-${id}` : '',
      translations: translation
        ? [{ id: `tr-${id}`, translation, aiModelId: 'm', language: 'zh-CN' as const }]
        : [],
    });
    const chapter = (id: string, content: ReturnType<typeof para>[]) => ({
      id,
      title: {
        original: `${id}话`,
        translation: { id: `t-${id}`, translation: '', aiModelId: '' },
      },
      content,
      contentLoaded: true,
      createdAt: now,
      lastEdited: now,
    });
    await useBooksStore().addBook({
      id: 'book-local',
      title: '本地进度',
      targetLanguage: 'zh-CN',
      volumes: [
        {
          id: 'v1',
          title: '第一卷',
          chapters: [
            chapter('c1', [para('p1', '一')]),
            chapter('c2', [para('p2', '二'), para('p3')]),
          ],
        },
        {
          id: 'v2',
          title: '第二卷',
          chapters: [
            chapter('c3', [para('p4'), para('p5')]),
            // 没有正文的章节不计入，也不算最新章节
            chapter('c4', []),
          ],
        },
      ],
      createdAt: now,
      lastEdited: now,
    });
    await useBooksStore().refreshBookFromStorage('book-local');
    fakeSession(changeset());

    const res = await kernel.callTool(
      'check_book_updates',
      { book_id: 'book-local' },
      { channel: 'desktop-mcp' },
    );
    expect(res.isError, res.text).toBe(false);
    const data = res.data as { has_updates: boolean; local_progress: unknown };
    expect(data.has_updates).toBe(false);
    expect(data.local_progress).toEqual({
      translated_chapter_count: 1,
      in_progress_chapter_count: 1,
      untranslated_chapter_count: 1,
      first_untranslated_chapter: { chapter_id: 'c2', volume_id: 'v1', title_original: 'c2话' },
      latest_chapters: [
        { chapter_id: 'c2', title_original: 'c2话', paragraph_count: 2, translated_count: 1 },
        { chapter_id: 'c3', title_original: 'c3话', paragraph_count: 2, translated_count: 0 },
      ],
    });
  });

  it('check_book_updates 快速检查返回新章节与待比对章节，deep 时比对正文并返回变化统计', async () => {
    const quick = changeset({
      new: [NEW_1, NEW_2],
      dateNewer: [UPDATED_1.url],
      unchecked: [UPDATED_1.url],
    });
    const deep = changeset({ new: [NEW_1, NEW_2], updated: [UPDATED_1], checked: [UPDATED_1.url] });
    const { session, open } = fakeSession(quick, deep);

    const quickRes = await kernel.callTool(
      'check_book_updates',
      { book_id: bookId },
      { channel: 'desktop-mcp' },
    );
    expect(quickRes.isError).toBe(false);
    expect(open).toHaveBeenCalledWith({ target: { bookId } });
    expect(session.quickCheck).toHaveBeenCalledTimes(1);
    expect(session.deepCheck).not.toHaveBeenCalled();
    const quickData = quickRes.data as {
      has_updates: boolean;
      new_chapters: Array<{ url: string; title: string }>;
      updated_chapters: unknown[];
      pending_compare_count: number;
    };
    expect(quickData.has_updates).toBe(true);
    expect(quickData.new_chapters).toEqual([
      { url: NEW_1.url, title: NEW_1.title },
      { url: NEW_2.url, title: NEW_2.title },
    ]);
    expect(quickData.updated_chapters).toEqual([]);
    expect(quickData.pending_compare_count).toBe(1);

    const deepRes = await kernel.callTool(
      'check_book_updates',
      { book_id: bookId, deep: true },
      { channel: 'desktop-mcp' },
    );
    expect(session.deepCheck).toHaveBeenCalledTimes(1);
    const deepData = deepRes.data as {
      updated_chapters: Array<Record<string, unknown>>;
      pending_compare_count: number;
    };
    expect(deepData.updated_chapters).toEqual([
      {
        chapter_id: 'ch-3',
        url: UPDATED_1.url,
        title: '第三話',
        revised_paragraphs: 2,
        inserted_paragraphs: 1,
        removed_paragraphs: 0,
        cleared_translation_versions: 4,
      },
    ]);
    expect(deepData.pending_compare_count).toBe(0);
  });

  it('更新来源失效或缺失时返回结构化错误，不抛出', async () => {
    fakeSession(
      changeset({
        status: 'invalid',
        failed: [{ code: 'CATALOG_EMPTY', message: '目录解析不到章节', url: '' }],
      }),
    );
    const invalid = await kernel.callTool(
      'check_book_updates',
      { book_id: bookId },
      { channel: 'desktop-mcp' },
    );
    expect(invalid.isError).toBe(true);
    expect(invalid.errorCode).toBe('UPDATE_SOURCE_INVALID');
    expect(invalid.errorMessage).toContain('目录解析不到章节');

    vi.restoreAllMocks();
    vi.spyOn(BookSyncService, 'openSession').mockRejectedValue(
      Object.assign(new Error('no recipe'), { code: 'RECIPE_MISSING' }),
    );
    const missing = await kernel.callTool(
      'apply_book_updates',
      { book_id: bookId },
      { channel: 'desktop-mcp' },
    );
    expect(missing.isError).toBe(true);
    expect(missing.errorCode).toBe('UPDATE_SOURCE_MISSING');
  });

  it('apply_book_updates 默认只导入新章节；include_updated 才比对并应用已改动章节', async () => {
    const quick = changeset({ new: [NEW_1, NEW_2], dateNewer: [UPDATED_1.url] });
    const deep = changeset({ new: [NEW_1, NEW_2], updated: [UPDATED_1] });
    const { session } = fakeSession(quick, deep);

    const res = await kernel.callTool(
      'apply_book_updates',
      { book_id: bookId },
      { channel: 'desktop-mcp' },
    );
    expect(res.isError).toBe(false);
    expect(session.deepCheck).not.toHaveBeenCalled();
    expect(session.apply).toHaveBeenCalledWith({ urls: [NEW_1.url, NEW_2.url] });
    const data = res.data as {
      status: string;
      applied_count: number;
      skipped_updated_count: number;
    };
    expect(data.status).toBe('success');
    expect(data.applied_count).toBe(2);
    // 提醒 Agent 还有按日期看已变化、但本次没有处理的章节
    expect(data.skipped_updated_count).toBe(1);

    await kernel.callTool(
      'apply_book_updates',
      { book_id: bookId, include_updated: true },
      { channel: 'desktop-mcp' },
    );
    expect(session.deepCheck).toHaveBeenCalledTimes(1);
    expect(session.apply).toHaveBeenLastCalledWith({
      urls: [NEW_1.url, NEW_2.url, UPDATED_1.url],
    });
  });

  it('比对正文时有章节抓取失败：不报告「已是最新」，并带回失败的章节', async () => {
    const checkFailure = {
      url: 'https://example.com/n/5/',
      code: 'FETCH_HTTP_FAILED',
      message: 'HTTP 503',
    };
    // 没有新章节、没有比对出变化，但有一章没能比对
    const deepFailedOnly = changeset({ failed: [checkFailure], dateNewer: [checkFailure.url] });
    const { session } = fakeSession(changeset(), deepFailedOnly);

    const nothing = await kernel.callTool(
      'apply_book_updates',
      { book_id: bookId, include_updated: true },
      { channel: 'desktop-mcp' },
    );
    expect(session.apply).not.toHaveBeenCalled();
    expect(nothing.data).toMatchObject({
      status: 'partial',
      applied_count: 0,
      skipped_updated_count: 1,
      failed: [checkFailure],
    });

    // 有可导入的内容时，检查阶段与应用阶段的失败合并返回
    const deepMixed = changeset({ new: [NEW_1], failed: [checkFailure] });
    fakeSession(changeset({ new: [NEW_1] }), deepMixed);
    const mixed = await kernel.callTool(
      'apply_book_updates',
      { book_id: bookId, include_updated: true },
      { channel: 'desktop-mcp' },
    );
    expect(mixed.data).toMatchObject({
      status: 'partial',
      applied_count: 1,
      failed: [checkFailure],
    });
  });

  it('工具说明里写明导入后会返回章节 ID，Agent 不需要先试一次才知道', () => {
    const apply = agentMcpBookUpdateTools.find((tool) => tool.name === 'apply_book_updates');
    expect(apply?.description).toContain('applied_chapters');
    expect(apply?.description).toContain('chapter_id');
    const importTool = agentMcpLibraryTools.find((tool) => tool.name === 'import_book_from_url');
    expect(importTool?.description).toContain('fetched_chapters');
  });

  it('apply_book_updates 返回导入的章节 ID、所在卷与标题，不需要再读整本书的目录', async () => {
    const { session } = fakeSession(changeset({ new: [NEW_1, NEW_2] }));
    // 模拟真实导入：应用更新后书里多出带来源网址的章节
    session.apply.mockImplementation(async (selection: { urls: string[] }) => {
      await kernel.callTool(
        'add_chapters',
        {
          book_id: bookId,
          chapters: [
            { title: NEW_1.title, paragraphs: ['一'], web_url: NEW_1.url },
            { title: NEW_2.title, paragraphs: ['二'], web_url: NEW_2.url },
          ],
        },
        { channel: 'desktop-mcp' },
      );
      return {
        bookId,
        revision: 2,
        status: 'success' as const,
        appliedUrls: [...selection.urls],
        failed: [],
      };
    });

    const res = await kernel.callTool(
      'apply_book_updates',
      { book_id: bookId },
      { channel: 'desktop-mcp' },
    );
    expect(res.isError).toBe(false);
    const volume = useBooksStore().getBookById(bookId)!.volumes![0]!;
    expect((res.data as { applied_chapters: unknown[] }).applied_chapters).toEqual([
      {
        chapter_id: volume.chapters![0]!.id,
        volume_id: volume.id,
        title_original: NEW_1.title,
        url: NEW_1.url,
      },
      {
        chapter_id: volume.chapters![1]!.id,
        volume_id: volume.id,
        title_original: NEW_2.title,
        url: NEW_2.url,
      },
    ]);
  });

  it('apply_book_updates 可用 urls 限定范围；含未知网址时拒绝；没有可导入内容时不调用应用', async () => {
    const { session } = fakeSession(changeset({ new: [NEW_1, NEW_2] }));

    const subset = await kernel.callTool(
      'apply_book_updates',
      { book_id: bookId, urls: [NEW_2.url] },
      { channel: 'desktop-mcp' },
    );
    expect(subset.isError).toBe(false);
    expect(session.apply).toHaveBeenLastCalledWith({ urls: [NEW_2.url] });

    const unknown = await kernel.callTool(
      'apply_book_updates',
      { book_id: bookId, urls: [NEW_1.url, 'https://example.com/n/999/'] },
      { channel: 'desktop-mcp' },
    );
    expect(unknown.isError).toBe(true);
    expect(unknown.errorCode).toBe('INVALID_ARGS');
    expect(session.apply).toHaveBeenCalledTimes(1);

    vi.restoreAllMocks();
    const upToDate = fakeSession(changeset());
    const none = await kernel.callTool(
      'apply_book_updates',
      { book_id: bookId },
      { channel: 'desktop-mcp' },
    );
    expect(none.isError).toBe(false);
    expect((none.data as { status: string }).status).toBe('up_to_date');
    expect(upToDate.session.apply).not.toHaveBeenCalled();
  });

  it('应用阶段抛出的错误转成结构化错误并带回 book_id', async () => {
    const { session } = fakeSession(changeset({ new: [NEW_1] }));
    session.apply.mockRejectedValueOnce(
      Object.assign(new Error('BOOK_CHANGED: 书籍已被修改'), { code: 'BOOK_CHANGED' }),
    );
    const res = await kernel.callTool(
      'apply_book_updates',
      { book_id: bookId },
      { channel: 'desktop-mcp' },
    );
    expect(res.isError).toBe(true);
    expect(res.errorCode).toBe('BOOK_CHANGED');
    expect((res.data as { error: { details: { book_id: string } } }).error.details.book_id).toBe(
      bookId,
    );
  });
});
