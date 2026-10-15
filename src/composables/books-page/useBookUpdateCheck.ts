import { computed, onBeforeUnmount, shallowRef } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import type { BookSyncChangeset } from 'src/models/book-sync';
import type { Novel } from 'src/models/novel';
import { BookSyncService } from 'src/services/book-sync/book-sync-service';
import { builtinSite } from 'src/services/book-sync/recipe';
import { CheckedSessions } from 'src/services/book-sync/checked-sessions';
import {
  buildUpdateCheckRecord,
  loadUpdateCheckRecords,
  pendingUpdateCounts,
  saveUpdateCheckRecords,
  type UpdateCheckRecord,
} from 'src/services/book-sync/update-check-records';
import { errorText } from 'src/composables/book-sync/useBookSync';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import { useSettingsStore } from 'src/stores/settings';
import { useBooksStore } from 'src/stores/books';

/**
 * 书架上的「检查更新」：不进入书籍详情，直接对单本书执行快速检查（只回放目录，不抓正文），
 * 在书卡上用角标展示结果；应用更新仍到 /books/:id/settings/update 完成，
 * 检查完成的会话经 CheckedSessions 交给更新页复用。
 *
 * 「全部检查更新」对所有可检查的书限并发执行同样的快速检查，静默收集结果，
 * 跑完只弹一条汇总提示；各书角标照常更新。
 *
 * 由 useBooksPage 在页面 dispatcher 中创建一次，检查状态跨设备变体保留；检查结果另存本机，
 * 刷新页面后角标仍在，并按当前书籍重新计算（见 update-check-records）。
 */

/** 单本检查的结果，由调用方决定如何提示 */
type CheckOutcome =
  | { kind: 'cancelled' }
  | { kind: 'invalid' }
  | { kind: 'error'; error: unknown }
  | { kind: 'done'; newCount: number; changedCount: number };

/** 全部检查的并发上限：避免同时向站点发起过多目录请求 */
const CHECK_ALL_CONCURRENCY = 2;

/**
 * 冷却：最近检查过的书直接沿用上次结果、不再请求目录，避免连点触发站点限流
 * （连续被拒会让该站点熔断数分钟，连带导入与更新页也无法请求）。
 * 单本按钮冷却较短；全部检查沿用与更新页会话交接相同的有效期。强制刷新走更新页的「重新检查」。
 */
const SINGLE_CHECK_COOLDOWN_MS = 60_000;
const CHECK_ALL_FRESH_MS = 10 * 60_000;

/** 开始全部检查后这段时间内的点击不当作取消，避免双击刚开始就被取消 */
const CANCEL_GRACE_MS = 1_000;

interface BookUpdateCheckOptions {
  /** 「全部检查更新」的书籍来源（书架全部书籍，不受搜索过滤影响） */
  books?: () => readonly Novel[];
}

export type BookUpdateCheck = ReturnType<typeof useBookUpdateCheck>;

export function useBookUpdateCheck(options: BookUpdateCheckOptions = {}) {
  const { t } = useI18n();
  const settingsStore = useSettingsStore();
  const booksStore = useBooksStore();
  const toast = useToastWithHistory();
  const router = useRouter();

  const checking = shallowRef(new Set<string>());
  const records = shallowRef(loadUpdateCheckRecords());
  const controllers = new Map<string, AbortController>();
  const checkAllProgress = shallowRef<{ checked: number; total: number } | null>(null);
  let checkAllController: AbortController | null = null;
  let checkAllStartedAt = 0;

  function setChecking(bookId: string, on: boolean): void {
    const next = new Set(checking.value);
    if (on) next.add(bookId);
    else next.delete(bookId);
    checking.value = next;
  }

  /** 写入或删除一本书的检查结果并持久化；顺带清掉已不在书架上的书 */
  function setRecord(bookId: string, record: UpdateCheckRecord | undefined): void {
    const next = { ...records.value };
    if (record) next[bookId] = record;
    else delete next[bookId];
    const shelf = options.books?.();
    if (shelf?.length) {
      const ids = new Set(shelf.map((book) => book.id));
      for (const id of Object.keys(next)) if (id !== bookId && !ids.has(id)) delete next[id];
    }
    records.value = next;
    saveUpdateCheckRecords(next);
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
    return checking.value.has(book.id);
  }

  function updateCheckIcon(book: Novel): string {
    return isCheckingUpdate(book) ? 'pi pi-sync pi-spin' : 'pi pi-sync';
  }

  function updateCheckLabel(book: Novel): string {
    return isCheckingUpdate(book) ? t('libraryUi.checkingUpdate') : t('libraryUi.checkUpdate');
  }

  /** 有待处理更新时的角标文字；未检查、检查中或已是最新时为 null */
  function updateBadge(book: Novel): string | null {
    const record = records.value[book.id];
    if (!record || isCheckingUpdate(book)) return null;
    const { newCount, changedCount } = pendingUpdateCounts(book, record);
    if (newCount) return t('libraryUi.updateBadgeNew', { count: newCount });
    if (changedCount) return t('libraryUi.updateBadgeChanged', { count: changedCount });
    return null;
  }

  function toOutcome(result: BookSyncChangeset): CheckOutcome {
    if (result.status === 'cancelled') return { kind: 'cancelled' };
    if (result.status === 'invalid') return { kind: 'invalid' };
    return { kind: 'done', newCount: result.new.length, changedCount: result.dateNewer.length };
  }

  /**
   * 只检查不提示：更新检查中状态与保存的检查结果并返回结果（取消时保留上一次结果）。同一本书已在检查中时返回 null。
   * `parent` 中止（全部检查被取消）时一并中止本书检查。
   * `freshForMs` 内检查过的书不发请求，按当前书籍重算上次结果返回。
   */
  async function runCheck(
    book: Novel,
    freshForMs: number,
    parent?: AbortSignal,
  ): Promise<CheckOutcome | null> {
    if (controllers.has(book.id)) return null;
    const previous = records.value[book.id];
    if (previous && Date.now() - previous.checkedAt < freshForMs)
      return { kind: 'done', ...pendingUpdateCounts(book, previous) };
    const controller = new AbortController();
    const abort = () => controller.abort();
    parent?.addEventListener('abort', abort);
    controllers.set(book.id, controller);
    CheckedSessions.drop(book.id);
    setChecking(book.id, true);
    let outcome: CheckOutcome = { kind: 'cancelled' };
    let record: UpdateCheckRecord | undefined;
    try {
      const session = await BookSyncService.openSession({ target: { bookId: book.id } });
      if (!controller.signal.aborted) {
        const result = await session.quickCheck(controller.signal);
        // 目录已回放：交给更新页复用，点角标进入时不必再等一次检查
        if (result.status === 'ready' && !controller.signal.aborted)
          CheckedSessions.put(book.id, session);
        outcome = toOutcome(result);
        // 检查期间会话可能给手动章节写回网址：用 store 里的最新书籍生成记录
        if (outcome.kind === 'done')
          record = buildUpdateCheckRecord(
            booksStore.getBookById(book.id) ?? book,
            result,
            Date.now(),
          );
      }
    } catch (error) {
      outcome = { kind: 'error', error };
    } finally {
      parent?.removeEventListener('abort', abort);
      if (controllers.get(book.id) === controller) controllers.delete(book.id);
    }
    if (controller.signal.aborted) outcome = { kind: 'cancelled' };
    setChecking(book.id, false);
    if (outcome.kind !== 'cancelled') setRecord(book.id, record);
    return outcome;
  }

  /** 单本检查的提示 */
  function notify(book: Novel, outcome: CheckOutcome): void {
    switch (outcome.kind) {
      case 'cancelled':
        return;
      case 'invalid':
        toast.add({
          severity: 'warn',
          summary: t('libraryUi.updateCheckFailed'),
          detail: t('libraryUi.updateInvalid', { title: book.title }),
          life: 6000,
        });
        return;
      case 'error':
        toast.add({
          severity: 'error',
          summary: t('libraryUi.updateCheckFailed'),
          detail: t('libraryUi.updateCheckFailedDetail', {
            title: book.title,
            reason: errorText(outcome.error, settingsStore.uiLocale),
          }),
          life: 6000,
        });
        return;
    }
    const { newCount, changedCount } = outcome;
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
    const outcome = await runCheck(book, SINGLE_CHECK_COOLDOWN_MS);
    if (outcome) notify(book, outcome);
  }

  const checkableBooks = computed(() => (options.books?.() ?? []).filter(canCheckUpdate));
  const isCheckingAll = computed(() => checkAllProgress.value !== null);
  // 进行中按钮是取消入口：即使期间书架已没有可检查的书也要保持可用
  const canCheckAll = computed(() => isCheckingAll.value || checkableBooks.value.length > 0);
  const checkAllLabel = computed(() => {
    const progress = checkAllProgress.value;
    return progress ? t('libraryUi.checkAllProgress', progress) : t('libraryUi.checkAllUpdates');
  });

  /** 全部检查的汇总提示：有更新 > 有失败 > 全部最新 */
  function notifyCheckAll(outcomes: CheckOutcome[]): void {
    const total = outcomes.length;
    const updated = outcomes.filter(
      (o) => o.kind === 'done' && (o.newCount > 0 || o.changedCount > 0),
    ).length;
    const failed = outcomes.filter((o) => o.kind === 'invalid' || o.kind === 'error').length;
    if (updated) {
      toast.add({
        severity: 'info',
        summary: t('libraryUi.updateFound'),
        detail: failed
          ? t('libraryUi.checkAllUpdatedWithFailed', { count: updated, failed })
          : t('libraryUi.checkAllUpdated', { count: updated }),
        life: 6000,
      });
    } else if (failed) {
      toast.add({
        severity: 'warn',
        summary: t('libraryUi.checkAllDone'),
        detail: t('libraryUi.checkAllFailed', { total, failed }),
        life: 6000,
      });
    } else {
      toast.add({
        severity: 'success',
        summary: t('libraryUi.upToDate'),
        detail: t('libraryUi.checkAllUpToDate', { count: total }),
        life: 3000,
      });
    }
  }

  /** 对所有可检查的书限并发执行快速检查，结束后合并为一条汇总提示；取消则不提示 */
  async function checkAllUpdates(): Promise<void> {
    if (checkAllController) return;
    const queue = [...checkableBooks.value];
    if (!queue.length) return;
    const controller = new AbortController();
    checkAllController = controller;
    checkAllStartedAt = Date.now();
    const total = queue.length;
    const outcomes: CheckOutcome[] = [];
    checkAllProgress.value = { checked: 0, total };

    let checked = 0;
    const worker = async () => {
      for (let book = queue.shift(); book; book = queue.shift()) {
        if (controller.signal.aborted) return;
        const outcome = await runCheck(book, CHECK_ALL_FRESH_MS, controller.signal);
        // 已在单独检查中的书（返回 null）由它自己的流程提示，这里只计入进度
        if (outcome) outcomes.push(outcome);
        if (controller.signal.aborted) return;
        checked++;
        checkAllProgress.value = { checked, total };
      }
    };
    try {
      await Promise.all(Array.from({ length: CHECK_ALL_CONCURRENCY }, worker));
    } finally {
      if (checkAllController === controller) checkAllController = null;
      checkAllProgress.value = null;
    }
    if (!controller.signal.aborted && outcomes.length) notifyCheckAll(outcomes);
  }

  function cancelCheckAll(): void {
    checkAllController?.abort();
  }

  /** 工具栏按钮：空闲时开始全部检查，进行中再点则取消（刚开始的 1 秒内不响应，防双击） */
  function toggleCheckAll(): Promise<void> {
    if (checkAllController) {
      if (Date.now() - checkAllStartedAt >= CANCEL_GRACE_MS) cancelCheckAll();
      return Promise.resolve();
    }
    return checkAllUpdates();
  }

  const checkAllIcon = computed(() =>
    checkAllProgress.value ? 'pi pi-sync pi-spin' : 'pi pi-sync',
  );
  /** 紧凑进度（手机 / 平板图标按钮用），如 `1/4`；未在检查时为 null */
  const checkAllCount = computed(() => {
    const progress = checkAllProgress.value;
    return progress ? `${progress.checked}/${progress.total}` : null;
  });

  const checkAllTitle = computed(() => {
    const progress = checkAllProgress.value;
    if (progress) return t('libraryUi.cancelCheckAll', progress);
    return canCheckAll.value ? t('libraryUi.checkAllUpdates') : t('libraryUi.checkAllNone');
  });

  function openBookUpdate(book: Novel) {
    return router.push(`/books/${book.id}/settings/update`);
  }

  onBeforeUnmount(() => {
    checkAllController?.abort();
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
    canCheckAll,
    isCheckingAll,
    checkAllProgress,
    checkAllLabel,
    checkAllIcon,
    checkAllCount,
    checkAllTitle,
    checkAllUpdates,
    toggleCheckAll,
  };
}
