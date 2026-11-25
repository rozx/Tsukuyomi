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
    const chars = [character('alex', 'ミハイル ゴルバ', ['サンドラ姫殿下'])];
    // 姓和名都没有原样出现（否则精确匹配就认出来了），连起来与全名相差两个字
    const byName = findNearCharactersInText('ミハエルゴルパが笑った。', chars);
    expect(byName.map((m) => [m.item.id, m.matchedText])).toEqual([['alex', 'ミハエルゴルパ']]);

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

  it('别名带敬称时，换了一种敬称的称呼也能认出来', () => {
    // 角色全名没有空格，精确匹配拆不出「優」；别名里只有「優ちゃん」
    const chars = [character('yu', '月岡優', ['優ちゃん'])];
    const found = findNearCharactersInText('「優さん、おはようございます」', chars);
    expect(found.map((m) => [m.item.id, m.name, m.matchedText])).toEqual([
      ['yu', '優ちゃん', '優さん'],
    ]);
    // 名字很短时，前面紧挨着汉字的不算（「俳優さん」是另一个词）
    expect(findNearCharactersInText('俳優さんが来た。', chars)).toEqual([]);
    // 原文里就是别名本身：由精确匹配负责
    expect(findNearCharactersInText('優ちゃんが来た。', chars)).toEqual([]);
  });

  it('带敬称的别名只拿称呼前面的名字去做近似匹配，不会因为敬称相同而认错人', () => {
    const chars = [character('yu', '月岡優', ['優ちゃん'])];
    expect(findNearCharactersInText('理央ちゃんが笑った。', chars)).toEqual([]);
    // 名字本身够长时，名字写错字、敬称不同仍能认出
    const long = [character('alex', 'アレクサンドラ', ['アレクサンドラ様'])];
    expect(
      findNearCharactersInText('アレクサンドロさんが来た。', long).map((m) => m.matchedText),
    ).toEqual(['アレクサンドロ']);
  });

  it('差的那个字在原文里是平假名（多半是助词）时不算', () => {
    const terms = [
      term('side', '向こう側'),
      term('church', 'エスペランサ教'),
      term('dark', '闇カルラ'),
    ];
    expect(findNearTermsInText('向こうに行く。', terms)).toEqual([]);
    expect(findNearTermsInText('エスペランサが来た。', terms)).toEqual([]);
    expect(findNearTermsInText('そしてカルラは笑った。', terms)).toEqual([]);
    // 名称里那个位置本来就是平假名时，仍然可以是写错
    const kana = [term('k', 'おにぎり定食')];
    expect(findNearTermsInText('おにがり定食を頼んだ。', kana).map((m) => m.matchedText)).toEqual([
      'おにがり定食',
    ]);
  });

  it('差的是首尾那个字、并且它和外侧紧挨的汉字连成另一个词时不算（结构相同的前缀或后缀）', () => {
    // 「分身の術」与「分身の記憶」只是共用「分身の」：「記」属于后面的「記憶」
    expect(findNearTermsInText('消えた分身の記憶から', [term('ninja', '分身の術')])).toEqual([]);
    // 首字同理：「紅」属于前面的「真紅」
    expect(findNearTermsInText('真紅の騎士が現れた。', [term('red', '赤の騎士')])).toEqual([]);
    // 差的那个字外侧不是汉字时仍然算（可能是写错）
    expect(
      findNearTermsInText('分身の技を使った。', [term('ninja', '分身の術')]).map(
        (m) => m.matchedText,
      ),
    ).toEqual(['分身の技']);
    // 片假名名称写错最后一个字、后面紧跟敬称汉字时仍然算
    expect(
      findNearCharactersInText('アリシャ様が来た。', [character('alicia', 'アリシア')]).map(
        (m) => m.matchedText,
      ),
    ).toEqual(['アリシャ']);
  });

  it('片假名词只差首尾那个字、并且那一段嵌在更长的片假名词里时不算（共用词尾或词头的另一个词）', () => {
    const terms = [term('sister', 'シスター')];
    // 「ンスター」是「モンスター」的一部分，不是「シスター」写错
    expect(findNearTermsInText('森でモンスターに遭遇した。', terms)).toEqual([]);
    // 尾字同理：后面还连着片假名
    expect(findNearTermsInText('シスタリアという街。', terms)).toEqual([]);
    // 独立成词、只是写错一个字时仍然算
    expect(findNearTermsInText('シスタアが祈っていた。', terms).map((m) => m.matchedText)).toEqual([
      'シスタア',
    ]);
  });

  it('不超过 4 个字的纯片假名名称，首字不同时不算：只是共用词尾的另一个词', () => {
    // ミスター、マスター、ポスター 与 シスター 都只差首字，但都是别的词
    const terms = [term('sister', 'シスター')];
    expect(findNearTermsInText('あのミスターが来た。', terms)).toEqual([]);
    expect(findNearTermsInText('マスターに聞いた。', terms)).toEqual([]);
    // 词尾的异写仍然算（アリシア → アリシャ）
    expect(
      findNearCharactersInText('アリシャが来た。', [character('alicia', 'アリシア')]).map(
        (m) => m.matchedText,
      ),
    ).toEqual(['アリシャ']);
    // 名称更长，或者不是纯片假名时，首字写错仍然算
    expect(
      findNearTermsInText('プレクサンドラが来た。', [term('alex', 'アレクサンドラ')]).map(
        (m) => m.matchedText,
      ),
    ).toEqual(['プレクサンドラ']);
    expect(
      findNearTermsInText('性女エロと呼ばれた。', [term('saint', '聖女エロ')]).map(
        (m) => m.matchedText,
      ),
    ).toEqual(['性女エロ']);
  });

  it('名称的前半原样出现、后面接的是助词等平假名时不算，差几个字都一样', () => {
    // 「ユニコーンとス」是「ユニコーン」加助词，再接下一个词，不是「ユニコーン幼女」
    const terms = [term('uni', 'ユニコーン幼女')];
    expect(findNearTermsInText('ユニコーンとスライムが現れた。', terms)).toEqual([]);
    // 差两个字、但都不是平假名顶替时仍然算
    expect(
      findNearTermsInText('ユニコーン妖女が現れた。', terms).map((m) => m.matchedText),
    ).toEqual(['ユニコーン妖女']);
  });

  it('已经被精确匹配认出的条目不再列为近似匹配', () => {
    // 全名带分隔符：精确匹配能认出「アリシア・ラ・アエラス」，近似匹配不应再拿它去碰别的片段
    const chars = [character('alicia', 'アリシア・ラ・アエラス')];
    const text = 'アリシア・ラ・アエラスは頷いた。「アリア、行こう」';
    expect(findNearCharactersInText(text, chars)).toEqual([]);

    // 姓名之间有空格：「優」单独出现由精确匹配负责，换了敬称的称呼不再重复报告
    const yu = [character('yu', '月岡 優', ['優ちゃん'])];
    expect(findNearCharactersInText('「優さん、おはようございます」', yu)).toEqual([]);

    // 术语同理：注音写法由精确匹配认出后不再重复
    const terms = [term('stone', '月光石'), term('saint', 'エロ聖女')];
    expect(findNearTermsInText('月光石とエロ性女。', terms).map((m) => m.item.id)).toEqual([
      'saint',
    ]);
  });

  it('命中的片段里夹着标点或空白时不算', () => {
    const chars = [character('alicia', 'アリシア')];
    expect(findNearCharactersInText('「アリア、行こう」', chars)).toEqual([]);
    expect(findNearCharactersInText('アリ シアンが来た。', chars)).toEqual([]);
    // 片段里没有标点时，少一个字仍然算
    const terms = [term('order', '聖銀騎士団本部')];
    expect(findNearTermsInText('聖銀騎士本部へ向かう。', terms).map((m) => m.item.id)).toEqual([
      'order',
    ]);
  });

  it('同一个条目只报告一次；空文本或没有条目时返回空', () => {
    const terms = [term('saint', 'エロ聖女')];
    expect(findNearTermsInText('エロ性女、エロ生女、エロ声女。', terms)).toHaveLength(1);
    expect(findNearTermsInText('', terms)).toEqual([]);
    expect(findNearTermsInText('エロ性女', [])).toEqual([]);
  });
});
