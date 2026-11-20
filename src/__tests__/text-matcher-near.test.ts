import { describe, expect, it } from 'vitest';
import type { CharacterSetting, Terminology } from 'src/models/novel';
import { findNearCharactersInText, findNearTermsInText } from 'src/utils/text-matcher';

function term(id: string, name: string): Terminology {
  return { id, name, translation: { id: `t-${id}`, translation: `译-${name}`, aiModelId: '' } };
}

function character(id: string, name: string, aliases: string[] = []): CharacterSetting {
  return {
    id,
    name,
    sex: undefined,
    translation: { id: `t-${id}`, translation: `译-${name}`, aiModelId: '' },
    aliases: aliases.map((alias, index) => ({
      name: alias,
      translation: { id: `a-${id}-${index}`, translation: `译-${alias}`, aiModelId: '' },
    })),
  };
}

describe('近似匹配：原文写法与名称非常接近但不完全相同', () => {
  it('原文把术语写错一个字时作为「可能相关」找出来，并给出原文里的写法', () => {
    const terms = [term('saint', 'エロ聖女'), term('other', '魔力炉心')];
    const found = findNearTermsInText('彼女はエロ性女と呼ばれていた。', terms);
    expect(found.map((m) => [m.item.id, m.name, m.matchedText])).toEqual([
      ['saint', 'エロ聖女', 'エロ性女'],
    ]);
  });

  it('原文里有完全一致的写法时不算近似匹配', () => {
    const terms = [term('saint', 'エロ聖女')];
    expect(findNearTermsInText('エロ聖女と、エロ性女。', terms)).toEqual([]);
  });

  it('名称不足 4 个字时不做近似匹配，避免大量误报', () => {
    const terms = [term('short', '魔法使')];
    expect(findNearTermsInText('魔法陣を描いた。', terms)).toEqual([]);
  });

  it('差两个字不算；差的那个位置是标点或空白也不算', () => {
    const terms = [term('saint', 'エロ聖女')];
    expect(findNearTermsInText('エリ性女がいた。', terms)).toEqual([]);
    expect(findNearTermsInText('エロ聖、そして', terms)).toEqual([]);
    expect(findNearTermsInText('エロ聖 女神', terms)).toEqual([]);
  });

  it('原文那一处本身就是另一个已有名称时不算（那是另一个词，不是错字）', () => {
    const terms = [term('academy', '魔法学院'), term('school', '魔法学校')];
    expect(findNearTermsInText('魔法学校に入学した。', terms)).toEqual([]);
    // 另一个名称也可以是角色名
    const chars = [character('c1', 'アレクサンドル')];
    expect(
      findNearTermsInText('アレクサンドルが来た。', [term('t', 'アレクサンドラ')], chars),
    ).toEqual([]);
  });

  it('角色的全名和别名同样适用，名字里的空格不计', () => {
    const chars = [character('alex', 'アレク サンドラ', ['サンドラ姫殿下'])];
    const byName = findNearCharactersInText('アレクサンドロが笑った。', chars);
    expect(byName.map((m) => [m.item.id, m.matchedText])).toEqual([['alex', 'アレクサンドロ']]);

    const byAlias = findNearCharactersInText('サンドラ妃殿下、こちらへ。', chars);
    expect(byAlias.map((m) => [m.item.id, m.name, m.matchedText])).toEqual([
      ['alex', 'サンドラ姫殿下', 'サンドラ妃殿下'],
    ]);
  });

  it('名称较长时也容许多一个字或少一个字', () => {
    const terms = [term('order', '聖銀騎士団本部')];
    const extra = findNearTermsInText('聖銀の騎士団本部へ向かう。', terms);
    expect(extra.map((m) => m.item.id)).toEqual(['order']);
    const missing = findNearTermsInText('聖銀騎士本部へ向かう。', terms);
    expect(missing.map((m) => m.item.id)).toEqual(['order']);
    // 差得太多就不算
    expect(findNearTermsInText('銀の騎士の本部へ向かう。', terms)).toEqual([]);
  });

  it('同一个条目只报告一次；空文本或没有条目时返回空', () => {
    const terms = [term('saint', 'エロ聖女')];
    expect(findNearTermsInText('エロ性女、エロ生女、エロ声女。', terms)).toHaveLength(1);
    expect(findNearTermsInText('', terms)).toEqual([]);
    expect(findNearTermsInText('エロ性女', [])).toEqual([]);
  });
});
