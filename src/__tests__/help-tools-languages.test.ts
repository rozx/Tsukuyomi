import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import axios from 'axios';
import { helpDocsTools } from '../services/ai/tools/help-docs-tools';
import { captureExecutionLanguages } from '../services/ai/tasks/utils/execution-languages';
const doc = {
  id: 'front-page',
  title: 'Quick start',
  file: 'front-page.md',
  path: 'help/en-US',
  category: 'User guides',
  categoryId: 'guides',
  description: 'Get started with translation',
  sectionAliases: { 快速开始: 'front-page-section-1' },
};
afterEach(() => vi.restoreAllMocks());
function resources() {
  return vi.spyOn(axios, 'get').mockImplementation((url) => {
    if (String(url).endsWith('help/en-US/index.json')) return Promise.resolve({ data: [doc] });
    if (String(url).endsWith('help/zh-CN/index.json'))
      return Promise.resolve({
        data: [
          {
            ...doc,
            title: '快速开始',
            path: 'help/zh-CN',
            category: '使用指南',
            description: '翻译入门',
          },
        ],
      });
    if (String(url).endsWith('help/en-US/front-page.md'))
      return Promise.resolve({
        data: '# Quick start {#front-page-section-1}\nFull English content.',
      });
    if (String(url).endsWith('help/zh-CN/front-page.md'))
      return Promise.resolve({ data: '# 快速开始\n简中正文。' });
    return Promise.reject(new Error('fixture missing guide'));
  });
}
async function invoke(name: string, args: Record<string, unknown>) {
  return JSON.parse(
    await helpDocsTools
      .find((tool) => tool.definition.function.name === name)!
      .handler(args, { languages: captureExecutionLanguages('en-US') }),
  );
}
describe('AI帮助工具沿执行UI读取同一资源', () => {
  it('英文关键词/索引/全文共用语言，完整正文包含稳定章节ID', async () => {
    resources();
    const search = await invoke('search_help_docs', { query: 'translation' });
    expect(search.data.docs[0].id).toBe('front-page');
    const list = await invoke('list_help_docs', {});
    expect(list.data.categories['User guides'][0].title).toBe('Quick start');
    const content = await invoke('get_help_doc', { doc_id: 'front-page' });
    expect(content.data.content).toContain('Full English content');
    expect(content.data.sections[0].id).toBe('front-page-section-1');
  });
  it('执行UI固定，旧中文锚点转换稳定ID，导航消息用执行语言', async () => {
    resources();
    const actions: unknown[] = [];
    const tool = helpDocsTools.find(
      (entry) => entry.definition.function.name === 'navigate_to_help_doc',
    )!;
    const result = JSON.parse(
      await tool.handler(
        { doc_id: 'front-page', section_id: '快速开始' },
        {
          languages: captureExecutionLanguages('en-US'),
          onAction: (action) => actions.push(action),
        },
      ),
    );
    expect(result.section_id).toBe('front-page-section-1');
    expect(result.message).toMatch(/^已导航到帮助文档: Quick start/);
    expect(JSON.stringify(actions)).toContain('front-page-section-1');
  });
  it('缺译本与必填失败均有固定身份，说明为简中单源', async () => {
    resources().mockImplementation((url) =>
      String(url).endsWith('index.json')
        ? Promise.resolve({ data: [doc] })
        : Promise.reject(new Error('missing English guide')),
    );
    const missing = await invoke('get_help_doc', { doc_id: 'front-page' });
    expect(missing.error_code).toBe('HELP_DOCUMENT_LOAD_FAILED');
    expect(missing.error).toMatch(/^无法加载文档 Quick start/);
    expect((await invoke('get_help_doc', {})).error_code).toBe('HELP_DOC_ID_REQUIRED');
    expect((await invoke('search_help_docs', {})).error_code).toBe('HELP_QUERY_REQUIRED');
  });
});
