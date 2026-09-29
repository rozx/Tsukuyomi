import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import type { Chapter, Novel } from '../models/novel';
import { ChapterService } from '../services/chapter-service';
import { Blob as NodeBlob } from 'node:buffer';

afterEach(() => vi.restoreAllMocks());

const book: Novel = {
  id: 'b',
  title: '书',
  targetLanguage: 'en-US',
  normalizeSymbolsOnDisplay: true,
  normalizeTitleOnDisplay: true,
  createdAt: new Date(0),
  lastEdited: new Date(0),
};
const chapter: Chapter = {
  id: 'c',
  title: {
    original: '第110话 Original',
    translation: { id: 'cn-title', translation: '中文章名', aiModelId: '' },
  },
  createdAt: new Date(0),
  lastEdited: new Date(0),
  content: [
    {
      id: 'p1',
      text: '原文一',
      selectedTranslationId: 'cn',
      translations: [
        { id: 'cn', translation: '中文译文', language: 'zh-CN', aiModelId: '' },
        { id: 'en', translation: '"English" — Dr. Smith.', language: 'en-US', aiModelId: '' },
      ],
      selectedTranslations: {
        'en-US': { value: 'en', revision: { counter: 1, actorId: 'a' }, updatedAt: 1 },
      },
    },
    {
      id: 'p2',
      text: 'Untranslated — "source".',
      selectedTranslationId: 'cn2',
      translations: [{ id: 'cn2', translation: '别的中文', language: 'zh-CN', aiModelId: '' }],
    },
  ],
};

describe('目标语言导出', () => {
  it('txt 和 json 文件保持目标语言及原文回退', async () => {
    let exported: NodeBlob | undefined;
    vi.stubGlobal('Blob', NodeBlob);
    vi.stubGlobal('URL', {
      createObjectURL: (blob: NodeBlob) => {
        exported = blob;
        return 'blob:export';
      },
      revokeObjectURL: () => {},
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    try {
      for (const format of ['txt', 'json'] as const) {
        await ChapterService.exportChapter(chapter, 'translation', format, book);
        const text = await exported!.text();
        if (format === 'json') {
          expect(JSON.parse(text)).toEqual({
            title: '第110话 Original',
            content: [
              { original: '原文一', translation: '"English" — Dr. Smith.' },
              { original: 'Untranslated — "source".', translation: 'Untranslated — "source".' },
            ],
          });
        } else {
          expect(text).toContain('"English" — Dr. Smith.');
          expect(text).toContain('Untranslated — "source".');
          expect(text).not.toContain('中文译文');
        }
      }
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('译文与双语剪贴板使用英文选用及逐字原文回退', async () => {
    const writeText = vi.fn(async (_text: string) => {});
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    try {
      for (const type of ['translation', 'bilingual'] as const) {
        await ChapterService.exportChapter(chapter, type, 'clipboard', book);
        const text = writeText.mock.calls.at(-1)![0];
        expect(text).toContain('第110话 Original');
        expect(text).toContain('"English" — Dr. Smith.');
        expect(text).toContain('Untranslated — "source".');
        expect(text).not.toContain('中文译文');
        expect(text).not.toContain('别的中文');
      }
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
