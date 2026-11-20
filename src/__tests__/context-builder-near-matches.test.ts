import './setup';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Novel } from 'src/models/novel';
import { captureExecutionLanguages } from 'src/services/ai/tasks/utils/execution-languages';
import {
  buildIndependentChunkPrompt,
  buildPreviousChapterSection,
  buildSingleParagraphDefaultContext,
  loadPreviousChapterContinuity,
} from 'src/services/ai/tasks/utils/context-builder';
import { useBooksStore } from 'src/stores/books';
import { useSettingsStore } from 'src/stores/settings';

const BOOK_ID = 'book-near-1';

function createBook(): Novel {
  const now = new Date();
  return {
    id: BOOK_ID,
    title: '近似匹配测试书',
    targetLanguage: 'zh-CN',
    terminologies: [
      {
        id: 'term-saint',
        name: 'エロ聖女',
        translation: { id: 'tt-s', translation: '色情圣女', aiModelId: 'm1' },
      },
      {
        id: 'term-stone',
        name: '月光石',
        translation: { id: 'tt-m', translation: '月光石', aiModelId: 'm1' },
      },
    ],
    characterSettings: [
      {
        id: 'char-alex',
        name: 'アレクサンドラ',
        sex: 'female',
        description: '',
        speakingStyle: '',
        translation: { id: 'ct-a', translation: '亚历山德拉', aiModelId: 'm1' },
        aliases: [],
      },
    ],
    volumes: [],
    createdAt: now,
    lastEdited: now,
  };
}

const TEXT = '月光石を持つエロ性女と、アレクサンドロが出会った。';

describe('站内翻译上下文里的「可能相关」术语与角色', () => {
  beforeEach(async () => {
    await useSettingsStore().loadSettings();
    await useBooksStore().loadBooks();
    await useBooksStore().addBook(createBook());
  });

  it('分块翻译：确定命中的照常列出，写错字的另列为可能相关并标明原文写法', async () => {
    const prompt = await buildIndependentChunkPrompt(
      'translation',
      0,
      1,
      TEXT,
      '',
      '',
      undefined,
      undefined,
      BOOK_ID,
      false,
      undefined,
      captureExecutionLanguages('zh-CN'),
    );
    expect(prompt).toContain('月光石 → 月光石');
    expect(prompt).toMatch(/可能相关[^\n]*\n?[^\n]*エロ性女 ≈ エロ聖女 → 色情圣女/);
    expect(prompt).toContain('アレクサンドロ ≈ アレクサンドラ → 亚历山德拉');
  });

  it('没有近似写法时不出现「可能相关」一节', async () => {
    const prompt = await buildIndependentChunkPrompt(
      'translation',
      0,
      1,
      '月光石が輝いた。',
      '',
      '',
      undefined,
      undefined,
      BOOK_ID,
      false,
      undefined,
      captureExecutionLanguages('zh-CN'),
    );
    expect(prompt).toContain('月光石 → 月光石');
    expect(prompt).not.toContain('可能相关');
  });

  it('单段润色 / 校对的术语上下文同样带上可能相关的术语', async () => {
    const context = await buildSingleParagraphDefaultContext({
      languages: captureExecutionLanguages('zh-CN'),
      currentParagraphId: 'p1',
      allChapterParagraphs: [{ id: 'p1', text: TEXT, selectedTranslationId: '', translations: [] }],
      bookId: BOOK_ID,
      chapterId: 'c',
    });
    expect(context).toContain('エロ性女 ≈ エロ聖女 → 色情圣女');
  });
});

describe('站内翻译的前一章节信息：带上与上一章的衔接', () => {
  const now = new Date(0);
  const translated = (id: string, text: string, translation: string) => ({
    id,
    text,
    selectedTranslationId: `tr-${id}`,
    translations: [{ id: `tr-${id}`, translation, aiModelId: 'm', language: 'zh-CN' as const }],
  });
  const book: Novel = {
    id: 'book-continuity-1',
    title: '衔接测试书',
    targetLanguage: 'zh-CN',
    createdAt: now,
    lastEdited: now,
    volumes: [
      {
        id: 'v1',
        title: '',
        chapters: [
          {
            id: 'c-prev',
            title: {
              original: '６９５話　前夜',
              translation: { id: 't1', translation: '６９５话　前夜', aiModelId: '' },
            },
            content: [
              translated('a1', '一行目。', '第一行。'),
              translated('a2', '「また明日」', '「明天见」'),
              translated('a3', '---', '---'),
            ],
            contentLoaded: true,
            createdAt: now,
            lastEdited: now,
          },
          {
            id: 'c-new',
            title: {
              original: '６９６話　朝',
              translation: { id: 't2', translation: '', aiModelId: '' },
            },
            content: [
              { id: 'b1', text: '朝が来た。', selectedTranslationId: '', translations: [] },
            ],
            contentLoaded: true,
            createdAt: now,
            lastEdited: now,
          },
        ],
      },
    ],
  };

  it('读取最近几章的标题译名与上一章末尾的已译段落（分隔线不算）', async () => {
    const continuity = await loadPreviousChapterContinuity(book, 'c-new', 'zh-CN');
    expect(continuity.recentTitles).toEqual([
      { original: '６９５話　前夜', translation: '６９５话　前夜' },
    ]);
    expect(continuity.tail).toEqual([
      { original: '一行目。', translation: '第一行。' },
      { original: '「また明日」', translation: '「明天见」' },
    ]);
    // 全书第一章没有可衔接的内容
    expect(await loadPreviousChapterContinuity(book, 'c-prev', 'zh-CN')).toEqual({
      recentTitles: [],
      tail: [],
    });
  });

  it('前一章节信息里列出标题译名与上一章末尾的原文和译文；没有衔接内容时只有标题', async () => {
    const continuity = await loadPreviousChapterContinuity(book, 'c-new', 'zh-CN');
    const section = buildPreviousChapterSection('６９５话　前夜', continuity);
    expect(section).toContain('前一章节标题: ６９５话　前夜');
    expect(section).toContain('６９５話　前夜 → ６９５话　前夜');
    expect(section).toMatch(/原文: 「また明日」\n\s*翻译: 「明天见」/);

    const titleOnly = buildPreviousChapterSection('６９５话　前夜');
    expect(titleOnly).toContain('前一章节标题: ６９５话　前夜');
    expect(titleOnly).not.toContain('原文');
    expect(buildPreviousChapterSection(undefined, continuity)).toBe('');
  });
});
