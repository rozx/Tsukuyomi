import { describe, test, expect } from 'bun:test';
import {
  getSelectedTranslation,
  buildOriginalTranslationsMap,
  isSymbolOnly,
  isEmptyOrSymbolOnly,
  removeExtraBlankLines,
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

  describe('removeExtraBlankLines', () => {
    // 正文行：在 before / after 间共享，确保只有空行布局不同
    const L = {
      l1: '　一体何をしてきたのか、聞き返したいのはこちらだ。　',
      l2: '　あの巨大な魔法陣と力の奔流、そしてその中から現れたお前こそ何者だと。',
      l3: '　だが、下手なことを言う余裕すらなかった。',
      l4: '　事実、団長を含めた他の五人は男を前に動くことができずに固まっている。',
      l5: '　魔王を相手にした時のような本能的な恐怖が身体を凍りついていた。',
      l6: '　動けば死ぬという当然にして絶対の恐怖。それが理性を上回り本能に従わせている。',
      l7: '「悪いけど、そっちに何が視えてるのかわからないからな。それに、魂云々も特に自覚はない」',
      l8: '　無理矢理増設されたとかならわかるが、逆に『巨大な一部を引きちぎった』というのは変だ。',
      l9: '　俺の魂は元からこの世界の一般人以下の能力しか有していないのだから。',
      l10: '「そっちの質問には答えたんだから、こっちの質問にも答えてくれないか？」',
    };

    const exampleBefore = [
      L.l1, '',
      L.l2, '', '',
      L.l3, '',
      L.l4, '',
      L.l5, '',
      L.l6, '', '',
      L.l7, '', '',
      L.l8, '',
      L.l9, '', '',
      L.l10,
    ].join('\n');

    const exampleAfter = [
      L.l1,
      L.l2, '',
      L.l3,
      L.l4,
      L.l5,
      L.l6, '',
      L.l7, '',
      L.l8,
      L.l9, '',
      L.l10,
    ].join('\n');

    test('用户示例：原始稿压缩（段内单空行→0、场景双空行→1）', () => {
      expect(removeExtraBlankLines(exampleBefore)).toBe(exampleAfter);
    });

    test('幂等：再次格式化用户示例结果不再变化', () => {
      expect(removeExtraBlankLines(exampleAfter)).toBe(exampleAfter);
      expect(removeExtraBlankLines(removeExtraBlankLines(exampleBefore))).toBe(exampleAfter);
    });

    test('幂等：已是单空行间隔的文本（场景分隔）保持不变，不被压缩为 0', () => {
      // 这是 bug 的核心回归：第二次按格式化不能把场景间的单空行也吃掉
      expect(removeExtraBlankLines('a\nb\n\nc')).toBe('a\nb\n\nc');
    });

    test('原始稿里段内单空行被删除（1→0），场景双空行保留为单空行（2→1）', () => {
      expect(removeExtraBlankLines('a\n\nb\n\n\nc')).toBe('a\nb\n\nc');
    });

    test('纯单空行间隔（无双空行）视为已格式化，保持不变', () => {
      expect(removeExtraBlankLines('a\n\nb')).toBe('a\n\nb');
    });

    test('两个连续空行折叠为一个（2→1）', () => {
      expect(removeExtraBlankLines('a\n\n\nb')).toBe('a\n\nb');
    });

    test('3+ 连续空行折叠为一个（3→1）', () => {
      expect(removeExtraBlankLines('a\n\n\n\nb')).toBe('a\n\nb');
    });

    test('去除文本开头的空行', () => {
      expect(removeExtraBlankLines('\n\na')).toBe('a');
    });

    test('去除文本结尾的空行（不触发整体重压缩）', () => {
      expect(removeExtraBlankLines('a\n\n')).toBe('a');
      // 仅尾部多空行：场景单空行应保留
      expect(removeExtraBlankLines('a\nb\n\nc\n\n')).toBe('a\nb\n\nc');
    });

    test('仅含全角空格的行视为空行', () => {
      expect(removeExtraBlankLines('a\n　\nb')).toBe('a\n\nb');
    });

    test('保留下来的空行规范化为真正的空字符串', () => {
      expect(removeExtraBlankLines('a\n　\n　\nb')).toBe('a\n\nb');
    });

    test('保留正文行的全角缩进与行尾空格', () => {
      expect(removeExtraBlankLines('　a　\n\n　b\n\n\n　c')).toBe('　a　\n　b\n\n　c');
    });

    test('空输入返回空字符串', () => {
      expect(removeExtraBlankLines('')).toBe('');
    });

    test('全空白输入返回空字符串', () => {
      expect(removeExtraBlankLines('\n\n\n')).toBe('');
    });

    test('没有空行的文本保持不变', () => {
      expect(removeExtraBlankLines('a\nb\nc')).toBe('a\nb\nc');
    });
  });
});
