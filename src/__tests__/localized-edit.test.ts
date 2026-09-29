import './setup';
import { describe, expect, it, vi } from 'vitest';
import { computed, ref } from 'vue';
import type { Novel, Chapter } from '../models/novel';
import { useBooksStore } from '../stores/books';
import { BookService } from '../services/book-service';
import { useEditMode } from '../composables/book-details/useEditMode';
import { appendLanguageTranslation } from '../services/localization/selection';

vi.mock('src/composables/useToastHistory', () => ({
  useToastWithHistory: () => ({ add: vi.fn() }),
}));

describe('修改原文时清理多语言译文', () => {
  it('只清空变化段落的全部语言及选用，未变段落保持', async () => {
    const content = ['A', 'B'].map((text, index) =>
      appendLanguageTranslation(
        {
          id: `p${index}`,
          text,
          selectedTranslationId: '',
          translations: [],
        },
        'en-US',
        { id: `en${index}`, translation: text, aiModelId: 'm' },
        { counter: 1, actorId: 'A' },
        1000,
      ),
    );
    const chapter: Chapter = {
      id: 'c',
      title: 'C',
      content,
      createdAt: new Date(0),
      lastEdited: new Date(0),
    };
    const book: Novel = {
      id: 'b',
      title: 'B',
      createdAt: new Date(0),
      lastEdited: new Date(0),
      volumes: [{ id: 'v', title: 'V', chapters: [chapter] }],
    };
    await useBooksStore().addBook(book);
    const selected = ref<Chapter | null>(chapter);
    const edit = useEditMode(
      ref(book),
      selected,
      computed(() => selected.value?.content ?? []),
      ref('c'),
      () => {},
    );
    edit.startEditingOriginalText();
    edit.originalTextEditValue.value = 'Changed\nB';
    await edit.saveOriginalTextEdit();
    const saved = (await BookService.getBookById('b', true))!.volumes![0]!.chapters![0]!.content!;
    expect(saved[0]?.text).toBe('Changed');
    expect(saved[0]?.translations).toEqual([]);
    expect(saved[0]?.selectedTranslations).toEqual({});
    expect(saved[1]?.selectedTranslations?.['en-US']?.value).toBe('en1');
  });
});
