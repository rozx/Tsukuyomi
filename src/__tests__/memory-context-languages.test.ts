import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { chapterTranslationFixture, translationChapter } from './chapter-translation-fixture';
import { MemoryService } from '../services/memory-service';
import { EmbeddingService } from '../services/embedding-service';
import { setNameTranslation } from '../services/localization/selection';
import {
  getRelatedMemoriesForChunk,
  selectRelevantMemoriesForChunk,
  clearChunkEmbeddingCache,
} from '../services/ai/tasks/utils/context-builder';
import type { Terminology, CharacterSetting } from '../models/novel';

function owner(original: string, cn: string, en: string) {
  return setNameTranslation(
    { original, translation: { id: `${original}-cn`, translation: cn, aiModelId: '' } },
    'en-US',
    { id: `${original}-en`, translation: en, aiModelId: '' },
    { counter: 3, actorId: 'a' },
    0,
  );
}
afterEach(() => {
  vi.restoreAllMocks();
  clearChunkEmbeddingCache();
});
describe('记忆预览和注入目标一致', () => {
  it('等待记忆读取期间实体译名变化不改变已开始的评分输入', async () => {
    await chapterTranslationFixture([translationChapter('c', '11111111')]);
    vi.spyOn(EmbeddingService, 'isReady').mockReturnValue(false);
    const term: Terminology = {
      id: 'term',
      name: '源術語',
      ...owner('源術語', '简中术语', 'Silver sword'),
    };
    const memory = await MemoryService.createMemory('fixture-book', 'Silver sword', 'Silver sword');
    const original = MemoryService.getAllBookMemories.bind(MemoryService);
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    vi.spyOn(MemoryService, 'getAllBookMemories').mockImplementation(async (...args) => {
      entered.resolve();
      await release.promise;
      return original(...args);
    });
    const pending = selectRelevantMemoriesForChunk(
      'fixture-book',
      '源術語',
      [term],
      [],
      undefined,
      'en-US',
    );
    await entered.promise;
    Object.assign(
      term,
      setNameTranslation(
        term,
        'en-US',
        { id: 'changed-en', translation: 'Changed name', aiModelId: '' },
        { counter: 8, actorId: 'a' },
        0,
      ),
    );
    release.resolve();
    const result = await pending;
    expect(result.memories.map((value) => value.id)).toContain(memory.id);
  });

  for (const kind of ['term', 'character', 'alias'] as const) {
    it(`${kind} 译名按目标参与评分，缺失不会借其他语言`, async () => {
      await chapterTranslationFixture([translationChapter('c', '11111111')]);
      vi.spyOn(EmbeddingService, 'isReady').mockReturnValue(false);
      const term: Terminology = {
        id: 'term',
        name: '源術語',
        ...owner('源術語', '简中术语', 'Silver sword'),
      };
      const character: CharacterSetting = {
        id: 'character',
        name: '源人物',
        sex: 'other',
        ...owner('源人物', '简中角色', 'English hero'),
        aliases: [
          { id: 'alias', name: '源別名', ...owner('源別名', '简中别名', 'English nickname') },
        ],
      };
      const terms = kind === 'term' ? [term] : [];
      const characters = kind === 'term' ? [] : [character];
      const summary =
        kind === 'term'
          ? 'Silver sword'
          : kind === 'character'
            ? 'English hero'
            : 'English nickname';
      const selected = await MemoryService.createMemory('fixture-book', summary, summary);
      const other = await MemoryService.createMemory(
        'fixture-book',
        '简中术语 简中角色 简中别名',
        '简中术语 简中角色 简中别名',
      );
      const preview = await selectRelevantMemoriesForChunk(
        'fixture-book',
        '源術語 源人物 源別名',
        terms,
        characters,
        undefined,
        'en-US',
      );
      expect(preview.memories.map((memory) => memory.id)).toContain(selected.id);
      expect(preview.memories.map((memory) => memory.id)).not.toContain(other.id);
      const prompt = await getRelatedMemoriesForChunk(
        'fixture-book',
        '源術語 源人物 源別名',
        15,
        'c',
        terms,
        characters,
        undefined,
        'en-US',
        'en-US',
      );
      expect(prompt).toContain(`[${selected.id}]`);
      expect(prompt).not.toContain(`[${other.id}]`);
      const missing = await selectRelevantMemoriesForChunk(
        'fixture-book',
        '源術語 源人物 源別名',
        terms,
        characters,
        undefined,
        'zh-TW',
      );
      expect(missing.memories).toEqual([]);
    });
  }
});
