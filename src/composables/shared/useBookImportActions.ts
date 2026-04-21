import { v4 as uuidv4 } from 'uuid';
import type { Novel } from 'src/models/novel';
import type { useBooksStore } from 'src/stores/books';
import type { useCoverHistoryStore } from 'src/stores/cover-history';
import type { useToastWithHistory } from 'src/composables/useToastHistory';
import { buildNovelFromFormData } from 'src/utils/novel-form';

/**
 * `handleImportBook`（从网站导入）在 IndexPage / BooksPage 中逻辑完全一致：
 * 生成新 id、写入 lastEdited/createdAt、addBook、addCover、关闭导入弹窗、
 * 弹 toast（支持撤销）。此 helper 把这份行为抽出来，避免两处各自维护。
 *
 * 差异只来自"关闭哪个导入弹窗" ref，通过 `onAfterImport` 回调传入。
 */
export interface CreateImportBookHandlerOptions {
  booksStore: ReturnType<typeof useBooksStore>;
  coverHistoryStore: ReturnType<typeof useCoverHistoryStore>;
  toast: ReturnType<typeof useToastWithHistory>;
  /** 导入成功后的副作用（例如 `showImportDialog.value = false`）。 */
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

export function createImportBookHandler(options: CreateImportBookHandlerOptions) {
  const { booksStore, coverHistoryStore, toast, onAfterImport } = options;

  return async function handleImportBook(novel: Novel): Promise<void> {
    const now = new Date();
    const newBook: Novel = {
      ...novel,
      id: uuidv4(),
      createdAt: now,
      lastEdited: now,
    };
    await booksStore.addBook(newBook);

    if (newBook.cover) {
      void coverHistoryStore.addCover(newBook.cover);
    }

    onAfterImport?.();
    toast.add({
      severity: 'success',
      summary: '导入成功',
      detail: `已成功从网站导入书籍 "${newBook.title}"`,
      life: 3000,
      onRevert: () => booksStore.deleteBook(newBook.id),
    });
  };
}
