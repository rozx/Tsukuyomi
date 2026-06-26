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

    // 第二个用户示例：保留原始间距（含一处 6 连空行），整体每段空行只减一行
    const M = {
      m1: '　団長でさえ、脅威ではなくなった。',
      m2: '「何があろうとも、任を遂行させる気か……」',
      m3: '　冷や汗を垂らしながら竜狩りも笑っていた。だが、その笑みは悲願を果たせる喜びではなく、焦りや自身への嘲笑だった。',
      m4: '　必死に竜狩りが呪術とも魔法とも付かないそれを抑え込もうとしているのがわかる。しかし、着実にそれは進行して肉体の主導権を奪い取っている。',
      m5: '　あぁ、予感がする。',
      m6: '　ここから始まる最悪の記憶。',
      m7: '　昨日見た夢のフラッシュバックが収まらない。',
      m8: '　最初、自分の恐怖心から手が震えているのかと思った。',
      m9: '　だが、震えていたのは握られた隣の少女の、小さく頼りないしなやかな手だった。',
    };

    const example2Before = [
      M.m1, '', '',
      M.m2, '', '',
      M.m3, '',
      M.m4, '', '', '', '', '', '',
      M.m5, '',
      M.m6, '',
      M.m7, '', '',
      M.m8, '',
      M.m9,
    ].join('\n');

    const example2After = [
      M.m1, '',
      M.m2, '',
      M.m3,
      M.m4, '', '', '', '', '',
      M.m5,
      M.m6,
      M.m7, '',
      M.m8,
      M.m9,
    ].join('\n');

    test('用户示例一：每段连续空行减一行（1→0、2→1）', () => {
      expect(removeExtraBlankLines(exampleBefore)).toBe(exampleAfter);
    });

    test('用户示例二：保留原始间距，6 连空行减为 5（每段减一行）', () => {
      expect(removeExtraBlankLines(example2Before)).toBe(example2After);
    });

    test('单个空行被删除（1→0）', () => {
      expect(removeExtraBlankLines('a\n\nb')).toBe('a\nb');
    });

    test('两个连续空行减为一个（2→1）', () => {
      expect(removeExtraBlankLines('a\n\n\nb')).toBe('a\n\nb');
    });

    test('三个连续空行减为两个（3→2）', () => {
      expect(removeExtraBlankLines('a\n\n\n\nb')).toBe('a\n\n\nb');
    });

    test('大段连续空行只减一行（6→5），保留原始间距不被压扁', () => {
      const before = ['a', '', '', '', '', '', '', 'b'].join('\n');
      const after = ['a', '', '', '', '', '', 'b'].join('\n');
      expect(removeExtraBlankLines(before)).toBe(after);
    });

    test('去除文本开头的空行', () => {
      expect(removeExtraBlankLines('\n\na')).toBe('a');
    });

    test('去除文本结尾的空行', () => {
      expect(removeExtraBlankLines('a\n\n')).toBe('a');
    });

    test('仅含全角空格的行视为空行', () => {
      expect(removeExtraBlankLines('a\n　\nb')).toBe('a\nb');
    });

    test('保留下来的空行规范化为真正的空字符串', () => {
      expect(removeExtraBlankLines('a\n　\n　\nb')).toBe('a\n\nb');
    });

    test('保留正文行的全角缩进与行尾空格', () => {
      expect(removeExtraBlankLines('　a　\n\n　b')).toBe('　a　\n　b');
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
