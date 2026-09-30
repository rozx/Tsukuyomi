import { describe, expect, it } from 'vitest';
import './setup';
import { buildFormattedChunks } from '../services/ai/tasks/utils/chunk-formatter';
import type { Paragraph } from '../models/novel';

describe('润色分块目标语言', () => {
  it('英文块只包含英文选用且保留原文与原始索引', () => {
    const paragraph: Paragraph = {
      id: '11111111',
      text: 'SOURCE',
      selectedTranslationId: 'cn',
      translations: [
        { id: 'cn', translation: '禁止带入的简中', aiModelId: '' },
        { id: 'en', translation: 'EN_ONLY', language: 'en-US', aiModelId: '' },
      ],
      selectedTranslations: {
        'en-US': { value: 'en', revision: { counter: 1, actorId: 'a' }, updatedAt: 1 },
      },
    };
    const chunk = buildFormattedChunks(
      [paragraph],
      1000,
      new Map([[paragraph.id, 19]]),
      'en-US',
    )[0]!;
    expect(chunk.text).toContain('[20]');
    expect(chunk.text).toContain('SOURCE');
    expect(chunk.text).toContain('EN_ONLY');
    expect(chunk.text).not.toContain('禁止带入的简中');
  });
});
