import './setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettingsStore } from 'src/stores/settings';
import { useBooksStore } from 'src/stores/books';
import { useContextStore } from 'src/stores/context';
import { useAgentMcpStore } from 'src/stores/agent-mcp';
import { createAgentMcpKernel } from 'src/services/agent-mcp/kernel';
import { getAgentMcpPrompt, listAgentMcpPrompts } from 'src/services/agent-mcp/prompts';
import type { AgentMcpToolSpec } from 'src/services/agent-mcp/types';

function makeTool(overrides: Partial<AgentMcpToolSpec>): AgentMcpToolSpec {
  return {
    name: 'sample_read',
    description: 'sample tool',
    category: 'context',
    permission: 'read_only',
    readOnlyHint: true,
    requiresBookStore: false,
    inputSchema: { type: 'object', properties: {} },
    execute: () => ({ ok: true }),
    ...overrides,
  };
}

describe('AgentMcpKernel', () => {
  beforeEach(async () => {
    await useSettingsStore().loadSettings();
    await useBooksStore().loadBooks();
    useContextStore().setCurrentBook(null);
    useAgentMcpStore().clearActivities();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('按三级权限模式过滤工具列表并拦截越权调用', async () => {
    const readTool = makeTool({ name: 'r_tool', permission: 'read_only', readOnlyHint: true });
    const editTool = makeTool({
      name: 'e_tool',
      permission: 'translate_and_edit',
      readOnlyHint: false,
    });
    const fullTool = makeTool({ name: 'd_tool', permission: 'full', readOnlyHint: false });
    const kernel = createAgentMcpKernel({ tools: [readTool, editTool, fullTool] });

    const settings = useSettingsStore();
    await settings.updateAgentMcpSettings({ permissionMode: 'read_only' });
    expect(kernel.listTools('desktop-mcp').map((t) => t.name)).toEqual(['r_tool']);

    const deniedEdit = await kernel.callTool('e_tool', {}, { channel: 'desktop-mcp' });
    expect(deniedEdit.isError).toBe(true);
    expect(deniedEdit.errorCode).toBe('PERMISSION_DENIED');

    await settings.updateAgentMcpSettings({ permissionMode: 'translate_and_edit' });
    expect(kernel.listTools('desktop-mcp').map((t) => t.name)).toEqual(['r_tool', 'e_tool']);

    const deniedDelete = await kernel.callTool('d_tool', {}, { channel: 'desktop-mcp' });
    expect(deniedDelete.isError).toBe(true);
    expect(deniedDelete.errorCode).toBe('PERMISSION_DENIED');
    expect(deniedDelete.errorMessage).toContain('full');

    await settings.updateAgentMcpSettings({ permissionMode: 'full' });
    expect(kernel.listTools('desktop-mcp').map((t) => t.name)).toEqual([
      'r_tool',
      'e_tool',
      'd_tool',
    ]);
    const okDelete = await kernel.callTool('d_tool', {}, { channel: 'desktop-mcp' });
    expect(okDelete.isError).toBe(false);
  });

  it('支持显式 book_id 与当前打开书籍上下文回退，缺失时返回结构化错误', async () => {
    const seenBookIds: string[] = [];
    const bookTool = makeTool({
      name: 'book_tool',
      requiresBookStore: true,
      execute: (args, ctx) => {
        const resolved = ctx.resolveBookId(args.book_id as string | undefined);
        if (!resolved.ok) return resolved.error;
        seenBookIds.push(resolved.bookId);
        return { book_id: resolved.bookId };
      },
    });
    const kernel = createAgentMcpKernel({ tools: [bookTool] });

    // 无当前书且未传 book_id
    const missing = await kernel.callTool('book_tool', {}, { channel: 'desktop-mcp' });
    expect(missing.isError).toBe(true);
    expect(missing.errorCode).toBe('BOOK_ID_REQUIRED');

    // 有当前书时自动回退
    useContextStore().setCurrentBook('book-current');
    const fallback = await kernel.callTool('book_tool', {}, { channel: 'desktop-mcp' });
    expect(fallback.isError).toBe(false);
    expect(seenBookIds).toEqual(['book-current']);

    // 显式传 book_id 优先于当前书
    const explicit = await kernel.callTool(
      'book_tool',
      { book_id: 'book-other' },
      { channel: 'desktop-mcp' },
    );
    expect(explicit.isError).toBe(false);
    expect(seenBookIds).toEqual(['book-current', 'book-other']);
  });

  it('书库 Store 未加载完成时拒绝需要书库的工具并返回 NOT_READY', async () => {
    const booksStore = useBooksStore();
    booksStore.isLoaded = false;

    const handler = vi.fn(() => ({ ok: true }));
    const kernel = createAgentMcpKernel({
      tools: [makeTool({ name: 'needs_books', requiresBookStore: true, execute: handler })],
    });

    const result = await kernel.callTool('needs_books', {}, { channel: 'desktop-mcp' });
    expect(result.isError).toBe(true);
    expect(result.errorCode).toBe('NOT_READY');
    expect(handler).not.toHaveBeenCalled();
  });

  it('记录活动日志并在启用 notifyOnWrite 时对成功写操作触发通知回调', async () => {
    const onWriteNotify = vi.fn();
    const readTool = makeTool({ name: 'r_tool', readOnlyHint: true });
    const writeTool = makeTool({
      name: 'w_tool',
      permission: 'translate_and_edit',
      readOnlyHint: false,
      execute: () => ({ saved: 3 }),
    });
    const kernel = createAgentMcpKernel({
      tools: [readTool, writeTool],
      onRecordActivity: (entry) => {
        useAgentMcpStore().recordActivity(entry);
      },
      onWriteNotify,
    });

    await kernel.callTool('r_tool', { q: 'hello' }, { channel: 'webmcp' });
    expect(onWriteNotify).not.toHaveBeenCalled();

    await kernel.callTool('w_tool', { chapter_id: 'ch-1' }, { channel: 'desktop-mcp' });
    expect(onWriteNotify).toHaveBeenCalledTimes(1);

    await useSettingsStore().updateAgentMcpSettings({ notifyOnWrite: false });
    await kernel.callTool('w_tool', { chapter_id: 'ch-2' }, { channel: 'desktop-mcp' });
    expect(onWriteNotify).toHaveBeenCalledTimes(1);

    const activities = useAgentMcpStore().activities;
    expect(activities).toHaveLength(3);
    expect(activities[0]?.toolName).toBe('w_tool');
    expect(activities[0]?.channel).toBe('desktop-mcp');
    expect(activities[0]?.status).toBe('success');
  });

  it('活动记录带有返回结果摘要；没有参数时参数摘要为空而不是一对花括号', async () => {
    const kernel = createAgentMcpKernel({
      tools: [
        makeTool({
          name: 'list_things',
          execute: () => ({
            books: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
            total: 3,
            note: '一段比较长的说明文字，用来确认字符串会被截断而不是整段塞进摘要里',
            nested: { deep: true },
            empty: null,
          }),
        }),
        makeTool({ name: 'returns_text', execute: () => 'plain text result' }),
        makeTool({ name: 'returns_nothing', execute: () => undefined }),
        makeTool({
          name: 'fails',
          execute: () => ({ __agentMcpError: true, code: 'BOOM', message: 'it broke' }) as never,
        }),
      ],
      onRecordActivity: (entry) => {
        useAgentMcpStore().recordActivity(entry);
      },
    });

    await kernel.callTool('list_things', {}, { channel: 'desktop-mcp' });
    const listed = useAgentMcpStore().activities[0]!;
    // 没有参数：摘要为空，由界面显示「无参数」
    expect(listed.argsSummary).toBe('');
    // 结果摘要说明返回了什么：数组给出条数，字符串截断，嵌套对象不展开
    expect(listed.resultSummary).toContain('books=[3]');
    expect(listed.resultSummary).toContain('total=3');
    expect(listed.resultSummary).toContain('nested={…}');
    expect(listed.resultSummary).toContain('…');
    expect(listed.resultSummary!.length).toBeLessThan(200);

    await kernel.callTool('returns_text', { q: 'x' }, { channel: 'desktop-mcp' });
    expect(useAgentMcpStore().activities[0]!.argsSummary).toBe('q=x');
    expect(useAgentMcpStore().activities[0]!.resultSummary).toBe('plain text result');

    await kernel.callTool('returns_nothing', {}, { channel: 'desktop-mcp' });
    expect(useAgentMcpStore().activities[0]!.resultSummary).toBeUndefined();

    // 失败的调用只有错误信息，没有结果摘要
    await kernel.callTool('fails', {}, { channel: 'desktop-mcp' });
    const failed = useAgentMcpStore().activities[0]!;
    expect(failed.status).toBe('error');
    expect(failed.errorMessage).toBe('it broke');
    expect(failed.resultSummary).toBeUndefined();
  });

  it('提供 3 个内置翻译工作流模板并支持按参数渲染', () => {
    const list = listAgentMcpPrompts();
    expect(list.map((p) => p.name)).toEqual([
      'translate-chapter',
      'polish-chapter',
      'import-and-translate',
    ]);

    const prompt = getAgentMcpPrompt('translate-chapter', {
      book_id: 'book-42',
      chapter_id: 'ch-7',
    });
    expect(prompt).not.toBeNull();
    expect(prompt?.messages[0]?.content.text).toContain('book-42');
    expect(prompt?.messages[0]?.content.text).toContain('ch-7');
    expect(prompt?.messages[0]?.content.text).toContain('get_translation_chunk');
    expect(prompt?.messages[0]?.content.text).toContain('submit_translations');
  });
});
