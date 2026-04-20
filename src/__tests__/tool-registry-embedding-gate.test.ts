import './setup';
import { describe, test, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import * as SettingsStore from 'src/stores/settings';

// 其它测试文件可能会替换整个 settings store；这里用 spyOn 局部接管 useSettingsStore，
// 避免 mock.module 在 bun:test 中跨文件持久污染。
let mockEnableLocalEmbedding = false;
const { ToolRegistry } = await import('src/services/ai/tools');

describe('ToolRegistry: query_chapter gated on enableLocalEmbedding', () => {
  beforeEach(() => {
    mockEnableLocalEmbedding = false;
    spyOn(SettingsStore, 'useSettingsStore').mockReturnValue({
      settings: {
        get enableLocalEmbedding() {
          return mockEnableLocalEmbedding;
        },
        set enableLocalEmbedding(value: boolean) {
          mockEnableLocalEmbedding = value;
        },
        quickStartDismissed: false,
      },
      isLoaded: true,
      loadSettings: () => Promise.resolve(),
      setQuickStartDismissed: () => Promise.resolve(),
    } as any);
  });

  afterEach(() => {
    mock.restore();
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
