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
