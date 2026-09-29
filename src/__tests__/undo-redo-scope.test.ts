import { describe, expect, it } from 'vitest';
import './setup';
import { ref } from 'vue';
import { useUndoRedo } from '../composables/useUndoRedo';
import type { Novel } from '../models/novel';

const initial: Novel = {
  id: 'b',
  title: 'Before',
  targetLanguage: 'en-US',
  createdAt: new Date(0),
  lastEdited: new Date(0),
};

describe('撤销重做范围', () => {
  it('撤销和重做携带原操作语言，恢复失败不丢失历史', async () => {
    const book = ref<Novel | undefined>(initial);
    const scopes: unknown[] = [];
    let fail = true;
    const history = useUndoRedo(book, (saved, scope) => {
      if (fail) throw new Error('STORAGE_FAILED');
      scopes.push(scope);
      book.value = saved;
    });
    const scope = { kind: 'translation' as const, language: 'en-US' as const, chapterId: 'c' };
    history.saveState('编辑英文', scope);
    book.value = { ...initial, title: 'After', targetLanguage: 'zh-TW' };
    await expect(history.undo()).rejects.toThrow('STORAGE_FAILED');
    expect(history.canUndo.value).toBe(true);
    expect(history.canRedo.value).toBe(false);
    fail = false;
    await history.undo();
    await history.redo();
    expect(scopes).toEqual([scope, scope]);
    expect(book.value.title).toBe('After');
  });
});
