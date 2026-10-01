import './setup';
import { describe, expect, it } from 'bun:test';
import { createPinia, setActivePinia } from 'pinia';
import { buildNovelFromFormData } from '../utils/novel-form';
import { useSettingsStore } from '../stores/settings';
import { useBooksStore } from '../stores/books';
import { BookService } from '../services/book-service';
import { commitSyncChanges } from '../services/book-sync/persistence';

describe('创建时固定书籍目标语言', () => {
  it('手动新建采用调用时的界面语言，导入或恢复旧书仍归简中', async () => {
    setActivePinia(createPinia());
    await useSettingsStore().setUiLocale('en-US');
    const created = buildNovelFromFormData({ title: 'New' }, 'en-US');
    expect(created.targetLanguage).toBe('en-US');
    await useBooksStore().addBook({
      id: 'old',
      title: 'Restored',
      lastEdited: new Date(0),
      createdAt: new Date(0),
    });
    expect((await BookService.getBookById('old'))?.targetLanguage).toBe('zh-CN');
  });

  it('站点导入在最终事务中读取偏好，不使用目录预览时的语言', async () => {
    setActivePinia(createPinia());
    const draft = buildNovelFromFormData({ title: 'Web' }, 'zh-CN');
    await useSettingsStore().setUiLocale('zh-TW');
    await commitSyncChanges({ bookId: draft.id, baseRevision: null, newBook: draft, writes: [] });
    expect((await BookService.getBookById(draft.id))?.targetLanguage).toBe('zh-TW');
  });
});
