import { describe, expect, it } from 'vitest';
import './setup';
import type { Novel, Paragraph } from '../models/novel';
import { replaceBookLanguageSlots } from '../services/localization/book-slots';
import { mergeParagraphLanguageState } from '../services/localization/merge';
import { getLanguageTranslation } from '../services/localization/selection';

function book(translation: string, revision?: { counter: number; actorId: string }): Novel {
  const paragraph: Paragraph = {
    id: 'p',
    text: '原文',
    selectedTranslationId: '',
    translations: [
      {
        id: 'en',
        translation,
        aiModelId: '',
        language: 'en-US',
        ...(revision ? { revision } : {}),
      },
    ],
    selectedTranslations: {
      'en-US': { value: 'en', revision: { counter: 1, actorId: 'base' }, updatedAt: 1 },
    },
  };
  return {
    id: 'b',
    title: '书',
    createdAt: new Date(0),
    lastEdited: new Date(0),
    volumes: [
      {
        id: 'v',
        title: '卷',
        chapters: [
          {
            id: 'c',
            title: '章',
            createdAt: new Date(0),
            lastEdited: new Date(0),
            content: [paragraph],
          },
        ],
      },
    ],
  };
}
const para = (value: Novel) => value.volumes![0]!.chapters![0]!.content![0]!;

describe('强制覆盖 / 快照恢复中的译文版本号', () => {
  it('覆盖为较旧文本时给保留的同 ID 版本分配本次 revision，之后合并不会被另一份较新副本改回', () => {
    const local = book('Snapshot text');
    const remote = book('Newer remote text', { counter: 5, actorId: 'other' });
    replaceBookLanguageSlots(local, remote, { counter: 9, actorId: 'me' }, 2);
    expect(para(local).translations[0]!.revision).toEqual({ counter: 9, actorId: 'me' });
    for (const merged of [
      mergeParagraphLanguageState(para(remote), para(local)),
      mergeParagraphLanguageState(para(local), para(remote)),
    ]) {
      expect(getLanguageTranslation(merged, 'en-US')?.translation).toBe('Snapshot text');
    }
  });

  it('与另一侧文本相同的版本不重新盖戳', () => {
    const local = book('Same');
    const remote = book('Same', { counter: 5, actorId: 'other' });
    replaceBookLanguageSlots(local, remote, { counter: 9, actorId: 'me' }, 2);
    expect(para(local).translations[0]!.revision).toBeUndefined();
  });
});
