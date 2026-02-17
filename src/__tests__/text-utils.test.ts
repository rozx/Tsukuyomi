import { describe, test, expect } from 'bun:test';
import {
  getSelectedTranslation,
  buildOriginalTranslationsMap,
  isSymbolOnly,
  isEmptyOrSymbolOnly,
} from 'src/utils/text-utils';
import type { Paragraph } from 'src/models/novel';

describe('text-utils', () => {
  describe('isSymbolOnly', () => {
    test('纯符号文本应返回 true', () => {
      expect(isSymbolOnly('***')).toBe(true);
      expect(isSymbolOnly('---')).toBe(true);
      expect(isSymbolOnly('……')).toBe(true);
      expect(isSymbolOnly('※※※')).toBe(true);
      expect(isSymbolOnly('☆★☆')).toBe(true);
      expect(isSymbolOnly('◆◇◆')).toBe(true);
      expect(isSymbolOnly('♪♫♬')).toBe(true);
    });

    test('包含字母的文本应返回 false', () => {
      expect(isSymbolOnly('abc')).toBe(false);
      expect(isSymbolOnly('ABC')).toBe(false);
      expect(isSymbolOnly('hello')).toBe(false);
    });

    test('包含数字的文本应返回 false', () => {
      expect(isSymbolOnly('123')).toBe(false);
      expect(isSymbolOnly('1st')).toBe(false);
    });

    test('包含中文的文本应返回 false', () => {
      expect(isSymbolOnly('中文')).toBe(false);
      expect(isSymbolOnly('这是原文')).toBe(false);
    });

    test('包含日文的文本应返回 false', () => {
      expect(isSymbolOnly('こんにちは')).toBe(false);
      expect(isSymbolOnly('日本語')).toBe(false);
    });

    test('包含韩文的文本应返回 false', () => {
      expect(isSymbolOnly('안녕하세요')).toBe(false);
    });

    test('混合符号和文字应返回 false', () => {
      expect(isSymbolOnly('***重要***')).toBe(false);
      expect(isSymbolOnly('……他说')).toBe(false);
    });
  });

  describe('isEmptyOrSymbolOnly', () => {
    test('空字符串应返回 true', () => {
      expect(isEmptyOrSymbolOnly('')).toBe(true);
      expect(isEmptyOrSymbolOnly(null)).toBe(true);
      expect(isEmptyOrSymbolOnly(undefined)).toBe(true);
    });

    test('仅空白字符应返回 true', () => {
      expect(isEmptyOrSymbolOnly('   ')).toBe(true);
      expect(isEmptyOrSymbolOnly('\t\n')).toBe(true);
    });

    test('纯符号文本应返回 true', () => {
      expect(isEmptyOrSymbolOnly('***')).toBe(true);
      expect(isEmptyOrSymbolOnly('---')).toBe(true);
    });

    test('包含文字的文本应返回 false', () => {
      expect(isEmptyOrSymbolOnly('abc')).toBe(false);
      expect(isEmptyOrSymbolOnly('中文')).toBe(false);
    });
  });

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
