import { describe, expect, it } from 'vitest';
import './setup';
import { mergeTitlePreservingTranslation } from '../services/localization/title-merge';
import { normalizeNameTranslations } from '../services/localization/normalize';

describe('卷章标题语言槽合并', () => {
  it('简中槽已清空时，合并结果的简中投影与规范化写入一致，不产生多余写入', () => {
    const title = normalizeNameTranslations(
      {
        original: '第1話',
        translation: { id: 'cn', translation: '', aiModelId: 'model', language: 'zh-CN' as const },
        translationsByLanguage: {
          'zh-CN': { value: null, revision: { counter: 2, actorId: 'a' }, updatedAt: 1 },
          'en-US': {
            value: { id: 'en', translation: 'Chapter One', aiModelId: 'model', language: 'en-US' },
            revision: { counter: 1, actorId: 'a' },
            updatedAt: 1,
          },
        },
      },
      0,
    );
    expect(mergeTitlePreservingTranslation(title, structuredClone(title))).toEqual(title);
  });

  it('原文为空字符串的未命名卷章两侧也合并各自的语言槽', () => {
    const blank = { id: '', translation: '', aiModelId: '', language: 'zh-CN' as const };
    const slot = (id: string, text: string, language: 'en-US' | 'zh-TW', counter: number) => ({
      value: { id, translation: text, aiModelId: '', language },
      revision: { counter, actorId: 'a' },
      updatedAt: 1,
    });
    const english = normalizeNameTranslations(
      {
        original: '',
        translation: blank,
        translationsByLanguage: { 'en-US': slot('en', 'Untitled', 'en-US', 1) },
      },
      0,
    );
    const traditional = normalizeNameTranslations(
      {
        original: '',
        translation: blank,
        translationsByLanguage: { 'zh-TW': slot('tw', '未命名', 'zh-TW', 2) },
      },
      0,
    );
    const merged = mergeTitlePreservingTranslation(english, traditional) as Exclude<
      ReturnType<typeof mergeTitlePreservingTranslation>,
      string
    >;
    expect(merged.translationsByLanguage?.['en-US']?.value?.translation).toBe('Untitled');
    expect(merged.translationsByLanguage?.['zh-TW']?.value?.translation).toBe('未命名');
  });
});
