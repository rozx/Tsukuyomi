import { describe, test, expect } from 'bun:test';
import { getSelectedTranslation, buildOriginalTranslationsMap } from 'src/utils/text-utils';
import type { Paragraph } from 'src/models/novel';

describe('text-utils', () => {
  test('getSelectedTranslation 应返回 selectedTranslationId 对应译文', () => {
    const paragraph: Paragraph = {
      id: 'p1',
      text: '原文',
      selectedTranslationId: 't2',
      translations: [
        { id: 't1', translation: '旧译文', aiModelId: 'model1' },
        { id: 't2', translation: '当前译文', aiModelId: 'model1' },
      ],
    };

    expect(getSelectedTranslation(paragraph)).toBe('当前译文');
  });

  test('buildOriginalTranslationsMap 不应回退到首个翻译版本', () => {
    const paragraphs: Paragraph[] = [
      {
        id: 'p1',
        text: '原文1',
        selectedTranslationId: 'not-exists',
        translations: [{ id: 't1', translation: '旧译文', aiModelId: 'model1' }],
      },
      {
        id: 'p2',
        text: '原文2',
        selectedTranslationId: 't2',
        translations: [
          { id: 't1', translation: '旧译文2', aiModelId: 'model1' },
          { id: 't2', translation: '当前译文2', aiModelId: 'model1' },
        ],
      },
    ];

    const map = buildOriginalTranslationsMap(paragraphs);

    expect(map.has('p1')).toBe(false);
    expect(map.get('p2')).toBe('当前译文2');
  });
});
