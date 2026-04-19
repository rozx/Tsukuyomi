import './setup';
import { describe, test, expect, beforeEach, mock } from 'bun:test';

// 其它测试文件(如 sync-data-service.test.ts)可能 `mock.module('src/stores/settings', ...)`
// 替换了整个 store 模块;bun:test 的模块 mock 跨文件持久,这里自己显式 mock 一份,
// 提供一个可切换的 `enableLocalEmbedding` 变量,确保测试隔离不依赖加载顺序。
let mockEnableLocalEmbedding = false;
mock.module('src/stores/settings', () => ({
  useSettingsStore: () => ({
    settings: {
      get enableLocalEmbedding() {
        return mockEnableLocalEmbedding;
      },
    },
  }),
}));

// Import 必须放在 mock 之后
const { ToolRegistry } = await import('src/services/ai/tools');

describe('ToolRegistry: query_chapter gated on enableLocalEmbedding', () => {
  beforeEach(() => {
    mockEnableLocalEmbedding = false;
  });

  test('总开关关闭时,getBookTools 不返回 query_chapter', () => {
    mockEnableLocalEmbedding = false;
    const tools = ToolRegistry.getBookTools('book-1');
    expect(tools.some((t) => t.function.name === 'query_chapter')).toBe(false);
    // 其它 book 工具仍然存在(回归保护)
    expect(tools.some((t) => t.function.name === 'get_book_info')).toBe(true);
    expect(tools.some((t) => t.function.name === 'list_chapters')).toBe(true);
  });

  test('总开关开启时,getBookTools 正常返回 query_chapter', () => {
    mockEnableLocalEmbedding = true;
    const tools = ToolRegistry.getBookTools('book-1');
    expect(tools.some((t) => t.function.name === 'query_chapter')).toBe(true);
  });

  test('getAllTools 继承过滤结果:关闭时整个工具图里都不含 query_chapter', () => {
    mockEnableLocalEmbedding = false;
    const tools = ToolRegistry.getAllTools('book-1');
    expect(tools.some((t) => t.function.name === 'query_chapter')).toBe(false);
  });

  test('getSingleParagraphPolishTools 继承过滤结果:关闭时整个工具图里都不含 query_chapter', () => {
    mockEnableLocalEmbedding = false;
    const tools = ToolRegistry.getSingleParagraphPolishTools('book-1');
    expect(tools.some((t) => t.function.name === 'query_chapter')).toBe(false);
  });
});
