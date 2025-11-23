import { describe, test, expect } from 'bun:test';
import { matchCharactersInText, calculateCharacterScores, findUniqueCharactersInText } from '../utils/text-matcher';
import type { CharacterSetting } from '../models/novel';

describe('matchCharactersInText', () => {
  const createChar = (id: string, name: string, aliases: string[] = []): CharacterSetting => ({
    id,
    name,
    sex: 'male',
    translation: { id: `trans-${id}`, translation: name, aiModelId: 'test' },
    aliases: aliases.map(a => ({ name: a, translation: { id: `alias-${a}`, translation: a, aiModelId: 'test' } })),
    occurrences: []
  });

  test('should match simple unique characters', () => {
    const charA = createChar('1', 'Alice');
    const charB = createChar('2', 'Bob');
    const text = 'Alice met Bob.';
    
    const matches = matchCharactersInText(text, [charA, charB]);
    expect(matches).toHaveLength(2);
    expect(matches.find(m => m.matchedName === 'Alice')?.item.id).toBe('1');
    expect(matches.find(m => m.matchedName === 'Bob')?.item.id).toBe('2');
  });

  test('should resolve ambiguity based on occurrences', () => {
    // Both share alias "Al"
    const charA = createChar('1', 'Alice', ['Al']);
    const charB = createChar('2', 'Alfred', ['Al']);

    // Case 1: Alice appears more often (via explicit name)
    const text1 = 'Alice went to the market. Al followed.';
    const matches1 = matchCharactersInText(text1, [charA, charB]);
    
    const alMatch1 = matches1.find(m => m.matchedName === 'Al');
    expect(alMatch1).toBeDefined();
    expect(alMatch1?.item.id).toBe('1'); // Alice

    // Case 2: Alfred appears more often
    const text2 = 'Alfred went to the market. Al followed.';
    const matches2 = matchCharactersInText(text2, [charA, charB]);
    
    const alMatch2 = matches2.find(m => m.matchedName === 'Al');
    expect(alMatch2).toBeDefined();
    expect(alMatch2?.item.id).toBe('2'); // Alfred
  });

  test('should use contextScores for ambiguity resolution', () => {
      const charA = createChar('1', 'Alice', ['Al']);
      const charB = createChar('2', 'Alfred', ['Al']);
      
      const text = 'Al was there.';
      
      // Without context, defaults to first char (charA)
      const matchesDefault = matchCharactersInText(text, [charA, charB]);
      expect(matchesDefault[0]?.item.id).toBe('1');

      // With context preferring B (Alfred)
      const contextScores = new Map<string, number>();
      contextScores.set('1', 0);
      contextScores.set('2', 10);
      
      const matchesWithContext = matchCharactersInText(text, [charA, charB], contextScores);
      expect(matchesWithContext).toHaveLength(1);
      expect(matchesWithContext[0]?.item.id).toBe('2'); // Should be Alfred due to context
  });

  test('should handle tie by preserving original order', () => {
    const charA = createChar('1', 'Alice', ['Al']);
    const charB = createChar('2', 'Alfred', ['Al']);
    
    const text = 'Al was there.';
    const matches = matchCharactersInText(text, [charA, charB]);
    
    expect(matches).toHaveLength(1);
    expect(matches[0]?.item.id).toBe('1');

    const matchesSwapped = matchCharactersInText(text, [charB, charA]);
    expect(matchesSwapped).toHaveLength(1);
    expect(matchesSwapped[0]?.item.id).toBe('2');
  });
  
  test('should count multiple occurrences correctly', () => {
      const charA = createChar('1', 'Alice', ['X']);
      const charB = createChar('2', 'Bob', ['X']);
      
      const text = "Alice Alice X";
      const matches = matchCharactersInText(text, [charA, charB]);
      const xMatch = matches.find(m => m.matchedName === 'X');
      expect(xMatch?.item.id).toBe('1');
  });

  test('calculateCharacterScores should return correct counts', () => {
      const charA = createChar('1', 'Alice', ['Al']);
      const charB = createChar('2', 'Bob');
      
      const text = "Alice met Bob. Al said hi.";
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
    aliases: aliases.map(a => ({ name: a, translation: { id: `alias-${a}`, translation: a, aiModelId: 'test' } })),
    occurrences: []
  });

  test('should use contextScores to filter unique characters correctly', () => {
    const charA = createChar('1', 'Alice', ['Al']);
    const charB = createChar('2', 'Alfred', ['Al']);
    
    const text = 'Al was there.';
    
    // Default: Alice wins (because local score is tied 1-1 but charA is first)
    // Wait, matchCharactersInText sorts by score. If tied, it preserves order.
    // Here text="Al", so local score: A=1, B=1 (from Al).
    // So charA wins.
    const uniqueDefault = findUniqueCharactersInText(text, [charA, charB]);
    expect(uniqueDefault).toHaveLength(1);
    expect(uniqueDefault[0]?.id).toBe('1');

    // Context: Alfred wins
    const contextScores = new Map<string, number>();
    contextScores.set('2', 10);
    
    const uniqueContext = findUniqueCharactersInText(text, [charA, charB], contextScores);
    expect(uniqueContext).toHaveLength(1);
    expect(uniqueContext[0]?.id).toBe('2');
  });
});
