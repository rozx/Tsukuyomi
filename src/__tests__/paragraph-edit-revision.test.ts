import { describe, expect, it } from 'vitest';
import type { Paragraph } from '../models/novel';
import { applyParagraphTranslationEdits } from '../services/localization/paragraph-edit';

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
