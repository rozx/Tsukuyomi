import './setup';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HelpDocument } from 'src/models/help';
import { helpDocsTools } from 'src/services/ai/tools/help-docs-tools';
import { captureExecutionLanguages } from 'src/services/ai/tasks/utils/execution-languages';
import { HelpService } from 'src/services/help-service';
import type { ToolContext } from 'src/services/ai/tools/types';

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
  'book-details-terminology': '# 术语管理\n\n术语表可以导出为 JSON 文件，方便备份。\n',
  'v1.0.0': '# v1.0.0\n\n新增 JSON 导出功能。\n',
};

function mockHelp() {
  vi.spyOn(HelpService, 'getIndex').mockResolvedValue(DOCS);
  return vi.spyOn(HelpService, 'getDocument').mockImplementation((id) => {
    const doc = DOCS.find((entry) => entry.id === id)!;
    return Promise.resolve({ doc, markdown: CONTENT[id]!, headings: [] });
  });
}

const context: ToolContext = { languages: captureExecutionLanguages('zh-CN') };
const tool = helpDocsTools.find((entry) => entry.definition.function.name === 'search_help_docs')!;
const search = async (args: Record<string, unknown>) =>
  (
    JSON.parse(await tool.handler(args, context)) as {
      success: boolean;
      data: { total: number; docs: Array<{ id: string; snippet?: string }> };
    }
  ).data;

afterEach(() => vi.restoreAllMocks());

describe('站内 search_help_docs（与外部工具共用搜索）', () => {
  it('除了标题和简介，也搜索使用文档的正文，并给出命中片段', async () => {
    mockHelp();
    const byTitle = await search({ query: '术语' });
    expect(byTitle.docs.map((doc) => doc.id)).toEqual(['book-details-terminology']);

    const byContent = await search({ query: '抓取章节' });
    expect(byContent.docs.map((doc) => doc.id)).toEqual(['import-guide']);
    expect(byContent.docs[0]?.snippet).toContain('粘贴目录页网址即可抓取章节');
  });

  it('更新日志仍可按标题和简介找到，但不读取它们的正文', async () => {
    const getDocument = mockHelp();
    const byTitle = await search({ query: '更新日志' });
    expect(byTitle.docs.map((doc) => doc.id)).toEqual(['v1.0.0']);
    // 正文里才有的词：只会在使用文档里找，不会为此去读每一篇更新日志
    const byContent = await search({ query: 'JSON' });
    expect(byContent.docs.map((doc) => doc.id)).toEqual(['book-details-terminology']);
    expect(getDocument.mock.calls.map((call) => call[0])).not.toContain('v1.0.0');
  });

  it('fuzzy 选项：搜索词写得略有出入时也能找到', async () => {
    mockHelp();
    expect(Object.keys(tool.definition.function.parameters?.properties ?? {})).toContain('fuzzy');
    expect((await search({ query: '从网止导入' })).docs).toEqual([]);
    expect((await search({ query: '从网止导入', fuzzy: true })).docs.map((doc) => doc.id)).toEqual([
      'import-guide',
    ]);
  });
});
