import { describe, test, expect } from 'bun:test';
import {
  matchCharactersInText,
  calculateCharacterScores,
  findUniqueCharactersInText,
  parseTextForHighlighting,
  removeFurigana,
} from '../utils/text-matcher';
import { getCharacterNameVariants } from '../utils/novel-utils';
import type { CharacterSetting } from '../models/novel';

describe('matchCharactersInText', () => {
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

  test('should match simple unique characters', () => {
    const charA = createChar('1', 'Alice');
    const charB = createChar('2', 'Bob');
    const text = 'Alice met Bob.';

    const matches = matchCharactersInText(text, [charA, charB]);
    expect(matches).toHaveLength(2);
    expect(matches.find((m) => m.matchedName === 'Alice')?.item.id).toBe('1');
    expect(matches.find((m) => m.matchedName === 'Bob')?.item.id).toBe('2');
  });

  test('should include all matching characters when ambiguity exists', () => {
    // Both share alias "Al"
    const charA = createChar('1', 'Alice', ['Al']);
    const charB = createChar('2', 'Alfred', ['Al']);

    // Case 1: Alice appears more often (via explicit name)
    const text1 = 'Alice went to the market. Al followed.';
    const matches1 = matchCharactersInText(text1, [charA, charB]);

    // Should have matches for "Alice", "Al" (both characters), and "Alfred" if present
    const alMatches1 = matches1.filter((m) => m.matchedName === 'Al');
    expect(alMatches1.length).toBeGreaterThanOrEqual(2); // Both characters should match
    expect(alMatches1.some((m) => m.item.id === '1')).toBe(true); // Alice should be included
    expect(alMatches1.some((m) => m.item.id === '2')).toBe(true); // Alfred should be included

    // Case 2: Alfred appears more often
    const text2 = 'Alfred went to the market. Al followed.';
    const matches2 = matchCharactersInText(text2, [charA, charB]);

    // Should have matches for "Alfred", "Al" (both characters)
    const alMatches2 = matches2.filter((m) => m.matchedName === 'Al');
    expect(alMatches2.length).toBeGreaterThanOrEqual(2); // Both characters should match
    expect(alMatches2.some((m) => m.item.id === '1')).toBe(true); // Alice should be included
    expect(alMatches2.some((m) => m.item.id === '2')).toBe(true); // Alfred should be included
  });

  test('should include all matching characters, sorted by context scores', () => {
    const charA = createChar('1', 'Alice', ['Al']);
    const charB = createChar('2', 'Alfred', ['Al']);

    const text = 'Al was there.';

    // Without context, should include both characters (sorted by local score, then order)
    const matchesDefault = matchCharactersInText(text, [charA, charB]);
    expect(matchesDefault.length).toBeGreaterThanOrEqual(2); // Both should be included
    expect(matchesDefault.some((m) => m.item.id === '1')).toBe(true);
    expect(matchesDefault.some((m) => m.item.id === '2')).toBe(true);

    // With context preferring B (Alfred), both should still be included, but B should be first
    const contextScores = new Map<string, number>();
    contextScores.set('1', 0);
    contextScores.set('2', 10);

    const matchesWithContext = matchCharactersInText(text, [charA, charB], contextScores);
    expect(matchesWithContext.length).toBeGreaterThanOrEqual(2); // Both should be included
    expect(matchesWithContext.some((m) => m.item.id === '1')).toBe(true);
    expect(matchesWithContext.some((m) => m.item.id === '2')).toBe(true);
    // First match should be Alfred (higher context score)
    expect(matchesWithContext[0]?.item.id).toBe('2');
  });

  test('should include all matching characters when scores are tied', () => {
    const charA = createChar('1', 'Alice', ['Al']);
    const charB = createChar('2', 'Alfred', ['Al']);

    const text = 'Al was there.';
    const matches = matchCharactersInText(text, [charA, charB]);

    // Should include both characters
    expect(matches.length).toBeGreaterThanOrEqual(2);
    expect(matches.some((m) => m.item.id === '1')).toBe(true);
    expect(matches.some((m) => m.item.id === '2')).toBe(true);
    // When tied, first character in input should be first in output
    expect(matches[0]?.item.id).toBe('1');

    const matchesSwapped = matchCharactersInText(text, [charB, charA]);
    expect(matchesSwapped.length).toBeGreaterThanOrEqual(2);
    expect(matchesSwapped.some((m) => m.item.id === '1')).toBe(true);
    expect(matchesSwapped.some((m) => m.item.id === '2')).toBe(true);
    // When tied, first character in input should be first in output
    expect(matchesSwapped[0]?.item.id).toBe('2');
  });

  test('should include all matching characters for ambiguous names', () => {
    const charA = createChar('1', 'Alice', ['X']);
    const charB = createChar('2', 'Bob', ['X']);

    const text = 'Alice Alice X';
    const matches = matchCharactersInText(text, [charA, charB]);
    // Should have matches for "Alice" (charA) and "X" (both charA and charB)
    const xMatches = matches.filter((m) => m.matchedName === 'X');
    expect(xMatches.length).toBeGreaterThanOrEqual(2); // Both characters should match "X"
    expect(xMatches.some((m) => m.item.id === '1')).toBe(true);
    expect(xMatches.some((m) => m.item.id === '2')).toBe(true);
  });

  test('calculateCharacterScores should return correct counts', () => {
    const charA = createChar('1', 'Alice', ['Al']);
    const charB = createChar('2', 'Bob');

    const text = 'Alice met Bob. Al said hi.';
    const scores = calculateCharacterScores(text, [charA, charB]);

    // Alice (1) + Al (1) = 2
    expect(scores.get('1')).toBe(2);
    // Bob (1) = 1
    expect(scores.get('2')).toBe(1);
  });
});

describe('findUniqueCharactersInText', () => {
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

  test('should return all unique characters that match the text', () => {
    const charA = createChar('1', 'Alice', ['Al']);
    const charB = createChar('2', 'Alfred', ['Al']);

    const text = 'Al was there.';

    // Should include both characters since both match "Al"
    const uniqueDefault = findUniqueCharactersInText(text, [charA, charB]);
    expect(uniqueDefault.length).toBe(2); // Exactly 2 characters
    expect(uniqueDefault.some((c) => c.id === '1')).toBe(true);
    expect(uniqueDefault.some((c) => c.id === '2')).toBe(true);

    // With context scores, both should still be included
    const contextScores = new Map<string, number>();
    contextScores.set('2', 10);

    const uniqueContext = findUniqueCharactersInText(text, [charA, charB], contextScores);
    expect(uniqueContext.length).toBe(2); // Exactly 2 characters
    expect(uniqueContext.some((c) => c.id === '1')).toBe(true);
    expect(uniqueContext.some((c) => c.id === '2')).toBe(true);
    // With higher context score, charB should be first
    expect(uniqueContext[0]?.id).toBe('2');
  });

  test('should return all characters when same text matches multiple characters', () => {
    const charA = createChar('1', 'Alice', ['X']);
    const charB = createChar('2', 'Bob', ['X']);
    const charC = createChar('3', 'Charlie', ['X']);

    const text = 'X said hello.';

    // All three characters match "X", so all should be returned
    const unique = findUniqueCharactersInText(text, [charA, charB, charC]);
    expect(unique.length).toBe(3); // All three characters
    expect(unique.some((c) => c.id === '1')).toBe(true);
    expect(unique.some((c) => c.id === '2')).toBe(true);
    expect(unique.some((c) => c.id === '3')).toBe(true);
  });
});

describe('parseTextForHighlighting', () => {
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

  test('should sort characters by occurrences in highlight nodes', () => {
    const charA = createChar('1', 'Alice', ['Al']);
    const charB = createChar('2', 'Alfred', ['Al']);

    // Text where Alice appears more often than Alfred
    const text = 'Alice met Alice. Al was there.';
    const nodes = parseTextForHighlighting(text, [], [charA, charB]);

    // Find the node for "Al"
    const alNode = nodes.find((n) => n.type === 'character' && n.content === 'Al');
    expect(alNode).toBeDefined();

    if (alNode && alNode.characters) {
      // Alice should be first (appears 2 times in text vs Alfred's 0 explicit appearances)
      expect(alNode.characters.length).toBe(2);
      expect(alNode.characters[0]?.id).toBe('1'); // Alice should be first
      expect(alNode.characters[1]?.id).toBe('2'); // Alfred should be second
    }
  });

  test('should sort characters by context scores when provided', () => {
    const charA = createChar('1', 'Alice', ['Al']);
    const charB = createChar('2', 'Alfred', ['Al']);

    const text = 'Al was there.';
    const contextScores = new Map<string, number>();
    contextScores.set('2', 10); // Alfred has higher context score
    contextScores.set('1', 0);

    const nodes = parseTextForHighlighting(text, [], [charA, charB], contextScores);

    const alNode = nodes.find((n) => n.type === 'character' && n.content === 'Al');
    expect(alNode).toBeDefined();

    if (alNode && alNode.characters) {
      // Alfred should be first due to higher context score
      expect(alNode.characters.length).toBe(2);
      expect(alNode.characters[0]?.id).toBe('2'); // Alfred should be first
      expect(alNode.characters[1]?.id).toBe('1'); // Alice should be second
    }
  });
});

describe('furigana matching', () => {
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

  describe('removeFurigana', () => {
    test('should remove furigana in parentheses', () => {
      expect(removeFurigana('鵜（う）飼（かい）')).toBe('鵜飼');
      expect(removeFurigana('東京（とうきょう）')).toBe('東京');
      expect(removeFurigana('漢字(かんじ)')).toBe('漢字');
    });

    test('should handle mixed furigana', () => {
      expect(removeFurigana('鵜（う）飼（かい）さん')).toBe('鵜飼さん');
      expect(removeFurigana('東京（とうきょう）タワー')).toBe('東京タワー');
    });

    test('should not affect text without furigana', () => {
      expect(removeFurigana('鵜飼')).toBe('鵜飼');
      expect(removeFurigana('Hello World')).toBe('Hello World');
    });
  });

  describe('getCharacterNameVariants', () => {
    test('should include furigana-removed variant', () => {
      const variants = getCharacterNameVariants('鵜（う）飼（かい）');
      expect(variants).toContain('鵜（う）飼（かい）'); // Original
      expect(variants).toContain('鵜飼'); // Without furigana
    });
  });

  describe('matchCharactersInText with furigana', () => {
    test('should match character when text contains furigana', () => {
      const char = createChar('1', '鵜飼');
      const text = '鵜（う）飼（かい）さんは来ました。';

      const matches = matchCharactersInText(text, [char]);
      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0]?.matchedName).toBe('鵜飼');
    });

    test('should match character with full-width parentheses furigana', () => {
      const char = createChar('1', '東京');
      const text = '東京（とうきょう）に行きました。';

      const matches = matchCharactersInText(text, [char]);
      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0]?.matchedName).toBe('東京');
    });

    test('should match character with half-width parentheses furigana', () => {
      const char = createChar('1', '漢字');
      const text = '漢字(かんじ)を勉強しました。';

      const matches = matchCharactersInText(text, [char]);
      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0]?.matchedName).toBe('漢字');
    });

    test('should still match without furigana', () => {
      const char = createChar('1', '鵜飼');
      const text = '鵜飼さんは来ました。';

      const matches = matchCharactersInText(text, [char]);
      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0]?.matchedName).toBe('鵜飼');
    });

    test('should match multiple characters with furigana', () => {
      const charA = createChar('1', '鵜飼');
      const charB = createChar('2', '東京');
      const text = '鵜（う）飼（かい）さんと東京（とうきょう）に行きました。';

      const matches = matchCharactersInText(text, [charA, charB]);
      const matchedNames = matches.map((m) => m.matchedName);
      expect(matchedNames).toContain('鵜飼');
      expect(matchedNames).toContain('東京');
    });
  });

  describe('calculateCharacterScores with furigana', () => {
    test('should count character occurrences with furigana', () => {
      const char = createChar('1', '鵜飼');
      const text = '鵜（う）飼（かい）さんは来ました。鵜飼さんは笑いました。';

      const scores = calculateCharacterScores(text, [char]);
      expect(scores.get('1')).toBe(2); // Both with and without furigana
    });
  });

  describe('findUniqueCharactersInText with furigana', () => {
    test('should find characters when text contains furigana', () => {
      const char = createChar('1', '鵜飼');
      const text = '鵜（う）飼（かい）さんは来ました。';

      const unique = findUniqueCharactersInText(text, [char]);
      expect(unique.length).toBe(1);
      expect(unique[0]?.id).toBe('1');
    });
  });

  describe('parseTextForHighlighting with furigana', () => {
    test('should highlight characters when text contains furigana', () => {
      const char = createChar('1', '鵜飼');
      const text = '鵜（う）飼（かい）さんは来ました。';

      const nodes = parseTextForHighlighting(text, [], [char]);
      const charNodes = nodes.filter((n) => n.type === 'character');
      expect(charNodes.length).toBeGreaterThan(0);
      expect(charNodes[0]?.content).toBe('鵜（う）飼（かい）'); // 原始文本中的内容（包含注音）
    });
  });
});
