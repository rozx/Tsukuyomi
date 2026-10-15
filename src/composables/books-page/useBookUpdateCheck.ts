import { onBeforeUnmount, shallowRef } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import type { BookSyncChangeset } from 'src/models/book-sync';
import type { Novel } from 'src/models/novel';
import { BookSyncService } from 'src/services/book-sync/book-sync-service';
import { builtinSite } from 'src/services/book-sync/recipe';
import { CheckedSessions } from 'src/services/book-sync/checked-sessions';
import { errorText } from 'src/composables/book-sync/useBookSync';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import { useSettingsStore } from 'src/stores/settings';

/**
 * 书架上的「检查更新」：不进入书籍详情，直接对单本书执行快速检查（只回放目录，不抓正文），
 * 在书卡上用角标展示结果；应用更新仍到 /books/:id/settings/update 完成，
 * 检查完成的会话经 CheckedSessions 交给更新页复用。
 *
 * 由 useBooksPage 在页面 dispatcher 中创建一次，检查状态跨设备变体保留。
 */

type CheckState =
  | { status: 'checking' }
  | { status: 'done'; newCount: number; changedCount: number };

export type BookUpdateCheck = ReturnType<typeof useBookUpdateCheck>;

export function useBookUpdateCheck() {
  const { t } = useI18n();
  const settingsStore = useSettingsStore();
  const toast = useToastWithHistory();
  const router = useRouter();

  const states = shallowRef(new Map<string, CheckState>());
  const controllers = new Map<string, AbortController>();

  function setState(bookId: string, state: CheckState | undefined): void {
    const next = new Map(states.value);
    if (state) next.set(bookId, state);
    else next.delete(bookId);
    states.value = next;
  }

  /** 已录制配方，或首个网址属于内置站点（与 resolveRecipe 的判定一致） */
  function canCheckUpdate(book: Novel): boolean {
    if (book.updateRecipe) return true;
    const url = book.webUrl?.[0];
    if (!url) return false;
    try {
      return !!builtinSite(url);
    } catch {
      return false;
    }
  }

  function isCheckingUpdate(book: Novel): boolean {
    return states.value.get(book.id)?.status === 'checking';
  }

  function updateCheckIcon(book: Novel): string {
    return isCheckingUpdate(book) ? 'pi pi-sync pi-spin' : 'pi pi-sync';
  }

  function updateCheckLabel(book: Novel): string {
    return isCheckingUpdate(book) ? t('libraryUi.checkingUpdate') : t('libraryUi.checkUpdate');
  }

  /** 有待处理更新时的角标文字；未检查、检查中或已是最新时为 null */
  function updateBadge(book: Novel): string | null {
    const state = states.value.get(book.id);
    if (state?.status !== 'done') return null;
    if (state.newCount) return t('libraryUi.updateBadgeNew', { count: state.newCount });
    if (state.changedCount) return t('libraryUi.updateBadgeChanged', { count: state.changedCount });
    return null;
  }

  function report(book: Novel, result: BookSyncChangeset): void {
    if (result.status === 'cancelled') {
      setState(book.id, undefined);
      return;
    }
    if (result.status === 'invalid') {
      setState(book.id, undefined);
      toast.add({
        severity: 'warn',
        summary: t('libraryUi.updateCheckFailed'),
        detail: t('libraryUi.updateInvalid', { title: book.title }),
        life: 6000,
      });
      return;
    }
    const newCount = result.new.length;
    const changedCount = result.dateNewer.length;
    setState(book.id, { status: 'done', newCount, changedCount });
    if (!newCount && !changedCount) {
      toast.add({
        severity: 'success',
        summary: t('libraryUi.upToDate'),
        detail: t('libraryUi.upToDateDetail', { title: book.title }),
        life: 3000,
      });
      return;
    }
    toast.add({
      severity: 'info',
      summary: t('libraryUi.updateFound'),
      detail: newCount
        ? t('libraryUi.updateFoundNew', { title: book.title, count: newCount })
        : t('libraryUi.updateFoundChanged', { title: book.title, count: changedCount }),
      life: 5000,
    });
  }

  async function checkBookUpdate(book: Novel): Promise<void> {
    if (controllers.has(book.id)) return;
    const controller = new AbortController();
    controllers.set(book.id, controller);
    CheckedSessions.drop(book.id);
    setState(book.id, { status: 'checking' });
    try {
      const session = await BookSyncService.openSession({ target: { bookId: book.id } });
      if (controller.signal.aborted) return;
      const result = await session.quickCheck(controller.signal);
      if (controller.signal.aborted) return;
      // 目录已回放：交给更新页复用，点角标进入时不必再等一次检查
      if (result.status === 'ready') CheckedSessions.put(book.id, session);
      report(book, result);
    } catch (error) {
      if (controller.signal.aborted) return;
      setState(book.id, undefined);
      toast.add({
        severity: 'error',
        summary: t('libraryUi.updateCheckFailed'),
        detail: t('libraryUi.updateCheckFailedDetail', {
          title: book.title,
          reason: errorText(error, settingsStore.uiLocale),
        }),
        life: 6000,
      });
    } finally {
      if (controllers.get(book.id) === controller) controllers.delete(book.id);
    }
  }

  function openBookUpdate(book: Novel) {
    return router.push(`/books/${book.id}/settings/update`);
  }

  onBeforeUnmount(() => {
    for (const controller of controllers.values()) controller.abort();
    controllers.clear();
  });

  return {
    canCheckUpdate,
    isCheckingUpdate,
    updateCheckIcon,
    updateCheckLabel,
    updateBadge,
    checkBookUpdate,
    openBookUpdate,
  };
}
