import type { AITool } from 'src/services/ai/types/ai-service';
import { BookExecutionGuard } from 'src/services/book-execution-guard';
import { useBooksStore } from 'src/stores/books';
import { LocalizedError } from 'src/utils/localized-error';
import { translateText } from 'src/i18n/translate';

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
      // 结构化身份：占用提示在各页面按界面语言渲染，label 为简中回退
      ...(sessionId
        ? {
            label: translateText('zh-CN', 'bookUi.execution.assistantOwner', {
              session: sessionId,
            }),
            labelKey: 'bookUi.execution.assistantOwner' as const,
            labelValues: { session: sessionId },
          }
        : {
            label: translateText('zh-CN', 'bookUi.execution.assistantOwnerDefault'),
            labelKey: 'bookUi.execution.assistantOwnerDefault' as const,
          }),
      ...(context.currentChapterId ? { chapterId: context.currentChapterId } : {}),
    },
    run,
    async () => {
      const book = await useBooksStore().refreshBookFromStorage(
        bookId,
        context.currentChapterId ?? undefined,
      );
      // 用户可见：由聊天发送失败提示按界面语言渲染，按错误码识别
      if (!book) throw new LocalizedError('BOOK_CHANGED', 'activityUi.chat.bookDeleted');
    },
  );
}
