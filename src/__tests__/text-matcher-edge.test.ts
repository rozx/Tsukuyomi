import { describe, test, expect } from 'bun:test';
import {
  matchCharactersInText,
  matchTermsInText,
  parseTextForHighlighting,
  findUniqueCharactersInText,
} from '../utils/text-matcher';
import { getCharacterNameVariants } from '../utils/novel-utils';
import type { CharacterSetting, Terminology } from '../models/novel';

const createChar = (id: string, name: string, aliases: string[] = []): CharacterSetting => ({
  id,
  name,
  sex: 'male',
  translation: { id: `trans-${id}`, translation: name, aiModelId: 'test' },
  aliases: aliases.map((a) => ({
    name: a,
    translation: { id: `alias-${a}`, translation: a, aiModelId: 'test' },
  })),
});

const createTerm = (id: string, name: string, translation: string): Terminology => ({
  id,
  name,
  translation: { id: `trans-${id}`, translation, aiModelId: 'test' },
});

describe('Script-boundary name splitting (getCharacterNameVariants)', () => {
  test('should split kanji + hiragana name: 郷津ありす', () => {
    const variants = getCharacterNameVariants('郷津ありす');
    expect(variants).toContain('郷津ありす'); // original
    expect(variants).toContain('郷津'); // family name
    expect(variants).toContain('ありす'); // given name
  });

  test('should split kanji + katakana name: 佐藤エリカ', () => {
    const variants = getCharacterNameVariants('佐藤エリカ');
    expect(variants).toContain('佐藤エリカ');
    expect(variants).toContain('佐藤');
    expect(variants).toContain('エリカ');
  });

  test('should split hiragana + kanji name: はな田中', () => {
    const variants = getCharacterNameVariants('はな田中');
    expect(variants).toContain('はな田中');
    expect(variants).toContain('はな');
    expect(variants).toContain('田中');
  });

  test('should split katakana + kanji name: サクラ田中', () => {
    const variants = getCharacterNameVariants('サクラ田中');
    expect(variants).toContain('サクラ田中');
    expect(variants).toContain('サクラ');
    expect(variants).toContain('田中');
  });

  test('should NOT split all-kanji name: 田中太郎', () => {
    const variants = getCharacterNameVariants('田中太郎');
    expect(variants).toContain('田中太郎');
    expect(variants).not.toContain('田中');
    expect(variants).not.toContain('太郎');
  });

  test('should NOT split all-hiragana name: ありす', () => {
    const variants = getCharacterNameVariants('ありす');
    expect(variants).toContain('ありす');
    expect(variants.length).toBe(1);
  });

  test('should NOT split all-katakana name: アリス', () => {
    const variants = getCharacterNameVariants('アリス');
    expect(variants).toContain('アリス');
    expect(variants.length).toBe(1);
  });

  test('should NOT split short names (< 4 chars): 花あ', () => {
    const variants = getCharacterNameVariants('花あ');
    // Too short to split (total < 4)
    expect(variants).toContain('花あ');
    expect(variants).not.toContain('花');
  });

  test('should NOT split when one part would be < 2 chars: 花ありす', () => {
    const variants = getCharacterNameVariants('花ありす');
    expect(variants).toContain('花ありす');
    // "花" is only 1 char, so should not split
    expect(variants).not.toContain('花');
  });

  test('should NOT split hiragana ↔ katakana: アリスちゃん', () => {
    const variants = getCharacterNameVariants('アリスちゃん');
    expect(variants).toContain('アリスちゃん');
    // Should NOT split at katakana→hiragana boundary
    expect(variants).not.toContain('アリス');
    expect(variants).not.toContain('ちゃん');
  });

  test('should split name with furigana removed: 郷（ごう）津（つ）ありす', () => {
    const variants = getCharacterNameVariants('郷（ごう）津（つ）ありす');
    expect(variants).toContain('郷（ごう）津（つ）ありす'); // original
    expect(variants).toContain('郷津ありす'); // no furigana
    expect(variants).toContain('郷津'); // family name (from no-furigana split)
    expect(variants).toContain('ありす'); // given name (from no-furigana split)
  });

  test('should handle long name: 一之瀬ことみ', () => {
    const variants = getCharacterNameVariants('一之瀬ことみ');
    expect(variants).toContain('一之瀬ことみ');
    expect(variants).toContain('一之瀬');
    expect(variants).toContain('ことみ');
  });

  test('should NOT split when multiple script boundaries: 仁科りり子', () => {
    const variants = getCharacterNameVariants('仁科りり子');
    expect(variants).toContain('仁科りり子');
    // Has 2 boundaries (kanji→hiragana, hiragana→kanji), so should NOT split
    expect(variants).not.toContain('仁科');
    expect(variants).not.toContain('りり子');
  });
});

describe('Matching with script-boundary splitting', () => {
  test('should match family name only in text', () => {
    const char = createChar('1', '郷津ありす');
    const text = '郷津さんは笑った。';
    const matches = matchCharactersInText(text, [char]);
    expect(matches.length).toBe(1);
    expect(matches[0]?.matchedName).toBe('郷津');
  });

  test('should match given name only in text', () => {
    const char = createChar('1', '郷津ありす');
    const text = 'ありすは笑った。';
    const matches = matchCharactersInText(text, [char]);
    expect(matches.length).toBe(1);
    expect(matches[0]?.matchedName).toBe('ありす');
  });

  test('should match full name, family name, and given name in same text', () => {
    const char = createChar('1', '郷津ありす');
    const text = '郷津ありすは笑った。郷津さんは言った。ありすは嬉しい。';
    const matches = matchCharactersInText(text, [char]);
    expect(matches.length).toBe(3);
    expect(matches.some((m) => m.matchedName === '郷津ありす')).toBe(true);
    expect(matches.some((m) => m.matchedName === '郷津')).toBe(true);
    expect(matches.some((m) => m.matchedName === 'ありす')).toBe(true);
  });

  test('full name should take priority over split parts at overlapping position', () => {
    const char = createChar('1', '郷津ありす');
    const text = '郷津ありすが来た。';
    const matches = matchCharactersInText(text, [char]);
    // Should match the full name, not "郷津" + "ありす" separately
    expect(matches.length).toBe(1);
    expect(matches[0]?.matchedName).toBe('郷津ありす');
  });

  test('should work with findUniqueCharactersInText', () => {
    const char = createChar('1', '郷津ありす');
    const text = '郷津さんは笑った。';
    const unique = findUniqueCharactersInText(text, [char]);
    expect(unique.length).toBe(1);
    expect(unique[0]?.id).toBe('1');
  });

  test('should work with multiple characters having script-split names', () => {
    const charA = createChar('1', '郷津ありす');
    const charB = createChar('2', '佐藤エリカ');
    const text = '郷津さんとエリカが来た。';
    const matches = matchCharactersInText(text, [charA, charB]);
    expect(matches.some((m) => m.matchedName === '郷津' && m.item.id === '1')).toBe(true);
    expect(matches.some((m) => m.matchedName === 'エリカ' && m.item.id === '2')).toBe(true);
  });

  test('parseTextForHighlighting should highlight split name parts', () => {
    const char = createChar('1', '郷津ありす');
    const text = '郷津さんは笑った。ありすは嬉しい。';
    const nodes = parseTextForHighlighting(text, [], [char]);
    const charNodes = nodes.filter((n) => n.type === 'character');
    expect(charNodes.length).toBe(2);
    expect(charNodes.some((n) => n.content === '郷津')).toBe(true);
    expect(charNodes.some((n) => n.content === 'ありす')).toBe(true);
  });
});

describe('Long character names (>4 chars)', () => {
  test('should match 5-char Japanese name "郷津ありす"', () => {
    const char = createChar('1', '郷津ありす');
    const text = '郷津ありすが来た。';
    const matches = matchCharactersInText(text, [char]);
    expect(matches.length).toBe(1);
    expect(matches[0]?.matchedName).toBe('郷津ありす');
  });

  test('should match 5-char name among multiple characters', () => {
    const charA = createChar('1', '郷津ありす');
    const charB = createChar('2', '佐藤');
    const charC = createChar('3', '田中太郎');
    const text = '郷津ありすと佐藤と田中太郎が来た。';
    const matches = matchCharactersInText(text, [charA, charB, charC]);
    const matchedNames = matches.map((m) => m.matchedName);
    expect(matchedNames).toContain('郷津ありす');
    expect(matchedNames).toContain('佐藤');
    expect(matchedNames).toContain('田中太郎');
  });

  test('should match long name with furigana in text', () => {
    const char = createChar('1', '郷津ありす');
    const text = '郷（ごう）津（つ）ありすが来た。';
    const matches = matchCharactersInText(text, [char]);
    expect(matches.length).toBe(1);
    expect(matches[0]?.matchedName).toBe('郷津ありす');
    expect(matches[0]?.matchedText).toBe('郷（ごう）津（つ）ありす');
  });
});

describe('Alias matching', () => {
  test('should match character by alias', () => {
    const char = createChar('1', '郷津ありす', ['ありす']);
    const text = 'ありすが来た。';
    const matches = matchCharactersInText(text, [char]);
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches.some((m) => m.matchedName === 'ありす')).toBe(true);
  });

  test('should match both primary name and alias in same text', () => {
    const char = createChar('1', '郷津ありす', ['ありす']);
    const text = '郷津ありすは笑った。ありすは言った。';
    const matches = matchCharactersInText(text, [char]);
    expect(matches.length).toBe(2);
    const names = matches.map((m) => m.matchedName);
    expect(names).toContain('郷津ありす');
    expect(names).toContain('ありす');
  });

  test('should match long alias (>4 chars)', () => {
    const char = createChar('1', 'アリス', ['郷津ありす']);
    const text = '郷津ありすが来た。';
    const matches = matchCharactersInText(text, [char]);
    expect(matches.length).toBe(1);
    expect(matches[0]?.matchedName).toBe('郷津ありす');
  });
});

describe('Multiple characters and terms in one paragraph', () => {
  test('should match characters and terms without interference', () => {
    const charA = createChar('1', '郷津ありす');
    const charB = createChar('2', '佐藤');
    const termA = createTerm('t1', '魔法', 'magic');
    const termB = createTerm('t2', '学園', 'academy');
    const text = '郷津ありすは魔法学園で佐藤と会った。';

    const charMatches = matchCharactersInText(text, [charA, charB]);
    const termMatches = matchTermsInText(text, [termA, termB]);

    expect(charMatches.some((m) => m.matchedName === '郷津ありす')).toBe(true);
    expect(charMatches.some((m) => m.matchedName === '佐藤')).toBe(true);
    expect(termMatches.some((m) => m.matchedName === '魔法')).toBe(true);
    expect(termMatches.some((m) => m.matchedName === '学園')).toBe(true);
  });

  test('parseTextForHighlighting with many characters and terms', () => {
    const chars = [
      createChar('1', '郷津ありす', ['ありす']),
      createChar('2', '佐藤太郎', ['太郎']),
      createChar('3', '鈴木花子', ['花子']),
    ];
    const terms = [
      createTerm('t1', '魔法', 'magic'),
      createTerm('t2', '学園', 'academy'),
    ];
    const text = '郷津ありすは魔法学園で佐藤太郎と鈴木花子に会った。';

    const nodes = parseTextForHighlighting(text, terms, chars);
    const charNodes = nodes.filter((n) => n.type === 'character');
    const termNodes = nodes.filter((n) => n.type === 'term');

    expect(charNodes.some((n) => n.content === '郷津ありす')).toBe(true);
    expect(charNodes.some((n) => n.content === '佐藤太郎')).toBe(true);
    expect(charNodes.some((n) => n.content === '鈴木花子')).toBe(true);
    expect(termNodes.some((n) => n.content === '魔法')).toBe(true);
    expect(termNodes.some((n) => n.content === '学園')).toBe(true);
  });
});
