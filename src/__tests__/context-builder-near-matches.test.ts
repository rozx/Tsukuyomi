import './setup';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Novel } from 'src/models/novel';
import { captureExecutionLanguages } from 'src/services/ai/tasks/utils/execution-languages';
import {
  buildIndependentChunkPrompt,
  buildSingleParagraphDefaultContext,
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
