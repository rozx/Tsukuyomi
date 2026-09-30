import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import axios from 'axios';
import { HelpService, parseHelpHeading, resolveHelpSection } from '../services/help-service';
const base = {
  id: 'front-page',
  file: 'front-page.md',
  path: 'help',
  category: '使用指南',
  description: '快速开始',
  categoryId: 'guides' as const,
  sectionAliases: { 快速开始: 'front-page-start' },
};
afterEach(() => vi.restoreAllMocks());
function resources() {
  vi.spyOn(axios, 'get').mockImplementation((url) => {
    if (String(url).endsWith('help/en-US/index.json'))
      return Promise.resolve({
        data: [
          {
            ...base,
            title: 'Quick start',
            category: 'User guides',
            description: 'Getting started',
          },
        ],
      });
    if (String(url).endsWith('help/zh-TW/index.json'))
      return Promise.resolve({
        data: [{ ...base, title: '快速開始', category: '使用指南', description: '開始使用' }],
      });
    if (String(url).endsWith('help/index.json'))
      return Promise.resolve({
        data: [
          { ...base, title: '快速开始' },
          {
            ...base,
            id: 'v1',
            file: 'RELEASE_NOTES_v1.md',
            path: 'releaseNotes',
            title: 'v1',
            categoryId: 'release-notes',
          },
        ],
      });
    if (String(url).endsWith('help/en-US/front-page.md'))
      return Promise.resolve({ data: '# Quick start {#front-page-start}\n\nFull English guide.' });
    if (String(url).endsWith('help/zh-TW/front-page.md'))
      return Promise.resolve({ data: '# 快速開始 {#front-page-start}\n\n完整繁中指南。' });
    if (String(url).endsWith('help/front-page.md'))
      return Promise.resolve({ data: '# 快速开始 {#front-page-start}\n\n完整简中指南。' });
    if (String(url).includes('releaseNotes/'))
      return Promise.resolve({ data: '# 历史日志\n\n原文逐字保留。' });
    return Promise.reject(new Error('fixture missing resource'));
  });
}
describe('页面与AI共用帮助语言资源', () => {
  it('空正文拒绝说明也使用请求语言', async () => {
    resources();
    vi.spyOn(axios, 'get').mockImplementation((url) =>
      String(url).endsWith('index.json')
        ? Promise.resolve({ data: [{ ...base, title: '快速開始' }] })
        : Promise.resolve({ data: ' ' }),
    );
    await expect(HelpService.getDocument('front-page', 'zh-TW')).rejects.toMatchObject({
      code: 'HELP_DOCUMENT_LOAD_FAILED',
      message: '無法載入文件 快速開始: 說明內容為空或格式無效',
    });
  });

  it('明确语言决定索引与完整正文路径，文档和章节ID相同', async () => {
    resources();
    const en = await HelpService.getDocument('front-page', 'en-US');
    const tw = await HelpService.getDocument('front-page', 'zh-TW');
    expect(en.doc.title).toBe('Quick start');
    expect(en.markdown).toContain('Full English guide');
    expect(tw.markdown).toContain('完整繁中指南');
    expect(en.headings[0]!.id).toBe('front-page-start');
    expect(en.headings[0]!.id).toBe(tw.headings[0]!.id);
  });
  it('显式ID与旧中文锚点兼容，标题显示不含协议标记', () => {
    expect(parseHelpHeading('Quick start {#front-page-start}', 2)).toEqual({
      id: 'front-page-start',
      text: 'Quick start',
      level: 2,
    });
    expect(resolveHelpSection(base, encodeURIComponent('快速开始'))).toBe('front-page-start');
    expect(resolveHelpSection(base, 'front-page-start')).toBe('front-page-start');
    expect(resolveHelpSection(base, 'constructor')).toBe('constructor');
  });
  it('历史日志沿原资源路径读取而不翻译正文', async () => {
    resources();
    const get = vi.spyOn(axios, 'get');
    get.mockResolvedValueOnce({
      data: [
        {
          ...base,
          id: 'v1',
          file: 'RELEASE_NOTES_v1.md',
          path: 'releaseNotes',
          title: 'v1',
          categoryId: 'release-notes',
        },
      ],
    });
    const content = await HelpService.getDocument('v1', 'en-US');
    expect(content.markdown).toBe('# 历史日志\n\n原文逐字保留。');
  });
  it('缺失译本明确拒绝，不回退借用简中', async () => {
    resources();
    vi.spyOn(axios, 'get').mockImplementation((url) =>
      String(url).endsWith('index.json')
        ? Promise.resolve({ data: [{ ...base, title: 'Quick start' }] })
        : Promise.reject(new Error('missing English guide')),
    );
    await expect(HelpService.getDocument('front-page', 'en-US')).rejects.toMatchObject({
      code: 'HELP_DOCUMENT_LOAD_FAILED',
    });
  });
});
