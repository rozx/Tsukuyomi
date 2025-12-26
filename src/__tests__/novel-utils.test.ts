// Bun 测试框架提供全局函数，直接使用即可
// 这些函数在运行时由 Bun 提供，无需导入
// 使用函数签名类型避免 import() 类型注解（符合 ESLint 规范）

declare const describe: (name: string, fn: () => void) => void;

declare const test: (name: string, fn: () => void | Promise<void>) => void;

declare const expect: (actual: unknown) => {
  toBe: (expected: unknown) => void;
  toBeNull: () => void;
  toBeTruthy: () => void;
  toBeFalsy: () => void;
  toEqual: (expected: unknown) => void;
  toThrow: (expected?: unknown) => void;
  toHaveLength: (expected: number) => void;
  toBeGreaterThanOrEqual: (expected: number) => void;
  rejects: {
    toThrow: (expected?: unknown) => Promise<void>;
  };
};

import { normalizeChapterTitle, getChapterDisplayTitle } from 'src/utils/novel-utils';
import type { Chapter, Novel } from 'src/models/novel';

describe('normalizeChapterTitle', () => {
  test('应该将全角数字和汉字之间的半角空格转换为全角空格', () => {
    expect(normalizeChapterTitle('５１７话 打破停滞的战场吧')).toBe('５１７话　打破停滞的战场吧');
    expect(normalizeChapterTitle('５１７话 测试')).toBe('５１７话　测试');
  });

  test('应该将汉字+半角数字和汉字之间的半角空格转换为全角空格', () => {
    expect(normalizeChapterTitle('第110话 猫屋花梨很担心姐姐')).toBe('第110话　猫屋花梨很担心姐姐');
    expect(normalizeChapterTitle('第1话 测试')).toBe('第1话　测试');
    expect(normalizeChapterTitle('第999话 内容')).toBe('第999话　内容');
  });

  test('应该将汉字+全角数字和汉字之间的半角空格转换为全角空格', () => {
    expect(normalizeChapterTitle('第５１７话 打破停滞的战场吧')).toBe('第５１７话　打破停滞的战场吧');
    expect(normalizeChapterTitle('第１话 测试')).toBe('第１话　测试');
    expect(normalizeChapterTitle('第９９９话 内容')).toBe('第９９９话　内容');
  });

  test('应该将半角数字开头和汉字之间的半角空格转换为全角空格', () => {
    expect(normalizeChapterTitle('110话 猫屋花梨很担心姐姐')).toBe('110话　猫屋花梨很担心姐姐');
    expect(normalizeChapterTitle('1话 测试')).toBe('1话　测试');
    expect(normalizeChapterTitle('999话 内容')).toBe('999话　内容');
  });

  test('应该处理多个空格的情况', () => {
    expect(normalizeChapterTitle('５１７话 打破 停滞')).toBe('５１７话　打破 停滞');
    expect(normalizeChapterTitle('第110话 猫屋 花梨')).toBe('第110话　猫屋 花梨');
  });

  test('不应该转换没有空格的情况', () => {
    expect(normalizeChapterTitle('５１７话打破')).toBe('５１７话打破');
    expect(normalizeChapterTitle('第110话测试')).toBe('第110话测试');
    expect(normalizeChapterTitle('110话测试')).toBe('110话测试');
  });

  test('不应该转换已经是全角空格的情况', () => {
    expect(normalizeChapterTitle('５１７话　打破')).toBe('５１７话　打破');
    expect(normalizeChapterTitle('第110话　猫屋')).toBe('第110话　猫屋');
    expect(normalizeChapterTitle('110话　测试')).toBe('110话　测试');
  });

  test('应该处理空字符串和无效输入', () => {
    expect(normalizeChapterTitle('')).toBe('');
    expect(normalizeChapterTitle(null as unknown as string)).toBe(null);
    expect(normalizeChapterTitle(undefined as unknown as string)).toBe(undefined);
  });

  test('不应该转换不匹配的情况', () => {
    // 没有数字的情况
    expect(normalizeChapterTitle('话 测试')).toBe('话 测试');
    // 只有数字没有汉字的情况
    expect(normalizeChapterTitle('110 测试')).toBe('110 测试');
    // 数字在中间的情况
    expect(normalizeChapterTitle('测试110 内容')).toBe('测试110 内容');
  });

  test('应该处理复杂的边界情况', () => {
    // 多个数字段
    expect(normalizeChapterTitle('第110话 第220话')).toBe('第110话　第220话');
    // 数字和汉字混合
    expect(normalizeChapterTitle('５１７话 打破110')).toBe('５１７话　打破110');
    // 长标题
    expect(normalizeChapterTitle('第110话 猫屋花梨很担心姐姐的安危')).toBe('第110话　猫屋花梨很担心姐姐的安危');
  });

  test('应该处理混合格式的标题', () => {
    // 全角数字和半角数字混合
    expect(normalizeChapterTitle('第５１７话 第110话 测试')).toBe('第５１７话　第110话　测试');
    // 全角数字开头和汉字+半角数字混合
    expect(normalizeChapterTitle('５１７话 第110话 内容')).toBe('５１７话　第110话　内容');
    // 半角数字开头和汉字+全角数字混合
    expect(normalizeChapterTitle('110话 第５１７话 测试')).toBe('110话　第５１７话　测试');
  });

  test('应该处理连续多个匹配的情况', () => {
    // 连续多个匹配
    expect(normalizeChapterTitle('第1话 第2话 第3话 测试')).toBe('第1话　第2话　第3话　测试');
    // 全角数字连续匹配
    expect(normalizeChapterTitle('第１话 第２话 第３话')).toBe('第１话　第２话　第３话');
    // 半角数字连续匹配
    expect(normalizeChapterTitle('1话 2话 3话 内容')).toBe('1话　2话　3话　内容');
  });

  test('应该处理边界字符和特殊字符', () => {
    // 包含标点符号
    expect(normalizeChapterTitle('第110话：测试')).toBe('第110话：测试');
    expect(normalizeChapterTitle('第110话 测试。')).toBe('第110话　测试。');
    // 包含其他Unicode字符
    expect(normalizeChapterTitle('第110话 测试（内容）')).toBe('第110话　测试（内容）');
    // 包含英文
    expect(normalizeChapterTitle('第110话 Chapter Test')).toBe('第110话 Chapter Test');
  });

  test('应该确保不会重复匹配同一个空格', () => {
    // 确保每个空格只被转换一次
    const result = normalizeChapterTitle('第110话 测试');
    const fullWidthSpaceCount = (result.match(/\u3000/g) || []).length;
    const halfWidthSpaceCount = (result.match(/ /g) || []).length;
    expect(result).toBe('第110话　测试');
    expect(fullWidthSpaceCount).toBe(1);
    expect(halfWidthSpaceCount).toBe(0);
  });

  test('应该处理只有数字和空格的情况（不应该匹配）', () => {
    // 只有数字，没有汉字
    expect(normalizeChapterTitle('110 220')).toBe('110 220');
    expect(normalizeChapterTitle('５１７ １１０')).toBe('５１７ １１０');
    // 数字后没有汉字
    expect(normalizeChapterTitle('110 测试')).toBe('110 测试');
    expect(normalizeChapterTitle('５１７ 测试')).toBe('５１７ 测试');
  });

  test('应该处理数字在中间的情况（不应该匹配）', () => {
    // 数字在中间，前面没有汉字或数字
    expect(normalizeChapterTitle('测试110 内容')).toBe('测试110 内容');
    expect(normalizeChapterTitle('测试５１７ 内容')).toBe('测试５１７ 内容');
    // 数字前后都有汉字，但不符合模式
    expect(normalizeChapterTitle('测试110话 内容')).toBe('测试110话 内容');
  });
});

describe('getChapterDisplayTitle with normalization', () => {
  // 创建测试用的章节对象
  function createTestChapter(title: string, normalizeTitleOnDisplay?: boolean): Chapter {
    return {
      id: 'test-chapter-1',
      title: {
        original: title,
        translation: {
          id: 'trans-1',
          translation: '',
          aiModelId: '',
        },
      },
      normalizeTitleOnDisplay,
      lastEdited: new Date(),
      createdAt: new Date(),
    };
  }

  // 创建测试用的书籍对象
  function createTestBook(normalizeTitleOnDisplay?: boolean): Novel {
    return {
      id: 'test-book-1',
      title: 'Test Book',
      lastEdited: new Date(),
      createdAt: new Date(),
      normalizeTitleOnDisplay,
    };
  }

  test('应该根据章节级别的设置应用规范化', () => {
    const chapter = createTestChapter('５１７话 打破停滞的战场吧', true);
    expect(getChapterDisplayTitle(chapter)).toBe('５１７话　打破停滞的战场吧');
  });

  test('应该根据书籍级别的设置应用规范化', () => {
    const chapter = createTestChapter('第110话 猫屋花梨很担心姐姐');
    const book = createTestBook(true);
    expect(getChapterDisplayTitle(chapter, book)).toBe('第110话　猫屋花梨很担心姐姐');
  });

  test('章节级别的设置应该覆盖书籍级别的设置', () => {
    const chapter = createTestChapter('５１７话 打破停滞的战场吧', false);
    const book = createTestBook(true);
    expect(getChapterDisplayTitle(chapter, book)).toBe('５１７话 打破停滞的战场吧');
  });

  test('如果章节级别启用，应该应用规范化', () => {
    const chapter = createTestChapter('第110话 猫屋花梨很担心姐姐', true);
    const book = createTestBook(false);
    expect(getChapterDisplayTitle(chapter, book)).toBe('第110话　猫屋花梨很担心姐姐');
  });

  test('如果都没有启用，不应该应用规范化', () => {
    const chapter = createTestChapter('５１７话 打破停滞的战场吧', false);
    const book = createTestBook(false);
    expect(getChapterDisplayTitle(chapter, book)).toBe('５１７话 打破停滞的战场吧');
  });

  test('应该处理翻译标题', () => {
    const chapter: Chapter = {
      id: 'test-chapter-1',
      title: {
        original: '５１７話 打破停滞的战场吧',
        translation: {
          id: 'trans-1',
          translation: '５１７话 打破停滞的战场吧',
          aiModelId: '',
        },
      },
      normalizeTitleOnDisplay: true,
      lastEdited: new Date(),
      createdAt: new Date(),
    };
    expect(getChapterDisplayTitle(chapter)).toBe('５１７话　打破停滞的战场吧');
  });

  test('应该处理旧数据格式（字符串标题）', () => {
    const chapter = {
      id: 'test-chapter-1',
      title: '第110话 猫屋花梨很担心姐姐' as unknown as Chapter['title'],
      normalizeTitleOnDisplay: true,
      lastEdited: new Date(),
      createdAt: new Date(),
    } as Chapter;
    expect(getChapterDisplayTitle(chapter)).toBe('第110话　猫屋花梨很担心姐姐');
  });

  test('应该处理没有标题的情况', () => {
    const chapter: Chapter = {
      id: 'test-chapter-1',
      title: {
        original: '',
        translation: {
          id: 'trans-1',
          translation: '',
          aiModelId: '',
        },
      },
      lastEdited: new Date(),
      createdAt: new Date(),
    };
    expect(getChapterDisplayTitle(chapter)).toBe('');
  });

  test('应该处理 null 和 undefined 的章节', () => {
    expect(getChapterDisplayTitle(null as unknown as Chapter)).toBe('');
    expect(getChapterDisplayTitle(undefined as unknown as Chapter)).toBe('');
  });

  test('应该处理没有 title 字段的章节', () => {
    const chapter = {
      id: 'test-chapter-1',
      lastEdited: new Date(),
      createdAt: new Date(),
    } as Chapter;
    expect(getChapterDisplayTitle(chapter)).toBe('');
  });

  test('应该处理只有原文没有翻译的情况', () => {
    const chapter: Chapter = {
      id: 'test-chapter-1',
      title: {
        original: '第110话 测试',
        translation: {
          id: 'trans-1',
          translation: '',
          aiModelId: '',
        },
      },
      normalizeTitleOnDisplay: true,
      lastEdited: new Date(),
      createdAt: new Date(),
    };
    expect(getChapterDisplayTitle(chapter)).toBe('第110话　测试');
  });

  test('应该处理翻译为空字符串的情况', () => {
    const chapter: Chapter = {
      id: 'test-chapter-1',
      title: {
        original: '第110话 测试',
        translation: {
          id: 'trans-1',
          translation: '   ', // 只有空格
          aiModelId: '',
        },
      },
      normalizeTitleOnDisplay: true,
      lastEdited: new Date(),
      createdAt: new Date(),
    };
    // 应该使用原文
    expect(getChapterDisplayTitle(chapter)).toBe('第110话　测试');
  });

  test('应该处理各种数字格式的组合', () => {
    const testCases = [
      { input: '５１７话 打破', expected: '５１７话　打破', enabled: true },
      { input: '第110话 猫屋', expected: '第110话　猫屋', enabled: true },
      { input: '110话 测试', expected: '110话　测试', enabled: true },
      { input: '５１７话 打破', expected: '５１７话 打破', enabled: false },
      { input: '第110话 猫屋', expected: '第110话 猫屋', enabled: false },
    ];

    testCases.forEach(({ input, expected, enabled }) => {
      const chapter = createTestChapter(input, enabled);
      expect(getChapterDisplayTitle(chapter)).toBe(expected);
    });
  });
});

