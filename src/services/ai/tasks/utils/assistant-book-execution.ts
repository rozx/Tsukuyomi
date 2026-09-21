import type { AITool } from 'src/services/ai/types/ai-service';
import { BookExecutionGuard } from 'src/services/book-execution-guard';
import { useBooksStore } from 'src/stores/books';

const BOOK_WRITERS = new Set([
  'create_term',
  'update_term',
  'delete_term',
  'create_character',
  'update_character',
  'delete_character',
  'create_memory',
  'update_memory',
  'delete_memory',
  'update_chapter_title',
  'update_book_info',
  'add_translation',
  'update_translation',
  'remove_translation',
  'select_translation',
  'batch_replace_translations',
  'add_translation_batch',
]);

/** 普通助手中可能写回书库的完整会话也覆盖模型等待和工具保存。 */
export function runAssistantBookExecution<T>(
  context: { currentBookId: string | null; currentChapterId: string | null },
  tools: AITool[],
  run: () => Promise<T>,
  sessionId?: string,
): Promise<T> {
  const bookId = context.currentBookId;
  if (!bookId || !tools.some((tool) => BOOK_WRITERS.has(tool.function.name))) return run();
  return BookExecutionGuard.write(
    bookId,
    {
      label: sessionId ? `月詠助手（会话 ${sessionId}）` : '月詠助手',
      ...(context.currentChapterId ? { chapterId: context.currentChapterId } : {}),
    },
    run,
    async () => {
      const book = await useBooksStore().refreshBookFromStorage(
        bookId,
        context.currentChapterId ?? undefined,
      );
      if (!book) throw new Error('BOOK_CHANGED: 目标小说已删除');
    },
  );
}
