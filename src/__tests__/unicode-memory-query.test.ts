import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { extractQueryUnits } from '../services/memory-scoring';
import { MemoryService } from '../services/memory-service';
import { paragraphTools } from '../services/ai/tools/paragraph-tools';
import { EmbeddingService } from '../services/embedding-service';
import { chapterTranslationFixture, translationChapter } from './chapter-translation-fixture';

afterEach(() => vi.restoreAllMocks());
describe('任意语言关键词进入实际记忆检索', () => {
  for (const suffix of ['𠀀', 'e\u0301']) {
    it(`段落工具提取关键词不切断 ${suffix} 的字符`, async () => {
      const expected = 'a'.repeat(19) + suffix;
      const chapter = translationChapter('c', '11111111');
      chapter.content![0]!.text = expected + ' rest';
      await chapterTranslationFixture([chapter]);
      const search = vi.spyOn(MemoryService, 'searchMemories').mockResolvedValue([]);
      const tool = paragraphTools.find(
        (entry) => entry.definition.function.name === 'get_translation_history',
      )!;
      await tool.handler(
        { paragraph_id: '11111111', include_memory: true },
        { bookId: 'fixture-book' },
      );
      expect(search).toHaveBeenCalledWith('fixture-book', expected, 'zh-CN');
    });
  }

  for (const text of [
    'مرحبا',
    'สวัสดี',
    'Привет',
    'café',
    'cafe\u0301',
    '𠀀𠀁',
    'は\u3099ら',
    'は\u309Aら',
  ]) {
    it(`${text} 保留完整语义单元并命中记忆`, async () => {
      expect(extractQueryUnits(text)).toEqual([text.toLowerCase()]);
      await chapterTranslationFixture([translationChapter('c', '11111111')]);
      vi.spyOn(EmbeddingService, 'isReady').mockReturnValue(false);
      const expected = await MemoryService.createMemory('fixture-book', text, text);
      const results = await MemoryService.searchMemories('fixture-book', text);
      expect(results.map((memory) => memory.id)).toContain(expected.id);
    });
  }
  it('混合原文分开提取各脚本，装饰符与孤立组合符不入检索', () => {
    expect(extractQueryUnits('中文 مرحبا café Привет ①')).toEqual([
      '中文',
      'مرحبا',
      'café',
      'привет',
      '①',
    ]);
    expect(extractQueryUnits('★ — \u0301 \u064E')).toEqual([]);
  });
});
