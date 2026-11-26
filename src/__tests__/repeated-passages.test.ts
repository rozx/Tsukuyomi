import { describe, expect, it } from 'vitest';
import type { Chapter, Paragraph } from 'src/models/novel';
import {
  REPEAT_LOOKBACK_CHAPTERS,
  findRepeatedPassages,
} from 'src/services/library-query/repeated-passages';

const para = (id: string, text: string, translation = ''): Paragraph => ({
  id,
  text,
  selectedTranslationId: translation ? `tr-${id}` : '',
  translations: translation
    ? [{ id: `tr-${id}`, translation, aiModelId: 'm', language: 'zh-CN' }]
    : [],
});

const chapter = (id: string, content: Paragraph[]): Chapter =>
  ({
    id,
    title: { original: `${id} 話`, translation: { id: `t-${id}`, translation: '', aiModelId: '' } },
    content,
    contentLoaded: true,
    createdAt: new Date(0),
    lastEdited: new Date(0),
  }) as Chapter;

const LONG = '父さんは言った。「剣は人を守るためにある」と。';
const LONG_ZH = '父亲说过：「剑是为了守护他人而存在的」。';
/** 去掉标点后仍有二十多个字的长句：前文译法不一时也照样给出最近的一处 */
const MOTIF = '父さんはいつも言っていた。「剣は弱い人を守るためにあるのだ。それを忘れるな」と。';

const find = (options: {
  targets: Paragraph[];
  current?: Paragraph[];
  beforeIndex?: number;
  previous?: Chapter[];
}) => {
  const current = options.current ?? options.targets;
  return findRepeatedPassages({
    targets: options.targets,
    currentChapter: chapter('now', current),
    currentParagraphs: current,
    beforeIndex: options.beforeIndex ?? 0,
    previousChapters: options.previous ?? [],
    language: 'zh-CN',
  });
};

describe('findRepeatedPassages', () => {
  it('没有待查段落或没有前文时返回空', async () => {
    expect(await find({ targets: [] })).toEqual([]);
    expect(await find({ targets: [para('a', LONG)] })).toEqual([]);
  });

  it('前面章节里有同文且已译的段落时，给出它的位置与译文', async () => {
    const result = await find({
      targets: [para('a', LONG), para('b', 'まったく別の文章がここに書かれている。')],
      previous: [
        chapter('c1', [para('x0', '関係ない行。', '无关的一行。'), para('x1', LONG, LONG_ZH)]),
      ],
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      paragraphId: 'a',
      index: 1,
      earlierParagraphId: 'x1',
      translation: LONG_ZH,
    });
    expect(result[0]!.chapter.id).toBe('c1');
  });

  it('空白（含全角空格、行首缩进）不同也算同文', async () => {
    const result = await find({
      targets: [para('a', `\u3000${LONG}`)],
      previous: [chapter('c1', [para('x1', LONG.replace('。「', '。 「'), LONG_ZH)])],
    });
    expect(result.map((r) => r.earlierParagraphId)).toEqual(['x1']);
  });

  it('太短的句子、只有符号的段落不算：它们本来就到处重复', async () => {
    const result = await find({
      targets: [para('a', '「はい」'), para('b', '◇◇◇◇◇◇◇◇◇◇◇◇◇◇')],
      previous: [
        chapter('c1', [para('x1', '「はい」', '「是」'), para('x2', '◇◇◇◇◇◇◇◇◇◇◇◇◇◇', '◇◇◇')]),
      ],
    });
    expect(result).toEqual([]);
  });

  it('字数只算文字，不算标点与引号：「……アンデッド？」「ええ、もちろんですわ」这类短应答不列出', async () => {
    const shortReplies = ['「……アンデッド？」', '「ええ、もちろんですわ」', '「……はい。……はい！」'];
    const kept = '「……わたくしが、生きるためですわ」';
    const result = await find({
      targets: [...shortReplies, kept].map((text, i) => para(`t${i}`, text)),
      previous: [
        chapter(
          'c1',
          [...shortReplies, kept].map((text, i) => para(`x${i}`, text, `译文${i}`)),
        ),
      ],
    });
    expect(result.map((r) => r.paragraphId)).toEqual(['t3']);
  });

  it('短句在前文里两处译法不同时不列出：译法随语境变化，没有可沿用的固定译法', async () => {
    const greeting = '「はい。こちらこそ、よろしくお願いいたします」';
    const varied = await find({
      targets: [para('a', greeting)],
      previous: [
        chapter('c1', [para('x1', greeting, '「好的。我才要请您多多关照」')]),
        chapter('c2', [para('y1', greeting, '「是。彼此彼此，还请多指教」')]),
      ],
    });
    expect(varied).toEqual([]);

    // 前文译法一致（只差空白）时照常给出最近的一处
    const consistent = await find({
      targets: [para('a', greeting)],
      previous: [
        chapter('c1', [para('x1', greeting, '「好的。我才要请您多多关照」')]),
        chapter('c2', [para('y1', greeting, '「好的。 我才要请您多多关照」')]),
      ],
    });
    expect(consistent.map((r) => r.earlierParagraphId)).toEqual(['y1']);

    // 前文只出现过一次时也给出
    const once = await find({
      targets: [para('a', greeting)],
      previous: [chapter('c1', [para('x1', greeting, '「好的。我才要请您多多关照」')])],
    });
    expect(once.map((r) => r.earlierParagraphId)).toEqual(['x1']);
  });

  it('长句前文译法不同时仍给出最近的一处：回忆、复述的长句要与最近的译法一致', async () => {
    const result = await find({
      targets: [para('a', MOTIF)],
      previous: [
        chapter('c1', [para('x1', MOTIF, '较早的译法。')]),
        chapter('c2', [para('y1', MOTIF, '较近的译法。')]),
      ],
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ earlierParagraphId: 'y1', translation: '较近的译法。' });
  });

  it('前文的同文段落还没有译文时不列出', async () => {
    const result = await find({
      targets: [para('a', LONG)],
      previous: [chapter('c1', [para('x1', LONG)])],
    });
    expect(result).toEqual([]);
  });

  it('本章里排在这一块之前的同文段落也算，并且离得最近的优先', async () => {
    const current = [
      para('n0', MOTIF, '本章里的译法。'),
      para('n1', '間の行。'),
      para('n2', MOTIF),
    ];
    const result = await find({
      targets: [current[2]!],
      current,
      beforeIndex: 2,
      previous: [chapter('c1', [para('x1', MOTIF, '更早一章的译法。')])],
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ earlierParagraphId: 'n0', translation: '本章里的译法。' });
    expect(result[0]!.chapter.id).toBe('now');
  });

  it('本章里排在这一块之后的段落不算前文', async () => {
    const current = [para('n0', LONG), para('n1', LONG, LONG_ZH)];
    expect(await find({ targets: [current[0]!], current, beforeIndex: 0 })).toEqual([]);
  });

  it('多章都有同文时取最近的一章；同一章里取最靠后的一处', async () => {
    const result = await find({
      targets: [para('a', MOTIF)],
      previous: [
        chapter('c1', [para('x1', MOTIF, '最早的译法。')]),
        chapter('c2', [para('y1', MOTIF, '较近、靠前。'), para('y2', MOTIF, '较近、靠后。')]),
      ],
    });
    expect(result[0]).toMatchObject({ earlierParagraphId: 'y2', translation: '较近、靠后。' });
  });

  it('待查段落已有译文且与前文相同时不列出（润色时没有可对照的差异）', async () => {
    const same = await find({
      targets: [para('a', LONG, LONG_ZH)],
      previous: [chapter('c1', [para('x1', LONG, LONG_ZH)])],
    });
    expect(same).toEqual([]);
    const different = await find({
      targets: [para('a', LONG, '另一种译法。')],
      previous: [chapter('c1', [para('x1', LONG, LONG_ZH)])],
    });
    expect(different.map((r) => r.translation)).toEqual([LONG_ZH]);
  });

  it(`只回看最近 ${REPEAT_LOOKBACK_CHAPTERS} 章`, async () => {
    const filler = Array.from({ length: REPEAT_LOOKBACK_CHAPTERS }, (_, i) =>
      chapter(`f${i}`, [para(`f${i}-p`, `穴埋めの文章その${i}がここにある。`, '填充。')]),
    );
    const far = chapter('far', [para('x1', LONG, LONG_ZH)]);
    expect(await find({ targets: [para('a', LONG)], previous: [far, ...filler] })).toEqual([]);
    expect(
      (await find({ targets: [para('a', LONG)], previous: [far, ...filler.slice(1)] })).map(
        (r) => r.earlierParagraphId,
      ),
    ).toEqual(['x1']);
  });

  it('最多列出 10 处，优先保留较长的段落，并按本块的段落顺序排列', async () => {
    const texts = Array.from(
      { length: 12 },
      (_, i) => `繰り返される長い文章の第${i}番目です。${'あ'.repeat(i)}`,
    );
    const targets = texts.map((text, i) => para(`t${i}`, text));
    const result = await find({
      targets,
      previous: [
        chapter(
          'c1',
          texts.map((text, i) => para(`x${i}`, text, `译文${i}`)),
        ),
      ],
    });
    expect(result).toHaveLength(10);
    // 最短的两段（0、1）被舍弃，其余保持原顺序
    expect(result.map((r) => r.paragraphId)).toEqual(
      targets.slice(2).map((paragraph) => paragraph.id),
    );
  });

  it('同一块里的同文段落各自都有对照', async () => {
    const result = await find({
      targets: [para('a', LONG), para('b', LONG)],
      previous: [chapter('c1', [para('x1', LONG, LONG_ZH)])],
    });
    expect(result.map((r) => [r.paragraphId, r.earlierParagraphId])).toEqual([
      ['a', 'x1'],
      ['b', 'x1'],
    ]);
  });
});
