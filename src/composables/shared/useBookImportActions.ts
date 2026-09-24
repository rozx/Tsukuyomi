import type { Novel } from 'src/models/novel';
import type { useBooksStore } from 'src/stores/books';
import type { useCoverHistoryStore } from 'src/stores/cover-history';
import type { useToastWithHistory } from 'src/composables/useToastHistory';
import { buildNovelFromFormData } from 'src/utils/novel-form';

/**
 * 新增书籍的共享依赖。差异只来自"关闭哪个弹窗"，通过 `onAfterImport` 回调传入。
 * （从网站导入已改为 /books/new/web 同步工作区，由同步服务写入。）
 */
export interface CreateImportBookHandlerOptions {
  booksStore: ReturnType<typeof useBooksStore>;
  coverHistoryStore: ReturnType<typeof useCoverHistoryStore>;
  toast: ReturnType<typeof useToastWithHistory>;
  /** 保存成功后的副作用（例如 `showAddDialog.value = false`）。 */
  onAfterImport?: () => void;
}

/**
 * `handleSave` / `saveNewBook`（BookDialog 新增书籍）在 IndexPage / BooksPage 完全一致：
 * 用表单数据构造 Novel、addBook、加入封面历史、关闭新增弹窗、弹「添加成功」toast（可撤销）。
 */
export function createSaveNewBookHandler(options: CreateImportBookHandlerOptions) {
  const { booksStore, coverHistoryStore, toast, onAfterImport } = options;

  return async function saveNewBook(formData: Partial<Novel>): Promise<void> {
    const newBook = buildNovelFromFormData(formData);
    await booksStore.addBook(newBook);

    if (newBook.cover) {
      void coverHistoryStore.addCover(newBook.cover);
    }

    onAfterImport?.();
    toast.add({
      severity: 'success',
      summary: '添加成功',
      detail: `已成功添加书籍 "${newBook.title}"`,
      life: 3000,
      onRevert: () => booksStore.deleteBook(newBook.id),
    });
  };
}
