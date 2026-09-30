import { describe, expect, it } from 'vitest';
import './setup';
import type { Novel, Volume } from '../models/novel';
import { BookService } from '../services/book-service';
import { getNameTranslation } from '../services/localization/selection';

const title = {
  original: '原始标题',
  translation: { id: 'cn', translation: '简中标题', aiModelId: '' },
};
const book: Novel = {
  id: 'b',
  title: '书',
  targetLanguage: 'en-US',
  createdAt: new Date(0),
  lastEdited: new Date(0),
  volumes: [
    {
      id: 'v',
      title,
      chapters: [
        {
          id: 'c',
          title,
          createdAt: new Date(0),
          lastEdited: new Date(0),
          translationInstructions: '原指令',
        },
      ],
    },
    { id: 'destination', title: '另一个卷', chapters: [] },
  ],
};

describe('卷章译名编辑事务', () => {
  it('AI 指定来源模型保存到对应语言标题', async () => {
    await BookService.saveBook(book);
    await BookService.editTitle('b', 'en-US', {
      kind: 'chapter',
      id: 'c',
      expectedOriginal: '原始标题',
      translation: 'AI title',
      aiModelId: 'english-model',
    });
    const value = (await BookService.getBookById('b'))!.volumes![0]!.chapters![0]!.title as Exclude<
      typeof title,
      string
    >;
    expect(getNameTranslation(value, 'en-US')?.aiModelId).toBe('english-model');
  });
  it('目标或原文过期以及非法移动整次拒绝，不部分修改设置和译名', async () => {
    await BookService.saveBook(book);
    await expect(
      BookService.editTitle('b', 'en-US', {
        kind: 'chapter',
        id: 'c',
        expectedOriginal: '过期原文',
        translation: 'Rejected',
        updates: { translationInstructions: 'Rejected' },
      }),
    ).rejects.toThrow('TITLE_SOURCE_CHANGED');
    await expect(
      BookService.editTitle('b', 'en-US', {
        kind: 'chapter',
        id: 'c',
        expectedOriginal: '原始标题',
        translation: 'Rejected',
        targetVolumeId: 'missing',
      }),
    ).rejects.toThrow('VOLUME_MISSING');
    await expect(
      BookService.editTitle(
        'b',
        'zh-CN',
        { kind: 'volume', id: 'v', expectedOriginal: '原始标题', translation: 'Rejected' },
        'zh-CN',
      ),
    ).rejects.toThrow('BOOK_TARGET_LANGUAGE_CHANGED');
    const saved = (await BookService.getBookById('b'))!;
    expect(saved.volumes![0]!.chapters![0]!.translationInstructions).toBe('原指令');
    expect(getNameTranslation(saved.volumes![0]!.title as typeof title, 'en-US')).toBeUndefined();
  });

  it('重复相同译名不推进语言槽，清空英文保留简中', async () => {
    await BookService.saveBook(book);
    const edit = {
      kind: 'volume' as const,
      id: 'v',
      expectedOriginal: '原始标题',
      translation: 'English',
    };
    await BookService.editTitle('b', 'en-US', edit);
    const before = (await BookService.getBookById('b'))!.volumes![0]!.title as Exclude<
      Volume['title'],
      string
    >;
    await BookService.editTitle('b', 'en-US', edit);
    let current = (await BookService.getBookById('b'))!.volumes![0]!.title as typeof before;
    expect(current.translationsByLanguage?.['en-US']).toEqual(
      before.translationsByLanguage?.['en-US'],
    );
    await BookService.editTitle('b', 'en-US', { ...edit, translation: '' });
    current = (await BookService.getBookById('b'))!.volumes![0]!.title as typeof before;
    expect(getNameTranslation(current, 'en-US')).toBeUndefined();
    expect(getNameTranslation(current, 'zh-CN')?.translation).toBe('简中标题');
  });
  it('原文修订清空旧语言标题，明确撤销按新版本还原全部标题语言', async () => {
    await BookService.saveBook(book);
    await BookService.editTitle('b', 'en-US', {
      kind: 'volume',
      id: 'v',
      expectedOriginal: '原始标题',
      translation: 'Old English',
    });
    const before = (await BookService.getBookById('b'))!.volumes![0]!.title;
    await BookService.editTitle('b', 'en-US', {
      kind: 'volume',
      id: 'v',
      expectedOriginal: '原始标题',
      original: '新的原文',
      translation: 'New English',
    });
    let current = (await BookService.getBookById('b'))!.volumes![0]!.title as Exclude<
      typeof before,
      string
    >;
    expect(getNameTranslation(current, 'zh-CN')).toBeUndefined();
    await BookService.editTitle('b', 'en-US', {
      kind: 'volume',
      id: 'v',
      expectedOriginal: '新的原文',
      original: '原始标题',
      restoreTranslations: (before as Exclude<typeof before, string>).translationsByLanguage!,
    });
    current = (await BookService.getBookById('b'))!.volumes![0]!.title as Exclude<
      typeof before,
      string
    >;
    expect(getNameTranslation(current, 'zh-CN')?.translation).toBe('简中标题');
    expect(getNameTranslation(current, 'en-US')?.translation).toBe('Old English');
    expect(current.translationsByLanguage?.['en-US']?.revision.counter).toBeGreaterThan(
      (before as Exclude<typeof before, string>).translationsByLanguage!['en-US']!.revision.counter,
    );
  });
  it('编辑英文卷章译名保留简中，并与章节设置及移动一起保存', async () => {
    await BookService.saveBook(book);
    await BookService.editTitle(
      'b',
      'en-US',
      { kind: 'volume', id: 'v', expectedOriginal: '原始标题', translation: 'Volume "One"' },
      'en-US',
    );
    await BookService.editTitle(
      'b',
      'en-US',
      {
        kind: 'chapter',
        id: 'c',
        expectedOriginal: '原始标题',
        translation: 'Chapter "One"',
        targetVolumeId: 'destination',
        updates: { translationInstructions: 'New instructions' },
      },
      'en-US',
    );
    const saved = (await BookService.getBookById('b'))!;
    const volume = saved.volumes![0]!;
    const chapter = saved.volumes![1]!.chapters![0]!;
    expect(getNameTranslation(volume.title as typeof title, 'en-US')?.translation).toBe(
      'Volume "One"',
    );
    expect(getNameTranslation(volume.title as typeof title, 'zh-CN')?.translation).toBe('简中标题');
    expect(chapter.translationInstructions).toBe('New instructions');
    expect(getNameTranslation(chapter.title as typeof title, 'en-US')?.translation).toBe(
      'Chapter "One"',
    );
    expect(getNameTranslation(chapter.title as typeof title, 'zh-CN')?.translation).toBe(
      '简中标题',
    );
    expect(saved.volumes![0]!.chapters).toEqual([]);
    expect(saved.targetLanguage).toBe('en-US');
  });
});
