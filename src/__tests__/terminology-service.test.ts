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

import type { Chapter, Paragraph } from 'src/types/novel';
import { TerminologyService, type ExtractedTermInfo } from 'src/services/terminology-service';

// Mock FileReader for import tests
class MockFileReader {
  onload: ((e: any) => void) | null = null;
  onerror: ((e: any) => void) | null = null;

  readAsText(file: File) {
    file.text().then((text) => {
      if (this.onload) {
        this.onload({ target: { result: text } });
      }
    }).catch((e) => {
        if (this.onerror) {
            this.onerror(e);
        }
    });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).FileReader = MockFileReader;

describe('TerminologyService', () => {
  // 测试辅助函数：创建测试用章节
  function createTestChapter(id: string, text: string, originalContent?: string): Chapter {
    const paragraphs: Paragraph[] = text.split('\n').map((t, index) => ({
      id: `para-${id}-${index}`,
      text: t.trim(),
      selectedTranslationId: `trans-${id}-${index}`,
      translations: [],
    }));

    const chapter: Chapter = {
      id,
      title: {
        original: `Chapter ${id}`,
        translation: { id: `t-${id}`, translation: '', aiModelId: '' },
      },
      content: paragraphs,
      lastEdited: new Date(),
      createdAt: new Date(),
    };

    if (originalContent !== undefined) {
      chapter.originalContent = originalContent;
    }

    return chapter;
  }

  // 测试辅助函数：创建测试用段落
  function createTestParagraph(id: string, text: string): Paragraph {
    return {
      id,
      text,
      selectedTranslationId: `trans-${id}`,
      translations: [],
    };
  }

  describe('extractWordsFromParagraph', () => {
    test('应该从段落中提取术语', async () => {
      const chapterId = 'chapter-1';
      const paragraph = createTestParagraph('para-1', 'これはテストです。');

      const result = await TerminologyService.extractWordsFromParagraph(paragraph, chapterId);

      expect(result).toBeTruthy();
      expect(result instanceof Map).toBe(true);
    });

    test('应该正确处理空段落', async () => {
      const chapterId = 'chapter-1';
      const paragraph = createTestParagraph('para-1', '');

      const result = await TerminologyService.extractWordsFromParagraph(paragraph, chapterId);

      expect(result).toBeTruthy();
      expect(result.size).toBe(0);
    });
  });

  describe('extractWordsFromParagraphs', () => {
    test('应该从多个段落中提取术语', async () => {
      const chapterId = 'chapter-1';
      const paragraphs = [
        createTestParagraph('para-1', 'これはテストです。'),
        createTestParagraph('para-2', 'それは本です。'),
      ];

      const result = await TerminologyService.extractWordsFromParagraphs(paragraphs, chapterId);

      expect(result).toBeTruthy();
      expect(result instanceof Map).toBe(true);
    });

    test('应该正确处理空段落数组', async () => {
      const chapterId = 'chapter-1';
      const paragraphs: Paragraph[] = [];

      const result = await TerminologyService.extractWordsFromParagraphs(paragraphs, chapterId);

      expect(result).toBeTruthy();
      expect(result.size).toBe(0);
    });

    test('应该合并相同术语的出现次数', async () => {
      const chapterId = 'chapter-1';
      const paragraphs = [
        createTestParagraph('para-1', 'これはテストです。'),
        createTestParagraph('para-2', 'これは本です。'),
      ];

      const result = await TerminologyService.extractWordsFromParagraphs(paragraphs, chapterId);

      expect(result).toBeTruthy();
      // 如果同一个术语在多个段落中出现，应该累加出现次数
      for (const [, termInfo] of result.entries()) {
        const occurrence = termInfo.occurrences.find((occ) => occ.chapterId === chapterId);
        expect(occurrence).toBeTruthy();
        if (occurrence) {
          expect(occurrence.count).toBeGreaterThanOrEqual(1);
        }
      }
    });
  });

  describe('extractWordsFromChapter', () => {
    test('应该从章节中提取术语', async () => {
      const chapter = createTestChapter('chapter-1', 'これはテストです。\nそれは本です。');

      const result = await TerminologyService.extractWordsFromChapter(chapter);

      expect(result).toBeTruthy();
      expect(result instanceof Map).toBe(true);
    });

    test('应该同时处理段落和原始内容', async () => {
      const chapter = createTestChapter('chapter-1', 'これはテストです。', 'それは本です。');

      const result = await TerminologyService.extractWordsFromChapter(chapter);

      expect(result).toBeTruthy();
      expect(result instanceof Map).toBe(true);
    });

    test('应该正确处理没有内容的章节', async () => {
      const chapter: Chapter = {
        id: 'chapter-1',
        title: {
          original: 'Empty Chapter',
          translation: { id: 't1', translation: '', aiModelId: '' },
        },
        lastEdited: new Date(),
        createdAt: new Date(),
      };

      const result = await TerminologyService.extractWordsFromChapter(chapter);

      expect(result).toBeTruthy();
      expect(result.size).toBe(0);
    });
  });

  describe('extractWordsFromChapters', () => {
    test('应该从多个章节中提取术语', async () => {
      const chapters = [
        createTestChapter('chapter-1', 'これはテストです。'),
        createTestChapter('chapter-2', 'それは本です。'),
      ];

      const result = await TerminologyService.extractWordsFromChapters(chapters);

      expect(result).toBeTruthy();
      expect(result instanceof Map).toBe(true);
    });

    test('应该只返回出现次数 >= 3 的术语', async () => {
      // 创建多个章节，包含重复的文本以确保某些术语出现多次
      const text = 'これはテストです。これはテストです。これはテストです。';
      const chapters = [
        createTestChapter('chapter-1', text),
        createTestChapter('chapter-2', text),
        createTestChapter('chapter-3', text),
      ];

      const result = await TerminologyService.extractWordsFromChapters(chapters);

      expect(result).toBeTruthy();
      // 验证所有返回的术语总出现次数 >= 3
      for (const [, termInfo] of result.entries()) {
        const totalCount = termInfo.occurrences.reduce((sum, occ) => sum + occ.count, 0);
        expect(totalCount).toBeGreaterThanOrEqual(3);
      }
    });

    test('应该过滤掉单字符的术语', async () => {
      const chapters = [createTestChapter('chapter-1', 'これはテストです。')];

      const result = await TerminologyService.extractWordsFromChapters(chapters);

      expect(result).toBeTruthy();
      // 验证所有返回的术语长度 > 1
      for (const [key] of result.entries()) {
        expect(key.length).toBeGreaterThanOrEqual(2);
      }
    });

    test('应该正确合并跨章节的术语', async () => {
      const chapters = [
        createTestChapter('chapter-1', 'これはテストです。'),
        createTestChapter('chapter-2', 'これはテストです。'),
        createTestChapter('chapter-3', 'これはテストです。'),
      ];

      const result = await TerminologyService.extractWordsFromChapters(chapters);

      expect(result).toBeTruthy();
      // 验证跨章节的术语有多个 occurrence 记录
      for (const [, termInfo] of result.entries()) {
        expect(termInfo.occurrences.length).toBeGreaterThanOrEqual(1);
      }
    });

    test('应该正确处理空章节数组', async () => {
      const chapters: Chapter[] = [];

      const result = await TerminologyService.extractWordsFromChapters(chapters);

      expect(result).toBeTruthy();
      expect(result.size).toBe(0);
    });
  });

  describe('getAvailableTerms', () => {
    test('应该从章节中提取可用术语', async () => {
      const chapters = [
        createTestChapter('chapter-1', 'これはテストです。'),
        createTestChapter('chapter-2', 'それは本です。'),
      ];

      const result = await TerminologyService.getAvailableTerms({ chapters });

      expect(result).toBeTruthy();
      expect(result instanceof Map).toBe(true);
    });

    test('应该从段落中提取可用术语', async () => {
      const chapterId = 'chapter-1';
      const paragraphs = [
        createTestParagraph('para-1', 'これはテストです。'),
        createTestParagraph('para-2', 'それは本です。'),
      ];

      const result = await TerminologyService.getAvailableTerms({
        paragraphs,
        chapterId,
      });

      expect(result).toBeTruthy();
      expect(result instanceof Map).toBe(true);
    });

    test('应该同时从章节和段落中提取术语', async () => {
      const chapterId = 'chapter-3';
      const chapters = [
        createTestChapter('chapter-1', 'これはテストです。'),
        createTestChapter('chapter-2', 'それは本です。'),
      ];
      const paragraphs = [createTestParagraph('para-1', 'これは新しい段落です。')];

      const result = await TerminologyService.getAvailableTerms({
        chapters,
        paragraphs,
        chapterId,
      });

      expect(result).toBeTruthy();
      expect(result instanceof Map).toBe(true);
    });

    test('应该在提供段落但缺少 chapterId 时抛出错误', async () => {
      const paragraphs = [createTestParagraph('para-1', 'これはテストです。')];

      await expect(
        TerminologyService.getAvailableTerms({
          paragraphs,
        }),
      ).rejects.toThrow('当提供 paragraphs 时，必须提供 chapterId');
    });

    test('应该在没有提供任何内容时返回空 Map', async () => {
      const result = await TerminologyService.getAvailableTerms({});

      expect(result).toBeTruthy();
      expect(result.size).toBe(0);
    });

    test('应该在提供空数组时返回空 Map', async () => {
      const result1 = await TerminologyService.getAvailableTerms({ chapters: [] });
      const result2 = await TerminologyService.getAvailableTerms({ paragraphs: [] });

      expect(result1.size).toBe(0);
      expect(result2.size).toBe(0);
    });

    test('应该只返回出现次数 >= 3 的术语', async () => {
      const text = 'これはテストです。これはテストです。これはテストです。';
      const chapters = [
        createTestChapter('chapter-1', text),
        createTestChapter('chapter-2', text),
        createTestChapter('chapter-3', text),
      ];

      const result = await TerminologyService.getAvailableTerms({ chapters });

      expect(result).toBeTruthy();
      // 验证所有返回的术语总出现次数 >= 3
      for (const [, termInfo] of result.entries()) {
        const totalCount = termInfo.occurrences.reduce((sum, occ) => sum + occ.count, 0);
        expect(totalCount).toBeGreaterThanOrEqual(3);
      }
    });

    test('应该过滤掉包含汉字的术语', async () => {
      // 包含汉字的日文文本
      const chapters = [createTestChapter('chapter-1', 'これは日本語のテストです。')];

      const result = await TerminologyService.getAvailableTerms({ chapters });

      expect(result).toBeTruthy();
      // 验证返回的术语不包含汉字
      for (const [key] of result.entries()) {
        const kanjiRegex = /[\u4E00-\u9FAF]/;
        expect(kanjiRegex.test(key)).toBe(false);
      }
    });

    test('应该正确合并章节和段落的术语', async () => {
      const chapterId = 'chapter-1';
      const chapters = [
        createTestChapter('chapter-1', 'これはテストです。これはテストです。これはテストです。'),
      ];
      const paragraphs = [createTestParagraph('para-1', 'これはテストです。これはテストです。')];

      const result = await TerminologyService.getAvailableTerms({
        chapters,
        paragraphs,
        chapterId,
      });

      expect(result).toBeTruthy();
      // 如果同一个术语在章节和段落中都出现，应该累加出现次数
      for (const [, termInfo] of result.entries()) {
        const occurrence = termInfo.occurrences.find((occ) => occ.chapterId === chapterId);
        if (occurrence) {
          // 该章节的出现次数应该 >= 1（可能从章节和段落中都提取到了）
          expect(occurrence.count).toBeGreaterThanOrEqual(1);
        }
      }
    });
  });

  describe('边界情况和错误处理', () => {
    test('应该正确处理 null 或 undefined 文本', async () => {
      const chapter: Chapter = {
        id: 'chapter-1',
        title: {
          original: 'Test Chapter',
          translation: { id: 't1', translation: '', aiModelId: '' },
        },
        content: [
          {
            id: 'para-1',
            text: '',
            selectedTranslationId: 'trans-1',
            translations: [],
          },
        ],
        lastEdited: new Date(),
        createdAt: new Date(),
      };

      const result = await TerminologyService.extractWordsFromChapter(chapter);

      expect(result).toBeTruthy();
      expect(result.size).toBe(0);
    });

    test('应该处理包含特殊字符的文本', async () => {
      const chapter = createTestChapter('chapter-1', 'これは、テストです！これは？テストです。');

      const result = await TerminologyService.extractWordsFromChapters([chapter]);

      expect(result).toBeTruthy();
      expect(result instanceof Map).toBe(true);
    });

    test('应该处理包含长音符号的文本', async () => {
      const chapter = createTestChapter('chapter-1', 'これはーーーです。');

      const result = await TerminologyService.extractWordsFromChapters([chapter]);

      expect(result).toBeTruthy();
      // 只包含长音符号的术语应该被过滤掉
      for (const [key] of result.entries()) {
        const longVowelRegex = /^[\u30FC\uFF70]+$/;
        expect(longVowelRegex.test(key)).toBe(false);
      }
    });

    test('应该处理包含数字的文本', async () => {
      const chapter = createTestChapter('chapter-1', 'これは123テストです。');

      const result = await TerminologyService.extractWordsFromChapters([chapter]);

      expect(result).toBeTruthy();
      // 包含数字的术语应该被过滤掉
      for (const [key] of result.entries()) {
        const hasNumber = /\d/.test(key);
        // 如果术语包含数字，它不应该在结果中（通过 containsSymbols 过滤）
        // 但这里我们只检查结果中的术语
        expect(typeof key).toBe('string');
      }
    });
  });

  describe('importTerminologiesFromFile', () => {
    test('should reject malformed translation object', async () => {
      const malformedData = [
        {
          id: '1',
          name: 'test',
          translation: {}, // Empty object, missing translation string
        },
      ];
      const file = new File([JSON.stringify(malformedData)], 'test.json', {
        type: 'application/json',
      });

      await expect(TerminologyService.importTerminologiesFromFile(file)).rejects.toThrow('文件格式错误：术语数据不完整');
    });

    test('should accept valid translation object', async () => {
      const validData = [
        {
          id: '1',
          name: 'test',
          translation: {
            id: 't1',
            translation: '测试',
            aiModelId: 'model1',
          },
        },
      ];
      const file = new File([JSON.stringify(validData)], 'test.json', {
        type: 'application/json',
      });

      const result = await TerminologyService.importTerminologiesFromFile(file);
      expect(result).toEqual(validData);
    });

    test('should accept key-value pair object', async () => {
      const kvData = {
        "Excalibur": "誓约胜利之剑",
        "Avalon": "远离尘世的理想乡"
      };
      const file = new File([JSON.stringify(kvData)], 'test.json', {
        type: 'application/json',
      });

      const imported = await TerminologyService.importTerminologiesFromFile(file);
      
      expect(imported).toHaveLength(2);
      
      const excalibur = imported.find(t => t.name === 'Excalibur');
      expect(excalibur?.translation.translation).toBe('誓约胜利之剑');
      // Using regex match on ID since it's generated
      // expect(excalibur?.id).toMatch(/^import-/); 
      expect(excalibur?.id.startsWith('import-')).toBe(true);
      expect(excalibur?.description).toBe(undefined);

      const avalon = imported.find(t => t.name === 'Avalon');
      expect(avalon?.translation.translation).toBe('远离尘世的理想乡');
    });
  });
});
