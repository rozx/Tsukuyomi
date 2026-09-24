import {
  computed,
  inject,
  onBeforeUnmount,
  provide,
  ref,
  shallowRef,
  toRaw,
  watch,
  type ComputedRef,
  type InjectionKey,
  type Ref,
} from 'vue';
import { useRouter } from 'vue-router';
import type {
  BookSyncApplyResult,
  BookSyncChangeset,
  BookUpdateRecipe,
  CatalogEntry,
  SyncVolumeTarget,
} from 'src/models/book-sync';
import type { Volume } from 'src/models/novel';
import { BookSyncService } from 'src/services/book-sync/book-sync-service';
import { BookSyncError } from 'src/services/book-sync/errors';
import { resolveRecipe } from 'src/services/book-sync/recipe';
import { FEATURES } from 'src/constants/features';
import { useBooksStore } from 'src/stores/books';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import { getErrorMessage } from 'src/utils/error-message';
import {
  buildConfirmSummary,
  driftWarning,
  reconcileSelection,
  type BookSyncConfirmSummary,
} from './book-sync-rules';
import { handoffToImporter, repairWithImporter } from './book-sync-handoff';

/**
 * 书籍同步工作区的共享状态（新建与更新共用）。
 *
 * 由 BookSyncWorkspace dispatcher 调 provideBookSync()，各设备变体与片段 inject。
 * 会话、勾选、目标卷覆盖都放在这里，断点切换替换变体时不会丢失，也不会重复检查。
 */

export type BookSyncTarget = { bookId: string } | { newFrom: string };
type Session = Awaited<ReturnType<typeof BookSyncService.openSession>>;

/**
 * - idle：没有目标（新建页尚未输入网址）
 * - checking：打开会话并执行快速检查
 * - ready：变更集可用
 * - missing：没有配方（非内置站点、也没有录制过配方）
 * - invalid：配方回放失败，变更集只含失败原因
 * - error：其他错误（读取书籍失败、网络错误等）
 */
export type BookSyncPhase = 'idle' | 'checking' | 'ready' | 'missing' | 'invalid' | 'error';

export type BookSyncConfirm =
  | { stage: 'closed' }
  | { stage: 'confirming' | 'applying'; summary: BookSyncConfirmSummary; reconfirm: boolean };

export interface BookSyncRecipeView {
  engine: BookUpdateRecipe['engine']['kind'];
  site?: string;
  catalogUrl: string;
  cleanupCount: number;
  virtual: boolean;
}

export interface BookSyncOptions {
  /** 应用成功（含部分成功）后的外壳动作：新建跳转到新书等 */
  onApplied?: (result: BookSyncApplyResult) => void | Promise<void>;
}

export interface BookSyncContext {
  target: Readonly<Ref<BookSyncTarget | null>>;
  phase: Ref<BookSyncPhase>;
  message: Ref<string>;
  changeset: Ref<BookSyncChangeset | null>;
  recipe: ComputedRef<BookSyncRecipeView | null>;
  volumes: ComputedRef<Volume[]>;
  selected: Ref<Set<string>>;
  volumeOverrides: Ref<Map<string, SyncVolumeTarget>>;
  drift: ComputedRef<boolean>;
  summary: ComputedRef<BookSyncConfirmSummary>;
  deep: Ref<{ running: boolean; completed: number; total: number }>;
  confirm: Ref<BookSyncConfirm>;
  working: ComputedRef<boolean>;
  canUndo: Ref<boolean>;
  canHandoff: boolean;
  recheck: () => Promise<void>;
  startDeepCheck: () => Promise<void>;
  cancelDeepCheck: () => void;
  toggle: (url: string, on?: boolean) => void;
  setUpdatedSelected: (on: boolean) => void;
  setGroupTarget: (groupKey: string, target: SyncVolumeTarget | null) => void;
  setSkipped: (entries: Pick<CatalogEntry, 'url' | 'title'>[], skipped: boolean) => Promise<void>;
  preview: (url: string) => Promise<string[]>;
  requestApply: () => void;
  confirmApply: () => Promise<void>;
  cancelConfirm: () => void;
  retry: (url: string) => Promise<void>;
  undo: () => Promise<void>;
  handoff: () => Promise<void>;
}

const BOOK_SYNC_KEY: InjectionKey<BookSyncContext> = Symbol('book-sync');

export function provideBookSync(
  target: Readonly<Ref<BookSyncTarget | null>>,
  options: BookSyncOptions = {},
): BookSyncContext {
  const ctx = createBookSyncContext(target, options);
  provide(BOOK_SYNC_KEY, ctx);
  return ctx;
}

export function injectBookSync(): BookSyncContext {
  const ctx = inject(BOOK_SYNC_KEY);
  if (!ctx) throw new Error('injectBookSync() 必须在 BookSyncWorkspace dispatcher 内使用');
  return ctx;
}

function errorCode(error: unknown): string {
  if (error instanceof BookSyncError) return error.code;
  return /^([A-Z_]+):/.exec(getErrorMessage(error))?.[1] ?? '';
}

/** BookSyncError 的 message 带 `CODE: ` 前缀，界面只显示说明部分 */
function errorText(error: unknown): string {
  return getErrorMessage(error).replace(/^[A-Z_]+:\s*/, '');
}

const SITE_LABELS: Record<string, string> = {
  'syosetu-org': 'ハーメルン',
  kakuyomu: 'カクヨム',
  ncode: '小説家になろう',
  novel18: 'ノクターン',
};

function createBookSyncContext(
  target: Readonly<Ref<BookSyncTarget | null>>,
  options: BookSyncOptions,
): BookSyncContext {
  const router = useRouter();
  const booksStore = useBooksStore();
  const toast = useToastWithHistory();

  const phase = ref<BookSyncPhase>('idle');
  const message = ref('');
  const changeset = ref<BookSyncChangeset | null>(null);
  const selected = ref(new Set<string>());
  const volumeOverrides = ref(new Map<string, SyncVolumeTarget>());
  const deep = ref({ running: false, completed: 0, total: 0 });
  const confirm = ref<BookSyncConfirm>({ stage: 'closed' });
  const busy = ref(false);
  const canUndo = ref(false);
  const session = shallowRef<Session | null>(null);
  let seenNew = new Set<string>();
  let controller: AbortController | undefined;
  let deepController: AbortController | undefined;
  let generation = 0;

  const book = computed(() => {
    const value = target.value;
    return value && 'bookId' in value ? booksStore.getBookById(value.bookId) : undefined;
  });

  const recipe = computed<BookSyncRecipeView | null>(() => {
    const value = target.value;
    if (!value) return null;
    try {
      // store 中的书是响应式代理，resolveRecipe 内部的 structuredClone 不能克隆代理
      const resolved = resolveRecipe(
        'bookId' in value ? toRaw(book.value ?? {}) : { webUrl: [value.newFrom] },
      );
      const engine = resolved.recipe.engine;
      return {
        engine: engine.kind,
        ...(engine.kind === 'builtin' ? { site: SITE_LABELS[engine.site] ?? engine.site } : {}),
        catalogUrl: resolved.recipe.catalogUrls[0] ?? '',
        cleanupCount: resolved.recipe.cleanup?.length ?? 0,
        virtual: resolved.virtual,
      };
    } catch {
      return null;
    }
  });

  const volumes = computed(() => book.value?.volumes ?? []);
  const drift = computed(() => (changeset.value ? driftWarning(changeset.value) : false));
  const summary = computed(() =>
    buildConfirmSummary(changeset.value ?? emptyChangeset(), selected.value, volumeOverrides.value),
  );
  const working = computed(() => busy.value || deep.value.running || phase.value === 'checking');

  function setChangeset(next: BookSyncChangeset, keep: string[] = []): void {
    changeset.value = next;
    const reconciled = reconcileSelection(next, new Set([...selected.value, ...keep]), seenNew);
    selected.value = reconciled.selected;
    seenNew = reconciled.seenNew;
    if (next.status === 'invalid') {
      phase.value = 'invalid';
      message.value = next.failed[0]?.message ?? '配方回放失败';
    } else {
      phase.value = 'ready';
      message.value = '';
    }
  }

  function reset(): void {
    changeset.value = null;
    selected.value = new Set();
    volumeOverrides.value = new Map();
    seenNew = new Set();
    confirm.value = { stage: 'closed' };
    canUndo.value = false;
    message.value = '';
    deep.value = { running: false, completed: 0, total: 0 };
  }

  function fail(error: unknown): void {
    phase.value = errorCode(error) === 'RECIPE_MISSING' ? 'missing' : 'error';
    message.value = errorText(error);
  }

  async function open(value: BookSyncTarget | null): Promise<void> {
    controller?.abort();
    deepController?.abort();
    const token = ++generation;
    session.value = null;
    reset();
    if (!value) {
      phase.value = 'idle';
      return;
    }
    phase.value = 'checking';
    const current = new AbortController();
    controller = current;
    try {
      const opened = await BookSyncService.openSession({ target: value });
      if (token !== generation) return;
      session.value = opened;
      const result = await opened.quickCheck(current.signal);
      if (token !== generation) return;
      setChangeset(result);
    } catch (error) {
      if (token !== generation || current.signal.aborted) return;
      fail(error);
    }
  }

  async function recheck(): Promise<void> {
    await open(target.value);
  }

  watch(
    () => (target.value ? JSON.stringify(target.value) : ''),
    () => void open(target.value),
    { immediate: true },
  );

  onBeforeUnmount(() => {
    generation++;
    controller?.abort();
    deepController?.abort();
  });

  async function startDeepCheck(): Promise<void> {
    const current = session.value;
    if (!current || working.value) return;
    deepController = new AbortController();
    deep.value = { running: true, completed: 0, total: 0 };
    try {
      const result = await current.deepCheck({
        signal: deepController.signal,
        onProgress: (completed, total) => {
          deep.value = { running: true, completed, total };
        },
      });
      if (session.value === current) setChangeset(result);
    } catch (error) {
      if (session.value === current) notifyError('深度检查失败', error);
    } finally {
      deep.value = { ...deep.value, running: false };
    }
  }

  function cancelDeepCheck(): void {
    deepController?.abort();
  }

  function toggle(url: string, on?: boolean): void {
    const next = new Set(selected.value);
    const enable = on ?? !next.has(url);
    if (enable) next.add(url);
    else next.delete(url);
    selected.value = next;
  }

  function setUpdatedSelected(on: boolean): void {
    const next = new Set(selected.value);
    for (const chapter of changeset.value?.updated ?? []) {
      if (on) next.add(chapter.url);
      else next.delete(chapter.url);
    }
    selected.value = next;
  }

  function setGroupTarget(groupKey: string, value: SyncVolumeTarget | null): void {
    const next = new Map(volumeOverrides.value);
    if (value) next.set(groupKey, value);
    else next.delete(groupKey);
    volumeOverrides.value = next;
  }

  async function setSkipped(
    entries: Pick<CatalogEntry, 'url' | 'title'>[],
    skipped: boolean,
  ): Promise<void> {
    const current = session.value;
    if (!current || working.value) return;
    busy.value = true;
    try {
      const result = await current.setSkipped(entries, skipped);
      // 取消跳过表示用户要导入这些章节，直接勾选
      setChangeset(result, skipped ? [] : entries.map((entry) => entry.url));
    } catch (error) {
      notifyError(skipped ? '跳过失败' : '取消跳过失败', error);
    } finally {
      busy.value = false;
    }
  }

  function preview(url: string): Promise<string[]> {
    if (!session.value) return Promise.reject(new Error('同步会话尚未就绪'));
    return session.value.preview(url);
  }

  function requestApply(): void {
    if (!changeset.value || phase.value !== 'ready' || selected.value.size === 0) return;
    confirm.value = { stage: 'confirming', summary: summary.value, reconfirm: false };
  }

  function cancelConfirm(): void {
    if (confirm.value.stage === 'confirming') confirm.value = { stage: 'closed' };
  }

  async function runApply(urls: string[]): Promise<void> {
    const current = session.value;
    if (!current) return;
    busy.value = true;
    try {
      // 会话会 structuredClone 选择：传原始 Map（reactive Map 取出的值是代理，无法克隆）
      const result = await current.apply({
        urls,
        volumeOverrides: new Map(toRaw(volumeOverrides.value)),
      });
      confirm.value = { stage: 'closed' };
      setChangeset(current.changeset);
      canUndo.value = result.status !== 'failed';
      // 新卷已随本次应用创建；会话已按最新书籍重新推断目标，保留覆盖会让下一次应用再建同名卷
      if (result.status !== 'failed') volumeOverrides.value = new Map();
      notifyApplied(current, result);
      if (result.status !== 'failed') await options.onApplied?.(result);
    } catch (error) {
      const code = errorCode(error);
      if (code === 'BOOK_CHANGED') {
        // 会话已按最新书籍重算，展示新的摘要并要求再次确认
        setChangeset(current.changeset);
        confirm.value = { stage: 'confirming', summary: summary.value, reconfirm: true };
        return;
      }
      confirm.value = { stage: 'closed' };
      if (code === 'TARGET_BUSY') {
        toast.add({
          severity: 'warn',
          summary: '书籍正在被占用',
          detail: `请等待以下任务结束后再应用：${errorText(error)}`,
          life: 6000,
        });
      } else notifyError('应用失败', error);
    } finally {
      busy.value = false;
    }
  }

  async function confirmApply(): Promise<void> {
    if (confirm.value.stage !== 'confirming') return;
    confirm.value = { ...confirm.value, stage: 'applying' };
    await runApply([...selected.value]);
  }

  async function retry(url: string): Promise<void> {
    if (working.value) return;
    await runApply([url]);
  }

  async function undoWith(current: Session): Promise<void> {
    try {
      await current.undo();
      if (session.value === current) {
        setChangeset(current.changeset);
        canUndo.value = false;
      }
      toast.add({ severity: 'info', summary: '已撤销同步', life: 3000 });
    } catch (error) {
      toast.add({
        severity: 'error',
        summary: '无法撤销',
        detail:
          errorCode(error) === 'BOOK_CHANGED'
            ? '书籍已有后续修改，无法撤销本次同步'
            : errorText(error),
        life: 6000,
      });
    }
  }

  async function undo(): Promise<void> {
    const current = session.value;
    if (current) await undoWith(current);
  }

  function notifyApplied(current: Session, result: BookSyncApplyResult): void {
    const count = result.appliedUrls.length;
    if (result.status === 'failed') {
      toast.add({
        severity: 'error',
        summary: '同步失败',
        detail: `${result.failed.length} 个章节获取失败，可在失败列表中重试`,
        life: 6000,
      });
      return;
    }
    toast.add({
      severity: result.status === 'partial' ? 'warn' : 'success',
      summary: result.status === 'partial' ? '部分章节已同步' : '同步完成',
      detail:
        result.status === 'partial'
          ? `已写入 ${count} 章，${result.failed.length} 章失败，可在失败列表中重试`
          : `已写入 ${count} 章`,
      life: 5000,
      // 闭包持有会话：离开页面（例如新建后跳转到新书）后仍可从通知撤销
      onRevert: () => undoWith(current),
    });
  }

  function notifyError(summaryText: string, error: unknown): void {
    toast.add({ severity: 'error', summary: summaryText, detail: errorText(error), life: 6000 });
  }

  async function handoff(): Promise<void> {
    const value = target.value;
    if (!value || !FEATURES.importWorkspace) return;
    try {
      if ('newFrom' in value) await handoffToImporter(value.newFrom, router);
      else if (book.value)
        await repairWithImporter(
          toRaw(book.value),
          phase.value === 'invalid' ? message.value : '这本书还没有更新配方',
          router,
        );
    } catch (error) {
      notifyError('无法交给 AI 导入器', error);
    }
  }

  return {
    target,
    phase,
    message,
    changeset,
    recipe,
    volumes,
    selected,
    volumeOverrides,
    drift,
    summary,
    deep,
    confirm,
    working,
    canUndo,
    canHandoff: FEATURES.importWorkspace,
    recheck,
    startDeepCheck,
    cancelDeepCheck,
    toggle,
    setUpdatedSelected,
    setGroupTarget,
    setSkipped,
    preview,
    requestApply,
    confirmApply,
    cancelConfirm,
    retry,
    undo,
    handoff,
  };
}

function emptyChangeset(): BookSyncChangeset {
  return {
    baseRevision: null,
    new: [],
    updated: [],
    skipped: [],
    failed: [],
    unchecked: [],
    checked: [],
    dateUnchanged: [],
    status: 'unchecked',
  };
}
