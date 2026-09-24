import { getDB } from 'src/utils/indexed-db';
import { desktopRestartGuard } from './desktop-restart-guard';

export interface BookExecutionOwner {
  label: string;
  chapterId?: string;
}

const PREFIX = 'tsukuyomi:book-execution:';
const OWNER_PREFIX = 'tsukuyomi:book-execution-owner:';

function manager(): LockManager | undefined {
  return typeof navigator === 'undefined' ? undefined : navigator.locks;
}

/** 与同源页面共同持锁；无锁环境仍允许原有翻译，但禁止新增导入提交。 */
export class BookExecutionGuard {
  static async occupants(bookId: string): Promise<BookExecutionOwner[]> {
    const locks = manager();
    if (!locks?.query) return [];
    const prefix = `${OWNER_PREFIX}${encodeURIComponent(bookId)}:`;
    const { held } = await locks.query();
    return (held ?? []).flatMap((entry) => {
      if (!entry.name?.startsWith(prefix)) return [];
      try {
        const value: unknown = JSON.parse(decodeURIComponent(entry.name.slice(prefix.length)));
        if (
          !value ||
          typeof value !== 'object' ||
          !('label' in value) ||
          typeof value.label !== 'string'
        )
          return [];
        return [
          {
            label: value.label,
            ...('chapterId' in value && typeof value.chapterId === 'string'
              ? { chapterId: value.chapterId }
              : {}),
          },
        ];
      } catch {
        return [];
      }
    });
  }

  static async write<T>(
    bookId: string,
    owner: BookExecutionOwner,
    work: () => Promise<T>,
    prepare?: () => Promise<void>,
  ): Promise<T> {
    return desktopRestartGuard.track(() => {
      const locks = manager();
      if (!locks) return work();
      return this.withLock(bookId, 'shared', async () => {
        const name = `${OWNER_PREFIX}${encodeURIComponent(bookId)}:${encodeURIComponent(JSON.stringify({ ...owner, id: crypto.randomUUID() }))}`;
        return locks.request(name, { ifAvailable: true }, async () => {
          await prepare?.();
          return work();
        });
      });
    });
  }

  static commit<T>(bookId: string, work: () => Promise<T>): Promise<T> {
    return desktopRestartGuard.track(() => this.withLock(bookId, 'exclusive', work));
  }

  private static async withLock<T>(
    bookId: string,
    mode: LockMode,
    work: () => Promise<T>,
  ): Promise<T> {
    if (!bookId) throw new Error('INVALID_BOOK: 缺少目标小说');
    const locks = manager();
    if (!locks)
      throw new Error('LOCK_UNAVAILABLE: 当前环境无法协调导入提交，请使用支持 Web Locks 的环境');
    return locks.request(`${PREFIX}${bookId}`, { mode, ifAvailable: true }, async (lock) => {
      if (!lock) {
        const owners = await this.occupants(bookId);
        throw new Error(
          `TARGET_BUSY: ${owners.map((owner) => owner.label).join('、') || '目标小说正在提交变更'}，请等待执行和保存结束`,
        );
      }
      // Electron 多进程的 Web Locks 不共享；先验证当前进程可访问实际书库。
      // 同一存储目录的 IndexedDB 所有权由现有 Chromium 存储进程协调，失败不得继续。
      try {
        await (await getDB()).count('book-revisions');
      } catch (error) {
        throw new Error('STORAGE_UNAVAILABLE: 无法访问当前书库，执行未开始', { cause: error });
      }
      return work();
    });
  }
}
