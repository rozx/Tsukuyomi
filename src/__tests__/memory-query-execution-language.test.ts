import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { chapterTranslationFixture, translationChapter } from './chapter-translation-fixture';
import { setNameTranslation } from '../services/localization/selection';
import { MemoryService } from '../services/memory-service';
import { EmbeddingService } from '../services/embedding-service';
import { memoryTools } from '../services/ai/tools/memory-tools';
import { paragraphTools } from '../services/ai/tools/paragraph-tools';
import { captureExecutionLanguages } from '../services/ai/tasks/utils/execution-languages';

afterEach(() => vi.restoreAllMocks());
describe('记忆检索别名沿用执行目标', () => {
  for (const toolName of ['search_memories', 'get_translation_history'] as const) {
    it(`${toolName} 不借用当前书籍目标的其他译名扩展查询`, async () => {
      const chapter = translationChapter('c', '11111111');
      chapter.content![0]!.text = '固有詞';
      const { books } = await chapterTranslationFixture([chapter]);
      await books.updateBook('fixture-book', { targetLanguage: 'zh-CN' });
      const owner = setNameTranslation(
        { original: '固有詞', translation: { id: 'cn', translation: '赤霄', aiModelId: '' } },
        'en-US',
        { id: 'en', translation: 'Silver sword', aiModelId: '' },
        { counter: 4, actorId: 'a' },
        0,
      );
      await books.updateBook('fixture-book', {
        terminologies: [{ id: 'term', name: '固有詞', ...owner }],
      });
      vi.spyOn(EmbeddingService, 'isReady').mockReturnValue(false);
      const own = await MemoryService.createMemory('fixture-book', 'Silver sword', 'Silver sword');
      const other = await MemoryService.createMemory('fixture-book', '赤霄', '赤霄');
      const tools = toolName === 'search_memories' ? memoryTools : paragraphTools;
      const result = JSON.parse(
        await tools
          .find((entry) => entry.definition.function.name === toolName)!
          .handler(
            toolName === 'search_memories'
              ? { query: '固有詞' }
              : { paragraph_id: '11111111', include_memory: true },
            { bookId: 'fixture-book', languages: captureExecutionLanguages('en-US') },
          ),
      );
      const rows = result.memories ?? result.related_memories;
      expect(rows.map((value: { id: string }) => value.id)).toContain(own.id);
      expect(rows.map((value: { id: string }) => value.id)).not.toContain(other.id);
    });
  }
});
