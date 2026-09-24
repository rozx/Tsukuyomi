import { inject, provide, ref, type InjectionKey, type Ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { BookSyncApplyResult } from 'src/models/book-sync';
import { useCoverHistoryStore } from 'src/stores/cover-history';
import {
  provideBookSync,
  type BookSyncContext,
  type BookSyncTarget,
} from 'src/composables/book-sync/useBookSync';

/**
 * `/books/new/web` 页面：网址输入外壳 + 同步工作区。
 * 由 BookSyncNewPage dispatcher 调 provideBookSyncNew()，同时提供工作区会话，
 * 设备变体切换时网址、会话、勾选都不丢失。`?url=` 只在进入时读取一次。
 */
export interface BookSyncNewContext {
  url: Ref<string>;
  error: Ref<string>;
  sync: BookSyncContext;
  submit: () => void;
  goBack: () => void;
}

const BOOK_SYNC_NEW_KEY: InjectionKey<BookSyncNewContext> = Symbol('book-sync-new');

function normalizeUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

export function provideBookSyncNew(): BookSyncNewContext {
  const route = useRoute();
  const router = useRouter();
  const coverHistoryStore = useCoverHistoryStore();

  const initial = typeof route.query.url === 'string' ? normalizeUrl(route.query.url) : null;
  const url = ref(initial ?? '');
  const error = ref('');
  const target = ref<BookSyncTarget | null>(initial ? { newFrom: initial } : null);

  const onApplied = async (result: BookSyncApplyResult): Promise<void> => {
    // 与旧的导入流程一致：新书封面进入封面历史，便于之后换回
    if (result.cover) void coverHistoryStore.addCover(result.cover);
    await router.push(`/books/${result.bookId}`);
  };

  const sync = provideBookSync(target, { onApplied });

  const submit = (): void => {
    const value = normalizeUrl(url.value);
    if (!value) {
      error.value = '请输入以 http:// 或 https:// 开头的小说目录网址';
      return;
    }
    error.value = '';
    url.value = value;
    // 同一网址再次提交视为重新检查
    if (target.value && 'newFrom' in target.value && target.value.newFrom === value)
      void sync.recheck();
    else target.value = { newFrom: value };
  };

  const goBack = (): void => {
    if (window.history.length > 1) router.back();
    else void router.push('/books');
  };

  const ctx: BookSyncNewContext = { url, error, sync, submit, goBack };
  provide(BOOK_SYNC_NEW_KEY, ctx);
  return ctx;
}

export function injectBookSyncNew(): BookSyncNewContext {
  const ctx = inject(BOOK_SYNC_NEW_KEY);
  if (!ctx) throw new Error('injectBookSyncNew() 必须在 BookSyncNewPage dispatcher 内使用');
  return ctx;
}
