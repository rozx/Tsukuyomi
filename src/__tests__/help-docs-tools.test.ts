import './setup';
import { describe, test, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import type { ToolContext } from 'src/services/ai/tools/types';
import axios from 'axios';

// Mock getAssetUrl before importing help-docs-tools
mock.module('src/utils/assets', () => ({
  getAssetUrl: (path: string) => `/${path}`,
}));

import { helpDocsTools } from 'src/services/ai/tools/help-docs-tools';

// 模拟帮助文档索引数据
const mockHelpIndex = [
  {
    id: 'front-page',
    title: '快速开始',
    file: 'front-page.md',
    path: 'help',
    category: '使用指南',
    description: 'Tsukuyomi 翻译器核心功能介绍和快速入门',
  },
  {
    id: 'ai-models-guide',
    title: 'AI 模型配置',
    file: 'ai-models-guide.md',
    path: 'help',
    category: '使用指南',
    description: 'AI 模型的配置、管理和最佳实践指南',
  },
  {
    id: 'book-details-terminology',
    title: '术语管理',
    file: 'book-details-terminology.md',
    path: 'help',
    category: '书籍详情页',
    description: '术语库的创建、管理和使用,确保翻译一致性',
  },
  {
    id: 'v0.8.4',
    title: 'v0.8.4',
    file: 'RELEASE_NOTES_v0.8.4.md',
    path: 'releaseNotes',
    category: '更新日志',
    description: '批量章节摘要、AI 用户交互工具、记忆管理增强',
  },
];

const mockDocContent = '# 快速开始\n\n这是帮助文档的内容。\n\n## 功能介绍\n\n...';

// 获取工具引用
function getTool(name: string) {
  return helpDocsTools.find((t) => t.definition.function.name === name);
}

describe('HelpDocsTools', () => {
  const context: ToolContext = {};

  let axiosGetSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    // Mock axios.get 返回帮助文档索引
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    axiosGetSpy = spyOn(axios, 'get').mockImplementation((url: string): any => {
      if (typeof url === 'string' && url.includes('index.json')) {
        return Promise.resolve({ data: mockHelpIndex });
      }
      if (typeof url === 'string' && url.includes('.md')) {
        return Promise.resolve({ data: mockDocContent });
      }
      return Promise.reject(new Error(`未知的请求路径: ${url}`));
    });
  });

  afterEach(() => {
    mock.restore();
  });

  // 8.1 测试 search_help_docs 工具的关键词搜索功能
  describe('search_help_docs', () => {
    test('应该能根据关键词搜索帮助文档', async () => {
      const tool = getTool('search_help_docs');
      expect(tool).toBeDefined();

      const result = await tool!.handler({ query: '模型' }, context);
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.data.docs.length).toBeGreaterThan(0);
      // 应该匹配到 "AI 模型配置"
      const hasModelDoc = parsed.data.docs.some((d: { id: string }) => d.id === 'ai-models-guide');
      expect(hasModelDoc).toBe(true);
    });

    // 8.2 测试空结果处理
    test('当关键词无匹配时应返回空数组', async () => {
      const tool = getTool('search_help_docs');
      expect(tool).toBeDefined();

      const result = await tool!.handler({ query: '完全不存在的关键词xyz' }, context);
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.data.docs).toHaveLength(0);
      expect(parsed.data.total).toBe(0);
    });

    // 8.3 测试无效查询处理
    test('当查询为空时应返回错误', async () => {
      const tool = getTool('search_help_docs');
      expect(tool).toBeDefined();

      const result = await tool!.handler({ query: '' }, context);
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBeDefined();
    });

    test('当查询为非字符串时应返回错误', async () => {
      const tool = getTool('search_help_docs');
      expect(tool).toBeDefined();

      const result = await tool!.handler({ query: 123 }, context);
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBeDefined();
    });

    // 8.4 大小写不敏感测试
    test('搜索应该大小写不敏感', async () => {
      const tool = getTool('search_help_docs');
      expect(tool).toBeDefined();

      const result = await tool!.handler({ query: 'AI' }, context);
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.data.docs.length).toBeGreaterThan(0);

      // 小写搜索也应该匹配
      const resultLower = await tool!.handler({ query: 'ai' }, context);
      const parsedLower = JSON.parse(resultLower);

      expect(parsedLower.success).toBe(true);
      expect(parsedLower.data.docs.length).toBe(parsed.data.docs.length);
    });

    // 8.8 测试中文关键词搜索功能
    test('应该支持中文关键词搜索', async () => {
      const tool = getTool('search_help_docs');
      expect(tool).toBeDefined();

      const result = await tool!.handler({ query: '术语' }, context);
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.data.docs.length).toBeGreaterThan(0);
      const hasTermDoc = parsed.data.docs.some(
        (d: { id: string }) => d.id === 'book-details-terminology',
      );
      expect(hasTermDoc).toBe(true);
    });

    test('应该支持在描述中搜索中文关键词', async () => {
      const tool = getTool('search_help_docs');
      expect(tool).toBeDefined();

      const result = await tool!.handler({ query: '翻译一致性' }, context);
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.data.docs.length).toBeGreaterThan(0);
    });
  });

  // 8.4-8.6 测试 get_help_doc 工具
  describe('get_help_doc', () => {
    // 8.4 测试文档获取功能
    test('应该能获取指定文档的内容', async () => {
      const tool = getTool('get_help_doc');
      expect(tool).toBeDefined();

      const result = await tool!.handler({ doc_id: 'front-page' }, context);
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.data).toBeDefined();
      expect(parsed.data.title).toBe('快速开始');
      expect(parsed.data.content).toBe(mockDocContent);
      expect(parsed.data.category).toBe('使用指南');
      expect(parsed.data.file).toBe('front-page.md');
    });

    // 8.5 测试无效 ID 处理
    test('当文档 ID 不存在时应返回错误', async () => {
      const tool = getTool('get_help_doc');
      expect(tool).toBeDefined();

      const result = await tool!.handler({ doc_id: 'non-existent-doc' }, context);
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('未找到');
    });

    // 8.6 测试缺失参数处理
    test('当缺少文档 ID 参数时应返回错误', async () => {
      const tool = getTool('get_help_doc');
      expect(tool).toBeDefined();

      const result = await tool!.handler({}, context);
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBeDefined();
    });

    test('当文档 ID 为空字符串时应返回错误', async () => {
      const tool = getTool('get_help_doc');
      expect(tool).toBeDefined();

      const result = await tool!.handler({ doc_id: '' }, context);
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBeDefined();
    });

    // 8.9 测试中文文档内容获取功能
    test('应该能获取中文帮助文档的内容', async () => {
      const tool = getTool('get_help_doc');
      expect(tool).toBeDefined();

      const result = await tool!.handler({ doc_id: 'book-details-terminology' }, context);
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.data).toBeDefined();
      expect(parsed.data.title).toBe('术语管理');
      expect(parsed.data.content).toBeDefined();
    });
  });

  // 8.7 测试 list_help_docs 工具
  describe('list_help_docs', () => {
    test('应该列出所有帮助文档并按类别分组', async () => {
      const tool = getTool('list_help_docs');
      expect(tool).toBeDefined();

      const result = await tool!.handler({}, context);
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.data).toBeDefined();
      expect(parsed.data.total).toBe(mockHelpIndex.length);
      expect(parsed.data.categories).toBeDefined();
      // 应该有 "使用指南"、"书籍详情页"、"更新日志" 三个分类
      expect(Object.keys(parsed.data.categories).length).toBe(3);
      expect(parsed.data.categories['使用指南']).toBeDefined();
      expect(parsed.data.categories['书籍详情页']).toBeDefined();
      expect(parsed.data.categories['更新日志']).toBeDefined();
    });

    test('当没有帮助文档时应返回空列表', async () => {
      // 覆盖 mock 返回空数组
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      axiosGetSpy.mockImplementation((url: string): any => {
        if (typeof url === 'string' && url.includes('index.json')) {
          return Promise.resolve({ data: [] });
        }
        return Promise.reject(new Error(`未知的请求路径: ${url}`));
      });

      const tool = getTool('list_help_docs');
      expect(tool).toBeDefined();

      const result = await tool!.handler({}, context);
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.data.total).toBe(0);
    });
  });

  // 8.10 测试网络错误处理
  describe('网络错误处理', () => {
    test('search_help_docs 在网络错误时应返回错误信息', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      axiosGetSpy.mockImplementation((): any => {
        return Promise.reject(new Error('Network Error'));
      });

      const tool = getTool('search_help_docs');
      expect(tool).toBeDefined();

      const result = await tool!.handler({ query: '测试' }, context);
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('获取帮助文档索引失败');
    });

    test('get_help_doc 在网络错误时应返回错误信息', async () => {
      // 索引请求成功，但文档内容请求失败
      let callCount = 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      axiosGetSpy.mockImplementation((url: string): any => {
        callCount++;
        if (typeof url === 'string' && url.includes('index.json')) {
          return Promise.resolve({ data: mockHelpIndex });
        }
        return Promise.reject(new Error('Network Error'));
      });

      const tool = getTool('get_help_doc');
      expect(tool).toBeDefined();

      const result = await tool!.handler({ doc_id: 'front-page' }, context);
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('获取帮助文档内容失败');
    });

    test('list_help_docs 在网络错误时应返回错误信息', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      axiosGetSpy.mockImplementation((): any => {
        return Promise.reject(new Error('Network Error'));
      });

      const tool = getTool('list_help_docs');
      expect(tool).toBeDefined();

      const result = await tool!.handler({}, context);
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('获取帮助文档索引失败');
    });
  });
});
