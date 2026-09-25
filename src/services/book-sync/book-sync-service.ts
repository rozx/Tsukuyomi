import type { Novel, Paragraph } from 'src/models/novel';
import type {
  BookSyncChangeset,
  BookSyncSelection,
  BookSyncApplyResult,
  BookUpdateRecipe,
  CatalogEntry,
  SyncCatalog,
  SyncFailure,
} from 'src/models/book-sync';
import { ImportLibraryReader } from 'src/services/import/import-library-reader';
import { ChapterService } from 'src/services/chapter-service';
import { resolveRecipe } from './recipe';
import { BookSyncReplay, FIRECRAWL_QUOTA_CODE } from './replay';
import { getCachedRemoteChapter, setCachedRemoteChapter } from './remote-chapter-cache';
import { BookSyncError } from './errors';
import { compareChapter, inferNewChapters, linkManualChapters } from './changes';
import { BookExecutionGuard } from 'src/services/book-execution-guard';
import { UniqueIdGenerator } from 'src/utils/id-generator';
import {
  commitSyncChanges,
  notifySyncCommit,
  undoSyncChanges,
  writeChapterUrls,
  writeConfirmedDates,
  writeSkipped,
} from './persistence';
import type { SyncBefore, SyncWrite } from './persistence';

type Snapshot = Extract<
  Awaited<ReturnType<typeof ImportLibraryReader.readBook>>,
  { kind: 'loaded' }
>;
type Target = { bookId: string } | { newFrom: string };
function emptyChanges(revision: number | null): BookSyncChangeset {
  return {
    baseRevision: revision,
    new: [],
    updated: [],
    skipped: [],
    failed: [],
    unchecked: [],
    checked: [],
    dateUnchanged: [],
    dateNewer: [],
    status: 'unchecked',
  };
}
async function readBook(id: string): Promise<Snapshot> {
  const value = await ImportLibraryReader.readBook(id);
  if (value.kind !== 'loaded')
    throw new BookSyncError(
      'BOOK_READ_FAILED',
      value.kind === 'failed' ? value.message : '书籍不存在',
    );
  return value;
}
const invalidRecipeCodes = new Set([
  'CONTENT_EMPTY',
  'VERIFICATION_REQUIRED',
  'CLEANUP_INVALID',
  'CLEANUP_TIMEOUT',
]);

async function assertAvailable(bookId: string): Promise<void> {
  const occupants = await BookExecutionGuard.occupants(bookId);
  if (occupants.length)
    throw new BookSyncError('TARGET_BUSY', occupants.map((o) => o.label).join('、'));
}

/** 仅持有本次页面会话的数据；对外返回副本，避免预览组件改变提交内容。 */
class BookSyncSession {
  private state: BookSyncChangeset;
  private catalog: SyncCatalog | undefined;
  private replay: BookSyncReplay;
  private before: SyncBefore | undefined;
  private newBookId = crypto.randomUUID();
  private readonly cache = new Map<string, string[]>();
  private readonly pending = new Map<string, Promise<string[]>>();
  /** 新建书籍尚未落库，跳过只记在会话内，应用时随配方写入 */
  private readonly localSkipped = new Set<string>();
  private busy = false;

  constructor(
    private target: Target,
    private recipe: BookUpdateRecipe,
    private snapshot?: Snapshot,
  ) {
    this.replay = new BookSyncReplay(recipe);
    this.state = emptyChanges(snapshot?.revision ?? null);
  }

  get changeset(): BookSyncChangeset {
    return structuredClone(this.state);
  }

  private async exclusive<T>(work: () => Promise<T>): Promise<T> {
    if (this.busy) throw new BookSyncError('SESSION_BUSY', '检查或应用仍在执行');
    this.busy = true;
    try {
      return await work();
    } finally {
      this.busy = false;
    }
  }

  private chapters() {
    return (this.snapshot?.book.volumes ?? []).flatMap((v) => v.chapters ?? []);
  }

  private classify(): void {
    const entries = this.catalog!.entries;
    const skipped = this.snapshot
      ? (this.recipe.skippedUrls?.map((e) => e.url) ?? [])
      : [...this.localSkipped];
    const known = new Set(this.chapters().map((c) => c.webUrl));
    this.state = emptyChanges(this.snapshot?.revision ?? null);
    this.state.new = inferNewChapters(this.snapshot?.book, entries, skipped);
    this.state.skipped = entries.filter((e) => skipped.includes(e.url) && !known.has(e.url));
    this.state.unchecked = entries
      .filter(
        (e) =>
          known.has(e.url) && !skipped.includes(e.url) && !this.recipe.pinnedUrls?.includes(e.url),
      )
      .map((e) => e.url);
    this.state.dateUnchanged = entries
      .filter((e) => e.lastUpdated && this.state.unchecked.includes(e.url) && !this.datedNewer(e))
      .map((e) => e.url);
    this.state.dateNewer = entries
      .filter((e) => this.state.unchecked.includes(e.url) && this.datedNewer(e))
      .map((e) => e.url);
    this.state.status = 'ready';
  }

  /** 内置站点目录的更新日期比本地新；站点没有日期或通用网页配方时为 false。 */
  private datedNewer(entry: CatalogEntry): boolean {
    if (this.recipe.engine.kind !== 'builtin' || !entry.lastUpdated) return false;
    const chapter = this.chapters().find((c) => c.webUrl === entry.url);
    return (
      !!chapter &&
      ChapterService.shouldUpdateChapter(this.snapshot?.book, {
        ...chapter,
        lastUpdated: entry.lastUpdated,
      })
    );
  }

  private invalidate(code: string, message: string, url = ''): void {
    this.state = {
      ...emptyChanges(this.snapshot?.revision ?? null),
      status: 'invalid',
      failed: [{ code, message, url }],
    };
  }

  private async prepare(signal?: AbortSignal): Promise<boolean> {
    if (!(await this.refreshBook())) return false;
    this.state = emptyChanges(this.snapshot?.revision ?? null);
    const result = await this.replay.fetchCatalog(
      this.chapters().flatMap((c) => (c.webUrl ? [c.webUrl] : [])),
      signal,
    );
    if (!result.ok) {
      // 额度耗尽不代表配方失效：报检查失败（可稍后重试 / 补充额度），不引导重建配方
      if (result.code === FIRECRAWL_QUOTA_CODE) throw new BookSyncError(result.code, result.message);
      this.invalidate(result.code, result.message);
      return false;
    }
    this.catalog = result.catalog;
    await this.linkManualChapters();
    this.classify();
    return true;
  }

  /**
   * 手动添加的章节没有网址时按标题 / 位置推断对应的目录条目：先在本次会话内关联，
   * 书籍未被占用时再写回网址（失败不影响检查）。
   */
  private async linkManualChapters(): Promise<void> {
    if (!this.snapshot || !this.catalog) return;
    const links = linkManualChapters(this.chapters(), this.catalog.entries);
    if (!links.length) return;
    const urls = new Map(links.map((l) => [l.chapterId, l.url]));
    for (const chapter of this.chapters()) {
      const url = urls.get(chapter.id);
      if (url) chapter.webUrl = url;
    }
    if (!('bookId' in this.target)) return;
    const bookId = this.target.bookId;
    if ((await BookExecutionGuard.occupants(bookId)).length) return;
    try {
      const result = await BookExecutionGuard.commit(bookId, () => writeChapterUrls(bookId, links));
      await notifySyncCommit(result);
      await this.refreshBook();
    } catch (error) {
      console.warn('[BookSync] 写回手动章节网址失败', error);
    }
  }

  private entry(value: CatalogEntry | string): CatalogEntry {
    const url = typeof value === 'string' ? value : value.url;
    const entry = this.catalog?.entries.find((e) => e.url === url);
    if (!entry) throw new BookSyncError('ENTRY_MISSING', '章节不属于本次目录');
    return entry;
  }

  /**
   * 跨会话缓存键：抽取规则（引擎 / 清理 / 去标题）+ 网址 + 目录给出的更新时间。
   * 配方变化或目录日期变新（远端有新版本）后不复用旧正文，避免把新修订误判为未变。
   */
  private remoteCacheKey(entry: CatalogEntry): string {
    const r = this.recipe;
    const version = entry.lastUpdated ? new Date(entry.lastUpdated).getTime() : '';
    return `${JSON.stringify([r.engine, r.cleanup, r.stripHeading])}|${entry.url}|${version}`;
  }

  private async content(entry: CatalogEntry, signal?: AbortSignal): Promise<string[]> {
    signal?.throwIfAborted();
    const cached = this.cache.get(entry.url) ?? getCachedRemoteChapter(this.remoteCacheKey(entry));
    if (cached) {
      this.cache.set(entry.url, cached);
      return cached;
    }
    let pending = this.pending.get(entry.url);
    if (!pending) {
      pending = (async () => {
        const result = await this.replay.fetchChapter(
          entry,
          this.chapters().some((c) => c.webUrl === entry.url),
          signal,
        );
        if (!result.ok) {
          const imported = this.chapters().some((c) => c.webUrl === entry.url);
          if (invalidRecipeCodes.has(result.code) && (imported || result.code !== 'CONTENT_EMPTY'))
            this.invalidate(result.code, result.message, entry.url);
          throw new BookSyncError(result.code, result.message);
        }
        this.cache.set(entry.url, result.paragraphs);
        setCachedRemoteChapter(this.remoteCacheKey(entry), result.paragraphs);
        return result.paragraphs;
      })();
      this.pending.set(entry.url, pending);
      void pending.finally(() => this.pending.delete(entry.url)).catch(() => undefined);
    }
    return pending;
  }

  async preview(entry: CatalogEntry | string, signal?: AbortSignal): Promise<string[]> {
    return [...(await this.content(this.entry(entry), signal))];
  }

  private localContent(chapterId: string): Paragraph[] {
    const loaded = this.snapshot?.chapters[chapterId];
    if (loaded?.kind === 'failed') throw new BookSyncError('BOOK_READ_FAILED', loaded.message);
    return loaded?.kind === 'loaded' ? loaded.content : [];
  }

  private async compare(entry: CatalogEntry, signal?: AbortSignal): Promise<void> {
    const chapter = this.chapters().find((c) => c.webUrl === entry.url)!;
    const remote = await this.content(entry, signal);
    signal?.throwIfAborted();
    const update = await compareChapter(chapter, this.localContent(chapter.id), remote, entry);
    signal?.throwIfAborted();
    if (this.state.status === 'invalid') return;
    this.state.updated = this.state.updated.filter((e) => e.url !== entry.url);
    if (update) this.state.updated.push(update);
    this.state.unchecked = this.state.unchecked.filter((url) => url !== entry.url);
    this.state.dateUnchanged = this.state.dateUnchanged.filter((url) => url !== entry.url);
    this.state.dateNewer = this.state.dateNewer.filter((url) => url !== entry.url);
    if (!this.state.checked.includes(entry.url)) this.state.checked.push(entry.url);
    this.state.failed = this.state.failed.filter((e) => e.url !== entry.url);
  }

  private async checkEntries(
    entries: CatalogEntry[],
    signal?: AbortSignal,
    onProgress?: (completed: number, total: number) => void,
  ): Promise<void> {
    let cursor = 0;
    let completed = 0;
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    try {
      await Promise.all(
        Array.from({ length: Math.min(3, entries.length) }, async () => {
          while (!controller.signal.aborted && cursor < entries.length) {
            const entry = entries[cursor++]!;
            try {
              await this.compare(entry, controller.signal);
              onProgress?.(++completed, entries.length);
            } catch (error) {
              if (controller.signal.aborted) break;
              const code = error instanceof BookSyncError ? error.code : 'CONTENT_FETCH_FAILED';
              const message = error instanceof Error ? error.message : String(error);
              if (invalidRecipeCodes.has(code)) {
                this.invalidate(code, message, entry.url);
                controller.abort();
                break;
              }
              this.state.failed = [
                ...this.state.failed.filter((e) => e.url !== entry.url),
                { url: entry.url, code, message },
              ];
              // Firecrawl 额度耗尽：停止剩余章节（保持未检查），不作废配方
              if (code === FIRECRAWL_QUOTA_CODE) {
                controller.abort();
                break;
              }
            }
          }
        }),
      );
      if (signal?.aborted && this.state.status !== 'invalid') this.state.status = 'cancelled';
      const order = new Map(this.catalog!.entries.map((e, i) => [e.url, i]));
      this.state.updated.sort((a, b) => order.get(a.url)! - order.get(b.url)!);
    } finally {
      signal?.removeEventListener('abort', abort);
    }
  }

  private async refreshBook(): Promise<boolean> {
    if ('bookId' in this.target) this.snapshot = await readBook(this.target.bookId);
    const currentRecipe = this.snapshot ? resolveRecipe(this.snapshot.book).recipe : this.recipe;
    const extraction = (r: BookUpdateRecipe) =>
      JSON.stringify([r.engine, r.catalogUrls, r.cleanup, r.stripHeading]);
    if (extraction(currentRecipe) !== extraction(this.recipe)) {
      this.invalidate('RECIPE_CHANGED', '更新配方已修改，请重新打开检查会话');
      return false;
    }
    this.recipe = currentRecipe;
    this.replay = new BookSyncReplay(this.recipe);
    return true;
  }

  private async recompute(): Promise<void> {
    if (!(await this.refreshBook())) return;
    this.classify();
    for (const entry of this.catalog!.entries) {
      if (!this.state.unchecked.includes(entry.url) || !this.cache.has(entry.url)) continue;
      await this.compare(entry);
    }
  }

  private async collectWrites(
    selection: BookSyncSelection,
  ): Promise<{ writes: SyncWrite[]; failed: SyncFailure[] }> {
    const inferred = inferNewChapters(this.snapshot?.book, this.catalog!.entries, []);
    const selected = new Set(selection.urls);
    const entries = this.catalog!.entries.filter((e) => selected.has(e.url));
    if (entries.length !== selected.size)
      throw new BookSyncError('ENTRY_MISSING', '所选章节不属于本次目录');
    const ids = new UniqueIdGenerator();
    const writes = new Map<string, SyncWrite>();
    const failed: SyncFailure[] = [];
    let cursor = 0;
    let fatal: BookSyncError | undefined;
    let quotaFailure: SyncFailure | undefined;
    await Promise.all(
      Array.from({ length: Math.min(3, entries.length) }, async () => {
        while (cursor < entries.length && !fatal && !quotaFailure) {
          const entry = entries[cursor++]!;
          const update = this.state.updated.find((e) => e.url === entry.url);
          const added = inferred.find((e) => e.url === entry.url);
          if (!update && !added) {
            fatal = new BookSyncError('ENTRY_UNCHECKED', '所选既有章节没有已确认的更新');
            break;
          }
          try {
            const remote = await this.content(entry);
            // 对 skipped 条目使用全目录推断；普通新条目保持界面拿到的 groupKey。
            const proposed = this.state.new.find((e) => e.url === entry.url) ?? added;
            writes.set(entry.url, {
              entry,
              originalContent: remote.join('\n'),
              paragraphs:
                update?.paragraphs ??
                remote.map((text) => ({
                  id: ids.generate(),
                  text,
                  translations: [],
                  selectedTranslationId: '',
                })),
              ...(update ? { chapterId: update.chapterId } : {}),
              ...(proposed
                ? { target: selection.volumeOverrides?.get(proposed.groupKey) ?? proposed.target }
                : {}),
            });
          } catch (error) {
            const code = error instanceof BookSyncError ? error.code : 'CONTENT_FETCH_FAILED';
            const message = error instanceof Error ? error.message : String(error);
            if (invalidRecipeCodes.has(code) && code !== 'CONTENT_EMPTY') {
              fatal = new BookSyncError(code, message);
              this.invalidate(code, message, entry.url);
            } else failed.push({ url: entry.url, code, message });
            if (code === FIRECRAWL_QUOTA_CODE) quotaFailure ??= { url: entry.url, code, message };
          }
        }
      }),
    );
    if (fatal) throw fatal;
    // Firecrawl 额度耗尽：未抓取的所选章节同样记为额度失败，已抓取的照常写入
    if (quotaFailure) {
      const { code, message } = quotaFailure;
      for (const entry of entries.slice(cursor))
        failed.push({ url: entry.url, code, message });
    }
    return {
      writes: entries.flatMap((e) => (writes.has(e.url) ? [writes.get(e.url)!] : [])),
      failed,
    };
  }

  private recordFailures(failed: SyncFailure[]): void {
    this.state.failed = failed;
    this.state.new = this.state.new.filter((e) => !failed.some((f) => f.url === e.url));
  }

  /**
   * 比对确认正文未变、且目录日期比本地新的已导入章节：把远端日期写回章节，
   * 下次快速检查按日期判断为无变化。书籍被占用或写入失败时跳过（不影响检查结果）。
   */
  private async recordConfirmedDates(): Promise<void> {
    if (!('bookId' in this.target) || !this.catalog || this.state.status === 'invalid') return;
    const updated = new Set(this.state.updated.map((e) => e.url));
    const confirmed = this.catalog.entries.filter(
      (e) => this.state.checked.includes(e.url) && !updated.has(e.url) && this.datedNewer(e),
    );
    if (!confirmed.length) return;
    const bookId = this.target.bookId;
    if ((await BookExecutionGuard.occupants(bookId)).length) return;
    const failed = this.state.failed;
    try {
      const result = await BookExecutionGuard.commit(bookId, () =>
        writeConfirmedDates(bookId, confirmed),
      );
      await notifySyncCommit(result);
      if (await this.refreshAfterCommit()) this.state.failed = failed;
    } catch (error) {
      console.warn('[BookSync] 记录已确认的更新日期失败', error);
    }
  }

  private async refreshAfterCommit(): Promise<boolean> {
    try {
      await this.recompute();
      return this.state.status !== 'invalid';
    } catch (error) {
      this.invalidate('BOOK_READ_FAILED', error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  async apply(selection: BookSyncSelection): Promise<BookSyncApplyResult> {
    const selected = structuredClone(selection);
    return this.exclusive(async () => {
      if (!this.catalog || this.state.status === 'invalid' || this.state.status === 'unchecked')
        throw new BookSyncError('CHECK_REQUIRED', '请先完成目录检查');
      if (!selected.urls.length) throw new BookSyncError('SELECTION_EMPTY', '请选择章节');
      const bookId = 'bookId' in this.target ? this.target.bookId : this.newBookId;
      await assertAvailable(bookId);
      const { writes, failed } = await this.collectWrites(selected);
      if (!writes.length) {
        this.recordFailures(failed);
        return {
          bookId,
          revision: this.state.baseRevision ?? 0,
          status: 'failed',
          appliedUrls: [],
          failed,
        };
      }
      const creating = !('bookId' in this.target);
      const now = new Date();
      const recipe: BookUpdateRecipe = {
        ...this.recipe,
        recordedAt: this.recipe.recordedAt || now.getTime(),
        skippedUrls: this.catalog.entries
          .filter((e) => !selected.urls.includes(e.url))
          .map((e) => ({ url: e.url, title: e.title })),
      };
      const newBook: Novel = {
        id: bookId,
        ...this.catalog.meta,
        createdAt: now,
        lastEdited: now,
        webUrl: [...this.recipe.catalogUrls],
        volumes: [],
        updateRecipe: recipe,
      };
      let before: SyncBefore;
      try {
        before = await BookExecutionGuard.commit(bookId, () =>
          commitSyncChanges({
            bookId,
            baseRevision: this.state.baseRevision,
            writes,
            ...(creating ? { newBook, recipe } : {}),
          }),
        );
      } catch (error) {
        if (error instanceof BookSyncError && error.code === 'BOOK_CHANGED') await this.recompute();
        throw error;
      }
      this.before = before;
      this.target = { bookId };
      await notifySyncCommit(before);
      if (await this.refreshAfterCommit()) this.recordFailures(failed);
      return {
        bookId,
        revision: before.postRevision,
        status: failed.length ? 'partial' : 'success',
        appliedUrls: writes.map((w) => w.entry.url),
        failed,
        ...(creating && newBook.cover ? { cover: newBook.cover } : {}),
      };
    });
  }

  /**
   * 跳过或取消跳过未导入章节。已有书籍写入配方后重新分类，已比对章节从缓存重算，
   * 不丢失深度检查结果；新建书籍只改会话内状态。
   */
  async setSkipped(
    entries: Pick<CatalogEntry, 'url' | 'title'>[],
    skipped: boolean,
  ): Promise<BookSyncChangeset> {
    return this.exclusive(async () => {
      if (!this.catalog || this.state.status === 'invalid')
        throw new BookSyncError('CHECK_REQUIRED', '请先完成目录检查');
      if ('bookId' in this.target) {
        await BookSyncService.setSkipped(this.target.bookId, entries, skipped);
        await this.recompute();
      } else {
        for (const entry of entries) {
          if (skipped) this.localSkipped.add(entry.url);
          else this.localSkipped.delete(entry.url);
        }
        this.classify();
      }
      return this.changeset;
    });
  }

  async undo(): Promise<void> {
    return this.exclusive(async () => {
      const before = this.before;
      if (!before) throw new BookSyncError('UNDO_UNAVAILABLE', '本次会话没有可撤销的应用');
      await assertAvailable(before.bookId);
      const restored = await BookExecutionGuard.commit(before.bookId, () =>
        undoSyncChanges(before),
      );
      this.before = undefined;
      await notifySyncCommit(restored);
      if (before.book) await this.refreshAfterCommit();
      else {
        this.target = { newFrom: this.recipe.catalogUrls[0]! };
        this.newBookId = crypto.randomUUID();
        this.snapshot = undefined;
        this.classify();
      }
    });
  }

  /**
   * 快速检查：只回放目录，得出新章节 / 已跳过，并按站点更新日期把已导入章节分为
   * 「按日期无变化」与「日期较新、待比对」。不抓取任何已导入章节的正文，正文比对由深度检查按需进行。
   */
  async quickCheck(signal?: AbortSignal): Promise<BookSyncChangeset> {
    return this.exclusive(async () => {
      try {
        await this.prepare(signal);
      } catch (error) {
        if (!signal?.aborted) throw error;
        this.state.status = 'cancelled';
      }
      return this.changeset;
    });
  }

  async deepCheck(
    options: { signal?: AbortSignal; onProgress?: (completed: number, total: number) => void } = {},
  ): Promise<BookSyncChangeset> {
    return this.exclusive(async () => {
      try {
        if (!this.catalog && !(await this.prepare(options.signal))) return this.changeset;
        if (this.state.status === 'invalid') return this.changeset;
        this.state.status = 'ready';
        const known = new Set(this.chapters().map((c) => c.webUrl));
        const entries = this.catalog!.entries.filter(
          (e) =>
            known.has(e.url) &&
            !this.recipe.pinnedUrls?.includes(e.url) &&
            !this.recipe.skippedUrls?.some((s) => s.url === e.url),
        );
        await this.checkEntries(entries, options.signal, options.onProgress);
        if (!options.signal?.aborted) await this.recordConfirmedDates();
      } catch (error) {
        if (!options.signal?.aborted) throw error;
        this.state.status = 'cancelled';
      }
      return this.changeset;
    });
  }
}

export class BookSyncService {
  static async setSkipped(
    bookId: string,
    entries: Pick<CatalogEntry, 'url' | 'title'>[],
    skipped: boolean,
  ): Promise<number> {
    await assertAvailable(bookId);
    const result = await BookExecutionGuard.commit(bookId, () =>
      writeSkipped(bookId, entries, skipped),
    );
    await notifySyncCommit(result);
    return result.postRevision;
  }

  static async openSession(options: {
    target: Target;
    recipe?: BookUpdateRecipe;
  }): Promise<BookSyncSession> {
    const snapshot = 'bookId' in options.target ? await readBook(options.target.bookId) : undefined;
    const recipe =
      options.recipe ??
      resolveRecipe(
        snapshot?.book ?? { webUrl: ['newFrom' in options.target ? options.target.newFrom : ''] },
      ).recipe;
    return new BookSyncSession(options.target, structuredClone(recipe), snapshot);
  }
}
