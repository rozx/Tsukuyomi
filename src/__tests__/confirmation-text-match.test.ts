import { describe, test, expect } from 'bun:test';
import { normalizeConfirmationText, isConfirmationTextMatch } from 'src/utils/text-utils';

/**
 * 「输入标题以确认删除」类对话框的文本比较回归测试。
 *
 * 原 bug：`useBooksPage` 的 `isDeleteDisabled` 只 trim 了用户输入、没 trim 书籍标题
 * （`input.trim() !== book.title`）。当标题自身首尾带空白（爬虫抓来的标题常带
 * 全角空格 / 换行）时，即使点「复制标题」按钮把原标题原样填进输入框，比较也永远
 * 不成立，删除按钮被永久禁用。
 */

/** NFC 形式的书名：で 是单一码位 U+3067 */
const TITLE = '得意技：音で殴る';
/** NFD 形式的同一书名：て(U+3066) + 浊音组合符号(U+3099) */
const TITLE_NFD = '得意技：音て\u3099殴る';

describe('confirmation text match', () => {
  test('前提：NFC 与 NFD 形式的码位确实不同', () => {
    expect(TITLE_NFD).not.toBe(TITLE);
  });

  describe('normalizeConfirmationText', () => {
    test('去除首尾半角空白', () => {
      expect(normalizeConfirmationText(`  ${TITLE}  `)).toBe(TITLE);
      expect(normalizeConfirmationText(`\n${TITLE}\t`)).toBe(TITLE);
    });

    test('去除首尾全角空格 U+3000', () => {
      expect(normalizeConfirmationText(`\u3000${TITLE}\u3000`)).toBe(TITLE);
    });

    test('去除零宽字符（BOM / ZWSP / ZWNJ / ZWJ）', () => {
      expect(normalizeConfirmationText(`\uFEFF得意技\u200B：音で\u200C殴\u200Dる`)).toBe(TITLE);
    });

    test('Unicode 归一化为 NFC（浊音符号分解形式）', () => {
      expect(normalizeConfirmationText(TITLE_NFD)).toBe(TITLE);
    });

    test('文本中间的全角空格归一化为半角空格', () => {
      expect(normalizeConfirmationText('得意技\u3000音で殴る')).toBe('得意技 音で殴る');
    });

    test('null / undefined / 纯空白归一化为空字符串', () => {
      expect(normalizeConfirmationText(null)).toBe('');
      expect(normalizeConfirmationText(undefined)).toBe('');
      expect(normalizeConfirmationText('\u3000 \n')).toBe('');
    });
  });

  describe('isConfirmationTextMatch', () => {
    test('标题自身首尾带空白时，原样填入的输入应当匹配（回归）', () => {
      const paddedTitle = `\u3000${TITLE}\u3000`;
      expect(isConfirmationTextMatch(paddedTitle, paddedTitle)).toBe(true);
      // 用户手打的干净标题同样应当匹配
      expect(isConfirmationTextMatch(TITLE, paddedTitle)).toBe(true);
    });

    test('标题含零宽字符时，用户手打的干净标题应当匹配', () => {
      expect(isConfirmationTextMatch(TITLE, `得意技\u200B：音で殴る`)).toBe(true);
    });

    test('IME 产生的 NFD 输入应当匹配 NFC 标题', () => {
      expect(isConfirmationTextMatch(TITLE_NFD, TITLE)).toBe(true);
      expect(isConfirmationTextMatch(TITLE, TITLE_NFD)).toBe(true);
    });

    test('标题不同则不匹配（不能过度归一化导致误删）', () => {
      expect(isConfirmationTextMatch(TITLE, `${TITLE}2`)).toBe(false);
      expect(isConfirmationTextMatch('得意技', TITLE)).toBe(false);
      // 全角冒号 vs 半角冒号属于不同字符，不做等价处理
      expect(isConfirmationTextMatch('得意技:音で殴る', TITLE)).toBe(false);
    });

    test('空输入不匹配', () => {
      expect(isConfirmationTextMatch('', TITLE)).toBe(false);
      expect(isConfirmationTextMatch('   ', TITLE)).toBe(false);
    });

    test('期望值为空时一律不匹配（防止空标题被空输入误删）', () => {
      expect(isConfirmationTextMatch('', '')).toBe(false);
      expect(isConfirmationTextMatch('', null)).toBe(false);
      expect(isConfirmationTextMatch('anything', undefined)).toBe(false);
    });
  });
});
