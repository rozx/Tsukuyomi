import { computed, ref, watch, onUnmounted } from 'vue';
import type { Ref } from 'vue';
import type {
  Novel,
  Chapter,
  Terminology,
  CharacterSetting,
  ScoreBreakdown,
} from 'src/models/novel';
import type { MemoryReference } from 'src/components/novel/memory-reference-types';
import { getNameTranslation } from 'src/services/localization/selection';
import {
  buildChapterSemanticQuery,
  selectRelevantMemoriesForChunk,
} from 'src/services/ai/tasks/utils/context-builder';

/** 页面三变体共用的记忆预览；输入变化即废弃旧请求。 */
export function useMemoryReferences(
  book: Readonly<Ref<Novel | undefined | null>>,
  chapter: Readonly<Ref<Chapter | null>>,
  terms: Readonly<Ref<Terminology[]>>,
  characters: Readonly<Ref<CharacterSetting[]>>,
) {
  const usedMemoryReferences = ref<MemoryReference[]>([]);
  const isLoadingMemoryReferences = ref(false);
  const mergedScoreBreakdowns = ref<Record<string, ScoreBreakdown>>({});
  let timer: ReturnType<typeof setTimeout> | null = null;
  let requestId = 0;
  let disposed = false;
  const input = computed(() => {
    const targetLanguage = book.value?.targetLanguage ?? 'zh-CN';
    return {
      bookId: book.value?.id,
      chapterId: chapter.value?.id,
      targetLanguage,
      text: chapter.value?.content?.map((paragraph) => paragraph.text).join('\n') ?? '',
      semanticQuery: buildChapterSemanticQuery(chapter.value ?? undefined, targetLanguage),
      terms: terms.value,
      characters: characters.value,
    };
  });
  // 序列化同时固定本次评分输入，不让等待中的实体修改改变旧请求。
  const inputKey = computed(() => {
    const { terms, characters, ...base } = input.value;
    const names = (
      entity: Terminology | CharacterSetting | CharacterSetting['aliases'][number],
    ) => [entity.name, getNameTranslation(entity, base.targetLanguage)?.translation ?? ''];
    return JSON.stringify({
      ...base,
      terms: terms.map(names),
      characters: characters.map((character) => [names(character), character.aliases.map(names)]),
    });
  });
  const clear = () => {
    usedMemoryReferences.value = [];
    mergedScoreBreakdowns.value = {};
  };
  const refreshReferencedMemories = async () => {
    if (disposed) return;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    const id = ++requestId;
    const key = inputKey.value;
    const snapshot = JSON.parse(JSON.stringify(input.value)) as typeof input.value;
    const current = () => !disposed && requestId === id && inputKey.value === key;
    if (!snapshot.bookId || !snapshot.text.trim()) {
      clear();
      isLoadingMemoryReferences.value = false;
      return;
    }
    isLoadingMemoryReferences.value = true;
    try {
      const { memories, breakdowns } = await selectRelevantMemoriesForChunk(
        snapshot.bookId,
        snapshot.text,
        snapshot.terms,
        snapshot.characters,
        snapshot.semanticQuery,
        snapshot.targetLanguage,
      );
      if (!current()) return;
      mergedScoreBreakdowns.value = breakdowns;
      usedMemoryReferences.value = memories.map((memory) => ({
        memoryId: memory.id,
        summary: memory.summary,
        accessedAt: memory.lastAccessedAt,
        toolName: 'search_memories' as const,
      }));
    } catch (error) {
      if (current()) console.warn('Failed to compute memory preview:', error);
    } finally {
      if (current()) isLoadingMemoryReferences.value = false;
    }
  };
  const scheduleMemoryPreview = (delayMs = 500) => {
    ++requestId;
    if (timer) clearTimeout(timer);
    clear();
    isLoadingMemoryReferences.value = false;
    if (disposed || !input.value.bookId || !input.value.text.trim()) return;
    timer = setTimeout(() => {
      timer = null;
      void refreshReferencedMemories();
    }, delayMs);
  };
  watch(inputKey, () => scheduleMemoryPreview(), { immediate: true, flush: 'sync' });
  onUnmounted(() => {
    disposed = true;
    ++requestId;
    if (timer) clearTimeout(timer);
    isLoadingMemoryReferences.value = false;
  });
  return {
    usedMemoryReferences,
    isLoadingMemoryReferences,
    mergedScoreBreakdowns,
    refreshReferencedMemories,
    scheduleMemoryPreview,
  };
}
