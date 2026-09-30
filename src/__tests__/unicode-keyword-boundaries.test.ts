import { describe, expect, it } from 'vitest';
import './setup';
import { containsWholeKeyword, replaceWholeKeyword } from '../services/ai/tools/paragraph-tools';
describe('Unicode 关键词边界', () => {
  for (const [text, keyword] of [
    ['café', 'caf'],
    ['e\u0301', 'e'],
    ['日本 مرحبا', 'مرحب'],
    ['中文 Приветик', 'Привет'],
    ['สวัสดีครับ', 'สวัสดี'],
  ] as const) {
    it(`${keyword} 不匹配 ${text} 的半个词`, () => {
      expect(containsWholeKeyword(text, keyword)).toBe(false);
      expect(replaceWholeKeyword(text, keyword, 'X')).toBe(text);
    });
  }
  for (const [text, keyword] of [
    ['مرحبا عالم', 'مرحبا'],
    ['Привет мир', 'Привет'],
    ['café noir', 'café'],
    ['e\u0301!', 'e\u0301'],
    ['สวัสดี ทุกคน', 'สวัสดี'],
    ['مرحبا先生', 'مرحبا'],
  ] as const) {
    it(`${keyword} 可匹配并替换 ${text} 中的完整词`, () => {
      expect(containsWholeKeyword(text, keyword)).toBe(true);
      expect(replaceWholeKeyword(text, keyword, 'X')).not.toBe(text);
    });
  }
});
