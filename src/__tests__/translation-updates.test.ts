import './setup';
import { describe, test, expect } from 'bun:test';
import { selectChangedParagraphTranslations } from 'src/utils/translation-updates';

describe('selectChangedParagraphTranslations', () => {
  test('同一段落：相同翻译应被去重；翻译变化应允许覆盖更新（last-write-wins）', () => {
    const lastApplied = new Map<string, string>();

    const first = selectChangedParagraphTranslations([{ id: 'p1', translation: 'A' }], lastApplied);
    expect(first).toEqual([{ id: 'p1', translation: 'A' }]);
    expect(lastApplied.get('p1')).toBe('A');

    const dup = selectChangedParagraphTranslations([{ id: 'p1', translation: 'A' }], lastApplied);
    expect(dup).toEqual([]);
    expect(lastApplied.get('p1')).toBe('A');

    const corrected = selectChangedParagraphTranslations(
      [{ id: 'p1', translation: 'A（修正）' }],
      lastApplied,
    );
    expect(corrected).toEqual([{ id: 'p1', translation: 'A（修正）' }]);
    expect(lastApplied.get('p1')).toBe('A（修正）');
  });

  test('应过滤空白翻译与无效输入', () => {
    const lastApplied = new Map<string, string>([['p1', 'A']]);

    const changed = selectChangedParagraphTranslations(
      [
        { id: '', translation: 'X' },
        { id: 'p2', translation: '' },
        { id: 'p3', translation: '   ' },
        // @ts-expect-error 测试运行时防御
        { id: 'p4', translation: null },
        { id: 'p1', translation: 'A' }, // 重复
      ],
      lastApplied,
    );

    expect(changed).toEqual([]);
    expect(lastApplied.get('p1')).toBe('A');
  });
});


