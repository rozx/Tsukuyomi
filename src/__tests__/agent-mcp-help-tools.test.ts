import './setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HelpContent, HelpDocument } from 'src/models/help';
import { HelpService } from 'src/services/help-service';
import { useSettingsStore } from 'src/stores/settings';
import { createAgentMcpKernel } from 'src/services/agent-mcp/kernel';
import { agentMcpHelpTools } from 'src/services/agent-mcp/tools/help-docs';
import { LocalizedError } from 'src/utils/localized-error';

const DOCS: HelpDocument[] = [
  {
    id: 'import-guide',
    title: '导入小说',
    file: 'import-guide.md',
    path: 'help',
    category: '使用指南',
    description: '从网址或本地文件导入小说。',
    categoryId: 'guides',
  },
  {
    id: 'book-details-terminology',
    title: '术语管理',
    file: 'book-details-terminology.md',
    path: 'help',
    category: '书籍详情',
    description: '维护术语表与译法。',
    categoryId: 'book-details',
  },
  {
    id: 'v1.0.0',
    title: 'v1.0.0 更新日志',
    file: 'v1.0.0.md',
    path: 'releaseNotes',
    category: '更新日志',
    description: '首个版本。',
    categoryId: 'release-notes',
  },
];

const CONTENT: Record<string, string> = {
  'import-guide': '# 导入小说\n\n## 从网址导入\n\n粘贴目录页网址即可抓取章节。\n',
  'book-details-terminology':
    '# 术语管理\n\n## 批量导出\n\n术语表可以导出为 JSON 文件，方便备份。\n',
  'v1.0.0': '# v1.0.0\n\n新增导出功能。\n',
};

function mockHelp() {
  const indexSpy = vi.spyOn(HelpService, 'getIndex').mockResolvedValue(DOCS);
  const docSpy = vi.spyOn(HelpService, 'getDocument').mockImplementation((id, locale) => {
    const doc = DOCS.find((entry) => entry.id === id);
    if (!doc) {
      return Promise.reject(
        new LocalizedError('HELP_DOCUMENT_NOT_FOUND', 'helpFeedback.notFound', { id }, locale),
      );
    }
    const content: HelpContent = { doc, markdown: CONTENT[id]!, headings: [] };
    return Promise.resolve(content);
  });
  return { indexSpy, docSpy };
}

interface HelpHit {
  id: string;
  title: string;
  category: string;
  description: string;
  snippet?: string;
}

describe('AgentMcp 帮助文档工具', () => {
  beforeEach(async () => {
    await useSettingsStore().loadSettings();
    await useSettingsStore().updateSettings({ uiLocale: 'zh-CN' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('search_help_docs 不带搜索词时列出全部使用文档，不包含更新日志', async () => {
    const { indexSpy } = mockHelp();
    const kernel = createAgentMcpKernel({ tools: agentMcpHelpTools });

    const res = await kernel.callTool('search_help_docs', {}, { channel: 'desktop-mcp' });
    expect(res.isError).toBe(false);
    expect(indexSpy).toHaveBeenCalledWith('zh-CN');
    const { docs } = res.data as { docs: HelpHit[] };
    expect(docs.map((doc) => doc.id)).toEqual(['import-guide', 'book-details-terminology']);
    expect(docs[0]).toMatchObject({ title: '导入小说', category: '使用指南' });
  });

  it('search_help_docs 按标题、简介和正文匹配，正文命中时给出片段', async () => {
    mockHelp();
    const kernel = createAgentMcpKernel({ tools: agentMcpHelpTools });

    const byTitle = (
      await kernel.callTool('search_help_docs', { query: '术语' }, { channel: 'desktop-mcp' })
    ).data as { docs: HelpHit[] };
    expect(byTitle.docs.map((doc) => doc.id)).toEqual(['book-details-terminology']);

    const byContent = (
      await kernel.callTool('search_help_docs', { query: 'json' }, { channel: 'desktop-mcp' })
    ).data as { docs: HelpHit[] };
    expect(byContent.docs.map((doc) => doc.id)).toEqual(['book-details-terminology']);
    expect(byContent.docs[0]?.snippet).toContain('导出为 JSON 文件');

    const none = (
      await kernel.callTool('search_help_docs', { query: '完全无关' }, { channel: 'desktop-mcp' })
    ).data as { docs: HelpHit[]; total: number };
    expect(none.docs).toEqual([]);
    expect(none.total).toBe(0);
  });

  it('search_help_docs 的 fuzzy 选项：搜索词写得略有出入时也能找到文档', async () => {
    mockHelp();
    const kernel = createAgentMcpKernel({ tools: agentMcpHelpTools });
    const search = async (args: Record<string, unknown>) =>
      (await kernel.callTool('search_help_docs', args, { channel: 'desktop-mcp' })).data as {
        docs: HelpHit[];
      };

    // 文档里写的是「从网址导入」，这里把「网址」写成了「网止」
    expect((await search({ query: '从网止导入' })).docs).toEqual([]);
    expect((await search({ query: '从网止导入', fuzzy: true })).docs.map((doc) => doc.id)).toEqual([
      'import-guide',
    ]);
    // 标题同样参与模糊匹配
    expect((await search({ query: '术语菅理', fuzzy: true })).docs.map((doc) => doc.id)).toEqual([
      'book-details-terminology',
    ]);
  });

  it('search_help_docs 按界面语言读取文档；个别文档读取失败不影响其他结果', async () => {
    const { indexSpy, docSpy } = mockHelp();
    await useSettingsStore().updateSettings({ uiLocale: 'en-US' });
    docSpy.mockImplementation((id, locale) => {
      if (id === 'import-guide') return Promise.reject(new Error('network'));
      const doc = DOCS.find((entry) => entry.id === id)!;
      void locale;
      return Promise.resolve({ doc, markdown: CONTENT[id]!, headings: [] });
    });
    const kernel = createAgentMcpKernel({ tools: agentMcpHelpTools });

    const res = await kernel.callTool(
      'search_help_docs',
      { query: 'JSON' },
      { channel: 'desktop-mcp' },
    );
    expect(res.isError).toBe(false);
    expect(indexSpy).toHaveBeenCalledWith('en-US');
    expect((res.data as { docs: HelpHit[] }).docs.map((doc) => doc.id)).toEqual([
      'book-details-terminology',
    ]);
  });

  it('get_help_doc 返回文档全文；文档不存在或没给 ID 时报错', async () => {
    mockHelp();
    const kernel = createAgentMcpKernel({ tools: agentMcpHelpTools });

    const res = await kernel.callTool(
      'get_help_doc',
      { doc_id: 'import-guide' },
      { channel: 'desktop-mcp' },
    );
    expect(res.isError).toBe(false);
    expect(res.data).toMatchObject({
      id: 'import-guide',
      title: '导入小说',
      content: CONTENT['import-guide'],
    });

    const missing = await kernel.callTool(
      'get_help_doc',
      { doc_id: 'nope' },
      { channel: 'desktop-mcp' },
    );
    expect(missing.isError).toBe(true);
    expect(missing.errorCode).toBe('HELP_DOC_NOT_FOUND');

    const noId = await kernel.callTool('get_help_doc', {}, { channel: 'desktop-mcp' });
    expect(noId.errorCode).toBe('INVALID_ARGS');
  });

  it('帮助文档工具在只读权限下可用，且不需要书库加载完成', async () => {
    mockHelp();
    await useSettingsStore().updateAgentMcpSettings({ permissionMode: 'read_only' });
    const kernel = createAgentMcpKernel({ tools: agentMcpHelpTools });

    expect(kernel.listTools('desktop-mcp').map((tool) => tool.name)).toEqual([
      'search_help_docs',
      'get_help_doc',
    ]);
    const res = await kernel.callTool('search_help_docs', {}, { channel: 'desktop-mcp' });
    expect(res.isError).toBe(false);
  });
});
