import { describe, expect, it } from 'vitest';
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
});
