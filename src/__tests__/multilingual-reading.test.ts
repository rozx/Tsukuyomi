import { describe, expect, it } from 'bun:test';
import './setup';
import type { Chapter, Novel, Paragraph, Volume } from '../models/novel';
import { getSelectedParagraphTranslationText } from '../utils/translation-utils';
import {
  getChapterDisplayTitle,
  getVolumeDisplayTitle,
  getChapterTranslationStats,
  hasParagraphTranslation,
} from '../utils/novel-utils';

const makeBook = (targetLanguage: NonNullable<Novel['targetLanguage']>): Novel => ({
  id: 'b',
  title: '书',
  targetLanguage,
  normalizeSymbolsOnDisplay: true,
  normalizeTitleOnDisplay: true,
  createdAt: new Date(0),
  lastEdited: new Date(0),
});
const paragraph: Paragraph = {
  id: 'p',
  text: '原文',
  selectedTranslationId: 'cn',
  translations: [
    { id: 'cn', translation: '简中', language: 'zh-CN', aiModelId: '' },
    { id: 'en', translation: '"English" — Dr. Smith.', language: 'en-US', aiModelId: '' },
  ],
  selectedTranslations: {
    'zh-CN': { value: 'cn', revision: { counter: 1, actorId: 'a' }, updatedAt: 1 },
    'en-US': { value: 'en', revision: { counter: 1, actorId: 'a' }, updatedAt: 1 },
  },
};

describe('按书籍语言阅读', () => {
  it('完成度只统计目标语言的有效选用，空选用和其他语言不计数', () => {
    const noEnglish = {
      ...paragraph,
      selectedTranslations: { 'zh-CN': paragraph.selectedTranslations!['zh-CN']! },
    };
    expect(getChapterTranslationStats([paragraph, noEnglish], 'en-US')).toEqual({
      total: 2,
      translated: 1,
    });
    expect(hasParagraphTranslation(noEnglish, 'en-US')).toBe(false);
    expect(hasParagraphTranslation(paragraph, 'en-US')).toBe(true);
    expect(getChapterTranslationStats([{ ...paragraph, text: ' ' }], 'en-US')).toEqual({
      total: 0,
      translated: 0,
    });
  });
  it('卷章标题选择目标语言，缺失时原文不经过译文规范化', () => {
    const title = {
      original: '第110话 原始标题',
      translation: { id: 'cn', translation: '第110话 中文标题', aiModelId: '' },
      translationsByLanguage: {
        'en-US': {
          value: {
            id: 'en',
            translation: '110 English Title',
            language: 'en-US' as const,
            aiModelId: '',
          },
          revision: { counter: 1, actorId: 'a' },
          updatedAt: 1,
        },
      },
    };
    const chapter: Chapter = { id: 'c', title, createdAt: new Date(0), lastEdited: new Date(0) };
    const volume: Volume = { id: 'v', title, chapters: [chapter] };
    expect(getChapterDisplayTitle(chapter, makeBook('en-US'))).toBe('110 English Title');
    expect(getVolumeDisplayTitle(volume, makeBook('en-US'))).toBe('110 English Title');
    expect(getChapterDisplayTitle(chapter, makeBook('zh-TW'))).toBe('第110话 原始标题');
    expect(getVolumeDisplayTitle(volume, makeBook('zh-TW'))).toBe('第110话 原始标题');
  });
  it('按书籍目标选用、切回恢复原选用，缺失目标译文不借用其他语言', () => {
    expect(getSelectedParagraphTranslationText(paragraph, makeBook('en-US'))).toBe(
      '"English" — Dr. Smith.',
    );
    expect(getSelectedParagraphTranslationText(paragraph, makeBook('zh-TW'))).toBe('');
    expect(getSelectedParagraphTranslationText(paragraph, makeBook('zh-CN'))).toBe('简中');
  });
});
