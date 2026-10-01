import { describe, expect, it } from 'vitest';
import './setup';
import type { Paragraph } from '../models/novel';
import { applyParagraphTranslationEdits } from '../services/localization/paragraph-edit';
import { mergeParagraphLanguageState } from '../services/localization/merge';
import { getLanguageTranslation } from '../services/localization/selection';

function paragraph(): Paragraph {
  return {
    id: 'p',
    text: '原文',
    selectedTranslationId: '',
    translations: [{ id: 'en', translation: 'English', aiModelId: '', language: 'en-US' }],
    selectedTranslations: {
      'en-US': { value: 'en', revision: { counter: 5, actorId: 'device-a' }, updatedAt: 1 },
    },
  } as Paragraph;
}

const restore = {
  type: 'restore-language' as const,
  paragraphId: 'p',
  originalText: '原文',
  translations: [{ id: 'en', translation: 'Restored', aiModelId: '', language: 'en-US' as const }],
  selectedTranslationId: 'en',
};

describe('restore-language 选用写入', () => {
  it('使用比当前选用更新的版本号时写入', () => {
    const [restored] = applyParagraphTranslationEdits(
      [paragraph()],
      'en-US',
      [restore],
      { counter: 6, actorId: 'device-a' },
      2,
    );
    expect(restored!.selectedTranslations?.['en-US']?.revision.counter).toBe(6);
    expect(restored!.translations[0]!.translation).toBe('Restored');
  });

  it('旧的或相同的版本号被拒绝，不能让选用版本倒退', () => {
    for (const counter of [4, 5]) {
      expect(() =>
        applyParagraphTranslationEdits(
          [paragraph()],
          'en-US',
          [restore],
          { counter, actorId: 'device-a' },
          2,
        ),
      ).toThrow('STALE_SYNC_REVISION');
    }
  });
});

describe('原地编辑译文的并发合并', () => {
  function base(): Paragraph {
    return {
      id: 'p',
      text: '原文',
      selectedTranslationId: 'cn',
      translations: [
        { id: 'cn', translation: '旧中文', aiModelId: '', language: 'zh-CN' },
        { id: 'en', translation: 'Old English', aiModelId: '', language: 'en-US' },
      ],
      selectedTranslations: {
        'zh-CN': { value: 'cn', revision: { counter: 1, actorId: 'base' }, updatedAt: 1 },
        'en-US': { value: 'en', revision: { counter: 1, actorId: 'base' }, updatedAt: 1 },
      },
    } as Paragraph;
  }
  const edit = (language: 'zh-CN' | 'en-US', id: string, text: string, actor: string) =>
    applyParagraphTranslationEdits(
      [base()],
      language,
      [{ type: 'update', paragraphId: 'p', originalText: '原文', translationId: id, text }],
      { counter: 2, actorId: actor },
      2,
    )[0]!;

  it('两台设备分别原地修改不同语言后合并，两边的修改都保留且被选用', () => {
    const a = edit('en-US', 'en', 'Edited English', 'device-a');
    const b = edit('zh-CN', 'cn', '新中文', 'device-b');
    for (const merged of [mergeParagraphLanguageState(b, a), mergeParagraphLanguageState(a, b)]) {
      expect(getLanguageTranslation(merged, 'en-US')?.translation).toBe('Edited English');
      expect(getLanguageTranslation(merged, 'zh-CN')?.translation).toBe('新中文');
    }
  });

  it('文本未变的更新不产生新版本，也不推进选用版本', () => {
    const same = edit('en-US', 'en', 'Old English', 'device-a');
    expect(same.translations.map((value) => value.id)).toEqual(['cn', 'en']);
    expect(same.selectedTranslations?.['en-US']?.revision.counter).toBe(1);
  });

  it('撤销恢复旧文本后，与仍带着修改的另一份副本合并时保留撤销结果', () => {
    const edited = edit('en-US', 'en', 'Edited English', 'device-a');
    const restored = applyParagraphTranslationEdits(
      [edited],
      'en-US',
      [
        {
          type: 'restore-language',
          paragraphId: 'p',
          originalText: '原文',
          translations: base().translations.filter((value) => value.language === 'en-US'),
          selectedTranslationId: 'en',
        },
      ],
      { counter: 3, actorId: 'device-a' },
      3,
    )[0]!;
    // 另一设备只同步到了修改后的版本
    for (const merged of [
      mergeParagraphLanguageState(restored, edited),
      mergeParagraphLanguageState(edited, restored),
    ]) {
      expect(getLanguageTranslation(merged, 'en-US')?.translation).toBe('Old English');
    }
  });

  it('撤销把已删除的版本重新加回时同样记录新 revision，不被另一设备的修改副本改回', () => {
    const removed = applyParagraphTranslationEdits(
      [base()],
      'en-US',
      [{ type: 'remove', paragraphId: 'p', originalText: '原文', translationId: 'en' }],
      { counter: 2, actorId: 'device-a' },
      2,
    )[0]!;
    const restored = applyParagraphTranslationEdits(
      [removed],
      'en-US',
      [
        {
          type: 'restore-language',
          paragraphId: 'p',
          originalText: '原文',
          translations: base().translations.filter((value) => value.language === 'en-US'),
          selectedTranslationId: 'en',
        },
      ],
      { counter: 4, actorId: 'device-a' },
      4,
    )[0]!;
    expect(restored.translations.find((value) => value.id === 'en')!.revision).toEqual({
      counter: 4,
      actorId: 'device-a',
    });
    // 另一设备在删除前同步到了 en，并原地修改过
    const remote = edit('en-US', 'en', 'Remote edit', 'device-b');
    for (const merged of [
      mergeParagraphLanguageState(restored, remote),
      mergeParagraphLanguageState(remote, restored),
    ]) {
      expect(getLanguageTranslation(merged, 'en-US')?.translation).toBe('Old English');
    }
  });
});
